# Hello ContractShield — 10 minute tutorial

Date: 2026-01-15

This tutorial shows **Application-layer ContractShield** in action in the simplest possible way.

Goal:
- 1 API endpoint
- 1 policy
- 1 valid request
- 1 blocked request
- Clear explanation of *why*

---

## Scenario

We expose an endpoint to activate a license.

**Expectation**
- User must be authenticated
- Payload must match the schema
- Tenant in payload must match identity
- No extra fields allowed

Anything else is rejected.

---

## Step 1 — Minimal API (Node.js example)

```js
import express from "express";
const app = express();
app.use(express.json());

app.post("/api/license/activate", (req, res) => {
  res.json({ status: "activated" });
});

app.listen(3000);
```

---

## Step 2 — Declare intent (policy)

```yaml
routes:
  - id: license.activate.v1
    match:
      method: POST
      path: /api/license/activate
    contract:
      rejectUnknownFields: true
    rules:
      - id: auth.required
        type: cel
        action: block
        expr: identity.authenticated == true

      - id: tenant.binding
        type: cel
        action: block
        expr: identity.tenant == request.body.tenantId
```

---

## Step 3 — Valid request (allowed)

```http
POST /api/license/activate
Authorization: Bearer valid-token
Content-Type: application/json

{
  "tenantId": "tenant-1",
  "licenseKey": "XXXX-YYYY",
  "deviceId": "device-123"
}
```

**Decision**
```
ALLOW
```

Why:
- Schema valid
- Tenant matches
- No extra fields

---

## Step 4 — Invalid request (blocked)

```http
POST /api/license/activate
Authorization: Bearer valid-token
Content-Type: application/json

{
  "tenantId": "tenant-2",
  "licenseKey": "XXXX-YYYY",
  "deviceId": "device-123",
  "isAdmin": true
}
```

**Decision**
```
BLOCK (403)
ruleHits:
- contract.reject_unknown_fields
- tenant.binding
```

Why:
- Extra field detected
- Tenant mismatch

---

## Step 5 — Monitor vs enforce

Start in **monitor** mode:
- requests are logged
- nothing breaks

Then switch to **enforce**:
- violations are blocked
- behavior is deterministic

---

## What you just gained

- Injection resistance by contract
- IDOR prevention by invariant
- Mass assignment protection
- Zero heuristics
- Fully testable behavior

---

## Key takeaway

> ContractShield does not guess attacks.  
> It enforces what you declared as acceptable.
