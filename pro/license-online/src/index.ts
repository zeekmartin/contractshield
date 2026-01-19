/**
 * ContractShield Pro - Online License Validation
 *
 * LemonSqueezy-based license validation with caching and graceful degradation.
 *
 * @example
 * ```typescript
 * import { validateLicense, gateFeature } from '@contractshield/license-online';
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
  clearCache,
  clearAllCaches,
  getCacheStats,
} from "./validator.js";

export type {
  LicenseValidationOptions,
  ValidationResult,
  ProFeature,
  FeatureCheckResult,
  CachedLicense,
  LemonSqueezyValidateResponse,
  LemonSqueezyDeactivateResponse,
} from "./types.js";
