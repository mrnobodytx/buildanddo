# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/test_modules.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/modules.py, apps/estate/evidence.py, tests/estate/support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/estate/modules.py; DEPENDS_ON apps/estate/evidence.py; DEPENDS_ON tests/estate/support.py
# DAG Node:    none
# Intent:      Verify semantic ownership, metadata authority and discovery of the existing application boundaries.
# ───────────────────────────────────────────────────────────────

"""Exercise semantic module discovery and file ownership."""

from __future__ import annotations

from pathlib import Path

from apps.estate.census import scan_repository
from apps.estate.evidence import collect_evidence
from apps.estate.modules import EstateModule, identify_modules, owner_of
from tests.estate.support import RepositoryTest, cgrf


class ModuleTests(RepositoryTest):
    def modules(self) -> list[EstateModule]:
        census = scan_repository(self.root)
        return identify_modules(census, collect_evidence(self.root, census))

    def test_discovers_principal_apps_and_keeps_files_as_evidence(self) -> None:
        self.repository()
        modules = self.modules()
        by_id = {module.module_id: module for module in modules}
        for name in ("web", "decision", "research", "pocketbase"):
            self.assertEqual(by_id[f"buildanddo.{name}"].path, f"apps/{name}")
        self.assertEqual(by_id["buildanddo.decision"].plane, "CONTROL")
        self.assertEqual(by_id["buildanddo.web"].plane, "PRODUCT")
        self.assertEqual(by_id["buildanddo.scripts.ci"].plane, "DEPLOYMENT")
        self.assertEqual(by_id["buildanddo.tests.api"].kind, "TEST")
        self.assertEqual(by_id["buildanddo.governance"].kind, "CONFIG")
        self.assertFalse(any(module.path.endswith(("pb_hooks", "pb_migrations", "/lib")) for module in modules))
        files = [path for module in modules for path in module.files]
        self.assertEqual(len(files), len(set(files)))
        self.assertEqual(set(files), {row.path for row in scan_repository(self.root) if row.kind == "file"})
        self.assertIn("SRS-FIXTURE-001", by_id["buildanddo.decision"].srs_codes)
        self.assertIn("VCC-FIXTURE-001", by_id["buildanddo.decision"].dispatch_ids)
        self.assertIn("route:GET /api/research/{id}", by_id["buildanddo.pocketbase"].capabilities)

    def test_explicit_cgrf_fields_override_conventions(self) -> None:
        self.write("apps/unknown/worker.py", cgrf("apps/unknown/worker.py", extra=(
            "# ModuleID: buildanddo.semantic\n# Kind: AGENT\n# Plane: KNOWLEDGE\n"
            "# Lifecycle: CANDIDATE\n# Capabilities: extract, reconcile\n# UtilityRole: index helper\n"
        )) + "def process():\n    pass\n")
        module = self.modules()[0]
        self.assertEqual(module.module_id, "buildanddo.semantic")
        self.assertEqual((module.kind, module.plane, module.lifecycle), ("AGENT", "KNOWLEDGE", "CANDIDATE"))
        self.assertEqual(module.utility_role, "index helper")
        self.assertIn("capability:extract", module.capabilities)
        self.assertIn("export:worker.process", module.capabilities)
        self.assertEqual(module.provenance["cgrf_header"], ["apps/unknown/worker.py"])

    def test_nested_package_splits_but_widget_folder_does_not(self) -> None:
        self.repository()
        self.write("apps/web/components/Widget.jsx", cgrf("apps/web/components/Widget.jsx", role="Widget").replace("#", "//"))
        self.write("apps/web/packages/editor/package.json", '{"name":"@fixture/editor"}')
        self.write("apps/web/packages/editor/index.js", "export const editor = 1;")
        modules = self.modules()
        self.assertEqual(owner_of("apps/web/components/Widget.jsx", modules).path, "apps/web")
        self.assertEqual(owner_of("apps/web/packages/editor/index.js", modules).path, "apps/web/packages/editor")
        self.assertNotEqual(owner_of("apps/webish/a.py", modules).path, "apps/web")

    def test_registry_scope_maps_existing_paths_without_slug_guessing(self) -> None:
        self.write(".bits/srs_registry.yml", "srs:\n  - code: SRS-DIFFERENT-NAME-001\n    status: ready\n    path: apps/actual\n")
        self.write("apps/actual/utility.py", "value = 1")
        modules = {module.path: module for module in self.modules()}
        self.assertIn("SRS-DIFFERENT-NAME-001", modules["apps/actual"].srs_codes)
        self.assertIn("srs_registry", modules["apps/actual"].provenance)

    def test_explicit_nested_boundaries_do_not_rename_the_parent_module(self) -> None:
        self.repository()
        self.write("apps/web/embedded/service.py", cgrf("apps/web/embedded/service.py", extra="# ModuleID: buildanddo.embedded\n"))
        self.write("apps/web/declared/worker.py", "value = 1")
        self.write(".bits/srs_registry.yml", "srs:\n  - code: SRS-FIXTURE-001\n    status: ready\n    path: apps/web/declared\n")
        modules = self.modules()
        self.assertEqual(owner_of("apps/web/src/App.jsx", modules).module_id, "buildanddo.web")
        self.assertEqual(owner_of("apps/web/embedded/service.py", modules).module_id, "buildanddo.embedded")
        self.assertEqual(owner_of("apps/web/declared/worker.py", modules).path, "apps/web/declared")

    def test_non_source_roles_and_empty_candidates(self) -> None:
        self.write("services/praxis_evidence/utility.py", "value = 1")
        self.write("docs/guide.md", "# Guide")
        self.write("archive/legacy/setup.py", "value = 1")
        self.write("state/worker/manifest.json", "{}")
        self.write("apps/telemetry/service.py", "value = 1")
        self.write("apps/knowledge/service.py", "value = 1")
        self.write("agents/helper/manifest.json", "{}")
        self.write(".github/check.yml", "name: check")
        self.write("vendor/lib/value.py", "value = 1")
        self.write("reports/result.json", "{}")
        (self.root / "apps/empty").mkdir()
        modules = {module.path: module for module in self.modules()}
        self.assertEqual(modules["services/praxis_evidence"].plane, "EVIDENCE")
        self.assertEqual(modules["docs"].plane, "CONTENT")
        self.assertEqual(modules["archive/legacy"].lifecycle, "DEPRECATED")
        self.assertEqual(modules["state/worker"].lifecycle, "RUNTIME")
        self.assertEqual(modules["vendor"].lifecycle, "INSTALLED")
        self.assertEqual(modules["reports"].lifecycle, "GENERATED")
        self.assertEqual(modules["apps/empty"].files, [])
        self.assertEqual(modules["apps/telemetry"].plane, "OBSERVABILITY")
        self.assertEqual(modules["apps/knowledge"].plane, "KNOWLEDGE")
        self.assertEqual(modules["agents/helper"].kind, "AGENT")

    def test_actual_repo_contains_required_modules(self) -> None:
        root = Path(__file__).resolve().parents[2]
        census = scan_repository(root)
        evidence = collect_evidence(root, census)
        modules = identify_modules(census, evidence)
        by_path = {module.path: module for module in modules}
        self.assertTrue({"apps/web", "apps/decision", "apps/research", "apps/pocketbase"} <= set(by_path))
        self.assertGreater(len(by_path["apps/pocketbase"].capabilities), 30)
        self.assertFalse(any(note.code == "invalid_registry" for note in evidence.notes))

    def test_invalid_and_unsupported_inputs_retain_explicit_analysis_notes(self) -> None:
        self.write("apps/broken/a.py", "def !!!")
        self.write("apps/broken/package.json", "{ invalid")
        self.write("apps/broken/pyproject.toml", "bad = {")
        (self.root / "invalid.py").write_bytes(b"\xff\xfe")
        census = scan_repository(self.root)
        evidence = collect_evidence(self.root, census)
        self.assertTrue({"python_parse_error", "invalid_manifest", "missing_registry", "text_encoding"} <= {note.code for note in evidence.notes})
        self.write(".bits/srs_registry.yml", "not a registry")
        evidence = collect_evidence(self.root, scan_repository(self.root))
        self.assertIn("invalid_registry", {note.code for note in evidence.notes})
