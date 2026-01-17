import type { RequestContext, RuleHit, PdpOptions } from "../../types.js";

/**
 * Result of signature validation.
 */
export interface SignatureResult {
  /** Whether the signature is valid. */
  valid: boolean;
  /** Reason for validation failure (if invalid). */
  reason?: string;
  /** Parsed timestamp from the signature (if available). */
  timestamp?: number;
}

/**
 * Webhook plugin interface.
 * Each provider (Stripe, GitHub, Slack, etc.) implements this interface.
 */
export interface WebhookPlugin {
  /** Provider name (e.g., "stripe", "github", "slack"). */
  name: string;

  /** Headers required for signature verification. */
  requiredHeaders: string[];

  /**
   * Validate the webhook signature.
   * @param ctx Request context with headers and raw body.
   * @param secret The webhook secret for this provider.
   * @param options Additional validation options.
   */
  validateSignature(
    ctx: RequestContext,
    secret: string,
    options?: WebhookValidationOptions
  ): SignatureResult;

  /**
   * Extract the event ID for replay protection.
   * @param ctx Request context.
   * @returns Event ID or null if not available.
   */
  extractEventId(ctx: RequestContext): string | null;
}

/**
 * Options for webhook validation.
 */
export interface WebhookValidationOptions {
  /** Timestamp tolerance in seconds. Default varies by provider. */
  timestampTolerance?: number;
  /** Whether raw body is required. Default: true for signature verification. */
  requireRawBody?: boolean;
}

/**
 * Webhook configuration in policy route.
 */
export interface WebhookRouteConfig {
  /** Webhook provider name. */
  provider: string;
  /** Environment variable or secret reference. */
  secretRef?: string;
  /** Inline secret (not recommended, use secretRef). */
  secret?: string;
  /** Enable replay protection. Default: true */
  replayProtection?: boolean;
  /** Timestamp tolerance in seconds. */
  timestampTolerance?: number;
  /** Require raw body for signature verification. Default: true */
  requireRawBody?: boolean;
  /** Allowed event types (optional filter). */
  allowedEventTypes?: string[];
}

/**
 * Internal context passed to webhook verification functions.
 */
export interface WebhookVerificationContext {
  route: {
    id: string;
    webhook?: WebhookRouteConfig;
  };
  ctx: RequestContext;
  opts: PdpOptions;
}

/**
 * Helper to normalize headers to lowercase.
 */
export function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = String(value);
  }
  return result;
}

/**
 * Timing-safe comparison of hex strings.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    // Dynamic import to avoid bundling crypto in browser builds
    const crypto = require("crypto");
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Timing-safe comparison of strings.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  try {
    const crypto = require("crypto");
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
