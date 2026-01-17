import type { Request } from "express";
import type { PolicySet, PdpOptions, Decision, RequestContext } from "@contractshield/pdp";

export interface ContractShieldOptions {
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

  /** Header name for decision info. Default: X-ContractShield-Decision */
  decisionHeader?: string;
}

export interface ContractShieldRequest extends Request {
  /** ContractShield decision attached by middleware. */
  contractshield?: {
    decision: Decision;
    context: RequestContext;
  };
  /** @deprecated Use contractshield instead. Alias for backward compatibility. */
  guardrails?: {
    decision: Decision;
    context: RequestContext;
  };
}

// Backward compatibility aliases
/** @deprecated Use ContractShieldOptions instead */
export type GuardrailsOptions = ContractShieldOptions;
/** @deprecated Use ContractShieldRequest instead */
export type GuardrailsRequest = ContractShieldRequest;
