/**
 * HTTP Egress Hooks
 * Intercepts http/https requests to prevent SSRF attacks
 */

import * as http from "http";
import * as https from "https";
import { analyzeUrl, isHostAllowed, isHostBlocked } from "../analyzers/urlAnalyzer.js";
import { report } from "../reporting/reporter.js";
import { getRequestContext } from "../context/asyncContext.js";
import type { SinkRaspOptions, BlockEvent, HttpEgressOptions } from "../types.js";

// Store original functions
const originalHttpRequest = http.request;
const originalHttpGet = http.get;
const originalHttpsRequest = https.request;
const originalHttpsGet = https.get;

// Store original fetch if it exists
const originalFetch = typeof globalThis.fetch === "function" ? globalThis.fetch : null;

let options: SinkRaspOptions | null = null;
let installed = false;

/**
 * Install HTTP hooks
 */
export function installHttpHooks(opts: SinkRaspOptions): void {
  if (installed) return;
  options = opts;

  const httpOptions = typeof opts.sinks?.httpEgress === "object"
    ? opts.sinks.httpEgress
    : {};

  // Hook http.request
  (http as any).request = function hookedHttpRequest(
    urlOrOptions: string | URL | http.RequestOptions,
    optionsOrCallback?: http.RequestOptions | ((res: http.IncomingMessage) => void),
    callback?: (res: http.IncomingMessage) => void
  ): http.ClientRequest {
    const url = extractUrl(urlOrOptions, "http:");
    const result = checkUrl(url, "http.request", httpOptions);

    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      throw error;
    }

    if (typeof optionsOrCallback === "function") {
      return originalHttpRequest.call(this, urlOrOptions as any, optionsOrCallback);
    }
    return originalHttpRequest.call(this, urlOrOptions as any, optionsOrCallback, callback);
  };

  // Hook http.get
  (http as any).get = function hookedHttpGet(
    urlOrOptions: string | URL | http.RequestOptions,
    optionsOrCallback?: http.RequestOptions | ((res: http.IncomingMessage) => void),
    callback?: (res: http.IncomingMessage) => void
  ): http.ClientRequest {
    const url = extractUrl(urlOrOptions, "http:");
    const result = checkUrl(url, "http.get", httpOptions);

    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      throw error;
    }

    if (typeof optionsOrCallback === "function") {
      return originalHttpGet.call(this, urlOrOptions as any, optionsOrCallback);
    }
    return originalHttpGet.call(this, urlOrOptions as any, optionsOrCallback, callback);
  };

  // Hook https.request
  (https as any).request = function hookedHttpsRequest(
    urlOrOptions: string | URL | https.RequestOptions,
    optionsOrCallback?: https.RequestOptions | ((res: http.IncomingMessage) => void),
    callback?: (res: http.IncomingMessage) => void
  ): http.ClientRequest {
    const url = extractUrl(urlOrOptions, "https:");
    const result = checkUrl(url, "https.request", httpOptions);

    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      throw error;
    }

    if (typeof optionsOrCallback === "function") {
      return originalHttpsRequest.call(this, urlOrOptions as any, optionsOrCallback);
    }
    return originalHttpsRequest.call(this, urlOrOptions as any, optionsOrCallback, callback);
  };

  // Hook https.get
  (https as any).get = function hookedHttpsGet(
    urlOrOptions: string | URL | https.RequestOptions,
    optionsOrCallback?: https.RequestOptions | ((res: http.IncomingMessage) => void),
    callback?: (res: http.IncomingMessage) => void
  ): http.ClientRequest {
    const url = extractUrl(urlOrOptions, "https:");
    const result = checkUrl(url, "https.get", httpOptions);

    if (result.blocked && options?.mode === "enforce") {
      const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
      (error as any).code = "EBLOCKED";
      throw error;
    }

    if (typeof optionsOrCallback === "function") {
      return originalHttpsGet.call(this, urlOrOptions as any, optionsOrCallback);
    }
    return originalHttpsGet.call(this, urlOrOptions as any, optionsOrCallback, callback);
  };

  // Hook global fetch if available
  if (originalFetch) {
    (globalThis as any).fetch = async function hookedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      const url = extractUrlFromFetch(input);
      const result = checkUrl(url, "fetch", httpOptions);

      if (result.blocked && options?.mode === "enforce") {
        const error = new Error(`[ContractShield] Blocked: ${result.reason}`);
        (error as any).code = "EBLOCKED";
        throw error;
      }

      return originalFetch!.call(this, input, init);
    };
  }

  installed = true;
}

/**
 * Uninstall HTTP hooks
 */
export function uninstallHttpHooks(): void {
  if (!installed) return;

  (http as any).request = originalHttpRequest;
  (http as any).get = originalHttpGet;
  (https as any).request = originalHttpsRequest;
  (https as any).get = originalHttpsGet;

  if (originalFetch) {
    (globalThis as any).fetch = originalFetch;
  }

  options = null;
  installed = false;
}

/**
 * Extract URL from various request option formats
 */
function extractUrl(
  urlOrOptions: string | URL | http.RequestOptions,
  defaultProtocol: string
): string {
  if (typeof urlOrOptions === "string") {
    return urlOrOptions;
  }

  if (urlOrOptions instanceof URL) {
    return urlOrOptions.toString();
  }

  // It's RequestOptions
  const opts = urlOrOptions;
  const protocol = opts.protocol || defaultProtocol;
  const hostname = opts.hostname || opts.host || "localhost";
  const port = opts.port ? `:${opts.port}` : "";
  const path = opts.path || "/";

  return `${protocol}//${hostname}${port}${path}`;
}

/**
 * Extract URL from fetch input
 */
function extractUrlFromFetch(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  // It's a Request object
  return input.url;
}

/**
 * Check a URL for SSRF vulnerabilities
 */
function checkUrl(
  url: string,
  operation: string,
  httpOptions: HttpEgressOptions
): { blocked: boolean; reason?: string } {
  if (!options) return { blocked: false };

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Check allowlist first
    const allowedHosts = [
      ...(options.allowlist?.hosts ?? []),
      ...(httpOptions.allowedHosts ?? []),
    ];
    if (allowedHosts.length > 0 && isHostAllowed(hostname, allowedHosts)) {
      return { blocked: false };
    }

    // Check blocklist
    const blockedHosts = httpOptions.blockedHosts ?? [];
    if (blockedHosts.length > 0 && isHostBlocked(hostname, blockedHosts)) {
      const event: BlockEvent = {
        timestamp: new Date(),
        sink: "http",
        operation,
        input: url.substring(0, 200),
        reason: `Host explicitly blocked: ${hostname}`,
        stack: new Error().stack || "",
        requestId: getRequestContext()?.requestId,
      };

      report({
        ...event,
        action: options.mode === "enforce" ? "blocked" : "monitored",
      });

      if (options.mode === "enforce" && options.onBlock) {
        options.onBlock(event);
      }
      if (options.onDetect) {
        options.onDetect({
          ...event,
          action: options.mode === "enforce" ? "blocked" : "monitored",
        });
      }

      return { blocked: true, reason: event.reason };
    }

    // Analyze URL
    const analysis = analyzeUrl(url, {
      blockPrivateIPs: httpOptions.blockPrivateIPs ?? true,
      blockMetadataEndpoints: httpOptions.blockMetadataEndpoints ?? true,
    });

    if (analysis.dangerous) {
      const event: BlockEvent = {
        timestamp: new Date(),
        sink: "http",
        operation,
        input: url.substring(0, 200),
        reason: analysis.reason,
        stack: new Error().stack || "",
        requestId: getRequestContext()?.requestId,
      };

      report({
        ...event,
        action: options.mode === "enforce" ? "blocked" : "monitored",
      });

      if (options.mode === "enforce" && options.onBlock) {
        options.onBlock(event);
      }
      if (options.onDetect) {
        options.onDetect({
          ...event,
          action: options.mode === "enforce" ? "blocked" : "monitored",
        });
      }

      return { blocked: true, reason: analysis.reason };
    }
  } catch {
    // Invalid URL - might be intentional attack
    const event: BlockEvent = {
      timestamp: new Date(),
      sink: "http",
      operation,
      input: url.substring(0, 200),
      reason: "Invalid URL format",
      stack: new Error().stack || "",
      requestId: getRequestContext()?.requestId,
    };

    report({
      ...event,
      action: options.mode === "enforce" ? "blocked" : "monitored",
    });

    // Don't block invalid URLs by default - let the underlying library handle it
  }

  return { blocked: false };
}

/**
 * Check if hooks are installed
 */
export function isInstalled(): boolean {
  return installed;
}
