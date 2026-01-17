/**
 * Child Process Hooks
 * Intercepts exec, execSync, spawn, spawnSync to prevent command injection
 */

import * as childProcess from "child_process";
import { analyzeCommand, isCommandAllowed } from "../analyzers/commandAnalyzer.js";
import { report } from "../reporting/reporter.js";
import { getRequestContext } from "../context/asyncContext.js";
import type { SinkRaspOptions, BlockEvent } from "../types.js";

// Store original functions
const originalExec = childProcess.exec;
const originalExecSync = childProcess.execSync;
const originalSpawn = childProcess.spawn;
const originalSpawnSync = childProcess.spawnSync;
const originalExecFile = childProcess.execFile;
const originalExecFileSync = childProcess.execFileSync;

let options: SinkRaspOptions | null = null;
let installed = false;

/**
 * Install child_process hooks
 */
export function installCommandHooks(opts: SinkRaspOptions): void {
  if (installed) return;
  options = opts;

  // Hook exec
  (childProcess as any).exec = function hookedExec(
    command: string,
    ...args: any[]
  ): any {
    const result = checkCommand(command, "exec");
    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      const callback = args.find((a) => typeof a === "function");
      if (callback) {
        process.nextTick(() => callback(error, "", ""));
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
  ): any {
    const result = checkCommand(command, "execSync");
    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      throw error;
    }
    return originalExecSync.call(this, command, ...args);
  };

  // Hook spawn
  (childProcess as any).spawn = function hookedSpawn(
    command: string,
    args?: readonly string[] | childProcess.SpawnOptions,
    spawnOptions?: childProcess.SpawnOptions
  ): any {
    // Handle overloaded signature
    const actualArgs = Array.isArray(args) ? args : [];
    const fullCommand = actualArgs.length > 0
      ? `${command} ${actualArgs.join(" ")}`
      : command;

    const result = checkCommand(fullCommand, "spawn");
    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      throw error;
    }

    if (Array.isArray(args)) {
      return originalSpawn.call(this, command, args, spawnOptions);
    } else {
      return originalSpawn.call(this, command, args as childProcess.SpawnOptions);
    }
  };

  // Hook spawnSync
  (childProcess as any).spawnSync = function hookedSpawnSync(
    command: string,
    args?: readonly string[] | childProcess.SpawnSyncOptions,
    spawnOptions?: childProcess.SpawnSyncOptions
  ): any {
    const actualArgs = Array.isArray(args) ? args : [];
    const fullCommand = actualArgs.length > 0
      ? `${command} ${actualArgs.join(" ")}`
      : command;

    const result = checkCommand(fullCommand, "spawnSync");
    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      throw error;
    }

    if (Array.isArray(args)) {
      return originalSpawnSync.call(this, command, args, spawnOptions);
    } else {
      return originalSpawnSync.call(this, command, args as childProcess.SpawnSyncOptions);
    }
  };

  // Hook execFile
  (childProcess as any).execFile = function hookedExecFile(
    file: string,
    ...args: any[]
  ): any {
    const cmdArgs = Array.isArray(args[0]) ? args[0] : [];
    const fullCommand = cmdArgs.length > 0
      ? `${file} ${cmdArgs.join(" ")}`
      : file;

    const result = checkCommand(fullCommand, "execFile");
    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      const callback = args.find((a) => typeof a === "function");
      if (callback) {
        process.nextTick(() => callback(error, "", ""));
        return;
      }
      throw error;
    }
    return originalExecFile.call(this, file, ...args);
  };

  // Hook execFileSync
  (childProcess as any).execFileSync = function hookedExecFileSync(
    file: string,
    ...args: any[]
  ): any {
    const cmdArgs = Array.isArray(args[0]) ? args[0] : [];
    const fullCommand = cmdArgs.length > 0
      ? `${file} ${cmdArgs.join(" ")}`
      : file;

    const result = checkCommand(fullCommand, "execFileSync");
    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      throw error;
    }
    return originalExecFileSync.call(this, file, ...args);
  };

  installed = true;
}

/**
 * Uninstall child_process hooks
 */
export function uninstallCommandHooks(): void {
  if (!installed) return;

  (childProcess as any).exec = originalExec;
  (childProcess as any).execSync = originalExecSync;
  (childProcess as any).spawn = originalSpawn;
  (childProcess as any).spawnSync = originalSpawnSync;
  (childProcess as any).execFile = originalExecFile;
  (childProcess as any).execFileSync = originalExecFileSync;

  options = null;
  installed = false;
}

/**
 * Check a command for injection vulnerabilities
 */
function checkCommand(
  command: string,
  operation: string
): { blocked: boolean; reason?: string } {
  if (!options) return { blocked: false };

  // Check allowlist first
  const allowedCommands = options.allowlist?.commands ?? [];
  if (isCommandAllowed(command, allowedCommands)) {
    return { blocked: false };
  }

  // Analyze command
  const analysis = analyzeCommand(command);

  if (analysis.dangerous) {
    const event: BlockEvent = {
      timestamp: new Date(),
      sink: "child_process",
      operation,
      input: command.substring(0, 200),
      reason: analysis.reason,
      stack: new Error().stack || "",
      requestId: getRequestContext()?.requestId,
    };

    // Report the event
    report({
      ...event,
      action: options.mode === "enforce" ? "blocked" : "monitored",
    });

    // Call callbacks
    if (options.mode === "enforce" && options.onBlock) {
      options.onBlock(event);
    }
    if (options.onDetect) {
      options.onDetect({
        ...event,
        action: options.mode === "enforce" ? "blocked" : "monitored",
      });
    }

    return { blocked: true, reason: analysis.reason };
  }

  return { blocked: false };
}

/**
 * Check if hooks are installed
 */
export function isInstalled(): boolean {
  return installed;
}
