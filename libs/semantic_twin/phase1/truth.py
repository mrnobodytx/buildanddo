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

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
import re
from typing import Any

from ..ingestion.graph import SemanticGraph
from ..models import CanonicalObjectEnvelope
from ..vocabulary import EvidenceState, RelationPredicate
from .common import relation
from .compat import make_object


TRUTH_MATRIX_ID = "release://buildanddo/truth-matrix"
_COMMIT_SHA = re.compile(r"^[0-9a-fA-F]{40}$")


@dataclass(frozen=True, slots=True)
class ReleaseObservation:
    """Retain normalized release identity fields from one semantic object."""

    object_id: str
    object_type: str
    commit_shas: tuple[str, ...]
    artifact_digests: tuple[str, ...]
    environment: str | None
    states: tuple[str, ...]


def _strings(value: Any) -> tuple[str, ...]:
    """Normalize scalar or list claim data into non-empty strings."""

    if isinstance(value, list):
        return tuple(str(item) for item in value if str(item).strip())
    if isinstance(value, (str, int, float)) and str(value).strip():
        return (str(value),)
    return ()


def _claim_values(claim: Mapping[str, Any], keys: tuple[str, ...]) -> tuple[str, ...]:
    """Collect stable values from known claim field names."""

    values: list[str] = []
    for key in keys:
        values.extend(_strings(claim.get(key)))
    return tuple(dict.fromkeys(values))


def release_observations(graph: SemanticGraph) -> tuple[ReleaseObservation, ...]:
    """Extract normalized release identity observations from graph objects."""

    records = []
    for item in graph.objects:
        if not item.claims:
            continue
        claim = item.claims[0]
        shas = tuple(
            value.lower()
            for value in _claim_values(
                claim,
                (
                    "commit_sha",
                    "candidate_sha",
                    "deployed_sha",
                    "sha",
                    "commit_shas",
                ),
            )
            if _COMMIT_SHA.fullmatch(value)
        )
        digests = _claim_values(
            claim,
            ("artifact_digest", "artifact_sha256", "payload_digest", "sha256"),
        )
        environment_values = _claim_values(claim, ("environment", "env"))
        states = _claim_values(
            claim,
            ("state", "status", "result", "verification_results", "states"),
        )
        if shas or digests or environment_values or states:
            records.append(
                ReleaseObservation(
                    object_id=item.semantic_id,
                    object_type=item.object_type,
                    commit_shas=shas,
                    artifact_digests=digests,
                    environment=environment_values[0] if environment_values else None,
                    states=states,
                )
            )
    return tuple(records)


def _identity_row(expected: str | None, observed: Iterable[str]) -> dict[str, Any]:
    """Reconcile one exact expected identity against observed values."""

    values = tuple(dict.fromkeys(value for value in observed if value))
    if expected is None or not values:
        status = "UNMEASURED"
    elif all(value == expected for value in values):
        status = "MATCH"
    else:
        status = "CONFLICT"
    return {"expected": expected, "observed": list(values), "status": status}


def _environment_row(
    environment: str,
    observations: tuple[ReleaseObservation, ...],
) -> dict[str, Any]:
    """Summarize captured verification standing for one environment."""

    states = tuple(
        state.upper()
        for item in observations
        if item.environment and item.environment.casefold() == environment.casefold()
        for state in item.states
    )
    if any(state.startswith("FAIL") for state in states):
        status = "CONFLICT"
    elif any(state == "PASS" for state in states):
        status = "OBSERVED_PASS"
    else:
        status = "UNMEASURED"
    return {"expected": "PASS", "observed": list(states), "status": status}


def reconcile_release_truth(
    graph: SemanticGraph,
    *,
    expected_commit: str | None,
    expected_artifact_digest: str | None = None,
) -> CanonicalObjectEnvelope:
    """Build a release-truth matrix without treating captured data as verification."""

    observations = release_observations(graph)
    release_identity_types = {
        "ReleaseStateReceipt",
        "GitLabPipeline",
        "GitLabJob",
        "GitLabArtifact",
        "DatadogDoraDeployment",
        "RuntimeVerification",
    }
    observed_shas = (
        sha
        for item in observations
        if item.object_type in release_identity_types
        for sha in item.commit_shas
    )
    observed_digests = (
        digest for item in observations for digest in item.artifact_digests
    )
    dora_objects = tuple(
        item.object_id
        for item in observations
        if item.object_type in {"DatadogDoraDeployment", "PublishedEvent"}
    )
    rows = {
        "source_sha": _identity_row(expected_commit, observed_shas),
        "artifact_identity": _identity_row(expected_artifact_digest, observed_digests),
        "staging_verification": _environment_row("staging", observations),
        "production_verification": _environment_row("production", observations),
        "dora_emission": {
            "expected": "OBSERVED",
            "observed": list(dora_objects),
            "status": "OBSERVED" if dora_objects else "UNMEASURED",
        },
    }
    statuses = {str(row["status"]) for row in rows.values()}
    overall = (
        "CONFLICT"
        if "CONFLICT" in statuses
        else "INCOMPLETE"
        if "UNMEASURED" in statuses
        else "CONSISTENT_CAPTURE"
    )
    evidence_ids = tuple(item.object_id for item in observations)
    return make_object(
        TRUTH_MATRIX_ID,
        "ReleaseTruthMatrix",
        "semantic-twin:release-truth",
        claims=({"overall": overall, "rows": rows},),
        relations=tuple(
            relation(
                RelationPredicate.EVIDENCED_BY,
                object_id,
                "semantic-twin:release-truth",
                state=EvidenceState.INFERRED,
                confidence=0.9,
            )
            for object_id in evidence_ids
        ),
        evidence_state=(
            EvidenceState.CONTRADICTED
            if overall == "CONFLICT"
            else EvidenceState.INFERRED
        ),
        lifecycle_state="RECONCILED_CAPTURE",
        commit=expected_commit,
        runtime_status=overall,
    )
