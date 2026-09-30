# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_work_support.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/evolution/work.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   CONSUMES libs/evolution/work.py; CONSUMES tests/upgrade/test_evolution_support.py
# Intent:      Supply explicit synthetic work, artifacts and externally pinned review fixtures without claiming live execution.
# ───────────────────────────────────────────────────────────────

"""Construct synthetic public work; fixtures are never operational receipts."""

from dataclasses import replace
from datetime import timedelta
import hashlib
import json
from pathlib import Path

from libs.capability_tokens.verification import ReviewPolicy
from libs.evolution.common import digest
from libs.evolution.work import (
    AcceptanceCheck,
    CodeHostIdentity,
    PUBLIC_FORBIDDEN,
    WorkContract,
    WorkSource,
    WorkResult,
    WorkEvidence,
    WorkCheck,
    WorkSubmission,
    WorkerIdentity,
)
from libs.semantic_twin.merkle import ContentDigest
from tests.upgrade.test_evolution_support import ACTOR, VERIFIER, at, verification

BASE = "a" * 40
CANDIDATE = "b" * 40
NOW = at(30)


def work(**changes) -> WorkContract:
    """Build a bounded synthetic work request with a frozen public source."""
    values = dict(
        schema="buildanddo.work/v1",
        mission_id="BD-SYNTHETIC-001",
        scope_id="synthetic/workspace",
        producer="buildanddo",
        consumer="citadel-nexus",
        lane="development",
        objective="Repair the fixture import boundary.",
        srs="SRS-BUILDANDDO-FIXTURE-001",
        dispatch="VCC-BUILDANDDO-FIXTURE-001",
        source=WorkSource("fixture/public", BASE),
        created_at=at(0),
        allowed_paths=("apps/fixture/**", "tests/fixture/**"),
        forbidden_paths=PUBLIC_FORBIDDEN,
        required_capabilities=("python",),
        acceptance=(
            AcceptanceCheck(
                "regression", "The import regression and existing checks pass."
            ),
        ),
        evidence_required=("commit", "test", "artifact"),
    )
    values.update(changes)
    return WorkContract(**values)


def manifest_bytes(
    contract: WorkContract, candidate: str = CANDIDATE, **changes
) -> bytes:
    """Build synthetic bytes matching the existing candidate manifest format."""
    value = {
        "schema_version": 1,
        "generated_at": (contract.created_at + timedelta(seconds=5)).isoformat(),
        "upstream": "github",
        "upstream_repository": contract.source.repository,
        "upstream_sha": candidate,
        "mirror_commit_before_provenance": candidate,
        "authority": "candidate_only",
        "production_authority": False,
        "tracked_files": [],
    }
    value.update(changes)
    value["manifest_sha256"] = hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return (json.dumps(value, indent=2) + "\n").encode()


def submission(
    directory: Path,
    contract: WorkContract | None = None,
    *,
    candidate: str = CANDIDATE,
    **changes,
) -> WorkSubmission:
    """Write real local fixture bytes for a producer-reported passing attempt."""
    contract = contract or work()
    blobs = (
        ("commit", "candidate.json", manifest_bytes(contract, candidate)),
        ("test", "tests.txt", b"synthetic regression: 3 cases passed\n"),
        ("artifact", "artifact.txt", b"synthetic build bytes\n"),
    )
    evidence = []
    directory.mkdir(parents=True, exist_ok=True)
    for kind, name, raw in blobs:
        (directory / name).write_bytes(raw)
        evidence.append(
            WorkEvidence(
                name,
                kind,
                name,
                hashlib.sha256(raw).hexdigest(),
                len(raw),
                contract.created_at + timedelta(seconds=5),
                ACTOR,
            )
        )
    result = WorkResult(
        schema="buildanddo.work-result/v1",
        work_digest=contract.digest,
        mission_id=contract.mission_id,
        scope_id=contract.scope_id,
        attempt_id="synthetic-attempt-1",
        worker=WorkerIdentity(
            ACTOR,
            "agent",
            (
                CodeHostIdentity("github", "123", "fixture-worker"),
                CodeHostIdentity("gitlab", "456", "fixture-worker"),
            ),
        ),
        source=contract.source,
        candidate_revision=candidate,
        changed_paths=("apps/fixture/module.py",),
        started_at=contract.created_at + timedelta(seconds=1),
        completed_at=contract.created_at + timedelta(seconds=10),
        status="PASS",
        checks=(
            WorkCheck(
                contract.acceptance[0].name,
                "PASS",
                tuple(e.evidence_id for e in evidence),
            ),
        ),
        evidence=tuple(evidence),
    )
    return WorkSubmission(contract, replace(result, **changes))


def pinned_review(value: WorkSubmission):
    """Reuse the existing semantic verification fixture and receiving pin contract."""
    receipt = verification(
        value.subject,
        value.required_sources,
        when=value.result.completed_at + timedelta(seconds=1),
        checks=tuple(c.name for c in value.work.acceptance),
        actor=value.result.worker.actor_id,
    )
    policy = ReviewPolicy(
        receipt.policy.policy_id,
        receipt.policy.policy_version,
        (VERIFIER,),
        (ContentDigest(digest(receipt)),),
    )
    return receipt, policy
