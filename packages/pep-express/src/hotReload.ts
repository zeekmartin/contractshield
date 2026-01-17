/**
 * Policy Hot Reload
 * Watches policy files and reloads them automatically
 */

import { watch, type FSWatcher } from "fs";
import { readFileSync, existsSync } from "fs";
import { EventEmitter } from "events";
import { resolve } from "path";
import type { PolicySet } from "@contractshield/pdp";

export interface HotReloadOptions {
  /** Enable hot reload (default: true in dev, false in prod) */
  enabled?: boolean;
  /** Debounce delay in ms (default: 500) */
  debounceMs?: number;
  /** Callback when policy is reloaded */
  onReload?: (policy: PolicySet) => void;
  /** Callback on reload error */
  onError?: (error: Error) => void;
}

export interface HotReloadEvents {
  reload: (policy: PolicySet) => void;
  error: (error: Error) => void;
}

/**
 * Policy hot reloader with file watching
 */
export class PolicyHotReloader extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private currentPolicy: PolicySet | null = null;
  private resolvedPath: string;
  private options: Required<HotReloadOptions>;
  private started = false;

  constructor(
    private policyPath: string,
    options: HotReloadOptions = {}
  ) {
    super();
    this.resolvedPath = resolve(policyPath);

    // Determine if we're in development
    const isDev = process.env.NODE_ENV !== "production";

    this.options = {
      enabled: options.enabled ?? isDev,
      debounceMs: options.debounceMs ?? 500,
      onReload: options.onReload ?? (() => {}),
      onError: options.onError ?? ((err) => console.error("[ContractShield] Hot reload error:", err)),
    };

    // Load initial policy
    this.loadPolicy();
  }

  /**
   * Start watching for changes
   */
  start(): void {
    if (!this.options.enabled || this.started) {
      return;
    }

    if (!existsSync(this.resolvedPath)) {
      this.options.onError(new Error(`Policy file not found: ${this.resolvedPath}`));
      return;
    }

    try {
      this.watcher = watch(this.resolvedPath, (eventType) => {
        if (eventType === "change") {
          this.scheduleReload();
        }
      });

      this.watcher.on("error", (error) => {
        this.options.onError(error);
        this.emit("error", error);
      });

      this.started = true;
      console.log(`[ContractShield] Hot reload enabled for ${this.policyPath}`);
    } catch (error) {
      this.options.onError(error as Error);
    }
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.started = false;
  }

  /**
   * Get current policy
   */
  getCurrentPolicy(): PolicySet {
    if (!this.currentPolicy) {
      this.loadPolicy();
    }
    return this.currentPolicy!;
  }

  /**
   * Force reload
   */
  reload(): void {
    this.loadPolicy();
  }

  private scheduleReload(): void {
    // Debounce multiple rapid changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.loadPolicy();
    }, this.options.debounceMs);
  }

  private loadPolicy(): void {
    try {
      const content = readFileSync(this.resolvedPath, "utf8");
      const newPolicy = this.parsePolicy(content);

      // Validate basic structure
      if (!newPolicy || typeof newPolicy !== "object") {
        throw new Error("Invalid policy: not an object");
      }

      const oldPolicy = this.currentPolicy;
      this.currentPolicy = newPolicy;

      // Only emit reload event if this is an update (not initial load)
      if (oldPolicy !== null) {
        console.log(`[ContractShield] Policy reloaded: ${newPolicy.routes?.length ?? 0} routes`);
        this.options.onReload(newPolicy);
        this.emit("reload", newPolicy);
      }
    } catch (error) {
      this.options.onError(error as Error);
      this.emit("error", error);
      // Keep using the old policy on error
    }
  }

  private parsePolicy(content: string): PolicySet {
    // Try JSON first
    try {
      return JSON.parse(content);
    } catch {
      // Fall back to YAML parsing
      return this.parseSimpleYaml(content) as PolicySet;
    }
  }

  private parseSimpleYaml(content: string): unknown {
    // Minimal YAML parser (same as in middleware.ts)
    const lines = content.split("\n");
    const result: any = {};
    const stack: { obj: any; indent: number }[] = [{ obj: result, indent: -1 }];
    let currentArray: any[] | null = null;
    let currentArrayIndent = -1;

    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith("#")) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      if (trimmed.startsWith("- ")) {
        if (currentArray && indent === currentArrayIndent) {
          const value = trimmed.slice(2).trim();
          if (value.includes(":")) {
            const obj: any = {};
            const [k, v] = value.split(":").map((s) => s.trim());
            obj[k] = this.parseYamlValue(v);
            currentArray.push(obj);
          } else {
            currentArray.push(this.parseYamlValue(value));
          }
        }
        continue;
      }

      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      currentArray = null;

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const rawValue = trimmed.slice(colonIdx + 1).trim();
      const parent = stack[stack.length - 1].obj;

      if (rawValue === "") {
        const nextLineIdx = lines.indexOf(line) + 1;
        const nextLine = lines.slice(nextLineIdx).find((l) => l.trim());
        if (nextLine?.trim().startsWith("- ")) {
          parent[key] = [];
          currentArray = parent[key];
          currentArrayIndent = nextLine.search(/\S/);
        } else {
          parent[key] = {};
          stack.push({ obj: parent[key], indent });
        }
      } else {
        parent[key] = this.parseYamlValue(rawValue);
      }
    }

    return result;
  }

  private parseYamlValue(str: string): any {
    if (str === "true") return true;
    if (str === "false") return false;
    if (str === "null") return null;
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);
    if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
    if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1);
    if (str.startsWith("'") && str.endsWith("'")) return str.slice(1, -1);
    return str;
  }
}

/**
 * Create a policy loader with optional hot reload
 */
export function createPolicyLoader(
  policyPath: string,
  options: HotReloadOptions = {}
): { getPolicy: () => PolicySet; stop: () => void } {
  const reloader = new PolicyHotReloader(policyPath, options);

  if (options.enabled !== false && process.env.NODE_ENV !== "production") {
    reloader.start();
  }

  return {
    getPolicy: () => reloader.getCurrentPolicy(),
    stop: () => reloader.stop(),
  };
}
