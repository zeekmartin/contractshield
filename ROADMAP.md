# Roadmap – ContractShield

Last updated: 2026-01-19

---

## Vision

ContractShield = **Vulnerability Shield** + **Contract Enforcement**

```
Requête entrante
     │
     ▼
┌─────────────────────────┐
│ 1. Vulnerability checks │  ← Patterns d'attaque connus (proto pollution, SSRF...)
│    (denylist)           │
└─────────────────────────┘
     │ OK
     ▼
┌─────────────────────────┐
│ 2. Contract enforcement │  ← Schema métier (champs, types, invariants)
│    (allowlist)          │
└─────────────────────────┘
     │ OK
     ▼
   Application
```

---

## v0.1 — MVP Utilisable ✅

**Objectif** : Un développeur Node.js peut protéger une API Express en 30 minutes.

### Decisions
- [x] ALLOW
- [x] BLOCK
- [x] MONITOR
- [ ] CHALLENGE (future)

### Core PDP
- [x] Route matching (exact)
- [x] Limits (body size, JSON depth, array length)
- [x] Contract validation (JSON Schema / AJV)
- [x] CEL invariants (subset)
- [x] Stripe webhook (signature + replay)
- [x] Cache AJV schemas (perf)
- [x] Option `defaults.unmatchedRouteAction`

### PEP Adapters
- [x] Express.js middleware (`@contractshield/pep-express`)
- [x] Example `examples/express-basic/`

### Testing & Fixtures
- [x] Golden tests runner
- [x] Fixtures YAML + templates (simplification)
- [x] Tests unitaires critiques (matchRoute, jsonMetrics, webhookStripe)

### Documentation
- [x] Manifesto & principles
- [x] Threat model
- [x] Policy language
- [x] Documenter subset CEL supporté
- [x] Badges `[future]` sur features non implémentées

---

## v0.2 — Vulnerability Checks + Observabilité ✅

**Objectif** : Bloquer les attaques connues sur Node.js/runtimes, pas seulement valider les schemas.

### Vulnerability Checks
- [x] `prototypePollution` (scan JSON keys récursif)
- [x] `pathTraversal` (regex sur champs configurés)
- [x] `ssrfInternal` (parse URL, check IP ranges)
- [x] `commandInjection` (patterns shell, opt-in)
- [x] `nosqlInjection` (MongoDB operators, opt-in)
- [x] Golden tests pour chaque check
- [x] Documentation des checks et tuning

---

## v0.3 — Multi-runtime + Webhooks ✅

**Objectif** : Java support, webhooks généralisés.

### Adapters
- [x] Fastify adapter (`@contractshield/pep-fastify`)
- [ ] Java adapter (Spring/Servlet)

### Webhooks
- [x] Webhook générique (signature plugin system)
- [x] Plugins : GitHub, Slack, Twilio, Stripe

### Production
- [x] Redis replay store
- [x] Sidecar Docker image

---

## v0.3.1 — Open Core Licensing ✅

- [x] Apache 2.0 LICENSE for open source packages
- [x] Commercial LICENSE for Pro/Enterprise
- [x] `@contractshield/license` verification package
- [x] License generator tool

---

## v1.0 — Sink-aware RASP ✅

**Objectif** : Protection au niveau des sinks.

### Sink-aware RASP (Commercial)

- [x] Command execution hooks (`child_process`)
- [x] Filesystem hooks (`fs`)
- [x] HTTP egress hooks (SSRF prevention)
- [x] Monitor and enforce modes
- [x] Request context tracking
- [x] Structured logging for SIEM
- [ ] SQL hooks (mysql, pg) — v1.2
- [ ] Template injection — v1.2

---

## v1.1 — Deployment Optimizations ✅

- [x] Policy hot reload (embedded)
- [x] Unix socket support (sidecar)
- [x] `@contractshield/client` SDK (caching, retry, failover)
- [x] Enhanced health checks
- [x] Prometheus metrics

---

## v1.2 — LemonSqueezy License Integration ✅

**Objectif** : Intégration avec LemonSqueezy pour la gestion des licences.

- [x] `@contractshield/license-online` package
- [x] Validation en ligne via API LemonSqueezy
- [x] Cache licence 24h (~/.contractshield/)
- [x] Graceful degradation (OSS mode si réseau indisponible)
- [x] Activation tracking (limite d'instances)
- [x] Feature gating avec prompts d'upgrade
- [x] Documentation interne (`docs/internal/licensing.md`)
- [x] Documentation export (`DOCUMENTATION_EXPORT.md`)

---

## v1.3 — SQL + Eval Hooks (Planned)

- [ ] SQL hooks (mysql, pg, mysql2)
- [ ] SQL injection analyzer
- [ ] Eval hooks (eval, Function, vm)
- [ ] Template injection detection

---

## v1.4 — Policy Packs (Planned)

- [ ] Policy pack : `@contractshield/pack-api-basics`
- [ ] Policy pack : `@contractshield/pack-stripe-webhook`
- [ ] Egress controls (declared URL fields, destination allowlists)
- [ ] Workflow counters (sequence + quotas)

---

## v2.0+ — Enterprise (Planned)

### Portability
- [ ] WASM PDP
- [ ] OPA/Rego backend alternatif

### Enterprise
- [ ] Policy UI (authoring + replay)
- [ ] Audit logging certifié
- [ ] `npx contractshield init --from openapi.yaml` (génération auto)

### Decisions
- [ ] CHALLENGE
  - Semantics definition
  - Adapter behavior (captcha, MFA step-up)
  - Golden tests

---

## Backlog (non planifié)

- Upload inspection (mime allowlist, max pages, decompression limits)
- OAuth rule type
- GraphQL support
- gRPC adapter
- ReDoS detection (regex complexity analysis)
- Policy marketplace
- Learn mode (observer le trafic, suggérer des règles)

---

## Couverture des attaques par version

| Attaque | v0.1 | v0.2 | v1.0 | v1.1 | v1.2 |
|---------|------|------|------|------|------|
| Mass assignment | ✅ Contract | ✅ | ✅ | ✅ | ✅ |
| Schema violation | ✅ Contract | ✅ | ✅ | ✅ | ✅ |
| IDOR / cross-tenant | ✅ CEL invariants | ✅ | ✅ | ✅ | ✅ |
| Webhook spoofing | ✅ Signature | ✅ | ✅ | ✅ | ✅ |
| Prototype pollution | ❌ | ✅ Check | ✅ | ✅ | ✅ |
| Path traversal | ❌ | ✅ Check | ✅ + Sink | ✅ + Sink | ✅ + Sink |
| SSRF | ❌ | ✅ Check | ✅ + Sink | ✅ + Sink | ✅ + Sink |
| Command injection | ❌ | ⚠️ Opt-in | ✅ + Sink | ✅ + Sink | ✅ + Sink |
| NoSQL injection | ❌ | ⚠️ Opt-in | ✅ | ✅ | ✅ |
| SQL injection | ❌ | ❌ | ❌ | ❌ | v1.3 |
| Template injection | ❌ | ❌ | ❌ | ❌ | v1.3 |
