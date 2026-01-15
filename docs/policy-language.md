# Policy language (CEL-first)

Date: 2026-01-15

Guardrails uses **CEL** (Common Expression Language) for invariants.
CEL is simple, fast, deterministic, and easy to migrate later to Rego/OPA if needed.

This document defines:
- available variables
- common expressions
- recommended conventions
- pitfalls that cause bypasses or false positives

---

## CEL evaluation context

CEL expressions (`config.expr`) are evaluated with these top-level variables:

- `request`
  - `request.method` (string)
  - `request.path` (string)
  - `request.routeId` (string, optional)
  - `request.headers` (map<string,string>, normalized lower-case keys)
  - `request.query` (map, normalized)
  - `request.contentType` (string)
  - `request.body` (object; depends on adapter redaction mode)
    - `request.body.present` (bool)
    - `request.body.sizeBytes` (int)
    - `request.body.json` (object, optional)
      - `request.body.json.sample` (object/array/primitive) **redacted sample**
- `identity`
  - `identity.authenticated` (bool)
  - `identity.subject` (string)
  - `identity.tenant` (string)
  - `identity.scopes` (list<string>)
  - `identity.claims` (map, optional)
- `client`
  - `client.ip` (string)
  - `client.userAgent` (string)
- `runtime`
  - `runtime.language` (string)
  - `runtime.service` (string)
  - `runtime.env` (string)

> The exact shape is defined by the `RequestContext` schema. Policies must tolerate missing optional fields.

---

## Common CEL functions you can rely on

CEL standard library usually includes:
- string: `contains`, `startsWith`, `endsWith`, `matches` (regex)
- list: `size()`, `exists(x, ...)`, `all(x, ...)`
- comparisons and boolean logic

Guardrails may also provide safe helpers (recommended roadmap):
- `lower(string)` / `upper(string)`
- `hasScope("scope")` (checks `identity.scopes`)
- `inCidr(ip, "10.0.0.0/8")` (future egress/ssrf packs)

If a helper is not implemented yet, do not assume it exists.

---

## Examples

### Require authentication
```cel
identity.authenticated == true
```

### Tenant binding (payload must match identity)
```cel
identity.tenant != "" && request.body.json.sample.tenantId == identity.tenant
```

### Scope required
```cel
identity.scopes.exists(s, s == "license:activate")
```

### Reject obvious template injection tokens in a specific field (signal, not a WAF)
```cel
request.body.json.sample.note.contains("{{") == false
```

---

## Conventions

### Rule IDs
Use stable, namespaced rule IDs:
- `auth.required`
- `tenant.binding`
- `limit.body.activate`
- `contract.reject_unknown_fields`

Avoid renaming rule IDs once used in production.

### Severity
- `low`: informative
- `med`: suspicious
- `high`: block-worthy in most services
- `critical`: cross-tenant, auth bypass, webhook forgery, etc.

---

## Pitfalls

### 1) Redacted bodies
`request.body.json.sample` may be redacted or partial.
Do not write policies that require full raw bodies unless in webhook mode with explicit raw-body handling.

### 2) Missing fields
Write defensive expressions:
```cel
request.body.json.sample != null && request.body.json.sample.tenantId != ""
```

### 3) Header case and duplicates
Headers are normalized to lower-case.
Adapters must canonicalize duplicates deterministically; do not depend on ambiguous behavior.

### 4) Regex cost
`matches()` can be expensive. Prefer `contains/startsWith` when possible.

### 5) Blacklist mindset
CEL is for invariants and contracts, not a signature WAF. If you’re writing many token patterns, you likely need better schemas/intent.
