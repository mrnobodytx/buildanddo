# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/policy/contracts.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/research/contracts.py, apps/research/transport.py, apps/mission_suite/engine.py
# EnumType:    Schema
# EnumEdges:   CONSUMES apps/research/contracts.py; CONSUMES apps/research/transport.py; CONSUMES apps/mission_suite/engine.py
# DAG Node:    none
# Intent:      Bound portable policy observations to tenant, source and quoted evidence without granting authority or inventing verification.
# ───────────────────────────────────────────────────────────────

"""Validate the public policy interchange contract."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
import re
from typing import NoReturn
from urllib.parse import urlsplit

from apps.research.contracts import (
    ResearchError,
    clip_text,
    object_value,
    public_url,
    text,
)
from apps.research.transport import encode_json

VERSION = "citadel.policy.v1"
MAX_PACKET = 300_000
STATES = ("OBSERVED", "ATTRIBUTED", "ANALYZED", "UNRESOLVED")
AREAS = (
    "defense",
    "cybersecurity",
    "healthcare",
    "small_business",
    "energy",
    "homeland_security",
)
KINDS = (
    "legislation",
    "hearing",
    "committee",
    "appropriation",
    "executive_policy",
    "statement",
    "regulation",
)
ENTITY_TYPES = (
    "bill",
    "committee",
    "hearing",
    "official",
    "statement",
    "appropriation",
    "program",
    "issue",
    "organization",
)
# These are source admission rules, not health, accuracy or access receipts.
SOURCES = {
    "congress": ("Congress.gov", "congress.gov"),
    "govinfo": ("GovInfo", "govinfo.gov"),
    "federal_register": ("Federal Register", "federalregister.gov"),
    "white_house": ("White House", "whitehouse.gov"),
    "senate": ("U.S. Senate", "senate.gov"),
    "house": ("U.S. House", "house.gov"),
}
RELATIONS = {
    "member_of": (("official",), ("committee",)),
    "referred_to": (("bill",), ("committee",)),
    "concerns": (("hearing", "bill", "policy_event"), ("issue",)),
    "affects": (("bill", "policy_event"), ("program",)),
    "funds": (("appropriation",), ("program",)),
    "made_by": (("statement",), ("official", "organization")),
    "supported_by": (("statement",), ("source",)),
}


class PolicyError(ResearchError):
    """Report a bounded policy-contract failure without source text."""


def reject(reason: str = "invalid_data") -> NoReturn:
    """Reject a policy input without reflecting private content."""
    raise PolicyError(reason)


def record(value: object, fields: tuple[str, ...]) -> dict[str, object]:
    """Require exactly the versioned fields at each boundary."""
    row = object_value(value)
    if set(row) != set(fields):
        reject()
    return row


def rows(value: object, maximum: int) -> list[object]:
    """Require a bounded list."""
    if not isinstance(value, list) or len(value) > maximum:
        reject()
    return list(value)


def bounded(value: object, maximum: int, *, empty: bool = False) -> str:
    """Require unchanged text within the shared UTF-16 budget."""
    result = text(value, maximum, empty=empty)
    if result != value or clip_text(result, maximum) != result:
        reject()
    return result


def identity(value: object) -> str:
    """Require a portable identifier rather than a path or command."""
    result = bounded(value, 128)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]*", result):
        reject()
    return result


def tenant(value: object) -> str:
    """Require a workspace-shaped tenant identity."""
    result = bounded(value, 64)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", result):
        reject()
    return result


def choice(value: object, options: tuple[str, ...]) -> str:
    """Reject classifications outside the public domain contract."""
    if not isinstance(value, str) or value not in options:
        reject()
    return value


def selections(
    value: object, options: tuple[str, ...], *, required: bool = True
) -> tuple[str, ...]:
    """Require unique, sorted domain selections."""
    result = tuple(choice(item, options) for item in rows(value, len(options)))
    if (
        (required and not result)
        or len(set(result)) != len(result)
        or tuple(sorted(result)) != result
    ):
        reject()
    return result


def instant(value: object) -> str:
    """Require an unambiguous UTC second-resolution timestamp."""
    result = bounded(value, 20)
    try:
        parsed = datetime.strptime(result, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        reject()
    if parsed.strftime("%Y-%m-%dT%H:%M:%SZ") != result:
        reject()
    return result


def canonical(value: object) -> bytes:
    """Encode portable JSON deterministically without floating-point values."""
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            allow_nan=False,
            separators=(",", ":"),
        ).encode()
    except (ValueError, TypeError, UnicodeError):
        reject()


def fingerprint(value: object) -> str:
    """Fingerprint the exact canonical object, without attesting its claims."""
    return hashlib.sha256(canonical(value)).hexdigest()


def source_url(source_id: object, value: object) -> str:
    """Admit only public HTTPS locations under the selected official registry."""
    source = choice(source_id, tuple(SOURCES))
    url = public_url(value)
    host = (urlsplit(url).hostname or "").lower()
    root = SOURCES[source][1]
    if host != root and not host.endswith("." + root):
        reject("unsafe_source")
    return url


@dataclass(frozen=True)
class Entity:
    """Identify a public policy object within a tenant projection."""

    id: str
    type: str
    label: str


@dataclass(frozen=True)
class Relation:
    """Retain an asserted relationship and its exact supporting excerpt."""

    source: str
    relation: str
    target: str
    quote: str
    state: str


@dataclass(frozen=True)
class Provenance:
    """Distinguish an extracted excerpt from original document bytes."""

    input_sha256: str
    excerpt_sha256: str
    processor: str
    version: str
    truncated: bool
    research_id: str
    verification: str = "unreviewed"


@dataclass(frozen=True)
class Observation:
    """Carry source data without instructions, political scores or authority."""

    id: str
    tenant_id: str
    source_id: str
    url: str
    document_id: str
    title: str
    kind: str
    state: str
    attribution: str
    published_at: str
    observed_at: str
    mission_areas: tuple[str, ...]
    excerpt: str
    provenance: Provenance
    entities: tuple[Entity, ...]
    relations: tuple[Relation, ...]

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-compatible observation."""
        return object_value(json.loads(encode_json(asdict(self))))

    def expected_id(self) -> str:
        """Keep retries of the same research receipt content-addressed."""
        body = self.to_dict()
        body.pop("id")
        body.pop("observed_at")
        object_value(body["provenance"]).pop("research_id")
        return "pe_" + fingerprint(body)[:32]


def observation(value: object, expected_tenant: str) -> Observation:
    """Validate identity, typed graph references and exact quotation provenance."""
    row = record(value, tuple(Observation.__dataclass_fields__))
    if tenant(row["tenant_id"]) != tenant(expected_tenant):
        reject("foreign_tenant")
    source_id = choice(row["source_id"], tuple(SOURCES))
    url = source_url(source_id, row["url"])
    excerpt = bounded(row["excerpt"], 16000)
    proof = record(row["provenance"], tuple(Provenance.__dataclass_fields__))
    if proof["verification"] != "unreviewed" or type(proof["truncated"]) is not bool:
        reject()
    if (
        proof["input_sha256"] != hashlib.sha256(url.encode()).hexdigest()
        or proof["excerpt_sha256"] != hashlib.sha256(excerpt.encode()).hexdigest()
    ):
        reject("source_mismatch")
    research_id = bounded(proof["research_id"], 64, empty=True)
    if research_id:
        tenant(research_id)
    provenance = Provenance(
        str(proof["input_sha256"]),
        str(proof["excerpt_sha256"]),
        bounded(proof["processor"], 80),
        bounded(proof["version"], 80),
        bool(proof["truncated"]),
        research_id,
    )
    entities: list[Entity] = []
    node_types = {"event": "policy_event", "source": "source"}
    for item in rows(row["entities"], 32):
        entry = record(item, ("id", "type", "label"))
        entity = Entity(
            identity(entry["id"]),
            choice(entry["type"], ENTITY_TYPES),
            bounded(entry["label"], 160),
        )
        if entity.id in node_types or entity.id.startswith(("pe_", "source:")):
            reject()
        entities.append(entity)
        node_types[entity.id] = entity.type
    relations: list[Relation] = []
    for item in rows(row["relations"], 64):
        edge = record(item, tuple(Relation.__dataclass_fields__))
        relation = Relation(
            identity(edge["source"]),
            choice(edge["relation"], tuple(RELATIONS)),
            identity(edge["target"]),
            bounded(edge["quote"], 1200),
            choice(edge["state"], STATES),
        )
        types = RELATIONS[relation.relation]
        if (
            node_types.get(relation.source) not in types[0]
            or node_types.get(relation.target) not in types[1]
            or relation.quote not in excerpt
        ):
            reject("unsupported_relation")
        if relation in relations:
            reject()
        relations.append(relation)
    result = Observation(
        identity(row["id"]),
        expected_tenant,
        source_id,
        url,
        identity(row["document_id"]),
        bounded(row["title"], 200),
        choice(row["kind"], KINDS),
        choice(row["state"], STATES),
        bounded(row["attribution"], 160, empty=True),
        instant(row["published_at"]),
        instant(row["observed_at"]),
        selections(row["mission_areas"], AREAS),
        excerpt,
        provenance,
        tuple(entities),
        tuple(relations),
    )
    if (
        result.published_at > result.observed_at
        or (result.state == "ATTRIBUTED" and not result.attribution)
        or (
            any(edge.state == "ATTRIBUTED" for edge in result.relations)
            and not result.attribution
        )
    ):
        reject()
    if result.id != result.expected_id():
        reject("source_mismatch")
    return result


@dataclass(frozen=True)
class Watch:
    """Match literal terms and explicit objects without executing rule text."""

    id: str
    name: str
    mission_areas: tuple[str, ...]
    keywords: tuple[str, ...]
    entity_ids: tuple[str, ...]
    object_refs: tuple[str, ...]
    cadence: str
    window_hours: int

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-compatible watch."""
        return object_value(json.loads(encode_json(asdict(self))))


def watch(value: object) -> Watch:
    """Validate a bounded, non-executable tenant watch rule."""
    row = record(value, tuple(Watch.__dataclass_fields__))
    lists: dict[str, tuple[str, ...]] = {}
    for field in ("keywords", "entity_ids", "object_refs"):
        lists[field] = tuple(
            bounded(item, 120) if field == "keywords" else identity(item)
            for item in rows(row[field], 12)
        )
        if len(set(lists[field])) != len(lists[field]) or (
            field != "keywords" and tuple(sorted(lists[field])) != lists[field]
        ):
            reject()
    hours = row["window_hours"]
    if (
        type(hours) is not int
        or not 1 <= hours <= 744
        or not (lists["keywords"] or lists["entity_ids"])
    ):
        reject()
    return Watch(
        identity(row["id"]),
        bounded(row["name"], 160),
        selections(row["mission_areas"], AREAS),
        lists["keywords"],
        lists["entity_ids"],
        lists["object_refs"],
        choice(row["cadence"], ("realtime", "daily")),
        hours,
    )
