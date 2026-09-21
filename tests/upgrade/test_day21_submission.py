# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_day21_submission.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/day21_submission.py, tests/upgrade/test_day21_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/day21_submission.py; CONSUMES tests/upgrade/test_day21_support.py
# Intent:      Reject summary-only, stale, mismatched and tampered submission evidence before candidate packaging.
# ───────────────────────────────────────────────────────────────

"""Verify closure composition with synthetic receipts, never deployed acceptance."""

from __future__ import annotations

from contextlib import redirect_stdout, redirect_stderr
import copy
from datetime import timedelta
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts.ci import day21_submission as day21
from tests.upgrade.test_day21_support import candidate_fixture
from tests.upgrade.test_hostinger_readiness import fixture, write_json
from tests.upgrade.test_hostinger_replay import NOW, SHA, SOURCE, ReplayFixture


class CandidateEvidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(
            prefix="candidate-evidence-fixture-"
        )
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.contract = fixture(self.root)
        source = self.root / "capture"
        source.mkdir()
        self.capture = ReplayFixture(source, synthetic=False)
        self.evidence = self.root / "proof"
        self.index = candidate_fixture(self.root, self.evidence, self.capture)
        handle = patch.object(
            day21, "check_review", return_value=(self.contract, SOURCE)
        )
        handle.start()
        self.addCleanup(handle.stop)

    def audit(self) -> dict[str, object]:
        return day21.evidence_audit(self.evidence, NOW, root=self.root)

    def test_complete_fixture_revalidates_all_raw_receipts_and_replay(self) -> None:
        self.assertEqual(self.audit()["state"], "PASS")
        result = day21.validate_index(self.root, self.index, SHA, SOURCE, NOW)
        self.assertEqual(result["state"], "PASS")
        replay = result["items"]["demo-replay.json"]["value"]
        self.assertGreater(len(replay["captured_files"]), 9)
        self.assertEqual(replay["candidate_sha"], SHA)

    def test_arbitrary_eighteen_pass_strings_are_not_acceptance(self) -> None:
        path = self.evidence / "acceptance-summary.json"
        summary = json.loads(path.read_text())
        summary["profiles"] = {str(index): "PASS" for index in range(18)}
        write_json(path, summary)
        self.assertEqual(self.audit()["items"][path.name]["state"], "HOLD")

    def test_newer_failed_run_invalidates_old_passing_summary(self) -> None:
        path = self.evidence / "acceptance/source_node.json"
        later = json.loads(path.read_text())
        later.update(status="FAIL", exit_code=1, finished_at=NOW.isoformat())
        write_json(path.parent / "later-failure.json", later)
        self.assertEqual(
            self.audit()["items"]["acceptance-summary.json"]["state"], "HOLD"
        )

    def test_check_log_counts_runtime_artifact_and_candidate_are_rechecked(
        self,
    ) -> None:
        path = self.evidence / "acceptance/native_workspace-package.json"
        original = json.loads(path.read_text())
        summary_path = self.evidence / "acceptance-summary.json"
        summary = json.loads(summary_path.read_text())
        for changes in (
            {"counts": {"tests": 0, "failures": 0, "skipped": 0}},
            {"runtime_observed": "1.2.3"},
            {"candidate_sha": "0" * 40},
            {"candidate_clean": False},
            {"candidate_unchanged": False},
            {"source_sha256": "0" * 64},
            {"argv": ["invented"]},
        ):
            with self.subTest(changes=changes):
                write_json(path, {**original, **changes})
                summary["evidence"]["native_workspace:package"]["receipt"]["sha256"] = (
                    day21.file_digest(path)
                )
                write_json(summary_path, summary)
                self.assertEqual(
                    self.audit()["items"][summary_path.name]["state"], "HOLD"
                )
        write_json(path, original)
        summary["evidence"]["native_workspace:package"]["receipt"]["sha256"] = (
            day21.file_digest(path)
        )
        write_json(summary_path, summary)
        (self.root / "dist/apps/web/index.html").write_text("changed build")
        self.assertEqual(self.audit()["items"][summary_path.name]["state"], "HOLD")

    def test_summary_without_raw_replay_or_altered_raw_chain_cannot_pass(self) -> None:
        path = self.evidence / "demo-replay.json"
        value = json.loads(path.read_text())
        del value["capture"]
        write_json(path, value)
        self.assertEqual(self.audit()["items"][path.name]["state"], "HOLD")
        self.index.unlink()
        candidate_fixture(self.root, self.evidence, self.capture)
        (self.evidence / "replay/result.txt").write_text("changed after capture")
        self.assertEqual(self.audit()["items"][path.name]["state"], "HOLD")

    def test_public_response_bytes_and_browser_order_console_are_required(self) -> None:
        browser = self.evidence / "browser-journey.json"
        original = json.loads(browser.read_text())
        for change in (
            lambda data: data.update(console_error_count=1),
            lambda data: data["steps"].reverse(),
            lambda data: data["steps"][0].update(screenshots=[]),
            lambda data: data.pop("console"),
            lambda data: data.update(started_at=(NOW - timedelta(days=3)).isoformat()),
        ):
            data = copy.deepcopy(original)
            change(data)
            write_json(browser, data)
            self.assertEqual(self.audit()["items"][browser.name]["state"], "HOLD")
        write_json(browser, original)
        (self.evidence / "page.html").write_text("different response")
        self.assertEqual(self.audit()["items"]["public-url.json"]["state"], "HOLD")

    def test_product_proofs_and_candidate_artifact_continuity_are_required(
        self,
    ) -> None:
        path = self.evidence / "hostinger-products.json"
        original = json.loads(path.read_text())
        data = copy.deepcopy(original)
        data["products"][1]["evidence"] = data["products"][0]["evidence"]
        write_json(path, data)
        self.assertEqual(self.audit()["items"][path.name]["state"], "HOLD")
        for field, value in (
            ("candidate_sha", "0" * 40),
            ("artifact_tree_sha256", "0" * 64),
            ("source_sha256", "0" * 64),
        ):
            write_json(path, {**original, field: value})
            report = self.audit()
            self.assertEqual(report["items"]["candidate_continuity"]["state"], "HOLD")
            self.assertEqual(report["state"], "HOLD")

    def test_index_digest_path_escape_duplicate_json_and_symlinks_fail_closed(
        self,
    ) -> None:
        path = self.evidence / "architecture.json"
        path.write_text(path.read_text() + " ")
        with self.assertRaisesRegex(day21.Day21Error, "hash mismatch"):
            day21.validate_index(self.root, self.index, SHA, SOURCE, NOW)
        for name in ("../outside", "a/../b", "/absolute", "a\\b"):
            with self.assertRaises(day21.Day21Error):
                day21.contained(self.evidence, name)
        link = self.evidence / "link.txt"
        link.symlink_to(self.evidence / "page.html")
        with self.assertRaises(day21.Day21Error):
            day21.contained(self.evidence, link.name)
        path.write_text('{"duplicate":1,"duplicate":2}')
        with self.assertRaises(day21.Day21Error):
            day21.strict_json(path)

    def test_acceptance_export_preserves_failure_history_and_refuses_overwrite(
        self,
    ) -> None:
        with patch.object(day21, "candidate_binding", return_value=(SHA, True)):
            exported = day21.export_acceptance(
                self.root,
                self.evidence / "acceptance",
                self.root / "export",
                SHA,
                now=NOW,
            )
            self.assertEqual(json.loads(exported.read_text())["state"], "PASS")
            with self.assertRaises(day21.Day21Error):
                day21.export_acceptance(
                    self.root, self.evidence / "acceptance", self.root / "export", SHA
                )
            failed = json.loads(
                (self.evidence / "acceptance/source_node.json").read_text()
            )
            failed.update(status="FAIL", finished_at=NOW.isoformat())
            write_json(self.evidence / "acceptance/later-fail.json", failed)
            exported = day21.export_acceptance(
                self.root,
                self.evidence / "acceptance",
                self.root / "failure-export",
                SHA,
                now=NOW,
            )
            self.assertEqual(json.loads(exported.read_text())["state"], "HOLD")
            self.assertTrue((exported.parent / "acceptance/source_node.json").is_file())
            self.assertTrue((exported.parent / "acceptance/later-fail.json").is_file())
        with patch.object(day21, "candidate_binding", return_value=(SHA, False)):
            with self.assertRaises(day21.Day21Error):
                day21.export_acceptance(
                    self.root, self.evidence / "acceptance", self.root / "dirty", SHA
                )

    def test_bundle_preserves_relative_raw_evidence_and_remains_owner_review_only(
        self,
    ) -> None:
        for name in day21.REQUIRED_REPO_PATHS:
            path = self.root / name
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("Synthetic repository fixture\n")
        for name, contents in {
            "apps/web/src/pages/HostingerChallengePage.jsx": "Synthetic page",
            "apps/web/src/App.jsx": "HostingerChallengePage",
            "apps/web/src/lib/publicPages.js": "const SITE_ORIGIN = 'https://demo.example.org'; const path = '/hostinger-challenge';",
            ".gitlab/ci/day21-submission.yml": "Synthetic lane",
            "README.md": "**Live site:** https://demo.example.org\n",
        }.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(contents)
        output = self.root / "bundle"
        args = dict(
            title="Synthetic entry",
            target_audience="Fixture users",
            problem="Fixture problem",
            solution="Fixture solution",
            pitch="Fixture pitch",
            now=NOW,
        )
        result = day21.compile_bundle(self.root, self.evidence, output, **args)
        self.assertEqual(result["submission_state"], "READY_FOR_OWNER_REVIEW")
        self.assertEqual(result["authority_effect"], "NONE")
        self.assertTrue((output / "evidence/replay/result.txt").is_file())
        self.assertTrue((output / "evidence/artifacts/reports/junit/web.xml").is_file())
        self.assertEqual(
            day21.evidence_audit(output / "evidence", NOW, root=self.root)["state"],
            "PASS",
        )
        index = json.loads((output / "BUNDLE_INDEX.json").read_text())
        for item in index["files"]:
            self.assertEqual(item["sha256"], day21.file_digest(output / item["path"]))
        with self.assertRaises(day21.Day21Error):
            day21.compile_bundle(self.root, self.evidence, output, **args)

    def test_cli_drafts_are_unmeasured_and_missing_evidence_is_hold(self) -> None:
        output = io.StringIO()
        path = self.root / "draft"
        with redirect_stdout(output), redirect_stderr(io.StringIO()):
            self.assertEqual(
                day21.main(
                    ["templates", "--root", str(self.root), "--evidence", str(path)]
                ),
                0,
            )
            self.assertEqual(
                day21.main(
                    [
                        "audit",
                        "--root",
                        str(self.root),
                        "--evidence",
                        str(path),
                        "--json",
                    ]
                ),
                1,
            )
            self.assertEqual(day21.main(["acceptance", "--root", str(self.root)]), 1)
            self.assertEqual(day21.main(["index", "--evidence", str(self.evidence)]), 1)
        self.assertEqual(
            json.loads((path / "acceptance-summary.json").read_text())["state"],
            "UNMEASURED",
        )
        self.assertIn('"official_rules"', output.getvalue())


if __name__ == "__main__":
    unittest.main()
