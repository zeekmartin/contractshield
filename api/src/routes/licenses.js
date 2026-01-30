import { Router } from 'express';
import {
  validateLicense,
  activateLicense,
  deactivateLicense,
  getLicenseInfo,
} from '../services/license.js';
import { logger } from '../utils/logger.js';
import { isValidLicenseKeyFormat } from '../utils/crypto.js';

const router = Router();

/**
 * POST /v1/license/validate
 * Validate a license key and fingerprint
 * This is the main endpoint called by the SDK at startup
 */
router.post('/validate', (req, res) => {
  const startTime = Date.now();

  try {
    const { licenseKey, fingerprint } = req.body;

    if (!licenseKey) {
      return res.status(400).json({
        valid: false,
        error: 'missing_license_key',
        message: 'License key is required',
      });
    }

    if (!isValidLicenseKeyFormat(licenseKey)) {
      return res.status(400).json({
        valid: false,
        error: 'invalid_format',
        message: 'Invalid license key format',
      });
    }

    const result = validateLicense(licenseKey, fingerprint);

    // Add timing for monitoring
    const duration = Date.now() - startTime;
    logger.debug('License validation', { valid: result.valid, durationMs: duration });

    // Set cache headers for valid licenses (short TTL)
    if (result.valid) {
      res.set('Cache-Control', 'private, max-age=60');
    }

    return res.status(result.valid ? 200 : 403).json(result);
  } catch (error) {
    logger.error('License validation error', { error: error.message });
    return res.status(500).json({
      valid: false,
      error: 'internal_error',
      message: 'Validation failed',
    });
  }
});

/**
 * POST /v1/license/activate
 * Activate a license on a new machine
 */
router.post('/activate', (req, res) => {
  try {
    const { licenseKey, fingerprint, metadata = {} } = req.body;

    if (!licenseKey) {
      return res.status(400).json({
        activated: false,
        error: 'missing_license_key',
        message: 'License key is required',
      });
    }

    if (!fingerprint) {
      return res.status(400).json({
        activated: false,
        error: 'missing_fingerprint',
        message: 'Machine fingerprint is required',
      });
    }

    if (!isValidLicenseKeyFormat(licenseKey)) {
      return res.status(400).json({
        activated: false,
        error: 'invalid_format',
        message: 'Invalid license key format',
      });
    }

    // Sanitize metadata (remove potentially sensitive fields)
    const sanitizedMetadata = {
      hostname: metadata.hostname?.substring(0, 64),
      os: metadata.os?.substring(0, 32),
      arch: metadata.arch?.substring(0, 16),
      nodeVersion: metadata.nodeVersion?.substring(0, 16),
      activatedAt: new Date().toISOString(),
    };

    const result = activateLicense(licenseKey, fingerprint, sanitizedMetadata);

    if (result.success) {
      return res.status(200).json({
        activated: true,
        alreadyActive: result.alreadyActive || false,
        remainingSeats: result.remainingSeats,
      });
    }

    const statusCode = result.error === 'seat_limit' ? 403 : 400;
    return res.status(statusCode).json({
      activated: false,
      error: result.error,
      message: result.message,
      ...(result.usedSeats !== undefined && { usedSeats: result.usedSeats }),
      ...(result.maxSeats !== undefined && { maxSeats: result.maxSeats }),
    });
  } catch (error) {
    logger.error('License activation error', { error: error.message });
    return res.status(500).json({
      activated: false,
      error: 'internal_error',
      message: 'Activation failed',
    });
  }
});

/**
 * POST /v1/license/deactivate
 * Deactivate a license from a machine
 */
router.post('/deactivate', (req, res) => {
  try {
    const { licenseKey, fingerprint } = req.body;

    if (!licenseKey) {
      return res.status(400).json({
        deactivated: false,
        error: 'missing_license_key',
        message: 'License key is required',
      });
    }

    if (!fingerprint) {
      return res.status(400).json({
        deactivated: false,
        error: 'missing_fingerprint',
        message: 'Machine fingerprint is required',
      });
    }

    if (!isValidLicenseKeyFormat(licenseKey)) {
      return res.status(400).json({
        deactivated: false,
        error: 'invalid_format',
        message: 'Invalid license key format',
      });
    }

    const result = deactivateLicense(licenseKey, fingerprint);

    if (result.success) {
      return res.status(200).json({ deactivated: true });
    }

    return res.status(400).json({
      deactivated: false,
      error: result.error,
      message: result.message,
    });
  } catch (error) {
    logger.error('License deactivation error', { error: error.message });
    return res.status(500).json({
      deactivated: false,
      error: 'internal_error',
      message: 'Deactivation failed',
    });
  }
});

/**
 * GET /v1/license/info/:licenseKey
 * Get license information
 */
router.get('/info/:licenseKey', (req, res) => {
  try {
    const { licenseKey } = req.params;

    if (!isValidLicenseKeyFormat(licenseKey)) {
      return res.status(400).json({
        error: 'invalid_format',
        message: 'Invalid license key format',
      });
    }

    const info = getLicenseInfo(licenseKey);

    if (!info) {
      return res.status(404).json({
        error: 'not_found',
        message: 'License not found',
      });
    }

    return res.status(200).json(info);
  } catch (error) {
    logger.error('License info error', { error: error.message });
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to retrieve license info',
    });
  }
});

export default router;
