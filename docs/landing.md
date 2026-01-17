# ContractShield
### Application-layer ContractShield for modern APIs

ContractShield enforces **declared application intent** at runtime.

Not signatures.
Not heuristics.
Not blacklists.

Contracts, invariants, and context — enforced where your code runs.

---

## What ContractShield is

ContractShield is an **application-layer Policy Enforcement Layer**.

It:
- runs inside your application boundary
- understands application context (identity, tenant, route intent)
- enforces deterministic policies
- produces explainable decisions

Decisions:
- **ALLOW**
- **BLOCK**
- **MONITOR**
- **CHALLENGE** (future)

---

## What ContractShield is not

- Not a WAF replacement
- Not regex filtering
- Not AI anomaly detection
- Not a SaaS proxy
- Not a "stop everything" promise

---

## Architecture (simple)

```
Client
  |
  v
Reverse Proxy / Gateway
  |
  v
PEP (middleware / filter)
  |
  v
ContractShield PDP (embedded or sidecar)
  |
  v
Application Logic
```

- runs after TLS
- no traffic redirection
- deterministic decisions
- no external dependency

---

## Why ContractShield exists

Most security tools do not know what your application is supposed to do.

ContractShield lets developers declare:
- valid endpoints
- valid payloads
- valid identity bindings
- valid behavior

Everything else is rejected.

---

## Example

```yaml
- id: license.activate.v1
  match: { method: POST, path: /api/license/activate }
  rules:
    - id: auth.required
      type: cel
      action: block
      expr: identity.authenticated == true

    - id: tenant.binding
      type: cel
      action: block
      expr: identity.tenant == request.body.tenantId
```

---

## Progressive enforcement

1. Start in `monitor`
2. Observe
3. Refine
4. Enforce selectively
5. Expand

Security without breaking prod.

---

## Open-core

**Apache 2.0 Core**
- PDP engine
- CEL policies
- Node / Java adapters
- Canonicalization
- Golden tests

**Commercial**
- Sink-aware RASP
- Egress control
- Certified packs
- Dashboards
- Support

---

## Roadmap

- v0.1 — core, adapters, golden tests
- v0.2 — full PDP + webhooks
- v0.3 — sink-aware enforcement

---

## Get started

- Read the docs
- Run quickstart
- Write policies
- Add golden tests
