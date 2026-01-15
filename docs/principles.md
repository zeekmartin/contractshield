# Guardrails Principles

Date: 2026-01-15

## The 12 principles
1. Declare intent.
2. Allowlist over denylist.
3. Canonicalize before evaluating.
4. Validate contracts early.
5. Bind identity to data (tenant, scopes).
6. Limit everything (size, depth, rate).
7. Prefer deterministic rules.
8. Explain every decision.
9. Log without leaking secrets.
10. Ship in monitor mode first.
11. Prevent regressions with golden tests.
12. Prepare for sink-aware enforcement.

## Vocabulary
- **PEP**: Policy Enforcement Point (middleware/filter)
- **PDP**: Policy Decision Point (engine)
- **Policy**: contracts + rules + invariants
- **RequestContext**: normalized request + identity + runtime
- **Decision**: allow/block/monitor + reasons
