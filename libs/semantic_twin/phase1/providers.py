# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/providers.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/inputs.py, libs/semantic_twin/phase1/common.py, libs/semantic_twin/phase1/compat.py, libs/semantic_twin/vocabulary.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/inputs.py; CONSUMES libs/semantic_twin/phase1/common.py; CONSUMES libs/semantic_twin/phase1/compat.py; CONSUMES libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-1.provider-exports
# Intent:      Normalize caller-supplied GitLab and Datadog exports while preserving that they are captured observations, not live verification.
# ────────────────────────────────────────────────────────

"""Ingest captured provider JSON without network access or credentials."""

from __future__ import annotations

from collections.abc import Mapping
import json
from pathlib import Path
from typing import Any

from ..ingestion.graph import SemanticGraph
from ..ingestion.builder import ObjectDraft
from ..ingestion.inputs import SourceSnapshot
from ..vocabulary import EvidenceState, RelationPredicate
from .common import as_mapping, relation, relative_path, stable_id
from .compat import make_object


def _records(payload: Mapping[str, Any], key: str) -> tuple[Mapping[str, Any], ...]:
    """Return mapping records stored under one provider export category."""

    value = payload.get(key)
    if not isinstance(value, list):
        return ()
    return tuple(as_mapping(item) for item in value if isinstance(item, Mapping))


def _record_id(record: Mapping[str, Any], index: int) -> str:
    """Choose a stable provider record identity."""

    for key in ("id", "pipeline_id", "job_id", "trace_id", "event_id", "uuid"):
        value = record.get(key)
        if isinstance(value, (str, int)) and str(value).strip():
            return str(value)
    return str(index)


def _provider_object(
    object_id: str,
    object_type: str,
    source_path: str,
    record: Mapping[str, Any],
    target_id: str,
    *,
    snapshot: SourceSnapshot,
    commit: str | None,
    predicate: RelationPredicate = RelationPredicate.MEMBER_OF,
) -> ObjectDraft:
    """Create one captured provider observation object."""

    status = record.get("status") or record.get("state") or record.get("result")
    return make_object(
        object_id,
        object_type,
        source_path,
        snapshot=snapshot,
        claims=(dict(record),),
        relations=(relation(predicate, target_id, source_path),),
        evidence_state=EvidenceState.OBSERVED,
        lifecycle_state="CAPTURED_PROVIDER_EXPORT",
        commit=commit,
        documentation=(source_path,),
        runtime_status=str(status) if status is not None else None,
    )


def ingest_gitlab_export(
    path: Path,
    *,
    anchor_id: str,
    repository_root: Path | None = None,
    commit: str | None = None,
) -> SemanticGraph:
    """Normalize captured GitLab pipelines, jobs and artifacts from local JSON."""

    source = relative_path(path, repository_root)
    snapshot = SourceSnapshot.capture(path, source_path=source)
    payload = as_mapping(json.loads(snapshot.content))
    root_id = stable_id("gitlab-export", source)
    objects = [
        make_object(
            root_id,
            "GitLabExport",
            source,
            snapshot=snapshot,
            claims=({"captured": True, "live_query": False},),
            relations=(relation(RelationPredicate.REFINES, anchor_id, source),),
            evidence_state=EvidenceState.OBSERVED,
            lifecycle_state="CAPTURED_PROVIDER_EXPORT",
            commit=commit,
            documentation=(source,),
        )
    ]
    pipeline_ids: dict[str, str] = {}
    for index, record in enumerate(_records(payload, "pipelines")):
        raw_id = _record_id(record, index)
        object_id = stable_id("gitlab-pipeline", source, raw_id)
        pipeline_ids[raw_id] = object_id
        objects.append(
            _provider_object(
                object_id,
                "GitLabPipeline",
                source,
                record,
                root_id,
                snapshot=snapshot,
                commit=commit,
            )
        )
    job_ids: dict[str, str] = {}
    for index, record in enumerate(_records(payload, "jobs")):
        raw_id = _record_id(record, index)
        object_id = stable_id("gitlab-job", source, raw_id)
        job_ids[raw_id] = object_id
        pipeline_key = str(record.get("pipeline_id", ""))
        target = pipeline_ids.get(pipeline_key, root_id)
        objects.append(
            _provider_object(
                object_id,
                "GitLabJob",
                source,
                record,
                target,
                snapshot=snapshot,
                commit=commit,
            )
        )
    for index, record in enumerate(_records(payload, "artifacts")):
        raw_id = _record_id(record, index)
        job_key = str(record.get("job_id", ""))
        target = job_ids.get(job_key, root_id)
        objects.append(
            _provider_object(
                stable_id("gitlab-artifact", source, raw_id),
                "GitLabArtifact",
                source,
                record,
                target,
                snapshot=snapshot,
                commit=commit,
                predicate=RelationPredicate.DERIVED_FROM,
            )
        )
    return SemanticGraph(tuple(objects))


def ingest_datadog_export(
    path: Path,
    *,
    anchor_id: str,
    repository_root: Path | None = None,
    commit: str | None = None,
) -> SemanticGraph:
    """Normalize captured Datadog DORA, trace, event and verification records."""

    source = relative_path(path, repository_root)
    snapshot = SourceSnapshot.capture(path, source_path=source)
    payload = as_mapping(json.loads(snapshot.content))
    root_id = stable_id("datadog-export", source)
    objects = [
        make_object(
            root_id,
            "DatadogExport",
            source,
            snapshot=snapshot,
            claims=({"captured": True, "live_query": False},),
            relations=(relation(RelationPredicate.REFINES, anchor_id, source),),
            evidence_state=EvidenceState.OBSERVED,
            lifecycle_state="CAPTURED_PROVIDER_EXPORT",
            commit=commit,
            documentation=(source,),
        )
    ]
    categories = (
        ("dora", "DatadogDoraDeployment"),
        ("traces", "DatadogTrace"),
        ("events", "DatadogEvent"),
        ("verifications", "RuntimeVerification"),
    )
    for category, object_type in categories:
        for index, record in enumerate(_records(payload, category)):
            objects.append(
                _provider_object(
                    stable_id(
                        "datadog-record", source, category, _record_id(record, index)
                    ),
                    object_type,
                    source,
                    record,
                    root_id,
                    snapshot=snapshot,
                    commit=commit,
                )
            )
    return SemanticGraph(tuple(objects))
