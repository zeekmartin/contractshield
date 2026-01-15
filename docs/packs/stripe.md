# Stripe Webhook Policy Pack

## Purpose
Secure Stripe webhooks against forgery, replay, and abuse.

## Threats covered
- Webhook spoofing
- Replay attacks
- Payload tampering
- Oversized payloads

## Core protections
- Raw body signature verification
- Timestamp tolerance
- Event type allowlist
- Idempotency enforcement
- Size limits

## Example policy
```yaml
rules:
  - type: webhook
    provider: stripe
    requireRawBody: true
    toleranceSeconds: 300
    idempotency: enabled
```

## When to use
Any service receiving Stripe events.
