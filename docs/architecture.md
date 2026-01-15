# Architecture

Date: 2026-01-14

## Goals
Build a **portable, contract-first policy enforcement layer** that developers can use to harden applications against
injection and abuse that slip past network firewalls. The layer adds **application meaning** by letting developers
declare what is expected (contracts + invariants) and rejecting everything else.

## Non-goals (initially)
- Replace app authorization logic (it complements it).
- Provide a complete IDS/IPS or a signature-only WAF.
- Solve all fraud/abuse with heuristics alone.

## High-level components
### PEP / PDP / PAP
- **PEP (Policy Enforcement Point)**: language/framework adapter (Node/Java). Builds a canonical `RequestContext` and enforces the decision.
- **PDP (Policy Decision Point)**: policy evaluation engine. Takes `RequestContext` → returns `Decision`.
- **PAP (Policy Administration Point)**: policy authoring and distribution (GitOps first; UI later).

### Telemetry & Audit
- Decision events: `allowed|blocked|monitored`, rule hits, reasons, risk score, redactions applied.
- Designed to store *features and hashes*, not sensitive raw payloads.

## Deployment patterns
### Pattern A — Embedded (library)
- PDP runs in-process as a library.
- Best for very low latency and simple deployments.
- Requires native bindings if PDP is not in the same language.

### Pattern B — Sidecar (recommended initial)
- PDP runs as a local service (HTTP/gRPC/Unix socket).
- Node/Java PEPs call `POST /evaluate`.
- Pros: single PDP implementation, consistent behavior across stacks, easy updates.
- Cons: one extra hop (local).

### Pattern C — WASM (later)
- PDP compiled to WebAssembly and executed in each runtime.
- Pros: same binary everywhere, no network hop.
- Cons: toolchain and runtime constraints.

## Data flow (request)
1. **Ingress**: PEP receives HTTP request.
2. **Canonicalization**: normalize encodings, headers, path, JSON parsing.
3. **Context building**: route id, auth claims/scopes, tenant, client IP, user agent, content-type, body features.
4. **Decision**: PEP calls PDP with `RequestContext`.
5. **Enforcement**:
   - `ALLOW`: forward to app
   - `BLOCK`: return error (400/403/429), optionally with safe message
   - `MONITOR`: forward but log decision
6. **Telemetry**: record decision event (structured log / OTEL).

## Policy model (CEL-first)
Policies are declarative and versioned:
- **Contract**: OpenAPI + JSON Schema (types, formats, allowed fields).
- **Context rules**: auth required, scopes, headers allowlist, limits.
- **Business invariants**: CEL expressions for tenant binding, quotas, state transitions.

### Migration path to Rego/OPA
- Keep stable interfaces:
  - `evaluate(RequestContext) -> Decision`
  - `evaluateSink(SinkContext) -> Decision` (later)
- Represent invariants in an intermediate AST so CEL/OPA are interchangeable backends.

## RequestContext (canonical)
Minimal stable shape:

```json
{
  "id": "uuid",
  "timestamp": "RFC3339",
  "request": {
    "method": "POST",
    "path": "/api/license/activate",
    "routeId": "license.activate.v1",
    "query": {},
    "headers": {"content-type":"application/json"},
    "contentType": "application/json",
    "body": {
      "present": true,
      "sizeBytes": 1234,
      "sha256": "...",
      "json": { "redacted": true, "sample": {"licenseKey":"***"} }
    }
  },
  "identity": {
    "authenticated": true,
    "subject": "user-123",
    "tenant": "tenant-abc",
    "scopes": ["license:activate"]
  },
  "client": {
    "ip": "203.0.113.10",
    "userAgent": "Outlook/..."
  },
  "runtime": {
    "language": "node|java",
    "service": "mytwin-guard",
    "env": "prod"
  }
}
```

Notes:
- Body can be full, redacted, or feature-only (hash + sizes + selected fields).
- Canonicalization must happen before policy evaluation.

## Decision
```json
{
  "action": "ALLOW|BLOCK|MONITOR|CHALLENGE",
  "statusCode": 403,
  "reason": "Policy violation",
  "ruleHits": [{"id":"limit.body.max","severity":"high"}],
  "risk": {"score": 78, "level": "high"},
  "redactions": [{"path":"request.body.json.sample.licenseKey","type":"mask"}]
}
```

## Extensibility hooks
- **Webhook mode**: raw body signature validation, idempotency checks.
- **Uploads**: streaming inspection, mime allowlist, max pages, decompression limits.
- **Egress controls (later)**: destination allowlist, private IP blocks, DNS rebinding mitigations.
- **Sink-aware RASP (later)**: `SinkContext` evaluation at dangerous call sites.
