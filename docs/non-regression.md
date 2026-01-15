# Non-regression & Testing

Date: 2026-01-14

This document defines how to prevent security regressions and ensure policy decisions remain stable across versions.

## Testing layers
1. **Unit tests (PDP)**: canonicalization, rule evaluation, CEL expression evaluation.
2. **Adapter tests (PEP)**: request → RequestContext mapping, enforcement correctness.
3. **Contract tests**: OpenAPI/JSON schema validation for each endpoint.
4. **Golden decision tests**: replay recorded contexts against a pinned policy version.
5. **Integration tests**: run app with PEP enabled in monitor and enforce modes.

## Policy-as-code workflow (GitOps)
- Policies live in Git with semantic versioning.
- Every policy change must include:
  - at least one "must allow" example
  - at least one "must block" example (if tightening security)
- CI runs:
  - schema validation
  - CEL compile/evaluate tests
  - golden tests (context fixtures)

## Golden tests format
Store test fixtures as JSON:
- `fixtures/contexts/*.json` (RequestContext)
- `fixtures/expected/*.json` (Decision)

Run:
- `evaluate(context) == expected` (ignoring timestamps/ids)

## Modes and rollout
- **monitor**: log decisions, do not block.
- **enforce**: block per decision.
- **progressive**: enforce only for selected routes/tenants.
- **kill switch**: env var disables enforcement to monitor-only.

## Regression signals
Track:
- number of blocks by rule id
- false positive reports
- latency impact per route
- top blocked routes by tenant

## Compatibility guarantees
- `RequestContext` schema is backward compatible (additive).
- `Decision` schema is backward compatible (additive).
- Policy language versioned (e.g., `policyVersion: 0.1`).

## Security review gate
Any change touching:
- canonicalization
- auth context
- webhook verification
- egress rules
must trigger a security review using `prompts/security-review.prompt.md`.

---

## Golden tests wired to the real PDP (v0.1)

In this repo, golden tests are executed against the **real PDP** (`packages/pdp`) to prevent regressions.

### Fixture locations (root)
- `fixtures/contexts/*.json` — `RequestContext`
- `fixtures/expected/*.decision.json` — expected `Decision` (schema v0.1)

### Runner
- `tools/golden-pdp-runner.mjs`

### How it works
For each context fixture:
1. load a policy file (default: `policy/policy.example.yaml`)
2. call `@guardrails/pdp.evaluate(policy, ctx, opts)`
3. compare to `fixtures/expected/<ctx.id>.decision.json`

### Determinism rules
- fixtures may force Stripe outcomes for CI stability:
  - `ctx.webhook.signatureValid: boolean`
  - `ctx.webhook.replayed: boolean`

### CI expectation
A PR that changes:
- policy packs (`packs/*`)
- PDP code (`packages/pdp/*`)
- schemas (`schemas/*`)
must run golden tests in CI.

