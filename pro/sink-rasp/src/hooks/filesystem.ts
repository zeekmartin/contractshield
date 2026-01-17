/**
 * Filesystem Hooks
 * Intercepts fs operations to prevent path traversal attacks
 */

import * as fs from "fs";
import * as fsPromises from "fs/promises";
import { analyzePath, isPathAllowed, isPathBlocked } from "../analyzers/pathAnalyzer.js";
import { report } from "../reporting/reporter.js";
import { getRequestContext } from "../context/asyncContext.js";
import type { SinkRaspOptions, BlockEvent, FilesystemOptions } from "../types.js";

// Store original functions
const originalReadFile = fs.readFile;
const originalReadFileSync = fs.readFileSync;
const originalWriteFile = fs.writeFile;
const originalWriteFileSync = fs.writeFileSync;
const originalUnlink = fs.unlink;
const originalUnlinkSync = fs.unlinkSync;
const originalReaddir = fs.readdir;
const originalReaddirSync = fs.readdirSync;
const originalStat = fs.stat;
const originalStatSync = fs.statSync;

// Promises versions
const originalReadFilePromise = fsPromises.readFile;
const originalWriteFilePromise = fsPromises.writeFile;
const originalUnlinkPromise = fsPromises.unlink;
const originalReaddirPromise = fsPromises.readdir;
const originalStatPromise = fsPromises.stat;

let options: SinkRaspOptions | null = null;
let installed = false;

/**
 * Install filesystem hooks
 */
export function installFilesystemHooks(opts: SinkRaspOptions): void {
  if (installed) return;
  options = opts;

  const fsOptions = typeof opts.sinks?.filesystem === "object"
    ? opts.sinks.filesystem
    : {};
  const operations = fsOptions.operations || ["read", "write", "delete"];

  // Hook read operations
  if (operations.includes("read")) {
    // readFile
    (fs as any).readFile = function hookedReadFile(
      path: fs.PathLike,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "readFile", "read");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        const callback = args.find((a) => typeof a === "function");
        if (callback) {
          process.nextTick(() => callback(error));
          return;
        }
        throw error;
      }
      return originalReadFile.call(this, path, ...args);
    };

    // readFileSync
    (fs as any).readFileSync = function hookedReadFileSync(
      path: fs.PathLike,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "readFileSync", "read");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalReadFileSync.call(this, path, ...args);
    };

    // readdir
    (fs as any).readdir = function hookedReaddir(
      path: fs.PathLike,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "readdir", "read");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        const callback = args.find((a) => typeof a === "function");
        if (callback) {
          process.nextTick(() => callback(error));
          return;
        }
        throw error;
      }
      return originalReaddir.call(this, path, ...args);
    };

    // readdirSync
    (fs as any).readdirSync = function hookedReaddirSync(
      path: fs.PathLike,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "readdirSync", "read");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalReaddirSync.call(this, path, ...args);
    };

    // stat
    (fs as any).stat = function hookedStat(
      path: fs.PathLike,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "stat", "read");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        const callback = args.find((a) => typeof a === "function");
        if (callback) {
          process.nextTick(() => callback(error));
          return;
        }
        throw error;
      }
      return originalStat.call(this, path, ...args);
    };

    // statSync
    (fs as any).statSync = function hookedStatSync(
      path: fs.PathLike,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "statSync", "read");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalStatSync.call(this, path, ...args);
    };

    // fs/promises
    (fsPromises as any).readFile = async function hookedReadFilePromise(
      path: fs.PathLike,
      ...args: any[]
    ): Promise<any> {
      const result = checkPath(String(path), "readFile", "read");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalReadFilePromise.call(this, path, ...args);
    };

    (fsPromises as any).readdir = async function hookedReaddirPromise(
      path: fs.PathLike,
      ...args: any[]
    ): Promise<any> {
      const result = checkPath(String(path), "readdir", "read");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalReaddirPromise.call(this, path, ...args);
    };

    (fsPromises as any).stat = async function hookedStatPromise(
      path: fs.PathLike,
      ...args: any[]
    ): Promise<any> {
      const result = checkPath(String(path), "stat", "read");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalStatPromise.call(this, path, ...args);
    };
  }

  // Hook write operations
  if (operations.includes("write")) {
    // writeFile
    (fs as any).writeFile = function hookedWriteFile(
      path: fs.PathLike,
      data: any,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "writeFile", "write");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        const callback = args.find((a) => typeof a === "function");
        if (callback) {
          process.nextTick(() => callback(error));
          return;
        }
        throw error;
      }
      return originalWriteFile.call(this, path, data, ...args);
    };

    // writeFileSync
    (fs as any).writeFileSync = function hookedWriteFileSync(
      path: fs.PathLike,
      data: any,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "writeFileSync", "write");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalWriteFileSync.call(this, path, data, ...args);
    };

    // fs/promises
    (fsPromises as any).writeFile = async function hookedWriteFilePromise(
      path: fs.PathLike,
      data: any,
      ...args: any[]
    ): Promise<any> {
      const result = checkPath(String(path), "writeFile", "write");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalWriteFilePromise.call(this, path, data, ...args);
    };
  }

  // Hook delete operations
  if (operations.includes("delete")) {
    // unlink
    (fs as any).unlink = function hookedUnlink(
      path: fs.PathLike,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "unlink", "delete");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        const callback = args.find((a) => typeof a === "function");
        if (callback) {
          process.nextTick(() => callback(error));
          return;
        }
        throw error;
      }
      return originalUnlink.call(this, path, ...args);
    };

    // unlinkSync
    (fs as any).unlinkSync = function hookedUnlinkSync(
      path: fs.PathLike,
      ...args: any[]
    ): any {
      const result = checkPath(String(path), "unlinkSync", "delete");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalUnlinkSync.call(this, path, ...args);
    };

    // fs/promises
    (fsPromises as any).unlink = async function hookedUnlinkPromise(
      path: fs.PathLike,
      ...args: any[]
    ): Promise<any> {
      const result = checkPath(String(path), "unlink", "delete");
      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }
      return originalUnlinkPromise.call(this, path, ...args);
    };
  }

  installed = true;
}

/**
 * Uninstall filesystem hooks
 */
export function uninstallFilesystemHooks(): void {
  if (!installed) return;

  // Restore sync functions
  (fs as any).readFile = originalReadFile;
  (fs as any).readFileSync = originalReadFileSync;
  (fs as any).writeFile = originalWriteFile;
  (fs as any).writeFileSync = originalWriteFileSync;
  (fs as any).unlink = originalUnlink;
  (fs as any).unlinkSync = originalUnlinkSync;
  (fs as any).readdir = originalReaddir;
  (fs as any).readdirSync = originalReaddirSync;
  (fs as any).stat = originalStat;
  (fs as any).statSync = originalStatSync;

  // Restore promises
  (fsPromises as any).readFile = originalReadFilePromise;
  (fsPromises as any).writeFile = originalWriteFilePromise;
  (fsPromises as any).unlink = originalUnlinkPromise;
  (fsPromises as any).readdir = originalReaddirPromise;
  (fsPromises as any).stat = originalStatPromise;

  options = null;
  installed = false;
}

/**
 * Check a path for traversal vulnerabilities
 */
function checkPath(
  path: string,
  operation: string,
  opType: "read" | "write" | "delete"
): { blocked: boolean; reason?: string } {
  if (!options) return { blocked: false };

  const fsOptions = typeof options.sinks?.filesystem === "object"
    ? options.sinks.filesystem
    : {};

  // Check allowlist first
  const allowedPaths = [
    ...(options.allowlist?.paths ?? []),
    ...(fsOptions.allowedPaths ?? []),
  ];
  if (allowedPaths.length > 0 && isPathAllowed(path, allowedPaths)) {
    return { blocked: false };
  }

  // Check blocklist
  const blockedPaths = fsOptions.blockedPaths ?? [];
  if (blockedPaths.length > 0 && isPathBlocked(path, blockedPaths)) {
    const event: BlockEvent = {
      timestamp: new Date(),
      sink: "fs",
      operation,
      input: path.substring(0, 200),
      reason: `Path explicitly blocked: ${path}`,
      stack: new Error().stack || "",
      requestId: getRequestContext()?.requestId,
    };

    report({
      ...event,
      action: options.mode === "enforce" ? "blocked" : "monitored",
    });

    if (options.mode === "enforce" && options.onBlock) {
      options.onBlock(event);
    }
    if (options.onDetect) {
      options.onDetect({
        ...event,
        action: options.mode === "enforce" ? "blocked" : "monitored",
      });
    }

    return { blocked: true, reason: event.reason };
  }

  // Analyze path
  const analysis = analyzePath(path);

  if (analysis.dangerous) {
    const event: BlockEvent = {
      timestamp: new Date(),
      sink: "fs",
      operation,
      input: path.substring(0, 200),
      reason: analysis.reason,
      stack: new Error().stack || "",
      requestId: getRequestContext()?.requestId,
    };

    report({
      ...event,
      action: options.mode === "enforce" ? "blocked" : "monitored",
    });

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
