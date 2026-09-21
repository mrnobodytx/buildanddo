# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_evolution_learning.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/replay.py, libs/evolution/promotion.py, libs/evolution/registry.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/replay.py; VALIDATES libs/evolution/promotion.py; VALIDATES libs/evolution/registry.py; VALIDATES tests/upgrade/test_evolution_support.py
# Intent:      Prove evidence gates, replay isolation, deterministic compilation and authority preservation under negative cases.
# ───────────────────────────────────────────────────────────────

"""Exercise held-out evidence, exact promotion proofs and unchanged proposal authority."""

from __future__ import annotations

import unittest
from dataclasses import replace

from libs.evolution.candidate import (
    Decision,
    GraphCondition,
    GraphLookup,
    ResponseTemplate,
    Rule,
)
from libs.evolution.compiler import DecisionInput, GraphSnapshot, evaluate_rule, propose
from libs.evolution.episode import Episode
from libs.evolution.promotion import (
    CapabilityRecord,
    CompetenceState as C,
    HealthObservation,
    PromotionPolicy,
    advance,
    demote,
    qualification_issues,
    register,
)
from libs.evolution.registry import (
    InferenceMode,
    ModelAttempt,
    TokenlessProgram,
    compile_capability,
    select,
)
from libs.evolution.replay import (
    EvaluationMode,
    EvaluationReport,
    TeacherPrediction,
    evaluate,
)
from libs.evolution.scorer import Rate, Resources
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest, SemanticRoot, SourceRoot
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.receipts import ActorType, EvidenceKind, EvidenceReference
from libs.semantic_twin.transactions import (
    ChangeContract,
    ChangeProposal,
    CompensationPlan,
    StateRoots,
)
from libs.semantic_twin.vocabulary import (
    AuthorityTier,
    RelationPredicate,
    SemanticTransactionState,
)

from tests.upgrade.test_evolution_support import (
    ACTOR,
    IMPORTER,
    MODULE,
    SCOPE,
    VERIFIER,
    at,
    candidate,
    evaluations,
    graph,
    preferred,
    replay_case,
    verification,
)


def live_input(learned=None) -> DecisionInput:
    """Return a synthetic request after all fixture competence gates."""
    learned = learned or candidate()
    return DecisionInput(
        scope_id=SCOPE,
        correlation_id="new-synthetic-mission",
        authority=learned.authority,
        risk=learned.risk,
        decision_at=at(400),
        features_observed_at=at(399),
        features={
            "exception": "ModuleNotFoundError",
            "importer": str(IMPORTER),
            "missing_module": str(MODULE),
        },
        graph=graph(),
        allowed_targets=(IMPORTER,),
        allowed_operations=("repair_import",),
    )


class CompilerTests(unittest.TestCase):
    def test_graph_rejects_relation_evidence_captured_after_decision(self) -> None:
        snapshot = graph()
        importer = snapshot.resolve(str(IMPORTER))
        edge = next(
            r for r in importer.relations if r.predicate is RelationPredicate.DEPENDS_ON
        )
        late = replace(
            edge,
            evidence=tuple(replace(ref, observed_at=at(181)) for ref in edge.evidence),
        )
        changed = replace(
            importer,
            relations=tuple(late if r is edge else r for r in importer.relations),
        )
        with self.assertRaises(ContractError):
            replace(
                snapshot,
                objects=tuple(
                    changed if obj.semantic_id == IMPORTER else obj
                    for obj in snapshot.objects
                ),
            )

    def test_graph_rule_resolution_and_reverse_tests_are_deterministic(self) -> None:
        observation = live_input()
        rule = Rule(
            {"exception": "ModuleNotFoundError"},
            ResponseTemplate(
                diagnosis="Restore package boundary",
                operation="repair_import",
                targets=("$importer",),
                parameters={"replacement": "$module_path"},
                reverse_tests_for=("$importer",),
            ),
            relations=(
                GraphCondition(
                    "$importer", RelationPredicate.DEPENDS_ON, "$missing_module"
                ),
            ),
            lookups=(GraphLookup("module_path", "$missing_module", "current_path"),),
        )
        decision = evaluate_rule(rule, observation)
        self.assertEqual(decision.parameters["replacement"], "module.path")
        self.assertIn("cni://test/fixture/imports", decision.tests)
        self.assertEqual(
            evaluate_rule(Rule.from_json(rule.to_json()), observation), decision
        )
        self.assertEqual(
            GraphSnapshot.from_json(observation.graph.to_json()).root,
            observation.graph.root,
        )

    def test_ambiguous_missing_or_out_of_scope_matches_abstain(self) -> None:
        observed = live_input()
        rule = candidate().rule
        self.assertIsNone(evaluate_rule(rule, replace(observed, features={})))
        self.assertIsNone(
            evaluate_rule(rule, replace(observed, allowed_operations=("inspect",)))
        )
        bad = replace(rule, response=replace(rule.response, targets=("$absent",)))
        self.assertIsNone(evaluate_rule(bad, observed))
        bad = replace(rule, lookups=(GraphLookup("value", "$absent", "current_path"),))
        self.assertIsNone(evaluate_rule(bad, observed))
        bad = replace(
            rule, response=replace(rule.response, parameters={"path": "$absent"})
        )
        self.assertIsNone(evaluate_rule(bad, observed))
        objects = list(observed.graph.objects)
        other = next(item for item in objects if item.semantic_id == MODULE)
        other = replace(other, claims=(*other.claims, {"name": "importer"}))
        objects = tuple(other if obj.semantic_id == MODULE else obj for obj in objects)
        ambiguous = replace(observed, graph=replace(observed.graph, objects=objects))
        self.assertIsNone(ambiguous.graph.resolve("importer"))

    def test_future_graph_and_future_features_are_rejected(self) -> None:
        observed = live_input()
        with self.assertRaises(ContractError):
            replace(observed.graph, as_of=at(179))
        with self.assertRaises(ContractError):
            replace(observed, features_observed_at=at(401))
        with self.assertRaises(ContractError):
            replace(observed, graph=replace(observed.graph, as_of=at(401)))
        with self.assertRaises(ContractError):
            replace(observed, allowed_targets=(SemanticId("cni://module/absent"),))

    def test_proposal_preserves_authority_and_compatibility(self) -> None:
        learned, observed = candidate(), live_input()
        proposal = propose(learned, observed)
        self.assertEqual(proposal.authority, AuthorityTier.A2)
        self.assertEqual(proposal.context_root, observed.graph.root)
        for replacement in (
            replace(observed, authority=AuthorityTier.A3),
            replace(observed, risk="another-risk"),
            replace(observed, graph=replace(observed.graph, source_sha="e" * 40)),
            replace(observed, graph=replace(observed.graph, sbom_digest=None)),
        ):
            with (
                self.subTest(replacement=replacement.authority),
                self.assertRaises(ContractError),
            ):
                propose(learned, replacement)

    def test_enters_existing_draft_transaction_without_policy_or_execution(
        self,
    ) -> None:
        observed = live_input()
        proposal = propose(candidate(), observed)
        tx_id = SemanticId("cni://transaction/evolution-fixture")
        subject = SubjectRef(tx_id, proposal.proposal_id.rsplit("/", 1)[-1])
        evidence = EvidenceReference(
            SemanticId("cni://evidence/evolution-fixture"),
            subject,
            EvidenceKind.OBSERVATION,
            SemanticId(proposal.proposal_id),
            at(401),
        )
        contract = ChangeContract(
            operation_id="fixture-op",
            correlation_id=observed.correlation_id,
            parent_op_id=None,
            objective_id=SemanticId("cni://objective/fixture"),
            mission_id=SemanticId("cni://mission/fixture"),
            actor_id=ACTOR,
            actor_type=ActorType.AGENT,
            executor_id=SemanticId("cni://agent/executor"),
            verifier_id=VERIFIER,
            authority_tier=AuthorityTier.A2,
            policy_version="fixture/1",
            target_ids=(IMPORTER,),
            tool_or_adapter="synthetic-adapter",
            requested_action=proposal.decision.requested_action,
            reason="Synthetic proposal contract",
            input_evidence=(evidence,),
            preconditions=("source unchanged",),
            postconditions=("tests pass",),
            forbidden_side_effects=("external writes",),
            rollback_or_compensation=CompensationPlan(
                "restore prior source", (IMPORTER,), ("source restored",)
            ),
            expected_outputs=("test receipt",),
            semantic_transaction_id=tx_id,
            source_sha=proposal.source_sha,
            context_root=proposal.context_root,
            requested_at=at(402),
        )
        importer = observed.graph.resolve(str(IMPORTER))
        tx = proposal.draft_transaction(
            contract=contract,
            before=StateRoots(
                SemanticRoot("1" * 64), SourceRoot("2" * 64), proposal.context_root
            ),
            targets=(importer.subject,),
            graph_change=ChangeProposal(add=(importer.relations[0],)),
        )
        self.assertEqual(tx.state, SemanticTransactionState.DRAFT)
        self.assertIsNone(tx.policy)
        self.assertIsNone(tx.execution)
        for changed in (
            replace(contract, authority_tier=AuthorityTier.A3),
            replace(contract, requested_action="unrelated effect"),
            replace(contract, correlation_id="foreign"),
            replace(contract, source_sha="e" * 40),
        ):
            with self.assertRaises(ContractError):
                proposal.require_contract(changed)


class ReplayTests(unittest.TestCase):
    def test_disjoint_replay_and_shadow_scores(self) -> None:
        replay, shadow = evaluations()
        self.assertEqual(replay.scores["trigger_precision"], Rate(2, 2))
        self.assertEqual(replay.scores["unsafe_recommendations"], Rate(0, 2))
        self.assertEqual(shadow.scores["teacher_agreement"], Rate(2, 2))
        self.assertEqual(
            shadow.summary()["resources"]["tokens"]["teacher_minus_student"], 90
        )
        self.assertEqual(EvaluationReport.from_json(replay.to_json()), replay)
        self.assertEqual(replay.summary()["effects_executed"], 0)

    def test_training_ids_sources_and_times_cannot_leak(self) -> None:
        learned = candidate()
        for number in (0, 1, 2):
            with self.subTest(number=number), self.assertRaises(ContractError):
                # case 2 occurs at 62, so move the discovery cutoff over it as well.
                selected = replace(
                    learned, discovery_cutoff=at(63), discovered_at=at(64)
                )
                evaluate(
                    selected, (replay_case(number, selected),), evaluated_at=at(100)
                )
        case = replay_case(3)
        modified_events = tuple(
            replace(event, source_sha=learned.training[0].source_shas[0], event_id="")
            for event in case.episode.events[:3]
        )
        with self.assertRaises(ContractError):
            replace(
                case,
                episode=Episode((*modified_events, *case.episode.events[3:])),
                observation=replace(
                    case.observation,
                    graph=replace(
                        case.observation.graph,
                        source_sha=learned.training[0].source_shas[0],
                    ),
                ),
            )
            evaluate(
                learned,
                (
                    replace(
                        case,
                        episode=Episode((*modified_events, *case.episode.events[3:])),
                        observation=replace(
                            case.observation,
                            graph=replace(
                                case.observation.graph,
                                source_sha=learned.training[0].source_shas[0],
                            ),
                        ),
                    ),
                ),
                evaluated_at=at(100),
            )
        with self.assertRaises(ContractError):
            evaluate(learned, (case, case), evaluated_at=at(100))

    def test_no_grade_from_untyped_pass_or_teacher_agreement(self) -> None:
        learned = candidate()
        case = replay_case(3, typed=False)
        prediction = evaluate_rule(learned.rule, case.observation)
        teacher = TeacherPrediction(
            input_id=case.observation.input_id,
            model="synthetic",
            model_version="1",
            source_ref="synthetic:fixture",
            source_digest=ContentDigest("a" * 64),
            predicted_at=at(92),
            observed_at=at(92),
            decision=prediction,
            resources=Resources(),
        )
        report = evaluate(
            learned,
            (case,),
            evaluated_at=at(100),
            mode=EvaluationMode.SHADOW,
            teachers=(teacher,),
        )
        self.assertEqual(report.scores["teacher_agreement"], Rate(1, 1))
        self.assertIsNone(report.scores["student_correctness"].value)
        self.assertIsNone(
            report.summary()["resources"]["tokens"]["teacher_minus_student"]
        )
        self.assertTrue(
            qualification_issues(
                report, PromotionPolicy(replay_cases=1, shadow_cases=1)
            )
        )

    def test_later_unlinked_attempt_invalidates_episode_grading(self) -> None:
        case = replay_case(3)
        pending = replace(
            case.episode.events[3],
            event_id="",
            occurred_at=at(100),
            observed_at=at(100),
            ingested_at=at(100),
            data={},
        )
        incomplete = replace(case, episode=Episode((*case.episode.events, pending)))
        self.assertIsNone(incomplete.truth)
        report = evaluate(candidate(), (incomplete,), evaluated_at=at(101))
        self.assertEqual(report.scores["truth_coverage"], Rate(0, 1))

    def test_teacher_disagreement_is_separate_from_correctness(self) -> None:
        learned = candidate()
        case = replay_case(3)
        teacher = TeacherPrediction(
            input_id=case.observation.input_id,
            model="synthetic",
            model_version="1",
            source_ref="synthetic:fixture",
            source_digest=ContentDigest("a" * 64),
            predicted_at=at(92),
            observed_at=at(92),
            decision=Decision(
                diagnosis="incorrect fixture",
                operation="repair_import",
                targets=(IMPORTER,),
                parameters={"replacement": "wrong"},
            ),
            resources=Resources(tokens=7, model_calls=1),
        )
        report = evaluate(
            learned,
            (case,),
            evaluated_at=at(100),
            mode=EvaluationMode.SHADOW,
            teachers=(teacher,),
        )
        self.assertEqual(report.scores["teacher_correctness"], Rate(0, 1))
        self.assertEqual(report.scores["student_correctness"], Rate(1, 1))
        self.assertEqual(report.scores["teacher_agreement"], Rate(0, 1))
        with self.assertRaises(ContractError):
            evaluate(
                learned,
                (case,),
                evaluated_at=at(100),
                mode=EvaluationMode.SHADOW,
                teachers=(replace(teacher, input_id="wrong"),),
            )
        with self.assertRaises(ContractError):
            evaluate(learned, (case,), evaluated_at=at(100), mode=EvaluationMode.SHADOW)

    def test_actual_safety_and_trigger_denominators(self) -> None:
        report = evaluate(
            candidate(),
            (replay_case(3, safe=False), replay_case(4, applicable=False)),
            evaluated_at=at(150),
        )
        self.assertEqual(report.scores["unsafe_recommendations"], Rate(1, 1))
        self.assertEqual(report.scores["trigger_precision"], Rate(1, 1))
        self.assertEqual(report.scores["trigger_recall"], Rate(1, 1))
        self.assertTrue(qualification_issues(report, PromotionPolicy(replay_cases=2)))

    def test_tampered_predictions_and_future_evidence_are_rejected(self) -> None:
        replay, _ = evaluations()
        with self.assertRaises(ContractError):
            replace(
                replay, cases=(replace(replay.cases[0], decision=None), replay.cases[1])
            )
        with self.assertRaises(ContractError):
            replace(replay, evaluated_at=at(50))
        with self.assertRaises(ContractError):
            replace(replay.cases[0].resources, model_calls=-1)
        with self.assertRaises(ContractError):
            replace(
                replay.cases[0],
                resources=Resources(latency_ms=1, model_calls=1, tokens=0, cost_usd=0),
            )
        with self.assertRaises(ContractError):
            replace(
                replay.cases[0].case,
                observation=replace(
                    replay.cases[0].case.observation, features={"future": "answer"}
                ),
            )


class PromotionTests(unittest.TestCase):
    def test_entire_ladder_uses_typed_proofs_and_round_trips(self) -> None:
        record = preferred()
        self.assertEqual(record.state, C.TOKENLESS_PREFERRED)
        self.assertEqual(record.candidate.authority, AuthorityTier.A2)
        self.assertEqual(len(record.history), 7)
        self.assertEqual(CapabilityRecord.from_json(record.to_json()), record)
        program = compile_capability(record)
        self.assertEqual(
            TokenlessProgram.from_json(program.to_json()).program_digest,
            program.program_digest,
        )

    def test_cannot_skip_ladder_or_promote_statistics_alone(self) -> None:
        record = register(
            candidate(), policy=PromotionPolicy(replay_cases=2, shadow_cases=2)
        )
        with self.assertRaises(ContractError):
            advance(record, C.TOKENLESS_PREFERRED, at=at(100))
        record = advance(record, C.CANDIDATE, at=at(70))
        replay, shadow = evaluations()
        record = advance(record, C.REPLAY_PASS, at=at(230), replay=replay)
        record = advance(record, C.SHADOW, at=at(231), shadow=shadow)
        with self.assertRaises(ContractError):
            advance(record, C.VERIFIED_CAPABILITY, at=at(250))
        with self.assertRaises(ContractError):
            compile_capability(record)
        with self.assertRaises(ContractError):
            CapabilityRecord.from_dict({**record.to_dict(), "verified": True})

    def test_proof_binds_candidate_reports_and_required_checks(self) -> None:
        full = preferred()
        # Remove prior, unused proof references for the setup.
        earlier = replace(
            full,
            history=tuple(replace(s, proof_digest=None) for s in full.history[:5]),
            proofs=(),
        )
        replay, shadow = full.evaluations
        for sources, checks in (
            ((str(replay.report_id),), ("replay", "shadow", "safety", "compatibility")),
            ((str(replay.report_id), str(shadow.report_id)), ("replay",)),
        ):
            receipt = verification(
                full.candidate.subject,
                sources,
                when=at(240),
                checks=checks,
                kind=EvidenceKind.REPLAY,
            )
            proof = PromotionProof(
                subject=full.candidate.subject,
                evidence=receipt.result.evidence,
                verification=receipt,
                tevv=receipt.result,
            )
            with self.assertRaises(ContractError):
                advance(earlier, C.VERIFIED_CAPABILITY, at=at(250), proof=proof)
        changed = replace(full.candidate, risk="changed")
        with self.assertRaises(ContractError):
            replace(full, candidate=changed)

    def test_unsafe_and_unknown_scores_cannot_qualify(self) -> None:
        learned = candidate()
        record = advance(
            register(learned, policy=PromotionPolicy(replay_cases=1)),
            C.CANDIDATE,
            at=at(70),
        )
        for case in (replay_case(3, safe=False), replay_case(3, typed=False)):
            report = evaluate(learned, (case,), evaluated_at=at(100))
            with self.assertRaises(ContractError):
                advance(record, C.REPLAY_PASS, at=at(101), replay=report)

    def test_unrelated_policy_targets_cannot_authorize_competence_promotion(
        self,
    ) -> None:
        full = preferred()
        earlier = replace(
            full,
            history=tuple(
                replace(step, proof_digest=None) for step in full.history[:5]
            ),
            proofs=(),
        )
        proof = full.proofs[0]
        receipt = proof.verification
        wrong = replace(receipt, policy=replace(receipt.policy, target_ids=(IMPORTER,)))
        with self.assertRaises(ContractError):
            advance(
                earlier,
                C.VERIFIED_CAPABILITY,
                at=at(250),
                proof=replace(proof, verification=wrong),
            )

    def test_demotion_retains_authority_and_history(self) -> None:
        record = preferred()
        changed = replace(record.candidate.compatibility, source_sha="e" * 40)
        downgraded = demote(
            record, HealthObservation(record.candidate.subject, changed, at(500))
        )
        self.assertEqual(downgraded.state, C.SHADOW)
        self.assertEqual(downgraded.candidate.authority, record.candidate.authority)
        self.assertEqual(downgraded.history[:-1], record.history)
        with self.assertRaises(ContractError):
            advance(
                downgraded, C.VERIFIED_CAPABILITY, at=at(501), proof=record.proofs[0]
            )
        with self.assertRaises(ContractError):
            demote(
                record, HealthObservation(record.candidate.subject, changed, at(200))
            )

    def test_degrading_precision_watches_and_unsafe_measurements_disable(self) -> None:
        record = preferred()
        incomplete = evaluate(
            record.candidate, (replay_case(20, typed=False),), evaluated_at=at(700)
        )
        watching = demote(
            record,
            HealthObservation(
                record.candidate.subject,
                record.candidate.compatibility,
                at(701),
                evaluation=incomplete,
            ),
        )
        self.assertEqual(watching.state, C.WATCH)
        unsafe = evaluate(
            record.candidate, (replay_case(21, safe=False),), evaluated_at=at(702)
        )
        disabled = demote(
            watching,
            HealthObservation(
                record.candidate.subject,
                record.candidate.compatibility,
                at(703),
                evaluation=unsafe,
            ),
        )
        self.assertEqual(disabled.state, C.DISABLED)
        with self.assertRaises(ContractError):
            advance(disabled, C.SHADOW, at=at(704))


class RegistryTests(unittest.TestCase):
    def test_preferred_use_generates_a_proposal_and_next_observation(self) -> None:
        record = preferred()
        result = select((record,), live_input(), actor_id=ACTOR, observed_at=at(401))
        self.assertEqual(result.mode, InferenceMode.TOKENLESS)
        self.assertEqual(result.proposal.authority, AuthorityTier.A2)
        self.assertEqual(result.event.data["resources"]["tokens"], 0)
        self.assertEqual(result.event.data["effects_executed"], 0)
        self.assertIn(result.proposal.proposal_id, result.event.outputs)
        self.assertEqual(result.event.data["attempt_id"], result.proposal.proposal_id)

    def test_local_then_frontier_fallback_is_explicit_and_has_same_boundary(
        self,
    ) -> None:
        observed = live_input()
        calls = []
        planned = propose(candidate(), observed)

        def local(value):
            calls.append("local")
            return ModelAttempt(
                "synthetic-local", "1", None, Resources(model_calls=1, tokens=5)
            )

        def frontier(value):
            calls.append("frontier")
            return ModelAttempt(
                "synthetic-frontier", "1", planned, Resources(model_calls=1, tokens=9)
            )

        result = select(
            (),
            observed,
            actor_id=ACTOR,
            observed_at=at(402),
            local_model=local,
            frontier_model=frontier,
        )
        self.assertEqual(calls, ["local", "frontier"])
        self.assertEqual(result.mode, InferenceMode.FRONTIER_MODEL)
        self.assertEqual(result.event.data["resources"]["tokens"], 14)
        self.assertIsNone(result.event.data["resources"]["cost_usd"])
        with self.assertRaises(ContractError):
            select(
                (),
                observed,
                actor_id=ACTOR,
                observed_at=at(402),
                local_model=lambda value: ModelAttempt(
                    "synthetic",
                    "1",
                    replace(planned, authority=AuthorityTier.A3),
                    Resources(),
                ),
            )

    def test_demoted_incompatible_or_ambiguous_capabilities_fall_back(self) -> None:
        record = preferred()
        observed = live_input()
        self.assertEqual(
            select((), observed, actor_id=ACTOR, observed_at=at(401)).mode,
            InferenceMode.UNRESOLVED,
        )
        ambiguous = select(
            (record, record), observed, actor_id=ACTOR, observed_at=at(401)
        )
        self.assertEqual(ambiguous.mode, InferenceMode.UNRESOLVED)
        self.assertIn("ambiguous rule matches", ambiguous.reasons)
        changed = replace(
            observed, graph=replace(observed.graph, sbom_digest=ContentDigest("e" * 64))
        )
        result = select((record,), changed, actor_id=ACTOR, observed_at=at(401))
        self.assertEqual(result.mode, InferenceMode.UNRESOLVED)

    def test_other_workspace_and_future_promotions_are_not_selected(self) -> None:
        record = preferred()
        observed = live_input()
        foreign = replace(
            observed,
            scope_id="foreign",
            graph=replace(observed.graph, scope_id="foreign"),
        )
        self.assertEqual(
            select((record,), foreign, actor_id=ACTOR, observed_at=at(401)).mode,
            InferenceMode.UNRESOLVED,
        )
        with self.assertRaises(ContractError):
            select((record,), observed, actor_id=ACTOR, observed_at=at(200))


if __name__ == "__main__":
    unittest.main()
