package dev.contractshield.core;

/**
 * Types of validation errors.
 */
public enum ValidationErrorType {
    /**
     * JSON Schema validation error.
     */
    SCHEMA,

    /**
     * CEL expression validation error.
     */
    CEL,

    /**
     * Vulnerability detected.
     */
    VULNERABILITY,

    /**
     * Vulnerability detected (alias).
     */
    VULNERABILITY_DETECTED,

    /**
     * CEL validation failed.
     */
    CEL_VALIDATION_FAILED,

    /**
     * Business rule violation.
     */
    BUSINESS_RULE
}
