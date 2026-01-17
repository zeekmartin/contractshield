# Roadmap – Guardrails

Last updated: 2026-01-17

---

## v0.1 — MVP Utilisable

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
- [ ] Cache AJV schemas (perf)
- [ ] Option `defaults.unmatchedRouteAction`

### PEP Adapters
- [ ] Express.js middleware (`@guardrails/pep-express`)
- [ ] Example `examples/express-basic/`

### Testing & Fixtures
- [x] Golden tests runner
- [ ] Fixtures YAML + templates (simplification)
- [ ] Tests unitaires critiques (matchRoute, jsonMetrics, webhookStripe)

### Documentation
- [x] Manifesto & principles
- [x] Threat model
- [x] Policy language
- [ ] Documenter subset CEL supporté
- [ ] Badges `[future]` sur features non implémentées

---

## v0.2 — CEL Réel + Observabilité

**Objectif** : Policies expressives et visibilité sur les décisions.

### Core
- [ ] Intégrer vrai evaluateur CEL (cel-js ou WASM)
- [ ] Rate limiting basique (par route/tenant)

### Observability
- [ ] OpenTelemetry spans pour décisions
- [ ] Dashboard minimal (CLI ou HTML statique)

### DX
- [ ] Mode dry-run avec diff (monitor → enforce preview)
- [ ] Policy pack : `@guardrails/pack-api-basics`

---

## v0.3 — Multi-runtime + Webhooks

**Objectif** : Java support, webhooks généralisés.

### Adapters
- [ ] Java adapter (Spring/Servlet)
- [ ] Fastify adapter

### Webhooks
- [ ] Webhook générique (signature plugin system)
- [ ] Plugins : GitHub, Slack, Twilio

### Production
- [ ] Redis replay store
- [ ] Sidecar Docker image

---

## v1.0 — Production Ready

**Objectif** : Entreprises peuvent déployer en confiance.

### Portability
- [ ] WASM PDP
- [ ] OPA/Rego backend alternatif

### Security
- [ ] Egress controls (SSRF protection)
- [ ] Sink-aware RASP (SQL, filesystem, templates)

### Enterprise
- [ ] Policy UI (authoring + replay)
- [ ] Audit logging certifié
- [ ] Docs compliance (SOC2)

### Decisions (v1)
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
- Policy marketplace
