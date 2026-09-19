# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_semantic_twin_contracts.py
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
# EnumEdges:   VALIDATES libs/semantic_twin/identity.py; VALIDATES libs/semantic_twin/merkle.py; VALIDATES libs/semantic_twin/contracts.py; VALIDATES libs/semantic_twin/models.py; VALIDATES libs/semantic_twin/receipts.py; VALIDATES libs/semantic_twin/relations.py; VALIDATES libs/semantic_twin/transactions.py; VALIDATES libs/semantic_twin/promotions.py; VALIDATES libs/semantic_twin/transitions.py; VALIDATES libs/semantic_twin/schema.py
# DAG Node:    semantic-twin.phase-0.contract-tests
# Intent:      Reproduce the audited gaps and prove scoped evidence, wire compatibility and governed transaction contract behavior.
# ───────────────────────────────────────────────────────────────

"""Test contract behavior using local fixtures, never claim real-world verification."""

from __future__ import annotations

import unittest
from dataclasses import FrozenInstanceError, replace
from datetime import datetime, timedelta, timezone

import libs.semantic_twin as t
from libs.semantic_twin.schema import canonical_schema

NOW = datetime(2026, 9, 19, 1, tzinfo=timezone.utc)
SHA = "a" * 40
PRE = "source exists"
POST = "required postconditions hold"


def sid(namespace: str, name: str = "one") -> t.SemanticId:
    return t.SemanticId(f"cni://{namespace}/{name}")


SERVICE = t.SubjectRef(sid("service", "classroom"), "r1")
TRANSACTION = t.SubjectRef(sid("transaction", "change-1"), "r1")
ACTOR = sid("agent", "producer")
EXECUTOR = sid("agent", "executor")
VERIFIER = sid("verifier", "independent")


def evidence(
    subject: t.SubjectRef = SERVICE,
    kind: t.EvidenceKind = t.EvidenceKind.TEST,
    name: str = "test-1",
) -> t.EvidenceReference:
    return t.EvidenceReference(
        sid("evidence", name),
        subject,
        kind,
        t.SemanticId(f"git://buildanddo/file/{SHA}/source.py"),
        NOW,
    )


def state(**updates: object) -> t.ObjectState:
    initial = t.ObjectState(
        evidence_state=t.EvidenceState.UNMEASURED,
        shacl_state=t.ShaclState.NOT_EVALUATED,
        merkle_state=t.MerkleState.UNHASHED,
        cgrf_action_state=t.CgrfActionState.OBSERVED,
        tevv_state=t.TevvState.NOT_TESTED,
        semantic_transaction_state=t.SemanticTransactionState.DRAFT,
        causal_state=t.CausalState.TEMPORAL_ONLY,
        corpus_use_state=t.CorpusUseState.DISCOVERY_ONLY,
        authority_tier=t.AuthorityTier.A1,
        lifecycle_state="CANDIDATE",
    )
    return replace(initial, **updates)


def shape(subject: t.SubjectRef = SERVICE) -> t.ShaclValidationResult:
    return t.ShaclValidationResult(
        sid("receipt", "shacl"),
        subject,
        t.ShaclState.CONFORMS,
        (sid("shape", "service-v2"),),
        "ontology/1",
        sid("agent", "shacl-engine"),
        NOW,
    )


def verification(
    subject: t.SubjectRef = SERVICE,
    *,
    refs: tuple[t.EvidenceReference, ...] | None = None,
    method: t.VerificationMethod = t.VerificationMethod.TEST,
    tier: t.AuthorityTier = t.AuthorityTier.A1,
    targets: tuple[t.SemanticId, ...] | None = None,
    check: str = POST,
) -> t.VerificationReceipt:
    kinds = {
        t.VerificationMethod.TEST: t.EvidenceKind.TEST,
        t.VerificationMethod.DETERMINISTIC: t.EvidenceKind.DETERMINISTIC_PROOF,
        t.VerificationMethod.EXPERIMENT: t.EvidenceKind.EXPERIMENT,
        t.VerificationMethod.REPLAY: t.EvidenceKind.REPLAY,
    }
    refs = refs if refs is not None else (evidence(subject, kinds[method]),)
    policy = t.PolicyDecisionReceipt(
        decision_id=sid("receipt", "policy"),
        subject=subject,
        actor_id=ACTOR,
        policy_id=sid("policy", "bounded-change"),
        policy_version="policy/1",
        tier=tier,
        allowed=True,
        target_ids=targets or (subject.semantic_id,),
        approved_tools=("local-adapter",),
        evaluated_at=NOW + timedelta(seconds=2),
        reason="Policy permits the bounded contract.",
        direct_verifier_id=VERIFIER
        if method is t.VerificationMethod.DETERMINISTIC
        else None,
        evidence=refs,
        preconditions=(t.PostconditionResult(PRE, True, (refs[0].evidence_id,)),),
    )
    result = t.TevvResult(
        result_id=sid("test-run", "bounded"),
        subject=subject,
        actor_id=ACTOR,
        verifier_id=VERIFIER,
        policy_version="policy/1",
        state=t.TevvState.PASS,
        method=method,
        evaluated_at=NOW + timedelta(seconds=4),
        evidence=refs,
        checks=(
            t.PostconditionResult(check, True, tuple(e.evidence_id for e in refs)),
        ),
    )
    return t.VerificationReceipt(
        sid("receipt", "verification"), subject, policy, result
    )


def merkle(subject: t.SubjectRef = SERVICE) -> t.MerkleBinding:
    serialization = t.CanonicalSerialization()
    digest = t.ContentDigest("b" * 64)
    epoch_id = sid("epoch", "bounded")
    leaf = t.MerkleLeaf(subject, digest, serialization, epoch_id, NOW, ACTOR)
    root = t.MerkleRoot(digest, epoch_id, 1)
    epoch = t.MerkleEpoch(
        epoch_id,
        t.EpochBoundary(
            t.EpochScope.KNOWLEDGE, sid("system", "twin"), t.ValidTime(NOW)
        ),
        root,
        serialization,
        NOW,
        ACTOR,
    )
    proof = t.InclusionProof(digest, root, 0, ())
    receipt = t.InclusionVerificationReceipt(
        sid("receipt", "proof-verification"),
        subject,
        proof,
        VERIFIER,
        NOW,
        "valid",
        "proof-check/1",
    )
    return t.MerkleBinding(leaf=leaf, epoch=epoch, proof=proof, proof_receipt=receipt)


def relation(subject: t.SubjectRef = SERVICE) -> t.Relation:
    return t.Relation(
        predicate=t.RelationPredicate.DEPENDS_ON,
        source=subject,
        source_type=t.EntityType.SERVICE,
        target=sid("service", "identity"),
        target_type=t.EntityType.SERVICE,
        target_version="r1",
        evidence=(evidence(subject, t.EvidenceKind.STATIC_ANALYSIS, "static"),),
        confidence=0.9,
        state=t.EvidenceState.INFERRED,
    )


def roots(value: str = "b") -> t.StateRoots:
    return t.StateRoots(
        t.SemanticRoot(value * 64), t.SourceRoot("c" * 64), t.ContextRoot("d" * 64)
    )


def transaction(
    stage: t.SemanticTransactionState = t.SemanticTransactionState.VERIFIED,
) -> t.SemanticTransaction:
    inp = evidence(TRANSACTION, t.EvidenceKind.SOURCE, "input")
    refs = (inp, evidence(TRANSACTION))
    verdict = verification(
        TRANSACTION, refs=refs, tier=t.AuthorityTier.A2, targets=(SERVICE.semantic_id,)
    )
    before = roots()
    contract = t.ChangeContract(
        operation_id="op-1",
        correlation_id="correlation-1",
        parent_op_id=None,
        objective_id=sid("objective"),
        mission_id=sid("mission"),
        actor_id=ACTOR,
        actor_type=t.ActorType.AGENT,
        executor_id=EXECUTOR,
        verifier_id=VERIFIER,
        authority_tier=t.AuthorityTier.A2,
        policy_version="policy/1",
        target_ids=(SERVICE.semantic_id,),
        tool_or_adapter="local-adapter",
        requested_action="Update the bounded source relation.",
        reason="Correct the source model.",
        input_evidence=(inp,),
        preconditions=(PRE,),
        postconditions=(POST,),
        forbidden_side_effects=("external writes",),
        rollback_or_compensation=t.CompensationPlan(
            "Restore the prior relation.",
            (SERVICE.semantic_id,),
            ("prior relation restored",),
        ),
        expected_outputs=("versioned relation",),
        semantic_transaction_id=TRANSACTION.semantic_id,
        source_sha=SHA,
        context_root=before.context_root,
        requested_at=NOW + timedelta(seconds=1),
    )
    execution = t.ExecutionReceipt(
        sid("receipt", "execution"),
        "op-1",
        TRANSACTION,
        EXECUTOR,
        "local-adapter",
        t.SourceRevision(SHA),
        t.ExecutionOutcome.MUTATED,
        NOW + timedelta(seconds=3),
        (evidence(TRANSACTION, t.EvidenceKind.EXECUTION, "execution"),),
    )
    return t.SemanticTransaction(
        schema_version="2",
        transaction_id=TRANSACTION.semantic_id,
        revision=TRANSACTION.version,
        actor=t.Actor(ACTOR, t.ActorType.AGENT, sid("persona", "forge")),
        intent=t.TransactionIntent(
            "Update the relation.", (SERVICE,), sid("objective"), sid("mission")
        ),
        before=before,
        proposal=t.ChangeProposal(add=(relation(),)),
        state=stage,
        shacl=shape(TRANSACTION),
        authority=contract,
        policy=verdict.policy,
        evidence=refs,
        execution=execution,
        verification=verdict,
        after=roots("e"),
    )


def object_envelope() -> t.CanonicalObjectEnvelope:
    return t.CanonicalObjectEnvelope(
        semantic_id=SERVICE.semantic_id,
        object_type=t.EntityType.SERVICE,
        schema_version="2",
        source=t.Source(
            "git", "apps/web/classroom", repository="buildanddo", document_version="r1"
        ),
        valid_time=t.ValidTime(NOW),
        observed_time=NOW,
        state=state(),
        claims=(),
        relations=(),
        provenance=t.Provenance(
            (t.SemanticId(f"git://buildanddo/file/{SHA}/source.py"),)
        ),
        merkle=t.MerkleBinding(),
        ownership=t.Ownership(sid("owner", "guild")),
        authority=t.Authority(t.AuthorityTier.A1, "versioned"),
        runtime=t.Runtime(),
        documentation=t.Documentation(),
    )


def event_envelope() -> t.CanonicalEventEnvelope:
    verdict = verification()
    ref = verdict.result.evidence[0]
    return t.CanonicalEventEnvelope(
        id=sid("event", "measured"),
        type="semantic.claim.verified",
        version="2",
        tenant_id="public-demo",
        occurred_at=NOW + timedelta(seconds=5),
        subject=t.EventSubject(
            t.EntityType.SERVICE, SERVICE.semantic_id, SERVICE.version
        ),
        context=t.EventContext(),
        data={"observations": [{"passed": True}]},
        evidence=t.EventEvidence(
            ref.evidence_id, t.EvidenceState.VERIFIED, ref, verdict
        ),
    )


class IdentityTests(unittest.TestCase):
    def test_registered_namespaces_round_trip_and_normalize(self) -> None:
        samples = (
            "CNI://SERVICE/%63lassroom",
            f"ext-git://GitHub.com/org/repo@{SHA}/file.py#name",
            f"git://repo/commit/{SHA}",
            "doc://architecture/v1/section-2",
            "datadog://trace/123",
            "posthog://event/123",
            "nats://subject/citadel.bits.smoke.passed",
            "sbom://component/pkg",
            "cni://service/caf%C3%A9",
        )
        for value in samples:
            with self.subTest(value=value):
                parsed = t.SemanticId.parse(value)
                self.assertEqual(t.SemanticId(parsed), parsed)
                self.assertEqual(
                    t.SubjectRef.from_json(t.SubjectRef(parsed, "v1").to_json()),
                    t.SubjectRef(parsed, "v1"),
                )
        self.assertEqual(t.SemanticId(samples[0]), "cni://service/classroom")
        self.assertEqual(t.SemanticId("cni://service/café"), t.SemanticId(samples[-1]))

    def test_ambiguous_or_unqualified_identifiers_fail(self) -> None:
        bad = (
            "not-a-semantic-id",
            "https://example.com/a",
            "cni://invented/id",
            "cni://service/",
            "cni://service/a//b",
            "cni://service/../x",
            "cni://service/%2e%2e/x",
            "cni://service/a%2fb",
            "cni://service/a%00",
            "cni://service/a%xx",
            "cni://service/a?secret=1",
            "cni://service/a#x",
            "cni://service/a?",
            "cni://user@service/a",
            "cni://service:80/a",
            "cni://service/a b",
            "cni://service/a\\b",
            "ext-git://github.com/org/repo@main/file",
            "doc://doc/section",
            "git://repo/unknown/a",
            "nats://subject/wild.*",
            "cni://[invalid/a",
        )
        for value in bad:
            with self.subTest(value=value), self.assertRaises(t.ContractError):
                t.SemanticId(value)
        with self.assertRaises(t.ContractError):
            t.SubjectRef(SERVICE.semantic_id, "")
        with self.assertRaises(TypeError):
            t.NAMESPACE_REGISTRY["invented"] = frozenset()

    def test_cni_entity_namespaces_match_declared_types(self) -> None:
        self.assertEqual(set(t.ENTITY_NAMESPACES), set(t.EntityType))
        for entity, namespace in t.ENTITY_NAMESPACES.items():
            sid(namespace).require_entity_type(entity)
        with self.assertRaises(t.ContractError):
            SERVICE.semantic_id.require_entity_type(t.EntityType.PERSON)


class WireTests(unittest.TestCase):
    def test_envelope_transaction_and_nested_contract_round_trips(self) -> None:
        for value in (
            object_envelope(),
            event_envelope(),
            transaction(),
            merkle(),
            shape(),
            verification(),
        ):
            with self.subTest(type=type(value).__name__):
                self.assertEqual(type(value).from_dict(value.to_dict()), value)
                self.assertEqual(type(value).from_json(value.to_json()), value)
        self.assertEqual(t.SCHEMA_VERSION, "2")
        self.assertEqual(
            object_envelope().to_dict()["valid_time"]["from"], NOW.isoformat()
        )

    def test_rejects_unknown_missing_version_and_type_errors(self) -> None:
        base = object_envelope().to_dict()
        for change in (
            {"schema_version": "1"},
            {"schema_version": "999"},
            {"extra": True},
            {"object_type": "Anything"},
            {"semantic_id": "not-a-semantic-id"},
            {"source": {"system": "git"}},
            {"schema_version": 2},
        ):
            with self.subTest(change=change), self.assertRaises(t.ContractError):
                t.CanonicalObjectEnvelope.from_dict({**base, **change})
        missing = dict(base)
        del missing["provenance"]
        with self.assertRaises(t.ContractError):
            t.CanonicalObjectEnvelope.from_dict(missing)
        for data in (
            '{"x":1,"x":2}',
            '{"value":NaN}',
            "[1,2]",
            "{broken",
            '{"x":Infinity}',
        ):
            with self.subTest(data=data), self.assertRaises(t.ContractError):
                t.CanonicalObjectEnvelope.from_json(data)
        with self.assertRaises(t.ContractError):
            replace(object_envelope(), state={"evidence_state": "VERIFIED"})
        with self.assertRaises(t.ContractError):
            state(evidence_state="UNMEASURED")

    def test_deep_immutability_and_detached_wire_output(self) -> None:
        data = {"nested": [{"count": 1}]}
        event = replace(event_envelope(), data=data)
        data["nested"][0]["count"] = 2
        self.assertEqual(event.data["nested"][0]["count"], 1)
        output = event.to_dict()
        output["data"]["nested"][0]["count"] = 3
        self.assertEqual(event.data["nested"][0]["count"], 1)
        with self.assertRaises(TypeError):
            event.data["nested"][0]["count"] = 3
        with self.assertRaises(FrozenInstanceError):
            event.type = "changed"
        cycle = []
        cycle.append(cycle)
        for data in (
            {"bad": cycle},
            {"bad": object()},
            {"bad": float("nan")},
            {1: "non-string key"},
            {"bad": float("inf")},
        ):
            with (
                self.subTest(data_type=type(data).__name__),
                self.assertRaises(t.ContractError),
            ):
                replace(event, data=data)
        claims = [{"nested": [1]}]
        obj = replace(object_envelope(), claims=claims)
        claims[0]["nested"].append(2)
        self.assertEqual(obj.claims[0]["nested"], (1,))

    def test_timestamp_normalization_and_intervals(self) -> None:
        offset = NOW.astimezone(timezone(timedelta(hours=-5)))
        self.assertEqual(t.ValidTime(offset).to_json(), t.ValidTime(NOW).to_json())
        for value in (datetime(2026, 1, 1), "not-a-timestamp"):
            with self.assertRaises(t.ContractError):
                t.ValidTime(value)
        with self.assertRaises(t.ContractError):
            t.ValidTime(NOW, NOW - timedelta(seconds=1))
        with self.assertRaises(t.ContractError):
            t.ValidTime.from_dict({"from": "invalid"})

    def test_structural_schema_has_no_unresolved_references(self) -> None:
        schema = canonical_schema()
        self.assertEqual(schema, canonical_schema())
        self.assertEqual(len(schema["oneOf"]), 4)
        self.assertEqual(
            schema["$defs"]["CanonicalObjectEnvelope"]["properties"]["schema_version"],
            {"enum": ["2"]},
        )
        self.assertIn("allOf", schema["$defs"]["StateDelta"])

        def walk(value: object) -> None:
            if isinstance(value, dict):
                if "$ref" in value:
                    self.assertIn(value["$ref"].split("/")[-1], schema["$defs"])
                for child in value.values():
                    walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)

        walk(schema)
        schema["$defs"].clear()
        self.assertTrue(canonical_schema()["$defs"])


class MerkleTests(unittest.TestCase):
    def test_state_specific_metadata_and_replay_round_trip(self) -> None:
        binding = merkle()
        attestation = t.Attestation(
            sid("attestation"),
            binding.root_digest,
            sid("agent", "signer"),
            sid("receipt", "signature"),
            NOW,
        )
        for label, value in (
            (t.MerkleState.UNHASHED, t.MerkleBinding()),
            (
                t.MerkleState.CANONICALIZED,
                t.MerkleBinding(serialization=t.CanonicalSerialization()),
            ),
            (t.MerkleState.LEAF_HASHED, t.MerkleBinding(leaf=binding.leaf)),
            (t.MerkleState.ROOTED, binding),
            (t.MerkleState.INCLUSION_PROVEN, binding),
            (t.MerkleState.ATTESTED, replace(binding, attestation=attestation)),
            (
                t.MerkleState.STALE,
                replace(binding, successor_root=t.ContentDigest("f" * 64)),
            ),
            (
                t.MerkleState.SUPERSEDED,
                replace(binding, successor_root=t.ContentDigest("f" * 64)),
            ),
            (t.MerkleState.CORRUPT, t.MerkleBinding(reason="Proof comparison failed.")),
            (t.MerkleState.QUARANTINED, t.MerkleBinding(reason="Untrusted producer.")),
        ):
            with self.subTest(state=label):
                value.validate_state(label, SERVICE)
                self.assertEqual(t.MerkleBinding.from_json(value.to_json()), value)

    def test_digest_types_algorithms_and_canonical_profile(self) -> None:
        for cls in (
            t.ContentDigest,
            t.PayloadDigest,
            t.ArtifactDigest,
            t.DeploymentDigest,
            t.ContextRoot,
            t.SemanticRoot,
            t.SourceRoot,
            t.EvidenceRoot,
            t.ParentRoot,
        ):
            with self.subTest(cls=cls.__name__):
                self.assertEqual(
                    cls.from_dict(cls("f" * 128, t.HashAlgorithm.SHA512).to_dict()),
                    cls("f" * 128, t.HashAlgorithm.SHA512),
                )
        self.assertNotEqual(t.ArtifactDigest("b" * 64), t.PayloadDigest("b" * 64))
        for digest in ("bad", "a" * 40, "B" * 64, "g" * 64):
            with self.assertRaises(t.ContractError):
                t.ContentDigest(digest)
        with self.assertRaises(t.ContractError):
            t.SourceRevision("abc123")
        with self.assertRaises(t.ContractError):
            t.MerkleLeaf(
                SERVICE,
                t.ArtifactDigest("b" * 64),
                t.CanonicalSerialization(),
                sid("epoch"),
                NOW,
                ACTOR,
            )
        for fields in (
            {"version": "future"},
            {"excluded_volatile_fields": ("state",)},
            {"included_fields": ("x", "x")},
            {"included_fields": ("x",), "excluded_volatile_fields": ("x",)},
        ):
            with self.subTest(fields=fields), self.assertRaises(t.ContractError):
                t.CanonicalSerialization(**fields)

    def test_proof_epoch_and_binding_disagreement_rejected(self) -> None:
        binding = merkle()
        for label in t.MerkleState:
            if label is not t.MerkleState.UNHASHED:
                with self.subTest(state=label), self.assertRaises(t.ContractError):
                    t.MerkleBinding().validate_state(label, SERVICE)
        with self.assertRaises(t.ContractError):
            binding.validate_state(t.MerkleState.UNHASHED, SERVICE)
        with self.assertRaises(t.ContractError):
            binding.validate_state(t.MerkleState.CANONICALIZED, SERVICE)
        with self.assertRaises(t.ContractError):
            binding.validate_state(t.MerkleState.LEAF_HASHED, SERVICE)
        with self.assertRaises(t.ContractError):
            binding.validate_state(t.MerkleState.ROOTED, replace(SERVICE, version="r2"))
        for changes in (
            {"leaf_digest": t.ContentDigest("f" * 64)},
            {"epoch_id": sid("epoch", "other")},
            {"root_digest": t.ContentDigest("f" * 64)},
        ):
            with self.assertRaises(t.ContractError):
                replace(binding, **changes)
        with self.assertRaises(t.ContractError):
            replace(binding, proof_receipt=None).validate_state(
                t.MerkleState.INCLUSION_PROVEN, SERVICE
            )
        with self.assertRaises(t.ContractError):
            replace(binding, proof_receipt=sid("receipt", "unbound"))
        with self.assertRaises(t.ContractError):
            replace(
                binding,
                proof_receipt=replace(
                    binding.proof_receipt, subject=replace(SERVICE, version="r2")
                ),
            )
        with self.assertRaises(t.ContractError):
            replace(
                binding, proof_receipt=replace(binding.proof_receipt, result="mismatch")
            ).validate_state(t.MerkleState.INCLUSION_PROVEN, SERVICE)
        with self.assertRaises(t.ContractError):
            replace(binding.epoch, epoch_id=sid("epoch", "other"))
        with self.assertRaises(t.ContractError):
            replace(binding.epoch, parent_root=t.ParentRoot(binding.root_digest.value))
        with self.assertRaises(t.ContractError):
            replace(binding.epoch, created_at=NOW - timedelta(seconds=1))
        with self.assertRaises(t.ContractError):
            replace(
                binding.epoch,
                successor_root=t.ContentDigest("f" * 128, t.HashAlgorithm.SHA512),
            )

    def test_binary_proof_directions_and_leaf_counts(self) -> None:
        root = t.MerkleRoot(t.ContentDigest("f" * 64), sid("epoch"), 2)
        leaf = t.ContentDigest("b" * 64)
        proof = t.InclusionProof(leaf, root, 1, (t.ProofStep(t.ProofSide.LEFT, leaf),))
        self.assertEqual(t.InclusionProof.from_json(proof.to_json()), proof)
        for changes in (
            {"leaf_index": 2},
            {"path": ()},
            {"path": (t.ProofStep(t.ProofSide.RIGHT, leaf),)},
            {"leaf_digest": t.ContentDigest("f" * 128, t.HashAlgorithm.SHA512)},
        ):
            with self.assertRaises(t.ContractError):
                replace(proof, **changes)
        with self.assertRaises(t.ContractError):
            replace(root, leaf_count=True)
        with self.assertRaises(t.ContractError):
            replace(root, leaf_count=0)
        with self.assertRaises(t.ContractError):
            t.MerkleNode(leaf, ())
        self.assertEqual(
            t.MerkleNode.from_dict(t.MerkleNode(leaf, (leaf,)).to_dict()),
            t.MerkleNode(leaf, (leaf,)),
        )


def causal(
    subject: t.SubjectRef = TRANSACTION,
    stage: t.CausalState = t.CausalState.VERIFIED_CAUSE,
) -> t.CausalSupport:
    temporal = evidence(subject, t.EvidenceKind.OBSERVATION, "temporal")
    experiment = evidence(subject, t.EvidenceKind.EXPERIMENT, "experiment")
    test = evidence(subject)
    refs = (temporal, experiment, test)
    return t.CausalSupport(
        subject,
        stage,
        refs,
        temporal_evidence=(temporal,),
        mechanism="Changing the input changes the bounded outcome.",
        hypothesis_id=sid("hypothesis", "bounded"),
        confounder_assessment="Controlled the remaining inputs.",
        alternatives=("shared input",),
        experiments=(experiment,),
        measured_outcome="Recorded the response to intervention.",
        contradiction_assessment="No unresolved contradictory evidence in scope.",
        verification=verification(subject, refs=refs),
    )


def corpus(
    stage: t.CorpusUseState = t.CorpusUseState.VERIFIED_FOR_CITADEL,
) -> t.CorpusValidation:
    experiment = replace(
        evidence(SERVICE, t.EvidenceKind.EXPERIMENT, "citadel-test"),
        source=SERVICE.semantic_id,
    )
    return t.CorpusValidation(
        SERVICE,
        stage,
        t.SemanticId(f"ext-git://github.com/example/sample@{SHA}/source.py"),
        "MIT",
        SERVICE.semantic_id,
        sid("hypothesis", "citadel-test"),
        experiment,
        verification(
            SERVICE, refs=(experiment,), method=t.VerificationMethod.EXPERIMENT
        ),
    )


class ReceiptTests(unittest.TestCase):
    def test_pass_is_independent_scoped_and_evidence_bearing(self) -> None:
        receipt = verification()
        receipt.require_pass(SERVICE)
        for changes in (
            {"verifier_id": ACTOR},
            {"evidence": ()},
            {"checks": ()},
            {
                "checks": (
                    t.PostconditionResult(
                        POST, False, (receipt.result.evidence[0].evidence_id,)
                    ),
                )
            },
            {"subject": replace(SERVICE, version="different")},
            {
                "evidence": (
                    replace(
                        receipt.result.evidence[0], observed_at=NOW + timedelta(days=1)
                    ),
                )
            },
            {
                "checks": (
                    t.PostconditionResult(POST, True, (sid("evidence", "unbound"),)),
                )
            },
            {"checks": receipt.result.checks * 2},
            {"evidence": (evidence(SERVICE, t.EvidenceKind.SOURCE),)},
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(receipt.result, **changes)
        for changes in (
            {"subject": replace(SERVICE, version="r2")},
            {"policy": replace(receipt.policy, policy_version="policy/2")},
            {"policy": replace(receipt.policy, actor_id=VERIFIER)},
            {"policy": replace(receipt.policy, evaluated_at=NOW + timedelta(days=1))},
        ):
            with self.assertRaises(t.ContractError):
                replace(receipt, **changes)
        with self.assertRaises(t.ContractError):
            replace(
                receipt, policy=replace(receipt.policy, allowed=False)
            ).require_pass(SERVICE)
        with self.assertRaises(t.ContractError):
            receipt.require_pass(replace(SERVICE, version="r2"))

    def test_non_pass_outcomes_preserve_failure_and_uncertainty(self) -> None:
        base = verification().result
        failed = replace(
            base,
            state=t.TevvState.FAIL,
            checks=(replace(base.checks[0], passed=False),),
        )
        self.assertEqual(t.TevvResult.from_json(failed.to_json()), failed)
        with self.assertRaises(t.ContractError):
            replace(failed, state=t.TevvState.PASS)
        for label in (t.TevvState.HOLD, t.TevvState.NOT_APPLICABLE):
            with self.assertRaises(t.ContractError):
                replace(base, state=label)
            self.assertEqual(
                replace(
                    base, state=label, reason="Not enough scope-specific evidence."
                ).state,
                label,
            )
        with self.assertRaises(t.ContractError):
            replace(base, state=t.TevvState.WATCH)
        watched = replace(
            base,
            state=t.TevvState.WATCH,
            monitor_refs=(t.SemanticId("datadog://metric/bounded"),),
        )
        self.assertEqual(watched.state, t.TevvState.WATCH)
        with self.assertRaises(t.ContractError):
            replace(base, state=t.TevvState.FAIL)

    def test_a3_needs_human_scoped_unexpired_authority(self) -> None:
        base = verification().policy
        with self.assertRaises(t.ContractError):
            replace(base, tier=t.AuthorityTier.A3)
        grant = t.AuthorityGrant(
            sid("authority", "dispatch"),
            sid("person", "operator"),
            t.ActorType.HUMAN,
            ACTOR,
            t.AuthorityTier.A3,
            (SERVICE.semantic_id,),
            NOW,
            NOW + timedelta(hours=1),
            sid("mission", "dispatch"),
        )
        policy = replace(base, tier=t.AuthorityTier.A3, grant=grant)
        self.assertEqual(t.PolicyDecisionReceipt.from_json(policy.to_json()), policy)
        for changes in (
            {"grantor_type": t.ActorType.AGENT},
            {"grantor_id": ACTOR},
            {"target_ids": ()},
            {"expires_at": NOW},
        ):
            with self.assertRaises(t.ContractError):
                replace(grant, **changes)
        for changes in (
            {"grantee_id": VERIFIER},
            {"tier": t.AuthorityTier.A1},
            {"target_ids": (sid("service", "other"),)},
            {"expires_at": NOW + timedelta(seconds=1)},
        ):
            with self.assertRaises(t.ContractError):
                replace(policy, grant=replace(grant, **changes))
        with self.assertRaises(t.ContractError):
            policy.require_allow(
                SERVICE,
                ACTOR,
                t.AuthorityTier.A3,
                (SERVICE.semantic_id,),
                "unapproved-tool",
            )
        with self.assertRaises(t.ContractError):
            replace(base, preconditions=(replace(base.preconditions[0], passed=False),))

    def test_shapes_report_their_actual_advisories_or_violations(self) -> None:
        base = shape()
        warning = t.ShaclIssue(
            base.shape_ids[0],
            "relations",
            t.IssueSeverity.WARNING,
            "Optional binding absent.",
        )
        violation = replace(warning, severity=t.IssueSeverity.VIOLATION)
        for changes in (
            {"issues": (warning,)},
            {"state": t.ShaclState.WARNING},
            {"state": t.ShaclState.WARNING, "issues": (violation,)},
            {"state": t.ShaclState.VIOLATES},
            {"state": t.ShaclState.DEFERRED},
            {"shape_ids": ()},
        ):
            with self.assertRaises(t.ContractError):
                replace(base, **changes)
        for value in (
            replace(base, state=t.ShaclState.WARNING, issues=(warning,)),
            replace(base, state=t.ShaclState.VIOLATES, issues=(violation,)),
            replace(
                base, state=t.ShaclState.DEFERRED, reason="Ontology context absent."
            ),
        ):
            self.assertEqual(t.ShaclValidationResult.from_json(value.to_json()), value)

    def test_causal_stages_require_mechanism_experiment_and_verification(self) -> None:
        full = causal()
        for stage in (
            t.CausalState.CANDIDATE_CAUSE,
            t.CausalState.HYPOTHESIZED_CAUSE,
            t.CausalState.EXPERIMENTALLY_SUPPORTED,
            t.CausalState.VERIFIED_CAUSE,
        ):
            self.assertEqual(
                t.CausalSupport.from_json(replace(full, state=stage).to_json()).state,
                stage,
            )
        for changes in (
            {"temporal_evidence": ()},
            {"mechanism": ""},
            {"hypothesis_id": None},
            {"confounder_assessment": None},
            {"experiments": ()},
            {"measured_outcome": None},
            {"unresolved_contradictions": (sid("claim", "contradiction"),)},
            {"verification": None},
            {"experiments": (evidence(TRANSACTION),)},
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(full, **changes)

    def test_external_popularity_cannot_substitute_for_citadel_validation(self) -> None:
        full = corpus()
        self.assertEqual(t.CorpusValidation.from_json(full.to_json()), full)
        for changes in (
            {"source_repository": SERVICE.semantic_id},
            {"source_license": ""},
            {"hypothesis_id": None},
            {"experiment": None},
            {"verification": None},
            {
                "experiment": replace(
                    full.experiment, source=sid("service", "unrelated")
                )
            },
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(full, **changes)
        with self.assertRaises(t.ContractError):
            replace(full, state=t.CorpusUseState.REJECTED_FOR_CITADEL)
        rejected = replace(
            full,
            state=t.CorpusUseState.REJECTED_FOR_CITADEL,
            reason="Bounded experiment failed.",
        )
        self.assertEqual(rejected.state, t.CorpusUseState.REJECTED_FOR_CITADEL)


class RelationTests(unittest.TestCase):
    def test_all_predicates_have_frozen_endpoint_and_evidence_contracts(self) -> None:
        self.assertEqual(set(t.RELATION_CONTRACTS), set(t.RelationPredicate))
        self.assertEqual(len(t.RELATION_CONTRACTS), 62)
        self.assertEqual(
            sum(
                c.basis == "specification section 35"
                for c in t.RELATION_CONTRACTS.values()
            ),
            21,
        )
        self.assertTrue(
            all(c.domain and c.range for c in t.RELATION_CONTRACTS.values())
        )
        with self.assertRaises(TypeError):
            t.RELATION_CONTRACTS[t.RelationPredicate.CALLS] = None

    def test_domains_ranges_versions_and_evidence_reject_invalid_edges(self) -> None:
        base = relation()
        self.assertEqual(t.Relation.from_json(base.to_json()), base)
        for changes in (
            {"source_type": t.EntityType.PERSON},
            {"target_type": t.EntityType.PERSON},
            {"target_version": ""},
            {"target": SERVICE.semantic_id},
            {"evidence": ()},
            {
                "evidence": (
                    evidence(
                        replace(SERVICE, version="r2"), t.EvidenceKind.STATIC_ANALYSIS
                    ),
                )
            },
            {"state": t.EvidenceState.OBSERVED},
            {"evidence": (evidence(SERVICE, t.EvidenceKind.TEST),)},
            {"confidence": float("inf")},
            {"confidence": True},
            {"confidence": -1.0},
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(base, **changes)
        observed = replace(
            base,
            state=t.EvidenceState.OBSERVED,
            evidence=(evidence(SERVICE, t.EvidenceKind.RUNTIME_TRACE),),
        )
        self.assertEqual(observed.state, t.EvidenceState.OBSERVED)
        candidate = replace(base, state=t.EvidenceState.UNMEASURED, evidence=())
        self.assertEqual(candidate.state, t.EvidenceState.UNMEASURED)

    def test_unevidenced_verified_cause_is_rejected(self) -> None:
        full = causal()
        edge = t.Relation(
            predicate=t.RelationPredicate.CAUSES,
            source=TRANSACTION,
            source_type=t.EntityType.SEMANTIC_TRANSACTION,
            target=sid("observation", "outcome"),
            target_type=t.EntityType.OBSERVATION,
            target_version="r1",
            evidence=full.evidence,
            confidence=0.9,
            state=t.EvidenceState.VERIFIED,
            causal=full,
            verification=full.verification,
        )
        self.assertEqual(t.Relation.from_json(edge.to_json()), edge)
        for changes in (
            {"evidence": ()},
            {"causal": None},
            {"verification": None},
            {"causal": replace(full, state=t.CausalState.CORRELATED)},
            {"causal": replace(full, state=t.CausalState.CANDIDATE_CAUSE)},
        ):
            with self.assertRaises(t.ContractError):
                replace(edge, **changes)
        observed = t.SubjectRef(sid("observation", "before"), "r1")
        with self.assertRaises(t.ContractError):
            t.Relation(
                predicate=t.RelationPredicate.CORRELATES_WITH,
                source=observed,
                source_type=t.EntityType.OBSERVATION,
                target=sid("observation", "after"),
                target_type=t.EntityType.OBSERVATION,
                target_version="r1",
                evidence=(evidence(observed, t.EvidenceKind.STATISTICAL),),
                confidence=0.5,
                state=t.EvidenceState.OBSERVED,
                causal=causal(observed),
            )

    def test_implementation_documentation_and_evolution_contracts(self) -> None:
        refs = (
            evidence(SERVICE, t.EvidenceKind.SOURCE, "source"),
            evidence(SERVICE, t.EvidenceKind.IMPLEMENTATION, "implementation"),
            evidence(),
        )
        implemented = replace(
            relation(),
            predicate=t.RelationPredicate.IMPLEMENTS,
            target=sid("requirement"),
            target_type=t.EntityType.REQUIREMENT,
            state=t.EvidenceState.VERIFIED,
            evidence=refs,
            verification=verification(refs=refs),
            shacl=shape(),
        )
        with self.assertRaises(t.ContractError):
            replace(implemented, shacl=None)
        documented = replace(
            relation(),
            predicate=t.RelationPredicate.DOCUMENTED_BY,
            target=sid("section", "architecture"),
            target_type=t.EntityType.DOCUMENT_SECTION,
            evidence=(refs[0],),
            documentation_ref=t.SemanticId("doc://architecture/v1/classroom"),
        )
        with self.assertRaises(t.ContractError):
            replace(documented, documentation_ref=None)
        successor = replace(
            relation(),
            predicate=t.RelationPredicate.SUPERSEDES,
            evidence=(refs[0],),
            valid_time=t.ValidTime(NOW),
        )
        with self.assertRaises(t.ContractError):
            replace(successor, valid_time=None)
        entailed = replace(
            relation(),
            predicate=t.RelationPredicate.ENTAILS,
            target=sid("claim"),
            target_type=t.EntityType.CLAIM,
            evidence=(evidence(SERVICE, t.EvidenceKind.DETERMINISTIC_PROOF),),
        )
        with self.assertRaises(t.ContractError):
            replace(entailed, confidence=None)

    def test_live_writes_execution_and_deployment_have_specific_receipts(self) -> None:
        table = sid("table", "public-objects")
        policy = replace(verification().policy, target_ids=(table,))
        write = replace(
            relation(),
            predicate=t.RelationPredicate.WRITES,
            target=table,
            target_type=t.EntityType.TABLE,
            live=True,
            policy=policy,
        )
        with self.assertRaises(t.ContractError):
            replace(write, policy=None)
        with self.assertRaises(t.ContractError):
            replace(write, policy=replace(policy, allowed=False))
        with self.assertRaises(t.ContractError):
            replace(write, target=sid("table", "outside"))
        tx = transaction()
        executed = t.Relation(
            predicate=t.RelationPredicate.EXECUTED_BY,
            source=TRANSACTION,
            source_type=t.EntityType.SEMANTIC_TRANSACTION,
            target=EXECUTOR,
            target_type=t.EntityType.AGENT,
            target_version="agent-v1",
            evidence=tx.execution.evidence,
            confidence=None,
            state=t.EvidenceState.OBSERVED,
            execution=tx.execution,
        )
        with self.assertRaises(t.ContractError):
            replace(executed, target=ACTOR)
        artifact = t.SubjectRef(sid("artifact"), "r1")
        deployed = t.Relation(
            predicate=t.RelationPredicate.DEPLOYED_AS,
            source=artifact,
            source_type=t.EntityType.RELEASE_ARTIFACT,
            target=sid("deployment"),
            target_type=t.EntityType.DEPLOYMENT,
            target_version="r1",
            evidence=(evidence(artifact, t.EvidenceKind.DEPLOYMENT),),
            confidence=None,
            state=t.EvidenceState.OBSERVED,
            environment=sid("environment", "test"),
        )
        with self.assertRaises(t.ContractError):
            replace(deployed, environment=None)


class TransactionTests(unittest.TestCase):
    def test_full_transaction_round_trips_and_checks_each_stage(self) -> None:
        tx = transaction()
        self.assertEqual(t.SemanticTransaction.from_json(tx.to_json()), tx)
        for stage in tuple(t.SemanticTransactionState)[:11]:
            if stage is t.SemanticTransactionState.CANONICALIZED:
                continue
            with self.subTest(stage=stage):
                self.assertEqual(replace(tx, state=stage).state, stage)
        promotion = t.GraphPromotionReceipt(
            sid("receipt", "promotion"),
            tx.subject,
            tx.after.semantic_root,
            sid("epoch"),
            (sid("document", "projection"),),
            NOW + timedelta(seconds=6),
        )
        canonical = replace(
            tx, state=t.SemanticTransactionState.CANONICALIZED, promotion=promotion
        )
        self.assertEqual(
            t.SemanticTransaction.from_json(canonical.to_json()), canonical
        )
        with self.assertRaises(t.ContractError):
            replace(canonical, promotion=None)
        with self.assertRaises(t.ContractError):
            replace(
                canonical,
                promotion=replace(promotion, semantic_root=t.SemanticRoot("f" * 64)),
            )
        with self.assertRaises(t.ContractError):
            replace(canonical, promotion=replace(promotion, recorded_at=NOW))

    def test_success_cannot_skip_structure_evidence_policy_execution_or_verification(
        self,
    ) -> None:
        tx = transaction()
        for changes in (
            {"shacl": None},
            {"evidence": ()},
            {"policy": None},
            {"authority": None},
            {"execution": None},
            {"verification": None},
            {"after": None},
            {"policy": replace(tx.policy, allowed=False)},
            {"execution": replace(tx.execution, outcome=t.ExecutionOutcome.FAILED)},
            {"execution": replace(tx.execution, outcome=t.ExecutionOutcome.STARTED)},
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(tx, **changes)
        with self.assertRaises(t.ContractError):
            replace(
                tx,
                shacl=replace(
                    tx.shacl, subject=replace(TRANSACTION, version="different")
                ),
            )

    def test_contract_scope_roles_and_evaluated_preconditions(self) -> None:
        tx = transaction()
        for changes in (
            {"target_ids": ()},
            {"authority_tier": t.AuthorityTier.A0},
            {"rollback_or_compensation": None},
            {"verifier_id": ACTOR},
            {"verifier_id": EXECUTOR},
            {"preconditions": ()},
            {"postconditions": ()},
            {"expected_outputs": ()},
            {"source_sha": "short"},
            {"parent_op_id": "op-1"},
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(tx.authority, **changes)
        for changes in (
            {"actor_id": sid("agent", "other")},
            {"semantic_transaction_id": sid("transaction", "other")},
            {"mission_id": sid("mission", "other")},
            {"context_root": t.ContextRoot("f" * 64)},
            {
                "target_ids": (sid("service", "other"),),
                "rollback_or_compensation": None,
                "authority_tier": t.AuthorityTier.A1,
            },
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(tx, authority=replace(tx.authority, **changes))
        with self.assertRaises(t.ContractError):
            replace(tx, policy=replace(tx.policy, preconditions=()))
        with self.assertRaises(t.ContractError):
            replace(tx, policy=replace(tx.policy, approved_tools=()))
        with self.assertRaises(t.ContractError):
            replace(
                tx,
                authority=replace(
                    tx.authority, postconditions=("unmeasured condition",)
                ),
            )

    def test_receipts_cannot_drift_from_authorized_execution(self) -> None:
        tx = transaction()
        for changes in (
            {"operation_id": "other"},
            {"executor_id": ACTOR},
            {"tool_or_adapter": "unapproved"},
            {"source": t.SourceRevision("f" * 40)},
            {"occurred_at": NOW},
            {
                "subject": SERVICE,
                "evidence": (evidence(SERVICE, t.EvidenceKind.EXECUTION),),
            },
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(tx, execution=replace(tx.execution, **changes))
        early = replace(tx.verification.result, evaluated_at=NOW + timedelta(seconds=2))
        with self.assertRaises(t.ContractError):
            replace(tx, verification=replace(tx.verification, result=early))
        with self.assertRaises(t.ContractError):
            replace(
                tx,
                verification=replace(
                    tx.verification,
                    result=replace(
                        tx.verification.result, verifier_id=sid("verifier", "other")
                    ),
                ),
            )

    def test_watch_rejection_supersession_and_proposal_conflicts(self) -> None:
        tx = transaction()
        for stage in (
            t.SemanticTransactionState.WATCH,
            t.SemanticTransactionState.REJECTED,
            t.SemanticTransactionState.SUPERSEDED,
            t.SemanticTransactionState.ROLLED_BACK,
        ):
            with self.subTest(stage=stage), self.assertRaises(t.ContractError):
                replace(tx, state=stage)
        self.assertEqual(
            replace(
                tx,
                state=t.SemanticTransactionState.WATCH,
                monitor_refs=(t.SemanticId("datadog://metric/health"),),
            ).state,
            t.SemanticTransactionState.WATCH,
        )
        self.assertEqual(
            replace(
                tx,
                state=t.SemanticTransactionState.REJECTED,
                reason="Policy rejected a later proposal.",
            ).state,
            t.SemanticTransactionState.REJECTED,
        )
        successor = replace(
            tx,
            state=t.SemanticTransactionState.SUPERSEDED,
            successor_id=sid("transaction", "successor"),
        )
        self.assertEqual(
            t.SemanticTransaction.from_json(successor.to_json()), successor
        )
        with self.assertRaises(t.ContractError):
            replace(successor, successor_id=tx.transaction_id)
        for proposal in (
            lambda: t.ChangeProposal(),
            lambda: t.ChangeProposal(add=(relation(),), remove=(relation(),)),
        ):
            with self.assertRaises(t.ContractError):
                proposal()
        with self.assertRaises(t.ContractError):
            replace(
                tx,
                intent=replace(
                    tx.intent, targets=(replace(SERVICE, version="different"),)
                ),
            )

    def test_rollback_retains_original_execution_and_independent_compensation(
        self,
    ) -> None:
        tx = transaction()
        compensation_subject = t.SubjectRef(sid("rollback", "restore"), "r1")
        refs = (
            evidence(compensation_subject, t.EvidenceKind.ROLLBACK, "compensation"),
            evidence(compensation_subject),
        )
        verdict = verification(
            compensation_subject,
            refs=refs,
            targets=(SERVICE.semantic_id,),
            check="prior relation restored",
        )
        verdict = replace(
            verdict,
            result=replace(verdict.result, evaluated_at=NOW + timedelta(seconds=8)),
        )
        compensation = replace(
            tx.execution,
            receipt_id=sid("receipt", "compensation-execution"),
            subject=compensation_subject,
            operation_id="restore-op",
            occurred_at=NOW + timedelta(seconds=6),
            evidence=(
                evidence(compensation_subject, t.EvidenceKind.EXECUTION, "restore"),
            ),
        )
        receipt = t.RollbackReceipt(
            sid("rollback", "receipt"),
            tx.subject,
            tx.execution,
            compensation,
            verdict,
            "Independent postcondition failed after mutation.",
        )
        rolled_back = replace(
            tx, state=t.SemanticTransactionState.ROLLED_BACK, rollback=receipt
        )
        self.assertEqual(
            t.SemanticTransaction.from_json(rolled_back.to_json()), rolled_back
        )
        for changes in (
            {"verification": None},
            {"compensation": replace(compensation, outcome=t.ExecutionOutcome.STARTED)},
            {
                "compensation": replace(
                    compensation, operation_id=tx.execution.operation_id
                )
            },
            {"compensation": replace(compensation, occurred_at=NOW)},
            {
                "verification": replace(
                    verdict, result=replace(verdict.result, verifier_id=EXECUTOR)
                )
            },
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(receipt, **changes)


class ConsistencyTests(unittest.TestCase):
    def test_verified_object_cannot_swap_in_unverified_evidence(self) -> None:
        verdict = verification()
        verified = replace(
            object_envelope(),
            state=state(
                evidence_state=t.EvidenceState.VERIFIED, tevv_state=t.TevvState.PASS
            ),
            evidence=verdict.result.evidence,
            tevv=verdict.result,
            verification=verdict,
            policy=verdict.policy,
        )
        with self.assertRaises(t.ContractError):
            replace(
                verified,
                evidence=(evidence(SERVICE, t.EvidenceKind.SOURCE, "unchecked"),),
            )

    def test_verified_cause_cannot_use_unrelated_same_version_test(self) -> None:
        with self.assertRaises(t.ContractError):
            replace(causal(), verification=verification(TRANSACTION))

    def test_authority_edge_must_name_its_actual_policy(self) -> None:
        policy = verification(TRANSACTION).policy
        edge = t.Relation(
            predicate=t.RelationPredicate.AUTHORIZED_BY,
            source=TRANSACTION,
            source_type=t.EntityType.SEMANTIC_TRANSACTION,
            target=policy.policy_id,
            target_type=t.EntityType.POLICY,
            target_version=policy.policy_version,
            evidence=(evidence(TRANSACTION, t.EvidenceKind.AUTHORIZATION),),
            confidence=None,
            state=t.EvidenceState.OBSERVED,
            policy=policy,
        )
        with self.assertRaises(t.ContractError):
            replace(edge, target=sid("policy", "unrelated"))

    def test_atomic_batch_cannot_mix_conflicting_verification_receipts(self) -> None:
        one = verification()
        two_policy = replace(one.policy, policy_version="other-policy")
        two = replace(
            one,
            policy=two_policy,
            result=replace(one.result, policy_version="other-policy"),
        )
        proof_one = t.PromotionProof(
            subject=SERVICE,
            evidence=one.result.evidence,
            verification=one,
            tevv=one.result,
        )
        proof_two = t.PromotionProof(
            subject=SERVICE,
            evidence=two.result.evidence,
            verification=two,
            tevv=two.result,
        )
        deltas = (
            t.StateDelta(
                t.StateAxis.EVIDENCE,
                t.EvidenceState.TESTING,
                t.EvidenceState.VERIFIED,
                "Measured claim.",
                SERVICE,
                one.result.evidence,
                proof_one,
            ),
            t.StateDelta(
                t.StateAxis.TEVV,
                t.TevvState.TESTING,
                t.TevvState.PASS,
                "Measured postconditions.",
                SERVICE,
                two.result.evidence,
                proof_two,
            ),
        )
        with self.assertRaises(t.InvalidTransitionError):
            t.apply_state_deltas(
                state(
                    evidence_state=t.EvidenceState.TESTING,
                    tevv_state=t.TevvState.TESTING,
                ),
                deltas,
                subject=SERVICE,
            )

    def test_audit_verified_without_tests_and_empty_merkle_are_rejected(self) -> None:
        with self.assertRaises(t.ContractError):
            state(evidence_state=t.EvidenceState.VERIFIED)
        with self.assertRaises(t.ContractError):
            replace(
                object_envelope(),
                state=state(merkle_state=t.MerkleState.INCLUSION_PROVEN),
            )
        with self.assertRaises(t.ContractError):
            replace(object_envelope(), state=state(authority_tier=t.AuthorityTier.A3))
        with self.assertRaises(t.ContractError):
            replace(object_envelope(), object_type=t.EntityType.MODULE)

    def test_receipt_states_and_envelope_versions_must_match(self) -> None:
        verdict = verification()
        verified = replace(
            object_envelope(),
            state=state(
                evidence_state=t.EvidenceState.VERIFIED,
                tevv_state=t.TevvState.PASS,
                shacl_state=t.ShaclState.CONFORMS,
            ),
            evidence=verdict.result.evidence,
            shacl=shape(),
            tevv=verdict.result,
            verification=verdict,
        )
        self.assertEqual(
            t.CanonicalObjectEnvelope.from_json(verified.to_json()), verified
        )
        for changes in (
            {"verification": None},
            {"tevv": None},
            {"evidence": ()},
            {"observed_time": None},
            {"source": replace(verified.source, document_version="r2")},
            {"shacl": None},
            {"state": replace(verified.state, shacl_state=t.ShaclState.NOT_EVALUATED)},
            {"relations": (relation(replace(SERVICE, version="r2")),)},
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(verified, **changes)
        with self.assertRaises(t.ContractError):
            t.Provenance(())
        with self.assertRaises(t.ContractError):
            t.Source("git", "source")
        with self.assertRaises(t.ContractError):
            t.Runtime("healthy")

    def test_event_labels_cannot_overstate_evidence(self) -> None:
        event = event_envelope()
        for changes in (
            {"subject": replace(event.subject, version="r2")},
            {"version": "1"},
            {"occurred_at": NOW},
            {"evidence": replace(event.evidence, state=t.EvidenceState.OBSERVED)},
            {"context": {}},
        ):
            with self.subTest(changes=changes), self.assertRaises(t.ContractError):
                replace(event, **changes)
        with self.assertRaises(t.ContractError):
            replace(event.evidence, verification=None)
        with self.assertRaises(t.ContractError):
            replace(event.evidence, evidence_id=sid("evidence", "different"))


class PromotionTests(unittest.TestCase):
    def test_direct_verification_needs_named_deterministic_verifier(self) -> None:
        receipt = verification(method=t.VerificationMethod.DETERMINISTIC)
        proof = t.PromotionProof(
            subject=SERVICE, evidence=receipt.result.evidence, verification=receipt
        )
        self.assertTrue(
            t.can_transition(
                t.EvidenceState.OBSERVED,
                t.EvidenceState.VERIFIED,
                subject=SERVICE,
                proof=proof,
            )
        )
        self.assertFalse(
            t.can_transition(
                t.EvidenceState.UNMEASURED,
                t.EvidenceState.VERIFIED,
                subject=SERVICE,
                proof=proof,
            )
        )
        self.assertFalse(
            t.can_transition(t.EvidenceState.OBSERVED, t.EvidenceState.VERIFIED)
        )
        ordinary = verification()
        ordinary_proof = t.PromotionProof(
            subject=SERVICE, evidence=ordinary.result.evidence, verification=ordinary
        )
        self.assertFalse(
            t.can_transition(
                t.EvidenceState.OBSERVED,
                t.EvidenceState.VERIFIED,
                subject=SERVICE,
                proof=ordinary_proof,
            )
        )
        unnamed = replace(
            receipt, policy=replace(receipt.policy, direct_verifier_id=None)
        )
        self.assertFalse(
            t.can_transition(
                t.EvidenceState.OBSERVED,
                t.EvidenceState.VERIFIED,
                subject=SERVICE,
                proof=replace(proof, verification=unnamed),
            )
        )
        self.assertFalse(
            t.can_transition(
                t.EvidenceState.OBSERVED,
                t.EvidenceState.VERIFIED,
                subject=replace(SERVICE, version="r2"),
                proof=proof,
            )
        )
        with self.assertRaises(TypeError):
            t.can_transition(
                t.EvidenceState.OBSERVED,
                t.EvidenceState.VERIFIED,
                direct_deterministic_verifier=True,
            )

    def test_causal_and_corpus_promotions_cannot_use_unrelated_receipts(self) -> None:
        support = causal(SERVICE, t.CausalState.CANDIDATE_CAUSE)
        proof = t.PromotionProof(
            subject=SERVICE, evidence=support.evidence, causal=support
        )
        self.assertTrue(
            t.can_transition(
                t.CausalState.CORRELATED,
                t.CausalState.CANDIDATE_CAUSE,
                subject=SERVICE,
                proof=proof,
            )
        )
        self.assertFalse(
            t.can_transition(t.CausalState.CORRELATED, t.CausalState.CANDIDATE_CAUSE)
        )
        self.assertFalse(
            t.can_transition(
                t.CausalState.CORRELATED,
                t.CausalState.VERIFIED_CAUSE,
                subject=SERVICE,
                proof=proof,
            )
        )
        bounded = corpus()
        proof = t.PromotionProof(
            subject=SERVICE, evidence=(bounded.experiment,), corpus=bounded
        )
        self.assertTrue(
            t.can_transition(
                t.CorpusUseState.TESTED_IN_CITADEL,
                t.CorpusUseState.VERIFIED_FOR_CITADEL,
                subject=SERVICE,
                proof=proof,
            )
        )
        with self.assertRaises(t.ContractError):
            replace(proof, evidence=(evidence(),))
        for pair in (
            ("correlates_with", "causes"),
            ("preceded", "causes"),
            ("invented", "VERIFIED"),
            ("schema-valid", "true"),
        ):
            self.assertFalse(t.can_automatically_promote(*pair))

    def test_merkle_shacl_and_governance_need_matching_contracts(self) -> None:
        ref = evidence(TRANSACTION)
        tx = transaction(t.SemanticTransactionState.AUTHORIZED)
        proof = t.PromotionProof(
            subject=TRANSACTION, evidence=tx.evidence, transaction=tx
        )
        self.assertTrue(
            t.can_transition(
                t.CgrfActionState.POLICY_EVALUATING,
                t.CgrfActionState.AUTHORIZED,
                subject=TRANSACTION,
                proof=proof,
            )
        )
        self.assertFalse(
            t.can_transition(
                t.CgrfActionState.AUTHORIZED,
                t.CgrfActionState.RESERVED,
                subject=TRANSACTION,
                proof=proof,
            )
        )
        self.assertTrue(
            t.can_transition(
                t.CgrfActionState.AUTHORIZED,
                t.CgrfActionState.RESERVED,
                subject=TRANSACTION,
                proof=replace(proof, reservation=sid("receipt", "reservation")),
            )
        )
        for before, after, accepted in (
            (
                t.ShaclState.NOT_EVALUATED,
                t.ShaclState.CONFORMS,
                t.PromotionProof(
                    subject=TRANSACTION, evidence=(ref,), shacl=shape(TRANSACTION)
                ),
            ),
            (
                t.MerkleState.LEAF_HASHED,
                t.MerkleState.ROOTED,
                t.PromotionProof(
                    subject=TRANSACTION, evidence=(ref,), merkle=merkle(TRANSACTION)
                ),
            ),
        ):
            self.assertFalse(t.can_transition(before, after))
            self.assertTrue(
                t.can_transition(before, after, subject=TRANSACTION, proof=accepted)
            )
        with self.assertRaises(t.ContractError):
            replace(proof, subject=SERVICE)


if __name__ == "__main__":
    unittest.main()
