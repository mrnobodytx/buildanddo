# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/career_passport/models.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/evolution/common.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/receipts.py
# EnumType:    Schema
# EnumEdges:   CONSUMES libs/evolution/common.py; CONSUMES libs/semantic_twin/contracts.py; CONSUMES libs/semantic_twin/identity.py; CONSUMES libs/semantic_twin/merkle.py; CONSUMES libs/semantic_twin/receipts.py
# Intent:      Bind personal participation, exact work artifacts and review subjects without inferring authorship from account ownership.
# ───────────────────────────────────────────────────────────────

"""Describe work rather than self-declared qualifications or employment history."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from libs.evolution.common import digest, unique
from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.receipts import VerificationReceipt

MAX_ARTIFACT_BYTES = 4_000_000
MAX_BUNDLE_BYTES = 24_000_000


class Participation(str, Enum):
    """Keep personal, team and agent work distinct through application generation."""

    PERSONALLY_IMPLEMENTED = "PERSONALLY_IMPLEMENTED"
    PERSONALLY_OPERATED = "PERSONALLY_OPERATED"
    DESIGNED = "DESIGNED"
    DIRECTED = "DIRECTED"
    REVIEWED = "REVIEWED"
    VERIFIED = "VERIFIED"
    TEAM_DELIVERED = "TEAM_DELIVERED"
    AGENT_EXECUTED = "AGENT_EXECUTED"


VERBS = {
    Participation.PERSONALLY_IMPLEMENTED: "Personally implemented",
    Participation.PERSONALLY_OPERATED: "Personally operated",
    Participation.DESIGNED: "Designed",
    Participation.DIRECTED: "Directed implementation of",
    Participation.REVIEWED: "Reviewed",
    Participation.VERIFIED: "Verified the outcome of",
    Participation.TEAM_DELIVERED: "Contributed to team delivery of",
    Participation.AGENT_EXECUTED: "Agent executed",
}


def bounded_text(value: str, name: str, limit: int = 1200) -> None:
    """Reject blank, oversized or control-bearing prose before serialization."""
    text(value, name)
    require(len(value) <= limit, name + " exceeds bound")
    require(
        not any(ord(c) < 32 and c not in "\n\t" for c in value),
        name + " contains controls",
    )


def slug(value: str) -> None:
    """Require a capability identifier independent of any job's free-form prose."""
    require(
        re.fullmatch(r"[a-z][a-z0-9_]{0,79}", value) is not None,
        "invalid capability key",
    )


@dataclass(frozen=True, slots=True)
class Artifact(Contract):
    """Retain exact text bytes and their source revision; a digest is not trust."""

    locator: str
    source_revision: str
    recorded_at: datetime
    producer: SemanticId
    content: str
    sha256: ContentDigest

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        bounded_text(self.locator, "artifact locator", 1000)
        bounded_text(self.source_revision, "source revision", 200)
        if self.locator.startswith("git:"):
            SourceRevision(self.source_revision)
        require(
            0 < len(self.content.encode()) <= MAX_ARTIFACT_BYTES,
            "artifact exceeds bound",
        )
        require(
            ContentDigest(hashlib.sha256(self.content.encode()).hexdigest())
            == self.sha256,
            "artifact bytes changed",
        )

    @property
    def source(self) -> SemanticId:
        """Address all source metadata as well as the retained bytes."""
        return SemanticId("cni://artifact/career/" + digest(self))


@dataclass(frozen=True, slots=True)
class Contribution(Contract):
    """Bind a participant and exact activity to artifacts for external review."""

    participant: SemanticId
    producer: SemanticId
    workspace: str
    project: str
    participation: Participation
    agent_assistance: bool | None
    activity: str
    capabilities: tuple[str, ...]
    scope: tuple[str, ...]
    occurred_at: datetime
    artifact_ids: tuple[SemanticId, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        if self.participation is Participation.AGENT_EXECUTED:
            self.participant.require_namespace("agent", "system")
        else:
            self.participant.require_namespace("person")
        for name in ("workspace", "project", "activity"):
            bounded_text(getattr(self, name), name)
        require(0 < len(self.capabilities) <= 20, "explicit capabilities required")
        unique(self.capabilities, "capability")
        for key in self.capabilities:
            slug(key)
        require(0 < len(self.scope) <= 12, "explicit scope required")
        unique(self.scope, "scope")
        for item in self.scope:
            slug(item)
        require(0 < len(self.artifact_ids) <= 30, "explicit work artifacts required")
        unique(tuple(map(str, self.artifact_ids)), "artifact")
        for source in self.artifact_ids:
            source.require_namespace("artifact")

    @property
    def subject(self) -> SubjectRef:
        """Bind review to every word, role, time, scope and evidence reference."""
        value = digest(self)
        return SubjectRef(SemanticId("cni://claim/career/" + value), value)

    @property
    def statement(self) -> str:
        """Keep reviewed participation explicit in every application sentence."""
        assisted = (
            " (agent assistance unmeasured)"
            if self.agent_assistance is None
            else " (with agent assistance)"
            if self.agent_assistance
            else ""
        )
        return (
            f"{VERBS[self.participation]} {self.activity} for {self.project}{assisted}."
        )


@dataclass(frozen=True, slots=True)
class WorkBundle(Contract):
    """Transport observations and receipts, never a self-authenticating passport."""

    workspace: str
    captured_at: datetime
    artifacts: tuple[Artifact, ...]
    contributions: tuple[Contribution, ...]
    reviews: tuple[VerificationReceipt, ...] = ()
    gaps: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        bounded_text(self.workspace, "workspace")
        require(
            len(self.artifacts) <= 500 and len(self.contributions) <= 500,
            "work capture exceeds bound",
        )
        require(
            len(self.reviews) <= 500 and len(self.gaps) <= 100,
            "review/gap capture exceeds bound",
        )
        require(
            sum(len(a.content.encode()) for a in self.artifacts) <= MAX_BUNDLE_BYTES,
            "work bytes exceed bound",
        )
        unique(tuple(str(a.source) for a in self.artifacts), "work source")
        unique(
            tuple(str(c.subject.semantic_id) for c in self.contributions),
            "contribution",
        )
        unique(tuple(digest(r) for r in self.reviews), "review")
        require(
            all(a.recorded_at <= self.captured_at for a in self.artifacts),
            "future artifact",
        )
        require(
            all(
                c.workspace == self.workspace and c.occurred_at <= self.captured_at
                for c in self.contributions
            ),
            "foreign or future contribution",
        )
        for gap in self.gaps:
            bounded_text(gap, "gap")
