# Security Design

Date: 2026-01-14

This document defines the security principles, default protections, and hardening requirements for the policy layer.

## Core principles
1. **Positive security model**: define what is allowed; reject everything else.
2. **Canonicalize first**: normalize before evaluating rules to prevent bypass.
3. **Least privilege**: minimal permissions, minimal data collection.
4. **Deterministic decisions**: same input → same decision (testable).
5. **Privacy by design**: avoid storing sensitive payloads; use hashing/features/redaction.
6. **Defense in depth**: contract + context + behavior; optional sink-aware layer later.

## Threat model (high level)
### Primary threats
- Injection attempts (SQLi, XSS, template injection, command injection).
- SSRF and internal network probing.
- Path traversal / file inclusion.
- Mass assignment / over-posting (unexpected fields).
- Webhook spoofing / replay.
- Abuse: brute-force, scraping, token stuffing, endpoint discovery.
- Logic abuse: cross-tenant access, quota bypass, workflow bypass.

### Assumptions
- TLS terminates before PEP (PEP sees decrypted HTTP).
- Authentication is performed by app or shared gateway, and identity claims are available to PEP.

## Default protections (recommended baseline pack)
### Request constraints
- Enforce allowed methods per route.
- Require known `content-type`.
- Limit body size per route.
- Limit JSON depth and array lengths.
- Reject unknown fields (opt-in per route; recommended for APIs).
- Strict header allowlist + normalized header parsing.

### Canonicalization
- URL path normalization (dot segments, percent decoding, duplicate slashes).
- Header normalization (case-insensitive keys, merge duplicates safely).
- Unicode normalization for identifiers where relevant.
- Strict JSON parsing; reject ambiguous inputs.

### Injection & exploit heuristics (secondary)
Use as *signals* (not sole gating):
- Dangerous tokens in places they should not exist (e.g., `{{`, `${{`, `;`, `--`, `<script`).
- Suspicious encodings or mixed encoding layers.
- Multipart anomalies (duplicate part names, unexpected content-types).

### SSRF guards
When policy declares a field as `url` used for egress:
- Block private/link-local/loopback IP ranges.
- Block known metadata endpoints (cloud provider metadata IPs).
- Resolve DNS safely (optional later), prevent DNS rebinding.
- Allowlist destination domains if possible.

### Webhook security mode (Stripe/GitHub/…)
- Use raw request body for signature verification.
- Validate timestamp tolerance.
- Enforce idempotency: store processed event ids.
- Reject non-expected event types.

### Rate limiting & abuse controls
- Per IP + per subject (user) + per tenant.
- Token bucket defaults; configurable per route.
- Escalation: MONITOR → CHALLENGE → BLOCK.

## Secrets & key handling
- Never store API keys in plaintext: store salted hashes + show once.
- Support key rotation: `kid`-based signing keys.
- Protect PDP/PEP channel (if sidecar): local socket, mTLS if remote.

## Logging, audit, and data minimization
- Log decision events with:
  - rule ids, action, score, correlation id
  - request metadata (method/path/route id)
  - identity metadata (tenant/subject) when available
- Avoid logging raw bodies; store:
  - hashes
  - sizes
  - redacted samples when necessary

## Safe responses
- Do not leak sensitive rule details to clients.
- Consistent error bodies:
  - 400 (malformed)
  - 401/403 (auth/policy)
  - 413 (payload too large)
  - 429 (rate limit)
- Include a correlation id for support.

## Upgrade path to sink-aware RASP
Later add `SinkContext` checks for:
- DB queries
- filesystem access
- template rendering
- command execution
- HTTP egress

This provides last-mile prevention when untrusted data reaches dangerous call sites.
