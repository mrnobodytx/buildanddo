# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_federal_foundry.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/federal_foundry/catalog.py, apps/federal_foundry/protocol.py, apps/federal_foundry/evidence.py, apps/federal_foundry/compiler.py, apps/mission_suite/bundle.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/federal_foundry/catalog.py; DEPENDS_ON apps/federal_foundry/protocol.py; DEPENDS_ON apps/federal_foundry/evidence.py; DEPENDS_ON apps/federal_foundry/compiler.py; DEPENDS_ON apps/mission_suite/bundle.py
# DAG Node:    none
# Intent:      Verify five-lane intake, provider independence, exact evidence checks and portable compilation using clearly labeled synthetic test data.
# ───────────────────────────────────────────────────────────────

"""Exercise the actual portfolio engine using explicitly synthetic receipts."""

from __future__ import annotations

import asyncio
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from apps.federal_foundry.__main__ import main, read_json
from apps.federal_foundry.catalog import (
    DELIVERABLES,
    ROOT,
    FoundryError,
    lane_for,
    load_catalog,
    relative_path,
    seeds,
    validate_catalog,
)
from apps.federal_foundry.compiler import (
    compile_portfolio,
    json_text,
    markdown,
    yaml_text,
)
from apps.federal_foundry.evidence import aggregate, compare, evaluate
from apps.federal_foundry.protocol import (
    CAPABILITIES,
    LIMITS,
    DispatchBinding,
    ModelBinding,
    accept_output,
    make_task,
    request_for,
    run_task,
)
from apps.mission_suite.bundle import SOURCE_FILES, package, source_fingerprint
from apps.research.contracts import ResearchError
from scripts.ci.agent_context import parse_registry

AT = "2026-09-16T12:00:00Z"
MEASURED = "2026-09-16T10:00:00Z"
REVIEWED = "2026-09-16T11:00:00Z"


def checksum(data: bytes) -> str:
    """Hash explicit synthetic fixture bytes."""
    return hashlib.sha256(data).hexdigest()


class SyntheticEvidence(unittest.TestCase):
    """Create public, synthetic receipt files without a model, device or workspace."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="buildanddo-federal-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.catalog = load_catalog()
        self.lane_id = "influence"
        self.serial = 0
        self.manifest = {
            "schema_version": "federal.evidence/v1",
            "lane_id": self.lane_id,
            "evaluated_at": AT,
            "receipts": [],
            "reviews": [],
        }

    def use_lane(self, lane_id: str) -> None:
        self.lane_id = lane_id
        self.manifest["lane_id"] = lane_id

    def write_json(self, name: str, data: object) -> dict[str, str]:
        raw = json.dumps(data, sort_keys=True).encode("utf-8")
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        return {"path": name, "sha256": checksum(raw)}

    def add(
        self,
        requirement_id: str = "market-kernel",
        candidate_id: str = "auction-baseline",
        review: str | None = "accepted",
        **changes: object,
    ) -> tuple[dict[str, object], dict[str, str]]:
        self.serial += 1
        lane = lane_for(self.catalog, self.lane_id)
        requirement = next(
            row for row in lane["requirements"] if row["id"] == requirement_id
        )
        metric_id = requirement["metric_id"]
        metric = next((row for row in lane["metrics"] if row["id"] == metric_id), None)
        observed_seeds = lane["experiment"]["seeds"] if metric else []
        data = {
            "schema_version": "federal.measurement/v1",
            "record_id": "fixture-" + str(self.serial),
            "lane_id": self.lane_id,
            "requirement_id": requirement_id,
            "candidate_id": candidate_id,
            "kind": requirement["kind"],
            "outcome": "pass",
            "measured_at": MEASURED,
            "producer": {"seat": "fixture-builder", "model": None},
            "source_sha256": checksum(candidate_id.encode()),
            "benchmark_sha256": checksum(b"fixture-benchmark"),
            "dataset_sha256": checksum(b"fixture-dataset") if metric else None,
            "scenario_id": "synthetic-only",
            "environment": {"hardware": "test-double", "runtime": "fixture-runtime"},
            "seeds": observed_seeds,
            "metrics": [
                {
                    "metric_id": metric_id,
                    "unit": metric["unit"],
                    "samples": [
                        {
                            "seed": seed,
                            "value": 0.95 if metric["unit"] == "ratio" else 10,
                        }
                        for seed in observed_seeds
                    ],
                }
            ]
            if metric
            else [],
            "measurement_mode": "observed",
            "method": "Synthetic fixture for validator tests; no research or physical measurement.",
            "command": [
                "python",
                "-m",
                "unittest",
                "tests.upgrade.test_federal_foundry",
            ],
            "classification": "PUBLIC",
            "rights": "public_use_reviewed",
        }
        data.update(changes)
        ref = self.write_json("receipts/" + str(self.serial) + ".json", data)
        self.manifest["receipts"].append(ref)
        if review:
            self.review(data, ref, verdict=review)
        return data, ref

    def review(
        self,
        data: dict[str, object],
        ref: dict[str, str],
        verdict: str = "accepted",
        reviewer_seat: str = "fixture-verifier",
        **changes: object,
    ) -> dict[str, str]:
        value = {
            "schema_version": "federal.review/v1",
            "record_id": data["record_id"],
            "lane_id": self.lane_id,
            "receipt_sha256": ref["sha256"],
            "reviewer_seat": reviewer_seat,
            "reviewed_at": REVIEWED,
            "verdict": verdict,
            "notes": "Synthetic independent-review fixture; no authenticated reviewer is claimed.",
        }
        value.update(changes)
        result = self.write_json(
            "reviews/" + str(len(self.manifest["reviews"])) + ".json", value
        )
        self.manifest["reviews"].append(result)
        return result

    def result(self) -> dict[str, object]:
        return evaluate(self.catalog, self.manifest, self.root)

    def state(self, requirement_id: str) -> str:
        return next(
            row["state"]
            for row in self.result()["requirements"]
            if row["id"] == requirement_id
        )


class CatalogueTests(unittest.TestCase):
    def test_all_five_lanes_have_registered_separate_scope_and_shared_model_independent_contract(
        self,
    ) -> None:
        catalogue = load_catalog()
        registry, error = parse_registry(ROOT / ".bits/srs_registry.yml")
        self.assertIsNone(error)
        registered = {row["code"]: row for row in registry}
        self.assertEqual(len(catalogue["opportunities"]), 5)
        self.assertEqual(catalogue["max_parallel_lanes"], 5)
        self.assertFalse(catalogue["inactive_lanes"][0]["active"])
        self.assertEqual(catalogue["inactive_lanes"][0]["verification"], "not_observed")
        for lane in catalogue["opportunities"]:
            self.assertEqual(registered[lane["srs_code"]]["status"], "proposed")
            self.assertTrue((ROOT / registered[lane["srs_code"]]["spec"]).is_file())
            self.assertEqual(lane["evidence_available"], [])
            self.assertIsNone(lane["deadline"]["value"])
            self.assertEqual(lane["topic"]["status"], "unverified")
            self.assertEqual(lane["deliverables"], list(DELIVERABLES))
            self.assertGreaterEqual(len(lane["requirements"]), 5)
        self.assertIn("unknown_lane", str(self.assert_raises_lane(catalogue)))

    def assert_raises_lane(self, catalogue: dict[str, object]) -> Exception:
        with self.assertRaises(FoundryError) as caught:
            lane_for(catalogue, "../unknown")
        return caught.exception

    def test_catalogue_rejects_duplicate_scope_bad_references_and_cycles(self) -> None:
        changes = [
            lambda data: data["opportunities"].append(
                copy.deepcopy(data["opportunities"][0])
            ),
            lambda data: data["opportunities"][0]["requirements"][0].update(kind="any"),
            lambda data: data["opportunities"][0]["requirements"][0].update(
                metric_id="invented"
            ),
            lambda data: data["opportunities"][0]["claims"][0].update(
                requirements=["invented"]
            ),
            lambda data: data["opportunities"][0]["milestones"][0].update(
                depends_on=["review"]
            ),
            lambda data: data["opportunities"][0]["milestones"][0].update(
                depends_on=["missing"]
            ),
            lambda data: data["opportunities"][1].update(
                srs_code=data["opportunities"][0]["srs_code"]
            ),
            lambda data: data["opportunities"][0]["evidence_required"][0].update(
                kind="empirical"
            ),
            lambda data: data["opportunities"][0]["evidence_available"].append(
                {"claimed": "complete"}
            ),
            lambda data: data["opportunities"][0]["topic"].update(status="verified"),
            lambda data: data["opportunities"][0]["metrics"][0].update(target=True),
            lambda data: data["opportunities"][0]["metrics"][0].update(comparator="lt"),
            lambda data: data["opportunities"][0]["experiment"].update(seeds=[2, 1]),
            lambda data: data["opportunities"][0]["requirements"].append(
                copy.deepcopy(data["opportunities"][0]["requirements"][0])
            ),
            lambda data: data.update(max_parallel_lanes=6),
            lambda data: data.update(owner="Unknown organization"),
        ]
        for change in changes:
            with self.subTest(change=changes.index(change)):
                data = copy.deepcopy(load_catalog())
                change(data)
                with self.assertRaises(ResearchError):
                    validate_catalog(data)

    def test_boundaries_reject_unsafe_paths_nonfinite_targets_and_invalid_seed_plans(
        self,
    ) -> None:
        for path in (
            "../escape.json",
            "/tmp/x.json",
            "a//b.json",
            "a/./b.json",
            "a\\b.json",
            "C:disk.json",
            ".env.json",
            "private/a.json",
            "a/_meta/b.json",
        ):
            with self.subTest(path=path), self.assertRaises(ResearchError):
                relative_path(path)
        for value in ([True], [-1], [1, 1], [1.5], [], [2147483648]):
            with self.subTest(seeds=value), self.assertRaises(ResearchError):
                seeds(value)
        for target in (float("nan"), float("inf"), -1, "10"):
            data = copy.deepcopy(load_catalog())
            data["opportunities"][0]["metrics"][0]["target"] = target
            with self.subTest(target=target), self.assertRaises(ResearchError):
                validate_catalog(data)
        self.assertEqual(relative_path("receipts/run-1.json"), "receipts/run-1.json")
        self.assertEqual(seeds([], 0), [])

    def test_loader_rejects_missing_symlinked_and_duplicate_key_catalogues(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(ResearchError):
                load_catalog(root / "missing.json")
            link = root / "link.json"
            link.symlink_to(ROOT / "apps/federal_foundry/opportunities.json")
            with self.assertRaises(ResearchError):
                load_catalog(link)
            bad = root / "bad.json"
            bad.write_text('{"schema_version":1,"schema_version":2}')
            with self.assertRaises(ResearchError):
                load_catalog(bad)


class FixtureAdapter:
    """Stand in for a runtime model client; no LLM is called."""

    def __init__(self) -> None:
        self.requests: list[dict[str, object]] = []

    async def complete(self, request: dict[str, object]) -> str:
        self.requests.append(request)
        return json.dumps(
            {
                "schema_version": "federal.agent-output/v1",
                "request_sha256": request["request_sha256"],
                "status": "completed",
                "summary": "Synthetic adapter draft; evidence is still absent.",
                "artifact_paths": ["apps/federal_foundry/candidate.py"],
                "claim_ids": ["market-kernel"],
            }
        )


class OtherFixtureAdapter:
    """Use a second contract implementation to exercise provider independence."""

    async def complete(self, request: dict[str, object]) -> str:
        return json.dumps(
            dict(
                schema_version="federal.agent-output/v1",
                request_sha256=request["request_sha256"],
                status="blocked",
                summary="Synthetic adapter reports a missing corpus.",
                artifact_paths=[],
                claim_ids=[],
            ),
            indent=2,
        )


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        asyncio.get_running_loop().slow_callback_duration = 5
        self.catalogue = load_catalog()
        self.task = make_task(self.catalogue, "influence")
        self.model = ModelBinding(
            "fixture-provider-a",
            "fixture-model-a",
            "fixture-v1",
            "a" * 64,
            CAPABILITIES,
        )
        self.dispatch = DispatchBinding(
            "VCC-FIXTURE-INFLUENCE-001",
            self.task["srs_code"],
            "Ready",
            "fixture-builder",
            True,
        )

    async def test_two_provider_bindings_work_without_changing_the_task_or_admitting_model_claims(
        self,
    ) -> None:
        other = ModelBinding(
            "fixture-provider-b",
            "local-fixture-model",
            "fixture-v2",
            "b" * 64,
            tuple(reversed(CAPABILITIES)),
        )
        one = await run_task(
            self.catalogue, self.task, self.model, self.dispatch, FixtureAdapter()
        )
        two = await run_task(
            self.catalogue, self.task, other, self.dispatch, OtherFixtureAdapter()
        )
        self.assertEqual(one["task_id"], two["task_id"])
        self.assertNotEqual(one["request_sha256"], two["request_sha256"])
        self.assertEqual(one["binding"]["provider"], "fixture-provider-a")
        self.assertEqual(two["binding"]["provider"], "fixture-provider-b")
        for result in (one, two):
            self.assertFalse(result["evidence_verified"])
            self.assertFalse(result["submission_authorized"])
            self.assertEqual(result["authority"], "unreviewed_model_output")
        self.assertEqual(self.task["model_selection"], "caller")
        self.assertEqual(self.task["intake_status"], "PREPARED")
        self.assertIsNone(self.task["execution_dispatch_id"])

    async def test_modified_tasks_wrong_scope_and_unverified_dispatches_cannot_call_an_adapter(
        self,
    ) -> None:
        adapter = FixtureAdapter()
        changed = copy.deepcopy(self.task)
        changed["context"]["opportunity"]["objective"] = (
            "Changed outside the registered task"
        )
        with self.assertRaises(ResearchError):
            await run_task(self.catalogue, changed, self.model, self.dispatch, adapter)
        wrong = DispatchBinding(
            "VCC-FIXTURE-OTHER-001",
            "SRS-OTHER-001",
            "In progress",
            "fixture-builder",
            True,
        )
        with self.assertRaises(ResearchError):
            await run_task(self.catalogue, self.task, self.model, wrong, adapter)
        for status, verified in (("Proposed", True), ("Ready", False)):
            with self.assertRaises(ResearchError):
                DispatchBinding(
                    "fixture-dispatch",
                    self.task["srs_code"],
                    status,
                    "fixture-builder",
                    verified,
                )
        for capabilities in (("code",), ("code", "structured_output", "code")):
            with self.assertRaises(ResearchError):
                ModelBinding("fixture", "fixture", "1", "a" * 64, capabilities)
        with self.assertRaises(ResearchError):
            make_task(self.catalogue, "influence", "submitter")
        self.assertEqual(adapter.requests, [])

    async def test_verifier_requires_a_distinct_producer_seat(self) -> None:
        task = make_task(self.catalogue, "influence", "verifier")
        self.assertEqual(task["depends_on"], ["influence-builder"])
        for producer in (None, self.dispatch.seat):
            with self.subTest(producer=producer), self.assertRaises(ResearchError):
                request_for(self.catalogue, task, self.model, self.dispatch, producer)
        result = await run_task(
            self.catalogue,
            task,
            self.model,
            self.dispatch,
            OtherFixtureAdapter(),
            producer_seat="another-producer",
        )
        self.assertFalse(result["evidence_verified"])

    async def test_request_copies_prevent_adapter_mutation_and_responses_bind_to_exact_requests(
        self,
    ) -> None:
        request = request_for(self.catalogue, self.task, self.model, self.dispatch)
        raw = await FixtureAdapter().complete(request)
        changed = copy.deepcopy(request)
        changed["binding"]["provider"] = "different"
        with self.assertRaises(ResearchError):
            accept_output(self.catalogue, changed, raw)
        changed_output = json.loads(raw)
        changed_output["request_sha256"] = "0" * 64
        with self.assertRaises(ResearchError):
            accept_output(self.catalogue, request, json.dumps(changed_output))

        class Mutator(FixtureAdapter):
            async def complete(self, request: dict[str, object]) -> str:
                request["binding"]["provider"] = "untrusted-replacement"
                request["task"]["context"]["opportunity"]["objective"] = "mutated"
                return await super().complete(request)

        result = await run_task(
            self.catalogue, self.task, self.model, self.dispatch, Mutator()
        )
        self.assertEqual(result["binding"]["provider"], "fixture-provider-a")
        self.assertNotEqual(self.task["context"]["opportunity"]["objective"], "mutated")

    async def test_adapter_failures_timeout_and_cancellation_are_not_success(
        self,
    ) -> None:
        class Failure:
            async def complete(self, request: dict[str, object]) -> str:
                raise RuntimeError("Sensitive provider detail must not escape")

        with self.assertRaisesRegex(FoundryError, "^adapter_failed$"):
            await run_task(
                self.catalogue, self.task, self.model, self.dispatch, Failure()
            )

        entered = asyncio.Event()

        class Waiting:
            async def complete(self, request: dict[str, object]) -> str:
                entered.set()
                await asyncio.Event().wait()
                return "{}"

        with self.assertRaisesRegex(FoundryError, "^adapter_timeout$"):
            await run_task(
                self.catalogue,
                self.task,
                self.model,
                self.dispatch,
                Waiting(),
                timeout_seconds=0.01,
            )
        entered.clear()
        running = asyncio.create_task(
            run_task(self.catalogue, self.task, self.model, self.dispatch, Waiting())
        )
        await entered.wait()
        running.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await running
        with self.assertRaises(ResearchError):
            await run_task(
                self.catalogue,
                self.task,
                self.model,
                self.dispatch,
                FixtureAdapter(),
                timeout_seconds=121,
            )

    async def test_response_budgets_invalid_fields_paths_and_claim_ids_fail_closed(
        self,
    ) -> None:
        request = request_for(self.catalogue, self.task, self.model, self.dispatch)
        valid = json.loads(await FixtureAdapter().complete(request))
        variants = [
            {**valid, "status": "verified"},
            {**valid, "claim_ids": ["unknown"]},
            {**valid, "claim_ids": ["market-kernel", "market-kernel"]},
            {**valid, "artifact_paths": ["../outside"]},
            {**valid, "artifact_paths": ["a.py", "a.py"]},
            {**valid, "provider": "attempted-substitution"},
        ]
        for value in variants:
            with self.subTest(value=value), self.assertRaises(ResearchError):
                accept_output(self.catalogue, request, json.dumps(value))
        for raw in ("x" * 64001, "[]", '{"status":1,"status":2}', "\ud800"):
            with self.subTest(raw=raw[:30]), self.assertRaises(ResearchError):
                accept_output(self.catalogue, request, raw)

        class WrongType:
            async def complete(self, request: dict[str, object]) -> str:
                return None

        with self.assertRaises(ResearchError):
            await run_task(
                self.catalogue, self.task, self.model, self.dispatch, WrongType()
            )
        with (
            patch.dict(LIMITS, {"max_input_bytes": 1}),
            self.assertRaises(ResearchError),
        ):
            task = make_task(self.catalogue, "influence")
            await run_task(
                self.catalogue, task, self.model, self.dispatch, FixtureAdapter()
            )


class EvidenceTests(SyntheticEvidence):
    def test_absent_receipts_do_not_become_zero_measurements_or_supported_claims(
        self,
    ) -> None:
        result = self.result()
        self.assertEqual(result["requirements_with_passing_evidence"], 0)
        self.assertEqual(result["records"], [])
        self.assertTrue(
            all(row["state"] == "MISSING" for row in result["requirements"])
        )
        self.assertTrue(all(row["state"] == "UNSUPPORTED" for row in result["claims"]))
        self.assertEqual(result["submission_state"], "HOLD")
        self.assertFalse(result["submission_authorized"])

    def test_exact_measurement_and_distinct_review_support_only_the_scoped_candidate(
        self,
    ) -> None:
        self.add()
        result = self.result()
        claim = next(row for row in result["claims"] if row["id"] == "market-kernel")
        self.assertEqual(claim["state"], "SUPPORTED_FOR_REVIEW")
        self.assertEqual(claim["supported_candidates"], ["auction-baseline"])
        self.assertFalse(claim["human_approved"])
        self.assertEqual(result["requirements_with_passing_evidence"], 1)

    def test_unreviewed_rejected_and_conflicting_reviews_remain_visible(self) -> None:
        data, ref = self.add(review=None)
        self.assertEqual(self.state("market-kernel"), "UNREVIEWED")
        self.review(data, ref, verdict="rejected")
        self.assertEqual(self.state("market-kernel"), "REJECTED")
        self.review(data, ref, verdict="accepted", reviewer_seat="second-verifier")
        self.assertEqual(self.state("market-kernel"), "CONFLICT")

    def test_contrary_results_conflict_within_candidate_and_do_not_hide_other_candidates(
        self,
    ) -> None:
        self.add()
        self.add(outcome="fail")
        self.assertEqual(self.state("market-kernel"), "CONFLICT")
        self.add(candidate_id="event-sourced")
        result = self.result()
        row = next(
            row for row in result["requirements"] if row["id"] == "market-kernel"
        )
        self.assertEqual(row["supported_candidates"], ["event-sourced"])
        self.assertEqual(len(result["records"]), 3)
        self.assertIn(
            {"candidate_id": "auction-baseline", "state": "CONFLICT"},
            row["candidate_states"],
        )

    def test_composite_claim_cannot_splice_disjoint_candidate_successes(self) -> None:
        lane = lane_for(self.catalog, self.lane_id)
        lane["claims"].append(
            {
                "id": "combined",
                "statement": "Both behaviors in one candidate.",
                "requirements": ["market-kernel", "replay"],
            }
        )
        self.add()
        self.add("replay", "event-sourced")
        claim = next(row for row in self.result()["claims"] if row["id"] == "combined")
        self.assertEqual(claim["state"], "UNSUPPORTED")
        self.add("replay")
        claim = next(row for row in self.result()["claims"] if row["id"] == "combined")
        self.assertEqual(claim["supported_candidates"], ["auction-baseline"])

    def test_insufficient_kind_estimate_and_unset_target_do_not_pass_physical_claim(
        self,
    ) -> None:
        self.use_lane("low-swap")
        self.add("energy", "monolithic", kind="simulation")
        self.assertEqual(self.state("energy"), "INSUFFICIENT_EVIDENCE")
        self.manifest["receipts"] = []
        self.manifest["reviews"] = []
        self.add("energy", "monolithic", measurement_mode="estimated")
        self.assertEqual(self.state("energy"), "INSUFFICIENT_EVIDENCE")
        self.manifest["receipts"] = []
        self.manifest["reviews"] = []
        self.add("energy", "monolithic")
        self.assertEqual(self.state("energy"), "TARGET_UNSET")
        lane = lane_for(self.catalog, self.lane_id)
        next(row for row in lane["metrics"] if row["id"] == "energy_joules")[
            "target"
        ] = 20
        self.assertEqual(self.state("energy"), "PASS")
        self.assertFalse(self.result()["submission_authorized"])

    def test_metric_thresholds_missing_samples_seeds_and_inconclusive_outcomes(
        self,
    ) -> None:
        self.add("efficiency")
        self.assertEqual(self.state("efficiency"), "PASS")
        lane = lane_for(self.catalog, self.lane_id)
        policy = next(
            row for row in lane["metrics"] if row["id"] == "allocative_efficiency"
        )
        policy["target"] = 0.95
        self.assertEqual(self.state("efficiency"), "FAIL")
        policy["comparator"] = "gte"
        self.assertEqual(self.state("efficiency"), "PASS")
        self.manifest["receipts"] = []
        self.manifest["reviews"] = []
        self.add("efficiency", metrics=[])
        self.assertEqual(self.state("efficiency"), "MISSING_MEASUREMENT")
        self.manifest["receipts"] = []
        self.manifest["reviews"] = []
        self.add(
            "efficiency",
            seeds=[101],
            metrics=[
                {
                    "metric_id": "allocative_efficiency",
                    "unit": "ratio",
                    "samples": [{"seed": 101, "value": 0.98}],
                }
            ],
        )
        self.assertEqual(self.state("efficiency"), "INSUFFICIENT_SEEDS")
        self.manifest["receipts"] = []
        self.manifest["reviews"] = []
        self.add(outcome="inconclusive")
        self.assertEqual(self.state("market-kernel"), "INCONCLUSIVE")

    def test_tampered_bytes_and_stale_review_hash_are_rejected(self) -> None:
        _data, ref = self.add()
        path = self.root / ref["path"]
        path.write_bytes(path.read_bytes() + b" ")
        with self.assertRaisesRegex(ResearchError, "artifact_hash_mismatch"):
            self.result()
        ref["sha256"] = checksum(path.read_bytes())
        with self.assertRaisesRegex(ResearchError, "stale_review"):
            self.result()

    def test_scope_time_rights_duplicates_and_provenance_are_validated(self) -> None:
        variants = [
            {"lane_id": "navair"},
            {"requirement_id": "other"},
            {"candidate_id": "other"},
            {"kind": "unknown"},
            {"classification": "CUI"},
            {"rights": "unknown"},
            {"source_sha256": "short"},
            {"benchmark_sha256": "short"},
            {"measured_at": "2026-09-16T13:00:00Z"},
            {"measurement_mode": "unknown"},
            {"environment": {"hardware": "", "runtime": "fixture"}},
            {
                "producer": {
                    "seat": "fixture",
                    "model": {
                        "provider": "",
                        "model": "x",
                        "version": "1",
                        "configuration_sha256": "a" * 64,
                    },
                }
            },
        ]
        for change in variants:
            with self.subTest(change=change):
                self.manifest["receipts"] = []
                self.manifest["reviews"] = []
                data, ref = self.add(review=None)
                data.update(change)
                ref.update(self.write_json(ref["path"], data))
                with self.assertRaises(ResearchError):
                    self.result()
        self.manifest["receipts"] = []
        self.add(review=None)
        self.manifest["receipts"].append(self.manifest["receipts"][0])
        with self.assertRaisesRegex(ResearchError, "duplicate_receipt"):
            self.result()

    def test_reviews_cannot_impersonate_producer_or_change_scope_or_time(self) -> None:
        data, ref = self.add(review=None)
        variants = [
            {"reviewer_seat": "fixture-builder"},
            {"lane_id": "navair"},
            {"record_id": "unknown"},
            {"reviewed_at": "2026-09-16T09:00:00Z"},
            {"reviewed_at": "2026-09-16T13:00:00Z"},
            {"verdict": "complete"},
            {"receipt_sha256": "0" * 64},
        ]
        for change in variants:
            with self.subTest(change=change):
                self.manifest["reviews"] = []
                self.review(data, ref, **change)
                with self.assertRaises(ResearchError):
                    self.result()
        self.manifest["reviews"] = []
        self.review(data, ref)
        self.review(data, ref)
        with self.assertRaisesRegex(ResearchError, "duplicate_review"):
            self.result()

    def test_unknown_units_duplicate_metrics_nonfinite_samples_and_missing_dataset_fail(
        self,
    ) -> None:
        seeds_value = lane_for(self.catalog, self.lane_id)["experiment"]["seeds"]
        valid = {
            "metric_id": "allocative_efficiency",
            "unit": "ratio",
            "samples": [{"seed": seed, "value": 0.95} for seed in seeds_value],
        }
        variants = [
            {"metrics": [{**valid, "unit": "percent"}]},
            {"metrics": [valid, valid]},
            {"metrics": [{**valid, "metric_id": "not-defined"}]},
            {
                "metrics": [
                    {
                        **valid,
                        "samples": [
                            {"seed": seed, "value": float("nan")}
                            for seed in seeds_value
                        ],
                    }
                ]
            },
            {
                "metrics": [
                    {
                        **valid,
                        "samples": [
                            {"seed": seed, "value": True} for seed in seeds_value
                        ],
                    }
                ]
            },
            {"metrics": [{**valid, "samples": [{"seed": 101, "value": 0.95}]}]},
            {"dataset_sha256": None},
        ]
        for change in variants:
            with self.subTest(change=change):
                self.manifest["receipts"] = []
                self.manifest["reviews"] = []
                self.add("efficiency", review=None, **change)
                with self.assertRaises(ResearchError):
                    self.result()

    def test_artifact_traversal_symlinks_size_and_non_json_are_rejected_without_writes(
        self,
    ) -> None:
        _data, ref = self.add()
        original = copy.deepcopy(ref)
        for path in (
            "../outside.json",
            str(self.root / ref["path"]),
            "missing.json",
            "README.md",
        ):
            ref["path"] = path
            with self.subTest(path=path), self.assertRaises(ResearchError):
                self.result()
        ref.update(original)
        link = self.root / "linked"
        link.symlink_to(self.root / "receipts", target_is_directory=True)
        ref["path"] = "linked/1.json"
        with self.assertRaises(ResearchError):
            self.result()
        ref.update(original)
        (self.root / ref["path"]).write_bytes(b"x" * 300001)
        with self.assertRaises(ResearchError):
            self.result()

    def test_full_model_provenance_is_accepted_as_a_declaration_only(self) -> None:
        self.add(
            "llm-stock-agents",
            producer={
                "seat": "fixture-builder",
                "model": {
                    "provider": "fixture-provider",
                    "model": "fixture-model",
                    "version": "fixture-v1",
                    "configuration_sha256": "c" * 64,
                },
            },
        )
        self.assertEqual(self.state("llm-stock-agents"), "PASS")
        self.assertIn("declared", self.result()["verification_scope"])

    def test_invalid_utf8_is_a_typed_receipt_failure(self) -> None:
        _data, ref = self.add(review=None)
        raw = bytes([255, 254])
        (self.root / ref["path"]).write_bytes(raw)
        ref["sha256"] = checksum(raw)
        with self.assertRaisesRegex(FoundryError, "invalid_artifact_encoding"):
            self.result()

    def test_complete_matrix_requires_a_single_candidate_and_remains_held_for_human_review(
        self,
    ) -> None:
        lane = lane_for(self.catalog, self.lane_id)
        for metric in lane["metrics"]:
            if metric["target"] is None:
                metric["target"] = 0.9 if metric["unit"] == "ratio" else 20
        for requirement in lane["requirements"]:
            candidate = (
                "event-sourced" if requirement["id"] == "replay" else "auction-baseline"
            )
            self.add(requirement["id"], candidate)
        result = self.result()
        self.assertEqual(
            result["requirements_with_passing_evidence"], result["requirements_total"]
        )
        self.assertEqual(result["fully_supported_candidates"], [])
        self.add("replay")
        result = self.result()
        self.assertEqual(result["fully_supported_candidates"], ["auction-baseline"])
        self.assertFalse(result["submission_authorized"])


class ComparisonTests(SyntheticEvidence):
    def pair(self, low: float = 0.92, high: float = 0.97) -> None:
        for candidate, value in (("auction-baseline", low), ("event-sourced", high)):
            plan = lane_for(self.catalog, self.lane_id)["experiment"]["seeds"]
            self.add(
                "efficiency",
                candidate,
                metrics=[
                    {
                        "metric_id": "allocative_efficiency",
                        "unit": "ratio",
                        "samples": [{"seed": seed, "value": value} for seed in plan],
                    }
                ],
            )

    def comparison(self) -> dict[str, object]:
        return compare(
            self.catalog,
            self.manifest,
            self.root,
            "allocative_efficiency",
            ["auction-baseline", "event-sourced"],
        )

    def test_matched_bakeoff_ranks_observed_samples_and_never_promotes_a_model(
        self,
    ) -> None:
        self.pair()
        result = self.comparison()
        self.assertEqual(result["state"], "COMPARABLE_FOR_REVIEW")
        self.assertEqual(result["leading_candidate"], "event-sourced")
        self.assertEqual(result["rankings"][0]["sample_count"], 5)
        self.assertEqual(result["rankings"][0]["sample_stddev"], 0)
        self.assertEqual(result["promotion_state"], "HUMAN_REVIEW_REQUIRED")
        self.assertEqual(result["statistical_inference"], "descriptive_only")

    def test_baseline_below_target_is_still_a_valid_comparison_and_is_reported_as_below_target(
        self,
    ) -> None:
        self.pair(low=0.8)
        result = self.comparison()
        self.assertEqual(result["state"], "COMPARABLE_FOR_REVIEW")
        self.assertFalse(result["rankings"][1]["meets_target"])
        self.assertTrue(result["rankings"][0]["meets_target"])

    def test_ties_have_no_leader_and_all_declared_candidates_are_required_by_default(
        self,
    ) -> None:
        self.pair(low=0.95, high=0.95)
        self.assertIsNone(self.comparison()["leading_candidate"])
        result = compare(
            self.catalog, self.manifest, self.root, "allocative_efficiency"
        )
        self.assertEqual(result["state"], "INCOMPARABLE")
        self.assertEqual(len(result["gaps"]), 3)

    def test_different_datasets_benchmarks_hardware_scenarios_and_seeds_are_incomparable(
        self,
    ) -> None:
        for changes in (
            {"dataset_sha256": "d" * 64},
            {"benchmark_sha256": "e" * 64},
            {"scenario_id": "another-scenario"},
            {"environment": {"hardware": "other-device", "runtime": "fixture-runtime"}},
        ):
            with self.subTest(changes=changes):
                self.manifest["receipts"] = []
                self.manifest["reviews"] = []
                self.add("efficiency")
                self.add("efficiency", "event-sourced", **changes)
                result = self.comparison()
                self.assertEqual(result["state"], "INCOMPARABLE")
                self.assertEqual(
                    result["gaps"][0]["reason"], "experiment_conditions_differ"
                )

    def test_missing_failed_unreviewed_ambiguous_or_unrequested_candidates_do_not_get_silently_ranked(
        self,
    ) -> None:
        self.add("efficiency")
        self.add("efficiency", "event-sourced", outcome="fail")
        self.assertEqual(self.comparison()["state"], "INCOMPARABLE")
        self.add("efficiency", "event-sourced")
        self.assertEqual(self.comparison()["state"], "INCOMPARABLE")
        for metric_id, candidates in (
            ("not-defined", ["auction-baseline", "event-sourced"]),
            ("allocative_efficiency", ["auction-baseline"]),
            ("allocative_efficiency", ["auction-baseline", "auction-baseline"]),
            ("allocative_efficiency", ["auction-baseline", "other"]),
        ):
            with self.subTest(candidates=candidates), self.assertRaises(ResearchError):
                compare(self.catalog, self.manifest, self.root, metric_id, candidates)

    def test_unset_targets_allow_relative_comparison_and_minimization_uses_declared_aggregate(
        self,
    ) -> None:
        self.use_lane("navair")
        for candidate, value in (("bm25", 4), ("embedding", 2)):
            plan = lane_for(self.catalog, self.lane_id)["experiment"]["seeds"]
            self.add(
                "latency",
                candidate,
                metrics=[
                    {
                        "metric_id": "latency_ms",
                        "unit": "ms",
                        "samples": [{"seed": seed, "value": value} for seed in plan],
                    }
                ],
            )
        result = compare(
            self.catalog, self.manifest, self.root, "latency_ms", ["bm25", "embedding"]
        )
        self.assertEqual(result["leading_candidate"], "embedding")
        self.assertEqual(aggregate([1.0, 2.0], {"aggregate": "min"}), 1)
        self.assertEqual(aggregate([1.0, 2.0], {"aggregate": "max"}), 2)
        with self.assertRaises(ResearchError):
            aggregate([], {"aggregate": "mean"})


class CompilerTests(SyntheticEvidence):
    def test_five_complete_draft_sets_and_ten_task_packets_have_verified_file_hashes(
        self,
    ) -> None:
        output = self.root / "portfolio"
        result = compile_portfolio(self.catalog, output, evaluated_at=AT)
        self.assertEqual(result["opportunities"], 5)
        self.assertEqual(result["tasks"], 10)
        self.assertEqual(result["hosted_dispatches_created"], 0)
        manifest = json.loads((output / "portfolio-manifest.json").read_text())
        for entry in manifest["files"]:
            self.assertEqual(
                checksum((output / entry["path"]).read_bytes()), entry["sha256"]
            )
        intake = json.loads((output / "bits_tasks.json").read_text())
        for lane in self.catalog["opportunities"]:
            for name in [
                *DELIVERABLES,
                "opportunity.yaml",
                "bits-task.md",
                "builder-task.json",
                "verifier-task.json",
            ]:
                self.assertTrue((output / lane["id"] / name).is_file(), name)
            result_doc = json.loads((output / lane["id"] / "results.json").read_text())
            self.assertEqual(result_doc["submission_state"], "HOLD")
            self.assertEqual(result_doc["requirements_with_passing_evidence"], 0)
            self.assertIn(
                "unverified", (output / lane["id"] / "whitepaper.md").read_text()
            )
        self.assertEqual(len({task["suggested_branch"] for task in intake["tasks"]}), 5)
        self.assertTrue(
            all(task["model_selection"] == "caller" for task in intake["tasks"])
        )
        self.assertTrue(
            all(
                task["source_sha256"] == source_fingerprint()
                for task in intake["tasks"]
            )
        )

    def test_compilation_is_reproducible_for_fixed_inputs_and_never_overwrites(
        self,
    ) -> None:
        one, two = self.root / "one", self.root / "two"
        compile_portfolio(self.catalog, one, evaluated_at=AT)
        compile_portfolio(self.catalog, two, evaluated_at=AT)
        for path in one.rglob("*"):
            if path.is_file():
                self.assertEqual(
                    path.read_bytes(), (two / path.relative_to(one)).read_bytes()
                )
        with self.assertRaisesRegex(ResearchError, "output_exists"):
            compile_portfolio(self.catalog, one, evaluated_at=AT)

    def test_evidence_projection_scopes_receipts_to_the_lane_and_retains_unmet_gates(
        self,
    ) -> None:
        self.add()
        output = self.root / "reviewed"
        compile_portfolio(
            self.catalog,
            output,
            manifests=[self.manifest],
            evidence_root=self.root,
            evaluated_at=AT,
        )
        influence = json.loads((output / "influence/results.json").read_text())
        maritime = json.loads((output / "maritime/results.json").read_text())
        self.assertEqual(influence["requirements_with_passing_evidence"], 1)
        self.assertEqual(maritime["requirements_with_passing_evidence"], 0)
        self.assertTrue(
            all(row["state"] == "PENDING" for row in influence["human_gates"])
        )
        self.assertIn(
            "auction-baseline",
            (output / "influence/claim_evidence_matrix.md").read_text(),
        )

    def test_invalid_evidence_unknown_duplicate_lanes_and_future_manifests_fail_before_output(
        self,
    ) -> None:
        data, ref = self.add()
        (self.root / ref["path"]).write_text("{}")
        for manifests, evidence_root in (
            ([self.manifest], self.root),
            ([self.manifest, self.manifest], self.root),
            ([self.manifest], None),
            ([{**self.manifest, "lane_id": "unknown"}], self.root),
            ([{**self.manifest, "evaluated_at": "2026-09-17T12:00:00Z"}], self.root),
        ):
            with self.subTest(manifests=manifests):
                output = self.root / "invalid"
                with self.assertRaises(ResearchError):
                    compile_portfolio(
                        self.catalog,
                        output,
                        manifests=manifests,
                        evidence_root=evidence_root,
                        evaluated_at=AT,
                    )
                self.assertFalse(output.exists())
        self.assertEqual(
            data["method"].split(";")[0], "Synthetic fixture for validator tests"
        )

    def test_output_symlink_and_write_failure_preserve_other_runs(self) -> None:
        target = self.root / "target"
        target.mkdir()
        marker = target / "keep.txt"
        marker.write_text("unchanged")
        link = self.root / "link"
        link.symlink_to(target, target_is_directory=True)
        for output in (link, link / "nested", self.root / "missing-parent" / "out"):
            with self.subTest(output=output), self.assertRaises(ResearchError):
                compile_portfolio(self.catalog, output, evaluated_at=AT)
        self.assertEqual(marker.read_text(), "unchanged")
        with patch.object(
            Path, "mkdir", side_effect=OSError("fixture storage failure")
        ):
            with self.assertRaisesRegex(ResearchError, "output_write_failed"):
                compile_portfolio(self.catalog, self.root / "failed", evaluated_at=AT)

    def test_source_changes_during_projection_are_rejected(self) -> None:
        with patch(
            "apps.federal_foundry.compiler.source_fingerprint",
            side_effect=["a" * 64, "b" * 64, "c" * 64],
        ):
            with self.assertRaisesRegex(ResearchError, "source_changed_during_compile"):
                compile_portfolio(self.catalog, self.root / "changed", evaluated_at=AT)
        self.assertFalse((self.root / "changed").exists())

    def test_yaml_and_markdown_exports_keep_source_strings_in_their_own_cells(
        self,
    ) -> None:
        self.assertEqual(yaml_text({"a": "yes", "b": None}), '"a": "yes"\n"b": null')
        self.assertEqual(yaml_text(["x", 3]), '- "x"\n- 3')
        self.assertEqual(yaml_text([]), "[]")
        self.assertEqual(markdown("<script>|x\nnext"), "&lt;script&gt;\\|x next")

    def test_cli_catalog_task_compile_evaluate_compare_and_failure_exit_codes(
        self,
    ) -> None:
        manifest = self.root / "manifest.json"
        manifest.write_text(json_text(self.manifest))
        cases = [
            (["catalog"], 0),
            (["task", "influence"], 0),
            (["task", "influence", "--role", "verifier"], 0),
            (["task", "not-found"], 2),
            (["compile", "--output", str(self.root / "cli"), "--at", AT], 0),
            (["evaluate", str(manifest), "--evidence-root", str(self.root)], 0),
            (
                [
                    "evaluate",
                    str(manifest),
                    "--evidence-root",
                    str(self.root),
                    "--require-supported",
                ],
                1,
            ),
            (
                [
                    "compare",
                    str(manifest),
                    "--evidence-root",
                    str(self.root),
                    "--metric",
                    "allocative_efficiency",
                ],
                1,
            ),
            (
                [
                    "evaluate",
                    str(self.root / "missing.json"),
                    "--evidence-root",
                    str(self.root),
                ],
                2,
            ),
        ]
        for arguments, expected in cases:
            with (
                self.subTest(arguments=arguments),
                redirect_stdout(io.StringIO()) as output,
            ):
                self.assertEqual(main(arguments), expected)
                json.loads(output.getvalue())
        manifest.write_text("{invalid")
        with redirect_stdout(io.StringIO()) as output:
            self.assertEqual(
                main(["evaluate", str(manifest), "--evidence-root", str(self.root)]), 2
            )
            self.assertEqual(json.loads(output.getvalue())["state"], "ERROR")
        with self.assertRaises(ResearchError):
            read_json(self.root / "missing.json")

    def test_portable_archive_runs_the_real_cli_from_fresh_extraction_without_repository_paths(
        self,
    ) -> None:
        archive_path = self.root / "suite.tgz"
        receipt = package(archive_path)
        unpacked = self.root / "unpacked"
        unpacked.mkdir()
        with tarfile.open(archive_path) as archive:
            archive.extractall(unpacked, filter="data")
        environment = os.environ.copy()
        environment.pop("PYTHONPATH", None)
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "apps.federal_foundry",
                "compile",
                "--output",
                str(unpacked / "portfolio"),
                "--at",
                AT,
            ],
            cwd=unpacked,
            env=environment,
            capture_output=True,
            text=True,
            check=True,
        )
        result_data = json.loads(result.stdout)
        self.assertEqual(result_data["source_sha256"], receipt["source_sha256"])
        self.assertEqual(result_data["opportunities"], 5)
        self.assertIn("apps/federal_foundry/opportunities.json", SOURCE_FILES)
        archived = json.loads((unpacked / "suite-manifest.json").read_text())
        for item in archived["archive_files"]:
            self.assertEqual(
                checksum((unpacked / item["path"]).read_bytes()), item["sha256"]
            )
        task = json.loads(
            (unpacked / "portfolio/influence/builder-task.json").read_text()
        )
        self.assertEqual(task["source_sha256"], source_fingerprint())


if __name__ == "__main__":
    unittest.main()
