# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/policy/pipeline.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/research/policy/contracts.py, apps/research/processing.py, apps/mission_suite/engine.py
# EnumType:    Service
# EnumEdges:   CONSUMES apps/research/policy/contracts.py; EXTENDS apps/research/processing.py; CONSUMES apps/mission_suite/engine.py
# DAG Node:    none
# Intent:      Project research observations into neutral policy graphs and review candidates while retaining source revisions and tenant boundaries.
# ───────────────────────────────────────────────────────────────

"""Extend the research pipeline without creating another service runtime."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
import hashlib
from typing import TYPE_CHECKING
import unicodedata

from apps.mission_suite.engine import decode
from apps.research.contracts import Parsed, object_value
from apps.research.policy.contracts import (
    MAX_PACKET,
    STATES,
    VERSION,
    Observation,
    Watch,
    bounded,
    canonical,
    choice,
    fingerprint,
    instant,
    observation,
    record,
    reject,
    rows,
    source_url,
    tenant,
    watch,
)

if TYPE_CHECKING:
    from apps.research.processing import Processor

ANNOTATIONS = (
    "source_id",
    "url",
    "document_id",
    "title",
    "kind",
    "state",
    "attribution",
    "published_at",
    "mission_areas",
    "entities",
    "relations",
)


def normalize(
    parsed: Parsed,
    annotations: object,
    *,
    tenant_id: str,
    observed_at: str,
    research_id: str = "",
) -> Observation:
    """Bind explicit, unreviewed annotations to an existing research excerpt."""
    note = record(annotations, ANNOTATIONS)
    url = source_url(note["source_id"], note["url"])
    data = record(
        parsed,
        ("text", "citations", "processor", "version", "input_sha256", "truncated"),
    )
    citations = rows(data["citations"], 1)
    if len(citations) != 1:
        reject("source_mismatch")
    citation = record(citations[0], ("title", "url"))
    # A scrape redirect or multi-source search needs a separately bound receipt;
    # do not claim that the input-URL hash identifies another source's content.
    if citation["url"] != url or not isinstance(data["text"], str):
        reject("source_mismatch")
    bounded(data["text"], 16000)
    body: dict[str, object] = {
        **note,
        "tenant_id": tenant(tenant_id),
        "observed_at": instant(observed_at),
        "excerpt": data["text"],
        "provenance": {
            "input_sha256": data["input_sha256"],
            "excerpt_sha256": hashlib.sha256(data["text"].encode()).hexdigest(),
            "processor": data["processor"],
            "version": data["version"],
            "truncated": data["truncated"],
            "research_id": research_id,
            "verification": "unreviewed",
        },
    }
    identity_body = {key: value for key, value in body.items() if key != "observed_at"}
    identity_body["provenance"] = {
        key: value
        for key, value in object_value(body["provenance"]).items()
        if key != "research_id"
    }
    body["id"] = "pe_" + fingerprint(identity_body)[:32]
    return observation(body, tenant_id)


async def collect(
    processor: Processor, annotations: object, *, tenant_id: str, observed_at: str
) -> Observation:
    """Use the configured research Processor for one explicitly requested source."""
    note = record(annotations, ANNOTATIONS)
    url = source_url(note["source_id"], note["url"])
    parsed = await processor.process({"kind": "url", "input": url})
    return normalize(parsed, note, tenant_id=tenant_id, observed_at=observed_at)


@dataclass(frozen=True)
class Packet:
    """Keep portable observations separate from derived views and delivery."""

    tenant_id: str
    mode: str
    as_of: str
    observations: tuple[Observation, ...]
    watches: tuple[Watch, ...]

    def to_dict(self) -> dict[str, object]:
        """Serialize a reproducible packet with an integrity fingerprint."""
        body: dict[str, object] = {
            "schema_version": VERSION,
            "tenant_id": self.tenant_id,
            "mode": self.mode,
            "as_of": self.as_of,
            "observations": [item.to_dict() for item in self.observations],
            "watches": [item.to_dict() for item in self.watches],
        }
        return {**body, "packet_sha256": fingerprint(body)}


def make_packet(
    *,
    tenant_id: str,
    mode: str,
    as_of: str,
    observations: list[Observation],
    watches: list[Watch],
) -> Packet:
    """Validate, deduplicate and order tenant observations without erasing revisions."""
    tenant(tenant_id)
    choice(mode, ("research", "demo"))
    instant(as_of)
    if (
        (mode == "demo" and tenant_id != "demo-public")
        or len(observations) > 100
        or len(watches) > 20
    ):
        reject()
    seen: dict[str, Observation] = {}
    source_urls: dict[tuple[str, str], str] = {}
    entity_types: dict[str, str] = {}
    for candidate in observations:
        item = observation(candidate.to_dict(), tenant_id)
        if (mode == "demo") != (item.provenance.processor == "synthetic-fixture"):
            reject("source_mismatch")
        if item.observed_at > as_of:
            reject("future_observation")
        series = (item.source_id, item.document_id)
        if series in source_urls and source_urls[series] != item.url:
            reject("source_mismatch")
        source_urls[series] = item.url
        for entity in item.entities:
            if entity.id in entity_types and entity_types[entity.id] != entity.type:
                reject("unsupported_relation")
            entity_types[entity.id] = entity.type
        prior = seen.get(item.id)
        if not prior or (item.observed_at, item.provenance.research_id) < (
            prior.observed_at,
            prior.provenance.research_id,
        ):
            seen[item.id] = item
    checked = [watch(item.to_dict()) for item in watches]
    if len({item.id for item in checked}) != len(checked):
        reject()
    packet = Packet(
        tenant_id,
        mode,
        as_of,
        tuple(sorted(seen.values(), key=lambda item: (item.observed_at, item.id))),
        tuple(sorted(checked, key=lambda item: item.id)),
    )
    if len(canonical(packet.to_dict())) + 1 > MAX_PACKET:
        reject("too_large")
    return packet


def read_packet(raw: str, *, expected_tenant: str) -> Packet:
    """Read bounded strict JSON and check identity without granting source trust."""
    value = decode(raw)
    row = record(
        value,
        (
            "schema_version",
            "tenant_id",
            "mode",
            "as_of",
            "observations",
            "watches",
            "packet_sha256",
        ),
    )
    if row["schema_version"] != VERSION or row["packet_sha256"] != fingerprint(
        {k: v for k, v in row.items() if k != "packet_sha256"}
    ):
        reject("source_mismatch")
    if row["tenant_id"] != expected_tenant:
        reject("foreign_tenant")
    return make_packet(
        tenant_id=expected_tenant,
        mode=choice(row["mode"], ("research", "demo")),
        as_of=instant(row["as_of"]),
        observations=[
            observation(item, expected_tenant)
            for item in rows(row["observations"], 100)
        ],
        watches=[watch(item) for item in rows(row["watches"], 20)],
    )


def folded(value: str) -> str:
    """Normalize literal matching without evaluating a pattern language."""
    return " ".join(unicodedata.normalize("NFKC", value).lower().split())


def watch_matches(item: Observation, rule: Watch, as_of: str) -> list[str]:
    """Explain exact configured matches without asserting causal impact."""
    end = datetime.strptime(instant(as_of), "%Y-%m-%dT%H:%M:%SZ")
    start = (end - timedelta(hours=rule.window_hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
    if not start < item.observed_at <= as_of or not set(
        item.mission_areas
    ).intersection(rule.mission_areas):
        return []
    haystack = folded(item.title + "\n" + item.excerpt)
    terms = [term for term in rule.keywords if folded(term) in haystack]
    entities = [
        value
        for value in rule.entity_ids
        if value in {entity.id for entity in item.entities}
    ]
    if (rule.keywords and not terms) or (rule.entity_ids and not entities):
        return []
    return ["keyword:" + value for value in terms] + [
        "entity:" + value for value in entities
    ]


def project(packet: Packet) -> dict[str, object]:
    """Build review-only graph, alert and brief projections from validated observations."""
    packet = make_packet(
        tenant_id=packet.tenant_id,
        mode=packet.mode,
        as_of=packet.as_of,
        observations=list(packet.observations),
        watches=list(packet.watches),
    )
    series: dict[tuple[str, str], list[Observation]] = {}
    for item in packet.observations:
        series.setdefault((item.source_id, item.document_id), []).append(item)
    current: set[str] = set()
    conflicts: set[str] = set()
    edges: list[dict[str, object]] = []
    for versions in series.values():
        # Capture ordering only: this never claims that a law repealed another.
        versions.sort(key=lambda item: (item.observed_at, item.id))
        captures: dict[str, list[Observation]] = {}
        for item in versions:
            captures.setdefault(item.observed_at, []).append(item)
        previous: list[Observation] = []
        for captured in captures.values():
            if len(captured) > 1:
                conflicts.update(item.id for item in captured)
            for newer in captured:
                for older in previous:
                    edges.append(
                        {
                            "source": newer.id,
                            "relation": "supersedes",
                            "target": older.id,
                            "observation": newer.id,
                            "state": "OBSERVED",
                            "quote": "",
                            "basis": "newer_capture_of_same_document",
                        }
                    )
            previous = captured
        current.update(item.id for item in previous)
    nodes: dict[str, dict[str, object]] = {}
    for item in packet.observations:
        source_node = "source:" + item.source_id + ":" + item.document_id
        nodes[item.id] = {"id": item.id, "type": "policy_event", "labels": [item.title]}
        nodes[source_node] = {"id": source_node, "type": "source", "labels": [item.url]}
        for entity in item.entities:
            existing = nodes.setdefault(
                entity.id, {"id": entity.id, "type": entity.type, "labels": []}
            )
            labels = list(rows(existing["labels"], 100))
            if entity.label not in labels:
                labels.append(entity.label)
            existing["labels"] = sorted(str(label) for label in labels)
        refs = {"event": item.id, "source": source_node}
        for edge in item.relations:
            edges.append(
                {
                    "source": refs.get(edge.source, edge.source),
                    "relation": edge.relation,
                    "target": refs.get(edge.target, edge.target),
                    "observation": item.id,
                    "quote": edge.quote,
                    "state": edge.state,
                    "basis": "quoted_annotation",
                }
            )
    alerts: list[dict[str, object]] = []
    for rule in packet.watches:
        rule_hash = fingerprint(rule.to_dict())
        for item in packet.observations:
            if item.id not in current:
                continue
            reasons = watch_matches(item, rule, packet.as_of)
            if reasons:
                alerts.append(
                    {
                        "id": "pa_"
                        + fingerprint([packet.tenant_id, rule_hash, item.id])[:32],
                        "watch_id": rule.id,
                        "watch_sha256": rule_hash,
                        "observation": item.id,
                        "cadence": rule.cadence,
                        "status": "review_required",
                        "reasons": reasons,
                        "object_refs": list(rule.object_refs),
                        "source_conflict": item.id in conflicts,
                    }
                )
    sections: dict[str, list[str]] = {state: [] for state in STATES}
    day_start = (
        datetime.strptime(packet.as_of, "%Y-%m-%dT%H:%M:%SZ") - timedelta(hours=24)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    daily = {
        str(alert["observation"]) for alert in alerts if alert["cadence"] == "daily"
    }
    for item in reversed(packet.observations):
        if item.id in daily and item.observed_at > day_start:
            sections["UNRESOLVED" if item.id in conflicts else item.state].append(
                item.id
            )
    return {
        "tenant_id": packet.tenant_id,
        "as_of": packet.as_of,
        "mode": packet.mode,
        "current": sorted(current),
        "conflicts": sorted(conflicts),
        "graph": {
            "nodes": sorted(nodes.values(), key=lambda row: str(row["id"])),
            "edges": edges,
        },
        "alerts": alerts,
        "brief": sections,
        "delivery": "not_connected",
        "verification": "unreviewed",
    }


def brief_text(packet: Packet) -> str:
    """Render a plain-text brief candidate with preserved classifications and sources."""
    view = project(packet)
    lines = [
        "Policy brief candidate",
        "As of: " + packet.as_of,
        "Mode: " + packet.mode,
        "Source verification: unreviewed",
        "Delivery: not connected",
        "",
    ]
    sections = object_value(view["brief"])
    by_id = {item.id: item for item in packet.observations}
    for state in STATES:
        lines.append(state)
        for key in rows(sections[state], 100):
            item = by_id[str(key)]
            lines.extend(
                [
                    item.title,
                    "Source: " + item.url,
                    "Observation: " + item.id,
                    "Excerpt SHA-256: " + item.provenance.excerpt_sha256,
                    "Captured: " + item.observed_at,
                    "Truncated: " + str(item.provenance.truncated).lower(),
                    "Brief excerpt shortened: " + str(len(item.excerpt) > 800).lower(),
                    item.excerpt[:800],
                    "",
                ]
            )
    return "\n".join(lines) + "\n"
