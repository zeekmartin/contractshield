# Sprint v1.0 — Sink-aware RASP (Production Ready)

## Contexte
ContractShield implémente maintenant :
- v0.1 : Contract enforcement
- v0.2 : Vulnerability checks
- v0.3 : Multi-runtime, webhooks généralisés, Docker
- v0.3.1 : Infrastructure de licence Open Core

Ce sprint ajoute la fonctionnalité différenciante : **Sink-aware RASP** (Runtime Application Self-Protection).

**Important** :
- Cette feature est **commerciale** (dans `pro/sink-rasp/`)
- Requiert une licence valide avec feature `sink-rasp`
- Mettre à jour `todo.md` et `CHANGELOG.md`

## Qu'est-ce que Sink-aware RASP ?

Intercepter les appels dangereux ("sinks") au moment de l'exécution :
````
Code applicatif
      │
      ▼
┌─────────────────────────┐
│ exec('rm -rf ' + input) │  ← SINK DANGEREUX
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│ ContractShield RASP     │  ← INTERCEPTION
│ - Analyse l'input       │
│ - Bloque si dangereux   │
└─────────────────────────┘
      │
      ▼
   Exécution (ou blocage)
````

## Sinks à protéger (Node.js)

| Catégorie | Fonctions | Attaques bloquées |
|-----------|-----------|-------------------|
| **Command Execution** | `child_process.exec`, `execSync`, `spawn`, `spawnSync`, `execFile` | Command injection |
| **Filesystem** | `fs.readFile`, `fs.writeFile`, `fs.unlink`, `fs.readdir` | Path traversal |
| **HTTP Egress** | `http.request`, `https.request`, `fetch` | SSRF |
| **SQL** | `connection.query`, `pool.query` (mysql, pg) | SQL injection |
| **Eval** | `eval`, `Function`, `vm.runInContext` | Code injection |

## Architecture
````
pro/sink-rasp/
├── src/
│   ├── index.ts                 # Entry point, initSinkRasp()
│   ├── types.ts                 # Types et interfaces
│   ├── interceptor.ts           # Core interception logic
│   ├── hooks/
│   │   ├── childProcess.ts      # Hook child_process
│   │   ├── filesystem.ts        # Hook fs
│   │   ├── http.ts              # Hook http/https/fetch
│   │   ├── sql.ts               # Hook mysql/pg
│   │   └── eval.ts              # Hook eval/Function
│   ├── analyzers/
│   │   ├── commandAnalyzer.ts   # Détecte injection dans commandes
│   │   ├── pathAnalyzer.ts      # Détecte path traversal
│   │   ├── urlAnalyzer.ts       # Détecte SSRF
│   │   └── sqlAnalyzer.ts       # Détecte SQL injection
│   ├── context/
│   │   └── asyncContext.ts      # AsyncLocalStorage pour tracer la requête
│   └── reporting/
│       └── reporter.ts          # Log et télémétrie des blocages
└── package.json
````

## Tâches

### 1. Types et configuration
````typescript
// pro/sink-rasp/src/types.ts

export interface SinkRaspOptions {
  licenseKey: string;
  
  mode: 'monitor' | 'enforce';  // Monitor = log only, Enforce = block
  
  sinks?: {
    commandExecution?: boolean | CommandExecutionOptions;
    filesystem?: boolean | FilesystemOptions;
    httpEgress?: boolean | HttpEgressOptions;
    sql?: boolean | SqlOptions;
    eval?: boolean;  // Généralement toujours bloqué
  };
  
  allowlist?: {
    commands?: string[];           // ['git', 'node']
    paths?: string[];              // ['/tmp/', '/var/log/']
    hosts?: string[];              // ['api.stripe.com', '*.amazonaws.com']
    sqlPatterns?: string[];        // Patterns autorisés
  };
  
  onBlock?: (event: BlockEvent) => void;
  onDetect?: (event: DetectEvent) => void;
}

export interface CommandExecutionOptions {
  allowedCommands?: string[];
  blockedPatterns?: RegExp[];
}

export interface FilesystemOptions {
  allowedPaths?: string[];
  blockedPaths?: string[];
  operations?: ('read' | 'write' | 'delete')[];
}

export interface HttpEgressOptions {
  allowedHosts?: string[];
  blockedHosts?: string[];
  blockPrivateIPs?: boolean;      // default: true
  blockMetadataEndpoints?: boolean; // default: true (169.254.169.254)
}

export interface SqlOptions {
  detectInjection?: boolean;
  allowedTables?: string[];
}

export interface BlockEvent {
  timestamp: Date;
  sink: string;
  operation: string;
  input: string;        // Valeur (tronquée/redactée)
  reason: string;
  stack: string;
  requestId?: string;   // Si lié à une requête HTTP
}

export interface DetectEvent extends BlockEvent {
  action: 'blocked' | 'monitored';
}
````

### 2. Entry point
````typescript
// pro/sink-rasp/src/index.ts
import { requireLicense } from '@contractshield/license';
import { installHooks, uninstallHooks } from './interceptor';
import type { SinkRaspOptions } from './types';

let initialized = false;

export function initSinkRasp(options: SinkRaspOptions): void {
  // Vérifier licence
  requireLicense(options.licenseKey, 'sink-rasp');
  
  if (initialized) {
    console.warn('[ContractShield] Sink RASP already initialized');
    return;
  }
  
  // Installer les hooks
  installHooks(options);
  initialized = true;
  
  console.log(`[ContractShield] Sink RASP initialized (mode: ${options.mode})`);
}

export function shutdownSinkRasp(): void {
  if (!initialized) return;
  
  uninstallHooks();
  initialized = false;
  
  console.log('[ContractShield] Sink RASP shutdown');
}

export { SinkRaspOptions, BlockEvent, DetectEvent } from './types';
````

### 3. Interceptor core
````typescript
// pro/sink-rasp/src/interceptor.ts
import { installCommandHooks, uninstallCommandHooks } from './hooks/childProcess';
import { installFilesystemHooks, uninstallFilesystemHooks } from './hooks/filesystem';
import { installHttpHooks, uninstallHttpHooks } from './hooks/http';
import type { SinkRaspOptions } from './types';

let currentOptions: SinkRaspOptions | null = null;

export function installHooks(options: SinkRaspOptions): void {
  currentOptions = options;
  
  const sinks = options.sinks ?? {
    commandExecution: true,
    filesystem: true,
    httpEgress: true,
    sql: false,
    eval: true
  };
  
  if (sinks.commandExecution) {
    installCommandHooks(options);
  }
  
  if (sinks.filesystem) {
    installFilesystemHooks(options);
  }
  
  if (sinks.httpEgress) {
    installHttpHooks(options);
  }
  
  // TODO: SQL, eval
}

export function uninstallHooks(): void {
  uninstallCommandHooks();
  uninstallFilesystemHooks();
  uninstallHttpHooks();
  currentOptions = null;
}

export function getOptions(): SinkRaspOptions | null {
  return currentOptions;
}
````

### 4. Hook child_process (exemple complet)
````typescript
// pro/sink-rasp/src/hooks/childProcess.ts
import * as childProcess from 'child_process';
import { analyzeCommand } from '../analyzers/commandAnalyzer';
import { report } from '../reporting/reporter';
import { getRequestContext } from '../context/asyncContext';
import type { SinkRaspOptions } from '../types';

// Sauvegarder les originaux
const originalExec = childProcess.exec;
const originalExecSync = childProcess.execSync;
const originalSpawn = childProcess.spawn;
const originalSpawnSync = childProcess.spawnSync;

let options: SinkRaspOptions | null = null;

export function installCommandHooks(opts: SinkRaspOptions): void {
  options = opts;
  
  // Hook exec
  (childProcess as any).exec = function hookedExec(
    command: string,
    ...args: any[]
  ) {
    const result = checkCommand(command, 'exec');
    if (result.blocked && options?.mode === 'enforce') {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      const callback = args.find(a => typeof a === 'function');
      if (callback) {
        process.nextTick(() => callback(error, '', ''));
        return;
      }
      throw error;
    }
    return originalExec.call(this, command, ...args);
  };
  
  // Hook execSync
  (childProcess as any).execSync = function hookedExecSync(
    command: string,
    ...args: any[]
  ) {
    const result = checkCommand(command, 'execSync');
    if (result.blocked && options?.mode === 'enforce') {
      throw new Error(`[ContractShield] Blocked: ${result.reason}`);
    }
    return originalExecSync.call(this, command, ...args);
  };
  
  // Hook spawn
  (childProcess as any).spawn = function hookedSpawn(
    command: string,
    args?: string[],
    ...rest: any[]
  ) {
    const fullCommand = args ? `${command} ${args.join(' ')}` : command;
    const result = checkCommand(fullCommand, 'spawn');
    if (result.blocked && options?.mode === 'enforce') {
      throw new Error(`[ContractShield] Blocked: ${result.reason}`);
    }
    return originalSpawn.call(this, command, args, ...rest);
  };
  
  // Hook spawnSync
  (childProcess as any).spawnSync = function hookedSpawnSync(
    command: string,
    args?: string[],
    ...rest: any[]
  ) {
    const fullCommand = args ? `${command} ${args.join(' ')}` : command;
    const result = checkCommand(fullCommand, 'spawnSync');
    if (result.blocked && options?.mode === 'enforce') {
      throw new Error(`[ContractShield] Blocked: ${result.reason}`);
    }
    return originalSpawnSync.call(this, command, args, ...rest);
  };
}

export function uninstallCommandHooks(): void {
  (childProcess as any).exec = originalExec;
  (childProcess as any).execSync = originalExecSync;
  (childProcess as any).spawn = originalSpawn;
  (childProcess as any).spawnSync = originalSpawnSync;
  options = null;
}

function checkCommand(command: string, operation: string): { blocked: boolean; reason?: string } {
  if (!options) return { blocked: false };
  
  // Vérifier allowlist
  const allowedCommands = options.allowlist?.commands ?? [];
  const baseCommand = command.split(/\s+/)[0];
  if (allowedCommands.includes(baseCommand)) {
    return { blocked: false };
  }
  
  // Analyser pour injection
  const analysis = analyzeCommand(command);
  
  if (analysis.dangerous) {
    const event = {
      timestamp: new Date(),
      sink: 'child_process',
      operation,
      input: command.substring(0, 200), // Tronquer
      reason: analysis.reason,
      stack: new Error().stack || '',
      requestId: getRequestContext()?.requestId
    };
    
    report({
      ...event,
      action: options.mode === 'enforce' ? 'blocked' : 'monitored'
    });
    
    if (options.onBlock && options.mode === 'enforce') {
      options.onBlock(event);
    }
    if (options.onDetect) {
      options.onDetect({ ...event, action: options.mode === 'enforce' ? 'blocked' : 'monitored' });
    }
    
    return { blocked: true, reason: analysis.reason };
  }
  
  return { blocked: false };
}
````

### 5. Analyzers
````typescript
// pro/sink-rasp/src/analyzers/commandAnalyzer.ts

interface AnalysisResult {
  dangerous: boolean;
  reason: string;
  patterns: string[];
}

// Patterns de command injection
const DANGEROUS_PATTERNS = [
  /;\s*\w+/,                    // ; command
  /\|\s*\w+/,                   // | command
  /`[^`]+`/,                    // `command`
  /\$\([^)]+\)/,                // $(command)
  /\$\{[^}]+\}/,                // ${command}
  /&&\s*\w+/,                   // && command
  /\|\|\s*\w+/,                 // || command
  />\s*\/\w+/,                  // > /path (redirect to file)
  /<\s*\/\w+/,                  // < /path (read from file)
  /\n|\r/,                      // Newlines
];

// Commandes dangereuses
const DANGEROUS_COMMANDS = [
  'rm', 'rmdir', 'dd', 'mkfs', 'shutdown', 'reboot', 'halt',
  'chmod', 'chown', 'passwd', 'useradd', 'userdel',
  'curl', 'wget', 'nc', 'netcat', 'ncat',
  'python', 'python3', 'perl', 'ruby', 'php',
  'bash', 'sh', 'zsh', 'csh',
];

export function analyzeCommand(command: string): AnalysisResult {
  const foundPatterns: string[] = [];
  
  // Vérifier patterns d'injection
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      foundPatterns.push(pattern.source);
    }
  }
  
  // Vérifier commandes dangereuses
  const tokens = command.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    const baseCmd = token.split('/').pop() || token;
    if (DANGEROUS_COMMANDS.includes(baseCmd)) {
      foundPatterns.push(`dangerous_command:${baseCmd}`);
    }
  }
  
  if (foundPatterns.length > 0) {
    return {
      dangerous: true,
      reason: `Command injection detected: ${foundPatterns.slice(0, 3).join(', ')}`,
      patterns: foundPatterns
    };
  }
  
  return { dangerous: false, reason: '', patterns: [] };
}
````
````typescript
// pro/sink-rasp/src/analyzers/pathAnalyzer.ts

interface PathAnalysisResult {
  dangerous: boolean;
  reason: string;
}

const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,                     // ../
  /\.\.\\/,                     // ..\
  /%2e%2e%2f/i,                 // URL encoded ../
  /%2e%2e\//i,                  // Partial URL encoded
  /\.\.%2f/i,                   // Partial URL encoded
  /%2e%2e%5c/i,                 // URL encoded ..\
  /\.\.\%5c/i,                  // Partial URL encoded
];

const SENSITIVE_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/hosts',
  '/proc/',
  '/sys/',
  '/dev/',
  '/root/',
  '/home/',
  'C:\\Windows\\',
  'C:\\Users\\',
];

export function analyzePath(path: string): PathAnalysisResult {
  // Vérifier traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(path)) {
      return {
        dangerous: true,
        reason: `Path traversal detected: ${pattern.source}`
      };
    }
  }
  
  // Vérifier chemins sensibles
  const normalizedPath = path.toLowerCase();
  for (const sensitive of SENSITIVE_PATHS) {
    if (normalizedPath.includes(sensitive.toLowerCase())) {
      return {
        dangerous: true,
        reason: `Sensitive path access: ${sensitive}`
      };
    }
  }
  
  return { dangerous: false, reason: '' };
}
````
````typescript
// pro/sink-rasp/src/analyzers/urlAnalyzer.ts

interface UrlAnalysisResult {
  dangerous: boolean;
  reason: string;
}

// Ranges IP privées
const PRIVATE_IP_RANGES = [
  /^127\./,                           // Loopback
  /^10\./,                            // Class A private
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,   // Class B private
  /^192\.168\./,                      // Class C private
  /^169\.254\./,                      // Link-local
  /^0\./,                             // Current network
  /^localhost$/i,
  /^0\.0\.0\.0$/,
];

// Cloud metadata endpoints
const METADATA_ENDPOINTS = [
  '169.254.169.254',      // AWS, GCP, Azure
  'metadata.google.internal',
  'metadata.gcp.internal',
  '100.100.100.200',      // Alibaba
];

export function analyzeUrl(url: string): UrlAnalysisResult {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Vérifier schémas dangereux
    if (['file:', 'gopher:', 'dict:', 'ftp:'].includes(parsed.protocol)) {
      return {
        dangerous: true,
        reason: `Dangerous protocol: ${parsed.protocol}`
      };
    }
    
    // Vérifier IPs privées
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        return {
          dangerous: true,
          reason: `SSRF to private IP: ${hostname}`
        };
      }
    }
    
    // Vérifier metadata endpoints
    if (METADATA_ENDPOINTS.includes(hostname)) {
      return {
        dangerous: true,
        reason: `SSRF to cloud metadata: ${hostname}`
      };
    }
    
    return { dangerous: false, reason: '' };
  } catch {
    // URL invalide, laisser passer (ou bloquer selon politique)
    return { dangerous: false, reason: '' };
  }
}
````

### 6. Async Context (pour lier au request)
````typescript
// pro/sink-rasp/src/context/asyncContext.ts
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  requestId: string;
  path?: string;
  method?: string;
  ip?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

// Middleware Express pour injecter le contexte
export function expressContextMiddleware() {
  return (req: any, res: any, next: any) => {
    const context: RequestContext = {
      requestId: req.headers['x-request-id'] || crypto.randomUUID(),
      path: req.path,
      method: req.method,
      ip: req.ip
    };
    runWithContext(context, next);
  };
}
````

### 7. Reporter
````typescript
// pro/sink-rasp/src/reporting/reporter.ts
import type { DetectEvent } from '../types';

export function report(event: DetectEvent): void {
  // Log structuré
  const logEntry = {
    level: event.action === 'blocked' ? 'warn' : 'info',
    message: `[ContractShield RASP] ${event.action}: ${event.sink}.${event.operation}`,
    ...event,
    stack: undefined // Ne pas logger la stack complète par défaut
  };
  
  console.log(JSON.stringify(logEntry));
  
  // TODO: Intégration OpenTelemetry
  // TODO: Webhook de notification
}
````

### 8. Tests
````typescript
// pro/sink-rasp/src/__tests__/childProcess.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initSinkRasp, shutdownSinkRasp } from '../index';
import { execSync } from 'child_process';

// License de test
const TEST_LICENSE = process.env.TEST_LICENSE_KEY || '...';

describe('Command Execution Hook', () => {
  beforeAll(() => {
    initSinkRasp({
      licenseKey: TEST_LICENSE,
      mode: 'enforce',
      sinks: { commandExecution: true }
    });
  });
  
  afterAll(() => {
    shutdownSinkRasp();
  });

  it('allows safe commands', () => {
    const result = execSync('echo hello').toString();
    expect(result.trim()).toBe('hello');
  });

  it('blocks command injection with semicolon', () => {
    expect(() => {
      execSync('echo hello; rm -rf /');
    }).toThrow(/ContractShield.*Blocked/);
  });

  it('blocks command injection with pipe', () => {
    expect(() => {
      execSync('echo hello | cat /etc/passwd');
    }).toThrow(/ContractShield.*Blocked/);
  });

  it('blocks backtick injection', () => {
    expect(() => {
      execSync('echo `whoami`');
    }).toThrow(/ContractShield.*Blocked/);
  });
});
````

### 9. Documentation

**docs/sink-rasp.md** (référencé depuis le README, mais contenu dans pro/) :
````markdown
# Sink-aware RASP

> ⚠️ This feature requires a ContractShield Pro or Enterprise license.

## What is Sink-aware RASP?

Runtime Application Self-Protection that intercepts dangerous function calls:

- **Command Execution**: `exec()`, `spawn()`, etc.
- **Filesystem**: `readFile()`, `writeFile()`, etc.
- **HTTP Egress**: `fetch()`, `http.request()`, etc.
- **SQL**: Database queries

## Quick Start
```typescript
import { initSinkRasp } from '@contractshield/sink-rasp';

initSinkRasp({
  licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
  mode: 'enforce', // or 'monitor'
});
```

## Configuration

[... documentation complète ...]
````

### 10. CHANGELOG
````markdown
## [1.0.0] - 2026-XX-XX

### Added
- 🎉 Sink-aware RASP (`@contractshield/sink-rasp`) - Commercial
  - Command execution protection (child_process hooks)
  - Filesystem protection (fs hooks)
  - HTTP egress protection (SSRF prevention)
  - Async context tracking for request correlation
  - Monitor and enforce modes
- Command injection analyzer
- Path traversal analyzer  
- SSRF/URL analyzer
- Express middleware for request context

### Changed
- Project marked as production ready (v1.0)
````

## Contraintes

- Le code est dans `pro/` (commercial)
- Vérifie la licence au démarrage
- Hooks doivent être réversibles (uninstall)
- Performance : < 1ms overhead par appel hooké
- Ne pas casser le comportement normal si RASP désactivé
- Logs structurés (JSON) pour intégration SIEM

## Ordre d'implémentation

1. Types et structure — 30 min
2. Entry point + licence check — 20 min
3. Interceptor core — 30 min
4. Hook child_process — 1-2h
5. Command analyzer — 1h
6. Tests child_process — 30 min
7. Hook filesystem — 1-2h
8. Path analyzer — 30 min
9. Hook HTTP egress — 1-2h
10. URL analyzer — 30 min
11. Async context — 30 min
12. Reporter — 20 min
13. Documentation — 30 min
14. CHANGELOG — 10 min

Commence par explorer le code existant dans `pro/` et la structure de licence.