# non-regression.prompt.md

You are adding or updating non-regression tests for the policy layer.

## Requirements
- Add fixtures for RequestContext and expected Decision.
- Cover monitor and enforce modes where relevant.
- Ensure tests do not contain sensitive raw payloads; redact.

## Output
- List of added fixtures
- How to run tests
- Why these fixtures prevent regressions
