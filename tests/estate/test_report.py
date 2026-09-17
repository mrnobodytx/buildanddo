# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/test_report.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/report.py, tests/estate/support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/estate/report.py; DEPENDS_ON tests/estate/support.py
# DAG Node:    none
# Intent:      Keep human estate projections consistent with sealed counters, module evidence and exact deltas.
# ───────────────────────────────────────────────────────────────

"""Exercise human-readable projections of cached evidence."""

from __future__ import annotations

from dataclasses import replace

from apps.estate.common import EstateError
from apps.estate.report import render_delta, render_module, render_orphans, render_report, render_violations, select_module
from apps.estate.seal import compare_snapshots, compile_estate, make_document
from tests.estate.support import RepositoryTest


class ReportTests(RepositoryTest):
    def setUp(self) -> None:
        super().setUp()
        self.repository()
        self.snapshot = compile_estate(self.root)

    def test_report_counters_match_snapshot_and_has_all_sections(self) -> None:
        document = make_document(self.snapshot)
        report = render_report(document)
        self.assertEqual(report, render_report(document))
        for heading in ("BUILDANDDO ESTATE INTELLIGENCE", "CENSUS", "MODULES", "DEPENDENCIES", "RECONCILIATION", "VALIDATION", "DELTA"):
            self.assertIn(heading, report)
        self.assertIn(f"Seal: {document.seal.seal_id}", report)
        self.assertIn(f"Total module edges:  {len(self.snapshot.edges)}", report)
        self.assertIn("apps/pocketbase", report)
        self.assertIn("1 routes, 1 collections", report)
        self.assertIn("(first run)", report)

    def test_module_detail_has_owned_files_and_edge_evidence(self) -> None:
        report = render_module(self.snapshot, "decision")
        self.assertIn("buildanddo.decision", report)
        self.assertIn("apps/decision/runtime.py", report)
        self.assertIn("SRS-FIXTURE-001", report)
        self.assertIn("buildanddo.research", report)
        self.assertIn("cgrf_header", report)
        self.assertEqual(select_module(self.snapshot, "apps/decision"), select_module(self.snapshot, "buildanddo.decision"))

    def test_unknown_or_ambiguous_module_query_is_explicit(self) -> None:
        with self.assertRaisesRegex(EstateError, "not found"):
            select_module(self.snapshot, "absent")
        web = select_module(self.snapshot, "web")
        duplicate = replace(web, module_id="buildanddo.other.web", path="apps/other/web")
        snapshot = replace(self.snapshot, modules=self.snapshot.modules + [duplicate])
        with self.assertRaisesRegex(EstateError, "ambiguous"):
            select_module(snapshot, "web")
        self.assertEqual(select_module(snapshot, "buildanddo.web"), web)

    def test_orphans_and_defects_are_actionable_and_empty_views_are_explicit(self) -> None:
        self.assertIn("buildanddo.tests.api", render_orphans(self.snapshot))
        self.assertIn("ModuleShape", render_violations(self.snapshot))
        empty = replace(self.snapshot, reconciliation=replace(self.snapshot.reconciliation, orphan_module_ids=[]), violations=[])
        self.assertEqual(render_orphans(empty), "No unreconciled modules.")
        self.assertEqual(render_violations(empty), "No structural defects.")

    def test_delta_lists_changes_instead_of_only_totals(self) -> None:
        self.write("apps/new/service.py", "def run():\n    return 1\n")
        updated = compile_estate(self.root)
        delta = compare_snapshots(self.snapshot, updated)
        text = render_delta(delta)
        self.assertIn("buildanddo.new", text)
        self.assertIn("apps/new/service.py", text)
        self.assertIn("Metadata changed:", text)
        document = make_document(updated, make_document(self.snapshot))
        self.assertIn(delta.from_seal, render_report(document))

    def test_empty_report_has_zero_counts(self) -> None:
        empty = replace(self.snapshot, modules=[], census=[], edges=[], routes=[], collections=[], violations=[], analysis_notes=[])
        text = render_report(make_document(empty))
        self.assertIn("Files inventoried:    0", text)
        self.assertIn("ModuleShape violations: 0", text)
