# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/pipeline.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/source.py, libs/semantic_twin/ingestion/release.py, libs/semantic_twin/ingestion/claims.py, libs/semantic_twin/ingestion/receipts.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/source.py; CONSUMES libs/semantic_twin/ingestion/release.py; CONSUMES libs/semantic_twin/ingestion/claims.py; CONSUMES libs/semantic_twin/ingestion/receipts.py; PRODUCES libs/semantic_twin/ingestion/serializer.py
# DAG Node:    semantic-twin.phase-1.pipeline
# Intent:      Assemble source, release truth, documentation and receipt ingestion into one fully resolved connected BuildAndDo graph.
# ──────────────────────────────────────────────────────────

"""Compile all bounded Phase 1 inputs into one semantic system twin."""

from __future__ import annotations

from pathlib import Path

from ..models import Relation
from ..vocabulary import EvidenceState, RelationPredicate
from .claims import claim_objects, extract_documentation_claims
from .graph import SemanticGraph, add_relations, combine_graphs
from .receipts import ingest_deployment_receipts, receipt_objects
from .release import RELEASE_PATH_IDS, build_release_path_graph
from .source import ingest_release_source, source_module_id, source_symbol_ids


_STAGE_IMPLEMENTATIONS = (
    "git_head",
    "build_release",
    "deploy_environment",
    "verify_environment",
    "deploy_environment",
    "verify_environment",
    "datadog_dora",
    "write_receipt",
)


def _repository_commit(root: Path) -> str | None:
    """Read the current Git commit without invoking Git or accessing a remote."""

    git_directory = root / ".git"
    if git_directory.is_file():
        pointer = git_directory.read_text(encoding="utf-8").strip()
        if pointer.startswith("gitdir:"):
            target = Path(pointer.partition(":")[2].strip())
            git_directory = target if target.is_absolute() else root / target
    head_path = git_directory / "HEAD"
    if not head_path.is_file():
        return None
    head = head_path.read_text(encoding="utf-8").strip()
    if not head.startswith("ref:"):
        return head or None
    reference = head.partition(":")[2].strip()
    loose_reference = git_directory / reference
    if loose_reference.is_file():
        return loose_reference.read_text(encoding="utf-8").strip() or None
    packed_references = git_directory / "packed-refs"
    if packed_references.is_file():
        for line in packed_references.read_text(encoding="utf-8").splitlines():
            if line.startswith(("#", "^")) or " " not in line:
                continue
            commit, name = line.split(" ", 1)
            if name == reference:
                return commit
    return None


def _implemented_release_graph(
    graph: SemanticGraph,
    symbols: dict[str, str],
    controller_path: str,
) -> SemanticGraph:
    """Bind each modeled stage to the controller function that implements it."""

    objects = []
    for index, item in enumerate(graph.objects):
        function_name = _STAGE_IMPLEMENTATIONS[index]
        target = symbols.get(function_name)
        if target is None:
            objects.append(item)
            continue
        relation = Relation(
            predicate=RelationPredicate.IMPLEMENTED_BY,
            target=target,
            evidence=(controller_path,),
            confidence=1.0,
            state=EvidenceState.OBSERVED,
        )
        objects.append(add_relations(item, (relation,)))
    return SemanticGraph(tuple(objects))


def compile_release_twin(
    repository_root: Path,
    *,
    controller_relative_path: str = "tools/buildanddo_release.py",
    commit: str | None = None,
) -> SemanticGraph:
    """Compile the BuildAndDo release subsystem from local public inputs."""

    root = repository_root.resolve()
    resolved_commit = commit or _repository_commit(root)
    controller = root / controller_relative_path
    source_graph = ingest_release_source(
        controller,
        repository_root=root,
        commit=resolved_commit,
    )
    release_graph = build_release_path_graph(
        controller,
        commit=resolved_commit,
        source_reference=controller_relative_path,
    )
    release_graph = _implemented_release_graph(
        release_graph,
        source_symbol_ids(source_graph),
        controller_relative_path,
    )
    module_id = source_module_id(source_graph)
    claims = extract_documentation_claims(
        root / ".bits" / "srs",
        controller,
        repository_root=root,
    )
    claim_graph = SemanticGraph(
        claim_objects(claims, code_module_id=module_id, commit=resolved_commit)
    )
    receipts = ingest_deployment_receipts(
        root / ".bits" / "out",
        repository_root=root,
    )
    receipt_graph = SemanticGraph(
        receipt_objects(
            receipts,
            release_receipt_id=RELEASE_PATH_IDS[-1],
            commit=resolved_commit,
        )
    )
    combined = combine_graphs(source_graph, release_graph, claim_graph, receipt_graph)
    if not combined.is_connected():
        raise ValueError(
            "compiled release twin is not connected: "
            f"orphans={combined.orphan_ids()} unresolved={combined.unresolved_targets()}"
        )
    return combined
