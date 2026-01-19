/**
 * Async Context Tracking
 * Links RASP events to HTTP requests using AsyncLocalStorage
 */

import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

export interface RequestContext {
  /** Unique request ID */
  requestId: string;
  /** Request path */
  path?: string;
  /** HTTP method */
  method?: string;
  /** Client IP */
  ip?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function within a request context
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current request context (if any)
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Set a value in the current request context
 */
export function setContextValue(key: string, value: unknown): void {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.metadata = store.metadata || {};
    store.metadata[key] = value;
  }
}

/**
 * Express middleware to automatically inject request context
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { expressContextMiddleware } from '@cshield/sink-rasp';
 *
 * const app = express();
 * app.use(expressContextMiddleware());
 * ```
 */
export function expressContextMiddleware() {
  return (req: any, res: any, next: () => void): void => {
    const context: RequestContext = {
      requestId: (req.headers["x-request-id"] as string) || randomUUID(),
      path: req.path,
      method: req.method,
      ip: req.ip || req.connection?.remoteAddress,
    };

    // Set request ID in response headers
    res.setHeader("X-Request-ID", context.requestId);

    runWithContext(context, next);
  };
}

/**
 * Fastify plugin to automatically inject request context
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import { fastifyContextPlugin } from '@cshield/sink-rasp';
 *
 * const fastify = Fastify();
 * fastify.register(fastifyContextPlugin);
 * ```
 */
export function fastifyContextPlugin(
  fastify: any,
  _options: Record<string, unknown>,
  done: () => void
): void {
  fastify.addHook("onRequest", (request: any, reply: any, hookDone: () => void) => {
    const context: RequestContext = {
      requestId: (request.headers["x-request-id"] as string) || randomUUID(),
      path: request.url,
      method: request.method,
      ip: request.ip,
    };

    reply.header("X-Request-ID", context.requestId);

    runWithContext(context, hookDone);
  });

  done();
}
