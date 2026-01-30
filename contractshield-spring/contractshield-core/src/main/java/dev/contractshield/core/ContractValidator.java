package dev.contractshield.core;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.*;
import dev.contractshield.core.cel.CELEvaluator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

/**
 * JSON Schema validator with ContractShield extensions.
 * <p>
 * Supports:
 * <ul>
 *   <li>JSON Schema Draft 2020-12</li>
 *   <li>Custom formats (uuid, email, uri, date-time, etc.)</li>
 *   <li>CEL expressions via x-cel-expression extension</li>
 * </ul>
 */
public class ContractValidator {

    private static final Logger logger = LoggerFactory.getLogger(ContractValidator.class);

    private final JsonSchema schema;
    private final CELEvaluator celEvaluator;
    private final Map<String, String> celExpressions;
    private final ObjectMapper objectMapper;

    /**
     * Create a validator from a JSON Schema node.
     *
     * @param schemaNode the JSON Schema
     */
    public ContractValidator(JsonNode schemaNode) {
        this(schemaNode, new CELEvaluator());
    }

    /**
     * Create a validator from a JSON Schema node with a custom CEL evaluator.
     *
     * @param schemaNode the JSON Schema
     * @param celEvaluator the CEL evaluator to use
     */
    public ContractValidator(JsonNode schemaNode, CELEvaluator celEvaluator) {
        JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
        this.schema = factory.getSchema(schemaNode);
        this.celEvaluator = celEvaluator;
        this.celExpressions = extractCELExpressions(schemaNode);
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Create a validator from a JSON Schema string.
     *
     * @param schemaJson the JSON Schema as string
     */
    public ContractValidator(String schemaJson) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode schemaNode = mapper.readTree(schemaJson);
            JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);
            this.schema = factory.getSchema(schemaNode);
            this.celEvaluator = new CELEvaluator();
            this.celExpressions = extractCELExpressions(schemaNode);
            this.objectMapper = mapper;
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid JSON Schema", e);
        }
    }

    /**
     * Validate data against schema.
     *
     * @param data the data to validate
     * @return validation result
     */
    public ValidationResult validate(JsonNode data) {
        return validate(data, Collections.emptyMap());
    }

    /**
     * Validate data against schema with context for CEL expressions.
     *
     * @param data the data to validate
     * @param context variables available to CEL expressions
     * @return validation result
     */
    public ValidationResult validate(JsonNode data, Map<String, Object> context) {
        List<ValidationError> errors = new ArrayList<>();

        // JSON Schema validation
        Set<ValidationMessage> schemaErrors = schema.validate(data);
        for (ValidationMessage msg : schemaErrors) {
            errors.add(new ValidationError(
                    msg.getPath(),
                    msg.getMessage(),
                    ValidationErrorType.SCHEMA
            ));
        }

        // CEL expression validation (only if schema passes)
        if (errors.isEmpty() && !celExpressions.isEmpty()) {
            Map<String, Object> celContext = new HashMap<>(context);
            celContext.put("data", nodeToMap(data));

            for (Map.Entry<String, String> entry : celExpressions.entrySet()) {
                try {
                    boolean result = celEvaluator.evaluate(entry.getValue(), celContext);
                    if (!result) {
                        errors.add(new ValidationError(
                                entry.getKey(),
                                "CEL expression failed: " + entry.getValue(),
                                ValidationErrorType.CEL
                        ));
                    }
                } catch (Exception e) {
                    logger.warn("CEL evaluation error for expression '{}': {}", entry.getValue(), e.getMessage());
                    errors.add(new ValidationError(
                            entry.getKey(),
                            "CEL evaluation error: " + e.getMessage(),
                            ValidationErrorType.CEL
                    ));
                }
            }
        }

        return errors.isEmpty() ? ValidationResult.success() : ValidationResult.failure(errors);
    }

    /**
     * Validate a JSON string against the schema.
     *
     * @param jsonString the JSON string to validate
     * @return validation result
     */
    public ValidationResult validate(String jsonString) {
        try {
            JsonNode data = objectMapper.readTree(jsonString);
            return validate(data);
        } catch (Exception e) {
            return ValidationResult.failure(new ValidationError(
                    "$",
                    "Invalid JSON: " + e.getMessage(),
                    ValidationErrorType.SCHEMA
            ));
        }
    }

    /**
     * Extract CEL expressions from schema (x-cel-expression extension).
     */
    private Map<String, String> extractCELExpressions(JsonNode schemaNode) {
        Map<String, String> expressions = new HashMap<>();
        extractCELExpressionsRecursive(schemaNode, "$", expressions);
        return expressions;
    }

    private void extractCELExpressionsRecursive(JsonNode node, String path, Map<String, String> expressions) {
        if (node.has("x-cel-expression")) {
            expressions.put(path, node.get("x-cel-expression").asText());
        }

        if (node.has("properties")) {
            node.get("properties").fields().forEachRemaining(entry -> {
                String fieldPath = path + "." + entry.getKey();
                extractCELExpressionsRecursive(entry.getValue(), fieldPath, expressions);
            });
        }

        if (node.has("items")) {
            extractCELExpressionsRecursive(node.get("items"), path + "[]", expressions);
        }
    }

    /**
     * Convert JsonNode to Map for CEL evaluation.
     */
    @SuppressWarnings("unchecked")
    private Object nodeToMap(JsonNode node) {
        try {
            return objectMapper.convertValue(node, Object.class);
        } catch (Exception e) {
            return node.toString();
        }
    }
}
