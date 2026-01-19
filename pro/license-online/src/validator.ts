/**
 * ContractShield Pro - LemonSqueezy License Validator
 *
 * Online license validation via LemonSqueezy API with caching
 * and graceful degradation.
 *
 * @license Commercial
 */

import * as os from "os";
import type {
  LemonSqueezyValidateRequest,
  LemonSqueezyValidateResponse,
  LemonSqueezyDeactivateResponse,
  LicenseValidationOptions,
  ValidationResult,
  ProFeature,
  FeatureCheckResult,
} from "./types.js";
import { readCache, writeCache, clearCache } from "./cache.js";

const DEFAULT_API_ENDPOINT = "https://api.lemonsqueezy.com/v1";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

const UPGRADE_URL = "https://contractshield.dev/pricing";

/**
 * Pro features available in each tier
 */
const TIER_FEATURES: Record<string, ProFeature[]> = {
  pro: ["sink-rasp", "hot-reload", "priority-support"],
  enterprise: ["sink-rasp", "hot-reload", "policy-packs", "audit-export", "priority-support"],
};

/**
 * Validate a license key via LemonSqueezy API.
 *
 * @param options - Validation options
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = await validateLicense({
 *   licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
 *   instanceName: 'production-server-1',
 *   gracefulDegradation: true,
 * });
 *
 * if (result.valid) {
 *   console.log(`Licensed to: ${result.customer?.name}`);
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
    instanceName = getDefaultInstanceName(),
    apiEndpoint = process.env.CONTRACTSHIELD_LICENSE_API || DEFAULT_API_ENDPOINT,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    skipCache = false,
    gracefulDegradation = true,
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

  // Check cache first (unless skipCache)
  if (!skipCache) {
    const cached = readCache(licenseKey);
    if (cached) {
      return parseValidationResponse(cached.response, true);
    }
  }

  // Online validation
  try {
    const response = await callLemonSqueezyApi(apiEndpoint, licenseKey, instanceName);

    // Cache successful responses
    if (response.valid) {
      writeCache(licenseKey, response, cacheTtlMs);
    }

    return parseValidationResponse(response, false);
  } catch (err) {
    // Network error - try cache even if expired
    const cached = readCache(licenseKey);
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
 * Call LemonSqueezy API to validate license.
 */
async function callLemonSqueezyApi(
  apiEndpoint: string,
  licenseKey: string,
  instanceName: string
): Promise<LemonSqueezyValidateResponse> {
  const url = `${apiEndpoint}/licenses/validate`;

  const body: LemonSqueezyValidateRequest = {
    license_key: licenseKey,
    instance_name: instanceName,
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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as LemonSqueezyValidateResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse LemonSqueezy response into ValidationResult.
 */
function parseValidationResponse(
  response: LemonSqueezyValidateResponse,
  fromCache: boolean
): ValidationResult {
  if (!response.valid) {
    return {
      valid: false,
      tier: "oss",
      error: response.error || "Invalid license",
      fromCache,
      degraded: false,
    };
  }

  const licenseKey = response.license_key!;
  const meta = response.meta!;
  const instance = response.instance;

  // Determine tier from product variant
  const variantLower = meta.variant_name.toLowerCase();
  const tier = variantLower.includes("enterprise")
    ? "enterprise"
    : variantLower.includes("pro")
      ? "pro"
      : "pro"; // Default to pro for unknown variants

  return {
    valid: true,
    tier,
    customer: {
      name: meta.customer_name,
      email: meta.customer_email,
    },
    product: {
      name: meta.product_name,
      variant: meta.variant_name,
    },
    expiresAt: licenseKey.expires_at ? new Date(licenseKey.expires_at) : undefined,
    activation: instance
      ? {
          limit: licenseKey.activation_limit,
          usage: licenseKey.activation_usage,
          instanceId: instance.id,
        }
      : undefined,
    fromCache,
    degraded: false,
  };
}

/**
 * Deactivate a license instance.
 *
 * @param licenseKey - The license key
 * @param instanceId - The instance ID to deactivate
 * @param apiEndpoint - Custom API endpoint (optional)
 */
export async function deactivateLicense(
  licenseKey: string,
  instanceId: string,
  apiEndpoint: string = DEFAULT_API_ENDPOINT
): Promise<boolean> {
  const url = `${apiEndpoint}/licenses/deactivate`;

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
        license_key: licenseKey,
        instance_id: instanceId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return false;
    }

    const result = (await response.json()) as LemonSqueezyDeactivateResponse;

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

  const tierFeatures = TIER_FEATURES[validationResult.tier] || [];

  if (!tierFeatures.includes(feature)) {
    return {
      available: false,
      reason: `Feature '${feature}' requires ${feature === "audit-export" || feature === "policy-packs" ? "Enterprise" : "Pro"} license`,
      upgradeUrl: UPGRADE_URL,
    };
  }

  return { available: true };
}

/**
 * Get default instance name based on hostname and environment.
 */
function getDefaultInstanceName(): string {
  const hostname = os.hostname();
  const env = process.env.NODE_ENV || "development";
  return `${hostname}-${env}`;
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
