/**
 * ContractShield Learning Mode
 *
 * Observes API traffic and suggests security rules.
 *
 * COMMERCIAL LICENSE REQUIRED
 *
 * @example
 * ```typescript
 * import { enableLearning, analyze, suggest } from '@contractshield/learning';
 *
 * // Enable learning on your middleware
 * enableLearning(shield, {
 *   sampleRate: 0.1,  // 10% sampling
 *   duration: '7d',
 * });
 *
 * // Later, generate suggestions
 * const output = await suggest();
 * console.log(output.suggestions);
 * ```
 *
 * @license Commercial
 */

import { requireLicense } from "@contractshield/license";
import { Collector } from "./collector/index.js";
import { FileStorage, type Storage } from "./storage/file.js";
import { analyzeRoute } from "./analyzers/index.js";
import { Suggester, formatYaml, formatJson } from "./suggester/index.js";
import type {
  LearningConfig,
  RequestContext,
  ResponseInfo,
  AnalysisResult,
  SuggestionsOutput,
  LearningStatus,
} from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

let collector: Collector | null = null;
let storage: Storage | null = null;
let currentConfig: LearningConfig | null = null;
let startedAt: string | null = null;

/**
 * Middleware hooks interface
 */
interface ContractShieldMiddleware {
  onAfterResponse?: (
    handler: (ctx: RequestContext, response: ResponseInfo) => void
  ) => void;
}

/**
 * Learning mode options
 */
export interface LearningOptions {
  /** License key (required) */
  licenseKey?: string;
  /** Sample rate 0.0-1.0 (default: 0.1) */
  sampleRate?: number;
  /** Learning duration (e.g., '7d', '24h') */
  duration?: string;
  /** Storage path */
  storagePath?: string;
  /** Routes to exclude */
  excludeRoutes?: string[];
  /** Additional fields to redact */
  redactFields?: string[];
  /** Enable encryption (default: false) */
  encryption?: boolean;
  /** Encryption key (required if encryption: true) */
  encryptionKey?: string;
}

/**
 * Enable learning mode on a ContractShield middleware
 *
 * @param shield - ContractShield middleware instance
 * @param options - Learning options
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { contractshield } from '@contractshield/pep-express';
 * import { enableLearning } from '@contractshield/learning';
 *
 * const app = express();
 * const shield = contractshield({ policy: './policy.yaml' });
 *
 * app.use(shield);
 *
 * enableLearning(shield, {
 *   licenseKey: process.env.CONTRACTSHIELD_LICENSE_KEY,
 *   sampleRate: 0.1,
 * });
 * ```
 */
export function enableLearning(
  shield: ContractShieldMiddleware,
  options: LearningOptions = {}
): void {
  // Verify license
  const licenseKey = options.licenseKey || process.env.CONTRACTSHIELD_LICENSE_KEY;
  if (licenseKey) {
    requireLicense(licenseKey, "learning");
  } else {
    console.warn(
      "[ContractShield Learning] No license key provided. " +
        "Learning mode requires a Pro license. " +
        "Get one at https://contractshield.dev/pricing"
    );
    return;
  }

  // Build config
  currentConfig = buildConfig(options);

  // Create storage
  storage = new FileStorage(currentConfig.storage);

  // Create collector
  collector = new Collector(currentConfig, storage);

  // Hook into middleware
  if (shield.onAfterResponse) {
    shield.onAfterResponse((ctx, response) => {
      collector?.collect(ctx, response);
    });
  } else {
    console.warn(
      "[ContractShield Learning] Middleware does not support onAfterResponse hook. " +
        "Learning mode may not collect samples."
    );
  }

  startedAt = new Date().toISOString();

  console.log(
    `[ContractShield Learning] Enabled (sample rate: ${currentConfig.sampleRate * 100}%)`
  );
}

/**
 * Disable learning mode
 */
export function disableLearning(): void {
  if (storage && "shutdown" in storage) {
    (storage as FileStorage).shutdown();
  }

  collector = null;
  storage = null;
  currentConfig = null;
  startedAt = null;

  console.log("[ContractShield Learning] Disabled");
}

/**
 * Get learning status
 */
export async function getStatus(): Promise<LearningStatus> {
  if (!storage || !currentConfig) {
    return {
      enabled: false,
      sampleRate: 0,
      samplesCollected: 0,
      routesObserved: 0,
      storageUsed: 0,
      storageMax: 0,
    };
  }

  const stats = await storage.getStats();
  const routes = await storage.getRoutes();
  const maxSize = parseSize(currentConfig.storage.maxSize);

  return {
    enabled: true,
    startedAt: startedAt || undefined,
    sampleRate: currentConfig.sampleRate,
    samplesCollected: stats.totalSamples,
    routesObserved: routes.length,
    storageUsed: stats.storageSize,
    storageMax: maxSize,
  };
}

/**
 * Analyze collected samples
 *
 * @param options - Override config options
 * @returns Analysis results per route
 */
export async function analyze(
  options: Partial<LearningConfig> = {}
): Promise<AnalysisResult[]> {
  const config = currentConfig
    ? { ...currentConfig, ...options }
    : buildConfig(options);

  const storageInstance = storage || new FileStorage(config.storage);
  const routes = await storageInstance.getRoutes();

  const results: AnalysisResult[] = [];

  for (const route of routes) {
    const samples = await storageInstance.getSamples(route);
    const result = analyzeRoute(route, samples, config);
    results.push(result);
  }

  return results;
}

/**
 * Generate suggestions from analysis
 *
 * @param options - Override config options
 * @returns Suggestions output
 */
export async function suggest(
  options: Partial<LearningConfig> = {}
): Promise<SuggestionsOutput> {
  const config = currentConfig
    ? { ...currentConfig, ...options }
    : buildConfig(options);

  const analyses = await analyze(config);
  const suggester = new Suggester(config);

  return suggester.generate(analyses);
}

/**
 * Manually collect a sample (for testing or custom integrations)
 */
export async function collectSample(
  ctx: RequestContext,
  response: ResponseInfo
): Promise<void> {
  if (collector) {
    await collector.collect(ctx, response);
  }
}

function buildConfig(options: Partial<LearningOptions> = {}): LearningConfig {
  return {
    ...DEFAULT_CONFIG,
    sampleRate: options.sampleRate ?? DEFAULT_CONFIG.sampleRate,
    duration: options.duration ?? DEFAULT_CONFIG.duration,
    excludeRoutes: options.excludeRoutes ?? DEFAULT_CONFIG.excludeRoutes,
    redactFields: options.redactFields ?? DEFAULT_CONFIG.redactFields,
    storage: {
      ...DEFAULT_CONFIG.storage,
      path: options.storagePath ?? DEFAULT_CONFIG.storage.path,
      encryption: options.encryption ?? DEFAULT_CONFIG.storage.encryption,
      encryptionKey: options.encryptionKey,
    },
  };
}

function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = (match[2] || "B").toUpperCase();

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * multipliers[unit]);
}

// Re-exports
export type {
  LearningConfig,
  RequestSample,
  RequestContext,
  ResponseInfo,
  AnalysisResult,
  Suggestion,
  SuggestionsOutput,
  LearningStatus,
  InferredSchema,
  Invariant,
  VulnerabilityPattern,
} from "./types.js";

export { DEFAULT_CONFIG } from "./types.js";
export { Collector, Sampler, Redactor } from "./collector/index.js";
export { FileStorage, type Storage } from "./storage/file.js";
export { SchemaAnalyzer, InvariantAnalyzer, VulnerabilityAnalyzer } from "./analyzers/index.js";
export { Suggester, formatYaml, formatJson } from "./suggester/index.js";
