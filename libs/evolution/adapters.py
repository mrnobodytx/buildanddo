# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/adapters.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/event.py, libs/semantic_twin/models.py, libs/semantic_twin/phase1/history.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/evolution/event.py; CONSUMES libs/semantic_twin/models.py; CONSUMES libs/semantic_twin/phase1/history.py
# Intent:      Normalize captured provider, mission, memory, telemetry and twin evidence without live access or implied verification.
# ───────────────────────────────────────────────────────────────

"""Adapt permitted local exports; no adapter contacts a provider or mints a receipt."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Literal

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.models import CanonicalObjectEnvelope
from libs.semantic_twin.phase1.history import read_git_history
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState

from .common import decode_json, digest, identity, mapping, string_tuple, timestamp
from .event import CitadelEvent, Phase, SourceKind


@dataclass(frozen=True, slots=True, kw_only=True)
class CapturedRecord(Contract):
    """Describe an exporter-normalized observation with explicitly supplied source time."""

    occurred_at: datetime
    correlation_id: str
    actor_id: SemanticId
    event_type: str
    subject_id: SemanticId
    subject_version: str
    phase: Phase
    mission_id: str | None = None
    source_sha: str | None = None
    inputs: tuple[str, ...] = ()
    outputs: tuple[str, ...] = ()
    evidence_refs: tuple[str, ...] = ()
    features: Mapping[str, str] = field(default_factory=dict)
    data: Mapping[str, object] = field(default_factory=dict)
    verification: VerificationReceipt | None = None


@dataclass(frozen=True, slots=True, kw_only=True)
class Capture(Contract):
    """Keep provider events inside the receiving operator's explicit capture scope."""

    schema_version: Literal["citadel.evolution.capture/v1"]
    scope_id: str
    source_kind: SourceKind
    source_ref: str
    observed_at: datetime
    authority: AuthorityTier
    risk: str
    records: tuple[CapturedRecord, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.scope_id, "capture scope")
        text(self.source_ref, "capture source")
        require(bool(self.records), "empty capture")


@dataclass(frozen=True, slots=True)
class Adaptation:
    """Report absent source fields explicitly instead of inventing observations."""

    events: tuple[CitadelEvent, ...]
    gaps: tuple[str, ...] = ()


def normalize_capture(
    capture: Capture,
    *,
    ingested_at: datetime,
    source_digest: ContentDigest | None = None,
) -> Adaptation:
    """Normalize every supported capture family under one immutable event contract."""
    fingerprint = source_digest or ContentDigest(digest(capture))
    return Adaptation(
        tuple(
            CitadelEvent.from_dict(
                {
                    **record.to_dict(),
                    "scope_id": capture.scope_id,
                    "source_kind": capture.source_kind.value,
                    "source_ref": capture.source_ref,
                    "source_digest": fingerprint.to_dict(),
                    "authority": capture.authority.value,
                    "risk": capture.risk,
                    "observed_at": capture.observed_at.isoformat(),
                    "ingested_at": ingested_at.isoformat(),
                    "evidence_state": EvidenceState.OBSERVED.value,
                }
            )
            for record in capture.records
        )
    )


def ingest_local(
    path: Path,
    *,
    format_name: str,
    scope_id: str,
    actor_id: SemanticId,
    observed_at: datetime,
    ingested_at: datetime,
    authority: AuthorityTier = AuthorityTier.A0,
) -> Adaptation:
    """Read one explicit public export without discovering credentials or private files."""
    content = path.read_bytes()
    payload = decode_json(content)
    raw_digest = ContentDigest(hashlib.sha256(content).hexdigest())
    if format_name == "capture":
        capture = Capture.from_dict(mapping(payload))
        require(
            capture.scope_id == scope_id, "capture scope differs from selected scope"
        )
        return normalize_capture(
            capture, ingested_at=ingested_at, source_digest=raw_digest
        )
    if format_name == "events":
        require(isinstance(payload, list), "event input must be an array")
        assert isinstance(payload, list)
        events = tuple(CitadelEvent.from_dict(mapping(value)) for value in payload)
        require(all(e.scope_id == scope_id for e in events), "import mixes scopes")
        require(
            all(e.ingested_at <= ingested_at for e in events), "future event ingestion"
        )
        return Adaptation(events)
    body = mapping(payload)
    records: list[CapturedRecord] = []
    gaps: list[str] = []
    kind: SourceKind
    if format_name == "mission-learning":
        require(
            body.get("format") == "buildanddo.mission-learning/1",
            "unknown mission format",
        )
        kind = SourceKind.MISSION
        if body.get("recorded_review_at") is None:
            return Adaptation(
                (), ("mission learning export has no recorded review time",)
            )
        mission = body.get("mission")
        require(
            isinstance(mission, str) and bool(mission), "mission identity is missing"
        )
        assert isinstance(mission, str)
        records.append(
            CapturedRecord(
                occurred_at=timestamp(body["recorded_review_at"]),
                correlation_id=mission,
                actor_id=actor_id,
                event_type="mission.learning_observed",
                subject_id=identity("mission", (scope_id, mission)),
                subject_version=digest(body),
                phase=Phase.CONTEXT,
                mission_id=mission,
                evidence_refs=string_tuple(body.get("evidence_ids", [])),
                data={
                    "claimed_status": body.get("status"),
                    "assurance": body.get("assurance"),
                    "learning_points": body.get("learning_points"),
                },
            )
        )
        gaps.append("unsigned mission learning records do not provide typed TEVV")
    elif format_name == "telemetry":
        require(body.get("schema_version") == 1, "unknown telemetry format")
        kind = SourceKind.TELEMETRY
        context = mapping(body.get("context"))
        source_sha = context.get("commit_sha")
        require(isinstance(source_sha, str), "telemetry source revision is missing")
        assert isinstance(source_sha, str)
        metrics = mapping(body.get("metrics"))
        records.append(
            CapturedRecord(
                occurred_at=timestamp(body.get("generated_at")),
                correlation_id=source_sha,
                actor_id=actor_id,
                event_type="telemetry.snapshot",
                subject_id=identity(
                    "observation", (scope_id, source_sha, body.get("generated_at"))
                ),
                subject_version=raw_digest.value,
                source_sha=source_sha,
                phase=Phase.CONTEXT,
                data={"metrics": metrics, "context": context},
            )
        )
    elif format_name == "memory":
        kind = SourceKind.MEMORY
        values = body.get("vectors", body.get("entries"))
        require(isinstance(values, list), "memory export requires vectors")
        assert isinstance(values, list)
        for index, value in enumerate(values):
            record = mapping(value)
            if record.get("type") != "C":
                continue
            if not record.get("timestamp"):
                gaps.append(f"memory event {index} has no occurrence timestamp")
                continue
            sha = record.get("commit_sha")
            if sha is not None and (
                not isinstance(sha, str) or len(sha) not in (40, 64)
            ):
                gaps.append(f"memory event {index} has no full source revision")
                sha = None
            records.append(
                CapturedRecord(
                    occurred_at=timestamp(record["timestamp"]),
                    correlation_id=str(record.get("dispatch_id") or f"memory-{index}"),
                    actor_id=actor_id,
                    event_type="memory.event_observed",
                    subject_id=identity("memory", (path.as_posix(), index)),
                    subject_version=digest(record),
                    source_sha=sha,
                    phase=Phase.CONTEXT,
                    data=record,
                )
            )
        gaps.append("memory event assertions do not provide independent verification")
    elif format_name == "phase1":
        kind = SourceKind.GRAPH
        graph = mapping(body.get("graph", body))
        require(
            graph.get("schema_version") == "semantic-twin.graph/v2",
            "unknown twin export",
        )
        values = graph.get("objects")
        require(isinstance(values, list), "twin export requires objects")
        assert isinstance(values, list)
        objects = tuple(
            CanonicalObjectEnvelope.from_dict(mapping(value)) for value in values
        )
        from libs.semantic_twin.ingestion.graph import SemanticGraph

        SemanticGraph(objects).require_resolved()
        for obj in objects:
            records.append(
                CapturedRecord(
                    occurred_at=observed_at,
                    correlation_id=str(obj.semantic_id),
                    actor_id=actor_id,
                    event_type="graph.object_observed",
                    subject_id=obj.semantic_id,
                    subject_version=obj.source.version,
                    phase=Phase.CONTEXT,
                    data={
                        "object_type": obj.object_type.value,
                        "claims": obj.claims,
                        "declared_evidence_state": obj.state.evidence_state.value,
                    },
                )
            )
        gaps.append(
            "graph capture observes objects; it does not re-verify their claims"
        )
    else:
        raise ValueError("unsupported capture format")
    if not records:
        return Adaptation((), tuple(gaps))
    result = normalize_capture(
        Capture(
            schema_version="citadel.evolution.capture/v1",
            scope_id=scope_id,
            source_kind=kind,
            source_ref=path.as_posix(),
            observed_at=observed_at,
            authority=authority,
            risk="read_only_capture",
            records=tuple(records),
        ),
        ingested_at=ingested_at,
        source_digest=raw_digest,
    )
    return Adaptation(result.events, tuple(gaps))


def observe_git(
    repository: Path,
    *,
    scope_id: str,
    observed_at: datetime,
    actor_id: SemanticId,
    limit: int = 100,
) -> Adaptation:
    """Reuse bounded Phase 1 Git ingestion without treating commit messages as outcomes."""
    require(1 <= limit <= 1000, "history limit must be between 1 and 1000")
    records = []
    for commit in read_git_history(repository, max_count=limit):
        records.append(
            CapturedRecord(
                occurred_at=timestamp(commit.authored_at),
                correlation_id=commit.commit,
                actor_id=actor_id,
                event_type="git.commit_observed",
                subject_id=identity("commit", commit.commit),
                subject_version=commit.commit,
                source_sha=commit.commit,
                phase=Phase.CONTEXT,
                evidence_refs=(f"git:{commit.commit}",),
                data={
                    "parents": commit.parents,
                    "changed_paths": tuple(c.path for c in commit.changes),
                    "subject": commit.subject,
                },
            )
        )
    if not records:
        return Adaptation((), ("local Git history is empty",))
    return normalize_capture(
        Capture(
            schema_version="citadel.evolution.capture/v1",
            scope_id=scope_id,
            source_kind=SourceKind.GIT,
            source_ref="local-git-history",
            observed_at=observed_at,
            authority=AuthorityTier.A0,
            risk="read_only",
            records=tuple(records),
        ),
        ingested_at=observed_at,
    )
