# ─── CGRF Header ─────────────────────────────
# File:        tests/upgrade/test_semantic_twin.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     tests/upgrade/test_semantic_twin_contracts.py, libs/semantic_twin
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/upgrade/test_semantic_twin_contracts.py; VALIDATES libs/semantic_twin/vocabulary.py; VALIDATES libs/semantic_twin/transitions.py; VALIDATES libs/semantic_twin/models.py
# DAG Node:    semantic-twin.phase-0.tests
# Intent:      Prove vocabulary completeness, immutable envelope validation and rejection of unsupported semantic promotions.
# ────────────────────────────────────────────────────────────

"""Preserve frozen vocabulary and prove state updates under version-two contracts."""

from __future__ import annotations

import unittest
from dataclasses import fields, replace
from datetime import timedelta
from itertools import permutations

import libs.semantic_twin as t
from libs.semantic_twin import (
    AUTHORITY_TIER_NAMES,
    AuthorityTier,
    CausalState,
    CgrfActionState,
    CorpusUseState,
    DESIGN_LAWS,
    EvidenceState,
    MerkleState,
    ObjectState,
    RELATION_PREDICATE_GROUPS,
    RelationPredicate,
    SemanticTransactionState,
    ShaclState,
    StateAxis,
    TevvState,
)
from tests.upgrade import test_semantic_twin_contracts as f


class VocabularyTests(unittest.TestCase):
    """Verify exact spellings and completeness of frozen definitions."""

    def test_state_vocabulary_is_exact(self) -> None:
        expected = {
            EvidenceState: (
                "UNMEASURED",
                "OBSERVED",
                "INFERRED",
                "HYPOTHESIS",
                "TESTING",
                "VERIFIED",
                "CONTRADICTED",
                "INSUFFICIENT",
                "QUARANTINED",
                "SUPERSEDED",
                "RETIRED",
            ),
            ShaclState: (
                "NOT_EVALUATED",
                "CONFORMS",
                "WARNING",
                "VIOLATES",
                "DEFERRED",
                "QUARANTINED",
                "SUPERSEDED",
                "RETIRED",
            ),
            MerkleState: (
                "UNHASHED",
                "CANONICALIZED",
                "LEAF_HASHED",
                "ROOTED",
                "ATTESTED",
                "INCLUSION_PROVEN",
                "STALE",
                "SUPERSEDED",
                "CORRUPT",
                "QUARANTINED",
            ),
            CgrfActionState: (
                "OBSERVED",
                "PROPOSED",
                "POLICY_EVALUATING",
                "DENIED",
                "AUTHORIZED",
                "RESERVED",
                "EXECUTING",
                "MUTATED_UNVERIFIED",
                "VERIFYING",
                "VERIFIED",
                "WATCH",
                "ROLLBACK_REQUIRED",
                "ROLLED_BACK",
                "FAILED_CLOSED",
                "SUPERSEDED",
            ),
            TevvState: (
                "NOT_TESTED",
                "TESTING",
                "PASS",
                "FAIL",
                "HOLD",
                "WATCH",
                "NOT_APPLICABLE",
                "SUPERSEDED",
            ),
            SemanticTransactionState: (
                "DRAFT",
                "PARSED",
                "SHACL_VALIDATED",
                "EVIDENCE_BOUND",
                "POLICY_EVALUATED",
                "AUTHORIZED",
                "EXECUTING",
                "MUTATED_UNVERIFIED",
                "VERIFYING",
                "VERIFIED",
                "CANONICALIZED",
                "WATCH",
                "ROLLED_BACK",
                "REJECTED",
                "SUPERSEDED",
            ),
            CausalState: (
                "TEMPORAL_ONLY",
                "CORRELATED",
                "CANDIDATE_CAUSE",
                "HYPOTHESIZED_CAUSE",
                "EXPERIMENTALLY_SUPPORTED",
                "VERIFIED_CAUSE",
                "REFUTED_CAUSE",
                "UNDECIDABLE",
            ),
            CorpusUseState: (
                "DISCOVERY_ONLY",
                "COMPARATIVE_OBSERVATION",
                "PATTERN_CANDIDATE",
                "CITADEL_HYPOTHESIS",
                "TESTED_IN_CITADEL",
                "VERIFIED_FOR_CITADEL",
                "REJECTED_FOR_CITADEL",
            ),
        }
        for enum_type, values in expected.items():
            with self.subTest(enum=enum_type.__name__):
                self.assertEqual(tuple(item.value for item in enum_type), values)

    def test_authority_tiers_preserve_names(self) -> None:
        self.assertEqual(
            tuple(item.value for item in AuthorityTier), ("A0", "A1", "A2", "A3")
        )
        self.assertEqual(AUTHORITY_TIER_NAMES[AuthorityTier.A0], "Observe")
        self.assertEqual(AuthorityTier.A3.display_name, "High-consequence/external")
        self.assertIn("independent verification", AuthorityTier.A3.default_friction)

    def test_state_vector_has_exactly_ten_named_axes(self) -> None:
        expected = (
            "evidence_state",
            "shacl_state",
            "merkle_state",
            "cgrf_action_state",
            "tevv_state",
            "semantic_transaction_state",
            "causal_state",
            "corpus_use_state",
            "authority_tier",
            "lifecycle_state",
        )
        self.assertEqual(tuple(axis.value for axis in StateAxis), expected)
        self.assertEqual(tuple(field.name for field in fields(ObjectState)), expected)

    def test_relation_groups_cover_every_predicate_once(self) -> None:
        expected = {
            "contains",
            "member_of",
            "part_of",
            "depends_on",
            "imports",
            "calls",
            "invokes",
            "reads",
            "writes",
            "publishes",
            "consumes",
            "emits",
            "subscribes_to",
            "routes_to",
            "maps_to",
            "implemented_by",
            "implements",
            "tested_by",
            "verified_by",
            "observed_by",
            "supported_by",
            "derived_from",
            "evidenced_by",
            "attested_by",
            "included_in_epoch",
            "has_inclusion_proof",
            "documented_by",
            "defines",
            "describes",
            "claims",
            "entails",
            "contradicts",
            "supersedes",
            "refines",
            "references",
            "about",
            "owned_by",
            "authorized_by",
            "executed_by",
            "proposed_by",
            "reviewed_by",
            "rolled_back_by",
            "governed_by",
            "allowed_by",
            "denied_by",
            "preceded_by",
            "succeeded_by",
            "valid_from",
            "valid_until",
            "introduced_by",
            "removed_by",
            "changed_by",
            "deployed_as",
            "built_from",
            "promoted_to",
            "correlates_with",
            "preceded",
            "contributed_to",
            "causes",
            "affected",
            "affects",
            "associated_with",
        }
        grouped = [
            predicate
            for predicates in RELATION_PREDICATE_GROUPS.values()
            for predicate in predicates
        ]
        self.assertEqual(len(grouped), len(RelationPredicate))
        self.assertEqual(set(grouped), set(RelationPredicate))
        self.assertEqual({predicate.value for predicate in RelationPredicate}, expected)
        self.assertIn(
            RelationPredicate.CAUSES, RELATION_PREDICATE_GROUPS["analytic_causal"]
        )
        self.assertEqual(RelationPredicate.DEPENDS_ON.value, "depends_on")

    def test_appendix_d_contains_exactly_fifteen_laws(self) -> None:
        self.assertEqual(len(DESIGN_LAWS), 15)
        self.assertEqual(DESIGN_LAWS[0], "No semantic identity without provenance.")
        self.assertIn("historical decision time", DESIGN_LAWS[-1])


class TransitionTests(unittest.TestCase):
    """Keep adjacency distinct from receipt-bearing promotion."""

    def test_evidence_requires_measurement_and_staged_verification(self) -> None:
        self.assertTrue(
            t.can_transition(t.EvidenceState.UNMEASURED, t.EvidenceState.OBSERVED)
        )
        self.assertFalse(
            t.can_transition(t.EvidenceState.UNMEASURED, t.EvidenceState.VERIFIED)
        )
        self.assertFalse(
            t.can_transition(t.EvidenceState.OBSERVED, t.EvidenceState.VERIFIED)
        )
        verdict = f.verification(method=t.VerificationMethod.DETERMINISTIC)
        proof = t.PromotionProof(
            subject=f.SERVICE, evidence=verdict.result.evidence, verification=verdict
        )
        self.assertTrue(
            t.can_transition(
                t.EvidenceState.OBSERVED,
                t.EvidenceState.VERIFIED,
                subject=f.SERVICE,
                proof=proof,
            )
        )

    def test_causal_promotion_is_staged(self) -> None:
        self.assertIn(
            t.CausalState.CANDIDATE_CAUSE,
            t.allowed_transitions(t.CausalState.CORRELATED),
        )
        self.assertFalse(
            t.can_transition(t.CausalState.CORRELATED, t.CausalState.CANDIDATE_CAUSE)
        )
        self.assertFalse(
            t.can_transition(t.CausalState.CORRELATED, t.CausalState.VERIFIED_CAUSE)
        )
        self.assertFalse(
            t.can_transition(t.CausalState.TEMPORAL_ONLY, t.CausalState.CANDIDATE_CAUSE)
        )
        self.assertFalse(
            t.can_transition(t.CausalState.TEMPORAL_ONLY, t.CausalState.VERIFIED_CAUSE)
        )
        self.assertFalse(t.can_automatically_promote("correlation", "causation"))
        self.assertFalse(t.can_automatically_promote("chronology", "causation"))

    def test_shacl_conformance_is_not_a_cross_axis_transition(self) -> None:
        self.assertNotIn(
            t.SemanticTransactionState.EVIDENCE_BOUND,
            t.allowed_transitions(t.ShaclState.CONFORMS),
        )
        self.assertFalse(
            t.can_transition(
                t.ShaclState.CONFORMS, t.SemanticTransactionState.EVIDENCE_BOUND
            )
        )
        self.assertFalse(
            t.can_transition(t.ShaclState.CONFORMS, t.EvidenceState.VERIFIED)
        )

    def test_transaction_cannot_skip_policy_or_verification(self) -> None:
        self.assertFalse(
            t.can_transition(
                t.SemanticTransactionState.DRAFT, t.SemanticTransactionState.AUTHORIZED
            )
        )
        self.assertFalse(
            t.can_transition(
                t.SemanticTransactionState.MUTATED_UNVERIFIED,
                t.SemanticTransactionState.VERIFIED,
            )
        )
        tx = f.transaction(t.SemanticTransactionState.VERIFYING)
        proof = t.PromotionProof(
            subject=tx.subject, evidence=tx.evidence, transaction=tx
        )
        self.assertTrue(
            t.can_transition(
                t.SemanticTransactionState.MUTATED_UNVERIFIED,
                t.SemanticTransactionState.VERIFYING,
                subject=tx.subject,
                proof=proof,
            )
        )

    def test_each_ordered_lifecycle_rejects_direct_final_promotion(self) -> None:
        for first, middle, last in (
            (t.MerkleState.UNHASHED, t.MerkleState.LEAF_HASHED, t.MerkleState.ROOTED),
            (
                t.CgrfActionState.PROPOSED,
                t.CgrfActionState.POLICY_EVALUATING,
                t.CgrfActionState.AUTHORIZED,
            ),
            (t.TevvState.NOT_TESTED, t.TevvState.TESTING, t.TevvState.PASS),
            (
                t.CorpusUseState.DISCOVERY_ONLY,
                t.CorpusUseState.TESTED_IN_CITADEL,
                t.CorpusUseState.VERIFIED_FOR_CITADEL,
            ),
        ):
            with self.subTest(state=last):
                self.assertFalse(t.can_transition(first, last))
                self.assertIn(last, t.allowed_transitions(middle))
                self.assertFalse(t.can_transition(middle, last))

    def test_hash_authority_and_test_state_remain_distinct(self) -> None:
        for left, right in t.FORBIDDEN_AUTOMATIC_PROMOTIONS:
            self.assertFalse(t.can_automatically_promote(left, right))
        self.assertIn(
            t.MerkleState.CANONICALIZED, t.allowed_transitions(t.MerkleState.UNHASHED)
        )
        self.assertFalse(
            t.can_transition(t.CgrfActionState.AUTHORIZED, t.CgrfActionState.VERIFIED)
        )
        self.assertFalse(t.can_transition(t.TevvState.NOT_TESTED, t.TevvState.PASS))

    def test_invalid_transition_raises_typed_error(self) -> None:
        with self.assertRaises(t.InvalidTransitionError):
            t.require_transition(t.EvidenceState.UNMEASURED, t.EvidenceState.VERIFIED)
        with self.assertRaises(t.ContractError):
            t.allowed_transitions("UNMEASURED")


class EnvelopeTests(unittest.TestCase):
    """Retain section 44 and 45 acceptance checks after the explicit schema change."""

    def test_canonical_object_carries_every_section_44_group(self) -> None:
        value = f.object_envelope()
        wire = value.to_dict()
        self.assertTrue(
            {
                "semantic_id",
                "object_type",
                "schema_version",
                "source",
                "valid_time",
                "observed_time",
                "state",
                "claims",
                "relations",
                "provenance",
                "merkle",
                "ownership",
                "authority",
                "runtime",
                "documentation",
            }
            <= wire.keys()
        )
        self.assertEqual(len(wire["state"]), 10)
        self.assertEqual(wire["schema_version"], "2")
        self.assertEqual(t.CanonicalObjectEnvelope.from_json(value.to_json()), value)

    def test_canonical_event_carries_every_section_45_group(self) -> None:
        value = f.event_envelope()
        self.assertEqual(
            set(value.to_dict()),
            {
                "id",
                "type",
                "version",
                "tenant_id",
                "occurred_at",
                "subject",
                "context",
                "data",
                "evidence",
            },
        )
        self.assertEqual(t.CanonicalEventEnvelope.from_json(value.to_json()), value)

    def test_object_identity_requires_source_and_provenance(self) -> None:
        for changes in (
            {"semantic_id": "arbitrary"},
            {"source": None},
            {"provenance": None},
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(f.object_envelope(), **changes)

    def test_temporal_and_confidence_contracts_reject_invalid_values(self) -> None:
        with self.assertRaises(t.ContractError):
            t.ValidTime(f.NOW, f.NOW - timedelta(seconds=1))
        with self.assertRaises(t.ContractError):
            replace(f.relation(), confidence=1.01)


class CompositeStateTests(unittest.TestCase):
    """Prove ten-axis representation and atomic receipt-bearing multi-delta behavior."""

    @staticmethod
    def initial_state() -> t.ObjectState:
        return f.state()

    @staticmethod
    def five_discovery_deltas() -> tuple[t.StateDelta, ...]:
        ref = f.evidence(f.TRANSACTION, t.EvidenceKind.SOURCE, "discovery")
        parsed = replace(
            f.transaction(),
            state=t.SemanticTransactionState.PARSED,
            authority=None,
            policy=None,
            evidence=(ref,),
            execution=None,
            verification=None,
            after=None,
        )
        proof = t.PromotionProof(
            subject=f.TRANSACTION,
            evidence=(ref,),
            shacl=parsed.shacl,
            merkle=t.MerkleBinding(serialization=t.CanonicalSerialization()),
            transaction=parsed,
        )
        pairs = (
            (
                t.StateAxis.EVIDENCE,
                t.EvidenceState.UNMEASURED,
                t.EvidenceState.OBSERVED,
            ),
            (t.StateAxis.SHACL, t.ShaclState.NOT_EVALUATED, t.ShaclState.CONFORMS),
            (t.StateAxis.MERKLE, t.MerkleState.UNHASHED, t.MerkleState.CANONICALIZED),
            (
                t.StateAxis.CGRF_ACTION,
                t.CgrfActionState.OBSERVED,
                t.CgrfActionState.PROPOSED,
            ),
            (
                t.StateAxis.SEMANTIC_TRANSACTION,
                t.SemanticTransactionState.DRAFT,
                t.SemanticTransactionState.PARSED,
            ),
        )
        return tuple(
            t.StateDelta(
                axis,
                before,
                after,
                "Record the bounded observation.",
                f.TRANSACTION,
                (ref,),
                proof,
            )
            for axis, before, after in pairs
        )

    def test_five_deltas_apply_atomically_across_ten_axes(self) -> None:
        before = self.initial_state()
        deltas = self.five_discovery_deltas()
        after = t.apply_state_deltas(before, deltas, subject=f.TRANSACTION)
        self.assertEqual(
            {
                axis
                for axis in t.StateAxis
                if before.axis_value(axis) != after.axis_value(axis)
            },
            {d.axis for d in deltas},
        )
        self.assertEqual(len(after.to_dict()), 10)
        self.assertEqual(before, self.initial_state())

    def test_delta_order_does_not_change_atomic_result(self) -> None:
        before = self.initial_state()
        deltas = self.five_discovery_deltas()
        expected = t.apply_state_deltas(before, deltas, subject=f.TRANSACTION)
        for order in permutations(deltas):
            self.assertEqual(
                t.apply_state_deltas(before, order, subject=f.TRANSACTION), expected
            )

    def test_five_interdependent_verification_deltas_commit_together(self) -> None:
        tx = f.transaction()
        support = f.causal()
        refs = tuple(
            {e.evidence_id: e for e in (*tx.evidence, *support.evidence)}.values()
        )
        verdict = f.verification(
            f.TRANSACTION,
            refs=refs,
            tier=t.AuthorityTier.A2,
            targets=(f.SERVICE.semantic_id,),
        )
        tx = replace(tx, policy=verdict.policy, verification=verdict, evidence=refs)
        support = replace(support, verification=verdict)
        proof = t.PromotionProof(
            subject=f.TRANSACTION,
            evidence=refs,
            verification=verdict,
            tevv=verdict.result,
            transaction=tx,
            causal=support,
        )
        before = f.state(
            evidence_state=t.EvidenceState.TESTING,
            shacl_state=t.ShaclState.CONFORMS,
            merkle_state=t.MerkleState.ROOTED,
            cgrf_action_state=t.CgrfActionState.VERIFYING,
            tevv_state=t.TevvState.TESTING,
            semantic_transaction_state=t.SemanticTransactionState.VERIFYING,
            causal_state=t.CausalState.EXPERIMENTALLY_SUPPORTED,
            corpus_use_state=t.CorpusUseState.TESTED_IN_CITADEL,
            authority_tier=t.AuthorityTier.A2,
        )
        pairs = (
            (t.StateAxis.EVIDENCE, t.EvidenceState.TESTING, t.EvidenceState.VERIFIED),
            (
                t.StateAxis.CGRF_ACTION,
                t.CgrfActionState.VERIFYING,
                t.CgrfActionState.VERIFIED,
            ),
            (t.StateAxis.TEVV, t.TevvState.TESTING, t.TevvState.PASS),
            (
                t.StateAxis.SEMANTIC_TRANSACTION,
                t.SemanticTransactionState.VERIFYING,
                t.SemanticTransactionState.VERIFIED,
            ),
            (
                t.StateAxis.CAUSAL,
                t.CausalState.EXPERIMENTALLY_SUPPORTED,
                t.CausalState.VERIFIED_CAUSE,
            ),
        )
        deltas = tuple(
            t.StateDelta(
                axis,
                old,
                new,
                "Independent postconditions passed.",
                f.TRANSACTION,
                refs,
                proof,
            )
            for axis, old, new in pairs
        )
        after = t.apply_state_deltas(before, reversed(deltas), subject=f.TRANSACTION)
        self.assertEqual(
            after.semantic_transaction_state, t.SemanticTransactionState.VERIFIED
        )
        self.assertEqual(after.causal_state, t.CausalState.VERIFIED_CAUSE)
        for delta in deltas:
            self.assertEqual(t.StateDelta.from_json(delta.to_json()), delta)
        with self.assertRaises(t.InvalidTransitionError):
            t.apply_state_deltas(before, (deltas[0],), subject=f.TRANSACTION)

    def test_one_invalid_delta_rejects_the_entire_change_set(self) -> None:
        before = self.initial_state()
        deltas = self.five_discovery_deltas()
        invalid = (
            *deltas[:-1],
            replace(deltas[-1], after=t.SemanticTransactionState.AUTHORIZED),
        )
        with self.assertRaises(t.InvalidTransitionError):
            t.apply_state_deltas(before, invalid, subject=f.TRANSACTION)
        self.assertEqual(before, self.initial_state())

    def test_stale_duplicate_and_cross_family_deltas_are_rejected(self) -> None:
        before = self.initial_state()
        delta = self.five_discovery_deltas()[0]
        with self.assertRaisesRegex(t.InvalidTransitionError, "stale"):
            t.apply_state_deltas(
                before,
                (
                    replace(
                        delta,
                        before=t.EvidenceState.OBSERVED,
                        after=t.EvidenceState.INFERRED,
                    ),
                ),
                subject=f.TRANSACTION,
            )
        with self.assertRaisesRegex(t.InvalidTransitionError, "each axis once"):
            t.apply_state_deltas(before, (delta, delta), subject=f.TRANSACTION)
        with self.assertRaises(t.ContractError):
            replace(
                delta, before=t.ShaclState.NOT_EVALUATED, after=t.ShaclState.CONFORMS
            )
        with self.assertRaises(t.InvalidTransitionError):
            t.apply_state_deltas(before, (delta,), subject=f.SERVICE)
        for payload in (
            {**delta.to_dict(), "axis": "unknown"},
            {**delta.to_dict(), "after": "CONFORMS"},
            {**delta.to_dict(), "extra": True},
        ):
            with self.assertRaises(t.ContractError):
                t.StateDelta.from_dict(payload)
        with self.assertRaises(t.ContractError):
            t.apply_state_deltas(before, (), subject=f.TRANSACTION)

    def test_verified_claims_require_consistent_final_axes(self) -> None:
        with self.assertRaises(t.ContractError):
            f.state(
                evidence_state=t.EvidenceState.VERIFIED, tevv_state=t.TevvState.FAIL
            )
        with self.assertRaises(t.ContractError):
            f.state(semantic_transaction_state=t.SemanticTransactionState.VERIFIED)

    def test_authority_and_open_lifecycle_do_not_self_promote(self) -> None:
        before = self.initial_state()
        ref = f.evidence(f.TRANSACTION)
        for delta in (
            t.StateDelta(
                t.StateAxis.AUTHORITY,
                t.AuthorityTier.A1,
                t.AuthorityTier.A2,
                "Request broader scope.",
                f.TRANSACTION,
                (ref,),
            ),
            t.StateDelta(
                t.StateAxis.LIFECYCLE,
                "CANDIDATE",
                "ACTIVE",
                "Request undefined lifecycle edge.",
                f.TRANSACTION,
                (ref,),
            ),
        ):
            self.assertEqual(t.StateDelta.from_json(delta.to_json()), delta)
            with self.assertRaisesRegex(
                t.InvalidTransitionError, "no automatic Phase 0 transition policy"
            ):
                t.apply_state_deltas(before, (delta,), subject=f.TRANSACTION)


if __name__ == "__main__":
    unittest.main()
