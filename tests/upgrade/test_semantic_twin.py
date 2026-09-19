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
# Depends:     libs/semantic_twin
# EnumType:    Test
# EnumEdges:   VALIDATES libs/semantic_twin/vocabulary.py; VALIDATES libs/semantic_twin/transitions.py; VALIDATES libs/semantic_twin/models.py
# DAG Node:    semantic-twin.phase-0.tests
# Intent:      Prove vocabulary completeness, immutable envelope validation and rejection of unsupported semantic promotions.
# ────────────────────────────────────────────────────────────

"""Test the Living Semantic System Twin Phase 0 contract."""

from __future__ import annotations

import unittest
from dataclasses import FrozenInstanceError, fields
from datetime import datetime, timedelta, timezone

from libs.semantic_twin import (
    AUTHORITY_TIER_NAMES,
    DESIGN_LAWS,
    RELATION_PREDICATE_GROUPS,
    Authority,
    AuthorityTier,
    CanonicalEventEnvelope,
    CanonicalObjectEnvelope,
    CausalState,
    CgrfActionState,
    CorpusUseState,
    Documentation,
    EventContext,
    EventEvidence,
    EventSubject,
    EvidenceState,
    InvalidTransitionError,
    MerkleBinding,
    MerkleState,
    ObjectState,
    Ownership,
    Provenance,
    Relation,
    RelationPredicate,
    Runtime,
    SemanticTransactionState,
    ShaclState,
    Source,
    StateAxis,
    StateDelta,
    TevvState,
    ValidTime,
    allowed_transitions,
    apply_state_deltas,
    can_automatically_promote,
    can_transition,
    require_transition,
)


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
    """Verify valid progressions and reject semantic shortcuts."""

    def test_evidence_requires_measurement_and_staged_verification(self) -> None:
        self.assertTrue(
            can_transition(EvidenceState.UNMEASURED, EvidenceState.OBSERVED)
        )
        self.assertFalse(
            can_transition(EvidenceState.UNMEASURED, EvidenceState.VERIFIED)
        )
        self.assertFalse(can_transition(EvidenceState.OBSERVED, EvidenceState.VERIFIED))
        self.assertTrue(
            can_transition(
                EvidenceState.OBSERVED,
                EvidenceState.VERIFIED,
                direct_deterministic_verifier=True,
            )
        )

    def test_causal_promotion_is_staged(self) -> None:
        self.assertTrue(
            can_transition(CausalState.CORRELATED, CausalState.CANDIDATE_CAUSE)
        )
        self.assertFalse(
            can_transition(CausalState.CORRELATED, CausalState.VERIFIED_CAUSE)
        )
        self.assertFalse(
            can_transition(CausalState.TEMPORAL_ONLY, CausalState.CANDIDATE_CAUSE)
        )
        self.assertFalse(
            can_transition(CausalState.TEMPORAL_ONLY, CausalState.VERIFIED_CAUSE)
        )
        self.assertFalse(can_automatically_promote("correlation", "causation"))
        self.assertFalse(can_automatically_promote("chronology", "causation"))

    def test_shacl_conformance_is_not_a_cross_axis_transition(self) -> None:
        self.assertNotIn(
            SemanticTransactionState.EVIDENCE_BOUND,
            allowed_transitions(ShaclState.CONFORMS),
        )
        self.assertFalse(
            can_transition(
                ShaclState.CONFORMS,
                SemanticTransactionState.EVIDENCE_BOUND,
            )
        )
        self.assertFalse(can_transition(ShaclState.CONFORMS, EvidenceState.VERIFIED))

    def test_transaction_cannot_skip_policy_or_verification(self) -> None:
        self.assertFalse(
            can_transition(
                SemanticTransactionState.DRAFT,
                SemanticTransactionState.AUTHORIZED,
            )
        )
        self.assertFalse(
            can_transition(
                SemanticTransactionState.MUTATED_UNVERIFIED,
                SemanticTransactionState.VERIFIED,
            )
        )
        self.assertTrue(
            can_transition(
                SemanticTransactionState.MUTATED_UNVERIFIED,
                SemanticTransactionState.VERIFYING,
            )
        )

    def test_each_ordered_lifecycle_rejects_direct_final_promotion(self) -> None:
        self.assertFalse(can_transition(MerkleState.UNHASHED, MerkleState.ROOTED))
        self.assertFalse(
            can_transition(CgrfActionState.PROPOSED, CgrfActionState.AUTHORIZED)
        )
        self.assertFalse(can_transition(TevvState.NOT_TESTED, TevvState.PASS))
        self.assertFalse(
            can_transition(
                CorpusUseState.DISCOVERY_ONLY,
                CorpusUseState.VERIFIED_FOR_CITADEL,
            )
        )
        self.assertTrue(can_transition(MerkleState.LEAF_HASHED, MerkleState.ROOTED))
        self.assertTrue(
            can_transition(
                CgrfActionState.POLICY_EVALUATING,
                CgrfActionState.AUTHORIZED,
            )
        )
        self.assertTrue(can_transition(TevvState.TESTING, TevvState.PASS))
        self.assertTrue(
            can_transition(
                CorpusUseState.TESTED_IN_CITADEL,
                CorpusUseState.VERIFIED_FOR_CITADEL,
            )
        )

    def test_hash_authority_and_test_state_remain_distinct(self) -> None:
        self.assertFalse(can_automatically_promote("hash-valid", "true"))
        self.assertFalse(can_automatically_promote("authorized", "correct"))
        self.assertTrue(can_transition(MerkleState.UNHASHED, MerkleState.CANONICALIZED))
        self.assertFalse(
            can_transition(CgrfActionState.AUTHORIZED, CgrfActionState.VERIFIED)
        )
        self.assertFalse(can_transition(TevvState.NOT_TESTED, TevvState.PASS))

    def test_invalid_transition_raises_typed_error(self) -> None:
        with self.assertRaises(InvalidTransitionError):
            require_transition(EvidenceState.UNMEASURED, EvidenceState.VERIFIED)


class EnvelopeTests(unittest.TestCase):
    """Verify canonical object and event minimum contracts."""

    def setUp(self) -> None:
        self.now = datetime(2026, 9, 19, 12, 0, tzinfo=timezone.utc)

    def make_object(self) -> CanonicalObjectEnvelope:
        """Build a valid minimum object envelope for each test."""

        relation = Relation(
            predicate=RelationPredicate.DEPENDS_ON,
            target="cni://service/identity",
            evidence=("cni://evidence/trace-1",),
            confidence=0.92,
            state=EvidenceState.OBSERVED,
        )
        return CanonicalObjectEnvelope(
            semantic_id="cni://service/classroom",
            object_type="Service",
            schema_version="1",
            source=Source(
                system="git",
                uri_or_path="apps/web/classroom",
                repository="buildanddo",
                commit="abc123",
            ),
            valid_time=ValidTime(valid_from=self.now),
            observed_time=self.now,
            state=ObjectState(
                evidence_state=EvidenceState.OBSERVED,
                shacl_state=ShaclState.CONFORMS,
                merkle_state=MerkleState.CANONICALIZED,
                cgrf_action_state=CgrfActionState.PROPOSED,
                tevv_state=TevvState.NOT_TESTED,
                semantic_transaction_state=SemanticTransactionState.PARSED,
                causal_state=CausalState.TEMPORAL_ONLY,
                corpus_use_state=CorpusUseState.DISCOVERY_ONLY,
                authority_tier=AuthorityTier.A1,
                lifecycle_state="ACTIVE",
            ),
            claims=({"text": "Classroom depends on identity."},),
            relations=(relation,),
            provenance=Provenance(
                derived_from=("git://buildanddo/commit/abc123",),
                parser_version="1",
            ),
            merkle=MerkleBinding(),
            ownership=Ownership(owner="Citadel Nexus Inc.", guild="buildanddo"),
            authority=Authority(required_tier=AuthorityTier.A1, mutability="candidate"),
            runtime=Runtime(
                observed_status="unknown",
                telemetry_refs=("datadog://trace/trace-1",),
            ),
            documentation=Documentation(references=("doc://semantic-twin/44",)),
        )

    def test_canonical_object_carries_every_section_44_group(self) -> None:
        envelope = self.make_object()
        self.assertEqual(envelope.semantic_id, "cni://service/classroom")
        self.assertEqual(envelope.relations[0].state, EvidenceState.OBSERVED)
        self.assertEqual(envelope.authority.required_tier, AuthorityTier.A1)
        self.assertEqual(envelope.claims[0]["text"], "Classroom depends on identity.")
        wire = envelope.to_dict()
        self.assertEqual(wire["valid_time"]["from"], self.now.isoformat())
        self.assertEqual(wire["relations"][0]["predicate"], "depends_on")
        self.assertEqual(wire["state"]["evidence_state"], "OBSERVED")
        self.assertEqual(len(wire["state"]), 10)
        self.assertEqual(wire["state"]["merkle_state"], "CANONICALIZED")
        self.assertEqual(wire["state"]["authority_tier"], "A1")
        with self.assertRaises(TypeError):
            envelope.claims[0]["text"] = "changed"
        with self.assertRaises(FrozenInstanceError):
            envelope.object_type = "Module"

    def test_canonical_event_carries_every_section_45_group(self) -> None:
        event = CanonicalEventEnvelope(
            id="evt_1",
            type="semantic.transaction.verified",
            version="1",
            tenant_id="citadel-internal",
            occurred_at=self.now,
            subject=EventSubject(type="semantic_transaction", id="stx_9182"),
            context=EventContext(
                persona_id="gm:forge",
                release_sha="abc123",
                trace_id="trace-1",
                mission_id="mission-1",
                context_root="root-1",
                semantic_epoch="441",
            ),
            data={"result": "verified"},
            evidence=EventEvidence(
                evidence_id="ev_1",
                state=EvidenceState.VERIFIED,
            ),
        )
        self.assertEqual(event.subject.id, "stx_9182")
        self.assertEqual(event.evidence.state, EvidenceState.VERIFIED)
        wire = event.to_dict()
        self.assertEqual(wire["occurred_at"], self.now.isoformat())
        self.assertEqual(wire["evidence"]["state"], "VERIFIED")
        with self.assertRaises(TypeError):
            event.data["result"] = "changed"

    def test_object_identity_requires_source_and_provenance(self) -> None:
        with self.assertRaisesRegex(ValueError, "source"):
            Source(system="git")
        with self.assertRaisesRegex(ValueError, "provenance"):
            Provenance()

    def test_temporal_and_confidence_contracts_reject_invalid_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "must not precede"):
            ValidTime(
                valid_from=self.now,
                valid_until=self.now - timedelta(seconds=1),
            )
        with self.assertRaisesRegex(ValueError, "confidence"):
            Relation(
                predicate=RelationPredicate.CALLS,
                target="cni://service/identity",
                evidence=(),
                confidence=1.01,
                state=EvidenceState.INFERRED,
            )
        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            CanonicalEventEnvelope(
                id="evt_2",
                type="semantic.transaction.verified",
                version="1",
                tenant_id="citadel-internal",
                occurred_at=datetime(2026, 9, 19, 12, 0),
                subject=EventSubject(type="semantic_transaction", id="stx_2"),
                context=EventContext(),
                data={},
                evidence=EventEvidence(
                    evidence_id="ev_2",
                    state=EvidenceState.OBSERVED,
                ),
            )


class CompositeStateTests(unittest.TestCase):
    """Prove ten-axis representation and atomic multi-delta behavior."""

    @staticmethod
    def initial_state() -> ObjectState:
        """Return a consistent ten-axis candidate state."""

        return ObjectState(
            evidence_state=EvidenceState.UNMEASURED,
            shacl_state=ShaclState.NOT_EVALUATED,
            merkle_state=MerkleState.UNHASHED,
            cgrf_action_state=CgrfActionState.OBSERVED,
            tevv_state=TevvState.NOT_TESTED,
            semantic_transaction_state=SemanticTransactionState.DRAFT,
            causal_state=CausalState.TEMPORAL_ONLY,
            corpus_use_state=CorpusUseState.DISCOVERY_ONLY,
            authority_tier=AuthorityTier.A1,
            lifecycle_state="CANDIDATE",
        )

    @staticmethod
    def five_discovery_deltas() -> tuple[StateDelta, ...]:
        """Return five independent first-step deltas."""

        return (
            StateDelta(
                StateAxis.EVIDENCE,
                EvidenceState.UNMEASURED,
                EvidenceState.OBSERVED,
                "Bind the source observation.",
                ("cni://evidence/source-1",),
            ),
            StateDelta(
                StateAxis.SHACL,
                ShaclState.NOT_EVALUATED,
                ShaclState.CONFORMS,
                "Validate the candidate shape.",
                ("cni://evidence/shacl-1",),
            ),
            StateDelta(
                StateAxis.MERKLE,
                MerkleState.UNHASHED,
                MerkleState.CANONICALIZED,
                "Produce canonical bytes.",
                ("cni://evidence/canonical-1",),
            ),
            StateDelta(
                StateAxis.CGRF_ACTION,
                CgrfActionState.OBSERVED,
                CgrfActionState.PROPOSED,
                "Propose bounded review.",
                ("cni://evidence/proposal-1",),
            ),
            StateDelta(
                StateAxis.SEMANTIC_TRANSACTION,
                SemanticTransactionState.DRAFT,
                SemanticTransactionState.PARSED,
                "Parse the transaction contract.",
                ("cni://evidence/parse-1",),
            ),
        )

    def test_five_deltas_apply_atomically_across_ten_axes(self) -> None:
        before = self.initial_state()
        after = apply_state_deltas(before, self.five_discovery_deltas())

        changed = {
            axis
            for axis in StateAxis
            if before.axis_value(axis) != after.axis_value(axis)
        }
        self.assertEqual(
            changed,
            {
                StateAxis.EVIDENCE,
                StateAxis.SHACL,
                StateAxis.MERKLE,
                StateAxis.CGRF_ACTION,
                StateAxis.SEMANTIC_TRANSACTION,
            },
        )
        self.assertEqual(len(after.to_dict()), 10)
        self.assertEqual(before.evidence_state, EvidenceState.UNMEASURED)

    def test_delta_order_does_not_change_atomic_result(self) -> None:
        before = self.initial_state()
        forward = apply_state_deltas(before, self.five_discovery_deltas())
        reverse = apply_state_deltas(
            before,
            reversed(self.five_discovery_deltas()),
        )
        self.assertEqual(forward, reverse)

    def test_five_interdependent_verification_deltas_commit_together(self) -> None:
        before = ObjectState(
            evidence_state=EvidenceState.TESTING,
            shacl_state=ShaclState.CONFORMS,
            merkle_state=MerkleState.ROOTED,
            cgrf_action_state=CgrfActionState.VERIFYING,
            tevv_state=TevvState.TESTING,
            semantic_transaction_state=SemanticTransactionState.VERIFYING,
            causal_state=CausalState.EXPERIMENTALLY_SUPPORTED,
            corpus_use_state=CorpusUseState.TESTED_IN_CITADEL,
            authority_tier=AuthorityTier.A2,
            lifecycle_state="ACTIVE",
        )
        deltas = (
            StateDelta(
                StateAxis.EVIDENCE,
                EvidenceState.TESTING,
                EvidenceState.VERIFIED,
                "Verification evidence passed.",
                ("cni://evidence/test-1",),
            ),
            StateDelta(
                StateAxis.CGRF_ACTION,
                CgrfActionState.VERIFYING,
                CgrfActionState.VERIFIED,
                "Independent postconditions passed.",
                ("cni://evidence/verifier-1",),
            ),
            StateDelta(
                StateAxis.TEVV,
                TevvState.TESTING,
                TevvState.PASS,
                "Defined TEVV assertions passed.",
                ("cni://evidence/tevv-1",),
            ),
            StateDelta(
                StateAxis.SEMANTIC_TRANSACTION,
                SemanticTransactionState.VERIFYING,
                SemanticTransactionState.VERIFIED,
                "The semantic transaction met every postcondition.",
                ("cni://evidence/transaction-1",),
            ),
            StateDelta(
                StateAxis.CAUSAL,
                CausalState.EXPERIMENTALLY_SUPPORTED,
                CausalState.VERIFIED_CAUSE,
                "Independent causal verification passed.",
                ("cni://evidence/causal-1",),
            ),
        )

        after = apply_state_deltas(before, reversed(deltas))

        self.assertEqual(after.evidence_state, EvidenceState.VERIFIED)
        self.assertEqual(after.cgrf_action_state, CgrfActionState.VERIFIED)
        self.assertEqual(after.tevv_state, TevvState.PASS)
        self.assertEqual(
            after.semantic_transaction_state,
            SemanticTransactionState.VERIFIED,
        )
        self.assertEqual(after.causal_state, CausalState.VERIFIED_CAUSE)

    def test_one_invalid_delta_rejects_the_entire_change_set(self) -> None:
        before = self.initial_state()
        invalid = (*self.five_discovery_deltas()[:4],)
        invalid += (
            StateDelta(
                StateAxis.SEMANTIC_TRANSACTION,
                SemanticTransactionState.DRAFT,
                SemanticTransactionState.AUTHORIZED,
                "Attempt an unsupported shortcut.",
                ("cni://evidence/proposal-1",),
            ),
        )
        with self.assertRaises(InvalidTransitionError):
            apply_state_deltas(before, invalid)
        self.assertEqual(before, self.initial_state())

    def test_stale_duplicate_and_cross_family_deltas_are_rejected(self) -> None:
        before = self.initial_state()
        stale = StateDelta(
            StateAxis.EVIDENCE,
            EvidenceState.OBSERVED,
            EvidenceState.INFERRED,
            "Use a stale observation.",
            ("cni://evidence/stale-1",),
        )
        with self.assertRaisesRegex(InvalidTransitionError, "stale"):
            apply_state_deltas(before, (stale,))
        with self.assertRaisesRegex(InvalidTransitionError, "each axis once"):
            apply_state_deltas(
                before,
                (
                    self.five_discovery_deltas()[0],
                    self.five_discovery_deltas()[0],
                ),
            )
        with self.assertRaisesRegex(TypeError, "EvidenceState"):
            StateDelta(
                StateAxis.EVIDENCE,
                ShaclState.NOT_EVALUATED,
                ShaclState.CONFORMS,
                "Mix state families.",
                ("cni://evidence/invalid-1",),
            )

    def test_verified_claims_require_consistent_final_axes(self) -> None:
        with self.assertRaisesRegex(ValueError, "TEVV PASS"):
            ObjectState(
                evidence_state=EvidenceState.VERIFIED,
                shacl_state=ShaclState.CONFORMS,
                merkle_state=MerkleState.ROOTED,
                cgrf_action_state=CgrfActionState.VERIFIED,
                tevv_state=TevvState.FAIL,
                semantic_transaction_state=SemanticTransactionState.VERIFIED,
                causal_state=CausalState.EXPERIMENTALLY_SUPPORTED,
                corpus_use_state=CorpusUseState.TESTED_IN_CITADEL,
                authority_tier=AuthorityTier.A2,
                lifecycle_state="ACTIVE",
            )

    def test_authority_and_open_lifecycle_do_not_self_promote(self) -> None:
        before = self.initial_state()
        authority = StateDelta(
            StateAxis.AUTHORITY,
            AuthorityTier.A1,
            AuthorityTier.A2,
            "Attempt self-promotion.",
            ("cni://evidence/request-1",),
        )
        lifecycle = StateDelta(
            StateAxis.LIFECYCLE,
            "CANDIDATE",
            "ACTIVE",
            "Attempt an undefined lifecycle edge.",
            ("cni://evidence/request-2",),
        )
        for delta in (authority, lifecycle):
            with self.subTest(axis=delta.axis):
                with self.assertRaisesRegex(
                    InvalidTransitionError,
                    "no automatic Phase 0 transition policy",
                ):
                    apply_state_deltas(before, (delta,))


if __name__ == "__main__":
    unittest.main()
