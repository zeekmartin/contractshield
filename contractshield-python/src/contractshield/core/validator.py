"""Core JSON Schema validator with ContractShield extensions."""

from typing import Any, Callable, Dict, List, Optional

import jsonschema
from jsonschema import Draft202012Validator, FormatChecker

from .errors import ValidationError
from .result import ValidationResult


class SchemaLoader:
    """Interface for loading external schema references."""

    def load(self, ref: str) -> Optional[Dict[str, Any]]:
        """Load schema from reference."""
        raise NotImplementedError


class DefaultSchemaLoader(SchemaLoader):
    """Default schema loader that handles component references."""

    def __init__(self, components: Optional[Dict[str, Any]] = None):
        self.components = components or {}

    def load(self, ref: str) -> Optional[Dict[str, Any]]:
        """Load schema from component reference."""
        if ref.startswith("#/components/schemas/"):
            schema_name = ref.split("/")[-1]
            schemas = self.components.get("schemas", {})
            return schemas.get(schema_name)
        return None


class ContractValidator:
    """
    JSON Schema validator with ContractShield extensions.

    Supports:
    - JSON Schema Draft 2020-12
    - Custom formats (uuid, email, uri, date-time, etc.)
    - Schema reference resolution
    - Detailed error reporting
    """

    def __init__(
        self,
        schema: Dict[str, Any],
        schema_loader: Optional[SchemaLoader] = None,
        format_checker: Optional[FormatChecker] = None,
    ):
        self.schema = schema
        self.schema_loader = schema_loader or DefaultSchemaLoader()
        self.format_checker = format_checker or FormatChecker()

        # Register common formats
        self._register_formats()

        # Create resolver for $ref handling
        self._resolver = jsonschema.RefResolver.from_schema(schema)

        # Compile validator
        self._validator = Draft202012Validator(
            schema,
            resolver=self._resolver,
            format_checker=self.format_checker,
        )

    def _register_formats(self) -> None:
        """Register custom format validators."""
        import re
        from datetime import datetime

        @self.format_checker.checks("uuid")
        def check_uuid(value: Any) -> bool:
            if not isinstance(value, str):
                return False
            uuid_pattern = re.compile(
                r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
                re.IGNORECASE,
            )
            return bool(uuid_pattern.match(value))

        @self.format_checker.checks("date-time")
        def check_datetime(value: Any) -> bool:
            if not isinstance(value, str):
                return False
            try:
                datetime.fromisoformat(value.replace("Z", "+00:00"))
                return True
            except ValueError:
                return False

        @self.format_checker.checks("email")
        def check_email(value: Any) -> bool:
            if not isinstance(value, str):
                return False
            email_pattern = re.compile(r"^[^@]+@[^@]+\.[^@]+$")
            return bool(email_pattern.match(value))

    def validate(
        self,
        data: Any,
        context: Optional[Dict[str, Any]] = None,
    ) -> ValidationResult:
        """
        Validate data against schema.

        Args:
            data: The data to validate
            context: Optional context for CEL expressions (future use)

        Returns:
            ValidationResult with valid flag and any errors
        """
        errors: List[Dict[str, Any]] = []

        try:
            self._validator.validate(data)
        except jsonschema.ValidationError:
            # Collect all errors
            for error in self._validator.iter_errors(data):
                errors.append(self._format_error(error))

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
        )

    def _format_error(self, error: jsonschema.ValidationError) -> Dict[str, Any]:
        """Format a validation error for reporting."""
        path = "/" + "/".join(str(p) for p in error.absolute_path) if error.absolute_path else "/"
        return {
            "path": path,
            "message": error.message,
            "schema_path": "/" + "/".join(str(p) for p in error.schema_path),
            "validator": error.validator,
            "value": self._truncate_value(error.instance),
        }

    def _truncate_value(self, value: Any, max_length: int = 100) -> Any:
        """Truncate long values for error reporting."""
        if isinstance(value, str) and len(value) > max_length:
            return value[:max_length] + "..."
        return value

    def validate_request(
        self,
        method: str,
        path: str,
        body: Any = None,
        query: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> ValidationResult:
        """
        Validate a full HTTP request against schema.

        This method validates the request body against the schema.
        Query params and headers can be validated if schema includes them.
        """
        # For now, just validate the body
        # TODO: Support validating query/headers if schema requires
        if body is not None:
            return self.validate(body)

        return ValidationResult(valid=True)


def resolve_schema_ref(
    ref: str,
    components: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Resolve a JSON Schema $ref.

    Args:
        ref: The reference string (e.g., "#/components/schemas/User")
        components: The components section containing schemas

    Returns:
        The resolved schema or None if not found
    """
    if not ref.startswith("#/"):
        return None

    parts = ref[2:].split("/")
    current = {"components": components} if components else {}

    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None

    return current if isinstance(current, dict) else None
