# TODO / Roadmap

## v0.1 (CEL-first MVP)
- [ ] Define RequestContext and Decision JSON schemas (versioned)
- [ ] Implement PDP sidecar service (`/evaluate`)
- [ ] Implement Node PEP middleware (Express/Fastify)
- [ ] Implement Java PEP filter (Servlet/Spring)
- [ ] Canonicalization module (path, headers, json)
- [ ] OpenAPI/JSON schema validation (per route)
- [ ] CEL invariants (compile + eval)
- [ ] Baseline security pack (limits, unknown fields, webhook mode, rate limits)
- [ ] Structured logging + correlation ids
- [ ] Golden tests + fixtures

## v0.2
- [ ] Policy packs (Stripe webhook pack, upload pack, OAuth pack)
- [ ] Egress controls (declared URL fields, destination allowlists)
- [ ] Workflow counters (sequence + quotas)

## v0.3
- [ ] Sink-aware hooks (http egress, sql, fs, template, exec) — declared first
- [ ] Optional runtime instrumentation agents

## v0.4+
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

