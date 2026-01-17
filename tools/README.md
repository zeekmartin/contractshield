# Golden tests (out of the box)

Date: 2026-01-15

This folder provides a minimal **golden test** harness for ContractShield policies.

## Why golden tests?
They prevent security regressions by locking policy behavior to:
- input contexts (fixtures)
- expected decisions

If a policy change changes a decision, CI fails.

## Run locally
```bash
npm install
npm run test:golden
```

## Add a new test
1. Create a new `fixtures/contexts/<id>.json` with a unique `id`.
2. Create `fixtures/expected/<id>.decision.json`.
3. Run the tests.

## Notes
- The v0.1 runner supports a tiny CEL subset used in the tutorial.
- Replace the evaluator with your real PDP as soon as available (same fixture format).
