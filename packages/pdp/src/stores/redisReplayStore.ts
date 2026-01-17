import type { ReplayStore } from "../types.js";

/**
 * Generic Redis client interface.
 * Compatible with both 'redis' and 'ioredis' packages.
 */
export interface RedisClient {
  /** Set a key with optional expiration. */
  set(key: string, value: string, options?: { EX?: number } | "EX" | number, ex?: number): Promise<string | null>;
  /** Get a key value. */
  get(key: string): Promise<string | null>;
  /** Set key only if it doesn't exist (NX), with expiration. */
  setNX?(key: string, value: string): Promise<boolean | number | null>;
  /** Set with options (for ioredis). */
  setnx?(key: string, value: string): Promise<number>;
  /** Expire a key. */
  expire?(key: string, seconds: number): Promise<number | boolean>;
}

/**
 * Options for creating a Redis replay store.
 */
export interface RedisReplayStoreOptions {
  /** Redis client instance (redis or ioredis). */
  client: RedisClient;
  /** Key prefix for replay entries. Default: 'contractshield:replay:' */
  prefix?: string;
  /** Default TTL in seconds. Default: 86400 (24 hours) */
  defaultTtl?: number;
}

/**
 * Redis-based replay store for production webhook deduplication.
 *
 * Supports both 'redis' (node-redis) and 'ioredis' client interfaces.
 *
 * @example
 * ```typescript
 * import { createClient } from 'redis';
 * import { createRedisReplayStore } from '@contractshield/pdp';
 *
 * const redisClient = createClient({ url: process.env.REDIS_URL });
 * await redisClient.connect();
 *
 * const replayStore = createRedisReplayStore({ client: redisClient });
 *
 * const decision = await evaluate(policy, ctx, { replayStore });
 * ```
 */
export class RedisReplayStore implements ReplayStore {
  private client: RedisClient;
  private prefix: string;
  private defaultTtl: number;

  constructor(options: RedisReplayStoreOptions) {
    this.client = options.client;
    this.prefix = options.prefix ?? "contractshield:replay:";
    this.defaultTtl = options.defaultTtl ?? 86400;
  }

  /**
   * Check if an event has been seen before.
   * If not seen, marks it as seen atomically.
   *
   * @returns true if the event was already seen (replay), false if new.
   */
  async checkAndStore(args: {
    provider: string;
    eventId: string;
    ttlSeconds: number;
  }): Promise<boolean> {
    const key = this.buildKey(args.provider, args.eventId);
    const ttl = args.ttlSeconds || this.defaultTtl;
    const value = Date.now().toString();

    try {
      // Try SET with NX (only if not exists) and EX (expiration)
      // This is atomic and prevents race conditions
      const result = await this.setNxEx(key, value, ttl);

      // If set succeeded (key was new), return false (not a replay)
      // If set failed (key existed), return true (replay)
      return !result;
    } catch (error) {
      // On Redis error, fail-open (allow the request, don't block)
      console.error("[contractshield:redis] Replay check failed:", error);
      return false;
    }
  }

  /**
   * Check if an event has been seen (without marking it).
   */
  async hasSeen(provider: string, eventId: string): Promise<boolean> {
    const key = this.buildKey(provider, eventId);
    try {
      const value = await this.client.get(key);
      return value !== null;
    } catch {
      return false;
    }
  }

  /**
   * Mark an event as seen explicitly.
   */
  async markSeen(provider: string, eventId: string, ttlSeconds?: number): Promise<void> {
    const key = this.buildKey(provider, eventId);
    const ttl = ttlSeconds ?? this.defaultTtl;
    const value = Date.now().toString();

    try {
      await this.setWithTtl(key, value, ttl);
    } catch (error) {
      console.error("[contractshield:redis] Failed to mark event as seen:", error);
    }
  }

  private buildKey(provider: string, eventId: string): string {
    // Sanitize eventId to prevent key injection
    const safeEventId = eventId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${this.prefix}${provider}:${safeEventId}`;
  }

  /**
   * Set with NX and EX options.
   * Handles differences between redis and ioredis APIs.
   */
  private async setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    // Try node-redis v4 style (SET with options object)
    try {
      const result = await (this.client as any).set(key, value, {
        NX: true,
        EX: ttlSeconds,
      });
      return result === "OK" || result === 1;
    } catch {
      // Fallback: try ioredis style or older redis style
    }

    // Try ioredis style (positional arguments)
    try {
      const result = await (this.client as any).set(key, value, "EX", ttlSeconds, "NX");
      return result === "OK" || result === 1;
    } catch {
      // Continue to manual fallback
    }

    // Manual fallback: SETNX + EXPIRE (not atomic but works)
    if (this.client.setNX) {
      const set = await this.client.setNX(key, value);
      if (set) {
        await this.client.expire?.(key, ttlSeconds);
        return true;
      }
      return false;
    }

    if ((this.client as any).setnx) {
      const set = await (this.client as any).setnx(key, value);
      if (set === 1) {
        await this.client.expire?.(key, ttlSeconds);
        return true;
      }
      return false;
    }

    throw new Error("Redis client does not support SET NX EX or SETNX");
  }

  /**
   * Set with TTL.
   */
  private async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    // Try node-redis v4 style
    try {
      await (this.client as any).set(key, value, { EX: ttlSeconds });
      return;
    } catch {
      // Continue
    }

    // Try ioredis style
    try {
      await (this.client as any).set(key, value, "EX", ttlSeconds);
      return;
    } catch {
      // Continue
    }

    // Fallback: SET + EXPIRE
    await this.client.set(key, value);
    await this.client.expire?.(key, ttlSeconds);
  }
}

/**
 * Factory function to create a Redis replay store.
 */
export function createRedisReplayStore(options: RedisReplayStoreOptions): RedisReplayStore {
  return new RedisReplayStore(options);
}
