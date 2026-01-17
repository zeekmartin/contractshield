# Security boundary

Date: 2026-01-15

Where ContractShield runs, what it can see, and what it cannot.

---

## Where ContractShield sits

- after TLS termination
- at HTTP ingress (middleware/filter) or local sidecar
- before business logic

Client → Proxy/Gateway → PEP → App
                    ↘ PDP (sidecar) (optional)

---

## Trust assumptions

ContractShield assumes:
- decrypted HTTP is available at the PEP
- identity context can be provided (auth upstream or in-app)
- the service can declare intent (schemas, invariants)

ContractShield does not assume:
- well-formed inputs
- consistent headers
- honest clients

---

## What ContractShield can see

- method/path/query/headers (normalized)
- content-type
- body size and hashes
- optional parsed JSON sample (redacted)
- identity: subject, tenant, scopes (if provided)
- runtime: service/env/adapter versions

---

## What ContractShield cannot see (by design)

- network-layer DDoS (SYN floods, volumetric)
- client-side execution (DOM/browser)
- malware on endpoints
- supply-chain compromise
- encrypted payload contents if TLS terminates elsewhere and PEP doesn't see plaintext

---

## Modes

- monitor: log only
- enforce: block
Recommended: progressive rollout + kill switch.

---

## Webhook mode

Webhook endpoints often require:
- raw body for signature verification
- timestamp tolerance
- idempotency store

Webhook mode must be route-scoped to avoid accidental raw-body logging.

---

## Future: sink-aware boundary (optional)

Later ContractShield can evaluate sink events:
- SQL, filesystem, template render, exec, HTTP egress

This is a separate enforcement boundary and can be enabled per service.
