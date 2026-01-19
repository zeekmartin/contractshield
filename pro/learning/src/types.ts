/**
 * ContractShield Learning Mode - Types
 *
 * @license Commercial
 */

/**
 * Learning Mode configuration
 */
export interface LearningConfig {
  /** Enable learning mode */
  enabled: boolean;
  /** Learning duration (e.g., '7d', '24h') */
  duration: string;
  /** Sample rate 0.0-1.0 (default: 0.1 = 10%) */
  sampleRate: number;
  /** Output path for generated suggestions */
  output: string;
  /** Minimum confidence for suggestions (0.0-1.0) */
  minConfidence: number;
  /** Routes to exclude from learning */
  excludeRoutes: string[];
  /** Additional fields to redact */
  redactFields: string[];
  /** Analyzers to enable */
  analyzers: AnalyzerConfig;
  /** Storage options */
  storage: StorageOptions;
}

/**
 * Storage options (v1: File only)
 */
export interface StorageOptions {
  /** Storage directory path */
  path: string;
  /** Retention TTL in seconds (default: 7 days) */
  ttl: number;
  /** Maximum storage size (e.g., '500MB') */
  maxSize: string;
  /** Maximum samples per route */
  maxSamplesPerRoute: number;
  /** Enable encryption (default: false) */
  encryption?: boolean;
  /** Encryption key (required if encryption: true) */
  encryptionKey?: string;
}

/**
 * Analyzer configuration
 */
export interface AnalyzerConfig {
  schemaInference: boolean;
  rangeDetection: boolean;
  invariantDiscovery: boolean;
  anomalyDetection: boolean;
  vulnerabilityScanning: boolean;
}

/**
 * Collected request sample
 */
export interface RequestSample {
  /** Unique sample ID */
  id: string;
  /** Timestamp ISO string */
  timestamp: string;
  /** Route identifier (e.g., 'POST /orders') */
  route: string;
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Path parameters */
  pathParams?: Record<string, string>;
  /** Query parameters */
  queryParams?: Record<string, unknown>;
  /** Request body (redacted) */
  body?: unknown;
  /** Identity info */
  identity?: {
    authenticated?: boolean;
    subject?: string;
    tenant?: string;
    scopes?: string[];
  };
  /** Response info */
  response?: {
    status: number;
    latency: number;
  };
}

/**
 * Response info for collector
 */
export interface ResponseInfo {
  status: number;
  latency: number;
}

/**
 * Request context (from PEP)
 */
export interface RequestContext {
  id?: string;
  request: {
    method: string;
    path: string;
    routeId?: string;
    params?: Record<string, string>;
    query?: Record<string, unknown>;
    body?: unknown;
  };
  identity?: {
    authenticated?: boolean;
    subject?: string;
    tenant?: string;
    scopes?: string[];
  };
}

/**
 * Analysis result for a route
 */
export interface AnalysisResult {
  route: string;
  sampleCount: number;
  period: { start: string; end: string };
  schema?: InferredSchema;
  ranges?: FieldRange[];
  invariants?: Invariant[];
  anomalies?: Anomaly[];
  vulnerabilities?: VulnerabilityPattern[];
}

/**
 * Inferred JSON schema
 */
export interface InferredSchema {
  type: string;
  properties?: Record<string, InferredSchema>;
  items?: InferredSchema;
  required?: string[];
  observedIn: number;
  confidence: number;
}

/**
 * Field range statistics
 */
export interface FieldRange {
  field: string;
  type: "number" | "string" | "array";
  stats: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  observedIn: number;
  confidence: number;
}

/**
 * Discovered invariant
 */
export interface Invariant {
  id: string;
  type: "equality" | "subset" | "calculation" | "format";
  fields: string[];
  expression: string;
  evidence: string;
  observedIn: number;
  violations: number;
  confidence: number;
}

/**
 * Detected anomaly
 */
export interface Anomaly {
  type: "outlier" | "suspicious" | "attack";
  severity: "low" | "medium" | "high" | "critical";
  field?: string;
  pattern: string;
  samples: string[];
  evidence: string;
}

/**
 * Detected vulnerability pattern
 */
export interface VulnerabilityPattern {
  type: "prototype-pollution" | "path-traversal" | "ssrf" | "injection" | "nosql";
  severity: "critical" | "high";
  field: string;
  sampleIds: string[];
  evidence: string;
}

/**
 * Generated suggestion
 */
export interface Suggestion {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  category: "vulnerability" | "business-logic" | "schema" | "range";
  route?: string;
  evidence: string;
  recommendation: string;
  suggested: {
    type: "vulnerability" | "cel" | "contract" | "limit";
    action?: "block" | "monitor";
    config: unknown;
  };
}

/**
 * Suggestions output
 */
export interface SuggestionsOutput {
  metadata: {
    version: string;
    generated: string;
    period: { start: string; end: string };
    stats: {
      totalRequests: number;
      sampledRequests: number;
      routesObserved: number;
      suggestionsGenerated: number;
    };
  };
  suggestions: Suggestion[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    byCategory: Record<string, number>;
  };
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalSamples: number;
  byRoute: Record<string, number>;
  oldestSample: string;
  newestSample: string;
  storageSize: number;
}

/**
 * Learning status
 */
export interface LearningStatus {
  enabled: boolean;
  startedAt?: string;
  sampleRate: number;
  samplesCollected: number;
  routesObserved: number;
  storageUsed: number;
  storageMax: number;
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: LearningConfig = {
  enabled: false,
  duration: "7d",
  sampleRate: 0.1,
  output: "./suggested-rules.yaml",
  minConfidence: 0.8,
  excludeRoutes: ["/health", "/metrics", "/ready", "/live"],
  redactFields: [],
  analyzers: {
    schemaInference: true,
    rangeDetection: true,
    invariantDiscovery: true,
    anomalyDetection: true,
    vulnerabilityScanning: true,
  },
  storage: {
    path: ".contractshield/learning",
    ttl: 7 * 24 * 60 * 60, // 7 days
    maxSize: "500MB",
    maxSamplesPerRoute: 10000,
    encryption: false,
  },
};
