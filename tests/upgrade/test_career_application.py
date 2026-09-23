# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_career_application.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/application.py, libs/career_passport/authority.py, tests/upgrade/test_career_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/career_passport/application.py; VALIDATES libs/career_passport/authority.py; CONSUMES tests/upgrade/test_career_support.py
# Intent:      Prove claim-only drafts, exact human consent, challenge stops and receipt-bound outcome transitions.
# ───────────────────────────────────────────────────────────────

"""Exercise application artifacts and governed browser plans without external writes."""

import hashlib
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from libs.career_passport.application import compile_application, resume_pdf
from libs.career_passport.authority import (
    Approval,
    Form,
    OutcomeEvent,
    browser_plan,
    outcome_summary,
)
from libs.career_passport.models import Participation
from libs.evolution.common import digest
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.merkle import ContentDigest
from tests.upgrade.test_career_support import PERSON, WORKSPACE, at, jobs, source, work


def application(**kwargs):
    bundle, policy = work(**kwargs)
    job = jobs()[0]
    return compile_application(
        job,
        bundle,
        PERSON,
        workspace=WORKSPACE,
        at=at(10),
        policy=policy,
        display_name="Synthetic Candidate",
    ), job


class ApplicationTests(unittest.TestCase):
    def test_six_artifacts_are_generated_with_claim_level_provenance(self):
        package, _ = application()
        self.assertEqual(
            set(package.files),
            {
                "resume_variant.pdf",
                "cover_letter.txt",
                "application_answers.json",
                "portfolio_manifest.json",
                "interview_brief.md",
                "evidence_manifest.json",
            },
        )
        manifest = json.loads(package.files["evidence_manifest.json"])
        self.assertEqual(
            manifest["claims"][0]["participation"], "PERSONALLY_IMPLEMENTED"
        )
        self.assertEqual(len(manifest["claims"][0]["review_sha256"]), 64)
        self.assertTrue(manifest["claims"][0]["evidence_refs"])

    def test_unsupported_requirement_never_appears_as_personal_prose(self):
        package, _ = application()
        for name in ("resume_variant.pdf", "cover_letter.txt"):
            self.assertNotIn(b"Flink", package.files[name])
            self.assertNotIn(b"distributed systems", package.files[name])
        self.assertIn(b"DO NOT CLAIM", package.files["interview_brief.md"])
        self.assertIn(b"Flink", package.files["interview_brief.md"])

    def test_no_unverified_personal_facts_means_no_package(self):
        bundle, _ = work()
        with self.assertRaises(ContractError):
            compile_application(
                jobs()[0], bundle, PERSON, workspace=WORKSPACE, at=at(10), policy=None
            )

    def test_reserved_answers_remain_null(self):
        package, _ = application()
        answers = json.loads(package.files["application_answers.json"])
        self.assertTrue(
            all(row["answer"] is None for row in answers["reserved"].values())
        )
        self.assertEqual(len(answers["reserved"]), 11)
        self.assertFalse(answers["submit_authorized"])

    def test_directed_work_is_not_rewritten_as_authored_code(self):
        bundle, policy = work(participation=Participation.DIRECTED)
        job = jobs(description="Requirements\nMust design Python systems.")[0]
        package = compile_application(
            job, bundle, PERSON, workspace=WORKSPACE, at=at(10), policy=policy
        )
        self.assertIn(b"Directed implementation", package.files["cover_letter.txt"])
        self.assertNotIn(b"Personally implemented", package.files["cover_letter.txt"])

    def test_package_bytes_and_hashes_are_deterministic(self):
        a, _ = application()
        b, _ = application()
        self.assertEqual(a.files, b.files)
        self.assertEqual(a.sha256, b.sha256)
        for name, raw in a.files.items():
            self.assertEqual(
                a.manifest()["files"][name]["sha256"], hashlib.sha256(raw).hexdigest()
            )

    def test_pdf_paginates_and_escapes_literal_text(self):
        raw = resume_pdf(tuple(["Synthetic (test) \\ claim"] * 100))
        self.assertTrue(raw.startswith(b"%PDF-1.4"))
        self.assertIn(b"/Count 3", raw)
        self.assertIn(b"\\(test\\)", raw)
        offset = int(raw.split(b"startxref\n")[1].splitlines()[0])
        self.assertEqual(raw[offset : offset + 4], b"xref")

    def test_pdf_does_not_silently_damage_unsupported_names(self):
        with self.assertRaises(ContractError):
            resume_pdf(("Synthetic \u4e2d\u6587 name",))

    def test_package_cannot_replace_previous_application(self):
        package, _ = application()
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "application"
            package.write(target)
            self.assertTrue((target / "resume_variant.pdf").is_file())
            with self.assertRaises(ContractError):
                package.write(target)

    def test_package_cannot_follow_a_symlinked_output_parent(self):
        package, _ = application()
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "real").mkdir()
            (root / "link").symlink_to(root / "real", target_is_directory=True)
            with self.assertRaises(ContractError):
                package.write(root / "link" / "private")
            self.assertFalse((root / "real/private").exists())


class AuthorityTests(unittest.TestCase):
    def setUp(self):
        self.package, self.job = application()
        self.form = Form(
            self.job.apply_url, {"work_auth": "Are you authorized to work?"}, at(11)
        )
        self.answers = {"work_auth": "Synthetic explicit human response"}
        self.approval = Approval(
            PERSON,
            PERSON,
            WORKSPACE,
            self.job.revision,
            ContentDigest(self.package.sha256),
            ContentDigest(digest(self.form)),
            ContentDigest(digest(self.answers)),
            "J4",
            at(12),
            at(100),
        )

    def plan(self, **changes):
        args = dict(
            approval=self.approval,
            authenticated_approvals=(ContentDigest(digest(self.approval)),),
            at=at(15),
            submit=True,
        )
        args.update(changes)
        return browser_plan(self.package, self.job, self.form, self.answers, **args)

    def test_human_approval_is_required_even_for_generated_package(self):
        self.assertEqual(self.plan(approval=None)["state"], "HUMAN_APPROVAL_REQUIRED")

    def test_self_asserted_approval_is_not_an_authenticated_receipt(self):
        with self.assertRaises(ContractError):
            self.plan(authenticated_approvals=())

    def test_approved_plan_does_not_claim_to_have_submitted(self):
        plan = self.plan()
        self.assertEqual(plan["state"], "READY_FOR_RECEIVING_BROWSER")
        self.assertFalse(plan["submitted"])

    def test_challenge_stops_without_any_actions(self):
        self.form = replace(self.form, challenge=True)
        plan = self.plan()
        self.assertEqual(plan["state"], "STOP_HUMAN_CHALLENGE")
        self.assertFalse(plan["actions"])

    def test_approval_cannot_follow_changed_form_or_answers(self):
        for field in ("answers", "form", "package"):
            with self.subTest(field=field):
                if field == "answers":
                    self.answers = {"work_auth": "Inferred response"}
                elif field == "form":
                    self.form = replace(
                        self.form, questions={"work_auth": "New binding attestation"}
                    )
                else:
                    self.package = replace(
                        self.package,
                        files={**self.package.files, "extra.txt": b"Changed"},
                    )
                with self.assertRaises(ContractError):
                    self.plan()

    def test_fill_approval_cannot_escalate_to_submission(self):
        approved = replace(self.approval, stage="J3")
        with self.assertRaises(ContractError):
            self.plan(
                approval=approved,
                authenticated_approvals=(ContentDigest(digest(approved)),),
            )

    def test_expiry_requires_new_human_decision(self):
        with self.assertRaises(ContractError):
            self.plan(at=at(101))

    def test_missing_even_unknown_questions_require_explicit_human_answer(self):
        self.answers = {}
        self.approval = replace(
            self.approval, answers_sha256=ContentDigest(digest(self.answers))
        )
        self.assertEqual(self.plan()["state"], "HUMAN_ANSWERS_REQUIRED")

    def test_job_or_recipient_change_invalidates_application(self):
        self.job = replace(self.job, role="Different role")
        with self.assertRaises(ContractError):
            self.plan()

    def test_inflight_submission_cannot_be_blindly_retried(self):
        event = OutcomeEvent(
            PERSON,
            WORKSPACE,
            self.job.id,
            ContentDigest(self.package.sha256),
            "submit_started",
            at(13),
            source(),
        )
        with self.assertRaises(ContractError):
            self.plan(
                prior_events=(event,),
                authenticated_events=(ContentDigest(digest(event)),),
            )


class OutcomeTests(unittest.TestCase):
    def event(self, kind, second=10):
        return OutcomeEvent(
            PERSON,
            WORKSPACE,
            "lever:synthetic:job",
            ContentDigest("b" * 64),
            kind,
            at(second),
            source(),
        )

    def summary(self, events):
        return outcome_summary(
            events,
            person=PERSON,
            workspace=WORKSPACE,
            at=at(100),
            authenticated_events=tuple(ContentDigest(digest(e)) for e in events),
        )

    def test_empty_history_does_not_invent_market_metrics(self):
        value = self.summary(())
        self.assertEqual(value["state"], "UNMEASURED")
        self.assertEqual(sum(value["counts"].values()), 0)

    def test_uncertain_submission_does_not_count_as_submitted(self):
        value = self.summary(
            (self.event("submit_started"), self.event("submit_unknown", 11))
        )
        self.assertEqual(value["counts"]["submitted"], 0)
        self.assertEqual(value["unknown_submissions"], 1)

    def test_real_chain_counts_each_outcome_once(self):
        events = tuple(
            self.event(kind, index + 10)
            for index, kind in enumerate(
                ("submit_started", "submitted", "response", "interview", "offer")
            )
        )
        self.assertEqual(
            self.summary(events)["counts"],
            {"submitted": 1, "response": 1, "interview": 1, "offer": 1},
        )

    def test_duplicate_fabricated_offer_or_retry_is_rejected(self):
        for events in (
            (self.event("offer"),),
            (self.event("submit_started"),) * 2,
            (
                self.event("submit_started"),
                self.event("submit_unknown", 11),
                self.event("submit_started", 12),
            ),
        ):
            with self.subTest(events=events), self.assertRaises(ContractError):
                self.summary(events)

    def test_outcome_json_cannot_authenticate_itself(self):
        with self.assertRaises(ContractError):
            outcome_summary(
                (self.event("submit_started"),),
                person=PERSON,
                workspace=WORKSPACE,
                at=at(100),
            )

    def test_foreign_event_is_not_counted(self):
        with self.assertRaises(ContractError):
            self.summary((replace(self.event("submit_started"), workspace="foreign"),))
