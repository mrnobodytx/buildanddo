# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/models.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/opportunity.schema.json
# EnumType:    Schema
# EnumEdges:   CONSUMES foundry/registry/opportunity.schema.json
# DAG Node:    foundry.models
# Intent:      Represent validated opportunity, result and evidence records without granting claim authority.
# ───────────────────────────────────────────────────────────────

"""Represent validated federal foundry records."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence
import re


EVIDENCE_STATES = frozenset({"planned", "observed", "verified", "rejected"})
REQUIREMENT_STATES = frozenset(
    {"open", "partial", "satisfied", "blocked", "not_applicable"}
)
ASSERTION_LEVELS = frozenset({"proposed", "observed", "verified"})
LANE_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class CitadelError(Exception):
    """Identify typed failures within the public foundry boundary."""


class FoundryValidationError(CitadelError, ValueError):
    """Report a malformed or internally inconsistent foundry record."""


def _text(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise FoundryValidationError(f"{field} must be a non-empty string")
    return value.strip()


def _string_list(value: object, field: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise FoundryValidationError(f"{field} must be a list of strings")
    return tuple(_text(item, field) for item in value)


def _records(
    value: object, section: str, required_fields: tuple[str, ...]
) -> tuple[dict[str, object], ...]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise FoundryValidationError(f"{section} must be a list")
    records: list[dict[str, object]] = []
    identities: set[str] = set()
    for index, raw in enumerate(value):
        if not isinstance(raw, Mapping):
            raise FoundryValidationError(f"{section}[{index}] must be an object")
        record = dict(raw)
        for field in required_fields:
            record[field] = _text(record.get(field), f"{section}[{index}].{field}")
        identity = str(record["id"])
        if identity in identities:
            raise FoundryValidationError(f"duplicate {section} id: {identity}")
        identities.add(identity)
        records.append(record)
    return tuple(records)


@dataclass(frozen=True)
class EvidenceRecord:
    """Describe one evidence artifact and its observed verification state."""

    evidence_id: str
    title: str
    state: str
    locator: str
    digest: str | None = None
    requirement_ids: tuple[str, ...] = ()
    claim_ids: tuple[str, ...] = ()
    review: dict[str, object] | None = None

    def __post_init__(self) -> None:
        from datetime import datetime

        if self.state not in EVIDENCE_STATES:
            raise FoundryValidationError("unknown evidence state")
        for value in (self.evidence_id, self.title, self.locator):
            _text(value, "evidence")
        for references in (self.requirement_ids, self.claim_ids):
            if len(references) != len(set(references)):
                raise FoundryValidationError("duplicate evidence scope identity")
        if self.digest is not None and (
            not isinstance(self.digest, str) or SHA256.fullmatch(self.digest) is None
        ):
            raise FoundryValidationError("evidence digest must be a lowercase SHA-256")
        if self.state == "verified":
            review = self.review
            if not self.digest or not isinstance(review, dict):
                raise FoundryValidationError(
                    "verified evidence needs a digest and review"
                )
            for field in ("reviewer", "method", "scope", "reviewed_at"):
                _text(review.get(field), f"review.{field}")
            if review.get("outcome") != "pass" or review.get("digest") != self.digest:
                raise FoundryValidationError(
                    "evidence review must pass against the same digest"
                )
            try:
                reviewed_at = datetime.fromisoformat(
                    str(review["reviewed_at"]).replace("Z", "+00:00")
                )
                if reviewed_at.tzinfo is None:
                    raise ValueError("timezone required")
            except ValueError as error:
                raise FoundryValidationError(
                    "review timestamp needs an ISO timezone"
                ) from error

    @classmethod
    def from_mapping(cls, value: Mapping[str, object], field: str) -> EvidenceRecord:
        """Validate and construct an evidence record."""

        state = _text(value.get("state"), f"{field}.state")
        if state not in EVIDENCE_STATES:
            raise FoundryValidationError(f"{field}.state is not recognized: {state}")
        digest = value.get("digest")
        if digest is not None and (
            not isinstance(digest, str) or SHA256.fullmatch(digest) is None
        ):
            raise FoundryValidationError(f"{field}.digest must be a lowercase SHA-256")
        raw_review = value.get("review")
        if raw_review is not None and not isinstance(raw_review, Mapping):
            raise FoundryValidationError("evidence review must be an object")
        return cls(
            evidence_id=_text(value.get("id"), f"{field}.id"),
            title=_text(value.get("title"), f"{field}.title"),
            state=state,
            locator=_text(value.get("locator"), f"{field}.locator"),
            digest=digest,
            requirement_ids=_string_list(
                value.get("requirement_ids", ()), f"{field}.requirement_ids"
            ),
            claim_ids=_string_list(value.get("claim_ids", ()), f"{field}.claim_ids"),
            review=dict(raw_review) if isinstance(raw_review, Mapping) else None,
        )


@dataclass(frozen=True)
class Opportunity:
    """Hold one validated opportunity planning record."""

    lane_id: str
    topic: str
    requirements: tuple[dict[str, object], ...]
    eligibility: tuple[dict[str, object], ...]
    deliverables: tuple[dict[str, object], ...]
    metrics: tuple[dict[str, object], ...]
    milestones: tuple[dict[str, object], ...]
    claims: tuple[dict[str, object], ...]
    evidence_required: tuple[dict[str, object], ...]
    evidence_available: tuple[dict[str, object], ...]
    evidence_missing: tuple[dict[str, object], ...]
    deadline: str | None
    submission_format: dict[str, object]

    @classmethod
    def from_mapping(cls, value: Mapping[str, object]) -> Opportunity:
        """Validate an opportunity and all of its local references."""

        if value.get("schema_version") != "foundry.opportunity/v1":
            raise FoundryValidationError("unsupported opportunity schema_version")
        lane_id = _text(value.get("lane_id"), "lane_id")
        if LANE_ID.fullmatch(lane_id) is None:
            raise FoundryValidationError("lane_id must be a lowercase slug")
        requirements = _records(
            value.get("requirements"), "requirements", ("id", "text", "acceptance")
        )
        eligibility = _records(
            value.get("eligibility"), "eligibility", ("id", "criterion", "status")
        )
        deliverables = _records(
            value.get("deliverables"), "deliverables", ("id", "name", "status")
        )
        metrics = _records(value.get("metrics"), "metrics", ("id", "name", "status"))
        milestones = _records(
            value.get("milestones"), "milestones", ("id", "name", "status")
        )
        claims = _records(
            value.get("claims"), "claims", ("id", "text", "assertion_level")
        )
        evidence_required = _records(
            value.get("evidence_required"),
            "evidence_required",
            ("id", "description", "acceptance"),
        )
        evidence_available = _records(
            value.get("evidence_available"),
            "evidence_available",
            ("id", "title", "state", "locator"),
        )
        evidence_missing = _records(
            value.get("evidence_missing"),
            "evidence_missing",
            ("id", "description"),
        )
        requirement_ids = {str(record["id"]) for record in requirements}
        evidence_ids = {str(record["id"]) for record in evidence_available}
        for section, records in (("requirements", requirements), ("claims", claims)):
            for record in records:
                references = _string_list(
                    record.get("evidence_ids", ()),
                    f"{section}.{record['id']}.evidence_ids",
                )
                unknown = sorted(set(references) - evidence_ids)
                if unknown:
                    raise FoundryValidationError(
                        f"{section}.{record['id']} references unknown evidence: {unknown}"
                    )
                record["evidence_ids"] = list(references)
        for record in milestones:
            references = _string_list(
                record.get("requirement_ids", ()),
                f"milestones.{record['id']}.requirement_ids",
            )
            unknown = sorted(set(references) - requirement_ids)
            if unknown:
                raise FoundryValidationError(
                    f"milestones.{record['id']} references unknown requirements: {unknown}"
                )
            record["requirement_ids"] = list(references)
        for record in requirements:
            status = _text(
                record.get("status", "open"), f"requirements.{record['id']}.status"
            )
            if status not in REQUIREMENT_STATES:
                raise FoundryValidationError(f"unknown requirement status: {status}")
            record["status"] = status
        for record in eligibility:
            if record["status"] not in {"unverified", "eligible", "ineligible"}:
                raise FoundryValidationError(
                    f"unknown eligibility status: {record['status']}"
                )
        for record in claims:
            if record["assertion_level"] not in ASSERTION_LEVELS:
                raise FoundryValidationError(
                    f"unknown claim assertion level: {record['assertion_level']}"
                )
        for index, record in enumerate(evidence_available):
            EvidenceRecord.from_mapping(record, f"evidence_available[{index}]")
        deadline = value.get("deadline")
        if deadline is not None:
            deadline = _text(deadline, "deadline")
        submission_format = value.get("submission_format")
        if not isinstance(submission_format, Mapping):
            raise FoundryValidationError("submission_format must be an object")
        return cls(
            lane_id=lane_id,
            topic=_text(value.get("topic"), "topic"),
            requirements=requirements,
            eligibility=eligibility,
            deliverables=deliverables,
            metrics=metrics,
            milestones=milestones,
            claims=claims,
            evidence_required=evidence_required,
            evidence_available=evidence_available,
            evidence_missing=evidence_missing,
            deadline=deadline,
            submission_format=dict(submission_format),
        )


@dataclass(frozen=True)
class LaneResults:
    """Hold validated machine-readable evidence produced by a lane."""

    lane_id: str
    requirement_updates: tuple[dict[str, object], ...]
    claim_updates: tuple[dict[str, object], ...]
    evidence: tuple[EvidenceRecord, ...]
    experiments: tuple[dict[str, object], ...]
    benchmarks: tuple[dict[str, object], ...]

    @classmethod
    def from_mapping(cls, value: Mapping[str, object]) -> LaneResults:
        """Validate a lane results document."""

        from .validation import finite, mapping

        if value.get("schema_version") != "foundry.results/v1":
            raise FoundryValidationError("unsupported results schema_version")
        if set(value) - {
            "schema_version",
            "lane_id",
            "requirement_updates",
            "claim_updates",
            "evidence",
            "experiments",
            "benchmarks",
        }:
            raise FoundryValidationError("unknown results fields")
        lane_id = _text(value.get("lane_id"), "lane_id")
        requirement_updates = _records(
            value.get("requirement_updates"),
            "requirement_updates",
            ("id", "status"),
        )
        claim_updates = _records(
            value.get("claim_updates"),
            "claim_updates",
            ("id", "assertion_level"),
        )
        evidence_raw = _records(
            value.get("evidence"), "evidence", ("id", "title", "state", "locator")
        )
        experiments = _records(
            value.get("experiments"), "experiments", ("id", "status")
        )
        benchmarks = _records(value.get("benchmarks"), "benchmarks", ("id", "status"))
        for record in (*experiments, *benchmarks):
            if record["status"] not in {
                "planned",
                "running",
                "succeeded",
                "failed",
                "cancelled",
                "blocked",
            }:
                raise FoundryValidationError("unknown experiment or benchmark outcome")
            for name, measurement in mapping(
                record.get("metrics", {}), "metrics"
            ).items():
                _text(name, "metric name")
                finite(measurement, name)
            _string_list(record.get("evidence_ids", ()), "result evidence_ids")
        evidence = tuple(
            EvidenceRecord.from_mapping(record, f"evidence[{index}]")
            for index, record in enumerate(evidence_raw)
        )
        for update in requirement_updates:
            if update["status"] not in REQUIREMENT_STATES:
                raise FoundryValidationError(
                    f"unknown requirement update status: {update['status']}"
                )
            update["evidence_ids"] = list(
                _string_list(
                    update.get("evidence_ids", ()),
                    f"requirement_updates.{update['id']}.evidence_ids",
                )
            )
        for update in claim_updates:
            if update["assertion_level"] not in ASSERTION_LEVELS:
                raise FoundryValidationError(
                    f"unknown claim update level: {update['assertion_level']}"
                )
            update["evidence_ids"] = list(
                _string_list(
                    update.get("evidence_ids", ()),
                    f"claim_updates.{update['id']}.evidence_ids",
                )
            )
        return cls(
            lane_id=lane_id,
            requirement_updates=requirement_updates,
            claim_updates=claim_updates,
            evidence=evidence,
            experiments=experiments,
            benchmarks=benchmarks,
        )
