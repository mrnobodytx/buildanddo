# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/test_cli.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     scripts/estate_census.py, apps/estate/seal.py, tests/estate/support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON scripts/estate_census.py; DEPENDS_ON apps/estate/seal.py; DEPENDS_ON tests/estate/support.py
# DAG Node:    none
# Intent:      Verify every CLI mode, cached-only reads, operational errors and offline execution from other working directories.
# ───────────────────────────────────────────────────────────────

"""Exercise the actual CLI contract without a service or network."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

from apps.estate.seal import compile_estate, load_latest, save_snapshot
from scripts.estate_census import main
from tests.estate.support import RepositoryTest


class CliTests(RepositoryTest):
    def invoke(self, *options: str) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            status = main(["--root", str(self.root), *options])
        return status, stdout.getvalue(), stderr.getvalue()

    def test_full_run_persists_graph_and_returns_success_with_structural_defects(self) -> None:
        self.repository()
        status, output, error = self.invoke()
        self.assertEqual((status, error), (0, ""))
        self.assertIn("BUILDANDDO ESTATE INTELLIGENCE", output)
        self.assertTrue((self.root / "state/estate/seal.latest.json").is_file())
        document = load_latest(self.root)
        self.assertTrue(document.snapshot.violations)
        self.assertTrue(document.snapshot.modules)
        self.assertTrue(document.snapshot.edges)

    def test_all_view_modes_read_cache_without_rescanning_source(self) -> None:
        self.repository()
        document = save_snapshot(self.root, compile_estate(self.root))
        self.write("apps/decision/runtime.py", "THIS WOULD BE INVALID PYTHON")
        options = [
            ("--report",), ("--module", "web"), ("--orphans",),
            ("--violations",), ("--delta", document.seal.seal_id),
        ]
        before = (self.root / "state/estate/seal.latest.json").read_bytes()
        with patch("scripts.estate_census.compile_estate", side_effect=AssertionError("cached view rescanned source")):
            for option in options:
                with self.subTest(option=option):
                    status, output, error = self.invoke(*option)
                    self.assertEqual((status, error), (0, ""))
                    self.assertTrue(output)
                    status, output, error = self.invoke(*option, "--json")
                    self.assertEqual((status, error), (0, ""))
                    self.assertIsNotNone(json.loads(output))
        self.assertEqual((self.root / "state/estate/seal.latest.json").read_bytes(), before)

    def test_json_full_run_contains_only_module_graph_endpoints(self) -> None:
        self.repository()
        status, output, error = self.invoke("--json")
        self.assertEqual((status, error), (0, ""))
        document = json.loads(output)
        ids = {module["module_id"] for module in document["snapshot"]["modules"]}
        self.assertTrue(all(edge["source"] in ids and edge["target"] in ids for edge in document["snapshot"]["edges"]))
        self.assertIn("census", document["snapshot"])

    def test_delta_uses_the_named_archive_and_cached_latest(self) -> None:
        self.repository()
        first = save_snapshot(self.root, compile_estate(self.root))
        self.write("apps/new/new.py", "def added():\n    return 1\n")
        save_snapshot(self.root, compile_estate(self.root))
        status, output, error = self.invoke("--delta", first.seal.seal_id, "--json")
        self.assertEqual((status, error), (0, ""))
        self.assertIn("buildanddo.new", json.loads(output)["added_modules"])
        status, _, error = self.invoke("--delta", "../../outside")
        self.assertEqual(status, 2)
        self.assertIn("Invalid seal ID", error)

    def test_missing_cache_corruption_and_missing_module_are_operational_errors(self) -> None:
        status, _, error = self.invoke("--report")
        self.assertEqual(status, 2)
        self.assertIn("run scripts/estate_census.py first", error)
        self.repository()
        save_snapshot(self.root, compile_estate(self.root))
        status, _, error = self.invoke("--module", "not-here")
        self.assertEqual(status, 2)
        self.assertIn("not found", error)
        (self.root / "state/estate/seal.latest.json").write_text("{broken")
        status, _, error = self.invoke("--report")
        self.assertEqual(status, 2)
        self.assertIn("valid cached", error)

    def test_source_is_not_executed_and_no_socket_is_opened(self) -> None:
        self.repository()
        self.write("apps/trap/worker.py", "raise RuntimeError('source executed')\n")
        self.write("apps/pocketbase/pb_hooks/trap.pb.js", "throw new Error('hook executed');")
        with patch("socket.socket", side_effect=AssertionError("network attempted")):
            status, _, error = self.invoke()
        self.assertEqual((status, error), (0, ""))

    def test_direct_script_runs_from_another_working_directory(self) -> None:
        self.repository()
        script = Path(__file__).resolve().parents[2] / "scripts/estate_census.py"
        result = subprocess.run([sys.executable, str(script), "--root", str(self.root), "--json"],
                                cwd=self.root.parent, text=True, capture_output=True, timeout=30, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)["seal"]["sha256"])
        self.assertFalse(list(self.root.rglob("__pycache__")))

    def test_view_flags_are_mutually_exclusive_and_help_is_available(self) -> None:
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            main(["--report", "--orphans"])
        self.assertEqual(error.exception.code, 2)
        with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit) as help_result:
            main(["--help"])
        self.assertEqual(help_result.exception.code, 0)
