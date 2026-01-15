import Ajv from "ajv";
import addFormats from "ajv-formats";
import { PolicySet, PolicyRoute, RequestContext, RuleHit, PdpOptions } from "../types";

/**
 * Contract validation is schema-first.
 * v0.1 supports JSON Schema via AJV.
 */
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export async function validateContract(
  _policy: PolicySet,
  route: PolicyRoute,
  ctx: RequestContext,
  opts: PdpOptions
): Promise<RuleHit[]> {
  const hits: RuleHit[] = [];
  const contract = route.contract;
  if (!contract?.requestSchemaRef) return hits;

  const loader = opts.schemaLoader;
  if (!loader) return hits;

  const schema = await loader(contract.requestSchemaRef);
  const validate = ajv.compile(schema);

  const sample = ctx.request.body?.json?.sample;
  if (sample == null) return hits;

  const ok = validate(sample);
  if (!ok) {
    hits.push({
      id: "contract.schema.invalid",
      severity: "high",
      message: ajv.errorsText(validate.errors),
    });
  }

  if (contract.rejectUnknownFields === true && schema && schema.additionalProperties !== false) {
    hits.push({
      id: "contract.reject_unknown_fields",
      severity: "med",
      message: "Schema allows additionalProperties; set additionalProperties=false to reject unknown fields deterministically.",
    });
  }

  return hits;
}
