/**
 * ContractShield Learning Mode - Collector
 *
 * Collects and stores request samples asynchronously.
 *
 * @license Commercial
 */

import * as crypto from "crypto";
import { Sampler } from "./sampler.js";
import { Redactor } from "./redactor.js";
import type { Storage } from "../storage/file.js";
import type { RequestSample, RequestContext, ResponseInfo, LearningConfig } from "../types.js";

/**
 * Request sample collector
 */
export class Collector {
  private sampler: Sampler;
  private redactor: Redactor;
  private storage: Storage;
  private config: LearningConfig;
  private excludePatterns: RegExp[];

  constructor(config: LearningConfig, storage: Storage) {
    this.config = config;
    this.storage = storage;
    this.sampler = new Sampler(config.sampleRate);
    this.redactor = new Redactor(config.redactFields);
    this.excludePatterns = this.compileExcludePatterns(config.excludeRoutes);
  }

  /**
   * Collect a request sample (async, non-blocking)
   *
   * @param ctx Request context from PEP
   * @param response Response info
   */
  async collect(ctx: RequestContext, response: ResponseInfo): Promise<void> {
    // 1. Check if we should sample this request
    if (!this.sampler.shouldSample()) {
      return;
    }

    // 2. Check if route is excluded
    if (this.isExcluded(ctx.request.path)) {
      return;
    }

    // 3. Create the sample
    const sample = this.createSample(ctx, response);

    // 4. Redact sensitive fields
    const redacted = this.redactSample(sample);

    // 5. Store asynchronously (fire-and-forget)
    setImmediate(() => {
      this.storage.store(redacted).catch((err) => {
        console.error("[ContractShield Learning] Storage error:", err.message);
      });
    });
  }

  /**
   * Get sampler statistics
   */
  getStats() {
    return this.sampler.getStats();
  }

  private compileExcludePatterns(routes: string[]): RegExp[] {
    return routes.map((pattern) => {
      // Convert glob-like patterns to regex
      if (pattern.endsWith("/*")) {
        const prefix = pattern.slice(0, -2).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`^${prefix}(/.*)?$`);
      }
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`^${prefix}.*$`);
      }
      // Exact match
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`^${escaped}$`);
    });
  }

  private isExcluded(path: string): boolean {
    return this.excludePatterns.some((regex) => regex.test(path));
  }

  private createSample(ctx: RequestContext, response: ResponseInfo): RequestSample {
    const route = `${ctx.request.method} ${ctx.request.routeId || ctx.request.path}`;

    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      route,
      method: ctx.request.method,
      path: ctx.request.path,
      pathParams: ctx.request.params,
      queryParams: ctx.request.query,
      body: ctx.request.body,
      identity: ctx.identity
        ? {
            authenticated: ctx.identity.authenticated,
            subject: ctx.identity.subject,
            tenant: ctx.identity.tenant,
            scopes: ctx.identity.scopes,
          }
        : undefined,
      response: {
        status: response.status,
        latency: response.latency,
      },
    };
  }

  private redactSample(sample: RequestSample): RequestSample {
    return {
      ...sample,
      body: sample.body ? this.redactor.redact(sample.body) : undefined,
      queryParams: sample.queryParams ? this.redactor.redact(sample.queryParams) : undefined,
      // Hash subject for privacy if present
      identity: sample.identity
        ? {
            ...sample.identity,
            subject: sample.identity.subject
              ? this.hashValue(sample.identity.subject)
              : undefined,
          }
        : undefined,
    };
  }

  private hashValue(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
  }
}

export { Sampler, type SamplerStats } from "./sampler.js";
export { Redactor, createRedactor } from "./redactor.js";
