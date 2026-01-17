#!/usr/bin/env node
import fs from "fs";
import path from "path";
import yaml from "yaml";
import { createRequire } from "module";
import { fileSchemaLoader } from "./schemaLoader.mjs";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function readYaml(rel) {
  return yaml.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

function pick(d) {
  return {
    version: d.version,
    action: d.action,
    statusCode: d.statusCode,
    risk: d.risk,
    ruleHits: d.ruleHits ?? [],
    reason: d.reason,
    redactions: d.redactions ?? []
  };
}

function diff(expected, actual) {
  const e = pick(expected);
  const a = pick(actual);
  return ["Expected:", JSON.stringify(e, null, 2), "Actual:", JSON.stringify(a, null, 2)].join("\n");
}

function normalizeMode(policy, goldenMode) {
  policy.defaults = policy.defaults ?? {};
  policy.defaults.mode = goldenMode;
  for (const r of policy.routes ?? []) {
    if (!r.mode) r.mode = goldenMode;
  }
}

function mergePolicy(basePolicy, packPolicy) {
  const out = { ...basePolicy };
  out.defaults = out.defaults ?? {};
  if (packPolicy.defaults) {
    out.defaults = { ...packPolicy.defaults, ...out.defaults };
  }

  const byId = new Map();
  for (const r of out.routes ?? []) byId.set(r.id, { ...r });

  for (const pr of packPolicy.routes ?? []) {
    const existing = byId.get(pr.id);
    if (!existing) byId.set(pr.id, { ...pr });
    else byId.set(pr.id, { ...existing, ...pr, match: pr.match ?? existing.match });
  }

  out.routes = Array.from(byId.values());
  return out;
}

function loadPolicy() {
  const policyFile = process.env.POLICY_FILE ?? "policy/policy.example.yaml";
  const policyPath = path.join(ROOT, policyFile);
  if (!fs.existsSync(policyPath)) {
    console.error(`Missing base policy file: ${policyPath}`);
    process.exit(2);
  }
  let policy = yaml.parse(fs.readFileSync(policyPath, "utf8"));

  const stripePackPath = "packs/stripe-webhook/policy.yaml";
  if (exists(stripePackPath)) {
    const stripePack = readYaml(stripePackPath);
    policy = mergePolicy(policy, stripePack);
  }

  const goldenMode = (process.env.GOLDEN_MODE ?? "enforce").toLowerCase();
  if (goldenMode !== "enforce" && goldenMode !== "monitor") {
    console.error(`Invalid GOLDEN_MODE: ${process.env.GOLDEN_MODE}. Use "enforce" or "monitor".`);
    process.exit(2);
  }
  normalizeMode(policy, goldenMode);
  return policy;
}

function makeOpts(MemoryReplayStore) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  return {
    schemaLoader: fileSchemaLoader(ROOT),
    replayStore: new MemoryReplayStore(),
    getSecret: ({ provider }) => (provider === "stripe" ? secret : undefined)
  };
}

function resolveExpectedPath(ctxId) {
  const expDir = path.join(ROOT, "fixtures", "expected");
  const primary = path.join(expDir, `${ctxId}.decision.json`);
  if (fs.existsSync(primary)) return primary;

  const fallbackId = ctxId.replace(/-\d+$/, "");
  const fallback = path.join(expDir, `${fallbackId}.decision.json`);
  if (fallbackId !== ctxId && fs.existsSync(fallback)) return fallback;

  return primary;
}

async function main() {
  const pdpDist = path.join(ROOT, "packages", "pdp", "dist", "index.js");
  if (!fs.existsSync(pdpDist)) {
    console.error("PDP is not built. Run: cd packages/pdp && npm install && npm run build");
    process.exit(2);
  }

  const { evaluate, MemoryReplayStore } = require("../packages/pdp/dist/index.js");

  const policy = loadPolicy();

  const ctxDir = path.join(ROOT, "fixtures", "contexts");
  const ctxFiles = fs.readdirSync(ctxDir).filter(f => f.endsWith(".json")).sort();
  if (ctxFiles.length === 0) {
    console.error(`No fixtures found in ${ctxDir}`);
    process.exit(2);
  }

  const opts = makeOpts(MemoryReplayStore);
  let failed = 0;

  for (const file of ctxFiles) {
    const ctx = readJson(path.join(ctxDir, file));
    if (!ctx.id) {
      console.error(`Fixture missing ctx.id: ${file}`);
      failed++;
      continue;
    }

    const expPath = resolveExpectedPath(ctx.id);
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
