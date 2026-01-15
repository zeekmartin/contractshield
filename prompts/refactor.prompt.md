# refactor.prompt.md

You are refactoring the policy engine/adapters without changing external behavior.

## Constraints
- NO behavior change unless explicitly required.
- Maintain compatibility: RequestContext and Decision are stable interfaces.
- Update golden tests to confirm no behavioral drift.

## Required output
1. Refactor goals and non-goals.
2. Risk assessment (perf, correctness, security).
3. Before/after module structure.
4. Test strategy (golden tests, adapter tests).
5. Migration notes (if any).
