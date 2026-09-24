# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_development_support.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEVELOPMENT-LOOP-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/development.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/development.py; CONSUMES tests/upgrade/test_evolution_support.py
# Intent:      Keep synthetic source, reviewer and grading fixtures separate from actual development acceptance.
# ───────────────────────────────────────────────────────────────

"""Supply explicit synthetic fixtures; none is an authenticated outcome or promotion."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from libs.capability_tokens.verification import ReviewPolicy
from libs.evolution.common import digest
from libs.evolution.development import (
    FrozenPrediction,
    MeasuredTestRun,
    OutcomeReviewRequest,
    TestCounts,
    freeze_prediction,
)
from libs.evolution.intelligence import (
    DevelopmentOpportunity,
    IntelligenceSignal,
    JUDGE_WEIGHTS,
)
from libs.evolution.scorer import OutcomeLabels
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import AuthorityTier
from tests.upgrade.test_evolution_support import verification

AT = datetime(2026, 9, 21, 1, tzinfo=timezone.utc)
SHA = "a" * 40
ACTOR = SemanticId("cni://agent/synthetic-development-producer")
SCOPE = "synthetic-development/workspace"
MODULE = "libs/evolution/development_fixture.py"
CONSUMER = "libs/evolution/development_fixture_consumer.py"
TEST = "tests/upgrade/test_development_fixture.py"
SOURCES = {
    MODULE: b"def value():\n    return 1\n",
    CONSUMER: b"from libs.evolution.development_fixture import value\n",
    TEST: b"import unittest\nfrom libs.evolution.development_fixture_consumer import value\nclass Fixture(unittest.TestCase):\n    def test_value(self):\n        self.assertEqual(value(), 1)\n",
}


def source_fixture(root: Path) -> None:
    """Write a disposable source-test tree, not a fixture inside the application."""
    for name, raw in SOURCES.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    for name in ("tests/__init__.py", "tests/upgrade/__init__.py"):
        (root / name).write_text("")


def prediction(root: Path) -> FrozenPrediction:
    """Freeze a synthetic source revision with real captured file bytes."""
    source_fixture(root)
    with patch("libs.evolution.development._head", return_value=SHA):
        return freeze_prediction(
            root,
            changed_paths=(MODULE,),
            scope_id=SCOPE,
            mission_id="synthetic-mission",
            actor_id=ACTOR,
            at=AT,
        )


def measured(value: FrozenPrediction) -> MeasuredTestRun:
    """Make a labelled synthetic test-run observation for contract tests."""
    return MeasuredTestRun(
        prediction_id=value.prediction_id,
        source_sha=SHA,
        source_digest=ContentDigest(digest(value.file_digests)),
        selected_tests=value.selected_tests,
        started_at=AT + timedelta(seconds=1),
        completed_at=AT + timedelta(seconds=2),
        exit_code=0,
        counts=TestCounts(1, 0, 0, 0, 0, 0, ()),
        log="Synthetic unit-test fixture; not a real development receipt.\n",
        source_unchanged=True,
    )


def review_request(
    value: FrozenPrediction, run: MeasuredTestRun | None = None
) -> OutcomeReviewRequest:
    """Prepare synthetic labels which require a separate pinned reviewer to be admitted."""
    decision = value.decision
    labels = OutcomeLabels(
        rule_digest=ContentDigest(digest(value.rule)),
        applicable=True,
        action=decision,
        tests=decision.tests,
        safe_action_keys=(decision.action_key,),
        false_mutation=False,
        rollback_required=False,
    )
    return OutcomeReviewRequest(value, run or measured(value), labels)


def pinned_review(
    request: OutcomeReviewRequest,
) -> tuple[VerificationReceipt, ReviewPolicy]:
    """Create explicitly synthetic independent identity pins for source tests."""
    receipt = verification(
        request.subject,
        tuple(str(s) for s in request.required_sources),
        when=request.run.completed_at + timedelta(seconds=1),
        actor=request.prediction.actor_id,
        tier=AuthorityTier.A1,
        checks=("development_outcome",),
    )
    policy = ReviewPolicy(
        receipt.policy.policy_id,
        receipt.policy.policy_version,
        (receipt.result.verifier_id,),
        (ContentDigest(digest(receipt)),),
    )
    return receipt, policy


def signal(**changes: object) -> IntelligenceSignal:
    """Create an attributed synthetic claim; it is never an established fact."""
    data: dict[str, object] = dict(
        scope_id=SCOPE,
        claim_key="first-mission-evidence",
        statement="Competitor claims its onboarding is more understandable.",
        publisher="synthetic-publisher",
        origin_id="synthetic-original",
        source_ref="https://example.invalid/claim",
        source_digest=ContentDigest(hashlib.sha256(b"synthetic-claim").hexdigest()),
        published_at=AT - timedelta(minutes=2),
        observed_at=AT - timedelta(minutes=1),
        access="public",
        access_reference="synthetic public fixture",
    )
    data.update(changes)
    return IntelligenceSignal(**data)


def opportunity(value: FrozenPrediction) -> DevelopmentOpportunity:
    """Describe a bounded synthetic hypothesis with explicit planning estimates."""
    return DevelopmentOpportunity(
        proposal=value.proposal,
        signals=(signal(),),
        hypothesis="Earlier evidence may improve first-mission comprehension.",
        metric="first mission walkthrough completion",
        baseline=None,
        target="A distinct reviewer can locate the result evidence in 90 seconds.",
        acceptance=("Retain timed browser observations before and after the change.",),
        impact_bps=dict.fromkeys(JUDGE_WEIGHTS, 10000),
        confidence_bps=8000,
        evidence_strength_bps=5000,
        estimated_minutes=60,
        regression_risk=1,
        work_kind="demo",
    )
