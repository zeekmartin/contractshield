# Webhook Security

ContractShield provides a plugin-based webhook verification system that supports multiple providers out of the box.

## Supported Providers

| Provider | Signature Algorithm | Replay Protection | Documentation |
|----------|---------------------|-------------------|---------------|
| **Stripe** | HMAC SHA-256 | Event ID | [docs](https://stripe.com/docs/webhooks/signatures) |
| **GitHub** | HMAC SHA-256 | Delivery ID | [docs](https://docs.github.com/en/webhooks) |
| **Slack** | HMAC SHA-256 + timestamp | Event/Trigger ID | [docs](https://api.slack.com/authentication/verifying-requests-from-slack) |
| **Twilio** | HMAC SHA-1 | Message/Call SID | [docs](https://www.twilio.com/docs/usage/security) |

## Configuration

### Policy Configuration

```yaml
routes:
  - id: stripe-webhook
    match:
      method: POST
      path: /webhooks/stripe
    webhook:
      provider: stripe
      secretRef: STRIPE_WEBHOOK_SECRET  # Environment variable
      replayProtection: true
      timestampTolerance: 300  # 5 minutes

  - id: github-webhook
    match:
      method: POST
      path: /webhooks/github
    webhook:
      provider: github
      secretRef: GITHUB_WEBHOOK_SECRET
      replayProtection: true

  - id: slack-webhook
    match:
      method: POST
      path: /webhooks/slack
    webhook:
      provider: slack
      secretRef: SLACK_SIGNING_SECRET
      timestampTolerance: 300  # Slack recommends 5 minutes

  - id: twilio-webhook
    match:
      method: POST
      path: /webhooks/twilio
    webhook:
      provider: twilio
      secretRef: TWILIO_AUTH_TOKEN
```

### Webhook Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | required | Provider name (stripe, github, slack, twilio) |
| `secretRef` | string | - | Environment variable containing the secret |
| `secret` | string | - | Direct secret (not recommended) |
| `replayProtection` | boolean | true | Enable replay attack protection |
| `timestampTolerance` | number | varies | Max age of request in seconds |
| `requireRawBody` | boolean | true | Require raw body for signature verification |
| `allowedEventTypes` | string[] | - | Filter allowed event types |

## Raw Body Capture

Webhook signature verification requires access to the raw request body (before JSON parsing).

### Express

```typescript
import express from "express";
import { contractshield, rawBodyCapture } from "@contractshield/pep-express";

const app = express();

// Capture raw body BEFORE json parsing
app.use(rawBodyCapture());
app.use(express.json());
app.use(contractshield({ policy }));
```

### Fastify

```typescript
import Fastify from "fastify";
import { contractshield } from "@contractshield/pep-fastify";

const fastify = Fastify({
  // Enable raw body access
  rawBody: true,
});

fastify.register(contractshield, { policy });
```

## Replay Protection

ContractShield provides replay protection to prevent attackers from re-sending captured webhook requests.

### Memory Store (Development)

```typescript
import { MemoryReplayStore, evaluate } from "@contractshield/pdp";

const replayStore = new MemoryReplayStore();
const decision = await evaluate(policy, ctx, { replayStore });
```

### Redis Store (Production)

```typescript
import { createClient } from "redis";
import { createRedisReplayStore, evaluate } from "@contractshield/pdp";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const replayStore = createRedisReplayStore({
  client: redis,
  prefix: "contractshield:replay:",
  defaultTtl: 86400,  // 24 hours
});

const decision = await evaluate(policy, ctx, { replayStore });
```

## Custom Webhook Plugins

You can register custom webhook plugins for providers not included by default.

```typescript
import { registerWebhookPlugin, type WebhookPlugin } from "@contractshield/pdp";

const customPlugin: WebhookPlugin = {
  name: "custom-provider",
  requiredHeaders: ["x-custom-signature"],

  validateSignature(ctx, secret, options) {
    const sig = ctx.request.headers?.["x-custom-signature"];
    // ... your validation logic
    return { valid: true };
  },

  extractEventId(ctx) {
    return ctx.request.headers?.["x-custom-event-id"] || null;
  },
};

registerWebhookPlugin(customPlugin);
```

## Security Best Practices

1. **Always use environment variables** for webhook secrets (`secretRef`, not `secret`)
2. **Enable replay protection** in production
3. **Use Redis** for replay store in multi-instance deployments
4. **Set appropriate timestamp tolerance** (5 minutes is common)
5. **Capture raw body** before any parsing middleware
6. **Log blocked webhooks** for security monitoring
7. **Rotate secrets** periodically and after any suspected compromise

## Troubleshooting

### "Missing signature header"

Ensure your webhook provider is sending the correct signature header:
- Stripe: `Stripe-Signature`
- GitHub: `X-Hub-Signature-256`
- Slack: `X-Slack-Signature` + `X-Slack-Request-Timestamp`
- Twilio: `X-Twilio-Signature`

### "Raw body required"

Make sure you're capturing the raw body before JSON parsing. See [Raw Body Capture](#raw-body-capture).

### "Signature mismatch"

1. Verify the secret is correct
2. Check for proxy modifications to the request body
3. Ensure encoding matches (UTF-8)

### "Timestamp outside tolerance"

1. Check server clock synchronization (NTP)
2. Increase `timestampTolerance` if network latency is high
