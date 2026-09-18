# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/test_reconcile.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/reconcile.py, tests/estate/support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/estate/reconcile.py; DEPENDS_ON tests/estate/support.py
# DAG Node:    none
# Intent:      Expose orphan modules, stale declarations, duplicate capabilities and schema or endpoint gaps with exact evidence.
# ───────────────────────────────────────────────────────────────

"""Exercise declaration versus observation reconciliation."""

from __future__ import annotations

from apps.estate.census import scan_repository
from apps.estate.dependencies import extract_dependencies
from apps.estate.evidence import collect_evidence
from apps.estate.modules import identify_modules
from apps.estate.reconcile import Reconciliation, reconcile
from tests.estate.support import RepositoryTest, cgrf


class ReconciliationTests(RepositoryTest):
    def reconciled(self) -> Reconciliation:
        census = scan_repository(self.root)
        evidence = collect_evidence(self.root, census)
        modules = identify_modules(census, evidence)
        return reconcile(census, modules, extract_dependencies(census, modules, evidence), evidence)

    def test_orphan_without_cgrf_or_srs_is_unreconciled(self) -> None:
        self.repository()
        self.write("apps/orphan/worker.py", "def execute():\n    return 1\n")
        result = self.reconciled()
        self.assertIn("buildanddo.orphan", result.orphan_module_ids)
        self.assertNotIn("buildanddo.decision", result.orphan_module_ids)
        self.assertEqual(result.summary.matched + result.summary.orphan_implementations, result.summary.observed_modules)
        self.assertEqual(result.summary.coverage_pct, round(100 * result.summary.matched / result.summary.observed_modules, 2))

    def test_stale_cgrf_depends_preserves_broken_target(self) -> None:
        self.repository()
        self.write("apps/decision/broken.py", cgrf("apps/decision/broken.py", depends="apps/research/deleted.py",
                   extra="# EnumEdges: DEPENDS_ON apps/research/deleted.py\n"))
        result = self.reconciled()
        self.assertEqual(result.summary.stale_references, 1)
        finding = next(finding for finding in result.findings if finding.code == "stale_reference")
        self.assertEqual(finding.subject, "apps/research/deleted.py")
        self.assertEqual(finding.evidence_files, ["apps/decision/broken.py"])

    def test_missing_modules_differ_from_missing_files_in_existing_modules(self) -> None:
        self.repository()
        self.write(".bits/srs_registry.yml", "srs:\n  - code: SRS-FIXTURE-001\n    status: ready\n"
                   "    paths: apps/absent/worker.py, apps/absent/another.py, apps/web/missing.js\n"
                   "    spec: .bits/srs/SRS-FIXTURE-001.md\n")
        result = self.reconciled()
        self.assertEqual(result.missing_module_paths, ["apps/absent"])
        self.assertEqual(result.summary.declared_but_missing, 1)
        self.assertEqual(len([finding for finding in result.findings if finding.code == "declared_path_missing"]), 3)

    def test_spec_is_not_its_own_implementation(self) -> None:
        self.write(".bits/srs_registry.yml", "srs:\n  - code: SRS-FIXTURE-001\n    status: proposed\n    spec: .bits/srs/SRS-FIXTURE-001.md\n")
        self.write(".bits/srs/SRS-FIXTURE-001.md", cgrf(".bits/srs/SRS-FIXTURE-001.md", role="Doc"))
        self.assertTrue(any(finding.code == "srs_without_implementation" for finding in self.reconciled().findings))

    def test_duplicate_semantic_capabilities_do_not_count_common_export_names(self) -> None:
        for name in ("a", "b"):
            self.write(f"apps/{name}/worker.py", cgrf(f"apps/{name}/worker.py", extra="# Capabilities: classify_issue\n")
                       + "def main():\n    return 1\n")
        result = self.reconciled()
        self.assertEqual(result.summary.duplicate_implementations, 1)
        self.assertEqual(result.duplicate_capabilities["capability:classify_issue"], ["buildanddo.a", "buildanddo.b"])
        self.assertFalse(any("main" in capability for capability in result.duplicate_capabilities))

    def test_cgrf_import_drift_is_distinct_from_broken_paths(self) -> None:
        self.repository()
        self.write("apps/research/other.py", "from apps.web import something\n")
        self.write("apps/web/src/declared.js", cgrf("apps/web/src/declared.js", depends="apps/decision").replace("#", "//"))
        result = self.reconciled()
        self.assertTrue(any(finding.code == "undeclared_import" and "buildanddo.research -> buildanddo.web" in finding.subject for finding in result.findings))
        self.assertTrue(any(finding.code == "declaration_without_import" and "buildanddo.web -> buildanddo.decision" in finding.subject for finding in result.findings))
        self.assertEqual(result.summary.stale_references, 0)

    def test_hook_schema_and_declared_route_reconciliation(self) -> None:
        self.repository()
        self.write("apps/pocketbase/pb_hooks/missing.pb.js",
                   cgrf("apps/pocketbase/pb_hooks/missing.pb.js", role="Route", extra="# Routes: GET /api/absent\n").replace("#", "//")
                   + "onRecordCreateRequest(e => e.next(), 'unknown_collection');\n"
                   + "routerAdd('GET','/api/no-handler', missingHandler);")
        self.write("apps/pocketbase/pb_migrations/002_unused.js", "migrate(app => { app.save(new Collection({name:'unused',type:'base'})); }, app => {});")
        result = self.reconciled()
        codes = {finding.code for finding in result.findings}
        self.assertTrue({"hook_collection_missing", "schema_without_hook", "route_declared_missing", "route_handler_missing"} <= codes)
        self.assertTrue(any(finding.subject == "unused" for finding in result.findings if finding.code == "schema_without_hook"))

    def test_empty_estate_and_explicit_missing_module(self) -> None:
        result = self.reconciled()
        self.assertEqual(result.summary.observed_modules, 0)
        self.assertEqual(result.summary.coverage_pct, 0.0)
        self.write("docs/declaration.md", cgrf("docs/declaration.md", role="Doc", extra="# ModulePath: apps/absent\n"))
        self.assertIn("apps/absent", self.reconciled().missing_module_paths)
