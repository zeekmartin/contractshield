package dev.contractshield.spring.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Repeatable;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Annotation to add CEL (Common Expression Language) validation rules.
 * Can be repeated to add multiple rules.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Repeatable(CELExpressions.class)
public @interface CELExpression {

    /**
     * The CEL expression to evaluate.
     * The request body is available as 'data' in the expression context.
     * Example: "data.age >= 18"
     */
    String value();

    /**
     * Error message to return if the expression evaluates to false.
     */
    String message() default "CEL validation failed";

    /**
     * Field path this rule applies to (for error reporting).
     */
    String field() default "";
}
