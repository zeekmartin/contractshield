# Example 02 — Refactor

Goal: extract canonicalization into a shared module and keep decisions identical.

## Steps
1. Move normalization logic into `core/canonicalize`.
2. Update adapters to call new module.
3. Run golden tests to ensure decisions unchanged.
4. Add perf benchmark (optional) to compare latency.
