/**
 * Prometheus Metrics
 * Simple metrics registry without external dependencies
 */

interface Metric {
  name: string;
  help: string;
  type: "counter" | "gauge" | "histogram";
  values: Map<string, number>;
  buckets?: number[];
  observations?: Map<string, number[]>;
}

class MetricsRegistry {
  private metrics = new Map<string, Metric>();

  /**
   * Register a counter metric
   */
  counter(name: string, help: string): void {
    this.metrics.set(name, {
      name,
      help,
      type: "counter",
      values: new Map(),
    });
  }

  /**
   * Register a gauge metric
   */
  gauge(name: string, help: string): void {
    this.metrics.set(name, {
      name,
      help,
      type: "gauge",
      values: new Map(),
    });
  }

  /**
   * Register a histogram metric
   */
  histogram(name: string, help: string, buckets: number[]): void {
    this.metrics.set(name, {
      name,
      help,
      type: "histogram",
      values: new Map(),
      buckets,
      observations: new Map(),
    });
  }

  /**
   * Increment a counter
   */
  inc(name: string, labels: Record<string, string> = {}, value = 1): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== "counter") return;
    const key = this.labelsToKey(labels);
    metric.values.set(key, (metric.values.get(key) ?? 0) + value);
  }

  /**
   * Set a gauge value
   */
  set(name: string, labels: Record<string, string>, value: number): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== "gauge") return;
    const key = this.labelsToKey(labels);
    metric.values.set(key, value);
  }

  /**
   * Observe a histogram value
   */
  observe(name: string, labels: Record<string, string>, value: number): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== "histogram") return;
    const key = this.labelsToKey(labels);
    if (!metric.observations!.has(key)) {
      metric.observations!.set(key, []);
    }
    metric.observations!.get(key)!.push(value);
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheus(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      if (metric.type === "histogram") {
        for (const [labels, observations] of metric.observations!) {
          const sorted = [...observations].sort((a, b) => a - b);
          for (const bucket of metric.buckets!) {
            const count = sorted.filter((v) => v <= bucket).length;
            const labelStr = labels ? `${labels},` : "";
            lines.push(`${metric.name}_bucket{${labelStr}le="${bucket}"} ${count}`);
          }
          const labelStr = labels ? `${labels},` : "";
          lines.push(`${metric.name}_bucket{${labelStr}le="+Inf"} ${sorted.length}`);
          lines.push(
            `${metric.name}_sum{${labels || ""}} ${sorted.reduce((a, b) => a + b, 0)}`
          );
          lines.push(`${metric.name}_count{${labels || ""}} ${sorted.length}`);
        }
      } else {
        for (const [labels, value] of metric.values) {
          const labelStr = labels ? `{${labels}}` : "";
          lines.push(`${metric.name}${labelStr} ${value}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.values.clear();
      if (metric.observations) {
        metric.observations.clear();
      }
    }
  }

  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
  }
}

// Singleton registry
export const metrics = new MetricsRegistry();

// Define metrics
metrics.counter("contractshield_decisions_total", "Total decisions by action");
metrics.histogram(
  "contractshield_eval_latency_ms",
  "Evaluation latency in milliseconds",
  [1, 5, 10, 25, 50, 100, 250, 500]
);
metrics.gauge("contractshield_up", "ContractShield sidecar status");
metrics.gauge("contractshield_policy_routes", "Number of routes in policy");
metrics.counter("contractshield_errors_total", "Total errors by type");
metrics.counter("contractshield_cache_hits_total", "Total cache hits");
metrics.counter("contractshield_cache_misses_total", "Total cache misses");

/**
 * Record a decision
 */
export function recordDecision(action: string, latencyMs: number): void {
  metrics.inc("contractshield_decisions_total", { action });
  metrics.observe("contractshield_eval_latency_ms", { action }, latencyMs);
}

/**
 * Record sidecar status
 */
export function recordUp(up: boolean): void {
  metrics.set("contractshield_up", {}, up ? 1 : 0);
}

/**
 * Record policy route count
 */
export function recordPolicyRoutes(count: number): void {
  metrics.set("contractshield_policy_routes", {}, count);
}

/**
 * Record an error
 */
export function recordError(errorType: string): void {
  metrics.inc("contractshield_errors_total", { type: errorType });
}

/**
 * Record cache hit
 */
export function recordCacheHit(): void {
  metrics.inc("contractshield_cache_hits_total");
}

/**
 * Record cache miss
 */
export function recordCacheMiss(): void {
  metrics.inc("contractshield_cache_misses_total");
}

/**
 * Get metrics in Prometheus format
 */
export function getMetrics(): string {
  return metrics.toPrometheus();
}
