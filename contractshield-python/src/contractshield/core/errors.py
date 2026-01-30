"""Custom exceptions for ContractShield."""

from typing import Any, Dict, List, Optional


class ContractShieldError(Exception):
    """Base exception for all ContractShield errors."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ValidationError(ContractShieldError):
    """Raised when request validation fails."""

    def __init__(
        self,
        message: str,
        errors: Optional[List[Dict[str, Any]]] = None,
        path: Optional[str] = None,
    ):
        super().__init__(message, {"errors": errors or [], "path": path})
        self.errors = errors or []
        self.path = path


class ConfigurationError(ContractShieldError):
    """Raised when configuration is invalid."""

    pass


class PolicyError(ContractShieldError):
    """Raised when policy parsing or evaluation fails."""

    def __init__(
        self,
        message: str,
        policy_version: Optional[str] = None,
        route_id: Optional[str] = None,
    ):
        super().__init__(
            message, {"policy_version": policy_version, "route_id": route_id}
        )
        self.policy_version = policy_version
        self.route_id = route_id


class CELEvaluationError(ContractShieldError):
    """Raised when CEL expression evaluation fails."""

    def __init__(self, message: str, expression: str):
        super().__init__(message, {"expression": expression})
        self.expression = expression


class VulnerabilityDetectedError(ContractShieldError):
    """Raised when a vulnerability is detected (for strict mode)."""

    def __init__(
        self,
        message: str,
        vulnerability_type: str,
        path: str,
        value: Optional[str] = None,
    ):
        super().__init__(
            message,
            {"vulnerability_type": vulnerability_type, "path": path, "value": value},
        )
        self.vulnerability_type = vulnerability_type
        self.path = path
        self.value = value
