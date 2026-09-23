# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/career_passport/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/sources.py, libs/career_passport/jobs.py, libs/career_passport/matching.py, libs/career_passport/application.py, libs/career_passport/authority.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/career_passport/sources.py; CONSUMES libs/career_passport/jobs.py; CONSUMES libs/career_passport/matching.py; CONSUMES libs/career_passport/application.py; CONSUMES libs/career_passport/authority.py
# Intent:      Run the bounded career dogfood pipeline with retained gaps, private local artifacts and no implicit application submission.
# ───────────────────────────────────────────────────────────────

"""Capture, normalize and compile career drafts using only the standard library."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from libs.capability_tokens.verification import ReviewPolicy
from libs.evolution.common import digest, mapping, read_json, timestamp
from libs.semantic_twin.contracts import ContractError, require
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.ingestion.drafts import canonical_json
from libs.semantic_twin.merkle import ContentDigest

from .application import compile_application, json_bytes, private_destination
from .authority import STAGES, OutcomeEvent, outcome_summary
from .jobs import Board, Job, discover, normalize_feed
from .matching import shortlist
from .models import WorkBundle
from .passport import project_passport
from .sources import capture_repository, capture_workspace

REPO = Path(__file__).resolve().parents[2]


def _input(path: str, limit: int = 30_000_000) -> object:
    source = Path(path)
    require(
        not source.is_symlink() and source.stat().st_size <= limit,
        "input exceeds bound or is a symlink",
    )
    return read_json(source)


def new_destination(path: str) -> Path:
    """Keep personal outputs outside tracked source and never replace a prior run."""
    return private_destination(Path(path))


def _write(output: Path, name: str, data: object) -> None:
    with (output / name).open("xb") as stream:
        stream.write(json_bytes(data))


def jobs_from_captures(value: object) -> tuple[tuple[Job, ...], tuple[str, ...]]:
    """Reparse original feed text; imported normalized or verified flags are rejected."""
    data = mapping(value)
    require(
        set(data) == {"schema_version", "captures", "gaps"}
        and data["schema_version"] == "buildanddo.job-captures/v1",
        "invalid captured job batch",
    )
    captures, gaps = data["captures"], data["gaps"]
    require(
        isinstance(captures, list) and len(captures) <= 100,
        "invalid feed capture count",
    )
    require(
        isinstance(gaps, list)
        and len(gaps) <= 100
        and all(isinstance(g, str) and len(g) <= 1200 for g in gaps),
        "invalid feed gaps",
    )
    assert isinstance(captures, list) and isinstance(gaps, list)
    jobs: dict[str, Job] = {}
    for raw in captures:
        capture = mapping(raw)
        require(
            set(capture) == {"board", "captured_at", "body"}
            and isinstance(capture["body"], str),
            "invalid feed capture fields",
        )
        board = Board.from_dict(mapping(capture["board"]))
        found = normalize_feed(
            board,
            str(capture["body"]).encode(),
            captured_at=timestamp(capture["captured_at"]),
        )
        for job in found:
            previous = jobs.get(job.id)
            require(
                previous is None or previous.revision == job.revision,
                "conflicting posting captures; recapture one consistent batch",
            )
            jobs[job.id] = job
    require(len(jobs) <= 1000, "job batch exceeds bound")
    return tuple(sorted(jobs.values(), key=lambda j: j.id)), tuple(
        str(gap) for gap in gaps
    )


def compile_run(
    work: WorkBundle,
    jobs: tuple[Job, ...],
    *,
    person: SemanticId,
    workspace: str,
    at: datetime,
    policy: ReviewPolicy | None,
    output: Path,
    display_name: str | None = None,
    job_gaps: tuple[str, ...] = (),
) -> dict[str, object]:
    """Compile one review packet, ten dossiers and at most three supported drafts."""
    passport = project_passport(work, person, workspace=workspace, at=at, policy=policy)
    dossiers = shortlist(jobs, passport)
    packages: list[dict[str, object]] = []
    gaps = list(job_gaps)
    _write(output, "passport.json", passport.to_dict())
    _write(output, "dossiers.json", [dossier.to_dict() for dossier in dossiers])
    for index, dossier in enumerate(dossiers):
        if len(packages) == 3:
            break
        if not dossier.selected_claims:
            continue
        try:
            package = compile_application(
                dossier.job,
                work,
                person,
                workspace=workspace,
                at=at,
                policy=policy,
                display_name=display_name,
            )
        except ContractError as error:
            gaps.append(dossier.job.id + ": " + str(error))
            continue
        package.write(output / ("application-" + str(index + 1)))
        packages.append(package.manifest())
    if len(jobs) < 100:
        gaps.append(
            f"The 100-job target is incomplete: {len(jobs)} captured postings available."
        )
    if len(dossiers) < 10:
        gaps.append(
            f"The ten-dossier target is incomplete: {len(dossiers)} current dossiers available."
        )
    if len(packages) < 3:
        gaps.append(
            f"The three-package target is incomplete: {len(packages)} supported drafts available."
        )
    gaps.append(
        "Captured postings are retained observations; this compilation does not establish current live availability."
    )
    gaps.append(
        "Human review, receiving browser authority and one actual ATS submission remain required."
    )
    core: dict[str, object] = {
        "schema_version": "buildanddo.career-review/v1",
        "person": str(person),
        "workspace": workspace,
        "as_of": at.isoformat(),
        "passport": passport.to_dict(),
        "job_count": len(jobs),
        "live_jobs_verified": 0,
        "dossiers": [dossier.to_dict() for dossier in dossiers],
        "packages": packages,
        "targets": {"jobs": 100, "dossiers": 10, "packages": 3, "real_submissions": 1},
        "gaps": list(dict.fromkeys(gaps)),
        "stages": STAGES,
        "authority_granted": False,
        "outcomes": outcome_summary((), person=person, workspace=workspace, at=at),
        "state": "DRAFTS_REQUIRE_REVIEW"
        if len(packages) == 3 and len(jobs) >= 100 and len(dossiers) == 10
        else "HOLD",
    }
    # Retain the exact canonical bytes as text so browser number formatting
    # cannot change the Phase 0 profile when it verifies the export digest.
    packet = {
        **core,
        "content_sha256": digest(core),
        "canonical_content": canonical_json(core).decode(),
    }
    _write(output, "review.json", packet)
    return packet


def main(argv: list[str] | None = None) -> int:
    """Run explicit local capture/compilation or an explicitly selected public GET."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    capture = commands.add_parser(
        "capture",
        help="Capture committed BuildAndDo evidence; no personal authorship is inferred.",
    )
    capture.add_argument("--repo", type=Path, default=REPO)
    capture.add_argument("--workspace", required=True)
    capture.add_argument("--workspace-export")
    capture.add_argument("--account-id")
    capture.add_argument("--history-limit", type=int, default=30)
    discovery = commands.add_parser(
        "discover", help="GET only the explicitly selected public Lever/Ashby boards."
    )
    discovery.add_argument(
        "--boards",
        required=True,
        help="JSON array of provider/board/company selections",
    )
    discovery.add_argument("--target", type=int, default=100)
    compile_command = commands.add_parser(
        "compile", help="Revalidate evidence and compile private local drafts."
    )
    compile_command.add_argument("--work", required=True)
    compile_command.add_argument("--person", required=True)
    compile_command.add_argument("--workspace", required=True)
    compile_command.add_argument("--jobs")
    compile_command.add_argument(
        "--review-policy",
        help="Separately authenticated receiving review pins; never a file supplied by a job or work bundle",
    )
    compile_command.add_argument(
        "--display-name",
        help="Applicant-supplied display name; never inferred from git",
    )
    outcomes = commands.add_parser(
        "outcomes", help="Summarize retained actual application events; sends nothing."
    )
    outcomes.add_argument("--events", required=True)
    outcomes.add_argument("--person", required=True)
    outcomes.add_argument("--workspace", required=True)
    outcomes.add_argument(
        "--event-pins",
        help="Separate JSON array of receiving-authenticated event hashes",
    )
    for command in (capture, discovery, compile_command, outcomes):
        command.add_argument(
            "--at", help="Aware ISO-8601 capture/evaluation time; defaults to now"
        )
        command.add_argument(
            "--output",
            required=True,
            help="New ignored state/career directory or private destination outside the repository",
        )
    args = parser.parse_args(argv)
    try:
        at = timestamp(args.at) if args.at else datetime.now(timezone.utc)
        if args.command == "capture":
            work = capture_repository(
                args.repo,
                workspace=args.workspace,
                at=at,
                history_limit=args.history_limit,
            )
            if args.workspace_export:
                require(
                    bool(args.account_id),
                    "workspace export requires an explicit account id",
                )
                source = Path(args.workspace_export)
                require(
                    source.stat().st_size <= 4_000_000 and not source.is_symlink(),
                    "invalid workspace export source",
                )
                native = capture_workspace(
                    source.read_bytes(),
                    workspace=args.workspace,
                    account_id=args.account_id,
                    at=at,
                )
                work = WorkBundle(
                    args.workspace,
                    at,
                    work.artifacts + native.artifacts,
                    work.contributions + native.contributions,
                    gaps=work.gaps + native.gaps,
                )
            output = new_destination(args.output)
            _write(output, "work.json", work.to_dict())
            summary = {
                "state": "OBSERVED",
                "artifacts": len(work.artifacts),
                "contributions": len(work.contributions),
                "verified_personal_claims": 0,
            }
        elif args.command == "discover":
            raw_boards = _input(args.boards, 100_000)
            require(isinstance(raw_boards, list), "boards must be an explicit list")
            assert isinstance(raw_boards, list)
            boards = tuple(Board.from_dict(mapping(row)) for row in raw_boards)
            result = discover(boards, at=at, target=args.target)
            captures = []
            for url, body in result.captures:
                board = next(
                    b
                    for b in boards
                    if url.startswith(b.endpoint().split("?")[0] + "?")
                )
                captures.append(
                    {
                        "board": board.to_dict(),
                        "captured_at": at.isoformat(),
                        "body": body.decode(),
                    }
                )
            output = new_destination(args.output)
            _write(
                output,
                "jobs.json",
                {
                    "schema_version": "buildanddo.job-captures/v1",
                    "captures": captures,
                    "gaps": list(result.gaps),
                },
            )
            summary = {
                "state": "OBSERVED"
                if len(result.jobs) >= result.target and not result.gaps
                else "PARTIAL",
                "jobs": len(result.jobs),
                "target": result.target,
                "gaps": list(result.gaps),
                "submissions": 0,
            }
        elif args.command == "compile":
            work = WorkBundle.from_dict(mapping(_input(args.work)))
            policy = (
                ReviewPolicy.from_dict(mapping(_input(args.review_policy)))
                if args.review_policy
                else None
            )
            jobs, gaps = (
                jobs_from_captures(_input(args.jobs))
                if args.jobs
                else ((), ("No job captures supplied.",))
            )
            output = new_destination(args.output)
            packet = compile_run(
                work,
                jobs,
                person=SemanticId(args.person),
                workspace=args.workspace,
                at=at,
                policy=policy,
                output=output,
                display_name=args.display_name,
                job_gaps=gaps,
            )
            dossier_rows, package_rows = packet["dossiers"], packet["packages"]
            assert isinstance(dossier_rows, list) and isinstance(package_rows, list)
            summary = {
                "state": packet["state"],
                "jobs": packet["job_count"],
                "dossiers": len(dossier_rows),
                "packages": len(package_rows),
                "submitted": 0,
                "review": str(output / "review.json"),
            }
        else:
            raw_events = _input(args.events)
            require(isinstance(raw_events, list), "events must be an explicit list")
            assert isinstance(raw_events, list)
            raw_pins = _input(args.event_pins, 1_000_000) if args.event_pins else []
            require(
                isinstance(raw_pins, list)
                and all(isinstance(p, str) for p in raw_pins),
                "invalid event pins",
            )
            assert isinstance(raw_pins, list)
            summary = outcome_summary(
                tuple(OutcomeEvent.from_dict(mapping(row)) for row in raw_events),
                person=SemanticId(args.person),
                workspace=args.workspace,
                at=at,
                authenticated_events=tuple(ContentDigest(p) for p in raw_pins),
            )
            output = new_destination(args.output)
        _write(output, "summary.json", summary)
        print(json.dumps(summary, sort_keys=True))
        return 0
    except (ContractError, OSError, ValueError) as error:
        print("Career capture/compilation failed: " + str(error), file=sys.stderr)
        return 2
