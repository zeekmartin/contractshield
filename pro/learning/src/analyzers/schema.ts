/**
 * ContractShield Learning Mode - Schema Analyzer
 *
 * Infers JSON Schema from observed request bodies.
 *
 * @license Commercial
 */

import type { RequestSample, InferredSchema } from "../types.js";

/**
 * Schema inference analyzer
 */
export class SchemaAnalyzer {
  /**
   * Analyze samples and infer JSON schema
   */
  analyze(samples: RequestSample[]): InferredSchema | null {
    if (samples.length === 0) return null;

    const bodies = samples
      .map((s) => s.body)
      .filter((b) => b !== undefined && b !== null);

    if (bodies.length === 0) return null;

    return this.inferSchema(bodies, bodies.length);
  }

  private inferSchema(values: unknown[], totalSamples: number): InferredSchema {
    const types = values.map((v) => this.getType(v));
    const typeCount = this.countTypes(types);
    const dominantType = this.getDominantType(typeCount);

    const schema: InferredSchema = {
      type: dominantType,
      observedIn: values.length,
      confidence: typeCount[dominantType] / values.length,
    };

    if (dominantType === "object") {
      const objects = values.filter(
        (v) => typeof v === "object" && v !== null && !Array.isArray(v)
      ) as Record<string, unknown>[];

      if (objects.length > 0) {
        schema.properties = this.inferObjectProperties(objects, totalSamples);
        schema.required = this.inferRequired(objects);
      }
    } else if (dominantType === "array") {
      const arrays = values.filter((v) => Array.isArray(v)) as unknown[][];
      const allItems = arrays.flat();

      if (allItems.length > 0) {
        schema.items = this.inferSchema(allItems, totalSamples);
      }
    }

    return schema;
  }

  private inferObjectProperties(
    objects: Record<string, unknown>[],
    totalSamples: number
  ): Record<string, InferredSchema> {
    const allKeys = new Set<string>();
    objects.forEach((obj) => Object.keys(obj).forEach((k) => allKeys.add(k)));

    const properties: Record<string, InferredSchema> = {};

    for (const key of allKeys) {
      const values = objects
        .map((obj) => obj[key])
        .filter((v) => v !== undefined);

      if (values.length > 0) {
        properties[key] = this.inferSchema(values, totalSamples);
      }
    }

    return properties;
  }

  private inferRequired(objects: Record<string, unknown>[]): string[] {
    if (objects.length === 0) return [];

    const allKeys = new Set<string>();
    objects.forEach((obj) => Object.keys(obj).forEach((k) => allKeys.add(k)));

    // A field is required if present in all samples
    return Array.from(allKeys).filter((key) =>
      objects.every(
        (obj) => key in obj && obj[key] !== undefined && obj[key] !== null
      )
    );
  }

  private getType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    if (typeof value === "number") {
      return Number.isInteger(value) ? "integer" : "number";
    }
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "string") return "string";
    if (typeof value === "object") return "object";
    return "unknown";
  }

  private countTypes(types: string[]): Record<string, number> {
    return types.reduce(
      (acc, t) => {
        acc[t] = (acc[t] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  private getDominantType(counts: Record<string, number>): string {
    // Merge integer and number as "number" for JSON Schema
    if (counts["integer"] && counts["number"]) {
      counts["number"] = (counts["number"] || 0) + counts["integer"];
      delete counts["integer"];
    }

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
}

/**
 * Convert inferred schema to JSON Schema format
 */
export function toJsonSchema(schema: InferredSchema): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: schema.type === "integer" ? "number" : schema.type,
  };

  if (schema.required?.length) {
    result.required = schema.required;
  }

  if (schema.properties) {
    result.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, toJsonSchema(v)])
    );
  }

  if (schema.items) {
    result.items = toJsonSchema(schema.items);
  }

  return result;
}
