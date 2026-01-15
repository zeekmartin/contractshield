import fs from "fs";
import path from "path";

function evaluate(ctx) {
  const hits = [];
  if (!ctx.identity.authenticated) {
    hits.push({ id: "auth.required", severity: "high" });
  }
  if (ctx.identity.tenant !== ctx.request.body.tenantId) {
    hits.push({ id: "tenant.binding", severity: "critical" });
  }
  return hits.length > 0
    ? { action: "BLOCK", ruleHits: hits }
    : { action: "ALLOW", ruleHits: [] };
}

function run() {
  const ctxDir = "./golden-tests/fixtures/contexts";
  const expDir = "./golden-tests/fixtures/expected";

  let failed = false;

  for (const file of fs.readdirSync(ctxDir)) {
    const name = path.basename(file, ".json");
    const ctx = JSON.parse(fs.readFileSync(path.join(ctxDir, file)));
    const expected = JSON.parse(
      fs.readFileSync(path.join(expDir, name + ".json"))
    );

    const actual = evaluate(ctx);

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      console.error("❌ FAIL:", name);
      console.error("expected:", expected);
      console.error("actual:", actual);
      failed = true;
    } else {
      console.log("✅ PASS:", name);
    }
  }

  if (failed) process.exit(1);
}

run();
