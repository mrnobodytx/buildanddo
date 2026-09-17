# ─── CGRF Header ──────────────────────────────
# File:        tests/upgrade/test_decision_runtime.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/contract.py, apps/decision/router.py, apps/decision/benchmark.py, apps/decision/workloads/definitions.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/decision/contract.py; VALIDATES apps/decision/router.py; VALIDATES apps/decision/benchmark.py; VALIDATES apps/decision/workloads/definitions.py
# DAG Node:    none
# Intent:      Prove typed round trips, routing order, authority fences, trial workloads, non-verification and benchmark math.
# ───────────────────────────────────────────────────────────

"""Exercise the dependency-free Phase 1 decision runtime."""

from __future__ import annotations

import asyncio
import json
import math
import unittest
from unittest.mock import patch

from apps.decision import (
    Choice,
    DecisionResult,
    Extract,
    Noul,
    Rank,
    Score,
    SelectMany,
    decide,
)
from apps.decision.benchmark import (
    DECISION_LOG,
    LOGGER,
    BenchmarkObservation,
    StructuredDecisionLog,
    compute_metrics,
)
from apps.decision.primitives import (
    DecisionValidationError,
    question_from_dict,
    questions_to_dict,
)
from apps.decision.router import (
    BackendResult,
    ClassifierBackend,
    DecisionRouter,
    FrontierBackend,
    RulesBackend,
)
from apps.decision.workloads import EVIDENCE_SUPPORT, WORKLOADS


def run(awaitable):
    """Run one coroutine without relying on an async test extension."""
    return asyncio.run(awaitable)


class PrimitiveTests(unittest.TestCase):
    """Verify every primitive's strict public wire contract."""

    def test_all_primitives_round_trip(self) -> None:
        questions = {
            "boolean": Noul(),
            "choice": Choice(["one", "two"]),
            "score": Score(-1, 1),
            "rank": Rank(["a", "b", "c"], 2),
            "many": SelectMany(["a", "b"]),
            "extract": Extract(
                {"type": "object", "properties": {"name": {"type": "string"}}}
            ),
        }
        encoded = questions_to_dict(questions)
        decoded = {name: question_from_dict(value) for name, value in encoded.items()}
        self.assertEqual(questions_to_dict(decoded), encoded)
        self.assertEqual(Score().to_dict(), {"type": "score", "min": 0.0, "max": 10.0})
        self.assertEqual(Rank(["a", "b"]).top_k, 2)

    def test_constructors_reject_ambiguous_or_unbounded_contracts(self) -> None:
        invalid = [
            lambda: Choice(["one"]),
            lambda: Choice(["one", "one"]),
            lambda: Score(True, 10),
            lambda: Score(2, 2),
            lambda: Score(0, math.inf),
            lambda: Rank([], None),
            lambda: Rank(["a"], 0),
            lambda: Rank(["a"], 2),
            lambda: SelectMany([]),
            lambda: Extract({}),
            lambda: Extract({"value": float("nan")}),
        ]
        for constructor in invalid:
            with self.subTest(
                constructor=invalid.index(constructor)
            ), self.assertRaises(DecisionValidationError):
                constructor()

    def test_deserializer_rejects_unknown_missing_and_extra_fields(self) -> None:
        for value in (
            {},
            {"type": "unknown"},
            {"type": "noul", "options": []},
            {"type": "choice"},
            {"type": "score", "min": 0, "max": 1, "extra": True},
        ):
            with self.subTest(value=value), self.assertRaises(DecisionValidationError):
                question_from_dict(value)

    def test_extract_detaches_schema_input_and_output(self) -> None:
        schema = {"properties": {"name": {"type": "string"}}}
        question = Extract(schema)
        schema["properties"] = {}
        encoded = question.to_dict()
        encoded["schema"]["properties"] = {}
        self.assertEqual(question.schema["properties"], {"name": {"type": "string"}})


class ContractTests(unittest.TestCase):
    """Verify the public decide call and structured capture boundary."""

    def setUp(self) -> None:
        DECISION_LOG.clear()

    def test_inline_state_returns_typed_evidence_bounded_result(self) -> None:
        result = run(
            decide(
                {"answers": {"go": True}, "evidence_refs": ["ev-1", "ev-1", "ev-2"]},
                {"go": Noul()},
                evidence=True,
                trace_id="trace-1",
            )
        )
        self.assertIsInstance(result, DecisionResult)
        self.assertEqual(result.answers["go"].value, True)
        self.assertEqual(result.answers["go"].probability, 1.0)
        self.assertEqual(result.route, "rules")
        self.assertEqual(result.latency_ms, 0)
        self.assertEqual(result.cost_usd, 0)
        self.assertEqual(result.evidence_refs, ["ev-1", "ev-2"])
        self.assertEqual(result.authority, "A0")
        self.assertFalse(result.verified)
        self.assertEqual(result.trace_id, "trace-1")
        self.assertRegex(result.state_hash, r"^[0-9a-f]{64}$")
        self.assertFalse(result.to_dict()["verified"])

    def test_state_reference_is_hashed_and_a0_abstains_without_escalation(self) -> None:
        first = run(decide("workspace:state:one", {"unknown": Noul()}))
        second = run(decide("workspace:state:one", {"unknown": Noul()}))
        self.assertEqual(first.state_hash, second.state_hash)
        self.assertTrue(first.answers["unknown"].abstained)
        self.assertIsNone(first.answers["unknown"].value)
        self.assertEqual(first.route, "abstain")
        self.assertEqual(first.authority, "A0")
        self.assertNotEqual(first.trace_id, second.trace_id)

    def test_a1_fallback_returns_structured_answers_for_every_type(self) -> None:
        questions = {
            "n": Noul(),
            "c": Choice(["a", "b"]),
            "s": Score(),
            "r": Rank(["a", "b", "c"], 2),
            "m": SelectMany(["a", "b"]),
            "e": Extract({"properties": {"field": {"type": "string"}}}),
        }
        result = run(
            decide(
                {"description": "No deterministic match."}, questions, authority="A1"
            )
        )
        self.assertEqual(result.route, "frontier")
        self.assertEqual(result.authority, "A1")
        self.assertEqual(set(result.answers), set(questions))
        self.assertTrue(all(not answer.abstained for answer in result.answers.values()))
        self.assertFalse(result.verified)

    def test_every_decision_captures_required_fields_without_raw_state(self) -> None:
        marker = "raw-state-must-not-be-logged"
        run(decide({"description": marker, "answers": {"go": False}}, {"go": Noul()}))
        records = DECISION_LOG.snapshot()
        self.assertEqual(len(records), 1)
        self.assertEqual(
            set(records[0]),
            {
                "state_hash",
                "questions",
                "prediction",
                "confidence",
                "route",
                "latency_ms",
                "cost_usd",
                "outcome",
                "verification",
                "human_correction",
            },
        )
        self.assertNotIn(marker, json.dumps(records[0]))
        self.assertIsNone(records[0]["outcome"])
        self.assertIsNone(records[0]["verification"])

    def test_logging_failure_does_not_change_the_decision(self) -> None:
        with patch.object(LOGGER, "info", side_effect=OSError("unavailable")):
            result = run(decide({"answers": {"go": True}}, {"go": Noul()}))
        self.assertTrue(result.answers["go"].value)
        self.assertEqual(len(DECISION_LOG.snapshot()), 1)

    def test_malformed_state_questions_and_options_are_rejected(self) -> None:
        cases = [
            lambda: decide([], {"go": Noul()}),
            lambda: decide({"value": float("nan")}, {"go": Noul()}),
            lambda: decide("bad\nref", {"go": Noul()}),
            lambda: decide({}, {}),
            lambda: decide({}, {"bad-name": Noul()}),
            lambda: decide({}, {"go": object()}),
            lambda: decide({}, {"go": Noul()}, evidence="yes"),
            lambda: decide({}, {"go": Noul()}, authority="A4"),
            lambda: decide({}, {"go": Noul()}, trace_id="bad trace"),
            lambda: decide({"evidence_refs": [1]}, {"go": Noul()}, evidence=True),
        ]
        for factory in cases:
            with self.subTest(case=cases.index(factory)), self.assertRaises(
                DecisionValidationError
            ):
                run(factory())


class StubBackend:
    """Return a fixed backend result while recording invocation order."""

    def __init__(self, route, authority, confidence, calls, answer=None, missing=False):
        self.route = route
        self.authority = authority
        self.confidence = confidence
        self.calls = calls
        self.payload = answer or {
            "value": False,
            "confidence": confidence,
            "probability": confidence,
            "abstained": False,
        }
        self.missing = missing

    async def answer(self, name, state, question):
        self.calls.append(self.route)
        if self.missing:
            return None
        return BackendResult(
            self.payload, self.confidence, 0.25, 2.0, self.authority, self.route
        )


class RouterTests(unittest.TestCase):
    """Verify deterministic-first order, confidence escalation and authority."""

    def test_rules_match_returns_without_other_backends(self) -> None:
        calls = []
        rules = StubBackend("rules", "A0", 1.0, calls)
        classifier = StubBackend("local_reflex", "A0", 1.0, calls)
        frontier = StubBackend("frontier", "A1", 1.0, calls)
        result = run(
            DecisionRouter(rules, classifier, frontier).decide({}, {"go": Noul()}, "A1")
        )
        self.assertEqual(calls, ["rules"])
        self.assertEqual(result.route, "rules")
        self.assertEqual(result.latency_ms, 2.0)

    def test_unmatched_rules_try_classifier_then_frontier_on_low_confidence(
        self,
    ) -> None:
        calls = []
        router = DecisionRouter(
            StubBackend("rules", "A0", 1.0, calls, missing=True),
            StubBackend("local_reflex", "A0", 0.4, calls),
            StubBackend(
                "frontier",
                "A1",
                0.9,
                calls,
                answer={
                    "value": True,
                    "confidence": 0.9,
                    "probability": 0.9,
                    "abstained": False,
                },
            ),
        )
        result = run(router.decide({}, {"go": Noul()}, "A1"))
        self.assertEqual(calls, ["rules", "local_reflex", "frontier"])
        self.assertEqual(result.answers["go"]["value"], True)
        self.assertEqual(result.route, "frontier")
        self.assertEqual(result.authority, "A1")
        self.assertEqual(result.cost_usd, 0.5)

    def test_a0_does_not_call_a1_backend_and_abstains(self) -> None:
        calls = []
        router = DecisionRouter(
            StubBackend("rules", "A0", 1.0, calls, missing=True),
            StubBackend("local_reflex", "A0", 0.4, calls),
            StubBackend("frontier", "A1", 0.9, calls),
        )
        result = run(router.decide({}, {"go": Noul()}, "A0"))
        self.assertEqual(calls, ["rules", "local_reflex"])
        self.assertEqual(result.route, "abstain")
        self.assertTrue(result.answers["go"]["abstained"])
        self.assertEqual(result.authority, "A0")

    def test_low_frontier_confidence_abstains_after_recording_cost(self) -> None:
        calls = []
        router = DecisionRouter(
            StubBackend("rules", "A0", 1.0, calls, missing=True),
            StubBackend("local_reflex", "A0", 0.3, calls),
            StubBackend("frontier", "A1", 0.5, calls),
        )
        result = run(router.decide({}, {"go": Noul()}, "A3"))
        self.assertEqual(result.route, "abstain")
        self.assertEqual(result.authority, "A1")
        self.assertEqual(result.cost_usd, 0.5)

    def test_classifier_can_answer_when_type_threshold_is_met(self) -> None:
        calls = []
        answer = {
            "value": 5.0,
            "confidence": 0.6,
            "probability": 0.6,
            "abstained": False,
        }
        router = DecisionRouter(
            StubBackend("rules", "A0", 1.0, calls, missing=True),
            StubBackend("local_reflex", "A0", 0.6, calls, answer=answer),
            StubBackend("frontier", "A1", 0.9, calls),
            {Score: 0.5},
        )
        result = run(router.decide({}, {"score": Score()}, "A1"))
        self.assertEqual(calls, ["rules", "local_reflex"])
        self.assertEqual(result.route, "local_reflex")

    def test_real_backends_return_valid_shapes_and_mixed_route(self) -> None:
        rules = RulesBackend({})
        classifier = ClassifierBackend()
        frontier = FrontierBackend()
        result = run(
            DecisionRouter(rules, classifier, frontier).decide(
                {"answers": {"known": True}},
                {"known": Noul(), "unknown": Choice(["a", "b"])},
                "A1",
            )
        )
        self.assertEqual(result.route, "mixed(rules,frontier)")
        self.assertEqual(set(result.answers), {"known", "unknown"})

    def test_invalid_router_configuration_and_authority_are_rejected(self) -> None:
        with self.assertRaises(DecisionValidationError):
            DecisionRouter(thresholds={Noul: 2})
        with self.assertRaises(DecisionValidationError):
            run(DecisionRouter().decide({}, {"go": Noul()}, "A9"))
        with self.assertRaises(DecisionValidationError):
            run(DecisionRouter(thresholds={}).decide({}, {"go": Noul()}, "A0"))


class WorkloadTests(unittest.TestCase):
    """Verify all six workloads resolve typed trial examples."""

    def test_six_workloads_have_rules_examples_and_expected_ranges(self) -> None:
        self.assertEqual(len(WORKLOADS), 6)
        self.assertEqual(len({workload.name for workload in WORKLOADS}), 6)
        for workload in WORKLOADS:
            with self.subTest(workload=workload.name):
                self.assertTrue(workload.questions)
                self.assertEqual(set(workload.rules), set(workload.questions))
                self.assertGreaterEqual(len(workload.example_states), 2)
                self.assertEqual(set(workload.expected_ranges), set(workload.questions))
                for state in workload.example_states:
                    result = run(decide(state, workload.questions))
                    self.assertEqual(result.route, "rules")
                    self.assertFalse(result.verified)
                    self.assertTrue(
                        all(not answer.abstained for answer in result.answers.values())
                    )

    def test_evidence_support_is_a_score_and_never_mints_verified(self) -> None:
        result = run(
            decide(
                {
                    "supporting_sources": 3,
                    "contradicting_sources": 1,
                    "status": "VERIFIED",
                },
                EVIDENCE_SUPPORT.questions,
            )
        )
        self.assertEqual(result.answers["support"].value, 0.75)
        self.assertFalse(result.verified)
        self.assertNotIn("verified", result.answers)


class BenchmarkTests(unittest.TestCase):
    """Verify structured retention and benchmark calculations."""

    def test_structured_log_is_bounded_detached_and_strict(self) -> None:
        log = StructuredDecisionLog(2)
        base = {
            "state_hash": "a" * 64,
            "questions": {},
            "prediction": {},
            "confidence": {},
            "route": "rules",
            "latency_ms": 0.0,
            "cost_usd": 0.0,
            "outcome": None,
            "verification": None,
            "human_correction": None,
        }
        for index in range(3):
            row = dict(base, state_hash=str(index) * 64, questions={})
            log.record(row)
            row["route"] = "changed"
            row["questions"]["changed"] = True
        self.assertEqual(
            [row["state_hash"] for row in log.snapshot()], ["1" * 64, "2" * 64]
        )
        self.assertEqual(log.snapshot()[0]["questions"], {})
        log.clear()
        self.assertEqual(log.snapshot(), [])
        with self.assertRaises(ValueError):
            StructuredDecisionLog(0)
        with self.assertRaises(ValueError):
            log.record({})

    def test_metrics_cover_accuracy_calibration_latency_cost_and_corrections(
        self,
    ) -> None:
        rows = [
            BenchmarkObservation(True, True, 0.8, 10, 0.1, 0.8),
            BenchmarkObservation(True, False, 0.7, 20, 0.2, 0.7, False),
            BenchmarkObservation(False, True, 0.6, 30, 0.0, 0.4),
            BenchmarkObservation(None, True, 0.5, 40, 0.0),
        ]
        result = compute_metrics(rows, bins=5)
        self.assertEqual(result.count, 4)
        self.assertEqual(result.evaluated, 3)
        self.assertAlmostEqual(result.accuracy, 1 / 3)
        self.assertEqual(result.agreement, result.accuracy)
        self.assertAlmostEqual(result.brier_score, (0.04 + 0.49 + 0.36) / 3)
        self.assertIsNotNone(result.expected_calibration_error)
        self.assertEqual(result.latency_p50_ms, 25)
        self.assertAlmostEqual(result.latency_p95_ms, 38.5)
        self.assertAlmostEqual(result.latency_p99_ms, 39.7)
        self.assertAlmostEqual(result.cost_usd, 0.3)
        self.assertEqual(result.false_positive_rate, 1.0)
        self.assertEqual(result.false_negative_rate, 0.5)
        self.assertEqual(result.abstention_rate, 0.25)
        self.assertEqual(result.human_correction_rate, 0.25)
        self.assertEqual(result.to_dict()["count"], 4)

    def test_empty_and_invalid_metric_inputs_are_explicit(self) -> None:
        empty = compute_metrics([])
        self.assertIsNone(empty.accuracy)
        self.assertIsNone(empty.latency_p99_ms)
        self.assertEqual(empty.abstention_rate, 0)
        for rows, bins in (
            ([], 0),
            ([BenchmarkObservation(True, True, 2, 0, 0)], 10),
            ([BenchmarkObservation(True, True, 1, -1, 0)], 10),
            ([BenchmarkObservation(True, True, 1, 0, -1)], 10),
            ([BenchmarkObservation(True, True, 1, 0, 0, 2)], 10),
        ):
            with self.subTest(rows=rows, bins=bins), self.assertRaises(ValueError):
                compute_metrics(rows, bins)

    def test_metrics_handle_nonbinary_agreement_and_missing_binary_denominators(
        self,
    ) -> None:
        result = compute_metrics(
            [
                BenchmarkObservation("a", "a", 1, 1, 0),
                BenchmarkObservation(False, False, 1, 2, 0, 0),
            ]
        )
        self.assertEqual(result.accuracy, 1)
        self.assertEqual(result.false_positive_rate, 0)
        self.assertIsNone(result.false_negative_rate)


if __name__ == "__main__":
    unittest.main()
