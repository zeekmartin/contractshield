# Intra-application integration

Date: 2026-01-14

This document describes how applications integrate with the policy layer across services and internal calls.

## Integration patterns
### Edge integration (recommended)
- PEP runs at the edge of each service (middleware/filter).
- PDP is local sidecar or embedded library.
- Each service includes `serviceName` and `env` in context.

### Central gateway integration
- PEP runs in an API gateway.
- Pros: single deployment point.
- Cons: less service-specific context; harder to enforce invariants involving internal logic.

## Internal calls
For service-to-service requests:
- Propagate `correlationId`.
- Use service identity when appropriate.
- Apply separate policies for internal endpoints (often stricter allowlists).

## Webhook integration (Stripe)
- Raw body required for signature verification.
- Dedicated route ids and policies for webhooks.
- Enforce idempotency in a persistent store (DB/Redis).
- Restrict event types to a minimal allowlist.

## Response shaping and redactions
- PEP must redact sensitive fields in logs according to PDP decision.
- PDP can return redaction directives; PEP applies them.

## Future: sink-aware hooks
Define an internal API for sinks:
- `evaluateSink(SinkContext)` with types:
  - `http_egress`
  - `sql_query`
  - `filesystem`
  - `template_render`
  - `command_exec`

Agents emit sink contexts at runtime.
