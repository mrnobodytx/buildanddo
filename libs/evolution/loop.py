# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/loop.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/store.py, libs/evolution/episode.py, libs/evolution/registry.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/store.py; CONSUMES libs/evolution/episode.py; CONSUMES libs/evolution/registry.py
# Intent:      Close local observation and proposal feedback with retained episode revisions and honest chronological metrics.
# ───────────────────────────────────────────────────────────────

"""Connect the journal, current episode revisions and chronological competence readback."""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime

from libs.semantic_twin.contracts import Contract, require

from .common import digest, mapping
from .compiler import ActionProposal, DecisionInput
from .episode import Episode, build_episodes
from .event import SourceKind
from .promotion import CompetenceState, HealthObservation, demote
from .scorer import Rate
from .store import Journal


@dataclass(frozen=True, slots=True)
class EvolutionEpoch(Contract):
    """Capture cumulative local observations and competence without claiming live acceptance."""

    scope_id: str
    recorded_at: datetime
    event_ids: tuple[str, ...]
    episode_ids: tuple[str, ...]
    registry_revisions: tuple[str, ...]
    episode_counts: Mapping[str, int]
    competence_counts: Mapping[str, int]
    route_counts: Mapping[str, int]
    authority_expansions: int
    previous_root: str | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            len(set(self.event_ids)) == len(self.event_ids), "duplicate epoch event"
        )
        require(
            all(
                n >= 0
                for counts in (
                    self.episode_counts,
                    self.competence_counts,
                    self.route_counts,
                )
                for n in counts.values()
            ),
            "negative epoch count",
        )
        require(self.authority_expansions == 0, "stored proposals expanded authority")

    @property
    def root(self) -> str:
        """Hash the local chronological snapshot without signing or attesting it."""
        return digest(self)

    def summary(self) -> dict[str, object]:
        """Expose actual denominators, with no percentage for an unexercised route."""
        total = sum(self.route_counts.values())
        return {
            "epoch_root": self.root,
            "previous_root": self.previous_root,
            "scope_id": self.scope_id,
            "recorded_at": self.recorded_at.isoformat(),
            "events": len(self.event_ids),
            "episodes": dict(self.episode_counts),
            "learning": dict(self.competence_counts),
            "cognition": {
                route: Rate(self.route_counts.get(route, 0), total).summary()
                for route in (
                    "TOKENLESS",
                    "LOCAL_MODEL",
                    "FRONTIER_MODEL",
                    "UNRESOLVED",
                )
            },
            "safety": {
                "authority_expansions": self.authority_expansions,
                "unsafe_promotions": 0,
                "causal_claims": 0,
                "scope": "Validated retained local proposals and competence history; no execution or live attestation.",
            },
        }


def refresh_episodes(
    journal: Journal, *, as_of: datetime | None = None
) -> tuple[Episode, ...]:
    """Rebuild current episodes while retaining each previously observed revision."""
    events = tuple(
        e for e in journal.events() if as_of is None or e.ingested_at <= as_of
    )
    episodes = build_episodes(events, as_of=as_of)
    for episode in episodes:
        journal.save("episode", episode)
    return episodes


def capture_epoch(
    journal: Journal, *, at: datetime
) -> tuple[EvolutionEpoch, dict[str, object]]:
    """Measure current routing and competence and retain a linked local epoch."""
    events = tuple(e for e in journal.events() if e.ingested_at <= at)
    episodes = refresh_episodes(journal, as_of=at)
    records = journal.records()
    require(
        all(record.history[-1].occurred_at <= at for record in records),
        "status predates current registry state",
    )
    prior = journal.artifacts("epoch")
    previous = EvolutionEpoch.from_dict(prior[-1]) if prior else None
    require(
        previous is None or at > previous.recorded_at, "epoch must follow prior capture"
    )
    counts: Counter[str] = Counter()
    expansions = 0
    for event in events:
        if (
            event.source_kind is not SourceKind.EVOLUTION
            or event.event_type != "evolution.proposal_observed"
        ):
            continue
        route = event.data.get("route")
        require(
            route in ("TOKENLESS", "LOCAL_MODEL", "FRONTIER_MODEL", "UNRESOLVED"),
            "unknown stored inference route",
        )
        counts[str(route)] += 1
        raw = event.data.get("proposal")
        if raw is not None:
            proposal = ActionProposal.from_dict(mapping(raw))
            require(
                proposal.scope_id == event.scope_id
                and proposal.correlation_id == event.correlation_id,
                "stored proposal scope mismatch",
            )
            expansions += proposal.authority is not event.authority
    epoch = EvolutionEpoch(
        journal.scope_id,
        at,
        tuple(e.event_id for e in events),
        tuple(e.episode_id for e in episodes),
        tuple(r.revision for r in records),
        {
            state: sum(e.status == state for e in episodes)
            for state in ("INCOMPLETE", "COMPLETE", "VERIFIED")
        },
        {
            state.value: sum(r.state is state for r in records)
            for state in CompetenceState
        },
        dict(counts),
        expansions,
        previous.root if previous else None,
    )
    delta: dict[str, object] = {
        "status": "UNMEASURED",
        "reason": "no earlier local epoch",
    }
    if previous is not None:
        require(
            set(previous.event_ids) <= set(epoch.event_ids),
            "epoch lost retained observations",
        )
        before_total, after_total = (
            sum(previous.route_counts.values()),
            sum(epoch.route_counts.values()),
        )
        before = Rate(previous.route_counts.get("TOKENLESS", 0), before_total).value
        after = Rate(epoch.route_counts.get("TOKENLESS", 0), after_total).value
        delta = {
            "status": "OBSERVED_ROUTING_MIX",
            "previous_events": len(previous.event_ids),
            "current_events": len(epoch.event_ids),
            "tokenless_share_delta": after - before
            if after is not None and before is not None
            else None,
            "verified_capability_delta": sum(
                epoch.competence_counts.get(state, 0)
                for state in (
                    "VERIFIED_CAPABILITY",
                    "TOKENLESS_PREFERRED",
                )
            )
            - sum(
                previous.competence_counts.get(state, 0)
                for state in (
                    "VERIFIED_CAPABILITY",
                    "TOKENLESS_PREFERRED",
                )
            ),
            "scope": "Cumulative request mix, not an accuracy comparison on a fixed corpus.",
        }
    journal.save("epoch", epoch)
    return epoch, delta


def next_actions(journal: Journal) -> tuple[str, ...]:
    """Name the next unsatisfied evidence boundary for each current capability."""
    actions = []
    for record in journal.records():
        prefix = record.candidate.candidate_id
        instructions = {
            CompetenceState.HYPOTHESIS: "qualify repeated independently reviewed discovery outcomes",
            CompetenceState.CANDIDATE: "replay on later disjoint episodes",
            CompetenceState.REPLAY_PASS: "capture shadow model proposals on new cases",
            CompetenceState.SHADOW: "supply exact replay/shadow TEVV from an independent verifier",
            CompetenceState.VERIFIED_CAPABILITY: "promote the compiled proposal program at unchanged authority",
            CompetenceState.TOKENLESS_PREFERRED: "observe governed use and fresh independent outcomes",
            CompetenceState.WATCH: "return through fresh shadow evaluation",
            CompetenceState.DISABLED: "register a new version after diagnosing retained failures",
            CompetenceState.DISCOVERED: "form a bounded response hypothesis",
        }
        actions.append(prefix + ": " + instructions[record.state])
    return tuple(actions) or (
        "Capture independently reviewed episodes before discovering capabilities.",
    )


def observe_compatibility(
    journal: Journal, observation: DecisionInput, *, at: datetime
) -> tuple[str, ...]:
    """Automatically demote preferred versions when an actual request exposes incompatible context."""
    require(
        observation.scope_id == journal.scope_id, "request scope differs from journal"
    )
    changed = []
    for record in journal.records():
        candidate = record.candidate
        if (
            record.state
            in (
                CompetenceState.VERIFIED_CAPABILITY,
                CompetenceState.TOKENLESS_PREFERRED,
            )
            and candidate.authority is observation.authority
            and candidate.risk == observation.risk
            and candidate.compatibility != observation.graph.compatibility
        ):
            health = HealthObservation(
                candidate.subject, observation.graph.compatibility, at
            )
            journal.save_registry(
                demote(record, health), expected_revision=record.revision
            )
            changed.append(candidate.candidate_id)
    return tuple(changed)
