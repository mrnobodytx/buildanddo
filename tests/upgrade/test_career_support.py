# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_career_support.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/models.py, libs/career_passport/jobs.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/career_passport/models.py; VALIDATES libs/career_passport/jobs.py; CONSUMES tests/upgrade/test_evolution_support.py
# Intent:      Supply explicitly synthetic work, postings and independent receipts without asserting real career qualifications.
# ───────────────────────────────────────────────────────────────

"""Keep synthetic career tests separate from the real repository dogfood capture."""

import hashlib
import json
from dataclasses import replace

from libs.capability_tokens.verification import ReviewPolicy
from libs.career_passport.jobs import Board, normalize_feed
from libs.career_passport.models import (
    Artifact,
    Contribution,
    Participation,
    WorkBundle,
)
from libs.career_passport.passport import CHECKS
from libs.evolution.common import digest
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.vocabulary import AuthorityTier
from tests.upgrade.test_evolution_support import ACTOR, VERIFIER, at, verification

PERSON = SemanticId("cni://person/synthetic-candidate")
WORKSPACE = "synthetic-workspace"
BOARD = Board("lever", "synthetic-employer", "Synthetic Employer")
TEXT = "Requirements\nMust implement Python in production.\nMust design distributed systems.\nPreferred\nExperience with Flink preferred."


def source(text="Synthetic measured project receipt", second=1):
    return Artifact(
        "synthetic:project-source",
        "a" * 40,
        at(second),
        ACTOR,
        text,
        ContentDigest(hashlib.sha256(text.encode()).hexdigest()),
    )


def work(
    *,
    participation=Participation.PERSONALLY_IMPLEMENTED,
    capabilities=("python",),
    scope=("production",),
    person=PERSON,
):
    artifact = source()
    contribution = Contribution(
        person,
        ACTOR,
        WORKSPACE,
        "Synthetic project",
        participation,
        True,
        "a bounded Python service",
        capabilities,
        scope,
        at(2),
        (artifact.source,),
    )
    receipt = verification(
        contribution.subject,
        tuple(map(str, contribution.artifact_ids)),
        when=at(4),
        checks=CHECKS,
        actor=ACTOR,
        tier=AuthorityTier.A0,
    )
    bundle = WorkBundle(WORKSPACE, at(5), (artifact,), (contribution,), (receipt,))
    policy = ReviewPolicy(
        receipt.policy.policy_id,
        receipt.policy.policy_version,
        (VERIFIER,),
        (ContentDigest(digest(receipt)),),
    )
    return bundle, policy


def repin(bundle, policy):
    return replace(
        policy, receipt_digests=tuple(ContentDigest(digest(r)) for r in bundle.reviews)
    )


def lever_rows(count=1, description=TEXT, start=0):
    return [
        {
            "id": "job-" + str(index),
            "text": "Synthetic Platform Engineer",
            "categories": {"location": "Synthetic location"},
            "descriptionPlain": description,
            "lists": [],
            "hostedUrl": f"https://jobs.lever.co/{BOARD.board}/job-{index}",
            "applyUrl": f"https://jobs.lever.co/{BOARD.board}/job-{index}/apply",
        }
        for index in range(start, start + count)
    ]


def jobs(count=1, description=TEXT, captured_at=None):
    return normalize_feed(
        BOARD,
        json.dumps(lever_rows(count, description)).encode(),
        captured_at=captured_at or at(6),
    )
