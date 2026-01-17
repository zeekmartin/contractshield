import { describe, it, expect } from "vitest";
import { verifyLicense, hasFeature, requireLicense, getFeatures } from "../verify.js";
import { LicenseError } from "../errors.js";

// Test licenses generated with the license generator
// These are signed with the actual private key, so they will verify correctly

// Valid 30-day test license (will need to be regenerated if expired)
const VALID_LICENSE =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0OTRlM2NjLTcwZWYtNGQzZi1hNzg1LTI3Mzc1MThmNjcwZSIsImN1c3RvbWVyIjoiVGVzdCBDdXN0b21lciIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInBsYW4iOiJwcm8iLCJmZWF0dXJlcyI6WyJzaW5rLXJhc3AiLCJwb2xpY3ktdWkiXSwiaWF0IjoxNzY4Njc5NDAwLCJleHAiOjE3NzEyNzE0MDB9.FCwepfsXuaL67KIcsIhf8N1Ud0v96319F0nG0c18O0PtVIc_mUbZtMloXxmAz-HFkQFbzov2SnijuLBBpR2aNKQngqXH77b_w__tph8rlyaDXoluzNkVkgIsvt7Nd9kRiTkwacc5_bhPlXnj1kgbrZUedTRhC35eCjJaHgy7WT09klzGoYxVMbaAFDc_okkbgyzWMSF_nqfJVUxQ15xX7pgbKiGNFNpBAkMyHh_JrTGNw_sGHFVG8imhBMZ6cQYveNR9ecGu-fZtMe_AAnSBNgNnMwN_BmgkL-t0McSKZxituBE5cflTK5_dYxQZlqqupSnub93Mgg93mDgkm616Ag";

// Expired license (exp set to yesterday)
const EXPIRED_LICENSE =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5NjBmMjdmLTY2NTAtNGVjYy04NGQ3LTc0MzM0M2I3NWU4MyIsImN1c3RvbWVyIjoiRXhwaXJlZCBUZXN0IiwiZW1haWwiOiJleHBpcmVkQGV4YW1wbGUuY29tIiwicGxhbiI6InBybyIsImZlYXR1cmVzIjpbInNpbmstcmFzcCJdLCJpYXQiOjE3MzcxNDM0MTMsImV4cCI6MTc2ODU5MzAxM30.N2qpRajAEjwfUimweVtD0Xa4UYp5o8nGfimjG7UnWvTr-M5RXd1_auusdGCsxtyV0r2kCmbthrZIdnugBcBgkegppM4Voi39mvVMJzC2p92-vNk9DASF6LGpxPgSetQOVZnwJCOQXZVHTyEbn5AKUM5QZ3TGbJxYcOImNTQztymY7j1nqm4fQa50RzB1FGrHBHg2qCEuIa8pvLV_8MB1GYI9MkqBYGMds73augTKw7QZ97c3Ww-5CTM_pvX_-4nWKHn5jA_762CzYJ-bZJJ3VdcG4kVI7NAxu146LyEUdo5-gB_if8yXx1CjMRsMg8__fzXUzJqeNuhwYNAQmOkXLw";

// Invalid (malformed) license
const INVALID_LICENSE = "invalid.license.key";

// Tampered license (valid format but wrong signature)
const TAMPERED_LICENSE =
  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InRhbXBlcmVkIiwiY3VzdG9tZXIiOiJIYWNrZXIiLCJlbWFpbCI6ImhhY2tlckBleGFtcGxlLmNvbSIsInBsYW4iOiJlbnRlcnByaXNlIiwiZmVhdHVyZXMiOlsiYWxsIl0sImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ.invalidsignature";

describe("verifyLicense", () => {
  it("returns valid for a valid license", () => {
    const result = verifyLicense(VALID_LICENSE);
    expect(result.valid).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.customer).toBe("Test Customer");
    expect(result.email).toBe("test@example.com");
    expect(result.plan).toBe("pro");
    expect(result.features).toContain("sink-rasp");
    expect(result.features).toContain("policy-ui");
  });

  it("returns expired for an expired license", () => {
    const result = verifyLicense(EXPIRED_LICENSE);
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.customer).toBe("Expired Test");
    expect(result.error).toBe("License expired");
  });

  it("returns invalid for a malformed license", () => {
    const result = verifyLicense(INVALID_LICENSE);
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns invalid for a tampered license", () => {
    const result = verifyLicense(TAMPERED_LICENSE);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("signature");
  });

  it("returns invalid for empty input", () => {
    const result = verifyLicense("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("No license key provided");
  });

  it("returns invalid for null/undefined input", () => {
    // @ts-expect-error Testing runtime behavior
    expect(verifyLicense(null).valid).toBe(false);
    // @ts-expect-error Testing runtime behavior
    expect(verifyLicense(undefined).valid).toBe(false);
  });
});

describe("hasFeature", () => {
  it("returns true if license has feature", () => {
    expect(hasFeature(VALID_LICENSE, "sink-rasp")).toBe(true);
    expect(hasFeature(VALID_LICENSE, "policy-ui")).toBe(true);
  });

  it("returns false if license missing feature", () => {
    expect(hasFeature(VALID_LICENSE, "unknown-feature")).toBe(false);
    expect(hasFeature(VALID_LICENSE, "compliance-pci")).toBe(false);
  });

  it("returns false for invalid license", () => {
    expect(hasFeature(INVALID_LICENSE, "sink-rasp")).toBe(false);
    expect(hasFeature(EXPIRED_LICENSE, "sink-rasp")).toBe(false);
  });
});

describe("getFeatures", () => {
  it("returns features for valid license", () => {
    const features = getFeatures(VALID_LICENSE);
    expect(features).toContain("sink-rasp");
    expect(features).toContain("policy-ui");
    expect(features.length).toBe(2);
  });

  it("returns empty array for invalid license", () => {
    expect(getFeatures(INVALID_LICENSE)).toEqual([]);
    expect(getFeatures(EXPIRED_LICENSE)).toEqual([]);
  });
});

describe("requireLicense", () => {
  it("returns payload for valid license", () => {
    const payload = requireLicense(VALID_LICENSE);
    expect(payload.customer).toBe("Test Customer");
    expect(payload.plan).toBe("pro");
  });

  it("returns payload when feature is present", () => {
    const payload = requireLicense(VALID_LICENSE, "sink-rasp");
    expect(payload.customer).toBe("Test Customer");
  });

  it("throws LicenseError for invalid license", () => {
    expect(() => requireLicense(INVALID_LICENSE)).toThrow(LicenseError);
  });

  it("throws LicenseError for expired license", () => {
    expect(() => requireLicense(EXPIRED_LICENSE)).toThrow(LicenseError);
    expect(() => requireLicense(EXPIRED_LICENSE)).toThrow("expired");
  });

  it("throws LicenseError when feature is missing", () => {
    expect(() => requireLicense(VALID_LICENSE, "unknown-feature")).toThrow(LicenseError);
    expect(() => requireLicense(VALID_LICENSE, "unknown-feature")).toThrow(
      "does not include feature"
    );
  });
});
