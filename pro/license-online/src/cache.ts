/**
 * ContractShield Pro - License Cache
 *
 * Caches license validation responses for 24 hours to reduce API calls
 * and enable offline operation.
 *
 * @license Commercial
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import type { CachedLicense, LicenseValidateSuccessResponse } from "./types.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_DIR_NAME = ".contractshield";
const CACHE_FILE_PREFIX = "license-cache-";

/**
 * Get the cache directory path.
 * Uses ~/.contractshield/ or system temp dir as fallback.
 */
function getCacheDir(): string {
  const homeDir = os.homedir();
  const primaryPath = path.join(homeDir, CACHE_DIR_NAME);

  try {
    if (!fs.existsSync(primaryPath)) {
      fs.mkdirSync(primaryPath, { mode: 0o700, recursive: true });
    }
    // Test write access
    const testFile = path.join(primaryPath, ".test");
    fs.writeFileSync(testFile, "test", { mode: 0o600 });
    fs.unlinkSync(testFile);
    return primaryPath;
  } catch {
    // Fallback to system temp
    const tempPath = path.join(os.tmpdir(), CACHE_DIR_NAME);
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { mode: 0o700, recursive: true });
    }
    return tempPath;
  }
}

/**
 * Hash the license key for cache filename.
 * Never store the plaintext key.
 */
function hashLicenseKey(licenseKey: string): string {
  return crypto.createHash("sha256").update(licenseKey).digest("hex").slice(0, 16);
}

/**
 * Get the cache file path for a license key.
 */
function getCacheFilePath(licenseKey: string): string {
  const hash = hashLicenseKey(licenseKey);
  return path.join(getCacheDir(), `${CACHE_FILE_PREFIX}${hash}.json`);
}

/**
 * Read cached license data.
 *
 * @param licenseKey - The license key to look up
 * @param fingerprint - The machine fingerprint (cache is fingerprint-specific)
 * @returns Cached data or null if not found/expired/different machine
 */
export function readCache(licenseKey: string, fingerprint?: string): CachedLicense | null {
  try {
    const filePath = getCacheFilePath(licenseKey);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const cached: CachedLicense = JSON.parse(content);

    // Verify the hash matches (integrity check)
    const expectedHash = hashLicenseKey(licenseKey);
    if (cached.keyHash !== expectedHash) {
      // Hash mismatch - cache file corrupted or wrong key
      fs.unlinkSync(filePath);
      return null;
    }

    // If fingerprint is provided, verify it matches
    if (fingerprint && cached.fingerprint && cached.fingerprint !== fingerprint) {
      // Different machine - don't use this cache
      return null;
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      // Cache expired, but we might still use it for graceful degradation
      // Don't delete - let the caller decide
      return cached;
    }

    return cached;
  } catch {
    return null;
  }
}

/**
 * Check if cache is expired.
 */
export function isCacheExpired(cached: CachedLicense): boolean {
  return Date.now() > cached.expiresAt;
}

/**
 * Write license data to cache.
 *
 * @param licenseKey - The license key
 * @param response - The validation response to cache
 * @param fingerprint - The machine fingerprint
 * @param ttlMs - Cache TTL in milliseconds (default: 24 hours)
 */
export function writeCache(
  licenseKey: string,
  response: LicenseValidateSuccessResponse,
  fingerprint: string,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  try {
    const filePath = getCacheFilePath(licenseKey);
    const now = Date.now();

    const cached: CachedLicense = {
      cachedAt: now,
      expiresAt: now + ttlMs,
      response,
      keyHash: hashLicenseKey(licenseKey),
      fingerprint,
    };

    // Write with restrictive permissions (owner read/write only)
    fs.writeFileSync(filePath, JSON.stringify(cached, null, 2), {
      mode: 0o600,
    });
  } catch (err) {
    // Silently fail - cache is optional
    console.warn("[ContractShield] Failed to write license cache:", err);
  }
}

/**
 * Clear the cache for a specific license key.
 *
 * @param licenseKey - The license key to clear cache for
 */
export function clearCache(licenseKey: string): void {
  try {
    const filePath = getCacheFilePath(licenseKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Clear all cached licenses.
 */
export function clearAllCaches(): void {
  try {
    const cacheDir = getCacheDir();
    const files = fs.readdirSync(cacheDir);

    for (const file of files) {
      if (file.startsWith(CACHE_FILE_PREFIX) && file.endsWith(".json")) {
        fs.unlinkSync(path.join(cacheDir, file));
      }
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): {
  cacheDir: string;
  entryCount: number;
  totalSizeBytes: number;
} {
  try {
    const cacheDir = getCacheDir();
    const files = fs.readdirSync(cacheDir);

    let entryCount = 0;
    let totalSizeBytes = 0;

    for (const file of files) {
      if (file.startsWith(CACHE_FILE_PREFIX) && file.endsWith(".json")) {
        entryCount++;
        const stats = fs.statSync(path.join(cacheDir, file));
        totalSizeBytes += stats.size;
      }
    }

    return { cacheDir, entryCount, totalSizeBytes };
  } catch {
    return { cacheDir: getCacheDir(), entryCount: 0, totalSizeBytes: 0 };
  }
}
