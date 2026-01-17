import type { Request } from "express";
import type { RequestContext } from "@guardrails/pdp";
import { createHash } from "crypto";

/**
 * Build a RequestContext from an Express request.
 */
export function buildRequestContext(
  req: Request,
  identityExtractor?: (req: Request) => RequestContext["identity"]
): RequestContext {
  const headers = normalizeHeaders(req.headers);
  const body = buildBody(req);

  const identity = identityExtractor
    ? identityExtractor(req)
    : extractDefaultIdentity(req);

  return {
    version: "0.1",
    id: req.get("x-request-id") || crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    request: {
      method: req.method,
      path: req.path,
      routeId: (req as any).routeId, // Can be set by app
      headers,
      query: req.query as Record<string, unknown>,
      contentType: req.get("content-type") || "",
      body,
    },
    identity,
    client: {
      ip: req.ip || req.socket?.remoteAddress || "",
      userAgent: req.get("user-agent") || "",
    },
    runtime: {
      language: "node",
      service: process.env.SERVICE_NAME || "unknown",
      env: process.env.NODE_ENV || "development",
    },
  };
}

function normalizeHeaders(headers: Request["headers"]): Record<string, string> {
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

function buildBody(req: Request): RequestContext["request"]["body"] {
  const rawBody = (req as any).rawBody as Buffer | undefined;
  const hasBody = req.body !== undefined && Object.keys(req.body || {}).length > 0;

  if (!hasBody && !rawBody) {
    return { present: false, sizeBytes: 0 };
  }

  const bodyBuffer = rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const sizeBytes = bodyBuffer.length;
  const sha256 = createHash("sha256").update(bodyBuffer).digest("hex");

  const result: RequestContext["request"]["body"] = {
    present: true,
    sizeBytes,
    sha256,
  };

  // Include raw body for webhook signature verification
  if (rawBody) {
    result.raw = rawBody.toString("utf8");
  }

  // Include JSON sample if body is JSON
  if (req.is("application/json") && req.body) {
    result.json = {
      redacted: false,
      sample: req.body,
    };
  }

  return result;
}

function extractDefaultIdentity(req: Request): RequestContext["identity"] {
  // Support common patterns: req.user, req.auth, req.session.user
  const user = (req as any).user || (req as any).auth || (req as any).session?.user;

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
