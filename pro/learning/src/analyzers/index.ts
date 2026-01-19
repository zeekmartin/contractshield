/**
 * ContractShield Learning Mode - Analyzers
 *
 * @license Commercial
 */

export { SchemaAnalyzer, toJsonSchema } from "./schema.js";
export { InvariantAnalyzer } from "./invariants.js";
export { VulnerabilityAnalyzer } from "./vulnerabilities.js";

import type { RequestSample, AnalysisResult, LearningConfig } from "../types.js";
import { SchemaAnalyzer } from "./schema.js";
import { InvariantAnalyzer } from "./invariants.js";
import { VulnerabilityAnalyzer } from "./vulnerabilities.js";

/**
 * Run all enabled analyzers on samples
 */
export function analyzeRoute(
  route: string,
  samples: RequestSample[],
  config: LearningConfig
): AnalysisResult {
  const result: AnalysisResult = {
    route,
    sampleCount: samples.length,
    period: getPeriod(samples),
  };

  if (samples.length === 0) {
    return result;
  }

  // Schema inference
  if (config.analyzers.schemaInference) {
    const schemaAnalyzer = new SchemaAnalyzer();
    result.schema = schemaAnalyzer.analyze(samples) || undefined;
  }

  // Invariant discovery
  if (config.analyzers.invariantDiscovery) {
    const invariantAnalyzer = new InvariantAnalyzer();
    result.invariants = invariantAnalyzer.analyze(samples);
  }

  // Vulnerability scanning
  if (config.analyzers.vulnerabilityScanning) {
    const vulnAnalyzer = new VulnerabilityAnalyzer();
    result.vulnerabilities = vulnAnalyzer.analyze(samples);
  }

  return result;
}

/**
 * Get time period from samples
 */
function getPeriod(samples: RequestSample[]): { start: string; end: string } {
  if (samples.length === 0) {
    const now = new Date().toISOString();
    return { start: now, end: now };
  }

  const timestamps = samples.map((s) => s.timestamp).sort();
  return {
    start: timestamps[0],
    end: timestamps[timestamps.length - 1],
  };
}
