# Deployment Patterns

ContractShield supports multiple deployment patterns to fit your architecture.

## Overview

| Pattern | Latency | Complexity | Use Case |
|---------|---------|------------|----------|
| **Embedded** | Lowest | Low | Single Node.js app |
| **Sidecar** | Low | Medium | Kubernetes, multi-language |
| **Centralized** | Medium | High | Shared policy service |

## Embedded Deployment

The PDP runs in-process with your application.

### Architecture

```
┌─────────────────────────────────────────┐
│            Your Application              │
│                                          │
│  ┌─────────┐    ┌─────────┐             │
│  │ Express │ -> │   PDP   │ -> Routes   │
│  │ Fastify │    │ (embed) │             │
│  └─────────┘    └─────────┘             │
│                                          │
└─────────────────────────────────────────┘
```

### Pros
- Lowest latency (no network hop)
- Simplest deployment
- No additional infrastructure

### Cons
- Node.js only
- Memory overhead per instance

### Example (Express)

```typescript
import express from "express";
import { contractshield } from "@contractshield/pep-express";
import { MemoryReplayStore } from "@contractshield/pdp";

const app = express();

app.use(contractshield({
  policy: require("./policy.json"),
  pdpOptions: {
    replayStore: new MemoryReplayStore(),
  },
}));

app.listen(3000);
```

### Hot Reload (v1.1+)

Enable automatic policy reloading without restart:

```typescript
import express from "express";
import { contractshield } from "@contractshield/pep-express";

const app = express();

app.use(contractshield({
  policy: "./policy.yaml",  // Path to policy file
  hotReload: true,          // Default: true in development
  onPolicyReload: (policy) => {
    console.log(`Policy reloaded: ${policy.routes?.length} routes`);
  },
}));
```

Hot reload is enabled by default in development (`NODE_ENV !== 'production'`).
Changes to the policy file are debounced (500ms) and validated before applying.
Invalid policies are rejected and the previous policy remains active.

## Sidecar Deployment

The PDP runs as a separate container alongside your application.

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Kubernetes Pod                    │
│                                                      │
│  ┌──────────────┐         ┌──────────────────┐      │
│  │     Your     │  HTTP   │  ContractShield  │      │
│  │ Application  │ ──────> │     Sidecar      │      │
│  │ (any lang)   │         │   (port 3100)    │      │
│  └──────────────┘         └──────────────────┘      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Pros
- Language agnostic
- Shared across multiple containers
- Independent scaling

### Cons
- Additional container management
- Requires HTTP client

### Unix Socket (v1.1+)

For lowest latency (~0.1ms vs ~1-5ms HTTP), use Unix sockets:

```yaml
# Kubernetes deployment with Unix socket
volumes:
  - name: contractshield-socket
    emptyDir: {}

containers:
  - name: app
    image: my-app:latest
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
        value: "0"  # Disable HTTP if socket is enough
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  template:
    spec:
      containers:
        # Your application
        - name: app
          image: my-app:latest
          ports:
            - containerPort: 8080
          env:
            - name: CONTRACTSHIELD_URL
              value: "http://localhost:3100"

        # ContractShield sidecar
        - name: contractshield
          image: contractshield/sidecar:0.3.0
          ports:
            - containerPort: 3100
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-secret
                  key: url
          resources:
            requests:
              memory: "64Mi"
              cpu: "50m"
            limits:
              memory: "128Mi"
              cpu: "200m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3100
            initialDelaySeconds: 5
          readinessProbe:
            httpGet:
              path: /ready
              port: 3100
```

### Docker Compose

```yaml
version: "3.8"

services:
  app:
    image: my-app:latest
    ports:
      - "8080:8080"
    environment:
      - CONTRACTSHIELD_URL=http://sidecar:3100
    depends_on:
      - sidecar

  sidecar:
    image: contractshield/sidecar:0.3.0
    ports:
      - "3100:3100"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
```

## Centralized Deployment

A shared PDP service for multiple applications.

### Architecture

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

### Pros
- Single point of policy management
- Shared caching and replay store
- Easier policy updates

### Cons
- Requires service mesh or LB

### Client SDK (v1.1+)

The client SDK provides caching, retry, and failover for resilience:

```typescript
import { ContractShieldClient } from '@contractshield/client';

const client = new ContractShieldClient({
  url: 'http://contractshield-service:3100',

  // Caching (reduces latency and load)
  cacheEnabled: true,
  cacheMaxSize: 1000,
  cacheTtlMs: 60000,  // 1 minute

  // Retry on failure
  retries: 2,
  retryDelayMs: 10,
  timeoutMs: 100,

  // Failover (allow requests if service is down)
  failOpen: true,

  // Callbacks
  onError: (err) => console.error('ContractShield error:', err),
  onCacheHit: (key) => metrics.inc('cache_hits'),
  onFailover: (err) => alerting.warn('ContractShield failover', err),
});

// Use in your middleware
app.use(async (req, res, next) => {
  const context = buildContext(req);
  const decision = await client.evaluate(context);

  if (decision.action === 'BLOCK') {
    return res.status(403).json({ error: decision.reason });
  }
  next();
});
```

**Cache behavior:**
- Only `ALLOW` and `MONITOR` decisions are cached
- `BLOCK` decisions are never cached (re-evaluated each time)
- Cache key: `method:route:tenant:scopes` (body is not included)

### Kubernetes Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: contractshield
spec:
  selector:
    app: contractshield
  ports:
    - port: 3100
      targetPort: 3100

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: contractshield
spec:
  replicas: 3
  selector:
    matchLabels:
      app: contractshield
  template:
    metadata:
      labels:
        app: contractshield
    spec:
      containers:
        - name: contractshield
          image: contractshield/sidecar:0.3.0
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-secret
                  key: url
```

## Redis Configuration

For production deployments with replay protection, use Redis.

### Single Instance

```bash
REDIS_URL=redis://localhost:6379
```

### Redis Sentinel

```bash
REDIS_URL=redis://sentinel1:26379,sentinel2:26379,sentinel3:26379?sentinelName=mymaster
```

### Redis Cluster

```bash
REDIS_URL=redis://node1:6379,node2:6379,node3:6379
```

### Security

```bash
# With authentication
REDIS_URL=redis://:password@localhost:6379

# With TLS
REDIS_URL=rediss://:password@localhost:6379
```

## Health Checks

All deployment patterns should include health checks.

### Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/health` | Detailed status | `{"status": "ok", "checks": {...}}` |
| `/live` | Liveness | `{"alive": true}` |
| `/ready` | Readiness | `{"ready": true}` |
| `/metrics` | Prometheus | Metrics in text format |

### Health Response (v1.1+)

```json
{
  "status": "ok",           // "ok", "degraded", or "unhealthy"
  "version": "1.1.0",
  "uptime": 3600,           // seconds
  "checks": {
    "redis": {
      "status": "ok",
      "latencyMs": 2
    },
    "policy": {
      "status": "ok",
      "routeCount": 15
    }
  }
}
```

### Readiness Response

```json
{
  "ready": true
}
// or
{
  "ready": false,
  "reason": "Redis not connected"
}
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3100
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 3100
  initialDelaySeconds: 2
  periodSeconds: 5
  failureThreshold: 2
```

## Monitoring

### Prometheus Metrics

The sidecar exposes Prometheus metrics at `/metrics`:

```promql
# Sidecar availability (gauge)
contractshield_up

# Policy route count (gauge)
contractshield_policy_routes

# Decision latency histogram (buckets: 1, 5, 10, 25, 50, 100, 250, 500ms)
contractshield_eval_latency_ms_bucket{action="ALLOW", le="10"}
contractshield_eval_latency_ms_sum{action="ALLOW"}
contractshield_eval_latency_ms_count{action="ALLOW"}

# Decisions by action (counter)
contractshield_decisions_total{action="ALLOW"}
contractshield_decisions_total{action="BLOCK"}
contractshield_decisions_total{action="MONITOR"}

# Errors by type (counter)
contractshield_errors_total{type="validation"}
contractshield_errors_total{type="evaluation"}

# Cache statistics (counter) - Client SDK
contractshield_cache_hits_total
contractshield_cache_misses_total
```

### Logging

Configure log level via `LOG_LEVEL` environment variable:

```bash
LOG_LEVEL=debug  # debug, info, warn, error, fatal
```

### Alerting Rules

```yaml
groups:
  - name: contractshield
    rules:
      - alert: ContractShieldDown
        expr: contractshield_up == 0
        for: 1m
        labels:
          severity: critical

      - alert: HighBlockRate
        expr: rate(contractshield_decisions_total{action="BLOCK"}[5m]) > 100
        for: 5m
        labels:
          severity: warning
```
