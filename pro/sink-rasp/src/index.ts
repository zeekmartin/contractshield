/**
 * ContractShield Sink-aware RASP
 *
 * COMMERCIAL LICENSE REQUIRED
 *
 * This module provides runtime protection for dangerous sinks:
 * - SQL queries
 * - File system operations
 * - Command execution
 * - HTTP egress
 * - Template rendering
 *
 * @see https://contractshield.dev/docs/sink-rasp
 * @license Commercial - See ../LICENSE
 */

import { requireLicense } from "@contractshield/license";

export interface SinkRaspOptions {
  /** License key (required) */
  licenseKey: string;
  /** Enable SQL sink protection */
  sql?: boolean;
  /** Enable file system sink protection */
  fs?: boolean;
  /** Enable command execution sink protection */
  exec?: boolean;
  /** Enable HTTP egress sink protection */
  http?: boolean;
  /** Enable template sink protection */
  template?: boolean;
  /** Callback when a sink is blocked */
  onBlock?: (sink: string, context: SinkContext) => void;
  /** Callback when a sink is monitored */
  onMonitor?: (sink: string, context: SinkContext) => void;
}

export interface SinkContext {
  /** Type of sink (sql, fs, exec, http, template) */
  type: string;
  /** The dangerous operation that was detected */
  operation: string;
  /** Additional context about the operation */
  details: Record<string, unknown>;
  /** Stack trace (if available) */
  stack?: string;
}

export interface SinkRaspInstance {
  /** Check if sink-rasp is active */
  isActive(): boolean;
  /** Manually check a SQL query */
  checkSql(query: string, params?: unknown[]): void;
  /** Manually check a file path */
  checkFs(path: string, operation: "read" | "write" | "delete"): void;
  /** Manually check a command */
  checkExec(command: string, args?: string[]): void;
  /** Manually check an HTTP request */
  checkHttp(url: string, method?: string): void;
  /** Manually check a template */
  checkTemplate(template: string, context?: Record<string, unknown>): void;
  /** Disable sink-rasp */
  disable(): void;
}

/**
 * Initialize Sink-aware RASP protection.
 *
 * @param options Configuration options
 * @returns SinkRaspInstance for manual checks
 * @throws LicenseError if license is invalid or missing 'sink-rasp' feature
 *
 * @example
 * ```typescript
 * import { initSinkRasp } from '@contractshield/sink-rasp';
 *
 * const sinkRasp = initSinkRasp({
 *   licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
 *   sql: true,
 *   fs: true,
 *   exec: true,
 *   onBlock: (sink, ctx) => {
 *     console.error(`Blocked ${sink} operation:`, ctx);
 *   }
 * });
 * ```
 */
export function initSinkRasp(options: SinkRaspOptions): SinkRaspInstance {
  // Verify license
  requireLicense(options.licenseKey, "sink-rasp");

  console.log("[ContractShield] Sink RASP initialized");

  // TODO: Implement in v1.0
  // - Monkey-patch Node.js modules (pg, mysql2, fs, child_process, etc.)
  // - Register async hooks for tracking
  // - Implement policy-based blocking

  const instance: SinkRaspInstance = {
    isActive() {
      return true;
    },

    checkSql(query: string, params?: unknown[]) {
      // TODO: Implement SQL injection detection
      console.log("[SinkRASP] SQL check:", query.slice(0, 100));
    },

    checkFs(path: string, operation: "read" | "write" | "delete") {
      // TODO: Implement path traversal detection
      console.log("[SinkRASP] FS check:", operation, path);
    },

    checkExec(command: string, args?: string[]) {
      // TODO: Implement command injection detection
      console.log("[SinkRASP] Exec check:", command);
    },

    checkHttp(url: string, method?: string) {
      // TODO: Implement SSRF detection
      console.log("[SinkRASP] HTTP check:", method || "GET", url);
    },

    checkTemplate(template: string, context?: Record<string, unknown>) {
      // TODO: Implement template injection detection
      console.log("[SinkRASP] Template check:", template.slice(0, 100));
    },

    disable() {
      console.log("[ContractShield] Sink RASP disabled");
    },
  };

  return instance;
}

export default initSinkRasp;
