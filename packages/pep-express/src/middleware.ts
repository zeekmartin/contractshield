import type { Request, Response, NextFunction, RequestHandler } from "express";
import { evaluate, type PolicySet, type Decision } from "@cshield/pdp";
import { buildRequestContext } from "./context.js";
import type { ContractShieldOptions, ContractShieldRequest } from "./types.js";
import fs from "fs";
import path from "path";

/**
 * Express middleware for ContractShield policy enforcement.
 *
 * @example
 * ```typescript
 * import express from "express";
 * import { contractshield } from "@cshield/pep-express";
 *
 * const app = express();
 * app.use(express.json());
 * app.use(contractshield({ policy: "./policy.yaml" }));
 * ```
 */
export function contractshield(options: ContractShieldOptions): RequestHandler {
  const policy = loadPolicy(options.policy);
  const decisionHeader = options.decisionHeader ?? "X-ContractShield-Decision";

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ctx = buildRequestContext(req, options.identityExtractor);
      const decision = await evaluate(policy, ctx, options.pdpOptions);

      // Attach to request for downstream access (both new and legacy)
      const csReq = req as ContractShieldRequest;
      csReq.contractshield = { decision, context: ctx };
      csReq.guardrails = { decision, context: ctx }; // Backward compat

      // Set decision header
      res.setHeader(decisionHeader, decision.action);

      // Log decision
      if (options.logger) {
        options.logger(decision, req);
      } else if (process.env.NODE_ENV !== "production") {
        logDecision(decision, req);
      }

      // Enforce decision
      if (options.dryRun) {
        return next();
      }

      switch (decision.action) {
        case "ALLOW":
          return next();

        case "MONITOR":
          // Log but allow through
          return next();

        case "BLOCK":
          return sendBlockResponse(res, decision, options);

        case "CHALLENGE":
          // Future: implement challenge response
          return sendBlockResponse(res, decision, options);

        default:
          return next();
      }
    } catch (error) {
      // On error, fail-open by default (configurable)
      console.error("[contractshield] Error evaluating policy:", error);
      return next();
    }
  };
}

/** @deprecated Use contractshield() instead */
export const guardrails = contractshield;

function loadPolicy(policyOrPath: PolicySet | string): PolicySet {
  if (typeof policyOrPath === "object") {
    return policyOrPath;
  }

  const resolved = path.resolve(policyOrPath);
  const content = fs.readFileSync(resolved, "utf8");

  if (resolved.endsWith(".yaml") || resolved.endsWith(".yml")) {
    // Simple YAML parsing for basic cases
    // For production, use js-yaml
    return parseSimpleYaml(content) as PolicySet;
  }

  return JSON.parse(content) as PolicySet;
}

function parseSimpleYaml(content: string): unknown {
  // Minimal YAML parser for policy files
  // Handles basic key: value, arrays, and nested objects
  // For production, use js-yaml package
  try {
    // Try JSON first (YAML is superset of JSON)
    return JSON.parse(content);
  } catch {
    // Basic YAML parsing
    const lines = content.split("\n");
    const result: any = {};
    const stack: { obj: any; indent: number }[] = [{ obj: result, indent: -1 }];
    let currentArray: any[] | null = null;
    let currentArrayIndent = -1;

    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith("#")) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      // Handle array items
      if (trimmed.startsWith("- ")) {
        if (currentArray && indent === currentArrayIndent) {
          const value = trimmed.slice(2).trim();
          if (value.includes(":")) {
            const obj: any = {};
            const [k, v] = value.split(":").map((s) => s.trim());
            obj[k] = parseYamlValue(v);
            currentArray.push(obj);
          } else {
            currentArray.push(parseYamlValue(value));
          }
        }
        continue;
      }

      // Pop stack for decreased indent
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      currentArray = null;

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const rawValue = trimmed.slice(colonIdx + 1).trim();
      const parent = stack[stack.length - 1].obj;

      if (rawValue === "") {
        // Check if next non-empty line is array
        const nextLineIdx = lines.indexOf(line) + 1;
        const nextLine = lines.slice(nextLineIdx).find((l) => l.trim());
        if (nextLine?.trim().startsWith("- ")) {
          parent[key] = [];
          currentArray = parent[key];
          currentArrayIndent = nextLine.search(/\S/);
        } else {
          parent[key] = {};
          stack.push({ obj: parent[key], indent });
        }
      } else {
        parent[key] = parseYamlValue(rawValue);
      }
    }

    return result;
  }
}

function parseYamlValue(str: string): any {
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "null") return null;
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
  if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1);
  if (str.startsWith("'") && str.endsWith("'")) return str.slice(1, -1);
  return str;
}

function sendBlockResponse(
  res: Response,
  decision: Decision,
  options: ContractShieldOptions
): void {
  const statusCode = decision.statusCode || 403;
  const message = options.blockResponse?.message ?? "Request blocked by policy";

  const body: any = {
    error: message,
    reason: decision.reason,
  };

  if (options.blockResponse?.includeRuleHits && decision.ruleHits) {
    body.ruleHits = decision.ruleHits.map((h) => h.id);
  }

  res.status(statusCode).json(body);
}

function logDecision(decision: Decision, req: Request): void {
  const emoji = decision.action === "ALLOW" ? "✓" : decision.action === "BLOCK" ? "✗" : "⚠";
  console.log(
    `[contractshield] ${emoji} ${decision.action} ${req.method} ${req.path}`,
    decision.ruleHits?.length ? `(${decision.ruleHits.map((h) => h.id).join(", ")})` : ""
  );
}

/**
 * Express middleware to capture raw body for webhook signature verification.
 * Use before express.json() and contractshield().
 *
 * @example
 * ```typescript
 * app.use(rawBodyCapture());
 * app.use(express.json());
 * app.use(contractshield({ policy }));
 * ```
 */
export function rawBodyCapture(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      (req as any).rawBody = Buffer.concat(chunks);
    });
    next();
  };
}
