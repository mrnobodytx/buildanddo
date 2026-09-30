# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_work_contracts.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/evolution/work.py, libs/evolution/work_exchange.py, tests/upgrade/test_work_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/work.py; VALIDATES libs/evolution/work_exchange.py; CONSUMES tests/upgrade/test_work_support.py
# Intent:      Reject authority expansion, scope substitution and self-certified work while preserving incomplete and failed attempts.
# ───────────────────────────────────────────────────────────────

"""Exercise strict work contracts and the existing receiving-pinned review boundary."""

from dataclasses import replace
from datetime import timedelta
from pathlib import Path
import tempfile
import unittest

from libs.evolution.common import digest
from libs.evolution.work import (
    AcceptanceCheck,
    CodeHostIdentity,
    WorkContract,
    WorkSource,
    WorkResult,
    WorkCheck,
    WorkSubmission,
    WorkerIdentity,
    relative_path,
)
from libs.evolution.work_exchange import assess_result
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from tests.upgrade.test_work_support import (
    ACTOR,
    CANDIDATE,
    NOW,
    at,
    pinned_review,
    submission,
    work,
)


class WorkContractTests(unittest.TestCase):
    def test_strict_round_trip_and_schema_cover_both_directions_and_all_lanes(
        self,
    ) -> None:
        for producer, consumer in (
            ("buildanddo", "citadel-nexus"),
            ("citadel-nexus", "buildanddo"),
        ):
            for lane in ("development", "experience", "research", "operations"):
                value = work(producer=producer, consumer=consumer, lane=lane)
                self.assertEqual(value, WorkContract.from_json(value.to_json()))
                self.assertEqual(value.authority, "candidate_only")
        schema = WorkContract.json_schema()["$defs"]["WorkContract"]
        self.assertFalse(schema["additionalProperties"])
        self.assertIn("schema", schema["required"])
        self.assertEqual(schema["properties"]["schema"]["enum"], ["buildanddo.work/v1"])

    def test_unknown_versions_authority_and_fields_are_rejected(self) -> None:
        for changes in (
            {"schema": "buildanddo.work/v2"},
            {"authority": "production"},
            {"approved": True},
            {"visibility": "private"},
            {"consumer": "buildanddo"},
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                WorkContract.from_dict(work().to_dict() | changes)
        value = work().to_dict()
        del value["schema"]
        with self.assertRaises(ContractError):
            WorkContract.from_dict(value)

    def test_path_rules_deny_escapes_glob_ambiguity_and_private_boundaries(
        self,
    ) -> None:
        for path in (
            "../private",
            "/tmp/x",
            "apps//file",
            "apps/./file",
            "apps\\file",
            "apps/%2e%2e/file",
            "**",
            "apps/*",
            "apps/[xy]",
        ):
            with self.subTest(path=path), self.assertRaises(ContractError):
                relative_path(path, rule=True)
        for path in (
            "private/**",
            "state/**",
            "scripts/deploy/**",
            ".git/**",
            "apps/.env",
            "apps/credentials.json",
        ):
            with self.subTest(path=path), self.assertRaises(ContractError):
                work(allowed_paths=(path,))

    def test_forbidden_rules_win_and_prefix_lookalikes_cannot_escape(self) -> None:
        value = work(forbidden_paths=("apps/fixture/protected/**",))
        value.require_paths(("apps/fixture/module.py",))
        for paths in (
            ("apps/fixture/protected/x.py",),
            ("apps/fixture2/x.py",),
            ("apps/fixture/.env.local",),
            ("apps/fixture/x.py", "apps/fixture/x.py"),
        ):
            with self.subTest(paths=paths), self.assertRaises(ContractError):
                value.require_paths(paths)
        with self.assertRaises(ContractError):
            work(
                allowed_paths=("apps/fixture/protected/**",),
                forbidden_paths=("apps/fixture/**",),
            )

    def test_work_requires_named_acceptance_source_and_bounded_capabilities(
        self,
    ) -> None:
        cases = (
            {"source": WorkSource("fixture/public", "c" * 40)},
            {"objective": "Changed objective"},
            {"scope_id": "another/workspace"},
        )
        for changes in cases:
            self.assertNotEqual(work().digest, work(**changes).digest)
        for changes in (
            {"allowed_paths": ()},
            {"required_capabilities": ()},
            {"required_capabilities": ("python", "python")},
            {"evidence_required": ("test",)},
            {"acceptance": ()},
            {"srs": "SRS;run"},
            {"dispatch": "deploy-now"},
            {"objective": "instructions\nnext"},
            {"created_at": at(0).replace(tzinfo=None)},
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                work(**changes)
        with self.assertRaises(ContractError):
            WorkSource("https://example.invalid/private", "main")
        with self.assertRaises(ContractError):
            AcceptanceCheck("Run shell!", "No executable commands are inferred.")

    def test_aliases_are_stable_declared_provider_ids_and_never_permissions(
        self,
    ) -> None:
        identity = WorkerIdentity(
            SemanticId("cni://guildmaster/fixture"),
            "agent",
            (CodeHostIdentity("github", "12", "guild-worker"),),
        )
        self.assertEqual(identity.identity_status, "declared")
        for changes in (
            {"identity_status": "authenticated"},
            {"actor_type": "administrator"},
            {"accounts": [identity.accounts[0].to_dict()] * 2},
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                WorkerIdentity.from_dict(identity.to_dict() | changes)
        for account in ("name-only", "0", "01", "-1"):
            with self.assertRaises(ContractError):
                CodeHostIdentity("gitlab", account, "fixture")


class WorkAdmissionTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.value = submission(self.root)
        self.receipt, self.policy = pinned_review(self.value)

    def assess(self, value=None, **changes):
        options = dict(
            expected_work=self.value.work,
            candidate=CANDIDATE,
            evidence_root=self.root,
            at=NOW,
        )
        options.update(changes)
        return assess_result(value or self.value, **options)

    def test_reported_pass_and_hashes_only_make_a_review_candidate(self) -> None:
        value = self.assess()
        self.assertEqual(value.state, "READY_FOR_REVIEW")
        self.assertIsNone(value.review_digest)
        self.assertFalse(value.production_authority)
        self.assertEqual(self.value, WorkSubmission.from_json(self.value.to_json()))
        self.assertEqual(
            self.value.result, WorkResult.from_json(self.value.result.to_json())
        )

    def test_separately_pinned_review_covers_exact_work_and_every_required_source(
        self,
    ) -> None:
        value = self.assess(verification=self.receipt, policy=self.policy)
        self.assertEqual(value.state, "REVIEWED_PASS")
        self.assertFalse(value.production_authority)
        self.assertEqual(value.review_digest, digest(self.receipt))

    def test_unpinned_or_untrusted_reviews_cannot_certify(self) -> None:
        policies = (
            None,
            replace(self.policy, receipt_digests=()),
            replace(self.policy, verifiers=(SemanticId("cni://verifier/other"),)),
            replace(self.policy, policy_version="other"),
        )
        for policy in policies:
            with self.subTest(policy=policy), self.assertRaises(ContractError):
                self.assess(verification=self.receipt, policy=policy)

    def test_expected_work_candidate_and_receiving_time_are_independent_inputs(
        self,
    ) -> None:
        for changes in (
            {"expected_work": replace(self.value.work, objective="Another task")},
            {"candidate": "c" * 40},
            {"candidate": "main"},
            {"at": at(9)},
            {"at": NOW.replace(tzinfo=None)},
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                self.assess(**changes)

    def test_foreign_scope_mission_repository_or_base_cannot_bind(self) -> None:
        for changes in (
            {"mission_id": "other"},
            {"scope_id": "foreign/workspace"},
            {"source": WorkSource("other/public", "a" * 40)},
            {"source": WorkSource("fixture/public", "c" * 40)},
            {"work_digest": "d" * 64},
            {"changed_paths": ("apps/unrelated/code.py",)},
            {"started_at": at(-1)},
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                WorkSubmission(self.value.work, replace(self.value.result, **changes))

    def test_missing_deployment_or_runtime_stays_hold_even_when_source_passes(
        self,
    ) -> None:
        contract = replace(
            self.value.work,
            evidence_required=("commit", "test", "artifact", "deployment", "runtime"),
        )
        value = WorkSubmission(
            contract, replace(self.value.result, work_digest=contract.digest)
        )
        result = self.assess(value, expected_work=contract)
        self.assertEqual(result.state, "HOLD")
        self.assertEqual(result.missing, ("evidence:deployment", "evidence:runtime"))
        receipt, policy = pinned_review(value)
        with self.assertRaises(ContractError):
            self.assess(
                value, expected_work=contract, verification=receipt, policy=policy
            )

    def test_uncited_evidence_skips_missing_checks_and_failures_cannot_pass(
        self,
    ) -> None:
        for checks in (
            (),
            (WorkCheck("regression", "SKIP", ()),),
            (WorkCheck("regression", "MISSING", ()),),
            (WorkCheck("regression", "PASS", ("tests.txt",)),),
        ):
            value = replace(
                self.value, result=replace(self.value.result, checks=checks)
            )
            self.assertEqual(self.assess(value).state, "HOLD")
        failed = replace(
            self.value,
            result=replace(
                self.value.result,
                checks=(WorkCheck("regression", "FAIL", ("tests.txt",)),),
            ),
        )
        self.assertEqual(self.assess(failed).state, "REPORTED_FAIL")

    def test_fail_cancel_hold_and_rollback_remain_retained_reports(self) -> None:
        for status, expected in (
            ("FAIL", "REPORTED_FAIL"),
            ("CANCELLED", "REPORTED_CANCELLED"),
            ("HOLD", "HOLD"),
            ("ROLLED_BACK", "REPORTED_ROLLED_BACK"),
        ):
            value = replace(
                self.value, result=replace(self.value.result, status=status)
            )
            self.assertEqual(self.assess(value).state, expected)
            receipt, policy = pinned_review(value)
            with self.assertRaises(ContractError):
                self.assess(value, verification=receipt, policy=policy)

    def test_changed_result_or_receipt_cannot_inherit_a_pin(self) -> None:
        changed = replace(
            self.value, result=replace(self.value.result, attempt_id="attempt-2")
        )
        with self.assertRaises(ContractError):
            self.assess(changed, verification=self.receipt, policy=self.policy)
        changed_receipt = replace(
            self.receipt, receipt_id=SemanticId("cni://receipt/changed")
        )
        with self.assertRaises(ContractError):
            self.assess(verification=changed_receipt, policy=self.policy)

    def test_worker_and_all_contributors_and_evidence_authors_cannot_self_review(
        self,
    ) -> None:
        participant = SemanticId("cni://agent/fixture-reviewer")
        variants = (
            replace(self.value.result, contributors=(participant,)),
            replace(
                self.value.result,
                evidence=tuple(
                    replace(e, author=participant) for e in self.value.result.evidence
                ),
            ),
        )
        for result in variants:
            value = WorkSubmission(self.value.work, result)
            receipt, policy = pinned_review(value)
            receipt = replace(
                receipt, result=replace(receipt.result, verifier_id=participant)
            )
            policy = replace(
                policy,
                verifiers=(participant,),
                receipt_digests=(ContentDigest(digest(receipt)),),
            )
            with self.assertRaisesRegex(ContractError, "contributor"):
                self.assess(value, verification=receipt, policy=policy)
        with self.assertRaises(ContractError):
            replace(self.receipt.result, verifier_id=ACTOR)

    def test_review_cannot_precede_completion_or_outlive_receiving_policy(self) -> None:
        with self.assertRaises(ContractError):
            self.assess(
                verification=self.receipt,
                policy=self.policy,
                at=NOW + timedelta(days=8),
            )
        premature = replace(
            self.receipt,
            result=replace(
                self.receipt.result,
                evaluated_at=at(40),
                evidence=tuple(
                    replace(e, observed_at=at(40)) for e in self.receipt.result.evidence
                ),
            ),
        )
        policy = replace(
            self.policy, receipt_digests=(ContentDigest(digest(premature)),)
        )
        with self.assertRaises(ContractError):
            self.assess(verification=premature, policy=policy)

    def test_result_types_bounds_timestamps_duplicates_and_unknown_checks_reject(
        self,
    ) -> None:
        evidence = self.value.result.evidence[0]
        for changes in (
            {"size": True},
            {"size": 0},
            {"size": 16 * 1024 * 1024 + 1},
            {"sha256": "wrong"},
            {"path": "../private"},
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                replace(evidence, **changes)
        for changes in (
            {"evidence": self.value.result.evidence * 2},
            {"evidence": (replace(evidence, observed_at=at(11)),)},
            {"checks": (WorkCheck("regression", "PASS", ("missing",)),)},
            {"completed_at": at(0)},
            {"contributors": (ACTOR, ACTOR)},
        ):
            with self.subTest(changes=changes), self.assertRaises(ContractError):
                replace(self.value.result, **changes)
        with self.assertRaises(ContractError):
            replace(
                self.value,
                result=replace(
                    self.value.result, checks=(WorkCheck("unexpected", "SKIP", ()),)
                ),
            )
        with self.assertRaises(ContractError):
            WorkCheck("regression", "PASS", ())


if __name__ == "__main__":
    unittest.main()
