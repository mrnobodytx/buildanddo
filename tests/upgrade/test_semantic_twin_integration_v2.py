# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_semantic_twin_integration_v2.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion, libs/semantic_twin/phase1
# EnumType:    Test
# EnumEdges:   VALIDATES libs/semantic_twin/ingestion; VALIDATES libs/semantic_twin/phase1
# Intent:      Reject unscoped evidence, false release success, changed input snapshots and altered context proofs across the Phase 0 v2 boundary.
# ───────────────────────────────────────────────────────────────

"""Exercise canonical integration and adversarial evidence cases with local fixtures."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from libs.semantic_twin.contracts import ContractError
from libs.semantic_twin.identity import EntityType
from libs.semantic_twin.ingestion.claims import ClaimDisposition, classify_claim
from libs.semantic_twin.ingestion.drafts import (
    GraphDraft,
    combine_drafts,
    make_object,
)
from libs.semantic_twin.ingestion.graph import SemanticGraph
from libs.semantic_twin.ingestion.receipts import (
    ingest_deployment_receipts,
    receipt_objects,
)
from libs.semantic_twin.ingestion.release import RELEASE_PATH_KEYS
from libs.semantic_twin.ingestion.serializer import graph_payload, object_leaf_digest
from libs.semantic_twin.ingestion.source import extract_release_source
from libs.semantic_twin.models import CanonicalObjectEnvelope
from libs.semantic_twin.phase1 import Phase1Inputs, compile_phase1
from libs.semantic_twin.phase1.common import read_json, relation
from libs.semantic_twin.phase1.context import (
    ContextProofBundle,
    compile_context_bundle,
    verify_context_bundle,
)
from libs.semantic_twin.phase1.memory import ingest_memory_file
from libs.semantic_twin.phase1.merkle import (
    SemanticEpoch,
    build_epoch,
    inclusion_proof,
    verify_inclusion,
)
from libs.semantic_twin.phase1.providers import (
    ingest_datadog_export,
    ingest_gitlab_export,
)
from libs.semantic_twin.phase1.release_state import (
    ingest_release_receipts,
    release_receipt_graph,
)
from libs.semantic_twin.phase1.sbom import parse_sbom, sbom_graph
from libs.semantic_twin.phase1.truth import reconcile_release_truth
from libs.semantic_twin.relations import Relation
from libs.semantic_twin.vocabulary import EvidenceState, RelationPredicate

CAPTURE = datetime(2026, 9, 19, 1, tzinfo=timezone.utc)
SHA = "a" * 40
ARTIFACT = "b" * 64
ANCHOR = RELEASE_PATH_KEYS[-1]


def anchor() -> GraphDraft:
    """Provide a typed, generated anchor for isolated adapter tests."""
    return GraphDraft(
        (
            make_object(
                ANCHOR,
                "ReleaseStage",
                "semantic-twin:test-anchor",
                claims=({"stage": "receipt"},),
            ),
        )
    )


def verification(environment: str, minute: int) -> dict[str, Any]:
    """Model the exact public fields written by verify_environment."""
    return {
        "schema": "buildanddo.external-readback/v1",
        "environment": environment,
        "expected_sha": SHA,
        "deployed_sha": SHA,
        "health_pass": True,
        "sha_match": True,
        "flagship_lesson_readback": True,
        "state": "PASS",
        "verified_at": f"2026-09-19T00:{minute:02d}:00Z",
    }


def receipt_capture() -> dict[str, Any]:
    """Provide a labeled test capture of build, readback and DORA receipts."""
    return {
        "candidate_sha": SHA,
        "build": {
            "schema": "buildanddo.release-artifact/v1",
            "commit_sha": SHA,
            "manifest": {"tree_sha256": ARTIFACT},
            "generated_at": "2026-09-19T00:01:00Z",
        },
        "staging": {"verification": verification("staging", 2)},
        "production": {
            "deployment": {
                "schema": "buildanddo.deployment/v1",
                "candidate_sha": SHA,
                "state": "MUTATED_UNVERIFIED",
                "deployed_at": "2026-09-19T00:03:00Z",
            },
            "verification": verification("production", 4),
            "dora": {
                "candidate_sha": SHA,
                "state": "PASS",
                "http_status": 202,
                "remote_writes": 1,
                "emitted_at": "2026-09-19T00:05:00Z",
            },
        },
    }


class LocalFixture(unittest.TestCase):
    """Supply a temporary public input directory without remote effects."""

    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def write_json(self, name: str, value: object) -> Path:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding="utf-8")
        return path

    def receipts(self, value: object) -> GraphDraft:
        path = self.write_json("pipeline_production.latest.json", value)
        return release_receipt_graph(
            ingest_release_receipts((path,), repository_root=self.root),
            anchor_id=ANCHOR,
        )


class CanonicalResolutionTests(LocalFixture):
    """Verify snapshot identity, typed relations and immutable canonical payloads."""

    def test_source_capture_survives_later_file_changes_without_claiming_head_identity(
        self,
    ) -> None:
        path = self.root / "release.py"
        raw = b"raise RuntimeError('must never execute')\ndef verify_environment():\n    pass\n"
        path.write_bytes(raw)
        draft = extract_release_source(path, repository_root=self.root, commit=SHA)
        path.write_text("def different_function(): pass\n", encoding="utf-8")
        graph = draft.resolve(repository_root=self.root, observed_at=CAPTURE)
        expected_version = "sha256:" + hashlib.sha256(raw).hexdigest()
        for item in graph.objects:
            self.assertEqual(item.source.version, expected_version)
            self.assertIsNone(item.source.commit)
            self.assertEqual(item.claims[-1]["source_commit"], SHA)
            self.assertEqual(CanonicalObjectEnvelope.from_json(item.to_json()), item)
            for edge in item.relations:
                self.assertEqual(edge.source, item.subject)
                self.assertEqual(
                    edge.target_version, graph.by_id()[edge.target].source.version
                )
                self.assertTrue(all(e.subject == item.subject for e in edge.evidence))
        self.assertEqual(
            graph_payload(graph),
            graph_payload(
                draft.resolve(repository_root=self.root, observed_at=CAPTURE)
            ),
        )

    def test_resolution_rejects_missing_colliding_or_invalid_endpoints(self) -> None:
        one = anchor().objects[0]
        invalid = [
            GraphDraft((one, one)),
            GraphDraft(
                (
                    replace(
                        one,
                        relations=(
                            relation(
                                RelationPredicate.ABOUT, "missing", one.source_path
                            ),
                        ),
                    ),
                )
            ),
            GraphDraft((replace(one, source_path="missing.py"),)),
            GraphDraft((replace(one, evidence_state=EvidenceState.VERIFIED),)),
            GraphDraft(
                (
                    replace(
                        one,
                        relations=(
                            relation(
                                RelationPredicate.WRITES,
                                one.semantic_id,
                                one.source_path,
                            ),
                        ),
                    ),
                )
            ),
        ]
        for graph in invalid:
            with (
                self.subTest(graph=graph),
                self.assertRaises((ContractError, ValueError)),
            ):
                graph.resolve(repository_root=self.root, observed_at=CAPTURE)
        with self.assertRaises(ContractError):
            anchor().resolve(observed_at=CAPTURE.replace(tzinfo=None))
        with self.assertRaises(ValueError):
            make_object("bad", "invented-entity", "semantic-twin:bad", claims=())

    def test_conflicting_input_revisions_in_one_capture_are_rejected(self) -> None:
        one = replace(
            anchor().objects[0], source_path="input.json", input_digest="a" * 64
        )
        two = make_object(
            "other",
            "Observation",
            "semantic-twin:analysis",
            claims=(),
            supporting_digests=(("input.json", "b" * 64),),
        )
        with self.assertRaisesRegex(ContractError, "source changed"):
            GraphDraft((one, two)).resolve(observed_at=CAPTURE)

    def test_call_resolution_keeps_recursion_but_excludes_unrelated_receivers_and_shadowing(
        self,
    ) -> None:
        path = self.root / "release.py"
        path.write_text(
            "def helper():\n    helper()\n"
            "def runner(external):\n    external.helper()\n    helper()\n"
            "def shadowed(helper):\n    helper()\n"
            "class Controller:\n    def verify(self):\n        self.verify()\n",
            encoding="utf-8",
        )
        graph = extract_release_source(path, repository_root=self.root).resolve(
            observed_at=CAPTURE, repository_root=self.root
        )
        symbols = {
            item.claims[0]["qualified_name"]: item
            for item in graph.objects
            if item.object_type is EntityType.CODE_SYMBOL
        }

        def calls(item: CanonicalObjectEnvelope) -> tuple[Relation, ...]:
            return tuple(
                edge
                for edge in item.relations
                if edge.predicate is RelationPredicate.CALLS
            )

        self.assertEqual(
            calls(symbols["helper"])[0].target, symbols["helper"].semantic_id
        )
        self.assertEqual(len(calls(symbols["runner"])), 1)
        self.assertEqual(
            calls(symbols["runner"])[0].target, symbols["helper"].semantic_id
        )
        self.assertFalse(calls(symbols["shadowed"]))
        self.assertEqual(
            calls(symbols["Controller.verify"])[0].target,
            symbols["Controller.verify"].semantic_id,
        )
        self.assertFalse(
            any(item.object_type is EntityType.SERVICE for item in graph.objects)
        )

    def test_literal_mentions_do_not_prove_behavioral_claims(self) -> None:
        code = "# verify_environment is only a comment\ndef publish_receipt(): pass\n"
        for claim in (
            "The controller defines `verify_environment`.",
            "`publish_receipt` always verifies production before emitting DORA.",
            "The controller never calls `absent_function`.",
        ):
            self.assertEqual(classify_claim(claim, code), ClaimDisposition.UNMEASURED)
        self.assertEqual(
            classify_claim("The controller defines `publish_receipt`.", code),
            ClaimDisposition.ENTAILED,
        )
        self.assertEqual(
            classify_claim("The controller never defines `publish_receipt`.", code),
            ClaimDisposition.CONTRADICTED,
        )

    def test_report_fail_mentions_remain_observed_document_facts(self) -> None:
        path = self.root / "out" / "example" / "report.md"
        path.parent.mkdir(parents=True)
        path.write_text("Old check FAIL; current check PASS.\n", encoding="utf-8")
        records = ingest_deployment_receipts(
            path.parent.parent, repository_root=self.root
        )
        draft = GraphDraft(receipt_objects(records, release_receipt_id=ANCHOR))
        graph = combine_drafts(anchor(), draft).resolve(
            repository_root=self.root, observed_at=CAPTURE
        )
        item = next(
            item for item in graph.objects if item.object_type is EntityType.DOCUMENT
        )
        self.assertEqual(item.state.evidence_state, EvidenceState.OBSERVED)
        self.assertIsNone(item.runtime.observed_status)
        self.assertEqual(item.claims[0]["verification_results"], ("FAIL", "PASS"))


class ReleaseEvidenceTests(LocalFixture):
    """Distinguish captured release consistency from independent verification."""

    def matrix(self, graph: GraphDraft, **options: Any) -> dict[str, Any]:
        return dict(
            reconcile_release_truth(
                graph, expected_commit=SHA, expected_artifact_digest=ARTIFACT, **options
            ).claims[0]
        )

    def test_nested_controller_receipts_preserve_identity_and_verification_fields(
        self,
    ) -> None:
        draft = self.receipts(receipt_capture())
        matrix = reconcile_release_truth(
            draft, expected_commit=SHA, expected_artifact_digest=ARTIFACT
        )
        self.assertEqual(matrix.claims[0]["overall"], "CONSISTENT_CAPTURE")
        graph = combine_drafts(anchor(), draft, GraphDraft((matrix,))).resolve(
            repository_root=self.root, observed_at=CAPTURE
        )
        self.assertTrue(graph.is_connected())
        self.assertTrue(
            all(
                item.state.evidence_state is not EvidenceState.VERIFIED
                for item in graph.objects
            )
        )
        self.assertTrue(
            all(
                edge.predicate is not RelationPredicate.VERIFIED_BY
                for edge in graph.relations()
            )
        )
        for item in graph.objects:
            self.assertEqual(CanonicalObjectEnvelope.from_json(item.to_json()), item)

    def test_pipeline_or_deployment_pass_does_not_replace_readback(self) -> None:
        value = receipt_capture()
        value["production"].pop("verification")
        value["production"]["deployment"]["state"] = "PASS"
        matrix = self.matrix(self.receipts(value))
        self.assertEqual(
            matrix["rows"]["production_verification"]["status"], "UNMEASURED"
        )
        self.assertEqual(matrix["overall"], "INCOMPLETE")

    def test_readback_pass_requires_all_identity_health_and_time_fields(self) -> None:
        for field in (
            "expected_sha",
            "deployed_sha",
            "verified_at",
            "health_pass",
            "sha_match",
            "flagship_lesson_readback",
        ):
            value = receipt_capture()
            del value["production"]["verification"][field]
            with self.subTest(field=field):
                self.assertEqual(
                    self.matrix(self.receipts(value))["rows"][
                        "production_verification"
                    ]["status"],
                    "UNMEASURED",
                )
        for field, replacement in (
            ("health_pass", False),
            ("deployed_sha", "c" * 40),
            ("state", "HOLD"),
        ):
            value = receipt_capture()
            value["production"]["verification"][field] = replacement
            with self.subTest(field=field):
                self.assertEqual(
                    self.matrix(self.receipts(value))["overall"], "CONFLICT"
                )

    def test_file_payload_and_archive_hashes_cannot_substitute_for_tree_identity(
        self,
    ) -> None:
        value = receipt_capture()
        del value["build"]["manifest"]
        value["build"].update(payload_sha256=ARTIFACT, artifact_sha256=ARTIFACT)
        graph = self.receipts(value)
        self.assertEqual(
            self.matrix(graph)["rows"]["artifact_identity"]["status"], "UNMEASURED"
        )
        self.assertEqual(
            self.matrix(graph, artifact_digest_field="artifact_sha256")["rows"][
                "artifact_identity"
            ]["status"],
            "MATCH",
        )
        with self.assertRaises(ContractError):
            self.matrix(graph, artifact_digest_field="source_digest")

    def test_dora_requires_acknowledgment_and_ordered_readback(self) -> None:
        for field in ("http_status", "remote_writes", "candidate_sha", "emitted_at"):
            value = receipt_capture()
            del value["production"]["dora"][field]
            with self.subTest(field=field):
                self.assertEqual(
                    self.matrix(self.receipts(value))["rows"]["dora_emission"][
                        "status"
                    ],
                    "UNMEASURED",
                )
        value = receipt_capture()
        value["production"]["dora"]["emitted_at"] = "2026-09-19T00:01:00Z"
        self.assertEqual(
            self.matrix(self.receipts(value))["rows"]["release_order"]["status"],
            "CONFLICT",
        )
        value["production"]["dora"] = {"state": "HOLD_CREDENTIAL", "remote_writes": 0}
        self.assertEqual(
            self.matrix(self.receipts(value))["rows"]["dora_emission"]["status"],
            "CONFLICT",
        )

    def test_prior_dated_releases_do_not_conflict_with_current_capture(self) -> None:
        draft = self.receipts(receipt_capture())
        previous = make_object(
            "old-build",
            "ReleaseStateReceipt",
            "semantic-twin:old",
            claims=(
                {
                    "receipt_kind": "build",
                    "commit_sha": "d" * 40,
                    "artifact_tree_sha256": "e" * 64,
                    "generated_at": "2026-09-17T00:00:00Z",
                },
            ),
        )
        matrix = self.matrix(combine_drafts(draft, GraphDraft((previous,))))
        self.assertEqual(matrix["overall"], "CONSISTENT_CAPTURE")
        self.assertIn("old-build", matrix["superseded_observations"])
        undated = replace(
            previous, claims=({"receipt_kind": "build", "commit_sha": "d" * 40},)
        )
        self.assertEqual(
            self.matrix(combine_drafts(draft, GraphDraft((undated,))))["overall"],
            "CONFLICT",
        )


class InputIntegrityTests(LocalFixture):
    """Reject malformed exports and preserve the original captured input versions."""

    def test_invalid_json_and_export_shapes_fail_instead_of_silently_succeeding(
        self,
    ) -> None:
        path = self.root / "invalid.json"
        for raw in (
            b'{"state":"PASS","state":"FAIL"}',
            b'{"value":NaN}',
            b'{"value":Infinity}',
            b"{broken",
        ):
            path.write_bytes(raw)
            with self.subTest(raw=raw), self.assertRaises(ContractError):
                read_json(path)
        for payload in ([], {}, {"dora": {}}, {"dora": ["invalid"]}):
            path = self.write_json("datadog.json", payload)
            with self.subTest(payload=payload), self.assertRaises(ContractError):
                ingest_datadog_export(path, anchor_id=ANCHOR)
        for payload in ([], {}, {"jobs": None}, {"jobs": [None]}):
            path = self.write_json("gitlab.json", payload)
            with self.subTest(payload=payload), self.assertRaises(ContractError):
                ingest_gitlab_export(path, anchor_id=ANCHOR)
        path = self.write_json("memory.json", {"vectors": "invalid"})
        with self.assertRaises(ContractError):
            ingest_memory_file(path, anchor_id=ANCHOR)

    def test_provider_projection_supports_native_attributes_without_importing_unrelated_content(
        self,
    ) -> None:
        path = self.write_json(
            "datadog.json",
            {
                "dora": [
                    {
                        "id": "captured-id",
                        "attributes": {
                            "service": "buildanddo-public",
                            "git": {"commit_sha": SHA},
                            "finished_at": 1789776300000000000,
                            "env": "production",
                            "request_content": "excluded fixture content",
                        },
                    }
                ]
            },
        )
        draft = ingest_datadog_export(path, anchor_id=ANCHOR, repository_root=self.root)
        matrix = self.matrix_for_provider(draft)
        self.assertEqual(matrix["rows"]["dora_emission"]["status"], "OBSERVED")
        self.assertEqual(
            matrix["rows"]["production_verification"]["status"], "UNMEASURED"
        )
        graph = combine_drafts(anchor(), draft).resolve(
            repository_root=self.root, observed_at=CAPTURE
        )
        self.assertNotIn("excluded fixture content", json.dumps(graph_payload(graph)))
        self.assertTrue(graph.is_connected())

    @staticmethod
    def matrix_for_provider(graph: GraphDraft) -> dict[str, Any]:
        return dict(reconcile_release_truth(graph, expected_commit=SHA).claims[0])

    def test_manifest_and_memory_versions_bind_parsed_bytes_even_if_files_change(
        self,
    ) -> None:
        sbom_path = self.write_json(
            "sbom.json",
            {
                "bomFormat": "CycloneDX",
                "components": [{"bom-ref": "one", "name": "one", "version": "1"}],
            },
        )
        memory_path = self.write_json(
            "memory.json",
            {
                "vectors": [
                    {"type": "A", "file_path": "example.py"},
                    {
                        "type": "B",
                        "source": "example.py",
                        "target": "external.py",
                        "edge_type": "CALLS",
                    },
                ],
                "summary": {},
            },
        )
        expected = {
            path.name: "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
            for path in (sbom_path, memory_path)
        }
        draft = combine_drafts(
            anchor(),
            sbom_graph(
                (parse_sbom(sbom_path, repository_root=self.root),), anchor_id=ANCHOR
            ),
            ingest_memory_file(
                memory_path, anchor_id=ANCHOR, repository_root=self.root
            ),
        )
        sbom_path.write_text("{}", encoding="utf-8")
        memory_path.write_text("{}", encoding="utf-8")
        graph = draft.resolve(repository_root=self.root, observed_at=CAPTURE)
        for item in graph.objects:
            if item.source.uri_or_path in expected:
                self.assertEqual(item.source.version, expected[item.source.uri_or_path])
        self.assertFalse(
            any(edge.predicate is RelationPredicate.CALLS for edge in graph.relations())
        )


class ProofIntegrityTests(unittest.TestCase):
    """Check all-object hashing, payload proofs and captured-time replay boundaries."""

    @staticmethod
    def graph(count: int = 3) -> SemanticGraph:
        return GraphDraft(
            tuple(
                make_object(
                    f"fixture:{i}",
                    "Observation",
                    f"semantic-twin:proof:{i}",
                    claims=({"message": f"release café {i}"},),
                )
                for i in range(count)
            )
        ).resolve(observed_at=CAPTURE)

    def test_single_and_odd_trees_round_trip_and_reject_changed_bytes(self) -> None:
        for count in (1, 3, 5):
            graph = self.graph(count)
            epoch = build_epoch(graph)
            self.assertEqual(SemanticEpoch.from_json(epoch.to_json()), epoch)
            self.assertEqual(
                epoch, build_epoch(SemanticGraph(tuple(reversed(graph.objects))))
            )
            for item in graph.objects:
                self.assertEqual(
                    object_leaf_digest(item),
                    hashlib.sha256(item.to_json().encode()).hexdigest(),
                )
                proof = inclusion_proof(epoch, item.semantic_id)
                self.assertTrue(verify_inclusion(proof, epoch.root_digest, item=item))
                changed = replace(
                    item,
                    provenance=replace(item.provenance, extractor_version="changed"),
                )
                self.assertFalse(
                    verify_inclusion(proof, epoch.root_digest, item=changed)
                )
                self.assertFalse(verify_inclusion(proof, "0" * 64, item=item))
            with self.assertRaises(KeyError):
                inclusion_proof(epoch, "missing")
        with self.assertRaises(ContractError):
            build_epoch(SemanticGraph(()))

    def test_context_verifier_authenticates_content_query_and_selection_metadata(
        self,
    ) -> None:
        graph = self.graph()
        epoch = build_epoch(graph)
        bundle = compile_context_bundle(graph, epoch, "release")
        self.assertEqual(ContextProofBundle.from_json(bundle.to_json()), bundle)
        self.assertTrue(
            verify_context_bundle(
                bundle,
                epoch.root_digest,
                expected_query="release",
                expected_context_root=bundle.context_root.value,
            )
        )
        altered = (
            replace(bundle, query="different"),
            replace(bundle, historical_cutoff=CAPTURE - timedelta(days=1)),
            replace(bundle, limit=99),
            replace(bundle, selections=()),
            replace(bundle, selections=(replace(bundle.selections[0], score=999),)),
        )
        for item in altered:
            with self.subTest(item=item):
                self.assertFalse(verify_context_bundle(item, epoch.root_digest))
        reselected = compile_context_bundle(graph, epoch, "café")
        self.assertFalse(
            verify_context_bundle(
                reselected,
                epoch.root_digest,
                expected_context_root=bundle.context_root.value,
            )
        )
        with self.assertRaises(ContractError):
            compile_context_bundle(graph, epoch, " ")
        with self.assertRaises(ContractError):
            compile_context_bundle(
                graph, epoch, "release", historical_cutoff=CAPTURE.replace(tzinfo=None)
            )

    def test_replay_does_not_backdate_newly_captured_git_history_or_leak_later_targets(
        self,
    ) -> None:
        from libs.semantic_twin.identity import ValidTime

        graph = self.graph(2)
        first, later = graph.objects
        old = replace(
            first,
            observed_time=CAPTURE - timedelta(days=2),
            evidence=tuple(
                replace(e, observed_at=CAPTURE - timedelta(days=2))
                for e in first.evidence
            ),
        )
        recent_history = replace(
            later, valid_time=ValidTime(valid_from=CAPTURE - timedelta(days=30))
        )
        graph = SemanticGraph((old, recent_history))
        epoch = build_epoch(graph)
        bundle = compile_context_bundle(
            graph, epoch, "release", historical_cutoff=CAPTURE - timedelta(days=1)
        )
        self.assertEqual(
            [selection.semantic_id for selection in bundle.selections],
            [old.semantic_id],
        )
        self.assertEqual(bundle.exclusions[0].reason, "observed_after_cutoff")
        # A selected object's authenticated relation must not reveal an excluded target.
        edge = Relation(
            predicate=RelationPredicate.ABOUT,
            source=old.subject,
            source_type=old.object_type,
            target=recent_history.semantic_id,
            target_type=recent_history.object_type,
            target_version=recent_history.source.version,
            evidence=old.evidence,
            confidence=1.0,
            state=EvidenceState.OBSERVED,
        )
        linked = SemanticGraph((replace(old, relations=(edge,)), recent_history))
        bundle = compile_context_bundle(
            linked,
            build_epoch(linked),
            "release",
            historical_cutoff=CAPTURE - timedelta(days=1),
        )
        self.assertFalse(bundle.selections)


class CaptureCompilerTests(LocalFixture):
    """Exercise repeatable public compilation with actual controller receipt shapes."""

    def test_compilation_is_deterministic_for_an_explicit_snapshot_and_preserves_gaps(
        self,
    ) -> None:
        controller = self.root / "tools" / "buildanddo_release.py"
        controller.parent.mkdir()
        controller.write_text(
            "raise RuntimeError('never execute')\ndef verify_environment(): pass\n",
            encoding="utf-8",
        )
        srs = self.root / ".bits" / "srs" / "SRS-BUILDANDDO-FIXTURE.md"
        srs.parent.mkdir(parents=True)
        srs.write_text(
            "# Acceptance\n- The controller defines `verify_environment`.\n",
            encoding="utf-8",
        )
        path = self.write_json("receipt.json", receipt_capture())
        inputs = Phase1Inputs(
            release_receipts=(path,),
            sbom_paths=(),
            memory_paths=(),
            expected_commit=SHA,
            expected_artifact_digest=ARTIFACT,
        )
        one = compile_phase1(self.root, inputs=inputs, observed_at=CAPTURE)
        two = compile_phase1(self.root, inputs=inputs, observed_at=CAPTURE)
        self.assertEqual(one.to_dict(), two.to_dict())
        self.assertEqual(
            one.graph.by_id()[one.truth_matrix_id].claims[0]["overall"],
            "CONSISTENT_CAPTURE",
        )
        self.assertEqual(one.input_status()["gitlab"]["status"], "UNMEASURED")
        self.assertEqual(one.input_status()["datadog"]["status"], "UNMEASURED")
        self.assertEqual(one.input_status()["git_history"]["status"], "UNMEASURED")
        self.assertTrue(one.graph.is_connected())
        self.assertTrue(verify_context_bundle(one.context, one.epoch.root_digest))
        changed_time = compile_phase1(
            self.root, inputs=inputs, observed_at=CAPTURE + timedelta(seconds=1)
        )
        self.assertNotEqual(one.epoch.root_digest, changed_time.epoch.root_digest)
        with self.assertRaises(ValueError):
            compile_phase1(
                self.root, inputs=replace(inputs, history_limit=0), observed_at=CAPTURE
            )


if __name__ == "__main__":
    unittest.main()
