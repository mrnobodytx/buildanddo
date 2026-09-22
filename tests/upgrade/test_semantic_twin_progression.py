# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_semantic_twin_progression.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/semantic_twin/progression.py, tests/upgrade/test_semantic_twin_contracts.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/semantic_twin/progression.py; CONSUMES tests/upgrade/test_semantic_twin_contracts.py
# Intent:      Test invitation conflicts, exact evidence prerequisites, historical regressions and advisory impact without synthetic authority.
# ───────────────────────────────────────────────────────────────

"""Exercise developmental projections with explicitly synthetic owner envelopes."""

from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import timedelta

import libs.semantic_twin as t
from libs.semantic_twin.ingestion.serializer import object_leaf_digest
from libs.semantic_twin.progression import (
    Invitation,
    Prerequisite,
    ProgressionTarget,
    TwinCapture,
    capture_at,
    compare,
    describe,
    progression,
    resolve_invitations,
    search,
    traverse,
)
from tests.upgrade.test_semantic_twin_contracts import (
    NOW,
    evidence,
    object_envelope,
    sid,
    verification,
)

AT = NOW + timedelta(seconds=10)


def observed(name: str = "classroom") -> t.CanonicalObjectEnvelope:
    base = replace(object_envelope(), semantic_id=sid("service", name))
    return replace(
        base,
        state=replace(base.state, evidence_state=t.EvidenceState.OBSERVED),
        evidence=(evidence(base.subject, t.EvidenceKind.SOURCE, name),),
        claims=({"name": name, "declared_capability": "retain evidence"},),
    )


def verified(name: str = "classroom") -> t.CanonicalObjectEnvelope:
    base = observed(name)
    receipt = verification(base.subject)
    return replace(
        base,
        observed_time=AT,
        state=replace(
            base.state,
            evidence_state=t.EvidenceState.VERIFIED,
            tevv_state=t.TevvState.PASS,
        ),
        evidence=receipt.result.evidence,
        tevv=receipt.result,
        verification=receipt,
    )


def capture(*objects: t.CanonicalObjectEnvelope, **kw: object) -> TwinCapture:
    return TwinCapture(
        scope_id="synthetic/public", captured_at=AT, objects=objects, **kw
    )


def target(
    participant: t.CanonicalObjectEnvelope,
    model: t.CanonicalObjectEnvelope,
    requirement: t.CanonicalObjectEnvelope,
) -> ProgressionTarget:
    return ProgressionTarget(
        participant=participant.subject,
        source=model.source,
        declared_at=AT,
        current_label="A2",
        target_label="A3",
        model=model.subject,
        prerequisites=(
            Prerequisite(
                name="Independent outcome",
                subject=requirement.subject,
                next_action="Obtain independent outcome evidence.",
            ),
        ),
    )


class InvitationTests(unittest.TestCase):
    def test_any_canonical_entity_can_participate_without_a_provider_list(self) -> None:
        item = observed("future-component")
        invitation = Invitation(
            source=item.source,
            observed_at=AT,
            locator="existing-owner/anything",
            canonical_ids=(item.semantic_id,),
            owner=item.ownership.owner,
            semantic_classes=("FutureComponent", "OperationalUnit"),
        )
        graph = capture(item, invitations=(invitation, invitation))
        self.assertEqual(len(graph.invitations), 1)
        admission = resolve_invitations(graph)[0]
        self.assertEqual(admission["status"], "RESOLVED")
        self.assertEqual(admission["subject"], item.subject.to_dict())
        self.assertFalse(admission["authorized"])
        self.assertEqual(graph.objects, (item,))

    def test_missing_identity_or_owner_stays_unresolved(self) -> None:
        item = observed()
        invite = Invitation(source=item.source, observed_at=AT, locator="unresolved")
        for variant in (
            invite,
            replace(invite, canonical_ids=(item.semantic_id,)),
            replace(
                invite,
                owner=item.ownership.owner,
                canonical_ids=(sid("service", "absent"),),
            ),
        ):
            with self.subTest(variant=variant):
                result = resolve_invitations(capture(item, invitations=(variant,)))[0]
                self.assertEqual(result["status"], "UNRESOLVED")
                self.assertIsNone(result["subject"])

    def test_competing_aliases_and_owners_never_silently_merge(self) -> None:
        first, second = observed("first"), observed("second")
        invite = Invitation(
            source=first.source,
            observed_at=AT,
            locator="same-inventory-record",
            owner=first.ownership.owner,
            canonical_ids=(first.semantic_id,),
        )
        for other in (
            replace(invite, canonical_ids=(second.semantic_id,)),
            replace(invite, owner=sid("owner", "other")),
        ):
            results = resolve_invitations(
                capture(first, second, invitations=(invite, other))
            )
            self.assertTrue(
                all(
                    row["status"] == "CONFLICTING" and row["subject"] is None
                    for row in results
                )
            )
        self.assertEqual(
            resolve_invitations(
                capture(
                    first, invitations=(replace(invite, owner=sid("owner", "other")),)
                )
            )[0]["status"],
            "CONFLICTING",
        )

    def test_invalid_and_future_invitations_are_rejected(self) -> None:
        item = observed()
        invite = Invitation(source=item.source, observed_at=AT, locator="record")
        for update in (
            {"locator": ""},
            {"canonical_ids": (item.semantic_id, item.semantic_id)},
            {"semantic_classes": ("",)},
        ):
            with self.assertRaises(t.ContractError):
                replace(invite, **update)
        with self.assertRaises(t.ContractError):
            capture(
                item,
                invitations=(replace(invite, observed_at=AT + timedelta(seconds=1)),),
            )


class CaptureTests(unittest.TestCase):
    def test_canonical_round_trip_ordering_digests_and_no_mutation(self) -> None:
        first, second = observed(), observed("new")
        graph = capture(first, second)
        self.assertEqual(graph.digest, capture(second, first).digest)
        self.assertEqual(TwinCapture.from_json(graph.to_json()), graph)
        self.assertEqual(graph.digest, TwinCapture.from_dict(graph.to_dict()).digest)
        described = describe(graph, at=AT)
        self.assertEqual(described[0]["leaf_digest"], object_leaf_digest(first))
        self.assertEqual(described[0]["representation"], "DISCOVERED")
        self.assertEqual(described[0]["state"]["evidence_state"], "OBSERVED")
        self.assertIsNone(described[0]["granted_authority"])
        self.assertEqual(first.state.merkle_state, t.MerkleState.UNHASHED)
        changed = replace(first, claims=({"name": "changed"},))
        self.assertNotEqual(graph.digest, capture(changed, second).digest)
        output = graph.to_dict()
        output["objects"][0]["claims"].clear()
        self.assertTrue(graph.objects[0].claims)

    def test_future_object_and_nested_receipt_cannot_backdate_knowledge(self) -> None:
        with self.assertRaises(t.ContractError):
            capture(replace(observed(), observed_time=AT + timedelta(seconds=1)))
        proof = verified()
        with self.assertRaises(t.ContractError):
            TwinCapture(
                scope_id="scope",
                captured_at=NOW,
                objects=(replace(proof, observed_time=NOW),),
            )
        with self.assertRaises(t.ContractError):
            describe(capture(observed()), at=NOW)
        with self.assertRaises(t.ContractError):
            describe(capture(observed()), at=AT.replace(tzinfo=None))
        with self.assertRaises(t.ContractError):
            describe(capture(observed()), at=AT, max_age_seconds=0)

    def test_stale_conflicting_unknown_and_retired_are_not_healthy(self) -> None:
        item = observed()
        variants = [
            (object_envelope(), "UNMEASURED"),
            (
                replace(
                    item,
                    state=replace(
                        item.state, evidence_state=t.EvidenceState.CONTRADICTED
                    ),
                ),
                "CONFLICTING",
            ),
            (
                replace(
                    item,
                    state=replace(item.state, evidence_state=t.EvidenceState.RETIRED),
                ),
                "RETIRED",
            ),
            (replace(item, valid_time=t.ValidTime(valid_until=AT)), "STALE"),
            (
                replace(
                    item, valid_time=t.ValidTime(valid_from=AT + timedelta(seconds=10))
                ),
                "UNKNOWN",
            ),
            (
                replace(item, state=replace(item.state, lifecycle_state="DEGRADED")),
                "DEGRADED",
            ),
            (
                replace(item, runtime=t.Runtime("FAILED", (sid("observation"),))),
                "FAILED",
            ),
        ]
        for obj, condition in variants:
            with self.subTest(condition=condition):
                self.assertIn(condition, describe(capture(obj), at=AT)[0]["conditions"])
        # Recapture cannot renew the age of the underlying observations.
        later = replace(capture(item), captured_at=AT + timedelta(days=2))
        self.assertIn("STALE", describe(later, at=later.captured_at)[0]["conditions"])
        self.assertIn(
            "UNMEASURED",
            describe(capture(replace(object_envelope(), observed_time=None)), at=AT)[0][
                "conditions"
            ],
        )

    def test_capture_rejects_duplicate_entities_and_unresolved_graph_edges(
        self,
    ) -> None:
        item = observed()
        with self.assertRaises(t.ContractError):
            capture(item, item)
        relation = t.Relation(
            predicate=t.RelationPredicate.DEPENDS_ON,
            source=item.subject,
            source_type=item.object_type,
            target=sid("service", "missing"),
            target_type=t.EntityType.SERVICE,
            target_version="r1",
            evidence=(),
            confidence=None,
            state=t.EvidenceState.UNMEASURED,
        )
        with self.assertRaises(t.ContractError):
            capture(replace(item, relations=(relation,)))


class ProgressionTests(unittest.TestCase):
    def test_unresolved_owner_mapping_blocks_an_otherwise_ready_candidate(self) -> None:
        participant, model, proof = (
            observed("participant"),
            observed("model"),
            verified("proof"),
        )
        invite = Invitation(
            source=participant.source,
            observed_at=AT,
            locator="canonical-inventory",
            canonical_ids=(participant.semantic_id,),
            owner=sid("owner", "conflict"),
        )
        graph = capture(participant, model, proof, invitations=(invite,))
        result = progression(graph, target(participant, model, proof), at=AT)
        self.assertEqual(result["status"], "EVIDENCE_GAPS")
        self.assertIn(
            "Resolve the participant's conflicting or incomplete identity mapping.",
            result["blockers"],
        )

    def test_source_presence_and_provider_pass_do_not_meet_independent_verification(
        self,
    ) -> None:
        participant, model, proof = (
            observed("participant"),
            observed("model"),
            observed("proof"),
        )
        proof = replace(
            proof, claims=({"status": "PASS", "provider": "future-provider"},)
        )
        goal = target(participant, model, proof)
        result = progression(capture(participant, model, proof), goal, at=AT)
        self.assertEqual(result["status"], "EVIDENCE_GAPS")
        self.assertEqual(result["requirements"][0]["evidence_state"], "OBSERVED")
        self.assertFalse(result["requirements"][0]["satisfied"])
        self.assertIn("Obtain independent outcome evidence.", result["blockers"])
        self.assertIsNone(result["authority_ceiling"])

    def test_verified_evidence_only_yields_an_advisory_review_candidate(self) -> None:
        participant, model, proof = (
            observed("participant"),
            observed("model"),
            verified("proof"),
        )
        goal = replace(
            target(participant, model, proof), current_label="A4", target_label="A5"
        )
        result = progression(capture(participant, model, proof), goal, at=AT)
        self.assertEqual(result["status"], "REVIEW_CANDIDATE")
        self.assertEqual(result["declared_current_level"], "A4")
        self.assertEqual(result["required_authority"], "A1")
        self.assertFalse(result["promoted"])
        self.assertFalse(result["authorized"])
        self.assertIsNone(result["authority_ceiling"])
        self.assertEqual(ProgressionTarget.from_json(goal.to_json()), goal)

    def test_unknown_model_empty_prerequisites_and_unknown_participant_are_gaps(
        self,
    ) -> None:
        participant, model, proof = (
            observed("participant"),
            observed("model"),
            verified("proof"),
        )
        goal = target(participant, model, proof)
        for variant in (
            replace(goal, current_label=None, model=None),
            replace(goal, prerequisites=()),
            replace(goal, participant=t.SubjectRef(sid("service", "absent"), "r1")),
        ):
            result = progression(capture(participant, model, proof), variant, at=AT)
            self.assertEqual(result["status"], "EVIDENCE_GAPS")
            self.assertTrue(result["blockers"])
        with self.assertRaises(t.ContractError):
            replace(goal, model=None)

    def test_wrong_revision_staleness_retirement_and_missing_proof_block_progress(
        self,
    ) -> None:
        participant, model, proof = (
            observed("participant"),
            observed("model"),
            verified("proof"),
        )
        goal = target(participant, model, proof)
        wrong = replace(
            goal,
            prerequisites=(
                replace(
                    goal.prerequisites[0], subject=t.SubjectRef(proof.semantic_id, "r2")
                ),
            ),
        )
        result = progression(capture(participant, model, proof), wrong, at=AT)
        self.assertIn("CONFLICTING", result["requirements"][0]["conditions"])
        self.assertFalse(result["requirements"][0]["satisfied"])
        result = progression(capture(participant, model), goal, at=AT)
        self.assertEqual(result["requirements"][0]["conditions"], ["UNMEASURED"])
        result = progression(
            capture(participant, model, proof), goal, at=AT + timedelta(days=2)
        )
        self.assertEqual(result["status"], "EVIDENCE_GAPS")
        self.assertIn("STALE", result["requirements"][0]["conditions"])
        self.assertIn(
            "Refresh the owner's progression declaration.", result["blockers"]
        )
        retired = replace(
            participant,
            state=replace(participant.state, evidence_state=t.EvidenceState.RETIRED),
        )
        self.assertEqual(
            progression(capture(retired, model, proof), goal, at=AT)["status"],
            "EVIDENCE_GAPS",
        )

    def test_invalid_duplicate_and_future_requirements_cannot_relax_gates(self) -> None:
        participant, model = observed(), observed("model")
        goal = target(participant, model, participant)
        for states in (
            (),
            (t.EvidenceState.UNMEASURED,),
            (t.EvidenceState.VERIFIED,) * 2,
        ):
            with self.assertRaises(t.ContractError):
                replace(goal.prerequisites[0], accepted_states=states)
        with self.assertRaises(t.ContractError):
            replace(goal, prerequisites=goal.prerequisites * 2)
        with self.assertRaises(t.ContractError):
            progression(
                capture(participant, model),
                replace(goal, declared_at=AT + timedelta(seconds=1)),
                at=AT,
            )


class QueryHistoryTests(unittest.TestCase):
    def test_identity_mapping_changes_remain_in_the_temporal_delta(self) -> None:
        item = observed()
        invite = Invitation(source=item.source, observed_at=AT, locator="owner-record")
        before = capture(item, invitations=(invite,))
        after = replace(
            before,
            captured_at=AT + timedelta(hours=1),
            invitations=(
                replace(
                    invite,
                    canonical_ids=(item.semantic_id,),
                    owner=item.ownership.owner,
                ),
            ),
        )
        delta = compare(before, after)
        self.assertEqual(delta["changes"], [])
        self.assertTrue(delta["invitations_changed"])
        self.assertEqual(delta["before_admission"][0]["status"], "UNRESOLVED")
        self.assertEqual(delta["after_admission"][0]["status"], "RESOLVED")

    def graph(self) -> TwinCapture:
        a, b, c = observed("a"), observed("b"), observed("c")

        def linked(
            source: t.CanonicalObjectEnvelope, destination: t.CanonicalObjectEnvelope
        ) -> t.CanonicalObjectEnvelope:
            relation = t.Relation(
                predicate=t.RelationPredicate.DEPENDS_ON,
                source=source.subject,
                source_type=source.object_type,
                target=destination.semantic_id,
                target_type=destination.object_type,
                target_version=destination.source.version,
                evidence=(),
                confidence=None,
                state=t.EvidenceState.UNMEASURED,
            )
            return replace(source, relations=(relation,))

        return capture(linked(a, b), linked(b, c), linked(c, a))

    def test_cycles_dependencies_and_reverse_impacts_retain_edge_evidence(self) -> None:
        graph = self.graph()
        result = traverse(graph, sid("service", "a"))
        self.assertEqual(
            [row["subject"] for row in result["paths"]],
            ["cni://service/b", "cni://service/c"],
        )
        self.assertEqual(len(result["paths"][1]["path"]), 2)
        self.assertEqual(result["paths"][0]["path"][0]["state"], "UNMEASURED")
        self.assertFalse(result["causal_proof"])
        self.assertEqual(
            traverse(graph, sid("service", "a"), reverse=True)["paths"][0]["subject"],
            "cni://service/c",
        )
        self.assertTrue(traverse(graph, sid("service", "a"), limit=1)["truncated"])
        for kwargs in ({"limit": 0}, {"predicates": ()}, {"predicates": ("invented",)}):
            with self.assertRaises(t.ContractError):
                traverse(graph, sid("service", "a"), **kwargs)
        with self.assertRaises(t.ContractError):
            traverse(graph, sid("service", "unknown"))

    def test_search_finds_capabilities_and_preserves_known_gaps(self) -> None:
        graph = self.graph()
        result = search(graph, "retain evidence", at=AT, limit=1)
        self.assertEqual(len(result["matches"]), 1)
        self.assertTrue(result["truncated"])
        self.assertEqual(search(graph, "not in this capture", at=AT)["matches"], [])
        gap = replace(
            object_envelope(),
            claims=({"name": "missing capability"},),
            observed_time=None,
        )
        result = search(capture(gap), "missing", at=AT)
        self.assertIn("UNMEASURED", result["matches"][0]["conditions"])
        self.assertIsNone(result["matches"][0]["observed_at"])
        self.assertFalse(result["authorized"])
        for query, limit in (("", 1), ("x", 0), ("x", 1001)):
            with self.assertRaises(t.ContractError):
                search(graph, query, at=AT, limit=limit)

    def test_history_returns_retained_captures_and_detects_conflicts(self) -> None:
        first = capture(observed())
        later = replace(first, captured_at=AT + timedelta(hours=1))
        self.assertEqual(
            capture_at((later, first, first), scope_id=first.scope_id, at=AT), first
        )
        self.assertEqual(
            capture_at((first, later), scope_id=first.scope_id, at=later.captured_at),
            later,
        )
        for history, scope, when in (
            ((), first.scope_id, AT),
            ((first,), "other", AT),
            ((first,), first.scope_id, NOW),
            ((first, replace(first, objects=())), first.scope_id, AT),
        ):
            with self.assertRaises(t.ContractError):
                capture_at(history, scope_id=scope, at=when)

    def test_deltas_retain_regressions_staleness_and_absence_without_fictitious_retirement(
        self,
    ) -> None:
        first = capture(verified())
        regressed = replace(
            first,
            captured_at=AT + timedelta(hours=1),
            objects=(observed(), observed("new")),
        )
        result = compare(first, regressed)
        self.assertTrue(result["changes"][0]["regression_signal"])
        self.assertEqual(
            result["changes"][0]["before_state"]["evidence_state"], "VERIFIED"
        )
        self.assertEqual(result["changes"][1]["kind"], "DISCOVERED")
        self.assertEqual(
            compare(first, replace(first, captured_at=AT + timedelta(seconds=1)))[
                "changes"
            ],
            [],
        )
        removed = compare(
            first, replace(first, captured_at=AT + timedelta(hours=1), objects=())
        )
        self.assertEqual(removed["changes"][0]["kind"], "UNTARGETED")
        self.assertEqual(
            removed["changes"][0]["conditions"], ["UNTARGETED", "UNMEASURED"]
        )
        aged = compare(first, replace(first, captured_at=AT + timedelta(days=2)))
        self.assertEqual(aged["changes"][0]["changed_fields"], ["conditions"])
        self.assertTrue(aged["changes"][0]["regression_signal"])
        self.assertEqual(
            capture_at((first, regressed), scope_id=first.scope_id, at=AT)
            .objects[0]
            .state.evidence_state,
            t.EvidenceState.VERIFIED,
        )
        for later in (first, replace(regressed, scope_id="other")):
            with self.assertRaises(t.ContractError):
                compare(first, later)


if __name__ == "__main__":
    unittest.main()
