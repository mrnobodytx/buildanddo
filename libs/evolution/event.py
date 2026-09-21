# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/event.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/semantic_twin/promotions.py, libs/semantic_twin/receipts.py, libs/evolution/common.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/promotions.py; CONSUMES libs/semantic_twin/receipts.py; CONSUMES libs/evolution/common.py
# Intent:      Preserve provenance and authority while normalizing local observations into immutable events.
# ───────────────────────────────────────────────────────────────

"""Normalize captured facts without turning source assertions into verification."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState, StringEnum

from .common import identity, unique


class Phase(StringEnum):
    """Name an observation's role without inferring missing episode stages."""

    PROBLEM = "PROBLEM"
    CONTEXT = "CONTEXT"
    HYPOTHESIS = "HYPOTHESIS"
    ACTION = "ACTION"
    RESULT = "RESULT"
    VERIFICATION = "VERIFICATION"


class SourceKind(StringEnum):
    """Identify supported capture families, not installed live integrations."""

    GIT = "git"
    GITLAB = "gitlab"
    DATADOG = "datadog"
    POSTHOG = "posthog"
    SUPABASE = "supabase"
    POCKETBASE = "pocketbase"
    AAXP = "aaxp"
    AGENT = "agent"
    TEST = "test"
    DEPLOYMENT = "deployment"
    TEVV = "tevv"
    GRAPH = "graph"
    MEMORY = "memory"
    MISSION = "mission"
    TELEMETRY = "telemetry"
    EVOLUTION = "evolution"


@dataclass(frozen=True, slots=True, kw_only=True)
class CitadelEvent(Contract):
    """Bind one captured observation to its exact source, scope and authority."""

    scope_id: str
    occurred_at: datetime
    observed_at: datetime
    ingested_at: datetime
    mission_id: str | None
    correlation_id: str
    actor_id: SemanticId
    event_type: str
    subject_id: SemanticId
    subject_version: str
    source_sha: str | None
    source_kind: SourceKind
    source_ref: str
    source_digest: ContentDigest
    evidence_state: EvidenceState
    authority: AuthorityTier
    risk: str
    phase: Phase
    inputs: tuple[str, ...] = ()
    outputs: tuple[str, ...] = ()
    evidence_refs: tuple[str, ...] = ()
    features: Mapping[str, str] = field(default_factory=dict)
    data: Mapping[str, object] = field(default_factory=dict)
    verification: VerificationReceipt | None = None
    event_id: str = ""

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for name in (
            "scope_id",
            "correlation_id",
            "event_type",
            "subject_version",
            "source_ref",
            "risk",
        ):
            text(getattr(self, name), name)
        if self.mission_id is not None:
            text(self.mission_id, "mission_id")
        require(
            self.occurred_at <= self.observed_at <= self.ingested_at,
            "event timestamps must preserve occurred/observed/ingested order",
        )
        if self.source_sha is not None:
            SourceRevision(self.source_sha)
        for name in ("inputs", "outputs", "evidence_refs"):
            unique(getattr(self, name), name)
        for key, value in self.features.items():
            text(key, "feature key")
            text(value, "feature value")
        if self.verification is not None:
            require(
                self.verification.subject == self.subject,
                "event receipt subject mismatch",
            )
            require(
                self.verification.result.evaluated_at <= self.occurred_at,
                "event predates its verification",
            )
            require(
                self.verification.policy.tier is self.authority,
                "event receipt authority mismatch",
            )
        if self.evidence_state is EvidenceState.VERIFIED:
            require(self.verification is not None, "VERIFIED needs a typed receipt")
            assert self.verification is not None
            PromotionProof(
                subject=self.subject,
                evidence=self.verification.result.evidence,
                verification=self.verification,
            ).validate_for(EvidenceState.TESTING, EvidenceState.VERIFIED)
        body = self.to_dict()
        body.pop("event_id")
        body.pop("ingested_at")  # A retry cannot create a new observation.
        expected = str(identity("event", body))
        require(
            not self.event_id or self.event_id == expected, "event content/id mismatch"
        )
        object.__setattr__(self, "event_id", expected)

    @property
    def subject(self) -> SubjectRef:
        """Return the exact revision any verification must name."""
        return SubjectRef(self.subject_id, self.subject_version)

    @property
    def available_at(self) -> datetime:
        """Return when the captured fact was observable at its source."""
        return self.observed_at

    @property
    def stable_payload(self) -> dict[str, object]:
        """Preserve the original observation when ingestion is retried later."""
        result = self.to_dict()
        result.pop("ingested_at")
        return result
