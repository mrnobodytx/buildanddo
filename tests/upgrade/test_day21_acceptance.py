# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_day21_acceptance.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     tools/day21/day21_acceptance.py, tests/upgrade/test_day21_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES tools/day21/day21_acceptance.py; CONSUMES tests/upgrade/test_day21_support.py
# Intent:      Reject empty acceptance runs and stale success after runtime failures while exercising the real receipt exporter.
# ───────────────────────────────────────────────────────────────

"""Exercise runner orchestration with explicit synthetic source and process data."""

from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from scripts.ci import day21_submission as day21, hostinger_checks as checks
from tests.upgrade.test_day21_support import candidate_fixture
from tests.upgrade.test_hostinger_readiness import fixture, write_json
from tests.upgrade.test_hostinger_replay import NOW, SHA, SOURCE, ReplayFixture
from tools.day21 import day21_acceptance as runner


class AcceptanceRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="acceptance-runner-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.contract = fixture(self.root)
        capture = self.root / "capture"
        capture.mkdir()
        self.proof = self.root / "synthetic-proof"
        candidate_fixture(self.root, self.proof, ReplayFixture(capture))
        self.receipts = self.proof / "acceptance"
        self.target = self.root / "export" / "acceptance-summary.json"
        self.args = [
            "--repo",
            str(self.root),
            "--evidence-dir",
            str(self.receipts),
            "--summary-output",
            str(self.target),
        ]
        for module in (day21, checks):
            self.enterContext(
                patch.object(module, "candidate_binding", return_value=(SHA, True))
            )
            clock = self.enterContext(patch.object(module, "datetime", wraps=datetime))
            clock.now.return_value = NOW
        self.enterContext(
            patch.object(day21, "check_review", return_value=(self.contract, SOURCE))
        )
        self.output = io.StringIO()
        self.enterContext(redirect_stdout(self.output))
        self.enterContext(redirect_stderr(self.output))

    def test_conflicting_selections_cannot_skip_every_check_successfully(self) -> None:
        with patch.object(runner, "run", return_value=0) as run:
            with self.assertRaises(SystemExit) as stopped:
                runner.main([*self.args, "--source-only", "--native-only"])
        self.assertEqual(stopped.exception.code, 2)
        run.assert_not_called()
        self.assertFalse(self.target.exists())

    def test_partial_summary_keeps_exit_nonzero_after_selected_commands_pass(
        self,
    ) -> None:
        with (
            patch.object(runner, "run", return_value=0),
            patch.object(runner, "write_summary", return_value={"state": "HOLD"}),
        ):
            result = runner.main([*self.args, "--source-only"])
        self.assertEqual(result, 1)
        self.assertNotIn("DAY21 ACCEPTANCE PASS", self.output.getvalue())

    def test_summary_rechecks_logs_and_keeps_original_receipt_history(self) -> None:
        log = self.receipts / "source_node.log"
        log.write_text("Tampered synthetic output\n")
        with patch.object(
            runner.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 0, SHA + "\n"),
        ):
            summary = runner.write_summary(self.root, self.receipts, self.target)
        self.assertEqual(summary["state"], "HOLD")
        self.assertEqual(summary["profiles"]["source_node"], "INVALID")
        self.assertEqual(
            (self.target.parent / "acceptance/source_node.log").read_bytes(),
            log.read_bytes(),
        )

    def test_current_synthetic_evidence_exports_artifacts_without_overwrite(
        self,
    ) -> None:
        with patch.object(
            runner.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 0, SHA + "\n"),
        ):
            summary = runner.write_summary(self.root, self.receipts, self.target)
        self.assertEqual(summary["state"], "PASS")
        self.assertEqual(set(summary["profiles"]), day21.required_profiles())
        self.assertTrue(
            (self.target.parent / "artifacts/reports/junit/web.xml").is_file()
        )
        retained = self.target.read_bytes()
        with self.assertRaises(day21.Day21Error):
            runner.write_summary(self.root, self.receipts, self.target)
        self.assertEqual(self.target.read_bytes(), retained)

    def test_summary_rejects_another_candidate_and_missing_artifacts(self) -> None:
        receipt = self.receipts / "source_node.json"
        data = json.loads(receipt.read_text())
        write_json(receipt, {**data, "candidate_sha": "0" * 40})
        (self.root / "dist/apps/web/index.html").unlink()
        summary = runner.write_summary(self.root, self.receipts, self.target)
        self.assertEqual(summary["state"], "HOLD")
        self.assertEqual(summary["profiles"]["source_node"], "INVALID")
        self.assertEqual(summary["profiles"]["web_build"], "STALE")

    def test_gitlab_download_retains_a_revalidatable_acceptance_export(self) -> None:
        target = self.root / "state/day21/evidence/acceptance-summary.json"
        runner.write_summary(self.root, self.receipts, target)
        config = (runner.ROOT / ".gitlab/ci/day21-submission.yml").read_text()
        full_job = config.split("day21_full_acceptance:\n", 1)[1].split(
            "\nday21_submission_bundle:", 1
        )[0]
        paths = re.findall(
            r"^      - ((?:reports|state|dist)/[^\s#]+)$", full_job, re.MULTILINE
        )
        downloaded = self.root / "downloaded"
        fixture(downloaded)
        for declaration in (
            "apps/pocketbase/.pocketbase-version",
            "docker-compose.yml",
        ):
            shutil.copyfile(self.root / declaration, downloaded / declaration)
        for name in paths:
            source, destination = self.root / name, downloaded / name
            if source.is_dir():
                shutil.copytree(source, destination, dirs_exist_ok=True)
            elif source.is_file():
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
        exported = downloaded / "state/day21/evidence"
        result = day21.validate_acceptance(exported, NOW, root=downloaded)
        self.assertEqual(result["state"], "PASS")
        (exported / "acceptance/source_node.log").write_text("Changed after download\n")
        with self.assertRaises(day21.Day21Error):
            day21.validate_acceptance(exported, NOW, root=downloaded)

    def test_existing_output_and_dirty_source_stop_before_any_command(self) -> None:
        self.target.parent.mkdir()
        self.target.write_text("Existing evidence\n")
        with patch.object(runner, "run") as command:
            self.assertEqual(runner.main([*self.args, "--offline"]), 2)
        command.assert_not_called()
        self.assertEqual(self.target.read_text(), "Existing evidence\n")
        self.target.unlink()
        with (
            patch.object(checks, "candidate_binding", return_value=(SHA, False)),
            patch.object(runner, "run") as command,
        ):
            self.assertEqual(runner.main([*self.args, "--offline"]), 2)
            with self.assertRaises(day21.Day21Error):
                runner.write_summary(self.root, self.receipts, self.target)
        command.assert_not_called()
        with self.assertRaises(day21.Day21Error):
            runner.write_summary(
                self.root, self.receipts, self.target.with_name("wrong.json")
            )

    def test_preflight_and_missing_commands_cannot_report_success(self) -> None:
        with patch.object(runner, "run", return_value=1):
            self.assertEqual(runner.main([*self.args, "--offline"]), 2)
        with patch.object(
            runner, "run", side_effect=FileNotFoundError("missing command")
        ):
            self.assertEqual(runner.main([*self.args, "--offline"]), 2)
        self.assertFalse(self.target.exists())

    def test_failed_dependency_install_remains_a_failed_invocation(self) -> None:
        commands = []

        def install(argv: list[str], **_kwargs: object) -> int:
            commands.append(argv)
            return 1 if argv[:2] == ["npm", "ci"] else 0

        with (
            patch.object(runner, "run", side_effect=install),
            patch.object(runner, "readiness", return_value=0),
            patch.object(runner, "write_summary", return_value={"state": "PASS"}),
        ):
            self.assertEqual(
                runner.main([*self.args, "--source-only", "--install-deps"]), 1
            )
        self.assertIn(["npm", "ci", "--include=dev"], commands)
        self.assertTrue(any("pip" in argv and "install" in argv for argv in commands))

    def test_docker_extraction_cleans_up_on_copy_failure_and_success(self) -> None:
        with patch.object(runner.shutil, "which", return_value=None):
            with self.assertRaisesRegex(RuntimeError, "Docker"):
                runner.extract_binary(self.root, "0.39.8", self.root)
        with (
            patch.object(runner.shutil, "which", return_value="docker"),
            patch.object(runner, "run", return_value=1),
        ):
            with self.assertRaisesRegex(RuntimeError, "image build"):
                runner.extract_binary(self.root, "0.39.8", self.root)
        with (
            patch.object(runner.shutil, "which", return_value="docker"),
            patch.object(runner, "run", return_value=0),
            patch.object(
                runner.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 1, ""),
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "create"):
                runner.extract_binary(self.root, "0.39.8", self.root)
        for copy_fails in (True, False):
            with self.subTest(copy_fails=copy_fails):

                def execute(argv: list[str], **_kwargs: object) -> int:
                    if argv[1] == "cp":
                        if copy_fails:
                            return 1
                        Path(argv[-1]).write_text(
                            "Synthetic extraction; never a native runtime\n"
                        )
                    return 0

                with (
                    patch.object(runner.shutil, "which", return_value="docker"),
                    patch.object(runner, "run", side_effect=execute),
                    patch.object(
                        runner.subprocess,
                        "run",
                        return_value=subprocess.CompletedProcess(
                            [], 0, "synthetic-container\n"
                        ),
                    ) as docker,
                ):
                    if copy_fails:
                        with self.assertRaisesRegex(RuntimeError, "extract"):
                            runner.extract_binary(self.root, "0.39.8", self.root)
                    else:
                        binary = runner.extract_binary(self.root, "0.39.8", self.root)
                        self.assertTrue(os.access(binary, os.X_OK))
                self.assertEqual(
                    docker.call_args_list[-1].args[0],
                    ["docker", "rm", "synthetic-container"],
                )

    def test_command_runner_and_readiness_forward_process_results(self) -> None:
        self.assertEqual(
            runner.run([sys.executable, "-c", "raise SystemExit(3)"], cwd=self.root), 3
        )
        with patch.object(runner, "run", return_value=7) as command:
            self.assertEqual(
                runner.readiness(
                    self.root, self.receipts, "native_workspace", "compose"
                ),
                7,
            )
        argv = command.call_args.args[0]
        self.assertEqual(argv[0], sys.executable)
        self.assertEqual(argv[argv.index("--runtime") + 1], "compose")
        self.assertEqual(runner.version_for(self.root, "package"), "0.39.8")
        self.assertEqual(runner.version_for(self.root, "compose"), "0.28.4")
        with self.assertRaises(ValueError):
            runner.version_for(self.root, "unknown")

    def record_missing_native(
        self,
        root: Path,
        evidence: Path,
        name: str,
        profile: str,
        env: dict[str, str] | None = None,
    ) -> int:
        """Capture a real missing-runtime result; never emulate a PocketBase server."""
        self.assertIsNotNone(env)
        with patch.dict(os.environ, env or {}):
            path = checks.run_check(root, evidence, name, SOURCE, profile)
        self.assertEqual(json.loads(path.read_text())["status"], "BLOCKED")
        return 1

    def test_failed_provisioning_replaces_old_native_pass_with_blocked_receipts(
        self,
    ) -> None:
        with (
            patch.object(runner, "run", return_value=0),
            patch.object(
                runner,
                "extract_binary",
                side_effect=RuntimeError("test provisioning unavailable"),
            ),
            patch.object(
                runner, "readiness", side_effect=self.record_missing_native
            ) as run,
            patch.dict(os.environ, {"BUILDANDDO_TEST_POCKETBASE": sys.executable}),
        ):
            self.assertEqual(runner.main([*self.args, "--native-only"]), 1)
        self.assertEqual(run.call_count, 10)
        summary = json.loads(self.target.read_text())
        self.assertEqual(summary["state"], "HOLD")
        native = {
            key: state for key, state in summary["profiles"].items() if ":" in key
        }
        self.assertEqual(set(native.values()), {"BLOCKED"})
        self.assertEqual(len(list(self.receipts.glob("*.json"))), 28)

    def test_offline_uses_explicit_binaries_for_each_profile_without_provisioning(
        self,
    ) -> None:
        observed: dict[str, str] = {}

        def observe(
            root: Path,
            evidence: Path,
            name: str,
            profile: str,
            env: dict[str, str] | None = None,
        ) -> int:
            observed[profile] = (env or {})["BUILDANDDO_TEST_POCKETBASE"]
            return 0

        with (
            patch.object(runner, "run", return_value=0) as command,
            patch.object(runner, "readiness", side_effect=observe) as execute,
            patch.object(runner, "extract_binary") as provision,
            patch.object(runner, "write_summary", return_value={"state": "PASS"}),
        ):
            result = runner.main(
                [
                    *self.args,
                    "--native-only",
                    "--offline",
                    "--pocketbase-package",
                    "runtimes/package",
                    "--pocketbase-compose",
                    "runtimes/compose",
                ]
            )
        self.assertEqual(result, 0)
        self.assertEqual(
            observed,
            {
                "package": str(self.root / "runtimes/package"),
                "compose": str(self.root / "runtimes/compose"),
            },
        )
        self.assertEqual(execute.call_count, 10)
        self.assertEqual(command.call_count, 1)
        provision.assert_not_called()

    def test_offline_rejects_install_and_blocks_missing_or_wrong_runtime(self) -> None:
        with self.assertRaises(SystemExit) as stopped:
            runner.main([*self.args, "--offline", "--install-deps"])
        self.assertEqual(stopped.exception.code, 2)
        with (
            patch.object(runner, "run", return_value=0),
            patch.object(runner, "readiness", side_effect=self.record_missing_native),
            patch.object(runner, "extract_binary") as provision,
        ):
            self.assertEqual(
                runner.main(
                    [
                        *self.args,
                        "--native-only",
                        "--offline",
                        "--pocketbase-package",
                        sys.executable,
                    ]
                ),
                1,
            )
        provision.assert_not_called()
        self.assertEqual(json.loads(self.target.read_text())["state"], "HOLD")


if __name__ == "__main__":
    unittest.main()
