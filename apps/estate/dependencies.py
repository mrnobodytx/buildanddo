# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/dependencies.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/modules.py, apps/estate/evidence.py, apps/estate/syntax.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/estate/modules.py; DEPENDS_ON apps/estate/evidence.py; DEPENDS_ON apps/estate/syntax.py
# DAG Node:    none
# Intent:      Resolve declared and observed dependencies to estate modules with inspectable source evidence.
# ───────────────────────────────────────────────────────────────

"""Resolve source-level references into typed module edges."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
import fnmatch
from pathlib import PurePosixPath
import posixpath
import re

from apps.estate.census import CensusRecord
from apps.estate.common import Diagnostic
from apps.estate.evidence import RepositoryEvidence
from apps.estate.metadata import enum_edges, split_references, srs_codes
from apps.estate.modules import EstateModule, contains, owner_of
from apps.estate.syntax import ImportReference, Route, route_matches

EDGE_TYPES = {"DEPENDS_ON", "CONSUMES", "PRODUCES", "IMPLEMENTS", "EXPOSES", "CONFIGURES", "TESTED_BY"}
EXECUTION_EDGES = {"DEPENDS_ON", "CONSUMES"}
JS_SUFFIXES = (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json")


@dataclass(frozen=True)
class DependencyEdge:
    """Connect semantic modules with retained evidence leaves."""

    source: str
    target: str
    edge_type: str
    evidence: str
    confidence: float
    evidence_files: list[str] = field(default_factory=list)
    details: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Reference:
    """Retain resolved, external and missing references without fake graph nodes."""

    source_file: str
    target: str
    edge_type: str
    evidence: str
    confidence: float
    resolved_paths: list[str]
    resolved_modules: list[str]
    status: str
    line: int = 0
    usage: str = ""


@dataclass(frozen=True)
class Collection:
    """Associate one statically declared collection with its backend and migration."""

    name: str
    file: str
    module_id: str
    backend: str


@dataclass(frozen=True)
class DependencyAnalysis:
    """Retain module edges alongside the source facts needed for reconciliation."""

    edges: list[DependencyEdge]
    references: list[Reference]
    routes: list[Route]
    collections: list[Collection]
    notes: list[Diagnostic]


def safe_relative(path: str) -> str | None:
    """Normalize a reference without escaping the estate root."""
    normalized = posixpath.normpath(path.replace("\\", "/"))
    if normalized.startswith(("/", "../")) or normalized == ".." or re.match(r"^[A-Za-z]:", normalized):
        return None
    return normalized


def backend_root(path: str) -> str:
    """Scope PocketBase collection names to their backend, not the entire estate."""
    for part in ("/pb_hooks/", "/pb_migrations/"):
        if part in path:
            return path.split(part, 1)[0]
    return ""


class Resolver:
    """Resolve references using inventoried paths, local packages and JS aliases."""

    def __init__(self, census: list[CensusRecord], modules: list[EstateModule], evidence: RepositoryEvidence) -> None:
        self.records = {record.path: record for record in census}
        self.modules = modules
        self.evidence = evidence
        self.packages: dict[str, str] = {}
        for path, manifest in sorted(evidence.manifests.items()):
            project = manifest.get("project")
            name = project.get("name") if isinstance(project, dict) else manifest.get("name")
            if isinstance(name, str):
                self.packages[name] = str(PurePosixPath(path).parent)

    def path(self, target: str, source_file: str, *, language: str = "", declared: bool = False) -> list[str]:
        """Resolve a local literal, glob or package directory to evidence paths."""
        normalized = safe_relative(target)
        if declared and normalized is not None and any(char in normalized for char in "*?["):
            return sorted(path for path in self.records if fnmatch.fnmatchcase(path, normalized))
        bases = [target]
        if target.startswith(".") and not declared:
            bases = [posixpath.join(str(PurePosixPath(source_file).parent), target)]
        elif declared and normalized not in self.records:
            bases.append(posixpath.join(str(PurePosixPath(source_file).parent), target))
        for base in bases:
            candidate = safe_relative(base)
            if candidate is None:
                continue
            if candidate == "." and any(module.path == "." for module in self.modules):
                return ["."]
            suffixes = (".py",) if language == "python" else JS_SUFFIXES if language == "javascript" else ()
            possibilities = [candidate]
            possibilities.extend(candidate + suffix for suffix in suffixes)
            if language == "javascript" and candidate.endswith(".js"):
                possibilities.extend(candidate[:-3] + suffix for suffix in (".ts", ".tsx"))
            indexes = ("__init__.py",) if language == "python" else tuple("index" + suffix for suffix in JS_SUFFIXES)
            # Directory imports resolve their actual entrypoint when it is present.
            possibilities = [path for path in possibilities if self.records.get(path) is None or self.records[path].kind != "directory"] + [
                candidate + "/" + index for index in indexes
            ] + [candidate]
            for path in possibilities:
                record = self.records.get(path)
                if record and record.analysis_status not in {"excluded", "symlink", "sensitive_metadata", "special_file"}:
                    return [path]
        return []

    def javascript(self, target: str, source_file: str) -> tuple[list[str], str, float]:
        """Resolve a JS import through declared aliases, hook paths or packages."""
        if target.startswith("$" + "{__hooks}/"):
            backend = backend_root(source_file)
            paths = self.path(backend + "/pb_hooks/" + target.split("}/", 1)[1], source_file, language="javascript")
            return paths, "resolved" if paths else "missing", 1.0
        if "$" + "{" in target:
            return [], "dynamic", 0.0
        if target.startswith("."):
            paths = self.path(target, source_file, language="javascript")
            return paths, "resolved" if paths else "missing", 1.0
        configs = sorted(
            ((path, data) for path, data in self.evidence.manifests.items()
             if "compilerOptions" in data and contains(str(PurePosixPath(path).parent), source_file)),
            key=lambda pair: (-len(PurePosixPath(pair[0]).parts), pair[0]),
        )
        for path, config in configs:
            options = config["compilerOptions"]
            if not isinstance(options, dict):
                continue
            aliases = options.get("paths", {})
            if not isinstance(aliases, dict):
                continue
            base_url = options.get("baseUrl", ".")
            if not isinstance(base_url, str):
                continue
            base = posixpath.join(str(PurePosixPath(path).parent), base_url)
            for alias, replacements in sorted(aliases.items(), key=lambda pair: (-len(pair[0]), pair[0])):
                if not isinstance(alias, str) or not isinstance(replacements, list):
                    continue
                prefix, _, suffix = alias.partition("*")
                matches = target == alias if "*" not in alias else target.startswith(prefix) and target.endswith(suffix)
                if not matches:
                    continue
                wildcard = target[len(prefix):len(target) - len(suffix) if suffix else None] if "*" in alias else ""
                for replacement in replacements:
                    if isinstance(replacement, str):
                        paths = self.path(posixpath.join(base, replacement.replace("*", wildcard)), source_file, language="javascript")
                        if paths:
                            return paths, "resolved", 1.0
                return [], "missing", 1.0
        if target.startswith("@/"):
            owner = owner_of(source_file, self.modules)
            base = owner.path if owner else "."
            paths = self.path(posixpath.join(base, "src", target[2:]), source_file, language="javascript")
            return paths, "resolved" if paths else "missing", 0.8
        package_name = "/".join(target.split("/")[:2]) if target.startswith("@") else target.split("/")[0]
        if package_name in self.packages:
            base = self.packages[package_name] + target[len(package_name):]
            paths = self.path(base, source_file, language="javascript")
            return paths, "resolved" if paths else "missing", 1.0
        return [], "external", 1.0

    def python(self, reference: ImportReference, source_file: str) -> tuple[list[str], str, float]:
        """Resolve Python absolute, package and relative imports statically."""
        target = reference.target.replace(".", "/")
        if reference.level:
            parents = list(PurePosixPath(source_file).parent.parts)
            if reference.level > len(parents):
                return [], "missing", 1.0
            base = "/".join(parents[:len(parents) - reference.level + 1])
            target = posixpath.join(base, target)
        children = []
        for name in reference.names:
            if name != "*":
                children.extend(self.path(posixpath.join(target, name), source_file, language="python"))
        paths = sorted(set(children)) or self.path(target, source_file, language="python")
        if paths:
            return paths, "resolved", 1.0
        if not reference.level:
            paths = self.path("./" + target, source_file, language="python")
            if paths:
                return paths, "resolved", 0.8
        first = target.split("/")[0]
        status = "missing" if reference.level or first in self.records else "external"
        return [], status, 1.0


def extract_dependencies(census: list[CensusRecord], modules: list[EstateModule],
                         evidence: RepositoryEvidence) -> DependencyAnalysis:
    """Compile actual module edges and retain every unresolved declaration."""
    resolver = Resolver(census, modules, evidence)
    references: list[Reference] = []
    edges: dict[tuple[str, str, str, str], DependencyEdge] = {}
    notes: list[Diagnostic] = []
    collections = [
        Collection(name, path, owner.module_id, backend_root(path))
        for path, facts in sorted(evidence.files.items())
        if (owner := owner_of(path, modules)) is not None
        for name in facts.collections
    ]

    def edge(source: str, target: str, kind: str, evidence_type: str, confidence: float, file: str, detail: str) -> None:
        if source == target:
            return
        key = (source, target, kind, evidence_type)
        previous = edges.get(key)
        edges[key] = DependencyEdge(
            source, target, kind, evidence_type, max(confidence, previous.confidence if previous else 0.0),
            sorted(set((previous.evidence_files if previous else []) + [file])),
            sorted(set((previous.details if previous else []) + [detail])),
        )

    def record_reference(file: str, target: str, kind: str, evidence_type: str, confidence: float,
                         paths: list[str], status: str, line: int = 0, usage: str = "") -> None:
        owners = sorted({owner.module_id for path in paths if (owner := owner_of(path, modules)) is not None})
        references.append(Reference(file, target, kind, evidence_type, confidence, sorted(set(paths)), owners, status, line, usage))
        source = owner_of(file, modules)
        if source:
            for owner_id in owners:
                if kind == "TESTED_BY":
                    edge(owner_id, source.module_id, kind, evidence_type, confidence, file, target)
                else:
                    edge(source.module_id, owner_id, kind, evidence_type, confidence, file, f"{usage + ':' if usage else ''}{target}")

    for record in census:
        if record.kind != "file":
            continue
        facts = evidence.files.get(record.path)
        if facts:
            for imported in facts.imports:
                paths, status, confidence = (
                    resolver.python(imported, record.path) if imported.language == "python"
                    else resolver.javascript(imported.target, record.path)
                )
                record_reference(record.path, "." * imported.level + imported.target, "DEPENDS_ON", "import",
                                 min(confidence, 0.85) if imported.usage == "jsx" else confidence,
                                 paths, status, imported.line, imported.usage)
        declarations = [("DEPENDS_ON", target) for target in split_references(record.cgrf.get("Depends", ""))]
        for kind, target in enum_edges(record.cgrf.get("EnumEdges", "")):
            if kind in EDGE_TYPES:
                if kind == "EXPOSES" and re.match(r"^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/", target):
                    continue
                declarations.append((kind, target))
            elif kind in {"EXTENDS", "USES_TEMPLATE"}:
                declarations.append(("DEPENDS_ON", target))
            elif kind == "VALIDATES":
                declarations.append(("TESTED_BY", target))
            elif kind == "VERIFIED_BY":
                # This declaration is already oriented from implementation to test.
                paths = resolver.path(target, record.path, declared=True)
                source = owner_of(record.path, modules)
                for path in paths:
                    target_owner = owner_of(path, modules)
                    if source and target_owner:
                        edge(source.module_id, target_owner.module_id, "TESTED_BY", "cgrf_header", 1.0, record.path, target)
        for kind, target in sorted(set(declarations)):
            paths = resolver.path(target, record.path, declared=True)
            if not paths:
                paths = sorted({collection.file for collection in collections if collection.name == target
                                and (not backend_root(record.path) or collection.backend == backend_root(record.path))})
            if not paths:
                paths = [module.path for module in modules if module.module_id == target]
            status = "resolved" if paths else "missing" if "/" in target or PurePosixPath(target).suffix else "external"
            record_reference(record.path, target, kind, "cgrf_header", 1.0, paths, status)
    for path, manifest in sorted(evidence.manifests.items()):
        for field_name in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            dependencies = manifest.get(field_name, {})
            if not isinstance(dependencies, dict):
                continue
            for name, version in sorted(dependencies.items()):
                if not isinstance(name, str) or not isinstance(version, str):
                    continue
                if version.startswith(("file:", "link:")):
                    paths = resolver.path("./" + version.split(":", 1)[1], path, language="javascript")
                elif name in resolver.packages:
                    paths = resolver.path(resolver.packages[name], path)
                else:
                    paths = []
                status = "resolved" if paths else "missing" if version.startswith(("workspace:", "file:", "link:")) else "external"
                record_reference(path, name, "DEPENDS_ON", "package_manifest", 1.0, paths, status)
        project = manifest.get("project")
        requirements = project.get("dependencies", []) if isinstance(project, dict) else manifest.get("requirements", [])
        if isinstance(requirements, list):
            for requirement in requirements:
                if isinstance(requirement, str):
                    name = re.split(r"[<>=!~;\s\[]", requirement, maxsplit=1)[0]
                    paths = resolver.path(resolver.packages[name], path) if name in resolver.packages else []
                    record_reference(path, name, "DEPENDS_ON", "package_manifest", 1.0, paths, "resolved" if paths else "external")
        workspaces = manifest.get("workspaces", [])
        if isinstance(workspaces, dict):
            workspaces = workspaces.get("packages", [])
        if isinstance(workspaces, list):
            for pattern in workspaces:
                if isinstance(pattern, str):
                    base_pattern = posixpath.join(str(PurePosixPath(path).parent), pattern).removeprefix("./")
                    paths = sorted({str(PurePosixPath(other).parent) for other in evidence.manifests
                                    if other.endswith("/package.json") and fnmatch.fnmatchcase(str(PurePosixPath(other).parent), base_pattern)})
                    record_reference(path, pattern, "CONFIGURES", "package_manifest", 1.0, paths, "resolved" if paths else "missing")
    routes: list[Route] = []
    tests = {record.path for record in census if record.classification == "TEST"}
    system = next((module for module in modules if module.path == "."), None)
    for path, facts in sorted(evidence.files.items()):
        source = owner_of(path, modules)
        for route in facts.routes:
            if not source:
                continue
            implemented = route.handler_implemented
            if route.handler_reference:
                dependency, symbol = route.handler_reference.rsplit("#", 1)
                paths, _, _ = resolver.javascript(dependency, path)
                implemented = any(symbol in evidence.files[item].exports and symbol in evidence.files[item].implementations
                                  for item in paths if item in evidence.files)
            test_files = sorted(file for file in tests if file in evidence.files and any(
                route_matches(route.path, value) for value in evidence.files[file].route_literals))
            compiled = replace(route, handler_implemented=implemented, module_id=source.module_id, test_files=test_files)
            routes.append(compiled)
            if system:
                edge(system.module_id, source.module_id, "EXPOSES", "route_registration", 1.0, path, route.method + " " + route.path)
            for consumer_path, consumer_facts in sorted(evidence.files.items()):
                consumer = owner_of(consumer_path, modules)
                if consumer and any(route_matches(route.path, value) for value in consumer_facts.route_literals):
                    if consumer_path in tests:
                        edge(source.module_id, consumer.module_id, "TESTED_BY", "route_registration", 0.9, consumer_path, route.method + " " + route.path)
                    else:
                        edge(consumer.module_id, source.module_id, "CONSUMES", "route_registration", 0.9, consumer_path, route.method + " " + route.path)
        if backend_root(path) and "/pb_hooks/" in path:
            for name in facts.collection_references:
                paths = sorted({collection.file for collection in collections
                                if collection.name == name and collection.backend == backend_root(path)})
                record_reference(path, name, "CONSUMES", "route_registration", 1.0, paths,
                                 "resolved" if paths else "builtin" if name.startswith("_") else "missing", usage="collection")
    governance = next((module for module in modules if module.path == ".bits"), None)
    if governance:
        for module in modules:
            for file in module.files:
                for code in srs_codes(resolver.records[file].cgrf.get("SRS", "")):
                    edge(module.module_id, governance.module_id, "IMPLEMENTS", "cgrf_header", 1.0, file, code)
    return DependencyAnalysis(
        sorted(edges.values(), key=lambda item: (item.source, item.target, item.edge_type, item.evidence)),
        sorted(references, key=lambda item: (item.source_file, item.evidence, item.target, item.edge_type, item.line, item.usage)),
        sorted(routes, key=lambda item: (item.method, item.path, item.file, item.line)),
        sorted(collections, key=lambda item: (item.backend, item.name, item.file)), notes,
    )
