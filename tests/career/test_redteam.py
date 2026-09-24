# ─── CGRF Header ──────────────────────────────
# File:        tests/career/test_redteam.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career, tests/career/test_career.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/career/history.py; VALIDATES apps/career/jobs.py; VALIDATES apps/career/authority.py; VALIDATES apps/career/outcomes.py; VALIDATES apps/career/verify.py
# DAG Node:    none
# Intent:      Keep every adversarial failure found against the engine as a regression test: laundered agent work, bot identities, misread requirements, forged passports and edited ledgers.
# ─────────────────────────────────────────────────────────────

"""Adversarial cases that the first two slices got wrong."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from apps.career import CareerError, Participation, normalize_job
from apps.career.authority import reserved_class
from apps.career.history import Identity, attribute, read_git_history
from apps.career.jobs import RequirementKind, classify, extract_requirements
from apps.career.outcomes import read_ledger, record_stage
from apps.career.taxonomy import capabilities_for_text
from tests.career import test_career as base


class LaunderingTests(unittest.TestCase):
    """R1/R2: agent work must not become personal authorship."""

    def test_agent_coauthored_commit_is_not_sole_authorship(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            base.git(repo, "init", "-q", "-b", "main")
            sha = base.commit(repo, "scripts/ci/x.py",
                              "ci(ci): gate\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
                              email=base.PERSON, when="2026-09-01T00:00:00+00:00")
            _, commits = read_git_history(repo)
            result = attribute(commits, base.IDENTITY)
            kinds = {item.participation for item in result.evidence if item.ref == sha}
            self.assertEqual(kinds, {Participation.AGENT_ASSISTED})
            self.assertEqual(result.agent_assisted, 1)

    def test_person_cannot_declare_a_bot_identity_as_themselves(self) -> None:
        for email in ("263423550+datadog-bits@users.noreply.github.com",
                      "49699333+dependabot[bot]@users.noreply.github.com", "noreply@anthropic.com"):
            with self.subTest(email=email), self.assertRaises(CareerError):
                Identity("p", frozenset({email}))

    def test_undeclared_bot_author_is_treated_as_agent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            base.git(repo, "init", "-q", "-b", "main")
            base.commit(repo, "a.py", "feat(web): a", email=base.PERSON, when="2026-09-01T00:00:00+00:00")
            base.git(repo, "checkout", "-q", "-b", "bot")
            base.commit(repo, "b.py", "chore: bump", email="renovate[bot]@users.noreply.github.com",
                        when="2026-09-02T00:00:00+00:00")
            base.git(repo, "checkout", "-q", "main")
            base.git(repo, "merge", "-q", "--no-ff", "bot", "-m", "m", email=base.PERSON,
                     when="2026-09-03T00:00:00+00:00")
            _, commits = read_git_history(repo)
            result = attribute(commits, Identity("p", frozenset({base.PERSON})))
            self.assertEqual(result.agent_integrated, 1)


class RequirementTests(unittest.TestCase):
    """R3-R8: requirement text must not be misread in the candidate's favour."""

    def test_race_condition_is_engineering_not_demographics(self) -> None:
        self.assertIsNone(reserved_class("Debug race conditions in distributed systems"))
        self.assertEqual(reserved_class("Race / ethnicity (optional)"), "demographic")

    def test_worded_and_ranged_tenure_is_still_tenure(self) -> None:
        for text, years in (("Five years of Python", 5), ("A decade of Python experience", 10),
                            ("5-7 years of Python", 5), ("3 to 5 yrs Python", 3), ("Python", None)):
            with self.subTest(text=text):
                item = classify("R1", text, True)
                self.assertEqual(item.years, years)
                if years is not None:
                    self.assertIs(item.kind, RequirementKind.TENURE)

    def test_age_and_export_control_are_reserved(self) -> None:
        self.assertEqual(reserved_class("Are you at least 18 years of age?"), "age")
        self.assertEqual(reserved_class("What is your date of birth?"), "age")
        self.assertEqual(reserved_class("Are you a U.S. person under ITAR?"), "export_control")

    def test_common_words_do_not_invent_capabilities(self) -> None:
        self.assertEqual(capabilities_for_text("Work with the rest of the team"), ())
        self.assertEqual(capabilities_for_text("Follow our privacy policy"), ())
        self.assertIn("backend_api", capabilities_for_text("Design REST APIs"))

    def test_negated_requirement_is_not_required(self) -> None:
        job = normalize_job({"job_id": "j", "company": "c", "role": "r", "source": "s",
                             "requirements": ["Python", "No Kubernetes experience required"]})
        texts = [item.text for item in extract_requirements(job)]
        self.assertEqual(texts, ["Python"])


class IntegrityTests(base.RepoCase):
    """R9/R10: records a third party relies on must be tamper-evident."""

    def test_edited_ledger_line_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ledger = Path(tmp) / "ledger.jsonl"
            from tests.career.test_slice2 import PackageCase  # reuse the compiled-package helper

            helper = PackageCase("setUp")
            helper.repo, helper.shas = self.repo, self.shas
            package = helper.compiled(Path(tmp) / "p")
            from apps.career.outcomes import record_applied

            event = record_applied(ledger, package, at="2026-09-22T00:00:00Z", recorded_by="human.test")
            record_stage(ledger, event["application_id"], "response", at="2026-09-23T00:00:00Z",
                         recorded_by="human.test")
            lines = ledger.read_text().splitlines()
            forged = json.loads(lines[1])
            forged["stage"] = "offer"
            ledger.write_text(lines[0] + "\n" + json.dumps(forged, sort_keys=True) + "\n")
            with self.assertRaises(CareerError):
                read_ledger(ledger)

    def test_forged_passport_fails_repository_verification(self) -> None:
        from apps.career.verify import verify_passport

        passport = self.passport().to_dict()
        entry = passport["capabilities"][0]
        entry["evidence"][0]["participation"] = "PERSONALLY_IMPLEMENTED"
        entry["evidence"][0]["ref"] = self.shas["agent_merged"]
        passport["sources"][0]["authored"] += 40
        body = {key: value for key, value in passport.items() if key != "digest"}
        from apps.career.evidence import canonical_digest

        passport["digest"] = canonical_digest(body)  # an attacker can always recompute the digest
        result = verify_passport(passport, self.repo, base.IDENTITY)
        self.assertEqual(result["state"], "MISMATCH")

    def test_genuine_passport_verifies_and_cli_reports(self) -> None:
        import contextlib
        import io

        from apps.career.cli import main
        from apps.career.verify import render_card, verify_passport

        passport = self.passport()
        result = verify_passport(passport.to_dict(), self.repo, base.IDENTITY)
        self.assertEqual(result["state"], "VERIFIED_AGAINST_REPOSITORY", result["mismatches"])
        self.assertGreater(result["checked_commit_refs"], 0)
        other = Identity("someone.else", frozenset({base.PERSON}), frozenset({base.AGENT, base.OTHER}))
        raw = passport.to_dict()
        raw["sources"][0]["identity_digest"] = base.IDENTITY.digest()
        body = {key: value for key, value in raw.items() if key != "digest"}
        from apps.career.evidence import canonical_digest

        raw["digest"] = canonical_digest(body)
        mismatch = verify_passport(raw, self.repo, other)
        self.assertTrue(any("identity file" in item for item in mismatch["mismatches"]))
        self.assertTrue(any("person_id" in item for item in mismatch["mismatches"]))
        no_git = {**raw, "sources": []}
        no_git["digest"] = canonical_digest({key: value for key, value in no_git.items() if key != "digest"})
        with self.assertRaises(CareerError):
            verify_passport(no_git, self.repo, base.IDENTITY)
        self.assertIn("Check it yourself", render_card(passport))
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            identity = folder / "identity.json"
            identity.write_text(json.dumps({"person_id": "human.test", "person_emails": [base.PERSON],
                                            "agent_emails": [base.AGENT]}))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["passport", "--repo", str(self.repo), "--identity", str(identity),
                                       "--output", str(folder / "p")]), 0)
            self.assertTrue((folder / "p/passport_card.md").exists())
            args = ["verify", "--passport", str(folder / "p/passport.json"), "--repo", str(self.repo),
                    "--identity", str(identity)]
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(args), 0)
            forged = json.loads((folder / "p/passport.json").read_text())
            forged["sources"][0]["authored"] += 1
            forged["digest"] = canonical_digest({key: value for key, value in forged.items() if key != "digest"})
            (folder / "p/passport.json").write_text(json.dumps(forged))
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(args), 2)

    def test_option_like_revision_is_rejected(self) -> None:
        with self.assertRaises(CareerError):
            read_git_history(self.repo, rev="--all")


if __name__ == "__main__":
    unittest.main()
