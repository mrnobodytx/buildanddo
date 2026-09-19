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
# EnumEdges:   EXTENDS libs/semantic_twin/ingestion/claims.py; PRODUCES libs/semantic_twin/phase1/compiler.py
# DAG Node:    semantic-twin.phase-1.claim-intelligence
# Intent:      Add symbol-level, multi-file and staleness evidence to deterministic documentation claim classifications.
# ───────────────────────────────────────────────────────

"""Enrich extracted claims with symbol, multi-file and staleness evidence."""

from __future__ import annotations

import ast
import hashlib
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from ..ingestion.claims import _candidate_terms, classify_claim
from ..ingestion.drafts import GraphDraft, ObjectDraft, RelationDraft, make_object
from ..receipts import EvidenceKind
from ..vocabulary import EvidenceState, RelationPredicate
from .common import relation, stable_id

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

    return _candidate_terms(text)


def _source_symbols(path: str, text: str) -> dict[str, int]:
    """Index Python definitions while allowing non-Python files to participate."""

    if not path.endswith(".py"):
        return {}
    try:
        tree = ast.parse(text, filename=path)
    except SyntaxError:
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
    *,
    snapshots: Mapping[str, str] | None = None,
) -> tuple[SourceEvidence, ...]:
    """Find deterministic literal and Python symbol matches across selected files."""

    evidence: list[SourceEvidence] = []
    for source_path in sorted(set(source_paths)):
        path = repository_root / source_path
        try:
            text = (
                snapshots[source_path]
                if snapshots is not None
                else path.read_text(encoding="utf-8")
            )
            lines = text.splitlines()
        except (OSError, UnicodeError, KeyError):
            continue
        symbols = _source_symbols(source_path, text)
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


def _claim_text(item: ObjectDraft) -> str:
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
    base_graph: GraphDraft,
    repository_root: Path,
    *,
    source_paths: tuple[str, ...],
    current_commit: str | None,
    document_versions: Mapping[str, str] | None = None,
) -> tuple[ObjectDraft, ...]:
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
    texts: dict[str, str] = {}
    digests = []
    for path in source_paths:
        try:
            raw = (repository_root / path).read_bytes()
            texts[path] = raw.decode("utf-8")
            digests.append((path, hashlib.sha256(raw).hexdigest()))
        except (OSError, UnicodeError):
            continue
    source_text = "\n".join(texts.values())
    results = []
    for item in base_graph.objects:
        if item.object_type != "DocumentationClaim":
            continue
        text = _claim_text(item)
        terms = _terms(text)
        evidence = collect_source_evidence(
            repository_root, source_paths, terms, snapshots=texts
        )
        missing = _missing_references(text, repository_root)
        source_path = item.source_path
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
        relations: list[RelationDraft] = [
            relation(RelationPredicate.REFINES, item.semantic_id, source_path)
        ]
        relations.extend(
            relation(
                RelationPredicate.REFERENCES,
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
            else classify_claim(text, source_text).value
        )
        evidence_state = (
            EvidenceState.UNMEASURED
            if classification == "UNMEASURED"
            else EvidenceState.CONTRADICTED
            if classification == "CONTRADICTED"
            else EvidenceState.INFERRED
        )
        if classification in {"ENTAILED", "CONTRADICTED"}:
            relations.append(
                RelationDraft(
                    predicate=RelationPredicate.ENTAILS
                    if classification == "ENTAILED"
                    else RelationPredicate.CONTRADICTS,
                    target=item.semantic_id,
                    evidence=tuple(texts),
                    confidence=1.0,
                    state=evidence_state,
                    evidence_kinds=(EvidenceKind.DETERMINISTIC_PROOF,),
                )
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
                input_digest=item.input_digest,
                supporting_digests=digests,
                documentation=(source_path,),
            )
        )
    return tuple(results)
