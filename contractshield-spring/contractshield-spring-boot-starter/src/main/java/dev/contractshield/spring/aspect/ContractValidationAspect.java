package dev.contractshield.spring.aspect;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.contractshield.core.ContractValidator;
import dev.contractshield.core.ValidationResult;
import dev.contractshield.core.cel.CELEvaluator;
import dev.contractshield.core.exception.ContractViolationException;
import dev.contractshield.core.vulnerability.VulnerabilityFinding;
import dev.contractshield.core.vulnerability.VulnerabilityScanner;
import dev.contractshield.spring.ContractShieldProperties;
import dev.contractshield.spring.annotation.CELExpression;
import dev.contractshield.spring.annotation.CELExpressions;
import dev.contractshield.spring.annotation.ValidateContract;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;

import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Aspect for processing @ValidateContract and @CELExpression annotations.
 */
@Aspect
public class ContractValidationAspect {

    private static final Logger logger = LoggerFactory.getLogger(ContractValidationAspect.class);

    private final ObjectMapper objectMapper;
    private final VulnerabilityScanner vulnerabilityScanner;
    private final CELEvaluator celEvaluator;
    private final ContractShieldProperties properties;
    private final Map<String, ContractValidator> validatorCache = new ConcurrentHashMap<>();

    public ContractValidationAspect(
            ObjectMapper objectMapper,
            VulnerabilityScanner vulnerabilityScanner,
            CELEvaluator celEvaluator,
            ContractShieldProperties properties) {
        this.objectMapper = objectMapper;
        this.vulnerabilityScanner = vulnerabilityScanner;
        this.celEvaluator = celEvaluator;
        this.properties = properties;
    }

    @Around("@annotation(validateContract) || @within(validateContract)")
    public Object validateContract(ProceedingJoinPoint joinPoint, ValidateContract validateContract) throws Throwable {
        if (!properties.isEnabled()) {
            return joinPoint.proceed();
        }

        // Get the actual annotation (method-level takes precedence)
        ValidateContract annotation = getAnnotation(joinPoint, ValidateContract.class);
        if (annotation == null) {
            annotation = validateContract;
        }

        Object requestBody = extractRequestBody(joinPoint);

        if (requestBody != null && annotation.validateRequest()) {
            JsonNode jsonNode = objectMapper.valueToTree(requestBody);

            // Vulnerability scanning
            if (annotation.scanVulnerabilities()) {
                List<VulnerabilityFinding> findings = vulnerabilityScanner.scan(jsonNode);
                if (!findings.isEmpty()) {
                    logger.warn("Vulnerabilities detected: {}", findings);
                    throw new ContractViolationException(
                            "Security vulnerabilities detected in request",
                            createVulnerabilityValidationResult(findings));
                }
            }

            // Schema validation
            if (!annotation.schema().isEmpty()) {
                ContractValidator validator = getOrCreateValidator(annotation.schema());
                ValidationResult result = validator.validate(jsonNode, createContext(joinPoint));
                if (!result.isValid()) {
                    throw new ContractViolationException("Contract validation failed", result);
                }
            }
        }

        // Process CEL expressions
        processCELExpressions(joinPoint, requestBody);

        // Proceed with the method
        Object response = joinPoint.proceed();

        // Response validation (if enabled)
        if (response != null && annotation.validateResponse() && !annotation.schema().isEmpty()) {
            JsonNode jsonNode = objectMapper.valueToTree(response);
            ContractValidator validator = getOrCreateValidator(annotation.schema());
            ValidationResult result = validator.validate(jsonNode, createContext(joinPoint));
            if (!result.isValid()) {
                logger.error("Response validation failed: {}", result.errors());
            }
        }

        return response;
    }

    @Around("@annotation(celExpression)")
    public Object validateCEL(ProceedingJoinPoint joinPoint, CELExpression celExpression) throws Throwable {
        if (!properties.isEnabled()) {
            return joinPoint.proceed();
        }

        Object requestBody = extractRequestBody(joinPoint);
        if (requestBody != null) {
            validateSingleCELExpression(celExpression, requestBody);
        }

        return joinPoint.proceed();
    }

    private void processCELExpressions(ProceedingJoinPoint joinPoint, Object requestBody) {
        if (requestBody == null) {
            return;
        }

        Method method = ((MethodSignature) joinPoint.getSignature()).getMethod();

        // Check for @CELExpressions container
        CELExpressions expressions = method.getAnnotation(CELExpressions.class);
        if (expressions != null) {
            for (CELExpression expr : expressions.value()) {
                validateSingleCELExpression(expr, requestBody);
            }
        }

        // Check for single @CELExpression (not already processed by validateCEL)
        CELExpression singleExpr = method.getAnnotation(CELExpression.class);
        if (singleExpr != null && expressions == null) {
            validateSingleCELExpression(singleExpr, requestBody);
        }
    }

    private void validateSingleCELExpression(CELExpression expr, Object requestBody) {
        Map<String, Object> context = new HashMap<>();
        context.put("data", objectMapper.convertValue(requestBody, Map.class));

        boolean result = celEvaluator.evaluate(expr.value(), context);
        if (!result) {
            List<dev.contractshield.core.ValidationError> errors = new ArrayList<>();
            errors.add(new dev.contractshield.core.ValidationError(
                    expr.field().isEmpty() ? "$" : expr.field(),
                    expr.message(),
                    dev.contractshield.core.ValidationErrorType.CEL_VALIDATION_FAILED));
            throw new ContractViolationException(expr.message(), new ValidationResult(false, errors));
        }
    }

    private <T extends java.lang.annotation.Annotation> T getAnnotation(ProceedingJoinPoint joinPoint, Class<T> annotationClass) {
        Method method = ((MethodSignature) joinPoint.getSignature()).getMethod();
        T annotation = method.getAnnotation(annotationClass);
        if (annotation == null) {
            annotation = joinPoint.getTarget().getClass().getAnnotation(annotationClass);
        }
        return annotation;
    }

    private Object extractRequestBody(ProceedingJoinPoint joinPoint) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Parameter[] parameters = signature.getMethod().getParameters();
        Object[] args = joinPoint.getArgs();

        for (int i = 0; i < parameters.length; i++) {
            if (parameters[i].isAnnotationPresent(org.springframework.web.bind.annotation.RequestBody.class)) {
                return args[i];
            }
        }

        // If no @RequestBody, return first non-primitive argument
        for (Object arg : args) {
            if (arg != null && !isPrimitive(arg.getClass())) {
                return arg;
            }
        }

        return null;
    }

    private boolean isPrimitive(Class<?> type) {
        return type.isPrimitive() ||
               type == String.class ||
               type == Integer.class ||
               type == Long.class ||
               type == Double.class ||
               type == Float.class ||
               type == Boolean.class ||
               type == Byte.class ||
               type == Short.class ||
               type == Character.class;
    }

    private ContractValidator getOrCreateValidator(String schemaPath) {
        return validatorCache.computeIfAbsent(schemaPath, path -> {
            try {
                ClassPathResource resource = new ClassPathResource(path);
                JsonNode schemaNode = objectMapper.readTree(resource.getInputStream());
                return new ContractValidator(schemaNode, celEvaluator);
            } catch (Exception e) {
                throw new RuntimeException("Failed to load schema: " + path, e);
            }
        });
    }

    private Map<String, Object> createContext(ProceedingJoinPoint joinPoint) {
        Map<String, Object> context = new HashMap<>();
        // Add any additional context needed for CEL evaluation
        return context;
    }

    private ValidationResult createVulnerabilityValidationResult(List<VulnerabilityFinding> findings) {
        List<dev.contractshield.core.ValidationError> errors = findings.stream()
                .map(f -> new dev.contractshield.core.ValidationError(
                        f.path(),
                        f.type().name() + ": " + f.message(),
                        dev.contractshield.core.ValidationErrorType.VULNERABILITY_DETECTED))
                .toList();
        return new ValidationResult(false, errors);
    }
}
