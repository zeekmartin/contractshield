# Sprint Deployment Optimizations

## Contexte
ContractShield supporte 3 patterns de déploiement (Embedded, Sidecar, Centralized).
Chaque pattern a des inconvénients documentés dans `docs/deployment.md`.

Ce sprint ajoute des optimisations pour réduire ces inconvénients.

**Important** :
- Respecter la structure existante
- Mettre à jour `docs/deployment.md` avec les nouvelles options
- Mettre à jour `todo.md` et `CHANGELOG.md`

## Optimisations à implémenter

### 1. Hot Reload des policies (Embedded)
**Problème** : Policy changes require restart
**Solution** : File watcher avec reload automatique

**Fichier** : `packages/pep-express/src/hotReload.ts`
```typescript
import { watch, FSWatcher } from 'fs';
import { EventEmitter } from 'events';

export interface HotReloadOptions {
  enabled?: boolean;           // default: true en dev, false en prod
  debounceMs?: number;         // default: 500
  onReload?: (policy: PolicySet) => void;
  onError?: (error: Error) => void;
}

export class PolicyHotReloader extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  
  constructor(
    private policyPath: string,
    private options: HotReloadOptions = {}
  ) {
    super();
  }
  
  start(): void {
    // Implémenter le watch avec debounce
  }
  
  stop(): void {
    // Cleanup
  }
  
  getCurrentPolicy(): PolicySet {
    // Retourner la policy actuelle
  }
}
```

**Intégration dans le middleware** :
```typescript
// packages/pep-express/src/middleware.ts
export function contractshield(options: ContractShieldOptions) {
  let policy: PolicySet;
  let reloader: PolicyHotReloader | null = null;
  
  if (typeof options.policy === 'string') {
    policy = loadPolicyFromFile(options.policy);
    
    if (options.hotReload !== false) {
      reloader = new PolicyHotReloader(options.policy, {
        onReload: (newPolicy) => {
          policy = newPolicy;
          console.log('[ContractShield] Policy reloaded');
        }
      });
      reloader.start();
    }
  } else {
    policy = options.policy;
  }
  
  // Middleware qui utilise `policy` (toujours à jour)
  return (req, res, next) => { ... };
}
```

**Tests** :
- Modifier le fichier policy → vérifier que la nouvelle policy est utilisée
- Fichier invalide → garde l'ancienne policy, log l'erreur
- Debounce → plusieurs modifications rapides = un seul reload

---

### 2. Unix Socket pour Sidecar
**Problème** : Network latency (~1-5ms)
**Solution** : Unix socket = ~0.1ms

**Fichier** : `packages/sidecar/src/server.ts`

Modifier le serveur pour écouter sur HTTP ET Unix socket :
```typescript
import { createServer as createHttpServer } from 'http';
import { createServer as createNetServer } from 'net';
import { unlinkSync, existsSync } from 'fs';

export interface ServerOptions {
  httpPort?: number;           // default: 3100
  unixSocket?: string;         // default: undefined (disabled)
}

export function startServer(handler: RequestHandler, options: ServerOptions = {}) {
  const servers: Array<{ type: string; close: () => void }> = [];
  
  // HTTP server
  if (options.httpPort) {
    const httpServer = createHttpServer(handler);
    httpServer.listen(options.httpPort, () => {
      console.log(`[ContractShield] HTTP server listening on port ${options.httpPort}`);
    });
    servers.push({ type: 'http', close: () => httpServer.close() });
  }
  
  // Unix socket server
  if (options.unixSocket) {
    // Supprimer le socket existant si présent
    if (existsSync(options.unixSocket)) {
      unlinkSync(options.unixSocket);
    }
    
    const unixServer = createHttpServer(handler);
    unixServer.listen(options.unixSocket, () => {
      console.log(`[ContractShield] Unix socket listening on ${options.unixSocket}`);
    });
    servers.push({ type: 'unix', close: () => unixServer.close() });
  }
  
  return {
    close: () => servers.forEach(s => s.close())
  };
}
```

**Configuration env** :
```bash
HTTP_PORT=3100                                    # Port HTTP (0 pour désactiver)
UNIX_SOCKET=/var/run/contractshield/pdp.sock     # Chemin du socket Unix
```

**Documentation Kubernetes** (ajouter à `docs/deployment.md`) :
```yaml
# Shared volume pour Unix socket
volumes:
  - name: contractshield-socket
    emptyDir: {}

containers:
  - name: app
    volumeMounts:
      - name: contractshield-socket
        mountPath: /var/run/contractshield
    env:
      - name: CONTRACTSHIELD_SOCKET
        value: "/var/run/contractshield/pdp.sock"
        
  - name: contractshield-sidecar
    volumeMounts:
      - name: contractshield-socket
        mountPath: /var/run/contractshield
    env:
      - name: UNIX_SOCKET
        value: "/var/run/contractshield/pdp.sock"
      - name: HTTP_PORT
        value: "0"  # Désactiver HTTP si socket suffit
```

---

### 3. SDK Client avec cache et failover (Centralized)
**Problème** : Higher latency, single point of failure
**Solution** : Cache local + retry + failover gracieux

**Package** : `packages/client/`
```typescript
// packages/client/src/index.ts
export { ContractShieldClient, type ClientOptions } from './client';
export { Decision, RequestContext } from '@contractshield/pdp';
```
```typescript
// packages/client/src/client.ts
import { LRUCache } from 'lru-cache';
import type { RequestContext, Decision } from '@contractshield/pdp';

export interface ClientOptions {
  // Connexion
  url?: string;                    // HTTP URL (http://localhost:3100)
  socketPath?: string;             // Unix socket path
  
  // Timeouts
  timeoutMs?: number;              // default: 100
  retries?: number;                // default: 2
  retryDelayMs?: number;           // default: 10
  
  // Cache
  cacheEnabled?: boolean;          // default: true
  cacheMaxSize?: number;           // default: 1000
  cacheTtlMs?: number;             // default: 60000 (1 min)
  
  // Failover
  failOpen?: boolean;              // default: false (fail closed)
  failOpenDecision?: Decision;     // Custom decision on failover
  
  // Callbacks
  onError?: (error: Error) => void;
  onCacheHit?: (key: string) => void;
  onFailover?: (error: Error) => void;
}

export class ContractShieldClient {
  private cache: LRUCache<string, Decision>;
  private options: Required<ClientOptions>;
  
  constructor(options: ClientOptions = {}) {
    this.options = {
      url: options.url ?? 'http://localhost:3100',
      socketPath: options.socketPath,
      timeoutMs: options.timeoutMs ?? 100,
      retries: options.retries ?? 2,
      retryDelayMs: options.retryDelayMs ?? 10,
      cacheEnabled: options.cacheEnabled ?? true,
      cacheMaxSize: options.cacheMaxSize ?? 1000,
      cacheTtlMs: options.cacheTtlMs ?? 60000,
      failOpen: options.failOpen ?? false,
      failOpenDecision: options.failOpenDecision ?? {
        action: 'ALLOW',
        reason: 'Failover: service unavailable',
        ruleHits: [],
        risk: { score: 0, level: 'unknown' }
      },
      onError: options.onError ?? (() => {}),
      onCacheHit: options.onCacheHit ?? (() => {}),
      onFailover: options.onFailover ?? (() => {})
    };
    
    this.cache = new LRUCache({
      max: this.options.cacheMaxSize,
      ttl: this.options.cacheTtlMs
    });
  }
  
  async evaluate(context: RequestContext): Promise<Decision> {
    // 1. Check cache
    if (this.options.cacheEnabled) {
      const cacheKey = this.computeCacheKey(context);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.options.onCacheHit(cacheKey);
        return cached;
      }
    }
    
    // 2. Call service with retry
    try {
      const decision = await this.callWithRetry(context);
      
      // 3. Cache ALLOW decisions only
      if (this.options.cacheEnabled && decision.action === 'ALLOW') {
        const cacheKey = this.computeCacheKey(context);
        this.cache.set(cacheKey, decision);
      }
      
      return decision;
    } catch (error) {
      this.options.onError(error as Error);
      
      // 4. Failover
      if (this.options.failOpen) {
        this.options.onFailover(error as Error);
        return this.options.failOpenDecision;
      }
      
      throw error;
    }
  }
  
  private async callWithRetry(context: RequestContext): Promise<Decision> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        return await this.callService(context);
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.options.retries) {
          await this.delay(this.options.retryDelayMs);
        }
      }
    }
    
    throw lastError;
  }
  
  private async callService(context: RequestContext): Promise<Decision> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    
    try {
      const response = await fetch(`${this.options.url}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
        signal: controller.signal,
        // @ts-ignore - Unix socket support
        ...(this.options.socketPath && { 
          dispatcher: new (await import('undici')).Agent({ 
            connect: { socketPath: this.options.socketPath } 
          })
        })
      });
      
      if (!response.ok) {
        throw new Error(`ContractShield returned ${response.status}`);
      }
      
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
  
  private computeCacheKey(ctx: RequestContext): string {
    // Cache par route + method + tenant + scopes
    // Ne pas inclure le body (trop variable)
    const parts = [
      ctx.request.method,
      ctx.request.routeId || ctx.request.path,
      ctx.identity?.tenant || 'anonymous',
      ctx.identity?.scopes?.sort().join(',') || ''
    ];
    return parts.join(':');
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Utilitaires
  clearCache(): void {
    this.cache.clear();
  }
  
  getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.cache.size,
      // LRU cache ne track pas hits/misses par défaut
      hits: 0,
      misses: 0
    };
  }
}
```

**Middleware Express utilisant le client** :
```typescript
// packages/pep-express/src/middlewareRemote.ts
import { ContractShieldClient, type ClientOptions } from '@contractshield/client';

export interface RemoteMiddlewareOptions extends ClientOptions {
  buildContext?: (req: Request) => RequestContext;
}

export function contractshieldRemote(options: RemoteMiddlewareOptions) {
  const client = new ContractShieldClient(options);
  
  return async (req, res, next) => {
    const context = options.buildContext?.(req) ?? buildDefaultContext(req);
    
    const decision = await client.evaluate(context);
    
    if (decision.action === 'BLOCK') {
      return res.status(decision.statusCode || 403).json({
        error: decision.reason,
        code: 'POLICY_VIOLATION'
      });
    }
    
    // Ajouter la decision au request pour logging
    req.contractshieldDecision = decision;
    next();
  };
}
```

---

### 4. Health check amélioré avec readiness
**Fichier** : `packages/sidecar/src/health.ts`
```typescript
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  checks: {
    redis?: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    policy?: { status: 'ok' | 'error'; routeCount?: number; error?: string };
  };
}

export interface ReadinessStatus {
  ready: boolean;
  reason?: string;
}

let startTime = Date.now();

export async function getHealth(deps: { redis?: RedisClient; policy?: PolicySet }): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {};
  
  // Check Redis
  if (deps.redis) {
    try {
      const start = Date.now();
      await deps.redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - start };
    } catch (error) {
      checks.redis = { status: 'error', error: (error as Error).message };
    }
  }
  
  // Check Policy
  if (deps.policy) {
    try {
      const routeCount = deps.policy.routes?.length ?? 0;
      checks.policy = { status: 'ok', routeCount };
    } catch (error) {
      checks.policy = { status: 'error', error: (error as Error).message };
    }
  }
  
  // Determine overall status
  const hasError = Object.values(checks).some(c => c.status === 'error');
  
  return {
    status: hasError ? 'degraded' : 'ok',
    version: process.env.npm_package_version || '0.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks
  };
}

export async function getReadiness(deps: { redis?: RedisClient; policy?: PolicySet }): Promise<ReadinessStatus> {
  // Ready si on a une policy valide
  if (!deps.policy || !deps.policy.routes) {
    return { ready: false, reason: 'No policy loaded' };
  }
  
  // Ready si Redis est connecté (si configuré)
  if (deps.redis) {
    try {
      await deps.redis.ping();
    } catch {
      return { ready: false, reason: 'Redis not connected' };
    }
  }
  
  return { ready: true };
}
```

---

### 5. Prometheus metrics
**Fichier** : `packages/sidecar/src/metrics.ts`
```typescript
// Métriques Prometheus simples (sans dépendance prom-client)

interface Metric {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  values: Map<string, number>;
  buckets?: number[];  // Pour histogrammes
  observations?: Map<string, number[]>;  // Pour histogrammes
}

class MetricsRegistry {
  private metrics = new Map<string, Metric>();
  
  counter(name: string, help: string): void {
    this.metrics.set(name, { name, help, type: 'counter', values: new Map() });
  }
  
  gauge(name: string, help: string): void {
    this.metrics.set(name, { name, help, type: 'gauge', values: new Map() });
  }
  
  histogram(name: string, help: string, buckets: number[]): void {
    this.metrics.set(name, { 
      name, help, type: 'histogram', 
      values: new Map(), 
      buckets,
      observations: new Map()
    });
  }
  
  inc(name: string, labels: Record<string, string> = {}, value = 1): void {
    const metric = this.metrics.get(name);
    if (!metric) return;
    const key = this.labelsToKey(labels);
    metric.values.set(key, (metric.values.get(key) ?? 0) + value);
  }
  
  set(name: string, labels: Record<string, string>, value: number): void {
    const metric = this.metrics.get(name);
    if (!metric) return;
    const key = this.labelsToKey(labels);
    metric.values.set(key, value);
  }
  
  observe(name: string, labels: Record<string, string>, value: number): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'histogram') return;
    const key = this.labelsToKey(labels);
    if (!metric.observations!.has(key)) {
      metric.observations!.set(key, []);
    }
    metric.observations!.get(key)!.push(value);
  }
  
  toPrometheus(): string {
    const lines: string[] = [];
    
    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);
      
      if (metric.type === 'histogram') {
        // Format histogram
        for (const [labels, observations] of metric.observations!) {
          const sorted = observations.sort((a, b) => a - b);
          for (const bucket of metric.buckets!) {
            const count = sorted.filter(v => v <= bucket).length;
            lines.push(`${metric.name}_bucket{${labels},le="${bucket}"} ${count}`);
          }
          lines.push(`${metric.name}_bucket{${labels},le="+Inf"} ${sorted.length}`);
          lines.push(`${metric.name}_sum{${labels}} ${sorted.reduce((a, b) => a + b, 0)}`);
          lines.push(`${metric.name}_count{${labels}} ${sorted.length}`);
        }
      } else {
        for (const [labels, value] of metric.values) {
          const labelStr = labels ? `{${labels}}` : '';
          lines.push(`${metric.name}${labelStr} ${value}`);
        }
      }
    }
    
    return lines.join('\n');
  }
  
  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }
}

// Singleton
export const metrics = new MetricsRegistry();

// Définir les métriques
metrics.counter('contractshield_decisions_total', 'Total decisions by action');
metrics.histogram('contractshield_eval_latency_ms', 'Evaluation latency in milliseconds', [1, 5, 10, 25, 50, 100, 250, 500]);
metrics.gauge('contractshield_up', 'ContractShield sidecar status');
metrics.gauge('contractshield_policy_routes', 'Number of routes in policy');

// Helpers
export function recordDecision(action: string, latencyMs: number): void {
  metrics.inc('contractshield_decisions_total', { action });
  metrics.observe('contractshield_eval_latency_ms', { action }, latencyMs);
}

export function recordUp(up: boolean): void {
  metrics.set('contractshield_up', {}, up ? 1 : 0);
}

export function recordPolicyRoutes(count: number): void {
  metrics.set('contractshield_policy_routes', {}, count);
}
```

---

### 6. Mettre à jour docs/deployment.md

Ajouter les sections suivantes :
```markdown
## Hot Reload (Embedded)

Enable automatic policy reloading without restart:

\`\`\`typescript
app.use(contractshield({
  policy: './policy.yaml',
  hotReload: true,  // default: true in development
  onPolicyReload: (policy) => {
    console.log('Policy reloaded:', policy.routes.length, 'routes');
  }
}));
\`\`\`

## Unix Socket (Sidecar)

For lowest latency (~0.1ms vs ~1-5ms HTTP):

\`\`\`yaml
env:
  - name: UNIX_SOCKET
    value: "/var/run/contractshield/pdp.sock"
  - name: HTTP_PORT
    value: "0"  # Disable HTTP
\`\`\`

## Client SDK (Centralized)

The client SDK provides caching, retry, and failover:

\`\`\`typescript
import { ContractShieldClient } from '@contractshield/client';

const client = new ContractShieldClient({
  url: 'http://contractshield-service:3100',
  cacheEnabled: true,
  cacheTtlMs: 60000,
  failOpen: true,  // Allow requests if service is down
  timeoutMs: 50,
  retries: 2
});
\`\`\`
```

---

### 7. CHANGELOG
```markdown
## [X.X.X] - 2026-XX-XX

### Added
- Hot reload for policies (embedded deployment)
- Unix socket support for sidecar (lower latency)
- `@contractshield/client` SDK with caching, retry, and failover
- Enhanced health checks with readiness probe
- Prometheus metrics endpoint (`/metrics`)

### Improved
- Sidecar latency reduced from ~1-5ms to ~0.1ms with Unix socket
- Centralized deployment resilience with client-side caching
- Better observability with detailed health status
```

## Tests

1. **Hot reload** : Modifier policy file → vérifier nouveau comportement
2. **Unix socket** : Comparer latence HTTP vs socket
3. **Client cache** : Vérifier cache hit/miss, TTL expiration
4. **Failover** : Arrêter le service → vérifier fail-open
5. **Metrics** : Vérifier format Prometheus

## Ordre d'implémentation

1. Hot reload — 1-2h
2. Unix socket — 1-2h  
3. Client SDK — 2-3h
4. Health checks — 1h
5. Prometheus metrics — 1-2h
6. Documentation — 1h
7. Tests — 1-2h
8. CHANGELOG — 10 min