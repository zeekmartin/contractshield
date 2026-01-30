package dev.contractshield.core;

/**
 * Represents a single validation error.
 *
 * @param path JSON path where the error occurred
 * @param message human-readable error message
 * @param type type of validation error
 */
public record ValidationError(String path, String message, ValidationErrorType type) {

    public static ValidationError schema(String path, String message) {
        return new ValidationError(path, message, ValidationErrorType.SCHEMA);
    }

    public static ValidationError cel(String path, String message) {
        return new ValidationError(path, message, ValidationErrorType.CEL);
    }

    public static ValidationError vulnerability(String path, String message) {
        return new ValidationError(path, message, ValidationErrorType.VULNERABILITY);
    }
}
