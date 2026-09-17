# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/evidence.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/census.py, apps/estate/metadata.py, apps/estate/syntax.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/estate/census.py; DEPENDS_ON apps/estate/metadata.py; DEPENDS_ON apps/estate/syntax.py
# DAG Node:    none
# Intent:      Join bounded syntax evidence with existing manifests, specifications and dispatch records.
# ───────────────────────────────────────────────────────────────

"""Collect existing repository evidence once for all compiler phases."""

from __future__ import annotations

from dataclasses import dataclass, field
import json
from pathlib import Path, PurePosixPath
import re
import tomllib
from typing import cast

from apps.estate.census import CensusRecord, read_source
from apps.estate.common import Diagnostic, EstateError
from apps.estate.metadata import RegistryEntry, parse_registry, scope_paths, srs_codes
from apps.estate.syntax import JS_EXTENSIONS, SourceFacts, parse_javascript, parse_python

REGISTRY_PATH = ".bits/srs_registry.yml"


@dataclass
class RepositoryEvidence:
    """Share extracted facts while leaving source text out of the graph."""

    files: dict[str, SourceFacts] = field(default_factory=dict)
    manifests: dict[str, dict[str, object]] = field(default_factory=dict)
    registry: list[RegistryEntry] = field(default_factory=list)
    spec_paths: dict[str, list[str]] = field(default_factory=dict)
    dispatches: dict[str, list[str]] = field(default_factory=dict)
    notes: list[Diagnostic] = field(default_factory=list)


def _json_manifest(text: str) -> dict[str, object]:
    # The tsconfig/jsconfig family accepts comments and trailing commas.
    clean = re.sub(r'("(?:\\.|[^"\\])*")|//[^\n]*|/\*[\s\S]*?\*/',
                   lambda match: match[1] or "", text)
    clean = re.sub(r'("(?:\\.|[^"\\])*")|,(\s*[}\]])', lambda match: match[1] or match[2], clean)
    value: object = json.loads(clean)
    if not isinstance(value, dict):
        raise EstateError("Manifest must contain an object")
    return cast(dict[str, object], value)


def collect_evidence(root: Path, census: list[CensusRecord]) -> RepositoryEvidence:
    """Parse supported source files and governance without executing them."""
    result = RepositoryEvidence()
    for record in census:
        if record.kind != "file":
            continue
        if record.analysis_status in {"analysis_limit", "symlink", "sensitive_metadata", "special_file"}:
            result.notes.append(Diagnostic(record.analysis_status, record.path,
                                           "Content analysis omitted; census metadata retained", [record.path]))
        text = read_source(root, record)
        if text is None:
            if record.analysis_status == "analyzed":
                result.notes.append(Diagnostic("text_encoding", record.path, "Text is not valid UTF-8", [record.path]))
            continue
        name = PurePosixPath(record.path).name
        if record.extension == ".py":
            facts = parse_python(text, record.path)
        elif record.extension in JS_EXTENSIONS:
            facts = parse_javascript(text, record.path, record.cgrf.get("Auth", ""))
        else:
            facts = SourceFacts()
        result.files[record.path] = facts
        result.notes.extend(facts.notes)
        if name in {"package.json", "manifest.json", "jsconfig.json", "tsconfig.json"} or name.startswith(("tsconfig.", "jsconfig.")) and name.endswith(".json"):
            try:
                result.manifests[record.path] = _json_manifest(text)
            except (ValueError, RecursionError):
                result.notes.append(Diagnostic("invalid_manifest", record.path, "Manifest cannot be parsed as JSON", [record.path]))
        elif name == "pyproject.toml":
            try:
                result.manifests[record.path] = tomllib.loads(text)
            except tomllib.TOMLDecodeError:
                result.notes.append(Diagnostic("invalid_manifest", record.path, "Manifest cannot be parsed as TOML", [record.path]))
        elif name == "requirements.txt":
            dependencies = []
            for line in text.splitlines():
                line = line.split("#", 1)[0].strip()
                if line and not line.startswith("-"):
                    dependencies.append(line)
            result.manifests[record.path] = {"requirements": dependencies}
        if record.path == REGISTRY_PATH:
            try:
                result.registry = parse_registry(text)
            except EstateError:
                result.notes.append(Diagnostic("invalid_registry", record.path, "SRS registry does not follow its flat mapping contract", [record.path]))
        if record.path.startswith(".bits/srs/") and record.extension == ".md":
            result.spec_paths[record.path] = scope_paths(text)
        if record.path.startswith(".bits/queue/") and name != "TEMPLATE.md" and record.extension == ".md":
            result.dispatches[record.path] = srs_codes(text)
    if not any(record.path == REGISTRY_PATH for record in census):
        result.notes.append(Diagnostic("missing_registry", REGISTRY_PATH, "No SRS registry exists in this estate", [REGISTRY_PATH]))
    result.notes.sort(key=lambda note: (note.code, note.subject, note.message))
    return result
