# Multi-tenant API Policy Pack

## Purpose
Prevent cross-tenant access and data leakage.

## Threats covered
- IDOR
- Tenant spoofing
- Data exfiltration

## Core protections
- Identity-to-payload binding
- Route scoping
- Tenant-aware limits

## Example policy
```yaml
rules:
  - type: cel
    expr: identity.tenant == request.body.tenantId
```
