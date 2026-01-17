import type { Request } from "express";
import type { PolicySet, PdpOptions, Decision, RequestContext } from "@guardrails/pdp";

export interface GuardrailsOptions {
  /** Policy object or path to policy YAML/JSON file. */
  policy: PolicySet | string;

  /** PDP options (schemaLoader, celEvaluator, etc.). */
  pdpOptions?: PdpOptions;

  /** Extract identity from request. Default: uses req.user if available. */
  identityExtractor?: (req: Request) => RequestContext["identity"];

  /** Custom logger for decisions. Default: console.log in dev. */
  logger?: (decision: Decision, req: Request) => void;

  /** Skip enforcement and only log. Useful for gradual rollout. */
  dryRun?: boolean;

  /** Response body for blocked requests. */
  blockResponse?: {
    message?: string;
    includeRuleHits?: boolean;
  };

  /** Header name for decision info. Default: X-Guardrails-Decision */
  decisionHeader?: string;
}

export interface GuardrailsRequest extends Request {
  /** Guardrails decision attached by middleware. */
  guardrails?: {
    decision: Decision;
    context: RequestContext;
  };
}
