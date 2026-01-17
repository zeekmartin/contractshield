# Why ContractShield (and not just a WAF or RASP?)

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

## ContractShield
- contract-first
- intent-based
- deterministic
- testable
- developer-owned

ContractShield does not replace WAFs or RASP.
It fills the **application-intent gap**.
