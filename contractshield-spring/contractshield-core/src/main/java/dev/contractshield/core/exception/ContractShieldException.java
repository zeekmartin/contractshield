package dev.contractshield.core.exception;

/**
 * Base exception for ContractShield errors.
 */
public class ContractShieldException extends RuntimeException {

    public ContractShieldException(String message) {
        super(message);
    }

    public ContractShieldException(String message, Throwable cause) {
        super(message, cause);
    }
}
