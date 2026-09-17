# ─── CGRF Header ──────────────────────────────
# File:        apps/decision/workloads/definitions.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/primitives.py, apps/decision/router.py
# EnumType:    ConfigDoc
# EnumEdges:   DEPENDS_ON apps/decision/primitives.py; PRODUCES apps/decision/router.py
# DAG Node:    none
# Intent:      Define six inspectable trial workloads with typed questions, deterministic rules, examples and expected ranges.
# ───────────────────────────────────────────────────────────

"""Define the six Phase 1 decision trial workloads."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Mapping

from apps.decision.primitives import Choice, Noul, QuestionType, Score
from apps.decision.router import Rule, RuleMatch


@dataclass(frozen=True)
class Workload:
    """Group a typed question set with deterministic trial fixtures."""

    name: str
    description: str
    questions: dict[str, QuestionType]
    rules: dict[str, Rule]
    example_states: tuple[dict[str, object], ...]
    expected_ranges: dict[str, object]


def _text(state: dict[str, object] | str) -> str:
    return (
        state if isinstance(state, str) else json.dumps(state, sort_keys=True)
    ).lower()


def _keyword_choice(options: Mapping[str, tuple[str, ...]]) -> Rule:
    def match(
        state: dict[str, object] | str, _question: QuestionType
    ) -> RuleMatch | None:
        source = _text(state)
        for option, words in options.items():
            if any(word in source for word in words):
                return RuleMatch(option)
        return None

    return match


def _urgency(
    state: dict[str, object] | str, _question: QuestionType
) -> RuleMatch | None:
    source = _text(state)
    if any(word in source for word in ("security", "outage", "data loss", "unsafe")):
        return RuleMatch(9.5)
    if any(
        word in source
        for word in ("customer blocked", "payment failed", "deadline today")
    ):
        return RuleMatch(8.0)
    if any(word in source for word in ("cosmetic", "nice to have", "typo")):
        return RuleMatch(2.0)
    return None


def _should_act(
    state: dict[str, object] | str, _question: QuestionType
) -> RuleMatch | None:
    if not isinstance(state, dict):
        return None
    count = state.get("evidence_count")
    contradicted = state.get("contradicted", False)
    if count == 0:
        return RuleMatch(False, probability=0.98)
    if type(count) is int and count >= 2 and contradicted is False:
        return RuleMatch(True, probability=0.92)
    if contradicted is True:
        return RuleMatch(False, probability=0.9)
    return None


def _support(
    state: dict[str, object] | str, _question: QuestionType
) -> RuleMatch | None:
    if not isinstance(state, dict):
        return None
    supporting = state.get("supporting_sources")
    contradicting = state.get("contradicting_sources")
    if (
        type(supporting) is not int
        or type(contradicting) is not int
        or supporting < 0
        or contradicting < 0
    ):
        return None
    total = supporting + contradicting
    value = 0.0 if total == 0 else supporting / total
    return RuleMatch(value, probability=1.0)


CHALLENGE_SELECTION = Workload(
    name="challenge_selection",
    description="Choose the bounded Challenge lane that best matches a submitted problem.",
    questions={
        "challenge": Choice(["customer_support", "operations", "product", "knowledge"])
    },
    rules={
        "challenge": _keyword_choice(
            {
                "customer_support": ("support", "ticket", "customer complaint"),
                "operations": ("outage", "incident", "workflow", "operations"),
                "product": ("feature", "product feedback", "usability"),
                "knowledge": ("documentation", "how do", "knowledge"),
            }
        )
    },
    example_states=(
        {"problem": "Support tickets wait two days before a response."},
        {"problem": "Our operations workflow loses handoffs."},
    ),
    expected_ranges={
        "challenge": ["customer_support", "operations", "product", "knowledge"]
    },
)

ISSUE_CLASSIFICATION = Workload(
    name="issue_classification",
    description="Classify an issue without starting a support or product workflow.",
    questions={
        "issue_type": Choice(
            ["tool_issue", "knowledge_gap", "product_feedback", "support", "other"]
        )
    },
    rules={
        "issue_type": _keyword_choice(
            {
                "tool_issue": ("tool failed", "timeout", "exception", "error"),
                "knowledge_gap": ("how do", "documentation", "unclear"),
                "product_feedback": ("feature request", "feedback", "would be better"),
                "support": ("account", "billing", "help me"),
            }
        )
    },
    example_states=(
        {"description": "The read-only tool failed with a timeout."},
        {"description": "How do I connect a workspace?"},
    ),
    expected_ranges={
        "issue_type": [
            "tool_issue",
            "knowledge_gap",
            "product_feedback",
            "support",
            "other",
        ]
    },
)

URGENCY_SCORING = Workload(
    name="urgency_scoring",
    description="Score operational or customer urgency from zero to ten.",
    questions={"urgency": Score(0, 10)},
    rules={"urgency": _urgency},
    example_states=(
        {"description": "A production outage blocks all customers."},
        {"description": "A cosmetic typo appears in settings."},
    ),
    expected_ranges={"urgency": {"min": 0.0, "max": 10.0}},
)

ACTION_NO_ACTION = Workload(
    name="action_no_action",
    description="Judge whether existing evidence is sufficient to recommend a separate next step.",
    questions={"should_act": Noul()},
    rules={"should_act": _should_act},
    example_states=(
        {"evidence_count": 3, "contradicted": False},
        {"evidence_count": 0, "contradicted": False},
    ),
    expected_ranges={"should_act": [False, True]},
)

TOOL_ROUTING = Workload(
    name="tool_routing",
    description="Choose the next read-only query without invoking it.",
    questions={
        "tool": Choice(
            ["workspace_history", "evidence_search", "status_check", "documentation"]
        )
    },
    rules={
        "tool": _keyword_choice(
            {
                "workspace_history": ("previous work", "already tried", "history"),
                "evidence_search": ("evidence", "source", "claim"),
                "status_check": ("status", "outage", "availability"),
                "documentation": ("docs", "documentation", "how do"),
            }
        )
    },
    example_states=(
        {"question": "Has another seat already tried this work?"},
        {"question": "Check the current service status."},
    ),
    expected_ranges={
        "tool": [
            "workspace_history",
            "evidence_search",
            "status_check",
            "documentation",
        ]
    },
)

EVIDENCE_SUPPORT = Workload(
    name="evidence_support",
    description="Score support for a claim without conferring verified status.",
    questions={"support": Score(0, 1)},
    rules={"support": _support},
    example_states=(
        {"supporting_sources": 3, "contradicting_sources": 1},
        {"supporting_sources": 0, "contradicting_sources": 0},
    ),
    expected_ranges={"support": {"min": 0.0, "max": 1.0, "verified": False}},
)

WORKLOADS = (
    CHALLENGE_SELECTION,
    ISSUE_CLASSIFICATION,
    URGENCY_SCORING,
    ACTION_NO_ACTION,
    TOOL_ROUTING,
    EVIDENCE_SUPPORT,
)
RULES_BY_QUESTION: dict[str, Rule] = {
    name: rule for workload in WORKLOADS for name, rule in workload.rules.items()
}

__all__ = [
    "ACTION_NO_ACTION",
    "CHALLENGE_SELECTION",
    "EVIDENCE_SUPPORT",
    "ISSUE_CLASSIFICATION",
    "RULES_BY_QUESTION",
    "TOOL_ROUTING",
    "URGENCY_SCORING",
    "WORKLOADS",
    "Workload",
]
