/**
 * ContractShield Learning Mode - File Storage
 *
 * File-based storage for request samples with optional encryption.
 * v1: Only storage backend.
 *
 * @license Commercial
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as zlib from "zlib";
import { promisify } from "util";
import type { RequestSample, StorageOptions, StorageStats } from "../types.js";

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const FILE_EXTENSION = ".samples.gz";
const ENCRYPTED_EXTENSION = ".samples.enc.gz";

/**
 * Storage interface
 */
export interface Storage {
  store(sample: RequestSample): Promise<void>;
  getSamples(route?: string): Promise<RequestSample[]>;
  getRoutes(): Promise<string[]>;
  getStats(): Promise<StorageStats>;
  clear(): Promise<void>;
  purgeExpired(): Promise<number>;
}

/**
 * File-based storage for learning samples
 */
export class FileStorage implements Storage {
  private basePath: string;
  private options: StorageOptions;
  private encryptionKey: Buffer | null = null;
  private writeBuffer: Map<string, RequestSample[]> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(options: StorageOptions) {
    this.options = options;
    this.basePath = this.resolvePath(options.path);

    // Initialize encryption key if enabled
    if (options.encryption) {
      if (!options.encryptionKey) {
        throw new Error("Encryption key required when encryption is enabled");
      }
      this.encryptionKey = crypto
        .createHash("sha256")
        .update(options.encryptionKey)
        .digest();
    }

    // Ensure directory exists with secure permissions
    this.ensureDirectory();

    // Start periodic flush
    this.startFlushInterval();
  }

  /**
   * Store a sample
   */
  async store(sample: RequestSample): Promise<void> {
    const route = this.sanitizeRoute(sample.route);

    // Buffer samples for batch writing
    if (!this.writeBuffer.has(route)) {
      this.writeBuffer.set(route, []);
    }

    const buffer = this.writeBuffer.get(route)!;
    buffer.push(sample);

    // Flush if buffer is large enough
    if (buffer.length >= 100) {
      await this.flushRoute(route);
    }
  }

  /**
   * Get samples for a route (or all routes)
   */
  async getSamples(route?: string): Promise<RequestSample[]> {
    // Flush pending writes first
    await this.flush();

    const samples: RequestSample[] = [];

    if (route) {
      const sanitized = this.sanitizeRoute(route);
      const routeDir = path.join(this.basePath, sanitized);

      if (fs.existsSync(routeDir)) {
        const routeSamples = await this.loadRouteSamples(routeDir);
        samples.push(...routeSamples);
      }
    } else {
      // Load all routes
      const routes = await this.getRoutes();
      for (const r of routes) {
        const routeDir = path.join(this.basePath, this.sanitizeRoute(r));
        if (fs.existsSync(routeDir)) {
          const routeSamples = await this.loadRouteSamples(routeDir);
          samples.push(...routeSamples);
        }
      }
    }

    return samples;
  }

  /**
   * Get list of observed routes
   */
  async getRoutes(): Promise<string[]> {
    if (!fs.existsSync(this.basePath)) {
      return [];
    }

    const entries = fs.readdirSync(this.basePath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => this.unsanitizeRoute(e.name));
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    const routes = await this.getRoutes();
    const byRoute: Record<string, number> = {};
    let totalSamples = 0;
    let oldestSample = "";
    let newestSample = "";
    let storageSize = 0;

    for (const route of routes) {
      const routeDir = path.join(this.basePath, this.sanitizeRoute(route));
      const samples = await this.loadRouteSamples(routeDir);

      byRoute[route] = samples.length;
      totalSamples += samples.length;

      for (const sample of samples) {
        if (!oldestSample || sample.timestamp < oldestSample) {
          oldestSample = sample.timestamp;
        }
        if (!newestSample || sample.timestamp > newestSample) {
          newestSample = sample.timestamp;
        }
      }

      // Calculate storage size
      if (fs.existsSync(routeDir)) {
        const files = fs.readdirSync(routeDir);
        for (const file of files) {
          const stat = fs.statSync(path.join(routeDir, file));
          storageSize += stat.size;
        }
      }
    }

    return {
      totalSamples,
      byRoute,
      oldestSample,
      newestSample,
      storageSize,
    };
  }

  /**
   * Clear all stored samples
   */
  async clear(): Promise<void> {
    this.writeBuffer.clear();

    if (fs.existsSync(this.basePath)) {
      fs.rmSync(this.basePath, { recursive: true, force: true });
    }

    this.ensureDirectory();
  }

  /**
   * Purge expired samples based on TTL
   * @returns Number of samples purged
   */
  async purgeExpired(): Promise<number> {
    const now = Date.now();
    const ttlMs = this.options.ttl * 1000;
    let purged = 0;

    const routes = await this.getRoutes();

    for (const route of routes) {
      const routeDir = path.join(this.basePath, this.sanitizeRoute(route));
      if (!fs.existsSync(routeDir)) continue;

      const files = fs.readdirSync(routeDir);

      for (const file of files) {
        const filePath = path.join(routeDir, file);
        const stat = fs.statSync(filePath);

        // Check if file is older than TTL
        if (now - stat.mtimeMs > ttlMs) {
          const samples = await this.loadFile(filePath);
          purged += samples.length;
          fs.unlinkSync(filePath);
        }
      }

      // Remove empty directories
      const remaining = fs.readdirSync(routeDir);
      if (remaining.length === 0) {
        fs.rmdirSync(routeDir);
      }
    }

    return purged;
  }

  /**
   * Shutdown storage (flush pending writes)
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flush();
  }

  private resolvePath(configPath: string): string {
    if (path.isAbsolute(configPath)) {
      return configPath;
    }

    // Relative to home directory
    return path.join(os.homedir(), configPath);
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true, mode: 0o700 });
    }
  }

  private sanitizeRoute(route: string): string {
    // Convert route to safe directory name
    return route
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/__+/g, "_")
      .toLowerCase();
  }

  private unsanitizeRoute(dirName: string): string {
    // Best effort to restore route from directory name
    return dirName.replace(/_/g, " ").replace(/\s+/g, " ");
  }

  private startFlushInterval(): void {
    // Flush every 10 seconds
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => {
        console.error("[ContractShield Learning] Flush error:", err.message);
      });
    }, 10000);

    // Don't prevent process exit
    this.flushInterval.unref();
  }

  private async flush(): Promise<void> {
    const routes = Array.from(this.writeBuffer.keys());
    for (const route of routes) {
      await this.flushRoute(route);
    }
  }

  private async flushRoute(route: string): Promise<void> {
    const samples = this.writeBuffer.get(route);
    if (!samples || samples.length === 0) return;

    // Clear buffer first (to avoid re-flush on error)
    this.writeBuffer.set(route, []);

    const routeDir = path.join(this.basePath, route);
    if (!fs.existsSync(routeDir)) {
      fs.mkdirSync(routeDir, { recursive: true, mode: 0o700 });
    }

    // Check route sample limit
    await this.enforceRouteLimit(routeDir);

    // Create timestamped file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const extension = this.encryptionKey ? ENCRYPTED_EXTENSION : FILE_EXTENSION;
    const fileName = `${timestamp}${extension}`;
    const filePath = path.join(routeDir, fileName);

    // Serialize and compress
    const json = JSON.stringify(samples);
    const compressed = await gzipAsync(json, { level: 6 });

    // Optionally encrypt
    let data: Buffer;
    if (this.encryptionKey) {
      data = this.encrypt(compressed);
    } else {
      data = compressed;
    }

    // Write with secure permissions
    fs.writeFileSync(filePath, data, { mode: 0o600 });
  }

  private async enforceRouteLimit(routeDir: string): Promise<void> {
    const maxSamples = this.options.maxSamplesPerRoute;

    // Count current samples
    const files = fs.readdirSync(routeDir).sort();
    let currentCount = 0;

    for (const file of files) {
      const samples = await this.loadFile(path.join(routeDir, file));
      currentCount += samples.length;
    }

    // Remove oldest files if over limit
    while (currentCount > maxSamples && files.length > 0) {
      const oldest = files.shift()!;
      const oldestPath = path.join(routeDir, oldest);
      const samples = await this.loadFile(oldestPath);
      currentCount -= samples.length;
      fs.unlinkSync(oldestPath);
    }
  }

  private async loadRouteSamples(routeDir: string): Promise<RequestSample[]> {
    const samples: RequestSample[] = [];
    const files = fs.readdirSync(routeDir);

    for (const file of files) {
      if (file.endsWith(FILE_EXTENSION) || file.endsWith(ENCRYPTED_EXTENSION)) {
        const fileSamples = await this.loadFile(path.join(routeDir, file));
        samples.push(...fileSamples);
      }
    }

    return samples;
  }

  private async loadFile(filePath: string): Promise<RequestSample[]> {
    try {
      let data = fs.readFileSync(filePath);

      // Decrypt if needed
      if (filePath.endsWith(ENCRYPTED_EXTENSION) && this.encryptionKey) {
        data = Buffer.from(this.decrypt(data));
      }

      // Decompress
      const json = await gunzipAsync(data);
      return JSON.parse(json.toString()) as RequestSample[];
    } catch (err) {
      console.error(`[ContractShield Learning] Failed to load ${filePath}:`, (err as Error).message);
      return [];
    }
  }

  private encrypt(data: Buffer): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey!, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Format: IV (16) + AuthTag (16) + Encrypted
    return Buffer.concat([iv, authTag, encrypted]);
  }

  private decrypt(data: Buffer): Buffer {
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const encrypted = data.subarray(32);

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey!, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}

/**
 * Create file storage with options
 */
export function createFileStorage(options: StorageOptions): FileStorage {
  return new FileStorage(options);
}

/**
 * Parse size string to bytes (e.g., '500MB' -> 524288000)
 */
export function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || "B").toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]);
}
