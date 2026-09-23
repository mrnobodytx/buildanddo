# ─── CGRF Header ──────────────────────────────
# File:        tests/career/test_assessments.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/imports.py, apps/career/assessments.py, apps/career/ledger.py, tests/career/test_career.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/career/imports.py; VALIDATES apps/career/assessments.py; VALIDATES apps/career/ledger.py; VALIDATES apps/career/cli.py
# DAG Node:    none
# Intent:      Prove imported claims stay self-reported until assessed, and that assessments are hidden-key, limited, timed and re-gradable.
# ─────────────────────────────────────────────────────────────

"""Exercise platform imports and capability assessments."""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.career import CareerError, ClaimState, Participation, build_dossier, evaluate, normalize_job
from apps.career.assessments import (
    MAX_ATTEMPTS,
    assessment_evidence,
    grade_attempt,
    issue_attempt,
    load_bank,
    pending,
    regrade,
)
from apps.career.cli import main
from apps.career.imports import (
    build_inventory,
    employment_months,
    import_evidence,
    load_inventory,
    month_of,
    read_json_resume,
    read_linkedin,
    read_open_badges,
    recipient_matches,
)
from apps.career.ledger import read_chain
from apps.career.match import Coverage
from apps.career.passport import build_passport
from tests.career import test_career as base

FIX = base.FIXTURES
NOW = datetime(2026, 9, 22, tzinfo=timezone.utc)
EMAILS = frozenset({base.PERSON})


def bank() -> dict[str, Any]:
    return load_bank(json.loads((FIX / "bank.json").read_text()))


def correct_responses(form: dict[str, Any], raw_bank: dict[str, Any], wrong: int = 0) -> dict[str, list[int]]:
    """Answer a form from the grader's side; the first ``wrong`` items are answered wrongly."""
    answers: dict[str, list[int]] = {}
    for index, item in enumerate(form["items"]):
        source = raw_bank["items"][item["item_id"]]
        right = sorted(item["choices"].index(source["choices"][i]) for i in source["answer"])
        if index < wrong:
            right = [next(i for i in range(len(item["choices"])) if [i] != right)]
        answers[item["item_id"]] = right
    return answers


class ImportTests(unittest.TestCase):
    def test_linkedin_claims_are_self_reported_and_endorsements_do_not_count(self) -> None:
        inventory = build_inventory("human.test", "linkedin", read_linkedin(FIX / "linkedin", NOW), NOW)
        self.assertEqual(inventory["declared_employment_months"], 105)
        summary, evidence = import_evidence(load_inventory(inventory))
        self.assertEqual(summary["unmapped"], 1)
        self.assertTrue(all(item.state is ClaimState.DECLARED for item in evidence))
        self.assertTrue(all(item.participation is Participation.SELF_REPORTED for item in evidence))
        passport = build_passport("human.test", evidence, as_of=NOW, sources=[summary])
        entry = passport.entry("kubernetes")
        assert entry is not None
        self.assertEqual(entry.claim_verb, "Reports experience with")
        job = normalize_job({"job_id": "j", "company": "c", "role": "r", "source": "s",
                             "requirements": ["Kubernetes", "10+ years of engineering experience"]})
        coverage = evaluate(job, passport)
        self.assertIs(coverage.rows[0].status, Coverage.PARTIAL)
        self.assertIs(coverage.rows[1].status, Coverage.NOT_PROVEN)
        self.assertIn("declares 8 years 9 months", coverage.rows[1].note)
        self.assertEqual(build_dossier(coverage, passport).body["strong_evidence"], [])

    def test_tampered_inventory_and_bad_inputs(self) -> None:
        inventory = build_inventory("human.test", "jsonresume",
                                    read_json_resume(json.loads((FIX / "resume.json").read_text()), NOW), NOW)
        inventory["claims"][0]["capabilities"].append("kubernetes")
        with self.assertRaises(CareerError):
            load_inventory(inventory)
        for raw in ([], {"schema": "x"}):
            with self.subTest(raw=raw), self.assertRaises(CareerError):
                load_inventory(raw)
        cases = [
            lambda: read_linkedin(FIX / "missing", NOW),
            lambda: read_json_resume([], NOW),
            lambda: read_json_resume({}, NOW),
            lambda: read_json_resume({"skills": [{"name": " "}]}, NOW),
            lambda: build_inventory("p", "myspace", [], NOW),
            lambda: month_of("someday"),
            lambda: read_open_badges([{"type": "Badge"}], EMAILS, NOW),
            lambda: recipient_matches({"hashed": True, "identity": "md5$abc"}, EMAILS),
        ]
        for case in cases:
            with self.assertRaises(CareerError):
                case()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(CareerError):
                read_linkedin(Path(tmp), NOW)
            (Path(tmp) / "Skills.csv").write_text("Wrong\nx\n")
            with self.assertRaises(CareerError):
                read_linkedin(Path(tmp), NOW)

    def test_badges_bind_to_the_recipient(self) -> None:
        raw = json.loads((FIX / "badge.json").read_text())
        claims = read_open_badges(raw, EMAILS, NOW)
        self.assertEqual([item["recipient_match"] for item in claims], [True, None])
        self.assertEqual(claims[0]["issuer"], "Example Academy")
        with self.assertRaises(CareerError):
            read_open_badges(raw, frozenset({"someone@example.invalid"}), NOW)
        self.assertTrue(recipient_matches({"type": "email", "identity": base.PERSON}, EMAILS))

    def test_dates_and_employment(self) -> None:
        self.assertEqual(month_of("2020"), (2020, 1))
        self.assertIsNone(month_of(""))
        self.assertEqual(employment_months([("", "2020"), ("2020-01", "2020-12")], NOW), 12)
        self.assertEqual(employment_months([], NOW), 0)


class AssessmentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.ledger = Path(self.tmp.name) / "assess.jsonl"
        self.bank = bank()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def issue(self, at: str = "2026-09-22T10:00:00Z", capability: str = "ci_cd") -> dict[str, Any]:
        return issue_attempt(self.bank, self.ledger, person_id="human.test", capability=capability,
                             seed="s", at=at)

    def test_form_hides_answers_and_pass_is_observed_until_proctored(self) -> None:
        form = self.issue()
        self.assertEqual(len(form["items"]), 5)
        self.assertNotIn("answer", json.dumps(form))
        grade_attempt(self.bank, self.ledger, attempt_id=form["attempt_id"],
                      responses=correct_responses(form, self.bank), at="2026-09-22T10:10:00Z")
        proctored = self.issue(at="2026-09-22T11:00:00Z")
        grade_attempt(self.bank, self.ledger, attempt_id=proctored["attempt_id"],
                      responses=correct_responses(proctored, self.bank, wrong=1), at="2026-09-22T11:10:00Z",
                      proctor_id="proctor.a", proctor_receipt="session-42")
        summary, evidence = assessment_evidence(read_chain(self.ledger), "human.test")
        self.assertEqual([item.state for item in evidence], [ClaimState.OBSERVED, ClaimState.VERIFIED])
        self.assertEqual((summary["passed"], summary["proctored_passes"]), (2, 1))
        self.assertEqual(regrade(self.bank, read_chain(self.ledger))["state"], "PASS")

    def test_failures_late_submissions_and_limits_are_recorded(self) -> None:
        low = self.issue()
        result = grade_attempt(self.bank, self.ledger, attempt_id=low["attempt_id"],
                               responses=correct_responses(low, self.bank, wrong=2), at="2026-09-22T10:05:00Z")
        self.assertFalse(result["passed"])
        late = self.issue(at="2026-09-22T12:00:00Z")
        result = grade_attempt(self.bank, self.ledger, attempt_id=late["attempt_id"],
                               responses=correct_responses(late, self.bank), at="2026-09-22T13:00:00Z")
        self.assertEqual((result["passed"], result["within_time"], result["score"]), (False, False, 1.0))
        self.issue(at="2026-09-22T14:00:00Z")
        with self.assertRaises(CareerError):
            self.issue(at="2026-09-23T10:00:00Z")
        self.assertEqual(MAX_ATTEMPTS, 3)
        self.issue(at="2026-10-30T10:00:00Z")
        summary, evidence = assessment_evidence(read_chain(self.ledger), "human.test")
        self.assertEqual((summary["failed"], summary["issued_ungraded"], evidence), (2, 2, []))

    def test_grading_rules(self) -> None:
        form = self.issue()
        attempt = form["attempt_id"]
        good = correct_responses(form, self.bank)
        cases = [
            dict(attempt_id="A-missing", responses=good),
            dict(attempt_id=attempt, responses=good, proctor_id="human.test", proctor_receipt="r"),
            dict(attempt_id=attempt, responses=good, proctor_id="p"),
            dict(attempt_id=attempt, responses={}),
            dict(attempt_id=attempt, responses=[]),
            dict(attempt_id=attempt, responses={**good, next(iter(good)): [9]}),
        ]
        for case in cases:
            with self.subTest(case=str(case)[:50]), self.assertRaises(CareerError):
                grade_attempt(self.bank, self.ledger, at="2026-09-22T10:05:00Z", **case)  # type: ignore[arg-type]
        single = {key: (value[0] if len(value) == 1 else value) for key, value in good.items()}
        grade_attempt(self.bank, self.ledger, attempt_id=attempt, responses=single, at="2026-09-22T10:05:00Z")
        with self.assertRaises(CareerError):
            grade_attempt(self.bank, self.ledger, attempt_id=attempt, responses=good, at="2026-09-22T10:06:00Z")
        changed = json.loads((FIX / "bank.json").read_text())
        changed["items"][0]["answer"] = [1]
        other = load_bank(changed)
        second = self.issue(at="2026-09-22T11:00:00Z")
        with self.assertRaises(CareerError):
            grade_attempt(other, self.ledger, attempt_id=second["attempt_id"], responses={}, at="2026-09-22T11:01:00Z")
        report = regrade(other, read_chain(self.ledger))
        self.assertEqual(report["graded_against_other_banks"], 1)

    def test_regrade_catches_a_forged_pass(self) -> None:
        form = self.issue()
        grade_attempt(self.bank, self.ledger, attempt_id=form["attempt_id"],
                      responses=correct_responses(form, self.bank, wrong=3), at="2026-09-22T10:05:00Z")
        events = read_chain(self.ledger)
        events[-1] = {**events[-1], "correct": 5, "passed": True}
        self.assertEqual(regrade(self.bank, events)["state"], "MISMATCH")
        orphan = [{**events[-1], "attempt_id": "A-x"}]
        self.assertIn("without an issued", regrade(self.bank, orphan)["mismatches"][0])
        with self.assertRaises(CareerError):
            self.ledger.write_text(self.ledger.read_text().replace('"correct": 2', '"correct": 5'))
            read_chain(self.ledger)

    def test_issue_and_bank_rules(self) -> None:
        with self.assertRaises(CareerError):
            self.issue(capability="kubernetes")
        with self.assertRaises(CareerError):
            issue_attempt(self.bank, self.ledger, person_id=" ", capability="ci_cd", seed="s", at="2026-09-22T10:00:00Z")
        item = {"id": "x", "capability": "python", "prompt": "q", "choices": ["a", "b"], "answer": [0]}
        bad = [
            {}, {"bank_id": "b", "items": [item, item]}, {"bank_id": "b", "items": [{**item, "capability": "flink"}]},
            {"bank_id": "b", "items": [{**item, "prompt": ""}]}, {"bank_id": "b", "items": [{**item, "choices": ["a", "a"]}]},
            {"bank_id": "b", "items": [{**item, "answer": [0, 1]}]}, {"bank_id": "b", "items": [{**item, "answer": [5]}]},
        ]
        for raw in bad:
            with self.subTest(raw=str(raw)[:40]), self.assertRaises(CareerError):
                load_bank(raw)

    def test_pending_links_imports_to_assessments(self) -> None:
        inventory = build_inventory("human.test", "linkedin", read_linkedin(FIX / "linkedin", NOW), NOW)
        form = self.issue()
        grade_attempt(self.bank, self.ledger, attempt_id=form["attempt_id"],
                      responses=correct_responses(form, self.bank), at="2026-09-22T10:05:00Z")
        py = self.issue(capability="python", at="2026-09-22T10:10:00Z")
        grade_attempt(self.bank, self.ledger, attempt_id=py["attempt_id"],
                      responses=correct_responses(py, self.bank, wrong=4), at="2026-09-22T10:15:00Z",
                      proctor_id="proctor.a", proctor_receipt="r")
        rows = {row["capability"]: row["status"] for row in pending(inventory, self.bank, read_chain(self.ledger))}
        self.assertEqual(rows, {"ci_cd": "PASSED_UNPROCTORED", "distributed_systems": "NO_ASSESSMENT_AVAILABLE",
                                "kubernetes": "NO_ASSESSMENT_AVAILABLE", "observability": "NO_ASSESSMENT_AVAILABLE",
                                "python": "FAILED"})
        form = self.issue(at="2026-09-22T11:00:00Z")
        grade_attempt(self.bank, self.ledger, attempt_id=form["attempt_id"],
                      responses=correct_responses(form, self.bank), at="2026-09-22T11:05:00Z",
                      proctor_id="proctor.a", proctor_receipt="r2")
        rows = {row["capability"]: row["status"] for row in pending(inventory, self.bank, read_chain(self.ledger))}
        self.assertEqual(rows["ci_cd"], "VERIFIED")
        other = build_inventory("human.test", "jsonresume",
                                read_json_resume(json.loads((FIX / "resume.json").read_text()), NOW), NOW)
        self.assertEqual({row["status"] for row in pending(other, self.bank, [])},
                         {"NOT_TAKEN", "NO_ASSESSMENT_AVAILABLE"})


class ImportCliTests(base.RepoCase):
    def run_cli(self, *args: str) -> tuple[int, dict[str, Any]]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(args))
        return code, json.loads(out.getvalue() or err.getvalue())

    def test_import_assess_passport_verify(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            identity = root / "identity.json"
            identity.write_text(json.dumps({"person_id": "human.test", "person_emails": [base.PERSON],
                                            "agent_emails": [base.AGENT]}))
            common = ("--identity", str(identity), "--as-of", "2026-09-22T00:00:00Z")
            for platform, path in (("linkedin", FIX / "linkedin"), ("jsonresume", FIX / "resume.json"),
                                   ("openbadge", FIX / "badge.json")):
                code, result = self.run_cli("import", "--platform", platform, "--path", str(path),
                                            "--output", str(root / platform), *common)
                self.assertEqual((code, result["claim_state"]), (0, "DECLARED"), result)
            imports = str(root / "linkedin/imported_claims.json")
            ledger, bank_path = str(root / "assess.jsonl"), str(FIX / "bank.json")
            code, result = self.run_cli("assess", "issue", "--bank", bank_path, "--ledger", ledger,
                                        "--capability", "ci_cd", "--person-id", "human.test", "--seed", "x",
                                        "--output", str(root / "form"), "--at", "2026-09-22T10:00:00Z")
            self.assertEqual(code, 0, result)
            form = json.loads((root / "form/form.json").read_text())
            responses = root / "responses.json"
            responses.write_text(json.dumps(correct_responses(form, bank())))
            code, result = self.run_cli("assess", "grade", "--bank", bank_path, "--ledger", ledger,
                                        "--attempt-id", form["attempt_id"], "--responses", str(responses),
                                        "--at", "2026-09-22T10:05:00Z", "--proctor-id", "proctor.a",
                                        "--proctor-receipt", "session-1")
            self.assertEqual((code, result["passed"]), (0, True), result)
            code, result = self.run_cli("assess", "pending", "--bank", bank_path, "--ledger", ledger,
                                        "--imports", imports)
            self.assertIn({"VERIFIED"}, [{row["status"]} for row in result["pending"] if row["capability"] == "ci_cd"])
            code, result = self.run_cli("assess", "regrade", "--bank", bank_path, "--ledger", ledger)
            self.assertEqual(result["state"], "PASS")
            code, result = self.run_cli("passport", "--repo", str(self.repo), *common, "--imports", imports,
                                        "--assessments", ledger, "--output", str(root / "pp"))
            self.assertEqual(code, 0, result)
            self.assertEqual(result["capabilities"]["kubernetes"]["participation"], "SELF_REPORTED")
            self.assertEqual(result["capabilities"]["ci_cd"]["state"], "VERIFIED")
            verify = ("verify", "--passport", str(root / "pp/passport.json"), "--repo", str(self.repo),
                      "--identity", str(identity))
            code, result = self.run_cli(*verify, "--bank", bank_path, "--assessments", ledger)
            self.assertEqual((code, result["state"]), (0, "VERIFIED_AGAINST_REPOSITORY"), result)
            self.assertEqual(result["assessments"]["checked"], 1)
            events = read_chain(Path(ledger))
            forged = json.loads(json.dumps(events[-1]))
            forged["correct"] = 0
            from apps.career.ledger import chain_digest

            forged["digest"] = chain_digest(forged)
            Path(ledger).write_text("".join(json.dumps(e, sort_keys=True) + "\n" for e in [*events[:-1], forged]))
            code, result = self.run_cli(*verify, "--bank", bank_path, "--assessments", ledger)
            self.assertEqual((code, result["state"]), (2, "MISMATCH"), result)
            failures = [
                ("verify", "--passport", str(root / "pp/passport.json"), "--repo", str(self.repo),
                 "--identity", str(identity), "--bank", bank_path),
                ("assess", "issue", "--bank", bank_path, "--ledger", ledger),
                ("assess", "pending", "--bank", bank_path, "--ledger", ledger),
                ("assess", "regrade", "--bank", bank_path),
            ]
            for args in failures:
                with self.subTest(args=args[:2]):
                    self.assertEqual(self.run_cli(*args)[0], 1)
            other = root / "other.json"
            other.write_text(json.dumps({"person_id": "someone", "person_emails": [base.PERSON]}))
            code, _ = self.run_cli("passport", "--repo", str(self.repo), "--identity", str(other),
                                   "--imports", imports, "--output", str(root / "pp2"))
            self.assertEqual(code, 1)
            code, result = self.run_cli("assess", "issue", "--bank", bank_path, "--ledger", str(root / "l2.jsonl"),
                                        "--capability", "python", "--person-id", "human.test",
                                        "--output", str(root / "form2"))
            self.assertEqual(code, 0, result)
            code, result = self.run_cli("assess", "grade", "--bank", bank_path, "--ledger", str(root / "l2.jsonl"),
                                        "--attempt-id", result["attempt_id"], "--responses", str(responses))
            self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
