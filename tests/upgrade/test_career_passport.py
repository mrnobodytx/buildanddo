# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_career_passport.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/passport.py, libs/career_passport/matching.py, tests/upgrade/test_career_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/career_passport/passport.py; VALIDATES libs/career_passport/matching.py; CONSUMES tests/upgrade/test_career_support.py
# Intent:      Reject personal authorship laundering, self-review, changed evidence and false requirement equivalence.
# ───────────────────────────────────────────────────────────────

"""Exercise the career trust boundary with synthetic receipts and adversarial changes."""

import unittest
from dataclasses import replace

from libs.career_passport.matching import evaluate, shortlist
from libs.career_passport.models import (
    Artifact,
    Contribution,
    Participation,
    WorkBundle,
)
from libs.career_passport.passport import project_passport
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId
from tests.upgrade.test_career_support import PERSON, WORKSPACE, at, jobs, repin, work


class PassportTests(unittest.TestCase):
    def view(self, bundle, policy=None, when=None):
        return project_passport(
            bundle, PERSON, workspace=WORKSPACE, at=when or at(10), policy=policy
        )

    def test_verified_personal_claim_keeps_agent_assistance(self):
        bundle, policy = work()
        claim = self.view(bundle, policy).verified[0]
        self.assertIn("Personally implemented", claim.contribution.statement)
        self.assertIn("with agent assistance", claim.contribution.statement)
        self.assertEqual(claim.state, "VERIFIED")
        self.assertFalse(self.view(bundle, policy).to_dict()["authority_granted"])

    def test_missing_policy_cannot_promote_imported_receipt(self):
        bundle, _ = work()
        self.assertEqual(self.view(bundle).claims[0].state, "UNREVIEWED")
        self.assertFalse(self.view(bundle).verified)

    def test_unpinned_receipt_is_not_authenticated(self):
        bundle, policy = work()
        self.assertFalse(
            self.view(bundle, replace(policy, receipt_digests=())).verified
        )

    def test_agent_work_never_becomes_personal_authorship(self):
        bundle, policy = work(
            participation=Participation.AGENT_EXECUTED,
            person=SemanticId("cni://agent/synthetic"),
        )
        self.assertEqual(self.view(bundle, policy).claims[0].state, "NOT_PERSONAL")

    def test_foreign_person_is_not_included(self):
        bundle, policy = work(person=SemanticId("cni://person/someone-else"))
        self.assertFalse(self.view(bundle, policy).verified)

    def test_foreign_workspace_is_rejected(self):
        bundle, policy = work()
        with self.assertRaises(ContractError):
            project_passport(
                bundle, PERSON, workspace="foreign", at=at(10), policy=policy
            )

    def test_changed_contribution_loses_original_review(self):
        bundle, policy = work(participation=Participation.DIRECTED)
        changed = replace(
            bundle.contributions[0], participation=Participation.PERSONALLY_IMPLEMENTED
        )
        self.assertFalse(
            self.view(replace(bundle, contributions=(changed,)), policy).verified
        )

    def test_changed_bytes_cannot_retain_artifact_hash(self):
        bundle, _ = work()
        with self.assertRaises(ContractError):
            replace(bundle.artifacts[0], content="Changed result")

    def test_missing_work_evidence_cannot_support_claim(self):
        bundle, policy = work()
        self.assertEqual(
            self.view(replace(bundle, artifacts=()), policy).claims[0].state,
            "MISSING_EVIDENCE",
        )

    def test_personal_self_review_is_rejected(self):
        bundle, policy = work()
        receipt = bundle.reviews[0]
        changed = replace(receipt, result=replace(receipt.result, verifier_id=PERSON))
        bundle = replace(bundle, reviews=(changed,))
        policy = replace(repin(bundle, policy), verifiers=(PERSON,))
        self.assertEqual(self.view(bundle, policy).claims[0].state, "REVIEW_REJECTED")

    def test_missing_participation_check_cannot_verify(self):
        bundle, policy = work()
        receipt = bundle.reviews[0]
        changed = replace(
            receipt, result=replace(receipt.result, checks=receipt.result.checks[:1])
        )
        bundle = replace(bundle, reviews=(changed,))
        self.assertFalse(self.view(bundle, repin(bundle, policy)).verified)

    def test_recapture_does_not_renew_stale_verification(self):
        bundle, policy = work()
        later = at(8 * 86400)
        self.assertEqual(
            self.view(replace(bundle, captured_at=later), policy, later)
            .claims[0]
            .state,
            "STALE",
        )

    def test_unknown_agent_assistance_requires_review(self):
        bundle, policy = work()
        changed = replace(bundle.contributions[0], agent_assistance=None)
        # The old review also no longer binds this changed assertion.
        self.assertFalse(
            self.view(replace(bundle, contributions=(changed,)), policy).verified
        )

    def test_future_capture_is_not_current_evidence(self):
        bundle, policy = work()
        with self.assertRaises(ContractError):
            self.view(replace(bundle, captured_at=at(20)), policy)

    def test_closed_wire_contract_rejects_verified_and_authority_flags(self):
        bundle, _ = work()
        for cls, value in (
            (WorkBundle, bundle.to_dict()),
            (Contribution, bundle.contributions[0].to_dict()),
            (Artifact, bundle.artifacts[0].to_dict()),
        ):
            with self.subTest(cls=cls), self.assertRaises(ContractError):
                cls.from_dict({**value, "verified": True})

    def test_roundtrip_is_deterministic(self):
        bundle, policy = work()
        restored = WorkBundle.from_json(bundle.to_json())
        self.assertEqual(bundle, restored)
        self.assertEqual(
            self.view(bundle, policy).to_dict(), self.view(restored, policy).to_dict()
        )


class MatchTests(unittest.TestCase):
    def dossier(self, text, **kwargs):
        bundle, policy = work(**kwargs)
        passport = project_passport(
            bundle, PERSON, workspace=WORKSPACE, at=at(10), policy=policy
        )
        return evaluate(jobs(description=text)[0], passport)

    def test_requirement_map_preserves_supported_and_real_gap(self):
        view = self.dossier(
            "Requirements\nMust implement Python in production.\nMust know Kubernetes."
        )
        self.assertEqual([row.state for row in view.coverage], ["SUPPORTED", "GAP"])
        self.assertEqual(view.do_not_claim, ("Must know Kubernetes.",))
        self.assertEqual(view.state, "REVIEW_GAPS")

    def test_direction_does_not_satisfy_personal_implementation(self):
        view = self.dossier(
            "Requirements\nMust implement Python.", participation=Participation.DIRECTED
        )
        self.assertEqual(view.coverage[0].state, "GAP")

    def test_team_delivery_does_not_establish_individual_hands_on_work(self):
        view = self.dossier(
            "Requirements\nMust implement Python.",
            participation=Participation.TEAM_DELIVERED,
        )
        self.assertEqual(view.coverage[0].state, "GAP")

    def test_source_scope_cannot_satisfy_production_requirement(self):
        view = self.dossier(
            "Requirements\nMust implement Python in production.", scope=("source",)
        )
        self.assertEqual(view.coverage[0].state, "GAP")

    def test_years_legal_and_degree_requirements_stay_unproven(self):
        view = self.dossier(
            "Requirements\n10+ years of Python experience required.\nMust have work authorization.\nBachelor degree required."
        )
        self.assertEqual(
            [row.state for row in view.coverage],
            ["NOT_PROVEN", "HUMAN_INPUT", "NOT_PROVEN"],
        )
        self.assertEqual(view.to_dict()["hard_requirements"], "NOT_PROVEN")

    def test_compound_requirement_needs_every_capability(self):
        view = self.dossier("Requirements\nMust implement Python and Go.")
        self.assertEqual(view.coverage[0].state, "PARTIAL")
        self.assertTrue(view.do_not_claim)

    def test_ambiguous_alternative_requires_interpretation(self):
        view = self.dossier("Requirements\nMust use Python or Go.")
        self.assertEqual(view.coverage[0].state, "NEEDS_REVIEW")

    def test_unknown_clauses_cannot_disappear_from_dossier(self):
        view = self.dossier("Requirements\nMust know the Acme proprietary protocol.")
        self.assertEqual(view.coverage[0].state, "NEEDS_REVIEW")
        self.assertTrue(view.do_not_claim)

    def test_unknown_technology_or_expertise_qualifier_cannot_disappear(self):
        for text in (
            "Must implement Python and Java.",
            "Must have expert Python skills.",
            "Must use Python for 10000 requests per second.",
        ):
            with self.subTest(text=text):
                view = self.dossier("Requirements\n" + text)
                self.assertEqual(view.coverage[0].state, "NEEDS_REVIEW")

    def test_generic_capability_cannot_prove_a_specific_product(self):
        view = self.dossier(
            "Requirements\nMust use Datadog.", capabilities=("observability",)
        )
        self.assertEqual(view.coverage[0].state, "GAP")

    def test_verification_participation_can_support_explicit_review_work(self):
        view = self.dossier(
            "Requirements\nMust review Python systems.",
            participation=Participation.VERIFIED,
        )
        self.assertEqual(view.coverage[0].state, "SUPPORTED")

    def test_combined_design_and_implementation_requires_role_review(self):
        view = self.dossier("Requirements\nMust design and implement Python.")
        self.assertEqual(view.coverage[0].state, "NEEDS_REVIEW")

    def test_stale_job_is_not_shortlisted(self):
        bundle, policy = work()
        passport = project_passport(
            bundle, PERSON, workspace=WORKSPACE, at=at(10 * 86400), policy=policy
        )
        self.assertEqual(shortlist(jobs(), passport), ())

    def test_verified_leadership_can_support_architecture_requirement(self):
        view = self.dossier(
            "Requirements\nMust design distributed systems.",
            participation=Participation.DESIGNED,
            capabilities=("distributed_systems",),
        )
        self.assertEqual(view.state, "STRONG_CANDIDATE")

    def test_shortlist_is_stable_and_bounded_to_ten(self):
        bundle, policy = work()
        passport = project_passport(
            bundle, PERSON, workspace=WORKSPACE, at=at(10), policy=policy
        )
        a, b = (
            shortlist(jobs(100), passport),
            shortlist(tuple(reversed(jobs(100))), passport),
        )
        self.assertEqual(a, b)
        self.assertEqual(len(a), 10)

    def test_empty_required_set_never_means_strong_match(self):
        self.assertEqual(self.dossier("Preferred\nPython preferred.").state, "HOLD")
