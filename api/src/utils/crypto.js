import { randomBytes, createHash, randomInt } from 'crypto';

/**
 * Generate a license key in the format: CSHIELD-XXXX-XXXX-XXXX-XXXX
 * Uses cryptographically secure random bytes
 */
export function generateLicenseKey() {
  const segments = [];
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1 for readability

  for (let i = 0; i < 4; i++) {
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += chars[randomInt(chars.length)];
    }
    segments.push(segment);
  }

  return `CSHIELD-${segments.join('-')}`;
}

/**
 * Validate license key format
 */
export function isValidLicenseKeyFormat(key) {
  if (!key || typeof key !== 'string') return false;
  const pattern = /^CSHIELD-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  return pattern.test(key);
}

/**
 * Generate a fingerprint hash for machine identification
 * In production, this would be generated client-side from hardware info
 */
export function hashFingerprint(fingerprint) {
  return createHash('sha256').update(fingerprint).digest('hex').substring(0, 32);
}

/**
 * Normalize fingerprint for consistent storage
 */
export function normalizeFingerprint(fingerprint) {
  if (!fingerprint || typeof fingerprint !== 'string') return null;
  return fingerprint.toLowerCase().trim().substring(0, 128);
}
