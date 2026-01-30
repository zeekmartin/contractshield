package dev.contractshield.core;

import java.util.Collections;
import java.util.List;

/**
 * Result of contract validation.
 *
 * @param valid whether the validation passed
 * @param errors list of validation errors (empty if valid)
 */
public record ValidationResult(boolean valid, List<ValidationError> errors) {

    public static ValidationResult success() {
        return new ValidationResult(true, Collections.emptyList());
    }

    public static ValidationResult failure(List<ValidationError> errors) {
        return new ValidationResult(false, errors);
    }

    public static ValidationResult failure(ValidationError error) {
        return new ValidationResult(false, List.of(error));
    }
}
