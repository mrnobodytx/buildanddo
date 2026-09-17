# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/validate.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/reconcile.py, apps/estate/dependencies.py, apps/estate/modules.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/estate/reconcile.py; DEPENDS_ON apps/estate/dependencies.py; DEPENDS_ON apps/estate/modules.py
# DAG Node:    none
# Intent:      Report module, route, governance and dependency shape defects as evidence rather than execution failures.
# ───────────────────────────────────────────────────────────────

"""Validate SHACL-style structural constraints over the compiled estate."""

from __future__ import annotations

from dataclasses import dataclass

from apps.estate.census import CensusRecord
from apps.estate.dependencies import DependencyAnalysis, DependencyEdge, EXECUTION_EDGES, Resolver
from apps.estate.evidence import RepositoryEvidence
from apps.estate.metadata import srs_codes
from apps.estate.modules import EstateModule, LIFECYCLES, MODULE_KINDS, PLANES
from apps.estate.reconcile import COMPLETED_STATUSES
from apps.estate.syntax import normalize_route

SHAPES = ("ModuleShape", "RouteShape", "GovernanceShape", "DependencyShape")


@dataclass(frozen=True)
class Violation:
    """Describe a structural defect with inspectable evidence leaves."""

    shape: str
    subject: str
    code: str
    message: str
    evidence_files: list[str]


def dependency_cycles(modules: list[EstateModule], edges: list[DependencyEdge]) -> list[list[str]]:
    """Find deterministic strongly connected components without recursion.

    Documentation, ownership and test-evidence edges are not execution edges.
    Both observed and explicitly declared execution dependencies participate.
    """
    graph: dict[str, set[str]] = {module.module_id: set() for module in modules}
    reverse: dict[str, set[str]] = {node: set() for node in graph}
    for edge in edges:
        if edge.edge_type in EXECUTION_EDGES and edge.source in graph and edge.target in graph:
            graph[edge.source].add(edge.target)
            reverse[edge.target].add(edge.source)
    visited: set[str] = set()
    order: list[str] = []
    for node in sorted(graph):
        stack = [(node, False)]
        while stack:
            current, expanded = stack.pop()
            if expanded:
                order.append(current)
                continue
            if current in visited:
                continue
            visited.add(current)
            stack.append((current, True))
            stack.extend((target, False) for target in sorted(graph[current], reverse=True) if target not in visited)
    assigned: set[str] = set()
    components: list[list[str]] = []
    for node in reversed(order):
        if node in assigned:
            continue
        component: set[str] = set()
        stack_nodes = [node]
        while stack_nodes:
            current = stack_nodes.pop()
            if current in assigned:
                continue
            assigned.add(current)
            component.add(current)
            stack_nodes.extend(sorted(reverse[current] - assigned, reverse=True))
        if len(component) > 1 or node in graph[node]:
            components.append(sorted(component))
    return sorted(components)


def validate(census: list[CensusRecord], modules: list[EstateModule], dependencies: DependencyAnalysis,
             evidence: RepositoryEvidence) -> list[Violation]:
    """Report structural defects without granting application verification."""
    violations: list[Violation] = []
    resolver = Resolver(census, modules, evidence)
    paths = {record.path for record in census}
    ids: set[str] = set()

    def add(shape: str, subject: str, code: str, message: str, files: list[str]) -> None:
        violations.append(Violation(shape, subject, code, message, sorted(set(files))))

    for module in modules:
        subject = module.module_id or module.path
        if not module.module_id:
            add("ModuleShape", subject, "module_id_missing", "Module needs an identity", module.files)
        elif module.module_id in ids:
            add("ModuleShape", subject, "module_id_duplicate", "Distinct boundaries share a module identity", [module.path])
        ids.add(module.module_id)
        if not module.files:
            add("ModuleShape", subject, "module_files_missing", "Module has no file evidence", [module.path])
        if module.lifecycle not in LIFECYCLES:
            add("ModuleShape", subject, "module_lifecycle_invalid", "Module needs a valid lifecycle state", module.files)
        if module.kind not in MODULE_KINDS or module.plane not in PLANES:
            add("ModuleShape", subject, "module_role_invalid", "Module kind and plane must use the estate vocabulary", module.files)
        if not module.capabilities and not module.utility_role:
            add("ModuleShape", subject, "module_capability_missing", "Module needs a capability or declared utility role", module.files)
        if not (module.provenance.get("cgrf_header") or module.provenance.get("package_manifest")):
            add("ModuleShape", subject, "module_provenance_missing", "Module has no CGRF or manifest provenance", module.files)
    seen_routes: set[tuple[str, str, str]] = set()
    for route in dependencies.routes:
        subject = route.method + " " + route.path
        key = (route.module_id, route.method, normalize_route(route.path))
        if key in seen_routes:
            add("RouteShape", subject, "route_duplicate", "Endpoint is registered more than once in its backend", [route.file])
        seen_routes.add(key)
        if not route.handler_implemented:
            add("RouteShape", subject, "route_handler_missing", "Route needs a resolved handler implementation", [route.file])
        if route.auth not in {"required", "public"}:
            add("RouteShape", subject, "route_auth_undeclared", "Route needs an explicit native-auth requirement or public declaration", [route.file])
        if not route.test_files:
            add("RouteShape", subject, "route_test_missing", "No test file explicitly references this endpoint", [route.file])
    registered = {entry.code for entry in evidence.registry}
    seen_codes: set[str] = set()
    for entry in evidence.registry:
        files = [entry.spec] if entry.spec else [".bits/srs_registry.yml"]
        if entry.code in seen_codes:
            add("GovernanceShape", entry.code, "srs_duplicate", "SRS code occurs more than once in the registry", files)
        seen_codes.add(entry.code)
        completed = entry.status.lower() in COMPLETED_STATUSES
        dispatched = any(entry.code in codes and (not entry.dispatch or path.endswith("/" + entry.dispatch + ".md"))
                         for path, codes in evidence.dispatches.items())
        if not completed and not dispatched:
            add("GovernanceShape", entry.code, "srs_dispatch_missing", "Active SRS has no matching dispatch queue file", files)
        if entry.spec and entry.spec not in paths or not entry.spec and not completed:
            add("GovernanceShape", entry.code, "srs_spec_missing", "SRS specification is absent", files)
        for path in sorted(set(entry.paths + evidence.spec_paths.get(entry.spec, []))):
            if not resolver.path(path, entry.spec, declared=True):
                add("GovernanceShape", entry.code, "srs_path_missing", "Referenced implementation path does not exist: " + path, files)
    for record in census:
        for code in srs_codes(record.cgrf.get("SRS", "")):
            if code not in registered:
                add("GovernanceShape", code, "srs_unregistered", "CGRF references an unregistered SRS", [record.path])
        if record.path.startswith(".bits/srs/") and record.extension == ".md":
            code = record.path.rsplit("/", 1)[-1][:-3]
            if code.startswith("SRS-") and code not in registered:
                add("GovernanceShape", code, "srs_unregistered", "Specification is absent from the registry", [record.path])
    for note in evidence.notes:
        if note.code in {"missing_registry", "invalid_registry"}:
            add("GovernanceShape", note.subject, note.code, note.message, note.evidence_files)
    for reference in dependencies.references:
        if reference.evidence == "cgrf_header" and reference.edge_type in EXECUTION_EDGES and not reference.resolved_modules:
            add("DependencyShape", reference.target, "dependency_unresolved", "Declared dependency has no resolved estate module", [reference.source_file])
    for edge in dependencies.edges:
        if edge.source not in ids or edge.target not in ids:
            add("DependencyShape", edge.source + " -> " + edge.target, "edge_endpoint_missing", "Dependency endpoint is absent from the estate", edge.evidence_files)
    for component in dependency_cycles(modules, dependencies.edges):
        files = sorted({file for edge in dependencies.edges if edge.source in component and edge.target in component
                        and edge.edge_type in EXECUTION_EDGES for file in edge.evidence_files})
        add("DependencyShape", ", ".join(component), "dependency_cycle", "Execution dependencies form a module-level cycle", files)
    # Several declarations can witness the same defect. Retain one defect with all receipts.
    grouped: dict[tuple[str, str, str], Violation] = {}
    for violation in violations:
        key = (violation.shape, violation.subject, violation.code)
        previous = grouped.get(key)
        grouped[key] = Violation(violation.shape, violation.subject, violation.code, violation.message,
                                 sorted(set(violation.evidence_files + (previous.evidence_files if previous else []))))
    return sorted(grouped.values(), key=lambda item: (item.shape, item.subject, item.code))
