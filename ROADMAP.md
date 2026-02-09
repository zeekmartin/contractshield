# Roadmap – ContractShield

Last updated: 2026-02-09

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

**Objectif** : Adaptateurs multi-frameworks, webhooks généralisés.

### Adapters
- [x] Fastify adapter (`@contractshield/pep-fastify`)

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
- [ ] SQL hooks (mysql, pg) — v1.7
- [ ] Template injection — v1.7

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

## v1.5 — Multi-Platform + Learning Mode ✅

**Objectif** : Support multi-langage et observation intelligente du trafic.

### Multi-Platform Support
- [x] Node.js (Express, Fastify) — Core
- [x] Python (FastAPI, Flask) — `pip install contractshield` (v1.5.2)
- [x] Java (Spring Boot) — Maven Central (v1.5.3)
  - [x] `dev.contractshield:contractshield-core`
  - [x] `dev.contractshield:contractshield-spring-boot-starter`
  - [x] `dev.contractshield:contractshield-spring-boot-starter-test`
  - [x] Annotations: `@ValidateContract`, `@CELExpression`
  - [x] Spring Boot auto-configuration

### Learning Mode Pro
- [x] `@contractshield/learning` package (Commercial)
- [x] Collector with fixed-rate sampling
- [x] Redactor automatique (données sensibles)
- [x] Storage: File only (v1 simplification)
- [x] Schema inference (JSON Schema auto-généré)
- [x] Invariant discovery (tenant binding, formats)
- [x] Vulnerability scanning (attaques dans le trafic)
- [x] Générateur de suggestions YAML/JSON
- [x] Scores de confiance
- [x] CLI: `contractshield-learn status|analyze|suggest|clear|purge`
- [x] Chiffrement AES-256-GCM au repos (optionnel)
- [x] Auto-purge avec TTL configurable

---

## v1.6 — BOLA/IDOR Auto-Detection (Next)

**Objectif** : Détecter automatiquement les vulnérabilités BOLA/IDOR (#1 OWASP API Top 10).

### BOLA/IDOR Auto-Detection (Pro) 🆕
- [ ] Automatic detection of ID-manipulating endpoints
- [ ] Path parameter analysis (`{id}`, `{uuid}`, `{userId}`)
- [ ] Body field detection (`user_id`, `account_id`, `tenant_id`, `owner_id`)
- [ ] Query param detection (`id`, `userId`, `ownerId`)
- [ ] Auto-suggestion of ownership CEL rules
- [ ] Risk scoring for unprotected endpoints
- [ ] Learning Mode integration for real traffic analysis
- [ ] BOLA vulnerability report generation

**Example output:**
```yaml
# Auto-generated BOLA suggestion
- id: orders.get
  match:
    path: /api/orders/{order_id}
  bola_risk: HIGH
  suggested_rule: "resource.owner_id == request.auth.sub"
  reason: "Endpoint exposes order_id without ownership check"
```

---

## v1.7 — SQL + Eval Hooks (Planned)

- [ ] SQL hooks (mysql, pg, mysql2)
- [ ] SQL injection analyzer
- [ ] Eval hooks (eval, Function, vm)
- [ ] Template injection detection

---

## v1.8 — Policy Packs + Response Validation (Planned)

- [ ] Policy pack : `@contractshield/pack-api-basics`
- [ ] Policy pack : `@contractshield/pack-stripe-webhook`
- [ ] Response validation (prevent data leaks)
- [ ] Egress controls (declared URL fields, destination allowlists)
- [ ] Workflow counters (sequence + quotas)

---

## v2.0+ — Enterprise (Planned)

### Portability
- [ ] WASM PDP
- [ ] OPA/Rego backend alternatif

### Enterprise Features
- [ ] Policy UI (authoring + replay)
- [ ] Dashboard Analytics
- [ ] Audit logging certifié
- [ ] `npx contractshield init --from openapi.yaml` (génération auto)
- [ ] Multi-tenant isolation validation
- [ ] AI Anomaly Detection (ML-based)

### Decisions
- [ ] CHALLENGE
  - Semantics definition
  - Adapter behavior (captcha, MFA step-up)
  - Golden tests

---

## v3.0+ — Long Term Vision

- [ ] GraphQL support (depth, complexity, introspection control)
- [ ] gRPC / Protocol Buffers support
- [ ] Go Gin adapter
- [ ] Rules Marketplace (community sharing)
- [ ] Service Mesh integration (Istio, Linkerd, Envoy)
- [ ] API Gateway plugins (Kong, Traefik, AWS API Gateway)
- [ ] Chaos Engineering (contract fuzzing)

---

## Backlog (non planifié)

- Upload inspection (mime allowlist, max pages, decompression limits)
- OAuth rule type
- ReDoS detection (regex complexity analysis)
- Django REST adapter
- NestJS dedicated adapter

---

## Couverture des attaques par version

| Attaque | v0.2 | v1.0 | v1.5 | v1.6 |
|---------|------|------|------|------|
| Mass assignment | ✅ | ✅ | ✅ | ✅ |
| Schema violation | ✅ | ✅ | ✅ | ✅ |
| IDOR / cross-tenant | ✅ CEL (manual) | ✅ | ✅ | ✅ **Auto-detect** |
| **BOLA** | ❌ | ❌ | ❌ | ✅ **Auto-detect** |
| Webhook spoofing | ✅ | ✅ | ✅ | ✅ |
| Prototype pollution | ✅ | ✅ | ✅ | ✅ |
| Path traversal | ✅ | ✅ + Sink | ✅ + Sink | ✅ + Sink |
| SSRF | ✅ | ✅ + Sink | ✅ + Sink | ✅ + Sink |
| Command injection | ⚠️ Opt-in | ✅ + Sink | ✅ + Sink | ✅ + Sink |
| NoSQL injection | ⚠️ Opt-in | ✅ | ✅ | ✅ |
| SQL injection | ❌ | ❌ | ❌ | v1.7 |
| Template injection | ❌ | ❌ | ❌ | v1.7 |

---

## Platform Support Matrix

| Platform | Package | Status | Version |
|----------|---------|--------|---------|
| Node.js Express | `@contractshield/pep-express` | ✅ Stable | v1.5.x |
| Node.js Fastify | `@contractshield/pep-fastify` | ✅ Stable | v1.5.x |
| Python FastAPI | `contractshield` (PyPI) | ✅ Stable | v1.5.2+ |
| Python Flask | `contractshield[flask]` (PyPI) | ✅ Stable | v1.5.2+ |
| Java Spring Boot | `dev.contractshield:contractshield-spring-boot-starter` | ✅ Stable | v1.5.4 |
| Go Gin | - | 📅 v3.0+ | - |
| Sidecar (any language) | `@contractshield/sidecar` | ✅ Stable | v1.5.x |
