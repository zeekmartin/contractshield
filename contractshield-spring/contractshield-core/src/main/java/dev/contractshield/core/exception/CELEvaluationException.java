package dev.contractshield.core.exception;

/**
 * Exception thrown when CEL expression evaluation fails.
 */
public class CELEvaluationException extends ContractShieldException {

    public CELEvaluationException(String message) {
        super(message);
    }

    public CELEvaluationException(String message, Throwable cause) {
        super(message, cause);
    }
}
