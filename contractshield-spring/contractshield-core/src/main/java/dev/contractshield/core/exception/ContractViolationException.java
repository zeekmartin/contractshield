package dev.contractshield.core.exception;

import dev.contractshield.core.ValidationResult;

/**
 * Exception thrown when contract validation fails.
 */
public class ContractViolationException extends ContractShieldException {

    private final ValidationResult validationResult;

    public ContractViolationException(String message, ValidationResult validationResult) {
        super(message);
        this.validationResult = validationResult;
    }

    public ValidationResult getValidationResult() {
        return validationResult;
    }
}
