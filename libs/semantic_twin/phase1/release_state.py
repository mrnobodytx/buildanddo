# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/release_state.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     tools/buildanddo_release.py, libs/semantic_twin/phase1/common.py
# EnumType:    Service
# EnumEdges:   CONSUMES state/sprint; CONSUMES .citadel-release; PRODUCES libs/semantic_twin/phase1/compiler.py
# DAG Node:    semantic-twin.phase-1.release-state
# Intent:      Normalize controller-generated release JSON into observed receipt objects without executing deployment code.
# ────────────────────────────────────────────────────────

"""Ingest local JSON receipts written by the release controller."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any

from ..ingestion.graph import SemanticGraph
from ..vocabulary import EvidenceState, RelationPredicate
from .common import as_mapping, relation, relative_path, stable_id
from .compat import make_object


_TIME_KEYS = ("generated_at", "deployed_at", "verified_at", "emitted_at", "built_at")
_SHA_KEYS = ("commit_sha", "candidate_sha", "deployed_sha", "sha")
_DIGEST_KEYS = ("artifact_sha256", "artifact_digest", "payload_sha256", "sha256")


@dataclass(frozen=True, slots=True)
class ReleaseStateReceipt:
    """Retain normalized controller release evidence and its exact file digest."""

    name: str
    source_path: str
    schema: str | None
    state: str | None
    environment: str | None
    timestamp: str | None
    commit_sha: str | None
    artifact_digest: str | None
    receipt_path: str | None
    payload_digest: str


def discover_release_receipts(repository_root: Path) -> tuple[Path, ...]:
    """Find bounded controller receipt locations without scanning unrelated JSON."""

    candidates: set[Path] = set()
    state_root = repository_root / "state"
    if state_root.is_dir():
        candidates.update(
            path
            for path in state_root.rglob("*.json")
            if "release" in {part.casefold() for part in path.parts}
        )
    artifact_root = repository_root / ".citadel-release"
    if artifact_root.is_dir():
        candidates.update(artifact_root.rglob("*.json"))
    return tuple(sorted(candidates, key=lambda item: item.as_posix()))


def _first_text(payload: Mapping[str, Any], keys: tuple[str, ...]) -> str | None:
    """Return the first non-empty scalar text under a known field name."""

    for key in keys:
        value = payload.get(key)
        if isinstance(value, (str, int, float)) and str(value).strip():
            return str(value).strip()
    return None


def ingest_release_receipts(
    paths: tuple[Path, ...],
    *,
    repository_root: Path | None = None,
) -> tuple[ReleaseStateReceipt, ...]:
    """Normalize explicit release receipt paths in deterministic order."""

    records: list[ReleaseStateReceipt] = []
    for path in sorted(paths, key=lambda item: item.as_posix()):
        raw = path.read_bytes()
        try:
            payload = as_mapping(json.loads(raw.decode("utf-8")))
        except (UnicodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"invalid release receipt: {path}") from exc
        source = relative_path(path, repository_root)
        records.append(
            ReleaseStateReceipt(
                name=path.name.removesuffix(".json").removesuffix(".latest"),
                source_path=source,
                schema=_first_text(payload, ("schema",)),
                state=_first_text(payload, ("state", "status", "result")),
                environment=_first_text(payload, ("environment", "env")),
                timestamp=_first_text(payload, _TIME_KEYS),
                commit_sha=_first_text(payload, _SHA_KEYS),
                artifact_digest=_first_text(payload, _DIGEST_KEYS),
                receipt_path=_first_text(payload, ("receipt_path",)),
                payload_digest=hashlib.sha256(raw).hexdigest(),
            )
        )
    return tuple(records)


def release_receipt_graph(
    records: tuple[ReleaseStateReceipt, ...],
    *,
    anchor_id: str,
    commit: str | None = None,
) -> SemanticGraph:
    """Convert release-state receipts into anchor-connected semantic objects."""

    objects = []
    for record in records:
        object_id = stable_id(
            "release-state", record.source_path, record.payload_digest
        )
        evidence_state = (
            EvidenceState.CONTRADICTED
            if record.state and record.state.upper().startswith("FAIL")
            else EvidenceState.OBSERVED
        )
        objects.append(
            make_object(
                object_id,
                "ReleaseStateReceipt",
                record.source_path,
                claims=(
                    {
                        "name": record.name,
                        "schema": record.schema,
                        "state": record.state,
                        "environment": record.environment,
                        "timestamp": record.timestamp,
                        "commit_sha": record.commit_sha,
                        "artifact_digest": record.artifact_digest,
                        "receipt_path": record.receipt_path,
                        "payload_digest": record.payload_digest,
                    },
                ),
                relations=(
                    relation(
                        RelationPredicate.REFINES,
                        anchor_id,
                        record.source_path,
                    ),
                ),
                evidence_state=evidence_state,
                lifecycle_state="OBSERVED_LOCAL_RECEIPT",
                commit=commit,
                documentation=(record.source_path,),
                runtime_status=record.state,
            )
        )
    return SemanticGraph(tuple(objects))
