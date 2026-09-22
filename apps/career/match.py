# ─── CGRF Header ──────────────────────────────
# File:        apps/career/match.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/evidence.py, apps/career/jobs.py, apps/career/passport.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/jobs.py; DEPENDS_ON apps/career/passport.py; PRODUCES apps/career/dossier.py
# DAG Node:    none
# Intent:      Map each job requirement to the passport evidence that does or does not support it, instead of a single opaque score.
# ─────────────────────────────────────────────────────────────

"""Compute the Requirement Coverage Map for one job against one passport."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

from apps.career.evidence import ClaimState
from apps.career.jobs import Job, Requirement, RequirementKind, extract_requirements
from apps.career.passport import CapabilityEntry, Passport, entry_by_id

SUPPORT_CONFIDENCE = 0.5
SUPPORTING_STATES = frozenset({ClaimState.VERIFIED, ClaimState.OBSERVED})


class Coverage(str, Enum):
    """Name how far the passport supports one requirement."""

    SUPPORTED = "SUPPORTED"
    PARTIAL = "PARTIAL"
    NOT_PROVEN = "NOT_PROVEN"
    HUMAN_ATTESTATION = "HUMAN_ATTESTATION"


@dataclass(frozen=True, slots=True)
class CoverageRow:
    """Pair one requirement with its evidence status."""

    requirement: Requirement
    status: Coverage
    supporting: tuple[str, ...]
    missing: tuple[str, ...]
    note: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize to plain JSON values."""
        return {
            **self.requirement.to_dict(),
            "status": self.status.value,
            "supporting_capabilities": list(self.supporting),
            "missing_capabilities": list(self.missing),
            "note": self.note,
        }


@dataclass(frozen=True, slots=True)
class CoverageMap:
    """Hold the per-requirement coverage and its summary for one job."""

    job: Job
    passport_digest: str
    rows: tuple[CoverageRow, ...]
    summary: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to plain JSON values."""
        return {
            "job_id": self.job.job_id,
            "job_digest": self.job.digest,
            "passport_digest": self.passport_digest,
            "rows": [row.to_dict() for row in self.rows],
            "summary": dict(self.summary),
        }


def _supports(entry: CapabilityEntry | None) -> bool:
    return (
        entry is not None
        and entry.state in SUPPORTING_STATES
        and entry.confidence >= SUPPORT_CONFIDENCE
    )


def _capability_row(requirement: Requirement, entries: dict[str, CapabilityEntry]) -> CoverageRow:
    if requirement.kind is RequirementKind.UNMAPPED:
        return CoverageRow(
            requirement, Coverage.NOT_PROVEN, (), (),
            "no capability mapping exists for this requirement; it cannot be matched from evidence",
        )
    strong = tuple(cap for cap in requirement.capabilities if _supports(entries.get(cap)))
    present = tuple(cap for cap in requirement.capabilities if cap in entries)
    missing = tuple(cap for cap in requirement.capabilities if cap not in strong)
    if strong and not missing:
        return CoverageRow(requirement, Coverage.SUPPORTED, strong, (), "every mapped capability has supporting evidence")
    if present:
        weak = [cap for cap in present if cap not in strong]
        reason = "declared or low-confidence evidence for " + ", ".join(weak) if weak else ""
        absent = [cap for cap in missing if cap not in entries]
        if absent:
            reason = (reason + "; " if reason else "") + "no evidence for " + ", ".join(absent)
        return CoverageRow(requirement, Coverage.PARTIAL, strong, missing, reason)
    return CoverageRow(
        requirement, Coverage.NOT_PROVEN, (), missing, "no evidence for " + ", ".join(missing)
    )


def _tenure_row(requirement: Requirement, entries: dict[str, CapabilityEntry]) -> CoverageRow:
    relevant = [entries[cap] for cap in requirement.capabilities if cap in entries]
    scope = "related"
    if not requirement.capabilities:
        relevant, scope = list(entries.values()), "overall recorded"
    if relevant:
        span = max(item.observed_span_days for item in relevant)
        note = (
            f"nominal gap: {requirement.years} years of employment is not established by work records; "
            f"{scope} evidence spans {span} days across {len(relevant)} capabilities"
        )
    else:
        note = f"nominal gap: {requirement.years} years not established and no related evidence"
    supporting = tuple(item.capability_id for item in relevant if _supports(item))
    return CoverageRow(requirement, Coverage.NOT_PROVEN, supporting, (), note)


def evaluate(job: Job, passport: Passport) -> CoverageMap:
    """Build the coverage map and summary for one job."""
    entries = entry_by_id(passport)
    rows: list[CoverageRow] = []
    for requirement in extract_requirements(job):
        if requirement.kind in (RequirementKind.CAPABILITY, RequirementKind.UNMAPPED):
            rows.append(_capability_row(requirement, entries))
        elif requirement.kind is RequirementKind.TENURE:
            rows.append(_tenure_row(requirement, entries))
        elif requirement.kind is RequirementKind.CREDENTIAL:
            rows.append(
                CoverageRow(
                    requirement, Coverage.NOT_PROVEN, (), (),
                    "credentials are not derivable from work records",
                )
            )
        else:
            rows.append(
                CoverageRow(
                    requirement, Coverage.HUMAN_ATTESTATION, (), (),
                    f"reserved class {requirement.reserved}; only the human may answer",
                )
            )
    return CoverageMap(job, passport.digest, tuple(rows), summarize(rows, entries))


def summarize(rows: list[CoverageRow], entries: dict[str, CapabilityEntry]) -> dict[str, Any]:
    """Summarize coverage without collapsing it into a single match percentage."""
    capability_rows = [
        row for row in rows
        if row.requirement.kind in (RequirementKind.CAPABILITY, RequirementKind.UNMAPPED)
    ]
    supported = sum(row.status is Coverage.SUPPORTED for row in capability_rows)
    partial = sum(row.status is Coverage.PARTIAL for row in capability_rows)
    not_proven = sum(row.status is Coverage.NOT_PROVEN for row in capability_rows)
    coverage = round((supported + 0.5 * partial) / len(capability_rows), 2) if capability_rows else 0.0
    hard = [row for row in rows if row.requirement.hard]
    if any(
        row.status is Coverage.NOT_PROVEN
        and row.requirement.kind in (RequirementKind.CAPABILITY, RequirementKind.UNMAPPED)
        for row in hard
    ):
        gate = "FAIL"
    elif any(row.status is not Coverage.SUPPORTED for row in hard):
        gate = "REVIEW"
    else:
        gate = "PASS"
    backing = {cap for row in capability_rows if row.status is Coverage.SUPPORTED for cap in row.supporting}
    if backing:
        mean = sum(entries[cap].confidence for cap in backing) / len(backing)
        depth = "HIGH" if mean >= 0.75 else "MEDIUM" if mean >= 0.55 else "LOW"
    else:
        depth = "NONE"
    return {
        "capability_requirements": len(capability_rows),
        "supported": supported,
        "partial": partial,
        "not_proven": not_proven,
        "capability_coverage": coverage,
        "hard_requirements": gate,
        "evidence_depth": depth,
        "tenure_requirements": sum(row.requirement.kind is RequirementKind.TENURE for row in rows),
        "credential_requirements": sum(row.requirement.kind is RequirementKind.CREDENTIAL for row in rows),
        "human_attestations": sum(row.status is Coverage.HUMAN_ATTESTATION for row in rows),
    }
