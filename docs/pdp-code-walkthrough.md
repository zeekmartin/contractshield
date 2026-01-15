# PDP code walkthrough

Date: 2026-01-15

## Entry point
- `packages/pdp/src/pdp.ts`
- export: `evaluate(policy, ctx, opts)`

## Key files

### Route match
`packages/pdp/src/utils/matchRoute.ts`  
v0.1 supports exact `method+path` matching.

### Environment
`packages/pdp/src/utils/buildEnv.ts`  
Builds the stable policy environment for CEL rules.

### Limits
`packages/pdp/src/rules/limits.ts`  
Emits rule hits:
- `limit.body.max`
- `limit.json.depth`
- `limit.array.max`

### Contract
`packages/pdp/src/rules/contract.ts`  
AJV JSON Schema validation:
- `contract.schema.invalid` (high)
- `contract.reject_unknown_fields` (med advisory if schema still allows additional props)

### Stripe signature
`packages/pdp/src/rules/webhookStripe.ts`  
- reads `stripe-signature`
- requires `request.body.raw`
- computes HMAC SHA256
- checks timestamp tolerance
- fixtures may set `ctx.webhook.signatureValid` for golden tests

### Stripe replay
`packages/pdp/src/rules/webhookStripeReplay.ts`  
- reads event id from `request.body.json.sample.id`
- uses `opts.replayStore` (Redis recommended)
- fixtures may set `ctx.webhook.replayed` for golden tests
- includes `MemoryReplayStore` for dev/tests

### CEL
`packages/pdp/src/rules/cel.ts`  
- pluggable CEL evaluator via `opts.celEvaluator`
- minimal subset fallback for docs/tests

## Extension points (v0.1)
- `opts.celEvaluator`
- `opts.schemaLoader`
- `opts.getSecret`
- `opts.replayStore`
