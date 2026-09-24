# --- CGRF Header ------------------------------------------------
# File:        apps/world_twin/episode.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/events.py, libs/evolution/episode.py, libs/capability_tokens/verification.py
# EnumType:    Service
# EnumEdges:   CONSUMES apps/world_twin/events.py; CONSUMES libs/evolution/episode.py; CONSUMES libs/capability_tokens/verification.py
# Intent:      Join scoped world observations through existing episode and review contracts without inferring causation or trusting self-reported verification.
# ----------------------------------------------------------------

"""Correlate world observations and admit externally authenticated exact reviews."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from libs.capability_tokens.verification import ReviewPolicy, require_review
from libs.evolution.common import digest, identity
from libs.evolution.episode import Episode, build_episodes
from libs.semantic_twin.contracts import Contract, ContractError, require
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState, TevvState

from .events import LAYERS, WorldEvent

REVIEW_CHECKS = ("world.provenance", "world.outcome", "world.attribution")


def review_states(
    events: tuple[WorldEvent, ...],
    receipts: tuple[VerificationReceipt, ...],
    policy: ReviewPolicy | None,
    *,
    at: datetime,
) -> dict[str, dict[str, object]]:
    """Project supplied reviews without letting their submitter establish trust.

    Policy pins must be authenticated by the receiving process. No pin is taken
    from an event, file signature claim, transport label or provider status.
    Supply full captured lineage before narrowing to an audience. Negative or
    disagreeing admitted reviews block positive verification.
    """
    require(len(receipts) <= 4000, "too many world reviews")
    lineage_actors: dict[str, set[SemanticId]] = {}
    for episode in world_episodes(events):
        # Collect every wrapper; the same core ID can recur in another release.
        attribution: dict[str, set[SemanticId]] = defaultdict(set)
        for event in episode.events:
            attribution[event.observation.event_id].update((event.observation.actor_id, *event.participants))
            if event.guildmaster_id is not None:
                attribution[event.observation.event_id].add(event.guildmaster_id)
        producers: dict[str, set[SemanticId]] = {}
        for lineage in episode.lineages:
            for attempt in lineage.attempts:
                actors = {actor for part in (attempt.action, attempt.result) if part is not None
                          for actor in attribution[part.event_id]}
                for part in (attempt.action, attempt.result, attempt.review):
                    if part is not None:
                        producers[part.event_id] = actors
        for event in episode.events:
            lineage_actors[event.event_id] = producers.get(event.observation.event_id, set())
    by_subject: dict[SemanticId, list[VerificationReceipt]] = defaultdict(list)
    for receipt in receipts:
        by_subject[receipt.subject.semantic_id].append(receipt)
    result: dict[str, dict[str, object]] = {}
    for event in events:
        subject = event.review_subject
        admitted: dict[str, VerificationReceipt] = {}
        rejected = False
        for receipt in by_subject[subject.semantic_id]:
            if policy is None:
                rejected = True
                continue
            try:
                require(receipt.subject == subject, "changed reviewed event")
                receipt_digest = digest(receipt)
                require(ContentDigest(receipt_digest) in policy.receipt_digests, "unpinned world review")
                require(receipt.result.verifier_id in policy.verifiers, "untrusted world reviewer")
                require(receipt.policy.policy_id == policy.policy_id and receipt.policy.policy_version == policy.policy_version,
                        "world review policy mismatch")
                require(receipt.result.actor_id == event.observation.actor_id, "world review producer mismatch")
                require(receipt.result.verifier_id not in (event.observation.actor_id, event.guildmaster_id, *event.participants)
                        and receipt.result.verifier_id not in lineage_actors[event.event_id],
                        "world reviewer participated in the observation or its attempt")
                # These are read-only assertions, not admission to execute the
                # actor's operation (which may have a different authority tier).
                receipt.policy.require_allow(subject, event.observation.actor_id,
                                             AuthorityTier.A0, (subject.semantic_id,))
                require(event.observation.observed_at <= receipt.result.evaluated_at <= at
                        and (at - receipt.result.evaluated_at).total_seconds() <= policy.max_age_seconds,
                        "premature, future or stale world review")
                checks = (*REVIEW_CHECKS, *(("world.capability",) if event.capabilities else ()))
                if receipt.result.state is TevvState.PASS:
                    require_review(receipt, subject, policy, at=at, tier=AuthorityTier.A0,
                                   checks=checks, sources=(SemanticId(event.observation.event_id),),
                                   since=event.observation.observed_at)
                else:
                    require(receipt.result.state in (TevvState.FAIL, TevvState.HOLD, TevvState.WATCH),
                            "review has no actionable result")
                    require(bool(receipt.result.evidence) and all(event.observation.observed_at <= ref.observed_at <= at
                            for ref in receipt.result.evidence), "negative review evidence is not current")
                    require(any(ref.source == SemanticId(event.observation.event_id) for ref in receipt.result.evidence),
                            "negative review omits exact observation")
                admitted[receipt_digest] = receipt
            except ContractError:
                rejected = True
        states = {receipt.result.state for receipt in admitted.values()}
        status = "UNREVIEWED"
        if len(states) > 1:
            status = "CONTESTED"
        elif states:
            status = next(iter(states)).value
        # Receiving pins can support observed or structurally verified sources;
        # a PASS cannot relabel an inference or another non-observation state.
        supported = status == "PASS" and event.observation.evidence_state in (EvidenceState.OBSERVED, EvidenceState.VERIFIED)
        result[event.event_id] = {
            "status": status,
            "independently_reviewed": supported,
            "receipt_ids": sorted({str(receipt.receipt_id) for receipt in admitted.values()}),
            "receipt_digests": sorted(admitted),
            "verifier_ids": sorted({str(receipt.result.verifier_id) for receipt in admitted.values()}),
            "evaluated_at": max(receipt.result.evaluated_at for receipt in admitted.values()).isoformat() if admitted else None,
            "unaccepted_review": rejected,
        }
    return result


@dataclass(frozen=True, slots=True)
class WorldEpisode(Contract):
    """Retain one correlation slice without merging tenant, mission or release."""

    events: tuple[WorldEvent, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(bool(self.events), "world episode needs events")
        first = self.events[0]
        scope = (first.tenant_id, first.observation.mission_id, first.observation.correlation_id, first.release_sha)
        require(all((event.tenant_id, event.observation.mission_id, event.observation.correlation_id, event.release_sha) == scope
                    for event in self.events), "episode mixes tenant, mission, correlation or release")
        require(len({event.event_id for event in self.events}) == len(self.events), "duplicate world episode event")
        require(self.events == tuple(sorted(self.events, key=lambda event: (event.observation.occurred_at,
                                                                          event.observation.observed_at, event.event_id))),
                "world episode is not chronologically ordered")
        self.lineages

    @property
    def lineages(self) -> tuple[Episode, ...]:
        """Reuse strict attempt reconstruction separately for each authority scope."""
        groups: dict[AuthorityTier, list[WorldEvent]] = defaultdict(list)
        for event in self.events:
            groups[event.observation.authority].append(event)
        return tuple(episode for authority in sorted(groups, key=lambda value: value.value)
                     for episode in build_episodes(tuple(event.observation for event in groups[authority])))

    @property
    def episode_id(self) -> SemanticId:
        """Address the exact visible history without using ingestion-time noise."""
        return identity("episode", tuple(event.event_id for event in self.events))

    def replay(self, reviews: dict[str, dict[str, object]], *, include_traces: bool) -> dict[str, object]:
        """Render a partial flight record without claiming a causal or live replay."""
        # Validate full lineage before this audience cut. Hidden predecessors are
        # then omitted, not fabricated or mistaken for malformed source history.
        visible = tuple(event for event in self.events if event.event_id in reviews)
        require(bool(visible), "episode has no visible events")
        first = visible[0]
        present = {ref.layer for event in visible for ref in event.traces}
        core_ids = {event.observation.event_id for event in visible}
        unresolved = sum(ref not in core_ids for event in visible for ref in event.observation.inputs)
        missing = sorted(set(LAYERS) - present)
        partial = len(visible) != len(self.events)
        lineages = [lineage for lineage in self.lineages if any(event.event_id in core_ids for event in lineage.events)]
        incomplete = partial or any(lineage.status == "INCOMPLETE" for lineage in lineages)
        return {
            "schema_version": "buildanddo.world-episode/v1",
            "episode_id": str(identity("episode", tuple(event.event_id for event in visible))),
            "tenant_id": first.tenant_id,
            "mission_id": first.observation.mission_id,
            "correlation_id": first.observation.correlation_id,
            "release_sha": first.release_sha,
            "state": "PARTIAL" if missing or incomplete or unresolved or first.release_sha is None else "RECORDED",
            "missing_layers": missing,
            "unresolved_inputs": unresolved,
            "lineages": [{"episode_id": str(identity("episode", tuple(event.event_id for event in lineage.events if event.event_id in core_ids))),
                          "state": "INCOMPLETE" if partial or lineage.status == "INCOMPLETE" else "RECORDED",
                          "authority": lineage.events[0].authority.value,
                          "attempts": [{"action": attempt.action.event_id if attempt.action.event_id in core_ids else None,
                                        "result": attempt.result.event_id if attempt.result and attempt.result.event_id in core_ids else None,
                                        "review": attempt.review.event_id if attempt.review and attempt.review.event_id in core_ids else None}
                                       for attempt in lineage.attempts
                                       if any(event is not None and event.event_id in core_ids for event in (attempt.action, attempt.result, attempt.review))]}
                         for lineage in lineages],
            "timeline": [{"event_id": event.event_id,
                          "occurred_at": event.observation.occurred_at.isoformat(),
                          "observed_at": event.observation.observed_at.isoformat(),
                          "actor_id": str(event.observation.actor_id),
                          "event_type": event.observation.event_type,
                          "phase": event.observation.phase.value,
                          "recorded_outcome": event.outcome,
                          "reported_evidence_state": event.observation.evidence_state.value,
                          "review": reviews[event.event_id],
                          "traces": [ref.to_dict() for ref in event.traces] if include_traces else []}
                         for event in visible],
            "causal_state": "TEMPORAL_ONLY",
            "executed": False,
        }


def world_episodes(events: tuple[WorldEvent, ...]) -> tuple[WorldEpisode, ...]:
    """Partition already admitted events on their full correlation boundary."""
    groups: dict[tuple[str, str | None, str, str | None], list[WorldEvent]] = defaultdict(list)
    for event in events:
        groups[event.tenant_id, event.observation.mission_id, event.observation.correlation_id, event.release_sha].append(event)
    return tuple(sorted((WorldEpisode(tuple(sorted(values, key=lambda event: (event.observation.occurred_at,
                                                                            event.observation.observed_at, event.event_id))))
                         for values in groups.values()), key=lambda episode: str(episode.episode_id)))
