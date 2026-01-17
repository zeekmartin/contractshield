import crypto from "crypto";
import type { RequestContext } from "../../types.js";
import type { WebhookPlugin, SignatureResult, WebhookValidationOptions } from "./types.js";
import { normalizeHeaders, timingSafeEqualHex } from "./types.js";

/**
 * GitHub webhook plugin.
 *
 * Signature header: X-Hub-Signature-256
 * Format: sha256=<signature>
 * Algorithm: HMAC SHA-256
 * Payload: raw body
 *
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export const githubPlugin: WebhookPlugin = {
  name: "github",

  requiredHeaders: ["x-hub-signature-256"],

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
    const sig = headers["x-hub-signature-256"];

    if (!sig) {
      return { valid: false, reason: "Missing X-Hub-Signature-256 header" };
    }

    const raw = ctx.request.body?.raw;
    const requireRaw = options?.requireRawBody !== false;

    if (requireRaw && !raw) {
      return { valid: false, reason: "Raw body required for GitHub signature verification" };
    }

    // Parse signature (format: sha256=<hex>)
    if (!sig.startsWith("sha256=")) {
      return { valid: false, reason: "Invalid X-Hub-Signature-256 format (expected sha256=...)" };
    }

    const providedSig = sig.slice(7); // Remove "sha256=" prefix

    // Compute expected signature
    const expected = crypto
      .createHmac("sha256", secret)
      .update(raw || "", "utf8")
      .digest("hex");

    const match = timingSafeEqualHex(expected, providedSig);

    return {
      valid: match,
      reason: match ? undefined : "GitHub signature mismatch",
    };
  },

  extractEventId(ctx: RequestContext): string | null {
    // GitHub delivery ID from header
    const headers = normalizeHeaders(ctx.request.headers);
    return headers["x-github-delivery"] || null;
  },
};

export default githubPlugin;
