package dev.contractshield.spring.advice;

import dev.contractshield.core.exception.CELEvaluationException;
import dev.contractshield.core.exception.ContractShieldException;
import dev.contractshield.core.exception.ContractViolationException;
import dev.contractshield.spring.ContractShieldProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Global exception handler for ContractShield exceptions.
 */
@RestControllerAdvice
public class ContractShieldExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(ContractShieldExceptionHandler.class);

    private final ContractShieldProperties properties;

    public ContractShieldExceptionHandler(ContractShieldProperties properties) {
        this.properties = properties;
    }

    @ExceptionHandler(ContractViolationException.class)
    public ResponseEntity<Map<String, Object>> handleContractViolation(ContractViolationException ex) {
        logger.warn("Contract violation: {}", ex.getMessage());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "Contract Violation");
        body.put("code", "CONTRACT_VIOLATION");

        if (!properties.isSanitizeErrors()) {
            body.put("message", ex.getMessage());
            if (ex.getValidationResult() != null) {
                body.put("errors", ex.getValidationResult().errors());
            }
        }

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(CELEvaluationException.class)
    public ResponseEntity<Map<String, Object>> handleCELEvaluation(CELEvaluationException ex) {
        logger.warn("CEL evaluation error: {}", ex.getMessage());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "Validation Error");
        body.put("code", "CEL_EVALUATION_ERROR");

        if (!properties.isSanitizeErrors()) {
            body.put("message", ex.getMessage());
        }

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(ContractShieldException.class)
    public ResponseEntity<Map<String, Object>> handleContractShieldException(ContractShieldException ex) {
        logger.error("ContractShield error: {}", ex.getMessage(), ex);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "Security Error");
        body.put("code", "CONTRACTSHIELD_ERROR");

        if (!properties.isSanitizeErrors()) {
            body.put("message", ex.getMessage());
        }

        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }
}
