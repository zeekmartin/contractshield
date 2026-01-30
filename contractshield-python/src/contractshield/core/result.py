"""Core data structures for ContractShield decisions and results."""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class Action(str, Enum):
    """Decision action types."""

    ALLOW = "ALLOW"
    BLOCK = "BLOCK"
    MONITOR = "MONITOR"
    CHALLENGE = "CHALLENGE"


class Severity(str, Enum):
    """Severity levels for rule hits."""

    LOW = "low"
    MEDIUM = "med"
    HIGH = "high"
    CRITICAL = "critical"


class RiskLevel(str, Enum):
    """Risk level classification."""

    NONE = "none"
    LOW = "low"
    MEDIUM = "med"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class RuleHit:
    """Represents a triggered rule during evaluation."""

    id: str
    severity: Severity
    message: Optional[str] = None
    path: Optional[str] = None
    value: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        result: Dict[str, Any] = {"id": self.id, "severity": self.severity.value}
        if self.message:
            result["message"] = self.message
        if self.path:
            result["path"] = self.path
        if self.value:
            result["value"] = self.value
        return result


@dataclass
class RiskScore:
    """Risk assessment for a decision."""

    score: int  # 0-100
    level: RiskLevel
    factors: List[str] = field(default_factory=list)

    @classmethod
    def from_rule_hits(cls, hits: List[RuleHit]) -> "RiskScore":
        """Calculate risk score from rule hits."""
        if not hits:
            return cls(score=0, level=RiskLevel.NONE)

        severity_scores = {
            Severity.LOW: 10,
            Severity.MEDIUM: 30,
            Severity.HIGH: 60,
            Severity.CRITICAL: 100,
        }

        max_score = max(severity_scores.get(hit.severity, 0) for hit in hits)
        total_score = min(100, sum(severity_scores.get(hit.severity, 0) for hit in hits))

        # Use max severity for level
        if max_score >= 100:
            level = RiskLevel.CRITICAL
        elif max_score >= 60:
            level = RiskLevel.HIGH
        elif max_score >= 30:
            level = RiskLevel.MEDIUM
        elif max_score > 0:
            level = RiskLevel.LOW
        else:
            level = RiskLevel.NONE

        factors = [f"{hit.id}: {hit.message}" for hit in hits if hit.message]
        return cls(score=total_score, level=level, factors=factors)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        result = {"score": self.score, "level": self.level.value}
        if self.factors:
            result["factors"] = self.factors
        return result


@dataclass
class RedactionDirective:
    """Directive for redacting sensitive data in responses."""

    path: str
    action: str  # "mask", "hash", "drop"
    priority: int = 0


@dataclass
class Decision:
    """
    The final decision from the evaluation pipeline.

    This represents the verdict on whether a request should be allowed,
    blocked, monitored, or challenged.
    """

    version: str = "0.1"
    action: Action = Action.ALLOW
    status_code: int = 200
    reason: Optional[str] = None
    rule_hits: List[RuleHit] = field(default_factory=list)
    risk: RiskScore = field(default_factory=lambda: RiskScore(0, RiskLevel.NONE))
    redactions: List[RedactionDirective] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def allow(cls, metadata: Optional[Dict[str, Any]] = None) -> "Decision":
        """Create an ALLOW decision."""
        return cls(
            action=Action.ALLOW,
            status_code=200,
            metadata=metadata or {},
        )

    @classmethod
    def block(
        cls,
        reason: str,
        rule_hits: List[RuleHit],
        status_code: int = 403,
    ) -> "Decision":
        """Create a BLOCK decision."""
        return cls(
            action=Action.BLOCK,
            status_code=status_code,
            reason=reason,
            rule_hits=rule_hits,
            risk=RiskScore.from_rule_hits(rule_hits),
        )

    @classmethod
    def monitor(
        cls,
        reason: str,
        rule_hits: List[RuleHit],
    ) -> "Decision":
        """Create a MONITOR decision (allow but log)."""
        return cls(
            action=Action.MONITOR,
            status_code=200,
            reason=reason,
            rule_hits=rule_hits,
            risk=RiskScore.from_rule_hits(rule_hits),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result: Dict[str, Any] = {
            "version": self.version,
            "action": self.action.value,
            "statusCode": self.status_code,
            "risk": self.risk.to_dict(),
        }
        if self.reason:
            result["reason"] = self.reason
        if self.rule_hits:
            result["ruleHits"] = [hit.to_dict() for hit in self.rule_hits]
        if self.redactions:
            result["redactions"] = [
                {"path": r.path, "action": r.action, "priority": r.priority}
                for r in self.redactions
            ]
        if self.metadata:
            result["metadata"] = self.metadata
        return result


@dataclass
class ValidationResult:
    """Result of contract validation."""

    valid: bool
    errors: List[Dict[str, Any]] = field(default_factory=list)
    path: Optional[str] = None

    def to_rule_hits(self, rule_id: str = "contract.validation") -> List[RuleHit]:
        """Convert validation errors to rule hits."""
        if self.valid:
            return []

        hits = []
        for error in self.errors:
            hits.append(
                RuleHit(
                    id=rule_id,
                    severity=Severity.HIGH,
                    message=error.get("message", "Validation failed"),
                    path=error.get("path", self.path),
                )
            )
        return hits


@dataclass
class RequestBody:
    """Normalized request body information."""

    present: bool
    size_bytes: int
    sha256: Optional[str] = None
    raw: Optional[str] = None  # For webhook signature verification
    json: Optional[Dict[str, Any]] = None
    redacted: bool = False


@dataclass
class Identity:
    """User identity extracted from request."""

    authenticated: bool = False
    subject: Optional[str] = None
    tenant: Optional[str] = None
    scopes: List[str] = field(default_factory=list)
    roles: List[str] = field(default_factory=list)
    claims: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ClientInfo:
    """Client information from request."""

    ip: Optional[str] = None
    user_agent: Optional[str] = None


@dataclass
class RuntimeInfo:
    """Runtime environment information."""

    language: str = "python"
    service: Optional[str] = None
    env: Optional[str] = None


@dataclass
class WebhookInfo:
    """Webhook-specific information."""

    provider: Optional[str] = None
    signature_valid: Optional[bool] = None
    replayed: Optional[bool] = None


@dataclass
class RequestContext:
    """
    Normalized request context for evaluation.

    This is the standardized format that the PDP evaluates against policies.
    """

    version: str = "0.1"
    id: Optional[str] = None
    timestamp: Optional[datetime] = None
    method: str = "GET"
    path: str = "/"
    route_id: Optional[str] = None
    headers: Dict[str, str] = field(default_factory=dict)
    query: Dict[str, Any] = field(default_factory=dict)
    content_type: Optional[str] = None
    body: Optional[RequestBody] = None
    identity: Identity = field(default_factory=Identity)
    client: ClientInfo = field(default_factory=ClientInfo)
    runtime: RuntimeInfo = field(default_factory=RuntimeInfo)
    webhook: WebhookInfo = field(default_factory=WebhookInfo)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for CEL evaluation."""
        return {
            "version": self.version,
            "id": self.id,
            "request": {
                "method": self.method,
                "path": self.path,
                "routeId": self.route_id,
                "headers": self.headers,
                "query": self.query,
                "contentType": self.content_type,
                "body": {
                    "present": self.body.present if self.body else False,
                    "sizeBytes": self.body.size_bytes if self.body else 0,
                    "json": self.body.json if self.body else None,
                }
                if self.body
                else {"present": False, "sizeBytes": 0},
            },
            "identity": {
                "authenticated": self.identity.authenticated,
                "subject": self.identity.subject,
                "tenant": self.identity.tenant,
                "scopes": self.identity.scopes,
                "claims": self.identity.claims,
            },
            "client": {
                "ip": self.client.ip,
                "userAgent": self.client.user_agent,
            },
            "runtime": {
                "language": self.runtime.language,
                "service": self.runtime.service,
                "env": self.runtime.env,
            },
            "webhook": {
                "provider": self.webhook.provider,
                "signatureValid": self.webhook.signature_valid,
                "replayed": self.webhook.replayed,
            },
        }
