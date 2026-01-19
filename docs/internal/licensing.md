# ContractShield Licensing - Internal Documentation

> **INTERNAL** - This document is for ContractShield maintainers only.

---

## 1. Architecture Overview

### License Validation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        License Validation                        │
└─────────────────────────────────────────────────────────────────┘

                         ┌─────────────┐
                         │ License Key │
                         │  (UUID/JWT) │
                         └──────┬──────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
              ┌─────▼─────┐          ┌──────▼──────┐
              │  Offline  │          │   Online    │
              │   (JWT)   │          │(LemonSqueezy)│
              └─────┬─────┘          └──────┬──────┘
                    │                       │
           ┌────────┴────────┐       ┌──────┴──────┐
           │ RSA Signature   │       │ Check Cache │
           │  Verification   │       └──────┬──────┘
           └────────┬────────┘              │
                    │               ┌───────┴───────┐
                    │               │               │
                    │        ┌──────▼──────┐ ┌──────▼──────┐
                    │        │ Cache Hit   │ │ Cache Miss  │
                    │        │ (use cached)│ │ (call API)  │
                    │        └─────────────┘ └──────┬──────┘
                    │                               │
                    │                        ┌──────▼──────┐
                    │                        │LemonSqueezy │
                    │                        │   API       │
                    │                        └──────┬──────┘
                    │                               │
                    │                        ┌──────▼──────┐
                    │                        │Update Cache │
                    │                        │ (24h TTL)   │
                    │                        └─────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                             ┌──────▼──────┐
                             │  Validation │
                             │   Result    │
                             └──────┬──────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
             ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
             │    Valid    │ │   Invalid   │ │  Degraded   │
             │   (Pro/Ent) │ │   (error)   │ │   (OSS)     │
             └─────────────┘ └─────────────┘ └─────────────┘
```

### Two Validation Methods

| Method | Package | Use Case |
|--------|---------|----------|
| **Offline (JWT)** | `@contractshield/license` | Self-hosted, air-gapped, custom signing |
| **Online (LemonSqueezy)** | `@contractshield/license-online` | LemonSqueezy customers, easy management |

### Cache Behavior

- **Location**: `~/.contractshield/license-cache-<hash>.json`
- **Fallback**: System temp directory if home not writable
- **TTL**: 24 hours (configurable)
- **Security**: License key is hashed (SHA256), never stored in plaintext
- **Permissions**: File mode 0600 (owner read/write only)

---

## 2. LemonSqueezy Setup

### Product Configuration

1. **Create Product** in LemonSqueezy Dashboard:
   - Name: "ContractShield Pro" or "ContractShield Enterprise"
   - Type: Software
   - Pricing: Subscription (monthly/annual)

2. **Create Variants**:
   - "Pro Monthly" - $49/month
   - "Pro Annual" - $490/year
   - "Enterprise Monthly" - $199/month
   - "Enterprise Annual" - $1990/year

3. **License Settings** (per variant):
   - License key format: UUID
   - Activation limit:
     - Pro: 3 instances
     - Enterprise: Unlimited (set to 0)
   - Expiration: Never (subscription handles this)

### Store Settings

```
Store ID: [your_store_id]
API Key: [stored securely, never in code]
Product IDs:
  - Pro: [product_id]
  - Enterprise: [product_id]
```

### Webhook Setup (Optional)

For real-time license updates, configure webhooks:

1. Go to Settings → Webhooks
2. Add endpoint: `https://api.contractshield.dev/webhooks/lemonsqueezy`
3. Select events:
   - `license_key_created`
   - `license_key_updated`
   - `subscription_cancelled`
   - `subscription_expired`

4. Copy signing secret for verification

---

## 3. Generating Enterprise Licenses

### Via LemonSqueezy Dashboard

1. Go to **Store → Licenses**
2. Click **Create License**
3. Fill in:
   - **Customer**: Select or create customer
   - **Product**: ContractShield Enterprise
   - **Activation Limit**: Set to customer's seat count (or 0 for unlimited)
   - **Expires At**: Set custom date or leave empty
4. Click **Create**
5. Copy the generated license key

### Via API (programmatic)

```bash
curl -X POST "https://api.lemonsqueezy.com/v1/license-keys" \
  -H "Authorization: Bearer $LEMON_SQUEEZY_API_KEY" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "license-keys",
      "attributes": {
        "activation_limit": 10,
        "expires_at": "2025-12-31T23:59:59Z",
        "key": null
      },
      "relationships": {
        "order": {
          "data": {
            "type": "orders",
            "id": "ORDER_ID"
          }
        }
      }
    }
  }'
```

### Custom Activation Limits

| License Tier | Default Limit | Custom |
|--------------|---------------|--------|
| Pro | 3 | Contact sales |
| Enterprise | 10 | Negotiable |
| Unlimited | 0 (unlimited) | Enterprise only |

### Setting Custom Expiry

Enterprise licenses can have custom expiry:
- **1 year**: Standard enterprise contract
- **2-3 years**: Multi-year discount
- **Never**: Perpetual license (premium pricing)

### Revoking a License

1. Go to **Store → Licenses**
2. Find the license
3. Click **Disable** or **Delete**
4. Disabled: License returns "inactive" status
5. Deleted: License returns "not found"

---

## 4. Troubleshooting

### Common License Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `license_key_not_found` | Invalid key | Check key format, regenerate if needed |
| `license_key_disabled` | Admin disabled | Contact support / check payment |
| `activation_limit_reached` | Too many instances | Deactivate old instances or upgrade |
| `license_expired` | Subscription ended | Renew subscription |
| `Network error` | API unreachable | Check connectivity, use cached result |

### Check License Status via API

```bash
# Validate license
curl -X POST "https://api.lemonsqueezy.com/v1/licenses/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "license_key": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "instance_name": "check"
  }'

# List activations
curl "https://api.lemonsqueezy.com/v1/license-key-instances?filter[license_key_id]=123" \
  -H "Authorization: Bearer $LEMON_SQUEEZY_API_KEY"
```

### Clearing Local Cache

```bash
# Clear all ContractShield caches
rm -rf ~/.contractshield/license-cache-*.json

# Or programmatically
import { clearAllCaches } from '@contractshield/license-online';
clearAllCaches();
```

### Debug Mode

Enable verbose logging:

```bash
DEBUG=contractshield:license node app.js
```

```typescript
// In code
process.env.DEBUG = 'contractshield:license';
```

---

## 5. Files to Keep Private

### Private Repository (`allec-internal`)

| File/Directory | Reason |
|----------------|--------|
| `pro/` | All commercial code |
| `pro/license-online/` | LemonSqueezy integration |
| `pro/sink-rasp/` | Sink-aware RASP (commercial) |
| `docs/internal/` | Internal documentation |
| `tools/license-generator/` | License key generation |
| `scripts/` | Deployment scripts |

### Public Repository (`contractshield/core`)

| File/Directory | Content |
|----------------|---------|
| `packages/pdp/` | Core PDP engine |
| `packages/pep-express/` | Express adapter |
| `packages/pep-fastify/` | Fastify adapter |
| `packages/sidecar/` | Sidecar server |
| `packages/client/` | Client SDK |
| `packages/license/` | Offline license verification (types + verify) |
| `docs/` (public) | User-facing documentation |
| `examples/` | Example applications |

### npm Publishing

**Public packages** (npm public):
```bash
cd packages/pdp && npm publish --access public
cd packages/pep-express && npm publish --access public
# etc.
```

**Private packages** (npm org or private registry):
```bash
# Option 1: npm organization (requires paid org)
cd pro/sink-rasp && npm publish --access restricted

# Option 2: Private registry (Verdaccio, Artifactory, etc.)
npm config set @contractshield-pro:registry https://npm.internal.company.com
cd pro/sink-rasp && npm publish
```

---

## 6. Environment Variables

### User-facing

```bash
# License key (required for Pro features)
CONTRACTSHIELD_LICENSE_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Custom validation endpoint (enterprise self-hosted)
CONTRACTSHIELD_LICENSE_API=https://api.lemonsqueezy.com/v1

# Debug mode
DEBUG=contractshield:license
```

### Internal (never expose to users)

```bash
# LemonSqueezy API key (for admin operations)
LEMON_SQUEEZY_API_KEY=xxxx

# RSA private key for offline license generation
CONTRACTSHIELD_PRIVATE_KEY_PATH=/secrets/private.pem
```

---

## 7. License Key Formats

### LemonSqueezy (Online)

```
Format: UUID v4
Example: 550e8400-e29b-41d4-a716-446655440000
```

### Offline (JWT)

```
Format: JWT (RS256)
Example: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6Ijx1dWlkPiIsImN1c3RvbWVyIjoiQWNtZSBDb3JwIiwiZW1haWwiOiJhZG1pbkBhY21lLmNvbSIsInBsYW4iOiJwcm8iLCJmZWF0dXJlcyI6WyJzaW5rLXJhc3AiLCJob3QtcmVsb2FkIl0sImlhdCI6MTcwNDA2NzIwMCwiZXhwIjoxNzM1Njg5NjAwfQ.xxx

Payload:
{
  "id": "<uuid>",
  "customer": "Acme Corp",
  "email": "admin@acme.com",
  "plan": "pro",
  "features": ["sink-rasp", "hot-reload"],
  "iat": 1704067200,
  "exp": 1735689600
}
```

---

## 8. Feature Matrix

| Feature | OSS | Pro | Enterprise |
|---------|-----|-----|------------|
| Contract validation | ✅ | ✅ | ✅ |
| Vulnerability checks | ✅ | ✅ | ✅ |
| Webhook plugins | ✅ | ✅ | ✅ |
| Express/Fastify adapters | ✅ | ✅ | ✅ |
| Sidecar deployment | ✅ | ✅ | ✅ |
| **Sink-aware RASP** | ❌ | ✅ | ✅ |
| **Policy hot-reload** | ❌ | ✅ | ✅ |
| **Priority support** | ❌ | ✅ | ✅ |
| **Policy packs** | ❌ | ❌ | ✅ |
| **Audit export** | ❌ | ❌ | ✅ |
| **Custom integrations** | ❌ | ❌ | ✅ |
| **SLA** | ❌ | ❌ | ✅ |

---

## 9. Support Escalation

### Pro Support

- Email: pro-support@contractshield.dev
- Response time: 24-48 hours (business days)
- Channels: Email, GitHub Issues (private repo)

### Enterprise Support

- Email: enterprise@contractshield.dev
- Response time: 4-8 hours (business days), 24 hours (weekends)
- Channels: Slack Connect, dedicated Slack channel, phone
- Includes: Onboarding call, quarterly review

---

## 10. Pricing Reference

| Tier | Monthly | Annual | Seats |
|------|---------|--------|-------|
| Pro | $49 | $490 | 3 instances |
| Enterprise | Custom | Custom | Unlimited |

Enterprise pricing factors:
- Number of developers
- Number of services/microservices
- Support SLA requirements
- Custom integration needs
- Multi-year discount (10-20%)

---

*Last updated: 2026-01-19*
