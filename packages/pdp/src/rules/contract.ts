import Ajv, { ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { PolicySet, PolicyRoute, RequestContext, RuleHit, PdpOptions } from "../types.js";

/**
 * Contract validation is schema-first.
 * v0.1 supports JSON Schema via AJV.
 */
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

/** Cache compiled schemas by ref to avoid recompilation on every request. */
const schemaCache = new Map<string, ValidateFunction>();

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

  const ref = contract.requestSchemaRef;
  let validate = schemaCache.get(ref);
  let schema: any;
  if (!validate) {
    schema = await loader(ref);
    validate = ajv.compile(schema);
    schemaCache.set(ref, validate);
  }

  const sample = ctx.request.body?.json?.sample;
  if (sample == null) return hits;

  if (typeof validate !== "function") return hits;
  const ok = validate(sample);
  if (!ok) {
    hits.push({
      id: "contract.schema.invalid",
      severity: "high",
      message: ajv.errorsText(validate.errors),
    });
  }

  // Check rejectUnknownFields only if we loaded the schema fresh
  if (contract.rejectUnknownFields === true && schema && schema.additionalProperties !== false) {
    hits.push({
      id: "contract.reject_unknown_fields",
      severity: "med",
      message: "Schema allows additionalProperties; set additionalProperties=false to reject unknown fields deterministically.",
    });
  }

  return hits;
}
