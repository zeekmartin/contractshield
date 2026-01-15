# security-review.prompt.md

You are conducting a security review of changes to the policy enforcement layer.

## Review scope checklist
- Canonicalization: parsing differences or bypass risks
- Auth context: claims/scopes/tenant binding correctness
- Webhook verification: raw body handling, timestamp tolerance, idempotency
- Limits: body size, json depth, array length, timeouts
- Logging: sensitive data leakage, redactions
- Defaults: monitor vs enforce behavior
- Error responses: information disclosure
- Dependencies: new libs, native code, supply chain
- Performance: risk of DoS via expensive parsing

## Required output
- Findings with severity (low/med/high/critical)
- Proof (examples/contexts) for each finding
- Recommended fixes and tests
- Decision: approve / approve with changes / block
