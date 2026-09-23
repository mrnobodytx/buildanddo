# ─── CGRF Header ──────────────────────────────
# File:        apps/career/dossier.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/match.py, apps/career/passport.py, apps/career/taxonomy.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/match.py; DEPENDS_ON apps/career/passport.py; PRODUCES apps/career/compiler.py
# DAG Node:    none
# Intent:      Explain why a role fits, what to lead with and, mandatorily, what must not be claimed.
# ─────────────────────────────────────────────────────────────

"""Turn a coverage map into a match dossier and rank dossiers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from apps.career.evidence import Participation, canonical_digest
from apps.career.jobs import RequirementKind
from apps.career.match import Coverage, CoverageMap
from apps.career.passport import Passport, entry_by_id
from apps.career.taxonomy import BY_ID

STATES = ("STRONG_CANDIDATE", "CANDIDATE", "REAL_GAP")
STRONG_COVERAGE = 0.85
CANDIDATE_COVERAGE = 0.6


@dataclass(frozen=True, slots=True)
class Dossier:
    """Hold the explained match result for one job."""

    body: dict[str, Any]

    @property
    def state(self) -> str:
        """Return the dossier state."""
        return str(self.body["state"])

    @property
    def job_id(self) -> str:
        """Return the job id."""
        return str(self.body["job_id"])

    @property
    def digest(self) -> str:
        """Return the digest of the dossier body."""
        return canonical_digest(self.body)

    def to_dict(self) -> dict[str, Any]:
        """Serialize with the digest."""
        return {**self.body, "digest": self.digest}


def _state(summary: dict[str, Any]) -> str:
    if summary["hard_requirements"] == "FAIL":
        return "REAL_GAP"
    coverage = float(summary["capability_coverage"])
    if coverage >= STRONG_COVERAGE and summary["evidence_depth"] in ("HIGH", "MEDIUM"):
        return "STRONG_CANDIDATE"
    if coverage >= CANDIDATE_COVERAGE:
        return "CANDIDATE"
    return "REAL_GAP"


def build_dossier(coverage: CoverageMap, passport: Passport) -> Dossier:
    """Explain the match, the strategy and the claims that must not be made."""
    entries = entry_by_id(passport)
    summary = coverage.summary
    strong_ids: list[str] = []
    for row in coverage.rows:
        if row.status is Coverage.SUPPORTED:
            strong_ids.extend(cap for cap in row.supporting if cap not in strong_ids)
    strong = sorted((entries[cap] for cap in strong_ids), key=lambda item: (-item.confidence, item.capability_id))
    do_not_claim: list[str] = []
    weak: list[dict[str, str]] = []
    human: list[dict[str, str]] = []
    for row in coverage.rows:
        text = row.requirement.text
        if row.status is Coverage.HUMAN_ATTESTATION:
            human.append({"requirement": text, "reserved_class": str(row.requirement.reserved)})
        elif row.requirement.kind is RequirementKind.TENURE:
            do_not_claim.append(f"{row.requirement.years}+ years for '{text}': {row.note}")
        elif row.requirement.kind is RequirementKind.CREDENTIAL:
            do_not_claim.append(f"'{text}': {row.note}")
        elif row.status in (Coverage.PARTIAL, Coverage.NOT_PROVEN):
            weak.append({"requirement": text, "status": row.status.value, "note": row.note})
            do_not_claim.append(f"'{text}' as demonstrated experience: {row.note}")
    for item in strong:
        if item.claim_participation is not Participation.PERSONALLY_IMPLEMENTED:
            do_not_claim.append(
                f"personal authorship of {item.label}; evidence supports '{item.claim_verb}' only"
            )
    git = next((source for source in passport.sources if source.get("kind") == "git"), None)
    if git and int(git.get("agent_integrated", 0)):
        do_not_claim.append(
            f"personal authorship of {git['agent_integrated']} agent-authored commits; "
            "they were reviewed and integrated, not written by the person"
        )
    if git and int(git.get("agent_assisted", 0)):
        do_not_claim.append(
            f"sole authorship of {git['agent_assisted']} commits that carry an AI or bot co-author; "
            "describe them as built with AI agents"
        )
    do_not_claim.append("any agent-executed work the person did not integrate or direct")
    body = {
        "schema": "buildanddo.career.dossier/v1",
        "job_id": coverage.job.job_id,
        "company": coverage.job.company,
        "role": coverage.job.role,
        "job_digest": coverage.job.digest,
        "passport_digest": passport.digest,
        "state": _state(summary),
        "why": (
            f"{summary['supported']}/{summary['capability_requirements']} capability requirements supported, "
            f"{summary['partial']} partial, {summary['not_proven']} not proven; "
            f"hard requirements {summary['hard_requirements']}; evidence depth {summary['evidence_depth']}"
        ),
        "summary": dict(summary),
        "strong_evidence": [
            {
                "capability_id": item.capability_id,
                "label": item.label,
                "claim_verb": item.claim_verb,
                "claim_participation": item.claim_participation.value,
                "state": item.state.value,
                "records": item.records,
                "confidence": item.confidence,
            }
            for item in strong
        ],
        "weak_areas": weak,
        "application_strategy": {
            "lead_with": [
                f"{item.claim_verb} {BY_ID[item.capability_id].claim_object}" for item in strong[:3]
            ]
        },
        "human_required": human,
        "do_not_claim": do_not_claim,
        "coverage": coverage.to_dict()["rows"],
    }
    return Dossier(body)


_DEPTH = {"HIGH": 3, "MEDIUM": 2, "LOW": 1, "NONE": 0}


def rank(dossiers: list[Dossier]) -> list[Dossier]:
    """Order dossiers by state, coverage, evidence depth, then job id."""
    return sorted(
        dossiers,
        key=lambda item: (
            STATES.index(item.state),
            -float(item.body["summary"]["capability_coverage"]),
            -_DEPTH[str(item.body["summary"]["evidence_depth"])],
            item.job_id,
        ),
    )
