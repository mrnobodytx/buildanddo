# ─── CGRF Header ─────────────────────────────
# File:        tests/upgrade/test_semantic_twin_ingestion.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/__init__.py, libs/semantic_twin/ingestion/__init__.py, libs/semantic_twin/ingestion/__main__.py, libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/pipeline.py
# EnumType:    Test
# EnumEdges:   CONSUMES libs/semantic_twin/__init__.py; CONSUMES libs/semantic_twin/ingestion/__init__.py; CONSUMES libs/semantic_twin/ingestion/__main__.py; CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/pipeline.py
# DAG Node:    semantic-twin.phase-1.release-ingestion.tests
# Intent:      Prove release ingestion is connected, vocabulary-bound, evidence-aware and byte-for-byte deterministic.
# ──────────────────────────────────────────────────────────

"""Test Phase 1 ingestion of the BuildAndDo release subsystem."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from libs.semantic_twin import (
    CanonicalObjectEnvelope,
    EntityType,
    EvidenceState,
    RelationPredicate,
)
from libs.semantic_twin.ingestion.builder import object_kind
from libs.semantic_twin.ingestion import (
    ClaimDisposition,
    build_release_path_graph,
    canonical_object_bytes,
    classify_claim,
    compile_release_twin,
    extract_documentation_claims,
    ingest_deployment_receipts,
    ingest_release_source,
    serialize_graph,
)
from libs.semantic_twin.ingestion.__main__ import main as ingestion_main
from libs.semantic_twin.ingestion.pipeline import _repository_commit


REPO = Path(__file__).resolve().parents[2]
CONTROLLER = REPO / "tools" / "buildanddo_release.py"


class SourceIngestionTests(unittest.TestCase):
    """Verify the release controller's static semantic extraction."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.graph = ingest_release_source(CONTROLLER, repository_root=REPO)

    def test_extracts_code_symbols_and_connected_call_graph(self) -> None:
        symbols = [obj for obj in self.graph.objects if obj.object_type == "CodeSymbol"]
        names = {str(obj.claims[0]["name"]) for obj in symbols}
        self.assertIn("ReleaseError", names)
        self.assertIn("build_release", names)
        self.assertIn("pipeline_promote", names)
        self.assertIn("main", names)
        self.assertGreater(len(symbols), 50)
        self.assertTrue(self.graph.is_connected())
        self.assertEqual(self.graph.orphan_ids(), ())

    def test_extracts_calls_reads_writes_publications_and_dependencies(self) -> None:
        predicates = {relation.predicate for relation in self.graph.relations()}
        self.assertTrue(
            {
                RelationPredicate.CALLS,
                RelationPredicate.READS,
                RelationPredicate.WRITES,
                RelationPredicate.PUBLISHES,
                RelationPredicate.DEPENDS_ON,
            }.issubset(predicates)
        )
        config_keys = {
            str(obj.claims[0]["key"])
            for obj in self.graph.objects
            if obj.object_type == "ConfigurationKey"
        }
        self.assertIn("DD_API_KEY", config_keys)
        self.assertIn("GITLAB_TOKEN", config_keys)
        dependencies = {
            str(obj.claims[0]["name"])
            for obj in self.graph.objects
            if object_kind(obj) == "ExternalDependency"
        }
        self.assertEqual(dependencies, {"Datadog API", "GitHub", "GitLab"})
        events = {
            str(obj.claims[0]["name"])
            for obj in self.graph.objects
            if object_kind(obj) == "PublishedEvent"
        }
        self.assertIn("dora_deployment", events)
        self.assertIn("production_dora", events)


class ReleaseGraphTests(unittest.TestCase):
    """Verify the canonical release path and combined graph."""

    def test_release_path_is_complete_and_connected(self) -> None:
        graph = build_release_path_graph(CONTROLLER)
        stages = [str(obj.claims[0]["stage"]) for obj in graph.objects]
        self.assertEqual(
            stages,
            [
                "source commit",
                "build artifact",
                "staging deploy",
                "staging verify",
                "production deploy",
                "production verify",
                "DORA emit",
                "evidence receipt",
            ],
        )
        self.assertTrue(graph.is_connected())
        self.assertEqual(graph.orphan_ids(), ())

    def test_full_repository_graph_has_only_phase_zero_vocabulary_and_states(
        self,
    ) -> None:
        graph = compile_release_twin(
            REPO, commit="5703d8ee3deedae1de3e93424265a8238f87eab6"
        )
        self.assertTrue(graph.is_connected())
        self.assertEqual(graph.unresolved_targets(), ())
        for obj in graph.objects:
            self.assertEqual(CanonicalObjectEnvelope.from_json(obj.to_json()), obj)
            self.assertIsInstance(obj.object_type, EntityType)
            self.assertIsInstance(obj.state.evidence_state, EvidenceState)
            for relation in obj.relations:
                self.assertIsInstance(relation.predicate, RelationPredicate)
                self.assertIsInstance(relation.state, EvidenceState)


class RepositoryCommitTests(unittest.TestCase):
    """Verify local commit resolution without invoking Git."""

    def test_resolves_missing_detached_and_packed_git_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.assertIsNone(_repository_commit(root))

            git_directory = root / "git-metadata"
            git_directory.mkdir()
            (root / ".git").write_text("gitdir: git-metadata\n", encoding="utf-8")
            detached = "1" * 40
            (git_directory / "HEAD").write_text(detached + "\n", encoding="utf-8")
            self.assertEqual(_repository_commit(root), detached)

            (git_directory / "HEAD").write_text(
                "ref: refs/heads/fixture\n",
                encoding="utf-8",
            )
            packed = "2" * 40
            (git_directory / "packed-refs").write_text(
                f"# pack-refs with: peeled\n{packed} refs/heads/fixture\n",
                encoding="utf-8",
            )
            self.assertEqual(_repository_commit(root), packed)


class ClaimExtractionTests(unittest.TestCase):
    """Verify deterministic documentation claim classification."""

    def test_classifies_entailed_contradicted_and_unmeasured_claims(self) -> None:
        source = CONTROLLER.read_text(encoding="utf-8")
        self.assertEqual(
            classify_claim("`verify_environment` performs readback.", source),
            ClaimDisposition.ENTAILED,
        )
        self.assertEqual(
            classify_claim("The controller never calls `verify_environment`.", source),
            ClaimDisposition.CONTRADICTED,
        )
        self.assertEqual(
            classify_claim("A signed SBOM is uploaded to the release ledger.", source),
            ClaimDisposition.UNMEASURED,
        )

    def test_extracts_every_fixture_claim_with_a_classification(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            spec = root / "SRS-BUILDANDDO-FIXTURE-001.md"
            spec.write_text(
                "# Fixture\n\n"
                "## Invariants\n\n"
                "- `verify_environment` performs external readback.\n"
                "- The controller never calls `verify_environment`.\n\n"
                "## Acceptance evidence\n\n"
                "1. A signed SBOM is uploaded.\n",
                encoding="utf-8",
            )
            claims = extract_documentation_claims(root, CONTROLLER)
        self.assertEqual(len(claims), 3)
        self.assertEqual(
            {claim.disposition for claim in claims},
            {
                ClaimDisposition.ENTAILED,
                ClaimDisposition.CONTRADICTED,
                ClaimDisposition.UNMEASURED,
            },
        )


class ReceiptIngestionTests(unittest.TestCase):
    """Verify report and memory receipt normalization."""

    def test_extracts_timestamps_shas_states_and_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dispatch = root / "VCC-FIXTURE-001"
            dispatch.mkdir()
            (dispatch / "report.md").write_text(
                "Status: PASS\n"
                "Deployed: 2026-09-18T16:42:11Z\n"
                "Commit: 0123456789abcdef0123456789abcdef01234567\n"
                "Verify: `python -m unittest fixture`\n",
                encoding="utf-8",
            )
            (dispatch / "memory.json").write_text(
                json.dumps(
                    {
                        "event_type": "deploy",
                        "timestamp": "2026-09-18T16:42:12+00:00",
                        "commit_sha": "abcdef0123456789abcdef0123456789abcdef01",
                        "smoke_result": "FAIL",
                        "file_path": "state/release.json",
                    }
                ),
                encoding="utf-8",
            )
            records = ingest_deployment_receipts(root)
        self.assertEqual(len(records), 2)
        self.assertEqual(
            {state for record in records for state in record.verification_results},
            {"PASS", "FAIL"},
        )
        self.assertEqual(
            {sha for record in records for sha in record.shas},
            {
                "0123456789abcdef0123456789abcdef01234567",
                "abcdef0123456789abcdef0123456789abcdef01",
            },
        )
        self.assertTrue(any(record.evidence_refs for record in records))


class SerializerTests(unittest.TestCase):
    """Verify canonical serialization and deterministic leaf hashing."""

    def test_leaf_digests_are_deterministic_and_cover_canonical_envelopes(self) -> None:
        graph = build_release_path_graph(CONTROLLER)
        first = serialize_graph(graph)
        second = serialize_graph(graph)
        self.assertEqual(first, second)

        payload = json.loads(first)
        self.assertEqual(payload["object_count"], 8)
        envelopes = {item.semantic_id: item for item in graph.objects}
        for item in payload["objects"]:
            envelope = envelopes[item["semantic_id"]]
            digest = payload["leaf_digests"][item["semantic_id"]]
            self.assertIsNone(item["merkle"]["leaf_digest"])
            self.assertEqual(CanonicalObjectEnvelope.from_dict(item), envelope)
            self.assertEqual(len(digest), 64)
            self.assertEqual(
                digest,
                hashlib.sha256(canonical_object_bytes(envelope)).hexdigest(),
            )

    def test_cli_writes_the_compiled_graph_without_running_release_code(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "nested" / "semantic-twin.json"
            result = ingestion_main(
                [
                    "--repo",
                    str(REPO),
                    "--output",
                    str(output),
                    "--indent",
                    "2",
                ]
            )
            payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(result, 0)
        self.assertEqual(payload["schema_version"], "semantic-twin.graph/v2")
        self.assertGreater(payload["object_count"], 100)
        source_commit = next(
            item
            for item in payload["objects"]
            if object_kind(CanonicalObjectEnvelope.from_dict(item)) == "SourceCommit"
        )
        self.assertRegex(
            source_commit["source"]["document_version"], r"^sha256:[0-9a-f]{64}$"
        )
        self.assertIsNone(source_commit["source"]["commit"])
        self.assertRegex(
            source_commit["claims"][-1]["ingestion"]["repository_commit_context"],
            r"^[0-9a-f]{40}$",
        )


if __name__ == "__main__":
    unittest.main()
