# Observability

Date: 2026-01-15

Guardrails must be operable:
- decisions are explainable
- logs are safe (no secrets)
- regressions are detectable
- rollout is measurable

---

## Event types

Emit one structured event per evaluation:
- `guardrails.decision`

Optional:
- `guardrails.webhook` (signature/idempotency details, redacted)
- `guardrails.debug` (canonicalization debug, disabled by default)

---

## Recommended log schema (JSON)

```json
{
  "event": "guardrails.decision",
  "timestamp": "RFC3339",
  "correlationId": "uuid",
  "service": "my-service",
  "env": "prod",
  "routeId": "license.activate.v1",
  "method": "POST",
  "path": "/api/license/activate",
  "action": "ALLOW|BLOCK|MONITOR|CHALLENGE",
  "statusCode": 403,
  "riskScore": 90,
  "riskLevel": "critical",
  "ruleHits": [{"id":"tenant.binding","severity":"critical"}],
  "identity": {"authenticated":true,"tenant":"tenant-1","subject":"user-123"},
  "client": {"ip":"203.0.113.10","userAgent":"..."},
  "request": {"contentType":"application/json","bodySizeBytes":220,"bodySha256":"..."}
}
```

---

## Correlation IDs

- Use upstream request ID if present
- Otherwise generate in the PEP
- Return it to the client in a header (e.g., `x-correlation-id`)
- Propagate it to downstream calls

---

## Redactions

Default: **never log raw bodies**.

Recommended:
- log hash + size
- log redacted samples only for whitelisted fields
- apply PDP-provided `redactions[]` directives (mask/hash/drop)

---

## Metrics (high value)

- decisions by action + routeId
- rule hits by ruleId + severity
- evaluation latency (p50/p95/p99)
- top routes causing blocks
- false positive reports (manual, but trackable)

---

## Rollout dashboards

During monitor → enforce:
- monitor-hit rate per rule
- block rate per rule
- latency impact
- top tenants (if multi-tenant)

---

## Future: OpenTelemetry (OTEL)

### Traces
- span: `guardrails.evaluate`
  - attrs: `routeId`, `action`, `riskLevel`

### Metrics
- `guardrails_decisions_total{action,routeId}`
- `guardrails_rule_hits_total{ruleId,severity}`
- `guardrails_eval_latency_ms` (histogram)

### Logs
- export structured events to OTEL logs pipeline

Keep fields consistent across runtimes (Node/Java/others).

---

## PDP vs PEP responsibility

The **PDP** evaluates policies and returns a `Decision`. It should not perform I/O logging by itself.

The **PEP** (Node/Java adapter) is responsible for:
- generating / propagating `correlationId`
- enforcing the `Decision` (block/allow/monitor)
- emitting structured logs and metrics
- applying redactions directives to any debug output

### Recommended adapter behavior (v0.1)
- Always emit `guardrails.decision` with:
  - `routeId`, `action`, `statusCode`, `risk`, `ruleHits`
  - `correlationId`, `tenant`, `subject` when available
  - request features only (`bodySizeBytes`, `bodySha256`), never raw bodies
- When in monitor mode, still log rule hits (so rollout decisions are measurable).

