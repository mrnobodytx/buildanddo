# ─── CGRF Header ──────────────────────────────
# File:        apps/knowledge_units/units.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-KNOWLEDGE-UNIT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/career/evidence.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON apps/career/evidence.py; PRODUCES apps/knowledge_units/receipt.py
# DAG Node:    none
# Intent:      Validate a Knowledge Unit so every claim has a source, every state follows from review, and history is never rewritten.
# ─────────────────────────────────────────────────────────────

"""Knowledge Unit schema, validation, state and version succession."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from apps.career.evidence import CareerError, canonical_digest

SCHEMA = "buildanddo.knowledge-unit/v1"
UNIT_ID = re.compile(r"^[A-Z0-9][A-Z0-9-]{2,39}$")
ITEM_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
VERSION = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
SOURCE_KINDS = ("primary", "secondary", "oer", "standard")
CLAIM_STATUS = ("proposed", "reviewed", "contested", "retracted")
ITEM_LEVELS = ("recall", "explain")
STATES = ("DRAFT", "IN_REVIEW", "VERIFIED", "STALE")


class UnitError(CareerError):
    """Raise when a Knowledge Unit breaks its contract."""


def _text(value: Any, name: str, limit: int = 4000) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise UnitError(f"{name} must be non-empty text up to {limit} characters")
    return value.strip()


def _list(raw: dict[str, Any], key: str) -> list[Any]:
    value = raw.get(key, [])
    if not isinstance(value, list):
        raise UnitError(f"{key} must be a list")
    return value


def _person(value: Any, name: str) -> str:
    if not isinstance(value, dict):
        raise UnitError(f"{name} must be an object with an id")
    return _text(value.get("id"), f"{name}.id", 120)


def _day(value: Any, name: str) -> date:
    try:
        return date.fromisoformat(_text(value, name, 10))
    except ValueError as error:
        raise UnitError(f"{name} must be YYYY-MM-DD") from error


def validate_unit(raw: Any) -> dict[str, Any]:
    """Return a normalized unit, or raise on the first contract violation."""
    if not isinstance(raw, dict) or raw.get("schema") != SCHEMA:
        raise UnitError("not a buildanddo.knowledge-unit/v1 document")
    unit_id = _text(raw.get("unit_id"), "unit_id", 40)
    if not UNIT_ID.match(unit_id):
        raise UnitError("unit_id must be upper-case letters, digits and hyphens")
    version = _text(raw.get("version"), "version", 20)
    if not VERSION.match(version):
        raise UnitError("version must be MAJOR.MINOR.PATCH")
    author = _person(raw.get("author"), "author")
    reviewer = _person(raw["reviewer"], "reviewer") if raw.get("reviewer") is not None else None
    sources: dict[str, dict[str, Any]] = {}
    for item in _list(raw, "sources"):
        ident = _text(item.get("id") if isinstance(item, dict) else None, "source.id", 64)
        if ident in sources or item.get("kind") not in SOURCE_KINDS:
            raise UnitError(f"source {ident}: duplicate id or unknown kind")
        sources[ident] = {"id": ident, "title": _text(item.get("title"), "source.title", 300),
                          "kind": item["kind"], "url": item.get("url") or None}
    if not sources:
        raise UnitError("a unit needs at least one source")
    claims: list[dict[str, Any]] = []
    for item in _list(raw, "claims"):
        if not isinstance(item, dict):
            raise UnitError("each claim must be an object")
        ident = _text(item.get("id"), "claim.id", 64)
        cited = item.get("sources")
        if not isinstance(cited, list) or not cited or any(ref not in sources for ref in cited):
            raise UnitError(f"claim {ident} must cite at least one listed source")
        status = item.get("status", "proposed")
        if status not in CLAIM_STATUS:
            raise UnitError(f"claim {ident}: unknown status")
        reason: str | None = None
        if status in ("contested", "retracted"):
            reason = _text(item.get("reason"), f"claim {ident} reason", 1000)
        claims.append({"id": ident, "text": _text(item.get("text"), "claim.text", 2000),
                       "sources": list(cited), "status": status, "reason": reason})
    if not claims or len({claim["id"] for claim in claims}) != len(claims):
        raise UnitError("a unit needs claims with unique ids")
    items = []
    for item in _list(raw, "items"):
        item_id = item.get("id") if isinstance(item, dict) else None
        if not isinstance(item_id, str) or not ITEM_ID.match(item_id) or item.get("level") not in ITEM_LEVELS:
            raise UnitError("each assessment item needs an id and a recall or explain level")
        items.append({"id": item_id, "level": item["level"], "reviewed": item.get("reviewed") is True})
    if {item["level"] for item in items} != set(ITEM_LEVELS) or len({i["id"] for i in items}) != len(items):
        raise UnitError("a unit needs unique recall and explain items")
    task = raw.get("transfer_task")
    if not isinstance(task, dict):
        raise UnitError("transfer_task is required")
    rubric = [_text(line, "rubric line", 400) for line in _list(task, "rubric")]
    if not rubric:
        raise UnitError("transfer_task needs a rubric")
    standards = []
    for item in _list(raw, "standards"):
        if not isinstance(item, dict):
            raise UnitError("each standard mapping must be an object")
        confirmer = item.get("confirmed_by")
        standards.append({"framework": _text(item.get("framework"), "standard.framework", 60),
                          "code": _text(item.get("code"), "standard.code", 60),
                          "confirmed": isinstance(confirmer, str) and bool(confirmer) and confirmer != author})
    last, following = _day(raw.get("last_review"), "last_review"), _day(raw.get("next_review"), "next_review")
    if following <= last:
        raise UnitError("next_review must be after last_review")
    surfaces = raw.get("surfaces") or {}
    professional = surfaces.get("professional") if isinstance(surfaces, dict) else None
    public = surfaces.get("public") if isinstance(surfaces, dict) else None
    if not isinstance(professional, dict) or not isinstance(public, dict):
        raise UnitError("surfaces.professional and surfaces.public are required")
    hours = professional.get("suggested_hours", 0)
    if not isinstance(hours, (int, float)) or isinstance(hours, bool) or not 0 <= hours <= 40:
        raise UnitError("suggested_hours must be between 0 and 40")
    cpe = raw.get("cpe") or {}
    approval = cpe.get("provider_approval") if isinstance(cpe, dict) else None
    return {
        "schema": SCHEMA, "unit_id": unit_id, "version": version,
        "title": _text(raw.get("title"), "title", 200), "author": author, "reviewer": reviewer,
        "sources": list(sources.values()), "claims": claims, "items": items, "standards": standards,
        "explanation": _text(raw.get("explanation"), "explanation", 20000),
        "examples": [_text(x, "example") for x in _list(raw, "examples")],
        "counterexamples": [_text(x, "counterexample") for x in _list(raw, "counterexamples")],
        "transfer_task": {"prompt": _text(task.get("prompt"), "transfer_task.prompt"), "rubric": rubric},
        "last_review": last.isoformat(), "next_review": following.isoformat(),
        "surfaces": {"professional": {"title": _text(professional.get("title"), "professional.title", 200),
                                      "suggested_hours": hours},
                     "public": {"title": _text(public.get("title"), "public.title", 200)}},
        "cpe": {"provider_approval": approval if isinstance(approval, str) and approval.strip() else None},
    }


def unit_state(unit: dict[str, Any], today: date) -> str:
    """Derive the unit's state from its reviews and dates; nothing sets it directly."""
    if today > date.fromisoformat(unit["next_review"]):
        return "STALE"
    live = [claim for claim in unit["claims"] if claim["status"] != "retracted"]
    independent = unit["reviewer"] is not None and unit["reviewer"] != unit["author"]
    if independent and live and all(c["status"] == "reviewed" for c in live) \
            and all(item["reviewed"] for item in unit["items"]):
        return "VERIFIED"
    if unit["reviewer"] is not None or any(c["status"] != "proposed" for c in unit["claims"]):
        return "IN_REVIEW"
    return "DRAFT"


def check_succession(previous: dict[str, Any], current: dict[str, Any]) -> None:
    """Require a higher version that keeps every earlier claim, so corrections stay in history."""
    if previous["unit_id"] != current["unit_id"]:
        raise UnitError("a new version must keep the unit_id")
    old = tuple(int(part) for part in previous["version"].split("."))
    new = tuple(int(part) for part in current["version"].split("."))
    if new <= old:
        raise UnitError("a new version must have a higher version number")
    kept = {claim["id"] for claim in current["claims"]}
    missing = [claim["id"] for claim in previous["claims"] if claim["id"] not in kept]
    if missing:
        raise UnitError("claims cannot be deleted; retract them instead: " + ", ".join(missing))


def unit_digest(unit: dict[str, Any]) -> str:
    """Return the digest of a normalized unit."""
    return canonical_digest(unit)
