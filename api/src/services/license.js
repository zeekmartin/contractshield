import { v4 as uuidv4 } from 'uuid';
import { queryOne, query, execute, transaction } from '../db/index.js';
import { generateLicenseKey, isValidLicenseKeyFormat, normalizeFingerprint } from '../utils/crypto.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Create a new license
 */
export function createLicense({ email, plan, stripeCustomerId, stripeSubscriptionId, validUntil }) {
  const id = uuidv4();
  const licenseKey = generateLicenseKey();
  const seats = config.plans[plan]?.seats || 5;

  execute(
    `INSERT INTO licenses (id, license_key, email, stripe_customer_id, stripe_subscription_id, plan, seats, status, valid_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [id, licenseKey, email, stripeCustomerId, stripeSubscriptionId, plan, seats, validUntil]
  );

  logger.info('License created', { id, plan, email: email.substring(0, 3) + '***' });

  return getLicenseById(id);
}

/**
 * Get license by ID
 */
export function getLicenseById(id) {
  return queryOne('SELECT * FROM licenses WHERE id = ?', [id]);
}

/**
 * Get license by key
 */
export function getLicenseByKey(licenseKey) {
  if (!isValidLicenseKeyFormat(licenseKey)) {
    return null;
  }
  return queryOne('SELECT * FROM licenses WHERE license_key = ?', [licenseKey]);
}

/**
 * Get license by Stripe subscription ID
 */
export function getLicenseBySubscription(stripeSubscriptionId) {
  return queryOne('SELECT * FROM licenses WHERE stripe_subscription_id = ?', [stripeSubscriptionId]);
}

/**
 * Get license by Stripe customer ID
 */
export function getLicenseByCustomer(stripeCustomerId) {
  return queryOne('SELECT * FROM licenses WHERE stripe_customer_id = ?', [stripeCustomerId]);
}

/**
 * Update license status
 */
export function updateLicenseStatus(licenseId, status, graceUntil = null) {
  const updates = ['status = ?', 'updated_at = datetime(\'now\')'];
  const params = [status];

  if (graceUntil) {
    updates.push('grace_until = ?');
    params.push(graceUntil);
  }

  params.push(licenseId);

  execute(
    `UPDATE licenses SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  logger.info('License status updated', { licenseId, status });
}

/**
 * Update license validity period
 */
export function updateLicenseValidity(licenseId, validUntil) {
  execute(
    `UPDATE licenses SET valid_until = ?, updated_at = datetime('now') WHERE id = ?`,
    [validUntil, licenseId]
  );

  logger.info('License validity updated', { licenseId, validUntil });
}

/**
 * Update license plan
 */
export function updateLicensePlan(licenseId, plan) {
  const seats = config.plans[plan]?.seats || 5;

  execute(
    `UPDATE licenses SET plan = ?, seats = ?, updated_at = datetime('now') WHERE id = ?`,
    [plan, seats, licenseId]
  );

  logger.info('License plan updated', { licenseId, plan });
}

/**
 * Get all activations for a license
 */
export function getActivations(licenseId) {
  return query('SELECT * FROM activations WHERE license_id = ?', [licenseId]);
}

/**
 * Get activation by license and fingerprint
 */
export function getActivation(licenseId, fingerprint) {
  const normalized = normalizeFingerprint(fingerprint);
  return queryOne(
    'SELECT * FROM activations WHERE license_id = ? AND fingerprint = ?',
    [licenseId, normalized]
  );
}

/**
 * Count active activations for a license
 */
export function countActivations(licenseId) {
  const result = queryOne(
    'SELECT COUNT(*) as count FROM activations WHERE license_id = ?',
    [licenseId]
  );
  return result?.count || 0;
}

/**
 * Activate a license for a machine
 */
export function activateLicense(licenseKey, fingerprint, metadata = {}) {
  const license = getLicenseByKey(licenseKey);

  if (!license) {
    return { success: false, error: 'invalid_license', message: 'License not found' };
  }

  // Check if license is valid
  if (license.status === 'cancelled') {
    return { success: false, error: 'cancelled', message: 'License has been cancelled' };
  }

  if (license.status === 'expired') {
    return { success: false, error: 'expired', message: 'License has expired' };
  }

  // Check validity date
  const now = new Date();
  const validUntil = new Date(license.valid_until);
  const graceUntil = license.grace_until ? new Date(license.grace_until) : null;

  if (now > validUntil && (!graceUntil || now > graceUntil)) {
    return { success: false, error: 'expired', message: 'License has expired' };
  }

  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  if (!normalizedFingerprint) {
    return { success: false, error: 'invalid_fingerprint', message: 'Invalid fingerprint' };
  }

  // Check if already activated on this machine
  const existing = getActivation(license.id, normalizedFingerprint);
  if (existing) {
    // Update last seen
    execute(
      `UPDATE activations SET last_seen_at = datetime('now'), metadata = ? WHERE id = ?`,
      [JSON.stringify(metadata), existing.id]
    );
    const currentCount = countActivations(license.id);
    return {
      success: true,
      activated: true,
      alreadyActive: true,
      remainingSeats: license.seats - currentCount,
    };
  }

  // Check seat limit
  const currentCount = countActivations(license.id);
  if (currentCount >= license.seats) {
    return {
      success: false,
      error: 'seat_limit',
      message: `Seat limit reached (${license.seats} seats)`,
      usedSeats: currentCount,
      maxSeats: license.seats,
    };
  }

  // Create activation
  const id = uuidv4();
  execute(
    `INSERT INTO activations (id, license_id, fingerprint, metadata) VALUES (?, ?, ?, ?)`,
    [id, license.id, normalizedFingerprint, JSON.stringify(metadata)]
  );

  logger.info('License activated', { licenseId: license.id, fingerprint: normalizedFingerprint.substring(0, 8) + '...' });

  return {
    success: true,
    activated: true,
    alreadyActive: false,
    remainingSeats: license.seats - currentCount - 1,
  };
}

/**
 * Deactivate a license from a machine
 */
export function deactivateLicense(licenseKey, fingerprint) {
  const license = getLicenseByKey(licenseKey);

  if (!license) {
    return { success: false, error: 'invalid_license', message: 'License not found' };
  }

  const normalizedFingerprint = normalizeFingerprint(fingerprint);
  if (!normalizedFingerprint) {
    return { success: false, error: 'invalid_fingerprint', message: 'Invalid fingerprint' };
  }

  const existing = getActivation(license.id, normalizedFingerprint);
  if (!existing) {
    return { success: false, error: 'not_found', message: 'Activation not found' };
  }

  execute('DELETE FROM activations WHERE id = ?', [existing.id]);

  logger.info('License deactivated', { licenseId: license.id, fingerprint: normalizedFingerprint.substring(0, 8) + '...' });

  return { success: true, deactivated: true };
}

/**
 * Validate a license and update last seen
 */
export function validateLicense(licenseKey, fingerprint) {
  const license = getLicenseByKey(licenseKey);

  if (!license) {
    return { valid: false, error: 'invalid_license', message: 'License not found' };
  }

  // Check status
  if (license.status === 'cancelled') {
    return { valid: false, error: 'cancelled', message: 'License has been cancelled' };
  }

  // Check validity date
  const now = new Date();
  const validUntil = new Date(license.valid_until);
  const graceUntil = license.grace_until ? new Date(license.grace_until) : null;

  const isExpired = now > validUntil;
  const inGracePeriod = isExpired && graceUntil && now <= graceUntil;

  if (isExpired && !inGracePeriod) {
    return { valid: false, error: 'expired', message: 'License has expired' };
  }

  const normalizedFingerprint = normalizeFingerprint(fingerprint);

  // Check if this fingerprint is activated
  if (normalizedFingerprint) {
    const activation = getActivation(license.id, normalizedFingerprint);
    if (!activation) {
      return {
        valid: false,
        error: 'not_activated',
        message: 'License not activated on this machine',
        plan: license.plan,
      };
    }

    // Update last seen
    execute(
      `UPDATE activations SET last_seen_at = datetime('now') WHERE id = ?`,
      [activation.id]
    );
  }

  const planConfig = config.plans[license.plan];

  return {
    valid: true,
    plan: license.plan,
    features: planConfig?.features || [],
    seats: license.seats,
    expiresAt: license.valid_until,
    status: inGracePeriod ? 'grace_period' : license.status,
    gracePeriodEnds: inGracePeriod ? license.grace_until : null,
  };
}

/**
 * Get license info (public, non-sensitive)
 */
export function getLicenseInfo(licenseKey) {
  const license = getLicenseByKey(licenseKey);

  if (!license) {
    return null;
  }

  const usedSeats = countActivations(license.id);
  const planConfig = config.plans[license.plan];

  return {
    plan: license.plan,
    planName: planConfig?.name || license.plan,
    seats: license.seats,
    usedSeats,
    availableSeats: license.seats - usedSeats,
    status: license.status,
    validUntil: license.valid_until,
    gracePeriodEnds: license.grace_until,
    features: planConfig?.features || [],
    createdAt: license.created_at,
  };
}

/**
 * Delete all activations for a license (used when cancelling)
 */
export function clearActivations(licenseId) {
  execute('DELETE FROM activations WHERE license_id = ?', [licenseId]);
  logger.info('All activations cleared', { licenseId });
}
