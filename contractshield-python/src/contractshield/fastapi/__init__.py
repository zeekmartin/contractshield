"""FastAPI integration for ContractShield."""

from .middleware import (
    ContractShieldMiddleware,
    ContractShieldConfig,
    MiddlewareResult,
    get_request_context,
    set_identity,
)

__all__ = [
    "ContractShieldMiddleware",
    "ContractShieldConfig",
    "MiddlewareResult",
    "get_request_context",
    "set_identity",
]
