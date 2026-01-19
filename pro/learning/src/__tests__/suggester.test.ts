/**
 * Suggester Tests
 */

import { describe, it, expect } from "vitest";
import { Suggester, formatYaml, formatJson } from "../suggester/index.js";
import type { AnalysisResult, LearningConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

function createConfig(overrides: Partial<LearningConfig> = {}): LearningConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

function createAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    route: "POST /test",
    sampleCount: 100,
    period: {
      start: "2024-01-01T00:00:00Z",
      end: "2024-01-07T00:00:00Z",
    },
    ...overrides,
  };
}

describe("Suggester", () => {
  describe("generate", () => {
    it("should generate suggestions from vulnerabilities", () => {
      const config = createConfig({ minConfidence: 0.5 });
      const suggester = new Suggester(config);

      const analyses = [
        createAnalysis({
          vulnerabilities: [
            {
              type: "prototype-pollution",
              severity: "critical",
              field: "body.__proto__",
              sampleIds: ["s1", "s2"],
              evidence: "Detected __proto__ key in body",
            },
          ],
        }),
      ];

      const output = suggester.generate(analyses);

      expect(output.suggestions.length).toBe(1);
      expect(output.suggestions[0].severity).toBe("critical");
      expect(output.suggestions[0].category).toBe("vulnerability");
      expect(output.suggestions[0].confidence).toBe(1.0);
      expect(output.suggestions[0].suggested.type).toBe("vulnerability");
      expect(output.suggestions[0].suggested.action).toBe("block");
    });

    it("should generate suggestions from invariants", () => {
      const config = createConfig({ minConfidence: 0.5 });
      const suggester = new Suggester(config);

      const analyses = [
        createAnalysis({
          invariants: [
            {
              id: "invariant.tenant.userId",
              type: "equality",
              fields: ["identity.tenant", "body.userId"],
              expression: "identity.tenant == body.userId",
              evidence: "Observed in 100/100 samples",
              observedIn: 100,
              violations: 0,
              confidence: 1.0,
            },
          ],
        }),
      ];

      const output = suggester.generate(analyses);

      expect(output.suggestions.length).toBe(1);
      expect(output.suggestions[0].category).toBe("business-logic");
      expect(output.suggestions[0].suggested.type).toBe("cel");
      expect(output.suggestions[0].suggested.action).toBe("block");
    });

    it("should suggest monitor mode for invariants with violations", () => {
      const config = createConfig({ minConfidence: 0.5 });
      const suggester = new Suggester(config);

      const analyses = [
        createAnalysis({
          invariants: [
            {
              id: "invariant.total.sum",
              type: "calculation",
              fields: ["body.total", "body.items"],
              expression: "body.total == sum(body.items.price)",
              evidence: "Observed in 95/100 samples",
              observedIn: 100,
              violations: 5,
              confidence: 0.95,
            },
          ],
        }),
      ];

      const output = suggester.generate(analyses);

      expect(output.suggestions[0].suggested.action).toBe("monitor");
      expect(output.suggestions[0].recommendation).toContain("violation(s) detected");
    });

    it("should generate suggestions from schema", () => {
      const config = createConfig({ minConfidence: 0.5 });
      const suggester = new Suggester(config);

      const analyses = [
        createAnalysis({
          schema: {
            type: "object",
            properties: {
              name: { type: "string", observedIn: 100, confidence: 1.0 },
              age: { type: "integer", observedIn: 100, confidence: 1.0 },
            },
            required: ["name", "age"],
            observedIn: 100,
            confidence: 0.95,
          },
        }),
      ];

      const output = suggester.generate(analyses);

      expect(output.suggestions.length).toBe(1);
      expect(output.suggestions[0].category).toBe("schema");
      expect(output.suggestions[0].suggested.type).toBe("contract");
    });

    it("should filter by minimum confidence", () => {
      const config = createConfig({ minConfidence: 0.9 });
      const suggester = new Suggester(config);

      const analyses = [
        createAnalysis({
          invariants: [
            {
              id: "invariant.low.confidence",
              type: "equality",
              fields: ["a", "b"],
              expression: "a == b",
              evidence: "Low confidence",
              observedIn: 50,
              violations: 10,
              confidence: 0.8, // Below threshold
            },
          ],
          schema: {
            type: "object",
            observedIn: 100,
            confidence: 0.85, // Below threshold
          },
        }),
      ];

      const output = suggester.generate(analyses);

      expect(output.suggestions.length).toBe(0);
    });

    it("should sort by severity then confidence", () => {
      const config = createConfig({ minConfidence: 0.5 });
      const suggester = new Suggester(config);

      const analyses = [
        createAnalysis({
          vulnerabilities: [
            {
              type: "ssrf",
              severity: "high",
              field: "body.url",
              sampleIds: ["s1"],
              evidence: "SSRF attempt",
            },
            {
              type: "prototype-pollution",
              severity: "critical",
              field: "body.__proto__",
              sampleIds: ["s2"],
              evidence: "Proto pollution",
            },
          ],
        }),
      ];

      const output = suggester.generate(analyses);

      expect(output.suggestions[0].severity).toBe("critical");
      expect(output.suggestions[1].severity).toBe("high");
    });

    it("should build correct summary", () => {
      const config = createConfig({ minConfidence: 0.5 });
      const suggester = new Suggester(config);

      const analyses = [
        createAnalysis({
          vulnerabilities: [
            {
              type: "prototype-pollution",
              severity: "critical",
              field: "body.__proto__",
              sampleIds: ["s1"],
              evidence: "Test",
            },
            {
              type: "ssrf",
              severity: "high",
              field: "body.url",
              sampleIds: ["s2"],
              evidence: "Test",
            },
          ],
          schema: {
            type: "object",
            observedIn: 100,
            confidence: 0.95,
          },
        }),
      ];

      const output = suggester.generate(analyses);

      expect(output.summary.critical).toBe(1);
      expect(output.summary.high).toBe(1);
      expect(output.summary.medium).toBe(1); // Schema
      expect(output.summary.byCategory.vulnerability).toBe(2);
      expect(output.summary.byCategory.schema).toBe(1);
    });

    it("should handle empty analyses", () => {
      const config = createConfig({ minConfidence: 0.5 });
      const suggester = new Suggester(config);

      const output = suggester.generate([]);

      expect(output.suggestions.length).toBe(0);
      expect(output.metadata.stats.routesObserved).toBe(0);
    });
  });
});

describe("formatYaml", () => {
  it("should format output as YAML", () => {
    const config = createConfig({ minConfidence: 0.5 });
    const suggester = new Suggester(config);

    const analyses = [
      createAnalysis({
        vulnerabilities: [
          {
            type: "prototype-pollution",
            severity: "critical",
            field: "body.__proto__",
            sampleIds: ["s1"],
            evidence: "Detected __proto__",
          },
        ],
      }),
    ];

    const output = suggester.generate(analyses);
    const yaml = formatYaml(output);

    expect(yaml).toContain("# ContractShield Learning Mode");
    expect(yaml).toContain("suggestions:");
    expect(yaml).toContain("severity: critical");
    expect(yaml).toContain("prototypePollution: true");
  });
});

describe("formatJson", () => {
  it("should format output as JSON", () => {
    const config = createConfig({ minConfidence: 0.5 });
    const suggester = new Suggester(config);

    const analyses = [createAnalysis()];
    const output = suggester.generate(analyses);
    const json = formatJson(output);

    const parsed = JSON.parse(json);
    expect(parsed.metadata).toBeDefined();
    expect(parsed.suggestions).toBeInstanceOf(Array);
    expect(parsed.summary).toBeDefined();
  });
});
