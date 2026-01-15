# Decision schema (v0.1)

Date: 2026-01-15

This document defines the **stable output contract** of Guardrails policy evaluation.

A **Decision** is produced by the PDP and enforced by the PEP. It must be:
- deterministic
- explainable
- safe to log (no secrets)

Schema file:
- `schemas/decision.v0.1.json`

---

## Actions

- `ALLOW` — request continues to application logic
- `BLOCK` — request is rejected immediately
- `MONITOR` — request continues, but a policy violation is recorded (used in rollout)
- `CHALLENGE` — reserved for future (step-up / async validation). Included in the schema for forward compatibility.

**Important:** v0.1 engines should not emit `CHALLENGE` yet unless an adapter explicitly supports it.

---

## Rule hits

`ruleHits[]` contains the minimal explanation:
- `id` — stable rule identifier (do not rename lightly)
- `severity` — `low|med|high|critical`
- `message` — optional human hint (safe text only)

---

## Risk

`risk.score` is 0–100 and should correlate with severity:
- high/critical hits should map to 60/90 by default (tunable later)

`risk.level` is a label used for dashboards and filters.

---

## Redactions

`redactions[]` is a directive list for adapters/loggers, e.g.:
- mask license keys
- hash emails
- drop tokens

Adapters may apply redactions to logs and/or returned debug payloads.

---

## Backwards compatibility rules

- Additive changes only within v0.1 (new optional fields)
- Breaking changes require a new schema version (e.g., v0.2)
