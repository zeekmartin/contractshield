/**
 * ContractShield Pro - Online License Validation
 *
 * License validation with ContractShield API, caching, and graceful degradation.
 *
 * @example
 * ```typescript
 * import { validateLicense, gateFeature } from '@cshield/license-online';
 *
 * const result = await validateLicense({
 *   licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
 *   gracefulDegradation: true,
 * });
 *
 * gateFeature('sink-rasp', result, () => {
 *   // Enable sink-rasp
 * });
 * ```
 *
 * @license Commercial
 */

export {
  validateLicense,
  deactivateLicense,
  checkFeature,
  gateFeature,
  isValidLicenseKeyFormat,
  clearCache,
  clearAllCaches,
  getCacheStats,
  generateFingerprint,
  getMachineMetadata,
  clearFingerprintCache,
} from "./validator.js";

export type {
  LicenseValidationOptions,
  ValidationResult,
  ProFeature,
  FeatureCheckResult,
  CachedLicense,
  LicenseValidateRequest,
  LicenseValidateResponse,
  LicenseValidateSuccessResponse,
  LicenseValidateErrorResponse,
  LicenseActivateRequest,
  LicenseActivateResponse,
  LicenseDeactivateResponse,
  LicenseInfoResponse,
  // Legacy types (deprecated)
  LemonSqueezyValidateResponse,
  LemonSqueezyDeactivateResponse,
} from "./types.js";
