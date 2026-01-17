# Policy authoring guide

Date: 2026-01-15

How to author ContractShield policies:
- structure of a policy
- route matching
- packs and overrides
- rule ordering & precedence
- rule IDs and naming

---

## Policy file structure (v0.1)

Minimum:
- `policyVersion`
- `defaults`
- `routes[]`

Example:
```yaml
policyVersion: "0.1"
defaults:
  mode: monitor
  response:
    blockStatusCode: 403
  limits:
    maxBodyBytes: 1048576

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
        severity: high
        config:
          expr: identity.authenticated == true
```

---

## Route matching

Recommended for v0.1:
- exact path match
- stable `routes[].id` (telemetry key)

Later:
- templated matches (e.g., `/api/users/{id}`) and stable route IDs.

---

## Packs

A **pack** is reusable policy content for a common pattern.

Suggested structure:
```
packs/<name>/
  README.md
  policy.yaml
  schemas/        # optional
  fixtures/       # golden tests
```

Apply a pack by:
- merging its rules into your route(s)
- overriding limits to fit your service
- running the pack fixtures in CI

---

## Overrides

Two levels:
1) **Defaults** (global)
2) **Route-specific** config and rules

Override by changing config/action/severity — not by renaming rule IDs.

---

## Rule ordering and precedence

Recommended evaluation order:
1. Canonicalization (adapter)
2. Contract validation (OpenAPI/JSON Schema)
3. Limits (body, json depth, arrays)
4. Webhook checks (signature, timestamp, idempotency)
5. CEL invariants
6. Risk aggregation & decision
7. Mode mapping:
   - `monitor`: BLOCK → MONITOR
   - `enforce`: BLOCK stays BLOCK

If multiple rules hit:
- strongest action wins: BLOCK > CHALLENGE > MONITOR > ALLOW
- all hits are returned in `ruleHits` for explainability

---

## Rule IDs

Rule IDs must be:
- stable
- unique
- readable

Format:
`<category>.<sub>.<name>`

Examples:
- `auth.required`
- `auth.scope.license_activate`
- `tenant.binding`
- `contract.reject_unknown_fields`
- `limit.body.max`
- `webhook.stripe.signature`
- `rate.ip.burst`

---

## Review checklist

- Starts in monitor mode?
- Unknown fields rejected where appropriate?
- Defensive CEL checks?
- No secrets in logs?
- Fixtures added/updated?
- Rule IDs stable?
