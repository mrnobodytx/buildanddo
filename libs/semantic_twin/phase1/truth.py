# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/truth.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/release.py, libs/semantic_twin/phase1/release_state.py, libs/semantic_twin/phase1/providers.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/phase1/compiler.py; PRODUCES release://buildanddo/truth-matrix
# DAG Node:    semantic-twin.phase-1.release-truth
# Intent:      Reconcile expected release identity with captured SHA, artifact, environment, verification and DORA observations without promoting missing evidence.
# ───────────────────────────────────────────────────────

"""Reconcile expected release truth with locally captured observations."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from ..contracts import ContractError
from ..ingestion.drafts import GraphDraft, ObjectDraft, make_object, semantic_id
from ..merkle import ContentDigest, SourceRevision
from ..vocabulary import EvidenceState, RelationPredicate
from .common import relation

TRUTH_MATRIX_KEY = "release://buildanddo/truth-matrix"
TRUTH_MATRIX_ID = semantic_id("ReleaseTruthMatrix", TRUTH_MATRIX_KEY)
_SHA = re.compile(r"^[0-9a-fA-F]{40}(?:[0-9a-fA-F]{24})?$")
_DIGEST = re.compile(r"^[0-9a-fA-F]{64}$")
_RELEASE_KINDS = {
    "ReleaseStateReceipt",
    "GitLabPipeline",
    "GitLabJob",
    "GitLabArtifact",
    "DatadogDoraDeployment",
    "RuntimeVerification",
}


@dataclass(frozen=True, slots=True)
class ReleaseObservation:
    """Preserve release role and identity without conflating them with input hashes."""

    object_id: str
    object_type: str
    role: str
    fields: Mapping[str, Any]
    timestamp: datetime | None


def _time(fields: Mapping[str, Any]) -> datetime | None:
    for key in (
        "verified_at",
        "emitted_at",
        "deployed_at",
        "finished_at",
        "timestamp",
        "generated_at",
        "created_at",
    ):
        value = fields.get(key)
        try:
            if isinstance(value, str):
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo is not None and parsed.utcoffset() is not None:
                    return parsed.astimezone(timezone.utc)
            elif isinstance(value, (int, float)) and not isinstance(value, bool):
                scale = (
                    1_000_000_000
                    if value > 10**17
                    else 1_000_000
                    if value > 10**14
                    else 1_000
                    if value > 10**11
                    else 1
                )
                return datetime.fromtimestamp(value / scale, timezone.utc)
        except (ValueError, OverflowError, OSError):
            continue
    return None


def release_observations(graph: GraphDraft) -> tuple[ReleaseObservation, ...]:
    """Read only receipt/provider records, excluding memory and source-code claims."""
    records = []
    for item in graph.objects:
        if item.object_type not in _RELEASE_KINDS or not item.claims:
            continue
        fields = item.claims[0]
        role = str(fields.get("receipt_kind", "observation"))
        if item.object_type == "RuntimeVerification":
            role = "verification"
        elif item.object_type == "DatadogDoraDeployment":
            role = "dora"
        records.append(
            ReleaseObservation(
                item.semantic_id, item.object_type, role, fields, _time(fields)
            )
        )
    return tuple(records)


def _values(
    records: Iterable[ReleaseObservation],
    keys: tuple[str, ...],
    pattern: re.Pattern[str],
) -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                value.lower()
                for record in records
                for key in keys
                if isinstance(value := record.fields.get(key), str)
                and pattern.fullmatch(value)
            }
        )
    )


def _identity_row(expected: str | None, observed: tuple[str, ...]) -> dict[str, Any]:
    status = (
        "UNMEASURED"
        if expected is None or not observed
        else ("MATCH" if all(value == expected for value in observed) else "CONFLICT")
    )
    return {"expected": expected, "observed": list(observed), "status": status}


def _latest(records: tuple[ReleaseObservation, ...]) -> tuple[ReleaseObservation, ...]:
    """Keep the latest dated observation plus undated records that cannot be ordered."""
    dated = [record.timestamp for record in records if record.timestamp is not None]
    latest = max(dated) if dated else None
    return tuple(
        record
        for record in records
        if record.timestamp is None or record.timestamp == latest
    )


def _current_observations(
    observations: tuple[ReleaseObservation, ...],
) -> tuple[ReleaseObservation, ...]:
    """Compare the newest snapshot per provider, role and environment."""
    groups: dict[tuple[str, str, str], list[ReleaseObservation]] = {}
    for record in observations:
        key = (
            record.object_type,
            record.role,
            str(record.fields.get("environment", record.fields.get("env", ""))),
        )
        groups.setdefault(key, []).append(record)
    selected = {r.object_id for group in groups.values() for r in _latest(tuple(group))}
    return tuple(record for record in observations if record.object_id in selected)


def _environment_row(
    environment: str,
    observations: tuple[ReleaseObservation, ...],
    expected_sha: str | None,
) -> dict[str, Any]:
    records = _latest(
        tuple(
            record
            for record in observations
            if record.role == "verification"
            and record.fields.get("environment", record.fields.get("env"))
            == environment
        )
    )
    verdicts = []
    for record in records:
        fields = record.fields
        state = str(fields.get("state", fields.get("status", ""))).upper()
        wanted, actual = fields.get("expected_sha"), fields.get("deployed_sha")
        if state in {"FAIL", "HOLD"} or any(
            fields.get(k) is False
            for k in ("health_pass", "sha_match", "flagship_lesson_readback")
        ):
            verdicts.append("CONFLICT")
        elif (
            isinstance(actual, str)
            and expected_sha is not None
            and actual != expected_sha
        ):
            verdicts.append("CONFLICT")
        elif (
            state == "PASS"
            and expected_sha is not None
            and wanted == actual == expected_sha
            and record.timestamp is not None
            and all(
                fields.get(k) is True
                for k in ("health_pass", "sha_match", "flagship_lesson_readback")
            )
        ):
            verdicts.append("OBSERVED_PASS")
        else:
            verdicts.append("UNMEASURED")
    status = (
        "CONFLICT"
        if "CONFLICT" in verdicts
        else (
            "OBSERVED_PASS"
            if verdicts and set(verdicts) == {"OBSERVED_PASS"}
            else "UNMEASURED"
        )
    )
    return {
        "expected": "external readback of expected SHA with health and lesson checks",
        "observed": [record.object_id for record in records],
        "status": status,
    }


def _dora_row(
    observations: tuple[ReleaseObservation, ...], expected_sha: str | None
) -> dict[str, Any]:
    records = _latest(tuple(record for record in observations if record.role == "dora"))
    accepted = []
    failures = []
    for record in records:
        fields = record.fields
        shas = _values((record,), ("candidate_sha", "commit_sha", "sha"), _SHA)
        state = str(fields.get("state", fields.get("status", ""))).upper()
        status = fields.get("http_status")
        acknowledged = (
            isinstance(status, int)
            and 200 <= status < 300
            and fields.get("remote_writes") == 1
            and state == "PASS"
        )
        provider_record = (
            record.object_type == "DatadogDoraDeployment"
            and bool(fields.get("id"))
            and fields.get("service") == "buildanddo-public"
        )
        if state in {"FAIL", "HOLD", "HOLD_CREDENTIAL", "NOT_RUN"} or (
            shas and expected_sha is not None and set(shas) != {expected_sha}
        ):
            failures.append(record.object_id)
        elif (
            (acknowledged or provider_record)
            and shas == (expected_sha,)
            and record.timestamp is not None
        ):
            accepted.append(record.object_id)
    return {
        "expected": "captured DORA acknowledgment for expected SHA",
        "observed": accepted,
        "failed": failures,
        "status": "CONFLICT" if failures else "OBSERVED" if accepted else "UNMEASURED",
    }


def _ordering_row(observations: tuple[ReleaseObservation, ...]) -> dict[str, Any]:
    """Check captured staging, production and DORA order without inferring causality."""
    steps: list[tuple[ReleaseObservation, ...]] = []
    for role, environment in (
        ("verification", "staging"),
        ("verification", "production"),
        ("dora", None),
    ):
        steps.append(
            tuple(
                r
                for r in observations
                if r.role == role
                and (
                    environment is None
                    or r.fields.get("environment", r.fields.get("env")) == environment
                )
            )
        )
    measured = all(
        step and all(r.timestamp is not None for r in step) for step in steps
    )
    times = [
        tuple(r.timestamp for r in step if r.timestamp is not None) for step in steps
    ]
    ordered = (
        measured and max(times[0]) <= min(times[1]) and max(times[1]) <= min(times[2])
    )
    return {
        "expected": "staging readback <= production readback <= DORA capture",
        "observed": [[r.object_id for r in step] for step in steps],
        "status": "UNMEASURED"
        if not measured
        else "OBSERVED"
        if ordered
        else "CONFLICT",
    }


def reconcile_release_truth(
    graph: GraphDraft,
    *,
    expected_commit: str | None,
    expected_artifact_digest: str | None = None,
    artifact_digest_field: str = "artifact_tree_sha256",
) -> ObjectDraft:
    """Compare scoped captured facts while preserving missing and contradictory evidence."""
    if expected_commit is not None:
        SourceRevision(expected_commit)
    if expected_artifact_digest is not None:
        ContentDigest(expected_artifact_digest)
    if artifact_digest_field not in {
        "artifact_tree_sha256",
        "artifact_sha256",
        "artifact_digest",
    }:
        raise ContractError("unsupported artifact digest field")
    all_observations = release_observations(graph)
    observations = _current_observations(all_observations)
    # Pipeline/job success is source evidence, never an environment readback.
    rows = {
        "source_sha": _identity_row(
            expected_commit,
            _values(
                observations,
                ("commit_sha", "candidate_sha", "sha", "expected_sha", "deployed_sha"),
                _SHA,
            ),
        ),
        "artifact_identity": _identity_row(
            expected_artifact_digest,
            _values(
                observations,
                (artifact_digest_field,),
                _DIGEST,
            ),
        ),
        "staging_verification": _environment_row(
            "staging", observations, expected_commit
        ),
        "production_verification": _environment_row(
            "production", observations, expected_commit
        ),
        "dora_emission": _dora_row(observations, expected_commit),
        "release_order": _ordering_row(observations),
    }
    statuses = {row["status"] for row in rows.values()}
    overall = (
        "CONFLICT"
        if "CONFLICT" in statuses
        else "INCOMPLETE"
        if "UNMEASURED" in statuses
        else "CONSISTENT_CAPTURE"
    )
    relations = tuple(
        relation(
            RelationPredicate.DERIVED_FROM,
            record.object_id,
            "semantic-twin:release-truth",
            state=EvidenceState.INFERRED,
        )
        for record in observations
    )
    if not relations:
        # Absence of runtime records must leave the matrix connected to the modeled path.
        from ..ingestion.release import RELEASE_PATH_KEYS

        relations = (
            relation(
                RelationPredicate.ABOUT,
                RELEASE_PATH_KEYS[-1],
                "semantic-twin:release-truth",
                state=EvidenceState.UNMEASURED,
            ),
        )
    return make_object(
        TRUTH_MATRIX_KEY,
        "ReleaseTruthMatrix",
        "semantic-twin:release-truth",
        claims=(
            {
                "overall": overall,
                "rows": rows,
                "artifact_digest_field": artifact_digest_field,
                "superseded_observations": [
                    r.object_id for r in all_observations if r not in observations
                ],
                "scope": "captured records; no independent runtime verification",
            },
        ),
        relations=relations,
        evidence_state=EvidenceState.CONTRADICTED
        if overall == "CONFLICT"
        else EvidenceState.INFERRED,
        lifecycle_state="RECONCILED_CAPTURE",
        commit=expected_commit,
    )
