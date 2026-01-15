# Example 01 — Feature iteration

Goal: add a rule that enforces `rejectUnknownFields=true` for selected routes and logs rule hits in monitor mode.

## Steps
1. Update policy to enable `rejectUnknownFields` on `license.activate.v1`.
2. Add a CEL invariant: `identity.tenant == request.body.json.sample.tenantId` (example).
3. Implement in PDP:
   - schema validation step
   - CEL eval step
4. Implement in PEP Node and PEP Java:
   - canonical RequestContext generation
   - enforcement mapping (BLOCK -> 403)
5. Add tests:
   - must allow valid request
   - must block request with extra fields
   - must block tenant mismatch
6. Rollout:
   - monitor 1 week
   - enforce only on `license.activate.v1`
