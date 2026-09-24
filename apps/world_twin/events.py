# ─── CGRF Header ──────────────────────────────
# File:        apps/world_twin/events.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/career/evidence.py, apps/career/ledger.py, libs/evolution/event.py, libs/semantic_twin/contracts.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON apps/career/ledger.py; CONSUMES libs/evolution/event.py; CONSUMES libs/semantic_twin/contracts.py; PRODUCES apps/world_twin/twin.py
# DAG Node:    none
# Intent:      Record every interaction as a typed world event and derive how strongly it is established, so self-reported success counts for nothing.
# ─────────────────────────────────────────────────────────────

"""Typed world events, their effective state and activity tier."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from apps.career.evidence import CareerError
from apps.career.ledger import append_chain, read_chain
from libs.evolution.common import digest, identity
from libs.evolution.event import CitadelEvent
from libs.semantic_twin.contracts import Contract, require
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.receipts import ActorType

WORLD_EVENT_SCHEMA: Literal["buildanddo.world-event/v1"] = "buildanddo.world-event/v1"
LAYERS = ("human", "browser", "application", "edge", "infrastructure", "compute", "decision", "verification", "result")
Layer = Literal["human", "browser", "application", "edge", "infrastructure", "compute", "decision", "verification", "result"]
Visibility = Literal["PRIVATE", "COMMUNITY", "PUBLIC"]
Outcome = Literal["NONE", "SUCCESS", "FAILURE", "UNCERTAIN"]


@dataclass(frozen=True, slots=True)
class TraceReference(Contract):
    """Link an opaque source record without fetching it or embedding replay bodies."""

    layer: Layer
    provider: str
    reference: str
    trace_id: str | None = None
    span_id: str | None = None
    content_digest: ContentDigest | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(bool(re.fullmatch(r"[a-z][a-z0-9_.-]{0,63}", self.provider)), "invalid trace provider")
        require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:/-]{0,511}", self.reference)),
                "trace reference must be opaque, without credentials, query or fragment")
        for value in (self.trace_id, self.span_id):
            require(value is None or bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", value)),
                    "invalid trace identity")
        require(self.span_id is None or self.trace_id is not None, "span requires its trace")


@dataclass(frozen=True, slots=True, kw_only=True)
class WorldEvent(Contract):
    """Bind one existing Citadel observation to its world and privacy context.

    This wrapper does not alter the canonical v2 vocabulary or CitadelEvent IDs.
    Retries at a later ingestion time retain identity. Changing any source,
    correlation, attribution or projection field creates a different world event.
    The receiving process, not this payload, supplies identity and review trust.
    """

    tenant_id: str
    observation: CitadelEvent
    actor_kind: ActorType
    context_id: str
    outcome: Outcome
    schema_version: Literal["buildanddo.world-event/v1"]
    visibility: Visibility = "PRIVATE"
    guild_id: SemanticId | None = None
    project_id: SemanticId | None = None
    guildmaster_id: SemanticId | None = None
    release_sha: str | None = None
    capabilities: tuple[SemanticId, ...] = ()
    participants: tuple[SemanticId, ...] = ()
    traces: tuple[TraceReference, ...] = ()
    event_id: str = ""

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for value in (self.tenant_id, self.context_id):
            require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", value)), "invalid world scope")
        require(self.tenant_id == self.observation.scope_id, "world/observation tenant mismatch")
        self.observation.actor_id.require_namespace(*{
            ActorType.HUMAN: ("person", "owner", "customer"),
            ActorType.AGENT: ("agent", "guildmaster"),
            ActorType.SYSTEM: ("system", "service", "owner"),
        }[self.actor_kind])
        require(bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9_.:-]{0,127}", self.observation.event_type)), "invalid world event type")
        if self.guild_id is not None:
            self.guild_id.require_namespace("guild")
        if self.project_id is not None:
            self.project_id.require_namespace("resource", "product", "mission")
        if self.guildmaster_id is not None:
            self.guildmaster_id.require_namespace("guildmaster", "agent")
        if self.release_sha is not None:
            SourceRevision(self.release_sha)
        for name, values in (("capabilities", self.capabilities), ("participants", self.participants)):
            require(len(values) <= 32 and len(set(values)) == len(values), f"duplicate or excessive {name}")
            object.__setattr__(self, name, tuple(sorted(values)))
        for capability in self.capabilities:
            capability.require_namespace("capability")
        require(len(self.traces) <= 32 and len({t.to_json() for t in self.traces}) == len(self.traces),
                "duplicate or excessive trace references")
        object.__setattr__(self, "traces", tuple(sorted(self.traces, key=lambda ref: ref.to_json())))
        expected = str(identity("event", self.stable_body))
        require(not self.event_id or self.event_id == expected, "world event content/id mismatch")
        object.__setattr__(self, "event_id", expected)
        require(len(self.to_json().encode("utf-8")) <= 65536, "world event exceeds metadata limit")

    @property
    def stable_body(self) -> dict[str, object]:
        """Return all content-bound fields except local ingestion time and the ID."""
        body: dict[str, object] = self.to_dict()
        body.pop("event_id")
        body["observation"] = self.observation.stable_payload
        return body

    @property
    def review_subject(self) -> SubjectRef:
        """Name the exact event revision an externally authenticated review covers."""
        return SubjectRef(SemanticId(self.event_id), digest(self.stable_body))


def world_events(values: tuple[WorldEvent, ...], tenant_id: str, at: datetime) -> tuple[WorldEvent, ...]:
    """Admit one bounded tenant slice and deduplicate retries deterministically."""
    require(at.tzinfo is not None and at.utcoffset() is not None, "cutoff requires timezone")
    require(len(values) <= 2000, "world capture exceeds event limit")
    seen: dict[str, WorldEvent] = {}
    sources: dict[tuple[str, str, str, str, str, datetime], str] = {}
    for event in values:
        require(type(event) is WorldEvent, "legacy claims are not world-event/v1")
        require(event.tenant_id == tenant_id, "foreign tenant in world capture")
        # A replay cut uses actual source-observation time, never local ingestion.
        if event.observation.observed_at > at:
            continue
        source = (event.observation.source_kind.value, event.observation.source_ref,
                  str(event.observation.subject_id), event.observation.subject_version,
                  event.observation.event_type, event.observation.occurred_at)
        require(source not in sources or sources[source] == event.event_id,
                "conflicting observations for one source revision")
        sources[source] = event.event_id
        prior = seen.get(event.event_id)
        if prior is None or event.observation.ingested_at < prior.observation.ingested_at:
            seen[event.event_id] = event
    return tuple(sorted(seen.values(), key=lambda event: (event.observation.occurred_at,
                                                        event.observation.observed_at, event.event_id)))

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
