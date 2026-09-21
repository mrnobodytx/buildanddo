# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/hostinger_readiness.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     .bits/hostinger-readiness.json, scripts/ci/sprint_cycle.py, scripts/ci/hostinger_checks.py, scripts/ci/gitlab_ci.py
# EnumType:    Service
# EnumEdges:   CONSUMES .bits/hostinger-readiness.json; CONSUMES scripts/ci/sprint_cycle.py; CONSUMES scripts/ci/hostinger_checks.py; CONSUMES scripts/ci/gitlab_ci.py; GATES .gitlab/ci/day21-submission.yml
# Intent:      Keep milestone rationale and next actions current while preventing missing, stale or skipped acceptance from becoming sprint completion.
# ───────────────────────────────────────────────────────────────

"""Validate sprint governance, run local checks and report evidence without deploying."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TypedDict, cast

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ci.hostinger_checks import (  # noqa: E402
    CHECKS,
    command,
    run_check,
    runtime_version,
    test_counts,
)
from scripts.ci.sprint_cycle import CAMPAIGN_ID, MILESTONES  # noqa: E402
from scripts.ci.gitlab_ci import require_command  # noqa: E402

CONTRACT = ".bits/hostinger-readiness.json"
LOCK = ".bits/hostinger-readiness.lock.json"
MAX_AGE = timedelta(hours=48)


class ReadinessError(ValueError):
    """Reject incomplete governance or evidence without disclosing its contents."""


class Piece(TypedDict):
    """Bind one canonical milestone to code, reasons and acceptance work."""

    id: str
    day: int
    title: str
    why: str
    owner: str
    sources: list[str]
    checks: list[str]
    requires: list[str]
    runtime_requirements: list[str]
    acceptance: list[str]
    next_step: str


def canonical(value: object) -> bytes:
    """Serialize finite evidence consistently for content fingerprints."""
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
    ).encode()


def digest(value: object) -> str:
    """Hash complete canonical content, not an asserted status label."""
    return hashlib.sha256(canonical(value)).hexdigest()


def object_value(value: object) -> dict[str, object]:
    """Require a string-keyed mapping."""
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ReadinessError("Expected an object with string keys.")
    return cast(dict[str, object], value)


def decode_json(raw: bytes) -> dict[str, object]:
    """Parse captured bytes once, rejecting duplicate keys and non-finite numbers."""

    def pairs(items: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in items:
            if key in result:
                raise ReadinessError("Duplicate evidence key.")
            result[key] = value
        return result

    def constant(_value: str) -> object:
        raise ReadinessError("Non-finite evidence value.")

    try:
        if len(raw) > 4_000_000:
            raise ReadinessError("Evidence exceeds the supported size.")
        return object_value(
            json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
        )
    except (ValueError, RecursionError) as error:
        raise ReadinessError(
            "Cannot parse bounded, unambiguous JSON evidence."
        ) from error


def read_json(path: Path) -> dict[str, object]:
    """Read one bounded JSON file without loading an unbounded input."""
    try:
        with path.open("rb") as stream:
            return decode_json(stream.read(4_000_001))
    except OSError as error:
        raise ReadinessError(f"Cannot read evidence: {path.name}") from error


def instant(value: object) -> datetime:
    """Require a timezone-aware UTC observation time."""
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)", value
    ):
        raise ReadinessError("An explicit UTC observation time is required.")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ReadinessError("The observation time is invalid.") from error


def safe_path(root: Path, name: object, *, exists: bool = True) -> Path:
    """Keep source and evidence reads within their declared root, without symlinks."""
    if (
        not isinstance(name, str)
        or not name
        or "\\" in name
        or Path(name).is_absolute()
        or any(part in ("", ".", "..") for part in name.split("/"))
    ):
        raise ReadinessError("Use a relative contained path.")
    path = root / name
    if not path.resolve().is_relative_to(root.resolve()) or any(
        parent.is_symlink() for parent in (path, *path.parents) if parent != root.parent
    ):
        raise ReadinessError("Symlinked or escaping evidence is not accepted.")
    if exists and not path.exists():
        raise ReadinessError(f"Required path is missing: {name}")
    return path


def strings(value: object, *, nonempty: bool = True) -> list[str]:
    """Require a list of distinct nonempty strings."""
    if (
        not isinstance(value, list)
        or (nonempty and not value)
        or not all(isinstance(item, str) and item.strip() for item in value)
    ):
        raise ReadinessError("Required governance lists must contain nonempty strings.")
    result = cast(list[str], value)
    if len(result) != len(set(result)):
        raise ReadinessError("Governance lists cannot contain duplicates.")
    return result


def load_contract(root: Path) -> dict[str, object]:
    """Require all canonical milestones, runnable checks, rationale and next steps."""
    contract = read_json(root / CONTRACT)
    if (
        set(contract)
        != {
            "schema_version",
            "campaign_id",
            "srs",
            "dispatch",
            "pieces",
            "external_requirements",
        }
        or contract["schema_version"] != "buildanddo.hostinger-readiness/v1"
        or contract["campaign_id"] != CAMPAIGN_ID
    ):
        raise ReadinessError(
            "Use the supported readiness contract and canonical campaign."
        )
    if (
        contract["srs"] != "SRS-BUILDANDDO-UPGRADE-001"
        or contract["dispatch"] != "VCC-BUILDANDDO-UPGRADE-001"
    ):
        raise ReadinessError(
            "The sprint closure contract must retain its registered authority."
        )
    external = contract["external_requirements"]
    if not isinstance(external, list) or not external:
        raise ReadinessError("External acceptance requirements must remain explicit.")
    external_ids: set[str] = set()
    for value in external:
        item = object_value(value)
        if set(item) != {
            "id",
            "why",
            "owner",
            "next_step",
            "evidence_required",
        } or not all(isinstance(v, str) and v.strip() for v in item.values()):
            raise ReadinessError(
                "Every external requirement needs an owner, rationale, evidence and next step."
            )
        identity = cast(str, item["id"])
        if identity in external_ids:
            raise ReadinessError("Duplicate external requirement.")
        external_ids.add(identity)
    values = contract["pieces"]
    if not isinstance(values, list) or len(values) != len(MILESTONES):
        raise ReadinessError("Account for all eleven canonical sprint milestones.")
    seen: set[str] = set()
    for value, milestone in zip(values, MILESTONES):
        piece = object_value(value)
        if set(piece) != set(Piece.__annotations__):
            raise ReadinessError("Milestone fields are missing or unsupported.")
        for name in ("id", "title", "why", "owner", "next_step"):
            if not isinstance(piece[name], str) or not cast(str, piece[name]).strip():
                raise ReadinessError(
                    "Every milestone needs rationale, an owner and a next step."
                )
        if (
            type(piece["day"]) is not int
            or piece["day"] != milestone["day"]
            or piece["title"] != milestone["title"]
        ):
            raise ReadinessError(
                "The readiness contract has drifted from the canonical sprint plan."
            )
        identity = cast(str, piece["id"])
        if not re.fullmatch(r"HS-\d{2}", identity) or identity in seen:
            raise ReadinessError("Milestone identities must be unique HS numbers.")
        if not set(strings(piece["requires"], nonempty=False)) <= seen:
            raise ReadinessError(
                "Milestone dependencies must name preceding milestones."
            )
        seen.add(identity)
        if not set(strings(piece["checks"])) <= CHECKS.keys():
            raise ReadinessError("A milestone references an unknown executable check.")
        if not set(strings(piece["runtime_requirements"])) <= external_ids:
            raise ReadinessError("A runtime requirement has no receiving owner.")
        strings(piece["acceptance"])
        for name in strings(piece["sources"]):
            safe_path(root, name)
    return contract


def source_snapshot(root: Path, contract: dict[str, object]) -> dict[str, object]:
    """Bind the review to exact tracked and newly authored source bytes."""
    pieces = cast(list[Piece], contract["pieces"])
    declared = {path for piece in pieces for path in piece["sources"]}
    # The acceptance suites span shared dependencies beyond a single milestone.
    # Include their source trees so changing a helper invalidates old receipts.
    declared.update(
        {
            CONTRACT,
            "apps",
            "libs",
            "foundry",
            "tests/upgrade",
            "scripts",
            "CLAUDE.md",
            "docker-compose.yml",
            ".gitlab-ci.yml",
            ".gitlab/ci",
        }
    )
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "-c",
            "-o",
            "--exclude-standard",
            "-z",
            "--",
            *sorted(declared),
        ],
        cwd=root,
        capture_output=True,
        check=True,
    )
    files = sorted(set(result.stdout.decode().strip("\0").split("\0")) - {""})
    if not files:
        raise ReadinessError("No governed source files were found.")
    hashes: dict[str, str] = {}
    for name in files:
        path = safe_path(root, name)
        if path.is_file():
            hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    for name in declared:
        path = safe_path(root, name)
        if path.is_file() and name not in hashes:
            hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return {
        "schema_version": "buildanddo.hostinger-review/v1",
        "contract_sha256": digest(contract),
        "sources": hashes,
    }


def check_wiring(root: Path) -> None:
    """Require the governance gate in the agent entry points and actual CI step."""
    required = "python scripts/ci/hostinger_readiness.py --check"
    for path in ("AGENTS.md", ".bits/context.md"):
        if required not in (root / path).read_text():
            raise ReadinessError(f"Mandatory readiness recheck is missing from {path}.")
    try:
        require_command(root, "scripts/ci/hostinger_readiness.py", "--check")
    except ValueError as error:
        raise ReadinessError(str(error)) from error
    for path in (
        "AGENTS.md",
        "apps/web/src/components/workspace/ProgressionPipeline.jsx",
    ):
        if "governance:readiness" not in (root / path).read_text():
            raise ReadinessError(
                "The readiness gate must be visible in both contribution-flow definitions."
            )


def check_review(root: Path) -> tuple[dict[str, object], str]:
    """Fail until governance has been reviewed against the current source."""
    contract = load_contract(root)
    snapshot = source_snapshot(root, contract)
    check_wiring(root)
    if read_json(root / LOCK) != snapshot:
        raise ReadinessError(
            "Readiness review is stale. Review rationale, acceptance and next actions; then run --refresh and --check."
        )
    return contract, digest(snapshot)


def acceptance_state(
    root: Path,
    evidence: Path,
    source: str,
    now: datetime,
    candidate: str | None = None,
) -> dict[str, str]:
    """Validate locally captured check receipts and prefer later failures to old passes."""
    selected: dict[str, tuple[datetime, str, str]] = {}
    for path in sorted(evidence.glob("*.json")):
        receipt = read_json(path)
        name, profile = receipt.get("check"), receipt.get("profile")
        if (
            not isinstance(name, str)
            or name not in CHECKS
            or profile not in ("package", "compose")
        ):
            raise ReadinessError(
                "Unknown acceptance receipt; keep other exports outside the check directory."
            )
        check = CHECKS[name]
        key = name + (":" + cast(str, profile) if check.level == "native" else "")
        started, finished = (
            instant(receipt.get("started_at")),
            instant(receipt.get("finished_at")),
        )
        state = str(receipt.get("status"))
        if (
            receipt.get("schema_version") != "buildanddo.acceptance/v1"
            or receipt.get("level") != check.level
            or state not in {"PASS", "FAIL", "HOLD", "BLOCKED"}
        ):
            raise ReadinessError("Invalid acceptance receipt contract.")
        log = safe_path(evidence, receipt.get("log"))
        raw = log.read_bytes()
        if hashlib.sha256(raw).hexdigest() != receipt.get("log_sha256"):
            state = "INVALID"
        elif finished > now or finished < started:
            state = "INVALID"
        elif now - finished > MAX_AGE or receipt.get("source_sha256") != source:
            state = "STALE"
        elif receipt.get("argv") != command(root, check):
            state = "STALE"
        elif candidate is not None and (
            receipt.get("candidate_sha") != candidate
            or receipt.get("candidate_clean") is not True
            or receipt.get("candidate_unchanged") is not True
        ):
            state = "INVALID"
        elif state == "PASS":
            counts = object_value(receipt.get("counts"))
            if set(counts) != {"tests", "failures", "skipped"} or any(
                type(value) is not int or value < 0 for value in counts.values()
            ):
                state = "INVALID"
            if (
                receipt.get("exit_code") != 0
                or counts
                != test_counts(raw.decode(errors="replace"), check.test_format, root)
                or check.test_format
                and (
                    type(counts.get("tests")) is not int
                    or cast(int, counts["tests"]) < 1
                    or counts.get("failures") != 0
                    or counts.get("skipped") != 0
                )
            ):
                state = "INVALID"
            if check.level == "native" and (
                receipt.get("runtime_expected")
                != runtime_version(root, cast(str, profile))
                or receipt.get("runtime_observed") != receipt.get("runtime_expected")
            ):
                state = "INVALID"
            artifacts = object_value(receipt.get("artifacts"))
            if set(artifacts) != set(check.artifacts):
                state = "INVALID"
            for name_path, expected in artifacts.items():
                artifact = safe_path(root, name_path, exists=False)
                if (
                    not artifact.is_file()
                    or hashlib.sha256(artifact.read_bytes()).hexdigest() != expected
                ):
                    state = "STALE"
        fingerprint = digest(receipt)
        if key not in selected or finished > selected[key][0]:
            selected[key] = (finished, state, fingerprint)
        elif finished == selected[key][0] and fingerprint != selected[key][2]:
            selected[key] = (finished, "INVALID", selected[key][2])
    return {name: result[1] for name, result in selected.items()}


def assessment(
    root: Path, evidence: Path | None = None, now: datetime | None = None
) -> dict[str, object]:
    """Separate repository acceptance from unperformed external verification."""
    contract, source = check_review(root)
    states = (
        acceptance_state(root, evidence, source, now or datetime.now(timezone.utc))
        if evidence
        else {}
    )
    items: list[dict[str, object]] = []
    for piece in cast(list[Piece], contract["pieces"]):
        requirements = [
            name + ":" + profile if CHECKS[name].level == "native" else name
            for name in piece["checks"]
            for profile in (
                ("package", "compose")
                if CHECKS[name].level == "native"
                else ("package",)
            )
        ]
        checks = {name: states.get(name, "UNMEASURED") for name in requirements}
        items.append(
            {
                "id": piece["id"],
                "day": piece["day"],
                "title": piece["title"],
                "source_state": "PASS"
                if all(state == "PASS" for state in checks.values())
                else "HOLD",
                "checks": checks,
                "runtime_state": "UNMEASURED",
                "runtime_requirements": piece["runtime_requirements"],
                "owner": piece["owner"],
                "why": piece["why"],
                "next_step": piece["next_step"],
            }
        )
    first = next((item for item in items if item["source_state"] != "PASS"), items[-1])
    return {
        "schema_version": "buildanddo.hostinger-assessment/v1",
        "campaign_id": CAMPAIGN_ID,
        "source_sha256": source,
        "pieces": items,
        "external_requirements": contract["external_requirements"],
        "next_step": first["next_step"],
        "scope": "Repository acceptance only; external receipts and owner review remain required. No sprint completion is asserted.",
    }


def main(argv: list[str] | None = None) -> int:
    """Validate, refresh reviewed bindings, run checks or print current readiness."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--check", action="store_true")
    group.add_argument(
        "--refresh",
        action="store_true",
        help="Acknowledge review of rationale and next steps for current source; never marks tests passed.",
    )
    group.add_argument("--run", choices=["all", *CHECKS])
    parser.add_argument("--runtime", choices=["package", "compose"], default="package")
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    try:
        if args.refresh:
            contract = load_contract(root)
            check_wiring(root)
            (root / LOCK).write_text(
                json.dumps(source_snapshot(root, contract), indent=2, sort_keys=True)
                + "\n"
            )
            print(
                "PASS: reviewed source binding refreshed; no acceptance state changed."
            )
            return 0
        _, source = check_review(root)
        if args.check:
            print(
                "PASS: all eleven milestones retain current rationale, owners, checks and next steps."
            )
            return 0
        evidence = args.evidence_dir or root / "state/hostinger/acceptance"
        if args.run:
            names = list(CHECKS) if args.run == "all" else [args.run]
            results = []
            for name in names:
                path = run_check(root, evidence, name, source, args.runtime)
                result = read_json(path)
                results.append(result["status"])
                print(
                    f"{result['status']}: {name} ({args.runtime}) — {path}", flush=True
                )
            return 0 if all(result == "PASS" for result in results) else 1
        report = assessment(root, evidence)
        if args.json:
            print(json.dumps(report, indent=2, sort_keys=True))
        else:
            for value in cast(list[dict[str, object]], report["pieces"]):
                print(
                    f"{value['id']} day {value['day']}: source {value['source_state']}; runtime {value['runtime_state']} — {value['title']}"
                )
                print(f"  Next ({value['owner']}): {value['next_step']}")
            print(report["scope"])
        return 0
    except (ReadinessError, OSError, subprocess.SubprocessError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
