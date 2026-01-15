# FAQ

Date: 2026-01-15

## Does Guardrails replace a WAF?
No. WAFs filter at the edge using generic patterns.
Guardrails enforces **application intent** with app context.
They complement each other.

## Does Guardrails replace authentication/authorization?
No. It can require auth/scopes and bind identity to payload, but it does not replace your auth system.

## Does it stop all attacks?
No. It blocks behavior not declared as acceptable.
Out-of-scope threats (DDoS, client-side malware, supply-chain) require other controls.

## Is it just regex filtering?
No. The foundation is contract-first: schemas + limits + invariants (CEL).
Heuristics may exist as signals only.

## Will it create false positives?
Potentially, if schemas/intent are incomplete. Use monitor mode first, then enforce progressively.

## Performance impact?
Designed to be predictable: canonicalization + schema validation + CEL eval.
Avoid heavy regex and avoid logging raw bodies.

## Can it work without code changes?
You need at least a PEP integration to build context. Sidecar PDP reduces cross-language complexity.

## Can it cover other stacks than Node/Java?
Yes. Any runtime can implement a PEP adapter or call a sidecar PDP using the stable RequestContext/Decision contract.

## Why CEL first and not OPA?
CEL is simpler and faster to adopt. Guardrails keeps stable interfaces so a Rego/OPA backend can be added later.

## Is it open-source?
Open-core: core engine/adapters/schemas can be open-source; advanced runtime agents/tooling can be commercial.
