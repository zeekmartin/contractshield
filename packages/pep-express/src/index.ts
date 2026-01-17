export { contractshield, guardrails, rawBodyCapture } from "./middleware.js";
export { buildRequestContext } from "./context.js";
export {
  PolicyHotReloader,
  createPolicyLoader,
  type HotReloadOptions,
} from "./hotReload.js";
export type {
  ContractShieldOptions,
  ContractShieldRequest,
  // Backward compatibility aliases
  GuardrailsOptions,
  GuardrailsRequest
} from "./types.js";

// Re-export common types from PDP for convenience
export type { Decision, RequestContext, PolicySet, RuleHit } from "@contractshield/pdp";
