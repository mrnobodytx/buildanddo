# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/claims.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, .bits/srs, tools/buildanddo_release.py
# EnumType:    Service
# EnumEdges:   CONSUMES .bits/srs; CONSUMES tools/buildanddo_release.py; PRODUCES libs/semantic_twin/ingestion/pipeline.py; DEPENDS_ON libs/semantic_twin/ingestion/graph.py
# DAG Node:    semantic-twin.phase-1.claim-extraction
# Intent:      Turn testable SRS statements into sourced claim objects with conservative AST/string entailment, contradiction or unmeasured dispositions.
# ─────────────────────────────────────────────────────────

"""Extract and conservatively classify testable BuildAndDo SRS claims."""

from __future__ import annotations

import ast
import hashlib
import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

from ..vocabulary import EvidenceState, RelationPredicate
from .drafts import ObjectDraft, RelationDraft, make_object

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
    source_digest: str
    controller_path: str
    controller_digest: str


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
    """Classify only explicit source-presence propositions using AST facts.

    A matching identifier alone says nothing about readback correctness,
    deployment success, timing guarantees or other behavioral prose.
    """
    terms = _candidate_terms(claim)
    if not terms:
        return ClaimDisposition.UNMEASURED
    try:
        tree = ast.parse(controller_source)
    except SyntaxError:
        return ClaimDisposition.UNMEASURED
    text = claim.casefold()
    facts: set[str] = set()
    if re.search(r"\b(?:define|defines|defined)\b", text):
        facts = {
            node.name
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        }
    elif re.search(r"\b(?:call|calls)\b", text):
        facts = {
            ast.unparse(node.func)
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
        }
    elif re.search(r"\b(?:import|imports)\b", text):
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                facts.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                facts.add(node.module or "")
                facts.update(alias.name for alias in node.names)
    elif re.search(r"\b(?:read|reads)\b", text):
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and node.args
                and ast.unparse(node.func)
                in {
                    "os.environ.get",
                    "os.getenv",
                    "os.environ.setdefault",
                }
            ):
                if isinstance(node.args[0], ast.Constant) and isinstance(
                    node.args[0].value, str
                ):
                    facts.add(node.args[0].value)
            elif (
                isinstance(node, ast.Subscript)
                and isinstance(node.ctx, ast.Load)
                and ast.unparse(node.value) == "os.environ"
            ):
                if isinstance(node.slice, ast.Constant) and isinstance(
                    node.slice.value, str
                ):
                    facts.add(node.slice.value)
    elif re.search(r"\b(?:contain|contains|mentions)\b", text):
        facts = {term for term in terms if term in controller_source}
    else:
        return ClaimDisposition.UNMEASURED
    matches = [term.removesuffix("()") in facts for term in terms]
    if _ABSENCE_NEGATION.search(claim):
        return (
            ClaimDisposition.CONTRADICTED
            if any(matches)
            else ClaimDisposition.UNMEASURED
        )
    if _NEGATION.search(claim):
        return ClaimDisposition.UNMEASURED
    return ClaimDisposition.ENTAILED if all(matches) else ClaimDisposition.UNMEASURED


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
    source_digest: str,
    controller_path: str,
    controller_digest: str,
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
        source_digest=source_digest,
        controller_path=controller_path,
        controller_digest=controller_digest,
    )


def extract_documentation_claims(
    srs_directory: Path,
    controller_path: Path,
    *,
    repository_root: Path | None = None,
) -> tuple[DocumentationClaim, ...]:
    """Extract list claims from testable sections of every BuildAndDo SRS."""

    controller_raw = controller_path.read_bytes()
    controller_source = controller_raw.decode("utf-8")
    controller_digest = hashlib.sha256(controller_raw).hexdigest()
    root = repository_root.resolve() if repository_root is not None else None
    controller_locator = controller_path.resolve().as_posix()
    if root is not None and controller_path.resolve().is_relative_to(root):
        controller_locator = controller_path.resolve().relative_to(root).as_posix()
    claims: list[DocumentationClaim] = []
    for path in sorted(srs_directory.glob("SRS-BUILDANDDO-*.md")):
        raw = path.read_bytes()
        source_digest = hashlib.sha256(raw).hexdigest()
        resolved = path.resolve()
        if root is not None:
            try:
                source_path = resolved.relative_to(root).as_posix()
            except ValueError:
                source_path = resolved.as_posix()
        else:
            source_path = path.as_posix()
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
                        source_digest,
                        controller_locator,
                        controller_digest,
                    )
                )
            pending_line = None
            pending_section = ""
            pending_parts = []

        for line_number, raw_line in enumerate(
            raw.decode("utf-8").splitlines(),
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
            evidence=(reference, claim.controller_path),
            confidence=confidence,
            state=evidence_state,
        )
        objects.append(
            make_object(
                claim.claim_id,
                "DocumentationClaim",
                claim.source_path,
                claims=(
                    {
                        "text": claim.text,
                        "line": claim.line,
                        "section": claim.section,
                        "classification": claim.disposition.value,
                        "matched_terms": list(claim.matched_terms),
                    },
                ),
                relations=(relation,),
                evidence_state=evidence_state,
                lifecycle_state="CLASSIFIED",
                commit=commit,
                documentation=(reference,),
                input_digest=claim.source_digest,
                supporting_digests=((claim.controller_path, claim.controller_digest),),
            )
        )
    return tuple(objects)
