/**
 * Interceptor Core
 * Manages installation and uninstallation of all hooks
 */

import { installCommandHooks, uninstallCommandHooks } from "./hooks/childProcess.js";
import { installFilesystemHooks, uninstallFilesystemHooks } from "./hooks/filesystem.js";
import { installHttpHooks, uninstallHttpHooks } from "./hooks/http.js";
import { configureReporter } from "./reporting/reporter.js";
import type { SinkRaspOptions } from "./types.js";

let currentOptions: SinkRaspOptions | null = null;

/**
 * Install all configured hooks
 */
export function installHooks(options: SinkRaspOptions): void {
  currentOptions = options;

  // Default sinks configuration
  const sinks = options.sinks ?? {
    commandExecution: true,
    filesystem: true,
    httpEgress: true,
    sql: false,
    eval: true,
  };

  // Configure reporter based on mode
  configureReporter({
    redactSensitive: true,
    maxInputLength: 200,
  });

  // Install command execution hooks
  if (sinks.commandExecution) {
    installCommandHooks(options);
  }

  // Install filesystem hooks
  if (sinks.filesystem) {
    installFilesystemHooks(options);
  }

  // Install HTTP egress hooks
  if (sinks.httpEgress) {
    installHttpHooks(options);
  }

  // SQL hooks - TODO: implement in future version
  if (sinks.sql) {
    console.warn("[ContractShield] SQL hooks not yet implemented");
  }

  // Eval hooks - TODO: implement in future version
  if (sinks.eval) {
    // Note: Hooking eval() is tricky in JavaScript
    // Consider using CSP or other mechanisms
    console.warn("[ContractShield] Eval hooks not yet implemented");
  }
}

/**
 * Uninstall all hooks
 */
export function uninstallHooks(): void {
  uninstallCommandHooks();
  uninstallFilesystemHooks();
  uninstallHttpHooks();
  currentOptions = null;
}

/**
 * Get current options
 */
export function getOptions(): SinkRaspOptions | null {
  return currentOptions;
}

/**
 * Check if any hooks are installed
 */
export function isInstalled(): boolean {
  return currentOptions !== null;
}
