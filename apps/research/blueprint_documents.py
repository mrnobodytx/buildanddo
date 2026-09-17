# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/blueprint_documents.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/documents.py, apps/research/contracts.py, apps/research/blueprint_scan.py
# EnumType:    Service
# EnumEdges:   EXTENDS apps/research/documents.py; DEPENDS_ON apps/research/contracts.py; CONSUMES apps/research/blueprint_scan.py
# DAG Node:    none
# Intent:      Preserve the saved document schema while sharing three-pass PDF reading order with mission analysis.
# ───────────────────────────────────────────────────────────────

"""Adapt admitted documents to the existing saved-blueprint wire contract."""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
from typing import cast

from apps.research import documents
from apps.research.blueprint_scan import scan_pdf
from apps.research.contracts import MAX_FILE, ResearchError, clip_text, file_kind, object_value, text

PARSER_VERSION = "blueprint-1.0"
COMPONENT_TYPES = ("service", "database", "queue", "gateway", "worker", "storage", "external")
PRIORITIES = ("must", "should", "could", "wont", "high", "medium", "low")
REQUIREMENT_TYPES = ("functional", "performance", "security", "integration", "data", "constraint")
MAX_REQUIREMENTS, MAX_COMPONENTS, MAX_SECTIONS = 80, 64, 64
MAX_BLUEPRINT_BYTES = 220000
NORMATIVE = re.compile(r"\b(?:shall|must|should|will|required|needs? to|could|may|won['’]?t)\b", re.I)
EXPLICIT_ID = re.compile(r"\b((?:REQ|FR|NFR|SEC|PERF|INT|DATA)[-_]\d+(?:[._-]\d+)*)\b", re.I)
QUESTION = re.compile(r"\b(?:TBD|TBC|TODO|to be (?:determined|decided|confirmed)|not yet decided|not specified|undecided|open question)\b", re.I)
RELATION = re.compile(r"\b(?:connects? to|depends? on|reads? from|writes? to|calls?|integrates? with)\b", re.I)
ARCHITECTURAL = r"service|module|component|system|database|api|endpoint|queue|gateway|worker|storage"
COMPONENT = re.compile(rf"\b(?:[a-z][\w-]*[_-](?:{ARCHITECTURAL})|(?:(?!(?:{ARCHITECTURAL})\b)[a-z][\w-]*[ \t]+){{0,4}}(?:api[ \t]+gateway|{ARCHITECTURAL}))\b", re.I)
PREFIX_WORDS = set("the a an our this its their and or to from with by via for of in uses use calls call connects reads writes depends integrates shall must should will needs requires is are has provides named called".split())


@dataclass
class Section:
    """Locate a section in the extracted text with one-based line numbers."""

    id: str
    title: str
    text: str
    level: int
    start_line: int
    end_line: int


@dataclass
class Requirement:
    """Retain a requirement statement and its source section identifier."""

    id: str
    text: str
    priority: str
    type: str
    section: str
    raw_context: str


@dataclass
class Component:
    """Describe an inferred component and its outgoing dependencies."""

    name: str
    type: str
    description: str
    requirements: list[str]
    dependencies: list[str]


@dataclass
class Blueprint:
    """Collect extraction observations without approval or execution authority."""

    title: str
    source_file: str
    source_hash: str
    extracted_at: str
    sections: list[Section]
    requirements: list[Requirement]
    components: list[Component]
    constraints: list[str]
    assumptions: list[str]
    open_questions: list[str]
    extraction_confidence: float
    parser_version: str
    page_count: int
    truncated: bool

    def to_dict(self) -> dict[str, object]:
        """Serialize observations as ordinary JSON data."""
        return asdict(self)

    @classmethod
    def from_dict(cls, value: object) -> Blueprint:
        """Validate the structured child-process result before evaluation."""
        data = object_value(value)
        if set(data) != set(cls.__dataclass_fields__):
            raise ResearchError("invalid_data")
        sections: list[Section] = []
        for row in _rows(data["sections"], MAX_SECTIONS, Section):
            if any(type(row[k]) is not int or cast(int, row[k]) < 1 for k in ("level", "start_line", "end_line")):
                raise ResearchError("invalid_data")
            sections.append(Section(text(row["id"], 32), text(row["title"], 160), text(row["text"], 16000, empty=True),
                                    cast(int, row["level"]), cast(int, row["start_line"]), cast(int, row["end_line"])))
        requirements: list[Requirement] = []
        for row in _rows(data["requirements"], MAX_REQUIREMENTS, Requirement):
            if row["priority"] not in PRIORITIES or row["type"] not in REQUIREMENT_TYPES:
                raise ResearchError("invalid_data")
            requirements.append(Requirement(text(row["id"], 80), text(row["text"], 2000), str(row["priority"]), str(row["type"]),
                                            text(row["section"], 32), text(row["raw_context"], 800)))
        section_ids = {section.id for section in sections}
        ids = {requirement.id for requirement in requirements}
        if len(section_ids) != len(sections) or len(ids) != len(requirements) or any(r.section not in section_ids for r in requirements):
            raise ResearchError("invalid_data")
        components: list[Component] = []
        for row in _rows(data["components"], MAX_COMPONENTS, Component):
            if row["type"] not in COMPONENT_TYPES:
                raise ResearchError("invalid_data")
            components.append(Component(text(row["name"], 160), str(row["type"]), text(row["description"], 800),
                                        _strings(row["requirements"], MAX_REQUIREMENTS, 80), _strings(row["dependencies"], MAX_COMPONENTS, 160)))
        names = {component.name for component in components}
        if len(names) != len(components) or any(not set(c.requirements) <= ids or not set(c.dependencies) <= names or c.name in c.dependencies for c in components):
            raise ResearchError("invalid_data")
        confidence = data["extraction_confidence"]
        if type(confidence) not in (int, float) or not math.isfinite(cast(float, confidence)) or not 0 <= cast(float, confidence) <= 1:
            raise ResearchError("invalid_data")
        if type(data["page_count"]) is not int or not 0 <= data["page_count"] <= 200 or type(data["truncated"]) is not bool:
            raise ResearchError("invalid_data")
        digest = text(data["source_hash"], 64)
        if not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ResearchError("invalid_data")
        stamp = text(data["extracted_at"], 80)
        try:
            if datetime.fromisoformat(stamp.replace("Z", "+00:00")).tzinfo is None:
                raise ValueError
        except ValueError:
            raise ResearchError("invalid_data") from None
        return cls(text(data["title"], 160), text(data["source_file"], 180), digest, stamp, sections, requirements, components,
                   _strings(data["constraints"], 80, 2000), _strings(data["assumptions"], 80, 2000), _strings(data["open_questions"], 80, 2000),
                   float(cast(float, confidence)), text(data["parser_version"], 80), data["page_count"], data["truncated"])


def _rows(value: object, maximum: int, model: type[Section] | type[Requirement] | type[Component]) -> list[dict[str, object]]:
    if not isinstance(value, list) or len(value) > maximum:
        raise ResearchError("invalid_data")
    result = [object_value(row) for row in value]
    if any(set(row) != set(model.__dataclass_fields__) for row in result):
        raise ResearchError("invalid_data")
    return result


def _strings(value: object, maximum: int, length: int) -> list[str]:
    if not isinstance(value, list) or len(value) > maximum:
        raise ResearchError("invalid_data")
    return [text(item, length) for item in value]


def _heading(line: str) -> tuple[str, int] | None:
    value = line.strip()
    if not value or len(value) > 140:
        return None
    marked = re.fullmatch(r"(#{1,6})\s+(.+?)\s*#*", value)
    if marked:
        return marked[2], len(marked[1])
    bold = re.fullmatch(r"(?:\*\*(.+)\*\*|__(.+)__)", value)
    if bold and not NORMATIVE.search(value):
        return bold[1] or bold[2], 1
    numbered = re.fullmatch(r"(\d+(?:\.\d+)*)(?:[.)])?\s+(.+)", value)
    if numbered and not NORMATIVE.search(numbered[2]) and not numbered[2].endswith(('.', '?', ';')):
        return numbered[2], min(6, numbered[1].count('.') + 1)
    if value.isupper() and len(value.split()) <= 12 and not NORMATIVE.search(value):
        return value.rstrip(':'), 1
    if re.fullmatch(r"(?:must|should|could|won['’]?t)(?:[ -]have)?(?: requirements)?[:]?", value, re.I):
        return value.rstrip(':'), 1
    if re.fullmatch(r"(?:assumptions|constraints|open questions|requirements):", value, re.I):
        return value[:-1], 1
    return None


def split_sections(value: str) -> list[Section]:
    """Detect headings while retaining every line in the bounded text excerpt."""
    sections: list[Section] = []
    title, level, start = "Introduction", 1, 1
    lines: list[str] = []
    for number, line in enumerate(value.splitlines(), 1):
        heading = _heading(line)
        if heading and len(sections) < MAX_SECTIONS - 1:
            if lines or title != "Introduction":
                sections.append(Section(f"SEC-{len(sections) + 1:03}", title, '\n'.join(lines).strip(), level, start, max(start, number - 1)))
            title, level, start, lines = heading[0], heading[1], number, []
        else:
            lines.append(line)
    if lines or title != "Introduction":
        sections.append(Section(f"SEC-{len(sections) + 1:03}", title, '\n'.join(lines).strip(), level, start, max(start, len(value.splitlines()))))
    return sections


def _statements(section: Section) -> list[tuple[str, str]]:
    # Retain PDF line wrapping inside a paragraph, but separate bullets and IDs.
    blocks = re.split(r"\n\s*\n|\n(?=\s*(?:[-*•]\s|(?:REQ|FR|NFR|SEC|PERF|INT|DATA)[-_]\d))", section.text)
    result: list[tuple[str, str]] = []
    for block in blocks:
        flat = re.sub(r"\s+", " ", block).strip(' \t-*•')
        for match in re.finditer(r".+?(?:[.!?;](?=\s+[A-Za-z0-9\[]|$)|$)", flat):
            statement = match[0].strip()
            if statement:
                original = re.search(r'\s+'.join(re.escape(word) for word in statement.split()), block)
                offset = max(0, original.start() - 100) if original else 0
                context = block[offset:offset + 800].strip()
                result.append((statement, clip_text(context, 800)))
    return result


def requirement_priority(statement: str, heading: str = "") -> str:
    """Map normative language and MoSCoW headings without weakening prohibitions."""
    source = statement.lower()
    if re.search(r"\b(?:shall|must) not\b", source):
        return "must"
    if re.search(r"\b(?:won['’]?t|wont|out of scope|not required|will not)\b", source):
        return "wont"
    for pattern, priority in ((r"\b(?:shall|must|required|needs? to)\b", "must"), (r"\bshould\b", "should"),
                              (r"\b(?:could|may|optional)\b", "could"), (r"\bwill\b", "must")):
        if re.search(pattern, source):
            return priority
    for label, priority in (("must", "must"), ("should", "should"), ("could", "could"), ("won't", "wont"), ("wont", "wont")):
        if label in heading.lower():
            return priority
    for priority in ("high", "medium", "low"):
        if re.search(rf"\b{priority}\s+priority\b|\[\s*{priority}\s*\]", source, re.I):
            return priority
    return "must"


def requirement_type(statement: str) -> str:
    """Classify the statement using ordered domain keywords."""
    domains = (
        ("security", r"\b(?:auth\w*|encrypt\w*|secur\w*|permission\w*|access control|tls|privacy)\b"),
        ("performance", r"\b(?:latency|throughput|milliseconds?|ms|seconds?|performance|concurrent|availability|uptime)\b"),
        ("constraint", r"\b(?:budget|deadline|cost|limited to|no more than|must use|shall use)\b"),
        ("integration", r"\b(?:api|endpoint|integrat\w*|connect\w*|protocol|webhook)\b"),
        ("data", r"\b(?:data|database|retention|schema|backup|records?|persist\w*|storage)\b"),
    )
    return next((kind for kind, pattern in domains if re.search(pattern, statement, re.I)), "functional")


def _component_kind(name: str) -> str:
    name = name.replace('_', ' ').replace('-', ' ')
    for kind, pattern in (("database", r"database|postgres|redis|mysql"), ("queue", r"queue|kafka|nats"),
                          ("gateway", r"gateway|\bapi\b|endpoint"), ("worker", r"worker"), ("storage", r"storage|bucket"),
                          ("external", r"external|third.party")):
        if re.search(pattern, name, re.I):
            return kind
    return "service"


def _component_name(value: str) -> str:
    words = value.split()
    while len(words) > 1 and any(word.lower() in PREFIX_WORDS for word in words[:-1]):
        words = words[next(i for i, word in enumerate(words[:-1]) if word.lower() in PREFIX_WORDS) + 1:]
    return ' '.join(words)


def _topology(statements: list[str], requirements: list[Requirement]) -> list[Component]:
    found: dict[str, Component] = {}
    for statement in statements:
        mentions: list[tuple[int, int, str]] = []
        for match in COMPONENT.finditer(statement):
            name = _component_name(match[0])
            if name.lower() in {"system", "component", "module"}:
                continue
            key = name.casefold()
            if key not in found and len(found) < MAX_COMPONENTS:
                found[key] = Component(name, _component_kind(name), clip_text(statement, 800), [], [])
            if key in found:
                mentions.append((match.end() - len(name), match.end(), key))
        # Use the grammatical subject for compound relations: A calls B and reads from C.
        links = list(RELATION.finditer(statement))
        for index, link in enumerate(links):
            before = [item for item in mentions if item[1] <= link.start()]
            stop = links[index + 1].start() if index + 1 < len(links) else len(statement)
            after = [item for item in mentions if item[0] >= link.end() and item[0] < stop]
            if before and not after:
                named = re.match(r'\s*(?:the\s+)?([A-Z][\w-]*(?:[ \t]+[A-Z][\w-]*){0,2})', statement[link.end():stop])
                if named:
                    name = named[1]
                    key = name.casefold()
                    if key not in found and len(found) < MAX_COMPONENTS:
                        kind = _component_kind(name)
                        found[key] = Component(name, kind if kind != 'service' else 'external', clip_text(statement, 800), [], [])
                    if key in found:
                        after = [(link.end(), link.end() + named.end(), key)]
            if not before or not after:
                continue
            component = found[before[0][2]]
            for _start, _end, key in after:
                target = found[key].name
                if target != component.name and target not in component.dependencies:
                    component.dependencies.append(target)
    for component in found.values():
        pattern = re.compile(r"(?<!\w)" + re.escape(component.name) + r"(?!\w)", re.I)
        component.requirements = [r.id for r in requirements if pattern.search(r.text)]
    return list(found.values())


def structure_text(value: str, *, source_file: str, source_hash: str, page_count: int = 0, truncated: bool = False) -> Blueprint:
    """Extract reviewable observations from bounded text without interpreting instructions."""
    text(value, 16000, empty=True)
    sections = split_sections(value)
    requirements: list[Requirement] = []
    constraints: list[str] = []
    assumptions: list[str] = []
    questions: list[str] = []
    statements: list[str] = []
    seen: dict[str, str] = {}
    for section in sections:
        if QUESTION.search(section.title):
            questions.append(section.title)
        moscow = bool(re.fullmatch(r"(?:must|should|could|won['’]?t)(?:[ -]have)?(?: requirements)?", section.title, re.I))
        for statement, context in _statements(section):
            statements.append(statement)
            if QUESTION.search(statement):
                questions.append(clip_text(statement, 2000))
            if 'assumption' in section.title.lower() or re.search(r"\b(?:assume[sd]?|assuming|assumption)\b", statement, re.I):
                assumptions.append(clip_text(statement, 2000))
            if 'constraint' in section.title.lower() or requirement_type(statement) == 'constraint':
                constraints.append(clip_text(statement, 2000))
            own_id = EXPLICIT_ID.search(statement)
            if not (NORMATIVE.search(statement) or own_id or moscow):
                continue
            normalized = re.sub(r"\s+", " ", statement).casefold().strip()
            generated = 'REQ-' + hashlib.sha256(normalized.encode()).hexdigest()[:12].upper()
            identifier = own_id[1].upper() if own_id else generated
            if identifier in seen:
                if seen[identifier] == normalized:
                    continue
                questions.append(f"Conflicting statements use requirement ID {identifier}.")
                identifier = generated
                if identifier in seen:
                    continue
            if len(requirements) >= MAX_REQUIREMENTS:
                truncated = True
                continue
            seen[identifier] = normalized
            requirement = clip_text(statement, 2000)
            truncated = truncated or requirement != statement
            requirements.append(Requirement(identifier, requirement, requirement_priority(statement, section.title),
                                            requirement_type(statement), section.id, context))
    components = _topology(statements, requirements)
    headings = sum(section.title != 'Introduction' for section in sections)
    structural = sum(r.section != 'SEC-001' or (bool(sections) and sections[0].title != 'Introduction') for r in requirements) / max(1, len(requirements))
    confidence = (0.35 * min(1, len(requirements) / 10) + 0.25 * min(1, headings / 3) + 0.25 * structural + (0.15 if requirements else 0))
    title = next((s.title for s in sections if s.title != 'Introduction'), '')
    if sections and sections[0].title == 'Introduction' and sections[0].text:
        title = sections[0].text.splitlines()[0]
    truncated = truncated or len(sections) == MAX_SECTIONS or len(components) == MAX_COMPONENTS or any(len(rows) > 80 for rows in (constraints, assumptions, questions))
    result = Blueprint(clip_text(title or Path(source_file).stem, 160), source_file, source_hash, datetime.now(timezone.utc).isoformat(),
                       sections, requirements, components, list(dict.fromkeys(constraints))[:80], list(dict.fromkeys(assumptions))[:80],
                       list(dict.fromkeys(questions))[:80], round(confidence * (0.8 if truncated else 1), 3), PARSER_VERSION, page_count, truncated)
    if len(json.dumps(result.to_dict(), ensure_ascii=False).encode()) > MAX_BLUEPRINT_BYTES:
        raise ResearchError('too_large')
    return Blueprint.from_dict(result.to_dict())


def _document_source(data: bytes, name: str) -> tuple[str, str, bool, int]:
    if not name.lower().endswith('.pdf'):
        value, version, truncated = documents.extract(data, name)
        return value, version, truncated, 0
    scan = scan_pdf(data, name)
    # The saved v1 schema retains its IDs and observation timestamp. Its text
    # now follows the same bounded, positioned scan as the detailed review.
    ordered = '\n'.join(block.text for block in scan.blocks)
    value = clip_text(ordered, 16000).strip()
    if not value:
        raise ResearchError('unsupported')
    return value, scan.parser_version, len(ordered) > 16000, len(scan.pages)


def _structure_document(data: bytes, name: str, value: str, truncated: bool, count: int) -> Blueprint:
    return structure_text(value, source_file=name, source_hash=hashlib.sha256(data).hexdigest(), page_count=count, truncated=truncated)


def extract_blueprint(data: bytes, name: str) -> Blueprint:
    """Project scanned PDFs or admitted text into the saved document schema."""
    value, _version, truncated, count = _document_source(data, name)
    return _structure_document(data, name, value, truncated, count)


def parse_upload(data: bytes, name: str) -> dict[str, object]:
    """Keep the flat excerpt when structuring fails after document admission."""
    value, version, truncated, count = _document_source(data, name)
    result: dict[str, object] = {'text': value, 'version': version, 'truncated': truncated, 'blueprint': None, 'blueprint_failure': ''}
    try:
        blueprint = _structure_document(data, name, value, truncated, count)
        if blueprint.requirements:
            result['blueprint'] = blueprint.to_dict()
        else:
            result['blueprint_failure'] = 'no_requirements'
    except Exception:
        # Never serialize exceptions that might include private document text.
        result['blueprint_failure'] = 'structure_failed'
    return result


def main() -> int:
    """Run the blueprint extension under the document parser's resource limits."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', type=Path)
    parser.add_argument('--name', required=True)
    args = parser.parse_args()
    try:
        size = args.path.stat().st_size
        if size > MAX_FILE:
            raise ResearchError('too_large')
        file_kind(args.name, size)
        print(json.dumps(parse_upload(args.path.read_bytes(), args.name), ensure_ascii=False))
        return 0
    except ResearchError as error:
        print(json.dumps({'failure': error.reason}))
    except Exception:
        print(json.dumps({'failure': 'invalid_data'}))
    return 1


if __name__ == '__main__':
    documents.limit_resources()
    raise SystemExit(main())
