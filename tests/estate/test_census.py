# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/test_census.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/census.py, apps/estate/metadata.py, tests/estate/support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/estate/census.py; DEPENDS_ON apps/estate/metadata.py; DEPENDS_ON tests/estate/support.py
# DAG Node:    none
# Intent:      Prove deterministic census metadata, complete headers, exclusions and bounded asset handling.
# ───────────────────────────────────────────────────────────────

"""Exercise the requested census, metadata and large-file behaviors."""

from __future__ import annotations

from dataclasses import asdict
import hashlib
import os
from pathlib import Path
import tempfile
import tracemalloc
from unittest.mock import patch

from apps.estate.census import MAX_ANALYSIS_BYTES, classify, read_source, scan_repository
from apps.estate.common import EstateError
from apps.estate.metadata import enum_edges, parse_cgrf, parse_registry, scope_paths, split_references, srs_codes
from tests.estate.support import RepositoryTest, cgrf


class CensusTests(RepositoryTest):
    def test_same_files_ignore_mtime_creation_order_and_absolute_root(self) -> None:
        self.repository()
        first = scan_repository(self.root)
        for record in first:
            os.utime(self.root / record.path, (1000000000, 1000000000))
        second = scan_repository(self.root)
        self.assertEqual(first, second)
        self.assertEqual([row.path for row in first], sorted(row.path for row in first))
        self.assertTrue(all(row.size == 0 for row in first if row.kind == "directory"))
        with tempfile.TemporaryDirectory() as other:
            target = Path(other)
            for record in reversed(first):
                source = self.root / record.path
                destination = target / record.path
                if record.kind == "file":
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(source.read_bytes())
                else:
                    destination.mkdir(parents=True, exist_ok=True)
            self.assertEqual([asdict(row) for row in first], [asdict(row) for row in scan_repository(target)])

    def test_wrapped_headers_extract_all_fields_and_stop_at_source(self) -> None:
        text = "\ufeff#!/usr/bin/env python\n" + cgrf("apps/a.py", depends="apps/b.py,\n#              apps/c.py", extra=(
            "# EnumEdges: CONSUMES apps/b.py;\n#            DEPENDS_ON apps/c.py\n"
            "# Capabilities: classify, reconcile\n# ModuleID: buildanddo.custom\n"
            "# DAG Node: graph.census\n# Created: 2026-09-17\n"
        ), srs="SRS-FIXTURE-001, SRS-FIXTURE-002") + "# SRS: SRS-FALSE-003\n"
        fields = parse_cgrf(text)
        self.assertEqual(fields["File"], "apps/a.py")
        self.assertEqual(fields["Stage"], "07_BUILD")
        self.assertEqual(fields["EnumType"], "Service")
        self.assertEqual(fields["Owner"], "Citadel Nexus Inc.")
        self.assertEqual(fields["Seat"], "BITS-CODEGEN")
        self.assertEqual(fields["CAPS"], "pending")
        self.assertEqual(fields["CK"], "pending")
        self.assertEqual(fields["Dispatch"], "VCC-FIXTURE-001")
        self.assertEqual(fields["Created"], "2026-09-17")
        self.assertEqual(fields["Intent"], "Supply fixture evidence.")
        self.assertEqual(fields["DAG Node"], "graph.census")
        self.assertEqual(fields["ModuleID"], "buildanddo.custom")
        self.assertEqual(split_references(fields["Depends"]), ["apps/b.py", "apps/c.py"])
        self.assertEqual(enum_edges(fields["EnumEdges"]), [("CONSUMES", "apps/b.py"), ("DEPENDS_ON", "apps/c.py")])
        self.assertEqual(srs_codes(fields["SRS"]), ["SRS-FIXTURE-001", "SRS-FIXTURE-002"])
        self.assertEqual(parse_cgrf("text = 'CGRF Header'\n# SRS: SRS-FALSE-001"), {})
        self.assertEqual(parse_cgrf(text.replace("#", "//").replace("//!", "#!"))["File"], "apps/a.py")
        self.assertEqual(parse_cgrf("/* CGRF Header\n * File: a.js\n * SRS: SRS-FIXTURE-001\n */\n")["File"], "a.js")
        self.assertEqual(parse_cgrf("<!-- CGRF Header\n# File: a.md\n-->\n")["File"], "a.md")

    def test_excluded_trees_and_lockfiles_are_metadata_only(self) -> None:
        for name in ("node_modules", ".git", "__pycache__", "dist", ".venv-test", ".codex"):
            self.write(f"{name}/deep/hidden.py", cgrf("hidden.py"))
        self.write("yarn.lock", cgrf("yarn.lock"))
        records = {row.path: row for row in scan_repository(self.root)}
        self.assertEqual(set(records), {"node_modules", ".git", "__pycache__", "dist", ".venv-test", ".codex", "yarn.lock"})
        self.assertTrue(all(row.analysis_status == "excluded" for row in records.values()))
        self.assertFalse(any(row.candidate_module or row.cgrf_present for row in records.values()))
        self.assertEqual(len(records["yarn.lock"].sha256), 64)

    def test_classification_precedence_and_candidates(self) -> None:
        cases = {"apps/x/a.py": "SOURCE", "apps/x/state/store.js": "SOURCE", "apps/x/package.json": "CONFIG",
                 "state/x.json": "STATE", "reports/result.json": "GENERATED",
                 "tests/a.py": "TEST", "docs/a.md": "DOCS", ".bits/queue/x.md": "GOVERNANCE",
                 "vendor/lib/a.py": "VENDOR", "archive/a.py": "ARCHIVE", "apps/x/a.test.jsx": "TEST"}
        for path, expected in cases.items():
            self.assertEqual(classify(path, "file"), expected)
            self.write(path, cgrf(path) if path.endswith(".py") else "{}")
        self.write("apps/x/Dockerfile", "FROM scratch")
        self.write("apps/x/docker-compose.dev.yml", "services: {}")
        records = {row.path: row for row in scan_repository(self.root)}
        self.assertTrue(records["apps/x"].candidate_module)
        self.assertTrue(records["apps/x/Dockerfile"].candidate_module)
        self.assertTrue(records["apps/x/docker-compose.dev.yml"].candidate_module)
        self.assertTrue(records["apps/x/a.py"].candidate_module)

    def test_large_binary_assets_stream_without_unbounded_reads(self) -> None:
        asset = self.root / "asset.bin"
        with asset.open("wb") as stream:
            stream.truncate(16 * 1024 * 1024)
        self.write("huge.py", "# " + "x" * MAX_ANALYSIS_BYTES)
        tracemalloc.start()
        try:
            records = {row.path: row for row in scan_repository(self.root)}
            _, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        self.assertLess(peak, 3 * 1024 * 1024)
        self.assertEqual(records["asset.bin"].size, 16 * 1024 * 1024)
        expected = hashlib.sha256()
        for _ in range(16):
            expected.update(bytes(1024 * 1024))
        self.assertEqual(records["asset.bin"].sha256, expected.hexdigest())
        self.assertEqual(records["asset.bin"].analysis_status, "binary")
        self.assertEqual(records["huge.py"].analysis_status, "analysis_limit")
        self.assertIsNone(read_source(self.root, records["huge.py"]))

    def test_symlinks_secrets_and_special_files_are_never_opened(self) -> None:
        self.write(".env.local", "private fixture")
        self.write("server.key", "private fixture")
        self.write("pb_data/runtime.db", "private fixture")
        self.write(".env.example", "# sample")
        outside = self.root.parent / (self.root.name + "-outside")
        outside.write_text("outside", encoding="utf-8")
        self.addCleanup(outside.unlink)
        (self.root / "escape.py").symlink_to(outside)
        (self.root / "loop").symlink_to(self.root, target_is_directory=True)
        os.mkfifo(self.root / "pipe")
        records = {row.path: row for row in scan_repository(self.root)}
        self.assertEqual(records[".env.local"].sha256, "")
        self.assertEqual(records["server.key"].analysis_status, "sensitive_metadata")
        self.assertEqual(records["escape.py"].analysis_status, "symlink")
        self.assertEqual(records["loop"].kind, "file")
        self.assertEqual(records["pipe"].analysis_status, "special_file")
        self.assertNotIn("pb_data/runtime.db", records)

    def test_generated_seals_and_output_only_parent_are_not_census_input(self) -> None:
        self.write("apps/a/file.py", "value = 1")
        first = scan_repository(self.root)
        self.write("state/estate/seal.latest.json", "{}")
        self.write("state/estate/seals/old.json", "{}")
        self.assertEqual(first, scan_repository(self.root))
        self.write("state/other.json", "{}")
        self.assertIn("state/other.json", {row.path for row in scan_repository(self.root)})

    def test_sidecars_tag_assets_without_parsing_binary(self) -> None:
        self.write("manifest.json", "{}")
        self.write("manifest.json.cgrf.yaml", cgrf("manifest.json.cgrf.yaml") + "governs: manifest.json\n")
        record = next(row for row in scan_repository(self.root) if row.path == "manifest.json")
        self.assertTrue(record.cgrf_present)
        self.assertEqual(record.srs_ref, "SRS-FIXTURE-001")
        self.assertEqual(record.dispatch_ref, "VCC-FIXTURE-001")

    def test_read_source_rejects_changes_and_invalid_roots(self) -> None:
        path = self.write("a.py", "value = 1")
        record = scan_repository(self.root)[0]
        self.assertEqual(read_source(self.root, record), "value = 1")
        path.write_text("value = 2")
        with self.assertRaisesRegex(EstateError, "changed"):
            read_source(self.root, record)
        path.unlink()
        with self.assertRaisesRegex(EstateError, "Cannot read"):
            read_source(self.root, record)
        with self.assertRaisesRegex(EstateError, "directory"):
            scan_repository(self.root / "absent")
        with patch.object(Path, "iterdir", side_effect=PermissionError):
            with self.assertRaises(EstateError):
                scan_repository(self.root)

    def test_registry_subset_and_scope_paths(self) -> None:
        entries = parse_registry('srs:\n  - code: SRS-FIXTURE-001\n    status: ready\n    paths: apps/a, apps/b\n')
        self.assertEqual(entries[0].paths, ["apps/a", "apps/b"])
        with self.assertRaises(EstateError):
            parse_registry("schema_version: 1")
        with self.assertRaises(EstateError):
            parse_registry("srs:\n  - code: SRS-FIXTURE-001\n    paths:\n      - apps/a\n")
        quote = chr(96)
        self.assertEqual(scope_paths(f"## Scope\nAdd {quote}apps/a/{quote}.\n## Out of scope\n{quote}apps/b{quote}"),
                         ["apps/a"])
