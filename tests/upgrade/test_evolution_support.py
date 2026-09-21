# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_evolution_support.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/event.py, libs/evolution/candidate.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/event.py; VALIDATES libs/evolution/candidate.py
# Intent:      Keep synthetic learning receipts and timelines distinct from real deployment evidence.
# ───────────────────────────────────────────────────────────────

"""Provide explicitly synthetic source-test data, never runtime acceptance evidence."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from libs.evolution.candidate import Compatibility, ResponseTemplate
from libs.evolution.common import digest, identity
from libs.evolution.episode import Episode
from libs.evolution.event import CitadelEvent, Phase, SourceKind
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest, ContextRoot
from libs.semantic_twin.receipts import (
    EvidenceKind,
    EvidenceReference,
    PolicyDecisionReceipt,
    PostconditionResult,
    TevvResult,
    VerificationMethod,
    VerificationReceipt,
)
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState, TevvState

NOW = datetime(2026, 9, 1, tzinfo=timezone.utc)
ACTOR = SemanticId("cni://agent/evolution-fixture-producer")
VERIFIER = SemanticId("cni://verifier/evolution-fixture-reviewer")
SCOPE = "synthetic-tenant/synthetic-workspace"
IMPORTER = SemanticId("cni://module/fixture/importer")
MODULE = SemanticId("cni://module/fixture/target")
RESPONSE = ResponseTemplate(
    diagnosis="Restore the package boundary",
    operation="repair_import",
    targets=(str(IMPORTER),),
    parameters={"replacement": "module.path"},
    tests=("test_imports",),
)


def at(seconds: int) -> datetime:
    """Offset the synthetic fixture clock."""
    return NOW + timedelta(seconds=seconds)


def compatibility(sha: str = "a" * 40) -> Compatibility:
    """Return an explicit synthetic compatibility boundary."""
    return Compatibility(sha, ContextRoot("b" * 64), ContentDigest("c" * 64))


def verification(
    subject: SubjectRef,
    sources: tuple[str, ...],
    *,
    when: datetime,
    state: TevvState = TevvState.PASS,
    checks: tuple[str, ...] = ("outcome",),
    actor: SemanticId = ACTOR,
    tier: AuthorityTier = AuthorityTier.A2,
    kind: EvidenceKind = EvidenceKind.TEST,
) -> VerificationReceipt:
    """Construct a typed synthetic receipt for negative and positive contract tests."""
    refs = tuple(
        EvidenceReference(
            identity("evidence", (source, subject.to_dict())),
            subject,
            kind,
            SemanticId(source),
            when,
        )
        for source in sources
    )
    policy = PolicyDecisionReceipt(
        decision_id=identity("receipt", ("policy", sources)),
        subject=subject,
        actor_id=actor,
        policy_id=SemanticId("cni://policy/fixture"),
        policy_version="fixture/1",
        tier=tier,
        allowed=True,
        target_ids=(subject.semantic_id,),
        approved_tools=("synthetic-fixture",),
        evaluated_at=when,
        reason="Synthetic source-test policy",
    )
    result = TevvResult(
        result_id=identity("test-run", sources),
        subject=subject,
        actor_id=actor,
        verifier_id=VERIFIER,
        policy_version=policy.policy_version,
        state=state,
        method=VerificationMethod.REPLAY
        if kind is EvidenceKind.REPLAY
        else VerificationMethod.TEST,
        evaluated_at=when,
        evidence=refs,
        checks=tuple(
            PostconditionResult(
                name, state is TevvState.PASS, tuple(ref.evidence_id for ref in refs)
            )
            for name in checks
        ),
    )
    return VerificationReceipt(
        identity("receipt", ("verify", sources)), subject, policy, result
    )


def event(
    phase: Phase,
    *,
    second: int = 0,
    correlation: str = "episode-0",
    sha: str = "a" * 40,
    data: dict[str, object] | None = None,
    inputs: tuple[str, ...] = (),
    features: dict[str, str] | None = None,
    receipt: VerificationReceipt | None = None,
    subject: SubjectRef | None = None,
) -> CitadelEvent:
    """Construct a source observation with actual typed fixture provenance."""
    target = subject or SubjectRef(SemanticId("cni://transaction/fixture"), "v1")
    return CitadelEvent(
        scope_id=SCOPE,
        occurred_at=at(second),
        observed_at=at(second),
        ingested_at=at(second),
        mission_id="fixture-mission",
        correlation_id=correlation,
        actor_id=ACTOR if phase is not Phase.VERIFICATION else VERIFIER,
        event_type="synthetic." + phase.value.lower(),
        subject_id=target.semantic_id,
        subject_version=target.version,
        source_sha=sha,
        source_kind=SourceKind.TEST,
        source_ref="synthetic:source-test-only",
        source_digest=ContentDigest(digest((phase.value, second))),
        evidence_state=EvidenceState.OBSERVED,
        authority=AuthorityTier.A2,
        risk="synthetic",
        phase=phase,
        inputs=inputs,
        features=features or {},
        data=data or {},
        verification=receipt,
    )


def episode(
    number: int = 0,
    *,
    passed: bool = True,
    typed: bool = True,
    labels: dict[str, object] | None = None,
    include_failed: bool = False,
    base_override: int | None = None,
    sha_override: str | None = None,
) -> Episode:
    """Build a complete synthetic narrative with optional retained failed attempt."""
    base = number * 30 if base_override is None else base_override
    correlation = f"episode-{number}"
    sha = sha_override or digest(correlation)[:40]

    def make(phase: Phase, second: int, **kwargs: object) -> CitadelEvent:
        return event(
            phase, second=base + second, correlation=correlation, sha=sha, **kwargs
        )

    events = [
        make(Phase.PROBLEM, 0, features={"exception": "ModuleNotFoundError"}),
        make(Phase.CONTEXT, 1),
        make(Phase.HYPOTHESIS, 2),
    ]
    for index, outcome in enumerate(([False] if include_failed else []) + [passed]):
        key = f"attempt-{index}"
        offset = index * 4
        action = make(
            Phase.ACTION,
            offset + 3,
            data={"attempt_id": key, "response": RESPONSE.to_dict()},
        )
        result = make(
            Phase.RESULT,
            offset + 4,
            inputs=(action.event_id,),
            data={
                "attempt_id": key,
                "status": "PASS" if outcome else "FAIL",
                "labels": labels or {},
            },
        )
        receipt = (
            verification(
                result.subject,
                (result.event_id,),
                when=at(base + offset + 5),
                state=TevvState.PASS if outcome else TevvState.FAIL,
            )
            if typed
            else None
        )
        review = make(
            Phase.VERIFICATION,
            offset + 6,
            inputs=(result.event_id,),
            subject=result.subject,
            receipt=receipt,
            data={"attempt_id": key},
        )
        events.extend((action, result, review))
    return Episode(tuple(events))


def graph(sha: str | None = None, second: int = 180):
    """Build a synthetic canonical graph with a source-bound dependency and test."""
    from libs.evolution.compiler import GraphSnapshot
    from libs.semantic_twin.ingestion.builder import RelationDraft, make_object
    from libs.semantic_twin.ingestion.graph import SemanticGraph
    from libs.semantic_twin.ingestion.inputs import SourceSnapshot
    from libs.semantic_twin.vocabulary import RelationPredicate

    snapshot = SourceSnapshot.derived(
        "synthetic.py", {"fixture": True}, observed_at=at(second)
    )
    test_id = SemanticId("cni://test/fixture/imports")
    objects = (
        make_object(
            IMPORTER,
            "Module",
            snapshot.source_path,
            snapshot=snapshot,
            claims=({"name": "importer"},),
            relations=(
                RelationDraft(
                    RelationPredicate.DEPENDS_ON,
                    str(MODULE),
                    ("import",),
                    state=EvidenceState.INFERRED,
                    kinds=(EvidenceKind.STATIC_ANALYSIS,),
                ),
                RelationDraft(
                    RelationPredicate.TESTED_BY,
                    test_id,
                    ("test",),
                    kinds=(EvidenceKind.SOURCE, EvidenceKind.TEST),
                ),
            ),
        ),
        make_object(
            MODULE,
            "Module",
            snapshot.source_path,
            snapshot=snapshot,
            claims=({"name": "target", "current_path": "module.path"},),
        ),
        make_object(
            test_id,
            "Test",
            snapshot.source_path,
            snapshot=snapshot,
            claims=({"name": "test_imports"},),
        ),
    )
    return GraphSnapshot(
        scope_id=SCOPE,
        source_sha=sha or digest("episode-6")[:40],
        as_of=at(second),
        objects=SemanticGraph(objects).objects,
        sbom_digest=ContentDigest("c" * 64),
    )


def candidate():
    """Learn one synthetic rule from two independent fixture episodes."""
    from libs.evolution.candidate import discover_candidates

    return discover_candidates(
        (episode(0), episode(1)),
        before=at(60),
        discovered_at=at(61),
        compatibility=graph().compatibility,
        actor_id=ACTOR,
    )[0]


def replay_case(
    number: int,
    learned=None,
    *,
    typed: bool = True,
    safe: bool = True,
    applicable: bool = True,
    base_override: int | None = None,
):
    """Retain a synthetic holdout outcome with explicit grading and safety labels."""
    from dataclasses import replace
    from libs.evolution.candidate import Decision
    from libs.evolution.compiler import DecisionInput
    from libs.evolution.replay import ReplayCase
    from libs.evolution.scorer import OutcomeLabels

    learned = learned or candidate()
    decision = Decision(
        diagnosis=RESPONSE.diagnosis,
        operation=RESPONSE.operation,
        targets=(IMPORTER,),
        parameters=RESPONSE.parameters,
        tests=RESPONSE.tests,
    )
    labels = OutcomeLabels(
        rule_digest=ContentDigest(digest(learned.rule)),
        applicable=applicable,
        action=decision,
        tests=decision.tests,
        safe_action_keys=(decision.action_key,) if safe else (),
        unsafe_action_keys=() if safe else (decision.action_key,),
        false_mutation=False,
        rollback_required=False,
    )
    ep = episode(
        number, typed=typed, labels=labels.to_dict(), base_override=base_override
    )
    base = number * 30 if base_override is None else base_override
    if not applicable:
        problem = replace(
            ep.events[0], event_id="", features={"exception": "SyntaxError"}
        )
        ep = Episode((problem, *ep.events[1:]))
    observation = DecisionInput(
        scope_id=SCOPE,
        correlation_id=ep.events[0].correlation_id,
        authority=AuthorityTier.A2,
        risk="synthetic",
        decision_at=at(base + 2),
        features_observed_at=at(base),
        features=ep.events[0].features,
        graph=graph(ep.source_shas[0], base),
        allowed_targets=(IMPORTER,),
        allowed_operations=("repair_import",),
    )
    return ReplayCase(observation, ep)


def evaluations(learned=None):
    """Produce measured fixture replay and shadow reports with distinct corpora."""
    from libs.evolution.compiler import evaluate_rule
    from libs.evolution.replay import EvaluationMode, TeacherPrediction, evaluate
    from libs.evolution.scorer import Resources

    learned = learned or candidate()
    replay = evaluate(
        learned,
        (replay_case(3, learned), replay_case(4, learned)),
        evaluated_at=at(230),
    )
    cases = (replay_case(5, learned), replay_case(6, learned))
    teachers = tuple(
        TeacherPrediction(
            input_id=case.observation.input_id,
            model="synthetic-teacher",
            model_version="fixture-1",
            source_ref="synthetic:model-capture",
            source_digest=ContentDigest(digest(case.observation)),
            predicted_at=case.observation.decision_at,
            observed_at=case.observation.decision_at,
            decision=evaluate_rule(learned.rule, case.observation),
            resources=Resources(latency_ms=12, tokens=45, model_calls=1, cost_usd=0.01),
        )
        for case in cases
    )
    shadow = evaluate(
        learned,
        cases,
        evaluated_at=at(231),
        mode=EvaluationMode.SHADOW,
        teachers=teachers,
    )
    return replay, shadow


def preferred():
    """Traverse every competence gate using explicitly synthetic independent evidence."""
    from libs.evolution.promotion import (
        CompetenceState as C,
        PromotionPolicy,
        advance,
        register,
    )
    from libs.semantic_twin.promotions import PromotionProof

    learned = candidate()
    replay, shadow = evaluations(learned)
    receipt = verification(
        learned.subject,
        (str(replay.report_id), str(shadow.report_id)),
        when=at(232),
        checks=("replay", "shadow", "safety", "compatibility"),
        kind=EvidenceKind.REPLAY,
    )
    proof = PromotionProof(
        subject=learned.subject,
        evidence=receipt.result.evidence,
        verification=receipt,
        tevv=receipt.result,
    )
    record = register(learned, policy=PromotionPolicy(replay_cases=2, shadow_cases=2))
    for index, target in enumerate(
        (
            C.CANDIDATE,
            C.REPLAY_PASS,
            C.SHADOW,
            C.VERIFIED_CAPABILITY,
            C.TOKENLESS_PREFERRED,
        )
    ):
        record = advance(
            record,
            target,
            at=at(233 + index),
            replay=replay,
            shadow=shadow,
            proof=proof,
        )
    return record
