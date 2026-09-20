# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/__init__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/source.py, libs/semantic_twin/ingestion/release.py, libs/semantic_twin/ingestion/claims.py, libs/semantic_twin/ingestion/receipts.py, libs/semantic_twin/ingestion/serializer.py, libs/semantic_twin/ingestion/pipeline.py
# EnumType:    Scaffold
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/source.py; CONSUMES libs/semantic_twin/ingestion/release.py; CONSUMES libs/semantic_twin/ingestion/claims.py; CONSUMES libs/semantic_twin/ingestion/receipts.py; CONSUMES libs/semantic_twin/ingestion/serializer.py; CONSUMES libs/semantic_twin/ingestion/pipeline.py
# DAG Node:    semantic-twin.phase-1.api
# Intent:      Expose the bounded release-ingestion compiler through one stable stdlib-only import surface.
# ──────────────────────────────────────────────────────────

"""Expose the BuildAndDo release semantic ingestion API."""

from ..contracts import SCHEMA_VERSION
from .claims import (
    ClaimDisposition,
    DocumentationClaim,
    claim_objects,
    classify_claim,
    extract_documentation_claims,
)
from .drafts import (
    EXTRACTOR_VERSION,
    GraphDraft,
    add_relations,
    combine_drafts,
    make_object,
)
from .graph import SemanticGraph, combine_graphs
from .pipeline import compile_release_twin
from .receipts import (
    DeploymentReceipt,
    ingest_deployment_receipts,
    receipt_objects,
)
from .release import RELEASE_PATH_IDS, build_release_path_graph
from .serializer import (
    canonical_object_bytes,
    graph_payload,
    object_leaf_digest,
    serialize_graph,
)
from .source import ingest_release_source, source_module_id, source_symbol_ids

__all__ = [
    "EXTRACTOR_VERSION",
    "RELEASE_PATH_IDS",
    "SCHEMA_VERSION",
    "ClaimDisposition",
    "DeploymentReceipt",
    "DocumentationClaim",
    "SemanticGraph",
    "GraphDraft",
    "combine_drafts",
    "add_relations",
    "build_release_path_graph",
    "canonical_object_bytes",
    "claim_objects",
    "classify_claim",
    "combine_graphs",
    "compile_release_twin",
    "extract_documentation_claims",
    "graph_payload",
    "ingest_deployment_receipts",
    "ingest_release_source",
    "make_object",
    "object_leaf_digest",
    "receipt_objects",
    "serialize_graph",
    "source_module_id",
    "source_symbol_ids",
]
