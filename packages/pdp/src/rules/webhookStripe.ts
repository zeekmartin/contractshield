import crypto from "crypto";
import { PolicyRoute, RequestContext, RuleHit, PdpOptions } from "../types";

/**
 * Stripe signature verification (v0.1)
 * Requires:
 * - header: stripe-signature (lowercase normalized)
 * - raw body: ctx.request.body.raw
 *
 * Test mode:
 * - if ctx.webhook.signatureValid is boolean, it overrides crypto verification (for golden tests).
 */
export async function verifyStripeSignature(route: PolicyRoute, ctx: RequestContext, opts: PdpOptions): Promise<RuleHit[]> {
  const hits: RuleHit[] = [];
  const ruleId = "webhook.stripe.signature";

  if (typeof ctx.webhook?.signatureValid === "boolean") {
    if (!ctx.webhook.signatureValid) hits.push({ id: ruleId, severity: "critical", message: "Signature invalid (fixture)" });
    return hits;
  }

  const requireRaw = route.webhook?.requireRawBody === true;
  const raw = ctx.request.body?.raw;
  if (requireRaw && !raw) {
    hits.push({ id: ruleId, severity: "critical", message: "Raw body required for Stripe signature verification" });
    return hits;
  }

  const headers = normalizeHeaders(ctx.request.headers ?? {});
  const sig = headers["stripe-signature"];
  if (!sig) {
    hits.push({ id: ruleId, severity: "critical", message: "Missing Stripe-Signature header" });
    return hits;
  }

  const secret = opts.getSecret?.({ provider: "stripe", routeId: route.id, ctx });
  if (!secret) {
    hits.push({ id: ruleId, severity: "critical", message: "Stripe secret not configured" });
    return hits;
  }

  const parsed = parseStripeSignature(sig);
  if (!parsed) {
    hits.push({ id: ruleId, severity: "critical", message: "Invalid Stripe-Signature format" });
    return hits;
  }

  const tolerance = route.webhook?.toleranceSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.timestamp) > tolerance) {
    hits.push({ id: ruleId, severity: "critical", message: "Stripe signature timestamp outside tolerance" });
    return hits;
  }

  const signedPayload = `${parsed.timestamp}.${raw}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const match = timingSafeEqualHex(expected, parsed.v1);

  if (!match) hits.push({ id: ruleId, severity: "critical", message: "Stripe signature mismatch" });
  return hits;
}

function normalizeHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
  return out;
}

function parseStripeSignature(sig: string): { timestamp: number; v1: string } | null {
  const parts = sig.split(",").map(s => s.trim());
  const t = parts.find(p => p.startsWith("t="))?.slice(2);
  const v1 = parts.find(p => p.startsWith("v1="))?.slice(3);
  if (!t || !v1) return null;
  const ts = Number(t);
  if (!Number.isFinite(ts)) return null;
  return { timestamp: ts, v1 };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}
