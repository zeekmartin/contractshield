/**
 * ContractShield Learning Mode - Invariant Analyzer
 *
 * Discovers business logic invariants from observed traffic.
 *
 * @license Commercial
 */

import type { RequestSample, Invariant } from "../types.js";

const MIN_SAMPLES = 100; // Minimum samples for confidence
const MIN_CONFIDENCE = 0.9; // 90% consistency required

/**
 * Invariant discovery analyzer
 */
export class InvariantAnalyzer {
  /**
   * Analyze samples and discover invariants
   */
  analyze(samples: RequestSample[]): Invariant[] {
    if (samples.length < MIN_SAMPLES) {
      return [];
    }

    const invariants: Invariant[] = [];

    // 1. Detect identity <-> body equality (tenant binding)
    invariants.push(...this.detectIdentityBodyEquality(samples));

    // 2. Detect calculation patterns (totals)
    invariants.push(...this.detectCalculations(samples));

    // 3. Detect format patterns
    invariants.push(...this.detectFormatPatterns(samples));

    // Filter by minimum confidence
    return invariants.filter((i) => i.confidence >= MIN_CONFIDENCE);
  }

  private detectIdentityBodyEquality(samples: RequestSample[]): Invariant[] {
    const invariants: Invariant[] = [];

    // Find samples with both identity.tenant and body
    const withIdentity = samples.filter(
      (s) => s.identity?.tenant && s.body && typeof s.body === "object"
    );

    if (withIdentity.length < MIN_SAMPLES) {
      return invariants;
    }

    // Extract body fields that might match tenant
    const bodyFields = this.extractStringFields(withIdentity[0].body);

    for (const field of bodyFields) {
      const matches = withIdentity.filter((s) => {
        const bodyValue = this.getNestedValue(s.body, field);
        return bodyValue === s.identity?.tenant;
      });

      const confidence = matches.length / withIdentity.length;

      if (confidence >= MIN_CONFIDENCE) {
        invariants.push({
          id: `invariant.tenant.${field.replace(/\./g, "_")}`,
          type: "equality",
          fields: ["identity.tenant", `body.${field}`],
          expression: `identity.tenant == request.body.${field}`,
          evidence: `identity.tenant equals body.${field} in ${(confidence * 100).toFixed(1)}% of ${withIdentity.length} requests`,
          observedIn: withIdentity.length,
          violations: withIdentity.length - matches.length,
          confidence,
        });
      }
    }

    // Also check identity.subject matches
    const withSubject = samples.filter(
      (s) => s.identity?.subject && s.body && typeof s.body === "object"
    );

    if (withSubject.length >= MIN_SAMPLES) {
      for (const field of bodyFields) {
        const matches = withSubject.filter((s) => {
          const bodyValue = this.getNestedValue(s.body, field);
          return bodyValue === s.identity?.subject;
        });

        const confidence = matches.length / withSubject.length;

        if (confidence >= MIN_CONFIDENCE) {
          invariants.push({
            id: `invariant.subject.${field.replace(/\./g, "_")}`,
            type: "equality",
            fields: ["identity.subject", `body.${field}`],
            expression: `identity.subject == request.body.${field}`,
            evidence: `identity.subject equals body.${field} in ${(confidence * 100).toFixed(1)}% of ${withSubject.length} requests`,
            observedIn: withSubject.length,
            violations: withSubject.length - matches.length,
            confidence,
          });
        }
      }
    }

    return invariants;
  }

  private detectCalculations(samples: RequestSample[]): Invariant[] {
    const invariants: Invariant[] = [];

    // Look for: total == sum(items.map(i => i.price * i.qty))
    const withItems = samples.filter((s) => {
      const body = s.body as any;
      return (
        body?.items &&
        Array.isArray(body.items) &&
        body.items.length > 0 &&
        typeof body.total === "number"
      );
    });

    if (withItems.length < MIN_SAMPLES) {
      return invariants;
    }

    const matches = withItems.filter((s) => {
      const body = s.body as any;
      const calculated = body.items.reduce((sum: number, item: any) => {
        const price = item.price || item.unitPrice || item.amount || 0;
        const qty = item.qty || item.quantity || item.count || 1;
        return sum + price * qty;
      }, 0);

      // Allow small floating point tolerance
      return Math.abs(calculated - body.total) < 0.01;
    });

    const confidence = matches.length / withItems.length;

    if (confidence >= MIN_CONFIDENCE) {
      invariants.push({
        id: "invariant.total.calculation",
        type: "calculation",
        fields: ["body.total", "body.items[].price", "body.items[].qty"],
        expression:
          "request.body.total == request.body.items.map(i, i.price * i.qty).sum()",
        evidence: `total == sum(items.price * items.qty) in ${(confidence * 100).toFixed(1)}% of ${withItems.length} requests`,
        observedIn: withItems.length,
        violations: withItems.length - matches.length,
        confidence,
      });
    }

    return invariants;
  }

  private detectFormatPatterns(samples: RequestSample[]): Invariant[] {
    const invariants: Invariant[] = [];

    // Common format patterns
    const patterns: Array<{
      name: string;
      regex: RegExp;
      format: string;
    }> = [
      { name: "uuid", regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, format: "uuid" },
      { name: "email", regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, format: "email" },
      { name: "iso_date", regex: /^\d{4}-\d{2}-\d{2}$/, format: "date" },
      { name: "iso_datetime", regex: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, format: "date-time" },
    ];

    // Find string fields
    const samplesWithBody = samples.filter(
      (s) => s.body && typeof s.body === "object"
    );

    if (samplesWithBody.length < MIN_SAMPLES) {
      return invariants;
    }

    const stringFields = this.extractStringFields(samplesWithBody[0].body);

    for (const field of stringFields) {
      const values = samplesWithBody
        .map((s) => this.getNestedValue(s.body, field))
        .filter((v): v is string => typeof v === "string" && v.length > 0);

      if (values.length < MIN_SAMPLES) continue;

      for (const pattern of patterns) {
        const matches = values.filter((v) => pattern.regex.test(v));
        const confidence = matches.length / values.length;

        if (confidence >= MIN_CONFIDENCE) {
          invariants.push({
            id: `invariant.format.${field.replace(/\./g, "_")}.${pattern.name}`,
            type: "format",
            fields: [`body.${field}`],
            expression: `request.body.${field}.matches("${pattern.regex.source}")`,
            evidence: `body.${field} matches ${pattern.name} format in ${(confidence * 100).toFixed(1)}% of ${values.length} values`,
            observedIn: values.length,
            violations: values.length - matches.length,
            confidence,
          });
          break; // Only one format per field
        }
      }
    }

    return invariants;
  }

  private extractStringFields(body: unknown, prefix = ""): string[] {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return [];
    }

    const fields: string[] = [];

    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (typeof value === "string") {
        fields.push(path);
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        fields.push(...this.extractStringFields(value, path));
      }
    }

    return fields;
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    return path.split(".").reduce((current, key) => {
      if (current && typeof current === "object" && !Array.isArray(current)) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }
}
