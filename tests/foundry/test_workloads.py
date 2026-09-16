# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/foundry/test_workloads.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/baselines.py, foundry/shared/federal_foundry/market.py, foundry/shared/federal_foundry/retrieval.py, foundry/shared/federal_foundry/simulations.py
# EnumType:    Test
# EnumEdges:   VALIDATES foundry/shared/federal_foundry/baselines.py; VALIDATES foundry/shared/federal_foundry/market.py; VALIDATES foundry/shared/federal_foundry/retrieval.py; VALIDATES foundry/shared/federal_foundry/simulations.py
# DAG Node:    none
# Intent:      Verify reference algorithms against counted allocations, retrieval judgments, compute operations, decoded packets and real public-engine outcomes.
# ───────────────────────────────────────────────────────────────

"""Test the actual reference algorithms and their measurable denominators."""

from __future__ import annotations

import copy
from contextlib import chdir, redirect_stderr
import io
import json
from pathlib import Path
import tempfile
import unittest

from foundry.shared.federal_foundry import baselines, market, retrieval, simulations
from foundry.shared.federal_foundry.execution import computational_digest
from foundry.shared.federal_foundry.models import FoundryValidationError
from foundry.shared.federal_foundry.validation import canonical
from tests.foundry.test_foundry import ROOT


def fixture(lane: str) -> dict:
    """Read a checked-in synthetic fixture for direct algorithm tests."""
    return json.loads((ROOT / "foundry/fixtures" / f"{lane}.json").read_text())


class AlgorithmTests(unittest.TestCase):
    def test_truthful_allocation_matches_feasible_value_and_news_counterfactual(
        self,
    ) -> None:
        dataset = fixture("darpa-dv026-influence")
        original = copy.deepcopy(dataset)
        result = market.evaluate(dataset, "truthful-auction", 17)
        self.assertEqual(result["metrics"]["allocative_efficiency_pct"], 100)
        self.assertEqual(result["metrics"]["agent_count"], 12)
        self.assertGreater(result["metrics"]["counterfactual_changes"], 0)
        for clearing in result["details"]["factual"]:
            bids = clearing["bids"]
            winners = bids[: clearing["quantity"]]
            self.assertEqual(clearing["allocations"], [bid["agent"] for bid in winners])
            self.assertAlmostEqual(
                clearing["utility"], sum(bid["fixture_value"] for bid in winners)
            )
            self.assertAlmostEqual(
                clearing["optimal_utility"],
                sum(
                    sorted((bid["fixture_value"] for bid in bids), reverse=True)[
                        : clearing["quantity"]
                    ]
                ),
            )
            self.assertEqual(clearing["price"], bids[clearing["quantity"]]["price"])
        self.assertEqual(result, market.evaluate(dataset, "truthful-auction", 17))
        self.assertEqual(dataset, original)

    def test_shading_changes_measured_allocation_and_supply_denominator(self) -> None:
        dataset = fixture("darpa-dv026-influence")
        shaded = market.evaluate(dataset, "shaded-auction", 17)
        self.assertLess(shaded["metrics"]["allocative_efficiency_pct"], 100)
        self.assertGreater(shaded["metrics"]["allocative_efficiency_pct"], 0)
        dataset["news"] = []
        dataset["supply"] = {key: len(dataset["agents"]) for key in dataset["supply"]}
        full = market.evaluate(dataset, "shaded-auction", 9)
        self.assertEqual(full["metrics"]["counterfactual_changes"], 0)
        self.assertEqual(full["metrics"]["allocative_efficiency_pct"], 100)
        self.assertTrue(all(row["price"] == 0 for row in full["details"]["factual"]))

    def test_auction_rejects_unbounded_or_unknown_inputs(self) -> None:
        dataset = fixture("darpa-dv026-influence")
        for change in (
            {"agents": []},
            {"supply": {}},
            {"supply": {"unknown": 2}},
            {"rounds": 0},
            {"news": [{"round": 0, "asset": "unknown", "delta": 1}]},
            {"agents": [dataset["agents"][0]] * 2},
        ):
            with self.subTest(change=change), self.assertRaises(FoundryValidationError):
                market.evaluate({**dataset, **change}, "truthful-auction", 17)
        with self.assertRaises(FoundryValidationError):
            market.evaluate(dataset, "invented", 17)
        invalid = copy.deepcopy(dataset)
        invalid["agents"][0]["values"][next(iter(dataset["supply"]))] = -1
        with self.assertRaises(FoundryValidationError):
            market.evaluate(invalid, "truthful-auction", 17)

    def test_retrieval_uses_graded_truth_stable_ties_and_real_source_citations(
        self,
    ) -> None:
        dataset = {
            "top_k": 2,
            "documents": [
                {"id": "b", "title": "Alpha", "text": "alpha alpha"},
                {"id": "a", "title": "Alpha", "text": "alpha alpha"},
                {"id": "c", "title": "Beta", "text": "beta specification"},
            ],
            "queries": [{"id": "q", "text": "alpha", "relevance": {"a": 3, "b": 2}}],
        }
        for candidate in ("bm25", "tfidf"):
            result = retrieval.evaluate(dataset, candidate, 1)
            row = result["details"]["queries"][0]
            self.assertEqual([hit["document_id"] for hit in row["ranking"]], ["a", "b"])
            self.assertEqual(
                row["metrics"],
                {"precision_at_k": 1, "recall_at_k": 1, "ndcg_at_k": 1, "mrr": 1},
            )
            self.assertTrue(
                all(
                    len(hit["source_sha256"]) == 64
                    and hit["matched_terms"]["alpha"] > 0
                    for hit in row["ranking"]
                )
            )
            self.assertEqual(
                result,
                retrieval.evaluate(
                    {**dataset, "documents": list(reversed(dataset["documents"]))},
                    candidate,
                    99,
                ),
            )
            unknown = retrieval.evaluate(
                {
                    **dataset,
                    "queries": [{"id": "q", "text": "absent", "relevance": {"c": 3}}],
                },
                candidate,
                1,
            )
            self.assertEqual(unknown["metrics"]["recall_at_k"], 0)
            self.assertAlmostEqual(unknown["metrics"]["mrr"], 1 / 3)
        self.assertEqual(
            retrieval.tokens("CAF\u00c9 alpha-beta"), ("caf\u00e9", "alpha", "beta")
        )

    def test_retrieval_scores_the_checked_in_corpus_without_invented_judgments(
        self,
    ) -> None:
        dataset = fixture("navair-acquisition-analysis")
        for candidate in ("bm25", "tfidf"):
            result = retrieval.evaluate(dataset, candidate, 17)
            self.assertEqual(result["metrics"]["queries"], 6)
            self.assertEqual(result["metrics"]["documents"], 9)
            self.assertEqual(result["metrics"]["recall_at_k"], 1)
            self.assertGreater(result["metrics"]["ndcg_at_k"], 0.8)
            self.assertLess(result["metrics"]["precision_at_k"], 1)

    def test_retrieval_rejects_bad_corpus_labels_and_empty_queries(self) -> None:
        dataset = fixture("navair-acquisition-analysis")
        for change in (
            {"documents": []},
            {"queries": []},
            {"top_k": True},
            {"queries": [{"id": "q", "text": "word", "relevance": {"missing": 1}}]},
            {"queries": [{"id": "q", "text": "...", "relevance": {"DOC-01": 1}}]},
            {
                "queries": [
                    {
                        "id": "q",
                        "text": "word",
                        "relevance": {dataset["documents"][0]["id"]: 0},
                    }
                ]
            },
        ):
            with self.subTest(change=change), self.assertRaises(FoundryValidationError):
                retrieval.evaluate({**dataset, **change}, "bm25", 0)
        invalid = copy.deepcopy(dataset)
        invalid["documents"][0]["text"] = ""
        with self.assertRaises(FoundryValidationError):
            retrieval.evaluate(invalid, "tfidf", 0)
        with self.assertRaises(FoundryValidationError):
            retrieval.evaluate(dataset, "unknown", 0)

    def test_event_gating_preserves_predictions_and_counts_its_extra_checks(
        self,
    ) -> None:
        dataset = fixture("daf-nv027-low-swap")
        dense = simulations.low_swap(dataset, "dense-temporal", 17)
        gated = simulations.low_swap(dataset, "event-gated", 17)
        self.assertEqual(dense["metrics"]["accuracy"], 1)
        self.assertEqual(gated["metrics"]["accuracy"], 1)
        self.assertEqual(
            [row["predicted"] for row in dense["details"]["predictions"]],
            [row["predicted"] for row in gated["details"]["predictions"]],
        )
        self.assertEqual(dense["metrics"]["active_multiplications"], 4096)
        self.assertEqual(gated["metrics"]["active_multiplications"], 512)
        self.assertEqual(gated["metrics"]["gate_feature_checks"], 1024)
        self.assertEqual(gated["metrics"]["compute_fraction"], 0.125)
        self.assertNotIn("watts", gated["metrics"])

    def test_compute_fixture_rejects_dimensions_thresholds_and_unknown_labels(
        self,
    ) -> None:
        dataset = fixture("daf-nv027-low-swap")
        for change in (
            {"weights": []},
            {"weights": [[1], [1]]},
            {"weights": [[1, 2], [1, 2, 3]]},
            {"frames": []},
            {"leak": 1},
            {"gate_threshold": 10},
            {"frames": [{"features": [], "label": -1}]},
            {"frames": [{"features": [0] * 16, "label": 50}]},
        ):
            with self.subTest(change=change), self.assertRaises(FoundryValidationError):
                simulations.low_swap({**dataset, **change}, "event-gated", 0)
        with self.assertRaises(FoundryValidationError):
            simulations.low_swap(dataset, "unknown", 0)

    def test_semantic_receiver_uses_encoded_bytes_and_applies_deletions(self) -> None:
        dataset = fixture("darpa-semantic-isr")
        full = simulations.semantic(dataset, "full-scene-json", 17)
        delta = simulations.semantic(dataset, "roi-delta-json", 17)
        self.assertEqual(
            full["metrics"]["wire_bytes"], full["metrics"]["full_scene_bytes"]
        )
        self.assertEqual(
            delta["metrics"]["wire_bytes"],
            sum(len(canonical(packet)) for packet in delta["details"]["packets"]),
        )
        self.assertLess(delta["metrics"]["byte_ratio"], 0.4)
        self.assertEqual(delta["metrics"]["mission_object_recall"], 1)
        self.assertLessEqual(delta["metrics"]["position_mae"], 0.05)
        removed = [
            identity
            for packet in delta["details"]["packets"]
            for identity in packet["removed"]
        ]
        self.assertTrue(removed)
        self.assertFalse(
            set(removed)
            & {row["id"] for row in delta["details"]["receiver"][-1]["objects"]}
        )

    def test_semantic_receiver_rejects_reordered_duplicate_and_conflicting_packets(
        self,
    ) -> None:
        row = {"id": "object", "class": "boat", "x": 0, "y": 1, "confidence": 0.8}
        packet = {"sequence": 0, "reset": True, "updates": [row], "removed": []}
        state = simulations.apply_packet(packet, {}, 0)
        original = copy.deepcopy(state)
        for change in (
            {"sequence": 2},
            {"reset": "yes"},
            {"updates": [row, row]},
            {"removed": ["object"]},
            {"updates": [{**row, "confidence": 2}]},
            {"updates": [{**row, "x": float("nan")}]},
        ):
            with self.subTest(change=change), self.assertRaises(FoundryValidationError):
                simulations.apply_packet({**packet, **change}, state, 0)
        self.assertEqual(state, original)
        self.assertEqual(
            simulations.apply_packet(
                {"sequence": 1, "reset": False, "updates": [], "removed": ["object"]},
                state,
                1,
            ),
            {},
        )
        self.assertEqual(
            simulations.apply_packet(
                {"sequence": 2, "reset": True, "updates": [], "removed": []}, state, 2
            ),
            {},
        )

    def test_semantic_input_requires_truth_and_well_formed_frames(self) -> None:
        dataset = fixture("darpa-semantic-isr")
        for change in (
            {"frames": []},
            {"frames": [{"objects": []}]},
            {"keyframe_every": 0},
        ):
            with self.assertRaises(FoundryValidationError):
                simulations.semantic({**dataset, **change}, "roi-delta-json", 0)
        for field, value in (("relevant", "yes"), ("x", None), ("id", "")):
            invalid = copy.deepcopy(dataset)
            invalid["frames"][0]["objects"][0][field] = value
            with self.assertRaises(FoundryValidationError):
                simulations.semantic(invalid, "roi-delta-json", 0)
        invalid = copy.deepcopy(dataset)
        for frame in invalid["frames"]:
            for row in frame["objects"]:
                row["relevant"] = False
        with self.assertRaises(FoundryValidationError):
            simulations.semantic(invalid, "roi-delta-json", 0)
        with self.assertRaises(FoundryValidationError):
            simulations.semantic(dataset, "unknown", 0)

    def test_maritime_calls_existing_engine_and_preserves_hold_and_order_invariance(
        self,
    ) -> None:
        dataset = fixture("diu-sentinel-maritime")
        ordered = simulations.maritime(dataset, "ordered-observations", 17)
        shuffled = simulations.maritime(dataset, "shuffled-observations", 17)
        self.assertEqual(
            ordered["details"]["analysis"], shuffled["details"]["analysis"]
        )
        self.assertEqual(ordered["metrics"]["analysis_replay_match"], 1)
        self.assertEqual(ordered["metrics"]["observations"], 5)
        self.assertEqual(ordered["metrics"]["candidates"], 2)
        self.assertEqual(ordered["metrics"]["admitted"], 0)
        self.assertEqual(ordered["metrics"]["hold_fraction"], 1)
        self.assertEqual(ordered["details"]["release_state"], "HOLD")
        with self.assertRaises(FoundryValidationError):
            simulations.maritime(dataset, "unknown", 0)

    def test_dispatcher_records_real_resources_and_reproducible_computational_bytes(
        self,
    ) -> None:
        for lane, candidates in baselines.CANDIDATES.items():
            for candidate in candidates:
                request = {
                    "lane_id": lane,
                    "candidate_id": candidate,
                    "seed": 17,
                    "dataset": fixture(lane),
                }
                result = baselines.evaluate(request)
                repeated = baselines.evaluate(request)
                self.assertEqual(
                    computational_digest(result), computational_digest(repeated)
                )
                self.assertGreater(result["resources"]["elapsed_ms"], 0)
                self.assertGreater(result["resources"]["peak_python_bytes"], 0)
                self.assertEqual(result["data_kind"], "synthetic")
                self.assertTrue(result["limitations"])
                self.assertFalse(
                    any(
                        name in result["metrics"]
                        for name in ("government_qualified", "hardware_watts")
                    )
                )

    def test_dispatcher_rejects_rights_and_candidate_substitution(self) -> None:
        lane = "navair-acquisition-analysis"
        request = {
            "lane_id": lane,
            "candidate_id": "bm25",
            "seed": 17,
            "dataset": fixture(lane),
        }
        for change in (
            {"lane_id": "unknown"},
            {"candidate_id": "shell"},
            {"seed": True},
            {"dataset": {**request["dataset"], "classification": "CUI"}},
            {"dataset": {**request["dataset"], "kind": "operational"}},
            {"dataset": {**request["dataset"], "lane_id": "foreign"}},
            {"dataset": {**request["dataset"], "license": ""}},
        ):
            with self.subTest(change=change), self.assertRaises(FoundryValidationError):
                baselines.evaluate({**request, **change})

    def test_child_entry_point_reads_frozen_input_and_refuses_overwrites(self) -> None:
        lane = "navair-acquisition-analysis"
        request = {
            "lane_id": lane,
            "candidate_id": "bm25",
            "seed": 17,
            "dataset": fixture(lane),
        }
        with tempfile.TemporaryDirectory() as tmp, chdir(tmp):
            Path("input.json").write_bytes(canonical(request))
            self.assertEqual(baselines.main(), 0)
            measurement = Path("measurement.json").read_bytes()
            with redirect_stderr(io.StringIO()):
                self.assertEqual(baselines.main(), 2)
            self.assertEqual(Path("measurement.json").read_bytes(), measurement)
