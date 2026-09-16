# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/foundry/test_foundry.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/evidence.py, foundry/shared/federal_foundry/interfaces.py, foundry/shared/federal_foundry/portfolio.py, foundry/shared/federal_foundry/registry.py
# EnumType:    Test
# EnumEdges:   VALIDATES foundry/shared/federal_foundry/evidence.py; VALIDATES foundry/shared/federal_foundry/interfaces.py; VALIDATES foundry/shared/federal_foundry/portfolio.py; VALIDATES foundry/shared/federal_foundry/registry.py
# DAG Node:    foundry.tests
# Intent:      Verify all five registries, evidence gates, runner contracts and deterministic portfolio output.
# ───────────────────────────────────────────────────────────────

"""Verify the public federal foundry vertical slice."""

from __future__ import annotations

import asyncio
from contextlib import redirect_stderr, redirect_stdout
import importlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

from foundry.shared.federal_foundry import (
    BenchmarkHarness,
    BenchmarkResult,
    BenchmarkSpec,
    ClaimEvidenceCompiler,
    EvidenceRecord,
    ExperimentResult,
    ExperimentRunner,
    ExperimentSpec,
    FoundryValidationError,
    LaneResults,
    OpportunityRegistry,
    PortfolioCompiler,
    RequirementTracker,
    evidence_index,
)


ROOT = Path(__file__).resolve().parents[2]
FOUNDRY = ROOT / "foundry"
LANES = {
    "darpa-dv026-influence",
    "navair-acquisition-analysis",
    "daf-nv027-low-swap",
    "darpa-semantic-isr",
    "diu-sentinel-maritime",
}
OUTPUTS = {
    "requirements_matrix.md",
    "claim_evidence_matrix.md",
    "architecture.md",
    "experiment_plan.md",
    "results.json",
    "results.json.cgrf.yaml",
    "benchmark_report.md",
    "gap_report.md",
    "risk_register.md",
    "SOW.md",
    "commercialization.md",
    "whitepaper.md",
    "submission_checklist.md",
    "slides/README.md",
}


def files(root: Path) -> dict[str, bytes]:
    """Return relative file bytes for deterministic output comparison."""

    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


class RegistryTests(unittest.TestCase):
    """Exercise the real opportunity records and lane scaffolds."""

    def setUp(self) -> None:
        self.registry = OpportunityRegistry(FOUNDRY)

    def test_all_five_opportunities_validate_and_unknown_facts_stay_open(self) -> None:
        self.assertEqual(set(self.registry.lane_ids()), LANES)
        for lane_id in self.registry.lane_ids():
            opportunity = self.registry.load(lane_id)
            self.assertEqual(opportunity.lane_id, lane_id)
            self.assertIsNone(opportunity.deadline)
            self.assertTrue(opportunity.requirements)
            self.assertTrue(opportunity.eligibility)
            self.assertTrue(
                all(item["status"] == "unverified" for item in opportunity.eligibility)
            )
            self.assertTrue(opportunity.evidence_required)
            self.assertTrue(opportunity.evidence_missing)
            self.assertTrue(opportunity.submission_format)
        influence = self.registry.load("darpa-dv026-influence")
        self.assertEqual(influence.submission_format["page_limit"], 10)
        self.assertEqual(influence.submission_format["slide_count"], 5)
        self.assertEqual(influence.submission_format["funding_ceiling_usd"], 300000)
        self.assertEqual(
            self.registry.load("navair-acquisition-analysis").submission_format[
                "software_deliverable"
            ],
            "Docker image",
        )
        semantic = self.registry.load("darpa-semantic-isr")
        self.assertIn("physical run", semantic.deliverables[-1]["status"])

    def test_every_lane_has_the_standard_output_surface(self) -> None:
        for lane_id in LANES:
            lane_root = FOUNDRY / "lanes" / lane_id
            actual = {
                str(path.relative_to(lane_root))
                for path in lane_root.rglob("*")
                if path.is_file()
            }
            self.assertEqual(actual, OUTPUTS | {"experiment.yaml"})
            results = self.registry.load_results(lane_id)
            self.assertEqual(results.lane_id, lane_id)
            self.assertFalse(results.experiments)
            self.assertFalse(results.benchmarks)

    def test_registry_rejects_unknown_lanes_and_mismatched_results(self) -> None:
        with self.assertRaisesRegex(FoundryValidationError, "unknown foundry lane"):
            self.registry.load("../other")
        raw = json.loads(
            (FOUNDRY / "lanes/darpa-dv026-influence/results.json").read_text()
        )
        raw["lane_id"] = "wrong-lane"
        self.assertEqual(LaneResults.from_mapping(raw).lane_id, "wrong-lane")

    def test_registry_reports_schema_yaml_and_result_identity_failures(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            foundry = Path(temporary)
            registry_root = foundry / "registry"
            registry_root.mkdir()
            schema = registry_root / "opportunity.schema.json"
            schema.write_text("{}")
            with self.assertRaisesRegex(FoundryValidationError, "omits canonical"):
                OpportunityRegistry(foundry)
            schema.write_bytes(
                (FOUNDRY / "registry/opportunity.schema.json").read_bytes()
            )
            lane = registry_root / "darpa-dv026-influence"
            lane.mkdir()
            opportunity_path = lane / "opportunity.yaml"
            opportunity_path.write_text("[")
            temporary_registry = OpportunityRegistry(foundry)
            with self.assertRaisesRegex(FoundryValidationError, "cannot read"):
                temporary_registry.load("darpa-dv026-influence")
            opportunity_path.write_bytes(
                (
                    FOUNDRY / "registry/darpa-dv026-influence/opportunity.yaml"
                ).read_bytes()
            )
            results_root = foundry / "lanes/darpa-dv026-influence"
            results_root.mkdir(parents=True)
            raw = json.loads(
                (FOUNDRY / "lanes/darpa-dv026-influence/results.json").read_text()
            )
            raw["lane_id"] = "wrong-lane"
            (results_root / "results.json").write_text(json.dumps(raw))
            with self.assertRaisesRegex(FoundryValidationError, "does not match"):
                temporary_registry.load_results("darpa-dv026-influence")


class EvidenceTests(unittest.TestCase):
    """Exercise requirement and claim promotion gates."""

    def setUp(self) -> None:
        self.opportunity = OpportunityRegistry(FOUNDRY).load("darpa-dv026-influence")
        self.observed = EvidenceRecord(
            "TEST-EV-OBS",
            "Observed run",
            "observed",
            "tests/fixture/observed.json",
        )
        self.verified = EvidenceRecord(
            "TEST-EV-VER",
            "Verified run",
            "verified",
            "tests/fixture/verified.json",
            "a" * 64,
            ("DV026-REQ-01",),
            ("DV026-CLM-01",),
            {
                "reviewer": "fixture-reviewer",
                "method": "fixture assertion",
                "scope": "fixture-only requirement and claim",
                "reviewed_at": "2026-09-16T00:00:00Z",
                "outcome": "pass",
                "digest": "a" * 64,
            },
        )

    def test_satisfied_requirements_require_verified_evidence(self) -> None:
        tracker = RequirementTracker(
            self.opportunity, evidence_index((self.observed, self.verified))
        )
        with self.assertRaisesRegex(FoundryValidationError, "needs verified evidence"):
            tracker.apply(
                [
                    {
                        "id": "DV026-REQ-01",
                        "status": "satisfied",
                        "evidence_ids": [self.observed.evidence_id],
                    }
                ]
            )
        tracker.apply(
            [
                {
                    "id": "DV026-REQ-01",
                    "status": "satisfied",
                    "evidence_ids": [self.verified.evidence_id],
                }
            ]
        )
        row = {item.requirement_id: item for item in tracker.rows()}["DV026-REQ-01"]
        self.assertEqual(row.status, "satisfied")
        self.assertIn("DV026-REQ-01", tracker.to_markdown())
        self.assertFalse(tracker.is_complete())

    def test_partial_and_not_applicable_statuses_have_evidence_rules(self) -> None:
        tracker = RequirementTracker(self.opportunity, {})
        with self.assertRaisesRegex(FoundryValidationError, "needs observed evidence"):
            tracker.apply([{"id": "DV026-REQ-01", "status": "partial"}])
        with self.assertRaisesRegex(FoundryValidationError, "justification"):
            tracker.apply([{"id": "DV026-REQ-01", "status": "not_applicable"}])
        with self.assertRaisesRegex(FoundryValidationError, "unknown requirement"):
            tracker.apply([{"id": "UNKNOWN", "status": "open"}])

    def test_claim_compiler_rejects_unsupported_promotion(self) -> None:
        available = tuple(
            EvidenceRecord.from_mapping(record, f"evidence_available[{index}]")
            for index, record in enumerate(self.opportunity.evidence_available)
        )
        compiler = ClaimEvidenceCompiler(
            self.opportunity,
            evidence_index((*available, self.observed, self.verified)),
        )
        with self.assertRaisesRegex(FoundryValidationError, "lacks verified evidence"):
            compiler.compile(
                [
                    {
                        "id": "DV026-CLM-01",
                        "assertion_level": "verified",
                        "evidence_ids": [self.observed.evidence_id],
                    }
                ]
            )
        rows = compiler.compile(
            [
                {
                    "id": "DV026-CLM-01",
                    "assertion_level": "verified",
                    "evidence_ids": [self.verified.evidence_id],
                }
            ]
        )
        compiled = {row.claim_id: row for row in rows}
        self.assertEqual(compiled["DV026-CLM-01"].support_level, "verified")
        self.assertIn("Supported", compiler.to_markdown(rows))

    def test_duplicate_and_unknown_evidence_references_fail(self) -> None:
        with self.assertRaisesRegex(FoundryValidationError, "duplicate evidence"):
            evidence_index((self.observed, self.observed))
        compiler = ClaimEvidenceCompiler(self.opportunity, {})
        with self.assertRaisesRegex(FoundryValidationError, "unknown evidence"):
            compiler.compile(
                [
                    {
                        "id": "DV026-CLM-01",
                        "assertion_level": "proposed",
                        "evidence_ids": ["MISSING"],
                    }
                ]
            )


class InterfaceTests(unittest.TestCase):
    """Exercise typed asynchronous runner and benchmark contracts."""

    def test_runner_and_benchmark_protocols_accept_bounded_implementations(
        self,
    ) -> None:
        class Runner:
            async def run(
                self, spec: ExperimentSpec, workspace: Path
            ) -> ExperimentResult:
                return ExperimentResult(spec.experiment_id, "succeeded", {"score": 1})

        class Harness:
            async def run(
                self, spec: BenchmarkSpec, workspace: Path
            ) -> BenchmarkResult:
                return BenchmarkResult(spec.benchmark_id, "succeeded", {"latency": 2.5})

        runner = Runner()
        harness = Harness()
        self.assertIsInstance(runner, ExperimentRunner)
        self.assertIsInstance(harness, BenchmarkHarness)
        experiment = asyncio.run(
            runner.run(ExperimentSpec("experiment-1", ("run",), 7), ROOT)
        )
        benchmark = asyncio.run(
            harness.run(
                BenchmarkSpec("benchmark-1", "candidate-a", "dataset-v1", ("latency",)),
                ROOT,
            )
        )
        self.assertEqual(experiment.metrics, {"score": 1.0})
        self.assertEqual(benchmark.measurements, {"latency": 2.5})

    def test_interfaces_reject_invalid_commands_statuses_and_metrics(self) -> None:
        with self.assertRaises(FoundryValidationError):
            ExperimentSpec("", (), -1)
        with self.assertRaisesRegex(
            FoundryValidationError, "unknown experiment status"
        ):
            ExperimentResult("experiment-1", "unknown", {})
        with self.assertRaisesRegex(FoundryValidationError, "finite"):
            ExperimentResult("experiment-1", "failed", {"score": float("nan")})
        with self.assertRaises(FoundryValidationError):
            BenchmarkSpec("benchmark-1", "", "", (), 0)
        with self.assertRaisesRegex(FoundryValidationError, "unknown benchmark status"):
            BenchmarkResult("benchmark-1", "unknown", {})


class PortfolioTests(unittest.TestCase):
    """Exercise deterministic, source-preserving portfolio compilation."""

    def test_portfolio_compiles_twice_to_identical_bytes(self) -> None:
        source_results = files(FOUNDRY / "lanes")
        compiler = PortfolioCompiler(ROOT)
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            first = parent / "first"
            second = parent / "second"
            manifest = compiler.compile_portfolio(first)
            compiler.compile_portfolio(second)
            self.assertEqual(files(first), files(second))
            self.assertEqual({item["lane_id"] for item in manifest["lanes"]}, LANES)
            self.assertTrue(manifest["human_review_required"])
            self.assertTrue(
                all(
                    not item["engineering_requirements_complete"]
                    for item in manifest["lanes"]
                )
            )
            self.assertIn(
                "No row is submission approval",
                (first / "portfolio_index.md").read_text(),
            )
            for lane_id in LANES:
                lane_output = first / lane_id
                self.assertTrue((lane_output / "manifest.json").is_file())
                self.assertIn(
                    "Declared evidence gaps",
                    (lane_output / "gap_report.md").read_text(),
                )
                self.assertIn(
                    "final human or portal boxes",
                    (lane_output / "submission_checklist.md").read_text(),
                )
        self.assertEqual(source_results, files(FOUNDRY / "lanes"))

    def test_compiler_refuses_to_overwrite_an_output(self) -> None:
        compiler = PortfolioCompiler(ROOT)
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(
                FoundryValidationError, "output already exists"
            ):
                compiler.compile_portfolio(Path(temporary))

    def test_command_line_compiles_one_lane_and_reports_validation_errors(self) -> None:
        command = importlib.import_module("foundry.shared.federal_foundry.__main__")
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "lane"
            stdout = io.StringIO()
            arguments = [
                "federal_foundry",
                "--root",
                str(ROOT),
                "--output",
                str(output),
                "--lane",
                "darpa-dv026-influence",
            ]
            original = sys.argv
            try:
                sys.argv = arguments
                with redirect_stdout(stdout):
                    self.assertEqual(command.main(), 0)
                self.assertEqual(
                    json.loads(stdout.getvalue())["lane_id"],
                    "darpa-dv026-influence",
                )
                sys.argv = arguments
                with (
                    redirect_stderr(io.StringIO()),
                    self.assertRaises(SystemExit) as raised,
                ):
                    command.main()
                self.assertEqual(raised.exception.code, 2)
            finally:
                sys.argv = original


if __name__ == "__main__":
    unittest.main()
