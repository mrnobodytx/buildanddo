# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/decision/adapters/contracts.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/blueprint_models.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/research/blueprint_models.py
# DAG Node:    none
# Intent:      Connect source requirements to authority-bounded review plans while retaining evaluation and PDF provenance.
# ───────────────────────────────────────────────────────────────

"""Describe review plans with source and evaluation provenance at every stage."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

from apps.decision.workloads.blueprint_evaluation import RequirementEvaluation
from apps.research.blueprint_models import Requirement, SourceRef
from apps.research.contracts import ResearchError


class BlueprintPlanError(ResearchError):
    """Reject inconsistent plans without quoting source content."""


@dataclass(frozen=True)
class Provenance:
    """Trace one planned requirement to the PDF and its BDR receipt."""

    blueprint_id: str
    requirement_id: str
    evaluation_id: str
    source: SourceRef


@dataclass(frozen=True)
class Dependency:
    """Retain an inferred edge, its source requirements and inference method."""

    component_id: str
    requirement_ids: list[str]
    reason: str
    interface_contract: str
    provider_requirements: list[Requirement] = field(default_factory=list)
    provider_provenance: list[Provenance] = field(default_factory=list)


@dataclass
class Component:
    """Group requirements served by a component."""

    id: str
    name: str
    type: str
    requirements: list[Requirement]
    evaluations: list[RequirementEvaluation]
    dependencies: list[Dependency]
    provenance: list[Provenance]


@dataclass(frozen=True)
class ComponentGraph:
    """Describe inferred components without executing or approving them."""

    blueprint_id: str
    input_sha256: str
    components: list[Component]
    warnings: list[str]
    authority: Literal["A0"] = field(default="A0", init=False)
    verified: Literal[False] = field(default=False, init=False)

    def to_dict(self) -> dict[str, object]:
        """Serialize the graph and all evaluation receipts."""
        return asdict(self)


@dataclass(frozen=True)
class Challenge:
    """Describe a component challenge in dependency order."""

    id: str
    order: int
    component: Component
    requirement_ids: list[str]
    depends_on: list[str]
    estimated_complexity: float | None
    provenance: list[Provenance]
    authority: Literal["A0"] = field(default="A0", init=False)
    verified: Literal[False] = field(default=False, init=False)


@dataclass(frozen=True)
class MissionPlan:
    """Retain ordered challenges as a human-review draft."""

    id: str
    blueprint_id: str
    input_sha256: str
    title: str
    challenges: list[Challenge]
    warnings: list[str]
    status: Literal["draft"] = field(default="draft", init=False)
    authority: Literal["A0"] = field(default="A0", init=False)
    verified: Literal[False] = field(default=False, init=False)

    def to_dict(self) -> dict[str, object]:
        """Serialize an exportable mission draft."""
        return asdict(self)


@dataclass(frozen=True)
class SessionPrompt:
    """Carry a review-only prompt and a complete provenance chain."""

    id: str
    mission_id: str
    challenge_id: str
    component_id: str
    requirement_ids: list[str]
    provenance: list[Provenance]
    prompt: str
    authority: Literal["A0"] = field(default="A0", init=False)
    verified: Literal[False] = field(default=False, init=False)
    review_required: Literal[True] = field(default=True, init=False)

    def to_dict(self) -> dict[str, object]:
        """Serialize a prompt for explicit human review."""
        return asdict(self)
