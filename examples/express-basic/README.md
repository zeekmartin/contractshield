# Express Basic Example

Minimal Express.js app demonstrating Guardrails policy enforcement.

## What it does

- Protects `/api/license/activate` endpoint
- Requires authentication
- Enforces tenant binding (payload tenantId must match identity)
- Adds `X-Guardrails-Decision` header to responses

## Run

```bash
cd examples/express-basic
npm install
npm start
```

## Test

```bash
# Health check (allowed - no policy match)
curl http://localhost:3000/health

# No auth (blocked)
curl -X POST http://localhost:3000/api/license/activate \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "t-1", "licenseKey": "XXX"}'

# With auth, correct tenant (allowed)
curl -X POST http://localhost:3000/api/license/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"tenantId": "t-1", "licenseKey": "XXX"}'

# With auth, wrong tenant (blocked - IDOR attempt)
curl -X POST http://localhost:3000/api/license/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-token" \
  -d '{"tenantId": "t-2", "licenseKey": "XXX"}'
```

## Policy

See `policy.json` for the policy configuration.

## Using @guardrails/pep-express

In a real app, use the middleware package:

```typescript
import express from "express";
import { guardrails } from "@guardrails/pep-express";

const app = express();
app.use(express.json());
app.use(guardrails({ policy: "./policy.json" }));
```
