package dev.contractshield.core.cel;

import dev.contractshield.core.exception.CELEvaluationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Common Expression Language evaluator.
 * <p>
 * Supports a safe subset of CEL expressions for policy evaluation.
 * <p>
 * Supported patterns:
 * <ul>
 *   <li>{@code data.field == value}</li>
 *   <li>{@code data.field != value}</li>
 *   <li>{@code data.field > value} (numeric)</li>
 *   <li>{@code data.field >= value} (numeric)</li>
 *   <li>{@code data.field < value} (numeric)</li>
 *   <li>{@code data.field <= value} (numeric)</li>
 *   <li>{@code data.field in [values]}</li>
 *   <li>{@code size(data.field) <= value}</li>
 *   <li>Compound expressions with {@code &&} and {@code ||}</li>
 * </ul>
 */
public class CELEvaluator {

    private static final Logger logger = LoggerFactory.getLogger(CELEvaluator.class);

    // Pattern matchers for supported expressions
    private static final Pattern EQUALITY_PATTERN = Pattern.compile("^([\\w.\\[\\]]+)\\s*==\\s*(.+)$");
    private static final Pattern INEQUALITY_PATTERN = Pattern.compile("^([\\w.\\[\\]]+)\\s*!=\\s*(.+)$");
    private static final Pattern GT_PATTERN = Pattern.compile("^([\\w.\\[\\]]+)\\s*>\\s*(-?\\d+(?:\\.\\d+)?)$");
    private static final Pattern GTE_PATTERN = Pattern.compile("^([\\w.\\[\\]]+)\\s*>=\\s*(-?\\d+(?:\\.\\d+)?)$");
    private static final Pattern LT_PATTERN = Pattern.compile("^([\\w.\\[\\]]+)\\s*<\\s*(-?\\d+(?:\\.\\d+)?)$");
    private static final Pattern LTE_PATTERN = Pattern.compile("^([\\w.\\[\\]]+)\\s*<=\\s*(-?\\d+(?:\\.\\d+)?)$");
    private static final Pattern SIZE_PATTERN = Pattern.compile("^size\\(([\\w.\\[\\]]+)\\)\\s*(<=|<|>=|>|==)\\s*(\\d+)$");
    private static final Pattern IN_PATTERN = Pattern.compile("^([\\w.\\[\\]]+)\\s+in\\s+\\[(.+)]$");

    /**
     * Evaluate CEL expression with context.
     *
     * @param expression CEL expression string
     * @param context variables available to the expression
     * @return true if expression evaluates to true
     * @throws CELEvaluationException if expression is invalid or evaluation fails
     */
    public boolean evaluate(String expression, Map<String, Object> context) {
        expression = expression.trim();

        // Handle compound expressions with &&
        if (expression.contains(" && ")) {
            String[] parts = expression.split(" && ");
            for (String part : parts) {
                if (!evaluate(part.trim(), context)) {
                    return false;
                }
            }
            return true;
        }

        // Handle compound expressions with ||
        if (expression.contains(" || ")) {
            String[] parts = expression.split(" \\|\\| ");
            for (String part : parts) {
                if (evaluate(part.trim(), context)) {
                    return true;
                }
            }
            return false;
        }

        // Try each pattern
        return evaluateSingleExpression(expression, context);
    }

    private boolean evaluateSingleExpression(String expression, Map<String, Object> context) {
        Matcher matcher;

        // Size check: size(path) op value
        matcher = SIZE_PATTERN.matcher(expression);
        if (matcher.matches()) {
            String path = matcher.group(1);
            String operator = matcher.group(2);
            int expected = Integer.parseInt(matcher.group(3));
            Object value = getValueByPath(context, path);
            int size = getSize(value);
            return compare(size, operator, expected);
        }

        // Equality: path == value
        matcher = EQUALITY_PATTERN.matcher(expression);
        if (matcher.matches()) {
            String path = matcher.group(1);
            String valueStr = matcher.group(2).trim();
            Object actual = getValueByPath(context, path);
            Object expected = parseValue(valueStr, context);
            return Objects.equals(actual, expected);
        }

        // Inequality: path != value
        matcher = INEQUALITY_PATTERN.matcher(expression);
        if (matcher.matches()) {
            String path = matcher.group(1);
            String valueStr = matcher.group(2).trim();
            Object actual = getValueByPath(context, path);
            Object expected = parseValue(valueStr, context);
            return !Objects.equals(actual, expected);
        }

        // Greater than: path > value
        matcher = GT_PATTERN.matcher(expression);
        if (matcher.matches()) {
            String path = matcher.group(1);
            double expected = Double.parseDouble(matcher.group(2));
            Object actual = getValueByPath(context, path);
            return toDouble(actual) > expected;
        }

        // Greater than or equal: path >= value
        matcher = GTE_PATTERN.matcher(expression);
        if (matcher.matches()) {
            String path = matcher.group(1);
            double expected = Double.parseDouble(matcher.group(2));
            Object actual = getValueByPath(context, path);
            return toDouble(actual) >= expected;
        }

        // Less than: path < value
        matcher = LT_PATTERN.matcher(expression);
        if (matcher.matches()) {
            String path = matcher.group(1);
            double expected = Double.parseDouble(matcher.group(2));
            Object actual = getValueByPath(context, path);
            return toDouble(actual) < expected;
        }

        // Less than or equal: path <= value
        matcher = LTE_PATTERN.matcher(expression);
        if (matcher.matches()) {
            String path = matcher.group(1);
            double expected = Double.parseDouble(matcher.group(2));
            Object actual = getValueByPath(context, path);
            return toDouble(actual) <= expected;
        }

        // In list: path in [values]
        matcher = IN_PATTERN.matcher(expression);
        if (matcher.matches()) {
            String path = matcher.group(1);
            String valuesStr = matcher.group(2);
            Object actual = getValueByPath(context, path);
            List<Object> values = parseList(valuesStr);
            return values.contains(actual);
        }

        throw new CELEvaluationException("Unsupported CEL expression: " + expression);
    }

    /**
     * Get value from context using dot notation path.
     */
    @SuppressWarnings("unchecked")
    private Object getValueByPath(Map<String, Object> context, String path) {
        String[] parts = path.split("\\.");
        Object current = context;

        for (String part : parts) {
            if (current == null) {
                return null;
            }

            // Handle array index notation: field[0]
            if (part.contains("[")) {
                int bracketIdx = part.indexOf('[');
                String fieldName = part.substring(0, bracketIdx);
                int index = Integer.parseInt(part.substring(bracketIdx + 1, part.length() - 1));

                if (current instanceof Map) {
                    current = ((Map<String, Object>) current).get(fieldName);
                }
                if (current instanceof List) {
                    List<?> list = (List<?>) current;
                    current = index < list.size() ? list.get(index) : null;
                }
            } else if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
            } else {
                return null;
            }
        }

        return current;
    }

    /**
     * Parse a value string into appropriate type.
     */
    private Object parseValue(String valueStr, Map<String, Object> context) {
        valueStr = valueStr.trim();

        // Boolean
        if ("true".equals(valueStr)) return true;
        if ("false".equals(valueStr)) return false;

        // Null
        if ("null".equals(valueStr)) return null;

        // String (quoted)
        if ((valueStr.startsWith("\"") && valueStr.endsWith("\"")) ||
            (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
            return valueStr.substring(1, valueStr.length() - 1);
        }

        // Number
        try {
            if (valueStr.contains(".")) {
                return Double.parseDouble(valueStr);
            }
            return Long.parseLong(valueStr);
        } catch (NumberFormatException ignored) {
        }

        // Path reference
        if (valueStr.contains(".")) {
            return getValueByPath(context, valueStr);
        }

        return valueStr;
    }

    /**
     * Parse a list of values from string.
     */
    private List<Object> parseList(String valuesStr) {
        List<Object> values = new java.util.ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inString = false;
        char quoteChar = 0;

        for (char c : valuesStr.toCharArray()) {
            if ((c == '"' || c == '\'') && !inString) {
                inString = true;
                quoteChar = c;
                current.append(c);
            } else if (c == quoteChar && inString) {
                inString = false;
                current.append(c);
            } else if (c == ',' && !inString) {
                values.add(parseValue(current.toString().trim(), Map.of()));
                current = new StringBuilder();
            } else {
                current.append(c);
            }
        }

        if (!current.isEmpty()) {
            values.add(parseValue(current.toString().trim(), Map.of()));
        }

        return values;
    }

    /**
     * Get size of a value (list, map, or string).
     */
    private int getSize(Object value) {
        if (value == null) return 0;
        if (value instanceof List) return ((List<?>) value).size();
        if (value instanceof Map) return ((Map<?, ?>) value).size();
        if (value instanceof String) return ((String) value).length();
        return 0;
    }

    /**
     * Convert value to double for numeric comparison.
     */
    private double toDouble(Object value) {
        if (value == null) return 0.0;
        if (value instanceof Number) return ((Number) value).doubleValue();
        try {
            return Double.parseDouble(value.toString());
        } catch (NumberFormatException e) {
            return 0.0;
        }
    }

    /**
     * Compare two values with operator.
     */
    private boolean compare(int actual, String operator, int expected) {
        return switch (operator) {
            case "==" -> actual == expected;
            case "!=" -> actual != expected;
            case "<" -> actual < expected;
            case "<=" -> actual <= expected;
            case ">" -> actual > expected;
            case ">=" -> actual >= expected;
            default -> false;
        };
    }

    // Import Objects for equals comparison
    private static class Objects {
        static boolean equals(Object a, Object b) {
            if (a == b) return true;
            if (a == null || b == null) return false;
            // Handle numeric comparison
            if (a instanceof Number && b instanceof Number) {
                return ((Number) a).doubleValue() == ((Number) b).doubleValue();
            }
            return a.equals(b);
        }
    }
}
