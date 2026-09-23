# ─── CGRF Header ──────────────────────────────
# File:        apps/career/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/history.py, apps/career/passport.py, apps/career/match.py, apps/career/dossier.py, apps/career/compiler.py, apps/career/missions.py, apps/career/sources.py, apps/career/outcomes.py, apps/career/packages.py, apps/career/fill.py, apps/career/imports.py, apps/career/assessments.py, apps/career/ledger.py, apps/career/profile.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/career/history.py; DEPENDS_ON apps/career/passport.py; DEPENDS_ON apps/career/match.py; DEPENDS_ON apps/career/dossier.py; DEPENDS_ON apps/career/compiler.py; DEPENDS_ON apps/career/missions.py; DEPENDS_ON apps/career/sources.py; DEPENDS_ON apps/career/outcomes.py; DEPENDS_ON apps/career/packages.py; DEPENDS_ON apps/career/fill.py; DEPENDS_ON apps/career/imports.py; DEPENDS_ON apps/career/assessments.py; DEPENDS_ON apps/career/ledger.py; DEPENDS_ON apps/career/profile.py
# DAG Node:    none
# Intent:      Run the passport, match, dossier and package stages locally, writing only to a new output directory.
# ─────────────────────────────────────────────────────────────

"""Command-line entry point for the local career evidence engine."""

from __future__ import annotations

import argparse
import json
import re
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.career.assessments import (
    assessment_evidence,
    grade_attempt,
    issue_attempt,
    load_bank,
    pending,
    regrade,
)
from apps.career.compiler import canonical_json, compile_application
from apps.career.imports import (
    PLATFORMS,
    build_inventory,
    import_evidence,
    load_inventory,
    read_json_resume,
    read_linkedin,
    read_open_badges,
)
from apps.career.ledger import read_chain
from apps.career.profile import build_profile
from apps.career.fill import grant_from_dict, plan_fill
from apps.career.missions import attribute_missions
from apps.career.outcomes import STAGES, TERMINAL, read_ledger, record_applied, record_stage, report
from apps.career.packages import load_package, write_package
from apps.career.sources import ENDPOINTS, diff_jobs, discover, endpoint, fetch_json
from apps.career.verify import render_card, verify_passport
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
    if bool(args.bank) != bool(args.assessments):
        raise CareerError("--bank and --assessments are required together to regrade assessment evidence")
    raw_identity = _read_json(Path(args.identity))
    identity, attestations = load_identity(raw_identity)
    as_of = parse_instant(args.as_of) if args.as_of else datetime.now(timezone.utc)
    head, commits = read_git_history(Path(args.repo), max_count=args.max_count)
    attribution = attribute(commits, identity)
    extra = [ref for item in attestations for ref in attestation_evidence(item, identity.person_id)]
    additional = []
    if args.imports:
        inventory = load_inventory(_read_json(Path(args.imports)))
        if inventory["person_id"] != identity.person_id:
            raise CareerError("imported claims belong to a different person_id")
        additional.append(import_evidence(inventory))
    if args.assessments:
        additional.append(assessment_evidence(read_chain(Path(args.assessments)), identity.person_id,
                                              bank=load_bank(_read_json(Path(args.bank)))))
    missions = None
    if args.missions:
        user_ids = raw_identity.get("person_user_ids", [])
        if not isinstance(user_ids, list):
            raise CareerError("person_user_ids must be a list")
        missions = attribute_missions(_read_json(Path(args.missions)), [str(item) for item in user_ids])
    passport = passport_from_history(
        identity.person_id, attribution, extra, as_of=as_of, head=head, missions=missions,
        identity_digest=identity.digest(), max_count=args.max_count, additional=additional,
    )
    out = _fresh_directory(Path(args.output))
    (out / "passport.json").write_text(canonical_json(passport.to_dict()), encoding="utf-8")
    (out / "passport_card.md").write_text(render_card(passport), encoding="utf-8")
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
        write_package(out / "packages" / _SAFE.sub("_", job.job_id), package)
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


def cmd_discover(args: argparse.Namespace) -> dict[str, Any]:
    """Normalize a public job board from a saved payload or, when allowed, a live GET."""
    if args.payload:
        payload = _read_json(Path(args.payload))
        origin = f"file:{Path(args.payload).name}"
    elif args.allow_network:
        url = endpoint(args.source, args.board)
        payload, origin = fetch_json(url), url
    else:
        raise CareerError("pass --payload, or --allow-network to fetch the public board")
    result = discover(args.source, args.board, payload)
    previous: list[dict[str, Any]] = []
    if args.previous:
        raw = _read_json(Path(args.previous))
        previous = list(raw.get("jobs", [])) if isinstance(raw, dict) else []
    out = _fresh_directory(Path(args.output))
    jobs = [job.to_dict() for job in result.jobs]
    (out / "jobs.json").write_text(canonical_json({"origin": origin, "jobs": jobs}), encoding="utf-8")
    summary = {
        "state": "PASS",
        "origin": origin,
        "jobs": len(jobs),
        "skipped": result.skipped,
        "diff": diff_jobs(previous, result.jobs) if args.previous else None,
    }
    (out / "discovery.json").write_text(canonical_json(summary), encoding="utf-8")
    return summary


def cmd_outcome(args: argparse.Namespace) -> dict[str, Any]:
    """Record a human-reported application outcome or report the ledger."""
    ledger = Path(args.ledger)
    if args.action == "report":
        return {"state": "PASS", **report(read_ledger(ledger))}
    if not args.at or not args.recorded_by:
        raise CareerError("--at and --recorded-by are required to record an outcome")
    if args.action == "applied":
        if not args.package_dir:
            raise CareerError("--package-dir names the package that was submitted")
        event = record_applied(ledger, load_package(Path(args.package_dir)), at=args.at,
                               recorded_by=args.recorded_by, channel=args.channel)
    else:
        if not args.application_id:
            raise CareerError("--application-id is required")
        event = record_stage(ledger, args.application_id, args.action, at=args.at, recorded_by=args.recorded_by)
    return {"state": "PASS", "event": event}


def cmd_fill_plan(args: argparse.Namespace) -> dict[str, Any]:
    """Write a fill plan for one package and employer form."""
    package = load_package(Path(args.package_dir))
    grant = grant_from_dict(_read_json(Path(args.grant))) if args.grant else grant_from_dict(None)
    profile = _read_json(Path(args.profile)) if args.profile else {}
    if not isinstance(profile, dict):
        raise CareerError("profile must be an object")
    plan = plan_fill(package, _read_json(Path(args.form)), profile, grant, challenge_present=args.challenge)
    out = _fresh_directory(Path(args.output))
    (out / "fill_plan.json").write_text(canonical_json(plan), encoding="utf-8")
    return {"state": "PASS", "fill": plan["fill"], "submit": plan["submit"], "blocking": plan["blocking"]}


def cmd_verify(args: argparse.Namespace) -> dict[str, Any]:
    """Re-derive a passport's repository claims and, given the bank, re-grade its assessments."""
    identity, _ = load_identity(_read_json(Path(args.identity)))
    result = verify_passport(_read_json(Path(args.passport)), Path(args.repo), identity)
    if bool(args.bank) != bool(args.assessments):
        raise CareerError("--bank and --assessments are used together")
    if args.bank:
        graded = regrade(load_bank(_read_json(Path(args.bank))), read_chain(Path(args.assessments)))
        result["assessments"] = graded
        if graded["state"] == "MISMATCH":
            result["state"] = "MISMATCH"
            result["mismatches"] = [*result["mismatches"], *graded["mismatches"]]
    return result


def cmd_import(args: argparse.Namespace) -> dict[str, Any]:
    """Import claims from another platform as self-reported, then list what an assessment could upgrade."""
    identity, _ = load_identity(_read_json(Path(args.identity)))
    as_of = parse_instant(args.as_of) if args.as_of else datetime.now(timezone.utc)
    path = Path(args.path)
    if args.platform == "linkedin":
        claims = read_linkedin(path, as_of)
    elif args.platform == "jsonresume":
        claims = read_json_resume(_read_json(path), as_of)
    else:
        claims = read_open_badges(_read_json(path), identity.person_emails, as_of)
    inventory = build_inventory(identity.person_id, args.platform, claims, as_of)
    out = _fresh_directory(Path(args.output))
    (out / "imported_claims.json").write_text(canonical_json(inventory), encoding="utf-8")
    return {"state": "PASS", "claims": len(inventory["claims"]), "digest": inventory["digest"],
            "claim_state": inventory["state"],
            "declared_employment_months": inventory["declared_employment_months"],
            "unmapped": [item["name"] for item in inventory["claims"] if not item["capabilities"]],
            "capabilities": sorted({cap for item in inventory["claims"] for cap in item["capabilities"]})}


def cmd_profile(args: argparse.Namespace) -> dict[str, Any]:
    """Write the login profile envelope Citadel Nexus serves for one BuildAndDo account."""
    issued = parse_instant(args.issued_at) if args.issued_at else datetime.now(timezone.utc)
    envelope = build_profile(_read_json(Path(args.passport)), args.subject_id, issued)
    out = _fresh_directory(Path(args.output))
    (out / "profile.json").write_text(canonical_json(envelope), encoding="utf-8")
    return {"state": "PASS", "profile": str(out / "profile.json"), "subject_id": envelope["subject_id"],
            "passport_digest": envelope["passport"]["digest"]}


def _need(args: argparse.Namespace, *names: str) -> None:
    missing = [f"--{name.replace('_', '-')}" for name in names if not getattr(args, name)]
    if missing:
        raise CareerError(f"assess {args.action} needs " + ", ".join(missing))


def cmd_assess(args: argparse.Namespace) -> dict[str, Any]:
    """Issue, grade, re-grade or list pending assessments."""
    _need(args, "bank", "ledger")
    bank, ledger = load_bank(_read_json(Path(args.bank))), Path(args.ledger)
    if args.action == "issue":
        _need(args, "capability", "person_id", "output")
        at = args.at or datetime.now(timezone.utc).isoformat()
        form = issue_attempt(bank, ledger, person_id=args.person_id, capability=args.capability,
                             seed=args.seed or secrets.token_hex(8), at=at)
        out = _fresh_directory(Path(args.output))
        (out / "form.json").write_text(canonical_json(form), encoding="utf-8")
        return {"state": "PASS", "attempt_id": form["attempt_id"], "form": str(out / "form.json"),
                "expires_at": form["expires_at"]}
    if args.action == "grade":
        _need(args, "attempt_id", "responses")
        at = args.at or datetime.now(timezone.utc).isoformat()
        event = grade_attempt(bank, ledger, attempt_id=args.attempt_id, responses=_read_json(Path(args.responses)),
                              at=at, proctor_id=args.proctor_id, proctor_receipt=args.proctor_receipt)
        return {"state": "PASS", **{key: event[key] for key in
                                    ("attempt_id", "capability", "correct", "total", "passed", "within_time")}}
    if args.action == "regrade":
        return regrade(bank, read_chain(ledger))
    _need(args, "imports")
    return {"state": "PASS", "pending": pending(load_inventory(_read_json(Path(args.imports))), bank,
                                                read_chain(ledger))}


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
    passport.add_argument("--imports", help="imported_claims.json from the import command")
    passport.add_argument("--assessments", help="assessment ledger")
    passport.add_argument("--bank", help="issuing question bank required with --assessments for regrading")
    passport.add_argument("--missions", help="exported BuildAndDo missions/evidence/suite_runs JSON")
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
    find = sub.add_parser("discover", help="normalize a public Lever, Greenhouse or Ashby board (read-only)")
    find.add_argument("--source", required=True, choices=sorted(ENDPOINTS))
    find.add_argument("--board", required=True)
    find.add_argument("--output", required=True)
    find.add_argument("--payload", help="saved board JSON; no network")
    find.add_argument("--allow-network", action="store_true", help="GET the public board endpoint")
    find.add_argument("--previous", help="earlier jobs.json to diff against")
    find.set_defaults(handler=cmd_discover)
    outcome = sub.add_parser("outcome", help="record or report human-reported application outcomes")
    outcome.add_argument("action", choices=["applied", *STAGES[1:], *TERMINAL[1:], "report"])
    outcome.add_argument("--ledger", required=True)
    outcome.add_argument("--package-dir")
    outcome.add_argument("--application-id")
    outcome.add_argument("--at")
    outcome.add_argument("--recorded-by")
    outcome.add_argument("--channel")
    outcome.set_defaults(handler=cmd_outcome)
    fill = sub.add_parser("fill-plan", help="plan a form fill; never opens a browser or submits")
    fill.add_argument("--package-dir", required=True)
    fill.add_argument("--form", required=True)
    fill.add_argument("--output", required=True)
    fill.add_argument("--profile")
    fill.add_argument("--grant")
    fill.add_argument("--challenge", action="store_true", help="an anti-bot challenge is present")
    fill.set_defaults(handler=cmd_fill_plan)
    check = sub.add_parser("verify", help="re-derive a passport from a repository clone (for reviewers)")
    check.add_argument("--passport", required=True)
    check.add_argument("--repo", required=True)
    check.add_argument("--identity", required=True)
    check.add_argument("--bank", help="question bank, to re-grade assessment results")
    check.add_argument("--assessments", help="assessment ledger to re-grade")
    check.set_defaults(handler=cmd_verify)
    bring = sub.add_parser("import", help="import LinkedIn, JSON Resume or Open Badges claims as self-reported")
    bring.add_argument("--platform", required=True, choices=PLATFORMS)
    bring.add_argument("--path", required=True, help="LinkedIn export folder, or a JSON file")
    bring.add_argument("--identity", required=True)
    bring.add_argument("--output", required=True)
    bring.add_argument("--as-of")
    bring.set_defaults(handler=cmd_import)
    card = sub.add_parser("profile", help="build the login profile envelope Citadel Nexus serves")
    card.add_argument("--passport", required=True)
    card.add_argument("--subject-id", required=True, help="the BuildAndDo (PocketBase) account id")
    card.add_argument("--output", required=True)
    card.add_argument("--issued-at")
    card.set_defaults(handler=cmd_profile)
    quiz = sub.add_parser("assess", help="issue, grade, re-grade or list capability assessments")
    quiz.add_argument("action", choices=["issue", "grade", "regrade", "pending"])
    quiz.add_argument("--bank")
    quiz.add_argument("--ledger")
    for name in ("capability", "person-id", "seed", "at", "output", "attempt-id", "responses",
                 "proctor-id", "proctor-receipt", "imports"):
        quiz.add_argument(f"--{name}")
    quiz.set_defaults(handler=cmd_assess)
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
    return 2 if result.get("state") == "MISMATCH" else 0
