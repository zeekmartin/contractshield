# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.4] - 2026-02-02
### Added

- Update all packages to version 1.5.4
- Add Python CI: lint, type check, test, build (Python 3.10-3.12)
- Add Java CI: compile, test, package (JDK 17, 21)
- Existing Node.js CI unchanged (Node 18, 20)

## [1.5.3] - 2026-02-02
### Added

☕ Java/Spring Boot support - ContractShield now available for Spring Boot via Maven Central

dev.contractshield:contractshield-core - Core validation library
dev.contractshield:contractshield-spring-boot-starter - Auto-configuration
dev.contractshield:contractshield-spring-boot-starter-test - Test utilities


☕ Spring Boot annotations

@ValidateContract - Schema validation on endpoints
@CELExpression - Repeatable CEL business rules


☕ Spring Boot auto-configuration - Zero-config setup with application.yml
📖 Python README - Package description now visible on PyPI

### Changed

📦 All npm packages now properly obfuscated for Pro modules
🔧 Improved monorepo structure for multi-platform support

Example Usage
Maven:
xml<dependency>
    <groupId>dev.contractshield</groupId>
    <artifactId>contractshield-spring-boot-starter</artifactId>
    <version>1.5.3</version>
</dependency>
Spring Controller:
java@PostMapping("/transfer")
@ValidateContract(schema = "schemas/transfer.json")
@CELExpression(value = "data.amount > 0", message = "Amount must be positive")
public ResponseEntity<TransferResponse> transfer(@RequestBody TransferRequest request) {
    // Already validated!
}


## [1.5.2] - 2026-01-31

### Added
- 🐍 **Python/FastAPI support** - ContractShield now available for Python via `pip install contractshield`
- 🐍 **Flask support** - Flask middleware included via `pip install contractshield[flask]`
- 📦 PyPI publication workflow with automatic Pro obfuscation

### Changed
- 📄 Updated licensing structure
- 🔒 Enhanced Pro module obfuscation for npm packages

### Fixed
- 🔧 Build pipeline improvements for monorepo structure

### Security
- 🛡️ Pro modules now properly obfuscated before npm/PyPI publication

---

## [1.5.0] - 2026-01-19

### Added

- **Learning Mode Pro** (`@contractshield/learning`) - Commercial
  - **Collector with Fixed-Rate Sampling**
    - Configurable sample rate (0.0-1.0, default: 10%)
    - Route exclusion patterns
    - Response metadata capture (status, latency)

  - **Automatic Sensitive Data Redaction**
    - Built-in patterns: password, token, apikey, credit card, SSN, etc.
    - Custom field patterns via `redactFields` config
    - Header filtering (removes Authorization, Cookie, etc.)

  - **File-Based Storage** (v1 backend)
    - Gzip compression for efficiency
    - Optional AES-256-GCM encryption (OFF by default)
    - Configurable TTL and max samples per route
    - Automatic purge of expired samples

  - **Schema Inference Analyzer**
    - Infers JSON Schema from observed traffic
    - Type detection: string, integer, number, boolean, array, object
    - Required field detection based on occurrence
    - Confidence scores based on type consistency

  - **Invariant Discovery Analyzer**
    - Tenant binding detection (identity.tenant == body.field)
    - Subset relationships (field values within observed set)
    - Format patterns (email, UUID, ISO date)
    - Generates CEL expressions with confidence

  - **Vulnerability Pattern Analyzer**
    - Prototype pollution detection
    - Path traversal detection
    - SSRF attempt detection (internal IPs, metadata endpoints)
    - NoSQL injection detection (MongoDB operators)
    - Command injection detection (shell metacharacters)

  - **Suggestion Generator**
    - Converts analysis to actionable ContractShield rules
    - Severity classification (critical, high, medium, low)
    - Confidence-based filtering
    - YAML and JSON output formats

  - **CLI Commands**
    - `contractshield-learn status` - Show learning status
    - `contractshield-learn analyze` - Run analyzers on samples
    - `contractshield-learn suggest` - Generate rule suggestions
    - `contractshield-learn clear` - Clear all samples
    - `contractshield-learn purge` - Remove expired samples

### Changed

- Updated ROADMAP with v1.5 Learning Mode implementation

## [1.2.0] - 2026-01-19

### Added

- **LemonSqueezy Online License Validation** (`@contractshield/license-online`) - Commercial
  - Online validation via LemonSqueezy API
  - 24-hour license cache with secure storage (~/.contractshield/)
  - Graceful degradation to OSS mode on network failure
  - Instance activation tracking (limit enforcement)
  - `validateLicense()` - Async validation with caching
  - `deactivateLicense()` - Remove instance activation
  - `checkFeature()` - Verify feature availability
  - `gateFeature()` - Gate Pro features with warning on unavailable
  - Cache utilities: `clearCache()`, `clearAllCaches()`, `getCacheStats()`

- **Internal Licensing Documentation** (`docs/internal/licensing.md`)
  - Architecture overview with flowcharts
  - LemonSqueezy setup guide
  - Enterprise license generation
  - Troubleshooting guide
  - Files to keep private

- **Comprehensive Documentation Export** (`DOCUMENTATION_EXPORT.md`)
  - Complete API reference for all packages
  - Configuration options and environment variables
  - Contract format documentation (JSON Schema, CEL)
  - Complete examples (Express, Fastify, E-commerce)
  - Deployment patterns guide

### Changed

- Renamed all remaining "Guardrails" references to "ContractShield"
- Updated internal documentation structure

## [1.1.0] - 2026-01-17

### Added

- **Policy Hot Reload** for embedded deployment
  - `PolicyHotReloader` class with file watching
  - Debounced reload (500ms default)
  - Validation before applying new policy
  - `onReload` and `onError` callbacks
  - Auto-enabled in development mode

- **Unix Socket Support** for sidecar deployment
  - `unixSocket` configuration option
  - ~0.1ms latency (vs ~1-5ms HTTP)
  - Shared volume support for Kubernetes
  - Can run alongside HTTP server

- **`@contractshield/client` SDK** for centralized deployment
  - LRU cache with configurable TTL
  - Automatic retry with backoff
  - Fail-open/fail-closed modes
  - Unix socket support
  - Cache statistics and health checks

- **Enhanced Health Checks**
  - Detailed `/health` endpoint with component status
  - `/live` liveness probe
  - `/ready` readiness probe with dependency checks
  - Redis and policy validation status

- **Prometheus Metrics**
  - `contractshield_decisions_total` (counter by action)
  - `contractshield_eval_latency_ms` (histogram with buckets)
  - `contractshield_policy_routes` (gauge)
  - `contractshield_errors_total` (counter by type)
  - `contractshield_cache_hits_total` / `cache_misses_total`

### Improved

- Sidecar latency reduced from ~1-5ms to ~0.1ms with Unix socket
- Centralized deployment resilience with client-side caching
- Better observability with detailed health status
- Updated `docs/deployment.md` with new features

## [1.0.0] - 2026-01-17

### Added

- 🎉 **Sink-aware RASP** (`@contractshield/sink-rasp`) - Commercial
  - **Command execution protection** (child_process hooks)
    - `exec`, `execSync`, `spawn`, `spawnSync`, `execFile`, `execFileSync`
    - Detects: semicolon chaining, pipes, backticks, $() substitution, && / ||
    - Detects dangerous commands: rm, curl, wget, bash, python, etc.
  - **Filesystem protection** (fs hooks)
    - `readFile`, `writeFile`, `unlink`, `readdir`, `stat` (sync and async)
    - Detects: path traversal (`../`), URL-encoded traversal, sensitive paths
    - Protects: /etc/passwd, /proc, /home, .ssh, .aws, etc.
  - **HTTP egress protection** (SSRF prevention)
    - `http.request`, `https.request`, `fetch`
    - Blocks: private IPs (127.x, 10.x, 192.168.x, 172.16-31.x)
    - Blocks: cloud metadata (169.254.169.254, metadata.google.internal)
    - Blocks: dangerous protocols (file://, gopher://, dict://)
  - **Request context tracking**
    - AsyncLocalStorage for correlating RASP events to HTTP requests
    - Express middleware: `expressContextMiddleware()`
    - Fastify plugin: `fastifyContextPlugin`
  - **Operation modes**
    - `monitor`: Log detections without blocking
    - `enforce`: Block dangerous operations
  - **Structured logging** for SIEM integration
    - JSON format with timestamp, sink, operation, reason, requestId
    - Configurable reporter with redaction
  - **License enforcement**
    - Requires valid license with `sink-rasp` feature
    - Works with `@contractshield/license` package

- **Analyzers** (usable standalone)
  - `analyzeCommand()` - Command injection detection
  - `analyzePath()` - Path traversal detection
  - `analyzeUrl()` - SSRF detection

- **Documentation** (`docs/sink-rasp.md`)
  - Configuration guide
  - Detection examples
  - SIEM integration
  - Performance notes

### Changed

- Project marked as **production ready** (v1.0)
- `@contractshield/sink-rasp` version bumped to 1.0.0

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
