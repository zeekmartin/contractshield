
# Application-layer Guardrails

Date: 2026-01-14

## What is Application-layer Guardrails?

**Application-layer Guardrails** (also referred to as a **Policy Enforcement Layer**) is a security layer that operates
*inside* or *next to* an application runtime to enforce **declared application intent**.

Instead of guessing malicious intent through signatures or heuristics, Guardrails works by enforcing
**what the application is explicitly allowed to do**.

> If it is not explicitly expected, it is rejected.

---

## Why Guardrails exists

Modern attacks increasingly bypass:
- network firewalls
- classic WAFs
- perimeter-based security

Because these tools lack **application context**.

Guardrails adds:
- route awareness
- schema awareness
- identity & tenant awareness
- business invariant enforcement

At runtime.

---

## What Guardrails protects against

### Technical attacks
- SQL / template / command injection
- path traversal and file abuse
- malformed or ambiguous encodings
- SSRF and internal network access
- webhook spoofing and replay

### Application abuses
- mass assignment / over-posting
- IDOR and cross-tenant access
- workflow bypass
- quota and seat abuse
- logic-layer exploitation

### Operational risks
- accidental over-exposed endpoints
- schema drift
- security regressions
- undocumented side effects

---

## What Guardrails is not

Guardrails is **not**:
- a network firewall
- a signature-based WAF
- an IDS / SIEM
- an antivirus
- a replacement for authentication or authorization logic

It complements these controls by enforcing **runtime intent**.

---

## How it works (high level)

1. Developers declare expected behavior:
   - routes
   - schemas
   - limits
   - invariants
2. Requests are canonicalized
3. A `RequestContext` is built
4. Policies are evaluated
5. A deterministic decision is enforced:
   - ALLOW
   - BLOCK
   - MONITOR
   - CHALLENGE

---

## Security philosophy

- Positive security model (allowlist)
- Deterministic decisions
- Minimal data retention
- Privacy-first (hashes, features, redaction)
- Testable and versioned
- Defense in depth

---

## Evolution roadmap

### Phase 1 — Contract enforcement
- OpenAPI & JSON Schema validation
- CEL invariants
- Node & Java adapters
- Webhook protection
- Monitor / enforce modes

### Phase 2 — Behavioral guardrails
- workflow enforcement
- quotas and rate invariants
- egress allowlists
- policy packs

### Phase 3 — Sink-aware enforcement
- SQL, filesystem, HTTP egress, templates
- runtime blocking at dangerous sinks

### Phase 4 — Scale and portability
- WASM engine
- OPA/Rego backend
- policy UI and replay
- certified policy marketplace

---

## Licensing model

Guardrails follows an **open-core** model.

### Open-source (Apache 2.0)
- core policy engine (CEL)
- schemas and contracts
- Node & Java adapters
- baseline security packs
- documentation and examples

### Commercial
- sink-aware runtime agents
- advanced egress controls
- policy UI and dashboards
- certified policy packs
- enterprise support

---

## Positioning

> Security by declared intent, not by signatures.

Guardrails lets developers define what their application *is allowed to do* — and enforces it at runtime.
