/**
 * License Validator Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateLicense,
  checkFeature,
  gateFeature,
  isValidLicenseKeyFormat,
  clearCache,
  clearAllCaches,
} from "../validator.js";
import { clearFingerprintCache } from "../fingerprint.js";
import type { ValidationResult, LicenseValidateSuccessResponse, LicenseValidateErrorResponse } from "../types.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test license keys (valid format)
const VALID_PRO_KEY = "CSHIELD-ABCD-EFGH-2345-6789";
const VALID_ENTERPRISE_KEY = "CSHIELD-WXYZ-ABCD-2345-9876";
const INVALID_FORMAT_KEY = "invalid-key-123";

// Sample valid response - Pro
const validProResponse: LicenseValidateSuccessResponse = {
  valid: true,
  plan: "pro",
  features: ["sink-rasp", "learning-mode", "priority-support"],
  seats: 5,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  status: "active",
  gracePeriodEnds: null,
};

// Sample valid response - Enterprise
const validEnterpriseResponse: LicenseValidateSuccessResponse = {
  valid: true,
  plan: "enterprise",
  features: ["sink-rasp", "learning-mode", "priority-support", "custom-rules", "sla-guarantee", "dedicated-support"],
  seats: 25,
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
  status: "active",
  gracePeriodEnds: null,
};

// Invalid license response
const invalidResponse: LicenseValidateErrorResponse = {
  valid: false,
  error: "invalid_license",
  message: "License not found",
};

// Not activated response
const notActivatedResponse: LicenseValidateErrorResponse = {
  valid: false,
  error: "not_activated",
  message: "License not activated on this machine",
  plan: "pro",
};

// Activation success response
const activationSuccessResponse = {
  activated: true,
  alreadyActive: false,
  remainingSeats: 4,
};

describe("isValidLicenseKeyFormat", () => {
  it("should accept valid license key format", () => {
    expect(isValidLicenseKeyFormat("CSHIELD-ABCD-EFGH-2345-6789")).toBe(true);
    expect(isValidLicenseKeyFormat("CSHIELD-WXYZ-NMPQ-2345-9876")).toBe(true);
  });

  it("should reject invalid license key formats", () => {
    expect(isValidLicenseKeyFormat("invalid")).toBe(false);
    expect(isValidLicenseKeyFormat("CSHIELD-ABCD-EFGH-2345")).toBe(false); // Too short
    expect(isValidLicenseKeyFormat("CS-ABCD-EFGH-2345-6789")).toBe(false); // Wrong prefix
    expect(isValidLicenseKeyFormat("CSHIELD-ABCI-EFGH-2345-6789")).toBe(false); // Contains I
    expect(isValidLicenseKeyFormat("CSHIELD-ABCO-EFGH-2345-6789")).toBe(false); // Contains O
    expect(isValidLicenseKeyFormat("CSHIELD-ABC0-EFGH-2345-6789")).toBe(false); // Contains 0
    expect(isValidLicenseKeyFormat("CSHIELD-ABC1-EFGH-2345-6789")).toBe(false); // Contains 1
  });
});

describe("validateLicense", () => {
  beforeEach(() => {
    clearAllCaches();
    clearFingerprintCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearAllCaches();
  });

  it("should return OSS mode when no license key provided", async () => {
    const result = await validateLicense({ licenseKey: "" });

    expect(result.valid).toBe(false);
    expect(result.tier).toBe("oss");
    expect(result.degraded).toBe(true);
    expect(result.error).toContain("No license key");
  });

  it("should return error for invalid license key format", async () => {
    const result = await validateLicense({ licenseKey: INVALID_FORMAT_KEY });

    expect(result.valid).toBe(false);
    expect(result.tier).toBe("oss");
    expect(result.error).toContain("Invalid license key format");
    expect(mockFetch).not.toHaveBeenCalled(); // Should not call API
  });

  it("should validate a Pro license successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validProResponse,
    });

    const result = await validateLicense({
      licenseKey: VALID_PRO_KEY,
      skipCache: true,
    });

    expect(result.valid).toBe(true);
    expect(result.tier).toBe("pro");
    expect(result.features).toContain("sink-rasp");
    expect(result.features).toContain("learning-mode");
    expect(result.seats).toBe(5);
    expect(result.status).toBe("active");
    expect(result.fromCache).toBe(false);
    expect(result.degraded).toBe(false);
  });

  it("should validate an Enterprise license successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validEnterpriseResponse,
    });

    const result = await validateLicense({
      licenseKey: VALID_ENTERPRISE_KEY,
      skipCache: true,
    });

    expect(result.valid).toBe(true);
    expect(result.tier).toBe("enterprise");
    expect(result.features).toContain("custom-rules");
    expect(result.seats).toBe(25);
  });

  it("should handle invalid license", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => invalidResponse,
    });

    const result = await validateLicense({
      licenseKey: VALID_PRO_KEY,
      skipCache: true,
    });

    expect(result.valid).toBe(false);
    expect(result.tier).toBe("oss");
    expect(result.error).toBe("License not found");
    expect(result.degraded).toBe(false);
  });

  it("should auto-activate license when not activated", async () => {
    // First call returns not_activated
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => notActivatedResponse,
    });
    // Activation call succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => activationSuccessResponse,
    });
    // Retry validation succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validProResponse,
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await validateLicense({
      licenseKey: VALID_PRO_KEY,
      skipCache: true,
      autoActivate: true,
    });

    expect(result.valid).toBe(true);
    expect(result.tier).toBe("pro");
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("activating")
    );

    consoleSpy.mockRestore();
  });

  it("should not auto-activate when autoActivate is false", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => notActivatedResponse,
    });

    const result = await validateLicense({
      licenseKey: VALID_PRO_KEY,
      skipCache: true,
      autoActivate: false,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toBe("License not activated on this machine");
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only validation, no activation
  });

  it("should use cache on second call", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validProResponse,
    });

    // First call - should hit API
    const result1 = await validateLicense({ licenseKey: VALID_PRO_KEY });
    expect(result1.fromCache).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    const result2 = await validateLicense({ licenseKey: VALID_PRO_KEY });
    expect(result2.fromCache).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, no new call
  });

  it("should skip cache when skipCache is true", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => validProResponse,
    });

    await validateLicense({ licenseKey: VALID_PRO_KEY });
    await validateLicense({ licenseKey: VALID_PRO_KEY, skipCache: true });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should degrade gracefully on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await validateLicense({
      licenseKey: VALID_PRO_KEY,
      gracefulDegradation: true,
      skipCache: true,
    });

    expect(result.valid).toBe(false);
    expect(result.tier).toBe("oss");
    expect(result.degraded).toBe(true);
    expect(result.error).toContain("Network error");
  });

  it("should use cached result on network error if available", async () => {
    // First call - success, populate cache
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validProResponse,
    });
    await validateLicense({ licenseKey: VALID_PRO_KEY });

    // Network error - should use cache
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await validateLicense({
      licenseKey: VALID_PRO_KEY,
      skipCache: false,
    });

    // Should still be valid from cache
    expect(result.fromCache).toBe(true);
    expect(result.valid).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("using cached result")
    );

    consoleSpy.mockRestore();
  });

  it("should throw when gracefulDegradation is false and validation fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(
      validateLicense({
        licenseKey: VALID_PRO_KEY,
        gracefulDegradation: false,
        skipCache: true,
      })
    ).rejects.toThrow("License validation failed");
  });

  it("should handle HTTP error responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const result = await validateLicense({
      licenseKey: VALID_PRO_KEY,
      gracefulDegradation: true,
      skipCache: true,
    });

    expect(result.valid).toBe(false);
    expect(result.degraded).toBe(true);
  });

  it("should handle grace period status", async () => {
    const gracePeriodResponse: LicenseValidateSuccessResponse = {
      ...validProResponse,
      status: "grace_period",
      gracePeriodEnds: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => gracePeriodResponse,
    });

    const result = await validateLicense({
      licenseKey: VALID_PRO_KEY,
      skipCache: true,
    });

    expect(result.valid).toBe(true);
    expect(result.status).toBe("grace_period");
    expect(result.gracePeriodEnds).toBeDefined();
  });
});

describe("checkFeature", () => {
  it("should allow sink-rasp for Pro license", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "pro",
      features: ["sink-rasp", "learning-mode", "priority-support"],
      fromCache: false,
      degraded: false,
    };

    const result = checkFeature(validation, "sink-rasp");
    expect(result.available).toBe(true);
  });

  it("should allow learning-mode for Pro license", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "pro",
      features: ["sink-rasp", "learning-mode", "priority-support"],
      fromCache: false,
      degraded: false,
    };

    const result = checkFeature(validation, "learning-mode");
    expect(result.available).toBe(true);
  });

  it("should allow all features for Enterprise license", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "enterprise",
      features: ["sink-rasp", "learning-mode", "priority-support", "custom-rules", "sla-guarantee", "dedicated-support"],
      fromCache: false,
      degraded: false,
    };

    expect(checkFeature(validation, "sink-rasp").available).toBe(true);
    expect(checkFeature(validation, "learning-mode").available).toBe(true);
    expect(checkFeature(validation, "custom-rules").available).toBe(true);
    expect(checkFeature(validation, "sla-guarantee").available).toBe(true);
    expect(checkFeature(validation, "dedicated-support").available).toBe(true);
  });

  it("should deny custom-rules for Pro license", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "pro",
      features: ["sink-rasp", "learning-mode", "priority-support"],
      fromCache: false,
      degraded: false,
    };

    const result = checkFeature(validation, "custom-rules");
    expect(result.available).toBe(false);
    expect(result.reason).toContain("Enterprise");
    expect(result.upgradeUrl).toBeDefined();
  });

  it("should deny all Pro features in degraded mode", () => {
    const validation: ValidationResult = {
      valid: false,
      tier: "oss",
      fromCache: false,
      degraded: true,
    };

    const result = checkFeature(validation, "sink-rasp");
    expect(result.available).toBe(false);
    expect(result.reason).toContain("OSS mode");
  });

  it("should deny features for invalid license", () => {
    const validation: ValidationResult = {
      valid: false,
      tier: "oss",
      error: "Invalid license",
      fromCache: false,
      degraded: false,
    };

    const result = checkFeature(validation, "sink-rasp");
    expect(result.available).toBe(false);
    expect(result.reason).toBe("Invalid license");
  });

  it("should use API features list when available", () => {
    // Even if tier is pro, if API returns custom-rules in features, allow it
    const validation: ValidationResult = {
      valid: true,
      tier: "pro",
      features: ["sink-rasp", "learning-mode", "custom-rules"], // API says custom-rules is available
      fromCache: false,
      degraded: false,
    };

    const result = checkFeature(validation, "custom-rules");
    expect(result.available).toBe(true);
  });
});

describe("gateFeature", () => {
  it("should call enableFn when feature is available", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "pro",
      features: ["sink-rasp", "learning-mode", "priority-support"],
      fromCache: false,
      degraded: false,
    };

    const enableFn = vi.fn();
    gateFeature("sink-rasp", validation, enableFn);

    expect(enableFn).toHaveBeenCalledTimes(1);
  });

  it("should not call enableFn when feature is unavailable", () => {
    const validation: ValidationResult = {
      valid: false,
      tier: "oss",
      fromCache: false,
      degraded: true,
    };

    const enableFn = vi.fn();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    gateFeature("sink-rasp", validation, enableFn);

    expect(enableFn).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should log warning with upgrade URL when feature unavailable", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "pro",
      features: ["sink-rasp", "learning-mode", "priority-support"],
      fromCache: false,
      degraded: false,
    };

    const enableFn = vi.fn();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    gateFeature("custom-rules", validation, enableFn);

    expect(enableFn).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("custom-rules")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("contractshield.dev/pricing")
    );

    consoleSpy.mockRestore();
  });
});

describe("clearCache", () => {
  beforeEach(() => {
    clearAllCaches();
    clearFingerprintCache();
    mockFetch.mockReset();
  });

  it("should clear cache for specific key", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => validProResponse,
    });

    // Populate cache
    await validateLicense({ licenseKey: VALID_PRO_KEY });

    // Verify cache is used
    const result1 = await validateLicense({ licenseKey: VALID_PRO_KEY });
    expect(result1.fromCache).toBe(true);

    // Clear cache
    clearCache(VALID_PRO_KEY);

    // Should hit API again
    const result2 = await validateLicense({ licenseKey: VALID_PRO_KEY });
    expect(result2.fromCache).toBe(false);
  });
});
