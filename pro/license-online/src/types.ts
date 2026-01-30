/**
 * ContractShield Pro - License Types
 * @license Commercial
 */

/**
 * ContractShield API validation request
 */
export interface LicenseValidateRequest {
  licenseKey: string;
  fingerprint: string;
}

/**
 * ContractShield API validation response (success)
 */
export interface LicenseValidateSuccessResponse {
  valid: true;
  plan: "pro" | "enterprise";
  features: string[];
  seats: number;
  expiresAt: string;
  status: "active" | "grace_period" | "expired" | "cancelled";
  gracePeriodEnds?: string | null;
}

/**
 * ContractShield API validation response (error)
 */
export interface LicenseValidateErrorResponse {
  valid: false;
  error: string;
  message: string;
  plan?: "pro" | "enterprise";
}

/**
 * ContractShield API validation response
 */
export type LicenseValidateResponse =
  | LicenseValidateSuccessResponse
  | LicenseValidateErrorResponse;

/**
 * ContractShield API activation request
 */
export interface LicenseActivateRequest {
  licenseKey: string;
  fingerprint: string;
  metadata?: {
    hostname?: string;
    os?: string;
    arch?: string;
    nodeVersion?: string;
  };
}

/**
 * ContractShield API activation response
 */
export interface LicenseActivateResponse {
  activated?: boolean;
  success?: boolean;
  alreadyActive?: boolean;
  remainingSeats?: number;
  error?: string;
  message?: string;
  usedSeats?: number;
  maxSeats?: number;
}

/**
 * ContractShield API deactivation response
 */
export interface LicenseDeactivateResponse {
  deactivated: boolean;
  error?: string;
  message?: string;
}

/**
 * ContractShield API license info response
 */
export interface LicenseInfoResponse {
  plan: "pro" | "enterprise";
  planName: string;
  seats: number;
  usedSeats: number;
  availableSeats: number;
  status: "active" | "grace_period" | "expired" | "cancelled";
  validUntil: string;
  gracePeriodEnds?: string | null;
  features: string[];
  createdAt: string;
}

/**
 * Cached license data
 */
export interface CachedLicense {
  /** When the cache entry was created */
  cachedAt: number;
  /** When the cache expires */
  expiresAt: number;
  /** The validation response */
  response: LicenseValidateSuccessResponse;
  /** SHA256 hash of the license key (for identification) */
  keyHash: string;
  /** Machine fingerprint this cache is valid for */
  fingerprint: string;
}

/**
 * License validation options
 */
export interface LicenseValidationOptions {
  /** License key (format: CSHIELD-XXXX-XXXX-XXXX-XXXX) */
  licenseKey: string;
  /** Custom API endpoint (for testing or self-hosted) */
  apiEndpoint?: string;
  /** Cache TTL in milliseconds (default: 24 hours) */
  cacheTtlMs?: number;
  /** Skip cache and force online validation */
  skipCache?: boolean;
  /** Allow running in OSS mode if validation fails */
  gracefulDegradation?: boolean;
  /** Automatically activate license if not activated on this machine */
  autoActivate?: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the license is valid */
  valid: boolean;
  /** License tier */
  tier: "oss" | "pro" | "enterprise";
  /** Available features for this license */
  features?: string[];
  /** Number of seats (machines) allowed */
  seats?: number;
  /** Number of seats currently used */
  usedSeats?: number;
  /** Expiration date */
  expiresAt?: Date;
  /** License status */
  status?: "active" | "grace_period" | "expired" | "cancelled";
  /** Grace period end date (if in grace period) */
  gracePeriodEnds?: Date;
  /** Error message if invalid */
  error?: string;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Whether running in degraded (OSS) mode */
  degraded: boolean;
}

/**
 * Available Pro features
 */
export type ProFeature =
  | "sink-rasp"
  | "learning-mode"
  | "priority-support"
  | "custom-rules"
  | "sla-guarantee"
  | "dedicated-support";

/**
 * Feature check result
 */
export interface FeatureCheckResult {
  available: boolean;
  reason?: string;
  upgradeUrl?: string;
}

// ============================================================================
// Legacy types (for backwards compatibility during migration)
// ============================================================================

/**
 * @deprecated Use LicenseValidateRequest instead
 */
export interface LemonSqueezyValidateRequest {
  license_key: string;
  instance_name?: string;
}

/**
 * @deprecated Use LicenseValidateResponse instead
 */
export interface LemonSqueezyValidateResponse {
  valid: boolean;
  error: string | null;
  license_key: {
    id: number;
    status: "active" | "inactive" | "expired" | "disabled";
    key: string;
    activation_limit: number;
    activation_usage: number;
    created_at: string;
    expires_at: string | null;
  } | null;
  instance: {
    id: string;
    name: string;
    created_at: string;
  } | null;
  meta: {
    store_id: number;
    order_id: number;
    product_id: number;
    product_name: string;
    variant_id: number;
    variant_name: string;
    customer_id: number;
    customer_name: string;
    customer_email: string;
  } | null;
}

/**
 * @deprecated Use LicenseDeactivateResponse instead
 */
export interface LemonSqueezyDeactivateResponse {
  deactivated: boolean;
  error: string | null;
}
