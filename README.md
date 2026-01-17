
# ContractShield

**Security by declared intent — not by signatures.**

ContractShield is a developer-first security framework that enforces
*what your application is supposed to do* at runtime.

Anything else is rejected.

---

## Why ContractShield?

Traditional security tools operate without application context.

ContractShield understands:
- routes and schemas
- identity and tenants
- business invariants
- workflows and side effects

This allows it to block attacks and abuses that pass through firewalls and WAFs.

---

## What it protects

- Injection attacks (SQL, command, NoSQL)
- SSRF and exfiltration
- Path traversal
- Mass assignment
- Cross-tenant access
- Workflow abuse
- Webhook spoofing
- Security regressions

---

## How it works

1. Declare expected behavior (OpenAPI, schemas, invariants)
2. ContractShield enforces it at runtime
3. Deterministic allow / block decisions
4. Fully testable in CI

---

## Quick Start

```typescript
import express from "express";
import { contractshield } from "@contractshield/pep-express";

const app = express();
app.use(express.json());
app.use(contractshield({ policy: "./policy.yaml" }));

app.post("/api/users", (req, res) => {
  res.json({ id: 1, ...req.body });
});

app.listen(3000);
```

---

## Key features

- Positive security model
- Contract-first enforcement
- CEL-first policy language
- Node.js, Fastify, and Java support
- Monitor and enforce modes
- Policy-as-code
- Privacy-first telemetry
- Sink-aware RASP (Pro)

---

## Packages

| Package | Description |
|---------|-------------|
| `@contractshield/pdp` | Policy Decision Point (core engine) |
| `@contractshield/pep-express` | Express middleware |
| `@contractshield/pep-fastify` | Fastify plugin |
| `@contractshield/sidecar` | Sidecar server (any language) |
| `@contractshield/client` | Client SDK with caching |
| `@contractshield/sink-rasp` | Runtime protection (Pro) |

---

## Licensing

ContractShield is **open-core**.

- Core engine and adapters: Apache 2.0
- Advanced runtime protections (RASP): Commercial

See [docs/licensing.md](docs/licensing.md) for details.

---

## Documentation

- [Getting Started](docs/getting-started.md)
- [Policy Language](docs/policy-language.md)
- [Vulnerability Checks](docs/vulnerability-checks.md)
- [Webhooks](docs/webhooks.md)
- [Deployment](docs/deployment.md)
- [Sink-aware RASP](docs/sink-rasp.md) (Pro)

---

## Status

✅ Production ready (v1.1)

---

> Security should be explicit, deterministic, and owned by developers.
