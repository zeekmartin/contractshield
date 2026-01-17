import { PolicySet, RequestContext, Decision, RuleHit, PdpOptions, PolicyRoute } from "./types.js";
import { matchRoute } from "./utils/matchRoute.js";
import { buildEnv } from "./utils/buildEnv.js";
import { checkVulnerabilities, mergeVulnerabilityConfig } from "./rules/vulnerability/index.js";
import { checkLimits } from "./rules/limits.js";
import { validateContract } from "./rules/contract.js";
import { evalCelRule } from "./rules/cel.js";
import { verifyWebhookSignature, checkWebhookReplay } from "./rules/webhooks/index.js";

function riskFromHits(hits: RuleHit[]) {
  if (hits.length === 0) return { score: 0, level: "none" as const };
  const hasCritical = hits.some(h => h.severity === "critical");
  if (hasCritical) return { score: 90, level: "critical" as const };
  return { score: 60, level: "high" as const };
}

function routeMode(policy: PolicySet, route: PolicyRoute): "monitor" | "enforce" {
  return route.mode ?? policy.defaults?.mode ?? "enforce";
}

export async function evaluate(policy: PolicySet, ctx: RequestContext, opts: PdpOptions = {}): Promise<Decision> {
  const route = matchRoute(policy.routes, ctx.request.method, ctx.request.path, ctx.request.routeId);
  if (!route) {
    const unmatchedAction = policy.defaults?.unmatchedRouteAction ?? "allow";
    const statusBlock = policy.defaults?.response?.blockStatusCode ?? 403;
    if (unmatchedAction === "block") {
      return { version: "0.1", action: "BLOCK", statusCode: statusBlock, reason: "No matching route (blocked)", risk: { score: 60, level: "high" }, ruleHits: [{ id: "route.unmatched", severity: "high" }], redactions: [] };
    }
    if (unmatchedAction === "monitor") {
      return { version: "0.1", action: "MONITOR", statusCode: 200, reason: "No matching route (monitored)", risk: { score: 30, level: "med" }, ruleHits: [{ id: "route.unmatched", severity: "med" }], redactions: [] };
    }
    return { version: "0.1", action: "ALLOW", statusCode: 200, reason: "No matching route", risk: { score: 0, level: "none" }, ruleHits: [], redactions: [] };
  }

  const hits: RuleHit[] = [];
  const statusBlock = policy.defaults?.response?.blockStatusCode ?? 403;

  // 1) Vulnerability checks (first line of defense - denylist)
  const vulnConfig = mergeVulnerabilityConfig(
    policy.defaults?.vulnerabilityChecks,
    route.vulnerability
  );
  hits.push(...checkVulnerabilities(ctx, vulnConfig));

  // 2) Limits
  hits.push(...checkLimits(policy, route, ctx));

  // 3) Contract
  hits.push(...(await validateContract(policy, route, ctx, opts)));

  // 4) Webhooks (generic plugin system - supports stripe, github, slack, twilio, etc.)
  if (route.webhook?.provider) {
    hits.push(...(await verifyWebhookSignature(route, ctx, opts)));
    hits.push(...(await checkWebhookReplay(route, ctx, opts)));
  }

  // 5) CEL
  const env = buildEnv(ctx);
  for (const rule of route.rules ?? []) {
    if (rule.type === "cel") hits.push(...evalCelRule(rule, env, opts));
  }

  const mode = routeMode(policy, route);
  if (hits.length > 0) {
    const risk = riskFromHits(hits);
    return {
      version: "0.1",
      action: mode === "monitor" ? "MONITOR" : "BLOCK",
      statusCode: mode === "monitor" ? 200 : statusBlock,
      reason: "Policy violation",
      ruleHits: hits.map(h => ({ id: h.id, severity: h.severity })),
      risk,
      redactions: [],
      metadata: { routeId: route.id, mode },
    };
  }

  return { version: "0.1", action: "ALLOW", statusCode: 200, reason: "Allowed", ruleHits: [], risk: { score: 0, level: "none" }, redactions: [], metadata: { routeId: route.id, mode } };
}
