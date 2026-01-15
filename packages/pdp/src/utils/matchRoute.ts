import { PolicyRoute } from "../types";

export function matchRoute(routes: PolicyRoute[], method: string, path: string, routeId?: string): PolicyRoute | null {
  // v0.1: exact match only; later: templates/prefix
  const m = routes.find(r => r.match.method === method && r.match.path === path);
  if (m) return m;
  if (routeId) {
    const byId = routes.find(r => r.id === routeId);
    if (byId) return byId;
  }
  return null;
}
