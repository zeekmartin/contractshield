# ContractShield Spring Boot Starter

[![Maven Central](https://img.shields.io/maven-central/v/dev.contractshield/contractshield-spring-boot-starter?label=Maven%20Central)](https://central.sonatype.com/artifact/dev.contractshield/contractshield-spring-boot-starter)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Java](https://img.shields.io/badge/Java-17%2B-blue)](https://openjdk.org/)
[![OWASP ASVS Level 1](https://contractshield.dev/badges/owasp-asvs-badge.svg)](https://docs.contractshield.dev/security/asvs)

**Contract-First API Security for Spring Boot**

Protect your business logic, not just your formats. ContractShield validates API requests at the application layer using JSON Schema and CEL expressions.

## Installation

### Maven

```xml
<dependency>
    <groupId>dev.contractshield</groupId>
    <artifactId>contractshield-spring-boot-starter</artifactId>
    <version>1.5.4</version>
</dependency>
```

### Gradle

```groovy
implementation 'dev.contractshield:contractshield-spring-boot-starter:1.5.4'
```

## Quick Start

Add your OpenAPI spec and enable ContractShield in `application.yml`:

```yaml
contractshield:
  enabled: true
  openapi-path: classpath:openapi.yaml
  vulnerability-scan: true
```

ContractShield auto-configures a servlet filter that validates every incoming request against your OpenAPI contract.

## Modules

| Module | Description |
|--------|-------------|
| `contractshield-core` | JSON Schema validation, vulnerability detection, OpenAPI parsing |
| `contractshield-spring-boot-starter` | Spring Boot auto-configuration and filter |
| `contractshield-spring-boot-starter-test` | Test utilities for Spring apps |

## Features

- **Contract Validation** — JSON Schema + CEL business rules from your OpenAPI spec
- **Vulnerability Detection** — SQLi, XSS, path traversal, prototype pollution
- **Spring Boot Auto-Configuration** — Zero-config setup with `application.yml`
- **Actuator Integration** — Health indicators and metrics

## Security & Compliance

- **OWASP ASVS Level 1** — Input validation (V5), API security (V13), access control (V4). [Full compliance map →](https://docs.contractshield.dev/security/asvs)
- **OWASP API Security Top 10** — Protection against API1 (BOLA), API6 (Mass Assignment), API7 (SSRF), API8 (Injection)
- **CWE Coverage** — CWE-22, CWE-78, CWE-89, CWE-639, CWE-915, CWE-918, CWE-943, CWE-1321

## Documentation

- [Full Documentation](https://docs.contractshield.dev)
- [API Reference](https://docs.contractshield.dev/api)
- [Examples](https://github.com/zeekmartin/contractshield/tree/main/contractshield-spring/examples)

## Links

- [Website](https://contractshield.dev)
- [GitHub](https://github.com/zeekmartin/contractshield)
- [npm packages](https://www.npmjs.com/org/cshield) (Node.js)
- [PyPI](https://pypi.org/project/contractshield/) (Python)
- [Maven Central](https://central.sonatype.com/artifact/dev.contractshield/contractshield-spring-boot-starter) (Java)

## License

Apache 2.0 - See [LICENSE](https://github.com/zeekmartin/contractshield/blob/main/LICENSE)
