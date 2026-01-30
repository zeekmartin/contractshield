/**
 * ContractShield Pro - License Validator
 *
 * Online license validation via ContractShield License API with caching
 * and graceful degradation.
 *
 * @license Commercial
 */

import type {
  LicenseValidateRequest,
  LicenseValidateResponse,
  LicenseValidateSuccessResponse,
  LicenseActivateRequest,
  LicenseActivateResponse,
  LicenseDeactivateResponse,
  LicenseValidationOptions,
  ValidationResult,
  ProFeature,
  FeatureCheckResult,
} from "./types.js";
import { readCache, writeCache, clearCache, isCacheExpired } from "./cache.js";
import { generateFingerprint, getMachineMetadata } from "./fingerprint.js";

const DEFAULT_API_ENDPOINT = "https://api.contractshield.dev";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

const UPGRADE_URL = "https://contractshield.dev/pricing";

/**
 * License key format regex: CSHIELD-XXXX-XXXX-XXXX-XXXX
 * Characters: A-H, J-N, P-Z (no I, O), 2-9 (no 0, 1)
 */
const LICENSE_KEY_REGEX = /^CSHIELD-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/**
 * Pro features available in each tier
 */
const TIER_FEATURES: Record<string, ProFeature[]> = {
  pro: ["sink-rasp", "learning-mode", "priority-support"],
  enterprise: ["sink-rasp", "learning-mode", "priority-support", "custom-rules", "sla-guarantee", "dedicated-support"],
};

/**
 * Validate license key format.
 */
export function isValidLicenseKeyFormat(licenseKey: string): boolean {
  return LICENSE_KEY_REGEX.test(licenseKey);
}

/**
 * Validate a license key via ContractShield License API.
 *
 * @param options - Validation options
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = await validateLicense({
 *   licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
 *   gracefulDegradation: true,
 * });
 *
 * if (result.valid) {
 *   console.log(`Licensed: ${result.tier} plan with ${result.features?.join(', ')}`);
 * } else if (result.degraded) {
 *   console.log('Running in OSS mode (license validation failed)');
 * }
 * ```
 */
export async function validateLicense(
  options: LicenseValidationOptions
): Promise<ValidationResult> {
  const {
    licenseKey,
    apiEndpoint = process.env.CONTRACTSHIELD_API_URL || DEFAULT_API_ENDPOINT,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    skipCache = false,
    gracefulDegradation = true,
    autoActivate = true,
  } = options;

  // No license key provided - run in OSS mode
  if (!licenseKey) {
    return {
      valid: false,
      tier: "oss",
      error: "No license key provided",
      fromCache: false,
      degraded: true,
    };
  }

  // Validate license key format
  if (!isValidLicenseKeyFormat(licenseKey)) {
    return {
      valid: false,
      tier: "oss",
      error: "Invalid license key format. Expected: CSHIELD-XXXX-XXXX-XXXX-XXXX",
      fromCache: false,
      degraded: gracefulDegradation,
    };
  }

  const fingerprint = generateFingerprint();

  // Check cache first (unless skipCache)
  if (!skipCache) {
    const cached = readCache(licenseKey, fingerprint);
    if (cached && !isCacheExpired(cached)) {
      return parseValidationResponse(cached.response, true);
    }
  }

  // Online validation
  try {
    const response = await callValidateApi(apiEndpoint, licenseKey, fingerprint);

    // Handle not_activated error with auto-activation
    if (!response.valid && "error" in response && response.error === "not_activated" && autoActivate) {
      console.log("[ContractShield] License not activated on this machine, activating...");

      const activated = await activateLicense(licenseKey, fingerprint, apiEndpoint);
      if (activated) {
        // Retry validation after activation
        const retryResponse = await callValidateApi(apiEndpoint, licenseKey, fingerprint);
        if (retryResponse.valid) {
          writeCache(licenseKey, retryResponse, fingerprint, cacheTtlMs);
          return parseValidationResponse(retryResponse, false);
        }
      }

      // Activation failed
      return {
        valid: false,
        tier: "oss",
        error: "License activation failed",
        fromCache: false,
        degraded: gracefulDegradation,
      };
    }

    // Cache successful responses
    if (response.valid) {
      writeCache(licenseKey, response, fingerprint, cacheTtlMs);
    }

    return parseValidationResponse(response, false);
  } catch (err) {
    // Network error - try cache even if expired
    const cached = readCache(licenseKey, fingerprint);
    if (cached) {
      console.warn(
        "[ContractShield] License validation failed, using cached result:",
        (err as Error).message
      );
      return parseValidationResponse(cached.response, true);
    }

    // No cache available
    if (gracefulDegradation) {
      console.warn(
        "[ContractShield] License validation failed, running in OSS mode:",
        (err as Error).message
      );
      return {
        valid: false,
        tier: "oss",
        error: `Validation failed: ${(err as Error).message}`,
        fromCache: false,
        degraded: true,
      };
    }

    // Strict mode - throw error
    throw new Error(`License validation failed: ${(err as Error).message}`);
  }
}

/**
 * Call ContractShield API to validate license.
 */
async function callValidateApi(
  apiEndpoint: string,
  licenseKey: string,
  fingerprint: string
): Promise<LicenseValidateResponse> {
  const url = `${apiEndpoint}/v1/license/validate`;

  const body: LicenseValidateRequest = {
    licenseKey,
    fingerprint,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await response.json() as LicenseValidateResponse;

    // The API returns 403 for invalid licenses but still sends JSON
    if (!response.ok && response.status !== 403) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Activate license on this machine.
 */
async function activateLicense(
  licenseKey: string,
  fingerprint: string,
  apiEndpoint: string
): Promise<boolean> {
  const url = `${apiEndpoint}/v1/license/activate`;

  const body: LicenseActivateRequest = {
    licenseKey,
    fingerprint,
    metadata: getMachineMetadata(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 403) {
      return false;
    }

    const result = await response.json() as LicenseActivateResponse;
    return result.activated === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse API response into ValidationResult.
 */
function parseValidationResponse(
  response: LicenseValidateResponse,
  fromCache: boolean
): ValidationResult {
  if (!response.valid) {
    const errorResponse = response as { error?: string; message?: string };
    return {
      valid: false,
      tier: "oss",
      error: errorResponse.message || errorResponse.error || "Invalid license",
      fromCache,
      degraded: false,
    };
  }

  const successResponse = response as LicenseValidateSuccessResponse;

  return {
    valid: true,
    tier: successResponse.plan,
    features: successResponse.features,
    seats: successResponse.seats,
    expiresAt: new Date(successResponse.expiresAt),
    status: successResponse.status,
    gracePeriodEnds: successResponse.gracePeriodEnds
      ? new Date(successResponse.gracePeriodEnds)
      : undefined,
    fromCache,
    degraded: false,
  };
}

/**
 * Deactivate a license from this machine.
 *
 * @param licenseKey - The license key
 * @param apiEndpoint - Custom API endpoint (optional)
 */
export async function deactivateLicense(
  licenseKey: string,
  apiEndpoint: string = process.env.CONTRACTSHIELD_API_URL || DEFAULT_API_ENDPOINT
): Promise<boolean> {
  const fingerprint = generateFingerprint();
  const url = `${apiEndpoint}/v1/license/deactivate`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        licenseKey,
        fingerprint,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json() as LicenseDeactivateResponse;

    // Clear cache on deactivation
    if (result.deactivated) {
      clearCache(licenseKey);
    }

    return result.deactivated;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if a Pro feature is available.
 *
 * @param validationResult - Result from validateLicense()
 * @param feature - The feature to check
 * @returns Feature check result
 */
export function checkFeature(
  validationResult: ValidationResult,
  feature: ProFeature
): FeatureCheckResult {
  if (!validationResult.valid || validationResult.degraded) {
    return {
      available: false,
      reason: validationResult.degraded
        ? "Running in OSS mode (license validation failed)"
        : "Invalid license",
      upgradeUrl: UPGRADE_URL,
    };
  }

  // Check features from API response first
  if (validationResult.features?.includes(feature)) {
    return { available: true };
  }

  // Fallback to tier-based check
  const tierFeatures = TIER_FEATURES[validationResult.tier] || [];

  if (!tierFeatures.includes(feature)) {
    const requiredTier = feature === "custom-rules" || feature === "sla-guarantee" || feature === "dedicated-support"
      ? "Enterprise"
      : "Pro";
    return {
      available: false,
      reason: `Feature '${feature}' requires ${requiredTier} license`,
      upgradeUrl: UPGRADE_URL,
    };
  }

  return { available: true };
}

/**
 * Wrapper for Pro features with license check.
 *
 * If the feature is not available, logs a warning and returns a no-op.
 * Never crashes the app.
 *
 * @param feature - The feature to gate
 * @param validationResult - Result from validateLicense()
 * @param enableFn - Function to call if feature is available
 *
 * @example
 * ```typescript
 * const result = await validateLicense({ licenseKey });
 *
 * gateFeature('sink-rasp', result, () => {
 *   initSinkRasp({ mode: 'enforce' });
 * });
 * ```
 */
export function gateFeature(
  feature: ProFeature,
  validationResult: ValidationResult,
  enableFn: () => void
): void {
  const check = checkFeature(validationResult, feature);

  if (!check.available) {
    console.warn(
      `[ContractShield] Pro feature '${feature}' not available: ${check.reason}\n` +
        `Upgrade at: ${check.upgradeUrl}`
    );
    return;
  }

  enableFn();
}

export { clearCache, clearAllCaches, getCacheStats } from "./cache.js";
export { generateFingerprint, getMachineMetadata, clearFingerprintCache } from "./fingerprint.js";
