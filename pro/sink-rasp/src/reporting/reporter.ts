/**
 * RASP Event Reporter
 * Structured logging for SIEM integration
 */

import type { DetectEvent } from "../types.js";

export interface ReporterOptions {
  /** Custom logger function */
  logger?: (entry: LogEntry) => void;
  /** Redact sensitive data from logs */
  redactSensitive?: boolean;
  /** Maximum input length to log */
  maxInputLength?: number;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  event: {
    type: "rasp_detection";
    sink: string;
    operation: string;
    action: "blocked" | "monitored";
    reason: string;
    input?: string;
    requestId?: string;
  };
}

let reporterOptions: ReporterOptions = {
  redactSensitive: true,
  maxInputLength: 200,
};

/**
 * Configure the reporter
 */
export function configureReporter(options: ReporterOptions): void {
  reporterOptions = { ...reporterOptions, ...options };
}

/**
 * Redact potentially sensitive data
 */
function redactInput(input: string, maxLength: number): string {
  // Truncate
  let redacted = input.length > maxLength ? input.slice(0, maxLength) + "..." : input;

  // Redact common sensitive patterns
  redacted = redacted
    .replace(/password[=:]\S+/gi, "password=[REDACTED]")
    .replace(/secret[=:]\S+/gi, "secret=[REDACTED]")
    .replace(/token[=:]\S+/gi, "token=[REDACTED]")
    .replace(/api[_-]?key[=:]\S+/gi, "api_key=[REDACTED]")
    .replace(/bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/authorization[=:]\S+/gi, "authorization=[REDACTED]");

  return redacted;
}

/**
 * Report a RASP detection event
 */
export function report(event: DetectEvent): void {
  const { redactSensitive, maxInputLength, logger } = reporterOptions;

  const logEntry: LogEntry = {
    timestamp: event.timestamp.toISOString(),
    level: event.action === "blocked" ? "warn" : "info",
    message: `[ContractShield RASP] ${event.action}: ${event.sink}.${event.operation}`,
    event: {
      type: "rasp_detection",
      sink: event.sink,
      operation: event.operation,
      action: event.action,
      reason: event.reason,
      input: redactSensitive
        ? redactInput(event.input, maxInputLength || 200)
        : event.input.slice(0, maxInputLength || 200),
      requestId: event.requestId,
    },
  };

  if (logger) {
    logger(logEntry);
  } else {
    // Default: JSON to stdout
    console.log(JSON.stringify(logEntry));
  }
}

/**
 * Create a silent reporter for testing
 */
export function createSilentReporter(): ReporterOptions {
  const events: DetectEvent[] = [];
  return {
    logger: () => {},
    redactSensitive: false,
    maxInputLength: 1000,
  };
}

/**
 * Create a collecting reporter for testing
 */
export function createCollectingReporter(): {
  options: ReporterOptions;
  getEvents: () => LogEntry[];
  clear: () => void;
} {
  const events: LogEntry[] = [];
  return {
    options: {
      logger: (entry) => events.push(entry),
      redactSensitive: false,
      maxInputLength: 1000,
    },
    getEvents: () => [...events],
    clear: () => (events.length = 0),
  };
}
