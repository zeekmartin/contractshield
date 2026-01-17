/**
 * URL/SSRF Analyzer
 * Detects Server-Side Request Forgery attempts
 */

import type { AnalysisResult } from "../types.js";

// Private IP ranges (RFC 1918 + others)
const PRIVATE_IP_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^127\./, name: "loopback" },
  { pattern: /^10\./, name: "class_a_private" },
  { pattern: /^172\.(1[6-9]|2[0-9]|3[0-1])\./, name: "class_b_private" },
  { pattern: /^192\.168\./, name: "class_c_private" },
  { pattern: /^169\.254\./, name: "link_local" },
  { pattern: /^0\./, name: "current_network" },
  { pattern: /^localhost$/i, name: "localhost" },
  { pattern: /^0\.0\.0\.0$/, name: "any_address" },
  { pattern: /^\[?::1\]?$/, name: "ipv6_loopback" },
  { pattern: /^\[?fe80:/i, name: "ipv6_link_local" },
  { pattern: /^\[?fc00:/i, name: "ipv6_unique_local" },
  { pattern: /^\[?fd00:/i, name: "ipv6_unique_local_2" },
];

// Cloud metadata endpoints (SSRF targets)
const METADATA_ENDPOINTS = new Set([
  // AWS
  "169.254.169.254",
  "fd00:ec2::254",
  // GCP
  "metadata.google.internal",
  "metadata.gcp.internal",
  // Azure
  "169.254.169.254",
  // Alibaba Cloud
  "100.100.100.200",
  // DigitalOcean
  "169.254.169.254",
  // Oracle Cloud
  "169.254.169.254",
  // Kubernetes
  "kubernetes.default.svc",
  "kubernetes.default",
]);

// Dangerous protocols
const DANGEROUS_PROTOCOLS = new Set([
  "file:",
  "gopher:",
  "dict:",
  "ftp:",
  "ldap:",
  "ldaps:",
  "tftp:",
  "sftp:",
  "jar:",
  "netdoc:",
]);

/**
 * Analyze a URL for SSRF vulnerabilities
 */
export function analyzeUrl(
  url: string,
  options: { blockPrivateIPs?: boolean; blockMetadataEndpoints?: boolean } = {}
): AnalysisResult {
  const { blockPrivateIPs = true, blockMetadataEndpoints = true } = options;
  const foundPatterns: string[] = [];

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Check for dangerous protocols
    if (DANGEROUS_PROTOCOLS.has(parsed.protocol)) {
      foundPatterns.push(`dangerous_protocol:${parsed.protocol}`);
    }

    // Check for private IPs
    if (blockPrivateIPs) {
      for (const { pattern, name } of PRIVATE_IP_PATTERNS) {
        if (pattern.test(hostname)) {
          foundPatterns.push(`private_ip:${name}`);
          break;
        }
      }
    }

    // Check for metadata endpoints
    if (blockMetadataEndpoints && METADATA_ENDPOINTS.has(hostname)) {
      foundPatterns.push(`metadata_endpoint:${hostname}`);
    }

    // Check for DNS rebinding via octal/hex notation
    if (/^0[0-7]+\./.test(hostname) || /^0x[0-9a-f]+/i.test(hostname)) {
      foundPatterns.push("suspicious_ip_notation");
    }

    // Check for unicode homograph attacks
    if (/[^\x00-\x7F]/.test(hostname)) {
      foundPatterns.push("unicode_hostname");
    }
  } catch {
    // Invalid URL - might be intentional, flag it
    foundPatterns.push("invalid_url");
  }

  if (foundPatterns.length > 0) {
    return {
      dangerous: true,
      reason: `SSRF detected: ${foundPatterns.slice(0, 3).join(", ")}`,
      patterns: foundPatterns,
    };
  }

  return { dangerous: false, reason: "", patterns: [] };
}

/**
 * Check if a hostname is in the allowlist
 */
export function isHostAllowed(hostname: string, allowedHosts: string[]): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const normalizedAllowed = allowed.toLowerCase();
    // Support wildcard matching (e.g., *.amazonaws.com)
    if (normalizedAllowed.startsWith("*.")) {
      const domain = normalizedAllowed.slice(2);
      return (
        normalizedHostname === domain ||
        normalizedHostname.endsWith("." + domain)
      );
    }
    return normalizedHostname === normalizedAllowed;
  });
}

/**
 * Check if a hostname is explicitly blocked
 */
export function isHostBlocked(hostname: string, blockedHosts: string[]): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return blockedHosts.some((blocked) => {
    const normalizedBlocked = blocked.toLowerCase();
    if (normalizedBlocked.startsWith("*.")) {
      const domain = normalizedBlocked.slice(2);
      return (
        normalizedHostname === domain ||
        normalizedHostname.endsWith("." + domain)
      );
    }
    return normalizedHostname === normalizedBlocked;
  });
}
