# Getting started (5 minutes)

Date: 2026-01-15

This is the fastest way to understand **Application-layer ContractShield**.

## What you get
ContractShield enforces **declared application intent** at runtime:
- contracts (OpenAPI / JSON Schema)
- limits (size, depth, rate)
- context rules (auth, scopes, tenant binding)
- behavior rules (CEL invariants)

It returns deterministic decisions: **ALLOW / BLOCK / MONITOR / CHALLENGE**.

## 1) Mental model
- **PEP** (Policy Enforcement Point): middleware/filter in your service
- **PDP** (Policy Decision Point): policy engine (embedded or sidecar)
- **Policy**: route intent + rules + invariants

## 2) Minimal flow
1. PEP canonicalizes the request
2. PEP builds a `RequestContext`
3. PEP asks PDP to evaluate
4. PEP enforces the decision (or logs only in monitor mode)

## 3) Hello policy (concept)
```yaml
policyVersion: "0.1"
defaults:
  mode: monitor   # start here, then enforce
routes:
  - id: license.activate.v1
    match: { method: POST, path: /api/license/activate }
    contract:
      requestSchemaRef: ./schemas/license.activate.request.json
      rejectUnknownFields: true
    rules:
      - id: auth.required
        type: cel
        action: block
        config:
          expr: identity.authenticated == true

      - id: tenant.binding
        type: cel
        action: block
        config:
          expr: identity.tenant == request.body.tenantId
```

## 4) Recommended rollout
1. **Monitor** for a few days (log, no blocking)
2. Fix policy false positives (usually schemas/unknown fields)
3. **Enforce** only on 1–2 routes
4. Expand gradually (progressive rollout)

## 5) What to read next
- `docs/policy-language.md` — CEL basics and pitfalls
- `docs/policy-authoring.md` — packs, overrides, rule IDs, precedence
- `docs/security-boundary.md` — what ContractShield can/can't see
