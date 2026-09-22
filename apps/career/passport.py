# ─── CGRF Header ──────────────────────────────
# File:        apps/career/passport.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/evidence.py, apps/career/history.py, apps/career/missions.py, apps/career/taxonomy.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/evidence.py; DEPENDS_ON apps/career/history.py; DEPENDS_ON apps/career/missions.py; DEPENDS_ON apps/career/taxonomy.py; PRODUCES apps/career/match.py
# DAG Node:    none
# Intent:      Aggregate participation-classified evidence into a per-capability Career Passport that states its own limits.
# ─────────────────────────────────────────────────────────────

"""Build and serialize the Career Passport."""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from apps.career.evidence import (
    CLAIM_VERBS,
    PARTICIPATION_ORDER,
    CareerError,
    ClaimState,
    EvidenceRef,
    Participation,
    best_state,
    canonical_digest,
    strongest,
)
from apps.career.history import Attribution
from apps.career.missions import MissionAttribution
from apps.career.taxonomy import CAPABILITIES

SCHEMA = "buildanddo.career.passport/v1"
EVIDENCE_SAMPLE = 12
VOLUME_SATURATION = 32

PARTICIPATION_WEIGHT: dict[Participation, float] = {
    Participation.PERSONALLY_IMPLEMENTED: 1.0,
    Participation.DESIGNED: 0.95,
    Participation.PERSONALLY_OPERATED: 0.9,
    Participation.DIRECTED: 0.85,
    Participation.VERIFIED: 0.85,
    Participation.REVIEWED: 0.7,
    Participation.TEAM_DELIVERED: 0.5,
    Participation.AGENT_EXECUTED: 0.0,
}
STATE_WEIGHT: dict[ClaimState, float] = {
    ClaimState.VERIFIED: 1.0,
    ClaimState.OBSERVED: 0.85,
    ClaimState.DECLARED: 0.5,
    ClaimState.ABSENT: 0.0,
}

CONFIDENCE_NOTE = (
    "confidence is a deterministic ranking heuristic over volume, recency, "
    "participation and claim state; it is not a probability and not verification"
)


def parse_instant(value: str) -> datetime:
    """Parse an ISO-8601 instant; naive values are treated as UTC."""
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise CareerError(f"invalid timestamp {value!r}") from error
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def recency_weight(days: int) -> float:
    """Return 1.0 within 90 days, falling linearly to 0.3 at two years."""
    if days <= 90:
        return 1.0
    if days >= 730:
        return 0.3
    return round(1.0 - 0.7 * (days - 90) / 640, 4)


def confidence(records: int, days_since: int, participation: Participation, state: ClaimState) -> float:
    """Combine volume, recency, participation and state into a ranking heuristic."""
    volume = min(1.0, math.log2(1 + records) / math.log2(1 + VOLUME_SATURATION))
    score = (
        0.4 * volume
        + 0.2 * recency_weight(days_since)
        + 0.2 * PARTICIPATION_WEIGHT[participation]
        + 0.2 * STATE_WEIGHT[state]
    )
    return round(score, 2)


@dataclass(frozen=True, slots=True)
class CapabilityEntry:
    """Summarize all evidence for one capability."""

    capability_id: str
    label: str
    records: int
    participation_counts: dict[str, int]
    strongest_participation: Participation
    claim_participation: Participation
    claim_verb: str
    state: ClaimState
    first_seen: str
    last_seen: str
    observed_span_days: int
    days_since_last: int
    confidence: float
    evidence: tuple[dict[str, str], ...]

    @property
    def verified(self) -> bool:
        """Return whether the best evidence was settled by an independent verifier."""
        return self.state is ClaimState.VERIFIED

    def refs(self) -> set[str]:
        """Return the evidence references retained in this entry."""
        return {item["ref"] for item in self.evidence}

    def to_dict(self) -> dict[str, Any]:
        """Serialize to plain JSON values."""
        return {
            "capability_id": self.capability_id,
            "label": self.label,
            "records": self.records,
            "participation_counts": dict(self.participation_counts),
            "strongest_participation": self.strongest_participation.value,
            "claim_participation": self.claim_participation.value,
            "claim_verb": self.claim_verb,
            "state": self.state.value,
            "verified": self.verified,
            "first_seen": self.first_seen,
            "last_seen": self.last_seen,
            "observed_span_days": self.observed_span_days,
            "days_since_last": self.days_since_last,
            "confidence": self.confidence,
            "evidence": [dict(item) for item in self.evidence],
        }

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> CapabilityEntry:
        """Rebuild an entry from its serialized form."""
        try:
            return cls(
                capability_id=str(raw["capability_id"]),
                label=str(raw["label"]),
                records=int(raw["records"]),
                participation_counts={str(k): int(v) for k, v in raw["participation_counts"].items()},
                strongest_participation=Participation(raw["strongest_participation"]),
                claim_participation=Participation(raw["claim_participation"]),
                claim_verb=str(raw["claim_verb"]),
                state=ClaimState(raw["state"]),
                first_seen=str(raw["first_seen"]),
                last_seen=str(raw["last_seen"]),
                observed_span_days=int(raw["observed_span_days"]),
                days_since_last=int(raw["days_since_last"]),
                confidence=float(raw["confidence"]),
                evidence=tuple({str(k): str(v) for k, v in item.items()} for item in raw["evidence"]),
            )
        except (KeyError, TypeError, ValueError, AttributeError) as error:
            raise CareerError("malformed passport capability entry") from error


@dataclass(frozen=True, slots=True)
class Passport:
    """Hold a person's evidence-backed capabilities and the sources behind them."""

    person_id: str
    as_of: str
    sources: tuple[dict[str, Any], ...]
    capabilities: tuple[CapabilityEntry, ...]

    def entry(self, capability_id: str) -> CapabilityEntry | None:
        """Return the entry for a capability, or None when there is no evidence."""
        for item in self.capabilities:
            if item.capability_id == capability_id:
                return item
        return None

    def body(self) -> dict[str, Any]:
        """Return the digest-bound body."""
        return {
            "schema": SCHEMA,
            "person_id": self.person_id,
            "as_of": self.as_of,
            "sources": [dict(item) for item in self.sources],
            "capabilities": [item.to_dict() for item in self.capabilities],
            "confidence_note": CONFIDENCE_NOTE,
            "limits": [
                "git evidence is OBSERVED: it shows work was recorded, not independently verified",
                "agent-authored work earns personal credit only when the person integrated it, and then only as REVIEWED",
                "employment tenure is not derivable from repository history",
            ],
        }

    @property
    def digest(self) -> str:
        """Return the digest of the passport body."""
        return canonical_digest(self.body())

    def to_dict(self) -> dict[str, Any]:
        """Serialize with the body digest."""
        return {**self.body(), "digest": self.digest}

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> Passport:
        """Rebuild a passport and reject a digest that no longer matches its body."""
        if raw.get("schema") != SCHEMA:
            raise CareerError("unsupported passport schema")
        try:
            passport = cls(
                person_id=str(raw["person_id"]),
                as_of=str(raw["as_of"]),
                sources=tuple(dict(item) for item in raw["sources"]),
                capabilities=tuple(CapabilityEntry.from_dict(item) for item in raw["capabilities"]),
            )
        except (KeyError, TypeError) as error:
            raise CareerError("malformed passport") from error
        if raw.get("digest") != passport.digest:
            raise CareerError("passport digest does not match its body")
        return passport


def claim_participation(counts: Counter[str], records: int) -> Participation:
    """Return the participation a headline claim may carry.

    The strongest participation qualifies only when it covers at least two records
    and a fifth of the capability's records; otherwise the next qualifying one is
    used, falling back to the most frequent. One authored commit among many
    reviewed ones does not make the capability "implemented".
    """
    threshold = max(2.0, 0.2 * records)
    for participation in PARTICIPATION_ORDER:
        if counts.get(participation.value, 0) >= threshold:
            return participation
    top = max(counts.items(), key=lambda item: (item[1], -PARTICIPATION_ORDER.index(Participation(item[0]))))
    return Participation(top[0])


def _sample(refs: list[EvidenceRef]) -> tuple[dict[str, str], ...]:
    ordered = sorted(refs, key=lambda item: item.observed_at, reverse=True)
    ordered.sort(key=lambda item: PARTICIPATION_ORDER.index(item.participation))
    chosen: list[EvidenceRef] = []
    seen: set[str] = set()
    for item in ordered:
        if item.ref in seen:
            continue
        seen.add(item.ref)
        chosen.append(item)
        if len(chosen) == EVIDENCE_SAMPLE:
            break
    return tuple(item.to_dict() for item in chosen)


def build_passport(
    person_id: str,
    evidence: Iterable[EvidenceRef],
    *,
    as_of: datetime,
    sources: Iterable[dict[str, Any]] = (),
) -> Passport:
    """Aggregate evidence per capability; capabilities without evidence are omitted."""
    if as_of.tzinfo is None:
        raise CareerError("as_of must be timezone-aware")
    grouped: dict[str, list[EvidenceRef]] = {}
    for item in evidence:
        if item.participation is Participation.AGENT_EXECUTED:
            raise CareerError("agent-executed evidence cannot enter a person's passport")
        grouped.setdefault(item.capability_id, []).append(item)
    entries: list[CapabilityEntry] = []
    for capability in CAPABILITIES:
        refs = grouped.get(capability.capability_id)
        if not refs:
            continue
        instants = [parse_instant(item.observed_at) for item in refs]
        first, last = min(instants), max(instants)
        counts = Counter(item.participation.value for item in refs)
        top = strongest([item.participation for item in refs])
        state = best_state([item.state for item in refs])
        records = len({item.ref for item in refs})
        days_since = max(0, (as_of - last).days)
        headline = claim_participation(counts, records)
        verb = CLAIM_VERBS[headline]
        if verb is None:  # pragma: no cover - rejected above
            raise CareerError("unclaimable participation")
        entries.append(
            CapabilityEntry(
                capability_id=capability.capability_id,
                label=capability.label,
                records=records,
                participation_counts=dict(sorted(counts.items())),
                strongest_participation=top,
                claim_participation=headline,
                claim_verb=verb,
                state=state,
                first_seen=first.isoformat(),
                last_seen=last.isoformat(),
                observed_span_days=(last - first).days,
                days_since_last=days_since,
                confidence=confidence(records, days_since, headline, state),
                evidence=_sample(refs),
            )
        )
    return Passport(
        person_id=person_id,
        as_of=as_of.isoformat(),
        sources=tuple(sources),
        capabilities=tuple(entries),
    )


def passport_from_history(
    person_id: str,
    attribution: Attribution,
    attestations: Iterable[EvidenceRef],
    *,
    as_of: datetime,
    head: str,
    missions: MissionAttribution | None = None,
) -> Passport:
    """Build a passport from git attribution, attestations and optional mission evidence."""
    extra = list(attestations)
    source = {
        "kind": "git",
        "head": head,
        "commits_total": attribution.commits_total,
        "authored": attribution.authored,
        "integrated": attribution.integrated,
        "agent_integrated": attribution.agent_integrated,
        "excluded_agent": attribution.excluded_agent,
        "excluded_other": attribution.excluded_other,
        "unmapped": attribution.unmapped,
    }
    sources = [source]
    if extra:
        sources.append({"kind": "attestations", "records": len({item.ref for item in extra})})
    mission_evidence: list[EvidenceRef] = []
    if missions is not None:
        sources.append(missions.source())
        mission_evidence = missions.evidence
    return build_passport(
        person_id, [*attribution.evidence, *extra, *mission_evidence], as_of=as_of, sources=sources
    )


def entry_by_id(passport: Passport) -> dict[str, CapabilityEntry]:
    """Index passport entries by capability id."""
    return {item.capability_id: item for item in passport.capabilities}


__all__ = [
    "CapabilityEntry",
    "Passport",
    "build_passport",
    "confidence",
    "entry_by_id",
    "parse_instant",
    "passport_from_history",
    "recency_weight",
]
