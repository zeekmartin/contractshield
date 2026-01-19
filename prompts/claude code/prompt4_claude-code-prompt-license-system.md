# Claude Code Prompt: ContractShield License System

## Context

ContractShield is an open-core API security product for Node.js. We use LemonSqueezy for payment processing and license key generation.

- **Open Source** (Apache 2.0): Core contract validation, vulnerability checks
- **Pro** (Commercial): Sink-aware RASP, policy hot-reload, priority support
- **Enterprise** (Custom): Everything in Pro + custom integrations, SLA

LemonSqueezy automatically generates license keys (UUID format) for Pro subscriptions. Enterprise licenses are generated manually via LemonSqueezy dashboard.

## Task

Implement the license validation system for ContractShield Pro with the following requirements:

### 1. License Validation Module

Create a license validation module that supports:

**Option 1: Online validation via LemonSqueezy API**
- Endpoint: `POST https://api.lemonsqueezy.com/v1/licenses/validate`
- Payload: `{ license_key: string, instance_name: string }`
- Tracks activation count (limit: 3 for Pro, unlimited for Enterprise)

**Option 2: Cached validation**
- Cache valid license responses for 24 hours
- Cache location: `~/.contractshield/license-cache.json` or system temp dir
- Fallback to online validation when cache expires
- Hash the license key for cache filename (don't store plaintext)

**Graceful degradation:**
- If no license key provided → run in Open Source mode (no Pro features)
- If validation fails → warn and run in Open Source mode
- If network error → use cached result if available, otherwise warn and run in Open Source mode

### 2. Pro Feature Gating

Gate these Pro features behind license validation:
- `enableSinkRASP()` - Sink-aware RASP protection
- `enableHotReload()` - Policy hot-reload
- Any future Pro features

When unlicensed user tries to use Pro feature:
- Log a warning (not an error)
- Return gracefully / no-op (don't crash the app)
- Include upgrade link in warning message

### 3. File Structure

```
packages/
├── core/                    # Open source (public repo)
│   ├── src/
│   │   ├── index.ts
│   │   ├── pdp/
│   │   ├── adapters/
│   │   └── license/
│   │       └── types.ts     # License types/interfaces only
│   └── package.json
│
├── pro/                     # Commercial (allec-internal repo)
│   ├── src/
│   │   ├── index.ts         # Re-exports core + Pro features
│   │   ├── license/
│   │   │   ├── validator.ts # LemonSqueezy API validation
│   │   │   ├── cache.ts     # Cached validation logic
│   │   │   └── index.ts
│   │   ├── rasp/
│   │   │   └── sink-aware.ts
│   │   └── hot-reload/
│   │       └── index.ts
│   └── package.json
```

### 4. Documentation

Create `docs/internal/licensing.md` in allec-internal with:

1. **Architecture Overview**
   - How license validation works
   - Flowchart of validation process
   - Cache behavior

2. **LemonSqueezy Setup**
   - Product configuration
   - License key settings (activation limit, expiry)
   - Webhook setup (if we add it later)

3. **Generating Enterprise Licenses**
   - Step-by-step in LemonSqueezy dashboard
   - How to set custom activation limits
   - How to set custom expiry dates
   - How to revoke a license

4. **Troubleshooting**
   - Common license errors and solutions
   - How to check license status via API
   - How to clear local cache

5. **Files to Keep Private**
   - List of all files in allec-internal
   - Why each file is private
   - How to publish @contractshield/pro to npm (private registry or npm org)

### 5. Environment Variables

```bash
# User's .env
CONTRACTSHIELD_LICENSE_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Optional: custom validation endpoint (for Enterprise self-hosted)
CONTRACTSHIELD_LICENSE_API=https://api.lemonsqueezy.com/v1
```

### 6. Code Examples

**Basic usage (auto-detects license):**
```typescript
import { ContractShield } from '@contractshield/pro';

const shield = new ContractShield({
  license: process.env.CONTRACTSHIELD_LICENSE_KEY,
  contracts: './contracts',
});

// Pro features enabled automatically if license valid
app.use(shield.middleware());
```

**Explicit Pro feature usage:**
```typescript
import { ContractShield } from '@contractshield/pro';

const shield = new ContractShield({
  license: process.env.CONTRACTSHIELD_LICENSE_KEY,
});

// Will warn if unlicensed, won't crash
shield.enableSinkRASP({
  detectSQL: true,
  detectFS: true,
  detectShell: true,
});
```

### 7. Testing

Create tests for:
- Valid license activation
- Invalid license handling
- Expired license handling
- Network failure with valid cache
- Network failure without cache
- Activation limit exceeded
- Pro feature access with/without license

Mock the LemonSqueezy API for tests.

## Files to Move to allec-internal

After implementation, these files should be in the private `allec-internal` repo, NOT in the public `contractshield/core` repo:

| File | Reason |
|------|--------|
| `packages/pro/*` | All Pro package code |
| `packages/pro/src/license/validator.ts` | Contains validation logic |
| `packages/pro/src/license/cache.ts` | Cache implementation |
| `packages/pro/src/rasp/sink-aware.ts` | Pro feature: Sink RASP |
| `packages/pro/src/hot-reload/*` | Pro feature: Hot reload |
| `docs/internal/licensing.md` | Internal documentation |
| `scripts/generate-enterprise-license.ts` | If we add CLI tooling |

The public repo should only contain:
- `packages/core/*` - Open source features
- `packages/core/src/license/types.ts` - Shared types (no implementation)
- Public documentation

## LemonSqueezy API Reference

**Validate License:**
```bash
curl -X POST https://api.lemonsqueezy.com/v1/licenses/validate \
  -H "Content-Type: application/json" \
  -d '{
    "license_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "instance_name": "production-server-1"
  }'
```

**Response (valid):**
```json
{
  "valid": true,
  "error": null,
  "license_key": {
    "id": 1,
    "status": "active",
    "key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "activation_limit": 3,
    "activation_usage": 1,
    "created_at": "2024-01-01T00:00:00.000000Z",
    "expires_at": null
  },
  "instance": {
    "id": "ins_xxxx",
    "name": "production-server-1",
    "created_at": "2024-01-15T00:00:00.000000Z"
  },
  "meta": {
    "store_id": 12345,
    "order_id": 67890,
    "product_id": 11111,
    "product_name": "ContractShield Pro",
    "variant_id": 22222,
    "variant_name": "Monthly",
    "customer_id": 33333,
    "customer_name": "John Doe",
    "customer_email": "john@example.com"
  }
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "error": "license_key_not_found",
  "license_key": null,
  "instance": null,
  "meta": null
}
```

**Deactivate License (for instance removal):**
```bash
curl -X POST https://api.lemonsqueezy.com/v1/licenses/deactivate \
  -H "Content-Type: application/json" \
  -d '{
    "license_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "instance_id": "ins_xxxx"
  }'
```

## Deliverables

1. [ ] License validation module with both options
2. [ ] Pro feature gating implementation
3. [ ] Integration with existing ContractShield core
4. [ ] Internal documentation (`docs/internal/licensing.md`)
5. [ ] Unit tests with mocked LemonSqueezy API
6. [ ] List of files to move to allec-internal

Start by examining the current ContractShield codebase structure, then implement the license system.
