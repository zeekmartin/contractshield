/**
 * ContractShield Learning Mode - Suggester
 *
 * Generates security rule suggestions from analysis results.
 *
 * @license Commercial
 */

import type {
  AnalysisResult,
  Suggestion,
  SuggestionsOutput,
  LearningConfig,
  VulnerabilityPattern,
  Invariant,
  InferredSchema,
} from "../types.js";
import { toJsonSchema } from "../analyzers/schema.js";

/**
 * Suggestion generator
 */
export class Suggester {
  private config: LearningConfig;

  constructor(config: LearningConfig) {
    this.config = config;
  }

  /**
   * Generate suggestions from analysis results
   */
  generate(analyses: AnalysisResult[]): SuggestionsOutput {
    const suggestions: Suggestion[] = [];

    for (const analysis of analyses) {
      // Vulnerabilities → Critical suggestions
      if (analysis.vulnerabilities?.length) {
        suggestions.push(...this.fromVulnerabilities(analysis));
      }

      // Invariants → Business logic rules
      if (analysis.invariants?.length) {
        suggestions.push(...this.fromInvariants(analysis));
      }

      // Schema → Contract validation
      if (analysis.schema) {
        suggestions.push(...this.fromSchema(analysis));
      }
    }

    // Filter by minimum confidence
    const filtered = suggestions.filter(
      (s) => s.confidence >= this.config.minConfidence
    );

    // Sort by severity then confidence
    const sorted = this.sortSuggestions(filtered);

    return this.buildOutput(sorted, analyses);
  }

  private fromVulnerabilities(analysis: AnalysisResult): Suggestion[] {
    if (!analysis.vulnerabilities) return [];

    return analysis.vulnerabilities.map((vuln) => ({
      id: `auto.vuln.${vuln.type}.${vuln.field.replace(/[.\[\]]/g, "_")}`,
      severity: vuln.severity,
      confidence: 1.0, // Vulnerabilities detected = max confidence
      category: "vulnerability" as const,
      route: analysis.route,
      evidence: vuln.evidence,
      recommendation: `Enable immediately - ${vuln.sampleIds.length} attack attempt(s) detected`,
      suggested: {
        type: "vulnerability" as const,
        action: "block" as const,
        config: this.buildVulnConfig(vuln),
      },
    }));
  }

  private fromInvariants(analysis: AnalysisResult): Suggestion[] {
    if (!analysis.invariants) return [];

    return analysis.invariants.map((inv) => ({
      id: inv.id.replace("invariant.", "auto."),
      severity: inv.confidence > 0.99 ? ("high" as const) : ("medium" as const),
      confidence: inv.confidence,
      category: "business-logic" as const,
      route: analysis.route,
      evidence: inv.evidence,
      recommendation:
        inv.violations > 0
          ? `${inv.violations} violation(s) detected - review before enabling in block mode`
          : "High confidence - safe to enable in block mode",
      suggested: {
        type: "cel" as const,
        action: inv.violations > 0 ? ("monitor" as const) : ("block" as const),
        config: {
          expr: inv.expression,
        },
      },
    }));
  }

  private fromSchema(analysis: AnalysisResult): Suggestion[] {
    if (!analysis.schema) return [];

    const jsonSchema = toJsonSchema(analysis.schema);

    return [
      {
        id: `auto.schema.${analysis.route.replace(/[^a-z0-9]/gi, "_")}`,
        severity: "medium" as const,
        confidence: analysis.schema.confidence,
        category: "schema" as const,
        route: analysis.route,
        evidence: `Inferred from ${analysis.schema.observedIn} requests`,
        recommendation: "Review and adjust constraints as needed",
        suggested: {
          type: "contract" as const,
          config: {
            request: {
              body: jsonSchema,
            },
          },
        },
      },
    ];
  }

  private buildVulnConfig(vuln: VulnerabilityPattern): Record<string, unknown> {
    const fieldPath = vuln.field.replace(/^body\./, "").replace(/^query\./, "");

    switch (vuln.type) {
      case "prototype-pollution":
        return { prototypePollution: true };
      case "path-traversal":
        return { pathTraversal: { fields: [fieldPath] } };
      case "ssrf":
        return { ssrfInternal: { fields: [fieldPath] } };
      case "nosql":
        return { nosqlInjection: true };
      case "injection":
        return { commandInjection: { fields: [fieldPath] } };
      default:
        return {};
    }
  }

  private sortSuggestions(suggestions: Suggestion[]): Suggestion[] {
    const severityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    return suggestions.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });
  }

  private buildOutput(
    suggestions: Suggestion[],
    analyses: AnalysisResult[]
  ): SuggestionsOutput {
    const totalRequests = analyses.reduce((sum, a) => sum + a.sampleCount, 0);
    const period = this.getPeriod(analyses);

    return {
      metadata: {
        version: "1.0",
        generated: new Date().toISOString(),
        period,
        stats: {
          totalRequests,
          sampledRequests: totalRequests,
          routesObserved: analyses.length,
          suggestionsGenerated: suggestions.length,
        },
      },
      suggestions,
      summary: {
        critical: suggestions.filter((s) => s.severity === "critical").length,
        high: suggestions.filter((s) => s.severity === "high").length,
        medium: suggestions.filter((s) => s.severity === "medium").length,
        low: suggestions.filter((s) => s.severity === "low").length,
        byCategory: this.countByCategory(suggestions),
      },
    };
  }

  private getPeriod(analyses: AnalysisResult[]): { start: string; end: string } {
    if (analyses.length === 0) {
      const now = new Date().toISOString();
      return { start: now, end: now };
    }

    const starts = analyses.map((a) => a.period.start).sort();
    const ends = analyses.map((a) => a.period.end).sort();

    return {
      start: starts[0],
      end: ends[ends.length - 1],
    };
  }

  private countByCategory(suggestions: Suggestion[]): Record<string, number> {
    return suggestions.reduce(
      (acc, s) => {
        acc[s.category] = (acc[s.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }
}

/**
 * Format suggestions as YAML
 */
export function formatYaml(output: SuggestionsOutput): string {
  const lines: string[] = [];

  lines.push("# ContractShield Learning Mode - Suggested Rules");
  lines.push(`# Generated: ${output.metadata.generated}`);
  lines.push(`# Period: ${output.metadata.period.start} to ${output.metadata.period.end}`);
  lines.push(`# Routes: ${output.metadata.stats.routesObserved}`);
  lines.push(`# Suggestions: ${output.metadata.stats.suggestionsGenerated}`);
  lines.push("");
  lines.push("# Summary:");
  lines.push(`#   Critical: ${output.summary.critical}`);
  lines.push(`#   High: ${output.summary.high}`);
  lines.push(`#   Medium: ${output.summary.medium}`);
  lines.push(`#   Low: ${output.summary.low}`);
  lines.push("");
  lines.push("suggestions:");

  for (const suggestion of output.suggestions) {
    lines.push("");
    lines.push(`  - id: ${suggestion.id}`);
    lines.push(`    severity: ${suggestion.severity}`);
    lines.push(`    confidence: ${suggestion.confidence.toFixed(2)}`);
    lines.push(`    category: ${suggestion.category}`);
    if (suggestion.route) {
      lines.push(`    route: "${suggestion.route}"`);
    }
    lines.push(`    evidence: "${escapeYaml(suggestion.evidence)}"`);
    lines.push(`    recommendation: "${escapeYaml(suggestion.recommendation)}"`);
    lines.push("    suggested:");
    lines.push(`      type: ${suggestion.suggested.type}`);
    if (suggestion.suggested.action) {
      lines.push(`      action: ${suggestion.suggested.action}`);
    }
    lines.push("      config:");
    lines.push(indentYaml(formatConfig(suggestion.suggested.config), 8));
  }

  return lines.join("\n");
}

/**
 * Format suggestions as JSON
 */
export function formatJson(output: SuggestionsOutput): string {
  return JSON.stringify(output, null, 2);
}

function escapeYaml(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatConfig(config: unknown): string {
  if (config === null || config === undefined) return "null";
  if (typeof config !== "object") return String(config);

  const lines: string[] = [];

  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (typeof value === "object" && value !== null) {
      lines.push(`${key}:`);
      lines.push(indentYaml(formatConfig(value), 2));
    } else if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${typeof item === "string" ? `"${item}"` : item}`);
      }
    } else if (typeof value === "string") {
      lines.push(`${key}: "${escapeYaml(value)}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

function indentYaml(yaml: string, spaces: number): string {
  const indent = " ".repeat(spaces);
  return yaml
    .split("\n")
    .map((line) => indent + line)
    .join("\n");
}
