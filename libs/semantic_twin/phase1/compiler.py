# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/compiler.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion, libs/semantic_twin/phase1/release_state.py, libs/semantic_twin/phase1/history.py, libs/semantic_twin/phase1/sbom.py, libs/semantic_twin/phase1/providers.py, libs/semantic_twin/phase1/memory.py, libs/semantic_twin/phase1/claims.py, libs/semantic_twin/phase1/truth.py, libs/semantic_twin/phase1/merkle.py, libs/semantic_twin/phase1/context.py, libs/semantic_twin/progression.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion; CONSUMES libs/semantic_twin/phase1/release_state.py; CONSUMES libs/semantic_twin/phase1/history.py; CONSUMES libs/semantic_twin/phase1/sbom.py; CONSUMES libs/semantic_twin/phase1/providers.py; CONSUMES libs/semantic_twin/phase1/memory.py; CONSUMES libs/semantic_twin/phase1/claims.py; CONSUMES libs/semantic_twin/phase1/truth.py; PRODUCES libs/semantic_twin/phase1/merkle.py; PRODUCES libs/semantic_twin/phase1/context.py; CONSUMES libs/semantic_twin/progression.py
# DAG Node:    semantic-twin.phase-1.compiler
# Intent:      Join all ten local Phase 1 capabilities into one connected graph, release-truth matrix, semantic epoch and query proof bundle.
# ────────────────────────────────────────────────────────

"""Compile the complete local Phase 1 semantic system twin."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..ingestion import graph_payload
from ..ingestion.drafts import GraphDraft, ObjectDraft, combine_drafts, make_object
from ..ingestion.graph import SemanticGraph
from ..ingestion.pipeline import extract_release_twin
from ..ingestion.release import RELEASE_PATH_KEYS
from ..vocabulary import EvidenceState, RelationPredicate
from ..progression import Invitation, TwinCapture
from .claims import assess_claims
from .common import relation, stable_id
from .context import ContextProofBundle, compile_context_bundle
from .history import history_graph, read_git_history
from .memory import discover_memory_paths, ingest_memory_file
from .merkle import SemanticEpoch, build_epoch
from .providers import ingest_datadog_export, ingest_gitlab_export
from .release_state import (
    discover_release_receipts,
    ingest_release_receipts,
    release_receipt_graph,
)
from .sbom import discover_sbom_paths, parse_sbom, sbom_graph
from .truth import TRUTH_MATRIX_ID, reconcile_release_truth

_ANCHOR_ID = RELEASE_PATH_KEYS[-1]


@dataclass(frozen=True, slots=True)
class Phase1Inputs:
    """Declare explicit local inputs and bounded history behavior."""

    release_receipts: tuple[Path, ...] | None = None
    sbom_paths: tuple[Path, ...] | None = None
    gitlab_exports: tuple[Path, ...] = ()
    datadog_exports: tuple[Path, ...] = ()
    memory_paths: tuple[Path, ...] | None = None
    history_limit: int = 100
    history_paths: tuple[str, ...] = ("tools/buildanddo_release.py", ".bits")
    claim_source_paths: tuple[str, ...] = ("tools/buildanddo_release.py",)
    expected_artifact_digest: str | None = None
    artifact_digest_field: str = "artifact_tree_sha256"
    expected_commit: str | None = None


@dataclass(frozen=True, slots=True)
class Phase1Compilation:
    """Carry the connected graph and its deterministic proof artifacts."""

    graph: SemanticGraph
    truth_matrix_id: str
    epoch: SemanticEpoch
    context: ContextProofBundle

    def as_capture(
        self, scope_id: str, *, invitations: tuple[Invitation, ...] = ()
    ) -> TwinCapture:
        """Expose the same canonical objects to developmental queries without changing trust."""
        return TwinCapture(
            scope_id=scope_id,
            captured_at=self.epoch.metadata.created_at,
            objects=self.graph.objects,
            invitations=invitations,
        )

    def to_dict(self) -> dict[str, Any]:
        """Render graph, reconciliation and proof metadata as one payload."""

        return {
            "schema_version": "semantic-twin.phase1-complete/v2",
            "semantic_root": self.epoch.root_digest,
            "capture_time": self.epoch.metadata.created_at.isoformat(),
            "input_status": self.input_status(),
            "graph": graph_payload(self.graph),
            "truth_matrix_id": self.truth_matrix_id,
            "epoch": self.epoch.to_dict(),
            "context": self.context.to_dict(),
        }

    def input_status(self) -> dict[str, object]:
        """Report observed input categories separately from release verification."""
        counts: dict[str, int] = {}
        for item in self.graph.objects:
            kind = str(item.claims[-1].get("ingestion_kind"))
            counts[kind] = counts.get(kind, 0) + 1
        categories = {
            "source": ("CodeModule", "CodeSymbol"),
            "documentation": ("DocumentationClaim",),
            "dispatch_reports": ("DeploymentReceipt",),
            "release_receipts": ("ReleaseStateReceipt",),
            "git_history": ("GitCommit",),
            "sbom": ("SoftwarePackage",),
            "gitlab": ("GitLabPipeline", "GitLabJob", "GitLabArtifact"),
            "datadog": (
                "DatadogDoraDeployment",
                "DatadogTrace",
                "DatadogEvent",
                "RuntimeVerification",
            ),
            "memory": ("MemoryFileVector", "MemoryEdgeVector", "MemoryEventVector"),
        }
        return {
            name: {
                "object_count": (count := sum(counts.get(kind, 0) for kind in kinds)),
                "status": "OBSERVED_INPUT" if count else "UNMEASURED",
            }
            for name, kinds in categories.items()
        }


def _gap_object(name: str, *, commit: str | None) -> ObjectDraft:
    """Represent a missing optional input as explicit UNMEASURED state."""

    return make_object(
        stable_id("phase1-gap", name),
        "UnmeasuredInput",
        f"semantic-twin:missing:{name}",
        claims=({"input": name, "status": "UNMEASURED"},),
        relations=(
            relation(
                RelationPredicate.ABOUT,
                _ANCHOR_ID,
                f"semantic-twin:missing:{name}",
                state=EvidenceState.UNMEASURED,
                confidence=0.0,
            ),
        ),
        evidence_state=EvidenceState.UNMEASURED,
        lifecycle_state="MISSING_OPTIONAL_INPUT",
        commit=commit,
        runtime_status="UNMEASURED",
    )


def _commit_from_base(graph: GraphDraft) -> str | None:
    """Read the current source commit carried by the bounded base graph."""

    item = graph.by_id().get(RELEASE_PATH_KEYS[0])
    return item.commit if item is not None else None


def _optional_graphs(
    root: Path,
    inputs: Phase1Inputs,
    commit: str | None,
) -> tuple[GraphDraft, ...]:
    """Compile optional local evidence sources or explicit gap objects."""

    graphs: list[GraphDraft] = []
    release_paths = (
        inputs.release_receipts
        if inputs.release_receipts is not None
        else discover_release_receipts(root)
    )
    if release_paths:
        graphs.append(
            release_receipt_graph(
                ingest_release_receipts(release_paths, repository_root=root),
                anchor_id=_ANCHOR_ID,
                commit=commit,
            )
        )
    else:
        graphs.append(GraphDraft((_gap_object("release-state", commit=commit),)))

    sbom_paths = (
        inputs.sbom_paths
        if inputs.sbom_paths is not None
        else discover_sbom_paths(root)
    )
    if sbom_paths:
        documents = tuple(parse_sbom(path, repository_root=root) for path in sbom_paths)
        graphs.append(sbom_graph(documents, anchor_id=_ANCHOR_ID, commit=commit))
    else:
        graphs.append(GraphDraft((_gap_object("sbom", commit=commit),)))

    for path in inputs.gitlab_exports:
        graphs.append(
            ingest_gitlab_export(
                path,
                anchor_id=_ANCHOR_ID,
                repository_root=root,
                commit=commit,
            )
        )
    if not inputs.gitlab_exports:
        graphs.append(GraphDraft((_gap_object("gitlab-export", commit=commit),)))

    for path in inputs.datadog_exports:
        graphs.append(
            ingest_datadog_export(
                path,
                anchor_id=_ANCHOR_ID,
                repository_root=root,
                commit=commit,
            )
        )
    if not inputs.datadog_exports:
        graphs.append(GraphDraft((_gap_object("datadog-export", commit=commit),)))

    memory_paths = (
        inputs.memory_paths
        if inputs.memory_paths is not None
        else discover_memory_paths(root)
    )
    for path in memory_paths:
        graphs.append(
            ingest_memory_file(
                path,
                anchor_id=_ANCHOR_ID,
                repository_root=root,
                commit=commit,
            )
        )
    if not memory_paths:
        graphs.append(GraphDraft((_gap_object("memory", commit=commit),)))
    return tuple(graphs)


def compile_phase1(
    repository_root: Path,
    *,
    inputs: Phase1Inputs | None = None,
    query: str = "release production verification artifact DORA evidence",
    historical_cutoff: datetime | None = None,
    commit: str | None = None,
    observed_at: datetime | None = None,
) -> Phase1Compilation:
    """Compile all ten local Phase 1 capabilities into deterministic proofs."""

    root = repository_root.resolve()
    captured = observed_at or datetime.now(timezone.utc)
    selected_inputs = inputs or Phase1Inputs()
    base_graph = extract_release_twin(root, commit=commit)
    resolved_commit = commit or _commit_from_base(base_graph)
    if selected_inputs.history_limit < 1:
        raise ValueError("history_limit must be positive")
    if (root / ".git").exists():
        history = read_git_history(
            root,
            max_count=selected_inputs.history_limit,
            paths=selected_inputs.history_paths,
        )
        history_semantics = history_graph(history, anchor_id=RELEASE_PATH_KEYS[0])
    else:
        history_semantics = GraphDraft(
            (_gap_object("git-history", commit=resolved_commit),)
        )
    optional_graphs = _optional_graphs(root, selected_inputs, resolved_commit)
    preliminary = combine_drafts(base_graph, history_semantics, *optional_graphs)
    assessments = GraphDraft(
        assess_claims(
            base_graph,
            root,
            source_paths=selected_inputs.claim_source_paths,
            current_commit=resolved_commit,
        )
    )
    with_claims = combine_drafts(preliminary, assessments)
    truth = reconcile_release_truth(
        with_claims,
        expected_commit=selected_inputs.expected_commit or resolved_commit,
        expected_artifact_digest=selected_inputs.expected_artifact_digest,
        artifact_digest_field=selected_inputs.artifact_digest_field,
    )
    complete_graph = combine_drafts(with_claims, GraphDraft((truth,))).resolve(
        repository_root=root,
        observed_at=captured,
    )
    if not complete_graph.is_connected():
        raise ValueError(
            "complete Phase 1 graph is not connected: "
            f"orphans={complete_graph.orphan_ids()} "
            f"unresolved={complete_graph.unresolved_targets()}"
        )
    epoch = build_epoch(complete_graph)
    context = compile_context_bundle(
        complete_graph,
        epoch,
        query,
        historical_cutoff=historical_cutoff,
    )
    return Phase1Compilation(complete_graph, TRUTH_MATRIX_ID, epoch, context)
