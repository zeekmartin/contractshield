# PDP architecture (v0.1)

Date: 2026-01-15

This document describes the **Policy Decision Point (PDP)**.

## Goal
Turn a `RequestContext` into a deterministic `Decision` (ALLOW/BLOCK/MONITOR).

## Pipeline

1. Route match
2. Limits (size, depth, arrays)
3. Contract validation (JSON Schema)
4. Webhook checks (Stripe signature + replay)
5. CEL invariants
6. Aggregate hits → Decision
7. Mode mapping (`monitor`: BLOCK→MONITOR)

## Diagram

```
RequestContext
   |
   v
[matchRoute]
   |
   v
[checkLimits] -----------+
   |                     |
   v                     |
[validateContract] ------+--> hits[] --> [aggregate] --> Decision
   |
   v
[webhook checks]
   |
   v
[CEL rules]
```

## Determinism rules
- stable route IDs
- stable rule IDs
- stable precedence (any hit triggers BLOCK/MONITOR in v0.1)
- safe-to-log outputs (Decision schema)

## Where the PDP runs
- embedded (in-process) for Node/Java
- later: sidecar (HTTP/gRPC) reusing the same contract
