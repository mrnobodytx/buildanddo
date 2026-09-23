# ─── CGRF Header ──────────────────────────────
# File:        apps/career/evidence.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/taxonomy.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON apps/career/taxonomy.py; PRODUCES apps/career/passport.py
# DAG Node:    none
# Intent:      Keep who did the work and how it is known explicit, so a claim can never outgrow its evidence.
# ─────────────────────────────────────────────────────────────

"""Define participation, claim states, evidence references and attestations."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from apps.career.taxonomy import BY_ID


class CareerError(ValueError):
    """Raise when career input violates a contract."""


class Participation(str, Enum):
    """Name how a person took part in a unit of work."""

    PERSONALLY_IMPLEMENTED = "PERSONALLY_IMPLEMENTED"
    AGENT_ASSISTED = "AGENT_ASSISTED"
    PERSONALLY_OPERATED = "PERSONALLY_OPERATED"
    DESIGNED = "DESIGNED"
    DIRECTED = "DIRECTED"
    REVIEWED = "REVIEWED"
    VERIFIED = "VERIFIED"
    TEAM_DELIVERED = "TEAM_DELIVERED"
    AGENT_EXECUTED = "AGENT_EXECUTED"
    ASSESSED = "ASSESSED"
    SELF_REPORTED = "SELF_REPORTED"


AUTOMATED = re.compile(
    r"\[bot\]|(?<![a-z])bots?(?![a-z])|dependabot|renovate|github-actions|copilot|datadog-bits"
    r"|anthropic\.com|openai\.com|devin-ai|cursoragent|noreply@github\.com",
    re.IGNORECASE,
)


def looks_automated(identity: str) -> bool:
    """Return whether a git name or email belongs to a bot or AI agent rather than a person."""
    return bool(AUTOMATED.search(identity))


class ClaimState(str, Enum):
    """Name how strongly a piece of evidence is established."""

    VERIFIED = "VERIFIED"
    OBSERVED = "OBSERVED"
    DECLARED = "DECLARED"
    ABSENT = "ABSENT"


# Strongest first. Used to pick the wording a claim may carry.
PARTICIPATION_ORDER: tuple[Participation, ...] = (
    Participation.PERSONALLY_IMPLEMENTED,
    Participation.DESIGNED,
    Participation.PERSONALLY_OPERATED,
    Participation.AGENT_ASSISTED,
    Participation.DIRECTED,
    Participation.VERIFIED,
    Participation.REVIEWED,
    Participation.ASSESSED,
    Participation.TEAM_DELIVERED,
    Participation.SELF_REPORTED,
    Participation.AGENT_EXECUTED,
)

STATE_ORDER: tuple[ClaimState, ...] = (
    ClaimState.VERIFIED,
    ClaimState.OBSERVED,
    ClaimState.DECLARED,
    ClaimState.ABSENT,
)

# The only verbs a claim may use. AGENT_EXECUTED has none: a person cannot claim it.
CLAIM_VERBS: dict[Participation, str | None] = {
    Participation.PERSONALLY_IMPLEMENTED: "Implemented",
    Participation.PERSONALLY_OPERATED: "Operated",
    Participation.AGENT_ASSISTED: "Built with AI agents:",
    Participation.DESIGNED: "Designed",
    Participation.DIRECTED: "Directed implementation of",
    Participation.REVIEWED: "Reviewed and integrated",
    Participation.VERIFIED: "Verified",
    Participation.TEAM_DELIVERED: "Contributed to team delivery of",
    Participation.ASSESSED: "Passed an assessment in",
    Participation.SELF_REPORTED: "Reports experience with",
    Participation.AGENT_EXECUTED: None,
}

# Only these participations may enter through an attestation; git proves the rest.
ATTESTABLE: frozenset[Participation] = frozenset(
    {
        Participation.DESIGNED,
        Participation.DIRECTED,
        Participation.PERSONALLY_OPERATED,
        Participation.VERIFIED,
        Participation.TEAM_DELIVERED,
    }
)


def strongest(values: list[Participation]) -> Participation:
    """Return the strongest participation present."""
    if not values:
        raise CareerError("no participation to rank")
    return min(values, key=PARTICIPATION_ORDER.index)


def best_state(values: list[ClaimState]) -> ClaimState:
    """Return the best-established claim state present."""
    return min(values, key=STATE_ORDER.index) if values else ClaimState.ABSENT


def canonical_digest(value: Any) -> str:
    """Return a sha256 digest over canonical JSON."""
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class EvidenceRef:
    """Point at one record that supports a capability."""

    kind: str
    ref: str
    capability_id: str
    participation: Participation
    state: ClaimState
    observed_at: str
    detail: str

    def to_dict(self) -> dict[str, str]:
        """Serialize to plain JSON values."""
        return {
            "kind": self.kind,
            "ref": self.ref,
            "capability_id": self.capability_id,
            "participation": self.participation.value,
            "state": self.state.value,
            "observed_at": self.observed_at,
            "detail": self.detail,
        }


def _text(raw: dict[str, Any], key: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise CareerError(f"attestation field {key!r} must be a non-empty string")
    return value.strip()


def attestation_evidence(raw: dict[str, Any], person_id: str) -> list[EvidenceRef]:
    """Convert a human attestation into evidence without upgrading it past its support.

    An attestation is VERIFIED only when a verifier other than the person supplies a
    receipt reference. Otherwise it is DECLARED. Self-verification is rejected.
    """
    capability = _text(raw, "capability")
    if capability not in BY_ID:
        raise CareerError(f"unknown capability {capability!r}")
    try:
        participation = Participation(_text(raw, "participation"))
    except ValueError as error:
        raise CareerError("unknown participation") from error
    if participation not in ATTESTABLE:
        raise CareerError(
            f"{participation.value} is established from source history, not attestation"
        )
    statement = _text(raw, "statement")
    observed_at = _text(raw, "observed_at")
    refs = raw.get("evidence_refs")
    if not isinstance(refs, list) or not refs or not all(
        isinstance(item, str) and item.strip() for item in refs
    ):
        raise CareerError("attestation requires at least one evidence reference")
    verifier = raw.get("verifier")
    state = ClaimState.DECLARED
    if verifier is not None:
        if not isinstance(verifier, dict):
            raise CareerError("verifier must be an object")
        verifier_id = _text(verifier, "id")
        receipt = _text(verifier, "receipt")
        if verifier_id == person_id:
            raise CareerError("self-verification cannot settle an attestation")
        state = ClaimState.VERIFIED
        statement = f"{statement} (verified by {verifier_id}: {receipt})"
    return [
        EvidenceRef(
            kind="attestation",
            ref=ref.strip(),
            capability_id=capability,
            participation=participation,
            state=state,
            observed_at=observed_at,
            detail=statement,
        )
        for ref in refs
    ]
