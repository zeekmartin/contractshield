/**
 * ContractShield Client SDK
 *
 * Provides a robust client for communicating with ContractShield PDP:
 * - LRU caching for low-latency repeated decisions
 * - Automatic retry with exponential backoff
 * - Fail-open/fail-closed modes for resilience
 * - Unix socket support for sidecar deployment
 *
 * @example
 * ```typescript
 * import { ContractShieldClient } from '@contractshield/client';
 *
 * const client = new ContractShieldClient({
 *   url: 'http://localhost:3100',
 *   cacheEnabled: true,
 *   failOpen: true,
 * });
 *
 * const decision = await client.evaluate(context);
 * ```
 */

export { ContractShieldClient, type ClientOptions, type CacheStats } from "./client.js";

// Re-export types from PDP for convenience
export type { Decision, RequestContext, PolicySet } from "@contractshield/pdp";
