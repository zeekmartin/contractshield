#!/usr/bin/env node
/**
 * Golden tests runner (v0.1)
 *
 * - Loads policy YAML
 * - Loads fixtures/contexts/*.json
 * - Evaluates:
 *   1) route match
 *   2) contract.reject_unknown_fields (simple allowlist via schema-like "allowedFields" embedded in runner for v0.1)
 *   3) CEL invariants (very small expression subset for demo)
 * - Compares with fixtures/expected/<context-id>.decision.json
 *
 * This is intentionally minimal. It exists to prove the golden-test workflow.
 */
import fs from "fs";
import path from "path";
import yaml from "yaml";

const ROOT = process.cwd();

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// v0.1 demo: allowed fields for the license.activate request body
const allowedFieldsByRouteId = {
  "license.activate.v1": new Set(["tenantId", "licenseKey", "deviceId", "userEmail", "client"])
};

// Minimal CEL evaluator for a tiny safe subset used in examples
function evalCel(expr, ctx) {
  // Supported patterns:
  // 1) identity.authenticated == true
  // 2) identity.tenant == request.body.tenantId
  const e = expr.trim();
  if (e === "identity.authenticated == true") {
    return ctx.identity?.authenticated === true;
  }
  if (e === "identity.tenant == request.body.tenantId") {
    const tenant = ctx.identity?.tenant ?? "";
    const bodyTenant =
      ctx.request?.body?.json?.sample?.tenantId ??
      ctx.request?.body?.tenantId ??
      ctx.request?.body?.json?.tenantId ??
      ctx.request?.body?.tenantId;
    return tenant === bodyTenant;
  }
  throw new Error(`Unsupported CEL expr in v0.1 runner: ${expr}`);
}

function evaluate(policy, ctx) {
  const route = policy.routes.find(r =>
    r.match?.method === ctx.request?.method &&
    r.match?.path === ctx.request?.path
  ) || policy.routes.find(r => r.id === ctx.request?.routeId);

  if (!route) {
    return {
      version: "0.1",
      action: "ALLOW",
      statusCode: 200,
      reason: "No matching route",
      ruleHits: [],
      risk: { score: 0, level: "none" },
      redactions: []
    };
  }

  const hits = [];

  // Contract: reject unknown fields (based on allowlist)
  const rejectUnknown = route.contract?.rejectUnknownFields === true;
  if (rejectUnknown) {
    const allow = allowedFieldsByRouteId[route.id] || allowedFieldsByRouteId[ctx.request?.routeId];
    if (allow) {
      const sample = ctx.request?.body?.json?.sample;
      if (sample && typeof sample === "object" && !Array.isArray(sample)) {
        const unknown = Object.keys(sample).filter(k => !allow.has(k));
        if (unknown.length > 0) {
          hits.push({ id: "contract.reject_unknown_fields", severity: "high", message: `Unknown fields: ${unknown.join(",")}` });
        }
      }
    }
  }

  // CEL rules
  for (const rule of (route.rules || [])) {
    if (rule.type !== "cel") continue;
    const expr = rule.config?.expr;
    if (!expr) continue;
    const ok = evalCel(expr, ctx);
    if (!ok) {
      hits.push({ id: rule.id, severity: rule.severity || "high", message: "CEL invariant failed" });
    }
  }

  const blockStatus = policy.defaults?.response?.blockStatusCode ?? 403;

  if (hits.length > 0) {
    const riskLevel = hits.some(h => h.severity === "critical") ? "critical" : "high";
    const riskScore = riskLevel === "critical" ? 90 : 60;
    return {
      version: "0.1",
      action: "BLOCK",
      statusCode: blockStatus,
      reason: "Policy violation",
      ruleHits: hits.map(h => ({ id: h.id, severity: h.severity })),
      risk: { score: riskScore, level: riskLevel },
      redactions: []
    };
  }

  return {
    version: "0.1",
    action: "ALLOW",
    statusCode: 200,
    reason: "Allowed",
    ruleHits: [],
    risk: { score: 0, level: "none" },
    redactions: []
  };
}

function main() {
  const policyPath = path.join(ROOT, "policy", "policy.yaml");
  const policy = yaml.parse(fs.readFileSync(policyPath, "utf8"));

  const ctxDir = path.join(ROOT, "fixtures", "contexts");
  const expDir = path.join(ROOT, "fixtures", "expected");

  const files = fs.readdirSync(ctxDir).filter(f => f.endsWith(".json")).sort();
  if (files.length === 0) {
    console.error("No context fixtures found.");
    process.exit(2);
  }

  let failed = 0;

  for (const f of files) {
    const ctxPath = path.join(ctxDir, f);
    const ctx = readJson(ctxPath);

    const expPath = path.join(expDir, `${ctx.id}.decision.json`);
    if (!fs.existsSync(expPath)) {
      console.error(`Missing expected decision for ${ctx.id}: ${expPath}`);
      failed++;
      continue;
    }
    const expected = readJson(expPath);
    const actual = evaluate(policy, ctx);

    if (!deepEqual(actual, expected)) {
      failed++;
      console.error(`\nFAIL: ${ctx.id}`);
      console.error(`Expected: ${JSON.stringify(expected, null, 2)}`);
      console.error(`Actual:   ${JSON.stringify(actual, null, 2)}`);
    } else {
      console.log(`PASS: ${ctx.id}`);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll golden tests passed.");
}

main();
