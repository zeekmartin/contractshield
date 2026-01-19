# Analyse prompt5 - Learning Mode Pro

## 1. Résumé Exécutif

Le Learning Mode est une feature Pro/Enterprise qui:
- **Observe** le trafic API en temps réel
- **Analyse** les patterns (schéma, invariants, anomalies, vulnérabilités)
- **Suggère** des règles de sécurité en YAML/JSON
- **S'intègre** via CLI ou API programmatique

**Complexité estimée:** Haute (≈1500-2000 lignes de code)
**Risque non-régression:** Moyen (nouveau package isolé)
**Risque sécurité:** Élevé (manipulation de données sensibles)
**Risque performance:** Élevé (sampling en production)

---

## 2. Impacts sur le Codebase

### 2.1 Nouveau Package

```
pro/learning/                    # ~1500 lignes estimées
├── src/
│   ├── index.ts                # Entry point
│   ├── types.ts                # ~200 lignes (interfaces)
│   ├── collector/              # ~300 lignes
│   │   ├── sampler.ts
│   │   └── redactor.ts
│   ├── storage/                # ~400 lignes
│   │   ├── file.ts
│   │   ├── memory.ts
│   │   └── redis.ts
│   ├── analyzers/              # ~600 lignes
│   │   ├── schema.ts
│   │   ├── ranges.ts
│   │   ├── invariants.ts
│   │   ├── anomalies.ts
│   │   └── vulnerabilities.ts
│   ├── suggester/              # ~300 lignes
│   └── cli/                    # ~200 lignes
└── package.json
```

### 2.2 Modifications Requises

| Package | Impact | Description |
|---------|--------|-------------|
| `@contractshield/pep-express` | Moyen | Hook `onAfterResponse` à ajouter |
| `@contractshield/pep-fastify` | Moyen | Hook `onAfterResponse` à ajouter |
| `@contractshield/license` | Faible | Nouvelle feature `learning` à gater |
| `pnpm-workspace.yaml` | Trivial | Déjà inclut `pro/*` |

### 2.3 Nouvelles Dépendances

```json
{
  "dependencies": {
    "minimatch": "^9.0.0",      // Pattern matching pour redactor
    "commander": "^11.0.0",     // CLI
    "yaml": "^2.3.0"            // Output formatters
  }
}
```

**Impact bundle size:** ~150KB minifié

---

## 3. Analyse Non-Régression

### 3.1 Points de Contact avec Code Existant

| Point | Risque | Mitigation |
|-------|--------|------------|
| Hook middleware Express/Fastify | Moyen | Opt-in, async, fire-and-forget |
| Storage Redis (si réutilisé) | Faible | Namespace séparé `cs:learn:` |
| Types partagés | Faible | Extends `RequestContext` existant |
| CLI bin entry | Faible | Nouveau binaire isolé |

### 3.2 Tests de Non-Régression Requis

```
□ Express middleware continue de fonctionner sans learning
□ Fastify plugin continue de fonctionner sans learning
□ Performance: latence < 1ms ajoutée par le hook
□ Memory: pas de leak sur sampling prolongé
□ Redis: namespace learning isolé du replay store
□ Graceful shutdown: collector flush avant exit
```

### 3.3 Backward Compatibility

| Aspect | Status |
|--------|--------|
| API existante | ✅ Aucun changement |
| Types existants | ✅ Extends uniquement |
| Configuration | ✅ Nouvelle section `learning:` |
| CLI existant | ✅ Nouveau binaire séparé |

---

## 4. Analyse Sécurité

### 4.1 Risques Identifiés

| Risque | Sévérité | Description |
|--------|----------|-------------|
| **Data leakage** | Critique | Samples contiennent données sensibles |
| **Storage exposure** | Haute | Fichiers/Redis peuvent être accédés |
| **PII retention** | Haute | RGPD: durée de rétention |
| **Attack amplification** | Moyenne | Samples d'attaques stockées |
| **DoS via storage** | Moyenne | Remplissage disque/mémoire |

### 4.2 Mitigations Obligatoires

#### 4.2.1 Redaction Automatique

```typescript
// Patterns sensibles BUILT-IN (non configurables)
const ALWAYS_REDACT = [
  'password', 'token', 'secret', 'apikey', 'api_key',
  'authorization', 'creditcard', 'credit_card', 'cvv',
  'ssn', 'social_security', 'bearer', 'cookie',
  'session', 'jwt', 'private_key', 'privatekey'
];

// Headers JAMAIS stockés
const FORBIDDEN_HEADERS = [
  'authorization', 'cookie', 'x-api-key', 'x-auth-token'
];
```

#### 4.2.2 Chiffrement au Repos

```typescript
// storage/file.ts - Chiffrement obligatoire
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export class EncryptedFileStorage implements Storage {
  private key: Buffer; // Dérivé de CONTRACTSHIELD_STORAGE_KEY ou généré

  async store(sample: RequestSample): Promise<void> {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(sample), 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    // Format: IV (16) + AuthTag (16) + Encrypted
    const data = Buffer.concat([iv, authTag, encrypted]);
    await fs.writeFile(path, data);
  }
}
```

#### 4.2.3 Permissions Fichiers

```typescript
// Mode 0600 (owner read/write only)
fs.writeFileSync(path, data, { mode: 0o600 });

// Répertoire learning isolé
const LEARNING_DIR = path.join(os.homedir(), '.contractshield', 'learning');
fs.mkdirSync(LEARNING_DIR, { mode: 0o700, recursive: true });
```

#### 4.2.4 TTL et Auto-Purge

```typescript
interface StorageOptions {
  ttl: number;           // Default: 7 jours
  maxSize: string;       // Default: '500MB'
  maxSamplesPerRoute: number; // Default: 10000
  autoPurge: boolean;    // Default: true
}

// Cron de purge automatique
setInterval(() => {
  storage.purgeExpired();
  storage.enforceMaxSize();
}, 60 * 60 * 1000); // Toutes les heures
```

### 4.3 Audit Trail

```typescript
// Chaque opération learning doit être loggée
interface LearningAuditEvent {
  timestamp: string;
  action: 'start' | 'stop' | 'analyze' | 'suggest' | 'apply' | 'purge';
  user?: string;        // Si CLI avec auth
  samplesAffected?: number;
  details?: string;
}

// Log vers fichier séparé
const auditLog = createWriteStream(AUDIT_LOG_PATH, { flags: 'a' });
```

### 4.4 Checklist Sécurité

```
□ Redaction automatique des champs sensibles
□ Headers auth JAMAIS stockés
□ Chiffrement AES-256-GCM au repos
□ Permissions fichiers 0600/0700
□ TTL configurable avec purge auto
□ Rate limiting sur collect()
□ Validation licence avant activation
□ Audit log de toutes les opérations
□ Pas de données PII en mode debug
□ Sanitization des paths (anti path-traversal)
```

---

## 5. Gestion des Tailles de Log/Storage

### 5.1 Estimation des Volumes

| Métrique | Valeur | Calcul |
|----------|--------|--------|
| Taille sample moyen | ~2 KB | JSON avec body moyen |
| Sample rate recommandé | 10% | 0.1 |
| Requêtes/jour typiques | 1M | API moyenne |
| Samples/jour | 100K | 1M × 10% |
| Volume/jour | ~200 MB | 100K × 2KB |
| Volume/semaine | ~1.4 GB | 200MB × 7 |

### 5.2 Stratégies de Limitation

#### 5.2.1 Sampling Adaptatif

```typescript
export class AdaptiveSampler {
  private rate: number;
  private targetSamplesPerMinute: number;
  private recentCount: number = 0;
  private lastReset: number = Date.now();

  shouldSample(): boolean {
    const now = Date.now();

    // Reset compteur chaque minute
    if (now - this.lastReset > 60000) {
      // Ajuster le rate si on dépasse la cible
      if (this.recentCount > this.targetSamplesPerMinute * 1.5) {
        this.rate = Math.max(0.01, this.rate * 0.8);
      } else if (this.recentCount < this.targetSamplesPerMinute * 0.5) {
        this.rate = Math.min(1.0, this.rate * 1.2);
      }
      this.recentCount = 0;
      this.lastReset = now;
    }

    if (Math.random() < this.rate) {
      this.recentCount++;
      return true;
    }
    return false;
  }
}
```

#### 5.2.2 Limites par Route

```typescript
interface RouteQuota {
  route: string;
  maxSamples: number;     // Par période
  currentCount: number;
  periodStart: Date;
}

// Exemple config
const quotas: RouteQuota[] = [
  { route: 'POST /orders', maxSamples: 50000 },
  { route: 'GET /products', maxSamples: 10000 },  // Moins intéressant
  { route: '*', maxSamples: 5000 }                // Default
];
```

#### 5.2.3 Compression

```typescript
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Compression ~80% pour JSON
async function compressSample(sample: RequestSample): Promise<Buffer> {
  const json = JSON.stringify(sample);
  return gzipAsync(json, { level: 6 }); // Balance speed/ratio
}
```

#### 5.2.4 Rotation des Fichiers

```typescript
interface RotationConfig {
  maxFileSize: string;      // '100MB'
  maxFiles: number;         // 10
  compress: boolean;        // true
}

// Rotation automatique
// learning-2024-01-19-001.json.gz
// learning-2024-01-19-002.json.gz
// ...
```

### 5.3 Recommandations de Dimensionnement

| Trafic API | Sample Rate | Storage | Retention |
|------------|-------------|---------|-----------|
| < 100K/jour | 50% | 500MB | 14 jours |
| 100K-1M/jour | 10% | 1GB | 7 jours |
| 1M-10M/jour | 1% | 2GB | 3 jours |
| > 10M/jour | 0.1% | 5GB | 1 jour |

### 5.4 Alertes de Capacité

```typescript
interface StorageMetrics {
  usedBytes: number;
  maxBytes: number;
  usagePercent: number;
  oldestSample: Date;
  sampleCount: number;
}

// Alertes
const THRESHOLDS = {
  WARNING: 0.7,   // 70% utilisé
  CRITICAL: 0.9,  // 90% utilisé
  EMERGENCY: 0.95 // 95% → purge forcée
};

function checkStorageHealth(metrics: StorageMetrics): void {
  if (metrics.usagePercent >= THRESHOLDS.EMERGENCY) {
    storage.purgeOldest(0.2); // Libérer 20%
    logger.error('[Learning] Emergency purge triggered');
  } else if (metrics.usagePercent >= THRESHOLDS.CRITICAL) {
    logger.warn('[Learning] Storage critical - purge recommended');
  }
}
```

---

## 6. Performance

### 6.1 Impact sur Latence

| Opération | Latence Ajoutée | Condition |
|-----------|-----------------|-----------|
| `shouldSample()` | < 0.01ms | Toujours |
| `collect()` (async) | 0ms blocking | Fire-and-forget |
| `redact()` | ~0.1ms | Si sampled |
| `store()` | ~1-5ms | Async, non-blocking |

**Impact total sur latence P99:** < 0.1ms (async)

### 6.2 Impact sur Mémoire

| Composant | Mémoire | Notes |
|-----------|---------|-------|
| Sampler | < 1KB | Stateless |
| Redactor | < 1KB | Patterns compilés |
| Memory Storage | Variable | Selon config `maxSize` |
| File Buffer | ~10MB | Buffer d'écriture |

**Recommandation:** Limiter Memory Storage à 100MB max

### 6.3 Impact sur CPU

- **Sampling:** Négligeable (Math.random)
- **Redaction:** ~0.1ms/sample (récursif)
- **Analyse:** Heavy mais offline (CLI)

---

## 7. Intégration avec Existing Code

### 7.1 Hook Middleware

```typescript
// packages/pep-express/src/middleware.ts

// À AJOUTER
export interface ContractShieldMiddlewareHooks {
  onBeforeEvaluate?: (ctx: RequestContext) => void;
  onAfterEvaluate?: (ctx: RequestContext, decision: Decision) => void;
  onAfterResponse?: (ctx: RequestContext, response: ResponseInfo) => void;  // NEW
}

// Dans le middleware
if (hooks.onAfterResponse) {
  res.on('finish', () => {
    const responseInfo = {
      status: res.statusCode,
      latency: Date.now() - startTime
    };
    // Fire-and-forget, ne pas bloquer
    setImmediate(() => hooks.onAfterResponse!(ctx, responseInfo));
  });
}
```

### 7.2 License Gating

```typescript
// pro/learning/src/index.ts

import { requireLicense } from '@contractshield/license';

export function enableLearning(shield: any, options: LearningOptions): void {
  // Vérifier licence Pro
  requireLicense(options.licenseKey || process.env.CONTRACTSHIELD_LICENSE_KEY, 'learning');

  // ... reste de l'implémentation
}
```

---

## 8. Risques et Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Data leak via samples | Moyenne | Critique | Redaction + encryption |
| Disk full | Moyenne | Haute | Quotas + auto-purge |
| Memory leak | Faible | Haute | Limites + monitoring |
| Performance degradation | Faible | Moyenne | Async + rate limiting |
| RGPD violation | Moyenne | Haute | TTL + purge + consent |
| Wrong suggestions | Moyenne | Moyenne | Confidence scores + review |

---

## 9. Checklist Avant Implémentation

### 9.1 Pré-requis

```
□ License feature 'learning' ajoutée au système de licences
□ Hook onAfterResponse ajouté aux adapters Express/Fastify
□ Tests de non-régression des adapters passent
□ Documentation de la feature rédigée
```

### 9.2 Implémentation

```
□ Types et interfaces définis
□ Storage (file) avec encryption
□ Redactor avec patterns sensibles
□ Collector avec sampling adaptatif
□ Analyseurs (schema, invariants, vulns)
□ Suggester avec formatters YAML/JSON
□ CLI avec commandes complètes
□ Tests unitaires (>80% coverage)
□ Tests d'intégration
```

### 9.3 Sécurité

```
□ Revue sécurité du redactor
□ Audit du chiffrement
□ Test de fuzzing sur les analyzers
□ Vérification des permissions fichiers
□ Test RGPD (purge, export, delete)
```

### 9.4 Production

```
□ Documentation utilisateur
□ Métriques Prometheus ajoutées
□ Alertes de capacité configurées
□ Runbook opérationnel
```

---

## 10. Conclusion

Le Learning Mode est une feature **complexe mais isolée** qui:
- ✅ N'impacte pas le core existant (nouveau package)
- ✅ Opt-in uniquement (pas d'impact par défaut)
- ⚠️ Nécessite une attention particulière à la sécurité
- ⚠️ Nécessite un monitoring du storage

**Recommandation:** Implémenter en phases
1. Phase 1: Types + Storage + Collector (base)
2. Phase 2: Analyzers (schema, vulns)
3. Phase 3: Suggester + CLI
4. Phase 4: Hardening sécurité + monitoring

**Estimation effort:** 3-5 jours développeur senior
