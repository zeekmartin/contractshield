"""
FastAPI middleware for ContractShield.

Provides request/response validation, vulnerability scanning, and policy enforcement.
"""

import hashlib
import json
import logging
import re
import time
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from contractshield.core import (
    Action,
    ContractValidator,
    Decision,
    Identity,
    PolicyLoader,
    PolicySet,
    RequestBody,
    RequestContext,
    RiskLevel,
    RiskScore,
    RuleHit,
    Severity,
)
from contractshield.cel import BuiltinCELEvaluator, CELEvaluator
from contractshield.openapi import OpenAPILoader, OpenAPISpec
from contractshield.vulnerability import VulnerabilityScanner


logger = logging.getLogger("contractshield")

# Context variable to store request context for access in route handlers
_request_context_var: ContextVar[Optional[RequestContext]] = ContextVar(
    "request_context", default=None
)


def get_request_context() -> Optional[RequestContext]:
    """Get the current request context (available in route handlers)."""
    return _request_context_var.get()


def set_identity(identity: Identity) -> None:
    """
    Set the identity for the current request.

    Call this in your authentication middleware/dependency after validating
    the user's credentials.

    Example:
        @app.middleware("http")
        async def auth_middleware(request: Request, call_next):
            # Validate JWT, session, etc.
            user = validate_token(request.headers.get("Authorization"))
            if user:
                set_identity(Identity(
                    subject=user.id,
                    tenant=user.tenant_id,
                    authenticated=True,
                    roles=user.roles,
                ))
            return await call_next(request)
    """
    ctx = _request_context_var.get()
    if ctx:
        ctx.identity = identity


@dataclass
class MiddlewareResult:
    """Result of ContractShield middleware evaluation."""

    decision: Decision
    rule_hits: List[RuleHit] = field(default_factory=list)
    risk_score: RiskScore = field(
        default_factory=lambda: RiskScore(score=0, level=RiskLevel.NONE)
    )
    duration_ms: float = 0.0
    request_id: Optional[str] = None


@dataclass
class ContractShieldConfig:
    """Configuration for ContractShield middleware."""

    # Policy configuration
    policy_path: Optional[Union[str, Path]] = None
    policy: Optional[PolicySet] = None

    # OpenAPI specification
    openapi_path: Optional[Union[str, Path]] = None
    openapi_spec: Optional[OpenAPISpec] = None

    # Schema validation
    validate_request: bool = True
    validate_response: bool = False

    # Vulnerability scanning
    enable_vulnerability_scan: bool = True
    vuln_enable_sqli: bool = True
    vuln_enable_xss: bool = True
    vuln_enable_path_traversal: Union[bool, Dict[str, Any]] = True
    vuln_enable_ssrf: Union[bool, Dict[str, Any]] = True
    vuln_enable_prototype_pollution: bool = True
    vuln_enable_nosql_injection: bool = False
    vuln_enable_command_injection: Union[bool, Dict[str, Any]] = False

    # CEL evaluator (optional custom implementation)
    cel_evaluator: Optional[CELEvaluator] = None

    # Mode settings
    mode: str = "enforce"  # "enforce", "monitor", "learning"
    learning_output_path: Optional[Union[str, Path]] = None

    # Response customization
    block_response_code: int = 403
    block_response_body: Optional[Dict[str, Any]] = None

    # Logging
    log_decisions: bool = True
    log_callback: Optional[Callable[[MiddlewareResult], None]] = None

    # Request body limits
    max_body_size: int = 1024 * 1024  # 1MB default

    # Path exclusions (regex patterns)
    exclude_paths: List[str] = field(default_factory=list)


class ContractShieldMiddleware(BaseHTTPMiddleware):
    """
    FastAPI/Starlette middleware for ContractShield.

    Provides:
    - Vulnerability scanning on request bodies
    - JSON Schema validation against OpenAPI spec
    - CEL-based policy evaluation
    - Risk scoring and decision making
    - Request/response logging

    Example:
        from fastapi import FastAPI
        from contractshield.fastapi import ContractShieldMiddleware, ContractShieldConfig

        app = FastAPI()

        app.add_middleware(
            ContractShieldMiddleware,
            config=ContractShieldConfig(
                policy_path="policy.yaml",
                openapi_path="openapi.yaml",
                mode="enforce",
            )
        )
    """

    def __init__(self, app, config: Optional[ContractShieldConfig] = None):
        super().__init__(app)
        self.config = config or ContractShieldConfig()
        self._setup()

    def _setup(self) -> None:
        """Initialize components based on configuration."""
        # Load policy
        self.policy: Optional[PolicySet] = None
        if self.config.policy:
            self.policy = self.config.policy
        elif self.config.policy_path:
            loader = PolicyLoader()
            self.policy = loader.load(Path(self.config.policy_path))

        # Load OpenAPI spec
        self.openapi_spec: Optional[OpenAPISpec] = None
        if self.config.openapi_spec:
            self.openapi_spec = self.config.openapi_spec
        elif self.config.openapi_path:
            loader = OpenAPILoader()
            self.openapi_spec = loader.load(Path(self.config.openapi_path))

        # Initialize validator
        self.validator = ContractValidator()

        # Initialize vulnerability scanner
        self.vuln_scanner: Optional[VulnerabilityScanner] = None
        if self.config.enable_vulnerability_scan:
            self.vuln_scanner = VulnerabilityScanner(
                enable_sqli=self.config.vuln_enable_sqli,
                enable_xss=self.config.vuln_enable_xss,
                enable_path_traversal=self.config.vuln_enable_path_traversal,
                enable_ssrf=self.config.vuln_enable_ssrf,
                enable_prototype_pollution=self.config.vuln_enable_prototype_pollution,
                enable_nosql_injection=self.config.vuln_enable_nosql_injection,
                enable_command_injection=self.config.vuln_enable_command_injection,
            )

        # Initialize CEL evaluator
        self.cel_evaluator = self.config.cel_evaluator or BuiltinCELEvaluator()

        # Compile path exclusion patterns
        self.exclude_patterns = [
            re.compile(pattern) for pattern in self.config.exclude_paths
        ]

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process the request through ContractShield."""
        start_time = time.time()

        # Check path exclusions
        if self._is_excluded(request.url.path):
            return await call_next(request)

        # Build request context
        try:
            context = await self._build_context(request)
            _request_context_var.set(context)
        except Exception as e:
            # Body parsing failed - block if in enforce mode
            if self.config.mode == "enforce":
                return self._block_response(
                    f"Request parsing failed: {str(e)}",
                    code=400,
                )
            return await call_next(request)

        # Run vulnerability scan
        vuln_hits: List[RuleHit] = []
        if self.vuln_scanner and context.body and context.body.json:
            findings = self.vuln_scanner.scan(context.body.json)
            vuln_hits = [f.to_rule_hit() for f in findings]

        # Run schema validation
        schema_hits: List[RuleHit] = []
        if self.config.validate_request and self.openapi_spec:
            schema_hits = self._validate_request_schema(request, context)

        # Run policy rules
        policy_hits: List[RuleHit] = []
        if self.policy:
            policy_hits = self._evaluate_policy(request, context)

        # Combine all hits
        all_hits = vuln_hits + schema_hits + policy_hits

        # Calculate risk score
        risk_score = self._calculate_risk_score(all_hits)

        # Make decision
        decision = self._make_decision(all_hits, risk_score)

        # Build result
        duration_ms = (time.time() - start_time) * 1000
        result = MiddlewareResult(
            decision=decision,
            rule_hits=all_hits,
            risk_score=risk_score,
            duration_ms=duration_ms,
            request_id=context.id,
        )

        # Log decision
        if self.config.log_decisions:
            self._log_decision(result, request)

        if self.config.log_callback:
            self.config.log_callback(result)

        # Handle block decision
        if decision.action == Action.BLOCK and self.config.mode == "enforce":
            return self._block_response(decision.reason or "Blocked by policy")

        # Continue to handler
        response = await call_next(request)

        # Validate response if enabled
        if self.config.validate_response and self.openapi_spec:
            # Response validation is more complex - skip for now
            pass

        return response

    async def _build_context(self, request: Request) -> RequestContext:
        """Build request context from FastAPI request."""
        # Parse body
        body_json: Optional[Dict[str, Any]] = None
        body_raw = b""
        body_present = False

        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            body_raw = await request.body()
            body_present = len(body_raw) > 0

            if len(body_raw) > self.config.max_body_size:
                raise ValueError("Request body too large")

            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type and body_raw:
                try:
                    body_json = json.loads(body_raw)
                except json.JSONDecodeError as e:
                    raise ValueError(f"Invalid JSON body: {e}")

        # Build request body
        body_str = body_raw.decode("utf-8", errors="replace") if body_raw else None
        body_sha256 = hashlib.sha256(body_raw).hexdigest() if body_raw else None

        request_body = RequestBody(
            present=body_present,
            size_bytes=len(body_raw),
            sha256=body_sha256,
            raw=body_str,
            json=body_json,
        )

        # Build headers dict
        headers = dict(request.headers)

        # Extract query parameters
        query_params = dict(request.query_params)

        # Build context
        return RequestContext(
            id=str(uuid.uuid4()),
            timestamp=datetime.utcnow(),
            method=request.method,
            path=request.url.path,
            headers=headers,
            query=query_params,
            content_type=request.headers.get("content-type"),
            body=request_body,
            identity=Identity(),  # Default unauthenticated, can be set via set_identity()
        )

    def _validate_request_schema(
        self, request: Request, context: RequestContext
    ) -> List[RuleHit]:
        """Validate request against OpenAPI schema."""
        hits: List[RuleHit] = []

        if not self.openapi_spec:
            return hits

        # Find matching operation
        result = self.openapi_spec.get_operation(request.url.path, request.method)
        if not result:
            # No matching operation - could be a 404 case
            return hits

        operation, path_params = result

        # Validate request body if present
        if context.body and context.body.json and operation.request_schema:
            validation_errors = self.validator.validate(
                context.body.json,
                operation.request_schema,
            )
            for error in validation_errors:
                hits.append(RuleHit(
                    id="schema.request.invalid",
                    severity=Severity.MEDIUM,
                    message=error.message,
                    path=error.path,
                    value=str(error.value)[:100] if error.value else None,
                ))

        return hits

    def _evaluate_policy(
        self, request: Request, context: RequestContext
    ) -> List[RuleHit]:
        """Evaluate policy rules against the request."""
        hits: List[RuleHit] = []

        if not self.policy:
            return hits

        # Find matching route
        route = self.policy.find_route(request.url.path, request.method)
        if not route:
            # Check unmatched action
            if self.policy.defaults.unmatched_action == "deny":
                hits.append(RuleHit(
                    id="policy.unmatched",
                    severity=Severity.HIGH,
                    message=f"No policy route matches: {request.method} {request.url.path}",
                ))
            return hits

        # Build CEL context
        cel_context = {
            "request": {
                "method": request.method,
                "path": request.url.path,
                "headers": dict(request.headers),
                "query": dict(request.query_params),
                "body": {
                    "json": context.body.json if context.body else {},
                },
            },
            "identity": {
                "authenticated": context.identity.authenticated,
                "subject": context.identity.subject,
                "tenant": context.identity.tenant,
                "roles": context.identity.roles,
                "scopes": context.identity.scopes,
            },
        }

        # Evaluate rules
        for rule in route.rules:
            if not rule.condition:
                continue

            try:
                matches = self.cel_evaluator.evaluate(rule.condition, cel_context)
            except Exception as e:
                # CEL evaluation error
                hits.append(RuleHit(
                    id=f"policy.cel_error.{rule.id or 'unknown'}",
                    severity=Severity.LOW,
                    message=f"CEL evaluation error: {e}",
                ))
                continue

            if matches and rule.action.value == "deny":
                hits.append(RuleHit(
                    id=f"policy.{rule.id or 'rule'}",
                    severity=Severity.HIGH,
                    message=rule.message or f"Policy rule triggered: {rule.condition}",
                ))

        return hits

    def _calculate_risk_score(self, hits: List[RuleHit]) -> RiskScore:
        """Calculate overall risk score from rule hits."""
        return RiskScore.from_rule_hits(hits)

    def _make_decision(
        self, hits: List[RuleHit], risk_score: RiskScore
    ) -> Decision:
        """Make allow/block decision based on hits and risk score."""
        # Block on any CRITICAL or HIGH severity hit
        for hit in hits:
            if hit.severity in (Severity.CRITICAL, Severity.HIGH):
                return Decision.block(
                    reason=hit.message or "Policy violation",
                    rule_hits=hits,
                )

        # Allow if no blocking hits
        return Decision.allow()

    def _block_response(
        self, reason: str, code: Optional[int] = None
    ) -> JSONResponse:
        """Create a block response."""
        status_code = code or self.config.block_response_code

        if self.config.block_response_body:
            body = self.config.block_response_body
        else:
            body = {
                "error": "Forbidden",
                "message": reason,
            }

        return JSONResponse(
            status_code=status_code,
            content=body,
        )

    def _is_excluded(self, path: str) -> bool:
        """Check if path is excluded from validation."""
        for pattern in self.exclude_patterns:
            if pattern.match(path):
                return True
        return False

    def _log_decision(self, result: MiddlewareResult, request: Request) -> None:
        """Log the validation decision."""
        if result.decision.action == Action.BLOCK:
            logger.warning(
                "ContractShield BLOCK: %s %s - %s",
                request.method,
                request.url.path,
                result.decision.reason,
            )
        elif result.rule_hits:
            logger.info(
                "ContractShield ALLOW (with hits): %s %s - %d hits",
                request.method,
                request.url.path,
                len(result.rule_hits),
            )
