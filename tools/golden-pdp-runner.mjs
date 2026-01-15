#!/usr/bin/env node
/**
 * Golden tests runner wired to the real PDP (v0.1) for THIS repo layout.
 *
 * Layout assumptions:
 * - Context fixtures:   fixtures/contexts/*.json
 * - Expected decisions: fixtures/expected/<ctx.id>.decision.json
 * - Policy file:        policy/policy.example.yaml (default)
 *
 * Env:
 * - POLICY_FILE: override policy path
 * - STRIPE_WEBHOOK_SECRET: enable real Stripe signature verification
 *
 * Notes:
 * - Fixtures can force deterministic Stripe outcomes:
 *   ctx.webhook.signatureValid (boolean)
 *   ctx.webhook.replayed (boolean)
 */
import fs from "fs";
import path from "path";
import yaml from "yaml";
import { evaluate, MemoryReplayStore } from "../packages/pdp/dist/index.js";
import { fileSchemaLoader } from "./schemaLoader.mjs";

const ROOT = process.cwd();

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function pick(d) {
  return {
    version: d.version,
    action: d.action,
    statusCode: d.statusCode,
    risk: d.risk,
    ruleHits: d.ruleHits ?? [],
    reason: d.reason,
    metadata: d.metadata,
    redactions: d.redactions ?? [],
  };
}

function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort(), 2);
}

function diff(expected, actual) {
  const e = pick(expected);
  const a = pick(actual);
  return [
    "Expected:",
    JSON.stringify(e, null, 2),
    "Actual:",
    JSON.stringify(a, null, 2),
  ].join("\n");
}

function makeOpts() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  return {
    schemaLoader: fileSchemaLoader(ROOT),
    replayStore: new MemoryReplayStore(),
    getSecret: ({ provider }) => (provider === "stripe" ? secret : undefined),
  };
}

async function main() {
  const policyFile = process.env.POLICY_FILE ?? "policy/policy.example.yaml";
  const policyPath = path.join(ROOT, policyFile);
  if (!fs.existsSync(policyPath)) {
    console.error(`Missing policy file: ${policyPath}`);
    process.exit(2);
  }
  const policy = yaml.parse(fs.readFileSync(policyPath, "utf8"));

  const ctxDir = path.join(ROOT, "fixtures", "contexts");
  const expDir = path.join(ROOT, "fixtures", "expected");

  const ctxFiles = fs.readdirSync(ctxDir).filter(f => f.endsWith(".json")).sort();
  if (ctxFiles.length === 0) {
    console.error(`No fixtures found in ${ctxDir}`);
    process.exit(2);
  }

  // Ensure PDP is built (simple check)
  const pdpDist = path.join(ROOT, "packages", "pdp", "dist", "index.js");
  if (!fs.existsSync(pdpDist)) {
    console.error("PDP is not built. Run: (cd packages/pdp && npm run build)");
    process.exit(2);
  }

  const opts = makeOpts();
  let failed = 0;

  for (const file of ctxFiles) {
    const ctx = readJson(path.join(ctxDir, file));
    if (!ctx.id) {
      console.error(`Fixture missing ctx.id: ${file}`);
      failed++;
      continue;
    }
    const expPath = path.join(expDir, `${ctx.id}.decision.json`);
    if (!fs.existsSync(expPath)) {
      console.error(`Missing expected decision: ${expPath}`);
      failed++;
      continue;
    }
    const expected = readJson(expPath);
    const actual = await evaluate(policy, ctx, opts);

    if (JSON.stringify(pick(actual)) !== JSON.stringify(pick(expected))) {
      failed++;
      console.error(`\nFAIL: ${ctx.id}`);
      console.error(diff(expected, actual));
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

main().catch(err => {
  console.error(err);
  process.exit(1);
});
