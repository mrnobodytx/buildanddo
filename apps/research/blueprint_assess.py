# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/blueprint_assess.py
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

"""Assess extraction quality using bounded deterministic text comparisons."""
from __future__ import annotations

from collections import Counter
from dataclasses import replace
import re

from apps.research.blueprint_models import Assessment, ParsedBlueprint, Scan
from apps.research.blueprint_parse import OPEN, entity_key

VAGUE = re.compile(r"\b(appropriate|as needed|sufficient|reasonable)\b", re.I)


def _ratio(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0


def _phrases(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", re.sub(r"^(?:(?:REQ|R)-\d+|\d+(?:\.\d+)+)\b", "", text, flags=re.I).lower())
    words = ["must" if word in {"shall", "should", "will"} else word for word in words]
    return {" ".join(words[i:i + 3]) for i in range(max(1, len(words) - 2))}


def assess(scan: Scan, parsed: ParsedBlueprint) -> Assessment:
    """Assign requirement confidence and report quality with observable counts."""
    descriptions = [section.id for section in parsed.sections if not section.requirement_ids]
    ambiguous: list[dict[str, object]] = []
    for block in scan.blocks:
        for match in VAGUE.finditer(block.text):
            ambiguous.append({"phrase": match.group().lower(), "page": block.page, "block_id": block.id})
    page_info = {page.page: page for page in scan.pages}
    assessed = []
    for req in parsed.requirements:
        strong = req.modality in {"shall", "must", "required to", "needs to"}
        score = 0.8 if strong else 0.66 if req.modality in {"should", "will"} else 0.48
        reasons = ["explicit_obligation" if strong else "weak_modality" if req.modality != "numbered_item" else "numbered_item_only"]
        if req.source_id:
            score += 0.08
            reasons.append("explicit_requirement_identifier")
        if req.entity_ids:
            score += 0.06
            reasons.append("component_context")
        if req.source.section_id != "sec-preamble":
            score += 0.03
            reasons.append("heading_context")
        if VAGUE.search(req.text):
            score -= 0.12
            reasons.append("vague_language")
        if OPEN.search(req.text):
            score -= 0.2
            reasons.append("open_item")
        if page_info[req.source.page].diagram_only:
            score -= 0.08
            reasons.append("sparse_page")
        if not page_info[req.source.page].positions_available:
            score -= 0.03
            reasons.append("layout_positions_unavailable")
        if len(req.text) > 2000:
            score -= 0.1
            reasons.append("long_requirement")
        assessed.append(replace(req, confidence=round(max(0.05, min(0.99, score)), 4),
                                confidence_reasons=reasons))
    parsed.requirements = assessed

    # Inverted trigrams avoid comparing every pair of unrelated requirements.
    postings: dict[str, list[int]] = {}
    fingerprints: list[set[str]] = []
    duplicates: list[dict[str, object]] = []
    for index, req in enumerate(assessed):
        phrases = _phrases(req.text)
        candidates: Counter[int] = Counter()
        for phrase in sorted(phrases):
            candidates.update(postings.get(phrase, []))
        for other in sorted(candidates):
            previous = fingerprints[other]
            similarity = len(phrases & previous) / max(1, len(phrases | previous))
            if similarity >= 0.78:
                duplicates.append({"requirement_ids": [assessed[other].id, req.id],
                                   "similarity": round(similarity, 4), "method": "normalized_trigram_overlap"})
        fingerprints.append(phrases)
        for phrase in sorted(phrases):
            postings.setdefault(phrase, []).append(index)
    patterns = Counter(heading.pattern for heading in scan.headings)
    regular = _ratio(max(patterns.values(), default=0), len(scan.headings))
    numbers = [h.number for h in scan.headings if h.number]
    if len(set(numbers)) < len(numbers):
        regular *= _ratio(len(set(numbers)), len(numbers))
    section_refs = [ref for ref in parsed.cross_references if ref.kind == "section"]
    stems: dict[str, set[str]] = {}
    named_sections: dict[str, set[str]] = {}
    for entity in parsed.entities:
        stem = entity_key(entity.name).removesuffix(entity.kind).strip()
        if stem:
            stems.setdefault(stem, set()).add(entity.kind)
            named_sections.setdefault(entity.kind, set()).update(source.section_id for source in entity.sources)
    inconsistent = 0
    for entity in parsed.entities:
        stem = entity_key(entity.name).removesuffix(entity.kind).strip()
        # A repeated proper name assigned different component kinds, or a bare
        # kind without a named component in its section, needs explicit review.
        drift = bool(stem and len(stems[stem]) > 1)
        ambiguous_name = not stem and entity.kind in named_sections and any(
            source.section_id not in named_sections[entity.kind] for source in entity.sources)
        inconsistent += int(drift or ambiguous_name)
    warnings = list(scan.warnings)
    if descriptions:
        warnings.append("descriptive_sections_have_no_direct_requirements")
    if len(parsed.tables) < len(scan.table_regions):
        warnings.append("some_detected_tables_could_not_be_parsed")
    if any(ref.resolved_id is None for ref in parsed.cross_references):
        warnings.append("unresolved_or_external_cross_references")
    if inconsistent:
        warnings.append("component_name_or_kind_inconsistency")
    warnings.append("confidence_is_heuristic_not_calibrated_or_verified")
    return Assessment(
        _ratio(len(parsed.sections) - len(descriptions), len(parsed.sections)),
        round(regular, 4), _ratio(len(parsed.tables), len(scan.table_regions)),
        _ratio(sum(ref.resolved_id is not None for ref in section_refs), len(section_refs)),
        _ratio(len(parsed.entities) - inconsistent, len(parsed.entities)), len(ambiguous), descriptions,
        ambiguous, duplicates,
        {"sections": len(parsed.sections), "requirements": len(assessed), "headings": len(scan.headings),
         "detected_tables": len(scan.table_regions), "parsed_tables": len(parsed.tables),
         "section_references": len(section_refs), "resolved_section_references": sum(ref.resolved_id is not None for ref in section_refs),
         "entities": len(parsed.entities), "open_items": len(parsed.open_items)},
        warnings,
    )
