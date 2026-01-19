import Fastify, { type FastifyInstance } from "fastify";
import { unlinkSync, existsSync } from "fs";
import {
  evaluate,
  type PolicySet,
  type RequestContext,
  type PdpOptions,
  type Decision,
  MemoryReplayStore,
  createRedisReplayStore,
} from "@cshield/pdp";
import { getHealth, getReadiness, type HealthDependencies } from "./health.js";
import {
  getMetrics,
  recordDecision,
  recordUp,
  recordPolicyRoutes,
  recordError,
} from "./metrics.js";

export interface SidecarConfig {
  /** Server port. Default: 3100 (set to 0 to disable HTTP) */
  port: number;
  /** Server host. Default: 0.0.0.0 */
  host: string;
  /** Unix socket path. If set, listens on Unix socket in addition to HTTP. */
  unixSocket?: string;
  /** Log level. Default: info */
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  /** Redis URL for replay store. If not set, uses memory store. */
  redisUrl?: string;
  /** Service name for logging. */
  serviceName: string;
  /** Version string for health checks. */
  version?: string;
}

export interface EvaluateRequest {
  policy: PolicySet;
  context: RequestContext;
  options?: Partial<PdpOptions>;
}

export interface EvaluateResponse {
  decision: Decision;
  durationMs: number;
}

/**
 * Create and configure the ContractShield sidecar server.
 */
export async function createSidecar(config: SidecarConfig): Promise<FastifyInstance> {
  const version = config.version ?? "1.1.0";
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  // Dependencies for health checks
  const healthDeps: HealthDependencies = {};

  // Setup replay store
  let replayStore = new MemoryReplayStore();

  if (config.redisUrl) {
    try {
      const { createClient } = await import("redis");
      const client = createClient({ url: config.redisUrl });
      await client.connect();
      replayStore = createRedisReplayStore({ client: client as any }) as any;
      healthDeps.redis = { ping: () => client.ping() };
      fastify.log.info("Connected to Redis for replay store");
    } catch (error) {
      fastify.log.warn({ err: error }, "Failed to connect to Redis, using memory store");
    }
  }

  // Mark as up
  recordUp(true);

  /**
   * Health check endpoint (detailed).
   * GET /health
   */
  fastify.get("/health", async () => {
    return getHealth(healthDeps, version);
  });

  /**
   * Liveness probe.
   * GET /live
   */
  fastify.get("/live", async () => {
    return { alive: true };
  });

  /**
   * Readiness probe.
   * GET /ready
   */
  fastify.get("/ready", async () => {
    return getReadiness(healthDeps);
  });

  /**
   * Evaluate policy endpoint.
   * POST /evaluate
   */
  fastify.post<{ Body: EvaluateRequest }>("/evaluate", async (request, reply) => {
    const start = Date.now();
    const { policy, context, options } = request.body;

    if (!policy || !context) {
      reply.status(400);
      recordError("validation");
      return {
        error: "Missing required fields: policy and context",
      };
    }

    try {
      // Track policy routes for metrics
      if (policy.routes) {
        healthDeps.policy = policy;
        recordPolicyRoutes(policy.routes.length);
      }

      const pdpOptions: PdpOptions = {
        replayStore,
        ...options,
      };

      const decision = await evaluate(policy, context, pdpOptions);
      const durationMs = Date.now() - start;

      // Record metrics
      recordDecision(decision.action, durationMs);

      return {
        decision,
        durationMs,
      } satisfies EvaluateResponse;
    } catch (error) {
      fastify.log.error({ err: error }, "Error evaluating policy");
      recordError("evaluation");
      reply.status(500);
      return {
        error: "Internal error during policy evaluation",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  /**
   * Metrics endpoint (Prometheus format).
   * GET /metrics
   */
  fastify.get("/metrics", async (_request, reply) => {
    reply.type("text/plain; version=0.0.4");
    return getMetrics();
  });

  /**
   * List available webhook plugins.
   * GET /webhooks
   */
  fastify.get("/webhooks", async () => {
    const { listWebhookPlugins } = await import("@cshield/pdp");
    return {
      plugins: listWebhookPlugins(),
    };
  });

  // Cleanup on close
  fastify.addHook("onClose", async () => {
    recordUp(false);
  });

  return fastify;
}

/**
 * Start the sidecar server on HTTP and/or Unix socket.
 */
export async function startSidecar(config: SidecarConfig): Promise<{
  server: FastifyInstance;
  close: () => Promise<void>;
}> {
  const server = await createSidecar(config);

  const closers: Array<() => Promise<void>> = [];

  // Start HTTP server if port > 0
  if (config.port > 0) {
    await server.listen({
      port: config.port,
      host: config.host,
    });
    server.log.info(`🛡️  ContractShield HTTP server on http://${config.host}:${config.port}`);
    closers.push(() => server.close());
  }

  // Start Unix socket server if configured
  if (config.unixSocket) {
    // Remove existing socket file
    if (existsSync(config.unixSocket)) {
      try {
        unlinkSync(config.unixSocket);
      } catch {
        // Ignore errors
      }
    }

    // Create a second Fastify instance for Unix socket
    const unixServer = await createSidecar(config);
    await unixServer.listen({ path: config.unixSocket });
    server.log.info(`🛡️  ContractShield Unix socket on ${config.unixSocket}`);
    closers.push(() => unixServer.close());
  }

  return {
    server,
    close: async () => {
      for (const closer of closers) {
        await closer();
      }
    },
  };
}

// Re-export for convenience
export { getHealth, getReadiness } from "./health.js";
export { getMetrics, recordDecision, recordUp, recordPolicyRoutes } from "./metrics.js";
