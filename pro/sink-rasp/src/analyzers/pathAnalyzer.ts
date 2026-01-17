/**
 * Path Traversal Analyzer
 * Detects dangerous patterns in file paths
 */

import type { AnalysisResult } from "../types.js";

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\.\.\//, name: "dot_dot_slash" },
  { pattern: /\.\.\\/, name: "dot_dot_backslash" },
  { pattern: /%2e%2e%2f/i, name: "url_encoded_traversal" },
  { pattern: /%2e%2e\//i, name: "partial_url_encoded_1" },
  { pattern: /\.\.%2f/i, name: "partial_url_encoded_2" },
  { pattern: /%2e%2e%5c/i, name: "url_encoded_backslash" },
  { pattern: /\.\.%5c/i, name: "partial_url_encoded_backslash" },
  { pattern: /%c0%ae/i, name: "overlong_utf8_dot" },
  { pattern: /%c1%9c/i, name: "overlong_utf8_slash" },
  { pattern: /\x00/, name: "null_byte" },
];

// Sensitive paths that should never be accessed
const SENSITIVE_PATHS = [
  // Unix sensitive files
  "/etc/passwd",
  "/etc/shadow",
  "/etc/sudoers",
  "/etc/hosts",
  "/etc/ssh/",
  "/root/",
  "/home/",
  // Unix sensitive directories
  "/proc/",
  "/sys/",
  "/dev/",
  "/boot/",
  "/var/run/",
  "/var/log/auth",
  // Common secret locations
  "/.ssh/",
  "/.gnupg/",
  "/.aws/",
  "/.kube/",
  "/.docker/",
  "/.npmrc",
  "/.netrc",
  "/.env",
  ".env.local",
  ".env.production",
  // Windows sensitive paths
  "C:\\Windows\\System32\\",
  "C:\\Windows\\repair\\",
  "C:\\Windows\\debug\\",
  "C:\\Users\\",
  "C:\\ProgramData\\",
  // Application configs
  "/config/",
  "/secrets/",
  "/credentials/",
  "/private/",
];

/**
 * Analyze a file path for traversal vulnerabilities
 */
export function analyzePath(path: string): AnalysisResult {
  const foundPatterns: string[] = [];

  // Check for traversal patterns
  for (const { pattern, name } of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(path)) {
      foundPatterns.push(`traversal:${name}`);
    }
  }

  // Check for sensitive path access
  const normalizedPath = path.toLowerCase().replace(/\\/g, "/");
  for (const sensitive of SENSITIVE_PATHS) {
    const normalizedSensitive = sensitive.toLowerCase().replace(/\\/g, "/");
    if (normalizedPath.includes(normalizedSensitive)) {
      foundPatterns.push(`sensitive_path:${sensitive}`);
    }
  }

  if (foundPatterns.length > 0) {
    return {
      dangerous: true,
      reason: `Path traversal detected: ${foundPatterns.slice(0, 3).join(", ")}`,
      patterns: foundPatterns,
    };
  }

  return { dangerous: false, reason: "", patterns: [] };
}

/**
 * Check if a path is in the allowlist
 */
export function isPathAllowed(path: string, allowedPaths: string[]): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  return allowedPaths.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\\/g, "/");
    return normalizedPath.startsWith(normalizedAllowed);
  });
}

/**
 * Check if a path is explicitly blocked
 */
export function isPathBlocked(path: string, blockedPaths: string[]): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  return blockedPaths.some((blocked) => {
    const normalizedBlocked = blocked.replace(/\\/g, "/");
    return normalizedPath.startsWith(normalizedBlocked);
  });
}
