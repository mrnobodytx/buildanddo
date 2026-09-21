# ─── CGRF Header ───────────────────────────────────────────────
# File:         scripts/ci/submission_readiness.py
# Stage:        11_COMMIT
# SRS:          SRS-BUILDANDDO-UPGRADE-001
# CAPS:         pending
# CK:           pending
# Dispatch:     VCC-BUILDANDDO-UPGRADE-001
# Seat:         BITS-CODEGEN
# Owner:        Citadel Nexus Inc.
# Created:      2026-09-20
# Depends:      .bits/submission-policy.json, scripts/ci/hostinger_readiness.py, scripts/ci/hostinger_replay.py
# EnumType:     Service
# EnumEdges:    DEPENDS_ON .bits/submission-policy.json; DEPENDS_ON scripts/ci/hostinger_readiness.py; DEPENDS_ON scripts/ci/hostinger_replay.py
# DAG Node:     none
# Intent:       Keep all eleven submission milestones gated by current acceptance, captured replay and reviewed official requirements.
# ───────────────────────────────────────────────────────────────

"""Prepare and audit submission evidence without inventing contest rules or publishing."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import sys
from typing import cast
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ci.hostinger_readiness import (  # noqa: E402
    ReadinessError,
    check_review,
    instant,
    object_value,
    read_json,
    safe_path,
    strings,
)
from scripts.ci.hostinger_replay import project_milestones, reference, validate_capture  # noqa: E402
from scripts.ci.sprint_cycle import MILESTONES  # noqa: E402

POLICY = ".bits/submission-policy.json"
MATERIALS = (
    "product_summary",
    "evaluator_journey",
    "walkthrough",
    "license_and_attribution",
    "privacy_and_permissions",
    "rollback_and_support",
)


def require(value: bool, reason: str) -> None:
    """Reject missing or inconsistent submission evidence."""
    if not value:
        raise ReadinessError(reason)


def load_policy(root: Path) -> dict[str, object]:
    """Check the internal rule contract and all eleven original sprint anchors."""
    value = read_json(root / POLICY)
    require(
        value.get("schema_version") == "buildanddo.internal-submission-policy/v1"
        and value.get("authority") == "internal-provisional",
        "This policy defines internal standards, never official competition authority.",
    )
    require(
        value.get("official_rules")
        == {"status": "unknown", "url": None, "deadline": None},
        "Keep official rules unknown in the provisional policy; attach a reviewed external copy to the entry.",
    )
    pieces = value.get("milestones")
    require(
        isinstance(pieces, list) and len(pieces) == 11,
        "Account for all eleven sprint checkpoints.",
    )
    for index, item in enumerate(cast(list[object], pieces)):
        piece = object_value(item)
        require(
            piece.get("id") == f"HS-{index + 1:02}"
            and piece.get("day") == MILESTONES[index]["day"],
            "Retain the canonical checkpoint identity and day.",
        )
        require(
            bool(piece.get("title")) and len(strings(piece.get("required"))) >= 4,
            "Every checkpoint needs concrete acceptance requirements.",
        )
    require(
        value.get("materials") == list(MATERIALS),
        "Retain all evaluator, rights, privacy and recovery materials.",
    )
    return value


def check_wiring(root: Path) -> None:
    """Require internal-rule review in the agent entry points and an actual CI step."""
    command = "python scripts/ci/submission_readiness.py --check"
    for name in ("AGENTS.md", ".bits/context.md"):
        require(
            command in (root / name).read_text(),
            "Submission governance is missing from " + name + ".",
        )
    workflow = (root / ".github/workflows/pr-governance.yml").read_text()
    require(
        bool(
            re.search(
                r"^[ \t]+(?:-[ \t]+)?run: python scripts/ci/submission_readiness\.py --check[ \t]*$",
                workflow,
                re.MULTILINE,
            )
        ),
        "The required submission policy check is missing from CI.",
    )


def public_url(value: object) -> str:
    """Require a public HTTPS material or demo address without embedded credentials."""
    require(isinstance(value, str), "Provide an HTTPS reference.")
    address = cast(str, value)
    try:
        url = urlsplit(address)
        host = url.hostname or ""
        valid = (
            url.scheme == "https"
            and bool(re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}", host))
            and not url.username
            and not url.password
            and not url.fragment
        )
        valid = valid and not host.endswith(
            (".localhost", ".local", ".internal", ".invalid", ".test")
        )
        try:
            ipaddress.ip_address(host)
            valid = False
        except ValueError:
            pass
        valid = (
            valid
            and url.port in (None, 443)
            and not any(char.isspace() for char in address)
        )
    except ValueError:
        valid = False
    require(
        bool(valid), "Provide a public HTTPS address without credentials or a fragment."
    )
    return address


def material_reference(root: Path, value: object, now: datetime) -> None:
    """Hash a retained document or video in bounded chunks without uploading it."""
    item = object_value(value)
    require(
        set(item) == {"path", "sha256", "observed_at"},
        "Use a dated exact-byte material reference.",
    )
    path = safe_path(root, item["path"])
    require(
        path.is_file() and 0 < path.stat().st_size <= 1_000_000_000,
        "Retain a nonempty material of at most one GB.",
    )
    require(
        instant(item["observed_at"]) <= now,
        "Submission materials cannot be future-dated.",
    )
    checksum = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(chunk)
    require(
        item["sha256"] == checksum.hexdigest(),
        "Submission material bytes no longer match their reference.",
    )


def prepare(root: Path, directory: Path, candidate: str) -> Path:
    """Create a reviewable draft in a new directory without claiming any milestone passed."""
    load_policy(root)
    check_wiring(root)
    require(
        bool(re.fullmatch(r"[a-f0-9]{40}", candidate)),
        "Select the exact candidate revision.",
    )
    _, source = check_review(root)
    require(
        not directory.exists(),
        "Choose a new output directory; existing evidence is never replaced.",
    )
    directory.mkdir(parents=True, exist_ok=False)
    manifest = {
        "schema_version": "buildanddo.submission/v1",
        "candidate_sha": candidate,
        "source_sha256": source,
        "prepared_at": datetime.now(timezone.utc).isoformat(),
        "workspace": "",
        "mission": "",
        "dispatch": "VCC-BUILDANDDO-UPGRADE-001",
        "demo_url": "",
        "replay": None,
        "execution_receipts": None,
        "owner_review": None,
        "official_review": None,
        "materials": dict.fromkeys(MATERIALS),
        "authority": "internal-preparation-only",
    }
    output = directory / "submission.json"
    output.write_text(json.dumps(manifest, indent=2) + "\n")
    return output


def execution_receipt(
    package: Path, value: object, replay_path: Path, now: datetime
) -> None:
    """Bind the selected replay action to its actual native execution export."""
    path, observed, _ = reference(package, value, now)
    exported = read_json(path)
    capture = read_json(replay_path)
    require(
        exported.get("schema_version") == "buildanddo.business-replay/v1"
        and exported.get("evidence_state") == "recorded"
        and exported.get("independent_verification") == "not_established_by_export",
        "Retain the native execution export without promoting its evidence state.",
    )
    require(
        exported.get("workspace") == capture["workspace"]
        and instant(exported.get("captured_at")) <= observed,
        "Execution export scope or capture time differs from the replay.",
    )
    records = object_value(capture["records"])
    action_path, _, _ = reference(replay_path.parent, records["action"], now)
    evidence_path, _, _ = reference(replay_path.parent, records["evidence"], now)
    action, evidence = read_json(action_path), read_json(evidence_path)
    jobs = exported.get("jobs")
    require(
        isinstance(jobs, list) and 0 < len(jobs) <= 21,
        "Retain one bounded native receipt page.",
    )
    matches = [
        object_value(item)
        for item in cast(list[object], jobs)
        if object_value(item).get("id") == action["job_id"]
    ]
    require(
        len(matches) == 1,
        "The selected action must identify exactly one exported native receipt.",
    )
    job = matches[0]
    expected_release = {
        key: capture[key]
        for key in (
            "candidate_sha",
            "source_sha256",
            "artifact_tree_sha256",
            "dispatch",
            "environment",
        )
    }
    require(
        job.get("release_context") == expected_release,
        "The native effect must retain the same declared release as the independently captured deployment.",
    )
    require(
        job.get("workspace") == capture["workspace"]
        and job.get("mission") == capture["mission"]
        and job.get("status") == "succeeded"
        and job.get("worker") == action["producer"]
        and job.get("evidence") == evidence["id"],
        "The replay substituted a native action, producer or evidence record.",
    )
    parameters = object_value(job.get("input"))
    expected_kind = "native" if job.get("provider") == "erp" else "worker"
    require(
        action.get("execution_kind") == expected_kind
        and object_value(action["limits"]).get("max_seconds")
        == parameters.get("max_seconds"),
        "The replay must retain the native action kind and approved runtime bound.",
    )
    result = object_value(job.get("result"))
    reported = object_value(result.get("reported"))
    require(
        reported.get("status") == "succeeded"
        and object_value(result.get("records")).get("evidence") == evidence["id"],
        "A matching retained successful result and evidence reference are required.",
    )
    canonical = json.dumps(
        reported,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    checksum = hashlib.sha256(canonical).hexdigest()
    _, output_at, output = reference(replay_path.parent, capture["action_output"], now)
    require(
        checksum == job.get("result_sha256") == action.get("result_sha256")
        and canonical == output,
        "The replay result must be the exact canonical bytes of the retained native result.",
    )
    started, finished = instant(job.get("started_at")), instant(job.get("finished_at"))
    require(
        started == instant(action.get("started_at"))
        and finished == instant(action.get("completed_at"))
        and started <= instant(reported.get("observed_at")) <= finished <= output_at
        and finished <= instant(exported.get("captured_at")),
        "Native execution and replay timestamps do not agree.",
    )


def audit(
    root: Path,
    manifest_path: Path,
    evidence: Path,
    candidate: str,
    reviewer: str,
    now: datetime | None = None,
) -> dict[str, object]:
    """Reconcile supplied bytes through existing acceptance, replay and owner-review gates."""
    load_policy(root)
    check_wiring(root)
    at = now or datetime.now(timezone.utc)
    document = read_json(manifest_path)
    _, source = check_review(root)
    blockers: list[str] = []
    result: dict[str, object] = {
        "schema_version": "buildanddo.submission-result/v1",
        "status": "HOLD",
        "candidate_sha": candidate,
        "source_sha256": source,
        "official_rules": "UNCONFIRMED",
        "verified_milestones": 0,
        "blockers": blockers,
        "scope": "Consistency of supplied captured evidence and owner review. This does not publish an entry or attest external identities.",
    }
    require(
        document.get("schema_version") == "buildanddo.submission/v1"
        and document.get("authority") == "internal-preparation-only",
        "Unsupported submission manifest.",
    )
    require(
        bool(re.fullmatch(r"[a-f0-9]{40}", candidate))
        and document.get("candidate_sha") == candidate
        and document.get("source_sha256") == source,
        "The entry must bind the selected candidate and current reviewed source.",
    )
    require(
        instant(document.get("prepared_at")) <= at,
        "A prepared entry cannot be future-dated.",
    )
    package = manifest_path.parent
    try:
        public_url(document.get("demo_url"))
    except ReadinessError as error:
        blockers.append(str(error))
    materials = object_value(document.get("materials"))
    require(
        set(materials) == set(MATERIALS),
        "Account for every required submission material.",
    )
    for name in MATERIALS:
        if materials[name] is None:
            blockers.append("Missing material: " + name)
        else:
            material_reference(package, materials[name], at)
    if document.get("replay") is None or document.get("owner_review") is None:
        blockers.append(
            "A real deployed replay and its independent owner review are required for all eleven checkpoints."
        )
    else:
        replay_path, _, _ = reference(package, document["replay"], at)
        replay = validate_capture(
            replay_path,
            candidate=candidate,
            source=source,
            workspace=str(document.get("workspace", "")),
            mission=str(document.get("mission", "")),
            dispatch=str(document.get("dispatch", "")),
            now=at,
        )
        if document.get("execution_receipts") is None:
            blockers.append(
                "Retain the native business execution export that binds the demonstrated action to this release."
            )
        else:
            execution_receipt(package, document["execution_receipts"], replay_path, at)
        review_path, _, _ = reference(package, document["owner_review"], at)
        projection = project_milestones(
            root,
            replay,
            read_json(review_path),
            evidence,
            reviewer,
            at,
            review_root=review_path.parent,
        )
        milestones = cast(list[dict[str, object]], projection["milestones"])
        verified = sum(piece["status"] == "verified" for piece in milestones)
        result["verified_milestones"] = verified
        if verified != 11:
            blockers.append(
                "All eleven milestones must have current runtime evidence and owner review."
            )
    if document.get("official_review") is None:
        blockers.append(
            "Official eligibility, deadline/time zone, hosting and submission requirements remain unconfirmed."
        )
    else:
        path, _, _ = reference(package, document["official_review"], at)
        official = read_json(path)
        require(
            official.get("schema_version") == "buildanddo.official-rules-review/v1"
            and official.get("reviewer") == reviewer
            and bool(reviewer),
            "Use the selected owner's explicit official-rules review.",
        )
        public_url(official.get("source_url"))
        _, observed, _ = reference(path.parent, official.get("source_copy"), at)
        require(
            observed <= instant(official.get("reviewed_at")) <= at,
            "Review must follow the captured official source.",
        )
        require(
            instant(official.get("deadline")) > at,
            "The actual reviewed submission deadline must still be open.",
        )
        require(
            official.get("candidate_sha") == candidate,
            "Official-rule review must bind this candidate.",
        )
        requirements = object_value(official.get("requirements"))
        require(
            set(requirements)
            == {"eligibility", "hosting", "rights", "materials", "submission_method"}
            and all(value is True for value in requirements.values()),
            "Confirm every official entry requirement; unknown is not approval.",
        )
        result["official_rules"] = "OWNER_REVIEWED_CAPTURE"
    if not blockers:
        result["status"] = "READY_FOR_OWNER_SUBMISSION"
    result["manifest_sha256"] = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    return result


def main(argv: list[str] | None = None) -> int:
    """Check policy, prepare a draft or audit captured evidence without external writes."""
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--prepare", type=Path)
    mode.add_argument("--manifest", type=Path)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--candidate", default="")
    parser.add_argument("--acceptance", type=Path)
    parser.add_argument("--reviewer", default="")
    options = parser.parse_args(argv)
    try:
        if options.check:
            load_policy(options.root)
            check_wiring(options.root)
            print(
                "PASS: eleven internal submission checkpoints; official rules remain explicitly unknown."
            )
        elif options.prepare:
            print(prepare(options.root, options.prepare, options.candidate))
        else:
            require(
                options.acceptance is not None,
                "Select the actual acceptance receipt directory.",
            )
            result = audit(
                options.root,
                options.manifest,
                options.acceptance,
                options.candidate,
                options.reviewer,
            )
            print(json.dumps(result, indent=2))
            return 0 if result["status"] == "READY_FOR_OWNER_SUBMISSION" else 1
    except (ReadinessError, OSError) as error:
        print("FAIL: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
