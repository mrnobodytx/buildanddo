# ─── CGRF Header ──────────────────────────────
# File:        apps/career/jobs.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/authority.py, apps/career/evidence.py, apps/career/taxonomy.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/authority.py; DEPENDS_ON apps/career/evidence.py; DEPENDS_ON apps/career/taxonomy.py; PRODUCES apps/career/match.py
# DAG Node:    none
# Intent:      Normalize supplied postings into canonical job entities and typed requirements the matcher can evaluate without guessing.
# ─────────────────────────────────────────────────────────────

"""Normalize job postings and extract typed requirements."""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from apps.career.authority import reserved_class
from apps.career.evidence import CareerError, canonical_digest
from apps.career.taxonomy import capabilities_for_text

_TENURE = re.compile(r"(\d{1,2})\s*\+?\s*(?:or more\s+)?(?:years|yrs)", re.IGNORECASE)
_CREDENTIAL = re.compile(
    r"(?<![a-z])(degree|bachelor'?s?|master'?s?|ph\.?d|certification|certified|licen[cs]e)(?![a-z])",
    re.IGNORECASE,
)
REQUIRED_FIELDS = ("job_id", "company", "role", "source")
LIST_FIELDS = ("requirements", "preferred", "responsibilities", "technologies")
TEXT_FIELDS = ("location", "seniority", "source_updated_at", "apply_url", "application_system")


class RequirementKind(str, Enum):
    """Name what kind of evidence a requirement asks for."""

    CAPABILITY = "CAPABILITY"
    TENURE = "TENURE"
    CREDENTIAL = "CREDENTIAL"
    RESERVED = "RESERVED"
    UNMAPPED = "UNMAPPED"


@dataclass(frozen=True, slots=True)
class Requirement:
    """Hold one typed requirement from a posting."""

    requirement_id: str
    text: str
    hard: bool
    kind: RequirementKind
    capabilities: tuple[str, ...]
    years: int | None = None
    reserved: str | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to plain JSON values."""
        return {
            "requirement_id": self.requirement_id,
            "text": self.text,
            "hard": self.hard,
            "kind": self.kind.value,
            "capabilities": list(self.capabilities),
            "years": self.years,
            "reserved": self.reserved,
        }


@dataclass(frozen=True, slots=True)
class Job:
    """Hold one canonical job entity."""

    fields: dict[str, Any]

    @property
    def job_id(self) -> str:
        """Return the job id."""
        return str(self.fields["job_id"])

    @property
    def role(self) -> str:
        """Return the role title."""
        return str(self.fields["role"])

    @property
    def company(self) -> str:
        """Return the company name."""
        return str(self.fields["company"])

    @property
    def digest(self) -> str:
        """Return the digest of the canonical fields."""
        return canonical_digest(self.fields)

    def to_dict(self) -> dict[str, Any]:
        """Serialize with the digest."""
        return {**self.fields, "digest": self.digest}


def normalize_job(raw: dict[str, Any]) -> Job:
    """Validate a supplied posting and return its canonical form."""
    if not isinstance(raw, dict):
        raise CareerError("job posting must be an object")
    fields: dict[str, Any] = {}
    for key in REQUIRED_FIELDS:
        value = raw.get(key)
        if not isinstance(value, str) or not value.strip():
            raise CareerError(f"job field {key!r} is required")
        fields[key] = value.strip()
    for key in TEXT_FIELDS:
        value = raw.get(key)
        if value is not None and not isinstance(value, str):
            raise CareerError(f"job field {key!r} must be a string")
        fields[key] = value.strip() if isinstance(value, str) else None
    for key in LIST_FIELDS:
        value = raw.get(key, [])
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise CareerError(f"job field {key!r} must be a list of strings")
        fields[key] = [item.strip() for item in value if item.strip()]
    if not fields["requirements"]:
        raise CareerError("job requires at least one requirement")
    compensation = raw.get("compensation", {})
    if not isinstance(compensation, dict):
        raise CareerError("job field 'compensation' must be an object")
    fields["compensation"] = compensation
    return Job(fields)


def classify(requirement_id: str, text: str, hard: bool) -> Requirement:
    """Type one requirement; reserved and credential checks precede capability mapping."""
    capabilities = capabilities_for_text(text)
    reserved = reserved_class(text)
    if reserved is not None:
        return Requirement(requirement_id, text, hard, RequirementKind.RESERVED, capabilities, reserved=reserved)
    tenure = _TENURE.search(text)
    if tenure:
        return Requirement(
            requirement_id, text, hard, RequirementKind.TENURE, capabilities, years=int(tenure.group(1))
        )
    if _CREDENTIAL.search(text):
        return Requirement(requirement_id, text, hard, RequirementKind.CREDENTIAL, capabilities)
    if capabilities:
        return Requirement(requirement_id, text, hard, RequirementKind.CAPABILITY, capabilities)
    return Requirement(requirement_id, text, hard, RequirementKind.UNMAPPED, ())


def extract_requirements(job: Job) -> list[Requirement]:
    """Return hard requirements, then preferred items and listed technologies."""
    items: list[Requirement] = []
    for index, text in enumerate(job.fields["requirements"], start=1):
        items.append(classify(f"R{index}", text, True))
    for index, text in enumerate(job.fields["preferred"], start=1):
        items.append(classify(f"P{index}", text, False))
    for index, text in enumerate(job.fields["technologies"], start=1):
        items.append(classify(f"T{index}", text, False))
    return items
