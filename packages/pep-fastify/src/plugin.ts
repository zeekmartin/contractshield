import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { evaluate, type PolicySet, type Decision } from "@cshield/pdp";
import { buildRequestContext } from "./context.js";
import type { ContractShieldOptions } from "./types.js";
import fs from "fs";
import path from "path";

/**
 * Fastify plugin for ContractShield policy enforcement.
 *
 * @example
 * ```typescript
 * import Fastify from "fastify";
 * import { contractshield } from "@cshield/pep-fastify";
 *
 * const fastify = Fastify();
 *
 * fastify.register(contractshield, {
 *   policy: "./policy.yaml",
 *   dryRun: process.env.NODE_ENV !== "production"
 * });
 * ```
 */
const contractshieldPlugin: FastifyPluginAsync<ContractShieldOptions> = async (fastify, options) => {
  const policy = loadPolicy(options.policy);
  const decisionHeader = options.decisionHeader ?? "X-ContractShield-Decision";
  const excludePaths = new Set(options.exclude || []);

  // Add preHandler hook for policy enforcement
  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip excluded paths
    const urlPath = request.url.split("?")[0];
    if (excludePaths.has(urlPath)) {
      return;
    }

    try {
      const ctx = buildRequestContext(request, options.identityExtractor);
      const decision = await evaluate(policy, ctx, options.pdpOptions);

      // Attach to request for downstream access
      request.contractshield = { decision, context: ctx };

      // Set decision header
      reply.header(decisionHeader, decision.action);

      // Log decision
      if (options.logger) {
        options.logger(decision, request);
      } else if (process.env.NODE_ENV !== "production") {
        logDecision(decision, request, fastify);
      }

      // Enforce decision
      if (options.dryRun) {
        return;
      }

      switch (decision.action) {
        case "ALLOW":
        case "MONITOR":
          return;

        case "BLOCK":
        case "CHALLENGE":
          return sendBlockResponse(reply, decision, options);

        default:
          return;
      }
    } catch (error) {
      // On error, fail-open by default
      fastify.log.error({ err: error }, "[contractshield] Error evaluating policy");
      return;
    }
  });
};

function loadPolicy(policyOrPath: PolicySet | string): PolicySet {
  if (typeof policyOrPath === "object") {
    return policyOrPath;
  }

  const resolved = path.resolve(policyOrPath);
  const content = fs.readFileSync(resolved, "utf8");

  if (resolved.endsWith(".yaml") || resolved.endsWith(".yml")) {
    return parseSimpleYaml(content) as PolicySet;
  }

  return JSON.parse(content) as PolicySet;
}

function parseSimpleYaml(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    // Basic YAML parsing (same as Express adapter)
    const lines = content.split("\n");
    const result: any = {};
    const stack: { obj: any; indent: number }[] = [{ obj: result, indent: -1 }];
    let currentArray: any[] | null = null;
    let currentArrayIndent = -1;

    for (const line of lines) {
      if (!line.trim() || line.trim().startsWith("#")) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();

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
  reply: FastifyReply,
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

  reply.status(statusCode).send(body);
}

function logDecision(decision: Decision, request: FastifyRequest, fastify: any): void {
  const emoji = decision.action === "ALLOW" ? "✓" : decision.action === "BLOCK" ? "✗" : "⚠";
  const ruleInfo = decision.ruleHits?.length
    ? `(${decision.ruleHits.map((h) => h.id).join(", ")})`
    : "";

  fastify.log.info(`[contractshield] ${emoji} ${decision.action} ${request.method} ${request.url} ${ruleInfo}`);
}

/**
 * Fastify plugin wrapped with fastify-plugin for proper encapsulation.
 */
export const contractshield = fp(contractshieldPlugin, {
  fastify: "4.x || 5.x",
  name: "@cshield/pep-fastify",
});

export default contractshield;
