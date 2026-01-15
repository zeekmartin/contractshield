# Application Policy Guard (CEL-first)

This repo contains documentation, prompts, and examples for a portable **application-layer policy enforcement** system:
- **Contract-first**: OpenAPI/JSON Schema validation (positive security model).
- **Context-aware**: auth/scopes/tenant binding, limits, webhook verification.
- **Behavior-aware**: business invariants (CEL now; Rego/OPA later).
- **Portable**: adapters for Node.js and Java, with a shared policy model.

## Repository layout
- `docs/` design docs and standards
- `prompts/` LLM prompts for feature/refactor/bugfix/security review
- `examples/` worked examples using the prompts and docs
- `todo.md` roadmap

## Key concepts
- **PEP** (Policy Enforcement Point): runtime adapter (Express middleware, Spring filter).
- **PDP** (Policy Decision Point): shared policy decision engine.
- **Policy**: declarative rules (schemas + CEL invariants) versioned with Git.
