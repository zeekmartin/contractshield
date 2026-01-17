import crypto from "crypto";
import type { RequestContext } from "../../types.js";
import type { WebhookPlugin, SignatureResult, WebhookValidationOptions } from "./types.js";
import { normalizeHeaders, timingSafeEqual } from "./types.js";

/**
 * Twilio webhook plugin.
 *
 * Signature header: X-Twilio-Signature
 * Algorithm: HMAC SHA-1 (base64 encoded)
 * Payload: URL + sorted POST parameters
 *
 * Note: Twilio also supports SHA-256 via bodySHA256 parameter for certain APIs.
 *
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
export const twilioPlugin: WebhookPlugin = {
  name: "twilio",

  requiredHeaders: ["x-twilio-signature"],

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
    const sig = headers["x-twilio-signature"];

    if (!sig) {
      return { valid: false, reason: "Missing X-Twilio-Signature header" };
    }

    // Get the full URL (needs to be provided via header or context)
    // Twilio validation requires the exact URL that was called
    const fullUrl = getFullUrl(ctx, headers);
    if (!fullUrl) {
      return { valid: false, reason: "Cannot determine full URL for Twilio signature validation" };
    }

    // Get POST parameters from body
    const body = ctx.request.body?.json?.sample || {};

    // Build the signature base string
    // Twilio format: URL + sorted POST params (key + value, no separators)
    const signatureBase = buildTwilioSignatureBase(fullUrl, body);

    // Compute expected signature (HMAC SHA-1, base64 encoded)
    const expected = crypto
      .createHmac("sha1", secret)
      .update(signatureBase, "utf8")
      .digest("base64");

    const match = timingSafeEqual(expected, sig);

    return {
      valid: match,
      reason: match ? undefined : "Twilio signature mismatch",
    };
  },

  extractEventId(ctx: RequestContext): string | null {
    // Twilio uses various identifiers depending on the product
    const body = ctx.request.body?.json?.sample;
    if (body && typeof body === "object") {
      // Message SID for SMS
      if ("MessageSid" in body) return String(body.MessageSid);
      // Call SID for voice
      if ("CallSid" in body) return String(body.CallSid);
      // Account SID as fallback with timestamp
      if ("AccountSid" in body) {
        const timestamp = Date.now();
        return `${body.AccountSid}-${timestamp}`;
      }
    }
    return null;
  },
};

/**
 * Get full URL for Twilio signature validation.
 * Looks for x-forwarded-url or constructs from host/path.
 */
function getFullUrl(ctx: RequestContext, headers: Record<string, string>): string | null {
  // Check for explicit URL header
  if (headers["x-forwarded-url"]) {
    return headers["x-forwarded-url"];
  }

  // Check for x-original-url (some proxies)
  if (headers["x-original-url"]) {
    return headers["x-original-url"];
  }

  // Try to construct from host + path
  const host = headers["host"] || headers["x-forwarded-host"];
  if (!host) return null;

  const proto = headers["x-forwarded-proto"] || "https";
  const path = ctx.request.path || "/";

  return `${proto}://${host}${path}`;
}

/**
 * Build Twilio signature base string.
 * Format: URL + sorted POST params concatenated (key + value)
 */
function buildTwilioSignatureBase(url: string, params: Record<string, unknown>): string {
  // Start with URL
  let result = url;

  // Sort parameters alphabetically by key and append
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    const value = params[key];
    if (value !== undefined && value !== null) {
      result += key + String(value);
    }
  }

  return result;
}

export default twilioPlugin;
