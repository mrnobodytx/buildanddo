# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/modules.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/census.py, apps/estate/evidence.py, apps/estate/metadata.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/estate/census.py; DEPENDS_ON apps/estate/evidence.py; DEPENDS_ON apps/estate/metadata.py
# DAG Node:    none
# Intent:      Promote evidenced semantic boundaries into estate modules while retaining files as owned evidence leaves.
# ───────────────────────────────────────────────────────────────

"""Identify module ownership from strong boundaries and existing declarations."""

from __future__ import annotations

from dataclasses import dataclass, field
import fnmatch
from pathlib import PurePosixPath

from apps.estate.census import CensusRecord, is_manifest
from apps.estate.evidence import RepositoryEvidence
from apps.estate.metadata import split_references, srs_codes

MODULE_KINDS = {"SYSTEM", "MODULE", "SERVICE", "AGENT", "CAPABILITY", "CLI", "API", "ADAPTER", "CONFIG", "TEST"}
PLANES = {"PRODUCT", "CONTROL", "OBSERVABILITY", "EVIDENCE", "KNOWLEDGE", "DEPLOYMENT", "DEVELOPMENT", "CONTENT"}
LIFECYCLES = {"SOURCE", "INSTALLED", "RUNTIME", "GENERATED", "DEPRECATED", "CANDIDATE"}


@dataclass(frozen=True)
class EstateModule:
    """Describe one semantic node with file evidence beneath it."""

    module_id: str
    path: str
    kind: str
    plane: str
    lifecycle: str
    files: list[str]
    capabilities: list[str]
    srs_codes: list[str]
    dispatch_ids: list[str]
    provenance: dict[str, list[str]] = field(default_factory=dict)
    utility_role: str | None = None
    description: str = ""


def contains(root: str, path: str) -> bool:
    """Compare path components without allowing sibling-prefix collisions."""
    return root == "." or path == root or path.startswith(root + "/")


def owner_of(path: str, modules: list[EstateModule]) -> EstateModule | None:
    """Return the most specific existing module boundary for a path."""
    candidates = [module for module in modules if contains(module.path, path)]
    if not candidates:
        return None
    return max(candidates, key=lambda module: len(PurePosixPath(module.path).parts))


def default_module_id(path: str) -> str:
    """Derive a stable readable module ID from its repository-relative boundary."""
    if path == ".":
        return "buildanddo"
    if path == ".bits":
        return "buildanddo.governance"
    parts = list(PurePosixPath(path).parts)
    if parts[0] == "apps":
        parts = parts[1:]
    return "buildanddo." + ".".join(part.lstrip(".") for part in parts)


def _defaults(path: str, records: list[CensusRecord]) -> tuple[str, str, str, str | None]:
    parts = set(PurePosixPath(path).parts)
    categories = {record.classification for record in records}
    lifecycle = "SOURCE"
    if categories == {"VENDOR"}:
        lifecycle = "INSTALLED"
    elif categories == {"GENERATED"}:
        lifecycle = "GENERATED"
    elif "archive" in parts or "deprecated" in parts or categories == {"ARCHIVE"}:
        lifecycle = "DEPRECATED"
    elif categories == {"STATE"}:
        lifecycle = "RUNTIME"
    if path == ".":
        return "SYSTEM", "CONTROL", lifecycle, "repository coordination"
    if path.startswith("tests/") or path == "tests":
        return "TEST", "DEVELOPMENT", lifecycle, "test suite"
    if path == "scripts" or path.startswith("scripts/"):
        plane = "DEPLOYMENT" if parts & {"ci", "deploy"} else "PRODUCT"
        return "CLI", plane, lifecycle, "command-line utilities"
    if path in {".bits", ".github", ".buildanddo"}:
        return "CONFIG", "CONTROL" if path != ".github" else "DEPLOYMENT", lifecycle, "governance configuration"
    if path == "docs" or "docs" in parts:
        return "MODULE", "CONTENT", lifecycle, "documentation"
    if any("evidence" in part for part in parts):
        return "SERVICE", "EVIDENCE", lifecycle, None
    if parts & {"estate", "decision", "control"}:
        return "SERVICE", "CONTROL", lifecycle, None
    if parts & {"observability", "telemetry", "metrics"}:
        return "SERVICE", "OBSERVABILITY", lifecycle, None
    if parts & {"knowledge", "memory"}:
        return "MODULE", "KNOWLEDGE", lifecycle, None
    if parts & {"agent", "agents"}:
        return "AGENT", "CONTROL", lifecycle, None
    return "SERVICE" if path.startswith("services/") or "pocketbase" in parts else "MODULE", "PRODUCT", lifecycle, None


def identify_modules(census: list[CensusRecord], evidence: RepositoryEvidence) -> list[EstateModule]:
    """Select semantic roots and assign every inventoried file to one owner.

    A nested CGRF service/widget file enriches an established app boundary.
    Only an explicit ModulePath or a separate package manifest splits that app.
    """
    by_path = {record.path: record for record in census}
    roots: set[str] = set()
    explicit_roots: set[str] = set()
    for record in census:
        if record.analysis_status in {"excluded", "symlink", "sensitive_metadata", "special_file"}:
            continue
        if record.kind == "directory" and record.candidate_module:
            roots.add(record.path)
        if record.kind == "file" and is_manifest(record.path):
            roots.add(str(PurePosixPath(record.path).parent))
        explicit = record.cgrf.get("ModulePath")
        if explicit and explicit in by_path and by_path[explicit].kind == "directory":
            roots.add(explicit)
            explicit_roots.add(explicit)
        elif record.kind == "file" and (record.cgrf.get("ModuleID") or record.cgrf.get("Module")):
            parent = str(PurePosixPath(record.path).parent)
            roots.add(parent)
            explicit_roots.add(parent)
    for entry in evidence.registry:
        for path in entry.paths:
            if path in by_path and by_path[path].kind == "directory" and by_path[path].analysis_status == "analyzed":
                roots.add(path)
                explicit_roots.add(path)
    # Hooks and migrations belong to their backend unless they have their own manifest.
    manifest_roots = {str(PurePosixPath(record.path).parent) for record in census if record.kind == "file" and is_manifest(record.path)}
    roots = {root for root in roots if PurePosixPath(root).name not in {"pb_hooks", "pb_migrations"} or root in manifest_roots | explicit_roots}
    for record in census:
        if not record.candidate_module or record.kind != "file" or record.classification in {"GOVERNANCE", "VENDOR", "GENERATED"}:
            continue
        parent = str(PurePosixPath(record.path).parent)
        if not any(contains(root, parent) and root != "." for root in roots):
            roots.add(parent)
    # Group otherwise unclaimed top-level documentation/configuration/tooling.
    for record in census:
        if record.kind != "file" or record.analysis_status == "excluded":
            continue
        parts = PurePosixPath(record.path).parts
        if not any(contains(root, record.path) and root != "." for root in roots):
            roots.add(parts[0] if len(parts) > 1 else ".")
    ordered_roots = sorted(roots, key=lambda path: (-len(PurePosixPath(path).parts), path))
    owned: dict[str, list[CensusRecord]] = {root: [] for root in roots}
    for record in census:
        if record.kind == "file":
            owner = next((root for root in ordered_roots if contains(root, record.path)), None)
            if owner is not None:
                owned[owner].append(record)
    result: list[EstateModule] = []
    for root in sorted(roots):
        records = sorted(owned[root], key=lambda record: record.path)
        kind, plane, lifecycle, utility = _defaults(root, records)
        # Root-level CGRF declarations have priority over nested incidental headers.
        headers = sorted([record for record in records if record.cgrf_present],
                         key=lambda record: (len(PurePosixPath(record.path).parts), record.path))
        metadata: dict[str, str] = {}
        for record in headers:
            for key, value in record.cgrf.items():
                metadata.setdefault(key, value)
        capabilities: set[str] = set()
        codes: set[str] = set()
        dispatches: set[str] = set()
        provenance: dict[str, list[str]] = {}
        for record in records:
            if record.cgrf_present:
                provenance.setdefault("cgrf_header", []).append(record.path)
                codes.update(srs_codes(record.cgrf.get("SRS", "")))
                dispatches.update(split_references(record.cgrf.get("Dispatch", "")))
                capabilities.update("capability:" + capability for capability in split_references(record.cgrf.get("Capabilities", "")))
                if record.cgrf.get("Intent") and record.cgrf.get("EnumType") in {"Service", "Route", "Adapter", "Widget"}:
                    capabilities.add("intent:" + record.cgrf["Intent"])
            if is_manifest(record.path):
                provenance.setdefault("package_manifest", []).append(record.path)
            facts = evidence.files.get(record.path)
            if facts:
                relative = str(PurePosixPath(record.path).relative_to(root)) if root != "." else record.path
                symbol_scope = relative.rsplit(".", 1)[0].replace("/", ".")
                capabilities.update(f"export:{symbol_scope}.{name}" for name in facts.exports)
                capabilities.update(f"route:{route.method} {route.path}" for route in facts.routes)
                capabilities.update("collection:" + name for name in facts.collections)
        for entry in evidence.registry:
            declarations = entry.paths + evidence.spec_paths.get(entry.spec, [])
            if any(contains(root, path) or path == root or fnmatch.fnmatchcase(root, path.rstrip("/") + "/*") for path in declarations) and declarations:
                codes.add(entry.code)
                provenance.setdefault("srs_registry", []).append(entry.spec or ".bits/srs_registry.yml")
        if not provenance:
            provenance["directory"] = [root]
        # Explicit fields are retained even when invalid; shapes report the defect.
        result.append(EstateModule(
            metadata.get("ModuleID", metadata.get("Module", default_module_id(root))),
            root, metadata.get("Kind", kind), metadata.get("Plane", plane),
            metadata.get("Lifecycle", lifecycle),
            sorted(record.path for record in records), sorted(capabilities), sorted(codes), sorted(dispatches),
            {key: sorted(set(paths)) for key, paths in sorted(provenance.items())},
            metadata.get("UtilityRole", utility), metadata.get("Intent", ""),
        ))
    return sorted(result, key=lambda module: (module.module_id, module.path))
