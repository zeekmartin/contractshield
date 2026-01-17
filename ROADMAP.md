# Roadmap – Guardrails

Last updated: 2026-01-17

---

## Vision

Guardrails = **Vulnerability Shield** + **Contract Enforcement**

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

## v0.2 — Vulnerability Checks + Observabilité

**Objectif** : Bloquer les attaques connues sur Node.js/runtimes, pas seulement valider les schemas.

### Vulnerability Checks (nouveau)

Checks configurables globalement et par route :

| Check | Cible | Faux positifs |
|-------|-------|---------------|
| `prototypePollution` | `__proto__`, `constructor.prototype` dans JSON keys | Quasi nuls |
| `pathTraversal` | `../`, `..\\` dans strings | Faibles si ciblé par champ |
| `ssrfInternal` | IPs privées/metadata dans URLs (`127.0.0.1`, `169.254.*`, `10.*`) | Faibles |
| `commandInjection` | `; \| $ \` ( )` dans champs sensibles | Moyens — opt-in par champ |
| `nosqlInjection` | `$gt`, `$ne`, `$where` comme keys | Quasi nuls |

**Format policy** :

```yaml
defaults:
  vulnerabilityChecks:
    prototypePollution: true
    pathTraversal: true
    ssrfInternal: true
    commandInjection: false   # opt-in
    nosqlInjection: false     # opt-in (MongoDB)

routes:
  - path: /api/upload
    rules:
      - type: vulnerability
        pathTraversal:
          fields: [body.filename, body.directory]
        commandInjection:
          fields: [body.filename]

  - path: /api/webhook
    rules:
      - type: vulnerability
        ssrfInternal:
          fields: [body.callbackUrl, body.returnUrl]
```

### Implémentation
- [ ] Rule type `vulnerability` dans PDP
- [ ] Check `prototypePollution` (scan JSON keys récursif)
- [ ] Check `pathTraversal` (regex sur champs configurés)
- [ ] Check `ssrfInternal` (parse URL, check IP ranges)
- [ ] Check `commandInjection` (patterns shell, opt-in)
- [ ] Check `nosqlInjection` (MongoDB operators, opt-in)
- [ ] Golden tests pour chaque check
- [ ] Documentation des checks et tuning

### CEL
- [ ] Intégrer vrai évaluateur CEL (cel-js ou WASM)

### Observability
- [ ] OpenTelemetry spans pour décisions
- [ ] Métriques : requêtes bloquées par type de check
- [ ] Dashboard minimal (CLI ou HTML statique)

### DX
- [ ] Mode dry-run avec diff (monitor → enforce preview)
- [ ] Policy pack : `@guardrails/pack-api-basics`
- [ ] `npx guardrails init --from openapi.yaml` (génération auto)

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

## v1.0 — Production Ready + Sink-aware

**Objectif** : Entreprises peuvent déployer en confiance. Protection au niveau des sinks.

### Sink-aware RASP (différenciateur)

Intercepter les appels dangereux au runtime :

| Sink | Exemples | Protection |
|------|----------|------------|
| Command execution | `exec()`, `spawn()`, `system()` | Block si input contient patterns |
| Filesystem | `fs.readFile()`, `fs.writeFile()` | Block path traversal |
| HTTP egress | `fetch()`, `http.request()` | Block SSRF, allowlist domains |
| SQL | `query()`, ORM raw queries | Block injection patterns |
| Template engines | `render()`, `compile()` | Block template injection |

- [ ] Architecture hooks sink-aware
- [ ] Node.js sink interceptors
- [ ] Configuration allowlist/denylist par sink
- [ ] Logging des tentatives bloquées

### Portability
- [ ] WASM PDP
- [ ] OPA/Rego backend alternatif

### Security
- [ ] Egress controls (SSRF protection renforcée)
- [ ] DNS rebinding protection

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
- ReDoS detection (regex complexity analysis)
- Policy marketplace
- Learn mode (observer le trafic, suggérer des règles)

---

## Couverture des attaques par version

| Attaque | v0.1 | v0.2 | v1.0 |
|---------|------|------|------|
| Mass assignment | ✅ Contract | ✅ | ✅ |
| Schema violation | ✅ Contract | ✅ | ✅ |
| IDOR / cross-tenant | ✅ CEL invariants | ✅ | ✅ |
| Webhook spoofing | ✅ Signature | ✅ | ✅ |
| Prototype pollution | ❌ | ✅ Check | ✅ |
| Path traversal | ❌ | ✅ Check | ✅ + Sink |
| SSRF | ❌ | ✅ Check | ✅ + Sink |
| Command injection | ❌ | ⚠️ Opt-in | ✅ + Sink |
| NoSQL injection | ❌ | ⚠️ Opt-in | ✅ |
| SQL injection | ❌ | ❌ | ✅ Sink |
| Template injection | ❌ | ❌ | ✅ Sink |
| Stored/second-order | ❌ | ❌ | ✅ Sink |
