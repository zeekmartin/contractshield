import type { FastifyRequest, FastifyReply } from "fastify";
import type { PolicySet, PdpOptions, Decision, RequestContext } from "@contractshield/pdp";

export interface ContractShieldOptions {
  /** Policy object or path to policy YAML/JSON file. */
  policy: PolicySet | string;

  /** PDP options (schemaLoader, celEvaluator, replayStore, etc.). */
  pdpOptions?: PdpOptions;

  /** Extract identity from request. Default: uses request.user if available. */
  identityExtractor?: (request: FastifyRequest) => RequestContext["identity"];

  /** Custom logger for decisions. Default: uses fastify logger in dev. */
  logger?: (decision: Decision, request: FastifyRequest) => void;

  /** Skip enforcement and only log. Useful for gradual rollout. */
  dryRun?: boolean;

  /** Response body for blocked requests. */
  blockResponse?: {
    message?: string;
    includeRuleHits?: boolean;
  };

  /** Header name for decision info. Default: X-ContractShield-Decision */
  decisionHeader?: string;

  /** Paths to exclude from policy enforcement. */
  exclude?: string[];
}

export interface ContractShieldDecoration {
  /** ContractShield decision attached by plugin. */
  contractshield?: {
    decision: Decision;
    context: RequestContext;
  };
}

declare module "fastify" {
  interface FastifyRequest extends ContractShieldDecoration {}
}
