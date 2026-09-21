# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_evolution_cli.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/cli.py, libs/evolution/store.py, libs/evolution/benchmark.py, libs/evolution/loop.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/cli.py; VALIDATES libs/evolution/store.py; VALIDATES libs/evolution/benchmark.py; VALIDATES libs/evolution/loop.py; VALIDATES tests/upgrade/test_evolution_support.py
# Intent:      Validate durable lifecycle execution, scoped retries, historical boundaries and unknown scoring denominators.
# ───────────────────────────────────────────────────────────────

"""Exercise durable CLI feedback and honest historical scoring without external services."""

from __future__ import annotations

import hashlib
import io
import json
import runpy
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from libs.evolution.benchmark import (
    BenchmarkReport,
    HistoricalReadError,
    HistoricalModelCapture,
    benchmark,
    compare_epochs,
)
from libs.evolution.cli import main
from libs.evolution.common import digest
from libs.evolution.event import CitadelEvent, Phase
from libs.evolution.episode import Episode
from libs.evolution.loop import capture_epoch, refresh_episodes
from libs.evolution.promotion import (
    CompetenceState as C,
    PromotionPolicy,
    HealthObservation,
    advance,
    register,
)
from libs.evolution.replay import EvaluationReport, TeacherPrediction
from libs.evolution.scorer import OutcomeLabels, Resources
from libs.evolution.store import Journal
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.phase1.history import CommitObservation, FileChange
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.receipts import EvidenceKind
from libs.semantic_twin.vocabulary import TevvState

from tests.upgrade.test_evolution_learning import live_input
from tests.upgrade.test_evolution_support import (
    ACTOR,
    SCOPE,
    at,
    candidate,
    episode,
    event,
    graph,
    preferred,
    replay_case,
    verification,
)


class JournalTests(unittest.TestCase):
    def test_event_retries_keep_first_ingestion_and_other_scopes_cannot_read(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.sqlite"
            first = event(Phase.CONTEXT)
            with Journal(path, scope_id=SCOPE) as journal:
                self.assertEqual(journal.put_events((first,)), 1)
                self.assertEqual(
                    journal.put_events((replace(first, ingested_at=at(100)),)), 0
                )
                self.assertEqual(journal.events(), (first,))
                with self.assertRaises(ContractError):
                    journal.put_events(
                        (replace(first, scope_id="foreign", event_id=""),)
                    )
            with Journal(path, scope_id="foreign") as other:
                self.assertEqual(other.events(), ())
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_registry_compare_and_swap_and_history_retention(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.sqlite"
            with (
                Journal(path, scope_id=SCOPE) as first,
                Journal(path, scope_id=SCOPE) as second,
            ):
                record = register(candidate())
                first.save_registry(record, expected_revision=None)
                second.save_registry(
                    record, expected_revision=None
                )  # Idempotent retry.
                promoted = advance(record, C.CANDIDATE, at=at(70))
                first.save_registry(promoted, expected_revision=record.revision)
                self.assertEqual(
                    second.registry(record.candidate.candidate_id), promoted
                )
                with self.assertRaises(ContractError):
                    second.save_registry(
                        advance(record, C.CANDIDATE, at=at(71)),
                        expected_revision=record.revision,
                    )
                with self.assertRaises(ContractError):
                    first.save_registry(
                        replace(promoted, policy=PromotionPolicy(precision=0.5)),
                        expected_revision=promoted.revision,
                    )
                changed = replace(
                    promoted,
                    history=(
                        *promoted.history[:-1],
                        replace(promoted.history[-1], reason="rewrite"),
                    ),
                )
                with self.assertRaises(ContractError):
                    first.save_registry(changed, expected_revision=promoted.revision)
                self.assertEqual(len(first.artifacts("registry")), 2)

    def test_new_candidate_version_restarts_but_retains_previous_evidence(self) -> None:
        with (
            tempfile.TemporaryDirectory() as directory,
            Journal(
                Path(directory) / "journal.sqlite",
                scope_id=SCOPE,
            ) as journal,
        ):
            original = register(candidate())
            journal.save_registry(original, expected_revision=None)
            next_candidate = replace(
                original.candidate,
                discovered_at=at(100),
                compatibility=replace(
                    original.candidate.compatibility, source_sha="e" * 40
                ),
            )
            revised = register(next_candidate, policy=original.policy)
            journal.save_registry(revised, expected_revision=original.revision)
            self.assertEqual(journal.records()[0].state, C.HYPOTHESIS)
            self.assertEqual(len(journal.artifacts("registry")), 2)

    def test_database_tampering_and_bootstrap_escalation_fail_closed(self) -> None:
        with (
            tempfile.TemporaryDirectory() as directory,
            Journal(
                Path(directory) / "journal.sqlite",
                scope_id=SCOPE,
            ) as journal,
        ):
            with self.assertRaises(ContractError):
                journal.save_registry(preferred(), expected_revision=None)
            first = event(Phase.CONTEXT)
            journal.put_events((first,))
            journal.connection.execute("update artifacts set payload='{}'")
            journal.connection.commit()
            with self.assertRaises(ContractError):
                journal.events()

    def test_schema_and_symlink_validation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "journal.sqlite"
            with sqlite3.connect(path) as connection:
                connection.execute("pragma user_version=9")
            with self.assertRaises(ContractError):
                Journal(path, scope_id=SCOPE)
            link = Path(directory) / "linked.sqlite"
            link.symlink_to(path)
            with self.assertRaises(ContractError):
                Journal(link, scope_id=SCOPE)

    def test_epoch_counts_current_episode_versions_and_unknown_routing(self) -> None:
        with (
            tempfile.TemporaryDirectory() as directory,
            Journal(
                Path(directory) / "journal.sqlite",
                scope_id=SCOPE,
            ) as journal,
        ):
            value = episode()
            journal.put_events(value.events[:3])
            refresh_episodes(journal)
            journal.put_events(value.events[3:])
            first, delta = capture_epoch(journal, at=at(100))
            self.assertEqual(first.episode_counts["VERIFIED"], 1)
            self.assertEqual(len(journal.artifacts("episode")), 2)
            self.assertIsNone(first.summary()["cognition"]["TOKENLESS"]["value"])
            self.assertEqual(delta["status"], "UNMEASURED")
            second, delta = capture_epoch(journal, at=at(101))
            self.assertEqual(second.previous_root, first.root)
            self.assertIsNone(delta["tokenless_share_delta"])
            with self.assertRaises(ContractError):
                capture_epoch(journal, at=at(101))


class HistoricalBenchmarkTests(unittest.TestCase):
    def setUp(self) -> None:
        self.commit = "b" * 40
        self.parent = "a" * 40
        self.contents = {
            "libs/pkg/impl.py": b"def work(): return 1\n",
            "libs/pkg/caller.py": b"from libs.pkg.impl import work\n",
            "tests/test_pkg.py": b"from libs.pkg.caller import work\n",
            "libs/pkg/broken.py": b"def broken(:\n",
        }
        self.blobs = {
            hashlib.sha1(value).hexdigest(): value for value in self.contents.values()
        }
        self.tree = {
            path: hashlib.sha1(value).hexdigest()
            for path, value in self.contents.items()
        }
        self.observation = CommitObservation(
            self.commit,
            (self.parent,),
            at(80).isoformat(),
            "Outcome-spoofing message: all tests pass",
            (FileChange("M", "libs/pkg/impl.py"),),
        )
        self.calls = []

    def git(self, repository, *args, input_bytes=None):
        self.calls.append(args)
        if args[0] == "ls-tree":
            self.assertEqual(
                args[-1], self.parent
            )  # Never inspect AFTER content for predictions.
            return (
                b"\0".join(
                    f"100644 blob {sha} {len(self.contents[path])}\t{path}".encode()
                    for path, sha in self.tree.items()
                )
                + b"\0"
            )
        if args[0] == "cat-file":
            if "--batch-all-objects" in args:
                return b"".join(
                    f"{sha} blob {len(value)}\n".encode()
                    for sha, value in self.blobs.items()
                )
            return b"".join(
                f"{sha} blob {len(self.blobs[sha])}\n".encode()
                + self.blobs[sha]
                + b"\n"
                for sha in input_bytes.decode().splitlines()
            )
        self.assertEqual(args, ("show", "-s", "--format=%cI", self.commit))
        return at(80).isoformat().encode() + b"\n"

    def run_benchmark(self, *, outcomes=(), models=(), when=200):
        with (
            patch(
                "libs.evolution.benchmark.read_git_history",
                return_value=(self.observation,),
            ),
            patch("libs.evolution.benchmark._git", side_effect=self.git),
        ):
            return benchmark(
                Path("."),
                scope_id=SCOPE,
                evaluated_at=at(when),
                outcomes=outcomes,
                models=models,
            )

    def test_parent_import_closure_without_fabricated_historical_truth(self) -> None:
        report = self.run_benchmark()
        case = report.cases[0]
        self.assertEqual(
            case.prediction.dependencies, ("libs/pkg/caller.py", "tests/test_pkg.py")
        )
        self.assertEqual(case.prediction.tests, ("tests/test_pkg.py",))
        self.assertEqual(case.unparsed_python_files, 1)
        self.assertEqual(report.summary()["structural_parent_resolution"]["value"], 1.0)
        self.assertEqual(report.summary()["reviewed_outcomes"], 0)
        self.assertIsNone(
            report.summary()["graph_scores"]["failure_classification"]["value"]
        )
        self.assertIsNone(
            report.summary()["graph_scores"]["subsystem_resolution"]["value"]
        )
        self.assertEqual(report.summary()["model_captures"], 0)
        self.assertEqual(
            BenchmarkReport.from_json(report.to_json()).corpus_digest,
            report.corpus_digest,
        )
        self.assertFalse(
            any("checkout" in args or "fetch" in args for args in self.calls)
        )

    def test_scores_require_exact_source_bound_reviewed_labels(self) -> None:
        labels = OutcomeLabels(
            subsystems=("libs",),
            dependencies=("libs/pkg/caller.py", "tests/test_pkg.py"),
            tests=("tests/test_pkg.py",),
            runtime_risk="runtime",
            next_failure="actual.retained.failure",
            repair_class="restore_package",
        )
        outcome = episode(3, sha_override=self.commit, labels=labels.to_dict())
        report = self.run_benchmark(outcomes=(outcome,))
        self.assertEqual(report.summary()["graph_scores"]["test_recall"]["value"], 1)
        self.assertEqual(
            report.summary()["graph_scores"]["failure_classification"]["value"], 0
        )
        # Student abstains on an unsupported future-failure prediction, so this is 0/1, not invented success.
        teacher = HistoricalModelCapture(
            input_id=report.cases[0].input_id,
            model="synthetic-model",
            model_version="1",
            source_ref="synthetic:model-capture",
            source_digest=ContentDigest("c" * 64),
            observed_at=at(150),
            prediction=replace(
                report.cases[0].prediction,
                next_failure=labels.next_failure,
                repair_class=labels.repair_class,
            ),
        )
        compared = self.run_benchmark(outcomes=(outcome,), models=(teacher,), when=201)
        self.assertEqual(
            compared.summary()["model_scores"]["failure_classification"]["value"], 1
        )
        self.assertEqual(
            compared.summary()["model_calls"], 0
        )  # Capture was supplied; no model called.
        with self.assertRaises(ContractError):
            self.run_benchmark(models=(replace(teacher, input_id="different-context"),))

    def test_multiple_outcomes_are_a_conflict_and_raw_pass_has_no_grade(self) -> None:
        labels = OutcomeLabels(subsystems=("libs",))
        first = episode(3, sha_override=self.commit, labels=labels.to_dict())
        second = episode(4, sha_override=self.commit, labels=labels.to_dict())
        conflict = self.run_benchmark(outcomes=(first, second))
        self.assertEqual(conflict.summary()["reviewed_outcomes"], 0)
        self.assertIn(
            "multiple outcome episodes require explicit reconciliation",
            conflict.cases[0].gaps,
        )
        raw = self.run_benchmark(
            outcomes=(
                episode(
                    3, typed=False, sha_override=self.commit, labels=labels.to_dict()
                ),
            )
        )
        self.assertEqual(raw.summary()["reviewed_outcomes"], 0)

    def test_final_verified_result_must_name_the_commit_being_graded(self) -> None:
        outcome = episode(3, labels=OutcomeLabels(subsystems=("libs",)).to_dict())
        prior = replace(outcome.events[0], source_sha=self.commit, event_id="")
        mixed = Episode((prior, *outcome.events[1:]))
        self.assertEqual(mixed.status, "VERIFIED")
        report = self.run_benchmark(outcomes=(mixed,))
        self.assertEqual(report.summary()["reviewed_outcomes"], 0)
        with self.assertRaises(ContractError):
            replace(report.cases[0], outcome=mixed)

    def test_epoch_delta_requires_same_corpus_and_real_denominators(self) -> None:
        first = self.run_benchmark()
        second = self.run_benchmark(when=201)
        delta = compare_epochs(first, second)
        self.assertEqual(delta["status"], "COMPARABLE")
        self.assertIsNone(delta["graph_score_deltas"]["failure_classification"])
        different = replace(
            second,
            cases=(
                replace(second.cases[0], parent_tree_digest=ContentDigest("e" * 64)),
            ),
        )
        self.assertEqual(compare_epochs(first, different)["status"], "HOLD")
        self.assertEqual(compare_epochs(second, first)["status"], "HOLD")

    def test_missing_local_blobs_remain_gaps_without_fetching(self) -> None:
        missing = self.tree["libs/pkg/caller.py"]
        del self.blobs[missing]
        report = self.run_benchmark()
        self.assertIn("libs/pkg/caller.py", report.cases[0].unavailable_paths)
        self.assertEqual(report.summary()["cases_with_unavailable_source"], 1)
        self.assertFalse(any("fetch" in args for args in self.calls))

    def test_unavailable_parent_is_not_scored_as_a_resolution_failure(self) -> None:
        def unavailable(repository, *args, input_bytes=None):
            if args[0] == "ls-tree":
                raise HistoricalReadError("synthetic unavailable parent")
            return self.git(repository, *args, input_bytes=input_bytes)

        with (
            patch(
                "libs.evolution.benchmark.read_git_history",
                return_value=(self.observation,),
            ),
            patch("libs.evolution.benchmark._git", side_effect=unavailable),
        ):
            report = benchmark(Path("."), scope_id=SCOPE, evaluated_at=at(200))
        self.assertIsNone(report.cases[0].parent_tree_digest)
        self.assertIsNone(report.summary()["structural_parent_resolution"]["value"])

    def test_merge_changes_use_first_parent_metadata_without_rename_reads(self) -> None:
        merge = replace(self.observation, parents=(self.parent, "c" * 40), changes=())

        def merged(repository, *args, input_bytes=None):
            if args[0] == "diff-tree":
                self.assertIn("--no-renames", args)
                self.assertEqual(args[-2:], (self.parent, self.commit))
                return b"M\0libs/pkg/impl.py\0"
            return self.git(repository, *args, input_bytes=input_bytes)

        with (
            patch("libs.evolution.benchmark.read_git_history", return_value=(merge,)),
            patch("libs.evolution.benchmark._git", side_effect=merged),
        ):
            report = benchmark(Path("."), scope_id=SCOPE, evaluated_at=at(200))
        self.assertEqual(report.cases[0].prediction.tests, ("tests/test_pkg.py",))


class CliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / "journal.sqlite"

    def write(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value))
        return str(path)

    def command(self, *argv, when=1000, expected=0):
        output, error = io.StringIO(), io.StringIO()
        with redirect_stdout(output), redirect_stderr(error):
            code = main(
                [
                    "--state",
                    str(self.state),
                    "--scope",
                    SCOPE,
                    "--actor",
                    str(ACTOR),
                    *argv,
                ],
                now=at(when),
            )
        self.assertEqual(code, expected, error.getvalue())
        return json.loads(output.getvalue() or error.getvalue())

    def test_persistent_observe_learn_replay_shadow_promote_use_observe_loop(
        self,
    ) -> None:
        learned = candidate()
        inputs = self.write(
            "observations.json",
            [e.to_dict() for ep in (episode(0), episode(1)) for e in ep.events],
        )
        self.assertEqual(
            self.command("observe", "--input", inputs, "--format", "events", when=60)[
                "inserted"
            ],
            12,
        )
        self.assertEqual(
            self.command("observe", "--input", inputs, "--format", "events", when=60)[
                "inserted"
            ],
            0,
        )
        self.assertEqual(len(self.command("episodes", when=60)["episodes"]), 2)
        compatible = self.write("compatibility.json", graph().compatibility.to_dict())
        self.assertEqual(
            self.command(
                "candidates",
                "--before",
                at(60).isoformat(),
                "--compatibility",
                compatible,
                when=61,
            )["candidates"][0]["state"],
            "HYPOTHESIS",
        )
        self.command(
            "candidates",
            "--before",
            at(60).isoformat(),
            "--compatibility",
            compatible,
            when=62,
        )

        replay_cases = tuple(
            replay_case(100 + n, learned, base_override=65 + n * 5) for n in range(10)
        )
        shadow_cases = tuple(replay_case(n, learned) for n in range(5, 10))
        replay_input = self.write("replay.json", [c.to_dict() for c in replay_cases])
        shadow_input = self.write("shadow.json", [c.to_dict() for c in shadow_cases])
        self.command(
            "replay",
            "--candidate",
            learned.candidate_id,
            "--cases",
            replay_input,
            when=300,
        )
        from libs.evolution.compiler import evaluate_rule

        teachers = tuple(
            TeacherPrediction(
                input_id=c.observation.input_id,
                model="synthetic-teacher",
                model_version="1",
                source_ref="synthetic:model-capture",
                source_digest=ContentDigest(digest(c.observation)),
                predicted_at=c.observation.decision_at,
                observed_at=c.observation.decision_at,
                decision=evaluate_rule(learned.rule, c.observation),
                resources=Resources(model_calls=1, tokens=50),
            )
            for c in shadow_cases
        )
        teacher_input = self.write("teachers.json", [t.to_dict() for t in teachers])
        self.command(
            "shadow",
            "--candidate",
            learned.candidate_id,
            "--cases",
            shadow_input,
            "--teachers",
            teacher_input,
            when=301,
        )
        with Journal(self.state, scope_id=SCOPE) as journal:
            reports = tuple(
                EvaluationReport.from_dict(v) for v in journal.artifacts("evaluation")
            )
            saved = journal.registry(learned.candidate_id)
        self.assertEqual(saved.candidate, learned)
        receipt = verification(
            learned.subject,
            tuple(str(r.report_id) for r in reports),
            when=at(302),
            checks=("replay", "shadow", "safety", "compatibility"),
            kind=EvidenceKind.REPLAY,
        )
        proof = PromotionProof(
            subject=learned.subject,
            evidence=receipt.result.evidence,
            verification=receipt,
            tevv=receipt.result,
        )
        proof_input = self.write("proof.json", proof.to_dict())
        promoted = self.command(
            "promote",
            "--candidate",
            learned.candidate_id,
            "--through",
            "--to",
            "TOKENLESS_PREFERRED",
            "--proof",
            proof_input,
            when=303,
        )
        self.assertEqual(
            (promoted["state"], promoted["authority"]), ("TOKENLESS_PREFERRED", "A2")
        )

        observation = live_input()
        request = self.write("request.json", observation.to_dict())
        used = self.command(
            "use", "--input", request, "--mission", "fixture-mission", when=401
        )
        self.assertEqual(used["mode"], "TOKENLESS")
        action = CitadelEvent.from_dict(used["event"])
        correlation, sha = observation.correlation_id, observation.graph.source_sha
        context_events = (
            event(
                Phase.PROBLEM,
                second=390,
                correlation=correlation,
                sha=sha,
                features=dict(observation.features),
            ),
            event(Phase.CONTEXT, second=391, correlation=correlation, sha=sha),
            event(Phase.HYPOTHESIS, second=392, correlation=correlation, sha=sha),
        )
        result = event(
            Phase.RESULT,
            second=402,
            correlation=correlation,
            sha=sha,
            inputs=(action.event_id,),
            data={"attempt_id": action.data["attempt_id"], "status": "PASS"},
        )
        checked = verification(result.subject, (result.event_id,), when=at(403))
        review = event(
            Phase.VERIFICATION,
            second=404,
            correlation=correlation,
            sha=sha,
            receipt=checked,
            inputs=(result.event_id,),
            data={"attempt_id": action.data["attempt_id"]},
        )
        followup = self.write(
            "new-outcome.json", [e.to_dict() for e in (*context_events, result, review)]
        )
        self.command("observe", "--input", followup, "--format", "events", when=405)
        episodes = self.command("episodes", when=406)["episodes"]
        self.assertEqual(sum(ep["status"] == "VERIFIED" for ep in episodes), 3)
        status = self.command("status", when=407)
        self.assertEqual(status["cognition"]["TOKENLESS"]["numerator"], 1)
        self.assertEqual(status["safety"]["authority_expansions"], 0)
        self.assertEqual(
            self.command("status", when=408)["delta"]["tokenless_share_delta"], 0
        )

        changed_input = replace(
            observation,
            correlation_id="changed-source",
            decision_at=at(410),
            features_observed_at=at(409),
            graph=replace(observation.graph, source_sha="e" * 40),
        )
        changed_path = self.write("changed-input.json", changed_input.to_dict())
        changed = self.command("use", "--input", changed_path, when=411)
        self.assertEqual(changed["mode"], "UNRESOLVED")
        self.assertEqual(changed["demoted_capabilities"], [learned.candidate_id])
        regression = verification(
            learned.subject,
            (str(reports[0].report_id),),
            when=at(420),
            state=TevvState.FAIL,
        )
        health = HealthObservation(
            learned.subject,
            changed_input.graph.compatibility,
            at(420),
            tevv=regression.result,
        )
        health_path = self.write("health.json", health.to_dict())
        disabled = self.command(
            "demote",
            "--candidate",
            learned.candidate_id,
            "--health",
            health_path,
            when=421,
        )
        self.assertEqual((disabled["state"], disabled["authority"]), ("DISABLED", "A2"))

    def test_unconfigured_use_is_explicit_and_wrong_scope_fails(self) -> None:
        request = self.write("request.json", live_input().to_dict())
        output = self.command("use", "--input", request, when=401)
        self.assertEqual(output["mode"], "UNRESOLVED")
        self.assertIn("frontier_model is not configured", output["reasons"])
        self.command(
            "promote",
            "--candidate",
            "missing",
            "--to",
            "CANDIDATE",
            when=402,
            expected=2,
        )
        foreign = replace(event(Phase.CONTEXT), scope_id="foreign", event_id="")
        path = self.write("foreign.json", [foreign.to_dict()])
        self.command("observe", "--input", path, "--format", "events", expected=2)

    def test_human_status_and_phase1_capture_adapter(self) -> None:
        from libs.semantic_twin.ingestion.graph import SemanticGraph
        from libs.semantic_twin.ingestion.serializer import graph_payload

        payload = graph_payload(SemanticGraph(graph().objects))
        path = self.write("twin.json", {"graph": payload})
        result = self.command(
            "observe", "--input", path, "--format", "phase1", when=301
        )
        self.assertEqual(result["inserted"], 3)
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(
                main(
                    ["--state", str(self.state), "--scope", SCOPE, "status", "--human"],
                    now=at(302),
                ),
                0,
            )
        self.assertIn("CITADEL VERIFIED EVOLUTION", output.getvalue())
        self.assertIn("UNMEASURED", output.getvalue())

    def test_benchmark_cli_retains_full_report_and_refuses_overwrite(self) -> None:
        fixture = HistoricalBenchmarkTests()
        fixture.setUp()
        report = fixture.run_benchmark()
        output = str(self.root / "historical.json")
        with patch("libs.evolution.cli.benchmark", return_value=report):
            result = self.command(
                "benchmark", "--repository", ".", "--output", output, when=200
            )
            self.assertEqual(result["cases"], 1)
            self.command("benchmark", "--output", output, when=201, expected=2)
        self.assertEqual(BenchmarkReport.from_json(Path(output).read_text()), report)
        with patch(
            "libs.evolution.cli.benchmark",
            return_value=replace(report, evaluated_at=at(201)),
        ):
            compared = self.command("benchmark", when=201)
        self.assertEqual(compared["delta"]["status"], "COMPARABLE")

    def test_git_observation_uses_phase1_history_and_enforces_limit(self) -> None:
        commit = CommitObservation(
            "a" * 40,
            (),
            at(80).isoformat(),
            "synthetic observed commit",
            (FileChange("A", "synthetic.py"),),
        )
        with patch("libs.evolution.adapters.read_git_history", return_value=(commit,)):
            observed = self.command("observe", "--git", ".", when=100)
        self.assertEqual(observed["inserted"], 1)
        self.command("observe", "--git", ".", "--limit", "1001", when=101, expected=2)

    def test_both_executable_entrypoints_expose_the_same_commands(self) -> None:
        with (
            patch("sys.argv", ["citadel-evolve", "--help"]),
            redirect_stdout(io.StringIO()),
        ):
            with self.assertRaises(SystemExit) as module:
                runpy.run_module("libs.evolution", run_name="__main__")
            self.assertEqual(module.exception.code, 0)
            with self.assertRaises(SystemExit) as script:
                runpy.run_path(
                    str(Path(__file__).resolve().parents[2] / "scripts/citadel-evolve"),
                    run_name="__main__",
                )
            self.assertEqual(script.exception.code, 0)


if __name__ == "__main__":
    unittest.main()
