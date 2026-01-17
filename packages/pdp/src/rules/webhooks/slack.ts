import crypto from "crypto";
import type { RequestContext } from "../../types.js";
import type { WebhookPlugin, SignatureResult, WebhookValidationOptions } from "./types.js";
import { normalizeHeaders, timingSafeEqual } from "./types.js";

/**
 * Slack webhook plugin.
 *
 * Signature header: X-Slack-Signature
 * Timestamp header: X-Slack-Request-Timestamp
 * Format: v0=<signature>
 * Algorithm: HMAC SHA-256
 * Payload: v0:<timestamp>:<raw_body>
 *
 * @see https://api.slack.com/authentication/verifying-requests-from-slack
 */
export const slackPlugin: WebhookPlugin = {
  name: "slack",

  requiredHeaders: ["x-slack-signature", "x-slack-request-timestamp"],

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
    const sig = headers["x-slack-signature"];
    const timestampStr = headers["x-slack-request-timestamp"];

    if (!sig) {
      return { valid: false, reason: "Missing X-Slack-Signature header" };
    }

    if (!timestampStr) {
      return { valid: false, reason: "Missing X-Slack-Request-Timestamp header" };
    }

    const raw = ctx.request.body?.raw;
    const requireRaw = options?.requireRawBody !== false;

    if (requireRaw && !raw) {
      return { valid: false, reason: "Raw body required for Slack signature verification" };
    }

    // Parse timestamp
    const timestamp = Number(timestampStr);
    if (!Number.isFinite(timestamp)) {
      return { valid: false, reason: "Invalid X-Slack-Request-Timestamp" };
    }

    // Timestamp tolerance check (default 5 minutes for Slack)
    const tolerance = options?.timestampTolerance ?? 300;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
      return {
        valid: false,
        reason: "Slack request timestamp outside tolerance (possible replay attack)",
        timestamp,
      };
    }

    // Parse signature (format: v0=<hex>)
    if (!sig.startsWith("v0=")) {
      return { valid: false, reason: "Invalid X-Slack-Signature format (expected v0=...)" };
    }

    const providedSig = sig.slice(3); // Remove "v0=" prefix

    // Compute expected signature
    // Slack's signing string format: v0:<timestamp>:<body>
    const sigBasestring = `v0:${timestamp}:${raw || ""}`;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(sigBasestring, "utf8")
      .digest("hex");

    const match = timingSafeEqual(expected, providedSig);

    return {
      valid: match,
      reason: match ? undefined : "Slack signature mismatch",
      timestamp,
    };
  },

  extractEventId(ctx: RequestContext): string | null {
    // Slack doesn't have a standard event ID header
    // Use event_id from body if present (for Events API)
    const body = ctx.request.body?.json?.sample;
    if (body && typeof body === "object") {
      if ("event_id" in body) return String(body.event_id);
      // For slash commands or interactive components, use trigger_id
      if ("trigger_id" in body) return String(body.trigger_id);
    }
    return null;
  },
};

export default slackPlugin;
