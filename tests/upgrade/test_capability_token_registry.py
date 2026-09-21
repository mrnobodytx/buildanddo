# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_capability_token_registry.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/composition.py, libs/capability_tokens/conformance.py, libs/capability_tokens/models.py, libs/capability_tokens/registry.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/promotions.py, libs/semantic_twin/receipts.py, libs/semantic_twin/transactions.py, libs/semantic_twin/vocabulary.py, tests/upgrade/test_capability_token_support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON libs/capability_tokens/composition.py; DEPENDS_ON libs/capability_tokens/conformance.py; DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/registry.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/promotions.py; DEPENDS_ON libs/semantic_twin/receipts.py; DEPENDS_ON libs/semantic_twin/transactions.py; DEPENDS_ON libs/semantic_twin/vocabulary.py; DEPENDS_ON tests/upgrade/test_capability_token_support.py
# Intent:      Verify exact certification, pinned federation, revocation, authority and composition boundaries.
# ───────────────────────────────────────────────────────────────

"""Test conformance, federation and governed proposal use against exact synthetic evidence."""

import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from libs.capability_tokens.composition import CompositionStep, PortBinding, compose
from libs.capability_tokens.conformance import (
    Certification,
    check,
    certify,
    propose,
    input_features,
    draft_transaction,
)
from libs.capability_tokens.models import TokenBundle, TokenPin
from libs.capability_tokens.registry import FederatedIndex, Registry
from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest, SemanticRoot, SourceRoot
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.receipts import ActorType, EvidenceReference, EvidenceKind
from libs.semantic_twin.transactions import (
    ChangeContract,
    ChangeProposal,
    CompensationPlan,
    StateRoots,
)
from libs.semantic_twin.vocabulary import AuthorityTier, SemanticTransactionState
from tests.upgrade.test_capability_token_support import (
    SCOPE,
    ACTOR,
    VERIFIER,
    IMPORTER,
    at,
    bundle,
    certified,
    observation,
    schema,
    suite,
    trust,
    verification,
)


class ConformanceTests(unittest.TestCase):
    def test_token_enters_existing_draft_with_tools_compensation_and_authority_bound(
        self,
    ):
        b, obs = bundle(), observation()
        proposal = propose(b, "graph-v1", obs.features, obs, environment="synthetic")
        tx_id = SemanticId("cni://transaction/token-test")
        evidence = EvidenceReference(
            SemanticId("cni://evidence/token-test"),
            SubjectRef(tx_id, proposal.proposal_id.rsplit("/", 1)[-1]),
            EvidenceKind.OBSERVATION,
            SemanticId(proposal.proposal_id),
            at(301),
        )
        contract = ChangeContract(
            operation_id="token-test",
            correlation_id=obs.correlation_id,
            parent_op_id=None,
            objective_id=SemanticId("cni://objective/token-test"),
            mission_id=SemanticId("cni://mission/token-test"),
            actor_id=ACTOR,
            actor_type=ActorType.AGENT,
            executor_id=SemanticId("cni://agent/executor"),
            verifier_id=VERIFIER,
            authority_tier=AuthorityTier.A2,
            policy_version="fixture/1",
            target_ids=(IMPORTER,),
            tool_or_adapter="synthetic-fixture",
            requested_action=proposal.decision.requested_action,
            reason="Synthetic protocol test",
            input_evidence=(evidence,),
            preconditions=("source unchanged",),
            postconditions=("tests pass",),
            forbidden_side_effects=b.token.authority.forbidden_side_effects,
            rollback_or_compensation=CompensationPlan(
                b.token.rollback.operation, (IMPORTER,), b.token.rollback.postconditions
            ),
            expected_outputs=("receipt",),
            semantic_transaction_id=tx_id,
            source_sha=proposal.source_sha,
            context_root=proposal.context_root,
            requested_at=at(302),
        )
        target = obs.graph.resolve(str(IMPORTER))
        args = {
            "before": StateRoots(
                SemanticRoot("1" * 64), SourceRoot("2" * 64), proposal.context_root
            ),
            "targets": (target.subject,),
            "graph_change": ChangeProposal(add=(target.relations[0],)),
        }
        tx = draft_transaction(b, "graph-v1", proposal, contract=contract, **args)
        self.assertEqual(tx.state, SemanticTransactionState.DRAFT)
        self.assertIsNone(tx.execution)
        self.assertIsNone(tx.policy)
        for changed in (
            replace(contract, authority_tier=AuthorityTier.A3),
            replace(contract, tool_or_adapter="unapproved"),
            replace(contract, forbidden_side_effects=()),
            replace(
                contract,
                rollback_or_compensation=replace(
                    contract.rollback_or_compensation, action="different"
                ),
            ),
        ):
            with self.assertRaises(ContractError):
                draft_transaction(b, "graph-v1", proposal, contract=changed, **args)

    def test_no_self_certification_and_full_pinned_review(self):
        b, s, certificate, policy = certified()
        report, nothing = certify(
            b, s, checked_at=at(320), reviewed_at=at(322), policy=policy
        )
        self.assertEqual(report.verdict, "PASS")
        self.assertIsNone(nothing)
        _, result = certify(
            b,
            s,
            checked_at=at(320),
            reviewed_at=at(322),
            policy=policy,
            proof=certificate.proof,
        )
        self.assertEqual(Certification.from_json(result.to_json()), certificate)

    def test_missing_checks_and_outcomes_remain_hold(self):
        b = bundle()
        missing = check(b, replace(suite(b), cases=(), replay=None), at=at(320))
        self.assertEqual(missing.verdict, "HOLD")
        with self.assertRaises(ContractError):
            Certification(missing, certified()[2].proof)
        s = suite(b)
        wrong = replace(
            s.cases[0], expected=replace(s.cases[0].expected, operation="different")
        )
        report = check(b, replace(s, cases=(wrong, *s.cases[1:])), at=at(320))
        self.assertEqual(report.verdict, "FAIL")
        with self.assertRaises(ContractError):
            check(b, s, at=at(200))

    def test_receipt_identity_policy_content_and_temporal_controls(self):
        b, s, c, p = certified()
        for policy in (
            replace(p, receipt_digests=()),
            replace(p, verifiers=(SemanticId("cni://verifier/other"),)),
            replace(p, policy_version="different"),
        ):
            with self.assertRaises(ContractError):
                c.require_valid(b, policy, at=at(322))
        with self.assertRaises(ContractError):
            c.require_valid(b, p, at=at(319))
        with self.assertRaises(ContractError):
            c.require_valid(b, p, at=at(900000))
        receipt = verification(
            c.report.subject,
            (str(c.report.report_id),),
            when=at(321),
            checks=("token.schema",),
        )
        proof = PromotionProof(
            subject=c.report.subject,
            evidence=receipt.result.evidence,
            verification=receipt,
            tevv=receipt.result,
        )
        with self.assertRaisesRegex(ContractError, "required checks"):
            Certification(c.report, proof).require_valid(b, trust(receipt), at=at(322))
        with self.assertRaises(ContractError):
            certify(
                b, s, checked_at=at(321), reviewed_at=at(322), policy=p, proof=c.proof
            )

    def test_new_implementation_version_or_contract_cannot_inherit(self):
        b, s, c, p = certified()
        for changed in (
            replace(b.token, version="1.0.1"),
            replace(b.token, description="Different applicability"),
            replace(
                b.token,
                implementations=(
                    replace(b.token.implementations[0], environments=("new",)),
                ),
            ),
        ):
            with (
                self.subTest(version=changed.version),
                self.assertRaises(ContractError),
            ):
                c.require_valid(TokenBundle(changed, b.files), p, at=at(322))
        with self.assertRaises(ContractError):
            check(bundle(version="2.0.0"), s, at=at(320))

    def test_schema_scope_authority_context_and_risk_bound_proposals(self):
        b, obs = bundle(), observation()
        action = propose(b, "graph-v1", obs.features, obs, environment="synthetic")
        self.assertEqual(action.authority, AuthorityTier.A2)
        self.assertEqual(action.capability, b.token.binding("graph-v1").subject)
        self.assertTrue(hasattr(action, "draft_transaction"))
        for bad in (
            replace(obs, authority=AuthorityTier.A3),
            replace(obs, risk="higher"),
            replace(obs, graph=replace(obs.graph, source_sha="e" * 40)),
            replace(obs, graph=replace(obs.graph, sbom_digest=None)),
            replace(
                obs, scope_id="foreign", graph=replace(obs.graph, scope_id="foreign")
            ),
            replace(obs, allowed_operations=("unapproved",)),
        ):
            with self.assertRaises(ContractError):
                propose(b, "graph-v1", bad.features, bad, environment="synthetic")
        with self.assertRaises(ContractError):
            propose(
                b, "graph-v1", {"exception": "different"}, obs, environment="synthetic"
            )
        with self.assertRaises(ContractError):
            propose(b, "graph-v1", obs.features, obs, environment="foreign")
        no = replace(obs, features={"exception": "SyntaxError"})
        self.assertIsNone(
            propose(b, "graph-v1", no.features, no, environment="synthetic")
        )
        self.assertEqual(
            input_features({"n": 2, "b": False, "s": "x", "nil": None}),
            {"n": "2", "b": "false", "s": "x", "nil": "null"},
        )
        with self.assertRaises(ContractError):
            input_features({"unsafe": []})

    def test_replay_uses_existing_holdout_guard_and_exact_candidate(self):
        b, s, c, p = certified()
        with self.assertRaises(ContractError):
            replace(s.replay, cases=(s.replay.cases[0], s.replay.cases[0]))
        other = replace(s.replay.candidate, risk="different")
        with self.assertRaises(ContractError):
            replace(s.replay, candidate=other)
        missing = replace(
            s.replay.cases[0].case, episode=s.replay.cases[0].case.episode
        )
        self.assertIsNotNone(missing.truth)


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "registry.sqlite"
        self.registry = Registry(self.path, SCOPE)
        self.addCleanup(self.registry.close)
        self.bundle, self.suite, self.cert, self.policy = certified()
        self.index = FederatedIndex("citadel", 1, at(322), (self.bundle,), (self.cert,))
        self.admit(self.index)

    def admit(self, index):
        self.registry.import_index(
            index, publisher="citadel", expected_digest=index.root, at=at(325)
        )

    def test_import_resolve_install_invoke_reopen_and_revoke(self):
        r, b = self.registry, self.bundle
        r.install(b.token.pin, at=at(326))
        obs = observation(330)
        proposal = r.invoke(
            b.token.pin,
            "graph-v1",
            obs.features,
            obs,
            environment="synthetic",
            policy=self.policy,
            at=at(331),
        )
        self.assertEqual(proposal.authority, AuthorityTier.A2)
        self.assertEqual(r.entries()[-1].payload["effects_executed"], 0)
        self.assertEqual(r.resolve(b.token.capability_id), b.token.pin)
        self.assertTrue(r.search("IMPORT")[0]["installed"])
        with Registry(self.path, SCOPE) as reopened:
            self.assertEqual(reopened.inspect(b.token.pin), b)
        r.revoke(b.token.pin, reason="observed regression", at=at(332))
        with self.assertRaises(ContractError):
            r.invoke(
                b.token.pin,
                "graph-v1",
                obs.features,
                obs,
                environment="synthetic",
                policy=self.policy,
                at=at(333),
            )
        r.revoke(b.token.pin, reason="idempotent retry", at=at(334))
        self.assertEqual(r.inspect(b.token.pin), b)
        self.assertEqual(len(r.state().revoked), 1)

    def test_untrusted_pin_namespace_future_and_rollback_fail_atomically(self):
        before = len(self.registry.entries())
        for kwargs in (
            {"publisher": "other", "expected_digest": self.index.root, "at": at(325)},
            {
                "publisher": "citadel",
                "expected_digest": ContentDigest("a" * 64),
                "at": at(325),
            },
            {"publisher": "citadel", "expected_digest": self.index.root, "at": at(320)},
        ):
            with self.assertRaises(ContractError):
                self.registry.import_index(self.index, **kwargs)
        self.admit(self.index)
        self.assertEqual(len(self.registry.entries()), before)
        with self.assertRaises(ContractError):
            replace(self.index, publisher="other")
        with self.assertRaises(ContractError):
            self.admit(
                replace(self.index, generation=3, previous_digest=self.index.root)
            )

    def test_version_conflict_and_update_invalidation(self):
        new = bundle(version="1.1.0")
        idx = FederatedIndex(
            "citadel", 2, at(324), (new,), previous_digest=self.index.root
        )
        self.admit(idx)
        self.registry.install(self.bundle.token.pin, at=at(326))
        with self.assertRaises(ContractError):
            self.registry.install(new.token.pin, at=at(327))
        self.registry.install(
            new.token.pin, expected_previous=self.bundle.token.pin, at=at(328)
        )
        self.assertEqual(self.registry.resolve(new.token.capability_id), new.token.pin)
        with self.assertRaises(ContractError):
            self.registry.require_ready(
                new.token.pin, "graph-v1", self.policy, at=at(330)
            )
        replacement = TokenBundle(replace(new.token, name="renamed"), new.files)
        conflict = FederatedIndex(
            "citadel", 3, at(329), (replacement,), previous_digest=idx.root
        )
        with self.assertRaisesRegex(ContractError, "immutable version"):
            self.registry.import_index(
                conflict, publisher="citadel", expected_digest=conflict.root, at=at(330)
            )
        with self.assertRaises(ContractError):
            self.registry.install(
                self.bundle.token.pin, expected_previous=new.token.pin, at=at(330)
            )

    def test_transitive_dependency_revocation_prevents_use(self):
        parent = bundle(name="parent", dependencies=(self.bundle.token.pin,))
        parent, _, cert, parent_policy = certified(parent)
        idx = FederatedIndex(
            "citadel", 2, at(324), (parent,), (cert,), previous_digest=self.index.root
        )
        self.admit(idx)
        all_policy = replace(
            self.policy,
            receipt_digests=self.policy.receipt_digests + parent_policy.receipt_digests,
        )
        self.registry.install(parent.token.pin, at=at(326))
        self.registry.require_ready(
            parent.token.pin, "graph-v1", all_policy, at=at(330)
        )
        self.registry.revoke(
            self.bundle.token.pin, reason="dependency regression", at=at(331)
        )
        with self.assertRaisesRegex(ContractError, "revoked"):
            self.registry.require_ready(
                parent.token.pin, "graph-v1", all_policy, at=at(332)
            )

    def test_missing_dependency_or_certificate_does_not_install_or_invoke(self):
        fake = TokenPin(
            SemanticId("cni://capability/citadel/missing"),
            "1.0.0",
            ContentDigest("c" * 64),
        )
        parent = bundle(name="missing-parent", dependencies=(fake,))
        idx = FederatedIndex(
            "citadel", 2, at(324), (parent,), previous_digest=self.index.root
        )
        self.admit(idx)
        with self.assertRaises(ContractError):
            self.registry.install(parent.token.pin, at=at(326))
        self.assertEqual(self.registry.state().installed, {})
        self.registry.install(self.bundle.token.pin, at=at(326))
        with self.assertRaises(ContractError):
            self.registry.require_ready(
                self.bundle.token.pin,
                "graph-v1",
                replace(self.policy, receipt_digests=()),
                at=at(330),
            )

    def test_tenant_isolation_append_race_and_history_tamper(self):
        with self.assertRaises(ContractError):
            Registry(self.path, "other-tenant")
        old = self.registry.state().root
        self.registry.install(self.bundle.token.pin, at=at(326))
        with self.assertRaisesRegex(ContractError, "retry"):
            self.registry._append("install", {"pins": []}, at(327), old)
        with self.assertRaises(ContractError):
            self.registry._append(
                "install", {"pins": []}, at(300), self.registry.state().root
            )
        self.registry.connection.execute(
            "update cnwb_log set root=? where seq=1", ("0" * 64,)
        )
        with self.assertRaisesRegex(ContractError, "integrity"):
            self.registry.entries()

    def test_explicit_certificate_addition_and_future_context(self):
        self.registry.add_certificate(self.cert, self.policy, at=at(326))
        self.registry.install(self.bundle.token.pin, at=at(327))
        with self.assertRaisesRegex(ContractError, "not installed"):
            self.registry.require_ready(
                self.bundle.token.pin, "graph-v1", self.policy, at=at(326)
            )
        obs = observation(330)
        with self.assertRaises(ContractError):
            self.registry.invoke(
                self.bundle.token.pin,
                "graph-v1",
                obs.features,
                obs,
                environment="synthetic",
                policy=self.policy,
                at=at(329),
            )
        with self.assertRaises(ContractError):
            self.registry.invoke(
                self.bundle.token.pin,
                "graph-v1",
                obs.features,
                replace(
                    obs, scope_id="other", graph=replace(obs.graph, scope_id="other")
                ),
                environment="synthetic",
                policy=self.policy,
                at=at(331),
            )

    def test_composition_is_typed_ordered_and_never_escalates(self):
        r, pin = self.registry, self.bundle.token.pin
        r.install(pin, at=at(326))
        first = CompositionStep("one", pin, "graph-v1", (), ("exception",), {})
        second = CompositionStep(
            "two",
            pin,
            "graph-v1",
            (PortBinding("one", "operation", "exception"),),
            (),
            {},
        )
        plan = compose(
            r, (second, first), self.policy, authority=AuthorityTier.A2, at=at(330)
        )
        self.assertEqual([s.name for s in plan.steps], ["one", "two"])
        self.assertEqual(plan.authority, AuthorityTier.A2)
        self.assertEqual(len(r.entries()), 2)
        for steps, tier in (
            ((first, second), AuthorityTier.A3),
            (
                (
                    replace(
                        first,
                        bindings=(PortBinding("two", "operation", "exception"),),
                        external_inputs=(),
                    ),
                    second,
                ),
                AuthorityTier.A2,
            ),
            ((replace(first, external_inputs=()),), AuthorityTier.A2),
            (
                (
                    replace(
                        second, bindings=(PortBinding("one", "tests", "exception"),)
                    ),
                    first,
                ),
                AuthorityTier.A2,
            ),
            (
                (
                    replace(
                        second,
                        bindings=(PortBinding("absent", "operation", "exception"),),
                    ),
                    first,
                ),
                AuthorityTier.A2,
            ),
        ):
            with self.assertRaises(ContractError):
                compose(r, steps, self.policy, authority=tier, at=at(330))

    def test_composition_rejects_privacy_downgrade(self):
        # Isolate the type/privacy gate; certification is exercised by the previous test.
        original = self.bundle
        properties = dict(original.token.outputs.document["properties"])
        properties["operation"] = {
            "type": "string",
            "x-data-classification": "tenant_private",
        }
        private = TokenBundle(
            replace(original.token, outputs=schema(properties)), original.files
        )
        first = CompositionStep(
            "one", original.token.pin, "graph-v1", (), ("exception",), {}
        )
        second = CompositionStep(
            "two",
            original.token.pin,
            "graph-v1",
            (PortBinding("one", "operation", "exception"),),
            (),
            {},
        )
        with patch.object(self.registry, "require_ready", return_value=private):
            with self.assertRaisesRegex(ContractError, "private data"):
                compose(
                    self.registry,
                    (first, second),
                    self.policy,
                    authority=AuthorityTier.A2,
                    at=at(330),
                )


if __name__ == "__main__":
    unittest.main()
