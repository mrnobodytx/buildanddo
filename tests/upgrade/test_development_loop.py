# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_development_loop.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEVELOPMENT-LOOP-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/development.py, tests/upgrade/test_development_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/development.py; CONSUMES tests/upgrade/test_development_support.py
# Intent:      Verify real process recording, source/temporal binding and independently pinned outcome admission without granting capability or action authority.
# ───────────────────────────────────────────────────────────────

"""Keep synthetic review tests and disposable process checks out of runtime claims."""

from __future__ import annotations

import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from libs.evolution.candidate import discover_candidates
from libs.evolution.common import digest
from libs.evolution.development import (
    FrozenPrediction,
    MeasuredTestRun,
    TestCounts,
    _head,
    admit_reviewed_outcome,
    freeze_prediction,
    main,
    observe_test_run,
    prediction_events,
    run_source_tests,
    source_bytes,
    test_graph,
)
from libs.evolution.episode import build_episodes
from libs.evolution.event import Phase
from libs.evolution.promotion import CompetenceState, PromotionPolicy, advance, register
from libs.evolution.registry import InferenceMode, compile_capability, select
from libs.evolution.replay import (
    EvaluationMode,
    ReplayCase,
    TeacherPrediction,
    evaluate,
)
from libs.evolution.scorer import Resources
from libs.evolution.store import Journal
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.receipts import EvidenceKind
from libs.semantic_twin.vocabulary import AuthorityTier, RelationPredicate
from tests.upgrade.test_development_sources import REPO, capture
from tests.upgrade.test_development_support import (
    ACTOR,
    AT,
    CONSUMER,
    MODULE,
    SCOPE,
    SHA,
    SOURCES,
    TEST,
    measured,
    opportunity,
    pinned_review,
    prediction,
    review_request,
)
from tests.upgrade.test_evolution_support import verification


class PredictionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.prediction = prediction(self.root)

    def test_transitive_test_selection_uses_canonical_tested_by_edges(self) -> None:
        self.assertEqual(self.prediction.selected_tests, (TEST,))
        predicates = {
            edge.predicate
            for obj in self.prediction.observation.graph.objects
            for edge in obj.relations
        }
        self.assertEqual(
            predicates, {RelationPredicate.DEPENDS_ON, RelationPredicate.TESTED_BY}
        )
        self.assertEqual(
            self.prediction, FrozenPrediction.from_json(self.prediction.to_json())
        )
        self.assertEqual(self.prediction.proposal.authority, AuthorityTier.A1)
        self.assertEqual(
            self.prediction.proposal.context_root,
            self.prediction.observation.graph.root,
        )

    def test_capture_bytes_not_only_head_define_prediction(self) -> None:
        previous = self.prediction
        (self.root / MODULE).write_text("def value():\n    return 2\n")
        with patch("libs.evolution.development._head", return_value=SHA):
            after = freeze_prediction(
                self.root,
                changed_paths=(MODULE,),
                scope_id=SCOPE,
                mission_id="synthetic-mission",
                actor_id=ACTOR,
                at=AT,
            )
        self.assertNotEqual(previous.prediction_id, after.prediction_id)
        self.assertNotEqual(
            previous.observation.graph.root, after.observation.graph.root
        )
        self.assertEqual(
            previous.observation.graph.source_sha, after.observation.graph.source_sha
        )

    def test_source_change_and_head_change_prevent_posthoc_execution(self) -> None:
        with (
            patch("libs.evolution.development._head", return_value="b" * 40),
            self.assertRaises(ContractError),
        ):
            run_source_tests(self.prediction, self.root)
        (self.root / MODULE).write_text("def value():\n    return 2\n")
        with (
            patch("libs.evolution.development._head", return_value=SHA),
            self.assertRaises(ContractError),
        ):
            run_source_tests(self.prediction, self.root)

    def test_missing_invalid_and_escaping_source_fails_closed(self) -> None:
        for paths in ((), ("outside.py",), (MODULE, MODULE)):
            with (
                patch("libs.evolution.development._head", return_value=SHA),
                self.assertRaises(ContractError),
            ):
                freeze_prediction(
                    self.root,
                    changed_paths=paths,
                    scope_id=SCOPE,
                    mission_id="x",
                    actor_id=ACTOR,
                )
        with self.assertRaises(ContractError):
            test_graph({MODULE: b"def broken(:"}, scope_id=SCOPE, source_sha=SHA, at=AT)
        (self.root / MODULE).unlink()
        (self.root / MODULE).symlink_to(self.root / CONSUMER)
        with self.assertRaises(ContractError):
            source_bytes(self.root)

    def test_source_and_authority_tampering_rejected_on_decode(self) -> None:
        for changes in (
            {"file_digests": {MODULE: "b" * 64}},
            {"file_digests": {"../escape.py": "a" * 64}},
            {"mission_id": ""},
        ):
            with self.assertRaises(ContractError):
                replace(self.prediction, **changes)
        with self.assertRaises(ContractError):
            replace(
                self.prediction,
                observation=replace(
                    self.prediction.observation, authority=AuthorityTier.A2
                ),
            )

    def test_git_revision_is_returned_as_exact_sha(self) -> None:
        with patch(
            "libs.evolution.development.subprocess.run",
            return_value=subprocess.CompletedProcess([], 0, (SHA + "\n").encode(), b""),
        ):
            self.assertEqual(_head(self.root), SHA)
        with (
            patch(
                "libs.evolution.development.subprocess.run",
                return_value=subprocess.CompletedProcess([], 1, b"", b""),
            ),
            self.assertRaises(ContractError),
        ):
            _head(self.root)

    def test_real_disposable_unittest_process_is_observed_not_verified(self) -> None:
        with patch("libs.evolution.development._head", return_value=SHA):
            run = run_source_tests(self.prediction, self.root)
        self.assertEqual(run.status, "PASS", run.log)
        self.assertEqual(run.counts.tests_run, 1)
        self.assertTrue(run.source_unchanged)
        self.assertNotIn("verified", run.to_dict())
        self.assertEqual(run, MeasuredTestRun.from_json(run.to_json()))

    def test_no_tests_empty_skips_and_timeout_never_pass(self) -> None:
        base = measured(self.prediction)
        for changes in (
            {"counts": None},
            {"counts": TestCounts(0, 0, 0, 0, 0, 0, ())},
            {"counts": TestCounts(1, 0, 0, 1, 0, 0, ())},
            {"counts": TestCounts(1, 0, 0, 0, 1, 0, ())},
            {"source_unchanged": False},
            {"exit_code": None},
        ):
            self.assertEqual(replace(base, **changes).status, "HOLD")
        self.assertEqual(replace(base, exit_code=1).status, "FAIL")
        self.assertEqual(
            replace(
                base, counts=TestCounts(1, 1, 0, 0, 0, 0, ("fixture.test",))
            ).status,
            "FAIL",
        )
        for transport in (
            subprocess.CompletedProcess([], 0, b"", b"no unittest result"),
            subprocess.TimeoutExpired(
                [], 1, output=b"partial", stderr=b"partial failure"
            ),
        ):
            with (
                patch("libs.evolution.development._head", return_value=SHA),
                patch(
                    "libs.evolution.development.subprocess.run",
                    **(
                        {"side_effect": transport}
                        if isinstance(transport, Exception)
                        else {"return_value": transport}
                    ),
                ),
            ):
                run = run_source_tests(self.prediction, self.root)
            self.assertEqual(run.status, "HOLD")
            self.assertIn(
                "partial" if isinstance(transport, Exception) else "no unittest",
                run.log,
            )

    def test_test_counts_and_selection_validation(self) -> None:
        for counts in (
            (-1, 0, 0, 0, 0, 0, ()),
            (1, 2, 0, 0, 0, 0, ()),
            (1, 0, 0, 2, 0, 0, ()),
        ):
            with self.assertRaises(ContractError):
                TestCounts(*counts)
        with self.assertRaises(ContractError):
            replace(
                measured(self.prediction),
                selected_tests=("tests/upgrade/test_live_private.py",),
            )
        with self.assertRaises(ContractError):
            replace(measured(self.prediction), completed_at=AT)


class OutcomeAdmissionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.prediction = prediction(self.root)
        self.request = review_request(self.prediction)
        self.receipt, self.policy = pinned_review(self.request)
        self.journal = Journal(self.root / "journal.sqlite", scope_id=SCOPE)
        self.addCleanup(self.journal.connection.close)

    def seed(self) -> None:
        self.journal.put_events(prediction_events(self.prediction))
        observe_test_run(self.journal, self.prediction, self.request.run)

    def admit(self, **changes):
        args = dict(
            journal=self.journal,
            request=self.request,
            receipt=self.receipt,
            policy=self.policy,
            at=AT + timedelta(seconds=5),
        )
        args.update(changes)
        return admit_reviewed_outcome(**args)

    def test_prediction_must_precede_process_and_journal_admission(self) -> None:
        with self.assertRaises(ContractError):
            observe_test_run(self.journal, self.prediction, self.request.run)
        with self.assertRaises(ContractError):
            replace(
                self.request,
                run=replace(self.request.run, started_at=AT - timedelta(seconds=1)),
            )
        with self.assertRaises(ContractError):
            self.admit()

    def test_process_pass_alone_has_no_truth_or_competence(self) -> None:
        self.seed()
        episodes = build_episodes(self.journal.events())
        self.assertEqual(len(episodes), 1)
        self.assertNotEqual(episodes[0].status, "VERIFIED")
        self.assertIsNone(ReplayCase(self.prediction.observation, episodes[0]).truth)
        self.assertEqual(self.journal.records(), ())
        self.assertFalse(
            any(e.phase is Phase.VERIFICATION for e in self.journal.events())
        )

    def test_pinned_independent_review_produces_existing_replay_case(self) -> None:
        self.seed()
        case = self.admit()
        self.assertIsInstance(case, ReplayCase)
        self.assertEqual(case.episode.status, "VERIFIED")
        self.assertEqual(case.truth, self.request.labels)
        self.assertEqual(case.observation, self.prediction.observation)
        self.assertEqual(self.journal.records(), ())
        before = len(self.journal.events())
        self.admit()
        self.assertEqual(len(self.journal.events()), before)

    def test_unpinned_receipt_does_not_mutate_journal(self) -> None:
        self.seed()
        before = self.journal.events()
        with self.assertRaisesRegex(ContractError, "authenticated content pin"):
            self.admit(policy=replace(self.policy, receipt_digests=()))
        self.assertEqual(self.journal.events(), before)

    def test_changed_labels_logs_and_rule_do_not_inherit_review(self) -> None:
        self.seed()
        for changed in (
            replace(self.request, labels=replace(self.request.labels, tests=())),
            replace(
                self.request, run=replace(self.request.run, log="changed source result")
            ),
        ):
            with self.assertRaises(ContractError):
                self.admit(request=changed)
        with self.assertRaises(ContractError):
            replace(
                self.request,
                labels=replace(
                    self.request.labels, rule_digest=ContentDigest("b" * 64)
                ),
            )

    def test_scope_source_stale_and_foreign_reviewer_denials(self) -> None:
        self.seed()
        with Journal(self.root / "other.sqlite", scope_id="other") as other:
            with self.assertRaises(ContractError):
                self.admit(journal=other)
        for changed in (
            {"source_sha": "b" * 40},
            {"source_digest": ContentDigest("b" * 64)},
            {"prediction_id": SemanticId("cni://decision/other")},
        ):
            with self.assertRaises(ContractError):
                replace(self.request, run=replace(self.request.run, **changed))
        with self.assertRaises(ContractError):
            self.admit(at=AT + timedelta(days=8))
        with self.assertRaises(ContractError):
            self.admit(
                policy=replace(
                    self.policy, verifiers=(SemanticId("cni://verifier/other"),)
                )
            )

    def test_failed_and_skipped_execution_is_retained_without_passing_labels(
        self,
    ) -> None:
        failed = replace(
            self.request.run,
            exit_code=1,
            counts=TestCounts(1, 1, 0, 0, 0, 0, ("fixture.failure",)),
        )
        self.journal.put_events(prediction_events(self.prediction))
        event = observe_test_run(self.journal, self.prediction, failed)
        self.assertEqual(event.data["process_status"], "FAIL")
        with self.assertRaises(ContractError):
            self.admit(request=replace(self.request, run=failed))
        with self.assertRaisesRegex(ContractError, "new prediction"):
            observe_test_run(self.journal, self.prediction, self.request.run)
        self.assertEqual(len(self.journal.events()), 5)


class IntegratedLoopTests(unittest.TestCase):
    def test_admitted_cases_reach_existing_competence_ladder_with_fixture_proofs(
        self,
    ) -> None:
        """Test API composition with synthetic identities; do not claim real certification."""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            initial = prediction(root)
            cases = []
            with Journal(root / "journal.sqlite", scope_id=SCOPE) as journal:
                for index in range(4):
                    when = AT + timedelta(seconds=10 * index)
                    sha = str(index + 1) * 40
                    graph = replace(
                        test_graph(SOURCES, scope_id=SCOPE, source_sha=sha, at=when),
                        sbom_digest=ContentDigest("d" * 64),
                    )
                    observation = replace(
                        initial.observation,
                        graph=graph,
                        decision_at=when,
                        features_observed_at=when,
                        correlation_id=f"synthetic-integration-{index}",
                    )
                    predicted = replace(initial, observation=observation)
                    run = replace(
                        measured(predicted),
                        source_sha=sha,
                        started_at=when + timedelta(seconds=1),
                        completed_at=when + timedelta(seconds=2),
                    )
                    request = review_request(predicted, run)
                    receipt, policy = pinned_review(request)
                    journal.put_events(prediction_events(predicted))
                    observe_test_run(journal, predicted, run)
                    cases.append(
                        admit_reviewed_outcome(
                            journal,
                            request,
                            receipt,
                            policy,
                            at=when + timedelta(seconds=4),
                        )
                    )
            candidate = discover_candidates(
                tuple(c.episode for c in cases[:2]),
                before=AT + timedelta(seconds=15),
                discovered_at=AT + timedelta(seconds=20),
                compatibility=cases[-1].observation.graph.compatibility,
                actor_id=ACTOR,
            )[0]
            self.assertEqual(candidate.rule, initial.rule)
            record = advance(
                register(
                    candidate, policy=PromotionPolicy(replay_cases=1, shadow_cases=1)
                ),
                CompetenceState.CANDIDATE,
                at=AT + timedelta(seconds=21),
            )
            replay = evaluate(
                candidate, (cases[2],), evaluated_at=AT + timedelta(seconds=25)
            )
            record = advance(
                record,
                CompetenceState.REPLAY_PASS,
                replay=replay,
                at=AT + timedelta(seconds=26),
            )
            teacher = TeacherPrediction(
                input_id=cases[3].observation.input_id,
                model="synthetic-source-test-model",
                model_version="fixture/1",
                source_ref="synthetic:fixture-only",
                source_digest=ContentDigest(digest("synthetic teacher")),
                predicted_at=AT + timedelta(seconds=30),
                observed_at=AT + timedelta(seconds=30),
                decision=cases[3].truth.action,
                resources=Resources(latency_ms=1, model_calls=1, tokens=1, cost_usd=0),
            )
            shadow = evaluate(
                candidate,
                (cases[3],),
                mode=EvaluationMode.SHADOW,
                teachers=(teacher,),
                evaluated_at=AT + timedelta(seconds=35),
            )
            record = advance(
                record,
                CompetenceState.SHADOW,
                shadow=shadow,
                at=AT + timedelta(seconds=36),
            )
            with self.assertRaises(ContractError):
                advance(
                    record,
                    CompetenceState.VERIFIED_CAPABILITY,
                    at=AT + timedelta(seconds=38),
                )
            receipt = verification(
                candidate.subject,
                (str(replay.report_id), str(shadow.report_id)),
                when=AT + timedelta(seconds=37),
                actor=ACTOR,
                tier=AuthorityTier.A1,
                checks=("replay", "shadow", "safety", "compatibility"),
                kind=EvidenceKind.REPLAY,
            )
            proof = PromotionProof(
                subject=candidate.subject,
                evidence=receipt.result.evidence,
                verification=receipt,
                tevv=receipt.result,
            )
            record = advance(
                record,
                CompetenceState.VERIFIED_CAPABILITY,
                proof=proof,
                at=AT + timedelta(seconds=38),
            )
            record = advance(
                record,
                CompetenceState.TOKENLESS_PREFERRED,
                at=AT + timedelta(seconds=39),
            )
            self.assertTrue(compile_capability(record).program_digest)
            observation = replace(
                cases[3].observation,
                decision_at=AT + timedelta(seconds=45),
                correlation_id="synthetic-dogfood",
            )
            selected = select(
                (record,),
                observation,
                actor_id=ACTOR,
                observed_at=AT + timedelta(seconds=45),
            )
            self.assertIs(selected.mode, InferenceMode.TOKENLESS)
            self.assertIs(selected.proposal.authority, AuthorityTier.A1)
            self.assertEqual(selected.proposal.decision.tests, cases[3].truth.tests)


class DevelopmentCliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.prediction = prediction(self.root)
        self.base = ["--state", str(self.root / "journal.sqlite"), "--scope", SCOPE]

    def call(self, *argv: str):
        output, errors = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            code = main([*self.base, *argv])
        return code, output.getvalue(), errors.getvalue()

    def write(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value.to_dict()))
        return str(path)

    def test_cli_records_before_running_and_retains_unknown_grading(self) -> None:
        path = self.root / "prediction.json"
        with patch("libs.evolution.development._head", return_value=SHA):
            code, output, errors = self.call(
                "predict",
                "--root",
                str(self.root),
                "--changed",
                MODULE,
                "--mission",
                "fixture",
                "--output",
                str(path),
            )
        self.assertEqual(code, 0, errors)
        self.assertEqual(json.loads(output)["competence"], "HYPOTHESIS")
        run = self.root / "run.json"
        with patch("libs.evolution.development._head", return_value=SHA):
            code, output, errors = self.call(
                "test", str(path), "--root", str(self.root), "--output", str(run)
            )
        self.assertEqual(code, 0, errors)
        self.assertEqual(json.loads(output)["grading"], "UNMEASURED")
        self.assertEqual(json.loads(output)["counts"]["tests_run"], 1)
        self.assertEqual(
            self.call(
                "test",
                str(path),
                "--root",
                str(self.root),
                "--output",
                str(self.root / "retry.json"),
            )[0],
            2,
        )
        self.assertEqual(json.loads(self.call("status")[1])["verified_episodes"], 0)
        self.assertEqual(
            self.call(
                "predict",
                "--root",
                str(self.root),
                "--changed",
                MODULE,
                "--mission",
                "fixture",
                "--output",
                str(path),
            )[0],
            2,
        )

    def test_cli_run_capture_and_offline_retry_use_selected_repository(self) -> None:
        source = capture()
        path = self.root / "provider.json"
        with patch(
            "libs.evolution.development.collect_github_run", return_value=source
        ):
            code, output, errors = self.call(
                "capture-run",
                "--repository",
                REPO,
                "--run-id",
                "10",
                "--attempt",
                "2",
                "--candidate",
                SHA,
                "--output",
                str(path),
            )
        self.assertEqual(code, 0, errors)
        event_id = json.loads(output)["event_id"]
        code, output, errors = self.call(
            "ingest-run", str(path), "--repository", REPO, "--candidate", SHA
        )
        self.assertEqual(code, 0, errors)
        self.assertEqual(event_id, json.loads(output)["event_id"])
        self.assertEqual(json.loads(self.call("status")[1])["observations"], 1)

    def test_cli_prepares_and_admits_only_separately_pinned_review(self) -> None:
        request = review_request(self.prediction)
        receipt, policy = pinned_review(request)
        with Journal(self.root / "journal.sqlite", scope_id=SCOPE) as journal:
            journal.put_events(prediction_events(self.prediction))
            observe_test_run(journal, self.prediction, request.run)
        output = self.root / "request.json"
        code, body, errors = self.call(
            "prepare-review",
            self.write("prediction.json", self.prediction),
            self.write("run.json", request.run),
            "--labels",
            self.write("labels.json", request.labels),
            "--output",
            str(output),
        )
        self.assertEqual(code, 0, errors)
        self.assertEqual(json.loads(body)["status"], "AWAITING_INDEPENDENT_REVIEW")
        result = self.root / "case.json"
        code, body, errors = self.call(
            "admit-review",
            str(output),
            "--receipt",
            self.write("receipt.json", receipt),
            "--review-policy",
            self.write("policy.json", policy),
            "--output",
            str(result),
        )
        self.assertEqual(code, 0, errors)
        self.assertEqual(json.loads(body)["status"], "VERIFIED")
        self.assertIsNotNone(ReplayCase.from_dict(json.loads(result.read_text())).truth)

    def test_cli_compiles_proposed_mission_and_rejects_missing_inputs(self) -> None:
        code, body, errors = self.call(
            "mission",
            self.write("opportunity.json", opportunity(self.prediction)),
            "--srs",
            "SRS-BUILDANDDO-FIXTURE-001",
            "--dispatch",
            "VCC-BUILDANDDO-FIXTURE-001",
            "--builder",
            str(ACTOR),
            "--verifier",
            "cni://verifier/fixture",
            "--output",
            str(self.root / "packet"),
        )
        self.assertEqual(code, 0, errors)
        self.assertEqual(json.loads(body)["status"], "proposed")
        self.assertEqual(
            self.call(
                "test",
                str(self.root / "missing.json"),
                "--output",
                str(self.root / "missing-run.json"),
            )[0],
            2,
        )

    def test_cli_compiles_observed_workflow_to_mission_without_manual_translation(
        self,
    ) -> None:
        code, body, errors = self.call(
            "mission-from-run",
            self.write("prediction.json", self.prediction),
            self.write("source.json", capture("failure")),
            "--repository",
            REPO,
            "--srs",
            "SRS-BUILDANDDO-FIXTURE-001",
            "--dispatch",
            "VCC-BUILDANDDO-FIXTURE-001",
            "--builder",
            str(ACTOR),
            "--verifier",
            "cni://verifier/fixture",
            "--output",
            str(self.root / "automatic-packet"),
        )
        self.assertEqual(code, 0, errors)
        self.assertEqual(json.loads(body)["status"], "proposed")
        packet = json.loads((self.root / "automatic-packet/mission.json").read_text())
        self.assertEqual(packet["rank"]["priority"], "P0")
        self.assertTrue(
            packet["opportunity"]["signals"][0]["source_event"].startswith(
                "cni://event/"
            )
        )


if __name__ == "__main__":
    unittest.main()
