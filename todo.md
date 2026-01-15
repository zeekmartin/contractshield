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
