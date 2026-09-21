# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_hostinger_readiness.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/hostinger_checks.py, scripts/ci/hostinger_readiness.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/hostinger_checks.py; VALIDATES scripts/ci/hostinger_readiness.py; VALIDATES scripts/ci/agent_context.py
# Intent:      Reject stale governance, tampered receipts, skipped acceptance and misleading runtime versions using real local subprocess outcomes.
# ───────────────────────────────────────────────────────────────

"""Exercise review and acceptance gates using explicit temporary source fixtures."""

from __future__ import annotations

from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timedelta, timezone
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Any
import unittest
from unittest.mock import patch

from scripts.ci import hostinger_checks as checks
from scripts.ci import hostinger_readiness as readiness
from scripts.ci import agent_context

ROOT = Path(__file__).resolve().parents[2]


def write_json(path: Path, value: object) -> None:
    """Write synthetic input without asserting it is an operational receipt."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def fixture(root: Path) -> dict[str, Any]:
    """Create a minimal source tree with the real canonical milestone definitions."""
    contract = json.loads((ROOT / readiness.CONTRACT).read_text())
    for piece in contract["pieces"]:
        piece["sources"] = ["apps/web/example.js"]
    write_json(root / readiness.CONTRACT, contract)
    files = {
        "apps/web/example.js": "export const synthetic = true;\n",
        "apps/pocketbase/.pocketbase-version": "0.28.4\n",
        "docker-compose.yml": "version: ${POCKETBASE_VERSION:-0.28.3}\n",
        "libs/example.py": "SYNTHETIC = True\n",
        "foundry/example.py": "SYNTHETIC = True\n",
        "scripts/example.py": "SYNTHETIC = True\n",
        "tests/upgrade/example.test.mjs": "// synthetic fixture\n",
        "tests/upgrade/test_example.py": "# synthetic fixture\n",
        "tests/upgrade/test_example_native.py": "# excluded from source-only checks\n",
        "CLAUDE.md": "Synthetic instructions\n",
        "AGENTS.md": "python scripts/ci/hostinger_readiness.py --check\ngovernance:readiness\n",
        ".bits/context.md": "python scripts/ci/hostinger_readiness.py --check\n",
        ".github/workflows/pr-governance.yml": "jobs:\n  review:\n    steps:\n      - run: python scripts/ci/hostinger_readiness.py --check\n",
        ".gitlab-ci.yml": "include:\n  - local: '.gitlab/ci/day21-submission.yml'\n",
        ".gitlab/ci/day21-submission.yml": "review:\n  script:\n    - python3 scripts/ci/hostinger_readiness.py --check\n",
        "apps/web/src/components/workspace/ProgressionPipeline.jsx": "governance:readiness\n",
    }
    for name, contents in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents)
    return contract


def git_listing(
    args: list[str], *, cwd: Path, **_kwargs: Any
) -> subprocess.CompletedProcess[bytes]:
    """Supply only filesystem inventory; never create or change a test repository."""
    if args[:2] != ["git", "ls-files"]:
        raise AssertionError("Unexpected command in the source-inventory double.")
    declarations = args[args.index("--") + 1 :]
    names = sorted(
        path.relative_to(cwd).as_posix()
        for path in cwd.rglob("*")
        if path.is_file()
        and any(
            path.relative_to(cwd).as_posix() == name
            or path.relative_to(cwd).as_posix().startswith(name + "/")
            for name in declarations
        )
    )
    return subprocess.CompletedProcess(args, 0, ("\0".join(names) + "\0").encode(), b"")


class ReadinessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="hostinger-contract-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.contract = fixture(self.root)
        self.inventory = patch.object(
            readiness.subprocess, "run", side_effect=git_listing
        )
        self.inventory.start()
        self.addCleanup(self.inventory.stop)
        self.refresh()

    def refresh(self) -> str:
        """Record a fixture source review, without producing acceptance evidence."""
        value = readiness.source_snapshot(self.root, self.contract)
        write_json(self.root / readiness.LOCK, value)
        return readiness.digest(value)

    def test_current_contract_has_all_milestones_without_runtime_claims(self) -> None:
        report = readiness.assessment(self.root)
        self.assertEqual(len(report["pieces"]), 11)
        self.assertTrue(
            all(row["runtime_state"] == "UNMEASURED" for row in report["pieces"])
        )
        self.assertTrue(all(row["source_state"] == "HOLD" for row in report["pieces"]))
        self.assertFalse((self.root / "state/roadmap/sprint.json").exists())

    def test_source_change_new_helper_and_deleted_file_invalidate_review(self) -> None:
        for name in ("apps/web/example.js", "libs/new_helper.py", ".gitlab/ci/new_check.yml"):
            with self.subTest(name=name):
                (self.root / name).write_text("changed reviewed dependency\n")
                with self.assertRaisesRegex(readiness.ReadinessError, "stale"):
                    readiness.check_review(self.root)
                self.refresh()
        (self.root / "apps/web/example.js").unlink()
        with self.assertRaises(readiness.ReadinessError):
            readiness.check_review(self.root)

    def test_contract_rejects_missing_rationale_unknown_checks_and_dependency_cycles(
        self,
    ) -> None:
        mutations = [
            lambda x: x["pieces"][0].update(why=""),
            lambda x: x["pieces"][0].update(next_step=""),
            lambda x: x["pieces"][0].update(owner=""),
            lambda x: x["pieces"][0].update(checks=["run_arbitrary_shell"]),
            lambda x: x["pieces"][0].update(requires=["HS-11"]),
            lambda x: x["pieces"][0].update(runtime_requirements=["unknown"]),
            lambda x: x["pieces"][0].update(day=True),
            lambda x: x["pieces"][0].update(title="invented milestone"),
            lambda x: x["pieces"][1].update(id="HS-01"),
            lambda x: x["pieces"].pop(),
            lambda x: x.update(dispatch="invented authority"),
            lambda x: x.update(campaign_id="other-campaign"),
            lambda x: x["external_requirements"].append(x["external_requirements"][0]),
            lambda x: x["external_requirements"][0].update(evidence_required=""),
        ]
        for mutate in mutations:
            changed = copy.deepcopy(self.contract)
            mutate(changed)
            write_json(self.root / readiness.CONTRACT, changed)
            with (
                self.subTest(mutation=mutations.index(mutate)),
                self.assertRaises(readiness.ReadinessError),
            ):
                readiness.load_contract(self.root)

    def test_wiring_cannot_be_removed_or_hidden_in_comment(self) -> None:
        for name in (
            "AGENTS.md",
            ".bits/context.md",
            ".gitlab/ci/day21-submission.yml",
            "apps/web/src/components/workspace/ProgressionPipeline.jsx",
        ):
            path = self.root / name
            original = path.read_text()
            path.write_text(
                "# run: python scripts/ci/hostinger_readiness.py --check\n"
                if name.endswith(".yml")
                else ""
            )
            with self.subTest(path=name), self.assertRaises(readiness.ReadinessError):
                readiness.check_wiring(self.root)
            path.write_text(original)

    def test_cli_refresh_checks_and_report_never_create_sprint_completion(self) -> None:
        with redirect_stdout(io.StringIO()) as out, redirect_stderr(io.StringIO()):
            for mode in (["--refresh"], ["--check"], ["--json"], []):
                self.assertEqual(readiness.main(["--root", str(self.root), *mode]), 0)
            (self.root / "libs/example.py").write_text("changed")
            self.assertEqual(readiness.main(["--root", str(self.root), "--check"]), 1)
        self.assertIn("UNMEASURED", out.getvalue())
        self.assertFalse((self.root / "state/roadmap/sprint.json").exists())

    def test_briefing_reports_stale_review_and_wrapper_gates(self) -> None:
        self.assertEqual(agent_context.collect_readiness(self.root)["state"], "PASS")
        workflow = self.root / ".github/workflows/pr-governance.yml"
        workflow.write_text(
            workflow.read_text()
            + "      - run: python scripts/ci/hostinger_readiness.py --run dependency_lock\n"
        )
        pipeline = agent_context.collect_pipelines(self.root)[0]
        self.assertIn("scripts/ci/supply_chain.py", pipeline["scripts"])
        (self.root / "libs/example.py").write_text("new helper")
        self.assertEqual(agent_context.collect_readiness(self.root)["state"], "FAIL")

    def test_json_paths_times_and_lists_fail_closed(self) -> None:
        for raw in (
            b'{"status":1,"status":2}',
            b'{"status":NaN}',
            b"[]",
            b"broken",
            b'{"x":"' + b"x" * 4_000_001,
        ):
            with (
                self.subTest(raw=raw[:30]),
                self.assertRaises(readiness.ReadinessError),
            ):
                readiness.decode_json(raw)
        for value in (
            "../outside",
            "/tmp/outside",
            "apps//web",
            "apps/./web",
            "apps\\web",
        ):
            with self.subTest(value=value), self.assertRaises(readiness.ReadinessError):
                readiness.safe_path(self.root, value)
        (self.root / "link").symlink_to(self.root / "apps/web/example.js")
        with self.assertRaises(readiness.ReadinessError):
            readiness.safe_path(self.root, "link")
        for value in (
            "2026-09-20",
            "2026-02-30T00:00:00Z",
            "2026-09-20T00:00:00+01:00",
            None,
        ):
            with self.subTest(value=value), self.assertRaises(readiness.ReadinessError):
                readiness.instant(value)
        for value in ([], ["x", "x"], [1], [""]):
            with self.assertRaises(readiness.ReadinessError):
                readiness.strings(value)


class AcceptanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(
            prefix="hostinger-acceptance-test-"
        )
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        fixture(self.root)
        self.output = self.root / "receipts"
        self.source = "a" * 64

    def run_fixture(
        self,
        program: str,
        kind: str = "tap",
        *,
        artifacts: tuple[str, ...] = (),
        timeout: int = 5,
    ) -> tuple[Path, dict[str, Any]]:
        """Execute a real local Python process under a test-only fixed check definition."""
        check = checks.Check(("python", "-c", program), "source", kind, artifacts)
        with patch.dict(checks.CHECKS, {"fixture": check}):
            path = checks.run_check(
                self.root, self.output, "fixture", self.source, timeout=timeout
            )
            receipt = readiness.read_json(path)
            states = readiness.acceptance_state(
                self.root, self.output, self.source, datetime.now(timezone.utc)
            )
            self.assertEqual(states["fixture"], receipt["status"])
        return path, receipt

    def test_real_process_pass_failure_skip_empty_and_timeout_are_distinct(
        self,
    ) -> None:
        cases = [
            ("print('# tests 2\\n# fail 0\\n# skipped 0')", "PASS"),
            ("raise SystemExit(3)", "FAIL"),
            ("print('# tests 2\\n# fail 0\\n# skipped 1')", "HOLD"),
            ("print('No tests were executed')", "HOLD"),
        ]
        for program, expected in cases:
            path, receipt = self.run_fixture(program)
            self.assertEqual(receipt["status"], expected)
            self.assertEqual(
                receipt["log_sha256"],
                hashlib.sha256((self.output / receipt["log"]).read_bytes()).hexdigest(),
            )
            path.unlink()
        _, timed = self.run_fixture("import time; time.sleep(10)", timeout=1)
        self.assertEqual(timed["status"], "FAIL")
        self.assertIn("time limit", timed["reason"])

    def test_missing_command_and_wrong_native_runtime_are_blocked(self) -> None:
        with patch.dict(
            checks.CHECKS,
            {
                "fixture": checks.Check(
                    ("/missing-buildanddo-acceptance-command",), "source"
                )
            },
        ):
            receipt = readiness.read_json(
                checks.run_check(self.root, self.output, "fixture", self.source)
            )
            self.assertEqual(receipt["status"], "BLOCKED")
        for observed in ("", "PocketBase v0.28.3\n", "malformed\n"):
            with (
                patch.dict(
                    os.environ, {"BUILDANDDO_TEST_POCKETBASE": "synthetic-binary"}
                ),
                patch.object(
                    checks.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess([], 0, observed, ""),
                ),
            ):
                receipt = readiness.read_json(
                    checks.run_check(
                        self.root, self.output, "native_workspace", self.source
                    )
                )
            self.assertEqual(receipt["status"], "BLOCKED")
            self.assertEqual(receipt["runtime_expected"], "0.28.4")

    def test_native_profiles_require_the_real_version_format_and_later_failure_wins(
        self,
    ) -> None:
        definition = checks.Check(
            ("python", "-c", "print('Ran 1 test in 0.01s\\nOK')"), "native", "unittest"
        )
        with patch.dict(checks.CHECKS, {"fixture": definition}):
            for profile, version in (("package", "0.28.4"), ("compose", "0.28.3")):
                with patch.object(
                    checks.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess(
                        [], 0, "pocketbase version " + version + "\n", ""
                    ),
                ):
                    path = checks.run_check(
                        self.root, self.output, "fixture", self.source, profile
                    )
                result = readiness.read_json(path)
                self.assertEqual(result["status"], "PASS")
            states = readiness.acceptance_state(
                self.root, self.output, self.source, datetime.now(timezone.utc)
            )
            self.assertEqual(
                states, {"fixture:package": "PASS", "fixture:compose": "PASS"}
            )
            result.update(
                status="FAIL",
                exit_code=1,
                finished_at=datetime.now(timezone.utc).isoformat(),
            )
            write_json(self.output / "later-failure.json", result)
            self.assertEqual(
                readiness.acceptance_state(
                    self.root, self.output, self.source, datetime.now(timezone.utc)
                )["fixture:compose"],
                "FAIL",
            )

    def test_required_artifact_must_be_produced_by_this_run(self) -> None:
        target = self.root / "built.html"
        target.write_text("old output")
        os.utime(target, (1, 1))
        path, stale = self.run_fixture("pass", "", artifacts=("built.html",))
        self.assertEqual(stale["status"], "FAIL")
        path.unlink()
        _, fresh = self.run_fixture(
            "from pathlib import Path; Path('built.html').write_text('new artifact')",
            "",
            artifacts=("built.html",),
        )
        self.assertEqual(fresh["status"], "PASS")

    def test_final_candidate_binding_requires_unchanged_committed_source(self) -> None:
        definition = checks.Check(
            ("python", "-c", "print('# tests 1\\n# fail 0\\n# skipped 0')"),
            "source",
            "tap",
        )
        sha = "a" * 40
        with patch.dict(checks.CHECKS, {"fixture": definition}):
            for final, expected in (
                ((sha, True), "PASS"),
                ((sha, False), "INVALID"),
                (("b" * 40, True), "INVALID"),
            ):
                with patch.object(
                    checks, "candidate_binding", side_effect=[(sha, True), final]
                ):
                    path = checks.run_check(
                        self.root, self.output, "fixture", self.source
                    )
                states = readiness.acceptance_state(
                    self.root, self.output, self.source, datetime.now(timezone.utc), sha
                )
                self.assertEqual(states["fixture"], expected)
                receipt = readiness.read_json(path)
                self.assertEqual(receipt["candidate_sha"], sha)
                path.unlink()

    def test_equal_time_conflicting_receipts_cannot_select_a_passing_filename(
        self,
    ) -> None:
        program = "print('# tests 1\\n# fail 0\\n# skipped 0')"
        path, original = self.run_fixture(program)
        definition = checks.Check(("python", "-c", program), "source", "tap")
        write_json(
            self.output / "000-failure.json",
            {**original, "status": "FAIL", "exit_code": 1},
        )
        with patch.dict(checks.CHECKS, {"fixture": definition}):
            self.assertEqual(
                readiness.acceptance_state(
                    self.root, self.output, self.source, datetime.now(timezone.utc)
                )["fixture"],
                "INVALID",
            )

    def test_counts_cover_cancelled_unittest_and_junit_failures(self) -> None:
        self.assertEqual(
            checks.test_counts(
                "# tests 3\n# fail 0\n# cancelled 1\n# todo 1\n", "tap", self.root
            )["skipped"],
            2,
        )
        self.assertEqual(
            checks.test_counts(
                "Ran 5 tests in 1s\nFAILED (failures=1, errors=1, skipped=2)",
                "unittest",
                self.root,
            ),
            {"tests": 5, "failures": 2, "skipped": 2},
        )
        path = self.root / "reports/junit/web.xml"
        path.parent.mkdir(parents=True)
        path.write_text(
            "<testsuites><testsuite><testcase/><testcase><skipped/></testcase><testcase><failure/></testcase><testcase><error/></testcase></testsuite></testsuites>"
        )
        self.assertEqual(
            checks.test_counts("", "junit", self.root),
            {"tests": 4, "failures": 2, "skipped": 1},
        )
        path.write_text("broken")
        self.assertEqual(checks.test_counts("", "junit", self.root)["tests"], 0)

    def test_receipt_tampering_future_dates_and_changed_source_cannot_pass(
        self,
    ) -> None:
        program = "print('# tests 1\\n# fail 0\\n# skipped 0')"
        definition = checks.Check(("python", "-c", program), "source", "tap")
        path, original = self.run_fixture(program)
        now = datetime.now(timezone.utc)
        changes = [
            ({"counts": {"tests": 99, "failures": 0, "skipped": 0}}, "INVALID"),
            ({"log_sha256": "0" * 64}, "INVALID"),
            ({"source_sha256": "0" * 64}, "STALE"),
            ({"finished_at": (now + timedelta(hours=1)).isoformat()}, "INVALID"),
            ({"argv": ["invented"]}, "STALE"),
            ({"exit_code": 1}, "INVALID"),
        ]
        with patch.dict(checks.CHECKS, {"fixture": definition}):
            for change, expected in changes:
                write_json(path, {**original, **change})
                with self.subTest(change=change):
                    self.assertEqual(
                        readiness.acceptance_state(
                            self.root, self.output, self.source, now
                        )["fixture"],
                        expected,
                    )
            write_json(path, original)
            self.assertEqual(
                readiness.acceptance_state(
                    self.root, self.output, self.source, now + timedelta(days=3)
                )["fixture"],
                "STALE",
            )
            write_json(path, {**original, "check": "unknown"})
            with self.assertRaises(readiness.ReadinessError):
                readiness.acceptance_state(self.root, self.output, self.source, now)

    def test_command_globs_are_fixed_and_native_profiles_are_explicit(self) -> None:
        command = checks.command(self.root, checks.CHECKS["source_python"])
        self.assertIn("tests.upgrade.test_example", command)
        self.assertNotIn("tests.upgrade.test_example_native", command)
        self.assertIn(
            "tests/upgrade/example.test.mjs",
            checks.command(self.root, checks.CHECKS["source_node"]),
        )
        self.assertEqual(checks.runtime_version(self.root, "compose"), "0.28.3")
        with self.assertRaises(ValueError):
            checks.runtime_version(self.root, "invented")
        (self.root / "apps/pocketbase/.pocketbase-version").write_text(
            "0.28; shell-command"
        )
        with self.assertRaises(ValueError):
            checks.runtime_version(self.root, "package")

    def test_source_selection_preserves_discovery_helper_imports(self) -> None:
        for directory in ("tests", "tests/upgrade"):
            (self.root / directory / "__init__.py").write_text("")
        (self.root / "tests/upgrade/sibling_helper.py").write_text("VALUE = 7\n")
        (self.root / "tests/upgrade/test_imports.py").write_text(
            "import unittest\nfrom sibling_helper import VALUE\n"
            "class Imports(unittest.TestCase):\n"
            "    def test_real_sibling(self):\n"
            "        self.assertEqual(VALUE, 7)\n"
        )
        (self.root / "tests/upgrade/test_example_native.py").write_text(
            "raise AssertionError('Native checks must remain separate')\n"
        )
        result = readiness.read_json(
            checks.run_check(self.root, self.output, "source_python", self.source)
        )
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["counts"], {"tests": 1, "failures": 0, "skipped": 0})


if __name__ == "__main__":
    unittest.main(verbosity=2)
