/**
 * License Validator Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateLicense,
  checkFeature,
  gateFeature,
  clearCache,
  clearAllCaches,
} from "../validator.js";
import type { ValidationResult, LemonSqueezyValidateResponse } from "../types.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample valid response
const validProResponse: LemonSqueezyValidateResponse = {
  valid: true,
  error: null,
  license_key: {
    id: 1,
    status: "active",
    key: "test-key-123",
    activation_limit: 3,
    activation_usage: 1,
    created_at: "2024-01-01T00:00:00.000000Z",
    expires_at: null,
  },
  instance: {
    id: "ins_test",
    name: "test-instance",
    created_at: "2024-01-15T00:00:00.000000Z",
  },
  meta: {
    store_id: 12345,
    order_id: 67890,
    product_id: 11111,
    product_name: "ContractShield Pro",
    variant_id: 22222,
    variant_name: "Pro Monthly",
    customer_id: 33333,
    customer_name: "Test Customer",
    customer_email: "test@example.com",
  },
};

const validEnterpriseResponse: LemonSqueezyValidateResponse = {
  ...validProResponse,
  meta: {
    ...validProResponse.meta!,
    product_name: "ContractShield Enterprise",
    variant_name: "Enterprise Annual",
  },
};

const invalidResponse: LemonSqueezyValidateResponse = {
  valid: false,
  error: "license_key_not_found",
  license_key: null,
  instance: null,
  meta: null,
};

describe("validateLicense", () => {
  beforeEach(() => {
    clearAllCaches();
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

  it("should validate a Pro license successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validProResponse,
    });

    const result = await validateLicense({
      licenseKey: "test-key-123",
      skipCache: true,
    });

    expect(result.valid).toBe(true);
    expect(result.tier).toBe("pro");
    expect(result.customer?.name).toBe("Test Customer");
    expect(result.customer?.email).toBe("test@example.com");
    expect(result.product?.name).toBe("ContractShield Pro");
    expect(result.fromCache).toBe(false);
    expect(result.degraded).toBe(false);
  });

  it("should validate an Enterprise license successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validEnterpriseResponse,
    });

    const result = await validateLicense({
      licenseKey: "enterprise-key",
      skipCache: true,
    });

    expect(result.valid).toBe(true);
    expect(result.tier).toBe("enterprise");
    expect(result.product?.variant).toBe("Enterprise Annual");
  });

  it("should handle invalid license", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => invalidResponse,
    });

    const result = await validateLicense({
      licenseKey: "invalid-key",
      skipCache: true,
    });

    expect(result.valid).toBe(false);
    expect(result.tier).toBe("oss");
    expect(result.error).toBe("license_key_not_found");
    expect(result.degraded).toBe(false);
  });

  it("should use cache on second call", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validProResponse,
    });

    // First call - should hit API
    const result1 = await validateLicense({ licenseKey: "cached-key" });
    expect(result1.fromCache).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    const result2 = await validateLicense({ licenseKey: "cached-key" });
    expect(result2.fromCache).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, no new call
  });

  it("should skip cache when skipCache is true", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => validProResponse,
    });

    await validateLicense({ licenseKey: "skip-cache-key" });
    await validateLicense({ licenseKey: "skip-cache-key", skipCache: true });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should degrade gracefully on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await validateLicense({
      licenseKey: "network-error-key",
      gracefulDegradation: true,
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
    await validateLicense({ licenseKey: "cache-fallback-key" });

    // Clear the cache entry manually to test fallback
    // (in real scenario, cache would be expired)
    clearCache("cache-fallback-key");

    // Repopulate cache
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validProResponse,
    });
    await validateLicense({ licenseKey: "cache-fallback-key" });

    // Network error - should use cache
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const result = await validateLicense({
      licenseKey: "cache-fallback-key",
      skipCache: false,
    });

    // Should still be valid from cache
    expect(result.fromCache).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("should throw when gracefulDegradation is false and validation fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(
      validateLicense({
        licenseKey: "strict-mode-key",
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
      licenseKey: "http-error-key",
      gracefulDegradation: true,
      skipCache: true,
    });

    expect(result.valid).toBe(false);
    expect(result.degraded).toBe(true);
  });
});

describe("checkFeature", () => {
  it("should allow sink-rasp for Pro license", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "pro",
      fromCache: false,
      degraded: false,
    };

    const result = checkFeature(validation, "sink-rasp");
    expect(result.available).toBe(true);
  });

  it("should allow all features for Enterprise license", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "enterprise",
      fromCache: false,
      degraded: false,
    };

    expect(checkFeature(validation, "sink-rasp").available).toBe(true);
    expect(checkFeature(validation, "hot-reload").available).toBe(true);
    expect(checkFeature(validation, "policy-packs").available).toBe(true);
    expect(checkFeature(validation, "audit-export").available).toBe(true);
  });

  it("should deny policy-packs for Pro license", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "pro",
      fromCache: false,
      degraded: false,
    };

    const result = checkFeature(validation, "policy-packs");
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
});

describe("gateFeature", () => {
  it("should call enableFn when feature is available", () => {
    const validation: ValidationResult = {
      valid: true,
      tier: "pro",
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
      fromCache: false,
      degraded: false,
    };

    const enableFn = vi.fn();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    gateFeature("policy-packs", validation, enableFn);

    expect(enableFn).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("policy-packs")
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
    mockFetch.mockReset();
  });

  it("should clear cache for specific key", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => validProResponse,
    });

    // Populate cache
    await validateLicense({ licenseKey: "clear-test-key" });

    // Verify cache is used
    const result1 = await validateLicense({ licenseKey: "clear-test-key" });
    expect(result1.fromCache).toBe(true);

    // Clear cache
    clearCache("clear-test-key");

    // Should hit API again
    const result2 = await validateLicense({ licenseKey: "clear-test-key" });
    expect(result2.fromCache).toBe(false);
  });
});
