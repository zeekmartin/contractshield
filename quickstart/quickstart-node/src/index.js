import express from "express";
import fs from "fs";
import yaml from "yaml";

const app = express();
app.use(express.json());

// --- Minimal PEP (mock PDP inline for demo) ---
const policy = yaml.parse(fs.readFileSync("./policy/policy.yaml", "utf8"));

function evaluate(ctx) {
  const hits = [];
  // auth.required
  if (!ctx.identity.authenticated) {
    hits.push({ id: "auth.required", severity: "high" });
  }
  // tenant.binding
  if (ctx.identity.tenant !== ctx.body?.tenantId) {
    hits.push({ id: "tenant.binding", severity: "critical" });
  }
  if (hits.length > 0) {
    return { action: "BLOCK", ruleHits: hits };
  }
  return { action: "ALLOW", ruleHits: [] };
}

app.post("/api/license/activate", (req, res) => {
  const ctx = {
    identity: {
      authenticated: true,
      tenant: "tenant-1",
    },
    body: req.body,
  };

  const decision = evaluate(ctx);

  if (decision.action === "BLOCK") {
    return res.status(403).json(decision);
  }
  res.json({ status: "activated" });
});

app.listen(3000, () => {
  console.log("Node quickstart listening on http://localhost:3000");
});
