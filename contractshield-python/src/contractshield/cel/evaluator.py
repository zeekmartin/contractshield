"""
CEL (Common Expression Language) evaluator for ContractShield.

Supports a subset of CEL expressions for policy evaluation, with optional
full CEL support via cel-python library.
"""

import re
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from contractshield.core.errors import CELEvaluationError


class CELEvaluator(ABC):
    """Abstract base class for CEL evaluators."""

    @abstractmethod
    def evaluate(self, expression: str, context: Dict[str, Any]) -> bool:
        """
        Evaluate a CEL expression.

        Args:
            expression: The CEL expression to evaluate
            context: The evaluation context (request, identity, etc.)

        Returns:
            True if the expression evaluates to true, False otherwise

        Raises:
            CELEvaluationError: If expression is invalid or evaluation fails
        """
        pass


class BuiltinCELEvaluator(CELEvaluator):
    """
    Built-in CEL evaluator supporting a safe subset of expressions.

    Supported patterns:
    - identity.authenticated == true/false
    - identity.tenant == request.body.<field>
    - identity.subject == request.body.<field>
    - request.body.<field> == <value>
    - request.body.<field> in [<values>]
    - request.headers.<header> == <value>
    - size(request.body.<field>) <= <number>

    This evaluator is safe and doesn't execute arbitrary code.
    For full CEL support, use CelPythonEvaluator with cel-python.
    """

    # Patterns for safe expression parsing
    PATTERNS = {
        # identity.authenticated == true
        "auth_check": re.compile(
            r"^identity\.authenticated\s*==\s*(true|false)$"
        ),
        # identity.tenant == request.body.<field>
        "tenant_binding": re.compile(
            r"^identity\.tenant\s*==\s*request\.body\.(\w+)$"
        ),
        # identity.subject == request.body.<field>
        "subject_binding": re.compile(
            r"^identity\.subject\s*==\s*request\.body\.(\w+)$"
        ),
        # <path> == <value>
        "equality": re.compile(
            r"^([\w.]+)\s*==\s*(.+)$"
        ),
        # <path> != <value>
        "inequality": re.compile(
            r"^([\w.]+)\s*!=\s*(.+)$"
        ),
        # <path> in [<values>]
        "membership": re.compile(
            r"^([\w.]+)\s+in\s+\[(.+)\]$"
        ),
        # size(<path>) <= <number>
        "size_check": re.compile(
            r"^size\(([\w.]+)\)\s*(<=|<|>=|>|==)\s*(\d+)$"
        ),
        # <path> > <number> (for numeric comparisons)
        "numeric_gt": re.compile(
            r"^([\w.]+)\s*>\s*(-?\d+(?:\.\d+)?)$"
        ),
        "numeric_gte": re.compile(
            r"^([\w.]+)\s*>=\s*(-?\d+(?:\.\d+)?)$"
        ),
        "numeric_lt": re.compile(
            r"^([\w.]+)\s*<\s*(-?\d+(?:\.\d+)?)$"
        ),
        "numeric_lte": re.compile(
            r"^([\w.]+)\s*<=\s*(-?\d+(?:\.\d+)?)$"
        ),
    }

    def evaluate(self, expression: str, context: Dict[str, Any]) -> bool:
        """Evaluate expression using built-in safe patterns."""
        expression = expression.strip()

        # Handle compound expressions with &&
        if " && " in expression:
            parts = expression.split(" && ")
            return all(self.evaluate(part.strip(), context) for part in parts)

        # Handle compound expressions with ||
        if " || " in expression:
            parts = expression.split(" || ")
            return any(self.evaluate(part.strip(), context) for part in parts)

        # Try each pattern
        for pattern_name, pattern in self.PATTERNS.items():
            match = pattern.match(expression)
            if match:
                return self._evaluate_pattern(pattern_name, match, context)

        raise CELEvaluationError(
            f"Unsupported CEL expression pattern: {expression}",
            expression=expression,
        )

    def _evaluate_pattern(
        self, pattern_name: str, match: re.Match, context: Dict[str, Any]
    ) -> bool:
        """Evaluate a matched pattern."""
        if pattern_name == "auth_check":
            expected = match.group(1) == "true"
            actual = self._get_value(context, "identity.authenticated")
            return actual == expected

        elif pattern_name == "tenant_binding":
            field = match.group(1)
            tenant = self._get_value(context, "identity.tenant")
            body_value = self._get_value(context, f"request.body.json.{field}")
            return tenant == body_value

        elif pattern_name == "subject_binding":
            field = match.group(1)
            subject = self._get_value(context, "identity.subject")
            body_value = self._get_value(context, f"request.body.json.{field}")
            return subject == body_value

        elif pattern_name == "equality":
            path = match.group(1)
            value_str = match.group(2).strip()
            actual = self._get_value(context, path)
            expected = self._parse_value(value_str)
            return actual == expected

        elif pattern_name == "inequality":
            path = match.group(1)
            value_str = match.group(2).strip()
            actual = self._get_value(context, path)
            expected = self._parse_value(value_str)
            return actual != expected

        elif pattern_name == "membership":
            path = match.group(1)
            values_str = match.group(2)
            actual = self._get_value(context, path)
            expected_values = self._parse_list(values_str)
            return actual in expected_values

        elif pattern_name == "size_check":
            path = match.group(1)
            operator = match.group(2)
            expected = int(match.group(3))
            value = self._get_value(context, path)
            size = len(value) if value is not None else 0
            return self._compare(size, operator, expected)

        elif pattern_name in ("numeric_gt", "numeric_gte", "numeric_lt", "numeric_lte"):
            path = match.group(1)
            expected = float(match.group(2))
            actual = self._get_value(context, path)
            if actual is None:
                return False
            try:
                actual_num = float(actual)
            except (ValueError, TypeError):
                return False

            operators = {
                "numeric_gt": ">",
                "numeric_gte": ">=",
                "numeric_lt": "<",
                "numeric_lte": "<=",
            }
            return self._compare(actual_num, operators[pattern_name], expected)

        return False

    def _get_value(self, context: Dict[str, Any], path: str) -> Any:
        """Get value from context using dot notation path."""
        parts = path.split(".")
        current = context

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

            if current is None:
                return None

        return current

    def _parse_value(self, value_str: str) -> Any:
        """Parse a value string into its appropriate type."""
        value_str = value_str.strip()

        # Boolean
        if value_str == "true":
            return True
        if value_str == "false":
            return False

        # String (quoted)
        if (value_str.startswith('"') and value_str.endswith('"')) or (
            value_str.startswith("'") and value_str.endswith("'")
        ):
            return value_str[1:-1]

        # Number
        try:
            if "." in value_str:
                return float(value_str)
            return int(value_str)
        except ValueError:
            pass

        # Path reference (e.g., identity.tenant)
        # Return as-is for comparison
        return value_str

    def _parse_list(self, values_str: str) -> List[Any]:
        """Parse a list of values from string."""
        values = []
        current = ""
        in_string = False
        quote_char = None

        for char in values_str:
            if char in ('"', "'") and not in_string:
                in_string = True
                quote_char = char
                current += char
            elif char == quote_char and in_string:
                in_string = False
                current += char
            elif char == "," and not in_string:
                values.append(self._parse_value(current.strip()))
                current = ""
            else:
                current += char

        if current.strip():
            values.append(self._parse_value(current.strip()))

        return values

    def _compare(self, actual: Any, operator: str, expected: Any) -> bool:
        """Compare two values with an operator."""
        if operator == "==":
            return actual == expected
        elif operator == "!=":
            return actual != expected
        elif operator == "<":
            return actual < expected
        elif operator == "<=":
            return actual <= expected
        elif operator == ">":
            return actual > expected
        elif operator == ">=":
            return actual >= expected
        return False


class CelPythonEvaluator(CELEvaluator):
    """
    Full CEL evaluator using cel-python library.

    Requires: pip install cel-python

    This provides full CEL language support but requires the optional
    cel-python dependency.
    """

    def __init__(self) -> None:
        try:
            import celpy
            self._celpy = celpy
        except ImportError:
            raise ImportError(
                "cel-python is required for full CEL support. "
                "Install with: pip install contractshield[cel]"
            )

        self._env = self._celpy.Environment()
        self._compiled_cache: Dict[str, Any] = {}

    def evaluate(self, expression: str, context: Dict[str, Any]) -> bool:
        """Evaluate expression using cel-python."""
        try:
            # Get or compile the program
            if expression not in self._compiled_cache:
                ast = self._env.compile(expression)
                self._compiled_cache[expression] = self._env.program(ast)

            program = self._compiled_cache[expression]

            # Create activation with context
            activation = self._create_activation(context)

            # Evaluate
            result = program.evaluate(activation)
            return bool(result)

        except Exception as e:
            raise CELEvaluationError(
                f"CEL evaluation failed: {e}",
                expression=expression,
            )

    def _create_activation(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Create cel-python activation from context."""
        # cel-python expects a specific format
        # Convert our context to that format
        return context
