export { contractshield, default } from "./plugin.js";
export { buildRequestContext } from "./context.js";
export type { ContractShieldOptions, ContractShieldDecoration } from "./types.js";

// Re-export common types from PDP for convenience
export type { Decision, RequestContext, PolicySet, RuleHit } from "@cshield/pdp";
