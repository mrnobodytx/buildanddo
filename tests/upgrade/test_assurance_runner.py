# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_assurance_runner.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     tests/assurance/run.py, tests/assurance/runtime.py
# EnumType:    Test
# EnumEdges:   VALIDATES tests/assurance/run.py; VALIDATES tests/assurance/runtime.py
# Intent:      Reject empty, skipped, stale or unavailable assurance evidence and protect disposable backup boundaries.
# ───────────────────────────────────────────────────────────────

"""Test the assurance recorder's evidence decisions without substituting a native runtime."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from tests.assurance import run as assurance
from tests.assurance.runtime import tree_hashes


class AssuranceRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)

    def run_profiles(
        self, *profiles: str, source_only: bool = False, failure: bool = False
    ) -> dict:
        """Provide controlled runner results while exercising real profile aggregation."""

        def checked(command: list[str], output: Path, label: str, env: dict) -> dict:
            return {
                "state": "FAIL" if failure else "PASS",
                "command": command,
                "counts": {
                    "tests": 1,
                    "passed": 0 if failure else 1,
                    "failed": int(failure),
                    "skipped": 0,
                },
            }

        with (
            patch.object(assurance, "execute", side_effect=checked),
            patch.object(assurance, "missing", return_value=["PocketBase executable"]),
        ):
            return assurance.run(
                list(profiles), self.root / "result", source_only=source_only
            )

    def test_python_totals_preserve_passes_failures_and_errors(self) -> None:
        self.assertEqual(
            assurance.counts(
                "Ran 9 tests in 0.1s\nFAILED (failures=1, errors=1, skipped=2)\n"
            ),
            {"tests": 9, "passed": 5, "failed": 2, "skipped": 2},
        )

    def test_expected_failures_do_not_become_passes(self) -> None:
        self.assertEqual(
            assurance.counts("Ran 3 tests in 0.1s\nOK (expected failures=1)\n"),
            {"tests": 3, "passed": 2, "failed": 0, "skipped": 1},
        )

    def test_node_totals_keep_skips_and_failed_assertions(self) -> None:
        self.assertEqual(
            assurance.counts("# tests 8\n# pass 5\n# fail 1\n# skipped 2\n"),
            {"tests": 8, "passed": 5, "failed": 1, "skipped": 2},
        )

    def test_empty_zero_exit_is_not_a_passing_suite(self) -> None:
        result = assurance.execute(
            [sys.executable, "-c", "print('no discovered tests')"],
            self.root,
            "empty",
            dict(os.environ),
        )
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(result["state"], "FAIL")
        self.assertEqual(
            result["log_sha256"],
            hashlib.sha256((self.root / "empty.log").read_bytes()).hexdigest(),
        )

    def test_all_skipped_zero_exit_is_not_acceptance(self) -> None:
        result = assurance.execute(
            [sys.executable, "-c", "print('Ran 2 tests in 0.1s\\nOK (skipped=2)')"],
            self.root,
            "skipped",
            dict(os.environ),
        )
        self.assertEqual(result["state"], "FAIL")
        self.assertEqual(result["counts"]["skipped"], 2)

    def test_runner_failure_cannot_be_overridden_by_an_old_pass_line(self) -> None:
        result = assurance.execute(
            [
                sys.executable,
                "-c",
                "print('Ran 1 test in 0.1s\\nOK'); raise SystemExit(1)",
            ],
            self.root,
            "crashed",
            dict(os.environ),
        )
        self.assertEqual(result["state"], "FAIL")

    def test_unavailable_or_timed_out_runner_retains_a_failure(self) -> None:
        for index, error in enumerate(
            (OSError("not available"), subprocess.TimeoutExpired("local", 1))
        ):
            with patch.object(assurance.subprocess, "run", side_effect=error):
                result = assurance.execute(["local"], self.root, f"runner-{index}", {})
            self.assertEqual(result["state"], "FAIL")
            self.assertNotEqual(result["exit_code"], 0)

    def test_all_profiles_continue_when_native_dependencies_are_missing(self) -> None:
        result = self.run_profiles(*assurance.PROFILES)
        self.assertEqual(result["state"], "HOLD")
        self.assertEqual(set(result["profiles"]), set(assurance.PROFILES))
        for name in ("evidence", "failure"):
            self.assertEqual(result["profiles"][name]["state"], "PASS")
        self.assertEqual(result["profiles"]["security"]["state"], "BLOCKED")
        self.assertEqual(result["profiles"]["security"]["checks"][0]["state"], "PASS")
        self.assertEqual(
            result["profiles"]["recovery"]["checks"][0]["requires"],
            ["PocketBase executable"],
        )

    def test_source_only_receipt_explicitly_excludes_runtime_acceptance(self) -> None:
        result = self.run_profiles("security", "evidence", "failure", source_only=True)
        self.assertEqual(result["state"], "PASS")
        self.assertEqual(result["runtime_acceptance"], "UNMEASURED")
        self.assertEqual(result["profiles"]["security"]["runtime"], "NOT_REQUESTED")
        binding = (self.root / "result/source-binding.json").read_bytes()
        self.assertEqual(
            result["source_binding_sha256"], hashlib.sha256(binding).hexdigest()
        )

    def test_bare_source_only_browser_request_cannot_pass(self) -> None:
        result = self.run_profiles("journey", source_only=True)
        self.assertEqual(result["state"], "HOLD")
        self.assertEqual(result["profiles"]["journey"]["state"], "BLOCKED")

    def test_failure_is_visible_even_if_another_check_is_blocked(self) -> None:
        result = self.run_profiles("security", failure=True)
        self.assertEqual(result["profiles"]["security"]["state"], "FAIL")

    def test_source_change_during_run_invalidates_success(self) -> None:
        with patch.object(
            assurance,
            "source_binding",
            side_effect=[{"source": "before"}, {"source": "after"}],
        ):
            result = self.run_profiles("evidence", source_only=True)
        self.assertFalse(result["source_unchanged"])
        self.assertEqual(result["state"], "HOLD")

    def test_unknown_duplicate_or_empty_profiles_do_not_create_outputs(self) -> None:
        for profiles in ([], ["no-such-profile"], ["security", "security"]):
            with self.assertRaises(ValueError):
                assurance.run(profiles, self.root / "invalid")
        self.assertFalse((self.root / "invalid").exists())

    def test_output_must_be_new_and_cannot_traverse_a_link(self) -> None:
        old = self.root / "existing"
        old.mkdir()
        (old / "receipt").write_text("keep")
        (self.root / "link").symlink_to(old, target_is_directory=True)
        for output in (old, self.root / "link/new"):
            with self.assertRaises(ValueError):
                assurance.run(["security"], output)
        self.assertEqual((old / "receipt").read_text(), "keep")

    def test_source_binding_hashes_real_inputs_and_excludes_private_files(self) -> None:
        source = self.root / "apps/web/src"
        source.mkdir(parents=True)
        (source / "public.js").write_text("export const ready = true;")
        (source / ".env").write_text("test_only_fixture")
        (source / "link.js").symlink_to(source / "public.js")
        career = self.root / "libs/career_passport"
        career.mkdir(parents=True)
        (career / "passport.py").write_text("review_required = True\n")
        binding = assurance.source_binding(self.root)
        self.assertEqual(
            set(binding),
            {"apps/web/src/public.js", "libs/career_passport/passport.py"},
        )
        (source / "public.js").write_text("export const ready = false;")
        self.assertNotEqual(binding, assurance.source_binding(self.root))
        current = assurance.source_binding(self.root)
        (career / "passport.py").write_text("review_required = False\n")
        self.assertNotEqual(current, assurance.source_binding(self.root))

    def test_missing_preflight_reports_all_local_browser_requirements(self) -> None:
        with (
            patch.object(assurance, "vite_entry", return_value=None),
            patch.object(assurance.shutil, "which", return_value=None),
            patch.object(assurance.importlib.util, "find_spec", return_value=None),
        ):
            missing = assurance.missing("compatibility", "")
        self.assertIn("PocketBase executable", missing)
        self.assertIn("Node", missing)
        self.assertIn("locked frontend dependencies (Vite)", missing)
        self.assertIn("Python Playwright and browser binaries", missing)

    def test_backup_manifest_changes_on_corruption_and_rejects_links(self) -> None:
        backup = self.root / "backup"
        backup.mkdir()
        (backup / "data.db").write_bytes(b"synthetic database bytes")
        original = tree_hashes(backup)
        (backup / "data.db").write_bytes(b"different database bytes")
        self.assertNotEqual(original, tree_hashes(backup))
        (backup / "escape").symlink_to(self.root)
        with self.assertRaisesRegex(ValueError, "symlinks"):
            tree_hashes(backup)

    def test_runtime_identity_records_bytes_and_refuses_wrong_versions(self) -> None:
        binary = self.root / "pocketbase"
        binary.write_bytes(b"synthetic executable fixture")
        binary.chmod(0o700)
        process = subprocess.CompletedProcess(
            [str(binary)], 0, "pocketbase version 0.39.8\n", ""
        )
        with patch.object(assurance.subprocess, "run", return_value=process):
            result = assurance.runtime_probe(str(binary), "0.39.8")
            self.assertEqual(result["state"], "AVAILABLE")
            self.assertEqual(
                result["binary_sha256"], hashlib.sha256(binary.read_bytes()).hexdigest()
            )
            self.assertEqual(
                assurance.runtime_probe(str(binary), "0.28.4")["state"], "BLOCKED"
            )

    def test_runtime_identity_does_not_infer_a_version_from_success_alone(self) -> None:
        binary = self.root / "pocketbase"
        binary.write_bytes(b"synthetic executable fixture")
        binary.chmod(0o700)
        for status, output in ((0, "ready"), (1, "pocketbase version 0.39.8")):
            with patch.object(
                assurance.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], status, output, ""),
            ):
                self.assertEqual(
                    assurance.runtime_probe(str(binary))["state"], "BLOCKED"
                )
        with patch.object(
            assurance.subprocess, "run", side_effect=OSError("unavailable")
        ):
            self.assertEqual(assurance.runtime_probe(str(binary))["state"], "BLOCKED")

    def test_saved_summary_is_the_returned_profile_result(self) -> None:
        result = self.run_profiles("evidence", source_only=True)
        self.assertEqual(
            json.loads((self.root / "result/summary.json").read_text()), result
        )


if __name__ == "__main__":
    unittest.main()
