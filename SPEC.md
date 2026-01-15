# Spec v0.1 — RequestContext, Decision, Policy (CEL-first)

Date: 2026-01-14

This folder contains the **minimal stable contracts** to implement:
- PDP sidecar `POST /evaluate`
- PEP adapters (Node/Java)
- Policy-as-code with CEL invariants

## Schemas
- `schemas/request-context.v0.1.schema.json`
- `schemas/decision.v0.1.schema.json`
- `schemas/policy.v0.1.schema.json`

## Example policy
See `policy/policy.example.yaml`.

### Rule execution order (recommended)
1. Canonicalization (adapter)
2. Contract validation (OpenAPI/JSON Schema)
3. Limits (body/depth/arrays)
4. Webhook checks (signature/idempotency)
5. CEL invariants
6. Risk scoring aggregation
7. Mode handling:
   - `defaults.mode=monitor`: convert BLOCK to MONITOR (log + allow)
   - `defaults.mode=enforce`: enforce BLOCK

## CEL variables
The PDP should expose these variables in CEL:
- `request` (object)
- `identity` (object)
- `client` (object)
- `runtime` (object)

## Fixtures
Golden tests live under `fixtures/`:
- `fixtures/contexts/*.json`
- `fixtures/expected/*.decision.json`
