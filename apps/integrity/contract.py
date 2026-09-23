# ─── CGRF Header ──────────────────────────────
# File:        apps/integrity/contract.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-INTEGRITY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-INTEGRITY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/career/evidence.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON apps/career/evidence.py; PRODUCES apps/integrity/verdict.py
# DAG Node:    none
# Intent:      Freeze what success means before execution, so a failed task cannot pass by rewriting its rubric.
# ─────────────────────────────────────────────────────────────

"""Frozen, digest-bound intent contracts."""

from __future__ import annotations

import re
from typing import Any

from apps.career.evidence import CareerError, canonical_digest

SCHEMA = "buildanddo.intent-contract/v1"
VERIFIER_KINDS = ("self", "same_model", "different_model", "deterministic", "world_readback", "human", "reproduction")
# The actor's own report and a review by its own model family are never independent.
INDEPENDENT_KINDS = frozenset(VERIFIER_KINDS) - {"self", "same_model"}
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$")


class IntegrityError(CareerError):
    """Raise when an integrity contract or report is malformed."""


def _ident(value: Any, name: str) -> str:
    if not isinstance(value, str) or not _ID.match(value):
        raise IntegrityError(f"{name} must be a short identifier")
    return value


def _names(value: Any, name: str, *, allow_empty: bool = False) -> list[str]:
    if not isinstance(value, list) or (not value and not allow_empty):
        raise IntegrityError(f"{name} must be a {'' if allow_empty else 'non-empty '}list")
    items = [_ident(item, name) for item in value]
    if len(set(items)) != len(items):
        raise IntegrityError(f"{name} has duplicates")
    return sorted(items)


def freeze(raw: Any) -> dict[str, Any]:
    """Validate a contract and bind it to a digest; the digest identifies this exact definition of success."""
    if not isinstance(raw, dict):
        raise IntegrityError("contract must be an object")
    kinds = _names(raw.get("verifier_kinds"), "verifier_kinds")
    if not set(kinds) <= set(VERIFIER_KINDS) or not set(kinds) & INDEPENDENT_KINDS:
        raise IntegrityError("verifier_kinds must be known and include at least one independent kind")
    minimum = raw.get("min_independent", 1)
    if not isinstance(minimum, int) or isinstance(minimum, bool) or not 1 <= minimum <= 10:
        raise IntegrityError("min_independent must be 1 to 10")
    version = raw.get("version", 1)
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise IntegrityError("version must be a positive integer")
    intent = raw.get("intent")
    if not isinstance(intent, str) or not intent.strip() or len(intent) > 2000:
        raise IntegrityError("intent must be non-empty text")
    body = {
        "schema": SCHEMA,
        "mission_id": _ident(raw.get("mission_id"), "mission_id"),
        "version": version,
        "parent": raw.get("parent") if version > 1 else None,
        "intent": intent.strip(),
        "success": _names(raw.get("success"), "success"),
        "disallowed_shortcuts": _names(raw.get("disallowed_shortcuts", []), "disallowed_shortcuts", allow_empty=True),
        "required_evidence": _names(raw.get("required_evidence"), "required_evidence"),
        "verifier_kinds": kinds,
        "min_independent": minimum,
        "actor": _ident(raw.get("actor"), "actor"),
        "actor_family": _ident(raw.get("actor_family"), "actor_family"),
    }
    if version > 1 and not (isinstance(body["parent"], str) and body["parent"].startswith("sha256:")):
        raise IntegrityError("an amended contract must name its parent digest")
    return {**body, "digest": canonical_digest(body)}


def amend(previous: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    """Return a new contract version whose parent is the previous digest; the old version stays valid for its reports."""
    if "actor" in changes or "actor_family" in changes or "mission_id" in changes:
        raise IntegrityError("an amendment cannot change the mission or the actor")
    base = {key: value for key, value in previous.items() if key not in ("digest", "schema", "parent")}
    return freeze({**base, **changes, "version": previous["version"] + 1, "parent": previous["digest"]})
