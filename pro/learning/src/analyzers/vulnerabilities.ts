/**
 * ContractShield Learning Mode - Vulnerability Analyzer
 *
 * Detects attack patterns in observed traffic.
 *
 * @license Commercial
 */

import type { RequestSample, VulnerabilityPattern } from "../types.js";

/**
 * Vulnerability pattern analyzer
 */
export class VulnerabilityAnalyzer {
  /**
   * Analyze samples for vulnerability patterns
   */
  analyze(samples: RequestSample[]): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];

    for (const sample of samples) {
      // Prototype Pollution
      patterns.push(...this.detectPrototypePollution(sample));

      // Path Traversal
      patterns.push(...this.detectPathTraversal(sample));

      // SSRF
      patterns.push(...this.detectSSRF(sample));

      // NoSQL Injection
      patterns.push(...this.detectNoSQLInjection(sample));

      // Command Injection
      patterns.push(...this.detectCommandInjection(sample));
    }

    // Aggregate and deduplicate
    return this.aggregatePatterns(patterns);
  }

  private detectPrototypePollution(sample: RequestSample): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];
    const dangerous = ["__proto__", "constructor", "prototype"];

    const checkObj = (obj: unknown, path: string): void => {
      if (!obj || typeof obj !== "object") return;

      for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (dangerous.includes(key)) {
          patterns.push({
            type: "prototype-pollution",
            severity: "critical",
            field: `${path}.${key}`,
            sampleIds: [sample.id],
            evidence: `Found '${key}' key in request at ${path}.${key}`,
          });
        }

        const value = (obj as Record<string, unknown>)[key];
        if (value && typeof value === "object") {
          checkObj(value, `${path}.${key}`);
        }
      }
    };

    if (sample.body) {
      checkObj(sample.body, "body");
    }
    if (sample.queryParams) {
      checkObj(sample.queryParams, "query");
    }

    return patterns;
  }

  private detectPathTraversal(sample: RequestSample): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];

    // Multiple path traversal patterns
    const regexes = [
      /\.\.[\/\\]/,                    // ../  ..\
      /%2e%2e[%2f%5c]/i,               // URL encoded
      /\.\.%[0-9a-f]{2}/i,             // Partial encoding
      /%c0%ae/i,                       // Overlong UTF-8
      /\.\.\u2215/,                    // Unicode slash
      /\.\.\u2216/,                    // Unicode backslash
    ];

    const checkValue = (value: unknown, path: string): void => {
      if (typeof value === "string") {
        for (const regex of regexes) {
          if (regex.test(value)) {
            patterns.push({
              type: "path-traversal",
              severity: "critical",
              field: path,
              sampleIds: [sample.id],
              evidence: `Path traversal pattern detected in ${path}: "${value.slice(0, 50)}${value.length > 50 ? "..." : ""}"`,
            });
            break;
          }
        }
      } else if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          value.forEach((item, i) => checkValue(item, `${path}[${i}]`));
        } else {
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            checkValue(v, `${path}.${k}`);
          }
        }
      }
    };

    if (sample.body) checkValue(sample.body, "body");
    if (sample.queryParams) checkValue(sample.queryParams, "query");
    if (sample.path) checkValue(sample.path, "path");

    return patterns;
  }

  private detectSSRF(sample: RequestSample): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];

    const internalPatterns = [
      /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i,
      /^https?:\/\/\[::1\]/i,                                   // IPv6 localhost
      /^https?:\/\/169\.254\./,                                  // AWS metadata
      /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/, // Private IPs
      /^file:\/\//i,
      /^gopher:\/\//i,
      /^dict:\/\//i,
      /^ftp:\/\/localhost/i,
    ];

    const urlFields = [
      "url", "callback", "webhook", "redirect", "next", "return_url",
      "returnUrl", "return", "forward", "goto", "target", "dest",
      "destination", "uri", "link", "href", "src", "source",
    ];

    const checkUrl = (value: unknown, path: string): boolean => {
      if (typeof value !== "string") return false;

      for (const pattern of internalPatterns) {
        if (pattern.test(value)) {
          patterns.push({
            type: "ssrf",
            severity: "critical",
            field: path,
            sampleIds: [sample.id],
            evidence: `SSRF pattern detected in ${path}: "${value.slice(0, 80)}${value.length > 80 ? "..." : ""}"`,
          });
          return true;
        }
      }
      return false;
    };

    const searchFields = (obj: unknown, path: string): void => {
      if (!obj || typeof obj !== "object") return;

      if (Array.isArray(obj)) {
        obj.forEach((item, i) => searchFields(item, `${path}[${i}]`));
        return;
      }

      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const currentPath = `${path}.${key}`;
        const lowerKey = key.toLowerCase();

        if (urlFields.some((f) => lowerKey.includes(f.toLowerCase()))) {
          checkUrl(value, currentPath);
        }

        if (typeof value === "object") {
          searchFields(value, currentPath);
        }
      }
    };

    if (sample.body) searchFields(sample.body, "body");
    if (sample.queryParams) searchFields(sample.queryParams, "query");

    return patterns;
  }

  private detectNoSQLInjection(sample: RequestSample): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];

    const operators = [
      "$gt", "$lt", "$gte", "$lte", "$ne", "$eq",
      "$in", "$nin", "$or", "$and", "$not", "$nor",
      "$exists", "$type", "$regex", "$where", "$expr",
      "$text", "$mod", "$all", "$elemMatch", "$size",
    ];

    const checkObj = (obj: unknown, path: string): void => {
      if (!obj || typeof obj !== "object") return;

      if (Array.isArray(obj)) {
        obj.forEach((item, i) => checkObj(item, `${path}[${i}]`));
        return;
      }

      for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (operators.includes(key)) {
          patterns.push({
            type: "nosql",
            severity: "high",
            field: `${path}.${key}`,
            sampleIds: [sample.id],
            evidence: `NoSQL operator '${key}' found in request at ${path}`,
          });
        }

        const value = (obj as Record<string, unknown>)[key];
        if (value && typeof value === "object") {
          checkObj(value, `${path}.${key}`);
        }
      }
    };

    if (sample.body) {
      checkObj(sample.body, "body");
    }

    return patterns;
  }

  private detectCommandInjection(sample: RequestSample): VulnerabilityPattern[] {
    const patterns: VulnerabilityPattern[] = [];

    // Command injection patterns
    const commandPatterns = [
      /[;&|`$][^;&|`$]*(?:cat|ls|pwd|whoami|id|uname|curl|wget|nc|bash|sh|python|perl|ruby|php)/i,
      /\$\([^)]+\)/,           // $(command)
      /`[^`]+`/,               // `command`
      /\|\s*\w+/,              // | command
      /;\s*\w+/,               // ; command
      /&&\s*\w+/,              // && command
      /\|\|\s*\w+/,            // || command
    ];

    const checkValue = (value: unknown, path: string): void => {
      if (typeof value === "string") {
        for (const pattern of commandPatterns) {
          if (pattern.test(value)) {
            patterns.push({
              type: "injection",
              severity: "critical",
              field: path,
              sampleIds: [sample.id],
              evidence: `Command injection pattern detected in ${path}: "${value.slice(0, 50)}${value.length > 50 ? "..." : ""}"`,
            });
            break;
          }
        }
      } else if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          value.forEach((item, i) => checkValue(item, `${path}[${i}]`));
        } else {
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            checkValue(v, `${path}.${k}`);
          }
        }
      }
    };

    if (sample.body) checkValue(sample.body, "body");
    if (sample.queryParams) checkValue(sample.queryParams, "query");

    return patterns;
  }

  private aggregatePatterns(patterns: VulnerabilityPattern[]): VulnerabilityPattern[] {
    const grouped = new Map<string, VulnerabilityPattern>();

    for (const p of patterns) {
      const key = `${p.type}:${p.field}`;
      const existing = grouped.get(key);

      if (existing) {
        // Merge sample IDs
        const allIds = new Set([...existing.sampleIds, ...p.sampleIds]);
        existing.sampleIds = Array.from(allIds);
        existing.evidence = `${p.type} pattern detected ${existing.sampleIds.length} times in ${p.field}`;
      } else {
        grouped.set(key, { ...p });
      }
    }

    return Array.from(grouped.values());
  }
}
