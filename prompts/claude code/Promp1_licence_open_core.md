# Setup Open Core License Infrastructure

## Contexte
ContractShield utilise un modèle Open Core :
- **Core** : Apache 2.0 (gratuit, public)
- **Pro/Enterprise** : Commercial (payant, licence requise)

Ce sprint met en place l'infrastructure de licence pour la version production.

**Important** :
- Respecter la structure existante
- Mettre à jour `todo.md` et `CHANGELOG.md`
- Suivre les conventions de code existantes

## Structure cible
````
contractshield/
├── LICENSE                          # Apache 2.0
├── CLA.md                           # Contributor License Agreement
├── packages/
│   ├── pdp/                         # Apache 2.0
│   ├── pep-express/                 # Apache 2.0
│   ├── pep-fastify/                 # Apache 2.0
│   ├── sidecar/                     # Apache 2.0
│   └── license/                     # Apache 2.0 (vérification uniquement)
├── pro/                             # Commercial
│   ├── LICENSE                      # Propriétaire
│   ├── sink-rasp/                   # Commercial
│   └── compliance-packs/            # Commercial
├── tools/
│   └── license-generator/           # Interne (pas publié)
└── docs/
    └── licensing.md
````

## Tâches

### 1. Fichiers de licence

**LICENSE** (racine) — Apache 2.0 :
````
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION
...
[Texte complet Apache 2.0]
````

**pro/LICENSE** — Propriétaire :
````
ContractShield Pro/Enterprise License Agreement
Copyright (c) 2026 ContractShield

PROPRIETARY AND CONFIDENTIAL

This software and associated documentation files (the "Software") are 
proprietary to ContractShield. Unauthorized copying, modification, 
distribution, or use of this Software is strictly prohibited without 
a valid commercial license.

To obtain a license, visit: https://contractshield.dev/pricing
Contact: license@contractshield.dev

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
````

**CLA.md** :
````markdown
# Contributor License Agreement

By submitting a pull request or otherwise contributing to ContractShield, 
you agree to the following terms:

## 1. Definitions
- "You" means the individual or entity submitting a Contribution.
- "Contribution" means any code, documentation, or other material submitted.

## 2. Grant of Rights
You grant to ContractShield a perpetual, worldwide, non-exclusive, 
royalty-free, irrevocable license to:
- Use, copy, modify, and distribute your Contribution
- Sublicense your Contribution as part of ContractShield (open source or commercial)
- Create derivative works from your Contribution

## 3. Representations
You represent that:
- You have the legal right to grant this license
- Your Contribution is your original work
- Your Contribution does not violate any third-party rights

## 4. No Obligation
ContractShield is not obligated to use your Contribution.
````

### 2. Package @contractshield/license
**Dossier** : `packages/license/`

Ce package permet de vérifier les licences (utilisé par les packages Pro).
````typescript
// packages/license/src/index.ts
export { verifyLicense, type License, type LicensePayload } from './verify';
export { LicenseError } from './errors';
````
````typescript
// packages/license/src/types.ts
export interface LicensePayload {
  // Identifiants
  id: string;              // UUID de la licence
  customer: string;        // Nom du client
  email: string;           // Email de contact
  
  // Plan
  plan: 'pro' | 'enterprise';
  seats?: number;          // Nombre de sièges (enterprise)
  
  // Features autorisées
  features: string[];      // ['sink-rasp', 'policy-ui', 'compliance-pci']
  
  // Dates
  iat: number;             // Issued at (timestamp)
  exp: number;             // Expiration (timestamp)
}

export interface License {
  valid: boolean;
  expired: boolean;
  expiresAt?: Date;
  customer?: string;
  email?: string;
  plan?: 'pro' | 'enterprise';
  features?: string[];
  seats?: number;
  error?: string;
}
````
````typescript
// packages/license/src/verify.ts
import * as crypto from 'crypto';
import type { License, LicensePayload } from './types';
import { LicenseError } from './errors';

// Clé publique embarquée (RSA 2048)
// Générée avec : openssl genrsa -out private.pem 2048
//                openssl rsa -in private.pem -pubout -out public.pem
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA... [À REMPLACER]
-----END PUBLIC KEY-----`;

export function verifyLicense(licenseKey: string): License {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { valid: false, expired: false, error: 'No license key provided' };
  }

  try {
    // Décoder le JWT manuellement (pas de dépendance externe)
    const parts = licenseKey.split('.');
    if (parts.length !== 3) {
      return { valid: false, expired: false, error: 'Invalid license format' };
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Vérifier la signature
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    
    const signature = Buffer.from(signatureB64, 'base64url');
    const isValid = verifier.verify(PUBLIC_KEY, signature);
    
    if (!isValid) {
      return { valid: false, expired: false, error: 'Invalid license signature' };
    }

    // Décoder le payload
    const payload: LicensePayload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    );

    // Vérifier expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return {
        valid: false,
        expired: true,
        expiresAt: new Date(payload.exp * 1000),
        customer: payload.customer,
        error: 'License expired'
      };
    }

    return {
      valid: true,
      expired: false,
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
      customer: payload.customer,
      email: payload.email,
      plan: payload.plan,
      features: payload.features,
      seats: payload.seats
    };

  } catch (err) {
    return { valid: false, expired: false, error: 'Failed to verify license' };
  }
}

export function requireLicense(licenseKey: string, requiredFeature?: string): LicensePayload {
  const license = verifyLicense(licenseKey);
  
  if (!license.valid) {
    throw new LicenseError(license.error || 'Invalid license');
  }
  
  if (requiredFeature && !license.features?.includes(requiredFeature)) {
    throw new LicenseError(
      `License does not include feature: ${requiredFeature}. ` +
      `Upgrade at https://contractshield.dev/pricing`
    );
  }
  
  return license as unknown as LicensePayload;
}

export function hasFeature(licenseKey: string, feature: string): boolean {
  const license = verifyLicense(licenseKey);
  return license.valid && (license.features?.includes(feature) ?? false);
}
````
````typescript
// packages/license/src/errors.ts
export class LicenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseError';
  }
}
````

### 3. Générateur de licences (interne)
**Dossier** : `tools/license-generator/`

Script pour générer des licences (utilisé en interne, pas publié).
````typescript
// tools/license-generator/generate.ts
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Charger la clé privée (NE JAMAIS COMMITER)
const PRIVATE_KEY_PATH = process.env.LICENSE_PRIVATE_KEY_PATH 
  || path.join(__dirname, '../../.secrets/private.pem');

interface GenerateLicenseOptions {
  customer: string;
  email: string;
  plan: 'pro' | 'enterprise';
  features: string[];
  seats?: number;
  validityDays?: number;  // default: 365
}

export function generateLicense(options: GenerateLicenseOptions): string {
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    id: crypto.randomUUID(),
    customer: options.customer,
    email: options.email,
    plan: options.plan,
    features: options.features,
    seats: options.seats,
    iat: now,
    exp: now + (options.validityDays || 365) * 24 * 60 * 60
  };

  // Header JWT
  const header = { alg: 'RS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  // Signer
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${headerB64}.${payloadB64}`);
  const signature = signer.sign(privateKey, 'base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    console.log('Usage: npx tsx generate.ts <customer> <email> <plan> <features>');
    console.log('Example: npx tsx generate.ts "Acme Corp" dev@acme.com pro sink-rasp,policy-ui');
    process.exit(1);
  }

  const [customer, email, plan, featuresStr] = args;
  const features = featuresStr.split(',');

  const license = generateLicense({
    customer,
    email,
    plan: plan as 'pro' | 'enterprise',
    features
  });

  console.log('\n=== LICENSE KEY ===\n');
  console.log(license);
  console.log('\n===================\n');
}
````

**Script de génération de clés RSA** :
````bash
# tools/license-generator/generate-keys.sh
#!/bin/bash

mkdir -p ../../.secrets
openssl genrsa -out ../../.secrets/private.pem 2048
openssl rsa -in ../../.secrets/private.pem -pubout -out ../../.secrets/public.pem

echo "Keys generated in .secrets/"
echo "IMPORTANT: Never commit private.pem!"
echo ""
echo "Copy public.pem content to packages/license/src/verify.ts"
````

### 4. Structure Pro (placeholder)
**Dossier** : `pro/`

Créer la structure pour les packages commerciaux (contenu minimal pour l'instant).
````typescript
// pro/sink-rasp/src/index.ts
import { requireLicense } from '@contractshield/license';

export interface SinkRaspOptions {
  licenseKey: string;
  // ... autres options
}

export function initSinkRasp(options: SinkRaspOptions) {
  // Vérifier la licence
  requireLicense(options.licenseKey, 'sink-rasp');
  
  console.log('[ContractShield] Sink RASP initialized (placeholder)');
  
  // TODO: Implémentation v1.0
}
````
````json
// pro/sink-rasp/package.json
{
  "name": "@contractshield/sink-rasp",
  "version": "0.0.1",
  "private": true,
  "description": "ContractShield Pro - Sink-aware RASP (requires license)",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "license": "SEE LICENSE IN LICENSE",
  "dependencies": {
    "@contractshield/license": "workspace:*"
  },
  "publishConfig": {
    "access": "restricted"
  }
}
````

### 5. Gitignore updates
````gitignore
# Secrets (NEVER commit)
.secrets/
private.pem
*.pem
!public.pem

# License keys (test)
*.license
````

### 6. Documentation
**docs/licensing.md** :
````markdown
# ContractShield Licensing

## Open Source (Apache 2.0)

The following packages are free and open source:

- `@contractshield/pdp` - Policy Decision Point
- `@contractshield/pep-express` - Express adapter
- `@contractshield/pep-fastify` - Fastify adapter
- `@contractshield/sidecar` - Sidecar server
- `@contractshield/cli` - CLI tools

You can use these packages in any project, commercial or not.

## Pro / Enterprise (Commercial)

The following packages require a commercial license:

| Package | Feature | Pro | Enterprise |
|---------|---------|-----|------------|
| `@contractshield/sink-rasp` | Sink-aware RASP | ✅ | ✅ |
| `@contractshield/policy-ui` | Visual policy editor | ✅ | ✅ |
| `@contractshield/compliance-pci` | PCI-DSS pack | ❌ | ✅ |
| `@contractshield/compliance-hipaa` | HIPAA pack | ❌ | ✅ |

### Obtaining a License

1. Visit [contractshield.dev/pricing](https://contractshield.dev/pricing)
2. Choose your plan (Pro or Enterprise)
3. Complete payment
4. Receive your license key via email

### Using Your License
```typescript
import { initSinkRasp } from '@contractshield/sink-rasp';

initSinkRasp({
  licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
  // ... other options
});
```

### License Verification

Licenses are verified offline using RSA signatures. No network call required.

### License Terms

- Licenses are per-organization (unlimited developers)
- Annual renewal required
- See full terms at [contractshield.dev/terms](https://contractshield.dev/terms)

## Contributing

By contributing to ContractShield, you agree to our [CLA](../CLA.md).
````

### 7. Mettre à jour package.json racine
````json
{
  "name": "contractshield",
  "private": true,
  "workspaces": [
    "packages/*",
    "pro/*"
  ],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "generate-license": "npx tsx tools/license-generator/generate.ts"
  }
}
````

### 8. Tests
**packages/license/src/\_\_tests\_\_/verify.test.ts** :
````typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { verifyLicense, hasFeature } from '../verify';

// License de test générée avec les clés de test
const VALID_LICENSE = 'eyJhbGciOiJS...'; // À générer
const EXPIRED_LICENSE = 'eyJhbGciOiJS...'; // À générer
const INVALID_LICENSE = 'invalid.license.key';

describe('verifyLicense', () => {
  it('returns valid for a valid license', () => {
    const result = verifyLicense(VALID_LICENSE);
    expect(result.valid).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.customer).toBeDefined();
  });

  it('returns expired for an expired license', () => {
    const result = verifyLicense(EXPIRED_LICENSE);
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
  });

  it('returns invalid for a malformed license', () => {
    const result = verifyLicense(INVALID_LICENSE);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns invalid for empty input', () => {
    const result = verifyLicense('');
    expect(result.valid).toBe(false);
  });
});

describe('hasFeature', () => {
  it('returns true if license has feature', () => {
    expect(hasFeature(VALID_LICENSE, 'sink-rasp')).toBe(true);
  });

  it('returns false if license missing feature', () => {
    expect(hasFeature(VALID_LICENSE, 'unknown-feature')).toBe(false);
  });
});
````

### 9. CHANGELOG
````markdown
## [0.3.1] - 2026-XX-XX

### Added
- Open Core licensing infrastructure
- `@contractshield/license` package for license verification
- License generator tool (internal)
- CLA (Contributor License Agreement)
- Pro package structure (placeholder)
- Licensing documentation

### Changed
- Updated .gitignore for secrets
- Added workspaces for pro/ packages
````

## Contraintes

- La clé privée ne doit JAMAIS être commitée
- La vérification de licence doit fonctionner offline
- Pas de dépendances externes dans @contractshield/license (crypto natif Node)
- Les packages Pro sont `private: true` jusqu'à publication restreinte

## Ordre d'implémentation

1. Fichiers LICENSE, CLA.md — 10 min
2. Générer les clés RSA — 5 min
3. Package @contractshield/license — 1h
4. License generator tool — 30 min
5. Structure pro/ avec placeholder — 20 min
6. Tests — 30 min
7. Documentation — 20 min
8. CHANGELOG — 5 min

Commence par générer les clés RSA et mettre la clé publique dans le code de vérification.