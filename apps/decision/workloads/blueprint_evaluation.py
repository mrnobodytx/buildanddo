# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/decision/workloads/blueprint_evaluation.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/contract.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/decision/contract.py
# DAG Node:    none
# Intent:      Connect source requirements to authority-bounded review plans while retaining evaluation and PDF provenance.
# ───────────────────────────────────────────────────────────────

"""Evaluate extracted requirements with explicit, inspectable CPU rules."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import re

from apps.decision.contract import DecisionResult, decide
from apps.decision.primitives import Choice, DecisionValidationError, Noul, QuestionType, Score, questions_to_dict
from apps.decision.router import AUTHORITY, RuleMatch
from apps.research.blueprint_models import Blueprint, SourceRef

COMPONENT_TYPES = ("service", "module", "component", "system", "database", "api",
                   "endpoint", "server", "gateway", "queue", "worker", "unassigned")
QUESTIONS: dict[str, QuestionType] = {
    "component_type": Choice(list(COMPONENT_TYPES)),
    "complexity": Score(1, 5),
    "clarity": Score(0, 1),
    "needs_review": Noul(),
}


@dataclass(frozen=True)
class RequirementEvaluation:
    """Retain a BDR receipt and the exact requirement it evaluates."""

    id: str
    blueprint_id: str
    requirement_id: str
    source: SourceRef
    state: dict[str, object]
    questions: dict[str, dict[str, object]]
    decision: DecisionResult

    def to_dict(self) -> dict[str, object]:
        """Serialize the receipt without discarding typed scores."""
        value = asdict(self)
        value["decision"] = self.decision.to_dict()
        return value


def blueprint_rule(name: str, state: dict[str, object] | str, question: QuestionType) -> RuleMatch | None:
    """Answer only the matching blueprint workload with deterministic estimates."""
    if not isinstance(state, dict) or state.get("workload") != "blueprint_requirement_v1":
        return None
    if name not in QUESTIONS or question.to_dict() != QUESTIONS[name].to_dict():
        return None
    requirement = state.get("requirement")
    if not isinstance(requirement, dict):
        return None
    value = requirement.get("text")
    confidence = requirement.get("confidence")
    kinds = requirement.get("component_types")
    if (not isinstance(value, str) or type(confidence) not in (float, int)
            or not isinstance(kinds, list)):
        return None
    if name == "component_type":
        known = [kind for kind in kinds if kind in COMPONENT_TYPES]
        return RuleMatch(known[0]) if known else None
    if name == "clarity":
        return RuleMatch(confidence)
    if name == "needs_review":
        return RuleMatch(True)
    interfaces = len(re.findall(r"\b(depends on|interface|endpoint|API|queue|database)\b", value, re.I))
    clauses = len(re.findall(r"\b(and|or)\b", value, re.I))
    return RuleMatch(float(min(5, 1 + interfaces + clauses // 2 + len(value) // 300)))


async def evaluate_blueprint(blueprint: Blueprint, *, authority: str = "A0") -> list[RequirementEvaluation]:
    """Run BDR on source requirements without converting source text to authority."""
    if authority not in AUTHORITY:
        raise DecisionValidationError("invalid authority")
    entities = {entity.id: entity for entity in blueprint.parsed.entities}
    evaluations = []
    for requirement in blueprint.requirements:
        state: dict[str, object] = {
            "workload": "blueprint_requirement_v1",
            "blueprint_id": blueprint.id,
            "input_sha256": blueprint.input_sha256,
            "requirement": {
                "id": requirement.id, "text": requirement.text,
                "source_id": requirement.source_id, "source": asdict(requirement.source),
                "confidence": requirement.confidence,
                "component_types": [entities[key].kind for key in requirement.entity_ids],
            },
        }
        encoded = json.dumps({"state": state, "questions": questions_to_dict(QUESTIONS)},
                             sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        identity = "evaluation-" + hashlib.sha256(encoded.encode()).hexdigest()
        # Planning has A0 effects even when the caller has broader authority.
        # Never use the Phase 1 frontier stand-in to fill gaps in a blueprint.
        decision = await decide(state, QUESTIONS, authority="A0", trace_id=identity)
        evaluations.append(RequirementEvaluation(identity, blueprint.id, requirement.id, requirement.source,
                                                 state, questions_to_dict(QUESTIONS), decision))
    return evaluations
