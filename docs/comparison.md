# Security Controls Comparison
## WAF vs RASP vs Application-layer Guardrails

Date: 2026-01-15

This document explains how **Application-layer Guardrails** compares to
traditional **WAFs** and **RASP** solutions, and why it exists as a distinct layer.

---

## Executive summary

| Layer | Primary question answered |
|------|---------------------------|
| WAF | Does this request look malicious at the network edge? |
| RASP | Is untrusted data reaching a dangerous sink at runtime? |
| Guardrails | Is this request aligned with what the application declared as expected? |

Guardrails does **not** replace WAF or RASP.
It fills the **semantic gap** between them.

---

## Web Application Firewall (WAF)

### What a WAF does well
- Blocks known attack patterns (SQLi, XSS signatures)
- Protects legacy applications without code changes
- Operates at the network or gateway layer

### Limitations
- Lacks business and identity context
- Relies on signatures and heuristics
- High false positives or blind spots
- Hard to test deterministically
- Ineffective against logic abuse

### Typical failures
- Valid JSON payload with malicious intent
- Tenant mismatch (IDOR)
- Workflow abuse
- SSRF via application-controlled URLs

---

## Runtime Application Self-Protection (RASP)

### What RASP does well
- Observes execution at dangerous sinks
- Blocks attacks at the last possible moment
- Sees real execution context

### Limitations
- Runtime overhead
- Complex instrumentation
- Limited visibility into business intent
- Hard to reason about global behavior
- Often opaque to developers

### Typical failures
- Allows logic abuse before a sink is reached
- Difficult policy authoring
- Hard-to-test behavior

---

## Application-layer Guardrails

### What Guardrails does well
- Enforces declared intent
- Uses contracts (OpenAPI, schemas)
- Binds identity to data
- Prevents abuse before business logic runs
- Deterministic and testable
- Low false positives

### Limitations
- Requires explicit declarations
- Needs developer involvement
- Cannot protect undeclared behavior

### Typical successes
- Blocks IDOR and cross-tenant access
- Prevents mass assignment
- Stops workflow bypass
- Secures webhooks
- Prevents SSRF by intent

---

## Defense-in-depth view

```
Internet
   |
 [ WAF ]
   |
 [ Guardrails ]  <-- semantic enforcement
   |
 [ Application ]
   |
 [ RASP ]        <-- sink-aware enforcement (optional)
```

Each layer answers a **different security question**.

---

## When to use what

### Use a WAF when:
- You need perimeter protection
- You protect legacy apps
- You need generic attack filtering

### Use Guardrails when:
- You control the application code
- You want deterministic security
- You need to prevent logic abuse
- You want testable policies

### Use RASP when:
- You need last-resort protection
- You handle highly sensitive operations
- You want sink-level enforcement

---

## Why Guardrails is developer-first

- Policies are code
- Behavior is explicit
- Changes are reviewed
- Decisions are explainable
- Regressions are preventable

---

## Key takeaway

> WAF guesses intent.  
> RASP observes execution.  
> **Guardrails enforces declared meaning.**
