import { PolicySet, PolicyRoute, RequestContext, RuleHit } from "../types.js";
import { jsonDepth, maxArrayLength } from "../utils/jsonMetrics.js";

export function checkLimits(policy: PolicySet, route: PolicyRoute, ctx: RequestContext): RuleHit[] {
  const hits: RuleHit[] = [];
  const limits = {
    maxBodyBytes: route.limits?.maxBodyBytes ?? policy.defaults?.limits?.maxBodyBytes,
    maxJsonDepth: route.limits?.maxJsonDepth ?? policy.defaults?.limits?.maxJsonDepth,
    maxArrayLength: route.limits?.maxArrayLength ?? policy.defaults?.limits?.maxArrayLength,
  };

  const body = ctx.request.body;
  if (!body) return hits;

  if (limits.maxBodyBytes != null && body.sizeBytes > limits.maxBodyBytes) {
    hits.push({ id: "limit.body.max", severity: "high", message: `Body size ${body.sizeBytes} > ${limits.maxBodyBytes}` });
  }

  const sample = body.json?.sample;
  if (limits.maxJsonDepth != null && sample != null) {
    const d = jsonDepth(sample);
    if (d > limits.maxJsonDepth) {
      hits.push({ id: "limit.json.depth", severity: "high", message: `JSON depth ${d} > ${limits.maxJsonDepth}` });
    }
  }

  if (limits.maxArrayLength != null && sample != null) {
    const m = maxArrayLength(sample);
    if (m > limits.maxArrayLength) {
      hits.push({ id: "limit.array.max", severity: "high", message: `Array length ${m} > ${limits.maxArrayLength}` });
    }
  }

  return hits;
}
