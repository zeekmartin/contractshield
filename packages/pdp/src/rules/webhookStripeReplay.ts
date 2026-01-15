import { PolicyRoute, RequestContext, RuleHit, PdpOptions } from "../types";

/**
 * Stripe replay protection (v0.1)
 * Requires:
 * - event id from body JSON sample: request.body.json.sample.id
 * - a replayStore (Redis recommended)
 *
 * Test mode:
 * - if ctx.webhook.replayed is boolean, it overrides store behavior (for golden tests).
 */
export async function checkStripeReplay(route: PolicyRoute, ctx: RequestContext, opts: PdpOptions): Promise<RuleHit[]> {
  const hits: RuleHit[] = [];
  const ruleId = "webhook.stripe.replay";

  if (typeof ctx.webhook?.replayed === "boolean") {
    if (ctx.webhook.replayed) hits.push({ id: ruleId, severity: "critical", message: "Replay detected (fixture)" });
    return hits;
  }

  const store = opts.replayStore;
  if (!store) return hits;

  const eventId = ctx.request.body?.json?.sample?.id;
  if (!eventId) return hits;

  const ttl = 24 * 60 * 60; // 24h default
  const already = await store.checkAndStore({ provider: "stripe", eventId: String(eventId), ttlSeconds: ttl });
  if (already) hits.push({ id: ruleId, severity: "critical", message: "Replay detected" });
  return hits;
}
