# ─── CGRF Header ────────────────────────────
# File:        tests/upgrade/test_semantic_twin_phase1_complete.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/__init__.py, libs/semantic_twin/ingestion/__init__.py, libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/inputs.py, libs/semantic_twin/phase1/__init__.py, libs/semantic_twin/phase1/__main__.py, libs/semantic_twin/phase1/common.py, libs/semantic_twin/phase1/compat.py, libs/semantic_twin/phase1/history.py, libs/semantic_twin/phase1/memory.py, libs/semantic_twin/phase1/merkle.py, libs/semantic_twin/phase1/providers.py, libs/semantic_twin/phase1/release_state.py, libs/semantic_twin/phase1/sbom.py, libs/semantic_twin/phase1/truth.py, libs/semantic_twin/vocabulary.py
# EnumType:    Test
# EnumEdges:   CONSUMES libs/semantic_twin/__init__.py; CONSUMES libs/semantic_twin/ingestion/__init__.py; CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/inputs.py; CONSUMES libs/semantic_twin/phase1/__init__.py; CONSUMES libs/semantic_twin/phase1/__main__.py; CONSUMES libs/semantic_twin/phase1/common.py; CONSUMES libs/semantic_twin/phase1/compat.py; CONSUMES libs/semantic_twin/phase1/history.py; CONSUMES libs/semantic_twin/phase1/memory.py; CONSUMES libs/semantic_twin/phase1/merkle.py; CONSUMES libs/semantic_twin/phase1/providers.py; CONSUMES libs/semantic_twin/phase1/release_state.py; CONSUMES libs/semantic_twin/phase1/sbom.py; CONSUMES libs/semantic_twin/phase1/truth.py; CONSUMES libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-1.complete.tests
# Intent:      Prove all ten complete Phase 1 adapters, reconciliation, epoch and replay proof behaviors without live providers or deployment actions.
# ───────────────────────────────────────────────────────

"""Test completion of all ten local Phase 1 semantic twin capabilities."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import replace
from datetime import datetime, timezone
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch

from libs.semantic_twin.ingestion import RELEASE_PATH_IDS
from libs.semantic_twin.ingestion.graph import SemanticGraph, combine_graphs
from libs.semantic_twin import CanonicalObjectEnvelope, EntityType
from libs.semantic_twin.ingestion.builder import (
    ObjectDraft,
    RelationDraft,
    canonical_id,
    object_kind,
)
from libs.semantic_twin.ingestion.inputs import SourceSnapshot
from libs.semantic_twin.phase1 import (
    Phase1Inputs,
    assess_claims,
    build_epoch,
    compile_context_bundle,
    compile_phase1,
    inclusion_proof,
    parse_sbom,
    read_git_history,
    reconcile_release_truth,
    verify_context_bundle,
    verify_inclusion,
)
from libs.semantic_twin.phase1.__main__ import main as phase1_main
from libs.semantic_twin.phase1.common import relation
from libs.semantic_twin.phase1.compat import make_object as build_object
from libs.semantic_twin.phase1.history import history_graph, parse_git_log
from libs.semantic_twin.phase1.memory import ingest_memory_file
from libs.semantic_twin.phase1.merkle import ProofStep
from libs.semantic_twin.phase1.providers import (
    ingest_datadog_export,
    ingest_gitlab_export,
)
from libs.semantic_twin.phase1.release_state import (
    discover_release_receipts,
    ingest_release_receipts,
    release_receipt_graph,
)
from libs.semantic_twin.phase1.sbom import discover_sbom_paths, sbom_graph
from libs.semantic_twin.phase1.truth import TRUTH_MATRIX_ID
from libs.semantic_twin.vocabulary import EvidenceState, RelationPredicate


REPO = Path(__file__).resolve().parents[2]
ANCHOR = RELEASE_PATH_IDS[-1]
COMMIT = "a" * 40
FIXTURE_TIME = datetime(2026, 9, 19, tzinfo=timezone.utc)


def make_object(
    identity: str,
    kind: str,
    source_path: str,
    *,
    claims: tuple[Mapping[str, object], ...],
    relations: tuple[RelationDraft, ...] = (),
    observed_at: datetime = FIXTURE_TIME,
) -> ObjectDraft:
    """Build a simulated observation with explicit, replayable fixture input."""
    return build_object(
        identity,
        kind,
        source_path,
        snapshot=SourceSnapshot.derived(
            source_path,
            {"fixture": identity, "claims": claims},
            observed_at=observed_at,
        ),
        claims=claims,
        relations=relations,
    )


def _write_json(path: Path, value: object) -> Path:
    """Write deterministic test JSON and return its path."""

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True), encoding="utf-8")
    return path


def _anchor() -> ObjectDraft:
    """Create the release evidence anchor used by standalone graph tests."""

    return make_object(
        ANCHOR,
        "EvidenceReceipt",
        "fixture:anchor",
        claims=({"stage": "evidence receipt"},),
    )


class ReleaseStateTests(unittest.TestCase):
    """Verify controller release-state receipt ingestion."""

    def test_discovers_normalizes_and_connects_release_receipts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            receipt = _write_json(
                root
                / "state"
                / "sprint"
                / "campaign"
                / "release"
                / "production.latest.json",
                {
                    "schema": "buildanddo.deployment/v1",
                    "state": "PASS",
                    "environment": "production",
                    "deployed_at": "2026-09-19T01:00:00Z",
                    "commit_sha": COMMIT,
                    "artifact_sha256": "b" * 64,
                    "receipt_path": "state/release/production.latest.json",
                },
            )
            discovered = discover_release_receipts(root)
            self.assertEqual(discovered, (receipt,))
            records = ingest_release_receipts(discovered, repository_root=root)
            self.assertEqual(records[0].environment, "production")
            self.assertEqual(records[0].commit_sha, COMMIT)
            graph = release_receipt_graph(records, anchor_id=ANCHOR, commit=COMMIT)
            connected = combine_graphs(SemanticGraph((_anchor(),)), graph)
            self.assertTrue(connected.is_connected())
            self.assertEqual(
                graph.objects[0].state.evidence_state, EvidenceState.OBSERVED
            )


class GitHistoryTests(unittest.TestCase):
    """Verify bounded local Git evolution ingestion."""

    def test_parses_changes_and_reads_real_local_history_without_mutation(self) -> None:
        raw = (
            f"\x1e{COMMIT}\x1f{'b' * 40}\x1f2026-09-19T01:00:00+00:00"
            "\x1fAdd release truth\nA\tnew.py\nR100\told.py\trenamed.py\n"
        )
        parsed = parse_git_log(raw)
        self.assertEqual(parsed[0].changes[0].status, "A")
        self.assertEqual(parsed[0].changes[1].old_path, "old.py")
        observed = read_git_history(
            REPO,
            max_count=2,
            paths=("tools/buildanddo_release.py",),
        )
        self.assertGreaterEqual(len(observed), 1)
        graph = history_graph(parsed, anchor_id=ANCHOR)
        self.assertIn("GitCommit", {object_kind(item) for item in graph.objects})
        self.assertIsNotNone(graph.objects[0].valid_time.valid_from)
        predicates = {edge.predicate for edge in graph.relations()}
        self.assertIn(RelationPredicate.INTRODUCED_BY, predicates)
        self.assertIn(RelationPredicate.CHANGED_BY, predicates)


class SbomTests(unittest.TestCase):
    """Verify CycloneDX, SPDX and npm lock normalization."""

    def test_parses_three_formats_and_dependency_edges(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cyclone = _write_json(
                root / "release-sbom.json",
                {
                    "bomFormat": "CycloneDX",
                    "components": [
                        {"bom-ref": "app", "name": "app", "version": "1"},
                        {"bom-ref": "lib", "name": "lib", "version": "2"},
                    ],
                    "dependencies": [{"ref": "app", "dependsOn": ["lib"]}],
                },
            )
            spdx = _write_json(
                root / "release-spdx.json",
                {
                    "spdxVersion": "SPDX-2.3",
                    "packages": [
                        {"SPDXID": "SPDXRef-A", "name": "a", "versionInfo": "1"},
                        {"SPDXID": "SPDXRef-B", "name": "b", "versionInfo": "2"},
                    ],
                    "relationships": [
                        {
                            "spdxElementId": "SPDXRef-A",
                            "relationshipType": "DEPENDS_ON",
                            "relatedSpdxElement": "SPDXRef-B",
                        }
                    ],
                },
            )
            lock = _write_json(
                root / "package-lock.json",
                {
                    "name": "root",
                    "lockfileVersion": 3,
                    "packages": {
                        "": {"dependencies": {"dep": "1.0.0"}},
                        "node_modules/dep": {"name": "dep", "version": "1.0.0"},
                    },
                },
            )
            self.assertEqual(set(discover_sbom_paths(root)), {cyclone, spdx, lock})
            documents = tuple(
                parse_sbom(path, repository_root=root) for path in (cyclone, spdx, lock)
            )
            self.assertEqual(
                [item.format for item in documents], ["cyclonedx", "spdx", "npm-lock"]
            )
            graph = sbom_graph(documents, anchor_id=ANCHOR, commit=COMMIT)
            self.assertEqual(
                sum(
                    edge.predicate is RelationPredicate.DEPENDS_ON
                    for edge in graph.relations()
                ),
                3,
            )
            self.assertTrue(
                combine_graphs(SemanticGraph((_anchor(),)), graph).is_connected()
            )


class ProviderExportTests(unittest.TestCase):
    """Verify captured GitLab and Datadog provider export adapters."""

    def test_gitlab_export(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = _write_json(
                root / "gitlab.json",
                {
                    "pipelines": [{"id": 1, "sha": COMMIT, "status": "success"}],
                    "jobs": [{"id": 2, "pipeline_id": 1, "status": "success"}],
                    "artifacts": [{"id": 3, "job_id": 2, "sha256": "c" * 64}],
                },
            )
            graph = ingest_gitlab_export(path, anchor_id=ANCHOR, repository_root=root)
            self.assertEqual(
                {object_kind(item) for item in graph.objects},
                {"GitLabExport", "GitLabPipeline", "GitLabJob", "GitLabArtifact"},
            )
            self.assertTrue(
                all(
                    item.state.evidence_state is EvidenceState.OBSERVED
                    for item in graph.objects
                )
            )
            artifact = next(
                item for item in graph.objects if object_kind(item) == "GitLabArtifact"
            )
            self.assertEqual(
                artifact.relations[0].predicate, RelationPredicate.DERIVED_FROM
            )

    def test_datadog_export(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = _write_json(
                root / "datadog.json",
                {
                    "dora": [{"id": "d1", "sha": COMMIT, "env": "production"}],
                    "traces": [{"trace_id": "t1", "status": "ok"}],
                    "events": [{"event_id": "e1", "state": "observed"}],
                    "verifications": [
                        {
                            "id": "v1",
                            "commit_sha": COMMIT,
                            "environment": "production",
                            "state": "PASS",
                        }
                    ],
                },
            )
            graph = ingest_datadog_export(path, anchor_id=ANCHOR, repository_root=root)
            self.assertEqual(len(graph.objects), 5)
            self.assertIn(
                "RuntimeVerification", {object_kind(item) for item in graph.objects}
            )
            self.assertTrue(
                all(
                    item.state.evidence_state is EvidenceState.OBSERVED
                    for item in graph.objects
                )
            )


class MemoryTests(unittest.TestCase):
    """Verify Type A/B/C memory vectors retain distinct semantics."""

    def test_compiles_typed_vectors_and_enumspeak_edges(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = _write_json(
                root / "memory.json",
                {
                    "vectors": [
                        {"type": "A", "file_path": "a.py", "outcome": "success"},
                        {
                            "type": "B",
                            "source": "a.py",
                            "target": "b.py",
                            "edge_type": "CALLS",
                        },
                        {"type": "C", "event_type": "test_pass"},
                    ],
                    "summary": {"dispatch_id": "VCC-X", "type_a_count": 1},
                },
            )
            graph = ingest_memory_file(path, anchor_id=ANCHOR, repository_root=root)
            types = {object_kind(item) for item in graph.objects}
            self.assertTrue(
                {"MemoryFileVector", "MemoryEdgeVector", "MemoryEventVector"}.issubset(
                    types
                )
            )
            self.assertIn(
                RelationPredicate.REFERENCES,
                {edge.predicate for edge in graph.relations()},
            )
            edge_vector = next(
                item
                for item in graph.objects
                if object_kind(item) == "MemoryEdgeVector"
            )
            self.assertEqual(edge_vector.claims[0]["edge_type"], "CALLS")
            self.assertNotIn(
                RelationPredicate.CALLS, {edge.predicate for edge in graph.relations()}
            )
            combined = combine_graphs(SemanticGraph((_anchor(),)), graph)
            self.assertTrue(combined.is_connected())


class ClaimIntelligenceTests(unittest.TestCase):
    """Verify symbol-level evidence and stale-reference detection."""

    def test_matches_symbols_across_files_and_marks_stale_references(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "src" / "release.py"
            source.parent.mkdir(parents=True)
            source.write_text(
                "def ship():\n    return 'production'\n", encoding="utf-8"
            )
            symbol = make_object(
                "code://ship",
                "CodeSymbol",
                "src/release.py",
                claims=({"name": "ship", "qualified_name": "ship"},),
                relations=(
                    relation(RelationPredicate.ABOUT, "claim://one", "fixture"),
                ),
            )
            claim = make_object(
                "claim://one",
                "DocumentationClaim",
                "docs/release.md",
                claims=(
                    {
                        "text": "The controller calls `ship()`.",
                        "classification": "UNMEASURED",
                    },
                ),
                relations=(
                    relation(RelationPredicate.ABOUT, symbol.semantic_id, "fixture"),
                ),
            )
            stale_claim = make_object(
                "claim://stale",
                "DocumentationClaim",
                "docs/stale.md",
                claims=(
                    {
                        "text": "The code is in `missing/release.py`.",
                        "classification": "ENTAILED",
                    },
                ),
                relations=(
                    relation(RelationPredicate.ABOUT, symbol.semantic_id, "fixture"),
                ),
            )
            graph = SemanticGraph((symbol, claim, stale_claim))
            assessments = assess_claims(
                graph,
                root,
                source_paths=("src/release.py",),
                current_commit=COMMIT,
                document_versions={"docs/release.md": "b" * 40},
            )
            by_claim = {item.claims[0]["claim_id"]: item for item in assessments}
            self.assertTrue(by_claim[claim.semantic_id].claims[0]["stale"])
            self.assertTrue(by_claim[claim.semantic_id].claims[0]["source_evidence"])
            self.assertEqual(
                by_claim[stale_claim.semantic_id].claims[0]["classification"],
                "UNMEASURED",
            )
            self.assertEqual(
                by_claim[stale_claim.semantic_id].claims[0]["stale_missing_references"],
                ("missing/release.py",),
            )


class ReconciliationTests(unittest.TestCase):
    """Verify expected and observed release truth reconciliation."""

    def test_distinguishes_match_conflict_and_unmeasured_rows(self) -> None:
        receipt = make_object(
            "receipt://prod",
            "ReleaseStateReceipt",
            "production.json",
            claims=(
                {
                    "commit_sha": COMMIT,
                    "artifact_digest": "d" * 64,
                    "environment": "production",
                    "state": "PASS",
                },
            ),
            relations=(relation(RelationPredicate.ABOUT, "dora://one", "fixture"),),
        )
        dora = make_object(
            "dora://one",
            "DatadogDoraDeployment",
            "datadog.json",
            claims=({"sha": COMMIT, "state": "OBSERVED"},),
            relations=(
                relation(RelationPredicate.ABOUT, receipt.semantic_id, "fixture"),
            ),
        )
        graph = SemanticGraph((receipt, dora))
        matrix = reconcile_release_truth(
            graph,
            expected_commit=COMMIT,
            expected_artifact_digest="d" * 64,
        )
        rows = matrix.claims[0]["rows"]
        self.assertEqual(rows["source_sha"]["status"], "MATCH")
        self.assertEqual(rows["artifact_identity"]["status"], "MATCH")
        self.assertEqual(rows["staging_verification"]["status"], "UNMEASURED")
        conflict = reconcile_release_truth(graph, expected_commit="e" * 40)
        self.assertEqual(conflict.claims[0]["overall"], "CONFLICT")


class MerkleEpochTests(unittest.TestCase):
    """Verify deterministic graph roots and inclusion proofs."""

    @staticmethod
    def graph() -> SemanticGraph:
        """Return a two-object connected fixture graph."""

        first = make_object(
            "fixture://one",
            "Observation",
            "fixture:one",
            claims=({"name": "one"},),
            relations=(relation(RelationPredicate.ABOUT, "fixture://two", "fixture"),),
        )
        second = make_object(
            "fixture://two",
            "Observation",
            "fixture:two",
            claims=({"name": "two"},),
            relations=(relation(RelationPredicate.ABOUT, "fixture://one", "fixture"),),
        )
        return SemanticGraph((first, second))

    def test_roots_and_proofs_are_deterministic_and_tamper_evident(self) -> None:
        epoch = build_epoch(self.graph())
        self.assertEqual(epoch, build_epoch(self.graph()))
        proof = inclusion_proof(epoch, canonical_id("Observation", "fixture://one"))
        self.assertTrue(verify_inclusion(proof, epoch.root_digest))
        tampered = replace(
            proof,
            steps=(ProofStep(proof.steps[0].side, "0" * 64), *proof.steps[1:]),
        )
        self.assertFalse(verify_inclusion(tampered, epoch.root_digest))


class ContextProofTests(unittest.TestCase):
    """Verify query proof selection and historical replay boundaries."""

    def test_selects_relevant_objects_and_excludes_later_knowledge(self) -> None:
        early = make_object(
            "context://early",
            "GitCommit",
            "git:early",
            observed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            claims=(
                {
                    "subject": "production release",
                    "authored_at": "2026-01-01T00:00:00+00:00",
                },
            ),
            relations=(relation(RelationPredicate.ABOUT, "context://late", "fixture"),),
        )
        late = make_object(
            "context://late",
            "GitCommit",
            "git:late",
            observed_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
            claims=(
                {
                    "subject": "production verification",
                    "authored_at": "2026-03-01T00:00:00+00:00",
                },
            ),
            relations=(
                relation(RelationPredicate.ABOUT, "context://early", "fixture"),
            ),
        )
        graph = SemanticGraph((early, late))
        epoch = build_epoch(graph)
        bundle = compile_context_bundle(
            graph,
            epoch,
            "production verification release",
            historical_cutoff=datetime(2026, 2, 1, tzinfo=timezone.utc),
        )
        self.assertEqual(
            [item.semantic_id for item in bundle.selections], [early.semantic_id]
        )
        self.assertEqual(bundle.excluded_later_objects, (late.semantic_id,))
        self.assertTrue(verify_context_bundle(bundle))


class CompleteCompilerTests(unittest.TestCase):
    """Verify all ten capabilities compose into one connected proof payload."""

    @classmethod
    def setUpClass(cls) -> None:
        """Compile once against bounded repository inputs for suite efficiency."""

        cls.compilation = compile_phase1(
            REPO,
            inputs=Phase1Inputs(
                release_receipts=(),
                sbom_paths=(),
                memory_paths=(),
                history_limit=2,
            ),
        )

    def test_complete_graph_is_connected_and_explicit_about_missing_exports(
        self,
    ) -> None:
        value = self.compilation
        self.assertTrue(value.graph.is_connected())
        self.assertEqual(value.truth_matrix_id, TRUTH_MATRIX_ID)
        gaps = [
            item
            for item in value.graph.objects
            if object_kind(item) == "UnmeasuredInput"
        ]
        self.assertEqual(len(gaps), 5)
        self.assertTrue(verify_context_bundle(value.context))
        self.assertEqual(value.epoch.object_count, len(value.graph.objects))
        for item in value.graph.objects:
            self.assertIsInstance(item.object_type, EntityType)
            self.assertEqual(CanonicalObjectEnvelope.from_json(item.to_json()), item)

    def test_compiler_joins_explicit_local_exports(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            receipt = _write_json(
                root / "production.latest.json",
                {
                    "state": "PASS",
                    "environment": "production",
                    "commit_sha": COMMIT,
                },
            )
            sbom = _write_json(
                root / "sbom.json",
                {
                    "bomFormat": "CycloneDX",
                    "components": [{"bom-ref": "app", "name": "app"}],
                },
            )
            gitlab = _write_json(
                root / "gitlab.json",
                {"pipelines": [{"id": 1, "sha": COMMIT}]},
            )
            datadog = _write_json(
                root / "datadog.json",
                {"dora": [{"id": "d1", "sha": COMMIT}]},
            )
            memory = _write_json(
                root / "memory.json",
                {"vectors": [{"type": "C", "event_type": "test_pass"}]},
            )
            with (
                patch(
                    "libs.semantic_twin.phase1.compiler.discover_release_receipts",
                    return_value=(receipt,),
                ),
                patch(
                    "libs.semantic_twin.phase1.compiler.discover_sbom_paths",
                    return_value=(sbom,),
                ),
                patch(
                    "libs.semantic_twin.phase1.compiler.discover_memory_paths",
                    return_value=(memory,),
                ),
            ):
                value = compile_phase1(
                    REPO,
                    inputs=Phase1Inputs(
                        gitlab_exports=(gitlab,),
                        datadog_exports=(datadog,),
                        history_limit=1,
                    ),
                    commit=COMMIT,
                )
            object_types = {object_kind(item) for item in value.graph.objects}
            self.assertTrue(
                {
                    "ReleaseStateReceipt",
                    "SoftwareBillOfMaterials",
                    "GitLabPipeline",
                    "DatadogDoraDeployment",
                    "MemoryEventVector",
                }.issubset(object_types)
            )
            self.assertEqual(
                value.to_dict()["schema_version"],
                "semantic-twin.phase1-complete/v2",
            )
            for payload in value.to_dict()["graph"]["objects"]:
                self.assertEqual(
                    CanonicalObjectEnvelope.from_dict(payload).to_dict(), payload
                )

    def test_cli_writes_the_compilation_payload(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "phase1.json"
            fake = SimpleNamespace(to_dict=lambda: {"schema_version": "test/v1"})
            with patch(
                "libs.semantic_twin.phase1.__main__.compile_phase1",
                return_value=fake,
            ):
                result = phase1_main(
                    [
                        "--repo",
                        str(REPO),
                        "--output",
                        str(output),
                        "--history-limit",
                        "2",
                    ]
                )
            self.assertEqual(result, 0)
            self.assertEqual(
                json.loads(output.read_text(encoding="utf-8"))["schema_version"],
                "test/v1",
            )


if __name__ == "__main__":
    unittest.main()
