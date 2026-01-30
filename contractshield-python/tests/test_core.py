"""Tests for core ContractShield components."""

import pytest

from contractshield.core import (
    Action,
    Decision,
    Identity,
    RiskLevel,
    RiskScore,
    RuleHit,
    Severity,
    ValidationResult,
)


class TestRuleHit:
    """Test RuleHit data class."""

    def test_create_rule_hit(self):
        hit = RuleHit(
            id="test.rule",
            severity=Severity.HIGH,
            message="Test message",
            path="$.user.name",
            value="test",
        )
        assert hit.id == "test.rule"
        assert hit.severity == Severity.HIGH
        assert hit.message == "Test message"

    def test_to_dict(self):
        hit = RuleHit(
            id="test.rule",
            severity=Severity.CRITICAL,
            message="Critical issue",
        )
        d = hit.to_dict()
        assert d["id"] == "test.rule"
        assert d["severity"] == "critical"
        assert d["message"] == "Critical issue"


class TestRiskScore:
    """Test RiskScore calculations."""

    def test_no_hits(self):
        score = RiskScore.from_rule_hits([])
        assert score.score == 0
        assert score.level == RiskLevel.NONE

    def test_low_severity(self):
        hits = [RuleHit(id="test", severity=Severity.LOW, message="Test")]
        score = RiskScore.from_rule_hits(hits)
        assert score.level == RiskLevel.LOW

    def test_medium_severity(self):
        hits = [RuleHit(id="test", severity=Severity.MEDIUM, message="Test")]
        score = RiskScore.from_rule_hits(hits)
        assert score.level == RiskLevel.MEDIUM

    def test_high_severity(self):
        hits = [RuleHit(id="test", severity=Severity.HIGH, message="Test")]
        score = RiskScore.from_rule_hits(hits)
        assert score.level == RiskLevel.HIGH

    def test_critical_severity(self):
        hits = [RuleHit(id="test", severity=Severity.CRITICAL, message="Test")]
        score = RiskScore.from_rule_hits(hits)
        assert score.level == RiskLevel.CRITICAL
        assert score.score == 100

    def test_multiple_hits_uses_max_severity(self):
        hits = [
            RuleHit(id="low", severity=Severity.LOW, message="Low"),
            RuleHit(id="high", severity=Severity.HIGH, message="High"),
        ]
        score = RiskScore.from_rule_hits(hits)
        assert score.level == RiskLevel.HIGH


class TestDecision:
    """Test Decision creation."""

    def test_allow_decision(self):
        decision = Decision.allow()
        assert decision.action == Action.ALLOW
        assert decision.status_code == 200

    def test_block_decision(self):
        hits = [RuleHit(id="test", severity=Severity.CRITICAL, message="Blocked")]
        decision = Decision.block(
            reason="Security violation",
            rule_hits=hits,
        )
        assert decision.action == Action.BLOCK
        assert decision.status_code == 403
        assert decision.reason == "Security violation"
        assert len(decision.rule_hits) == 1

    def test_monitor_decision(self):
        hits = [RuleHit(id="test", severity=Severity.MEDIUM, message="Warning")]
        decision = Decision.monitor(
            reason="Suspicious activity",
            rule_hits=hits,
        )
        assert decision.action == Action.MONITOR
        assert decision.status_code == 200

    def test_to_dict(self):
        decision = Decision.allow(metadata={"trace_id": "123"})
        d = decision.to_dict()
        assert d["action"] == "ALLOW"
        assert d["statusCode"] == 200
        assert d["metadata"]["trace_id"] == "123"


class TestIdentity:
    """Test Identity data class."""

    def test_default_unauthenticated(self):
        identity = Identity()
        assert identity.authenticated is False
        assert identity.subject is None
        assert identity.tenant is None
        assert identity.scopes == []
        assert identity.roles == []

    def test_authenticated_user(self):
        identity = Identity(
            authenticated=True,
            subject="user-123",
            tenant="tenant-456",
            roles=["admin", "user"],
            scopes=["read", "write"],
        )
        assert identity.authenticated is True
        assert identity.subject == "user-123"
        assert identity.tenant == "tenant-456"
        assert "admin" in identity.roles
        assert "read" in identity.scopes


class TestValidationResult:
    """Test ValidationResult."""

    def test_valid_result(self):
        result = ValidationResult(valid=True)
        assert result.valid is True
        assert result.errors == []

    def test_invalid_result(self):
        result = ValidationResult(
            valid=False,
            errors=[
                {"path": "$.name", "message": "Required field missing"},
                {"path": "$.email", "message": "Invalid format"},
            ],
        )
        assert result.valid is False
        assert len(result.errors) == 2

    def test_to_rule_hits(self):
        result = ValidationResult(
            valid=False,
            errors=[{"path": "$.name", "message": "Required"}],
        )
        hits = result.to_rule_hits()
        assert len(hits) == 1
        assert hits[0].severity == Severity.HIGH
        assert hits[0].message == "Required"
