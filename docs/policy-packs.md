# Policy Packs

Date: 2026-01-15

Policy Packs are **pre-defined, opinionated security policies** for common application patterns.
They accelerate adoption while enforcing best practices consistently.

Each pack:
- declares intent
- includes ready-to-use policies
- documents threat coverage
- provides test fixtures

---

## Why Policy Packs

- Reduce time-to-secure
- Avoid reinventing policies
- Encode hard-earned security knowledge
- Enable safe defaults

Packs are composable and overridable.

---

## Available packs (initial)

- Stripe Webhooks
- File Uploads
- OAuth / Token APIs
- Multi-tenant APIs

---

## Pack structure

```
packs/<name>/
  README.md
  policy.yaml
  schemas/
  fixtures/
```

---

## Using a pack

1. Import the pack policy
2. Bind route IDs
3. Override limits if needed
4. Run fixtures in CI
5. Deploy in monitor mode
