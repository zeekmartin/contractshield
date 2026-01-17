import { PolicyRule, RuleHit, PdpOptions } from "../types.js";

/**
 * CEL evaluation is pluggable.
 * Provide opts.celEvaluator for full CEL support.
 * Fallback supports a tiny safe subset (used in docs/quickstarts).
 */
export function evalCelRule(rule: PolicyRule, env: Record<string, any>, opts: PdpOptions): RuleHit[] {
  const hits: RuleHit[] = [];
  const expr = String(rule.config?.["expr"] ?? "");
  if (!expr) return hits;

  let ok = false;

  if (opts.celEvaluator) {
    ok = opts.celEvaluator.eval(expr, env);
  } else {
    const e = expr.trim();
    if (e === "identity.authenticated == true") {
      ok = env.identity?.authenticated === true;
    } else if (e === "identity.tenant == request.body.tenantId") {
      ok = (env.identity?.tenant ?? "") === (env.request?.body?.json?.sample?.tenantId ?? env.request?.body?.tenantId);
    } else if (e.includes(" in [")) {
      const m = e.match(/^(.+?)\s+in\s+\[(.+)\]\s*$/);
      if (m) {
        const lhs = m[1].trim();
        const rhs = m[2].trim();
        const allowed = rhs
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => s.replace(/^"|"$/g, "").replace(/^'|'$/g, ""));
        const value = getPath(env, lhs);
        ok = allowed.includes(String(value ?? ""));
      } else {
        throw new Error(`Unsupported CEL expr (subset): ${expr}`);
      }
    } else {
      throw new Error(`Unsupported CEL expr (subset): ${expr}`);
    }
  }

  if (!ok) hits.push({ id: rule.id, severity: rule.severity ?? "high", message: "CEL invariant failed" });
  return hits;
}

function getPath(obj: any, dotted: string): any {
  const parts = dotted.split(".").map(p => p.trim()).filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
