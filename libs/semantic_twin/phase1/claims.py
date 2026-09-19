# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/claims.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/claims.py, libs/semantic_twin/ingestion/source.py
# EnumType:    Service
# EnumEdges:   REFINES libs/semantic_twin/ingestion/claims.py; PRODUCES libs/semantic_twin/phase1/compiler.py
# DAG Node:    semantic-twin.phase-1.claim-intelligence
# Intent:      Add symbol-level, multi-file and staleness evidence to deterministic documentation claim classifications.
# ───────────────────────────────────────────────────────

"""Enrich extracted claims with symbol, multi-file and staleness evidence."""

from __future__ import annotations

import ast
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
import re

from ..ingestion.graph import SemanticGraph
from ..models import CanonicalObjectEnvelope, Relation
from ..vocabulary import EvidenceState, RelationPredicate
from .common import relation, stable_id
from .compat import make_object


_CODE_SPAN = re.compile(r"`([^`]+)`")
_PATH_SUFFIXES = (".py", ".js", ".jsx", ".ts", ".tsx", ".md", ".json", ".yml", ".yaml")


@dataclass(frozen=True, slots=True)
class SourceEvidence:
    """Describe one literal or symbol match in a local source file."""

    term: str
    source_path: str
    line: int
    kind: str


def _terms(text: str) -> tuple[str, ...]:
    """Extract high-specificity code spans and identifiers from a claim."""

    explicit = [value.strip() for value in _CODE_SPAN.findall(text) if value.strip()]
    identifiers = re.findall(r"\b[A-Za-z_][A-Za-z0-9_]{3,}\b", text)
    return tuple(dict.fromkeys((*explicit, *identifiers)))


def _source_symbols(path: Path) -> dict[str, int]:
    """Index Python definitions while allowing non-Python files to participate."""

    if path.suffix != ".py":
        return {}
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except (OSError, UnicodeError, SyntaxError):
        return {}
    return {
        node.name: node.lineno
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }


def collect_source_evidence(
    repository_root: Path,
    source_paths: tuple[str, ...],
    terms: tuple[str, ...],
) -> tuple[SourceEvidence, ...]:
    """Find deterministic literal and Python symbol matches across selected files."""

    evidence: list[SourceEvidence] = []
    for source_path in sorted(set(source_paths)):
        path = repository_root / source_path
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        symbols = _source_symbols(path)
        for term in terms:
            normalized = term.removesuffix("()")
            if normalized in symbols:
                evidence.append(
                    SourceEvidence(term, source_path, symbols[normalized], "symbol")
                )
                continue
            for line_number, line in enumerate(lines, 1):
                if term.casefold() in line.casefold():
                    evidence.append(
                        SourceEvidence(term, source_path, line_number, "literal")
                    )
                    break
    return tuple(evidence)


def _claim_text(item: CanonicalObjectEnvelope) -> str:
    """Read claim text from a canonical documentation claim object."""

    if not item.claims:
        return ""
    value = item.claims[0].get("text")
    return str(value) if value is not None else ""


def _missing_references(text: str, repository_root: Path) -> tuple[str, ...]:
    """Return path-like code references that do not exist in the repository."""

    missing = []
    for value in _CODE_SPAN.findall(text):
        candidate = value.split(":", 1)[0]
        if "/" not in candidate and not candidate.endswith(_PATH_SUFFIXES):
            continue
        if not (repository_root / candidate).exists():
            missing.append(candidate)
    return tuple(dict.fromkeys(missing))


def assess_claims(
    base_graph: SemanticGraph,
    repository_root: Path,
    *,
    source_paths: tuple[str, ...],
    current_commit: str | None,
    document_versions: Mapping[str, str] | None = None,
) -> tuple[CanonicalObjectEnvelope, ...]:
    """Produce symbol-supported claim assessments and explicit staleness flags."""

    versions = document_versions or {}
    symbol_targets: dict[str, str] = {}
    for item in base_graph.objects:
        if (
            item.object_type not in {"CodeSymbol", "ConfigurationKey"}
            or not item.claims
        ):
            continue
        for key in ("name", "qualified_name", "key"):
            value = item.claims[0].get(key)
            if value is not None:
                symbol_targets[str(value)] = item.semantic_id
    results = []
    for item in base_graph.objects:
        if item.object_type != "DocumentationClaim":
            continue
        text = _claim_text(item)
        terms = _terms(text)
        evidence = collect_source_evidence(repository_root, source_paths, terms)
        missing = _missing_references(text, repository_root)
        source_path = item.source.uri_or_path or "documentation"
        version = versions.get(source_path)
        stale_version = bool(version and current_commit and version != current_commit)
        stale = bool(missing or stale_version)
        matched_targets = tuple(
            dict.fromkeys(
                symbol_targets[hit.term.removesuffix("()")]
                for hit in evidence
                if hit.term.removesuffix("()") in symbol_targets
            )
        )
        relations: list[Relation] = [
            relation(RelationPredicate.REFINES, item.semantic_id, source_path)
        ]
        relations.extend(
            relation(
                RelationPredicate.SUPPORTED_BY,
                target,
                source_path,
                state=EvidenceState.INFERRED,
                confidence=0.9,
            )
            for target in matched_targets
        )
        classification = (
            "UNMEASURED"
            if stale or not evidence
            else str(item.claims[0].get("classification", "ENTAILED"))
        )
        evidence_state = (
            EvidenceState.UNMEASURED
            if classification == "UNMEASURED"
            else EvidenceState.INFERRED
        )
        results.append(
            make_object(
                stable_id(
                    "claim-assessment", item.semantic_id, current_commit or "unknown"
                ),
                "DocumentationClaimAssessment",
                source_path,
                claims=(
                    {
                        "claim_id": item.semantic_id,
                        "classification": classification,
                        "source_evidence": [
                            {
                                "term": hit.term,
                                "source_path": hit.source_path,
                                "line": hit.line,
                                "kind": hit.kind,
                            }
                            for hit in evidence
                        ],
                        "stale": stale,
                        "stale_missing_references": list(missing),
                        "document_commit": version,
                        "current_commit": current_commit,
                    },
                ),
                relations=tuple(relations),
                evidence_state=evidence_state,
                lifecycle_state="ASSESSED_STATICALLY",
                commit=current_commit,
                documentation=(source_path,),
            )
        )
    return tuple(results)
