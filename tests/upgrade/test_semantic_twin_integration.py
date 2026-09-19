# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_semantic_twin_integration.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/__init__.py, libs/semantic_twin/ingestion/__init__.py, libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/inputs.py, libs/semantic_twin/phase1/merkle.py, libs/semantic_twin/phase1/providers.py
# EnumType:    Test
# EnumEdges:   CONSUMES libs/semantic_twin/__init__.py; CONSUMES libs/semantic_twin/ingestion/__init__.py; CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/inputs.py; CONSUMES libs/semantic_twin/phase1/merkle.py; CONSUMES libs/semantic_twin/phase1/providers.py
# DAG Node:    semantic-twin.phase-0.integration.tests
# Intent:      Prevent source-revision, endpoint, wire-format and false-verification regressions at the P0 consumer boundary.
# ───────────────────────────────────────────────────────────────

"""Exercise integration trust boundaries with explicitly simulated captures."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

from libs.semantic_twin import (
    CanonicalObjectEnvelope,
    ContractError,
    EntityType,
    EvidenceState,
    MerkleState,
    RelationPredicate,
    SemanticId,
    TevvState,
)
from libs.semantic_twin.ingestion import (
    build_release_path_graph,
    canonical_object_bytes,
    ingest_release_source,
    serialize_graph,
)
from libs.semantic_twin.ingestion.builder import (
    ObjectDraft,
    RelationDraft,
    canonical_id,
    make_object,
    object_kind,
)
from libs.semantic_twin.ingestion.graph import (
    SemanticGraph,
    add_relations,
    combine_graphs,
)
from libs.semantic_twin.ingestion.inputs import SourceSnapshot
from libs.semantic_twin.phase1.merkle import build_epoch
from libs.semantic_twin.phase1.providers import ingest_datadog_export


CAPTURED_AT = datetime(2026, 9, 19, 1, tzinfo=timezone.utc)
CONTROLLER = Path(__file__).resolve().parents[2] / "tools/buildanddo_release.py"


def capture(name: str, content: bytes = b"fixture input") -> SourceSnapshot:
    """Return an explicit captured-input fixture, not a production receipt."""
    return SourceSnapshot(name, content, CAPTURED_AT)


def node(
    key: str,
    *,
    kind: str = "Observation",
    content: bytes = b"fixture input",
    relations: tuple[RelationDraft, ...] = (),
) -> ObjectDraft:
    """Build a fixture whose evidence is scoped to its own immutable bytes."""
    return make_object(
        key,
        kind,
        f"fixture:{key}",
        snapshot=capture(f"fixture:{key}", content),
        claims=({"name": key, "nested": {"values": [1, 2]}},),
        relations=relations,
    )


class RevisionBindingTests(unittest.TestCase):
    """Reject graph edges that cannot name exact canonical endpoint revisions."""

    def test_fragment_defers_binding_and_cannot_be_exported(self) -> None:
        source = node(
            "source",
            relations=(
                RelationDraft(
                    RelationPredicate.ABOUT,
                    "target",
                    ("fixture:source",),
                ),
            ),
        )
        fragment = SemanticGraph((source,))
        self.assertEqual(fragment.unresolved_targets(), ("target",))
        self.assertFalse(fragment.is_connected())
        for operation in (serialize_graph, build_epoch):
            with (
                self.subTest(operation=operation.__name__),
                self.assertRaises(ContractError),
            ):
                operation(fragment)

        target = node("target", kind="File", content=b"a different revision")
        complete = combine_graphs(fragment, SemanticGraph((target,)))
        self.assertTrue(complete.is_connected())
        edge = complete.relations()[0]
        self.assertEqual(edge.source, source.envelope.subject)
        self.assertEqual(edge.target, target.semantic_id)
        self.assertIs(edge.target_type, EntityType.FILE)
        self.assertEqual(edge.target_version, target.envelope.source.version)
        self.assertNotEqual(edge.source.version, edge.target_version)
        self.assertTrue(
            all(value.subject == source.envelope.subject for value in edge.evidence)
        )
        self.assertEqual(fragment.unresolved_targets(), ("target",))

    def test_resolved_edge_rejects_changed_target_revision(self) -> None:
        source = node(
            "source",
            relations=(
                RelationDraft(
                    RelationPredicate.ABOUT,
                    "target",
                    ("fixture:source",),
                ),
            ),
        )
        original = combine_graphs(
            SemanticGraph((source,)), SemanticGraph((node("target"),))
        )
        bound_source = original.by_id()[source.semantic_id]
        changed_target = node("target", content=b"changed input")
        with self.assertRaisesRegex(ContractError, "target type/revision"):
            SemanticGraph((bound_source, changed_target))

    def test_conflicting_aliases_and_duplicate_identities_fail(self) -> None:
        with self.assertRaisesRegex(ContractError, "duplicate"):
            SemanticGraph((node("same"), node("same")))
        with self.assertRaisesRegex(ContractError, "conflicting extraction key"):
            combine_graphs(
                SemanticGraph((node("same"),)),
                SemanticGraph((node("same", kind="File"),)),
            )

    def test_wrong_endpoint_family_is_not_relaxed_for_ingestion(self) -> None:
        source = node(
            "source",
            relations=(
                RelationDraft(
                    RelationPredicate.CALLS,
                    "target",
                    (),
                    state=EvidenceState.UNMEASURED,
                ),
            ),
        )
        with self.assertRaisesRegex(ContractError, "invalid domain/range"):
            SemanticGraph((source, node("target")))

    def test_pending_source_cannot_change_revisions(self) -> None:
        source = node(
            "source",
            relations=(
                RelationDraft(
                    RelationPredicate.ABOUT,
                    "target",
                    ("fixture:source",),
                ),
            ),
        )
        fragment = SemanticGraph((source,))
        with self.assertRaisesRegex(ContractError, "pending source revision"):
            SemanticGraph(
                (node("source", content=b"new revision"), node("target")),
                pending=fragment.pending,
            )

    def test_duplicate_edges_deduplicate_without_merging_different_evidence(
        self,
    ) -> None:
        base = node("source").envelope
        first = RelationDraft(RelationPredicate.ABOUT, "target", ("line:1",))
        second = RelationDraft(RelationPredicate.ABOUT, "target", ("line:2",))
        draft = add_relations(
            base, (first, first, second), snapshot=capture("fixture:source")
        )
        graph = SemanticGraph((draft, node("target")))
        self.assertEqual(len(graph.relations()), 2)
        self.assertNotEqual(
            graph.relations()[0].evidence, graph.relations()[1].evidence
        )


class CaptureContractTests(unittest.TestCase):
    """Keep capture evidence separate from code, provider and policy assertions."""

    def test_actual_source_bytes_and_capture_time_are_retained(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.txt"
            path.write_bytes(b"original")
            before = datetime.now(timezone.utc)
            snapshot = SourceSnapshot.capture(path, source_path="input.txt")
            after = datetime.now(timezone.utc)
            path.write_bytes(b"changed")
        self.assertEqual(snapshot.content, b"original")
        self.assertEqual(
            snapshot.version, "sha256:" + hashlib.sha256(b"original").hexdigest()
        )
        self.assertLessEqual(before, snapshot.observed_at)
        self.assertLessEqual(snapshot.observed_at, after)

    def test_commit_context_does_not_mislabel_captured_bytes(self) -> None:
        snapshot = capture("code.py", b"changed local file")
        item = make_object(
            "code",
            "CodeSymbol",
            "code.py",
            snapshot=snapshot,
            claims=({"name": "function"},),
            commit="a" * 40,
        ).envelope
        self.assertIsNone(item.source.commit)
        self.assertEqual(item.source.document_version, snapshot.version)
        self.assertEqual(item.subject.version, snapshot.version)
        self.assertEqual(
            item.claims[-1]["ingestion"]["repository_commit_context"], "a" * 40
        )
        self.assertEqual(item.evidence[0].source, snapshot.reference())

    def test_naive_capture_and_mismatched_source_fail(self) -> None:
        with self.assertRaises(ContractError):
            SourceSnapshot("source", b"data", datetime(2026, 1, 1))
        with self.assertRaises(ContractError):
            make_object(
                "x", "Observation", "wrong", snapshot=capture("right"), claims=()
            )
        with self.assertRaises(ContractError):
            canonical_id("File", SemanticId("cni://service/example"))

    def test_capture_timestamp_normalizes_for_replay_and_lines_remain_addressable(
        self,
    ) -> None:
        same_instant = CAPTURED_AT.astimezone(timezone(timedelta(hours=-5)))
        first = capture("src/code.py")
        second = SourceSnapshot("src/code.py", b"fixture input", same_instant)
        self.assertEqual(first, second)
        self.assertEqual(first.reference("src/code.py"), first.reference())
        self.assertTrue(first.reference("src/code.py:42").endswith("/line-42"))

    def test_release_diagram_cannot_fabricate_verification_or_deployment_evidence(
        self,
    ) -> None:
        graph = build_release_path_graph(CONTROLLER)
        self.assertTrue(graph.is_connected())
        for edge in graph.relations():
            self.assertIs(edge.state, EvidenceState.UNMEASURED)
            self.assertEqual(edge.evidence, ())
            self.assertIsNone(edge.verification)
        self.assertIn(
            RelationPredicate.VERIFIED_BY,
            {edge.predicate for edge in graph.relations()},
        )
        self.assertIn(
            RelationPredicate.DEPLOYED_AS,
            {edge.predicate for edge in graph.relations()},
        )
        for item in graph.objects:
            self.assertIs(item.state.tevv_state, TevvState.NOT_TESTED)
            self.assertIsNone(item.verification)

    def test_provider_pass_is_only_a_captured_observation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "datadog.json"
            path.write_text(
                json.dumps({"verifications": [{"id": "one", "state": "PASS"}]})
            )
            graph = ingest_datadog_export(path, anchor_id="anchor")
        item = next(
            item for item in graph.objects if object_kind(item) == "RuntimeVerification"
        )
        self.assertEqual(item.claims[0]["state"], "PASS")
        self.assertIs(item.state.evidence_state, EvidenceState.OBSERVED)
        self.assertIs(item.state.tevv_state, TevvState.NOT_TESTED)
        self.assertIsNone(item.verification)
        self.assertIsNone(item.runtime.observed_status)

    def test_ast_extraction_never_executes_controller_code(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "controller.py"
            path.write_text(
                "raise AssertionError('must not execute')\ndef run():\n    return 1\n"
            )
            graph = ingest_release_source(path)
        self.assertTrue(graph.is_connected())
        self.assertIn("run", {item.claims[0].get("name") for item in graph.objects})


class GraphWireTests(unittest.TestCase):
    """Ensure graph hashing never corrupts strict object envelopes."""

    def test_wire_round_trip_and_leaf_digest_use_exact_p0_bytes(self) -> None:
        first = node(
            "one",
            relations=(
                RelationDraft(
                    RelationPredicate.ABOUT,
                    "two",
                    ("fixture:one",),
                ),
            ),
        )
        second = node("two")
        graph = SemanticGraph((first, second))
        payload = json.loads(serialize_graph(graph))
        self.assertEqual(payload["schema_version"], "semantic-twin.graph/v2")
        for raw in payload["objects"]:
            obj = CanonicalObjectEnvelope.from_dict(raw)
            self.assertEqual(obj, graph.by_id()[obj.semantic_id])
            self.assertEqual(canonical_object_bytes(obj), obj.to_json().encode("utf-8"))
            self.assertEqual(
                payload["leaf_digests"][obj.semantic_id],
                hashlib.sha256(canonical_object_bytes(obj)).hexdigest(),
            )
            self.assertIs(obj.state.merkle_state, MerkleState.UNHASHED)
            self.assertIsNone(obj.merkle.leaf_digest)
            with self.assertRaises(TypeError):
                obj.claims[0]["nested"]["values"][0] = 99

    def test_order_independent_replay_preserves_the_same_captures(self) -> None:
        first = node(
            "one",
            relations=(
                RelationDraft(
                    RelationPredicate.ABOUT,
                    "two",
                    ("fixture:one",),
                ),
            ),
        )
        second = node("two")
        forward = SemanticGraph((first, second))
        reverse = SemanticGraph((second, first))
        self.assertEqual(serialize_graph(forward), serialize_graph(reverse))
        self.assertEqual(build_epoch(forward), build_epoch(reverse))
        changed = replace(
            first, envelope=replace(first.envelope, claims=({"changed": True},))
        )
        self.assertNotEqual(
            build_epoch(forward), build_epoch(SemanticGraph((changed, second)))
        )


if __name__ == "__main__":
    unittest.main()
