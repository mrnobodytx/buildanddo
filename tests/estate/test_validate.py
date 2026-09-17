# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/test_validate.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/validate.py, tests/estate/support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/estate/validate.py; DEPENDS_ON tests/estate/support.py
# DAG Node:    none
# Intent:      Verify shape defects and cycle detection independently of runtime success or test pass claims.
# ───────────────────────────────────────────────────────────────

"""Exercise module, route, governance and dependency shape constraints."""

from __future__ import annotations

from dataclasses import replace

from apps.estate.census import scan_repository
from apps.estate.dependencies import DependencyAnalysis, DependencyEdge, extract_dependencies
from apps.estate.evidence import collect_evidence
from apps.estate.modules import EstateModule, identify_modules
from apps.estate.validate import Violation, dependency_cycles, validate
from tests.estate.support import RepositoryTest, cgrf


def module(name: str) -> EstateModule:
    """Build a module node for structural graph tests."""
    return EstateModule(name, "apps/" + name, "SERVICE", "PRODUCT", "SOURCE",
                        [f"apps/{name}/worker.py"], ["capability:work"], [], [],
                        {"cgrf_header": [f"apps/{name}/worker.py"]})


class ValidationTests(RepositoryTest):
    def validated(self) -> list[Violation]:
        census = scan_repository(self.root)
        evidence = collect_evidence(self.root, census)
        modules = identify_modules(census, evidence)
        dependencies = extract_dependencies(census, modules, evidence)
        return validate(census, modules, dependencies, evidence)

    def test_reports_missing_module_fields_as_structural_defects(self) -> None:
        empty = EstateModule("", "apps/empty", "INVALID", "INVALID", "", [], [], [], [])
        evidence = collect_evidence(self.root, [])
        defects = validate([], [empty], DependencyAnalysis([], [], [], [], []), evidence)
        codes = {defect.code for defect in defects if defect.shape == "ModuleShape"}
        self.assertEqual(codes, {"module_id_missing", "module_files_missing", "module_lifecycle_invalid",
                                 "module_role_invalid", "module_capability_missing", "module_provenance_missing"})

    def test_utility_module_and_manifest_satisfy_minimum_role(self) -> None:
        self.write("apps/utility/package.json", '{"name":"utility"}')
        self.write("apps/utility/README.md", cgrf("apps/utility/README.md", role="Doc", extra="# UtilityRole: package coordination\n"))
        self.assertFalse(any(defect.shape == "ModuleShape" and defect.subject == "buildanddo.utility" for defect in self.validated()))

    def test_route_requires_local_handler_declared_auth_and_test_reference(self) -> None:
        self.write("apps/pocketbase/pb_hooks/routes.pb.js", "routerAdd('GET','/api/unproved', absent);\n")
        defects = [defect for defect in self.validated() if defect.shape == "RouteShape"]
        self.assertEqual({defect.code for defect in defects}, {"route_handler_missing", "route_auth_undeclared", "route_test_missing"})
        self.repository()
        self.assertFalse(any(defect.shape == "RouteShape" and defect.subject == "GET /api/research/{id}" for defect in self.validated()))

    def test_public_declaration_is_explicit_and_does_not_imply_auth(self) -> None:
        self.write("apps/pocketbase/pb_hooks/public.pb.js",
                   cgrf("apps/pocketbase/pb_hooks/public.pb.js", role="Route", extra="# Auth: public\n").replace("#", "//")
                   + "routerAdd('GET','/api/public', e => e.json(200, {}));")
        self.write("tests/public.test.js", "const endpoint = '/api/public';")
        self.assertFalse(any(defect.shape == "RouteShape" for defect in self.validated()))

    def test_srs_requires_matching_dispatch_or_terminal_status(self) -> None:
        self.repository()
        (self.root / ".bits/queue/VCC-FIXTURE-001.md").unlink()
        self.assertTrue(any(defect.code == "srs_dispatch_missing" for defect in self.validated()))
        self.write(".bits/srs_registry.yml", "srs:\n  - code: SRS-FIXTURE-001\n    status: delivered\n    spec: ''\n")
        self.assertFalse(any(defect.code in {"srs_dispatch_missing", "srs_spec_missing"} for defect in self.validated()))

    def test_governance_paths_registration_and_duplicate_codes(self) -> None:
        self.repository()
        self.write(".bits/srs_registry.yml",
                   "srs:\n  - code: SRS-FIXTURE-001\n    status: ready\n    spec: missing.md\n    paths: apps/missing\n"
                   "  - code: SRS-FIXTURE-001\n    status: ready\n")
        self.write("apps/rogue/service.py", cgrf("apps/rogue/service.py", srs="SRS-UNREGISTERED-001"))
        codes = {defect.code for defect in self.validated()}
        self.assertTrue({"srs_path_missing", "srs_spec_missing", "srs_unregistered", "srs_duplicate"} <= codes)

    def test_unresolved_declared_dependency_has_no_fake_endpoint(self) -> None:
        self.write("apps/a/service.py", cgrf("apps/a/service.py", depends="apps/absent/service.py"))
        defects = self.validated()
        defect = next(defect for defect in defects if defect.code == "dependency_unresolved")
        self.assertEqual(defect.shape, "DependencyShape")
        self.assertEqual(defect.subject, "apps/absent/service.py")

    def test_circular_dependencies_ignore_evidence_only_edges(self) -> None:
        nodes = [module(name) for name in ("a", "b", "c", "d")]
        edges = [DependencyEdge("a", "b", "DEPENDS_ON", "import", 1.0),
                 DependencyEdge("b", "a", "CONSUMES", "cgrf_header", 1.0),
                 DependencyEdge("a", "c", "TESTED_BY", "import", 1.0),
                 DependencyEdge("c", "a", "DEPENDS_ON", "import", 1.0),
                 DependencyEdge("d", "d", "DEPENDS_ON", "import", 1.0)]
        self.assertEqual(dependency_cycles(nodes, edges), [["a", "b"], ["d"]])
        self.assertEqual(dependency_cycles(nodes, list(reversed(edges))), [["a", "b"], ["d"]])
        evidence = collect_evidence(self.root, [])
        defects = validate([], nodes, DependencyAnalysis(edges, [], [], [], []), evidence)
        self.assertEqual(len([defect for defect in defects if defect.code == "dependency_cycle"]), 2)

    def test_cycle_detection_handles_deep_graph_without_recursion(self) -> None:
        nodes = [module(str(index)) for index in range(1200)]
        edges = [DependencyEdge(str(index), str(index + 1), "DEPENDS_ON", "import", 1.0) for index in range(1199)]
        self.assertEqual(dependency_cycles(nodes, edges), [])
        edges.append(DependencyEdge("1199", "0", "DEPENDS_ON", "import", 1.0))
        self.assertEqual(len(dependency_cycles(nodes, edges)[0]), 1200)

    def test_duplicate_ids_routes_and_missing_edge_endpoints(self) -> None:
        self.repository()
        self.write("apps/pocketbase/pb_hooks/duplicate.pb.js",
                   "routerAdd('GET', '/api/research/{id}', e => e.json(200, {}));")
        self.assertTrue(any(defect.code == "route_duplicate" for defect in self.validated()))
        evidence = collect_evidence(self.root, [])
        nodes = [module("a"), replace(module("a"), path="apps/other")]
        edges = [DependencyEdge("a", "missing", "DEPENDS_ON", "import", 1.0)]
        codes = {defect.code for defect in validate([], nodes, DependencyAnalysis(edges, [], [], [], []), evidence)}
        self.assertTrue({"module_id_duplicate", "edge_endpoint_missing"} <= codes)
