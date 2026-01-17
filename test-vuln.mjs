/**
 * Test vulnerability checks locally
 * Run: node test-vuln.mjs
 */

import { evaluate, checkVulnerabilities, mergeVulnerabilityConfig } from "./packages/pdp/dist/index.js";

// Test policy with vulnerability checks enabled
const policy = {
  policyVersion: "0.1",
  defaults: {
    vulnerabilityChecks: {
      prototypePollution: true,
      pathTraversal: true,
      ssrfInternal: true,
      nosqlInjection: true,  // Enable for test
      commandInjection: true, // Enable for test
    },
  },
  routes: [
    {
      id: "test.route",
      match: { method: "POST", path: "/api/test" },
    },
  ],
};

// Base context
function makeContext(body) {
  return {
    version: "0.1",
    id: "test-" + Date.now(),
    timestamp: new Date().toISOString(),
    request: {
      method: "POST",
      path: "/api/test",
      headers: { "content-type": "application/json" },
      contentType: "application/json",
      body: {
        present: true,
        sizeBytes: JSON.stringify(body).length,
        json: { redacted: false, sample: body },
      },
    },
    identity: { authenticated: true, tenant: "t-1" },
    client: { ip: "1.2.3.4", userAgent: "test" },
    runtime: { language: "node", service: "test", env: "test" },
  };
}

console.log("🛡️  Testing Guardrails Vulnerability Checks\n");
console.log("=".repeat(60));

// Test cases
const tests = [
  {
    name: "✅ Clean request",
    body: { username: "john", email: "john@example.com" },
    expectBlock: false,
  },
  {
    name: "🚫 Prototype Pollution (__proto__)",
    // Use JSON.parse to preserve __proto__ as actual key
    body: JSON.parse('{"user": {"__proto__": {"isAdmin": true}}}'),
    expectBlock: true,
  },
  {
    name: "🚫 Prototype Pollution (constructor)",
    body: { user: { constructor: { prototype: {} } } },
    expectBlock: true,
  },
  {
    name: "🚫 Path Traversal (../)",
    body: { filename: "../../../etc/passwd" },
    expectBlock: true,
  },
  {
    name: "🚫 Path Traversal (encoded)",
    body: { path: "%2e%2e%2fetc%2fpasswd" },
    expectBlock: true,
  },
  {
    name: "🚫 SSRF (localhost)",
    body: { url: "http://localhost:8080/admin" },
    expectBlock: true,
  },
  {
    name: "🚫 SSRF (metadata)",
    body: { callback: "http://169.254.169.254/latest/meta-data/" },
    expectBlock: true,
  },
  {
    name: "🚫 SSRF (private IP)",
    body: { webhook: "http://192.168.1.1/internal" },
    expectBlock: true,
  },
  {
    name: "🚫 NoSQL Injection ($gt)",
    body: { password: { $gt: "" } },
    expectBlock: true,
  },
  {
    name: "🚫 NoSQL Injection ($where)",
    body: { query: { $where: "this.isAdmin" } },
    expectBlock: true,
  },
  {
    name: "🚫 Command Injection (;)",
    body: { cmd: "ls; rm -rf /" },
    expectBlock: true,
  },
  {
    name: "🚫 Command Injection ($())",
    body: { input: "$(cat /etc/passwd)" },
    expectBlock: true,
  },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  const ctx = makeContext(test.body);
  const decision = await evaluate(policy, ctx);

  const blocked = decision.action === "BLOCK";
  const success = blocked === test.expectBlock;

  if (success) {
    passed++;
    console.log(`\n${test.name}`);
    console.log(`  Action: ${decision.action}`);
    if (decision.ruleHits?.length) {
      console.log(`  Hits: ${decision.ruleHits.map(h => h.id).join(", ")}`);
    }
  } else {
    failed++;
    console.log(`\n❌ FAILED: ${test.name}`);
    console.log(`  Expected: ${test.expectBlock ? "BLOCK" : "ALLOW"}`);
    console.log(`  Got: ${decision.action}`);
    console.log(`  Body: ${JSON.stringify(test.body)}`);
  }
}

console.log("\n" + "=".repeat(60));
console.log(`\n📊 Results: ${passed}/${tests.length} passed`);

if (failed > 0) {
  console.log(`\n⚠️  ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log("\n✅ All tests passed!");
}
