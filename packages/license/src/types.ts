/**
 * License payload encoded in the JWT.
 */
export interface LicensePayload {
  /** UUID of the license */
  id: string;
  /** Customer name */
  customer: string;
  /** Contact email */
  email: string;
  /** License plan */
  plan: "pro" | "enterprise";
  /** Number of seats (enterprise only) */
  seats?: number;
  /** Authorized features */
  features: string[];
  /** Issued at (Unix timestamp) */
  iat: number;
  /** Expiration (Unix timestamp) */
  exp: number;
}

/**
 * Result of license verification.
 */
export interface License {
  /** Whether the license is valid */
  valid: boolean;
  /** Whether the license is expired */
  expired: boolean;
  /** Expiration date */
  expiresAt?: Date;
  /** Customer name */
  customer?: string;
  /** Contact email */
  email?: string;
  /** License plan */
  plan?: "pro" | "enterprise";
  /** Authorized features */
  features?: string[];
  /** Number of seats */
  seats?: number;
  /** Error message if invalid */
  error?: string;
}
