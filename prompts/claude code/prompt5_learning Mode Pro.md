# Prompt Claude Code - Implémentation Learning Mode ContractShield Pro

## Contexte

ContractShield est un produit open-core de sécurité API pour Node.js. Le Learning Mode est une feature Pro/Enterprise qui observe le trafic API et suggère automatiquement des règles de sécurité basées sur les patterns détectés.

## Objectif

Implémenter le Learning Mode complet dans le package `@contractshield/pro` avec :
1. Collecteur de samples asynchrone
2. Analyseurs de patterns
3. Générateur de suggestions YAML
4. CLI pour gérer le learning

## Architecture existante

```
packages/
├── core/           # Types partagés
├── pdp/            # Policy Decision Point (évaluation)
├── node/           # Middleware Express/Fastify
└── pro/            # Features Pro (à implémenter ici)
    └── sink-rasp/  # RASP existant
```

## Spécifications techniques

### 1. Structure des fichiers à créer

```
packages/pro/learning/
├── src/
│   ├── index.ts              # Entry point, exports publics
│   ├── types.ts              # Interfaces et types
│   ├── collector/
│   │   ├── index.ts          # Collecteur principal
│   │   ├── sampler.ts        # Logique de sampling
│   │   └── redactor.ts       # Redaction des champs sensibles
│   ├── storage/
│   │   ├── index.ts          # Interface storage
│   │   ├── file.ts           # File-based storage
│   │   ├── memory.ts         # In-memory storage
│   │   └── redis.ts          # Redis storage (optionnel)
│   ├── analyzers/
│   │   ├── index.ts          # Orchestrateur d'analyseurs
│   │   ├── schema.ts         # Inférence de schéma JSON
│   │   ├── ranges.ts         # Détection de plages numériques
│   │   ├── invariants.ts     # Découverte d'invariants
│   │   ├── anomalies.ts      # Détection d'anomalies
│   │   └── vulnerabilities.ts # Patterns d'attaque
│   ├── suggester/
│   │   ├── index.ts          # Générateur de suggestions
│   │   ├── confidence.ts     # Calcul des scores de confiance
│   │   └── formatter.ts      # Formatage YAML/JSON
│   └── cli/
│       ├── index.ts          # CLI entry point
│       ├── start.ts          # Commande start
│       ├── status.ts         # Commande status
│       ├── analyze.ts        # Commande analyze
│       ├── suggest.ts        # Commande suggest
│       └── apply.ts          # Commande apply
├── package.json
├── tsconfig.json
└── README.md
```

### 2. Types principaux (types.ts)

```typescript
// Configuration du Learning Mode
export interface LearningConfig {
  enabled: boolean;
  duration: string;              // '7d', '24h', etc.
  sampleRate: number;            // 0.0 - 1.0
  storage: 'memory' | 'file' | 'redis';
  storageOptions?: StorageOptions;
  output: string;                // Path pour le YAML généré
  minConfidence: number;         // 0.0 - 1.0
  excludeRoutes: string[];
  redactFields: string[];
  analyzers: AnalyzerConfig;
}

export interface StorageOptions {
  path?: string;           // File storage
  redisUrl?: string;       // Redis storage
  ttl?: number;            // Retention en secondes
  maxSize?: string;        // '500MB'
  maxSamplesPerRoute?: number;
}

export interface AnalyzerConfig {
  schemaInference: boolean;
  rangeDetection: boolean;
  invariantDiscovery: boolean;
  anomalyDetection: boolean;
  vulnerabilityScanning: boolean;
}

// Sample collecté
export interface RequestSample {
  id: string;
  timestamp: string;
  route: string;              // 'POST /orders'
  method: string;
  path: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, unknown>;
  headers?: Record<string, string>;  // Subset autorisé
  body?: unknown;
  identity?: {
    authenticated?: boolean;
    subject?: string;         // Hashé si configuré
    tenant?: string;
    scopes?: string[];
  };
  response?: {
    status: number;
    latency: number;
  };
}

// Résultat d'analyse
export interface AnalysisResult {
  route: string;
  sampleCount: number;
  period: { start: string; end: string };
  
  // Par analyseur
  schema?: InferredSchema;
  ranges?: FieldRange[];
  invariants?: Invariant[];
  anomalies?: Anomaly[];
  vulnerabilities?: VulnerabilityPattern[];
}

export interface InferredSchema {
  type: string;
  properties?: Record<string, InferredSchema>;
  items?: InferredSchema;
  required?: string[];
  // Stats
  observedIn: number;        // Nombre de samples
  confidence: number;
}

export interface FieldRange {
  field: string;             // 'body.items[].qty'
  type: 'number' | 'string' | 'array';
  stats: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  observedIn: number;
  confidence: number;
}

export interface Invariant {
  id: string;
  type: 'equality' | 'subset' | 'calculation' | 'format';
  fields: string[];
  expression: string;        // CEL expression
  evidence: string;
  observedIn: number;
  violations: number;
  confidence: number;
}

export interface Anomaly {
  type: 'outlier' | 'suspicious' | 'attack';
  severity: 'low' | 'medium' | 'high' | 'critical';
  field?: string;
  pattern: string;
  samples: string[];         // IDs des samples concernés
  evidence: string;
}

export interface VulnerabilityPattern {
  type: 'prototype-pollution' | 'path-traversal' | 'ssrf' | 'injection' | 'nosql';
  severity: 'critical' | 'high';
  field: string;
  sampleIds: string[];
  evidence: string;
}

// Suggestion générée
export interface Suggestion {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  category: 'vulnerability' | 'business-logic' | 'schema' | 'range';
  route?: string;
  evidence: string;
  recommendation: string;
  suggested: {
    type: 'vulnerability' | 'cel' | 'contract' | 'limit';
    action?: 'block' | 'monitor';
    config: unknown;
  };
}

export interface SuggestionsOutput {
  metadata: {
    version: string;
    generated: string;
    period: { start: string; end: string };
    stats: {
      totalRequests: number;
      sampledRequests: number;
      routesObserved: number;
      suggestionsGenerated: number;
    };
  };
  suggestions: Suggestion[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    byCategory: Record<string, number>;
  };
}
```

### 3. Collecteur (collector/index.ts)

```typescript
import { RequestSample, LearningConfig } from '../types';
import { Sampler } from './sampler';
import { Redactor } from './redactor';
import { Storage } from '../storage';

export class Collector {
  private sampler: Sampler;
  private redactor: Redactor;
  private storage: Storage;
  private config: LearningConfig;

  constructor(config: LearningConfig, storage: Storage) {
    this.config = config;
    this.storage = storage;
    this.sampler = new Sampler(config.sampleRate);
    this.redactor = new Redactor(config.redactFields);
  }

  /**
   * Appelé après chaque requête (async, non-bloquant)
   */
  async collect(ctx: RequestContext, response: ResponseInfo): Promise<void> {
    // 1. Vérifier si on doit sampler cette requête
    if (!this.sampler.shouldSample()) return;
    
    // 2. Vérifier si la route est exclue
    if (this.isExcluded(ctx.request.path)) return;
    
    // 3. Créer le sample
    const sample = this.createSample(ctx, response);
    
    // 4. Redacter les champs sensibles
    const redacted = this.redactor.redact(sample);
    
    // 5. Stocker de manière asynchrone
    setImmediate(() => {
      this.storage.store(redacted).catch(err => {
        console.error('[ContractShield Learning] Storage error:', err);
      });
    });
  }

  private isExcluded(path: string): boolean {
    return this.config.excludeRoutes.some(pattern => {
      // Support des wildcards simples
      if (pattern.endsWith('/*')) {
        return path.startsWith(pattern.slice(0, -2));
      }
      return path === pattern;
    });
  }

  private createSample(ctx: RequestContext, response: ResponseInfo): RequestSample {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      route: `${ctx.request.method} ${ctx.request.routeId || ctx.request.path}`,
      method: ctx.request.method,
      path: ctx.request.path,
      pathParams: ctx.request.params,
      queryParams: ctx.request.query,
      body: ctx.request.body,
      identity: ctx.identity ? {
        authenticated: ctx.identity.authenticated,
        subject: ctx.identity.subject,
        tenant: ctx.identity.tenant,
        scopes: ctx.identity.scopes
      } : undefined,
      response: {
        status: response.status,
        latency: response.latency
      }
    };
  }
}
```

### 4. Sampler probabiliste (collector/sampler.ts)

```typescript
export class Sampler {
  private rate: number;
  private counter: number = 0;
  
  constructor(rate: number) {
    this.rate = Math.max(0, Math.min(1, rate));
  }

  shouldSample(): boolean {
    // Reservoir sampling pour distribution uniforme
    this.counter++;
    return Math.random() < this.rate;
  }
  
  getStats(): { rate: number; checked: number } {
    return { rate: this.rate, checked: this.counter };
  }
}
```

### 5. Redactor (collector/redactor.ts)

```typescript
import { minimatch } from 'minimatch';

export class Redactor {
  private patterns: string[];
  
  constructor(patterns: string[]) {
    this.patterns = patterns;
  }

  redact<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    
    return this.redactObject(obj as Record<string, unknown>, '') as T;
  }

  private redactObject(obj: Record<string, unknown>, path: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (this.shouldRedact(key, currentPath)) {
        result[key] = '[REDACTED]';
      } else if (Array.isArray(value)) {
        result[key] = value.map((item, i) => 
          typeof item === 'object' && item !== null
            ? this.redactObject(item as Record<string, unknown>, `${currentPath}[]`)
            : item
        );
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactObject(value as Record<string, unknown>, currentPath);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  private shouldRedact(key: string, fullPath: string): boolean {
    const lowerKey = key.toLowerCase();
    
    // Patterns built-in
    const sensitiveKeys = ['password', 'token', 'secret', 'apikey', 'api_key', 
                          'authorization', 'creditcard', 'credit_card', 'cvv', 
                          'ssn', 'social_security'];
    if (sensitiveKeys.includes(lowerKey)) return true;
    
    // Patterns configurés
    return this.patterns.some(pattern => {
      if (pattern.includes('.') || pattern.includes('*')) {
        return minimatch(fullPath, pattern, { nocase: true });
      }
      return lowerKey === pattern.toLowerCase();
    });
  }
}
```

### 6. Storage Interface (storage/index.ts)

```typescript
import { RequestSample, LearningConfig } from '../types';

export interface Storage {
  store(sample: RequestSample): Promise<void>;
  getSamples(route?: string): Promise<RequestSample[]>;
  getRoutes(): Promise<string[]>;
  getStats(): Promise<StorageStats>;
  clear(): Promise<void>;
}

export interface StorageStats {
  totalSamples: number;
  byRoute: Record<string, number>;
  oldestSample: string;
  newestSample: string;
  storageSize: number;
}

export function createStorage(config: LearningConfig): Storage {
  switch (config.storage) {
    case 'memory':
      return new MemoryStorage(config.storageOptions);
    case 'redis':
      return new RedisStorage(config.storageOptions);
    case 'file':
    default:
      return new FileStorage(config.storageOptions);
  }
}
```

### 7. Analyseur de schéma (analyzers/schema.ts)

```typescript
import { RequestSample, InferredSchema } from '../types';

export class SchemaAnalyzer {
  analyze(samples: RequestSample[]): InferredSchema | null {
    if (samples.length === 0) return null;
    
    const bodies = samples
      .map(s => s.body)
      .filter(b => b !== undefined && b !== null);
    
    if (bodies.length === 0) return null;
    
    return this.inferSchema(bodies);
  }

  private inferSchema(values: unknown[]): InferredSchema {
    // Détecter le type dominant
    const types = values.map(v => this.getType(v));
    const typeCount = this.countTypes(types);
    const dominantType = this.getDominantType(typeCount);
    
    const schema: InferredSchema = {
      type: dominantType,
      observedIn: values.length,
      confidence: typeCount[dominantType] / values.length
    };

    if (dominantType === 'object') {
      schema.properties = this.inferObjectProperties(values.filter(v => typeof v === 'object' && v !== null && !Array.isArray(v)) as Record<string, unknown>[]);
      schema.required = this.inferRequired(values as Record<string, unknown>[]);
    } else if (dominantType === 'array') {
      const allItems = (values as unknown[][]).flat();
      if (allItems.length > 0) {
        schema.items = this.inferSchema(allItems);
      }
    }

    return schema;
  }

  private inferObjectProperties(objects: Record<string, unknown>[]): Record<string, InferredSchema> {
    const allKeys = new Set<string>();
    objects.forEach(obj => Object.keys(obj).forEach(k => allKeys.add(k)));
    
    const properties: Record<string, InferredSchema> = {};
    
    for (const key of allKeys) {
      const values = objects
        .map(obj => obj[key])
        .filter(v => v !== undefined);
      
      if (values.length > 0) {
        properties[key] = this.inferSchema(values);
      }
    }
    
    return properties;
  }

  private inferRequired(objects: Record<string, unknown>[]): string[] {
    if (objects.length === 0) return [];
    
    const allKeys = new Set<string>();
    objects.forEach(obj => Object.keys(obj).forEach(k => allKeys.add(k)));
    
    return Array.from(allKeys).filter(key => 
      objects.every(obj => key in obj && obj[key] !== undefined && obj[key] !== null)
    );
  }

  private getType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    return typeof value;
  }

  private countTypes(types: string[]): Record<string, number> {
    return types.reduce((acc, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private getDominantType(counts: Record<string, number>): string {
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0][0];
  }
}
```

### 8. Analyseur d'invariants (analyzers/invariants.ts)

```typescript
import { RequestSample, Invariant } from '../types';

export class InvariantAnalyzer {
  analyze(samples: RequestSample[]): Invariant[] {
    const invariants: Invariant[] = [];
    
    // 1. Détecter égalités identity <-> body
    invariants.push(...this.detectIdentityBodyEquality(samples));
    
    // 2. Détecter relations de calcul (total = sum)
    invariants.push(...this.detectCalculations(samples));
    
    // 3. Détecter patterns de format
    invariants.push(...this.detectFormatPatterns(samples));
    
    return invariants.filter(i => i.confidence >= 0.9);
  }

  private detectIdentityBodyEquality(samples: RequestSample[]): Invariant[] {
    const invariants: Invariant[] = [];
    
    // Chercher: identity.tenant == body.tenantId
    const withIdentity = samples.filter(s => s.identity?.tenant && s.body);
    if (withIdentity.length < 100) return invariants;
    
    // Trouver les champs body qui matchent identity.tenant
    const bodyFields = this.extractBodyFields(withIdentity[0].body);
    
    for (const field of bodyFields) {
      const matches = withIdentity.filter(s => {
        const bodyValue = this.getNestedValue(s.body, field);
        return bodyValue === s.identity?.tenant;
      });
      
      if (matches.length / withIdentity.length >= 0.95) {
        invariants.push({
          id: `invariant.tenant.${field.replace(/\./g, '_')}`,
          type: 'equality',
          fields: ['identity.tenant', `body.${field}`],
          expression: `identity.tenant == request.body.${field}`,
          evidence: `identity.tenant equals body.${field} in ${(matches.length / withIdentity.length * 100).toFixed(1)}% of requests`,
          observedIn: withIdentity.length,
          violations: withIdentity.length - matches.length,
          confidence: matches.length / withIdentity.length
        });
      }
    }
    
    // Même logique pour identity.subject == body.userId, etc.
    // ...
    
    return invariants;
  }

  private detectCalculations(samples: RequestSample[]): Invariant[] {
    const invariants: Invariant[] = [];
    
    // Chercher pattern: total == sum(items.map(i => i.price * i.qty))
    const withItems = samples.filter(s => {
      const body = s.body as any;
      return body?.items && Array.isArray(body.items) && body.total !== undefined;
    });
    
    if (withItems.length < 100) return invariants;
    
    const matches = withItems.filter(s => {
      const body = s.body as any;
      const calculated = body.items.reduce((sum: number, item: any) => {
        const price = item.price || item.unitPrice || 0;
        const qty = item.qty || item.quantity || 1;
        return sum + (price * qty);
      }, 0);
      return Math.abs(calculated - body.total) < 0.01; // Tolérance float
    });
    
    if (matches.length / withItems.length >= 0.95) {
      invariants.push({
        id: 'invariant.total.calculation',
        type: 'calculation',
        fields: ['body.total', 'body.items[].price', 'body.items[].qty'],
        expression: 'request.body.total == request.body.items.map(i, i.price * i.qty).sum()',
        evidence: `total == sum(items.price * items.qty) in ${(matches.length / withItems.length * 100).toFixed(1)}% of requests`,
        observedIn: withItems.length,
        violations: withItems.length - matches.length,
        confidence: matches.length / withItems.length
      });
    }
    
    return invariants;
  }

  private detectFormatPatterns(samples: RequestSample[]): Invariant[] {
    // Détecter des patterns regex récurrents (emails, UUIDs, SKUs...)
    // À implémenter
    return [];
  }

  private extractBodyFields(body: unknown, prefix = ''): string[] {
    if (!body || typeof body !== 'object') return [];
    
    const fields: string[] = [];
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      fields.push(path);
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        fields.push(...this.extractBodyFields(value, path));
      }
    }
    return fields;
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}
```

### 9. Détecteur de vulnérabilités (analyzers/vulnerabilities.ts)

```typescript
import { RequestSample, VulnerabilityPattern } from '../types';

export class VulnerabilityAnalyzer {
  analyze(samples: RequestSample[]): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];
    
    for (const sample of samples) {
      // Prototype Pollution
      const protoHits = this.detectPrototypePollution(sample);
      patterns.push(...protoHits);
      
      // Path Traversal
      const pathHits = this.detectPathTraversal(sample);
      patterns.push(...pathHits);
      
      // SSRF
      const ssrfHits = this.detectSSRF(sample);
      patterns.push(...ssrfHits);
      
      // NoSQL Injection
      const nosqlHits = this.detectNoSQLInjection(sample);
      patterns.push(...nosqlHits);
    }
    
    // Dédupliquer et agréger
    return this.aggregatePatterns(patterns);
  }

  private detectPrototypePollution(sample: RequestSample): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];
    const dangerous = ['__proto__', 'constructor', 'prototype'];
    
    const checkObj = (obj: unknown, path: string): void => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (dangerous.includes(key)) {
          patterns.push({
            type: 'prototype-pollution',
            severity: 'critical',
            field: `${path}.${key}`,
            sampleIds: [sample.id],
            evidence: `Found '${key}' key in request body`
          });
        }
        checkObj((obj as Record<string, unknown>)[key], `${path}.${key}`);
      }
    };
    
    if (sample.body) {
      checkObj(sample.body, 'body');
    }
    
    return patterns;
  }

  private detectPathTraversal(sample: RequestSample): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];
    const regex = /\.\.[\/\\]|%2e%2e[%2f%5c]/i;
    
    const checkValue = (value: unknown, path: string): void => {
      if (typeof value === 'string' && regex.test(value)) {
        patterns.push({
          type: 'path-traversal',
          severity: 'critical',
          field: path,
          sampleIds: [sample.id],
          evidence: `Path traversal pattern detected in '${path}'`
        });
      } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          checkValue(v, `${path}.${k}`);
        }
      }
    };
    
    if (sample.body) checkValue(sample.body, 'body');
    if (sample.queryParams) checkValue(sample.queryParams, 'query');
    
    return patterns;
  }

  private detectSSRF(sample: RequestSample): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];
    const internalPatterns = [
      /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i,
      /^https?:\/\/169\.254\./,  // AWS metadata
      /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/,
      /^file:\/\//i,
      /^gopher:\/\//i,
    ];
    
    const checkUrl = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        for (const pattern of internalPatterns) {
          if (pattern.test(value)) {
            patterns.push({
              type: 'ssrf',
              severity: 'critical',
              field: path,
              sampleIds: [sample.id],
              evidence: `Internal URL pattern detected in '${path}'`
            });
            break;
          }
        }
      }
    };
    
    // Chercher dans les champs susceptibles de contenir des URLs
    const urlFields = ['url', 'callback', 'webhook', 'redirect', 'next', 'return_url'];
    
    const searchFields = (obj: unknown, path: string): void => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const currentPath = `${path}.${key}`;
        if (urlFields.includes(key.toLowerCase())) {
          checkUrl(value, currentPath);
        }
        if (typeof value === 'object') {
          searchFields(value, currentPath);
        }
      }
    };
    
    if (sample.body) searchFields(sample.body, 'body');
    if (sample.queryParams) searchFields(sample.queryParams, 'query');
    
    return patterns;
  }

  private detectNoSQLInjection(sample: RequestSample): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];
    const operators = ['$gt', '$lt', '$ne', '$in', '$nin', '$or', '$and', 
                       '$not', '$nor', '$exists', '$regex', '$where', '$expr'];
    
    const checkObj = (obj: unknown, path: string): void => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (operators.includes(key)) {
          patterns.push({
            type: 'nosql',
            severity: 'high',
            field: `${path}.${key}`,
            sampleIds: [sample.id],
            evidence: `NoSQL operator '${key}' found in request`
          });
        }
        checkObj((obj as Record<string, unknown>)[key], `${path}.${key}`);
      }
    };
    
    if (sample.body) checkObj(sample.body, 'body');
    
    return patterns;
  }

  private aggregatePatterns(patterns: VulnerabilityPattern[]): VulnerabilityPattern[] {
    const grouped = new Map<string, VulnerabilityPattern>();
    
    for (const p of patterns) {
      const key = `${p.type}:${p.field}`;
      const existing = grouped.get(key);
      
      if (existing) {
        existing.sampleIds.push(...p.sampleIds);
      } else {
        grouped.set(key, { ...p });
      }
    }
    
    return Array.from(grouped.values());
  }
}
```

### 10. Générateur de suggestions (suggester/index.ts)

```typescript
import { AnalysisResult, Suggestion, SuggestionsOutput, LearningConfig } from '../types';
import { ConfidenceCalculator } from './confidence';
import { formatYaml, formatJson } from './formatter';

export class Suggester {
  private config: LearningConfig;
  private confidence: ConfidenceCalculator;

  constructor(config: LearningConfig) {
    this.config = config;
    this.confidence = new ConfidenceCalculator();
  }

  generate(analyses: AnalysisResult[]): SuggestionsOutput {
    const suggestions: Suggestion[] = [];
    
    for (const analysis of analyses) {
      // Vulnérabilités → Suggestions critiques
      if (analysis.vulnerabilities) {
        suggestions.push(...this.fromVulnerabilities(analysis));
      }
      
      // Anomalies → Suggestions haute priorité
      if (analysis.anomalies) {
        suggestions.push(...this.fromAnomalies(analysis));
      }
      
      // Invariants → Règles business
      if (analysis.invariants) {
        suggestions.push(...this.fromInvariants(analysis));
      }
      
      // Ranges → Règles de validation
      if (analysis.ranges) {
        suggestions.push(...this.fromRanges(analysis));
      }
      
      // Schema → Contract
      if (analysis.schema) {
        suggestions.push(...this.fromSchema(analysis));
      }
    }
    
    // Filtrer par confiance minimale
    const filtered = suggestions.filter(s => s.confidence >= this.config.minConfidence);
    
    // Trier par sévérité puis confiance
    const sorted = this.sortSuggestions(filtered);
    
    return this.buildOutput(sorted, analyses);
  }

  private fromVulnerabilities(analysis: AnalysisResult): Suggestion[] {
    if (!analysis.vulnerabilities) return [];
    
    return analysis.vulnerabilities.map(vuln => ({
      id: `auto.vuln.${vuln.type}.${vuln.field.replace(/\./g, '_')}`,
      severity: vuln.severity,
      confidence: 1.0,  // Vulnérabilités détectées = confiance max
      category: 'vulnerability' as const,
      route: analysis.route,
      evidence: vuln.evidence,
      recommendation: `Enable immediately - ${vuln.sampleIds.length} attack attempts detected`,
      suggested: {
        type: 'vulnerability' as const,
        action: 'block' as const,
        config: this.buildVulnConfig(vuln)
      }
    }));
  }

  private fromInvariants(analysis: AnalysisResult): Suggestion[] {
    if (!analysis.invariants) return [];
    
    return analysis.invariants.map(inv => ({
      id: inv.id.replace('invariant.', 'auto.'),
      severity: inv.confidence > 0.99 ? 'high' as const : 'medium' as const,
      confidence: inv.confidence,
      category: 'business-logic' as const,
      route: analysis.route,
      evidence: inv.evidence,
      recommendation: `${inv.violations} violations detected - review before enabling`,
      suggested: {
        type: 'cel' as const,
        action: 'block' as const,
        config: {
          expr: inv.expression
        }
      }
    }));
  }

  private fromRanges(analysis: AnalysisResult): Suggestion[] {
    if (!analysis.ranges) return [];
    
    return analysis.ranges
      .filter(r => r.type === 'number' || r.type === 'integer')
      .map(range => {
        // Utiliser p99 + marge pour la limite
        const maxSuggested = Math.ceil(range.stats.p99 * 1.5);
        
        return {
          id: `auto.range.${range.field.replace(/[\.\[\]]/g, '_')}`,
          severity: 'medium' as const,
          confidence: range.confidence,
          category: 'range' as const,
          route: analysis.route,
          evidence: `${range.field}: min=${range.stats.min}, max=${range.stats.max}, p99=${range.stats.p99} (n=${range.observedIn})`,
          recommendation: `Suggested max: ${maxSuggested} (p99 + 50% margin)`,
          suggested: {
            type: 'cel' as const,
            action: 'block' as const,
            config: {
              expr: this.buildRangeExpr(range.field, range.stats.min, maxSuggested)
            }
          }
        };
      });
  }

  private fromSchema(analysis: AnalysisResult): Suggestion[] {
    if (!analysis.schema) return [];
    
    return [{
      id: `auto.schema.${analysis.route.replace(/[^a-z0-9]/gi, '_')}`,
      severity: 'medium' as const,
      confidence: analysis.schema.confidence,
      category: 'schema' as const,
      route: analysis.route,
      evidence: `Inferred from ${analysis.schema.observedIn} requests`,
      recommendation: 'Review and adjust constraints as needed',
      suggested: {
        type: 'contract' as const,
        config: {
          request: {
            body: this.schemaToJsonSchema(analysis.schema)
          }
        }
      }
    }];
  }

  private buildVulnConfig(vuln: VulnerabilityPattern): Record<string, unknown> {
    switch (vuln.type) {
      case 'prototype-pollution':
        return { prototypePollution: true };
      case 'path-traversal':
        return { pathTraversal: { fields: [vuln.field.replace('body.', '')] } };
      case 'ssrf':
        return { ssrfInternal: { fields: [vuln.field.replace('body.', '')] } };
      case 'nosql':
        return { nosqlInjection: true };
      default:
        return {};
    }
  }

  private buildRangeExpr(field: string, min: number, max: number): string {
    // Convertir field path en CEL
    // body.items[].qty → request.body.items.all(i, i.qty >= min && i.qty <= max)
    if (field.includes('[]')) {
      const [arrayPath, itemField] = field.split('[].');
      const celPath = `request.${arrayPath}`;
      return `${celPath}.all(item, item.${itemField} >= ${min} && item.${itemField} <= ${max})`;
    }
    
    return `request.${field} >= ${min} && request.${field} <= ${max}`;
  }

  private schemaToJsonSchema(schema: InferredSchema): Record<string, unknown> {
    const result: Record<string, unknown> = { type: schema.type };
    
    if (schema.required?.length) {
      result.required = schema.required;
    }
    
    if (schema.properties) {
      result.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([k, v]) => [k, this.schemaToJsonSchema(v)])
      );
    }
    
    if (schema.items) {
      result.items = this.schemaToJsonSchema(schema.items);
    }
    
    return result;
  }

  private sortSuggestions(suggestions: Suggestion[]): Suggestion[] {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    
    return suggestions.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });
  }

  private buildOutput(suggestions: Suggestion[], analyses: AnalysisResult[]): SuggestionsOutput {
    const totalRequests = analyses.reduce((sum, a) => sum + a.sampleCount, 0);
    
    return {
      metadata: {
        version: '1.0',
        generated: new Date().toISOString(),
        period: this.getPeriod(analyses),
        stats: {
          totalRequests,
          sampledRequests: totalRequests,
          routesObserved: analyses.length,
          suggestionsGenerated: suggestions.length
        }
      },
      suggestions,
      summary: {
        critical: suggestions.filter(s => s.severity === 'critical').length,
        high: suggestions.filter(s => s.severity === 'high').length,
        medium: suggestions.filter(s => s.severity === 'medium').length,
        low: suggestions.filter(s => s.severity === 'low').length,
        byCategory: this.countByCategory(suggestions)
      }
    };
  }

  private getPeriod(analyses: AnalysisResult[]): { start: string; end: string } {
    const starts = analyses.map(a => a.period.start).sort();
    const ends = analyses.map(a => a.period.end).sort();
    return { start: starts[0], end: ends[ends.length - 1] };
  }

  private countByCategory(suggestions: Suggestion[]): Record<string, number> {
    return suggestions.reduce((acc, s) => {
      acc[s.category] = (acc[s.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}
```

### 11. CLI (cli/index.ts)

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { startCommand } from './start';
import { statusCommand } from './status';
import { analyzeCommand } from './analyze';
import { suggestCommand } from './suggest';
import { applyCommand } from './apply';

const program = new Command();

program
  .name('contractshield-learn')
  .description('ContractShield Learning Mode CLI')
  .version('1.0.0');

program
  .command('start')
  .description('Start learning mode')
  .option('-d, --duration <duration>', 'Learning duration', '7d')
  .option('-r, --sample-rate <rate>', 'Sample rate (0.0-1.0)', '0.1')
  .option('--routes <routes...>', 'Specific routes to learn')
  .action(startCommand);

program
  .command('status')
  .description('Check learning status')
  .action(statusCommand);

program
  .command('analyze')
  .description('Analyze collected data')
  .option('--analyzers <analyzers...>', 'Analyzers to run')
  .action(analyzeCommand);

program
  .command('suggest')
  .description('Generate rule suggestions')
  .option('-o, --output <path>', 'Output file path', './suggested-rules.yaml')
  .option('-c, --min-confidence <value>', 'Minimum confidence', '0.8')
  .option('-f, --format <format>', 'Output format (yaml|json)', 'yaml')
  .action(suggestCommand);

program
  .command('apply')
  .description('Apply suggestions to policy')
  .option('--min-confidence <value>', 'Minimum confidence to apply', '0.95')
  .option('--severity <levels...>', 'Severity levels to apply', ['critical', 'high'])
  .option('--dry-run', 'Show what would be applied')
  .option('-i, --interactive', 'Interactive mode')
  .action(applyCommand);

program.parse();
```

### 12. Intégration avec le middleware (index.ts)

```typescript
import { Collector } from './collector';
import { createStorage } from './storage';
import { SchemaAnalyzer } from './analyzers/schema';
import { RangeAnalyzer } from './analyzers/ranges';
import { InvariantAnalyzer } from './analyzers/invariants';
import { AnomalyAnalyzer } from './analyzers/anomalies';
import { VulnerabilityAnalyzer } from './analyzers/vulnerabilities';
import { Suggester } from './suggester';
import type { LearningConfig, LearningOptions, SuggestionsOutput } from './types';

let collector: Collector | null = null;

/**
 * Enable learning mode on a ContractShield instance
 */
export function enableLearning(
  shield: ContractShieldMiddleware, 
  options: Partial<LearningOptions> = {}
): void {
  const config = buildConfig(options);
  const storage = createStorage(config);
  
  collector = new Collector(config, storage);
  
  // Hook into shield's response handler
  shield.onAfterResponse((ctx, response) => {
    collector?.collect(ctx, response);
  });
  
  console.log(`[ContractShield] Learning mode enabled (sample rate: ${config.sampleRate * 100}%)`);
}

/**
 * Disable learning mode
 */
export function disableLearning(): void {
  collector = null;
  console.log('[ContractShield] Learning mode disabled');
}

/**
 * Run analysis on collected data
 */
export async function analyze(options: Partial<LearningConfig> = {}): Promise<AnalysisResult[]> {
  const config = buildConfig(options);
  const storage = createStorage(config);
  
  const routes = await storage.getRoutes();
  const results: AnalysisResult[] = [];
  
  for (const route of routes) {
    const samples = await storage.getSamples(route);
    
    const result: AnalysisResult = {
      route,
      sampleCount: samples.length,
      period: getPeriod(samples)
    };
    
    if (config.analyzers.schemaInference) {
      result.schema = new SchemaAnalyzer().analyze(samples);
    }
    
    if (config.analyzers.rangeDetection) {
      result.ranges = new RangeAnalyzer().analyze(samples);
    }
    
    if (config.analyzers.invariantDiscovery) {
      result.invariants = new InvariantAnalyzer().analyze(samples);
    }
    
    if (config.analyzers.anomalyDetection) {
      result.anomalies = new AnomalyAnalyzer().analyze(samples);
    }
    
    if (config.analyzers.vulnerabilityScanning) {
      result.vulnerabilities = new VulnerabilityAnalyzer().analyze(samples);
    }
    
    results.push(result);
  }
  
  return results;
}

/**
 * Generate suggestions from analysis
 */
export async function suggest(options: Partial<LearningConfig> = {}): Promise<SuggestionsOutput> {
  const config = buildConfig(options);
  const analyses = await analyze(config);
  
  const suggester = new Suggester(config);
  return suggester.generate(analyses);
}

// Exports
export { LearningConfig, LearningOptions, Suggestion, SuggestionsOutput } from './types';
```

## Tests à créer

```
packages/pro/learning/test/
├── collector.test.ts       # Tests du collecteur et sampling
├── redactor.test.ts        # Tests de la redaction
├── schema.test.ts          # Tests inférence de schéma
├── invariants.test.ts      # Tests découverte d'invariants
├── vulnerabilities.test.ts # Tests détection vulnérabilités
├── suggester.test.ts       # Tests génération suggestions
└── integration.test.ts     # Tests E2E
```

## Fixtures de test

Créer des fichiers de samples réalistes dans `fixtures/learning/`:
- `ecommerce-orders.json` - Samples d'une API e-commerce
- `with-attacks.json` - Samples contenant des tentatives d'attaque
- `multi-tenant.json` - Samples avec patterns multi-tenant

## Dépendances à ajouter

```json
{
  "dependencies": {
    "minimatch": "^9.0.0",
    "commander": "^11.0.0",
    "yaml": "^2.3.0"
  },
  "devDependencies": {
    "@types/minimatch": "^5.1.0"
  }
}
```

## Ordre d'implémentation suggéré

1. **Types** (`types.ts`) - Fondation
2. **Storage** (`storage/`) - File storage d'abord
3. **Redactor** (`collector/redactor.ts`) - Protection données
4. **Collector** (`collector/`) - Sampling basique
5. **SchemaAnalyzer** - Premier analyseur
6. **VulnerabilityAnalyzer** - Haute valeur
7. **InvariantAnalyzer** - Business logic
8. **RangeAnalyzer** - Plages numériques
9. **Suggester** - Génération YAML
10. **CLI** - Interface utilisateur
11. **Tests** - Validation complète

## Notes importantes

- Le sampling doit être **100% asynchrone** pour ne pas impacter les performances
- La redaction doit être **fail-safe** (en cas d'erreur, redacter tout le sample)
- Les analyseurs doivent supporter des **millions de samples** (streaming si nécessaire)
- La génération de suggestions doit être **déterministe** (même input = même output)
- Toujours valider les licences Pro avant d'activer le learning
