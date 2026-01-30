package dev.contractshield.spring.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotation to validate request/response against a JSON Schema contract.
 * Can be applied to controller methods or classes.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidateContract {

    /**
     * Path to the JSON Schema file (classpath resource).
     * Example: "schemas/user.json"
     */
    String schema() default "";

    /**
     * OpenAPI operation ID to use for validation.
     * If specified, schema will be derived from the OpenAPI spec.
     */
    String operationId() default "";

    /**
     * Whether to validate the request body.
     */
    boolean validateRequest() default true;

    /**
     * Whether to validate the response body.
     */
    boolean validateResponse() default false;

    /**
     * Whether to scan for vulnerabilities.
     */
    boolean scanVulnerabilities() default true;
}
