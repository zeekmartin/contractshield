import crypto from "crypto";
import type { RequestContext } from "../../types.js";
import type { WebhookPlugin, SignatureResult, WebhookValidationOptions } from "./types.js";
import { normalizeHeaders, timingSafeEqualHex } from "./types.js";

/**
 * Stripe webhook plugin.
 *
 * Signature format: t=<timestamp>,v1=<signature>
 * Algorithm: HMAC SHA-256
 * Payload: <timestamp>.<raw_body>
 *
 * @see https://stripe.com/docs/webhooks/signatures
 */
export const stripePlugin: WebhookPlugin = {
  name: "stripe",

  requiredHeaders: ["stripe-signature"],

  validateSignature(
    ctx: RequestContext,
    secret: string,
    options?: WebhookValidationOptions
  ): SignatureResult {
    // Test mode: fixture override
    if (typeof ctx.webhook?.signatureValid === "boolean") {
      return {
        valid: ctx.webhook.signatureValid,
        reason: ctx.webhook.signatureValid ? undefined : "Signature invalid (fixture)",
      };
    }

    const headers = normalizeHeaders(ctx.request.headers);
    const sig = headers["stripe-signature"];

    if (!sig) {
      return { valid: false, reason: "Missing Stripe-Signature header" };
    }

    const raw = ctx.request.body?.raw;
    const requireRaw = options?.requireRawBody !== false;

    if (requireRaw && !raw) {
      return { valid: false, reason: "Raw body required for Stripe signature verification" };
    }

    const parsed = parseStripeSignature(sig);
    if (!parsed) {
      return { valid: false, reason: "Invalid Stripe-Signature format" };
    }

    // Timestamp tolerance check
    const tolerance = options?.timestampTolerance ?? 300; // 5 minutes default
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parsed.timestamp) > tolerance) {
      return {
        valid: false,
        reason: "Stripe signature timestamp outside tolerance",
        timestamp: parsed.timestamp,
      };
    }

    // Compute expected signature
    const signedPayload = `${parsed.timestamp}.${raw}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(signedPayload, "utf8")
      .digest("hex");

    const match = timingSafeEqualHex(expected, parsed.v1);

    return {
      valid: match,
      reason: match ? undefined : "Stripe signature mismatch",
      timestamp: parsed.timestamp,
    };
  },

  extractEventId(ctx: RequestContext): string | null {
    // Stripe event ID from body
    const body = ctx.request.body?.json?.sample;
    if (body && typeof body === "object" && "id" in body) {
      return String(body.id);
    }
    return null;
  },
};

/**
 * Parse Stripe signature header.
 * Format: t=<timestamp>,v1=<signature>[,v1=<signature>]
 */
function parseStripeSignature(sig: string): { timestamp: number; v1: string } | null {
  const parts = sig.split(",").map((s) => s.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = parts.find((p) => p.startsWith("v1="))?.slice(3);

  if (!t || !v1) return null;

  const timestamp = Number(t);
  if (!Number.isFinite(timestamp)) return null;

  return { timestamp, v1 };
}

export default stripePlugin;
