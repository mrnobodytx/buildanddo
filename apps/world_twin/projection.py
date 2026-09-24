# ─── CGRF Header ──────────────────────────────
# File:        apps/world_twin/projection.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/twin.py, apps/world_twin/episode.py, libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/graph.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/world_twin/twin.py; CONSUMES apps/world_twin/episode.py; CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/graph.py
# DAG Node:    none
# Intent:      Keep the private twin private: community and public views are narrower projections, and minors get no public graph.
# ─────────────────────────────────────────────────────────────

"""Audience projections of a twin and suppressed community aggregates."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from libs.capability_tokens.verification import ReviewPolicy
from libs.evolution.common import digest, identity, timestamp
from libs.evolution.event import Phase
from libs.semantic_twin.contracts import Contract, require
from libs.semantic_twin.identity import ENTITY_NAMESPACES, EntityType, SemanticId
from libs.semantic_twin.ingestion.builder import ObjectDraft, RelationDraft, make_object
from libs.semantic_twin.ingestion.graph import SemanticGraph
from libs.semantic_twin.ingestion.inputs import SourceSnapshot
from libs.semantic_twin.ingestion.serializer import graph_payload
from libs.semantic_twin.receipts import ActorType, VerificationReceipt
from libs.semantic_twin.vocabulary import RelationPredicate

from apps.world_twin.episode import review_states, world_episodes
from apps.world_twin.events import TwinError, WorldEvent, effective_state, world_events
from apps.world_twin.twin import build_twin


@dataclass(frozen=True, slots=True, kw_only=True)
class ProjectionScope(Contract):
    """Take read/sharing grants from the receiver, never from submitted events.

    A local request file is not an authorization token. Runtime callers must
    derive this scope from native/CSEG access, current consent and age policy.
    """

    tenant_id: str
    subject_id: SemanticId
    view: Literal["user", "agent", "guild", "project", "community"]
    as_of: datetime
    allowed_event_ids: tuple[SemanticId, ...]
    audience: Literal["private", "community", "public"] = "private"
    share_profile: bool = False
    adult_confirmed: bool = False
    shared_entity_ids: tuple[SemanticId, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(bool(self.tenant_id.strip()) and len(self.tenant_id) <= 128, "invalid projection tenant")
        self.subject_id.require_namespace(*{
            "user": ("person", "owner", "customer"), "agent": ("agent", "guildmaster"),
            "guild": ("guild",), "project": ("resource", "product", "mission"), "community": ("tenant",),
        }[self.view])
        require(len(self.allowed_event_ids) <= 2000 and len(set(self.allowed_event_ids)) == len(self.allowed_event_ids),
                "invalid allowed-event inventory")
        for value in self.allowed_event_ids:
            value.require_namespace("event")
        require(len(self.shared_entity_ids) <= 2000 and len(set(self.shared_entity_ids)) == len(self.shared_entity_ids),
                "invalid shared-entity inventory")
        object.__setattr__(self, "allowed_event_ids", tuple(sorted(self.allowed_event_ids)))
        object.__setattr__(self, "shared_entity_ids", tuple(sorted(self.shared_entity_ids)))


def compile_projection(
    events: tuple[WorldEvent, ...],
    scope: ProjectionScope,
    *,
    reviews: tuple[VerificationReceipt, ...] = (),
    review_policy: ReviewPolicy | None = None,
) -> dict[str, object]:
    """Compile one bounded world view and correlated replay using existing graph owners.

    Counts describe visible observations, not universal competence or authority.
    The canonical graph stays A0/OBSERVED. Exact admitted review standing is a
    separate field; it cannot certify the compiler, a deployment or a credential.
    """
    admitted = world_events(events, scope.tenant_id, scope.as_of)
    if scope.audience != "private" and not (scope.share_profile and scope.adult_confirmed):
        return {"schema_version": "buildanddo.world-projection/v1", "audience": scope.audience,
                "state": "WITHHELD", "reason": "explicit adult sharing approval is required"}
    captured_episodes = world_episodes(admitted)
    allowed = set(scope.allowed_event_ids)
    shared_entities = set(scope.shared_entity_ids)
    selected = []
    for event in admitted:
        if SemanticId(event.event_id) not in allowed:
            continue
        if scope.audience == "public" and event.visibility != "PUBLIC":
            continue
        if scope.audience == "community" and event.visibility == "PRIVATE":
            continue
        entities = {event.observation.actor_id, event.observation.subject_id, *event.participants,
                    *(value for value in (event.guild_id, event.project_id, event.guildmaster_id) if value is not None)}
        if scope.audience != "private" and not entities <= shared_entities:
            continue
        matches = {
            "user": event.actor_kind is ActorType.HUMAN and event.observation.actor_id == scope.subject_id,
            "agent": event.actor_kind is ActorType.AGENT and event.observation.actor_id == scope.subject_id,
            "guild": event.guild_id == scope.subject_id,
            "project": event.project_id == scope.subject_id or event.observation.subject_id == scope.subject_id,
            "community": True,
        }
        if matches[scope.view]:
            selected.append(event)
    visible = tuple(selected)
    captured_standing = review_states(admitted, reviews, review_policy, at=scope.as_of)
    standing = {event.event_id: captured_standing[event.event_id] for event in visible}
    episodes = [(episode, tuple(event for event in episode.events if event.event_id in standing))
                for episode in captured_episodes if any(event.event_id in standing for event in episode.events)]
    available_at = {event.event_id: max(event.observation.observed_at,
                       timestamp(standing[event.event_id]["evaluated_at"]) if standing[event.event_id]["evaluated_at"] is not None
                       else event.observation.observed_at,
                       scope.as_of if standing[event.event_id]["unaccepted_review"] else event.observation.observed_at)
                    for event in visible}
    nodes: dict[SemanticId, list[WorldEvent]] = defaultdict(list)
    node_kinds: dict[SemanticId, EntityType] = {}
    entity_types = {namespace: kind for kind, namespace in ENTITY_NAMESPACES.items()}
    objects: list[ObjectDraft] = []
    by_core = {event.observation.event_id: event.event_id for event in visible}
    projected_ids = {SemanticId(event.event_id) for event in visible} | {
        identity("episode", tuple(event.event_id for event in slice_events)) for _, slice_events in episodes}

    for event in visible:
        targets = {event.observation.actor_id, event.observation.subject_id, *event.participants,
                   *(value for value in (event.guild_id, event.project_id, event.guildmaster_id) if value is not None)}
        for target in targets:
            if target in projected_ids:
                continue
            nodes[target].append(event)
            # External subjects remain resource references, not invented CNI entities.
            node_kinds[target] = entity_types[target.namespace] if target.scheme == "cni" else EntityType.RESOURCE
        public_standing = {key: value for key, value in standing[event.event_id].items()
                           if scope.audience == "private" or key not in ("receipt_ids", "receipt_digests", "verifier_ids")}
        snapshot = SourceSnapshot.derived(f"world/events/{digest(event.stable_body)}.json",
                                          {"event": event.stable_body, "review": public_standing},
                                          observed_at=available_at[event.event_id])
        relation_targets = [RelationDraft(RelationPredicate.ABOUT, str(target), ("content",)) for target in sorted(targets)]
        relation_targets.extend(RelationDraft(RelationPredicate.DERIVED_FROM, by_core[ref], ("content",))
                                for ref in event.observation.inputs if ref in by_core)
        objects.append(make_object(SemanticId(event.event_id), "EventInstance", snapshot.source_path, snapshot=snapshot,
                                   claims=({"world_event_id": event.event_id, "event_type": event.observation.event_type,
                                            "phase": event.observation.phase.value, "recorded_outcome": event.outcome,
                                            "review": public_standing},), relations=relation_targets))
    for target, related in sorted(nodes.items()):
        snapshot = SourceSnapshot.derived(f"world/identities/{digest((scope.tenant_id, target))}.json",
                                          {"tenant_id": scope.tenant_id, "identity": str(target),
                                           "events": sorted(event.event_id for event in related)},
                                          observed_at=max(event.observation.observed_at for event in related))
        objects.append(make_object(target, node_kinds[target].value, snapshot.source_path, snapshot=snapshot,
                                   claims=({"identity_ref": str(target), "identity_authentication": "receiving_owner",
                                            "event_ids": sorted(event.event_id for event in related)},)))
    for _, slice_events in episodes:
        episode_id = identity("episode", tuple(event.event_id for event in slice_events))
        snapshot = SourceSnapshot.derived(f"world/episodes/{digest(str(episode_id))}.json",
                                          {"events": [event.event_id for event in slice_events]},
                                          observed_at=max(available_at[event.event_id] for event in slice_events))
        objects.append(make_object(episode_id, "Episode", snapshot.source_path, snapshot=snapshot,
                                   claims=({"correlation_id": slice_events[0].observation.correlation_id,
                                            "causal_state": "TEMPORAL_ONLY"},),
                                   relations=[RelationDraft(RelationPredicate.CONTAINS, event.event_id, ("content",))
                                              for event in slice_events]))

    graph = SemanticGraph(objects)
    verified = [event.event_id for event in visible if standing[event.event_id]["independently_reviewed"]]
    capabilities: dict[str, dict[str, object]] = {}
    for capability in sorted({cap for event in visible for cap in event.capabilities}):
        supporting = [event for event in visible if capability in event.capabilities
                      and event.observation.phase is Phase.RESULT and event.outcome == "SUCCESS"
                      and event.event_id in verified and event.observation.event_type not in ("VIEW", "READ", "COMMENT")]
        capabilities[str(capability)] = {
            "state": "REVIEWED_EVIDENCE" if supporting else "NOT_ESTABLISHED",
            "event_ids": [event.event_id for event in supporting],
            "contexts": sorted({event.context_id for event in supporting}),
            "promoted": False,
        }
    replays = [episode.replay(standing, include_traces=scope.audience == "private") for episode, _ in episodes]
    if scope.audience != "private":
        # A public summary never exposes a collaborator's reviewer identity or
        # opaque provider trace handles just because the event was shareable.
        for replay in replays:
            timeline = replay["timeline"]
            assert isinstance(timeline, list)
            for row in timeline:
                row["review"] = {key: value for key, value in row["review"].items()
                                 if key not in ("receipt_ids", "receipt_digests", "verifier_ids")}
    body: dict[str, object] = {
        "schema_version": "buildanddo.world-projection/v1", "tenant_id": scope.tenant_id,
        "subject_id": str(scope.subject_id), "view": scope.view, "audience": scope.audience,
        "as_of": scope.as_of.isoformat(), "coverage": "AUTHORIZED_CAPTURE_SLICE",
        "events": [event.event_id for event in visible], "episodes": replays,
        "measures": {
            "activity": {"value": len(visible), "event_ids": [event.event_id for event in visible]},
            "reviewed_observations": {"value": len(verified), "event_ids": verified},
            "recorded_failures": {"value": sum(event.outcome == "FAILURE" for event in visible),
                                  "event_ids": [event.event_id for event in visible if event.outcome == "FAILURE"]},
        },
        "capabilities": capabilities, "graph": graph_payload(graph),
        "authority_granted": False, "rewards_settled": False,
        "limits": ["Correlation and source hashes do not authenticate observations or establish causation.",
                   "Input identity, read grants, consent and review pins require the receiving owner.",
                   "Counts cover this authorized capture, not all activity; no capability or authority is promoted."],
    }
    return {**body, "digest": digest(body)}

AUDIENCES = ("private", "community", "public")
SECTIONS = ("activity", "capabilities", "history", "community", "impact", "measures", "trust_by_context")
MIN_GROUP = 10


def project(entries: list[dict[str, Any]], subject: str, audience: str, *,
            shared: tuple[str, ...] = (), minor: bool = False) -> dict[str, Any]:
    """Return what an audience may see; sections outside ``shared`` are withheld for non-private audiences."""
    if audience not in AUDIENCES:
        raise TwinError(f"audience must be one of {', '.join(AUDIENCES)}")
    if not set(shared) <= set(SECTIONS):
        raise TwinError(f"shared sections must be among {', '.join(SECTIONS)}")
    if audience == "private":
        return {**build_twin(entries, subject), "audience": "private"}
    if minor and audience == "public":
        return {"subject": subject, "audience": "public", "withheld": "no public projection for a minor"}
    allowed = {"community": ("COMMUNITY", "PUBLIC"), "public": ("PUBLIC",)}[audience]
    visible = [e for e in entries if e.get("kind") != "event" or e["visibility"] in allowed]
    twin = build_twin(visible, subject)
    keep = [s for s in shared if not (minor and s == "community")]
    return {"schema": twin["schema"], "subject": subject, "audience": audience,
            **{section: twin[section] for section in keep},
            "withheld": sorted(set(SECTIONS) - set(keep))}


def world_state(entries: list[dict[str, Any]], min_group: int = MIN_GROUP) -> dict[str, Any]:
    """Aggregate community figures per capability; groups smaller than ``min_group`` people are suppressed."""
    learners: dict[str, set[str]] = defaultdict(set)
    verified: dict[str, set[str]] = defaultdict(set)
    for event in entries:
        if event.get("kind") != "event" or not event["capability"]:
            continue
        learners[event["capability"]].add(event["actor"])
        if effective_state(event) == "VERIFIED" and event["outcome"] == "SUCCESS":
            verified[event["capability"]].add(event["actor"])
    open_disputes = sum(1 for e in entries if e.get("kind") == "dispute") - \
        sum(1 for e in entries if e.get("kind") == "resolution")

    def shown(people: set[str]) -> int | None:
        return len(people) if len(people) >= min_group else None
    return {"capabilities": {cap: {"people": shown(people), "with_verified_success": shown(verified[cap])}
                             for cap, people in sorted(learners.items())},
            "open_disputes": open_disputes,
            "note": f"counts under {min_group} people are suppressed; correlations here are candidates, not causes"}
