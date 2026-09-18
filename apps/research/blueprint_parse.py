# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/blueprint_parse.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/blueprint_models.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/research/blueprint_models.py
# DAG Node:    none
# Intent:      Extract source-linked blueprint structure and deterministic quality observations without verification authority.
# ───────────────────────────────────────────────────────────────

"""Parse scanned text into source-linked blueprint structure."""
from __future__ import annotations

from collections import defaultdict
import hashlib
import re

from apps.research.blueprint_models import (
    Acronym, ComponentEntity, CrossReference, OpenItem, ParsedBlueprint,
    Requirement, Scan, Section, SourceRef, Table, TextBlock,
)
from apps.research.blueprint_scan import ITEM, MODAL, REQ_ID

KINDS = r"service|module|component|system|database|API|endpoint|server|gateway|queue|worker"
ENTITY = re.compile(r"\b((?:[A-Za-z][\w-]*[ \t]+){0,4})(" + KINDS + r")\b", re.I)
STOP = re.compile(
    r"\b(?:the|a|an|this|that|and|or|to|from|via|per|on|of|in|for|with|using|use|"
    r"depends|requires|shall|must|should|will|provide|call|query|read|write|send|"
    r"receives?|stores?|reads?|writes?|calls?|queries|exposes?|support|"
    r"produces?|publish(?:es)?|emits?|consumes?|subscribes?)\b", re.I,
)
OPEN = re.compile(r"\bTBD\b|\bto be determined\b|\[placeholder\]|\bnot yet decided\b|\bTODO\b", re.I)
REFERENCES = re.compile(
    r"\b(?:see|in|per)\s+Section\s+(\d+(?:\.\d+)*)|"
    r"\bas defined in\s+((?:REQ|R)-\d+)|"
    r"\bper\s+\[([^\]\n]{1,120})\]|\bref:\s*([A-Za-z0-9_.-]{1,120})", re.I,
)
ACRONYM_FIRST = re.compile(r"\b([A-Z][A-Z0-9]{1,11})\s+\(([A-Za-z][A-Za-z -]{3,100})\)")
ACRONYM_LAST = re.compile(r"\b((?:[A-Z][a-zA-Z-]*\s+){1,9}[A-Z][a-zA-Z-]*)\s+\(([A-Z][A-Z0-9]{1,11})\)")


def entity_mentions(value: str) -> list[tuple[str, str]]:
    """Extract bounded noun phrases immediately preceding component kinds."""
    found: list[tuple[str, str]] = []
    for match in ENTITY.finditer(value):
        prefix, kind = match.groups()
        chunks = STOP.split(prefix)
        words = (chunks[-1] if chunks else "").strip().split()
        # Discard modal remnants and determiners; do not use a whole clause as a name.
        name = " ".join(words[-3:] + [kind])
        found.append((name, kind.lower()))
    return list(dict.fromkeys(found))


def entity_key(name: str) -> str:
    """Canonicalize harmless case, spacing and hyphen variation."""
    return re.sub(r"[\s_-]+", " ", name).strip().casefold()


def _source(digest: str, blocks: list[TextBlock], section: str) -> SourceRef:
    return SourceRef(digest, blocks[0].page, [b.id for b in blocks], section)


def _cells(lines: list[str], delimiter: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in lines:
        if re.fullmatch(r"[\s|:+=\-]+", line):
            continue
        if delimiter == "pipe":
            row = [cell.strip() for cell in line.strip().strip("|").split("|")]
        elif delimiter == "tab":
            row = [cell.strip() for cell in line.strip().split("\t")]
        else:
            row = [cell.strip() for cell in re.split(r"\s{2,}", line.strip())]
        rows.append(row)
    if len(rows) < 2 or len(rows[0]) < 2 or any(len(row) != len(rows[0]) for row in rows):
        return []
    return rows


def parse_scan(scan: Scan, digest: str) -> ParsedBlueprint:
    """Build a heading tree and resolve extracted requirement references."""
    sections: list[Section] = []
    requirements: list[Requirement] = []
    tables: list[Table] = []
    refs: list[CrossReference] = []
    entities: dict[str, ComponentEntity] = {}
    acronyms: list[Acronym] = []
    open_items: list[OpenItem] = []
    headings = {heading.block_id: heading for heading in scan.headings}
    blocks_by_id = {block.id: block for block in scan.blocks}
    table_blocks = {bid for region in scan.table_regions for bid in region.block_ids}
    section_for: dict[str, str] = {}
    stack: list[Section] = []
    groups: list[list[TextBlock]] = []
    group: list[TextBlock] = []

    def flush() -> None:
        if group:
            groups.append(list(group))
            group.clear()

    for block in scan.blocks:
        heading = headings.get(block.id)
        if heading:
            flush()
            while stack and (stack[-1].level >= heading.level or (heading.number and stack[-1].number
                              and not heading.number.startswith(stack[-1].number + "."))):
                stack.pop()
            parent = stack[-1] if stack else None
            section_id = "sec-" + block.id
            section = Section(section_id, heading.title, heading.number, heading.level,
                              parent.id if parent else None, [], _source(digest, [block], section_id))
            if parent:
                parent.children.append(section_id)
            stack.append(section)
            sections.append(section)
        if not stack:
            section = Section("sec-preamble", "Preamble", "", 0, None, [],
                              _source(digest, [block], "sec-preamble"))
            sections.append(section)
            stack.append(section)
        current = stack[-1]
        section_for[block.id] = current.id
        current.block_ids.append(block.id)
        if heading:
            continue
        if block.id in table_blocks:
            flush()
            groups.append([block])
            continue
        marker = REQ_ID.match(block.text) or ITEM.match(block.text)
        if group and (marker or group[-1].column != block.column
                      or re.search(r"[.!?;:]\s*$", group[-1].text)):
            flush()
        group.append(block)
    flush()
    by_section = {section.id: section for section in sections}

    # Record entities on every line, including headings; then requirements can
    # inherit a uniquely named component from their heading context.
    for block in scan.blocks:
        source = _source(digest, [block], section_for[block.id])
        for name, kind in entity_mentions(block.text):
            key = entity_key(name)
            if key not in entities:
                entities[key] = ComponentEntity("entity-" + hashlib.sha256(key.encode()).hexdigest()[:16],
                                                 name, kind, [], [])
            entity = entities[key]
            if name not in entity.aliases:
                entity.aliases.append(name)
            entity.sources.append(source)
        for pattern in (ACRONYM_FIRST, ACRONYM_LAST):
            for match in pattern.finditer(block.text):
                short, full = match.groups() if pattern is ACRONYM_FIRST else tuple(reversed(match.groups()))
                acronyms.append(Acronym(short, full, source))
        for match in OPEN.finditer(block.text):
            open_items.append(OpenItem(block.text, match.group(), source))

    for group in groups:
        value = " ".join(block.text.strip() for block in group)
        section_id = section_for[group[0].id]
        source = _source(digest, group, section_id)
        modal = MODAL.search(value)
        numbered = REQ_ID.match(value)
        if not modal and not numbered:
            continue
        # Numbered table header cells and section numbers are not requirements.
        if group[0].id in table_blocks and not modal:
            continue
        mentions = entity_mentions(value)
        if not mentions:
            cursor: Section | None = by_section[section_id]
            while cursor and not mentions:
                mentions = entity_mentions(cursor.title)
                cursor = by_section.get(cursor.parent_id or "")
        entity_ids = list(dict.fromkeys(entities[entity_key(name)].id for name, _ in mentions
                                       if entity_key(name) in entities))
        req_id = f"req-{group[0].id}"
        requirements.append(Requirement(req_id, numbered.group(1).upper() if numbered else "",
                                        value, modal.group().lower() if modal else "numbered_item",
                                        source, entity_ids))
        by_section[section_id].requirement_ids.append(req_id)

    for region in scan.table_regions:
        located = [blocks_by_id[bid] for bid in region.block_ids]
        rows = _cells([b.text for b in located], region.delimiter)
        if rows:
            tables.append(Table(region.id, rows, _source(digest, located, section_for[located[0].id])))

    destinations: dict[str, list[str]] = defaultdict(list)
    for section in sections:
        if section.number:
            destinations["section:" + section.number].append(section.id)
    for req in requirements:
        if req.source_id:
            destinations["requirement:" + req.source_id].append(req.id)
    # Scan joined paragraphs as well as headings so wrapped references survive.
    ref_groups = groups + [[blocks_by_id[bid]] for bid in headings]
    for group in ref_groups:
        value = " ".join(b.text.strip() for b in group)
        source = _source(digest, group, section_for[group[0].id])
        for match in REFERENCES.finditer(value):
            section_number, requirement, document, reference = match.groups()
            kind = "section" if section_number else "requirement" if requirement else "document" if document else "reference"
            target = section_number or requirement or document or reference
            target = target.upper() if kind == "requirement" else target
            options = destinations.get(kind + ":" + target, [])
            refs.append(CrossReference(f"ref-{len(refs) + 1}", match.group(), kind, target, source,
                                       options[0] if len(options) == 1 else None))
    return ParsedBlueprint(sections, requirements, tables, refs, list(entities.values()), acronyms, open_items)
