# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/providers.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/phase1/common.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES captured GitLab JSON; CONSUMES captured Datadog JSON; PRODUCES libs/semantic_twin/phase1/compiler.py
# DAG Node:    semantic-twin.phase-1.provider-exports
# Intent:      Normalize caller-supplied GitLab and Datadog exports while preserving that they are captured observations, not live verification.
# ────────────────────────────────────────────────────────

"""Ingest captured provider JSON without network access or credentials."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from functools import partial
from pathlib import Path
from typing import Any

from ..contracts import ContractError
from ..ingestion.drafts import GraphDraft, ObjectDraft, make_object
from ..vocabulary import EvidenceState, RelationPredicate
from .common import as_mapping, read_json, relation, relative_path, stable_id

_RELEASE_FIELDS = {
    "id",
    "pipeline_id",
    "job_id",
    "trace_id",
    "span_id",
    "event_id",
    "uuid",
    "sha",
    "commit_sha",
    "candidate_sha",
    "expected_sha",
    "deployed_sha",
    "artifact_tree_sha256",
    "artifact_sha256",
    "artifact_digest",
    "payload_sha256",
    "status",
    "state",
    "result",
    "environment",
    "env",
    "service",
    "version",
    "created_at",
    "updated_at",
    "timestamp",
    "started_at",
    "finished_at",
    "verified_at",
    "deployed_at",
    "emitted_at",
    "health_pass",
    "sha_match",
    "flagship_lesson_readback",
    "http_status",
    "remote_writes",
    "name",
    "ref",
    "source",
}


def _release_fields(record: Mapping[str, Any]) -> dict[str, Any]:
    """Project release-relevant provider fields, excluding request content and credentials."""
    attributes = as_mapping(record.get("attributes"))
    merged = {**record, **attributes}
    result = {
        key: value
        for key, value in merged.items()
        if key in _RELEASE_FIELDS
        and (value is None or type(value) in (str, bool, int, float))
    }
    git = as_mapping(merged.get("git"))
    if isinstance(git.get("commit_sha"), str):
        result["commit_sha"] = git["commit_sha"]
    environment = merged.get("environment")
    if isinstance(environment, Mapping) and isinstance(environment.get("name"), str):
        result["environment"] = environment["name"]
    return result


def _records(payload: Mapping[str, Any], key: str) -> tuple[Mapping[str, Any], ...]:
    """Return mapping records stored under one provider export category."""

    value = payload.get(key)
    if value is None and key not in payload:
        return ()
    if not isinstance(value, list) or any(
        not isinstance(item, Mapping) for item in value
    ):
        raise ContractError(f"provider category {key} must be an array of objects")
    return tuple(as_mapping(item) for item in value)


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
    commit: str | None,
    predicate: RelationPredicate = RelationPredicate.MEMBER_OF,
    input_digest: str | None = None,
) -> ObjectDraft:
    """Create one captured provider observation object."""

    status = record.get("status") or record.get("state") or record.get("result")
    return make_object(
        object_id,
        object_type,
        source_path,
        claims=(_release_fields(record),),
        input_digest=input_digest,
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
) -> GraphDraft:
    """Normalize captured GitLab pipelines, jobs and artifacts from local JSON."""

    raw = path.read_bytes()
    payload = read_json(path, raw=raw)
    if not isinstance(payload, Mapping):
        raise ContractError(
            "provider export must be an object with named record arrays"
        )
    digest = hashlib.sha256(raw).hexdigest()
    provider_object = partial(_provider_object, input_digest=digest)
    source = relative_path(path, repository_root)
    root_id = stable_id("gitlab-export", source)
    objects = [
        make_object(
            root_id,
            "GitLabExport",
            source,
            claims=({"captured": True, "live_query": False},),
            relations=(relation(RelationPredicate.REFINES, anchor_id, source),),
            evidence_state=EvidenceState.OBSERVED,
            lifecycle_state="CAPTURED_PROVIDER_EXPORT",
            commit=commit,
            documentation=(source,),
            input_digest=digest,
        )
    ]
    if not any(key in payload for key in ("pipelines", "jobs", "artifacts")):
        raise ContractError(
            "GitLab export requires pipelines, jobs or artifacts arrays"
        )
    pipeline_ids: dict[str, str] = {}
    for index, record in enumerate(_records(payload, "pipelines")):
        raw_id = _record_id(record, index)
        object_id = stable_id("gitlab-pipeline", source, raw_id)
        pipeline_ids[raw_id] = object_id
        objects.append(
            provider_object(
                object_id,
                "GitLabPipeline",
                source,
                record,
                root_id,
                commit=commit,
            )
        )
    job_ids: dict[str, str] = {}
    for index, record in enumerate(_records(payload, "jobs")):
        raw_id = _record_id(record, index)
        object_id = stable_id("gitlab-job", source, raw_id)
        job_ids[raw_id] = object_id
        pipeline_key = str(
            record.get("pipeline_id", as_mapping(record.get("pipeline")).get("id", ""))
        )
        target = pipeline_ids.get(pipeline_key, root_id)
        objects.append(
            provider_object(
                object_id,
                "GitLabJob",
                source,
                record,
                target,
                commit=commit,
            )
        )
    for index, record in enumerate(_records(payload, "artifacts")):
        raw_id = _record_id(record, index)
        job_key = str(record.get("job_id", ""))
        target = job_ids.get(job_key, root_id)
        objects.append(
            provider_object(
                stable_id("gitlab-artifact", source, raw_id),
                "GitLabArtifact",
                source,
                record,
                target,
                commit=commit,
                predicate=RelationPredicate.DERIVED_FROM,
            )
        )
    return GraphDraft(tuple(objects))


def ingest_datadog_export(
    path: Path,
    *,
    anchor_id: str,
    repository_root: Path | None = None,
    commit: str | None = None,
) -> GraphDraft:
    """Normalize captured Datadog DORA, trace, event and verification records."""

    raw = path.read_bytes()
    payload = read_json(path, raw=raw)
    if not isinstance(payload, Mapping):
        raise ContractError(
            "provider export must be an object with named record arrays"
        )
    digest = hashlib.sha256(raw).hexdigest()
    provider_object = partial(_provider_object, input_digest=digest)
    source = relative_path(path, repository_root)
    root_id = stable_id("datadog-export", source)
    objects = [
        make_object(
            root_id,
            "DatadogExport",
            source,
            claims=({"captured": True, "live_query": False},),
            relations=(relation(RelationPredicate.REFINES, anchor_id, source),),
            evidence_state=EvidenceState.OBSERVED,
            lifecycle_state="CAPTURED_PROVIDER_EXPORT",
            commit=commit,
            documentation=(source,),
            input_digest=digest,
        )
    ]
    if not any(key in payload for key in ("dora", "traces", "events", "verifications")):
        raise ContractError(
            "Datadog export requires dora, traces, events or verifications arrays"
        )
    categories = (
        ("dora", "DatadogDoraDeployment"),
        ("traces", "DatadogTrace"),
        ("events", "DatadogEvent"),
        ("verifications", "RuntimeVerification"),
    )
    for category, object_type in categories:
        for index, record in enumerate(_records(payload, category)):
            objects.append(
                provider_object(
                    stable_id(
                        "datadog-record", source, category, _record_id(record, index)
                    ),
                    object_type,
                    source,
                    record,
                    root_id,
                    commit=commit,
                )
            )
    return GraphDraft(tuple(objects))
