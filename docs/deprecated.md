# Deprecated / legacy paths

Date: 2026-01-15

This repo has evolved toward a **single canonical non-regression path**:

- **PDP**: `packages/pdp/`
- **Golden fixtures (root)**: `fixtures/contexts/*.json` and `fixtures/expected/*.decision.json`
- **Runner (canonical)**: `tools/golden-pdp-runner.mjs`
- **Schema loader**: `tools/schemaLoader.mjs`

Everything below is considered **legacy** and should not be used for new work.

---

## Deprecated (legacy) golden test tooling

These exist from early experiments and are now superseded by `tools/golden-pdp-runner.mjs`:

- `tools/golden-tests/` (runner + sample fixtures/policies)
- `tools/fixtures/` (duplicate fixture set)
- `tools/tools/golden-test-runner.mjs` (old runner path)

### Policy
- Prefer: `policy/policy.example.yaml`
- Legacy: `tools/policy/policy.yaml` and any policy copies under `tools/golden-tests/policies/`

---

## Deprecation policy

- **Short term**: keep legacy paths to avoid breaking local workflows.
- **Medium term**: remove after:
  1) canonical runner is the only path used locally/CI
  2) all fixtures are consolidated under root `fixtures/`
  3) docs reference only the canonical path

If you need something from a deprecated folder, migrate it into:
- `fixtures/` (contexts + expected)
- `policy/` (policies)
- `packs/` (policy packs)
- `tools/` (runners / utilities)
