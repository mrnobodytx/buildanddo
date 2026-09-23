# ─── CGRF Header ──────────────────────────────
# File:        tests/career/test_slice2.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career, tests/career/test_career.py, tests/fixtures/career
# EnumType:    Test
# EnumEdges:   VALIDATES apps/career/sources.py; VALIDATES apps/career/missions.py; VALIDATES apps/career/outcomes.py; VALIDATES apps/career/packages.py; VALIDATES apps/career/fill.py; VALIDATES apps/career/cli.py
# DAG Node:    none
# Intent:      Prove public-board normalization, mission verification rules, verified package reloads, the outcome ledger and fill-plan authority.
# ─────────────────────────────────────────────────────────────

"""Exercise discovery, mission evidence, outcomes and fill plans."""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path
from typing import Any
from unittest.mock import patch

from apps.career import CareerError, ClaimState, build_dossier, compile_application, evaluate, normalize_job
from apps.career.authority import AuthorityGrant, Decision, JobTier
from apps.career.cli import main
from apps.career.fill import grant_from_dict, plan_fill
from apps.career.missions import attribute_missions
from apps.career.outcomes import MIN_SAMPLE, read_ledger, record_applied, record_stage, report, role_family
from apps.career.packages import load_package, write_package
from apps.career.passport import passport_from_history
from apps.career.history import attribute, read_git_history
from apps.career.sources import (
    diff_jobs,
    discover,
    endpoint,
    fetch_json,
    html_lines,
    sections,
    text_lines,
)
from tests.career import test_career as base

FIX = base.FIXTURES


def fixture(name: str) -> Any:
    return json.loads((FIX / name).read_text())


class _Response:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self, limit: int) -> bytes:
        return self.body[:limit]


class SourceTests(unittest.TestCase):
    def test_line_helpers(self) -> None:
        self.assertEqual(html_lines("<h2>Requirements</h2><ul><li>Python <b>3</b></li></ul>"),
                         ["# Requirements", "- Python 3"])
        self.assertEqual(text_lines("Skills\n\n* Go\n1. Rust"), ["Skills", "- Go", "- Rust"])
        parts = sections(["# Requirements", "- a", "short reset", "- dropped", "Preferred:", "- b",
                          "A long paragraph that is clearly body text rather than any section heading.", "- c"])
        self.assertEqual(parts["requirements"], ["a"])
        self.assertEqual(parts["preferred"], ["b", "c"])

    def test_boards_normalize_and_skip(self) -> None:
        lever = discover("lever", "exampleco", fixture("lever.json"))
        self.assertEqual([job.job_id for job in lever.jobs], ["lever:exampleco:lev-1"])
        self.assertEqual(lever.jobs[0].fields["preferred"], ["Kubernetes"])
        self.assertTrue(lever.jobs[0].fields["source_updated_at"].startswith("2026-09"))
        self.assertEqual(lever.skipped[0]["reason"], "no requirement section found")
        green = discover("greenhouse", "exampleco", fixture("greenhouse.json"))
        self.assertEqual(green.jobs[0].fields["responsibilities"], ["Design agent runtimes"])
        self.assertEqual(green.skipped[0]["reason"], "duplicate job id")
        ashby = discover("ashby", "exampleco", fixture("ashby.json"))
        self.assertEqual(ashby.jobs[0].fields["compensation"], {"summary": "synthetic range"})
        self.assertEqual(ashby.jobs[0].fields["application_system"], "ashby")
        bad = discover("lever", "x", [{"id": "1", "text": "", "lists": [{"text": "Requirements", "content": "<li>Python</li>"}]}])
        self.assertIn("role", bad.skipped[0]["reason"])

    def test_payload_and_endpoint_validation(self) -> None:
        for kind, payload in (("lever", {}), ("greenhouse", []), ("ashby", {"jobs": 1})):
            with self.subTest(kind=kind), self.assertRaises(CareerError):
                discover(kind, "b", payload)
        with self.assertRaises(CareerError):
            endpoint("workday", "b")
        with self.assertRaises(CareerError):
            endpoint("lever", "../etc")
        self.assertIn("api.lever.co", endpoint("lever", "acme"))

    def test_fetch_is_allow_listed_and_bounded(self) -> None:
        url = endpoint("greenhouse", "acme")
        with patch("urllib.request.urlopen", return_value=_Response(b'{"jobs": []}')):
            self.assertEqual(fetch_json(url), {"jobs": []})
        with patch("urllib.request.urlopen", return_value=_Response(b"not json")), self.assertRaises(CareerError):
            fetch_json(url)
        with patch("apps.career.sources.MAX_BYTES", 3), \
                patch("urllib.request.urlopen", return_value=_Response(b"[1, 2]")), self.assertRaises(CareerError):
            fetch_json(url)
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("down")), self.assertRaises(CareerError):
            fetch_json(url)
        with self.assertRaises(CareerError):
            fetch_json("https://example.invalid/jobs")

    def test_diff(self) -> None:
        jobs = discover("lever", "exampleco", fixture("lever.json")).jobs
        previous = [{"job_id": jobs[0].job_id, "digest": "sha256:old"}, {"job_id": "gone", "digest": "x"}]
        self.assertEqual(diff_jobs(previous, jobs), {"added": [], "removed": ["gone"],
                                                     "changed": [jobs[0].job_id], "unchanged": []})
        self.assertEqual(diff_jobs([jobs[0].to_dict()], jobs)["unchanged"], [jobs[0].job_id])


class MissionTests(base.RepoCase):
    def test_verification_needs_a_different_reviewer(self) -> None:
        result = attribute_missions(fixture("missions.json"), ["u_person"])
        states = {item.ref: (item.participation.value, item.state.value) for item in result.evidence}
        self.assertEqual(states["evidence:e1"], ("PERSONALLY_OPERATED", "DECLARED"))
        self.assertEqual(states["suite_run:r1"], ("PERSONALLY_OPERATED", "VERIFIED"))
        self.assertEqual(states["suite_run:r2"], ("PERSONALLY_OPERATED", "DECLARED"))
        self.assertEqual(states["suite_run:r3"], ("REVIEWED", "OBSERVED"))
        self.assertNotIn("evidence:e3", states)
        self.assertEqual(result.source()["excluded"], 3)
        self.assertEqual(result.source()["unmapped"], 1)

    def test_passport_reaches_verified_through_missions(self) -> None:
        head, commits = read_git_history(self.repo)
        missions = attribute_missions(fixture("missions.json"), ["u_person"])
        passport = passport_from_history("human.test", attribute(commits, base.IDENTITY), [],
                                         as_of=base.AS_OF, head=head, missions=missions)
        entry = passport.entry("ci_cd")
        assert entry is not None
        self.assertIs(entry.state, ClaimState.VERIFIED)
        self.assertEqual(passport.sources[-1]["kind"], "buildanddo_missions")

    def test_rejections(self) -> None:
        for raw, people in (([], ["u"]), ({"missions": "x"}, ["u"]), ({"missions": [{"id": ""}]}, ["u"]),
                            ({}, [])):
            with self.subTest(raw=raw), self.assertRaises(CareerError):
                attribute_missions(raw, people)  # type: ignore[arg-type]


class PackageCase(base.RepoCase):
    def compiled(self, folder: Path, questions: list[dict[str, str]] | None = None,
                 stored: dict[str, Any] | None = None) -> dict[str, Any]:
        passport = self.passport()
        job = normalize_job(base.load_jobs()[0])
        dossier = build_dossier(evaluate(job, passport), passport)
        default = fixture("questions.json")["synthetic-staff-platform"]
        package = compile_application(job, dossier, passport, questions=default if questions is None else questions,
                                      stored_answers=stored)
        write_package(folder, package)
        return load_package(folder)


class PackageTests(PackageCase):
    def test_reload_and_tamper(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "p"
            package = self.compiled(folder)
            self.assertEqual(package["role"], "Staff Platform Engineer")
            self.assertEqual(package["application_system"], "lever")
            (folder / "cover_letter.txt").write_text("I invented Kubernetes.")
            with self.assertRaises(CareerError):
                load_package(folder)
            (folder / "manifest.json").write_text("[]")
            with self.assertRaises(CareerError):
                load_package(folder)
            with self.assertRaises(CareerError):
                load_package(Path(tmp) / "missing")


class OutcomeTests(PackageCase):
    def test_ledger_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            package = self.compiled(Path(tmp) / "p")
            ledger = Path(tmp) / "ledger.jsonl"
            event = record_applied(ledger, package, at="2026-09-22T10:00:00Z", recorded_by="human.test")
            app = event["application_id"]
            self.assertEqual(event["role_family"], "platform_sre")
            self.assertEqual(event["dossier_state"], "REAL_GAP")
            with self.assertRaises(CareerError):
                record_applied(ledger, package, at="2026-09-22T10:00:00Z", recorded_by="human.test")
            with self.assertRaises(CareerError):
                record_applied(ledger, package, at="2026-09-22T10:00:00Z", recorded_by=" ")
            record_stage(ledger, app, "screen", at="2026-09-23T10:00:00Z", recorded_by="human.test")
            for stage, who in (("response", "human.test"), ("hired", "human.test"), ("offer", "")):
                with self.subTest(stage=stage), self.assertRaises(CareerError):
                    record_stage(ledger, app, stage, at="2026-09-24T10:00:00Z", recorded_by=who)
            with self.assertRaises(CareerError):
                record_stage(ledger, "nope", "offer", at="2026-09-24T10:00:00Z", recorded_by="human.test")
            record_stage(ledger, app, "rejected", at="2026-09-25T10:00:00Z", recorded_by="human.test")
            with self.assertRaises(CareerError):
                record_stage(ledger, app, "offer", at="2026-09-26T10:00:00Z", recorded_by="human.test")
            summary = report(read_ledger(ledger))
            self.assertEqual(summary["funnel"], {"applied": 1, "response": 1, "screen": 1, "technical": 0, "offer": 0})
            self.assertEqual(summary["by_dimension"]["role_family"][0]["sample"], "insufficient")
            self.assertEqual(summary["reallocation"], [])
            ledger.write_text(ledger.read_text() + "\n[1]\n")
            with self.assertRaises(CareerError):
                read_ledger(ledger)
            ledger.write_text("{broken\n")
            with self.assertRaises(CareerError):
                read_ledger(ledger)

    def test_report_reallocates_only_adequate_samples(self) -> None:
        events: list[dict[str, Any]] = []
        for family, responses in (("architect", 6), ("platform_sre", 1), ("security", 5)):
            count = MIN_SAMPLE if family != "security" else MIN_SAMPLE - 1
            for index in range(count):
                app = f"{family}-{index}"
                events.append({"application_id": app, "stage": "applied", "role_family": family})
                if index < responses:
                    events.append({"application_id": app, "stage": "response"})
        events.append({"application_id": "orphan", "stage": "response"})
        summary = report(events)
        self.assertEqual(summary["reallocation"], ["architect", "platform_sre"])
        self.assertEqual(summary["applications"], 2 * MIN_SAMPLE + MIN_SAMPLE - 1)

    def test_role_family(self) -> None:
        self.assertEqual(role_family("Principal AI Infrastructure Engineer"), "ai_ml")
        self.assertEqual(role_family("Head of AI Systems"), "leadership")
        self.assertEqual(role_family("Maintainer"), "other")


class FillTests(PackageCase):
    def test_plan_blocks_on_human_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            package = self.compiled(Path(tmp) / "p", stored={"compensation": {"answer": "Open", "reusable": True}})
            profile = {"full_name": "Test Person", "email": "person@example.invalid", "github": " "}
            plan = plan_fill(package, fixture("form.json"), profile, AuthorityGrant())
            rows = {row["id"]: row for row in plan["fields"]}
            self.assertEqual(rows["f1"]["source"], "profile:full_name")
            self.assertEqual(rows["f3"]["value"], "resume_variant.md")
            self.assertEqual(rows["f4"]["status"], "REVIEW_DRAFT")
            self.assertEqual(rows["f5"]["status"], "REVIEW_DRAFT")
            self.assertEqual(rows["f6"]["status"], "HUMAN_REQUIRED")
            self.assertEqual(rows["f7"]["status"], "CONFIRM_STORED")
            self.assertEqual(rows["f8"]["status"], "HUMAN_REQUIRED")
            self.assertEqual(plan["blocking"], ["work_authorization", "compensation"])
            self.assertEqual(plan["fill"]["decision"], "DENIED")
            self.assertFalse(plan["executable"])
            grant = AuthorityGrant(max_tier=JobTier.J4_SUBMIT, approved_packages=frozenset({package["digest"]}))
            held = plan_fill(package, fixture("form.json"), profile, grant)
            self.assertEqual(held["fill"]["decision"], Decision.HUMAN_REQUIRED.value)
            simple = {"fields": [{"id": "a", "label": "Email", "required": True}]}
            ready = plan_fill(package, simple, profile, grant)
            self.assertTrue(ready["executable"])
            self.assertEqual(ready["submit"]["decision"], "ALLOWED")
            stopped = plan_fill(package, simple, profile, grant, challenge_present=True)
            self.assertEqual(stopped["fill"]["decision"], "STOP_FOR_HUMAN_CHALLENGE")
            for form in ({}, {"fields": []}, {"fields": [{"id": "x"}]}):
                with self.subTest(form=form), self.assertRaises(CareerError):
                    plan_fill(package, form, profile, grant)

    def test_grants(self) -> None:
        self.assertIs(grant_from_dict(None).max_tier, JobTier.J2_PACKAGE)
        grant = grant_from_dict({"max_tier": "J4_SUBMIT", "approved_sites": ["lever"]})
        self.assertEqual(grant.approved_sites, frozenset({"lever"}))
        for raw in ([], {"max_tier": "J9"}, {"approved_packages": "x"}):
            with self.subTest(raw=raw), self.assertRaises(CareerError):
                grant_from_dict(raw)


class SliceCliTests(PackageCase):
    def run_cli(self, *args: str) -> tuple[int, dict[str, Any]]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(args))
        return code, json.loads(out.getvalue() or err.getvalue())

    def test_discover(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base_dir = Path(tmp)
            code, result = self.run_cli("discover", "--source", "lever", "--board", "exampleco",
                                        "--payload", str(FIX / "lever.json"), "--output", str(base_dir / "a"))
            self.assertEqual((code, result["jobs"], len(result["skipped"])), (0, 1, 1))
            code, result = self.run_cli("discover", "--source", "lever", "--board", "exampleco",
                                        "--payload", str(FIX / "lever.json"), "--output", str(base_dir / "b"),
                                        "--previous", str(base_dir / "a/jobs.json"))
            self.assertEqual(result["diff"]["unchanged"], ["lever:exampleco:lev-1"])
            code, result = self.run_cli("discover", "--source", "ashby", "--board", "x", "--output", str(base_dir / "c"))
            self.assertEqual(code, 1)
            self.assertIn("--allow-network", str(result["error"]))
            with patch("apps.career.cli.fetch_json", return_value=fixture("ashby.json")) as fetched:
                code, result = self.run_cli("discover", "--source", "ashby", "--board", "x", "--allow-network",
                                            "--output", str(base_dir / "d"))
            self.assertEqual((code, result["jobs"]), (0, 1))
            fetched.assert_called_once_with("https://api.ashbyhq.com/posting-api/job-board/x?includeCompensation=true")

    def test_passport_missions_outcome_and_fill(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base_dir = Path(tmp)
            identity = base_dir / "identity.json"
            identity.write_text(json.dumps({"person_id": "human.test", "person_emails": [base.PERSON],
                                            "agent_emails": [base.AGENT], "person_user_ids": ["u_person"]}))
            code, result = self.run_cli("passport", "--repo", str(self.repo), "--identity", str(identity),
                                        "--missions", str(FIX / "missions.json"), "--output", str(base_dir / "pp"))
            self.assertEqual(code, 0, result)
            self.assertEqual(result["capabilities"]["ci_cd"]["state"], "VERIFIED")
            identity.write_text(json.dumps({"person_id": "h", "person_emails": [base.PERSON], "person_user_ids": "u"}))
            code, _ = self.run_cli("passport", "--repo", str(self.repo), "--identity", str(identity),
                                   "--missions", str(FIX / "missions.json"), "--output", str(base_dir / "pp2"))
            self.assertEqual(code, 1)
            self.compiled(base_dir / "pkg")
            ledger = str(base_dir / "ledger.jsonl")
            code, result = self.run_cli("outcome", "applied", "--ledger", ledger, "--package-dir", str(base_dir / "pkg"),
                                        "--at", "2026-09-22T00:00:00Z", "--recorded-by", "human.test")
            self.assertEqual(code, 0, result)
            app = result["event"]["application_id"]
            code, _ = self.run_cli("outcome", "response", "--ledger", ledger, "--application-id", app,
                                   "--at", "2026-09-23T00:00:00Z", "--recorded-by", "human.test")
            self.assertEqual(code, 0)
            code, result = self.run_cli("outcome", "report", "--ledger", ledger)
            self.assertEqual(result["funnel"]["response"], 1)
            for args in (("applied", "--at", "2026-09-22T00:00:00Z", "--recorded-by", "h"),
                         ("response", "--at", "2026-09-22T00:00:00Z", "--recorded-by", "h"),
                         ("response",)):
                code, _ = self.run_cli("outcome", *args, "--ledger", ledger)
                self.assertEqual(code, 1)
            grant = base_dir / "grant.json"
            grant.write_text(json.dumps({"max_tier": "J3_FILL"}))
            profile = base_dir / "profile.json"
            profile.write_text(json.dumps({"email": "person@example.invalid"}))
            code, result = self.run_cli("fill-plan", "--package-dir", str(base_dir / "pkg"), "--form", str(FIX / "form.json"),
                                        "--profile", str(profile), "--grant", str(grant), "--output", str(base_dir / "fp"))
            self.assertEqual(code, 0, result)
            self.assertEqual(result["fill"]["decision"], "HUMAN_REQUIRED")
            self.assertTrue((base_dir / "fp/fill_plan.json").exists())
            code, result = self.run_cli("fill-plan", "--package-dir", str(base_dir / "pkg"), "--form", str(FIX / "form.json"),
                                        "--output", str(base_dir / "fp2"))
            self.assertEqual(result["fill"]["decision"], "DENIED")
            profile.write_text("[]")
            code, _ = self.run_cli("fill-plan", "--package-dir", str(base_dir / "pkg"), "--form", str(FIX / "form.json"),
                                   "--profile", str(profile), "--output", str(base_dir / "fp3"))
            self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
