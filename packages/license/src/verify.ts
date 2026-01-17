import * as crypto from "crypto";
import type { License, LicensePayload } from "./types.js";
import { LicenseError } from "./errors.js";

/**
 * Public key for license verification (RSA 2048).
 * Generated with: openssl genrsa -out private.pem 2048
 *                 openssl rsa -in private.pem -pubout -out public.pem
 *
 * IMPORTANT: The private key is kept secret and used only for generating licenses.
 */
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwA/YranB7H6JD7SWYw2f
cDeO3GObuI6F3F/TNLZWWwVZ6Fzx5QVDdqGjww2g+Knc521tQOuQ38Fj3BU8eq73
/9QuIIW1GhTVpuxP2aKYGqlC/5pUoP76wu0j6usTvCvL15tavqpEFEJi1Gtlak6p
1KWreanBJKaT+mqAf6vkaQzg3PpatEtIFBY6kPAwj8JdIlajCRQR0kf3PPd8TmzU
W+iAXzjyFV5DXOWNbFisceQeP3ZECXIQIRvgbgR13YC0E867ySdvvHvUWkT3BFzf
xH6wD9jHIHvPwlFFuhwJprCasZ999fTNOORWisJAMgK7+69vd5/VFiqYm0HChnE5
QwIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Verify a license key and return the license details.
 *
 * @param licenseKey - The JWT license key to verify
 * @returns License object with validity information
 *
 * @example
 * ```typescript
 * const license = verifyLicense(process.env.CONTRACTSHIELD_LICENSE_KEY);
 * if (license.valid) {
 *   console.log(`Licensed to: ${license.customer}`);
 * }
 * ```
 */
export function verifyLicense(licenseKey: string): License {
  if (!licenseKey || typeof licenseKey !== "string") {
    return { valid: false, expired: false, error: "No license key provided" };
  }

  try {
    // Decode the JWT manually (no external dependencies)
    const parts = licenseKey.split(".");
    if (parts.length !== 3) {
      return { valid: false, expired: false, error: "Invalid license format" };
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify the signature
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);

    const signature = Buffer.from(signatureB64, "base64url");
    const isValid = verifier.verify(PUBLIC_KEY, signature);

    if (!isValid) {
      return { valid: false, expired: false, error: "Invalid license signature" };
    }

    // Decode the payload
    const payload: LicensePayload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    );

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return {
        valid: false,
        expired: true,
        expiresAt: new Date(payload.exp * 1000),
        customer: payload.customer,
        error: "License expired",
      };
    }

    return {
      valid: true,
      expired: false,
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
      customer: payload.customer,
      email: payload.email,
      plan: payload.plan,
      features: payload.features,
      seats: payload.seats,
    };
  } catch (err) {
    return { valid: false, expired: false, error: "Failed to verify license" };
  }
}

/**
 * Require a valid license with optional feature check.
 * Throws LicenseError if the license is invalid or missing required feature.
 *
 * @param licenseKey - The JWT license key to verify
 * @param requiredFeature - Optional feature that must be included in the license
 * @returns The license payload if valid
 * @throws LicenseError if the license is invalid
 *
 * @example
 * ```typescript
 * try {
 *   const payload = requireLicense(process.env.LICENSE_KEY, 'sink-rasp');
 *   console.log(`Licensed to: ${payload.customer}`);
 * } catch (err) {
 *   if (err instanceof LicenseError) {
 *     console.error('License required:', err.message);
 *   }
 * }
 * ```
 */
export function requireLicense(licenseKey: string, requiredFeature?: string): LicensePayload {
  const license = verifyLicense(licenseKey);

  if (!license.valid) {
    throw new LicenseError(license.error || "Invalid license");
  }

  if (requiredFeature && !license.features?.includes(requiredFeature)) {
    throw new LicenseError(
      `License does not include feature: ${requiredFeature}. ` +
        `Upgrade at https://contractshield.dev/pricing`
    );
  }

  // Reconstruct payload from license
  return {
    id: "", // Not available after verification
    customer: license.customer!,
    email: license.email!,
    plan: license.plan!,
    features: license.features!,
    seats: license.seats,
    iat: 0, // Not available after verification
    exp: license.expiresAt ? Math.floor(license.expiresAt.getTime() / 1000) : 0,
  };
}

/**
 * Check if a license includes a specific feature.
 *
 * @param licenseKey - The JWT license key to verify
 * @param feature - The feature to check for
 * @returns true if the license is valid and includes the feature
 *
 * @example
 * ```typescript
 * if (hasFeature(process.env.LICENSE_KEY, 'sink-rasp')) {
 *   // Enable sink-rasp feature
 * }
 * ```
 */
export function hasFeature(licenseKey: string, feature: string): boolean {
  const license = verifyLicense(licenseKey);
  return license.valid && (license.features?.includes(feature) ?? false);
}

/**
 * Get the list of features available in a license.
 *
 * @param licenseKey - The JWT license key to verify
 * @returns Array of feature names, or empty array if invalid
 */
export function getFeatures(licenseKey: string): string[] {
  const license = verifyLicense(licenseKey);
  return license.valid ? license.features || [] : [];
}

export type { License, LicensePayload };
