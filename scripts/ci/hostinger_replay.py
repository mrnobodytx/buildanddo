# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/hostinger_replay.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/hostinger_readiness.py, libs/semantic_twin/phase1/truth.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/hostinger_readiness.py; CONSUMES libs/semantic_twin/phase1/truth.py; PRODUCES scripts/ci/sprint_cycle.py
# Intent:      Reconcile captured demo and release evidence before preparing explicitly reviewed milestone state, without running or approving an action.
# ───────────────────────────────────────────────────────────────

"""Validate local public capture exports; hashes bind bytes, not the truth of claims."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TypeGuard, cast

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs.semantic_twin.ingestion.drafts import combine_drafts  # noqa: E402
from libs.semantic_twin.phase1.providers import (  # noqa: E402
    ingest_datadog_export,
    ingest_gitlab_export,
)
from libs.semantic_twin.phase1.release_state import (  # noqa: E402
    ingest_release_receipts,
    release_receipt_graph,
)
from libs.semantic_twin.phase1.truth import (  # noqa: E402
    reconcile_release_truth,
    release_observations,
)
from scripts.ci.hostinger_checks import CHECKS  # noqa: E402
from scripts.ci.hostinger_readiness import (  # noqa: E402
    MAX_AGE,
    Piece,
    ReadinessError,
    acceptance_state,
    check_review,
    decode_json,
    instant,
    object_value,
    read_json,
    safe_path,
    strings,
)
from scripts.ci.sprint_cycle import CAMPAIGN_ID  # noqa: E402

STAGES = (
    "context",
    "signal",
    "proposal",
    "approval",
    "action",
    "verification",
    "evidence",
    "outcome",
    "operator",
)
READBACK_AGE = timedelta(minutes=15)


def require(condition: bool, reason: str) -> None:
    """Reject evidence that cannot support the requested scope."""
    if not condition:
        raise ReadinessError(reason)


def nonempty(value: object) -> TypeGuard[str]:
    """Require an actual textual record value rather than truthy malformed data."""
    return isinstance(value, str) and bool(value.strip())


def reference(root: Path, value: object, now: datetime) -> tuple[Path, datetime, bytes]:
    """Resolve a bounded exact-byte reference without allowing network or symlink reads."""
    item = object_value(value)
    require(
        set(item) == {"path", "sha256", "observed_at"},
        "Use a dated content-bound capture reference.",
    )
    path = safe_path(root, item["path"])
    require(
        path.is_file() and path.stat().st_size <= 4_000_000,
        "Capture reference is not a bounded regular file.",
    )
    with path.open("rb") as stream:
        raw = stream.read(4_000_001)
    require(
        len(raw) <= 4_000_000 and hashlib.sha256(raw).hexdigest() == item["sha256"],
        "Captured bytes differ from their reference.",
    )
    at = instant(item["observed_at"])
    require(now - MAX_AGE <= at <= now, "Capture is stale or future-dated.")
    return path, at, raw


def captured_release(
    root: Path, capture: dict[str, object], now: datetime
) -> dict[str, object]:
    """Reuse Phase 1 reconciliation for exact release and provider exports."""
    # Adapters parse an immutable local copy of the exact bytes checked above.
    # A concurrent rewrite of the supplied export cannot substitute other facts.
    with tempfile.TemporaryDirectory(prefix="buildanddo-release-capture-") as directory:
        snapshot = Path(directory)
        paths: dict[str, tuple[Path, ...]] = {}
        seen: set[str] = set()
        for category in ("release_receipts", "gitlab_exports", "datadog_exports"):
            values = capture[category]
            require(
                isinstance(values, list) and len(values) <= 100,
                "Release inputs must be bounded reference lists.",
            )
            category_paths: list[Path] = []
            for value in cast(list[object], values):
                original, observed, raw = reference(root, value, now)
                require(
                    observed <= instant(capture["captured_at"]),
                    "A release export was observed after the capture.",
                )
                name = original.relative_to(root).as_posix()
                require(name not in seen, "A release export cannot be counted twice.")
                seen.add(name)
                target = snapshot / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
                category_paths.append(target)
            paths[category] = tuple(category_paths)
        graph = release_receipt_graph(
            ingest_release_receipts(
                paths["release_receipts"], repository_root=snapshot
            ),
            anchor_id="hostinger:capture",
        )
        for path in paths["gitlab_exports"]:
            graph = combine_drafts(
                graph,
                ingest_gitlab_export(
                    path, anchor_id="hostinger:capture", repository_root=snapshot
                ),
            )
        for path in paths["datadog_exports"]:
            graph = combine_drafts(
                graph,
                ingest_datadog_export(
                    path, anchor_id="hostinger:capture", repository_root=snapshot
                ),
            )
    for observation in release_observations(graph):
        if observation.role in {"verification", "dora"}:
            require(
                observation.timestamp is not None
                and now - MAX_AGE
                <= observation.timestamp
                <= instant(capture["captured_at"]),
                "Release readback is undated, stale or later than the capture.",
            )
    truth = reconcile_release_truth(
        graph,
        expected_commit=cast(str, capture["candidate_sha"]),
        expected_artifact_digest=cast(str, capture["artifact_tree_sha256"]),
    )
    return dict(truth.claims[0])


def validate_capture(
    path: Path,
    *,
    candidate: str,
    source: str,
    workspace: str,
    mission: str,
    dispatch: str,
    now: datetime | None = None,
) -> dict[str, object]:
    """Check an ordered scoped replay against caller-selected identities and actual bytes."""
    at = now or datetime.now(timezone.utc)
    with path.open("rb") as stream:
        raw_capture = stream.read(4_000_001)
    capture = decode_json(raw_capture)
    expected_fields = {
        "schema_version",
        "campaign_id",
        "candidate_sha",
        "source_sha256",
        "artifact_tree_sha256",
        "workspace",
        "mission",
        "dispatch",
        "environment",
        "synthetic",
        "captured_at",
        "records",
        "action_output",
        "release_receipts",
        "gitlab_exports",
        "datadog_exports",
    }
    require(
        set(capture) == expected_fields
        and capture["schema_version"] == "buildanddo.hostinger-replay/v1",
        "Unsupported replay contract.",
    )
    require(
        capture["campaign_id"] == CAMPAIGN_ID,
        "Capture belongs to a different campaign.",
    )
    for name, value in (
        ("candidate_sha", candidate),
        ("source_sha256", source),
        ("workspace", workspace),
        ("mission", mission),
        ("dispatch", dispatch),
    ):
        require(
            bool(value) and capture[name] == value,
            "Capture identity does not match the selected scope.",
        )
    require(
        bool(re.fullmatch(r"[0-9a-f]{40}", candidate))
        and bool(re.fullmatch(r"[0-9a-f]{64}", source)),
        "Select a full candidate SHA and source fingerprint.",
    )
    artifact = capture["artifact_tree_sha256"]
    require(
        isinstance(artifact, str) and bool(re.fullmatch(r"[0-9a-f]{64}", artifact)),
        "Select a complete artifact-tree identity.",
    )
    require(
        capture["environment"] in ("staging", "production", "fixture")
        and type(capture["synthetic"]) is bool,
        "Declare the captured environment and synthetic status.",
    )
    require(
        capture["environment"] != "fixture" or capture["synthetic"] is True,
        "A disposable fixture cannot establish live acceptance.",
    )
    captured_at = instant(capture["captured_at"])
    require(
        at - MAX_AGE <= captured_at <= at, "Replay capture is stale or future-dated."
    )
    records = object_value(capture["records"])
    require(
        set(records) == set(STAGES),
        "The complete context-to-operator chain is required.",
    )
    documents: dict[str, dict[str, object]] = {}
    times: dict[str, datetime] = {}
    prior = at - MAX_AGE
    for stage in STAGES:
        _, observed, raw = reference(path.parent, records[stage], at)
        require(
            prior <= observed <= captured_at, "Replay observations are out of order."
        )
        prior = observed
        document = decode_json(raw)
        require(
            document.get("workspace") == workspace,
            "A replay observation belongs to another workspace.",
        )
        documents[stage], times[stage] = document, observed
    context = documents["context"]
    require(
        context.get("state") == "MEASURED"
        and isinstance(context.get("source_ref"), str)
        and bool(context["source_ref"]),
        "A real scoped context observation is required.",
    )
    require(
        times["context"] - READBACK_AGE
        <= instant(context.get("observed_at"))
        <= times["context"],
        "Context readback is stale or future-dated.",
    )
    signal = documents["signal"]
    require(
        nonempty(signal.get("id")) and nonempty(signal.get("source")),
        "The signal must identify its observed source.",
    )
    proposal = documents["proposal"]
    require(
        proposal.get("mission") == mission
        and proposal.get("category") == "signal"
        and proposal.get("type") == "observed",
        "The mission needs its saved signal proposal receipt.",
    )
    content = proposal.get("content")
    require(isinstance(content, str), "The saved signal snapshot is missing.")
    snapshot = decode_json(cast(str, content).encode())
    require(
        snapshot.get("signal") == signal["id"]
        and all(
            snapshot.get(key) == signal.get(key)
            for key in ("updated", "title", "description", "source", "type", "owner")
        ),
        "The proposal does not preserve the selected signal revision.",
    )
    approval = documents["approval"]
    plan = object_value(approval.get("mission_plan"))
    require(
        approval.get("id") == mission
        and approval.get("status") == "approved"
        and nonempty(approval.get("mission_approved_by"))
        and plan.get("independent_review") is True,
        "An approved mission with independent review is required.",
    )
    require(
        nonempty(approval.get("owner")) and proposal.get("owner") == approval["owner"],
        "The proposal and mission must preserve their proposer.",
    )
    approved = approval.get("mission_approved_at")
    require(
        isinstance(approved, str)
        and instant(approved.replace(" ", "T")) <= times["approval"],
        "The approval timestamp is missing or inconsistent.",
    )
    action, verification = documents["action"], documents["verification"]
    for item in (action, verification):
        require(
            item.get("mission") == mission
            and item.get("dispatch") == dispatch
            and item.get("candidate_sha") == candidate
            and item.get("artifact_tree_sha256") == artifact
            and item.get("environment") == capture["environment"],
            "Job or verification escaped the selected mission/release scope.",
        )
    require(
        action.get("status") == "PASS"
        and action.get("execution_kind") in ("worker", "native")
        and nonempty(action.get("job_id"))
        and nonempty(action.get("producer")),
        "A completed bounded native or worker action is required; recorded workflow steps alone do not establish execution.",
    )
    limits = object_value(action.get("limits"))
    require(
        type(limits.get("max_seconds")) is int
        and 0 < cast(int, limits["max_seconds"]) <= 3600,
        "The job must record its reviewed runtime bound.",
    )
    started, completed = (
        instant(action.get("started_at")),
        instant(action.get("completed_at")),
    )
    require(
        times["approval"] <= started <= completed <= times["action"]
        and (completed - started).total_seconds() <= cast(int, limits["max_seconds"]),
        "The action predates approval, exceeds its bound or has inconsistent timestamps.",
    )
    _, output_at, output_bytes = reference(path.parent, capture["action_output"], at)
    output_digest = hashlib.sha256(output_bytes).hexdigest()
    require(
        completed <= output_at <= times["verification"]
        and action.get("result_sha256") == output_digest,
        "The action result is missing or differs from its actual output bytes.",
    )
    require(
        verification.get("job_id") == action["job_id"]
        and verification.get("result_sha256") == output_digest
        and verification.get("status") == "PASS",
        "Verification does not refer to the completed result.",
    )
    verifier = verification.get("verifier")
    require(
        isinstance(verifier, str)
        and bool(verifier)
        and verifier not in (action["producer"], approval["owner"]),
        "Verifier must differ from the producer and proposer.",
    )
    require(
        completed <= instant(verification.get("verified_at")) <= times["verification"],
        "Verification cannot precede its action.",
    )
    checks = object_value(verification.get("checks"))
    require(
        set(checks) == {"test", "evaluate", "verify", "validate"}
        and all(value == "PASS" for value in checks.values()),
        "Four actual passing TEVV observations are required.",
    )
    evidence = documents["evidence"]
    require(
        evidence.get("mission") == mission
        and nonempty(evidence.get("id"))
        and nonempty(evidence.get("source"))
        and nonempty(evidence.get("content"))
        and output_digest in cast(str, evidence["content"]),
        "The evidence receipt must bind the same mission and result digest.",
    )
    require(
        nonempty(evidence.get("owner")) and evidence["owner"] != verifier,
        "The result reviewer cannot author its evidence.",
    )
    outcome = documents["outcome"]
    require(
        outcome.get("id") == mission
        and outcome.get("status") == "verified"
        and outcome.get("mission_reviewed_by") == verifier
        and outcome.get("owner") == approval["owner"]
        and outcome.get("mission_plan") == plan,
        "The reviewed mission does not preserve the approved plan and verifier.",
    )
    review = object_value(outcome.get("mission_review"))
    require(
        nonempty(review.get("reflection")),
        "The mission review needs its observed reflection.",
    )
    for method in ("test", "evaluate", "verify", "validate"):
        result = object_value(review.get(method))
        require(
            result.get("outcome") == "pass"
            and result.get("evidence") == evidence["id"]
            and nonempty(result.get("observation")),
            "The mission review does not reference the captured result evidence.",
        )
    reviewed_at = outcome.get("mission_reviewed_at")
    require(
        isinstance(reviewed_at, str)
        and times["verification"]
        <= instant(reviewed_at.replace(" ", "T"))
        <= times["outcome"],
        "The mission outcome predates verification or is future-dated.",
    )
    operator = documents["operator"]
    require(
        operator.get("schema_version") == "buildanddo.operator-snapshot/v1"
        and times["outcome"]
        <= instant(operator.get("observed_at"))
        <= times["operator"]
        and times["operator"] - instant(operator.get("observed_at")) <= READBACK_AGE,
        "A current operator readback is required.",
    )
    sources = object_value(operator.get("sources"))
    for kind, identity in (("missions", mission), ("evidence", evidence["id"])):
        bucket = object_value(sources.get(kind))
        items = bucket.get("items")
        require(
            bucket.get("state") == "available" and isinstance(items, list),
            "Operator readback is unavailable.",
        )
        matches = [
            object_value(item)
            for item in cast(list[object], items)
            if object_value(item).get("id") == identity
        ]
        require(
            len(matches) == 1,
            "Operator readback does not contain exactly the captured outcome.",
        )
        if kind == "missions":
            require(
                matches[0].get("status") == "verified",
                "The operator does not observe a reviewed mission outcome.",
            )
    release = captured_release(path.parent, capture, at)
    rows = object_value(release["rows"])
    selected_environment = (
        "staging"
        if capture["environment"] == "fixture"
        else str(capture["environment"])
    )
    release_ok = (
        object_value(rows["source_sha"])["status"] == "MATCH"
        and object_value(rows["artifact_identity"])["status"] == "MATCH"
        and object_value(rows[selected_environment + "_verification"])["status"]
        == "OBSERVED_PASS"
        and release["overall"] != "CONFLICT"
    )
    if selected_environment == "production":
        release_ok = release_ok and release["overall"] == "CONSISTENT_CAPTURE"
    return {
        "schema_version": "buildanddo.hostinger-replay-result/v1",
        "capture_sha256": hashlib.sha256(raw_capture).hexdigest(),
        "candidate_sha": candidate,
        "source_sha256": source,
        "workspace": workspace,
        "mission": mission,
        "dispatch": dispatch,
        "producer": action["producer"],
        "verifier": verifier,
        "synthetic": capture["synthetic"],
        "environment": capture["environment"],
        "captured_at": capture["captured_at"],
        "status": (
            "SYNTHETIC_CAPTURE" if capture["synthetic"] else "CONSISTENT_CAPTURE"
        )
        if release_ok
        else "HOLD",
        "release": release,
        "scope": "Consistency of supplied public exports. No live action, identity attestation or owner approval is performed.",
    }


def project_milestones(
    root: Path,
    replay: dict[str, object],
    review: dict[str, object],
    evidence: Path,
    reviewer: str,
    now: datetime,
    *,
    review_root: Path,
) -> dict[str, object]:
    """Prepare operational state only from a supplied owner review and current acceptance."""
    contract, source = check_review(root)
    require(
        replay.get("status") == "CONSISTENT_CAPTURE"
        and replay.get("synthetic") is False
        and replay.get("source_sha256") == source,
        "Only current, nonsynthetic consistent capture can support milestones.",
    )
    require(
        set(review)
        == {"schema_version", "reviewer", "reviewed_at", "capture_sha256", "decisions"}
        and review["schema_version"] == "buildanddo.hostinger-owner-review/v1",
        "Use an explicit owner-review receipt.",
    )
    require(
        bool(reviewer)
        and review["reviewer"] == reviewer
        and reviewer != replay.get("producer"),
        "The selected reviewer must differ from the producer.",
    )
    reviewed = instant(review["reviewed_at"])
    require(
        instant(replay["captured_at"]) <= reviewed <= now
        and now - reviewed <= MAX_AGE
        and review["capture_sha256"] == replay["capture_sha256"],
        "Owner review is stale or binds another capture.",
    )
    states = acceptance_state(root, evidence, source, now, str(replay["candidate_sha"]))
    decisions = review["decisions"]
    require(isinstance(decisions, list), "Owner decisions must be a list.")
    by_id: dict[str, dict[str, object]] = {}
    for value in cast(list[object], decisions):
        decision = object_value(value)
        require(
            set(decision) == {"id", "evidence", "runtime_requirements"},
            "Every approved milestone must name its evidence and reviewed runtime requirements.",
        )
        identity = str(decision["id"])
        require(identity not in by_id, "Duplicate milestone decision.")
        raw_refs = decision["evidence"]
        require(
            isinstance(raw_refs, list) and 0 < len(raw_refs) <= 100,
            "Milestone evidence must contain dated content-bound references.",
        )
        for ref in cast(list[object], raw_refs):
            _, observed, _ = reference(review_root, ref, now)
            require(observed <= reviewed, "Owner review cannot precede its evidence.")
        by_id[identity] = decision
    pieces = cast(list[Piece], contract["pieces"])
    require(
        set(by_id) <= {piece["id"] for piece in pieces}, "Unknown milestone approval."
    )
    milestones: list[dict[str, object]] = []
    for piece in pieces:
        verified = piece["id"] in by_id
        refs: list[str] = []
        if verified:
            decision = by_id[piece["id"]]
            require(
                set(strings(decision["runtime_requirements"]))
                == set(piece["runtime_requirements"]),
                "Owner review omitted a runtime acceptance requirement.",
            )
            require(
                set(piece["requires"]) <= by_id.keys(),
                "Milestone dependencies have not been approved.",
            )
            for name in piece["checks"]:
                keys = (
                    [name + ":" + profile for profile in ("package", "compose")]
                    if CHECKS[name].level == "native"
                    else [name]
                )
                require(
                    all(states.get(key) == "PASS" for key in keys),
                    "A required acceptance check is missing, stale, skipped or failing.",
                )
            refs = [
                str(object_value(item)["path"])
                + "#sha256="
                + str(object_value(item)["sha256"])
                for item in cast(list[object], decision["evidence"])
            ]
        milestones.append(
            {
                "day": piece["day"],
                "status": "verified" if verified else "planned",
                "evidence": "; ".join(refs),
                "verified_at": review["reviewed_at"] if verified else None,
            }
        )
    return {
        "campaign_id": CAMPAIGN_ID,
        "source_sha256": source,
        "capture_sha256": replay["capture_sha256"],
        "reviewer": reviewer,
        "milestones": milestones,
    }


def main(argv: list[str] | None = None) -> int:
    """Validate a captured chain and optionally prepare owner-reviewed roadmap state."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--mission", required=True)
    parser.add_argument("--dispatch", required=True)
    parser.add_argument("--owner-review", type=Path)
    parser.add_argument("--reviewer")
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        _, source = check_review(args.root.resolve())
        report = validate_capture(
            args.capture,
            candidate=args.candidate_sha,
            source=source,
            workspace=args.workspace,
            mission=args.mission,
            dispatch=args.dispatch,
        )
        if args.owner_review:
            require(
                bool(args.reviewer)
                and args.evidence_dir is not None
                and args.output is not None,
                "Roadmap projection requires an explicit reviewer, acceptance directory and new output file.",
            )
            report = project_milestones(
                args.root.resolve(),
                report,
                read_json(args.owner_review),
                args.evidence_dir,
                args.reviewer,
                datetime.now(timezone.utc),
                review_root=args.owner_review.parent,
            )
        if args.output:
            with args.output.open("x") as stream:
                json.dump(report, stream, indent=2, sort_keys=True)
                stream.write("\n")
        else:
            print(json.dumps(report, indent=2, sort_keys=True))
        return 1 if report.get("status") == "HOLD" else 0
    except (ValueError, OSError, KeyError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
