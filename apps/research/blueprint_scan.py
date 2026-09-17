# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/blueprint_scan.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/blueprint_models.py, apps/research/contracts.py
# EnumType:    Service
# EnumEdges:   EXTENDS .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# DAG Node:    none
# Intent:      Preserve deterministic CPU blueprint observations and source locations for human review.
# ───────────────────────────────────────────────────────────────

"""Scan PDF text positions and layout with deterministic CPU heuristics."""
from __future__ import annotations

from collections import Counter
from dataclasses import replace
import importlib
import io
import math
import re

from apps.research.blueprint_models import (
    Heading, ListItem, Scan, ScanPage, TableRegion, TextBlock,
)
from apps.research.contracts import ResearchError, file_kind

MAX_PAGES = 200
MAX_CHARACTERS = 240_000
MAX_BLOCKS = 6_000
MODAL = re.compile(r"\b(shall|must|should|will|required to|needs to)\b", re.I)
NUMBER = re.compile(r"^(\d+(?:\.\d+)*)(?:[.)]|\s)\s*(\S.*)$")
ITEM = re.compile(r"^(\s*)([-*•▪‣]|\d+[.)]|[a-zA-Z][.)])\s+")
REQ_ID = re.compile(r"^\s*((?:REQ|R)-\d+|\d+(?:\.\d+){1,})\b", re.I)


def _clean(value: str) -> str:
    if "\x00" in value:
        raise ResearchError("invalid_data")
    return "".join(c for c in value if ord(c) >= 32 or c in "\n\t\r")


def _heading(block: TextBlock, following: TextBlock | None) -> Heading | None:
    value = block.text.strip()
    if not value or len(value) >= 80 or MODAL.search(value) or re.match(r"^(REQ|R)-\d+", value, re.I):
        return None
    numbered = NUMBER.match(value)
    if numbered:
        number, title = numbered.groups()
        return Heading(block.id, title, min(8, number.count(".") + 1), number, "numbered")
    letters = "".join(c for c in value if c.isalpha())
    if len(letters) >= 3 and letters.isupper() and not ITEM.match(value):
        return Heading(block.id, value, 1, "", "caps")
    if (following and following.column == block.column and len(following.text) > max(80, len(value) * 2)
            and not value.endswith((".", ";", ":", "?", ",")) and not ITEM.match(block.text)):
        return Heading(block.id, value, 2, "", "short_line")
    return None


def _delimiter(value: str) -> str:
    if value.count("|") >= 2:
        return "pipe"
    if "\t" in value:
        return "tab"
    if re.fullmatch(r"\s*[-+:|=\s]{4,}\s*", value):
        return "rule"
    if len(re.split(r"\s{2,}", value.strip())) >= 2:
        return "aligned"
    return ""


def scan_layout(pages: list[tuple[float, float, list[TextBlock]]], parser_version: str) -> Scan:
    """Detect headings, columns, tables, lists and sparse pages from text lines."""
    all_blocks: list[TextBlock] = []
    metadata: list[ScanPage] = []
    headings: list[Heading] = []
    regions: list[TableRegion] = []
    items: list[ListItem] = []
    warnings: list[str] = []
    total = 0
    if len(pages) > MAX_PAGES:
        raise ResearchError("too_large")
    for page_number, (width, height, raw) in enumerate(pages, 1):
        if not all(math.isfinite(v) and v > 0 for v in (width, height)):
            raise ResearchError("invalid_data")
        blocks = [replace(b, text=_clean(b.text).rstrip(), page=page_number) for b in raw if b.text.strip()]
        total += sum(len(b.text) for b in blocks)
        if total > MAX_CHARACTERS or len(all_blocks) + len(blocks) > MAX_BLOCKS:
            raise ResearchError("too_large")
        positioned = bool(blocks) and all(b.x is not None and b.y is not None for b in blocks)
        # Distinct repeated left edges with a wide gutter suggest columns.
        # Close baselines indicate table cells instead of separate prose columns.
        columns = 1
        split: float | None = None
        if positioned:
            anchors = Counter(round(float(b.x or 0) / 12) * 12 for b in blocks)
            frequent = sorted(x for x, count in anchors.items() if count >= 3)
            pairs = [(a, b) for a, b in zip(frequent, frequent[1:]) if b - a > width * 0.28]
            if pairs:
                left, right = max(pairs, key=lambda pair: pair[1] - pair[0])
                split = (left + right) / 2
                columns = 2
            blocks = [replace(b, column=int(split is not None and float(b.x or 0) >= split)) for b in blocks]
            blocks.sort(key=lambda b: (b.column, round(float(b.y or 0), 1), float(b.x or 0), b.id))
        left_edges = {column: min(float(b.x or 0) for b in blocks if b.column == column)
                      for column in {b.column for b in blocks}}
        blocks = [replace(b, id=f"p{page_number}-b{i + 1}", indent=max(
                    len(b.text) - len(b.text.lstrip()),
                    round((float(b.x or 0) - left_edges[b.column]) / max(float(b.font_size or 10) * 0.5, 1)) if positioned else 0))
                  for i, b in enumerate(blocks)]
        characters = sum(len(b.text.strip()) for b in blocks)
        density = characters / (width * height)
        sparse = characters < 40 or density < 0.00015
        metadata.append(ScanPage(page_number, width, height, characters, round(density, 8),
                                 sparse, positioned, columns))
        if sparse:
            warnings.append(f"page_{page_number}:sparse_text_possible_diagram_or_scan")
        if not positioned:
            warnings.append(f"page_{page_number}:reading_order_uses_pdf_text_order")
        candidates: list[TextBlock] = []

        def flush() -> None:
            if len(candidates) >= 2:
                delimiters = [_delimiter(b.text) for b in candidates if _delimiter(b.text) != "rule"]
                if delimiters:
                    regions.append(TableRegion(f"table-{len(regions) + 1}", page_number,
                                               [b.id for b in candidates], Counter(delimiters).most_common(1)[0][0]))
            candidates.clear()

        for index, block in enumerate(blocks):
            candidate = _delimiter(block.text)
            if candidate and (not candidates or candidates[-1].column == block.column):
                candidates.append(block)
            else:
                flush()
                if candidate:
                    candidates.append(block)
            marker = ITEM.match(block.text)
            if marker:
                items.append(ListItem(block.id, marker.group(2), block.indent))
            following = blocks[index + 1] if index + 1 < len(blocks) else None
            heading = _heading(block, following)
            if heading:
                headings.append(heading)
        flush()
        all_blocks.extend(blocks)
    table_blocks = {block_id for region in regions for block_id in region.block_ids}
    headings = [h for h in headings if h.block_id not in table_blocks]
    return Scan(metadata, all_blocks, headings, regions, items, warnings, parser_version)


def _lines(page: object, number: int, height: float) -> list[TextBlock]:
    # The pypdf object is loaded only at the parser boundary; no provider or OCR.
    extract = getattr(page, "extract_text")
    fragments: list[TextBlock] = []

    def visit(value: str, cm: list[float], tm: list[float], font: object, size: float) -> None:
        del font
        if not value.strip():
            return
        x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
        y = height - (tm[4] * cm[1] + tm[5] * cm[3] + cm[5])
        if not all(math.isfinite(v) for v in (x, y, size)):
            raise ResearchError("invalid_data")
        for offset, line in enumerate(_clean(value).splitlines()):
            if line.strip():
                fragments.append(TextBlock(str(len(fragments)), number, line, round(x, 2),
                                           round(y + offset * max(size, 1) * 1.2, 2), round(size, 2)))
        if len(fragments) > MAX_BLOCKS or sum(len(b.text) for b in fragments) > MAX_CHARACTERS:
            raise ResearchError("too_large")

    text = str(extract(visitor_text=visit) or "")
    if len(text) > MAX_CHARACTERS:
        raise ResearchError("too_large")
    if not fragments or (len(fragments) > 1 and len({(b.x, b.y) for b in fragments}) == 1):
        return [TextBlock(str(i), number, line) for i, line in enumerate(_clean(text).splitlines()) if line.strip()]
    # Join adjacent text operators on the same baseline. Preserve wide gutters
    # when both fragments look like prose; otherwise retain cell alignment.
    rows: list[list[TextBlock]] = []
    anchors = Counter(round(float(b.x or 0) / 12) * 12 for b in fragments if len(b.text) > 35)
    prose_anchors = sorted(x for x, count in anchors.items() if count >= 3)
    for block in sorted(fragments, key=lambda b: (float(b.y or 0), float(b.x or 0))):
        if rows and abs(float(rows[-1][0].y or 0) - float(block.y or 0)) <= 2:
            rows[-1].append(block)
        else:
            rows.append([block])
    result: list[TextBlock] = []
    for row in rows:
        row.sort(key=lambda b: float(b.x or 0))
        current = row[0]
        for next_block in row[1:]:
            end = float(current.x or 0) + len(current.text) * float(current.font_size or 10) * 0.5
            gap = float(next_block.x or 0) - end
            repeated_columns = (len(prose_anchors) >= 2 and prose_anchors[-1] - prose_anchors[0] > 170
                                and float(next_block.x or 0) - float(current.x or 0) > 170
                                and len(current.text) > 35 and len(next_block.text) > 35)
            if repeated_columns or (gap > 60 and len(current.text) > 45 and len(next_block.text) > 45):
                result.append(current)
                current = next_block
            else:
                spaces = max(1, min(40, round(gap / max(float(current.font_size or 10) * 0.5, 1))))
                current = replace(current, text=current.text.rstrip() + " " * spaces + next_block.text.lstrip())
        result.append(current)
    return result


def scan_pdf(data: bytes, name: str) -> Scan:
    """Extract bounded PDF lines and scan their observed layout."""
    if file_kind(name, len(data)) != "document" or not name.lower().endswith(".pdf") or not data.startswith(b"%PDF-"):
        raise ResearchError("unsupported")
    try:
        pdf = importlib.import_module("pypdf")
    except ImportError:
        raise ResearchError("capability_unavailable") from None
    try:
        reader = pdf.PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted or not 0 < len(reader.pages) <= MAX_PAGES:
            raise ResearchError("unsupported")
        pages = []
        count = 0
        for number, page in enumerate(reader.pages, 1):
            width, height = float(page.mediabox.width), float(page.mediabox.height)
            blocks = _lines(page, number, height)
            count += sum(len(block.text) for block in blocks)
            if count > MAX_CHARACTERS:
                raise ResearchError("too_large")
            pages.append((width, height, blocks))
        return scan_layout(pages, "pypdf-" + str(pdf.__version__))
    except ResearchError:
        raise
    except Exception:
        # pypdf errors can quote user content; publish only a bounded code.
        raise ResearchError("invalid_data") from None
