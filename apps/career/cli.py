# ─── CGRF Header ──────────────────────────────
# File:        apps/career/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/history.py, apps/career/passport.py, apps/career/match.py, apps/career/dossier.py, apps/career/compiler.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/career/history.py; DEPENDS_ON apps/career/passport.py; DEPENDS_ON apps/career/match.py; DEPENDS_ON apps/career/dossier.py; DEPENDS_ON apps/career/compiler.py
# DAG Node:    none
# Intent:      Run the passport, match, dossier and package stages locally, writing only to a new output directory.
# ─────────────────────────────────────────────────────────────

"""Command-line entry point for the local career evidence engine."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.career.compiler import canonical_json, compile_application
from apps.career.dossier import build_dossier, rank
from apps.career.evidence import CareerError, attestation_evidence
from apps.career.history import Identity, attribute, read_git_history
from apps.career.jobs import normalize_job
from apps.career.match import evaluate
from apps.career.passport import Passport, parse_instant, passport_from_history

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise CareerError(f"cannot read JSON from {path}") from error


def _fresh_directory(path: Path) -> Path:
    if path.exists() and (not path.is_dir() or any(path.iterdir())):
        raise CareerError(f"output directory {path} must be new or empty")
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_identity(raw: Any) -> tuple[Identity, list[dict[str, Any]]]:
    """Read an identity document and its attestations."""
    if not isinstance(raw, dict):
        raise CareerError("identity must be an object")
    emails = raw.get("person_emails")
    agents = raw.get("agent_emails", [])
    attestations = raw.get("attestations", [])
    if not isinstance(emails, list) or not isinstance(agents, list) or not isinstance(attestations, list):
        raise CareerError("identity emails and attestations must be lists")
    identity = Identity(
        person_id=str(raw.get("person_id", "")),
        person_emails=frozenset(str(item).lower() for item in emails),
        agent_emails=frozenset(str(item).lower() for item in agents),
    )
    return identity, attestations


def cmd_passport(args: argparse.Namespace) -> dict[str, Any]:
    """Build a passport from local git history plus attestations."""
    identity, attestations = load_identity(_read_json(Path(args.identity)))
    as_of = parse_instant(args.as_of) if args.as_of else datetime.now(timezone.utc)
    head, commits = read_git_history(Path(args.repo), max_count=args.max_count)
    attribution = attribute(commits, identity)
    extra = [ref for item in attestations for ref in attestation_evidence(item, identity.person_id)]
    passport = passport_from_history(identity.person_id, attribution, extra, as_of=as_of, head=head)
    out = _fresh_directory(Path(args.output))
    (out / "passport.json").write_text(canonical_json(passport.to_dict()), encoding="utf-8")
    return {
        "state": "PASS",
        "passport": str(out / "passport.json"),
        "digest": passport.digest,
        "sources": list(passport.sources),
        "capabilities": {
            item.capability_id: {
                "records": item.records,
                "participation": item.claim_participation.value,
                "state": item.state.value,
                "confidence": item.confidence,
            }
            for item in passport.capabilities
        },
    }


def cmd_evaluate(args: argparse.Namespace) -> dict[str, Any]:
    """Match supplied jobs, write ranked dossiers and compile the top packages."""
    passport = Passport.from_dict(_read_json(Path(args.passport)))
    raw_jobs = _read_json(Path(args.jobs))
    postings = raw_jobs.get("jobs") if isinstance(raw_jobs, dict) else raw_jobs
    if not isinstance(postings, list) or not postings:
        raise CareerError("jobs file must hold a non-empty list")
    jobs = {job.job_id: job for job in (normalize_job(item) for item in postings)}
    if len(jobs) != len(postings):
        raise CareerError("job ids must be unique")
    questions = _read_json(Path(args.questions)) if args.questions else {}
    stored = _read_json(Path(args.stored_answers)) if args.stored_answers else {}
    if not isinstance(questions, dict) or not isinstance(stored, dict):
        raise CareerError("questions and stored answers must be objects")
    ranked = rank([build_dossier(evaluate(job, passport), passport) for job in jobs.values()])
    out = _fresh_directory(Path(args.output))
    (out / "dossiers").mkdir()
    for dossier in ranked[: args.top]:
        name = _SAFE.sub("_", dossier.job_id)
        (out / "dossiers" / f"{name}.json").write_text(canonical_json(dossier.to_dict()), encoding="utf-8")
    packages: list[dict[str, Any]] = []
    eligible = [item for item in ranked if item.state != "REAL_GAP"][: args.packages]
    for dossier in eligible:
        job = jobs[dossier.job_id]
        package = compile_application(
            job, dossier, passport,
            questions=list(questions.get(job.job_id, [])),
            stored_answers=stored,
        )
        folder = out / "packages" / _SAFE.sub("_", job.job_id)
        folder.mkdir(parents=True)
        for filename, content in package.files.items():
            (folder / filename).write_text(content, encoding="utf-8")
        (folder / "manifest.json").write_text(
            canonical_json({**package.manifest, "package_digest": package.digest}), encoding="utf-8"
        )
        packages.append({"job_id": job.job_id, "package_digest": package.digest,
                         "next_step": package.manifest["next_step"]["decision"]})
    ranking = [
        {"job_id": item.job_id, "role": item.body["role"], "company": item.body["company"],
         "state": item.state, **{key: item.body["summary"][key] for key in
                                 ("capability_coverage", "hard_requirements", "evidence_depth")}}
        for item in ranked
    ]
    (out / "ranking.json").write_text(canonical_json(ranking), encoding="utf-8")
    return {"state": "PASS", "jobs": len(jobs), "ranking": ranking, "packages": packages,
            "submitted": 0}


def build_parser() -> argparse.ArgumentParser:
    """Return the argument parser."""
    parser = argparse.ArgumentParser(prog="python -m apps.career", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    passport = sub.add_parser("passport", help="build a Career Passport from local git history")
    passport.add_argument("--repo", default=".")
    passport.add_argument("--identity", required=True)
    passport.add_argument("--output", required=True)
    passport.add_argument("--as-of")
    passport.add_argument("--max-count", type=int)
    passport.set_defaults(handler=cmd_passport)
    run = sub.add_parser("evaluate", help="match supplied jobs and compile packages")
    run.add_argument("--passport", required=True)
    run.add_argument("--jobs", required=True)
    run.add_argument("--output", required=True)
    run.add_argument("--top", type=int, default=10)
    run.add_argument("--packages", type=int, default=3)
    run.add_argument("--questions")
    run.add_argument("--stored-answers")
    run.set_defaults(handler=cmd_evaluate)
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run the CLI; print a JSON result and return a process status."""
    args = build_parser().parse_args(argv)
    try:
        result = args.handler(args)
    except CareerError as error:
        print(json.dumps({"state": "FAIL", "error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0
