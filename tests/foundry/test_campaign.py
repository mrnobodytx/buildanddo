# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/foundry/test_campaign.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/benchmarks.py, foundry/shared/federal_foundry/portfolio.py, foundry/shared/federal_foundry/reporting.py, foundry/shared/federal_foundry/__main__.py
# EnumType:    Test
# EnumEdges:   VALIDATES foundry/shared/federal_foundry/benchmarks.py; VALIDATES foundry/shared/federal_foundry/portfolio.py; VALIDATES foundry/shared/federal_foundry/reporting.py; VALIDATES foundry/shared/federal_foundry/__main__.py
# DAG Node:    none
# Intent:      Verify real multi-lane comparisons and self-contained reproducible review exports, including cancellation, corruption and explicit failed outcomes.
# ───────────────────────────────────────────────────────────────

"""Exercise the complete five-lane execution, comparison and export workflow."""

from __future__ import annotations

import asyncio
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

from apps.mission_suite.bundle import SOURCE_FILES
from foundry.shared.federal_foundry import __main__ as cli
from foundry.shared.federal_foundry.benchmarks import (
    ReferenceBenchmarkHarness,
    distribution,
    load_plan,
    plan_from_document,
    run_campaign,
    summarize_lane,
    verify_campaign,
)
from foundry.shared.federal_foundry.interfaces import BenchmarkHarness, BenchmarkSpec
from foundry.shared.federal_foundry.models import FoundryValidationError
from foundry.shared.federal_foundry.portfolio import (
    PortfolioCompiler,
    package_bundle,
    verify_bundle,
)
from foundry.shared.federal_foundry.reporting import html_view
from foundry.shared.federal_foundry.validation import canonical, digest, manifest
from tests.foundry.test_foundry import ROOT, LANES, files


def source_copy(destination: Path) -> None:
    """Copy public foundry source and the exact existing mission-suite closure."""
    shutil.copytree(
        ROOT / "foundry",
        destination / "foundry",
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    for name in SOURCE_FILES:
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((ROOT / name).read_bytes())


def invoke(*arguments: str) -> tuple[int, dict]:
    """Call the actual CLI and parse its output without a shell."""
    output = io.StringIO()
    with redirect_stdout(output):
        code = cli.main(list(arguments))
    return code, json.loads(output.getvalue())


class PlanTests(unittest.TestCase):
    def test_all_lane_plans_pin_public_fixtures_and_bounded_comparisons(self) -> None:
        for lane in LANES:
            plan = load_plan(ROOT, lane)
            self.assertEqual(plan.lane_id, lane)
            self.assertEqual(len(plan.candidates), 2)
            self.assertEqual(plan.seeds, (17, 29, 43))
            self.assertEqual(plan.repetitions, 2)
            self.assertEqual(
                plan.document["dataset_sha256"], digest(plan.dataset_bytes)
            )
            self.assertEqual(plan.dataset["classification"], "PUBLIC")
            self.assertEqual(plan.dataset["kind"], "synthetic")

    def test_plan_refuses_hash_rights_scope_and_candidate_substitution(self) -> None:
        plan = load_plan(ROOT, "darpa-dv026-influence")
        for changes in (
            {"dataset_sha256": "a" * 64},
            {"candidates": ["unknown"]},
            {"requirement_ids": ["ISR-REQ-01"]},
            {"primary_metric": "not_measured"},
            {"seeds": [1, 1]},
            {"seeds": list(range(16)), "repetitions": 10},
            {"timeout_seconds": 0},
            {"repetitions": 1},
            {"command": ["unreviewed"]},
        ):
            with (
                self.subTest(changes=changes),
                self.assertRaises(FoundryValidationError),
            ):
                plan_from_document(
                    ROOT, {**plan.document, **changes}, plan.dataset_bytes
                )
        for change in (
            {"classification": "CUI"},
            {"kind": "live"},
            {"license": ""},
            {"lane_id": "foreign"},
        ):
            raw = canonical({**plan.dataset, **change})
            with self.assertRaises(FoundryValidationError):
                plan_from_document(
                    ROOT, {**plan.document, "dataset_sha256": digest(raw)}, raw
                )
        with self.assertRaises(FoundryValidationError):
            load_plan(ROOT, "../foreign")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shutil.copytree(
                ROOT / "foundry",
                root / "foundry",
                ignore=shutil.ignore_patterns("__pycache__"),
            )
            path = root / "foundry/lanes/darpa-dv026-influence/experiment.yaml"
            text = path.read_text()
            path.write_text(
                text.replace("dataset: foundry/fixtures/", "dataset: outside/")
            )
            with self.assertRaises(FoundryValidationError):
                load_plan(root, plan.lane_id)
            path.write_text(
                text.replace(
                    "lane_id: darpa-dv026-influence", "lane_id: darpa-semantic-isr"
                )
            )
            with self.assertRaises(FoundryValidationError):
                load_plan(root, plan.lane_id)

    def test_statistics_use_explicit_denominators_without_population_claims(
        self,
    ) -> None:
        summary = distribution([1, 2, 3, 4])
        self.assertEqual(summary["mean"], 2.5)
        self.assertEqual(summary["p50"], 2.5)
        self.assertEqual(summary["p95"], 3.85)
        self.assertEqual(summary["n"], 4)
        self.assertAlmostEqual(summary["stddev"], 1.2909944487)
        self.assertIsNone(summary["population_confidence_interval"])
        self.assertIsNone(distribution([2])["stddev"])
        with self.assertRaises(FoundryValidationError):
            distribution([])
        with self.assertRaises(FoundryValidationError):
            distribution([float("nan")])


class CampaignTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temporary = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.parent = Path(cls.temporary.name)
        cls.campaign = cls.parent / "campaign"
        code, outcome = invoke(
            "run",
            "--all",
            "--root",
            str(ROOT),
            "--output",
            str(cls.campaign),
            "--jobs",
            "4",
        )
        if code != 0 or outcome["status"] != "completed":
            raise AssertionError("CLI failed the real reference campaign")
        cls.result = json.loads((cls.campaign / "campaign.json").read_text())
        cls.bundle = cls.parent / "bundle"
        PortfolioCompiler(ROOT).compile_portfolio(cls.bundle, runs=cls.campaign)

    def test_sixty_real_attempts_cover_ten_candidates_and_repeated_seed_groups(
        self,
    ) -> None:
        checked = verify_campaign(ROOT, self.campaign)
        self.assertEqual(checked, self.result)
        self.assertEqual(checked["status"], "completed")
        self.assertEqual(checked["attempts"], 60)
        self.assertEqual(checked["planned_attempts"], 60)
        self.assertEqual(set(checked["lanes"]), LANES)
        for lane in LANES:
            summary, results = summarize_lane(ROOT, self.campaign / lane)
            self.assertEqual(summary["status"], "completed")
            self.assertEqual(len(results["experiments"]), 12)
            self.assertEqual(len(results["evidence"]), 12)
            self.assertEqual(len(results["benchmarks"]), 2)
            self.assertFalse(summary["submission_approval"])
            for candidate in summary["candidates"]:
                self.assertTrue(candidate["reproducible"])
                self.assertEqual(candidate["successful_attempts"], 6)
                self.assertEqual(candidate["metrics"]["elapsed_ms"]["n"], 3)
                self.assertGreater(candidate["metrics"]["peak_python_bytes"]["mean"], 0)
                self.assertTrue(candidate["local_criteria_pass"])
            self.assertTrue(
                all(
                    row["status"] == "partial" for row in results["requirement_updates"]
                )
            )
            self.assertFalse(results["claim_updates"])

    def test_compiler_derives_reports_slides_and_readiness_from_retained_evidence(
        self,
    ) -> None:
        verified = verify_bundle(self.bundle)
        self.assertEqual(verified["schema_version"], "foundry.portfolio/v2")
        readiness = json.loads((self.bundle / "readiness.json").read_text())
        for lane in LANES:
            output = self.bundle / lane
            summary = json.loads((self.campaign / lane / "summary.json").read_text())
            report = (output / "benchmark_report.md").read_text()
            brief = (output / "whitepaper.md").read_text()
            self.assertIn(summary["candidates"][0]["candidate_id"], report)
            self.assertIn("synthetic", brief.lower())
            self.assertEqual(len(list((output / "slides").glob("0*.md"))), 5)
            self.assertTrue((output / "authored/whitepaper.md").is_file())
            self.assertTrue((output / "run_evidence/summary.json").is_file())
            row = next(row for row in readiness["lanes"] if row["lane_id"] == lane)
            self.assertGreater(row["requirements"]["partial"], 0)
            self.assertEqual(row["requirements"]["satisfied"], 0)
            self.assertFalse(row["submission_ready"])
            self.assertGreater(len(row["blockers"]), 0)
            for evidence in json.loads((output / "results.json").read_text())[
                "evidence"
            ]:
                self.assertEqual(
                    digest((output / evidence["locator"]).read_bytes()),
                    evidence["digest"],
                )
            self.assertIn(
                "- [ ] A named human", (output / "submission_checklist.md").read_text()
            )
            self.assertIn(
                "Powered by Citadel Nexus Inc.", (output / "index.html").read_text()
            )

    def test_two_exports_and_archives_are_byte_identical_for_the_same_runs(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            other = parent / "other"
            original = files(self.campaign)
            PortfolioCompiler(ROOT).compile_portfolio(other, runs=self.campaign)
            self.assertEqual(files(self.bundle), files(other))
            first = parent / "first.zip"
            second = parent / "second.zip"
            a = package_bundle(self.bundle, first)
            b = package_bundle(other, second)
            self.assertEqual(a["sha256"], b["sha256"])
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as archive:
                self.assertIn("portfolio_index.md", archive.namelist())
                self.assertTrue(
                    all(
                        info.date_time == (1980, 1, 1, 0, 0, 0)
                        for info in archive.infolist()
                    )
                )
                archive.extractall(parent / "unpacked")
            verify_bundle(parent / "unpacked")
            self.assertEqual(files(self.campaign), original)
            with self.assertRaises(FoundryValidationError):
                package_bundle(other, first)
            with self.assertRaises(FoundryValidationError):
                package_bundle(other, other / "nested.zip")

    def test_campaign_recomputes_summaries_even_if_outer_hash_is_updated(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "changed"
            shutil.copytree(self.campaign, path)
            summary_path = path / "navair-acquisition-analysis/summary.json"
            summary = json.loads(summary_path.read_text())
            summary["candidates"][0]["metrics"]["ndcg_at_k"]["mean"] = 0.1
            summary_path.write_bytes(canonical(summary))
            outer_path = path / "campaign.json"
            outer = json.loads(outer_path.read_text())
            outer["artifacts"] = manifest(path, exclude=("campaign.json",))
            outer_path.write_bytes(canonical(outer))
            with self.assertRaisesRegex(FoundryValidationError, "summary differs"):
                verify_campaign(ROOT, path)
            destination = Path(tmp) / "refused"
            with self.assertRaises(FoundryValidationError):
                PortfolioCompiler(ROOT).compile_portfolio(destination, runs=path)
            self.assertFalse(destination.exists())

    def test_changed_dataset_and_cross_lane_runs_cannot_become_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "crossed"
            shutil.copytree(self.campaign, path)
            lane = path / "navair-acquisition-analysis"
            trial = lane / "runs/bm25/seed-17/repeat-1"
            wrong = (
                self.campaign
                / "darpa-dv026-influence/runs/truthful-auction/seed-17/repeat-1"
            )
            shutil.rmtree(trial)
            shutil.copytree(wrong, trial)
            with self.assertRaisesRegex(FoundryValidationError, "cross-lane"):
                summarize_lane(ROOT, lane)
            dataset_path = lane / "dataset.json"
            dataset_path.write_bytes(dataset_path.read_bytes() + b"\n")
            with self.assertRaisesRegex(FoundryValidationError, "fingerprint"):
                summarize_lane(ROOT, lane)

    def test_export_rejects_removed_extra_or_changed_files_and_authority_flags(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "export"
            shutil.copytree(self.bundle, output)
            extra = output / "unrecorded.txt"
            extra.write_text("extra")
            with self.assertRaises(FoundryValidationError):
                verify_bundle(output)
            extra.unlink()
            path = output / "portfolio_manifest.json"
            original = json.loads(path.read_text())
            for change in (
                {"submission_approval": True},
                {"human_review_required": False},
                {"schema_version": "unknown"},
            ):
                path.write_bytes(canonical({**original, **change}))
                with self.assertRaises(FoundryValidationError):
                    verify_bundle(output)
            path.write_bytes(canonical(original))
            (output / "index.html").unlink()
            with self.assertRaises(FoundryValidationError):
                package_bundle(output, Path(tmp) / "broken.zip")
            self.assertFalse((Path(tmp) / "broken.zip").exists())

    def test_actual_cli_status_verify_compile_and_replay_are_connected(self) -> None:
        code, status = invoke(
            "status", "--root", str(ROOT), "--runs", str(self.campaign)
        )
        self.assertEqual(code, 0)
        self.assertTrue(
            all(row["reference_campaign"] == "completed" for row in status["lanes"])
        )
        code, empty = invoke("status", "--root", str(ROOT))
        self.assertEqual(code, 0)
        self.assertTrue(
            all(row["reference_campaign"] == "not_completed" for row in empty["lanes"])
        )
        for path in (
            self.campaign,
            self.bundle,
            self.campaign / "navair-acquisition-analysis/runs/bm25/seed-17/repeat-1",
        ):
            code, value = invoke("verify", str(path), "--root", str(ROOT))
            self.assertEqual((code, value["state"]), (0, "MATCH"))
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "lane"
            code, value = invoke(
                "compile",
                "--root",
                str(ROOT),
                "--runs",
                str(self.campaign),
                "--lane",
                "navair-acquisition-analysis",
                "--output",
                str(output),
                "--archive",
                str(Path(tmp) / "lane.zip"),
            )
            self.assertEqual(code, 0)
            self.assertTrue(Path(value["archive"]["archive"]).is_file())
            code, replay = invoke(
                "replay",
                str(
                    self.campaign
                    / "navair-acquisition-analysis/runs/bm25/seed-17/repeat-1"
                ),
                "--root",
                str(ROOT),
                "--output",
                str(Path(tmp) / "replay"),
            )
            self.assertEqual((code, replay["state"]), (0, "MATCH"))
            with (
                redirect_stderr(io.StringIO()),
                self.assertRaises(SystemExit) as failed,
            ):
                cli.main(
                    [
                        "compile",
                        "--root",
                        str(Path(tmp) / "missing"),
                        "--output",
                        str(output),
                    ]
                )
            self.assertEqual(failed.exception.code, 2)

    def test_read_only_html_escapes_untrusted_titles_and_blocker_text(self) -> None:
        status = json.loads((self.bundle / "readiness.json").read_text())["lanes"][0]
        status["blockers"] = [
            {"id": "<script>", "kind": "source", "reason": "<img src=x onerror=run()>"}
        ]
        result = html_view("<script>alert(1)</script>", [status], {}, portfolio=False)
        self.assertNotIn("<script>", result)
        self.assertIn("&lt;script&gt;", result)
        self.assertNotIn("<img", result)


class CampaignFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_saved_campaign_cannot_be_compiled_under_an_edited_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            source_copy(root)
            lane = "navair-acquisition-analysis"
            output = Path(tmp) / "campaign"
            await run_campaign(root, output, lane_ids=(lane,), jobs=4)
            path = root / f"foundry/lanes/{lane}/experiment.yaml"
            path.write_text(
                path.read_text().replace("repetitions: 2", "repetitions: 3")
            )
            with self.assertRaisesRegex(FoundryValidationError, "current plan"):
                verify_campaign(root, output)
            with self.assertRaises(FoundryValidationError):
                PortfolioCompiler(root).compile_lane(
                    lane, Path(tmp) / "refused", runs=output
                )
            self.assertFalse((Path(tmp) / "refused").exists())

    async def test_failed_trials_remain_failed_and_never_promote_partial_groups(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "source"
            source_copy(root)
            lane = "darpa-dv026-influence"
            plan = load_plan(root, lane)
            original_bytes = plan.dataset_bytes
            changed = {**plan.dataset, "agents": []}
            dataset_bytes = canonical(changed)
            dataset_path = root / str(plan.document["dataset"])
            dataset_path.write_bytes(dataset_bytes)
            plan_path = root / f"foundry/lanes/{lane}/experiment.yaml"
            plan_path.write_text(
                plan_path.read_text().replace(
                    digest(original_bytes), digest(dataset_bytes)
                )
            )
            output = Path(tmp) / "failed"
            campaign = await run_campaign(root, output, lane_ids=(lane,), jobs=2)
            self.assertEqual(campaign["status"], "failed")
            verify_campaign(root, output)
            summary, results = summarize_lane(root, output / lane)
            self.assertEqual(len(summary["failed_attempts"]), 12)
            self.assertFalse(results["evidence"])
            self.assertFalse(results["requirement_updates"])
            self.assertTrue(
                all(
                    not row["local_criteria_pass"] and row["successful_attempts"] == 0
                    for row in summary["candidates"]
                )
            )
            bundle = Path(tmp) / "failed-review"
            PortfolioCompiler(root).compile_lane(lane, bundle, runs=output)
            self.assertIn("nonzero_exit", (bundle / "benchmark_report.md").read_text())

    async def test_cancelled_campaign_keeps_started_receipts_without_claiming_completion(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "cancelled"
            task = asyncio.create_task(
                run_campaign(ROOT, output, lane_ids=("darpa-dv026-influence",), jobs=1)
            )
            # Wait for the staged child to start, then cancel the actual campaign.
            for _ in range(200):
                if list(Path(tmp).glob(".foundry-*/**/request.json")):
                    break
                await asyncio.sleep(0.01)
            else:
                self.fail("campaign child did not start")
            await asyncio.sleep(0.02)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            campaign = verify_campaign(ROOT, output)
            self.assertEqual(campaign["status"], "cancelled")
            self.assertGreater(campaign["attempts"], 0)
            self.assertLess(campaign["attempts"], campaign["planned_attempts"])
            self.assertTrue(list(output.glob("*/runs/*/seed-*/repeat-*/receipt.json")))
            with self.assertRaisesRegex(FoundryValidationError, "cancelled"):
                PortfolioCompiler(ROOT).compile_lane(
                    "darpa-dv026-influence", Path(tmp) / "refused", runs=output
                )

    async def test_reference_harness_runs_the_registered_candidate_through_the_real_runner(
        self,
    ) -> None:
        harness = ReferenceBenchmarkHarness(ROOT, "navair-acquisition-analysis")
        self.assertIsInstance(harness, BenchmarkHarness)
        spec = BenchmarkSpec(
            "bm25-reference",
            "bm25",
            str(harness.plan.document["dataset"]),
            ("ndcg_at_k", "elapsed_ms"),
            2,
        )
        with tempfile.TemporaryDirectory() as tmp:
            result = await harness.run(spec, Path(tmp) / "benchmark")
            self.assertEqual(result.status, "succeeded")
            self.assertEqual(result.measurements["ndcg_at_k"], 1)
            self.assertGreater(result.measurements["elapsed_ms"], 0)
            self.assertEqual(result.evidence[0].state, "observed")
            for changed in (
                BenchmarkSpec("wrong", "unknown", spec.dataset, spec.metrics, 2),
                BenchmarkSpec("wrong", "bm25", "different", spec.metrics, 2),
                BenchmarkSpec("wrong", "bm25", spec.dataset, ("unknown",), 2),
                BenchmarkSpec("wrong", "bm25", spec.dataset, spec.metrics, 1),
            ):
                with self.assertRaises(FoundryValidationError):
                    await harness.run(changed, Path(tmp) / "refused")

    async def test_invalid_selection_has_no_output_side_effects(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            destination = Path(tmp) / "invalid"
            for lanes, jobs in (
                ((), 4),
                (("unknown",), 4),
                (("darpa-dv026-influence",) * 2, 4),
                (None, 0),
            ):
                with self.assertRaises(FoundryValidationError):
                    await run_campaign(ROOT, destination, lane_ids=lanes, jobs=jobs)
                self.assertFalse(destination.exists())
