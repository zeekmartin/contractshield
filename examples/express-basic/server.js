/**
 * Express Basic Example - ContractShield
 *
 * Demonstrates:
 * - Policy enforcement middleware
 * - Auth required rule
 * - Tenant binding rule
 * - Decision header
 *
 * Run: npm start
 * Test:
 *   curl http://localhost:3000/health
 *   curl -X POST http://localhost:3000/api/license/activate \
 *     -H "Content-Type: application/json" \
 *     -d '{"tenantId": "t-1", "licenseKey": "XXX"}'
 */
import express from "express";
import { evaluate } from "@cshield/pdp";
import fs from "fs";
const app = express();
app.use(express.json());
// Load policy
const policy = JSON.parse(fs.readFileSync(new URL("./policy.json", import.meta.url), "utf8"));
// Fake auth middleware (simulates JWT/session)
app.use((req, _res, next) => {
    const authHeader = req.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
        // Simulate decoded JWT
        req.user = {
            authenticated: true,
            sub: "user-123",
            tenant: "t-1",
            scopes: ["license:activate"],
        };
    }
    next();
});
// ContractShield middleware (inline for demo, use @contractshield/pep-express in real apps)
app.use(async (req, res, next) => {
    const ctx = {
        version: "0.1",
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        request: {
            method: req.method,
            path: req.path,
            headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)])),
            contentType: req.get("content-type") || "",
            body: req.body
                ? {
                    present: true,
                    sizeBytes: JSON.stringify(req.body).length,
                    json: { redacted: false, sample: req.body },
                }
                : { present: false, sizeBytes: 0 },
        },
        identity: req.user || { authenticated: false },
        client: {
            ip: req.ip || "",
            userAgent: req.get("user-agent") || "",
        },
        runtime: {
            language: "node",
            service: "express-basic-example",
            env: "development",
        },
    };
    const decision = await evaluate(policy, ctx);
    // Set decision header
    res.setHeader("X-ContractShield-Decision", decision.action);
    // Log
    const emoji = decision.action === "ALLOW" ? "✓" : decision.action === "BLOCK" ? "✗" : "⚠";
    console.log(`[contractshield] ${emoji} ${decision.action} ${req.method} ${req.path}`, decision.ruleHits?.length ? `(${decision.ruleHits.map((h) => h.id).join(", ")})` : "");
    // Enforce
    if (decision.action === "BLOCK") {
        return res.status(decision.statusCode).json({
            error: "Request blocked by policy",
            reason: decision.reason,
            ruleHits: decision.ruleHits?.map((h) => h.id),
        });
    }
    // Attach decision to request for downstream use
    req.contractshield = { decision, context: ctx };
    next();
});
// Routes
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.post("/api/license/activate", (req, res) => {
    const { tenantId, licenseKey } = req.body;
    res.json({
        status: "activated",
        tenantId,
        licenseKey: licenseKey?.slice(0, 4) + "****",
    });
});
// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🛡️  Express Basic Example running on http://localhost:${PORT}`);
    console.log("");
    console.log("Try these requests:");
    console.log("");
    console.log("  # Health check (allowed)");
    console.log(`  curl http://localhost:${PORT}/health`);
    console.log("");
    console.log("  # No auth (blocked)");
    console.log(`  curl -X POST http://localhost:${PORT}/api/license/activate \\`);
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -d \'{"tenantId": "t-1", "licenseKey": "XXX"}\'');
    console.log("");
    console.log("  # With auth, correct tenant (allowed)");
    console.log(`  curl -X POST http://localhost:${PORT}/api/license/activate \\`);
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -H "Authorization: Bearer fake-token" \\');
    console.log('    -d \'{"tenantId": "t-1", "licenseKey": "XXX"}\'');
    console.log("");
    console.log("  # With auth, wrong tenant (blocked - IDOR attempt)");
    console.log(`  curl -X POST http://localhost:${PORT}/api/license/activate \\`);
    console.log('    -H "Content-Type: application/json" \\');
    console.log('    -H "Authorization: Bearer fake-token" \\');
    console.log('    -d \'{"tenantId": "t-2", "licenseKey": "XXX"}\'');
});
