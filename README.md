<div align="center">
  <h1>ContractShield</h1>
  <p><strong>Contract-first API security for Node.js</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@cshield/core"><img src="https://img.shields.io/npm/v/@cshield/core?label=core" alt="npm"></a>
    <a href="https://www.npmjs.com/package/@cshield/pro"><img src="https://img.shields.io/npm/v/@cshield/pro?label=pro" alt="npm pro"></a>
    <a href="https://github.com/zeekmartin/contractshield/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License"></a>
    <a href="https://docs.contractshield.dev/security/asvs"><img src="https://contractshield.dev/badges/owasp-asvs-badge.svg" alt="OWASP ASVS Level 1"></a>
  </p>

  <p>
    <a href="https://contractshield.dev">Website</a> •
    <a href="https://docs.contractshield.dev">Docs</a> •
    <a href="https://github.com/zeekmartin/contractshield/discussions">Community</a>
  </p>
</div>

---

## Installation

```bash
# Open Source
npm install @cshield/core

# Pro (RASP + Learning Mode)
npm install @cshield/pro
```

## Quick Start

```typescript
import { contractshield } from '@cshield/core';

app.use(contractshield({
  policy: './policy.yaml'
}));
```

## Features

### Open Source
- Contract Validation (JSON Schema + CEL)
- Vulnerability Detection
- Express, Fastify adapters
- Prometheus metrics

### Pro
- Sink-aware RASP
- Learning Mode
- Policy Hot Reload
- Priority Support

## Documentation

[docs.contractshield.dev](https://docs.contractshield.dev)

## License

- Open Source: [Apache 2.0](LICENSE)
- Pro: [Commercial](COMMERCIAL.md)
