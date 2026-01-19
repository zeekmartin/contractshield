/**
 * ContractShield Pro - LemonSqueezy License Types
 * @license Commercial
 */

/**
 * LemonSqueezy license validation request
 */
export interface LemonSqueezyValidateRequest {
  license_key: string;
  instance_name?: string;
}

/**
 * LemonSqueezy license validation response
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
 * LemonSqueezy deactivation response
 */
export interface LemonSqueezyDeactivateResponse {
  deactivated: boolean;
  error: string | null;
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
  response: LemonSqueezyValidateResponse;
  /** SHA256 hash of the license key (for identification) */
  keyHash: string;
}

/**
 * License validation options
 */
export interface LicenseValidationOptions {
  /** License key (UUID format from LemonSqueezy) */
  licenseKey: string;
  /** Instance name for activation tracking */
  instanceName?: string;
  /** Custom API endpoint (for enterprise self-hosted) */
  apiEndpoint?: string;
  /** Cache TTL in milliseconds (default: 24 hours) */
  cacheTtlMs?: number;
  /** Skip cache and force online validation */
  skipCache?: boolean;
  /** Allow running in OSS mode if validation fails */
  gracefulDegradation?: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the license is valid */
  valid: boolean;
  /** License tier */
  tier: "oss" | "pro" | "enterprise";
  /** Customer information */
  customer?: {
    name: string;
    email: string;
  };
  /** Product information */
  product?: {
    name: string;
    variant: string;
  };
  /** Expiration date */
  expiresAt?: Date;
  /** Activation info */
  activation?: {
    limit: number;
    usage: number;
    instanceId: string;
  };
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
  | "hot-reload"
  | "policy-packs"
  | "audit-export"
  | "priority-support";

/**
 * Feature check result
 */
export interface FeatureCheckResult {
  available: boolean;
  reason?: string;
  upgradeUrl?: string;
}
