/**
 * ContractShield Sink-aware RASP Types
 * @license Commercial - See ../LICENSE
 */

export interface SinkRaspOptions {
  /** License key (required) */
  licenseKey: string;

  /** Operation mode: 'monitor' logs only, 'enforce' blocks dangerous calls */
  mode: "monitor" | "enforce";

  /** Sinks to protect */
  sinks?: {
    commandExecution?: boolean | CommandExecutionOptions;
    filesystem?: boolean | FilesystemOptions;
    httpEgress?: boolean | HttpEgressOptions;
    sql?: boolean | SqlOptions;
    eval?: boolean;
  };

  /** Allowlist for known-safe operations */
  allowlist?: {
    /** Commands that are always allowed (e.g., ['git', 'node']) */
    commands?: string[];
    /** Paths that are always allowed (e.g., ['/tmp/', '/var/log/']) */
    paths?: string[];
    /** Hosts that are always allowed (e.g., ['api.stripe.com']) */
    hosts?: string[];
    /** SQL patterns that are always allowed */
    sqlPatterns?: string[];
  };

  /** Callback when a dangerous operation is blocked */
  onBlock?: (event: BlockEvent) => void;
  /** Callback when a dangerous operation is detected (blocked or monitored) */
  onDetect?: (event: DetectEvent) => void;
}

export interface CommandExecutionOptions {
  /** Commands that are always allowed */
  allowedCommands?: string[];
  /** Regex patterns that trigger blocking */
  blockedPatterns?: RegExp[];
}

export interface FilesystemOptions {
  /** Paths that are always allowed */
  allowedPaths?: string[];
  /** Paths that are always blocked */
  blockedPaths?: string[];
  /** Operations to monitor (default: all) */
  operations?: ("read" | "write" | "delete")[];
}

export interface HttpEgressOptions {
  /** Hosts that are always allowed */
  allowedHosts?: string[];
  /** Hosts that are always blocked */
  blockedHosts?: string[];
  /** Block requests to private IPs (default: true) */
  blockPrivateIPs?: boolean;
  /** Block cloud metadata endpoints (default: true) */
  blockMetadataEndpoints?: boolean;
}

export interface SqlOptions {
  /** Enable SQL injection detection */
  detectInjection?: boolean;
  /** Tables that are allowed to query */
  allowedTables?: string[];
}

export interface BlockEvent {
  /** Timestamp of the event */
  timestamp: Date;
  /** Sink type (e.g., 'child_process', 'fs', 'http') */
  sink: string;
  /** Operation (e.g., 'exec', 'readFile', 'request') */
  operation: string;
  /** Input value (truncated for safety) */
  input: string;
  /** Reason for blocking */
  reason: string;
  /** Stack trace */
  stack: string;
  /** Request ID if linked to an HTTP request */
  requestId?: string;
}

export interface DetectEvent extends BlockEvent {
  /** Action taken: 'blocked' or 'monitored' */
  action: "blocked" | "monitored";
}

export interface AnalysisResult {
  /** Whether the input is dangerous */
  dangerous: boolean;
  /** Human-readable reason */
  reason: string;
  /** Patterns that matched */
  patterns: string[];
}

export interface SinkRaspInstance {
  /** Check if RASP is active */
  isActive(): boolean;
  /** Get current mode */
  getMode(): "monitor" | "enforce";
  /** Manually check a command */
  checkCommand(command: string): AnalysisResult;
  /** Manually check a file path */
  checkPath(path: string): AnalysisResult;
  /** Manually check a URL */
  checkUrl(url: string): AnalysisResult;
  /** Shutdown RASP (uninstall hooks) */
  shutdown(): void;
}
