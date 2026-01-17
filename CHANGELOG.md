# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-01-17

### Added

- **Open Core licensing infrastructure**
  - Apache 2.0 LICENSE file for open source packages
  - CLA (Contributor License Agreement)
  - Commercial LICENSE for Pro/Enterprise packages

- **`@contractshield/license` package**
  - `verifyLicense()` - Verify license key and get details
  - `requireLicense()` - Require valid license or throw
  - `hasFeature()` - Check if license includes a feature
  - RSA-SHA256 signature verification (offline, no network)
  - No external dependencies

- **License generator tool** (`tools/license-generator/`)
  - Generate signed license keys (JWT format)
  - RSA 2048 key pair generation script
  - CLI for creating Pro/Enterprise licenses

- **Pro package structure** (`pro/`)
  - `@contractshield/sink-rasp` placeholder
  - Commercial license enforcement
  - Private npm publishing setup

- **Licensing documentation** (`docs/licensing.md`)
  - Open source vs commercial features
  - License verification guide
  - FAQ and pricing information

### Changed

- Updated root `package.json` with workspaces for `pro/*` and `tools/*`
- Updated `.gitignore` to exclude secrets and private keys

## [0.3.0] - 2026-01-17

### Added

- **Project renamed** from "Guardrails" to "ContractShield"
  - Package names: `@contractshield/pdp`, `@contractshield/pep-express`, etc.
  - Backward compatibility aliases provided

- **Generic webhook plugin system** (`packages/pdp/src/rules/webhooks/`)
  - Plugin interface for custom providers
  - Built-in plugins: Stripe, GitHub, Slack, Twilio
  - `registerWebhookPlugin()` for custom providers
  - Tree-shakeable individual plugin imports

- **Fastify adapter** (`@contractshield/pep-fastify`)
  - Plugin: `contractshield(options)`
  - Context builder: Fastify request → RequestContext
  - Path exclusion support
  - Same API as Express adapter

- **Redis replay store** for production
  - `createRedisReplayStore({ client, prefix, ttl })`
  - Compatible with `redis` and `ioredis` clients
  - Automatic TTL-based cleanup
  - Multi-tenant prefix support

- **Sidecar server** (`@contractshield/sidecar`)
  - HTTP API for language-agnostic policy evaluation
  - `POST /evaluate` - Evaluate policy
  - `GET /health` - Health check
  - `GET /metrics` - Prometheus metrics
  - Environment-based configuration

- **Docker support**
  - Multi-stage Dockerfile for minimal image (<100MB)
  - docker-compose.yml with Redis
  - Kubernetes-ready with health probes

- **Documentation**
  - `docs/webhooks.md` - Webhook security guide
  - `docs/adapters.md` - Framework adapters
  - `docs/deployment.md` - Deployment patterns

- **Golden tests** for webhook providers
  - GitHub valid/invalid signature
  - Slack valid/expired timestamp
  - Twilio valid/invalid

### Changed

- Webhook configuration now uses `secretRef` for environment variables
- `timestampTolerance` replaces `toleranceSeconds` (deprecated)
- Express middleware renamed to `contractshield()` (alias: `guardrails()`)

### Deprecated

- `@guardrails/*` package names (use `@contractshield/*`)
- `guardrails()` function name (use `contractshield()`)
- `GuardrailsOptions` type (use `ContractShieldOptions`)

## [0.2.0] - 2026-01-17

### Added

- **Vulnerability checks** - New first-line-of-defense layer that runs before contract validation:
  - `prototypePollution`: Detects `__proto__`, `constructor`, `prototype` keys (default: ON)
  - `pathTraversal`: Detects `../` patterns and encoded variants (default: ON)
  - `ssrfInternal`: Detects internal IPs, localhost, cloud metadata endpoints (default: ON)
  - `nosqlInjection`: Detects MongoDB operators like `$gt`, `$where` (default: OFF, opt-in)
  - `commandInjection`: Detects shell metacharacters (default: OFF, opt-in)

- **Global vulnerability config** in `defaults.vulnerabilityChecks`
- **Per-route vulnerability overrides** in `route.vulnerability`
- **Field targeting** for pathTraversal, ssrfInternal, and commandInjection
- **Documentation** for vulnerability checks (`docs/vulnerability-checks.md`)
- **Golden tests** for all vulnerability checks (`fixtures-v2/contexts/vulnerability/`)

### Changed

- PDP pipeline now runs vulnerability checks as step 1 (before limits)
- Pipeline order: Vulnerability → Limits → Contract → Webhooks → CEL

## [0.1.1] - 2026-01-17

### Added

- **AJV schema cache** in `contract.ts` for improved performance
- **`defaults.unmatchedRouteAction`** option: `allow` | `block` | `monitor` (default: `allow`)
- **CEL subset documentation** in `docs/policy-language.md`
- **Express adapter** (`packages/pep-express/`):
  - Middleware: `guardrails(options)`
  - Context builder: Express req → RequestContext
  - `rawBodyCapture()` helper for webhook signatures
  - `X-Guardrails-Decision` response header
  - Dry-run mode for gradual rollout
- **Express example** (`examples/express-basic/`)

## [0.1.0] - 2026-01-14

### Added

- Initial PDP (Policy Decision Point) implementation
- Route matching (exact match)
- Limits validation (body size, JSON depth, array length)
- Contract validation via AJV JSON Schema
- CEL invariants (pluggable evaluator with built-in subset)
- Stripe webhook signature verification
- Stripe webhook replay protection
- Memory replay store for development/testing
- Golden tests framework with fixtures
- Policy-as-code with YAML/JSON policies
