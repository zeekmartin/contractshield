# Threat Model — Application-layer ContractShield

Date: 2026-01-15

This document defines the **explicit threat model** addressed by Application-layer ContractShield.
It clarifies what is **in scope**, **out of scope**, and **how threats map to policies**.

---

## Purpose of this threat model

- Make security guarantees explicit
- Avoid false assumptions
- Provide a shared language between developers and security teams
- Enable deterministic testing and verification

ContractShield does **not** attempt to detect attackers.
It enforces **application intent** and rejects deviations.

---

## Security boundary

ContractShield operates:
- **After TLS termination**
- **Before application business logic**
- **With access to application context** (routes, schemas, identity)

It assumes:
- Authentication has already occurred (or is explicitly required by policy)
- The application controls its own API surface

---

## In-scope threat categories

### 1. Injection attacks (Intent violation)

**Threat**
Untrusted input is crafted to alter execution beyond declared intent.

**Examples**
- SQL injection via valid JSON fields
- Template injection in rendering inputs
- Expression injection
- Command injection via indirect parameters

**ContractShield mitigation**
- Strict schema validation
- Reject unknown fields
- Canonicalization
- CEL invariants binding inputs to context

**Policy examples**
- `rejectUnknownFields = true`
- `request.body.json.sample.field matches expected type`
- `identity.tenant == payload.tenantId`

---

### 2. Broken object level authorization (IDOR)

**Threat**
Accessing or modifying objects belonging to another tenant or user.

**Examples**
- Changing `tenantId` in payload
- Guessing resource identifiers
- Cross-organization access

**ContractShield mitigation**
- Identity-to-data binding via invariants
- Route-specific policies
- Explicit tenant scoping

**Policy examples**
- `identity.tenant == request.body.json.sample.tenantId`
- `resource.owner == identity.subject`

---

### 3. Mass assignment / over-posting

**Threat**
Supplying extra fields to influence internal state.

**Examples**
- `isAdmin=true`
- Hidden flags
- Future fields accepted silently

**ContractShield mitigation**
- Reject unknown fields
- Contract-first enforcement

**Policy examples**
- `rejectUnknownFields = true`

---

### 4. Workflow abuse

**Threat**
Calling valid endpoints in an invalid order.

**Examples**
- Activate without purchase
- Reuse expired tokens
- Double submission

**ContractShield mitigation**
- Explicit workflow rules (phase 2+)
- Counters and state tracking
- Idempotency enforcement

**Policy examples**
- `activation requires prior purchase`
- `one activation per device`

---

### 5. Server-side request forgery (SSRF)

**Threat**
Application is abused to perform unintended outbound requests.

**Examples**
- Cloud metadata access
- Internal network scanning
- Data exfiltration via URLs

**ContractShield mitigation**
- Declared egress intent
- URL field classification
- Destination allowlists
- Private IP blocking

**Policy examples**
- `urlField allowedDomains = [...]`
- `block private IP ranges`

---

### 6. Path traversal & file abuse

**Threat**
Accessing unintended filesystem locations.

**Examples**
- `../` traversal
- Encoded traversal
- Arbitrary file reads

**ContractShield mitigation**
- Canonicalized paths
- Declared path usage
- Reject ambiguous encodings

---

### 7. Webhook spoofing & replay

**Threat**
Forged or replayed webhook events.

**Examples**
- Fake Stripe events
- Replay of old events
- Payload tampering

**ContractShield mitigation**
- Raw body signature verification
- Timestamp tolerance
- Idempotency keys

**Policy examples**
- `webhook.signature.required`
- `idempotency.store = enabled`

---

### 8. Abuse & resource exhaustion

**Threat**
Valid requests used at abusive rates or volumes.

**Examples**
- Brute force
- API scraping
- Oversized payloads

**ContractShield mitigation**
- Size limits
- Rate limits
- Progressive enforcement

---

## Out-of-scope threats (by design)

ContractShield does **not** address:

- Network-level attacks (DDoS, SYN floods)
- Malware detection
- Client-side attacks (XSS in browsers)
- Authentication weaknesses
- Social engineering
- Zero-day vulnerabilities in runtimes
- Supply-chain attacks

These require other controls.

---

## Mapping threats to policy controls

| Threat | Control |
|------|-------|
| Injection | Schemas, invariants, canonicalization |
| IDOR | Identity binding |
| Mass assignment | Reject unknown fields |
| Workflow abuse | State & sequence rules |
| SSRF | Egress allowlists |
| Traversal | Path normalization |
| Webhook spoofing | Signature + idempotency |
| Abuse | Limits & rate rules |

---

## Verification & testing

Every mitigation must be:
- expressible as a policy
- testable via golden tests
- replayable in CI

Threat coverage is validated by:
- policy fixtures
- expected decisions
- regression prevention

---

## Key statement

> ContractShield does not block attackers.
> It blocks **behavior that was never declared as acceptable**.
