/**
 * ContractShield Client SDK
 * Provides caching, retry, and failover for centralized PDP
 */

import { LRUCache } from "lru-cache";
import type { RequestContext, Decision } from "@cshield/pdp";

export interface ClientOptions {
  /** HTTP URL of the ContractShield service */
  url?: string;
  /** Unix socket path (alternative to URL) */
  socketPath?: string;

  /** Request timeout in ms (default: 100) */
  timeoutMs?: number;
  /** Number of retries on failure (default: 2) */
  retries?: number;
  /** Delay between retries in ms (default: 10) */
  retryDelayMs?: number;

  /** Enable response caching (default: true) */
  cacheEnabled?: boolean;
  /** Maximum cache size (default: 1000) */
  cacheMaxSize?: number;
  /** Cache TTL in ms (default: 60000) */
  cacheTtlMs?: number;

  /** Allow requests on failure (default: false = fail closed) */
  failOpen?: boolean;
  /** Custom decision to return on failover */
  failOpenDecision?: Decision;

  /** Called on errors */
  onError?: (error: Error) => void;
  /** Called on cache hits */
  onCacheHit?: (key: string) => void;
  /** Called on failover */
  onFailover?: (error: Error) => void;
}

interface ResolvedOptions {
  url: string;
  socketPath: string | undefined;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  cacheEnabled: boolean;
  cacheMaxSize: number;
  cacheTtlMs: number;
  failOpen: boolean;
  failOpenDecision: Decision;
  onError: (error: Error) => void;
  onCacheHit: (key: string) => void;
  onFailover: (error: Error) => void;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
}

const DEFAULT_FAILOPEN_DECISION: Decision = {
  version: "0.1",
  action: "ALLOW",
  statusCode: 200,
  reason: "Failover: ContractShield service unavailable",
  ruleHits: [],
  risk: { score: 0, level: "none" },
};

/**
 * ContractShield Client with caching, retry, and failover
 */
export class ContractShieldClient {
  private cache: LRUCache<string, Decision>;
  private options: ResolvedOptions;
  private stats = { hits: 0, misses: 0 };

  constructor(options: ClientOptions = {}) {
    this.options = {
      url: options.url ?? "http://localhost:3100",
      socketPath: options.socketPath,
      timeoutMs: options.timeoutMs ?? 100,
      retries: options.retries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 10,
      cacheEnabled: options.cacheEnabled ?? true,
      cacheMaxSize: options.cacheMaxSize ?? 1000,
      cacheTtlMs: options.cacheTtlMs ?? 60000,
      failOpen: options.failOpen ?? false,
      failOpenDecision: options.failOpenDecision ?? DEFAULT_FAILOPEN_DECISION,
      onError: options.onError ?? (() => {}),
      onCacheHit: options.onCacheHit ?? (() => {}),
      onFailover: options.onFailover ?? (() => {}),
    };

    this.cache = new LRUCache({
      max: this.options.cacheMaxSize,
      ttl: this.options.cacheTtlMs,
    });
  }

  /**
   * Evaluate a request context against the policy
   */
  async evaluate(context: RequestContext): Promise<Decision> {
    // 1. Check cache
    if (this.options.cacheEnabled) {
      const cacheKey = this.computeCacheKey(context);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.stats.hits++;
        this.options.onCacheHit(cacheKey);
        return cached;
      }
      this.stats.misses++;
    }

    // 2. Call service with retry
    try {
      const decision = await this.callWithRetry(context);

      // 3. Cache ALLOW and MONITOR decisions only
      if (
        this.options.cacheEnabled &&
        (decision.action === "ALLOW" || decision.action === "MONITOR")
      ) {
        const cacheKey = this.computeCacheKey(context);
        this.cache.set(cacheKey, decision);
      }

      return decision;
    } catch (error) {
      this.options.onError(error as Error);

      // 4. Failover
      if (this.options.failOpen) {
        this.options.onFailover(error as Error);
        return this.options.failOpenDecision;
      }

      throw error;
    }
  }

  /**
   * Clear the decision cache
   */
  clearCache(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    return {
      size: this.cache.size,
      maxSize: this.options.cacheMaxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
    };
  }

  /**
   * Check if the service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.options.url}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async callWithRetry(context: RequestContext): Promise<Decision> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        return await this.callService(context);
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.options.retries) {
          await this.delay(this.options.retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  private async callService(context: RequestContext): Promise<Decision> {
    const response = await this.fetchWithTimeout(`${this.options.url}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    });

    if (!response.ok) {
      throw new Error(`ContractShield returned ${response.status}`);
    }

    const data = await response.json();
    return data.decision;
  }

  private async fetchWithTimeout(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private computeCacheKey(ctx: RequestContext): string {
    // Cache by route + method + tenant + scopes
    // Don't include body (too variable)
    const parts = [
      ctx.request.method,
      ctx.request.routeId || ctx.request.path,
      ctx.identity?.tenant || "anonymous",
      ctx.identity?.scopes?.sort().join(",") || "",
    ];
    return parts.join(":");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
