# feature.prompt.md

You are working on a portable application policy enforcement layer (PEP/PDP) with CEL-first policies.

## Task
Implement a NEW FEATURE requested by the user.

## Constraints
- Follow the architecture in `/docs/architecture.md`.
- Security defaults must not regress: see `/docs/security.md`.
- Add tests per `/docs/non-regression.md`.
- Keep changes minimal and well-scoped; prefer additive changes.

## Required output
1. Summary of the feature and affected components (PEP Node, PEP Java, PDP).
2. Policy changes (new rule ids, schema changes).
3. Implementation plan (steps).
4. Code changes (files, key functions).
5. Tests added/updated (unit + golden tests).
6. Rollout plan (monitor -> enforce) and telemetry.

## Definition of done
- Backward compatible RequestContext/Decision schemas.
- At least one passing example and one blocking example (if applicable).
- Documentation updated when behavior changes.
