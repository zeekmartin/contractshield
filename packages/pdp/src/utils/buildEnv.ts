import { RequestContext } from "../types";

/**
 * Build the CEL environment.
 * Keep this stable; it is the contract between policies and the engine.
 */
export function buildEnv(ctx: RequestContext): Record<string, any> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(ctx.request.headers ?? {})) {
    headers[k.toLowerCase()] = String(v);
  }

  return {
    request: {
      method: ctx.request.method,
      path: ctx.request.path,
      routeId: ctx.request.routeId,
      headers,
      contentType: ctx.request.contentType,
      body: {
        present: ctx.request.body?.present ?? false,
        sizeBytes: ctx.request.body?.sizeBytes ?? 0,
        json: { sample: ctx.request.body?.json?.sample },
      },
    },
    identity: {
      authenticated: ctx.identity?.authenticated ?? false,
      subject: ctx.identity?.subject ?? "",
      tenant: ctx.identity?.tenant ?? "",
      scopes: ctx.identity?.scopes ?? [],
      claims: ctx.identity?.claims ?? {},
    },
    client: {
      ip: ctx.client?.ip ?? "",
      userAgent: ctx.client?.userAgent ?? "",
    },
    runtime: {
      language: ctx.runtime?.language ?? "",
      service: ctx.runtime?.service ?? "",
      env: ctx.runtime?.env ?? "",
    },
    webhook: ctx.webhook ?? {},
  };
}
