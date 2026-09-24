# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_capability_token_records.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/economics.py, libs/capability_tokens/passport.py, libs/capability_tokens/registry.py, libs/capability_tokens/sharing.py, libs/evolution/common.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/vocabulary.py, tests/upgrade/test_capability_token_support.py, tests/upgrade/test_evolution_support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON libs/capability_tokens/economics.py; DEPENDS_ON libs/capability_tokens/passport.py; DEPENDS_ON libs/capability_tokens/registry.py; DEPENDS_ON libs/capability_tokens/sharing.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/vocabulary.py; DEPENDS_ON tests/upgrade/test_capability_token_support.py; DEPENDS_ON tests/upgrade/test_evolution_support.py
# Intent:      Reject cross-tenant learning, duplicate metering, unsupported verification and unbalanced settlement.
# ───────────────────────────────────────────────────────────────

"""Test outcome metering, private sharing and conserved economic estimates."""

import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from libs.capability_tokens.economics import Adjustment, ReviewedAdjustment, settlement
from libs.capability_tokens.passport import (
    CallObservation,
    MeteredCall,
    passport,
    validated_calls,
    publish_passport,
)
from libs.capability_tokens.registry import FederatedIndex, Registry
from libs.capability_tokens.sharing import (
    GeneralizedPattern,
    SharingDraft,
    export_pattern,
    prepare_sharing,
)
from libs.evolution.common import digest
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.vocabulary import AuthorityTier, RelationPredicate
from tests.upgrade.test_capability_token_support import (
    ACTOR,
    SCOPE,
    at,
    bundle,
    trust,
    verification,
)
from tests.upgrade.test_evolution_support import episode


def call(b, key="one", outcome="SUCCEEDED", cost=5, verified=True):
    """Capture explicitly synthetic execution and independent outcome review."""
    impl = b.token.implementation("graph-v1")
    obs = CallObservation(
        scope_id=SCOPE,
        call_id=key,
        binding=b.token.binding("graph-v1"),
        actor_id=SemanticId("cni://agent/requester"),
        executor_id=ACTOR,
        authority=AuthorityTier.A2,
        input_digest=ContentDigest("a" * 64),
        result_digest=ContentDigest(digest((key, outcome))),
        source_sha=impl.source_sha,
        sbom_digest=impl.sbom_digest,
        environment="synthetic",
        started_at=at(400),
        finished_at=at(402),
        outcome=outcome,
        currency="USD",
        cost_minor=cost,
        failure_class="provider" if outcome == "FAILED" else None,
    )
    receipt = (
        verification(
            obs.subject,
            (str(obs.observation_id),),
            when=at(403),
            checks=("call.outcome", "call.safety", "call.contract"),
        )
        if verified
        else None
    )
    return MeteredCall(obs, receipt)


class PassportTests(unittest.TestCase):
    def test_reviewed_passport_survives_later_federation_generations(self):
        measured = passport(
            self.b, "graph-v1", self.calls, self.policy, scope_id=SCOPE, at=at(410)
        )
        receipt = verification(
            measured.subject,
            (str(measured.report_id),),
            when=at(411),
            tier=AuthorityTier.A3,
            checks=(
                "passport.measurements",
                "passport.privacy",
                "passport.publication",
            ),
        )
        published = publish_passport(measured, receipt, trust(receipt), at=at(412))
        wrong = replace(published, passport=replace(measured, currency="EUR"))
        with self.assertRaisesRegex(ContractError, "compatibility"):
            FederatedIndex("citadel", 1, at(413), (self.b,), passports=(wrong,))
        wrong = replace(
            published,
            passport=replace(
                measured,
                binding=replace(
                    measured.binding, implementation_digest=ContentDigest("f" * 64)
                ),
            ),
        )
        with self.assertRaisesRegex(ContractError, "implementation"):
            FederatedIndex("citadel", 1, at(413), (self.b,), passports=(wrong,))
        with (
            tempfile.TemporaryDirectory() as tmp,
            Registry(Path(tmp) / "registry.sqlite", SCOPE) as reg,
        ):
            first = FederatedIndex(
                "citadel", 1, at(413), (self.b,), passports=(published,)
            )
            reg.import_index(
                first, publisher="citadel", expected_digest=first.root, at=at(414)
            )
            second = FederatedIndex(
                "citadel",
                2,
                at(415),
                (),
                revoked=(self.b.token.pin,),
                previous_digest=first.root,
            )
            reg.import_index(
                second, publisher="citadel", expected_digest=second.root, at=at(416)
            )
            self.assertEqual(
                reg.search("import")[0]["published_passports"], [published.to_dict()]
            )
        with self.assertRaisesRegex(ContractError, "expired"):
            publish_passport(measured, receipt, trust(receipt), at=at(472))

    def setUp(self):
        self.b = bundle()
        self.calls = (
            call(self.b),
            call(self.b, "reported", verified=False, cost=None),
            call(self.b, "failed", outcome="FAILED", cost=7),
        )
        self.policy = trust(*(c.verification for c in self.calls if c.verification))

    def test_counts_verified_outcomes_and_missing_costs_honestly(self):
        p = passport(
            self.b, "graph-v1", self.calls, self.policy, scope_id=SCOPE, at=at(410)
        )
        data = p.summary()
        self.assertEqual(
            (p.calls, p.reported_successes, p.reviewed_calls, p.verified_successes),
            (3, 2, 2, 1),
        )
        self.assertEqual(p.failure_classes, {"provider": 1})
        self.assertEqual(data["verified_success_rate"]["value"], 0.5)
        self.assertEqual(data["unknown_outcomes"], 1)
        self.assertEqual(p.cost_observations, 2)
        self.assertIsNone(data["complete_cost_minor"])
        self.assertEqual(data["mean_latency_ms"], 2000)
        self.assertLess(data["verified_success_rate"]["wilson_95"][0], 0.5)
        empty = passport(
            self.b, "graph-v1", (), self.policy, scope_id=SCOPE, at=at(410)
        )
        self.assertIsNone(empty.summary()["verified_success_rate"]["value"])
        self.assertIsNone(empty.summary()["mean_latency_ms"])

    def test_deduplicate_retries_and_add_late_review_without_double_count(self):
        observed = replace(self.calls[0], verification=None)
        for values in (
            (observed, self.calls[0], observed),
            (self.calls[0], observed, self.calls[0]),
        ):
            selected = validated_calls(
                self.b, "graph-v1", values, self.policy, scope_id=SCOPE, at=at(410)
            )
            self.assertEqual(selected, (self.calls[0],))
        conflicting = replace(
            observed, observation=replace(observed.observation, cost_minor=999)
        )
        with self.assertRaisesRegex(ContractError, "conflicting retry"):
            validated_calls(
                self.b,
                "graph-v1",
                (observed, conflicting),
                self.policy,
                scope_id=SCOPE,
                at=at(410),
            )

    def test_cross_tenant_implementation_source_currency_and_time_fail_closed(self):
        original = self.calls[1]
        for obs in (
            replace(original.observation, scope_id="foreign"),
            replace(
                original.observation,
                binding=bundle(version="2.0.0").token.binding("graph-v1"),
            ),
            replace(original.observation, source_sha="e" * 40),
            replace(original.observation, currency="EUR"),
            replace(original.observation, finished_at=at(900)),
            replace(original.observation, authority=AuthorityTier.A3),
        ):
            with self.assertRaises(ContractError):
                passport(
                    self.b,
                    "graph-v1",
                    (MeteredCall(obs),),
                    self.policy,
                    scope_id=SCOPE,
                    at=at(410),
                )
        with self.assertRaises(ContractError):
            passport(
                self.b,
                "graph-v1",
                self.calls,
                replace(self.policy, receipt_digests=()),
                scope_id=SCOPE,
                at=at(410),
            )
        with self.assertRaises(ContractError):
            replace(original.observation, cost_minor=-1)

    def test_review_cannot_certify_uncertain_result_or_its_producer(self):
        uncertain = call(self.b, outcome="HOLD", verified=True)
        with self.assertRaisesRegex(ContractError, "uncertain"):
            passport(
                self.b,
                "graph-v1",
                (uncertain,),
                trust(uncertain.verification),
                scope_id=SCOPE,
                at=at(410),
            )
        original = self.calls[1].observation
        bad = verification(
            original.subject,
            (str(original.observation_id),),
            when=at(403),
            checks=("call.outcome", "call.safety", "call.contract"),
            actor=SemanticId("cni://agent/different-producer"),
        )
        with self.assertRaisesRegex(ContractError, "independent"):
            passport(
                self.b,
                "graph-v1",
                (MeteredCall(original, bad),),
                trust(bad),
                scope_id=SCOPE,
                at=at(410),
            )

    def test_journal_metering_retains_counts_across_reopen_and_rejects_conflicts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "registry.sqlite"
            index = FederatedIndex("citadel", 1, at(390), (self.b,))
            with Registry(path, SCOPE) as reg:
                reg.import_index(
                    index, publisher="citadel", expected_digest=index.root, at=at(390)
                )
                reg.meter(self.b, "graph-v1", self.calls, self.policy, at=at(410))
                reg.meter(self.b, "graph-v1", self.calls, self.policy, at=at(411))
                self.assertEqual(len(reg.entries()), 2)
            with Registry(path, SCOPE) as reg:
                self.assertEqual(len(reg.metered(self.b.token.binding("graph-v1"))), 3)
                bad = replace(
                    self.calls[1],
                    observation=replace(self.calls[1].observation, cost_minor=0),
                )
                with self.assertRaises(ContractError):
                    reg.meter(self.b, "graph-v1", (bad,), self.policy, at=at(412))


class EconomicsTests(unittest.TestCase):
    def setUp(self):
        self.b = bundle()
        self.calls = (
            call(self.b),
            call(self.b, "unverified", cost=3, verified=False),
            call(self.b, "failure", outcome="FAILED", cost=7),
        )
        self.policy = trust(*(c.verification for c in self.calls if c.verification))

    def test_integer_royalties_conserve_amount_without_inventing_revenue(self):
        result = settlement(
            self.b,
            "graph-v1",
            self.calls * 2,
            (),
            self.policy,
            scope_id=SCOPE,
            at=at(410),
        )
        self.assertEqual(result["verified_units"], 1)
        self.assertEqual(result["gross_minor"], 101)
        self.assertEqual(
            sum(result["creator_royalties_minor"].values()) + result["retained_minor"],
            101,
        )
        self.assertEqual(result["retained_minor"], 35)
        self.assertEqual(result["complete_cost_minor"], 15)
        self.assertEqual(result["operator_profit_minor"], 20)
        self.assertIsNone(result["actual_revenue_minor"])
        self.assertEqual(
            result,
            settlement(
                self.b,
                "graph-v1",
                tuple(reversed(self.calls)),
                (),
                self.policy,
                scope_id=SCOPE,
                at=at(410),
            ),
        )

    def adjustment(self, amount=20, key="refund-1", call_id="one"):
        adj = Adjustment(
            key,
            SCOPE,
            self.b.token.binding("graph-v1"),
            call_id,
            amount,
            "USD",
            at(410),
            "refund",
        )
        receipt = verification(
            adj.subject,
            (str(adj.source_id),),
            when=at(411),
            checks=("settlement.adjustment",),
        )
        return ReviewedAdjustment(adj, receipt)

    def test_reviewed_refunds_are_deduplicated_and_bounded(self):
        adj = self.adjustment()
        policy = replace(
            self.policy,
            receipt_digests=self.policy.receipt_digests
            + trust(adj.verification).receipt_digests,
        )
        r = settlement(
            self.b,
            "graph-v1",
            self.calls,
            (adj, adj),
            policy,
            scope_id=SCOPE,
            at=at(412),
        )
        self.assertEqual(
            (r["gross_minor"], r["refund_minor"], r["net_minor"]), (101, 20, 81)
        )
        self.assertEqual(
            sum(r["creator_royalties_minor"].values()) + r["retained_minor"], 81
        )
        excessive = self.adjustment(amount=102)
        for bad in (excessive, self.adjustment(call_id="unverified")):
            p = replace(
                self.policy,
                receipt_digests=self.policy.receipt_digests
                + trust(bad.verification).receipt_digests,
            )
            with self.assertRaises(ContractError):
                settlement(
                    self.b,
                    "graph-v1",
                    self.calls,
                    (bad,),
                    p,
                    scope_id=SCOPE,
                    at=at(412),
                )
        with self.assertRaises(ContractError):
            settlement(
                self.b,
                "graph-v1",
                self.calls,
                (adj,),
                self.policy,
                scope_id=SCOPE,
                at=at(412),
            )

    def test_unknown_cost_or_no_verified_results_never_becomes_profit(self):
        values = (
            replace(
                self.calls[1],
                observation=replace(self.calls[1].observation, cost_minor=None),
            ),
        )
        r = settlement(
            self.b, "graph-v1", values, (), self.policy, scope_id=SCOPE, at=at(410)
        )
        self.assertEqual(r["verified_units"], 0)
        self.assertIsNone(r["operator_profit_minor"])
        self.assertFalse(r["cost_per_verified_result"]["measured"])
        self.assertEqual(r["gross_minor"], 0)


class SharingTests(unittest.TestCase):
    def pattern(self):
        return GeneralizedPattern(
            "python_imports",
            "module_missing",
            "restore_package_boundary",
            (RelationPredicate.DEPENDS_ON,),
            ("imports",),
        )

    def test_projection_requires_scoped_consent_and_exports_no_private_context(self):
        draft = prepare_sharing(
            (episode(0), episode(1)), self.pattern(), scope_id=SCOPE, at=at(400)
        )
        receipt = verification(
            draft.subject,
            (str(draft.draft_id),),
            when=at(401),
            tier=AuthorityTier.A3,
            checks=("sharing.consent", "sharing.privacy", "sharing.generalization"),
        )
        public = export_pattern(
            draft, receipt, trust(receipt), scope_id=SCOPE, at=at(402)
        )
        wire = public.to_json()
        for private in (
            SCOPE,
            draft.source_episodes[0],
            draft.source_root.value,
            "module.path",
            "source_episodes",
            "source_root",
            "scope_id",
        ):
            self.assertNotIn(private, wire)
        self.assertEqual(public.pattern.state, "HYPOTHESIS")
        with self.assertRaisesRegex(ContractError, "expired"):
            export_pattern(draft, receipt, trust(receipt), scope_id=SCOPE, at=at(462))
        self.assertIn("hypothesis", str(public.subject.semantic_id))
        with self.assertRaises(ContractError):
            export_pattern(
                draft, receipt, trust(receipt), scope_id="other-tenant", at=at(402)
            )
        with self.assertRaises(ContractError):
            export_pattern(
                draft,
                receipt,
                replace(trust(receipt), receipt_digests=()),
                scope_id=SCOPE,
                at=at(402),
            )
        changed = replace(draft, source_root=ContentDigest("d" * 64))
        with self.assertRaises(ContractError):
            export_pattern(changed, receipt, trust(receipt), scope_id=SCOPE, at=at(402))

    def test_free_text_unknown_fields_incomplete_or_future_sources_fail(self):
        data = self.pattern().to_dict()
        for patch_data in (
            {"strategy": "customer secret"},
            {"tenant": "private"},
            {"state": "VERIFIED"},
            {"symptom": "revision_mismatch"},
        ):
            with self.assertRaises(ContractError):
                GeneralizedPattern.from_dict({**data, **patch_data})
        for episodes in (
            (episode(0),),
            (episode(0), episode(1, typed=False)),
            (episode(0), episode(0)),
        ):
            with self.assertRaises(ContractError):
                prepare_sharing(episodes, self.pattern(), scope_id=SCOPE, at=at(400))
        with self.assertRaises(ContractError):
            prepare_sharing(
                (episode(0), episode(1)), self.pattern(), scope_id=SCOPE, at=at(1)
            )
        with self.assertRaises(ContractError):
            prepare_sharing(
                (episode(0), episode(1)), self.pattern(), scope_id="other", at=at(400)
            )

    def test_missing_privacy_check_and_insufficient_authority_block_export(self):
        draft = prepare_sharing(
            (episode(0), episode(1)), self.pattern(), scope_id=SCOPE, at=at(400)
        )
        for tier, checks in (
            (
                AuthorityTier.A2,
                ("sharing.consent", "sharing.privacy", "sharing.generalization"),
            ),
            (AuthorityTier.A3, ("sharing.consent",)),
        ):
            receipt = verification(
                draft.subject,
                (str(draft.draft_id),),
                when=at(401),
                tier=tier,
                checks=checks,
            )
            with self.assertRaises(ContractError):
                export_pattern(
                    draft, receipt, trust(receipt), scope_id=SCOPE, at=at(402)
                )
        self.assertEqual(SharingDraft.from_json(draft.to_json()), draft)


if __name__ == "__main__":
    unittest.main()
