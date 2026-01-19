/**
 * ContractShield Learning Mode - Redactor
 *
 * Automatically redacts sensitive fields from request samples.
 * Uses simple pattern matching (no external dependencies).
 *
 * @license Commercial
 */

/**
 * Built-in sensitive field patterns (always redacted)
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "passwd",
  "pwd",
  "token",
  "secret",
  "apikey",
  "api_key",
  "api-key",
  "authorization",
  "auth",
  "bearer",
  "credential",
  "credentials",
  "creditcard",
  "credit_card",
  "credit-card",
  "cardnumber",
  "card_number",
  "cvv",
  "cvc",
  "ssn",
  "social_security",
  "private_key",
  "privatekey",
  "private-key",
  "session",
  "sessionid",
  "session_id",
  "cookie",
  "jwt",
  "refresh_token",
  "access_token",
  "id_token",
]);

/**
 * Headers that should NEVER be stored
 */
const FORBIDDEN_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
  "x-session-id",
]);

const REDACTED = "[REDACTED]";

/**
 * Redactor for sensitive data
 */
export class Redactor {
  private customPatterns: string[];

  /**
   * Create a new redactor
   * @param customPatterns Additional field names/patterns to redact
   */
  constructor(customPatterns: string[] = []) {
    this.customPatterns = customPatterns.map((p) => p.toLowerCase());
  }

  /**
   * Redact sensitive data from an object
   * @param obj Object to redact
   * @returns Redacted copy of the object
   */
  redact<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== "object") {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redact(item)) as T;
    }

    return this.redactObject(obj as Record<string, unknown>) as T;
  }

  /**
   * Redact headers, removing forbidden ones entirely
   * @param headers Headers object
   * @returns Sanitized headers
   */
  redactHeaders(headers: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();

      // Skip forbidden headers entirely
      if (FORBIDDEN_HEADERS.has(lowerKey)) {
        continue;
      }

      // Redact sensitive header values
      if (this.shouldRedactKey(lowerKey)) {
        result[key] = REDACTED;
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private redactObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.shouldRedactKey(key)) {
        result[key] = REDACTED;
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === "object" && item !== null ? this.redact(item) : item
        );
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.redactObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  private shouldRedactKey(key: string): boolean {
    const lowerKey = key.toLowerCase();

    // Check built-in sensitive keys
    if (SENSITIVE_KEYS.has(lowerKey)) {
      return true;
    }

    // Check if key contains sensitive substrings
    for (const sensitive of SENSITIVE_KEYS) {
      if (lowerKey.includes(sensitive)) {
        return true;
      }
    }

    // Check custom patterns
    for (const pattern of this.customPatterns) {
      if (lowerKey === pattern || lowerKey.includes(pattern)) {
        return true;
      }
    }

    return false;
  }
}

/**
 * Create a redactor with default settings
 * @param customPatterns Additional patterns to redact
 */
export function createRedactor(customPatterns: string[] = []): Redactor {
  return new Redactor(customPatterns);
}
