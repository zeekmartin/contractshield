/**
 * ContractShield Pro - Machine Fingerprint Generator
 *
 * Generates a unique machine fingerprint for license activation tracking.
 * The fingerprint is deterministic for a given machine but doesn't contain
 * sensitive information.
 *
 * @license Commercial
 */

import * as os from "os";
import * as crypto from "crypto";

/**
 * Cached fingerprint to avoid recomputing
 */
let cachedFingerprint: string | null = null;

/**
 * Generate a unique machine fingerprint.
 *
 * The fingerprint is based on:
 * - Hostname
 * - Platform (linux, darwin, win32)
 * - Architecture (x64, arm64)
 * - CPU model
 * - Total memory (rounded to nearest GB to avoid minor fluctuations)
 * - Network interface MAC addresses (sorted, first non-internal)
 *
 * @returns A 32-character hex string fingerprint
 */
export function generateFingerprint(): string {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  const components: string[] = [
    os.hostname(),
    os.platform(),
    os.arch(),
    getCpuModel(),
    getRoundedMemory(),
    getPrimaryMacAddress(),
  ];

  const data = components.join("|");
  cachedFingerprint = crypto
    .createHash("sha256")
    .update(data)
    .digest("hex")
    .substring(0, 32);

  return cachedFingerprint;
}

/**
 * Get CPU model string, normalized.
 */
function getCpuModel(): string {
  const cpus = os.cpus();
  if (cpus.length === 0) {
    return "unknown-cpu";
  }
  // Normalize: remove frequency info which might vary
  return cpus[0].model.replace(/\s*@\s*[\d.]+\s*GHz/i, "").trim();
}

/**
 * Get total memory rounded to nearest GB.
 * This prevents fingerprint changes from minor memory fluctuations.
 */
function getRoundedMemory(): string {
  const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  return `${totalMemGB}GB`;
}

/**
 * Get the primary (first non-internal) MAC address.
 * Returns a placeholder if no suitable interface is found.
 */
function getPrimaryMacAddress(): string {
  const interfaces = os.networkInterfaces();

  // Sort interface names for consistency
  const sortedNames = Object.keys(interfaces).sort();

  for (const name of sortedNames) {
    const addrs = interfaces[name];
    if (!addrs) continue;

    for (const addr of addrs) {
      // Skip internal interfaces and those without MAC
      if (!addr.internal && addr.mac && addr.mac !== "00:00:00:00:00:00") {
        return addr.mac;
      }
    }
  }

  // Fallback for environments without network interfaces (containers, etc.)
  return "no-mac";
}

/**
 * Get metadata about the current machine.
 * This is sent during activation for debugging purposes.
 */
export function getMachineMetadata(): {
  hostname: string;
  os: string;
  arch: string;
  nodeVersion: string;
} {
  return {
    hostname: os.hostname().substring(0, 64),
    os: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version.substring(0, 16),
  };
}

/**
 * Clear the cached fingerprint.
 * Useful for testing.
 */
export function clearFingerprintCache(): void {
  cachedFingerprint = null;
}

/**
 * Validate a fingerprint format.
 * @param fingerprint - The fingerprint to validate
 * @returns True if valid format (32-char hex string)
 */
export function isValidFingerprint(fingerprint: string): boolean {
  return /^[a-f0-9]{32}$/i.test(fingerprint);
}
