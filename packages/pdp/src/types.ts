export type Action = "ALLOW" | "BLOCK" | "MONITOR" | "CHALLENGE";

export type Severity = "low" | "med" | "high" | "critical";

export interface RuleHit {
  id: string;
  severity: Severity;
  message?: string;
}

export interface Risk {
  score: number; // 0..100
  level: "none" | "low" | "med" | "high" | "critical";
}

export interface RedactionDirective {
  path: string; // JSONPath-like selector
  action: "mask" | "hash" | "drop";
  priority?: number; // 0..1000
}

export interface Decision {
  version: "0.1";
  action: Action;
  statusCode: number;
  reason?: string;
  ruleHits?: RuleHit[];
  risk: Risk;
  redactions?: RedactionDirective[];
  metadata?: Record<string, unknown>;
}

export interface RequestBodyJson {
  redacted?: boolean;
  sample?: any; // intentionally "any" for v0.1, adapters control redaction
}

export interface RequestBody {
  present: boolean;
  sizeBytes: number;
  sha256?: string;
  raw?: string; // required for webhook signature verification
  json?: RequestBodyJson;
}

export interface RequestContext {
  version: "0.1";
  id?: string;
  timestamp?: string;

  request: {
    method: string;
    path: string;
    routeId?: string;
    headers?: Record<string, string>; // normalized lower-case keys
    query?: Record<string, unknown>;
    contentType?: string;
    body?: RequestBody;
  };

  identity?: {
    authenticated?: boolean;
    subject?: string;
    tenant?: string;
    scopes?: string[];
    claims?: Record<string, unknown>;
  };

  client?: {
    ip?: string;
    userAgent?: string;
  };

  runtime?: {
    language?: string;
    service?: string;
    env?: string;
  };

  webhook?: {
    provider?: "stripe";
    // optional evaluation hints for tests; real runtime will compute these
    signatureValid?: boolean;
    replayed?: boolean;
  };
}

export interface PolicySet {
  policyVersion: "0.1";
  defaults?: {
    mode?: "monitor" | "enforce";
    /** Action when no route matches. Default: "allow" (fail-open). */
    unmatchedRouteAction?: "allow" | "block" | "monitor";
    response?: { blockStatusCode?: number };
    limits?: {
      maxBodyBytes?: number;
      maxJsonDepth?: number;
      maxArrayLength?: number;
    };
    /** Global vulnerability checks. Runs before contract validation. */
    vulnerabilityChecks?: VulnerabilityChecksConfig;
  };
  routes: PolicyRoute[];
}

export interface PolicyRoute {
  id: string;
  match: { method: string; path: string };
  mode?: "monitor" | "enforce";
  contract?: {
    requestSchemaRef?: string;
    rejectUnknownFields?: boolean;
  };
  webhook?: {
    provider?: "stripe";
    requireRawBody?: boolean;
    toleranceSeconds?: number;
  };
  /** Per-route vulnerability check overrides. */
  vulnerability?: VulnerabilityChecksConfig;
  rules?: PolicyRule[];
  limits?: {
    maxBodyBytes?: number;
    maxJsonDepth?: number;
    maxArrayLength?: number;
  };
}

export type PolicyRuleType = "cel" | "webhook-signature" | "webhook-replay" | "contract" | "limits";

export interface PolicyRule {
  id: string;
  type: PolicyRuleType;
  action: "allow" | "monitor" | "block";
  severity?: Severity;
  config?: Record<string, unknown>;
}

export interface PdpOptions {
  /** Called by webhook signature verifier to retrieve Stripe secret for the given route/provider. */
  getSecret?: (args: { provider: "stripe"; routeId: string; ctx: RequestContext }) => string | undefined;
  /** Replay store for webhook events (e.g. Redis). */
  replayStore?: ReplayStore;
  /** Load external schemas by ref. */
  schemaLoader?: (ref: string) => Promise<any> | any;
  /** CEL evaluator implementation (pluggable). */
  celEvaluator?: CelEvaluator;
}

export interface ReplayStore {
  /** Returns true if this id was already seen (and records it if not). */
  checkAndStore(args: { provider: "stripe"; eventId: string; ttlSeconds: number }): Promise<boolean>;
}

export interface CelEvaluator {
  /** Evaluate a CEL expression against a context object. */
  eval(expr: string, env: Record<string, any>): boolean;
}

// ============================================================================
// Vulnerability Checks (v0.2)
// ============================================================================

/** Available vulnerability check types. */
export type VulnerabilityCheckType =
  | "prototypePollution"
  | "pathTraversal"
  | "ssrfInternal"
  | "commandInjection"
  | "nosqlInjection";

/** Global vulnerability check configuration in policy defaults. */
export interface VulnerabilityChecksConfig {
  /** Detect __proto__, constructor, prototype keys. Default: true */
  prototypePollution?: boolean;
  /** Detect ../ and encoded variants in strings. Default: true */
  pathTraversal?: boolean | { fields?: string[] };
  /** Detect internal IPs and dangerous protocols in URL fields. Default: true */
  ssrfInternal?: boolean | { fields?: string[] };
  /** Detect shell metacharacters. Default: false (opt-in) */
  commandInjection?: boolean | { fields?: string[] };
  /** Detect MongoDB operators ($gt, $where, etc). Default: false (opt-in) */
  nosqlInjection?: boolean;
}

/** Per-route vulnerability rule. */
export interface VulnerabilityRule {
  type: "vulnerability";
  /** Override or extend global vulnerability checks for this route. */
  checks?: VulnerabilityChecksConfig;
}
