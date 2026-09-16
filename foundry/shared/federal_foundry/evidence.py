# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/evidence.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/models.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/models.py
# DAG Node:    foundry.evidence
# Intent:      Gate requirement and claim status on explicit, referenced evidence states.
# ───────────────────────────────────────────────────────────────

"""Compile requirement and claim status from explicit evidence."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping

from .models import (
    ASSERTION_LEVELS,
    REQUIREMENT_STATES,
    EvidenceRecord,
    FoundryValidationError,
    Opportunity,
)


def _cell(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def _identities(value: object, field: str) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)) or not all(
        isinstance(item, str) and item for item in value
    ):
        raise FoundryValidationError(f"{field} must be a list of identities")
    if len(set(value)) != len(value):
        raise FoundryValidationError(f"{field} contains duplicate identities")
    return tuple(value)


def evidence_index(records: Iterable[EvidenceRecord]) -> dict[str, EvidenceRecord]:
    """Index evidence records while rejecting conflicting duplicate identities."""

    indexed: dict[str, EvidenceRecord] = {}
    for record in records:
        if record.evidence_id in indexed:
            raise FoundryValidationError(f"duplicate evidence id: {record.evidence_id}")
        indexed[record.evidence_id] = record
    return indexed


@dataclass(frozen=True)
class RequirementRow:
    """Describe one compiled requirement state."""

    requirement_id: str
    text: str
    acceptance: str
    status: str
    evidence_ids: tuple[str, ...]
    justification: str


class RequirementTracker:
    """Apply result updates without allowing unsupported satisfaction."""

    def __init__(
        self, opportunity: Opportunity, evidence: Mapping[str, EvidenceRecord]
    ) -> None:
        self._evidence = dict(evidence)
        self._rows = {
            str(record["id"]): RequirementRow(
                requirement_id=str(record["id"]),
                text=str(record["text"]),
                acceptance=str(record["acceptance"]),
                status=str(record.get("status", "open")),
                evidence_ids=_identities(
                    record.get("evidence_ids", []),
                    f"requirements.{record['id']}.evidence_ids",
                ),
                justification=str(record.get("justification", "")),
            )
            for record in opportunity.requirements
        }
        for row in self._rows.values():
            self._validate(row)

    def _validate(self, row: RequirementRow) -> None:
        if row.status not in REQUIREMENT_STATES:
            raise FoundryValidationError(f"unknown requirement status: {row.status}")
        unknown = sorted(set(row.evidence_ids) - set(self._evidence))
        if unknown:
            raise FoundryValidationError(
                f"requirement {row.requirement_id} references unknown evidence: {unknown}"
            )
        states = [self._evidence[item].state for item in row.evidence_ids]
        if row.status == "satisfied" and (
            not states or any(state != "verified" for state in states)
        ):
            raise FoundryValidationError(
                f"requirement {row.requirement_id} needs verified evidence"
            )
        if row.status == "satisfied" and any(
            row.requirement_id not in self._evidence[item].requirement_ids
            for item in row.evidence_ids
        ):
            raise FoundryValidationError(
                "verified evidence does not cover this requirement"
            )
        if row.status == "partial" and not any(
            state in {"observed", "verified"} for state in states
        ):
            raise FoundryValidationError(
                f"requirement {row.requirement_id} needs observed evidence for partial status"
            )
        if row.status == "not_applicable" and not row.justification.strip():
            raise FoundryValidationError(
                f"requirement {row.requirement_id} needs a not-applicable justification"
            )

    def apply(self, updates: Iterable[Mapping[str, object]]) -> None:
        """Apply validated requirement updates by identity."""

        seen: set[str] = set()
        staged = dict(self._rows)
        for update in updates:
            if not {"id", "status"}.issubset(update) or set(update) - {
                "id",
                "status",
                "evidence_ids",
                "justification",
            }:
                raise FoundryValidationError("unknown requirement update fields")
            identity = str(update["id"])
            if identity in seen:
                raise FoundryValidationError(
                    f"duplicate requirement update: {identity}"
                )
            seen.add(identity)
            current = self._rows.get(identity)
            if current is None:
                raise FoundryValidationError(f"unknown requirement update: {identity}")
            row = RequirementRow(
                requirement_id=identity,
                text=current.text,
                acceptance=current.acceptance,
                status=str(update["status"]),
                evidence_ids=_identities(
                    update.get("evidence_ids", []),
                    f"requirement_updates.{identity}.evidence_ids",
                ),
                justification=str(update.get("justification", "")),
            )
            self._validate(row)
            staged[identity] = row
        self._rows = staged

    def rows(self) -> tuple[RequirementRow, ...]:
        """Return requirement rows in stable identity order."""

        return tuple(self._rows[key] for key in sorted(self._rows))

    def is_complete(self) -> bool:
        """Return whether every requirement is satisfied or justified as inapplicable."""

        return bool(self._rows) and all(
            row.status in {"satisfied", "not_applicable"} for row in self.rows()
        )

    def to_markdown(self) -> str:
        """Render a deterministic requirement matrix."""

        lines = [
            "# Requirements matrix",
            "",
            "| ID | Requirement | Acceptance | Status | Evidence | Justification |",
            "|---|---|---|---|---|---|",
        ]
        for row in self.rows():
            lines.append(
                "| "
                + " | ".join(
                    _cell(value)
                    for value in (
                        row.requirement_id,
                        row.text,
                        row.acceptance,
                        row.status,
                        ", ".join(row.evidence_ids) or "none",
                        row.justification or "none",
                    )
                )
                + " |"
            )
        return "\n".join(lines) + "\n"


@dataclass(frozen=True)
class ClaimRow:
    """Describe one claim and the evidence support the compiler found."""

    claim_id: str
    text: str
    requested_level: str
    support_level: str
    evidence_ids: tuple[str, ...]


class ClaimEvidenceCompiler:
    """Compile claim support and reject unsupported status promotion."""

    def __init__(
        self, opportunity: Opportunity, evidence: Mapping[str, EvidenceRecord]
    ) -> None:
        self._claims = {
            str(record["id"]): dict(record) for record in opportunity.claims
        }
        self._evidence = dict(evidence)

    def compile(self, updates: Iterable[Mapping[str, object]]) -> tuple[ClaimRow, ...]:
        """Merge claim updates and compute their maximum supported level."""

        merged = {identity: dict(record) for identity, record in self._claims.items()}
        seen: set[str] = set()
        for update in updates:
            if set(update) - {"id", "assertion_level", "evidence_ids"}:
                raise FoundryValidationError(
                    "claim updates cannot rewrite the claim text"
                )
            identity = str(update["id"])
            if identity in seen:
                raise FoundryValidationError(f"duplicate claim update: {identity}")
            seen.add(identity)
            if identity not in merged:
                raise FoundryValidationError(f"unknown claim update: {identity}")
            merged[identity].update(update)
        rows: list[ClaimRow] = []
        for identity in sorted(merged):
            claim = merged[identity]
            references = _identities(
                claim.get("evidence_ids", []), f"claims.{identity}.evidence_ids"
            )
            unknown = sorted(set(references) - set(self._evidence))
            if unknown:
                raise FoundryValidationError(
                    f"claim {identity} references unknown evidence: {unknown}"
                )
            states = [self._evidence[item].state for item in references]
            if "rejected" in states:
                support = "rejected"
            elif states and all(state == "verified" for state in states):
                support = "verified"
            elif states and all(state in {"observed", "verified"} for state in states):
                support = "observed"
            elif states:
                support = "planned"
            else:
                support = "unsupported"
            requested = str(claim["assertion_level"])
            if requested not in ASSERTION_LEVELS:
                raise FoundryValidationError("unknown claim assertion level")
            if requested == "verified" and support != "verified":
                raise FoundryValidationError(
                    f"claim {identity} lacks verified evidence"
                )
            if requested == "verified" and any(
                identity not in self._evidence[item].claim_ids for item in references
            ):
                raise FoundryValidationError(
                    "verified evidence does not cover this claim"
                )
            if requested == "observed" and support not in {"observed", "verified"}:
                raise FoundryValidationError(
                    f"claim {identity} lacks observed evidence"
                )
            rows.append(
                ClaimRow(
                    claim_id=identity,
                    text=str(claim["text"]),
                    requested_level=requested,
                    support_level=support,
                    evidence_ids=references,
                )
            )
        return tuple(rows)

    @staticmethod
    def to_markdown(rows: Iterable[ClaimRow]) -> str:
        """Render a deterministic claim-to-evidence matrix."""

        lines = [
            "# Claim-evidence matrix",
            "",
            "| ID | Claim | Requested | Supported | Evidence |",
            "|---|---|---|---|---|",
        ]
        for row in rows:
            lines.append(
                "| "
                + " | ".join(
                    _cell(value)
                    for value in (
                        row.claim_id,
                        row.text,
                        row.requested_level,
                        row.support_level,
                        ", ".join(row.evidence_ids) or "none",
                    )
                )
                + " |"
            )
        return "\n".join(lines) + "\n"
