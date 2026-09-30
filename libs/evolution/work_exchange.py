# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/work_exchange.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/evolution/work.py, libs/evolution/common.py, libs/capability_tokens/verification.py, libs/semantic_twin/receipts.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/vocabulary.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/evolution/work.py; CONSUMES libs/evolution/common.py; CONSUMES libs/capability_tokens/verification.py; CONSUMES libs/semantic_twin/receipts.py; CONSUMES libs/semantic_twin/contracts.py; CONSUMES libs/semantic_twin/identity.py; CONSUMES libs/semantic_twin/vocabulary.py
# Intent:      Recheck exact work evidence through the existing independent review boundary and retain deduplicated worker experience without promotion.
# ───────────────────────────────────────────────────────────────

"""Exchange local work bundles without network, execution, signing or publication."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
from pathlib import Path
import subprocess
from types import MappingProxyType
from collections.abc import Mapping
from typing import Literal, TypeVar

from libs.capability_tokens.verification import ReviewPolicy, require_review
from libs.semantic_twin.contracts import Contract, ContractError, require
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import AuthorityTier

from .common import decode_json, digest, mapping, timestamp
from .work import (
    MAX_ARTIFACT_BYTES,
    WorkContract,
    WorkResult,
    WorkSubmission,
    relative_path,
    revision,
)

T = TypeVar("T", bound=Contract)
MAX_CONTRACT_BYTES = 1024 * 1024


def _object(raw: bytes) -> dict[str, object]:
    try:
        return mapping(decode_json(raw))
    except RecursionError as exc:
        raise ContractError("JSON input exceeds nesting bound") from exc


def read_bytes(root: Path, name: str, *, limit: int = MAX_ARTIFACT_BYTES) -> bytes:
    """Read a bounded regular file beneath a selected directory without symlinks."""
    relative_path(name)
    require(not root.is_symlink(), "bundle root is a symlink")
    base = root.resolve()
    target = base
    for part in name.split("/"):
        target = target / part
        require(not target.is_symlink(), "symlink in evidence path")
    require(target.is_file(), "missing retained file")
    try:
        with target.open("rb") as stream:
            raw = stream.read(limit + 1)
    except OSError as exc:
        raise ContractError("cannot read retained file") from exc
    require(0 < len(raw) <= limit, "empty or oversized retained file")
    return raw


def load_contract(path: Path, contract: type[T]) -> T:
    """Decode an explicit local input with duplicate-key and size checks."""
    raw = read_bytes(path.parent, path.name, limit=MAX_CONTRACT_BYTES)
    return contract.from_dict(_object(raw))


def require_candidate_provenance(raw: bytes, result: WorkResult) -> None:
    """Bind commit evidence to the existing candidate manifest producer and result."""
    manifest = _object(raw)
    require(
        type(manifest.get("schema_version")) is int and manifest["schema_version"] == 1,
        "unsupported candidate provenance",
    )
    require(
        manifest.get("authority") == "candidate_only"
        and manifest.get("production_authority") is False,
        "candidate provenance expands authority",
    )
    require(
        manifest.get("upstream") == "github"
        and manifest.get("upstream_repository") == result.source.repository,
        "candidate provenance repository mismatch",
    )
    require(
        manifest.get("upstream_sha")
        == result.candidate_revision
        == manifest.get("mirror_commit_before_provenance"),
        "candidate provenance revision mismatch",
    )
    unsigned = {k: v for k, v in manifest.items() if k != "manifest_sha256"}
    expected = hashlib.sha256(
        json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    require(
        manifest.get("manifest_sha256") == expected,
        "candidate provenance digest mismatch",
    )
    require(
        result.started_at
        <= timestamp(manifest.get("generated_at"))
        <= result.completed_at,
        "candidate provenance is outside attempt time",
    )
    require(
        isinstance(manifest.get("tracked_files"), list),
        "candidate provenance omits file inventory",
    )
    if "work_contract" in manifest:
        binding = mapping(manifest["work_contract"])
        require(
            binding.get("schema") == "buildanddo.work/v1"
            and binding.get("work_digest") == result.work_digest,
            "candidate provenance names different work",
        )
        require(
            binding.get("mission_id") == result.mission_id
            and binding.get("scope_id") == result.scope_id
            and binding.get("base_revision") == result.source.revision,
            "candidate provenance work scope mismatch",
        )
        paths = binding.get("changed_paths")
        require(
            isinstance(paths, list) and paths == list(result.changed_paths),
            "candidate provenance changed paths mismatch",
        )


def evidence_bytes(result: WorkResult, root: Path) -> dict[str, bytes]:
    """Match every referenced artifact's actual bytes to the returned result."""
    retained: dict[str, bytes] = {}
    for evidence in result.evidence:
        raw = read_bytes(root, evidence.path)
        require(len(raw) == evidence.size, "retained evidence size changed")
        require(
            hashlib.sha256(raw).hexdigest() == evidence.sha256,
            "retained evidence digest changed",
        )
        if evidence.kind == "commit":
            require_candidate_provenance(raw, result)
        retained[evidence.path] = raw
    return retained


def _bind(
    submission: WorkSubmission, expected: WorkContract, candidate: str, at: datetime
) -> None:
    revision(candidate)
    require(at.tzinfo is not None, "receiving time must be timezone-aware")
    require(
        submission.work.digest == expected.digest, "receiving work contract changed"
    )
    require(
        submission.result.candidate_revision == candidate,
        "result names a different candidate revision",
    )
    require(submission.result.completed_at <= at, "future result cannot be received")


@dataclass(frozen=True, slots=True)
class WorkAssessment(Contract):
    """Describe observed completeness or a scoped review without release authority."""

    state: Literal[
        "HOLD",
        "READY_FOR_REVIEW",
        "REVIEWED_PASS",
        "REPORTED_FAIL",
        "REPORTED_CANCELLED",
        "REPORTED_ROLLED_BACK",
    ]
    work_digest: str
    result_digest: str
    candidate_revision: str
    missing: tuple[str, ...]
    review_digest: str | None
    production_authority: Literal[False] = False


def assess_result(
    submission: WorkSubmission,
    *,
    expected_work: WorkContract,
    candidate: str,
    evidence_root: Path,
    at: datetime,
    verification: VerificationReceipt | None = None,
    policy: ReviewPolicy | None = None,
) -> WorkAssessment:
    """Recheck evidence and admit PASS only through a separately supplied review policy."""
    _bind(submission, expected_work, candidate, at)
    evidence_bytes(submission.result, evidence_root)
    work, result = submission.work, submission.result
    checks = {check.name: check for check in result.checks}
    missing = [
        f"check:{check.name}"
        for check in work.acceptance
        if check.name not in checks or checks[check.name].status != "PASS"
    ]
    # Only evidence cited by a passing check can satisfy the required kinds.
    cited = {
        ref
        for check in result.checks
        if check.status == "PASS"
        for ref in check.evidence_ids
    }
    kinds = {e.kind for e in result.evidence if e.evidence_id in cited}
    missing.extend(
        f"evidence:{kind}" for kind in work.evidence_required if kind not in kinds
    )
    if result.status == "HOLD":
        missing.append("result:HOLD")
    state: Literal[
        "HOLD",
        "READY_FOR_REVIEW",
        "REVIEWED_PASS",
        "REPORTED_FAIL",
        "REPORTED_CANCELLED",
        "REPORTED_ROLLED_BACK",
    ] = "HOLD" if missing else "READY_FOR_REVIEW"
    if result.status == "FAIL":
        state = "REPORTED_FAIL"
    elif result.status == "CANCELLED":
        state = "REPORTED_CANCELLED"
    elif result.status == "ROLLED_BACK":
        state = "REPORTED_ROLLED_BACK"
    elif any(c.status == "FAIL" for c in result.checks):
        state = "REPORTED_FAIL"
    if verification is not None:
        require(
            policy is not None,
            "review needs a separately authenticated receiving policy",
        )
        assert policy is not None
        require(
            result.status == "PASS" and not missing,
            "incomplete or failed work cannot acquire a passing review",
        )
        require(
            verification.result.actor_id == result.worker.actor_id,
            "review names a different producer",
        )
        participants = {
            result.worker.actor_id,
            *result.contributors,
            *(e.author for e in result.evidence),
        }
        require(
            verification.result.verifier_id not in participants,
            "producer or contributor cannot verify its own work",
        )
        require_review(
            verification,
            submission.subject,
            policy,
            at=at,
            tier=AuthorityTier.A2,
            checks=tuple(c.name for c in work.acceptance),
            sources=submission.required_sources,
            since=result.completed_at,
        )
        state = "REVIEWED_PASS"
    return WorkAssessment(
        state,
        work.digest,
        result.digest,
        candidate,
        tuple(missing),
        digest(verification) if verification else None,
    )


@dataclass(frozen=True, slots=True)
class WorkBundle:
    """Retain the exact loaded files alongside their parsed public contracts."""

    submission: WorkSubmission
    verification: VerificationReceipt | None
    files: Mapping[str, bytes]


def read_bundle(directory: Path) -> WorkBundle:
    """Read only named work, result, review and evidence files, rejecting extras."""
    files = {
        name: read_bytes(directory, name, limit=MAX_CONTRACT_BYTES)
        for name in ("work.json", "result.json")
    }
    work = WorkContract.from_dict(_object(files["work.json"]))
    result = WorkResult.from_dict(_object(files["result.json"]))
    submission = WorkSubmission(work, result)
    verification = None
    if (directory / "verification.json").exists() or (
        directory / "verification.json"
    ).is_symlink():
        files["verification.json"] = read_bytes(
            directory, "verification.json", limit=MAX_CONTRACT_BYTES
        )
        verification = VerificationReceipt.from_dict(
            _object(files["verification.json"])
        )
        require(
            verification.subject == submission.subject,
            "review names different work/result bytes",
        )
    for name, raw in evidence_bytes(result, directory / "evidence").items():
        files["evidence/" + name] = raw
    # Do not copy arbitrary neighboring data or silently omit hidden bundle files.
    present: set[str] = set()
    for index, path in enumerate(directory.rglob("*")):
        require(index < 4096, "work bundle directory exceeds bound")
        require(not path.is_symlink(), "symlink in work bundle")
        if path.is_file():
            present.add(path.relative_to(directory).as_posix())
    require(present == set(files), "work bundle contains unreferenced files")
    return WorkBundle(submission, verification, MappingProxyType(files))


def write_bundle(
    directory: Path,
    submission: WorkSubmission,
    *,
    candidate: str,
    evidence_root: Path,
    at: datetime,
    verification: VerificationReceipt | None = None,
) -> WorkBundle:
    """Prepare a new local review packet while preserving failures and exact bytes."""
    _bind(submission, submission.work, candidate, at)
    retained = evidence_bytes(submission.result, evidence_root)
    files = {
        "work.json": (submission.work.to_json() + "\n").encode(),
        "result.json": (submission.result.to_json() + "\n").encode(),
        **{"evidence/" + name: raw for name, raw in retained.items()},
    }
    if verification is not None:
        require(
            verification.subject == submission.subject,
            "review names different work/result bytes",
        )
        files["verification.json"] = (verification.to_json() + "\n").encode()
    require(
        not directory.exists() and not directory.is_symlink(),
        "bundle destination already exists",
    )
    directory.mkdir(parents=True, exist_ok=False)
    for name, raw in files.items():
        target = directory / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as stream:
            stream.write(raw)
    return WorkBundle(submission, verification, MappingProxyType(files))


def candidate_paths(
    root: Path, work: WorkContract, candidate: str, repository: str
) -> tuple[str, ...]:
    """Check the actual Git change against the proposed source and file boundary."""
    revision(candidate)
    require(
        work.source.repository == repository, "candidate repository differs from work"
    )
    try:
        subprocess.run(
            [
                "git",
                "-C",
                str(root),
                "merge-base",
                "--is-ancestor",
                work.source.revision,
                candidate,
            ],
            check=True,
            capture_output=True,
            timeout=30,
        )
        changed = subprocess.run(
            [
                "git",
                "-C",
                str(root),
                "diff",
                "--name-only",
                "--no-renames",
                "-z",
                work.source.revision,
                candidate,
                "--",
            ],
            check=True,
            capture_output=True,
            timeout=30,
        ).stdout
        paths = tuple(name.decode("utf-8") for name in changed.split(b"\0") if name)
    except (OSError, subprocess.SubprocessError, UnicodeError) as exc:
        raise ContractError(
            "candidate does not retain the selected base revision"
        ) from exc
    work.require_paths(paths)
    return paths


@dataclass(frozen=True, slots=True)
class ExperienceInput:
    """Select expected work/candidate independently of an imported result packet."""

    directory: Path
    expected_work: WorkContract
    candidate: str


def worker_experience(
    inputs: tuple[ExperienceInput, ...],
    *,
    worker: SemanticId,
    at: datetime,
    policy: ReviewPolicy | None = None,
) -> dict[str, object]:
    """Recompute bounded history, deduplicating retries and retaining reported failures."""
    require(len(inputs) <= 1000, "experience selection exceeds bound")
    seen: dict[tuple[str, str, str], tuple[str, int]] = {}
    rows: list[dict[str, object]] = []
    counts = {name: 0 for name in ("PASS", "FAIL", "HOLD", "CANCELLED", "ROLLED_BACK")}
    accounts: dict[str, str] = {}
    actor_type: str | None = None
    for selection in inputs:
        bundle = read_bundle(selection.directory)
        submission = bundle.submission
        result = submission.result
        require(result.worker.actor_id == worker, "experience crosses worker identity")
        require(
            actor_type is None or actor_type == result.worker.actor_type,
            "worker identity type conflicts",
        )
        actor_type = result.worker.actor_type
        for account in result.worker.accounts:
            require(
                account.provider not in accounts
                or accounts[account.provider] == account.account_id,
                "worker provider identity conflicts",
            )
            accounts[account.provider] = account.account_id
        assessment = assess_result(
            submission,
            expected_work=selection.expected_work,
            candidate=selection.candidate,
            evidence_root=selection.directory / "evidence",
            at=at,
            verification=bundle.verification if policy is not None else None,
            policy=policy,
        )
        key = (result.scope_id, result.mission_id, result.attempt_id)
        if key in seen:
            prior_digest, index = seen[key]
            require(
                prior_digest == result.digest, "conflicting result for the same attempt"
            )
            # A later independently authenticated receipt can describe the same
            # immutable attempt. Retain it regardless of packet import order.
            if assessment.state == "REVIEWED_PASS":
                prior_pin = rows[index]["review_digest"]
                rows[index]["review_state"] = "REVIEWED_PASS"
                rows[index]["review_digest"] = (
                    min(str(prior_pin), str(assessment.review_digest))
                    if prior_pin
                    else assessment.review_digest
                )
            continue
        seen[key] = (result.digest, len(rows))
        counts[result.status] += 1
        rows.append(
            {
                "mission_id": result.mission_id,
                "scope_id": result.scope_id,
                "attempt_id": result.attempt_id,
                "candidate_revision": result.candidate_revision,
                "work_digest": result.work_digest,
                "result_digest": result.digest,
                "reported_status": result.status,
                "review_state": assessment.state,
                "missing": list(assessment.missing),
                "review_digest": assessment.review_digest,
                "reported_evidence_kinds": sorted({e.kind for e in result.evidence}),
                "declared_accounts": [
                    account.to_dict() for account in result.worker.accounts
                ],
            }
        )
    return {
        "schema": "buildanddo.work-experience/v1",
        "worker": str(worker),
        "identity_status": "declared",
        "attempts": len(rows),
        "reported_outcomes": counts,
        "historical_reviewed_passes": sum(
            row["review_state"] == "REVIEWED_PASS" for row in rows
        ),
        "production_authority": False,
        "records": sorted(
            rows,
            key=lambda row: (
                str(row["scope_id"]),
                str(row["mission_id"]),
                str(row["attempt_id"]),
            ),
        ),
    }
