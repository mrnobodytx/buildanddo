# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_research_sprint.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/decision/packages.py, apps/federal_foundry/sprint.py, apps/federal_foundry/episodes.py, apps/federal_foundry/polynomial.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/decision/packages.py; VALIDATES apps/federal_foundry/sprint.py; VALIDATES apps/federal_foundry/episodes.py; VALIDATES apps/federal_foundry/polynomial.py
# Intent:      Exercise reproducible research, missing evidence, tampering, agent isolation and exact polynomial correctness without claiming external qualification.
# ───────────────────────────────────────────────────────────────

"""Test research contracts with independent arithmetic and adversarial retained records."""

from __future__ import annotations

import asyncio
from contextlib import redirect_stdout
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import random
import tempfile
from typing import Any, cast
import unittest

from apps.decision.packages import (
    evaluate,
    fingerprint,
    refresh,
    semantic_graph,
    verify,
)
from apps.federal_foundry.episodes import MarketAgent, episode, replay
from apps.federal_foundry.__main__ import main as cli_main
from apps.federal_foundry.polynomial import (
    check_candidate,
    continuation_gate,
    doctor,
    negacyclic_product,
)
from apps.federal_foundry.sprint import (
    compile_sprint,
    demo_input,
    load_plan,
    market_dataset,
    release_input,
    scripted_agents,
    verify_sprint,
    ROOT,
)
from apps.research.contracts import ResearchError
from apps.decision.primitives import DecisionValidationError
from foundry.shared.federal_foundry.models import FoundryValidationError
from foundry.shared.federal_foundry.market import evaluate as market_evaluate
from libs.semantic_twin.ingestion.drafts import canonical_json

AT = "2026-09-22T18:00:00Z"
LATER = "2026-09-22T18:01:00Z"
INVALID = (ValueError, ResearchError, DecisionValidationError)


def fixture() -> dict[str, Any]:
    """Return a mutable teaching input, explicitly separate from measured evidence."""
    return cast(dict[str, Any], demo_input(AT))


def reseal(value: dict[str, Any]) -> dict[str, Any]:
    """Rehash malicious bytes to prove that a digest alone is insufficient."""
    value["sha256"] = fingerprint({k: v for k, v in value.items() if k != "sha256"})
    return value


class DecisionPackageTests(unittest.TestCase):
    def test_point_and_longitudinal_decisions_replay_and_flip(self) -> None:
        first = evaluate(fixture(), at=AT)
        self.assertEqual(
            first["decision"], {"state": "RECOMMENDATION", "selected": "a", "gaps": []}
        )
        history = refresh(first, demo_input(LATER, changed=True), at=LATER)
        self.assertTrue(history["flipped"])
        self.assertEqual(history["previous"], first)
        self.assertEqual(
            cast(dict[str, Any], history["current"])["decision"]["selected"], "b"
        )
        self.assertTrue(history["evidence_changes"])
        self.assertTrue(verify(first))

    def test_missing_evidence_holds_comparison_instead_of_dropping_rival(self) -> None:
        data = fixture()
        data["evidence"] = []
        result = evaluate(data, at=AT)
        self.assertEqual(cast(dict[str, Any], result["decision"])["state"], "HOLD")
        self.assertEqual(result["tradeoffs"], [])

    def test_stale_future_and_boundary_expiry_hold(self) -> None:
        for timestamp in ("2026-09-21T18:00:00Z", "2026-09-23T18:00:00Z"):
            with self.subTest(timestamp=timestamp):
                result = evaluate(fixture(), at=timestamp)
                self.assertEqual(
                    cast(dict[str, Any], result["decision"])["state"], "HOLD"
                )

    def test_conflicting_and_open_bias_checks_hold(self) -> None:
        for state in ("conflicting", "open"):
            data = fixture()
            data["bias_checks"][0]["status"] = state
            self.assertEqual(
                cast(dict[str, Any], evaluate(data, at=AT)["decision"])["state"], "HOLD"
            )

    def test_expired_assumption_requires_review(self) -> None:
        data = fixture()
        data["assumptions"][0]["expires_at"] = AT
        self.assertIn("Assumption", str(evaluate(data, at=AT)["decision"]))

    def test_tied_and_infeasible_alternatives_abstain(self) -> None:
        data = fixture()
        data["criteria"][0]["weight"] = 50
        data["criteria"][1]["weight"] = 50
        self.assertIn("tie", str(evaluate(data, at=AT)["decision"]))
        data["constraints"][0]["threshold"] = 0
        self.assertIn("No alternative", str(evaluate(data, at=AT)["decision"]))

    def test_foreign_evidence_rejected_even_if_rehashed(self) -> None:
        data = fixture()
        data["evidence"][0]["tenant_id"] = "another-tenant"
        reseal(data["evidence"][0])
        with self.assertRaisesRegex(DecisionValidationError, "foreign"):
            evaluate(data, at=AT)

    def test_tampered_observation_rejected(self) -> None:
        data = fixture()
        data["evidence"][0]["value"] = 0
        with self.assertRaisesRegex(DecisionValidationError, "bytes"):
            evaluate(data, at=AT)

    def test_authority_and_approval_cannot_be_added_by_rehashing(self) -> None:
        for field, value in (
            ("authorized", True),
            ("verified", True),
            ("authority", "A3"),
            ("human_approval", {"state": "APPROVED", "approver": "agent"}),
        ):
            package = cast(dict[str, Any], evaluate(fixture(), at=AT))
            package[field] = value
            reseal(package)
            with self.subTest(field=field), self.assertRaises(DecisionValidationError):
                verify(package)

    def test_duplicate_identity_and_unknown_fields_rejected(self) -> None:
        data = fixture()
        data["options"].append(deepcopy(data["options"][0]))
        with self.assertRaises(DecisionValidationError):
            evaluate(data, at=AT)
        data = fixture()
        data["approve"] = True
        with self.assertRaises(INVALID):
            evaluate(data, at=AT)

    def test_nonfinite_bool_zero_weight_and_wrong_shape_rejected(self) -> None:
        for value in (float("nan"), float("inf"), True, "5"):
            data = fixture()
            data["criteria"][0]["weight"] = value
            with self.subTest(value=value), self.assertRaises(INVALID):
                evaluate(data, at=AT)
        data = fixture()
        for row in data["criteria"]:
            row["weight"] = 0
        with self.assertRaises(INVALID):
            evaluate(data, at=AT)

    def test_refresh_rejects_identity_swaps_and_backward_time(self) -> None:
        package = evaluate(fixture(), at=AT)
        changed = fixture()
        changed["decision_id"] = "other"
        with self.assertRaises(INVALID):
            refresh(package, changed, at=LATER)
        with self.assertRaises(INVALID):
            refresh(package, fixture(), at="2026-09-22T17:59:59Z")

    def test_identical_refresh_retains_conclusion_and_no_changes(self) -> None:
        package = evaluate(fixture(), at=AT)
        result = refresh(package, fixture(), at=LATER)
        self.assertFalse(result["flipped"])
        self.assertEqual(result["changed_fields"], [])

    def test_canonical_graph_is_connected_and_deterministic(self) -> None:
        package = evaluate(fixture(), at=AT)
        graph = cast(dict[str, Any], semantic_graph(package))
        self.assertEqual(graph, semantic_graph(package))
        self.assertEqual(graph["object_count"], 5)
        self.assertEqual(len(graph["leaf_digests"]), 5)
        self.assertTrue(
            all(len(item["digest"]["value"]) == 64 for item in graph["leaf_digests"])
        )
        self.assertFalse(package["authorized"])
        self.assertTrue(package["synthetic"])

    def test_real_retained_release_evidence_does_not_approve_new_candidate(
        self,
    ) -> None:
        package = evaluate(release_input(ROOT, AT), at=AT)
        self.assertEqual(cast(dict[str, Any], package["decision"])["state"], "HOLD")
        self.assertFalse(package["synthetic"])
        self.assertIn("same-candidate-acceptance", str(package["decision"]))


class MarketEpisodeTests(unittest.IsolatedAsyncioTestCase):
    async def test_six_agent_two_asset_episode_replays(self) -> None:
        data = market_dataset()
        record = await episode(data, scripted_agents(data), seed=23)
        self.assertEqual(replay(record)["replayed_orders"], 36)
        self.assertEqual(record["model_agent_count"], 0)
        self.assertEqual(
            cast(dict[str, Any], record["result"])["metrics"][
                "allocative_efficiency_pct"
            ],
            100,
        )
        self.assertEqual(record["official_target_attainment"], "UNMEASURED")

    async def test_same_seed_and_inputs_reproduce_exact_receipts(self) -> None:
        data = market_dataset()
        first = await episode(data, scripted_agents(data, shaded=True), seed=7)
        second = await episode(data, scripted_agents(data, shaded=True), seed=7)
        self.assertEqual(first, second)
        self.assertEqual(replay(second)["state"], "PASS")

    async def test_prompts_hide_foreign_values_and_future_news(self) -> None:
        data = market_dataset()
        record = cast(
            dict[str, Any], await episode(data, scripted_agents(data), seed=23)
        )
        for receipt in record["receipts"]:
            prompt = receipt["prompt"]
            self.assertNotIn("agents", prompt)
            self.assertNotIn("values", prompt)
            self.assertTrue(
                all(event["round"] <= prompt["round"] for event in prompt["news"])
            )
            self.assertEqual(prompt["agent"], receipt["agent"])

    async def test_rehashed_foreign_or_future_prompt_is_rejected(self) -> None:
        data = market_dataset()
        record = cast(
            dict[str, Any], await episode(data, scripted_agents(data), seed=23)
        )
        receipt = record["receipts"][0]
        receipt["prompt"]["private_value"] = 999
        receipt["prompt_sha256"] = fingerprint(receipt["prompt"])
        reseal(record)
        with self.assertRaises(ResearchError):
            replay(record)

    async def test_result_or_binding_tampering_is_rejected_even_when_rehashed(
        self,
    ) -> None:
        data = market_dataset()
        original = cast(
            dict[str, Any], await episode(data, scripted_agents(data), seed=23)
        )
        record = deepcopy(original)
        record["result"]["metrics"]["total_utility"] = 0
        reseal(record)
        with self.assertRaises(ResearchError):
            replay(record)
        record = deepcopy(original)
        record["receipts"][-1]["version"] = "different"
        reseal(record)
        with self.assertRaises(ResearchError):
            replay(record)

    async def test_timeout_retains_every_attempt_and_holds_result(self) -> None:
        data = market_dataset()
        agents = scripted_agents(data)

        async def timeout(_prompt: dict[str, object]) -> dict[str, object]:
            await asyncio.sleep(0.02)
            return {"price": 1}

        agents[0] = MarketAgent(
            agents[0].identity, "test", "timeout", "1", "scripted", timeout
        )
        record = await episode(data, agents, seed=23, timeout_seconds=0.001)
        self.assertEqual(record["state"], "HOLD")
        self.assertIsNone(record["result"])
        self.assertEqual(len(cast(list[object], record["receipts"])), 36)
        self.assertEqual(len(cast(list[object], record["failures"])), 6)
        with self.assertRaises(ResearchError):
            replay(record)

    async def test_malformed_actions_do_not_drop_participants_or_leak_errors(
        self,
    ) -> None:
        data = market_dataset()
        agents = scripted_agents(data)

        async def invalid(_prompt: dict[str, object]) -> dict[str, object]:
            raise RuntimeError("private-provider-detail")

        agents[0] = MarketAgent(
            agents[0].identity, "test", "invalid", "1", "model", invalid
        )
        record = await episode(data, agents, seed=23)
        self.assertEqual(record["state"], "HOLD")
        self.assertNotIn("private-provider-detail", json.dumps(record))

    async def test_duplicate_bindings_untrusted_extra_news_and_bool_seed_rejected(
        self,
    ) -> None:
        data = cast(dict[str, Any], market_dataset())
        agents = scripted_agents(data)
        agents[-1] = agents[0]
        with self.assertRaises(ResearchError):
            await episode(data, agents, seed=23)
        data["news"][0]["private_prompt"] = "foreign information"
        with self.assertRaises(ResearchError):
            await episode(data, scripted_agents(data), seed=23)
        with self.assertRaises(ResearchError):
            await episode(
                market_dataset(), scripted_agents(market_dataset()), seed=True
            )

    async def test_recorded_auction_rejects_duplicate_or_missing_orders(self) -> None:
        data = market_dataset()
        record = cast(
            dict[str, Any], await episode(data, scripted_agents(data), seed=23)
        )
        orders = record["orders"]
        with self.assertRaises(FoundryValidationError):
            market_evaluate(data, "recorded-auction", 23, orders=orders[:-1])
        orders[-1] = deepcopy(orders[0])
        with self.assertRaises(FoundryValidationError):
            market_evaluate(data, "recorded-auction", 23, orders=orders)


class PolynomialTests(unittest.TestCase):
    def test_exact_product_matches_independent_schoolbook_on_frozen_random_inputs(
        self,
    ) -> None:
        rng = random.Random(23)
        for n in (1, 2, 4, 8, 16):
            for width in (1, 8, 67, 868):
                left, right = [
                    [rng.randrange(1 << width) for _ in range(n)] for _ in range(2)
                ]
                expected = [0] * n
                for i, a in enumerate(left):
                    for j, b in enumerate(right):
                        expected[(i + j) % n] += a * b * (1 if i + j < n else -1)
                self.assertEqual(negacyclic_product(left, right, width=width), expected)

    def test_reported_shape_sparse_product_wraps_every_coefficient_exactly(
        self,
    ) -> None:
        degree, width = 32768, 868
        coefficient = (1 << width) - 1
        left, right = [0] * degree, [0] * degree
        left[-1], right[1] = coefficient, coefficient
        expected = [-coefficient * coefficient] + [0] * (degree - 1)
        result = check_candidate(left, right, expected, width=width, modulus=None)
        self.assertEqual(
            (result["state"], result["checked_coefficients"]), ("PASS", degree)
        )
        self.assertEqual(result["official_correctness"], "UNMEASURED")

    def test_maximum_coefficient_carries_and_negacyclic_wrap(self) -> None:
        bound = (1 << 868) - 1
        self.assertEqual(
            negacyclic_product([0, bound], [0, bound], width=868), [-bound * bound, 0]
        )
        self.assertEqual(
            negacyclic_product([bound] * 8, [bound] * 8, width=868),
            [(2 * i - 6) * bound * bound for i in range(8)],
        )

    def test_coefficient_modulus_is_explicit(self) -> None:
        self.assertEqual(negacyclic_product([0, 3], [0, 3], width=2), [-9, 0])
        self.assertEqual(negacyclic_product([0, 3], [0, 3], width=2, modulus=7), [5, 0])

    def test_wrong_candidate_checks_every_coefficient(self) -> None:
        result = check_candidate([1] * 32, [0] * 32, [1] * 32, width=1, modulus=None)
        self.assertEqual(result["mismatch_count"], 32)
        self.assertEqual(len(cast(list[object], result["first_mismatches"])), 16)
        self.assertEqual(result["official_correctness"], "UNMEASURED")

    def test_bad_shapes_bool_and_out_of_range_coefficients_rejected(self) -> None:
        for left, right, width in (
            ([1] * 3, [1] * 3, 2),
            ([1], [1, 2], 2),
            ([True], [1], 2),
            ([-1], [1], 2),
            ([4], [1], 2),
            ([1], [1], 0),
        ):
            with self.subTest(left=left, width=width), self.assertRaises(ResearchError):
                negacyclic_product(left, right, width=width)

    def test_internal_gate_uses_median_and_never_claims_qualification(self) -> None:
        for values, state in (
            ([510, 520, 9000], "GO"),
            ([600, 800, 900], "WATCH"),
            ([1100, 1200, 1300], "PIVOT"),
        ):
            result = continuation_gate(values, leader_us=260)
            self.assertEqual(result["state"], state)
            self.assertEqual(result["official_qualification"], "UNMEASURED")
        with self.assertRaises(ResearchError):
            continuation_gate([float("nan")] * 3, leader_us=260)
        self.assertEqual(doctor()["state"], "BLOCKED")


class ResearchCliTests(unittest.TestCase):
    def call(self, *args: str) -> tuple[int, dict[str, Any]]:
        """Exercise actual CLI parsing and machine-readable results in process."""
        output = io.StringIO()
        with redirect_stdout(output):
            status = cli_main(list(args))
        return status, json.loads(output.getvalue())

    def test_decision_and_refresh_commands_retain_input_revisions(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            document, previous = root / "input.json", root / "previous.json"
            document.write_bytes(canonical_json(demo_input(AT)))
            status, package = self.call("decision-package", str(document), "--at", AT)
            self.assertEqual(status, 0)
            self.assertTrue(verify(package))
            previous.write_bytes(canonical_json(package))
            document.write_bytes(canonical_json(demo_input(AT, changed=True)))
            status, changed = self.call(
                "decision-refresh", str(previous), str(document), "--at", AT
            )
            self.assertEqual(status, 0)
            self.assertTrue(changed["flipped"])
            self.assertEqual(changed["previous"], package)

    def test_sprint_and_verify_commands_replay_the_same_export(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            output = str(Path(scratch) / "research")
            status, result = self.call("sprint", "--output", output, "--at", AT)
            self.assertEqual(status, 0)
            self.assertFalse(result["authorized"])
            status, result = self.call("verify-sprint", output)
            self.assertEqual((status, result["state"]), (0, "PASS"))

    def test_market_command_replays_retained_actions(self) -> None:
        data = market_dataset()
        record = asyncio.run(episode(data, scripted_agents(data), seed=23))
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / "episode.json"
            path.write_bytes(canonical_json(record))
            status, result = self.call("market-replay", str(path))
            self.assertEqual((status, result["state"]), (0, "PASS"))
            self.assertEqual(result["replayed_orders"], 36)

    def test_polynomial_command_distinguishes_bad_answers_and_bad_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / "input.json"
            data = {
                "left": [0, 3],
                "right": [0, 3],
                "candidate": [-9, 0],
                "width": 2,
                "modulus": None,
            }
            path.write_bytes(canonical_json(data))
            status, result = self.call("polynomial-check", str(path))
            self.assertEqual((status, result["state"]), (0, "PASS"))
            data["candidate"] = [9, 0]
            path.write_bytes(canonical_json(data))
            status, result = self.call("polynomial-check", str(path))
            self.assertEqual((status, result["state"]), (1, "FAIL"))
            del data["modulus"]
            path.write_bytes(canonical_json(data))
            self.assertEqual(self.call("polynomial-check", str(path))[0], 2)

    def test_doctor_and_internal_gate_never_assert_official_qualification(self) -> None:
        status, result = self.call("fherma-doctor")
        self.assertEqual((status, result["state"]), (1, "BLOCKED"))
        status, result = self.call(
            "fherma-gate",
            "--leader-us",
            "260",
            "--sample-us",
            "600",
            "--sample-us",
            "650",
            "--sample-us",
            "700",
        )
        self.assertEqual((status, result["state"]), (0, "WATCH"))
        self.assertEqual(result["official_qualification"], "UNMEASURED")

    def test_input_read_failures_are_machine_readable_and_links_are_refused(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            path = root / "input.json"
            self.assertEqual(self.call("decision-package", str(path), "--at", AT)[0], 2)
            path.write_bytes(canonical_json(demo_input(AT)))
            (root / "link.json").symlink_to(path)
            self.assertEqual(
                self.call("decision-package", str(root / "link.json"), "--at", AT)[0], 2
            )


class SprintExportTests(unittest.TestCase):
    def rewrite_receipt(self, out: Path, path: str, value: object) -> None:
        """Model a forged artifact whose author also updates its unsigned manifest."""
        target = out / path
        target.write_bytes(canonical_json(value) + b"\n")
        manifest = json.loads((out / "manifest.json").read_text())
        manifest["files"][path] = hashlib.sha256(target.read_bytes()).hexdigest()
        (out / "manifest.json").write_bytes(canonical_json(manifest) + b"\n")

    def test_rehashed_summary_cannot_claim_independent_acceptance(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            out = Path(scratch) / "export"
            compile_sprint(out, at=AT)
            value = json.loads((out / "summary.json").read_text())
            value["independently_verified"] = True
            self.rewrite_receipt(out, "summary.json", value)
            with self.assertRaises(ResearchError):
                verify_sprint(out)

    def test_rehashed_market_comparison_must_match_replayed_metrics(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            out = Path(scratch) / "export"
            compile_sprint(out, at=AT)
            value = json.loads((out / "influence/comparison.json").read_text())
            value["metrics"][0] = {"allocative_efficiency": 999}
            self.rewrite_receipt(out, "influence/comparison.json", value)
            with self.assertRaises(ResearchError):
                verify_sprint(out)

    def test_valid_but_unrelated_history_is_not_the_exported_decision(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            out = Path(scratch) / "export"
            compile_sprint(out, at=AT)
            different = demo_input(AT)
            different["question"] = (
                "An unrelated study with coincidentally equal scores"
            )
            previous = evaluate(different, at=AT)
            history = refresh(previous, different, at=AT)
            self.rewrite_receipt(out, "army/refresh/history.json", history)
            with self.assertRaises(ResearchError):
                verify_sprint(out)

    def test_sources_are_unverified_and_schedule_keeps_three_lanes_distinct(
        self,
    ) -> None:
        plan = cast(dict[str, Any], load_plan())
        self.assertEqual(plan["source_status"], "OWNER_SUPPLIED_UNVERIFIED")
        self.assertEqual(sum(plan["allocation"].values()), 100)
        self.assertEqual([d["day"] for d in plan["days"]], list(range(1, 11)))
        self.assertTrue(all(lane["official_notice"] is None for lane in plan["lanes"]))

    def test_bundle_replays_and_never_overwrites_previous_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            out = Path(scratch) / "export"
            result = compile_sprint(out, at=AT)
            self.assertTrue(result["army_refresh_flipped"])
            self.assertEqual(verify_sprint(out)["state"], "PASS")
            self.assertEqual(result["buildanddo_release"], "HOLD")
            self.assertTrue((out / "army/proposal.md").is_file())
            self.assertTrue((out / "influence/proposal.md").is_file())
            with self.assertRaises(FoundryValidationError):
                compile_sprint(out, at=AT)

    def test_split_evidence_tampering_fails_verification(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            out = Path(scratch) / "export"
            compile_sprint(out, at=AT)
            (out / "army/point/human-approval.json").write_text('{"state":"APPROVED"}')
            with self.assertRaises(ResearchError):
                verify_sprint(out)

    def test_exports_are_deterministic_and_manifest_covers_exact_files(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            one, two = Path(scratch) / "one", Path(scratch) / "two"
            compile_sprint(one, at=AT)
            compile_sprint(two, at=AT)
            self.assertEqual(
                (one / "manifest.json").read_bytes(),
                (two / "manifest.json").read_bytes(),
            )
            manifest = json.loads((one / "manifest.json").read_text())["files"]
            for path, digest in manifest.items():
                self.assertEqual(
                    hashlib.sha256((one / path).read_bytes()).hexdigest(), digest
                )
            (one / "unexpected.json").write_bytes(canonical_json({}))
            with self.assertRaises(ResearchError):
                verify_sprint(one)


if __name__ == "__main__":
    unittest.main()
