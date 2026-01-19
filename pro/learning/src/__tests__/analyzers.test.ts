/**
 * Analyzers Tests
 */

import { describe, it, expect } from "vitest";
import { SchemaAnalyzer, toJsonSchema } from "../analyzers/schema.js";
import { VulnerabilityAnalyzer } from "../analyzers/vulnerabilities.js";
import type { RequestSample } from "../types.js";

function createSample(body: unknown, overrides: Partial<RequestSample> = {}): RequestSample {
  return {
    id: `sample-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    route: "POST /test",
    method: "POST",
    path: "/test",
    body,
    ...overrides,
  };
}

describe("SchemaAnalyzer", () => {
  const analyzer = new SchemaAnalyzer();

  it("should infer simple object schema", () => {
    const samples = [
      createSample({ name: "John", age: 30 }),
      createSample({ name: "Jane", age: 25 }),
      createSample({ name: "Bob", age: 40 }),
    ];

    const schema = analyzer.analyze(samples);

    expect(schema).not.toBeNull();
    expect(schema!.type).toBe("object");
    expect(schema!.properties).toBeDefined();
    expect(schema!.properties!.name.type).toBe("string");
    expect(schema!.properties!.age.type).toBe("integer");
  });

  it("should infer required fields", () => {
    const samples = [
      createSample({ name: "John", email: "john@test.com" }),
      createSample({ name: "Jane", email: "jane@test.com" }),
      createSample({ name: "Bob" }), // Missing email
    ];

    const schema = analyzer.analyze(samples);

    expect(schema!.required).toContain("name");
    expect(schema!.required).not.toContain("email");
  });

  it("should infer array schema", () => {
    const samples = [
      createSample({ items: [1, 2, 3] }),
      createSample({ items: [4, 5] }),
    ];

    const schema = analyzer.analyze(samples);

    expect(schema!.properties!.items.type).toBe("array");
    expect(schema!.properties!.items.items!.type).toBe("integer");
  });

  it("should calculate confidence", () => {
    const samples = [
      createSample({ value: 1 }),
      createSample({ value: 2 }),
      createSample({ value: "string" }), // Different type
    ];

    const schema = analyzer.analyze(samples);

    // Confidence should be less than 1 due to mixed types
    expect(schema!.properties!.value.confidence).toBeLessThan(1);
  });

  it("should return null for empty samples", () => {
    const schema = analyzer.analyze([]);
    expect(schema).toBeNull();
  });

  it("should return null for samples without body", () => {
    const samples = [
      createSample(undefined),
      createSample(null),
    ];

    const schema = analyzer.analyze(samples);
    expect(schema).toBeNull();
  });
});

describe("toJsonSchema", () => {
  it("should convert inferred schema to JSON Schema", () => {
    const analyzer = new SchemaAnalyzer();
    const samples = [
      createSample({ name: "John", age: 30 }),
      createSample({ name: "Jane", age: 25 }),
    ];

    const inferred = analyzer.analyze(samples)!;
    const jsonSchema = toJsonSchema(inferred);

    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.required).toContain("name");
    expect(jsonSchema.required).toContain("age");
    expect((jsonSchema.properties as any).name.type).toBe("string");
    expect((jsonSchema.properties as any).age.type).toBe("number");
  });
});

describe("VulnerabilityAnalyzer", () => {
  const analyzer = new VulnerabilityAnalyzer();

  it("should detect prototype pollution", () => {
    const samples = [
      createSample({ __proto__: { isAdmin: true } }),
      createSample({ constructor: { prototype: {} } }),
    ];

    const patterns = analyzer.analyze(samples);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.type === "prototype-pollution")).toBe(true);
  });

  it("should detect path traversal", () => {
    const samples = [
      createSample({ file: "../../../etc/passwd" }),
      createSample({ path: "..\\..\\windows\\system32" }),
    ];

    const patterns = analyzer.analyze(samples);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.type === "path-traversal")).toBe(true);
  });

  it("should detect SSRF attempts", () => {
    const samples = [
      createSample({ url: "http://localhost:8080/admin" }),
      createSample({ callback: "http://169.254.169.254/metadata" }),
      createSample({ webhook: "http://10.0.0.1/internal" }),
    ];

    const patterns = analyzer.analyze(samples);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.type === "ssrf")).toBe(true);
  });

  it("should detect NoSQL injection", () => {
    const samples = [
      createSample({ username: "admin", password: { $ne: "" } }),
      createSample({ filter: { $where: "this.isAdmin" } }),
    ];

    const patterns = analyzer.analyze(samples);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.type === "nosql")).toBe(true);
  });

  it("should detect command injection", () => {
    const samples = [
      createSample({ command: "ls; cat /etc/passwd" }),
      createSample({ input: "test && rm -rf /" }),
    ];

    const patterns = analyzer.analyze(samples);

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.type === "injection")).toBe(true);
  });

  it("should aggregate patterns by type and field", () => {
    const samples = [
      createSample({ url: "http://localhost/a" }),
      createSample({ url: "http://localhost/b" }),
      createSample({ url: "http://localhost/c" }),
    ];

    const patterns = analyzer.analyze(samples);

    // Should be aggregated into one pattern
    const ssrfPatterns = patterns.filter((p) => p.type === "ssrf");
    expect(ssrfPatterns.length).toBe(1);
    expect(ssrfPatterns[0].sampleIds.length).toBe(3);
  });

  it("should not detect false positives in normal data", () => {
    const samples = [
      createSample({ name: "John Doe", email: "john@example.com" }),
      createSample({ url: "https://api.example.com/data" }),
      createSample({ items: [{ id: 1 }, { id: 2 }] }),
    ];

    const patterns = analyzer.analyze(samples);

    expect(patterns.length).toBe(0);
  });
});
