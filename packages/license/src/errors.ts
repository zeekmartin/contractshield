/**
 * Error thrown when license verification fails.
 */
export class LicenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicenseError";
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LicenseError);
    }
  }
}
