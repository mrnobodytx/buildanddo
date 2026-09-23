# ─── CGRF Header ──────────────────────────────
# File:        apps/world_twin/events.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-WORLD-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/career/evidence.py, apps/career/ledger.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON apps/career/ledger.py; PRODUCES apps/world_twin/twin.py
# DAG Node:    none
# Intent:      Record every interaction as a typed world event and derive how strongly it is established, so self-reported success counts for nothing.
# ─────────────────────────────────────────────────────────────

"""Typed world events, their effective state and activity tier."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError
from apps.career.ledger import append_chain, read_chain

TYPES = ("VIEW", "READ", "COMMENT", "ATTEMPT", "REVIEW", "BUILD", "TEACH", "CORRECTION")
RAW = frozenset({"VIEW", "READ"})
STATES = ("INFERRED", "OBSERVED", "VERIFIED")
OUTCOMES = ("NONE", "SUCCESS", "FAILURE")
RELATIONS = ("LEARNED_FROM", "REVIEWED_WITH", "BUILT_WITH", "TAUGHT", "DISAGREED_WITH")
VISIBILITY = ("PRIVATE", "COMMUNITY", "PUBLIC")
TIERS = ("raw", "meaningful", "outcome", "verified")
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:@>-]{0,127}$")


class TwinError(CareerError):
    """Raise when a world event, dispute or projection request is malformed."""


def ident(value: Any, name: str) -> str:
    """Return a validated identifier."""
    if not isinstance(value, str) or not _ID.match(value):
        raise TwinError(f"{name} must be an identifier")
    return value


def _ids(value: Any, name: str) -> list[str]:
    if not isinstance(value, list):
        raise TwinError(f"{name} must be a list")
    return sorted({ident(item, name) for item in value})


def moment(value: Any, name: str = "at") -> str:
    """Return an ISO-8601 instant, rejecting naive or malformed times."""
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as error:
        raise TwinError(f"{name} must be an ISO-8601 time") from error
    if parsed.tzinfo is None:
        raise TwinError(f"{name} needs a timezone")
    return parsed.isoformat()


def validate_event(raw: Any) -> dict[str, Any]:
    """Normalize one world event; unknown types, states and relations are refused."""
    if not isinstance(raw, dict):
        raise TwinError("an event must be an object")
    for key, allowed in (("type", TYPES), ("state", STATES), ("outcome", OUTCOMES), ("visibility", VISIBILITY)):
        default = {"state": "OBSERVED", "outcome": "NONE", "visibility": "PRIVATE"}.get(key)
        if raw.get(key, default) not in allowed:
            raise TwinError(f"{key} must be one of {', '.join(allowed)}")
    participants = []
    for item in raw.get("participants", []) if isinstance(raw.get("participants", []), list) else [None]:
        if not isinstance(item, dict) or item.get("relation") not in RELATIONS:
            raise TwinError(f"each participant needs an id and a relation in {', '.join(RELATIONS)}")
        participants.append({"id": ident(item.get("id"), "participant.id"), "relation": item["relation"]})
    capability = raw.get("capability")
    return {
        "kind": "event",
        "event_id": ident(raw.get("event_id"), "event_id"),
        "actor": ident(raw.get("actor"), "actor"),
        "type": raw["type"],
        "target": ident(raw.get("target"), "target"),
        "context": ident(raw.get("context", "general"), "context"),
        "capability": ident(capability, "capability") if capability is not None else None,
        "state": raw.get("state", "OBSERVED"),
        "outcome": raw.get("outcome", "NONE"),
        "evidence": _ids(raw.get("evidence", []), "evidence"),
        "verified_by": _ids(raw.get("verified_by", []), "verified_by"),
        "world_effect": _ids(raw.get("world_effect", []), "world_effect"),
        "participants": sorted(participants, key=lambda p: (p["id"], p["relation"])),
        "at": moment(raw.get("at")),
        "visibility": raw.get("visibility", "PRIVATE"),
    }


def effective_state(event: dict[str, Any]) -> str:
    """Return how strongly the event is established, regardless of what it claims."""
    if not event["evidence"]:
        return "INFERRED"
    related = {event["actor"], *(p["id"] for p in event["participants"])}
    independent = [v for v in event["verified_by"] if v not in related]
    return "VERIFIED" if event["state"] == "VERIFIED" and independent else "OBSERVED"


def tier(event: dict[str, Any]) -> str:
    """Classify activity: raw, meaningful, outcome-bearing or independently verified."""
    if event["type"] in RAW:
        return "raw"
    state = effective_state(event)
    if state == "VERIFIED":
        return "verified"
    if event["outcome"] != "NONE" and state == "OBSERVED":
        return "outcome"
    return "meaningful"


def record_event(ledger: Path, raw: Any) -> dict[str, Any]:
    """Append a validated event; event ids are unique within the ledger."""
    event = validate_event(raw)
    if any(e.get("event_id") == event["event_id"] for e in read_chain(ledger)):
        raise TwinError(f"event {event['event_id']} is already recorded")
    return append_chain(ledger, event)
