# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/reconcile.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/dependencies.py, apps/estate/modules.py, apps/estate/evidence.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/estate/dependencies.py; DEPENDS_ON apps/estate/modules.py; DEPENDS_ON apps/estate/evidence.py
# DAG Node:    none
# Intent:      Expose gaps between declared modules, imports, schemas and routes without changing their implementations.
# ───────────────────────────────────────────────────────────────

"""Reconcile declared governance and capabilities with observed estate evidence."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath
import re

from apps.estate.census import CensusRecord
from apps.estate.common import Diagnostic
from apps.estate.dependencies import DependencyAnalysis, EXECUTION_EDGES, Resolver, backend_root
from apps.estate.evidence import RepositoryEvidence
from apps.estate.metadata import enum_edges
from apps.estate.modules import EstateModule, owner_of
from apps.estate.syntax import normalize_route

COMPLETED_STATUSES = {"completed", "complete", "delivered", "done", "withdrawn"}


@dataclass(frozen=True)
class ReconciliationResult:
    """Summarize declared and observed semantic module coverage."""

    declared_modules: int
    observed_modules: int
    matched: int
    orphan_implementations: int
    declared_but_missing: int
    duplicate_implementations: int
    stale_references: int
    coverage_pct: float


@dataclass(frozen=True)
class Reconciliation:
    """Keep actionable details beside the coverage summary."""

    summary: ReconciliationResult
    orphan_module_ids: list[str]
    missing_module_paths: list[str]
    duplicate_capabilities: dict[str, list[str]]
    findings: list[Diagnostic]


def declaration_only(path: str) -> bool:
    """Distinguish SRS/dispatch/evidence paperwork from an implementation."""
    return path.startswith((".bits/srs/", ".bits/queue/", ".bits/out/"))


def declared_routes(census: list[CensusRecord]) -> list[tuple[str, str, str]]:
    """Read explicit CGRF route declarations without scanning prose examples."""
    result: set[tuple[str, str, str]] = set()
    for record in census:
        values = [record.cgrf.get("Route", ""), record.cgrf.get("Routes", "")]
        values.extend(target for kind, target in enum_edges(record.cgrf.get("EnumEdges", "")) if kind == "EXPOSES")
        for value in values:
            for method, path in re.findall(r"\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(/[^\s,;]+)", value):
                result.add((method, path, record.path))
    return sorted(result)


def _expected_root(path: str) -> str:
    parts = PurePosixPath(path).parts
    if len(parts) >= 2 and parts[0] in {"apps", "scripts", "tests", "services", "foundry"}:
        return "/".join(parts[:2])
    return parts[0] if parts else "."


def reconcile(census: list[CensusRecord], modules: list[EstateModule],
              dependencies: DependencyAnalysis, evidence: RepositoryEvidence) -> Reconciliation:
    """Compare declarations and observations without inventing missing owners."""
    by_path = {record.path: record for record in census}
    resolver = Resolver(census, modules, evidence)
    module_paths = {module.path for module in modules}
    declared: set[str] = set()
    missing: set[str] = set()
    findings: list[Diagnostic] = []
    for module in modules:
        if any(by_path[path].cgrf_present and not declaration_only(path) for path in module.files):
            declared.add(module.module_id)
    for entry in evidence.registry:
        paths = entry.paths + evidence.spec_paths.get(entry.spec, [])
        implementers = [
            module for module in modules if entry.code in module.srs_codes
            and any(not declaration_only(path) and entry.code in by_path[path].cgrf.get("SRS", "") for path in module.files)
        ]
        declared.update(module.module_id for module in implementers)
        for path in sorted(set(paths)):
            resolved = resolver.path(path, entry.spec, declared=True)
            if resolved:
                for item in resolved:
                    owner = owner_of(item, modules)
                    if owner:
                        declared.add(owner.module_id)
            else:
                expected = _expected_root(path)
                if expected not in module_paths:
                    missing.add(expected)
                else:
                    owner = owner_of(expected, modules)
                    if owner:
                        declared.add(owner.module_id)
                findings.append(Diagnostic("declared_path_missing", path,
                                           f"{entry.code} references an absent implementation path", [entry.spec] if entry.spec else [".bits/srs_registry.yml"]))
        if not implementers and not any(resolver.path(path, entry.spec, declared=True) for path in paths) and entry.status.lower() not in COMPLETED_STATUSES:
            findings.append(Diagnostic("srs_without_implementation", entry.code,
                                       "Registry entry has no observed implementation; its spec alone is not implementation evidence",
                                       [entry.spec] if entry.spec else [".bits/srs_registry.yml"]))
    for record in census:
        explicit = record.cgrf.get("ModulePath")
        if explicit and explicit not in module_paths:
            missing.add(explicit)
            findings.append(Diagnostic("declared_module_missing", explicit, "CGRF ModulePath has no observed module boundary", [record.path]))
    capability_owners: dict[str, set[str]] = {}
    for module in modules:
        if module.kind in {"TEST", "CONFIG"} or module.lifecycle in {"DEPRECATED", "GENERATED", "INSTALLED"}:
            continue
        for capability in module.capabilities:
            if capability.startswith(("capability:", "route:")):
                capability_owners.setdefault(capability, set()).add(module.module_id)
    duplicates = {capability: sorted(owners) for capability, owners in sorted(capability_owners.items()) if len(owners) > 1}
    for capability, owners in duplicates.items():
        findings.append(Diagnostic("duplicate_capability", capability, "Capability is implemented by multiple modules: " + ", ".join(owners), []))
    stale: set[tuple[str, str]] = set()
    for reference in dependencies.references:
        if reference.evidence == "cgrf_header" and reference.status == "missing":
            stale.add((reference.source_file, reference.target))
            findings.append(Diagnostic("stale_reference", reference.target,
                                       "Declared CGRF reference does not resolve inside the estate", [reference.source_file]))
        if reference.usage == "collection" and reference.status == "missing":
            findings.append(Diagnostic("hook_collection_missing", reference.target,
                                       "Hook uses a collection with no statically observed migration in this backend", [reference.source_file]))
    imported_pairs = {(edge.source, edge.target) for edge in dependencies.edges
                      if edge.evidence == "import" and edge.edge_type in EXECUTION_EDGES}
    declared_pairs = {(edge.source, edge.target) for edge in dependencies.edges
                      if edge.evidence == "cgrf_header" and edge.edge_type in EXECUTION_EDGES}
    for pair in sorted(imported_pairs - declared_pairs):
        files = sorted({file for edge in dependencies.edges if (edge.source, edge.target) == pair and edge.evidence == "import" for file in edge.evidence_files})
        findings.append(Diagnostic("undeclared_import", " -> ".join(pair), "Observed module import has no corresponding CGRF dependency", files))
    for pair in sorted(declared_pairs - imported_pairs):
        files = sorted({file for edge in dependencies.edges if (edge.source, edge.target) == pair and edge.evidence == "cgrf_header" for file in edge.evidence_files})
        findings.append(Diagnostic("declaration_without_import", " -> ".join(pair),
                                   "CGRF dependency is not witnessed as an import; it may be a data or governance relationship", files))
    for collection in dependencies.collections:
        used = any(reference.usage == "collection" and collection.file in reference.resolved_paths
                   and reference.target == collection.name for reference in dependencies.references)
        if not used:
            findings.append(Diagnostic("schema_without_hook", collection.name,
                                       "No custom hook reference was observed; the native collection API may be intentional", [collection.file]))
    for method, path, file in declared_routes(census):
        if not any(route.method == method and normalize_route(route.path) == normalize_route(path)
                   and (not backend_root(file) or backend_root(file) == backend_root(route.file))
                   for route in dependencies.routes):
            findings.append(Diagnostic("route_declared_missing", method + " " + path, "CGRF route declaration has no matching registered endpoint", [file]))
    for route in dependencies.routes:
        if not route.handler_implemented:
            findings.append(Diagnostic("route_handler_missing", route.method + " " + route.path, "Registered endpoint has no resolved handler implementation", [route.file]))
    orphans = sorted(module.module_id for module in modules if module.module_id not in declared)
    summary = ReconciliationResult(
        declared_modules=len(declared) + len(missing), observed_modules=len(modules), matched=len(modules) - len(orphans),
        orphan_implementations=len(orphans), declared_but_missing=len(missing),
        duplicate_implementations=sum(len(owners) - 1 for owners in duplicates.values()), stale_references=len(stale),
        coverage_pct=round(100 * (len(modules) - len(orphans)) / len(modules), 2) if modules else 0.0,
    )
    return Reconciliation(summary, orphans, sorted(missing), duplicates,
                          sorted(findings, key=lambda finding: (finding.code, finding.subject, finding.evidence_files)))
