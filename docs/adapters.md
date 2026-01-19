# Adapters

ContractShield provides adapters for popular Node.js frameworks and a standalone sidecar for language-agnostic deployment.

## Overview

| Adapter | Package | Use Case |
|---------|---------|----------|
| **Express** | `@cshield/pep-express` | Express.js applications |
| **Fastify** | `@cshield/pep-fastify` | Fastify applications |
| **Sidecar** | `@cshield/sidecar` | Any language via HTTP |

## Express Adapter

### Installation

```bash
npm install @cshield/pep-express
```

### Basic Usage

```typescript
import express from "express";
import { contractshield } from "@cshield/pep-express";

const app = express();
app.use(express.json());

app.use(contractshield({
  policy: "./policy.yaml",
  dryRun: process.env.NODE_ENV !== "production",
}));

app.listen(3000);
```

### Options

```typescript
interface ContractShieldOptions {
  // Policy object or path to YAML/JSON file
  policy: PolicySet | string;

  // PDP options (schemaLoader, celEvaluator, replayStore)
  pdpOptions?: PdpOptions;

  // Custom identity extractor
  identityExtractor?: (req: Request) => RequestContext["identity"];

  // Custom logger
  logger?: (decision: Decision, req: Request) => void;

  // Skip enforcement, only log (gradual rollout)
  dryRun?: boolean;

  // Block response customization
  blockResponse?: {
    message?: string;
    includeRuleHits?: boolean;
  };

  // Decision header name (default: X-ContractShield-Decision)
  decisionHeader?: string;
}
```

### Accessing Decisions

```typescript
app.post("/api/resource", (req, res) => {
  const { decision, context } = req.contractshield!;

  console.log("Decision:", decision.action);
  console.log("Route ID:", decision.metadata?.routeId);

  res.json({ ok: true });
});
```

### Webhook Support

```typescript
import { contractshield, rawBodyCapture } from "@cshield/pep-express";

// Capture raw body BEFORE json parsing
app.use(rawBodyCapture());
app.use(express.json());
app.use(contractshield({ policy }));
```

## Fastify Adapter

### Installation

```bash
npm install @cshield/pep-fastify
```

### Basic Usage

```typescript
import Fastify from "fastify";
import { contractshield } from "@cshield/pep-fastify";

const fastify = Fastify({ logger: true });

fastify.register(contractshield, {
  policy: "./policy.yaml",
  dryRun: process.env.NODE_ENV !== "production",
});

fastify.listen({ port: 3000 });
```

### Options

```typescript
interface ContractShieldOptions {
  // Policy object or path to YAML/JSON file
  policy: PolicySet | string;

  // PDP options
  pdpOptions?: PdpOptions;

  // Custom identity extractor
  identityExtractor?: (request: FastifyRequest) => RequestContext["identity"];

  // Custom logger
  logger?: (decision: Decision, request: FastifyRequest) => void;

  // Skip enforcement, only log
  dryRun?: boolean;

  // Block response customization
  blockResponse?: {
    message?: string;
    includeRuleHits?: boolean;
  };

  // Decision header name
  decisionHeader?: string;

  // Paths to exclude from enforcement
  exclude?: string[];
}
```

### Accessing Decisions

```typescript
fastify.post("/api/resource", async (request, reply) => {
  const { decision, context } = request.contractshield!;

  fastify.log.info({ decision }, "ContractShield decision");

  return { ok: true };
});
```

## Sidecar (HTTP API)

The sidecar is a standalone HTTP server that exposes the PDP as an API. Use it for:
- Non-Node.js applications
- Centralized policy evaluation
- Microservices architecture

### Installation

```bash
npm install @cshield/sidecar
```

### Running

```bash
# Via npx
npx contractshield-sidecar

# Via Docker
docker run -p 3100:3100 contractshield/sidecar

# Via Docker Compose
docker-compose -f docker/docker-compose.yml up
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3100 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `LOG_LEVEL` | info | Log level (debug, info, warn, error) |
| `REDIS_URL` | - | Redis URL for replay store |
| `SERVICE_NAME` | contractshield-sidecar | Service name for logging |

### API Endpoints

#### Health Check

```http
GET /health

Response:
{
  "status": "ok",
  "version": "0.3.0",
  "service": "contractshield-sidecar",
  "timestamp": "2026-01-17T12:00:00.000Z"
}
```

#### Evaluate Policy

```http
POST /evaluate
Content-Type: application/json

{
  "policy": { ... },
  "context": {
    "version": "0.1",
    "request": {
      "method": "POST",
      "path": "/api/users",
      "body": { ... }
    },
    "identity": {
      "authenticated": true,
      "subject": "user-123"
    }
  }
}

Response:
{
  "decision": {
    "version": "0.1",
    "action": "ALLOW",
    "statusCode": 200,
    "reason": "Allowed",
    "ruleHits": [],
    "risk": { "score": 0, "level": "none" }
  },
  "durationMs": 2
}
```

#### Metrics (Prometheus)

```http
GET /metrics

Response:
# HELP contractshield_up Whether the sidecar is up
# TYPE contractshield_up gauge
contractshield_up 1
```

### Client Example (Python)

```python
import requests

SIDECAR_URL = "http://localhost:3100"

def evaluate(policy, context):
    response = requests.post(
        f"{SIDECAR_URL}/evaluate",
        json={"policy": policy, "context": context}
    )
    return response.json()["decision"]

# Usage
decision = evaluate(policy, {
    "version": "0.1",
    "request": {
        "method": "POST",
        "path": "/api/users",
        "body": {"json": {"sample": {"name": "Alice"}}}
    }
})

if decision["action"] == "BLOCK":
    return Response(status=decision["statusCode"])
```

### Client Example (Go)

```go
package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

type EvaluateRequest struct {
    Policy  interface{} `json:"policy"`
    Context interface{} `json:"context"`
}

type EvaluateResponse struct {
    Decision struct {
        Action     string `json:"action"`
        StatusCode int    `json:"statusCode"`
    } `json:"decision"`
}

func evaluate(policy, context interface{}) (*EvaluateResponse, error) {
    body, _ := json.Marshal(EvaluateRequest{policy, context})

    resp, err := http.Post(
        "http://localhost:3100/evaluate",
        "application/json",
        bytes.NewBuffer(body),
    )
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result EvaluateResponse
    json.NewDecoder(resp.Body).Decode(&result)
    return &result, nil
}
```

## Choosing an Adapter

| Scenario | Recommended |
|----------|-------------|
| Express.js app | `@cshield/pep-express` |
| Fastify app | `@cshield/pep-fastify` |
| Python/Go/Java/etc | Sidecar |
| Shared policy evaluation | Sidecar |
| Maximum performance | Embedded adapter |
| Kubernetes deployment | Sidecar as sidecar container |
