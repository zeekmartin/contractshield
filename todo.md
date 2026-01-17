# TODO / Roadmap

## v0.1 (CEL-first MVP)
- [x] Define RequestContext and Decision JSON schemas (versioned)
- [x] Implement PDP sidecar service (`/evaluate`) → `packages/sidecar/`
- [x] Implement Node PEP middleware (Express/Fastify) → `packages/pep-express/`, `packages/pep-fastify/`
- [ ] Implement Java PEP filter (Servlet/Spring)
- [ ] Canonicalization module (path, headers, json)
- [x] OpenAPI/JSON schema validation (per route) → `rules/contract.ts`
- [x] CEL invariants (compile + eval) → `rules/cel.ts` (subset + pluggable)
- [x] Baseline security pack (limits, unknown fields, webhook mode)
- [ ] Structured logging + correlation ids
- [x] Golden tests + fixtures

## v0.2 (Vulnerability Checks)
- [x] Vulnerability checks layer (runs before contract validation)
  - [x] Prototype pollution detection (`__proto__`, `constructor`, `prototype`)
  - [x] Path traversal detection (`../`, encoded variants)
  - [x] SSRF internal detection (private IPs, localhost, metadata)
  - [x] NoSQL injection detection (MongoDB operators, opt-in)
  - [x] Command injection detection (shell metacharacters, opt-in)
- [x] Global + per-route vulnerability config
- [x] Field targeting for precise detection
- [x] Documentation (`docs/vulnerability-checks.md`)
- [x] Golden tests for all vulnerability checks

## v0.3 (Multi-runtime + Webhooks)
- [x] Rename project to ContractShield (`@contractshield/*` packages)
- [x] Generic webhook plugin system (Stripe, GitHub, Slack, Twilio)
- [x] Redis replay store for production
- [x] Fastify adapter (`@contractshield/pep-fastify`)
- [x] Sidecar server + Docker (`@contractshield/sidecar`)
- [x] Documentation: webhooks.md, adapters.md, deployment.md
- [x] Golden tests for webhook providers

## v0.3.1 (Open Core Licensing)
- [x] Apache 2.0 LICENSE file
- [x] CLA (Contributor License Agreement)
- [x] Commercial LICENSE for pro/ packages
- [x] `@contractshield/license` package (verify, requireLicense, hasFeature)
- [x] License generator tool (`tools/license-generator/`)
- [x] Pro package structure (`pro/sink-rasp/` placeholder)
- [x] Licensing documentation (`docs/licensing.md`)
- [x] License verification tests

## v1.0 (Sink-aware RASP) ✅
- [x] **Sink-aware RASP** (`@contractshield/sink-rasp`) - Commercial
  - [x] Command execution hooks (child_process)
  - [x] Command injection analyzer
  - [x] Filesystem hooks (fs, fs/promises)
  - [x] Path traversal analyzer
  - [x] HTTP egress hooks (http, https, fetch)
  - [x] SSRF/URL analyzer
  - [x] Async context tracking (link to HTTP request)
  - [x] Structured reporter for SIEM
  - [x] Monitor and enforce modes
  - [x] Allowlist support
  - [x] License enforcement (requires `sink-rasp` feature)
- [x] Documentation (`docs/sink-rasp.md`)
- [x] Tests for analyzers and hooks
- [x] CHANGELOG updated

## v1.1
- [ ] SQL hooks (mysql, pg, mysql2)
- [ ] SQL injection analyzer
- [ ] Eval hooks (eval, Function, vm)
- [ ] Template injection detection

## v1.2
- [ ] Policy packs (Stripe webhook pack, upload pack, OAuth pack)
- [ ] Egress controls (declared URL fields, destination allowlists)
- [ ] Workflow counters (sequence + quotas)

## v2.0+
- [ ] WASM execution mode
- [ ] Rego/OPA backend option (keep stable interfaces)
- [ ] Policy UI (PAP) + policy diff/replay

## Golden tests & CI (v0.1)

- [ ] Remplacer le “mini evaluator” par le vrai PDP
      - conserver strictement le format des fixtures
      - PDP interchangeable (embedded ou sidecar)
      - aucun changement côté tests

- [ ] Tests monitor vs enforce
      - même contexte, décisions différentes selon le mode
      - vérifier mapping BLOCK → MONITOR en mode monitor

- [ ] Tests webhooks Stripe
      - raw body obligatoire
      - vérification signature
      - tolérance timestamp
      - protection replay (idempotency key)
      - cas valides / invalides / replay

- [ ] Tests de limits
      - taille body max
      - profondeur JSON
      - taille des arrays
      - payload borderline (juste en dessous / juste au-dessus)

- [ ] Snapshot-friendly diff
      - diff lisible ligne par ligne
      - focus sur action / ruleHits / risk
      - éviter les gros dumps JSON illisibles en CI

## TODO – Decisions

- [x] ALLOW
- [x] BLOCK
- [x] MONITOR
- [ ] CHALLENGE
      - define semantics
      - define Decision contract
      - adapter behavior
      - golden tests

## TODO – Repo cleanup (deprecated paths)

- [ ] Mark legacy golden-test tooling as deprecated (docs + README notes)
- [ ] Migrate any useful fixtures from `tools/fixtures` → `fixtures/`
- [ ] Remove legacy `tools/golden-tests` once canonical runner is the only path
- [ ] Remove `tools/tools/golden-test-runner.mjs` once replaced everywhere
- [ ] Remove/merge `tools/policy/policy.yaml` if redundant with `policy/policy.example.yaml`

