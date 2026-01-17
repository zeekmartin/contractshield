/**
 * Enhanced Health Checks
 * Provides detailed health status with readiness probes
 */

export interface HealthStatus {
  status: "ok" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  checks: {
    redis?: { status: "ok" | "error"; latencyMs?: number; error?: string };
    policy?: { status: "ok" | "error"; routeCount?: number; error?: string };
  };
}

export interface ReadinessStatus {
  ready: boolean;
  reason?: string;
}

export interface HealthDependencies {
  redis?: { ping: () => Promise<string> };
  policy?: { routes?: any[] };
}

const startTime = Date.now();

/**
 * Get detailed health status
 */
export async function getHealth(
  deps: HealthDependencies,
  version: string
): Promise<HealthStatus> {
  const checks: HealthStatus["checks"] = {};

  // Check Redis
  if (deps.redis) {
    try {
      const start = Date.now();
      await deps.redis.ping();
      checks.redis = { status: "ok", latencyMs: Date.now() - start };
    } catch (error) {
      checks.redis = { status: "error", error: (error as Error).message };
    }
  }

  // Check Policy
  if (deps.policy) {
    try {
      const routeCount = deps.policy.routes?.length ?? 0;
      checks.policy = { status: "ok", routeCount };
    } catch (error) {
      checks.policy = { status: "error", error: (error as Error).message };
    }
  }

  // Determine overall status
  const hasError = Object.values(checks).some((c) => c.status === "error");

  return {
    status: hasError ? "degraded" : "ok",
    version,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks,
  };
}

/**
 * Check if service is ready to accept traffic
 */
export async function getReadiness(deps: HealthDependencies): Promise<ReadinessStatus> {
  // Ready if we have a valid policy
  if (!deps.policy) {
    return { ready: false, reason: "No policy loaded" };
  }

  // Ready if Redis is connected (if configured)
  if (deps.redis) {
    try {
      await deps.redis.ping();
    } catch {
      return { ready: false, reason: "Redis not connected" };
    }
  }

  return { ready: true };
}

/**
 * Create liveness probe response
 */
export function getLiveness(): { alive: boolean } {
  return { alive: true };
}
