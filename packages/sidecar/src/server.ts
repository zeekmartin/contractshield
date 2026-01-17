import Fastify, { type FastifyInstance } from "fastify";
import {
  evaluate,
  type PolicySet,
  type RequestContext,
  type PdpOptions,
  type Decision,
  MemoryReplayStore,
  createRedisReplayStore,
} from "@contractshield/pdp";

export interface SidecarConfig {
  /** Server port. Default: 3100 */
  port: number;
  /** Server host. Default: 0.0.0.0 */
  host: string;
  /** Log level. Default: info */
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  /** Redis URL for replay store. If not set, uses memory store. */
  redisUrl?: string;
  /** Service name for logging. */
  serviceName: string;
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
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  // Setup replay store
  let replayStore = new MemoryReplayStore();

  if (config.redisUrl) {
    try {
      // Dynamic import to avoid bundling redis if not used
      const { createClient } = await import("redis");
      const client = createClient({ url: config.redisUrl });
      await client.connect();
      replayStore = createRedisReplayStore({ client }) as any;
      fastify.log.info("Connected to Redis for replay store");
    } catch (error) {
      fastify.log.warn({ err: error }, "Failed to connect to Redis, using memory store");
    }
  }

  /**
   * Health check endpoint.
   * GET /health
   */
  fastify.get("/health", async () => {
    return {
      status: "ok",
      version: "0.3.0",
      service: config.serviceName,
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * Ready check endpoint.
   * GET /ready
   */
  fastify.get("/ready", async () => {
    return {
      ready: true,
    };
  });

  /**
   * Evaluate policy endpoint.
   * POST /evaluate
   * Body: { policy: PolicySet, context: RequestContext, options?: PdpOptions }
   */
  fastify.post<{ Body: EvaluateRequest }>("/evaluate", async (request, reply) => {
    const start = Date.now();
    const { policy, context, options } = request.body;

    if (!policy || !context) {
      reply.status(400);
      return {
        error: "Missing required fields: policy and context",
      };
    }

    try {
      const pdpOptions: PdpOptions = {
        replayStore,
        ...options,
      };

      const decision = await evaluate(policy, context, pdpOptions);
      const durationMs = Date.now() - start;

      return {
        decision,
        durationMs,
      } satisfies EvaluateResponse;
    } catch (error) {
      fastify.log.error({ err: error }, "Error evaluating policy");
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
  fastify.get("/metrics", async (request, reply) => {
    // Basic metrics in Prometheus format
    const metrics = [
      "# HELP contractshield_up Whether the sidecar is up",
      "# TYPE contractshield_up gauge",
      "contractshield_up 1",
      "",
      "# HELP contractshield_info Sidecar information",
      "# TYPE contractshield_info gauge",
      `contractshield_info{version="0.3.0",service="${config.serviceName}"} 1`,
    ].join("\n");

    reply.type("text/plain; version=0.0.4");
    return metrics;
  });

  /**
   * List available webhook plugins.
   * GET /webhooks
   */
  fastify.get("/webhooks", async () => {
    const { listWebhookPlugins } = await import("@contractshield/pdp");
    return {
      plugins: listWebhookPlugins(),
    };
  });

  return fastify;
}

/**
 * Start the sidecar server.
 */
export async function startSidecar(config: SidecarConfig): Promise<FastifyInstance> {
  const server = await createSidecar(config);

  await server.listen({
    port: config.port,
    host: config.host,
  });

  server.log.info(`🛡️  ContractShield sidecar listening on http://${config.host}:${config.port}`);

  return server;
}
