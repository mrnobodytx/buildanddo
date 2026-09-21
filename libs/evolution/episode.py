# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/episode.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/event.py, libs/semantic_twin/promotions.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/event.py; CONSUMES libs/semantic_twin/promotions.py
# Intent:      Retain complete attempt histories and require independent result-bound receipts for verified episodes.
# ───────────────────────────────────────────────────────────────

"""Build inspectable attempts while keeping narrative completion separate from truth."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.vocabulary import TevvState

from .common import identity
from .event import CitadelEvent, Phase


@dataclass(frozen=True, slots=True)
class Attempt(Contract):
    """Preserve an action and its linked result, including unsuccessful attempts."""

    action: CitadelEvent
    result: CitadelEvent | None = None
    review: CitadelEvent | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(self.action.phase is Phase.ACTION, "attempt must start with an action")
        text(str(self.action.data.get("attempt_id", "")), "attempt_id")
        prior = self.action
        for event, phase in (
            (self.result, Phase.RESULT),
            (self.review, Phase.VERIFICATION),
        ):
            if event is None:
                continue
            require(event.phase is phase, "wrong attempt phase")
            require(
                (
                    event.scope_id,
                    event.correlation_id,
                    event.mission_id,
                    event.authority,
                )
                == (
                    self.action.scope_id,
                    self.action.correlation_id,
                    self.action.mission_id,
                    self.action.authority,
                ),
                "attempt scope mismatch",
            )
            require(
                event.data.get("attempt_id") == self.action.data.get("attempt_id"),
                "attempt identity mismatch",
            )
            require(
                prior.event_id in event.inputs, "attempt omits predecessor reference"
            )
            require(
                prior.occurred_at <= event.occurred_at
                and prior.observed_at <= event.observed_at,
                "attempt time reversal",
            )
            prior = event
        require(self.review is None or self.result is not None, "review has no result")
        if self.review is not None and self.review.verification is not None:
            assert self.result is not None
            receipt = self.review.verification
            require(
                receipt.subject == self.result.subject,
                "review/result revision mismatch",
            )
            require(
                receipt.result.actor_id == self.action.actor_id,
                "review producer mismatch",
            )
            require(
                receipt.result.verifier_id
                not in (self.action.actor_id, self.result.actor_id),
                "reviewer must be independent of action and result producers",
            )
            require(
                receipt.result.evaluated_at >= self.result.observed_at,
                "review predates result observation",
            )
            require(
                any(
                    ref.source == SemanticId(self.result.event_id)
                    for ref in receipt.result.evidence
                ),
                "review omits exact result event",
            )
            status = self.result.data.get("status")
            if receipt.result.state in (TevvState.PASS, TevvState.FAIL):
                require(
                    status == receipt.result.state.value, "result and review disagree"
                )

    @property
    def verdict(self) -> TevvState | None:
        """Return only a policy-bound typed verdict, never a provider status string."""
        if self.review is None or self.review.verification is None:
            return None
        receipt = self.review.verification
        if not receipt.policy.allowed:
            return None
        if receipt.result.state is TevvState.PASS:
            PromotionProof(
                subject=receipt.subject,
                evidence=receipt.result.evidence,
                verification=receipt,
                tevv=receipt.result,
            ).validate_for(TevvState.TESTING, TevvState.PASS)
        return receipt.result.state


@dataclass(frozen=True, slots=True)
class Episode(Contract):
    """Retain the full captured chronology instead of replacing failures with success."""

    events: tuple[CitadelEvent, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(bool(self.events), "episode requires events")
        require(
            len({e.event_id for e in self.events}) == len(self.events),
            "duplicate episode event",
        )
        first = self.events[0]
        require(
            all(
                (e.scope_id, e.correlation_id, e.mission_id, e.authority)
                == (
                    first.scope_id,
                    first.correlation_id,
                    first.mission_id,
                    first.authority,
                )
                for e in self.events
            ),
            "episode mixes scopes, missions or authority",
        )
        require(
            tuple(sorted(self.events, key=event_order)) == self.events,
            "episode must be chronologically ordered",
        )
        self.attempts  # Validate all action/result/review links at construction.

    @property
    def episode_id(self) -> str:
        """Address the complete episode revision, including failed attempts."""
        return str(identity("episode", tuple(e.event_id for e in self.events)))

    @property
    def attempts(self) -> tuple[Attempt, ...]:
        """Build explicit attempt links; reject ambiguous or orphaned result records."""
        groups: dict[str, dict[Phase, CitadelEvent]] = {}
        for event in self.events:
            if event.phase not in (Phase.ACTION, Phase.RESULT, Phase.VERIFICATION):
                continue
            key = event.data.get("attempt_id")
            # Standalone captures (e.g. a pipeline status) lack an action lineage.
            if key is None:
                continue
            require(isinstance(key, str) and bool(key), "invalid attempt_id")
            assert isinstance(key, str)
            parts = groups.setdefault(key, {})
            require(event.phase not in parts, "duplicate phase for one attempt")
            parts[event.phase] = event
        result = []
        for parts in groups.values():
            require(Phase.ACTION in parts, "result/review names an unknown attempt")
            result.append(
                Attempt(
                    parts[Phase.ACTION],
                    parts.get(Phase.RESULT),
                    parts.get(Phase.VERIFICATION),
                )
            )
        return tuple(result)

    @property
    def status(self) -> str:
        """Distinguish incomplete, complete and independently verified narratives."""
        phases = {e.phase for e in self.events}
        attempts = self.attempts
        complete = (
            set(Phase) <= phases
            and bool(attempts)
            and all(a.result is not None and a.review is not None for a in attempts)
            and all(
                e.data.get("attempt_id") is not None
                for e in self.events
                if e.phase in (Phase.ACTION, Phase.RESULT, Phase.VERIFICATION)
            )
            and all(
                any(
                    e.phase is phase
                    and event_order(e) < event_order(attempts[0].action)
                    for e in self.events
                )
                for phase in (Phase.PROBLEM, Phase.CONTEXT, Phase.HYPOTHESIS)
            )
        )
        if not complete:
            return "INCOMPLETE"
        if attempts[-1].verdict is TevvState.PASS:
            return "VERIFIED"
        return "COMPLETE"

    @property
    def started_at(self) -> datetime:
        """Return the first captured observation available to the decision."""
        return min(e.observed_at for e in self.events)

    @property
    def ended_at(self) -> datetime:
        """Return the last source observation, retaining later local ingestion separately."""
        return max(e.observed_at for e in self.events)

    @property
    def source_shas(self) -> tuple[str, ...]:
        """Name every source revision involved in the episode for leakage exclusion."""
        return tuple(
            sorted({e.source_sha for e in self.events if e.source_sha is not None})
        )


def event_order(event: CitadelEvent) -> tuple[datetime, datetime, int, str]:
    """Order ties by narrative stage and immutable content identity."""
    return (
        event.occurred_at,
        event.observed_at,
        list(Phase).index(event.phase),
        event.event_id,
    )


def build_episodes(
    events: tuple[CitadelEvent, ...], *, as_of: datetime | None = None
) -> tuple[Episode, ...]:
    """Group captured observations without crossing scope or correlation boundaries."""
    seen: dict[str, CitadelEvent] = {}
    groups: dict[tuple[str, str], list[CitadelEvent]] = defaultdict(list)
    for event in events:
        if as_of is not None and event.observed_at > as_of:
            continue
        previous = seen.get(event.event_id)
        require(
            previous is None or previous.stable_payload == event.stable_payload,
            "conflicting event identity",
        )
        if previous is None:
            groups[event.scope_id, event.correlation_id].append(event)
            seen[event.event_id] = event
    return tuple(
        sorted(
            (
                Episode(tuple(sorted(group, key=event_order)))
                for group in groups.values()
            ),
            key=lambda e: (e.started_at, e.episode_id),
        )
    )
