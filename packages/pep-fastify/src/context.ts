import type { FastifyRequest } from "fastify";
import type { RequestContext } from "@contractshield/pdp";
import { createHash, randomUUID } from "crypto";

/**
 * Build a RequestContext from a Fastify request.
 */
export function buildRequestContext(
  request: FastifyRequest,
  identityExtractor?: (request: FastifyRequest) => RequestContext["identity"]
): RequestContext {
  const headers = normalizeHeaders(request.headers);
  const body = buildBody(request);

  const identity = identityExtractor
    ? identityExtractor(request)
    : extractDefaultIdentity(request);

  return {
    version: "0.1",
    id: request.id || headers["x-request-id"] || randomUUID(),
    timestamp: new Date().toISOString(),
    request: {
      method: request.method,
      path: request.url.split("?")[0], // Remove query string
      routeId: (request as any).routeId,
      headers,
      query: request.query as Record<string, unknown>,
      contentType: headers["content-type"] || "",
      body,
    },
    identity,
    client: {
      ip: request.ip || "",
      userAgent: headers["user-agent"] || "",
    },
    runtime: {
      language: "node",
      service: process.env.SERVICE_NAME || "unknown",
      env: process.env.NODE_ENV || "development",
    },
  };
}

function normalizeHeaders(headers: FastifyRequest["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result[key.toLowerCase()] = value;
    } else if (Array.isArray(value)) {
      result[key.toLowerCase()] = value.join(", ");
    }
  }
  return result;
}

function buildBody(request: FastifyRequest): RequestContext["request"]["body"] {
  const rawBody = (request as any).rawBody as Buffer | string | undefined;
  const hasBody = request.body !== undefined && request.body !== null;

  if (!hasBody && !rawBody) {
    return { present: false, sizeBytes: 0 };
  }

  let bodyBuffer: Buffer;
  if (rawBody) {
    bodyBuffer = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
  } else if (typeof request.body === "string") {
    bodyBuffer = Buffer.from(request.body);
  } else {
    bodyBuffer = Buffer.from(JSON.stringify(request.body || {}));
  }

  const sizeBytes = bodyBuffer.length;
  const sha256 = createHash("sha256").update(bodyBuffer).digest("hex");

  const result: RequestContext["request"]["body"] = {
    present: true,
    sizeBytes,
    sha256,
  };

  // Include raw body for webhook signature verification
  if (rawBody) {
    result.raw = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  }

  // Include JSON sample if body is JSON
  const contentType = request.headers["content-type"] || "";
  if (contentType.includes("application/json") && typeof request.body === "object") {
    result.json = {
      redacted: false,
      sample: request.body,
    };
  }

  return result;
}

function extractDefaultIdentity(request: FastifyRequest): RequestContext["identity"] {
  // Support common patterns: request.user, request.auth
  const user = (request as any).user || (request as any).auth;

  if (!user) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    subject: user.sub || user.id || user.userId || String(user),
    tenant: user.tenant || user.tenantId || user.org || user.orgId,
    scopes: user.scopes || user.scope?.split(" ") || [],
    claims: user,
  };
}
