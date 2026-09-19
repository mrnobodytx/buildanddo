# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/claims.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/inputs.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/inputs.py; CONSUMES libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-1.claim-extraction
# Intent:      Turn testable SRS statements into sourced claim objects with conservative AST/string entailment, contradiction or unmeasured dispositions.
# ─────────────────────────────────────────────────────────

"""Extract and conservatively classify testable BuildAndDo SRS claims."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import hashlib
from pathlib import Path
import re

from ..vocabulary import EvidenceState, RelationPredicate
from .builder import ObjectDraft, RelationDraft
from .graph import make_object
from .inputs import SourceSnapshot


_LIST_ITEM = re.compile(r"^\s*(?:[-*+] |\d+[.)]\s+)(?:\[[ xX]\]\s*)?(.*\S)\s*$")
_CODE_SPAN = re.compile(r"`([^`]+)`")
_NEGATION = re.compile(
    r"\b(?:never|does\s+not|do\s+not|must\s+not|cannot|can't|without|no)\b",
    re.IGNORECASE,
)
_ABSENCE_NEGATION = re.compile(
    r"\b(?:never|does\s+not|do\s+not|must\s+not|cannot|can't|without|no)\s+"
    r"(?:\w+\s+){0,2}"
    r"(?:call|calls|contain|contains|define|defines|use|uses|read|reads|write|writes|"
    r"publish|publishes|import|imports|depend|depends)\b",
    re.IGNORECASE,
)
_TESTABLE_SECTION_WORDS = (
    "acceptance",
    "invariant",
    "requirement",
    "success criteria",
    "verification",
)


class ClaimDisposition(str, Enum):
    """Describe the source-code standing of an extracted documentation claim."""

    ENTAILED = "ENTAILED"
    CONTRADICTED = "CONTRADICTED"
    UNMEASURED = "UNMEASURED"


@dataclass(frozen=True, slots=True)
class DocumentationClaim:
    """Retain one sourced claim and its deterministic static classification."""

    claim_id: str
    text: str
    source_path: str
    line: int
    section: str
    disposition: ClaimDisposition
    matched_terms: tuple[str, ...]
    snapshot: SourceSnapshot
    controller_snapshot: SourceSnapshot


def _candidate_terms(claim: str) -> tuple[str, ...]:
    """Extract high-specificity code or configuration terms from a claim."""

    explicit = [value.strip() for value in _CODE_SPAN.findall(claim) if value.strip()]
    terms: list[str] = []
    for value in explicit:
        call_match = re.fullmatch(r"([A-Za-z_][A-Za-z0-9_.]*)\(\)", value)
        if call_match:
            terms.append(call_match.group(1))
            continue
        if (
            any(marker in value for marker in ("_", ".", "/", "-"))
            or value.isupper()
            or re.search(r"[a-z][A-Z]", value)
        ):
            terms.append(value)
    if not terms:
        for value in re.findall(r"\b[A-Za-z][A-Za-z0-9_./-]{3,}\b", claim):
            if (
                "_" in value
                or "/" in value
                or value.isupper()
                or value.startswith("SRS-")
            ):
                terms.append(value)
    return tuple(dict.fromkeys(terms))


def _matched_terms(claim: str, controller_source: str) -> tuple[str, ...]:
    """Return candidate terms that occur literally in controller source."""

    source_folded = controller_source.casefold()
    matches = [
        term for term in _candidate_terms(claim) if term.casefold() in source_folded
    ]
    return tuple(matches)


def classify_claim(claim: str, controller_source: str) -> ClaimDisposition:
    """Classify a claim through conservative literal source matching."""

    matches = _matched_terms(claim, controller_source)
    if not matches:
        normalized = " ".join(claim.casefold().split()).strip(" .")
        source_normalized = " ".join(controller_source.casefold().split())
        if len(normalized) >= 24 and normalized in source_normalized:
            matches = (normalized,)
    if not matches:
        return ClaimDisposition.UNMEASURED
    if _ABSENCE_NEGATION.search(claim):
        return ClaimDisposition.CONTRADICTED
    if _NEGATION.search(claim):
        return ClaimDisposition.UNMEASURED
    return ClaimDisposition.ENTAILED


def _claim_id(source_path: str, line: int, text: str) -> str:
    """Create a stable content-addressed claim identity."""

    digest = hashlib.sha256(f"{source_path}:{line}:{text}".encode("utf-8")).hexdigest()
    return f"claim://buildanddo/{digest}"


def _documentation_claim(
    source_path: str,
    line: int,
    section: str,
    text: str,
    controller_source: str,
    snapshot: SourceSnapshot,
    controller_snapshot: SourceSnapshot,
) -> DocumentationClaim:
    """Create one fully classified documentation claim."""

    disposition = classify_claim(text, controller_source)
    return DocumentationClaim(
        claim_id=_claim_id(source_path, line, text),
        text=text,
        source_path=source_path,
        line=line,
        section=section,
        disposition=disposition,
        matched_terms=_matched_terms(text, controller_source),
        snapshot=snapshot,
        controller_snapshot=controller_snapshot,
    )


def extract_documentation_claims(
    srs_directory: Path,
    controller_path: Path,
    *,
    repository_root: Path | None = None,
    controller_snapshot: SourceSnapshot | None = None,
) -> tuple[DocumentationClaim, ...]:
    """Extract list claims from testable sections of every BuildAndDo SRS."""

    controller_snapshot = controller_snapshot or SourceSnapshot.capture(controller_path)
    controller_source = controller_snapshot.content.decode("utf-8")
    root = repository_root.resolve() if repository_root is not None else None
    claims: list[DocumentationClaim] = []
    for path in sorted(srs_directory.glob("SRS-BUILDANDDO-*.md")):
        resolved = path.resolve()
        if root is not None:
            try:
                source_path = resolved.relative_to(root).as_posix()
            except ValueError:
                source_path = resolved.as_posix()
        else:
            source_path = path.as_posix()
        snapshot = SourceSnapshot.capture(path, source_path=source_path)
        section = ""
        in_code_fence = False
        pending_line: int | None = None
        pending_section = ""
        pending_parts: list[str] = []

        def flush_pending() -> None:
            """Store the pending list item with any wrapped continuation text."""

            nonlocal pending_line, pending_section, pending_parts
            if pending_line is not None and pending_parts:
                text = " ".join(pending_parts)
                claims.append(
                    _documentation_claim(
                        source_path,
                        pending_line,
                        pending_section,
                        text,
                        controller_source,
                        snapshot,
                        controller_snapshot,
                    )
                )
            pending_line = None
            pending_section = ""
            pending_parts = []

        for line_number, raw_line in enumerate(
            snapshot.content.decode("utf-8").splitlines(),
            1,
        ):
            stripped = raw_line.strip()
            if stripped.startswith("```"):
                flush_pending()
                in_code_fence = not in_code_fence
                continue
            if in_code_fence:
                continue
            if stripped.startswith("#"):
                flush_pending()
                section = stripped.lstrip("#").strip()
                continue
            if not any(word in section.casefold() for word in _TESTABLE_SECTION_WORDS):
                flush_pending()
                continue
            match = _LIST_ITEM.match(raw_line)
            if match:
                flush_pending()
                text = match.group(1).strip()
                if text:
                    pending_line = line_number
                    pending_section = section
                    pending_parts = [text]
                continue
            if not stripped:
                flush_pending()
                continue
            if pending_line is not None:
                pending_parts.append(stripped)
        flush_pending()
    return tuple(claims)


def claim_objects(
    claims: tuple[DocumentationClaim, ...],
    *,
    code_module_id: str,
    commit: str | None = None,
) -> tuple[ObjectDraft, ...]:
    """Convert documentation claims into canonical graph objects."""

    objects: list[ObjectDraft] = []
    for claim in claims:
        if claim.disposition is ClaimDisposition.ENTAILED:
            predicate = RelationPredicate.ABOUT
            evidence_state = EvidenceState.INFERRED
            confidence = 0.9
        elif claim.disposition is ClaimDisposition.CONTRADICTED:
            predicate = RelationPredicate.ABOUT
            evidence_state = EvidenceState.CONTRADICTED
            confidence = 0.9
        else:
            predicate = RelationPredicate.ABOUT
            evidence_state = EvidenceState.UNMEASURED
            confidence = 0.0
        reference = f"{claim.source_path}:{claim.line}"
        relation = RelationDraft(
            predicate=predicate,
            target=code_module_id,
            evidence=(reference,),
            confidence=confidence,
            state=evidence_state,
        )
        objects.append(
            make_object(
                claim.claim_id,
                "DocumentationClaim",
                claim.source_path,
                snapshot=claim.snapshot,
                claims=(
                    {
                        "text": claim.text,
                        "line": claim.line,
                        "section": claim.section,
                        "classification": claim.disposition.value,
                        "classification_method": "static lexical heuristic; not a proof",
                        "controller_source_version": claim.controller_snapshot.version,
                        "controller_source_reference": str(
                            claim.controller_snapshot.reference()
                        ),
                        "matched_terms": list(claim.matched_terms),
                    },
                ),
                relations=(relation,),
                evidence_state=evidence_state,
                lifecycle_state="CLASSIFIED",
                commit=commit,
                documentation=(reference,),
            )
        )
    return tuple(objects)
