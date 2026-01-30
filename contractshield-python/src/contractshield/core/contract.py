"""Policy and contract definitions for ContractShield."""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union

import yaml

from .errors import ConfigurationError, PolicyError


class PolicyMode(str, Enum):
    """Policy enforcement mode."""

    ENFORCE = "enforce"
    MONITOR = "monitor"


class UnmatchedAction(str, Enum):
    """Action for unmatched routes."""

    ALLOW = "allow"
    BLOCK = "block"
    MONITOR = "monitor"


class RuleType(str, Enum):
    """Policy rule types."""

    CEL = "cel"
    WEBHOOK_SIGNATURE = "webhook-signature"
    WEBHOOK_REPLAY = "webhook-replay"
    CONTRACT = "contract"
    LIMITS = "limits"


class RuleAction(str, Enum):
    """Rule action when triggered."""

    ALLOW = "allow"
    BLOCK = "block"
    MONITOR = "monitor"


@dataclass
class LimitsConfig:
    """Request limits configuration."""

    max_body_bytes: Optional[int] = None
    max_json_depth: Optional[int] = None
    max_array_length: Optional[int] = None


@dataclass
class VulnerabilityChecksConfig:
    """Vulnerability scanning configuration."""

    prototype_pollution: bool = True
    path_traversal: Union[bool, Dict[str, Any]] = True
    ssrf_internal: Union[bool, Dict[str, Any]] = True
    nosql_injection: bool = False  # Opt-in
    command_injection: Union[bool, Dict[str, Any]] = False  # Opt-in


@dataclass
class ContractConfig:
    """Contract validation configuration."""

    request_schema_ref: Optional[str] = None
    response_schema_ref: Optional[str] = None
    reject_unknown_fields: bool = False


@dataclass
class WebhookConfig:
    """Webhook verification configuration."""

    provider: str  # "stripe", "github", "slack", "twilio"
    secret_ref: Optional[str] = None  # Environment variable name
    secret: Optional[str] = None  # Inline secret (not recommended)
    require_raw_body: bool = True
    timestamp_tolerance: int = 300  # seconds
    replay_protection: bool = True
    allowed_event_types: Optional[List[str]] = None


@dataclass
class PolicyRule:
    """Individual policy rule."""

    id: str
    type: RuleType
    action: RuleAction = RuleAction.BLOCK
    severity: str = "high"
    config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RouteMatch:
    """Route matching criteria."""

    method: str
    path: str


@dataclass
class PolicyRoute:
    """Policy route definition."""

    id: str
    match: RouteMatch
    mode: Optional[PolicyMode] = None
    contract: Optional[ContractConfig] = None
    webhook: Optional[WebhookConfig] = None
    vulnerability: Optional[VulnerabilityChecksConfig] = None
    rules: List[PolicyRule] = field(default_factory=list)
    limits: Optional[LimitsConfig] = None


@dataclass
class PolicyDefaults:
    """Default policy settings."""

    mode: PolicyMode = PolicyMode.ENFORCE
    unmatched_route_action: UnmatchedAction = UnmatchedAction.ALLOW
    response_block_status_code: int = 403
    limits: LimitsConfig = field(default_factory=LimitsConfig)
    vulnerability_checks: VulnerabilityChecksConfig = field(
        default_factory=VulnerabilityChecksConfig
    )


@dataclass
class PolicySet:
    """
    Complete policy configuration.

    This is the root configuration object that contains all policy settings,
    defaults, and route definitions.
    """

    policy_version: str = "0.1"
    defaults: PolicyDefaults = field(default_factory=PolicyDefaults)
    routes: List[PolicyRoute] = field(default_factory=list)
    components: Dict[str, Any] = field(default_factory=dict)  # For schema refs

    def get_route(self, method: str, path: str) -> Optional[PolicyRoute]:
        """Find matching route for method and path."""
        method_upper = method.upper()
        for route in self.routes:
            if (
                route.match.method.upper() == method_upper
                and route.match.path == path
            ):
                return route
        return None

    def get_effective_mode(self, route: Optional[PolicyRoute]) -> PolicyMode:
        """Get effective mode for a route (route override or default)."""
        if route and route.mode:
            return route.mode
        return self.defaults.mode

    def get_effective_limits(self, route: Optional[PolicyRoute]) -> LimitsConfig:
        """Get effective limits for a route."""
        defaults = self.defaults.limits
        if not route or not route.limits:
            return defaults

        return LimitsConfig(
            max_body_bytes=route.limits.max_body_bytes or defaults.max_body_bytes,
            max_json_depth=route.limits.max_json_depth or defaults.max_json_depth,
            max_array_length=route.limits.max_array_length or defaults.max_array_length,
        )

    def get_effective_vulnerability_checks(
        self, route: Optional[PolicyRoute]
    ) -> VulnerabilityChecksConfig:
        """Get effective vulnerability checks config."""
        defaults = self.defaults.vulnerability_checks
        if not route or not route.vulnerability:
            return defaults

        route_vuln = route.vulnerability
        return VulnerabilityChecksConfig(
            prototype_pollution=(
                route_vuln.prototype_pollution
                if route_vuln.prototype_pollution is not None
                else defaults.prototype_pollution
            ),
            path_traversal=(
                route_vuln.path_traversal
                if route_vuln.path_traversal is not None
                else defaults.path_traversal
            ),
            ssrf_internal=(
                route_vuln.ssrf_internal
                if route_vuln.ssrf_internal is not None
                else defaults.ssrf_internal
            ),
            nosql_injection=(
                route_vuln.nosql_injection
                if route_vuln.nosql_injection is not None
                else defaults.nosql_injection
            ),
            command_injection=(
                route_vuln.command_injection
                if route_vuln.command_injection is not None
                else defaults.command_injection
            ),
        )


class PolicyLoader:
    """Load and parse policy files."""

    @classmethod
    def from_file(cls, path: Union[str, Path]) -> PolicySet:
        """Load policy from YAML or JSON file."""
        path = Path(path)
        if not path.exists():
            raise ConfigurationError(f"Policy file not found: {path}")

        with open(path, "r") as f:
            if path.suffix in (".yaml", ".yml"):
                data = yaml.safe_load(f)
            else:
                import json

                data = json.load(f)

        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PolicySet:
        """Parse policy from dictionary."""
        if not isinstance(data, dict):
            raise PolicyError("Policy must be a dictionary")

        version = data.get("policyVersion", "0.1")
        if version != "0.1":
            raise PolicyError(f"Unsupported policy version: {version}", version)

        # Parse defaults
        defaults_data = data.get("defaults", {})
        defaults = PolicyDefaults(
            mode=PolicyMode(defaults_data.get("mode", "enforce")),
            unmatched_route_action=UnmatchedAction(
                defaults_data.get("unmatchedRouteAction", "allow")
            ),
            response_block_status_code=defaults_data.get("response", {}).get(
                "blockStatusCode", 403
            ),
            limits=cls._parse_limits(defaults_data.get("limits", {})),
            vulnerability_checks=cls._parse_vulnerability_checks(
                defaults_data.get("vulnerabilityChecks", {})
            ),
        )

        # Parse routes
        routes = []
        for route_data in data.get("routes", []):
            routes.append(cls._parse_route(route_data))

        return PolicySet(
            policy_version=version,
            defaults=defaults,
            routes=routes,
            components=data.get("components", {}),
        )

    @classmethod
    def _parse_limits(cls, data: Dict[str, Any]) -> LimitsConfig:
        """Parse limits configuration."""
        return LimitsConfig(
            max_body_bytes=data.get("maxBodyBytes"),
            max_json_depth=data.get("maxJsonDepth"),
            max_array_length=data.get("maxArrayLength"),
        )

    @classmethod
    def _parse_vulnerability_checks(
        cls, data: Dict[str, Any]
    ) -> VulnerabilityChecksConfig:
        """Parse vulnerability checks configuration."""
        return VulnerabilityChecksConfig(
            prototype_pollution=data.get("prototypePollution", True),
            path_traversal=data.get("pathTraversal", True),
            ssrf_internal=data.get("ssrfInternal", True),
            nosql_injection=data.get("nosqlInjection", False),
            command_injection=data.get("commandInjection", False),
        )

    @classmethod
    def _parse_route(cls, data: Dict[str, Any]) -> PolicyRoute:
        """Parse route configuration."""
        match_data = data.get("match", {})
        match = RouteMatch(
            method=match_data.get("method", "GET"),
            path=match_data.get("path", "/"),
        )

        contract = None
        if "contract" in data:
            contract_data = data["contract"]
            contract = ContractConfig(
                request_schema_ref=contract_data.get("requestSchemaRef"),
                response_schema_ref=contract_data.get("responseSchemaRef"),
                reject_unknown_fields=contract_data.get("rejectUnknownFields", False),
            )

        webhook = None
        if "webhook" in data:
            webhook_data = data["webhook"]
            webhook = WebhookConfig(
                provider=webhook_data.get("provider", ""),
                secret_ref=webhook_data.get("secretRef"),
                secret=webhook_data.get("secret"),
                require_raw_body=webhook_data.get("requireRawBody", True),
                timestamp_tolerance=webhook_data.get("timestampTolerance", 300),
                replay_protection=webhook_data.get("replayProtection", True),
                allowed_event_types=webhook_data.get("allowedEventTypes"),
            )

        vulnerability = None
        if "vulnerability" in data:
            vulnerability = cls._parse_vulnerability_checks(data["vulnerability"])

        rules = []
        for rule_data in data.get("rules", []):
            rules.append(
                PolicyRule(
                    id=rule_data.get("id", "unnamed"),
                    type=RuleType(rule_data.get("type", "cel")),
                    action=RuleAction(rule_data.get("action", "block")),
                    severity=rule_data.get("severity", "high"),
                    config=rule_data.get("config", {}),
                )
            )

        return PolicyRoute(
            id=data.get("id", "unnamed"),
            match=match,
            mode=PolicyMode(data["mode"]) if "mode" in data else None,
            contract=contract,
            webhook=webhook,
            vulnerability=vulnerability,
            rules=rules,
            limits=cls._parse_limits(data.get("limits", {})) if "limits" in data else None,
        )
