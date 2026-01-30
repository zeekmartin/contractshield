"""
ContractShield - Contract-First API Security for Python.

A comprehensive API security framework that provides:
- JSON Schema validation
- OpenAPI contract enforcement
- Vulnerability scanning (SQLi, XSS, Path Traversal, etc.)
- CEL expression evaluation
- FastAPI and Flask middleware
"""

from contractshield.core import (
    ContractValidator,
    ValidationResult,
    RuleHit,
    Decision,
    Action,
    Severity,
    RequestContext,
    PolicySet,
    PolicyRoute,
)
from contractshield.core.errors import (
    ContractShieldError,
    ValidationError,
    ConfigurationError,
    PolicyError,
)

__version__ = "1.5.2"

__all__ = [
    # Core
    "ContractValidator",
    "ValidationResult",
    "RuleHit",
    "Decision",
    "Action",
    "Severity",
    "RequestContext",
    "PolicySet",
    "PolicyRoute",
    # Errors
    "ContractShieldError",
    "ValidationError",
    "ConfigurationError",
    "PolicyError",
]
