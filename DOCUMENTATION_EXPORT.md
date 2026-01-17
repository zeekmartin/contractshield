# ContractShield Documentation Export

> Complete reference for ContractShield - Runtime API Security for Node.js

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [API Reference](#2-api-reference)
3. [Configuration](#3-configuration)
4. [Contracts & Policies](#4-contracts--policies)
5. [Complete Examples](#5-complete-examples)
6. [Deployment Patterns](#6-deployment-patterns)

---

## 1. Architecture

### Monorepo Structure

```
contractshield/
├── packages/                    # Open Source (Apache 2.0)
│   ├── pdp/                     # Policy Decision Point (core engine)
│   ├── pep-express/             # Express.js middleware
│   ├── pep-fastify/             # Fastify plugin
│   ├── sidecar/                 # Standalone HTTP/Unix sidecar
│   ├── client/                  # Client SDK with caching/retry
│   └── license/                 # License verification
├── pro/                         # Commercial (requires license)
│   └── sink-rasp/               # Runtime Application Self-Protection
├── packs/                       # Policy packs
│   └── stripe-webhook/          # Stripe webhook validation
├── examples/
│   └── express-basic/           # Basic Express example
├── quickstart/
│   ├── quickstart-node/         # Node.js quickstart
│   └── quickstart-java/         # Java quickstart
├── schemas/
│   └── decision.v0.1.json       # Decision JSON Schema
└── docs/                        # Documentation
```

### Package Overview

| Package | Version | Description | License |
|---------|---------|-------------|---------|
| `@contractshield/pdp` | 0.3.0 | Core policy decision engine | Apache 2.0 |
| `@contractshield/pep-express` | 0.3.0 | Express.js middleware | Apache 2.0 |
| `@contractshield/pep-fastify` | 0.3.0 | Fastify plugin | Apache 2.0 |
| `@contractshield/sidecar` | 0.3.0 | Standalone sidecar service | Apache 2.0 |
| `@contractshield/client` | 1.1.0 | Client SDK with caching | Apache 2.0 |
| `@contractshield/license` | 0.3.1 | License verification | Apache 2.0 |
| `@contractshield/sink-rasp` | 1.0.0 | Sink-aware RASP | Commercial |

### Data Flow

```
Request → PEP (Express/Fastify) → PDP (evaluate) → Decision
                                       ↓
                              ┌────────┴────────┐
                              │  Rule Checks    │
                              ├─────────────────┤
                              │ 1. Vulnerability│
                              │ 2. Limits       │
                              │ 3. Contract     │
                              │ 4. Webhooks     │
                              │ 5. CEL rules    │
                              └─────────────────┘
```

---

## 2. API Reference

### @contractshield/pdp

Core policy decision engine.

#### `evaluate(policy, context, options?)`

Evaluates a request context against a policy.

```typescript
import { evaluate } from "@contractshield/pdp";

const decision = await evaluate(policy, context, options);
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `policy` | `PolicySet` | Policy configuration |
| `context` | `RequestContext` | Request context |
| `options` | `PdpOptions` | Optional configuration |

**Returns:** `Promise<Decision>`

#### Types

```typescript
// Decision returned by evaluate()
interface Decision {
  version: "0.1";
  action: "ALLOW" | "BLOCK" | "MONITOR" | "CHALLENGE";
  statusCode: number;
  reason?: string;
  ruleHits?: RuleHit[];
  risk: {
    score: number;      // 0-100
    level: "none" | "low" | "med" | "high" | "critical";
  };
  redactions?: RedactionDirective[];
  metadata?: Record<string, unknown>;
}

// Request context (input)
interface RequestContext {
  version: "0.1";
  id?: string;
  timestamp?: string;
  request: {
    method: string;
    path: string;
    routeId?: string;
    headers?: Record<string, string>;
    query?: Record<string, unknown>;
    contentType?: string;
    body?: RequestBody;
  };
  identity?: {
    authenticated?: boolean;
    subject?: string;
    tenant?: string;
    scopes?: string[];
    claims?: Record<string, unknown>;
  };
  client?: {
    ip?: string;
    userAgent?: string;
  };
  runtime?: {
    language?: string;
    service?: string;
    env?: string;
  };
  webhook?: {
    provider?: string;
    signatureValid?: boolean;
    replayed?: boolean;
  };
}

// Policy configuration
interface PolicySet {
  policyVersion: "0.1";
  defaults?: {
    mode?: "monitor" | "enforce";
    unmatchedRouteAction?: "allow" | "block" | "monitor";
    response?: { blockStatusCode?: number };
    limits?: {
      maxBodyBytes?: number;
      maxJsonDepth?: number;
      maxArrayLength?: number;
    };
    vulnerabilityChecks?: VulnerabilityChecksConfig;
  };
  routes: PolicyRoute[];
}

// PDP options
interface PdpOptions {
  getSecret?: (args: { provider: string; routeId: string; ctx: RequestContext }) => string | undefined;
  replayStore?: ReplayStore;
  schemaLoader?: (ref: string) => Promise<any> | any;
  celEvaluator?: CelEvaluator;
}
```

#### Replay Stores

```typescript
import { MemoryReplayStore, createRedisReplayStore } from "@contractshield/pdp";

// In-memory (development)
const memoryStore = new MemoryReplayStore();

// Redis (production)
const redisStore = createRedisReplayStore({
  client: redisClient,
  keyPrefix: "cs:replay:",
  defaultTtlSeconds: 86400
});
```

#### Webhook Plugins

```typescript
import {
  registerWebhookPlugin,
  verifyWebhookSignature,
  checkWebhookReplay,
  stripePlugin,
  githubPlugin,
  slackPlugin,
  twilioPlugin,
  listWebhookPlugins
} from "@contractshield/pdp";

// Built-in plugins: stripe, github, slack, twilio
const plugins = listWebhookPlugins();
// => ["stripe", "github", "slack", "twilio"]

// Register custom plugin
registerWebhookPlugin({
  name: "custom",
  verifySignature: async (route, ctx, opts) => { ... },
  extractEventId: (ctx) => { ... }
});
```

#### Vulnerability Checks

```typescript
import { checkVulnerabilities, mergeVulnerabilityConfig } from "@contractshield/pdp";

// Check types: prototypePollution, pathTraversal, ssrfInternal, commandInjection, nosqlInjection
const hits = checkVulnerabilities(context, {
  prototypePollution: true,
  pathTraversal: true,
  ssrfInternal: { fields: ["url", "webhook_url"] },
  commandInjection: { fields: ["command"] },
  nosqlInjection: true
});
```

---

### @contractshield/pep-express

Express.js middleware for policy enforcement.

#### `contractshield(options)`

```typescript
import express from "express";
import { contractshield, rawBodyCapture } from "@contractshield/pep-express";

const app = express();

// For webhook signature verification
app.use(rawBodyCapture());
app.use(express.json());

app.use(contractshield({
  policy: "./policy.yaml",  // or PolicySet object
  pdpOptions: { replayStore },
  identityExtractor: (req) => req.user,
  dryRun: false,
  blockResponse: {
    message: "Request blocked",
    includeRuleHits: true
  },
  decisionHeader: "X-ContractShield-Decision"
}));
```

**Options:**

```typescript
interface ContractShieldOptions {
  policy: PolicySet | string;           // Policy object or file path
  pdpOptions?: PdpOptions;              // PDP configuration
  identityExtractor?: (req) => Identity; // Extract identity from request
  logger?: (decision, req) => void;     // Custom logger
  dryRun?: boolean;                     // Log only, don't enforce
  blockResponse?: {
    message?: string;
    includeRuleHits?: boolean;
  };
  decisionHeader?: string;              // Default: "X-ContractShield-Decision"
}
```

#### Accessing Decisions

```typescript
app.get("/api/resource", (req, res) => {
  const { decision, context } = req.contractshield;
  // or req.guardrails (deprecated alias)

  console.log(decision.action);  // "ALLOW"
});
```

#### Hot Reload

```typescript
import { PolicyHotReloader, createPolicyLoader } from "@contractshield/pep-express";

// Option 1: Manual control
const reloader = new PolicyHotReloader("./policy.yaml", {
  enabled: true,
  debounceMs: 500,
  onReload: (policy) => console.log("Policy reloaded"),
  onError: (err) => console.error("Reload error:", err)
});
reloader.start();
const policy = reloader.getCurrentPolicy();
reloader.stop();

// Option 2: Simple loader
const { getPolicy, stop } = createPolicyLoader("./policy.yaml");
const policy = getPolicy();
```

---

### @contractshield/pep-fastify

Fastify plugin for policy enforcement.

#### `contractshield`

```typescript
import Fastify from "fastify";
import { contractshield } from "@contractshield/pep-fastify";

const fastify = Fastify();

fastify.register(contractshield, {
  policy: "./policy.yaml",
  dryRun: false,
  exclude: ["/health", "/metrics"],  // Skip these paths
  blockResponse: {
    message: "Request blocked",
    includeRuleHits: true
  }
});

fastify.get("/api/resource", (request, reply) => {
  const { decision } = request.contractshield;
  reply.send({ status: "ok" });
});
```

**Options:**

```typescript
interface ContractShieldOptions {
  policy: PolicySet | string;
  pdpOptions?: PdpOptions;
  identityExtractor?: (request) => Identity;
  logger?: (decision, request) => void;
  dryRun?: boolean;
  exclude?: string[];           // Paths to skip
  blockResponse?: {
    message?: string;
    includeRuleHits?: boolean;
  };
  decisionHeader?: string;
}
```

---

### @contractshield/sidecar

Standalone HTTP/Unix socket sidecar service.

#### `startSidecar(config)`

```typescript
import { startSidecar } from "@contractshield/sidecar";

const { server, close } = await startSidecar({
  port: 3100,
  host: "0.0.0.0",
  unixSocket: "/var/run/contractshield/pdp.sock",  // Optional
  logLevel: "info",
  redisUrl: "redis://localhost:6379",
  serviceName: "my-app",
  version: "1.0.0"
});

// Graceful shutdown
process.on("SIGTERM", close);
```

**Config:**

```typescript
interface SidecarConfig {
  port: number;                    // Default: 3100 (0 to disable HTTP)
  host: string;                    // Default: "0.0.0.0"
  unixSocket?: string;             // Unix socket path
  logLevel: "debug" | "info" | "warn" | "error" | "fatal" | "silent";
  redisUrl?: string;               // Redis for replay store
  serviceName: string;
  version?: string;
}
```

**Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/evaluate` | POST | Evaluate policy |
| `/health` | GET | Detailed health status |
| `/live` | GET | Liveness probe |
| `/ready` | GET | Readiness probe |
| `/metrics` | GET | Prometheus metrics |
| `/webhooks` | GET | List webhook plugins |

**POST /evaluate:**

```typescript
// Request
{
  "policy": PolicySet,
  "context": RequestContext,
  "options": PdpOptions  // optional
}

// Response
{
  "decision": Decision,
  "durationMs": number
}
```

---

### @contractshield/client

Client SDK with caching, retry, and failover.

#### `ContractShieldClient`

```typescript
import { ContractShieldClient } from "@contractshield/client";

const client = new ContractShieldClient({
  // Connection
  url: "http://localhost:3100",
  socketPath: "/var/run/contractshield/pdp.sock",  // Alternative

  // Timeout & retry
  timeoutMs: 100,
  retries: 2,
  retryDelayMs: 10,

  // Caching
  cacheEnabled: true,
  cacheMaxSize: 1000,
  cacheTtlMs: 60000,

  // Failover
  failOpen: true,
  failOpenDecision: { action: "ALLOW", ... },

  // Callbacks
  onError: (err) => console.error(err),
  onCacheHit: (key) => metrics.inc("cache_hits"),
  onFailover: (err) => alerting.warn("Failover", err)
});

// Evaluate
const decision = await client.evaluate(context);

// Cache management
client.clearCache();
const stats = client.getCacheStats();
// => { size: 42, maxSize: 1000, hits: 100, misses: 10 }

// Health check
const healthy = await client.healthCheck();
```

**Options:**

```typescript
interface ClientOptions {
  url?: string;                    // Default: "http://localhost:3100"
  socketPath?: string;             // Unix socket (alternative to URL)
  timeoutMs?: number;              // Default: 100
  retries?: number;                // Default: 2
  retryDelayMs?: number;           // Default: 10
  cacheEnabled?: boolean;          // Default: true
  cacheMaxSize?: number;           // Default: 1000
  cacheTtlMs?: number;             // Default: 60000
  failOpen?: boolean;              // Default: false
  failOpenDecision?: Decision;
  onError?: (error: Error) => void;
  onCacheHit?: (key: string) => void;
  onFailover?: (error: Error) => void;
}
```

**Cache behavior:**
- Only `ALLOW` and `MONITOR` decisions are cached
- `BLOCK` decisions are never cached
- Cache key: `method:route:tenant:scopes`

---

### @contractshield/sink-rasp (Commercial)

Runtime Application Self-Protection.

#### `initSinkRasp(options)`

```typescript
import { initSinkRasp, shutdownSinkRasp } from "@contractshield/sink-rasp";

const rasp = initSinkRasp({
  licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
  mode: "enforce",  // or "monitor"

  sinks: {
    commandExecution: true,
    filesystem: {
      allowedPaths: ["/tmp/", "/var/log/"],
      blockedPaths: ["/etc/passwd"],
      operations: ["read", "write"]
    },
    httpEgress: {
      blockPrivateIPs: true,
      blockMetadataEndpoints: true,
      allowedHosts: ["api.stripe.com"]
    },
    sql: { detectInjection: true },
    eval: true
  },

  allowlist: {
    commands: ["git", "node", "npm"],
    paths: ["/tmp/", "/var/log/"],
    hosts: ["api.stripe.com", "hooks.slack.com"]
  },

  onBlock: (event) => {
    console.error("Blocked:", event.reason);
    alerting.critical("Attack blocked", event);
  },

  onDetect: (event) => {
    siem.log("security", event);
  }
});

// Manual checks
rasp.checkCommand("rm -rf /");
// => { dangerous: true, reason: "Dangerous command: rm", patterns: ["rm"] }

rasp.checkPath("../../etc/passwd");
// => { dangerous: true, reason: "Path traversal detected", patterns: ["../"] }

rasp.checkUrl("http://169.254.169.254/metadata");
// => { dangerous: true, reason: "Cloud metadata endpoint", patterns: ["169.254.169.254"] }

// Status
rasp.isActive();  // true
rasp.getMode();   // "enforce"

// Shutdown (restores original functions)
rasp.shutdown();
```

**Options:**

```typescript
interface SinkRaspOptions {
  licenseKey: string;
  mode: "monitor" | "enforce";
  sinks?: {
    commandExecution?: boolean | CommandExecutionOptions;
    filesystem?: boolean | FilesystemOptions;
    httpEgress?: boolean | HttpEgressOptions;
    sql?: boolean | SqlOptions;
    eval?: boolean;
  };
  allowlist?: {
    commands?: string[];
    paths?: string[];
    hosts?: string[];
    sqlPatterns?: string[];
  };
  onBlock?: (event: BlockEvent) => void;
  onDetect?: (event: DetectEvent) => void;
}
```

#### Request Context Tracking

```typescript
import {
  runWithContext,
  getRequestContext,
  expressContextMiddleware,
  fastifyContextPlugin
} from "@contractshield/sink-rasp";

// Express
app.use(expressContextMiddleware());

// Fastify
fastify.register(fastifyContextPlugin);

// Manual
runWithContext({ requestId: "req-123" }, () => {
  // RASP events will include this requestId
  doSomething();
});
```

---

### @contractshield/license

License verification for commercial features.

```typescript
import {
  verifyLicense,
  requireLicense,
  hasFeature,
  getFeatures,
  LicenseError
} from "@contractshield/license";

// Verify license (returns License or throws)
const license = verifyLicense(licenseKey);
// => { customer: "...", features: ["sink-rasp"], validUntil: "..." }

// Require specific feature (throws if missing)
requireLicense(licenseKey, "sink-rasp");

// Check feature availability
if (hasFeature(licenseKey, "sink-rasp")) {
  // Enable RASP
}

// List all features
const features = getFeatures(licenseKey);
// => ["sink-rasp", "policy-packs", "audit-export"]
```

---

## 3. Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | - |
| `CONTRACTSHIELD_URL` | Sidecar URL | `http://localhost:3100` |
| `CONTRACTSHIELD_SOCKET` | Unix socket path | - |
| `CONTRACTSHIELD_LICENSE_KEY` | Commercial license key | - |
| `REDIS_URL` | Redis connection URL | - |
| `LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |
| `HTTP_PORT` | Sidecar HTTP port | `3100` |
| `UNIX_SOCKET` | Sidecar Unix socket path | - |

### Policy Defaults

```yaml
policyVersion: "0.1"
defaults:
  mode: enforce                    # enforce | monitor
  unmatchedRouteAction: allow      # allow | block | monitor
  response:
    blockStatusCode: 403
  limits:
    maxBodyBytes: 1048576          # 1MB
    maxJsonDepth: 10
    maxArrayLength: 1000
  vulnerabilityChecks:
    prototypePollution: true
    pathTraversal: true
    ssrfInternal: true
    commandInjection: false        # opt-in
    nosqlInjection: false          # opt-in
```

### Vulnerability Check Fields

```yaml
defaults:
  vulnerabilityChecks:
    pathTraversal:
      fields:
        - file_path
        - document_url
    ssrfInternal:
      fields:
        - url
        - webhook_url
        - callback
    commandInjection:
      fields:
        - command
        - script
```

---

## 4. Contracts & Policies

### Policy Structure

```json
{
  "policyVersion": "0.1",
  "defaults": { ... },
  "routes": [
    {
      "id": "unique.route.id",
      "match": {
        "method": "POST",
        "path": "/api/resource"
      },
      "mode": "enforce",
      "contract": {
        "requestSchemaRef": "schemas/create-resource.json",
        "rejectUnknownFields": true
      },
      "webhook": {
        "provider": "stripe",
        "secretRef": "STRIPE_WEBHOOK_SECRET",
        "timestampTolerance": 300,
        "replayProtection": true
      },
      "vulnerability": {
        "commandInjection": true
      },
      "limits": {
        "maxBodyBytes": 10240
      },
      "rules": [
        {
          "id": "rule.id",
          "type": "cel",
          "action": "block",
          "severity": "critical",
          "config": {
            "expr": "identity.authenticated == true"
          }
        }
      ]
    }
  ]
}
```

### CEL Expressions

ContractShield uses CEL (Common Expression Language) for policy rules.

**Available Variables:**

| Variable | Type | Description |
|----------|------|-------------|
| `request.method` | string | HTTP method |
| `request.path` | string | Request path |
| `request.headers` | map | Request headers (lowercase keys) |
| `request.query` | map | Query parameters |
| `request.body` | any | Parsed JSON body |
| `identity.authenticated` | bool | Authentication status |
| `identity.subject` | string | User ID |
| `identity.tenant` | string | Tenant ID |
| `identity.scopes` | list | Permission scopes |
| `identity.claims` | map | JWT claims |
| `client.ip` | string | Client IP address |
| `client.userAgent` | string | User agent |

**Examples:**

```yaml
rules:
  # Authentication required
  - id: auth.required
    type: cel
    action: block
    severity: high
    config:
      expr: "identity.authenticated == true"

  # Tenant binding (IDOR prevention)
  - id: tenant.binding
    type: cel
    action: block
    severity: critical
    config:
      expr: "identity.tenant == request.body.tenantId"

  # Scope check
  - id: scope.required
    type: cel
    action: block
    severity: high
    config:
      expr: "'admin:write' in identity.scopes"

  # Rate limit by tenant
  - id: rate.limit
    type: cel
    action: monitor
    severity: med
    config:
      expr: "size(request.body.items) <= 100"

  # IP allowlist
  - id: ip.allowlist
    type: cel
    action: block
    severity: critical
    config:
      expr: "client.ip in ['10.0.0.1', '10.0.0.2']"
```

### Webhook Configuration

```yaml
routes:
  - id: stripe.webhook
    match:
      method: POST
      path: /webhooks/stripe
    webhook:
      provider: stripe
      secretRef: STRIPE_WEBHOOK_SECRET
      timestampTolerance: 300      # 5 minutes
      replayProtection: true
      allowedEventTypes:
        - checkout.session.completed
        - invoice.paid

  - id: github.webhook
    match:
      method: POST
      path: /webhooks/github
    webhook:
      provider: github
      secretRef: GITHUB_WEBHOOK_SECRET

  - id: slack.webhook
    match:
      method: POST
      path: /webhooks/slack
    webhook:
      provider: slack
      secretRef: SLACK_SIGNING_SECRET
      timestampTolerance: 300
```

### JSON Schema Contracts

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "schemas/create-order.json",
  "type": "object",
  "required": ["items", "customerId"],
  "properties": {
    "customerId": {
      "type": "string",
      "pattern": "^cust_[a-zA-Z0-9]+$"
    },
    "items": {
      "type": "array",
      "minItems": 1,
      "maxItems": 100,
      "items": {
        "type": "object",
        "required": ["productId", "quantity"],
        "properties": {
          "productId": { "type": "string" },
          "quantity": { "type": "integer", "minimum": 1 }
        }
      }
    },
    "couponCode": {
      "type": "string",
      "maxLength": 20
    }
  },
  "additionalProperties": false
}
```

### Decision Schema

```json
{
  "version": "0.1",
  "action": "ALLOW | BLOCK | MONITOR | CHALLENGE",
  "statusCode": 200,
  "reason": "Allowed",
  "ruleHits": [
    {
      "id": "rule.id",
      "severity": "low | med | high | critical",
      "message": "Optional message"
    }
  ],
  "risk": {
    "score": 0,
    "level": "none | low | med | high | critical"
  },
  "redactions": [
    {
      "path": "request.body.json.sample.email",
      "action": "mask | hash | drop",
      "priority": 100
    }
  ],
  "metadata": {}
}
```

---

## 5. Complete Examples

### Example 1: Express Minimal

```typescript
import express from "express";
import { contractshield } from "@contractshield/pep-express";

const app = express();
app.use(express.json());

app.use(contractshield({
  policy: {
    policyVersion: "0.1",
    defaults: { mode: "enforce" },
    routes: [
      {
        id: "api.orders",
        match: { method: "POST", path: "/api/orders" },
        rules: [
          {
            id: "auth.required",
            type: "cel",
            action: "block",
            severity: "high",
            config: { expr: "identity.authenticated == true" }
          }
        ]
      }
    ]
  }
}));

app.post("/api/orders", (req, res) => {
  res.json({ orderId: "ord_123" });
});

app.listen(3000);
```

### Example 2: Fastify with CEL

```typescript
import Fastify from "fastify";
import { contractshield } from "@contractshield/pep-fastify";

const fastify = Fastify({ logger: true });

fastify.register(contractshield, {
  policy: "./policy.yaml",
  exclude: ["/health"],
  identityExtractor: (request) => {
    const token = request.headers.authorization?.replace("Bearer ", "");
    if (token) {
      const decoded = jwt.verify(token, SECRET);
      return {
        authenticated: true,
        subject: decoded.sub,
        tenant: decoded.tenant,
        scopes: decoded.scopes
      };
    }
    return { authenticated: false };
  }
});

fastify.post("/api/orders", async (request, reply) => {
  const { decision } = request.contractshield;
  return { orderId: "ord_123", decision: decision.action };
});

fastify.listen({ port: 3000 });
```

**policy.yaml:**

```yaml
policyVersion: "0.1"
defaults:
  mode: enforce
  vulnerabilityChecks:
    prototypePollution: true
    pathTraversal: true
routes:
  - id: orders.create
    match:
      method: POST
      path: /api/orders
    rules:
      - id: auth.required
        type: cel
        action: block
        severity: high
        config:
          expr: "identity.authenticated == true"
      - id: tenant.binding
        type: cel
        action: block
        severity: critical
        config:
          expr: "identity.tenant == request.body.tenantId"
```

### Example 3: E-commerce with Context

```typescript
import express from "express";
import { contractshield, rawBodyCapture } from "@contractshield/pep-express";
import { MemoryReplayStore, createRedisReplayStore } from "@contractshield/pdp";

const app = express();

// Webhook raw body capture
app.use(rawBodyCapture());
app.use(express.json());

// Auth middleware
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {}
  }
  next();
});

// Redis replay store for production
const replayStore = process.env.REDIS_URL
  ? createRedisReplayStore({
      client: createRedisClient(process.env.REDIS_URL),
      defaultTtlSeconds: 86400
    })
  : new MemoryReplayStore();

// ContractShield
app.use(contractshield({
  policy: "./policy.yaml",
  pdpOptions: {
    replayStore,
    getSecret: ({ provider, routeId }) => {
      if (provider === "stripe") return process.env.STRIPE_WEBHOOK_SECRET;
      if (provider === "github") return process.env.GITHUB_WEBHOOK_SECRET;
    }
  },
  identityExtractor: (req) => ({
    authenticated: !!req.user,
    subject: req.user?.sub,
    tenant: req.user?.org_id,
    scopes: req.user?.permissions || []
  }),
  blockResponse: {
    message: "Access denied",
    includeRuleHits: process.env.NODE_ENV !== "production"
  }
}));

// Routes
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/orders", (req, res) => {
  const { items, customerId } = req.body;
  // Order creation logic
  res.json({ orderId: crypto.randomUUID() });
});

app.post("/webhooks/stripe", (req, res) => {
  const event = req.body;
  // Process Stripe webhook
  res.json({ received: true });
});

app.listen(3000);
```

**policy.yaml:**

```yaml
policyVersion: "0.1"
defaults:
  mode: enforce
  unmatchedRouteAction: block
  response:
    blockStatusCode: 403
  limits:
    maxBodyBytes: 1048576
  vulnerabilityChecks:
    prototypePollution: true
    pathTraversal: true
    ssrfInternal:
      fields:
        - callback_url
        - webhook_url

routes:
  - id: health
    match:
      method: GET
      path: /health

  - id: orders.create
    match:
      method: POST
      path: /api/orders
    contract:
      requestSchemaRef: schemas/create-order.json
      rejectUnknownFields: true
    rules:
      - id: auth.required
        type: cel
        action: block
        severity: high
        config:
          expr: "identity.authenticated == true"
      - id: tenant.binding
        type: cel
        action: block
        severity: critical
        config:
          expr: "identity.tenant == request.body.customerId.split('_')[1]"
      - id: order.size.limit
        type: cel
        action: block
        severity: med
        config:
          expr: "size(request.body.items) <= 50"

  - id: stripe.webhook
    match:
      method: POST
      path: /webhooks/stripe
    webhook:
      provider: stripe
      secretRef: STRIPE_WEBHOOK_SECRET
      timestampTolerance: 300
      replayProtection: true
      allowedEventTypes:
        - checkout.session.completed
        - payment_intent.succeeded
        - invoice.paid
```

---

## 6. Deployment Patterns

### Pattern 1: Embedded (Middleware)

Best for single Node.js applications.

```
┌─────────────────────────────────────────┐
│            Your Application              │
│                                          │
│  ┌─────────┐    ┌─────────┐             │
│  │ Express │ -> │   PDP   │ -> Routes   │
│  │ Fastify │    │ (embed) │             │
│  └─────────┘    └─────────┘             │
└─────────────────────────────────────────┘
```

**Pros:** Lowest latency, simplest deployment
**Cons:** Node.js only, memory per instance

```typescript
import express from "express";
import { contractshield } from "@contractshield/pep-express";

app.use(contractshield({ policy: "./policy.yaml" }));
```

### Pattern 2: Sidecar

Best for Kubernetes, multi-language environments.

```
┌─────────────────────────────────────────────────────┐
│                    Kubernetes Pod                    │
│                                                      │
│  ┌──────────────┐         ┌──────────────────┐      │
│  │     Your     │  HTTP   │  ContractShield  │      │
│  │ Application  │ ──────> │     Sidecar      │      │
│  │ (any lang)   │         │   (port 3100)    │      │
│  └──────────────┘         └──────────────────┘      │
└─────────────────────────────────────────────────────┘
```

**Pros:** Language agnostic, shared across containers
**Cons:** Network hop, container management

**Unix socket (lowest latency ~0.1ms):**

```yaml
volumes:
  - name: contractshield-socket
    emptyDir: {}

containers:
  - name: app
    volumeMounts:
      - name: contractshield-socket
        mountPath: /var/run/contractshield
    env:
      - name: CONTRACTSHIELD_SOCKET
        value: "/var/run/contractshield/pdp.sock"

  - name: contractshield-sidecar
    image: contractshield/sidecar:1.1.0
    volumeMounts:
      - name: contractshield-socket
        mountPath: /var/run/contractshield
    env:
      - name: UNIX_SOCKET
        value: "/var/run/contractshield/pdp.sock"
      - name: HTTP_PORT
        value: "0"
```

### Pattern 3: Centralized

Best for shared policy service across multiple applications.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   App A     │     │   App B     │     │   App C     │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │   ContractShield    │
                │   Service (LB)      │
                └──────────┬──────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │    Redis    │
                    └─────────────┘
```

**Pros:** Single policy management, shared caching
**Cons:** Requires load balancer

```typescript
import { ContractShieldClient } from "@contractshield/client";

const client = new ContractShieldClient({
  url: "http://contractshield-service:3100",
  cacheEnabled: true,
  failOpen: true,
  retries: 2
});

const decision = await client.evaluate(context);
```

### Health Check Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/health` | Detailed status | `{"status": "ok", "checks": {...}}` |
| `/live` | Liveness probe | `{"alive": true}` |
| `/ready` | Readiness probe | `{"ready": true}` |
| `/metrics` | Prometheus | Text metrics |

### Prometheus Metrics

```promql
# Availability
contractshield_up

# Decisions by action
contractshield_decisions_total{action="ALLOW"}
contractshield_decisions_total{action="BLOCK"}

# Latency histogram
contractshield_eval_latency_ms_bucket{action="ALLOW", le="10"}

# Errors
contractshield_errors_total{type="validation"}

# Policy info
contractshield_policy_routes
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3100
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3100
  initialDelaySeconds: 2
  periodSeconds: 5
```

---

## Quick Reference

### Installation

```bash
# Core (required)
npm install @contractshield/pdp

# Express adapter
npm install @contractshield/pep-express

# Fastify adapter
npm install @contractshield/pep-fastify

# Client SDK (for sidecar/centralized)
npm install @contractshield/client

# Sidecar (run as separate process)
npm install @contractshield/sidecar
```

### Minimal Setup

```typescript
import express from "express";
import { contractshield } from "@contractshield/pep-express";

const app = express();
app.use(express.json());
app.use(contractshield({ policy: "./policy.yaml" }));
app.listen(3000);
```

### Links

- **Documentation:** https://contractshield.dev/docs
- **GitHub:** https://github.com/contractshield/contractshield
- **Issues:** https://github.com/contractshield/contractshield/issues

---

*Generated from ContractShield v1.1.0*
