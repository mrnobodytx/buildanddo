# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/foundry/test_validation.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/validation.py, foundry/shared/federal_foundry/models.py, foundry/shared/federal_foundry/evidence.py, foundry/shared/federal_foundry/registry.py, foundry/shared/federal_foundry/portfolio.py
# EnumType:    Test
# EnumEdges:   VALIDATES foundry/shared/federal_foundry/validation.py; VALIDATES foundry/shared/federal_foundry/models.py; VALIDATES foundry/shared/federal_foundry/evidence.py; VALIDATES foundry/shared/federal_foundry/registry.py; VALIDATES foundry/shared/federal_foundry/portfolio.py
# DAG Node:    none
# Intent:      Reject malformed and altered artifacts before scoped evidence changes requirements or exported research claims.
# ───────────────────────────────────────────────────────────────

"""Check artifact integrity, closed schemas and atomic evidence promotion."""

from __future__ import annotations

import copy
from dataclasses import replace
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from foundry.shared.federal_foundry.evidence import (
    ClaimEvidenceCompiler,
    RequirementTracker,
    evidence_index,
)
from foundry.shared.federal_foundry.models import (
    EvidenceRecord,
    FoundryValidationError,
    LaneResults,
    Opportunity,
)
from foundry.shared.federal_foundry.portfolio import PortfolioCompiler
from foundry.shared.federal_foundry.registry import OpportunityRegistry, load_yaml
from foundry.shared.federal_foundry.validation import (
    canonical,
    contained,
    decode,
    digest,
    finite,
    integer,
    manifest,
    mapping,
    read_bytes,
    records,
    relative_path,
    staging,
    strings,
    validate_contract,
    verify_manifest,
)
from tests.foundry.test_foundry import ROOT


def reviewed(**changes: object) -> EvidenceRecord:
    """Create explicitly synthetic reviewer metadata for isolated policy cases."""
    values = {
        "evidence_id": "TEST-REVIEW",
        "title": "Test fixture review",
        "state": "verified",
        "locator": "foundry/fixtures/review.json",
        "digest": digest(b"reviewed fixture\n"),
        "requirement_ids": ("DV026-REQ-01",),
        "claim_ids": ("DV026-CLM-01",),
    }
    values.update(changes)
    values["review"] = {
        "reviewer": "test-fixture",
        "method": "isolated policy test",
        "scope": "fixture only",
        "reviewed_at": "2026-09-16T00:00:00Z",
        "digest": values["digest"],
        "outcome": "pass",
    }
    return EvidenceRecord(**values)


class ValidationTests(unittest.TestCase):
    def test_json_rejects_duplicate_nonfinite_and_non_json_values(self) -> None:
        for raw in (b'{"a":1,"a":2}', b'{"a":NaN}', b'{"a":Infinity}', b"[", b"\xff"):
            with self.subTest(raw=raw), self.assertRaises(FoundryValidationError):
                decode(raw)
        for value in ({"a": float("inf")}, {"a": object()}, {1: "invalid key"}):
            with (
                self.subTest(value=repr(value)),
                self.assertRaises(FoundryValidationError),
            ):
                canonical(value)
        self.assertEqual(
            canonical({"z": 2, "a": [None, False, 1.5]}),
            b'{"a":[null,false,1.5],"z":2}\n',
        )
        self.assertEqual(decode(canonical({"a": "caf\u00e9"})), {"a": "caf\u00e9"})
        self.assertEqual(decode(canonical({"a": (1, 2)})), {"a": [1, 2]})
        with self.assertRaises(FoundryValidationError):
            decode(b" " * (4 * 1024 * 1024 + 1))
        with self.assertRaises(FoundryValidationError):
            decode(("[" * 34 + "0" + "]" * 34).encode())

    def test_primitives_reject_ambiguous_ids_and_boolean_measurements(self) -> None:
        for function, values in (
            (mapping, (None, [], {1: "x"})),
            (records, (None, {}, [False])),
            (strings, (None, ["a", "a"], [""])),
            (finite, (True, None, "1", float("nan"))),
        ):
            for value in values:
                with (
                    self.subTest(function=function.__name__, value=value),
                    self.assertRaises(FoundryValidationError),
                ):
                    function(value)
        for value in (True, 1.1, -1, 11):
            with self.assertRaises(FoundryValidationError):
                integer(value, 0, 10, "count")
        self.assertEqual(integer(0, 0, 10, "count"), 0)
        for path in (
            "",
            "/tmp/x",
            "../x",
            "a/../x",
            "a//x",
            "a\\x",
            "a:x",
            "a/./x",
            "a\x00",
        ):
            with self.subTest(path=path), self.assertRaises(FoundryValidationError):
                relative_path(path)
        self.assertEqual(
            relative_path("public/result.json").as_posix(), "public/result.json"
        )

    def test_yaml_rejects_duplicates_aliases_merges_and_unsafe_tags(self) -> None:
        cases = (
            "x: 1\nx: 2\n",
            "x: &a [1]\ny: *a\n",
            "<<: {}\n",
            "1: value\n",
            "x: .nan\n",
            "x: !!python/object:bad {}\n",
            "x: 2026-09-16\n",
            "x: " + "[" * 34 + "0" + "]" * 34 + "\n",
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for text in cases:
                (root / "input.yaml").write_text(text)
                with self.subTest(text=text), self.assertRaises(FoundryValidationError):
                    load_yaml(root, "input.yaml")
            (root / "input.yaml").write_text("x: ['a', 2, null]\n")
            self.assertEqual(load_yaml(root, "input.yaml"), {"x": ["a", 2, None]})

    def test_paths_and_manifests_detect_missing_extra_and_changed_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "files"
            root.mkdir()
            (root / "a.json").write_bytes(b"{}\n")
            initial = manifest(root)
            verify_manifest(root, initial)
            self.assertEqual(read_bytes(root, "a.json"), b"{}\n")
            (root / "a.json").write_bytes(b"[]\n")
            with self.assertRaises(FoundryValidationError):
                verify_manifest(root, initial)
            (root / "a.json").write_bytes(b"{}\n")
            (root / "extra").write_text("untracked")
            with self.assertRaises(FoundryValidationError):
                verify_manifest(root, initial)
            (root / "extra").unlink()
            (root / "a.json").unlink()
            with self.assertRaises(FoundryValidationError):
                verify_manifest(root, initial)
            (root / "link").symlink_to(Path(tmp))
            with self.assertRaises(FoundryValidationError):
                contained(root, "link/outside")
            with self.assertRaises(FoundryValidationError):
                manifest(root)
            (root / "link").unlink()
            with self.assertRaises(FoundryValidationError):
                contained(root, "missing")
            (root / "large").write_bytes(b"x" * (4 * 1024 * 1024 + 1))
            with self.assertRaises(FoundryValidationError):
                read_bytes(root, "large")
            with self.assertRaises(FoundryValidationError):
                contained(root, "large/child")

    def test_staging_is_atomic_and_never_overwrites_authored_or_existing_work(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            destination = parent / "output"
            with self.assertRaises(RuntimeError):
                with staging(destination) as stage:
                    (stage / "partial").write_text("partial")
                    raise RuntimeError("interrupted compilation")
            self.assertFalse(destination.exists())
            self.assertEqual(list(parent.iterdir()), [])
            with staging(destination) as stage:
                (stage / "finished").write_text("complete")
            self.assertEqual((destination / "finished").read_text(), "complete")
            with self.assertRaises(FoundryValidationError):
                with staging(destination):
                    self.fail("existing output accepted")
            with self.assertRaises(FoundryValidationError):
                with staging(parent / "authored" / "child", parent / "authored"):
                    self.fail("authored output accepted")
            (parent / "link").symlink_to(parent, target_is_directory=True)
            with self.assertRaises(FoundryValidationError):
                with staging(parent / "link" / "other"):
                    self.fail("linked output accepted")

    def test_schema_validates_nested_references_constraints_and_closed_properties(
        self,
    ) -> None:
        schema = {
            "type": "object",
            "additionalProperties": False,
            "required": ["value"],
            "properties": {"value": {"$ref": "#/$defs/values"}},
            "$defs": {
                "values": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 2,
                    "uniqueItems": True,
                    "items": {"type": "integer", "minimum": 1, "maximum": 3},
                }
            },
        }
        validate_contract({"value": [1, 3]}, schema)
        for value in (
            {},
            {"value": []},
            {"value": [0]},
            {"value": [4]},
            {"value": [True]},
            {"value": [1, 1]},
            {"value": [1, 2, 3]},
            {"value": [1], "hidden": 1},
        ):
            with self.subTest(value=value), self.assertRaises(FoundryValidationError):
                validate_contract(value, schema)
        for bad in (
            {"$ref": "https://example.test/schema"},
            {"type": "string", "format": "email"},
            {"type": "invalid"},
            {"$ref": "#/$defs/missing"},
        ):
            with self.assertRaises(FoundryValidationError):
                validate_contract("a", bad)
        for value in ("", "ABC", "toolong"):
            with self.assertRaises(FoundryValidationError):
                validate_contract(
                    value,
                    {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 4,
                        "pattern": "^[a-z]+$",
                    },
                )
        with self.assertRaises(FoundryValidationError):
            validate_contract("b", {"enum": ["a"]})
        with self.assertRaises(FoundryValidationError):
            validate_contract("b", {"const": "a"})
        validate_contract(None, {"type": ["string", "null"]})
        validate_contract(1.1, {"type": "number"})

    def test_registry_applies_schema_and_rejects_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "foundry"
            shutil.copytree(
                ROOT / "foundry", root, ignore=shutil.ignore_patterns("__pycache__")
            )
            path = root / "registry/darpa-dv026-influence/opportunity.yaml"
            original = path.read_text()
            for text in (
                original + "\nnot_in_schema: true\n",
                original.replace("requirements:\n", "requirements: []\nunused:\n"),
            ):
                path.write_text(text)
                with self.assertRaises(FoundryValidationError):
                    OpportunityRegistry(root).load("darpa-dv026-influence")
            path.write_text(original)
            other = path.with_name("copy.yaml")
            path.rename(other)
            path.symlink_to(other)
            with self.assertRaises(FoundryValidationError):
                OpportunityRegistry(root).load("darpa-dv026-influence")


class PromotionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.opportunity = OpportunityRegistry(ROOT / "foundry").load(
            "darpa-dv026-influence"
        )

    def test_verified_state_requires_review_for_the_exact_digest(self) -> None:
        proof = reviewed()
        for changes in (
            {"digest": None},
            {"review": None},
            {"review": {**proof.review, "digest": "b" * 64}},
            {"review": {**proof.review, "outcome": "fail"}},
            {"review": {**proof.review, "method": ""}},
            {"review": {**proof.review, "reviewed_at": "yesterday"}},
            {"review": {**proof.review, "reviewed_at": "2026-09-16T00:00:00"}},
        ):
            with (
                self.subTest(changes=changes),
                self.assertRaises(FoundryValidationError),
            ):
                replace(proof, **changes)
        for digest_value in ("invalid", "A" * 64, 1):
            with self.assertRaises(FoundryValidationError):
                EvidenceRecord.from_mapping(
                    {
                        "id": "x",
                        "title": "x",
                        "state": "observed",
                        "locator": "x",
                        "digest": digest_value,
                    },
                    "proof",
                )
        with self.assertRaises(FoundryValidationError):
            replace(proof, requirement_ids=("a", "a"))

    def test_tracker_applies_an_entire_update_batch_or_nothing(self) -> None:
        proof = reviewed()
        tracker = RequirementTracker(self.opportunity, evidence_index((proof,)))
        before = tracker.rows()
        with self.assertRaises(FoundryValidationError):
            tracker.apply(
                [
                    {
                        "id": "DV026-REQ-01",
                        "status": "satisfied",
                        "evidence_ids": [proof.evidence_id],
                    },
                    {
                        "id": "DV026-REQ-02",
                        "status": "satisfied",
                        "evidence_ids": [proof.evidence_id],
                    },
                ]
            )
        self.assertEqual(before, tracker.rows())
        for update in (
            {"id": "DV026-REQ-01", "status": "invented"},
            {"id": "DV026-REQ-01", "status": "open", "text": "weakened requirement"},
            {"id": "DV026-REQ-01", "status": "open", "evidence_ids": ["x", "x"]},
        ):
            with self.assertRaises(FoundryValidationError):
                tracker.apply([update])
        with self.assertRaises(FoundryValidationError):
            tracker.apply([{"id": "DV026-REQ-01", "status": "open"}] * 2)
        tracker.apply(
            [
                {
                    "id": "DV026-REQ-01",
                    "status": "not_applicable",
                    "justification": "explicit test scope",
                }
            ]
        )
        self.assertEqual(tracker.rows()[0].status, "not_applicable")

    def test_review_cannot_be_reused_for_a_foreign_claim_or_rewrite_claim_text(
        self,
    ) -> None:
        available = tuple(
            EvidenceRecord.from_mapping(row, "available")
            for row in self.opportunity.evidence_available
        )
        proof = reviewed(claim_ids=("DV026-CLM-02",))
        compiler = ClaimEvidenceCompiler(
            self.opportunity, evidence_index((*available, proof))
        )
        for update in (
            {
                "id": "DV026-CLM-01",
                "assertion_level": "verified",
                "evidence_ids": [proof.evidence_id],
            },
            {
                "id": "DV026-CLM-01",
                "assertion_level": "proposed",
                "text": "replacement",
            },
            {"id": "DV026-CLM-01", "assertion_level": "invented"},
            {"id": "unknown", "assertion_level": "proposed"},
        ):
            with self.assertRaises(FoundryValidationError):
                compiler.compile([update])
        with self.assertRaises(FoundryValidationError):
            compiler.compile(
                [{"id": "DV026-CLM-01", "assertion_level": "proposed"}] * 2
            )

    def test_compilation_checks_actual_evidence_bytes_before_publishing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            shutil.copytree(
                ROOT / "foundry",
                root / "foundry",
                ignore=shutil.ignore_patterns("__pycache__"),
            )
            proof = reviewed()
            artifact = root / proof.locator
            artifact.write_bytes(b"reviewed fixture\n")
            path = root / "foundry/lanes/darpa-dv026-influence/results.json"
            document = json.loads(path.read_text())
            document["evidence"] = [
                {
                    "id": proof.evidence_id,
                    "title": proof.title,
                    "locator": proof.locator,
                    "digest": proof.digest,
                    "state": proof.state,
                    "requirement_ids": list(proof.requirement_ids),
                    "claim_ids": list(proof.claim_ids),
                    "review": proof.review,
                }
            ]
            document["requirement_updates"] = [
                {
                    "id": "DV026-REQ-01",
                    "status": "satisfied",
                    "evidence_ids": [proof.evidence_id],
                }
            ]
            path.write_text(json.dumps(document))
            compiler = PortfolioCompiler(root)
            destination = Path(tmp) / "bundle"
            compiler.compile_lane("darpa-dv026-influence", destination)
            index = json.loads((destination / "evidence_index.json").read_text())
            row = next(
                row for row in index["evidence"] if row["id"] == proof.evidence_id
            )
            self.assertEqual(
                (destination / row["locator"]).read_bytes(), artifact.read_bytes()
            )
            self.assertEqual(row["byte_verification"], "matched")
            self.assertIn(
                "| satisfied |", (destination / "requirements_matrix.md").read_text()
            )
            self.assertFalse(
                json.loads((destination / "readiness.json").read_text())[
                    "submission_ready"
                ]
            )
            artifact.write_bytes(b"changed after review\n")
            bad = Path(tmp) / "bad"
            with self.assertRaisesRegex(FoundryValidationError, "digest mismatch"):
                compiler.compile_lane("darpa-dv026-influence", bad)
            self.assertFalse(bad.exists())
            for locator in ("../outside", ".env", "private/evidence", "/etc/passwd"):
                document["evidence"][0]["locator"] = locator
                path.write_text(json.dumps(document))
                with self.assertRaises(FoundryValidationError):
                    compiler.compile_lane("darpa-dv026-influence", bad)

    def test_result_records_reject_invalid_outcomes_and_nonfinite_metrics(self) -> None:
        base = json.loads(
            (ROOT / "foundry/lanes/darpa-dv026-influence/results.json").read_text()
        )
        for row in (
            {"id": "x", "status": "made_up"},
            {"id": "x", "status": "succeeded", "metrics": {"score": True}},
            {"id": "x", "status": "succeeded", "metrics": {"score": float("nan")}},
        ):
            raw = copy.deepcopy(base)
            raw["experiments"] = [row]
            with self.subTest(row=row), self.assertRaises(FoundryValidationError):
                LaneResults.from_mapping(raw)
        for changes in (
            {"schema_version": "unknown"},
            {"evidence": [{}]},
            {"requirement_updates": [{"id": "x", "status": "bad"}]},
            {"claim_updates": [{"id": "x", "assertion_level": "bad"}]},
        ):
            with self.assertRaises(FoundryValidationError):
                LaneResults.from_mapping({**base, **changes})
        raw_opportunity = dict(
            load_yaml(
                ROOT / "foundry", "registry/darpa-dv026-influence/opportunity.yaml"
            )
        )
        for changes in (
            {"lane_id": "../bad"},
            {"eligibility": [{"id": "x", "criterion": "x", "status": "bad"}]},
            {
                "milestones": [
                    {
                        "id": "x",
                        "name": "x",
                        "status": "open",
                        "requirement_ids": ["bad"],
                    }
                ]
            },
        ):
            with self.assertRaises(FoundryValidationError):
                Opportunity.from_mapping({**raw_opportunity, **changes})
