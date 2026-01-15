
# Application-layer Guardrails

**Security by declared intent — not by signatures.**

Application-layer Guardrails is a developer-first security framework that enforces
*what your application is supposed to do* at runtime.

Anything else is rejected.

---

## Why Guardrails?

Traditional security tools operate without application context.

Guardrails understands:
- routes and schemas
- identity and tenants
- business invariants
- workflows and side effects

This allows it to block attacks and abuses that pass through firewalls and WAFs.

---

## What it protects

- Injection attacks
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
2. Guardrails enforces it at runtime
3. Deterministic allow / block decisions
4. Fully testable in CI

---

## Key features

- Positive security model
- Contract-first enforcement
- CEL-first policy language
- Node.js and Java support
- Monitor and enforce modes
- Policy-as-code
- Privacy-first telemetry

---

## Licensing

Guardrails is **open-core**.

- Core engine and adapters: Apache 2.0
- Advanced runtime protections and tooling: Commercial

---

## Status

🚧 Early design & specification phase  
Contributions, feedback, and discussion welcome.

---

> Security should be explicit, deterministic, and owned by developers.
