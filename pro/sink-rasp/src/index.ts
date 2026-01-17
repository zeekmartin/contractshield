/**
 * ContractShield Sink-aware RASP
 *
 * COMMERCIAL LICENSE REQUIRED
 *
 * Runtime Application Self-Protection that intercepts dangerous sinks:
 * - Command execution (child_process)
 * - Filesystem operations (fs)
 * - HTTP egress (http, https, fetch)
 * - SQL queries (coming soon)
 * - Eval/Function (coming soon)
 *
 * @see https://contractshield.dev/docs/sink-rasp
 * @license Commercial - See ../LICENSE
 */

import { requireLicense } from "@contractshield/license";
import { installHooks, uninstallHooks, getOptions, isInstalled } from "./interceptor.js";
import { analyzeCommand } from "./analyzers/commandAnalyzer.js";
import { analyzePath } from "./analyzers/pathAnalyzer.js";
import { analyzeUrl } from "./analyzers/urlAnalyzer.js";
import type {
  SinkRaspOptions,
  SinkRaspInstance,
  BlockEvent,
  DetectEvent,
  AnalysisResult,
} from "./types.js";

let initialized = false;

/**
 * Initialize Sink-aware RASP protection.
 *
 * @param options Configuration options
 * @returns SinkRaspInstance for manual checks and control
 * @throws LicenseError if license is invalid or missing 'sink-rasp' feature
 *
 * @example
 * ```typescript
 * import { initSinkRasp } from '@contractshield/sink-rasp';
 *
 * initSinkRasp({
 *   licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
 *   mode: 'enforce',
 *   sinks: {
 *     commandExecution: true,
 *     filesystem: true,
 *     httpEgress: {
 *       blockPrivateIPs: true,
 *       blockMetadataEndpoints: true,
 *     },
 *   },
 *   allowlist: {
 *     commands: ['git', 'node'],
 *     paths: ['/tmp/', '/var/log/'],
 *     hosts: ['api.stripe.com'],
 *   },
 *   onBlock: (event) => {
 *     console.error('Blocked attack:', event);
 *   },
 * });
 * ```
 */
export function initSinkRasp(options: SinkRaspOptions): SinkRaspInstance {
  // Verify license
  requireLicense(options.licenseKey, "sink-rasp");

  if (initialized) {
    console.warn("[ContractShield] Sink RASP already initialized");
    return createInstance();
  }

  // Install hooks
  installHooks(options);
  initialized = true;

  console.log(`[ContractShield] Sink RASP initialized (mode: ${options.mode})`);

  return createInstance();
}

/**
 * Shutdown Sink-aware RASP and restore original functions.
 */
export function shutdownSinkRasp(): void {
  if (!initialized) return;

  uninstallHooks();
  initialized = false;

  console.log("[ContractShield] Sink RASP shutdown");
}

/**
 * Create a SinkRaspInstance for manual checks
 */
function createInstance(): SinkRaspInstance {
  return {
    isActive(): boolean {
      return initialized && isInstalled();
    },

    getMode(): "monitor" | "enforce" {
      return getOptions()?.mode ?? "monitor";
    },

    checkCommand(command: string): AnalysisResult {
      return analyzeCommand(command);
    },

    checkPath(path: string): AnalysisResult {
      const result = analyzePath(path);
      return {
        dangerous: result.dangerous,
        reason: result.reason,
        patterns: result.patterns || [],
      };
    },

    checkUrl(url: string): AnalysisResult {
      const options = getOptions();
      const httpOptions = typeof options?.sinks?.httpEgress === "object"
        ? options.sinks.httpEgress
        : {};

      return analyzeUrl(url, {
        blockPrivateIPs: httpOptions.blockPrivateIPs ?? true,
        blockMetadataEndpoints: httpOptions.blockMetadataEndpoints ?? true,
      });
    },

    shutdown(): void {
      shutdownSinkRasp();
    },
  };
}

// Re-export types
export type {
  SinkRaspOptions,
  SinkRaspInstance,
  BlockEvent,
  DetectEvent,
  AnalysisResult,
  CommandExecutionOptions,
  FilesystemOptions,
  HttpEgressOptions,
  SqlOptions,
} from "./types.js";

// Re-export context utilities
export {
  runWithContext,
  getRequestContext,
  setContextValue,
  expressContextMiddleware,
  fastifyContextPlugin,
} from "./context/asyncContext.js";

// Re-export analyzers for advanced usage
export { analyzeCommand, isCommandAllowed } from "./analyzers/commandAnalyzer.js";
export { analyzePath, isPathAllowed, isPathBlocked } from "./analyzers/pathAnalyzer.js";
export { analyzeUrl, isHostAllowed, isHostBlocked } from "./analyzers/urlAnalyzer.js";

// Re-export reporter utilities
export { configureReporter, createCollectingReporter } from "./reporting/reporter.js";

export default initSinkRasp;
