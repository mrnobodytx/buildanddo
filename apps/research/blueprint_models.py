# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/blueprint_models.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     none
# EnumType:    Service
# EnumEdges:   EXTENDS .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# DAG Node:    none
# Intent:      Preserve deterministic CPU blueprint observations and source locations for human review.
# ───────────────────────────────────────────────────────────────

"""Describe deterministic extraction observations without granting authority."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal


@dataclass(frozen=True)
class SourceRef:
    """Locate source text within the exact input PDF."""

    input_sha256: str
    page: int
    block_ids: list[str]
    section_id: str = ""


@dataclass(frozen=True)
class TextBlock:
    """Retain a line and its observed position, when available."""

    id: str
    page: int
    text: str
    x: float | None = None
    y: float | None = None
    font_size: float | None = None
    column: int = 0
    indent: int = 0


@dataclass(frozen=True)
class Heading:
    """Identify a heading candidate and the pattern supporting it."""

    block_id: str
    title: str
    level: int
    number: str
    pattern: str


@dataclass(frozen=True)
class TableRegion:
    """Identify consecutive table-like lines before parsing cells."""

    id: str
    page: int
    block_ids: list[str]
    delimiter: str


@dataclass(frozen=True)
class ListItem:
    """Identify an indented list marker."""

    block_id: str
    marker: str
    indent: int


@dataclass(frozen=True)
class ScanPage:
    """Report layout observations and limits for one PDF page."""

    page: int
    width: float
    height: float
    text_characters: int
    text_density: float
    diagram_only: bool
    positions_available: bool
    columns: int


@dataclass(frozen=True)
class Scan:
    """Retain pass-one layout observations in reading order."""

    pages: list[ScanPage]
    blocks: list[TextBlock]
    headings: list[Heading]
    table_regions: list[TableRegion]
    list_items: list[ListItem]
    warnings: list[str]
    parser_version: str


@dataclass
class Section:
    """Keep the heading tree and its direct source blocks."""

    id: str
    title: str
    number: str
    level: int
    parent_id: str | None
    children: list[str]
    source: SourceRef
    block_ids: list[str] = field(default_factory=list)
    requirement_ids: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Requirement:
    """Retain an unverified source requirement and extraction confidence."""

    id: str
    source_id: str
    text: str
    modality: str
    source: SourceRef
    entity_ids: list[str]
    confidence: float = 0.0
    confidence_reasons: list[str] = field(default_factory=list)
    verified: Literal[False] = field(default=False, init=False)


@dataclass(frozen=True)
class Table:
    """Retain structured cells and the table region they came from."""

    id: str
    rows: list[list[str]]
    source: SourceRef


@dataclass(frozen=True)
class CrossReference:
    """Record a reference and its uniquely resolved destination."""

    id: str
    text: str
    kind: str
    target: str
    source: SourceRef
    resolved_id: str | None


@dataclass
class ComponentEntity:
    """Collect case-normalized component mentions across sections."""

    id: str
    name: str
    kind: str
    aliases: list[str]
    sources: list[SourceRef]


@dataclass(frozen=True)
class Acronym:
    """Record a source-defined acronym without inferring missing definitions."""

    acronym: str
    full_name: str
    source: SourceRef


@dataclass(frozen=True)
class OpenItem:
    """Locate an unresolved source placeholder."""

    text: str
    marker: str
    source: SourceRef


@dataclass
class ParsedBlueprint:
    """Retain pass-two structure and source relationships."""

    sections: list[Section]
    requirements: list[Requirement]
    tables: list[Table]
    cross_references: list[CrossReference]
    entities: list[ComponentEntity]
    acronyms: list[Acronym]
    open_items: list[OpenItem]


@dataclass(frozen=True)
class Assessment:
    """Report heuristic quality measures with their denominators."""

    requirement_coverage: float
    structural_regularity: float
    table_parse_quality: float
    cross_reference_resolution_rate: float
    entity_consistency: float
    ambiguity_score: int
    sections_without_requirements: list[str]
    ambiguous_phrases: list[dict[str, object]]
    duplicate_requirements: list[dict[str, object]]
    counts: dict[str, int]
    warnings: list[str]


@dataclass(frozen=True)
class Blueprint:
    """Bundle all three passes with an immutable input identity."""

    id: str
    input_sha256: str
    name: str
    scan: Scan
    parsed: ParsedBlueprint
    assessment: Assessment
    schema_version: int = 1
    authority: Literal["A0"] = field(default="A0", init=False)
    verified: Literal[False] = field(default=False, init=False)

    @property
    def requirements(self) -> list[Requirement]:
        """Return the extracted requirements."""
        return self.parsed.requirements

    def to_dict(self) -> dict[str, object]:
        """Serialize all passes and provenance for review."""
        return asdict(self)
