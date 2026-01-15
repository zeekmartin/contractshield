# OAuth / Token API Policy Pack

## Purpose
Secure token issuance and usage endpoints.

## Threats covered
- Token replay
- Scope escalation
- Brute force
- Misuse of grant types

## Core protections
- Grant type allowlist
- Scope validation
- Rate limits
- Audience binding

## Example policy
```yaml
rules:
  - type: oauth
    allowedGrantTypes:
      - authorization_code
      - refresh_token
```
