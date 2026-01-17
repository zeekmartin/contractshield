export { guardrails, rawBodyCapture } from "./middleware.js";
export { buildRequestContext } from "./context.js";
export type { GuardrailsOptions, GuardrailsRequest } from "./types.js";

// Re-export common types from PDP for convenience
export type { Decision, RequestContext, PolicySet, RuleHit } from "@guardrails/pdp";
