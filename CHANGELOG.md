# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
