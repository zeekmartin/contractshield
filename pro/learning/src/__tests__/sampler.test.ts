/**
 * Sampler Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Sampler, shouldSample } from "../collector/sampler.js";

describe("Sampler", () => {
  let sampler: Sampler;

  beforeEach(() => {
    sampler = new Sampler(0.5);
  });

  it("should respect configured rate", () => {
    expect(sampler.getRate()).toBe(0.5);
  });

  it("should clamp rate between 0 and 1", () => {
    const lowSampler = new Sampler(-0.5);
    expect(lowSampler.getRate()).toBe(0);

    const highSampler = new Sampler(1.5);
    expect(highSampler.getRate()).toBe(1);
  });

  it("should track statistics", () => {
    for (let i = 0; i < 1000; i++) {
      sampler.shouldSample();
    }

    const stats = sampler.getStats();
    expect(stats.totalChecked).toBe(1000);
    expect(stats.totalSampled).toBeGreaterThan(0);
    expect(stats.totalSampled).toBeLessThan(1000);
    // Actual rate should be approximately 0.5
    expect(stats.actualRate).toBeGreaterThan(0.4);
    expect(stats.actualRate).toBeLessThan(0.6);
  });

  it("should reset statistics", () => {
    sampler.shouldSample();
    sampler.shouldSample();
    sampler.reset();

    const stats = sampler.getStats();
    expect(stats.totalChecked).toBe(0);
    expect(stats.totalSampled).toBe(0);
  });

  it("should sample at approximately the configured rate", () => {
    const testSampler = new Sampler(0.1);
    let sampled = 0;
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      if (testSampler.shouldSample()) {
        sampled++;
      }
    }

    const actualRate = sampled / iterations;
    // Allow 2% tolerance
    expect(actualRate).toBeGreaterThan(0.08);
    expect(actualRate).toBeLessThan(0.12);
  });
});

describe("shouldSample function", () => {
  it("should return boolean", () => {
    const result = shouldSample(0.5);
    expect(typeof result).toBe("boolean");
  });

  it("should always return false for rate 0", () => {
    for (let i = 0; i < 100; i++) {
      expect(shouldSample(0)).toBe(false);
    }
  });

  it("should always return true for rate 1", () => {
    for (let i = 0; i < 100; i++) {
      expect(shouldSample(1)).toBe(true);
    }
  });
});
