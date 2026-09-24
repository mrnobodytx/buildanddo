# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/progression.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/semantic_twin/models.py, libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/serializer.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/models.py; CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/serializer.py
# Intent:      Explain developmental prerequisites and historical change through existing owners without creating identities or granting authority.
# ───────────────────────────────────────────────────────────────

"""Project invitations, progression and historical queries over canonical captures."""

from __future__ import annotations

import hashlib
from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass, fields, is_dataclass
from datetime import datetime
from typing import Literal, cast

from .contracts import Contract, require, text
from .identity import SemanticId, SubjectRef, ValidTime
from .ingestion.graph import SemanticGraph
from .ingestion.serializer import object_leaf_digest
from .models import CanonicalObjectEnvelope, Source
from .relations import Relation
from .vocabulary import EvidenceState, RelationPredicate, TevvState


def _observations_before(value: object, at: datetime) -> None:
    """Check typed receipt times, including evidence nested inside graph relations."""
    if isinstance(value, Contract) and is_dataclass(value):
        for field in fields(value):
            item = getattr(value, field.name)
            if isinstance(item, datetime) and field.name in {
                "observed_at",
                "observed_time",
                "evaluated_at",
                "occurred_at",
                "created_at",
                "issued_at",
                "attested_at",
                "verified_at",
            }:
                require(item <= at, "future typed evidence")
            _observations_before(item, at)
    elif isinstance(value, (tuple, list)):
        for item in value:
            _observations_before(item, at)
    elif isinstance(value, Mapping):
        for item in value.values():
            _observations_before(item, at)


@dataclass(frozen=True, slots=True, kw_only=True)
class Invitation(Contract):
    """Retain a discovery and the identity candidates supplied by its existing owner."""

    source: Source
    observed_at: datetime
    locator: str
    owner: SemanticId | None = None
    canonical_ids: tuple[SemanticId, ...] = ()
    semantic_classes: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.locator, "discovery locator")
        require(
            len(set(self.canonical_ids)) == len(self.canonical_ids),
            "duplicate identity candidate",
        )
        for label in self.semantic_classes:
            text(label, "semantic class")


@dataclass(frozen=True, slots=True, kw_only=True)
class TwinCapture(Contract):
    """Keep exact owner envelopes and discovery inputs at one scoped capture boundary."""

    scope_id: str
    captured_at: datetime
    objects: tuple[CanonicalObjectEnvelope, ...]
    invitations: tuple[Invitation, ...] = ()
    schema_version: Literal["semantic-twin.capture/v1"] = "semantic-twin.capture/v1"

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.scope_id, "capture scope")
        SemanticGraph(self.objects).require_resolved()
        for obj in self.objects:
            _observations_before(obj, self.captured_at)
            require(
                obj.observed_time is None or obj.observed_time <= self.captured_at,
                "future object",
            )
            require(
                all(ref.observed_at <= self.captured_at for ref in obj.evidence),
                "future evidence",
            )
        require(
            all(item.observed_at <= self.captured_at for item in self.invitations),
            "future discovery",
        )
        object.__setattr__(
            self,
            "objects",
            tuple(sorted(self.objects, key=lambda item: item.semantic_id)),
        )
        # Exact repeated invitations are idempotent. Conflicting mappings remain separate.
        unique = {item.to_json(): item for item in self.invitations}
        object.__setattr__(
            self, "invitations", tuple(unique[key] for key in sorted(unique))
        )

    @property
    def digest(self) -> str:
        """Bind the scope, capture boundary and unchanged envelopes using the P0 profile."""
        return hashlib.sha256(self.to_json().encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True, kw_only=True)
class Prerequisite(Contract):
    """Name the exact revision and evidentiary standing required by an existing model."""

    name: str
    subject: SubjectRef
    next_action: str
    accepted_states: tuple[EvidenceState, ...] = (EvidenceState.VERIFIED,)

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.name, "prerequisite name")
        text(self.next_action, "next action")
        require(
            bool(self.accepted_states)
            and len(set(self.accepted_states)) == len(self.accepted_states)
            and set(self.accepted_states)
            <= {
                EvidenceState.OBSERVED,
                EvidenceState.INFERRED,
                EvidenceState.VERIFIED,
            },
            "prerequisites require explicit measured states",
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class ProgressionTarget(Contract):
    """Reference an owner's development model without defining or awarding its levels."""

    participant: SubjectRef
    source: Source
    declared_at: datetime
    target_label: str
    prerequisites: tuple[Prerequisite, ...]
    model: SubjectRef | None = None
    current_label: str | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.target_label, "target label")
        require(
            len({item.name for item in self.prerequisites}) == len(self.prerequisites),
            "duplicate prerequisite",
        )
        if self.current_label is not None:
            text(self.current_label, "current label")
            require(self.model is not None, "a current level needs its canonical model")


def _time(at: datetime) -> datetime:
    result = ValidTime(valid_from=at).valid_from
    assert result is not None
    return result


def _conditions(
    obj: CanonicalObjectEnvelope | None, at: datetime, max_age_seconds: int
) -> tuple[str, ...]:
    if obj is None:
        return ("UNMEASURED",)
    conditions: set[str] = set()
    if (
        obj.observed_time is None
        or obj.state.evidence_state is EvidenceState.UNMEASURED
    ):
        conditions.add("UNMEASURED")
    if obj.state.evidence_state is EvidenceState.CONTRADICTED:
        conditions.add("CONFLICTING")
    if obj.state.evidence_state in {
        EvidenceState.INSUFFICIENT,
        EvidenceState.QUARANTINED,
        EvidenceState.SUPERSEDED,
        EvidenceState.RETIRED,
    }:
        conditions.add(obj.state.evidence_state.value)
    if obj.state.tevv_state is TevvState.FAIL:
        conditions.add("FAILED")
    if obj.state.lifecycle_state.upper() in {
        "UNKNOWN",
        "DEGRADED",
        "FAILED",
        "RETIRED",
        "UNTARGETED",
    }:
        conditions.add(obj.state.lifecycle_state.upper())
    if obj.runtime.observed_status and obj.runtime.observed_status.upper() in {
        "DEGRADED",
        "FAILED",
        "UNKNOWN",
    }:
        conditions.add(obj.runtime.observed_status.upper())
    times = [ref.observed_at for ref in obj.evidence]
    if obj.observed_time is not None:
        times.append(obj.observed_time)
    if times and (at - min(times)).total_seconds() > max_age_seconds:
        conditions.add("STALE")
    if obj.valid_time.valid_until is not None and obj.valid_time.valid_until <= at:
        conditions.add("STALE")
    if obj.valid_time.valid_from is not None and obj.valid_time.valid_from > at:
        conditions.add("UNKNOWN")
    return tuple(sorted(conditions))


def _boundary(capture: TwinCapture, at: datetime, max_age_seconds: int) -> datetime:
    at = _time(at)
    require(
        at >= capture.captured_at,
        "a later capture cannot answer an earlier observation",
    )
    require(
        type(max_age_seconds) is int and max_age_seconds > 0,
        "supply a positive evidence lifetime",
    )
    return at


def resolve_invitations(capture: TwinCapture) -> tuple[dict[str, object], ...]:
    """Link discoveries only to supplied canonical identities, retaining ambiguity."""
    indexed = {obj.semantic_id: obj for obj in capture.objects}
    mappings: dict[tuple[str, str], set[SemanticId]] = {}
    owners: dict[tuple[str, str], set[SemanticId]] = {}
    for item in capture.invitations:
        mappings.setdefault((item.source.system, item.locator), set()).update(
            item.canonical_ids
        )
        if item.owner is not None:
            owners.setdefault((item.source.system, item.locator), set()).add(item.owner)
    results: list[dict[str, object]] = []
    for item in capture.invitations:
        candidates = mappings[item.source.system, item.locator]
        target = indexed.get(next(iter(candidates))) if len(candidates) == 1 else None
        reason = "The canonical identity or owner has not been resolved."
        status = "UNRESOLVED"
        if (
            len(candidates) > 1
            or len(owners.get((item.source.system, item.locator), set())) > 1
            or (
                target is not None
                and item.owner is not None
                and target.ownership.owner != item.owner
            )
        ):
            status, reason = (
                "CONFLICTING",
                "Retain the competing owner mappings; no merge was performed.",
            )
        elif target is not None and item.owner is not None:
            status, reason = (
                "RESOLVED",
                "Linked to the supplied owner's existing identity; trust is unchanged.",
            )
        results.append(
            {
                "locator": item.locator,
                "status": status,
                "reason": reason,
                "subject": target.subject.to_dict()
                if status == "RESOLVED" and target
                else None,
                "candidates": [str(identity) for identity in sorted(candidates)],
                "source": item.source.to_dict(),
                "observed_at": item.observed_at.isoformat(),
                "owner": str(item.owner) if item.owner else None,
                "semantic_classes": list(item.semantic_classes),
                "authorized": False,
            }
        )
    return tuple(results)


def describe(
    capture: TwinCapture, *, at: datetime, max_age_seconds: int = 86400
) -> tuple[dict[str, object], ...]:
    """Expose distinct state axes, evidence, owner and unknown authority for every object."""
    at = _boundary(capture, at, max_age_seconds)
    return tuple(
        {
            "subject": obj.subject.to_dict(),
            "object_type": obj.object_type.value,
            "representation": "DISCOVERED",
            "assertions": obj.to_dict()["claims"],
            "state": obj.state.to_dict(),
            "conditions": list(_conditions(obj, at, max_age_seconds)),
            "source": obj.source.to_dict(),
            "provenance": obj.provenance.to_dict(),
            "observed_at": obj.observed_time.isoformat() if obj.observed_time else None,
            "valid_time": obj.valid_time.to_dict(),
            "owner": str(obj.ownership.owner),
            "required_authority": obj.authority.required_tier.value,
            "granted_authority": None,
            "evidence": [ref.to_dict() for ref in obj.evidence],
            "leaf_digest": object_leaf_digest(obj),
            "authorized": False,
        }
        for obj in capture.objects
    )


def progression(
    capture: TwinCapture,
    target: ProgressionTarget,
    *,
    at: datetime,
    max_age_seconds: int = 86400,
) -> dict[str, object]:
    """Explain exact prerequisites and the next evidence action without promoting anything."""
    at = _boundary(capture, at, max_age_seconds)
    require(target.declared_at <= capture.captured_at, "future progression declaration")
    indexed = {obj.semantic_id: obj for obj in capture.objects}
    participant = indexed.get(target.participant.semantic_id)
    blockers: list[str] = []
    if any(
        str(target.participant.semantic_id) in cast(list[str], entry["candidates"])
        and entry["status"] != "RESOLVED"
        for entry in resolve_invitations(capture)
    ):
        blockers.append(
            "Resolve the participant's conflicting or incomplete identity mapping."
        )
    if participant is None or participant.subject != target.participant:
        blockers.append("Resolve the exact participant revision.")
    elif _conditions(participant, at, max_age_seconds):
        blockers.append("Refresh or resolve the participant's evidence and state.")
    model = indexed.get(target.model.semantic_id) if target.model else None
    if model is None or model.subject != target.model:
        blockers.append(
            "Resolve the canonical progression model; no A-level is inferred."
        )
    elif _conditions(model, at, max_age_seconds):
        blockers.append("Refresh or resolve the canonical progression model.")
    if (at - target.declared_at).total_seconds() > max_age_seconds:
        blockers.append("Refresh the owner's progression declaration.")
    if not target.prerequisites:
        blockers.append("Have the model owner specify measurable prerequisites.")
    requirements: list[dict[str, object]] = []
    for item in target.prerequisites:
        obj = indexed.get(item.subject.semantic_id)
        conditions = list(_conditions(obj, at, max_age_seconds))
        if obj is not None and obj.subject != item.subject:
            conditions.append("CONFLICTING")
        satisfied = (
            obj is not None
            and not conditions
            and obj.subject == item.subject
            and obj.state.evidence_state in item.accepted_states
        )
        if not satisfied:
            blockers.append(item.next_action)
        requirements.append(
            {
                "name": item.name,
                "subject": item.subject.to_dict(),
                "observed_subject": obj.subject.to_dict() if obj else None,
                "accepted_states": [state.value for state in item.accepted_states],
                "evidence_state": obj.state.evidence_state.value
                if obj
                else "UNMEASURED",
                "conditions": sorted(set(conditions)),
                "satisfied": satisfied,
                "next_action": item.next_action,
                "evidence": [ref.to_dict() for ref in obj.evidence] if obj else [],
            }
        )
    return {
        "participant": target.participant.to_dict(),
        "model": target.model.to_dict() if target.model else None,
        "declared_current_level": target.current_label,
        "declared_target_level": target.target_label,
        "declaration": target.source.to_dict(),
        "declared_at": target.declared_at.isoformat(),
        "state": participant.state.to_dict() if participant else None,
        "required_authority": participant.authority.required_tier.value
        if participant
        else None,
        "authority_ceiling": None,
        "requirements": requirements,
        "blockers": blockers,
        "next_action": blockers[0]
        if blockers
        else "Request the existing independent review and governance decision.",
        "status": "EVIDENCE_GAPS" if blockers else "REVIEW_CANDIDATE",
        "promoted": False,
        "authorized": False,
    }


def traverse(
    capture: TwinCapture,
    start: SemanticId,
    *,
    reverse: bool = False,
    predicates: tuple[RelationPredicate, ...] = (RelationPredicate.DEPENDS_ON,),
    limit: int = 1000,
) -> dict[str, object]:
    """Walk dependency or impact paths while retaining each edge's evidence and validity."""
    require(
        any(obj.semantic_id == start for obj in capture.objects),
        "unknown traversal origin",
    )
    require(
        bool(predicates)
        and all(type(value) is RelationPredicate for value in predicates),
        "use canonical predicates",
    )
    require(type(limit) is int and 1 <= limit <= 10000, "invalid traversal bound")
    adjacent: dict[SemanticId, list[tuple[SemanticId, Relation]]] = {}
    for obj in capture.objects:
        for edge in obj.relations:
            if edge.predicate in predicates:
                source, destination = (
                    (edge.target, obj.semantic_id)
                    if reverse
                    else (obj.semantic_id, edge.target)
                )
                adjacent.setdefault(source, []).append((destination, edge))
    pending: deque[tuple[SemanticId, tuple[Relation, ...]]] = deque([(start, ())])
    seen = {start}
    paths: list[dict[str, object]] = []
    truncated = False
    while pending:
        current, prefix = pending.popleft()
        for destination, edge in sorted(
            adjacent.get(current, []), key=lambda pair: (pair[0], pair[1].to_json())
        ):
            if destination in seen:
                continue
            if len(paths) >= limit:
                truncated = True
                continue
            seen.add(destination)
            route = (*prefix, edge)
            paths.append(
                {
                    "subject": str(destination),
                    "path": [item.to_dict() for item in route],
                }
            )
            pending.append((destination, route))
    return {
        "origin": str(start),
        "direction": "impact" if reverse else "dependencies",
        "paths": paths,
        "truncated": truncated,
        "causal_proof": False,
        "authorized": False,
    }


def search(
    capture: TwinCapture,
    query: str,
    *,
    at: datetime,
    max_age_seconds: int = 86400,
    limit: int = 100,
) -> dict[str, object]:
    """Find literal capabilities, objects and evidence gaps in the same captured truth."""
    text(query, "semantic query")
    require(type(limit) is int and 1 <= limit <= 1000, "invalid search bound")
    terms = query.casefold().split()
    entries = describe(capture, at=at, max_age_seconds=max_age_seconds)
    matches = [
        entry
        for obj, entry in zip(capture.objects, entries, strict=True)
        if all(term in obj.to_json().casefold() for term in terms)
    ]
    return {
        "query": query,
        "capture_digest": capture.digest,
        "matches": matches[:limit],
        "truncated": len(matches) > limit,
        "scope_id": capture.scope_id,
        "authorized": False,
    }


def capture_at(
    captures: tuple[TwinCapture, ...], *, scope_id: str, at: datetime
) -> TwinCapture:
    """Select retained knowledge as it existed at the requested capture boundary."""
    at = _time(at)
    require(bool(captures), "no retained history")
    require(
        all(item.scope_id == scope_id for item in captures), "history crosses scope"
    )
    by_time: dict[datetime, TwinCapture] = {}
    for item in captures:
        previous = by_time.get(item.captured_at)
        require(
            previous is None or previous.digest == item.digest,
            "conflicting captures at one time",
        )
        by_time[item.captured_at] = item
    eligible = [item for moment, item in by_time.items() if moment <= at]
    require(bool(eligible), "no retained capture existed at this observation boundary")
    return max(eligible, key=lambda item: item.captured_at)


def compare(
    before: TwinCapture, after: TwinCapture, *, max_age_seconds: int = 86400
) -> dict[str, object]:
    """Retain state changes and regressions without equating disappearance with retirement."""
    require(before.scope_id == after.scope_id, "comparison crosses scope")
    require(
        before.captured_at < after.captured_at,
        "comparison requires forward capture time",
    )
    _boundary(after, after.captured_at, max_age_seconds)
    old = {obj.semantic_id: obj for obj in before.objects}
    new = {obj.semantic_id: obj for obj in after.objects}
    changes: list[dict[str, object]] = []
    for identity in sorted(old.keys() | new.keys()):
        prior, current = old.get(identity), new.get(identity)
        old_conditions = _conditions(prior, before.captured_at, max_age_seconds)
        new_conditions = _conditions(current, after.captured_at, max_age_seconds)
        if prior == current and old_conditions == new_conditions:
            continue
        earlier = prior.to_dict() if prior else {}
        later = current.to_dict() if current else {}
        fields = sorted(
            key
            for key in earlier.keys() | later.keys()
            if earlier.get(key) != later.get(key)
        )
        if old_conditions != new_conditions:
            fields.append("conditions")
        regression = prior is not None and (
            current is None
            or (
                prior.state.evidence_state is EvidenceState.VERIFIED
                and current.state.evidence_state is not EvidenceState.VERIFIED
            )
            or bool(set(new_conditions) - set(old_conditions))
        )
        changes.append(
            {
                "semantic_id": str(identity),
                "kind": "UNTARGETED"
                if current is None
                else "DISCOVERED"
                if prior is None
                else "CHANGED",
                "before": prior.subject.to_dict() if prior else None,
                "after": current.subject.to_dict() if current else None,
                "before_leaf": object_leaf_digest(prior) if prior else None,
                "after_leaf": object_leaf_digest(current) if current else None,
                "changed_fields": fields,
                "before_state": prior.state.to_dict() if prior else None,
                "after_state": current.state.to_dict() if current else None,
                "conditions": list(new_conditions)
                if current
                else ["UNTARGETED", "UNMEASURED"],
                "regression_signal": regression,
            }
        )
    return {
        "scope_id": before.scope_id,
        "before_digest": before.digest,
        "after_digest": after.digest,
        "from": before.captured_at.isoformat(),
        "to": after.captured_at.isoformat(),
        "changes": changes,
        "invitations_changed": before.invitations != after.invitations,
        "before_admission": list(resolve_invitations(before))
        if before.invitations != after.invitations
        else [],
        "after_admission": list(resolve_invitations(after))
        if before.invitations != after.invitations
        else [],
        "causal_proof": False,
        "authorized": False,
    }
