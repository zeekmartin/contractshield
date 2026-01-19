#!/usr/bin/env node
/**
 * Golden PDP Runner - Tests PDP against fixtures-v2/
 *
 * Usage:
 *   node tools/golden-pdp-runner.mjs
 *
 * Environment:
 *   POLICY_FILE - Path to policy file (default: policy/policy.example.yaml)
 *   GOLDEN_MODE - enforce or monitor (default: enforce)
 *   STRIPE_WEBHOOK_SECRET - Secret for Stripe webhook tests
 */

import fs from "fs";
import path from "path";
import yaml from "yaml";
import { createRequire } from "module";
import { fileSchemaLoader } from "./schemaLoader.mjs";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const FIXTURES_DIR = path.join(ROOT, "fixtures-v2");

// ============== Template Expansion (from loader.mjs) ==============

function parseYamlFile(filePath) {
  return yaml.parse(fs.readFileSync(filePath, "utf8"));
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] === null) {
      result[key] = null;
    } else if (Array.isArray(source[key])) {
      result[key] = [...source[key]];
    } else if (typeof source[key] === "object" && typeof result[key] === "object" && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadTemplate(name) {
  const templatePath = path.join(FIXTURES_DIR, "templates", `${name}.yaml`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${name}`);
  }
  return parseYamlFile(templatePath);
}

function expandFixture(fixturePath) {
  const fixture = parseYamlFile(fixturePath);
  const templateName = fixture._template || "api-request";
  delete fixture._template;
  const template = loadTemplate(templateName);
  return deepMerge(template, fixture);
}

// ============== Utility Functions ==============

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

// ============== Fixture Discovery ==============

function findFixtures(dir, files = []) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      findFixtures(fullPath, files);
    } else if (item.name.endsWith(".yaml")) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveExpectedPath(ctxPath) {
  // contexts/nominal/api-basic.yaml -> expected/nominal/api-basic.yaml
  const relative = path.relative(path.join(FIXTURES_DIR, "contexts"), ctxPath);
  return path.join(FIXTURES_DIR, "expected", relative);
}

// ============== Main ==============

async function main() {
  const pdpDist = path.join(ROOT, "packages", "pdp", "dist", "index.js");
  if (!fs.existsSync(pdpDist)) {
    console.error("PDP is not built. Run: cd packages/pdp && npm install && npm run build");
    process.exit(2);
  }

  const { evaluate, MemoryReplayStore } = require("../packages/pdp/dist/index.js");

  const policy = loadPolicy();

  const ctxDir = path.join(FIXTURES_DIR, "contexts");
  if (!fs.existsSync(ctxDir)) {
    console.error(`No fixtures found in ${ctxDir}`);
    process.exit(2);
  }

  const ctxFiles = findFixtures(ctxDir).sort();
  if (ctxFiles.length === 0) {
    console.error(`No YAML fixtures found in ${ctxDir}`);
    process.exit(2);
  }

  const opts = makeOpts(MemoryReplayStore);
  let passed = 0;
  let failed = 0;

  for (const ctxPath of ctxFiles) {
    const relativePath = path.relative(FIXTURES_DIR, ctxPath);
    const ctx = expandFixture(ctxPath);

    if (!ctx.id) {
      console.error(`SKIP: ${relativePath} - missing ctx.id`);
      continue;
    }

    const expPath = resolveExpectedPath(ctxPath);
    if (!fs.existsSync(expPath)) {
      console.error(`SKIP: ${relativePath} - missing expected: ${path.relative(FIXTURES_DIR, expPath)}`);
      failed++;
      continue;
    }

    const expected = expandFixture(expPath);
    const actual = await evaluate(policy, ctx, opts);

    if (JSON.stringify(pick(actual)) !== JSON.stringify(pick(expected))) {
      failed++;
      console.error(`FAIL: ${ctx.id}`);
      console.error(diff(expected, actual));
    } else {
      passed++;
      console.log(`PASS: ${ctx.id}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }

  console.log("\nAll golden tests passed.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
