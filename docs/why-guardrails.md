# Why Guardrails (and not just a WAF or RASP?)

## WAFs
- operate at the edge
- rely on generic patterns
- no application context
- high false positives

## Traditional RASP
- runtime hooks
- intrusive
- complex to reason about
- often opaque

## Guardrails
- contract-first
- intent-based
- deterministic
- testable
- developer-owned

Guardrails does not replace WAFs or RASP.
It fills the **application-intent gap**.
