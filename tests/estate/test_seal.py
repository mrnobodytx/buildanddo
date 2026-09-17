# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/test_seal.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/seal.py, apps/estate/common.py, tests/estate/support.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/estate/seal.py; DEPENDS_ON apps/estate/common.py; DEPENDS_ON tests/estate/support.py
# DAG Node:    none
# Intent:      Prove stable Merkle identities, archive integrity, exact deltas and safe local seal persistence.
# ───────────────────────────────────────────────────────────────

"""Exercise deterministic snapshots, history and cache integrity."""

from __future__ import annotations

from dataclasses import asdict, replace
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from unittest.mock import patch

from apps.estate.common import Diagnostic, EstateError, content_hash, decode_record
from apps.estate.seal import (
    EPOCH_TIMESTAMP, EstateSnapshot, _atomic_write, compare_snapshots, compile_estate,
    create_seal, load_archive, load_latest, make_document, merkle_root,
    repository_provenance, save_snapshot,
)
from tests.estate.support import RepositoryTest


class SealTests(RepositoryTest):
    def test_same_inputs_produce_same_snapshot_merkle_root_and_seal(self) -> None:
        self.repository()
        before = compile_estate(self.root)
        after = compile_estate(self.root)
        self.assertEqual(before, after)
        self.assertEqual(create_seal(before), create_seal(after))
        self.assertEqual(create_seal(before).sha256, content_hash(asdict(before)))
        self.assertEqual(before.timestamp, EPOCH_TIMESTAMP)
        self.assertEqual(before.repo_commit, "unversioned")
        self.assertEqual(merkle_root(before.census), merkle_root(list(reversed(before.census))))
        self.assertEqual(merkle_root([]), hashlib.sha256(b"").hexdigest())
        self.assertNotEqual(merkle_root(before.census[:3]), merkle_root(before.census[:2]))

    def test_seal_output_does_not_contaminate_next_run_and_cache_is_byte_identical(self) -> None:
        self.repository()
        first = save_snapshot(self.root, compile_estate(self.root))
        path = self.root / "state/estate/seal.latest.json"
        initial = path.read_bytes()
        second = save_snapshot(self.root, compile_estate(self.root))
        self.assertEqual(first, second)
        self.assertEqual(path.read_bytes(), initial)
        self.assertEqual(load_latest(self.root), first)
        self.assertEqual(load_archive(self.root, first.seal.seal_id), first)
        self.assertEqual(len(list((self.root / "state/estate/seals").glob("*.json"))), 1)

    def test_delta_detects_added_removed_and_body_only_modified_modules(self) -> None:
        self.repository()
        before = compile_estate(self.root)
        original = (self.root / "apps/decision/runtime.py").read_text()
        self.write("apps/decision/runtime.py", original.replace("return Contract()", "return Contract() if True else None"))
        shutil.rmtree(self.root / "apps/research")
        self.write("apps/new/service.py", "def run():\n    return 1\n")
        after = compile_estate(self.root)
        delta = compare_snapshots(before, after)
        self.assertIn("buildanddo.new", delta.added_modules)
        self.assertIn("buildanddo.research", delta.removed_modules)
        self.assertIn("buildanddo.decision", delta.modified_modules)
        self.assertIn("apps/decision/runtime.py", delta.modified_files)
        self.assertIn("apps/new/service.py", delta.added_files)
        self.assertIn("apps/research/contracts.py", delta.removed_files)
        self.assertIn("apps/new", delta.added_directories)
        self.assertIn("apps/research", delta.removed_directories)
        self.assertTrue(delta.removed_edges)
        old_module = next(module for module in before.modules if module.path == "apps/decision")
        new_module = next(module for module in after.modules if module.path == "apps/decision")
        self.assertEqual(old_module.capabilities, new_module.capabilities)

    def test_restored_source_recovers_identity_and_keeps_actual_predecessor(self) -> None:
        self.repository()
        original = (self.root / "apps/decision/runtime.py").read_text()
        first = save_snapshot(self.root, compile_estate(self.root))
        self.write("apps/decision/runtime.py", original + "\nversion = 2\n")
        second = save_snapshot(self.root, compile_estate(self.root))
        self.assertEqual(second.seal.previous_seal, first.seal.seal_id)
        self.write("apps/decision/runtime.py", original)
        restored = save_snapshot(self.root, compile_estate(self.root))
        self.assertEqual(restored.seal.sha256, first.seal.sha256)
        self.assertEqual(restored.seal.seal_id, first.seal.seal_id)
        self.assertEqual(restored.seal.previous_seal, second.seal.seal_id)
        self.assertEqual(restored.delta.from_seal, second.seal.seal_id)
        self.assertNotEqual(restored.document_sha256, first.document_sha256)
        self.assertEqual(load_archive(self.root, first.seal.seal_id), first)
        self.assertEqual(load_latest(self.root), restored)

    def test_history_link_is_separate_from_content_identity(self) -> None:
        self.repository()
        snapshot = compile_estate(self.root)
        first = create_seal(snapshot)
        linked = create_seal(snapshot, "ESTATE-19700101-0123456789abcdef")
        self.assertEqual(first.sha256, linked.sha256)
        self.assertEqual(first.seal_id, linked.seal_id)
        with self.assertRaisesRegex(EstateError, "previous seal"):
            create_seal(snapshot, "../../outside")
        with self.assertRaisesRegex(EstateError, "timestamp"):
            create_seal(replace(snapshot, timestamp="invalid"))

    def test_cached_content_and_envelope_tampering_are_detected(self) -> None:
        self.repository()
        save_snapshot(self.root, compile_estate(self.root))
        path = self.root / "state/estate/seal.latest.json"
        original = path.read_text()
        raw = json.loads(original)
        raw["snapshot"]["modules"][0]["plane"] = "CORRUPTED"
        path.write_text(json.dumps(raw))
        with self.assertRaisesRegex(EstateError, "envelope hash"):
            load_latest(self.root)
        raw = json.loads(original)
        raw["seal"]["module_count"] += 1
        raw["document_sha256"] = content_hash({key: value for key, value in raw.items() if key != "document_sha256"})
        path.write_text(json.dumps(raw))
        with self.assertRaisesRegex(EstateError, "seal metadata"):
            load_latest(self.root)
        raw = json.loads(original)
        raw["snapshot"]["census"] = "wrong type"
        path.write_text(json.dumps(raw))
        with self.assertRaisesRegex(EstateError, "valid cached"):
            load_latest(self.root)

    def test_invalid_missing_oversized_and_future_caches_report_typed_errors(self) -> None:
        with self.assertRaisesRegex(EstateError, "No cached"):
            load_latest(self.root)
        with self.assertRaisesRegex(EstateError, "Invalid seal"):
            load_archive(self.root, "../../private")
        self.repository()
        document = save_snapshot(self.root, compile_estate(self.root))
        with patch("apps.estate.seal.MAX_CACHE_BYTES", 10):
            with self.assertRaises(EstateError):
                load_latest(self.root)
        path = self.root / "state/estate/seal.latest.json"
        raw = asdict(document)
        raw["snapshot"]["schema_version"] = 99
        path.write_text(json.dumps(raw))
        with self.assertRaisesRegex(EstateError, "schema version"):
            load_latest(self.root)
        path.write_text("{ broken")
        with self.assertRaisesRegex(EstateError, "valid cached"):
            load_latest(self.root)
        with self.assertRaises(EstateError):
            load_archive(self.root, "ESTATE-19700101-ffffffffffffffff")

    def test_safe_state_and_archive_paths_reject_symlinks(self) -> None:
        self.repository()
        snapshot = compile_estate(self.root)
        with tempfile.TemporaryDirectory() as outside:
            state = self.root / "state"
            state.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(EstateError, "symlink"):
                save_snapshot(self.root, snapshot)
            self.assertEqual(list(Path(outside).iterdir()), [])
            state.unlink()
            document = save_snapshot(self.root, snapshot)
            latest = state / "estate/seal.latest.json"
            latest.unlink()
            target = Path(outside) / "fake.json"
            target.write_text("{}")
            latest.symlink_to(target)
            with self.assertRaisesRegex(EstateError, "symlink"):
                load_latest(self.root)
            latest.unlink()
            archive = state / "estate/seals"
            shutil.rmtree(archive)
            archive.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(EstateError, "symlink"):
                load_archive(self.root, document.seal.seal_id)
            with self.assertRaisesRegex(EstateError, "symlink"):
                save_snapshot(self.root, snapshot)

    def test_atomic_write_failures_do_not_replace_existing_content(self) -> None:
        path = self.write("old.json", '{"old": true}')
        with patch("apps.estate.seal.os.replace", side_effect=OSError("fixture failure")):
            with self.assertRaisesRegex(EstateError, "Cannot store"):
                _atomic_write(path, '{"new": true}')
        self.assertEqual(path.read_text(), '{"old": true}')
        self.assertFalse(list(self.root.glob(".estate-*.tmp")))
        link = self.root / "link.json"
        link.symlink_to(path)
        with self.assertRaisesRegex(EstateError, "symlink"):
            _atomic_write(link, "{}")

    def test_provenance_uses_commit_time_not_wall_clock(self) -> None:
        local = subprocess.CompletedProcess([], 0, str(self.root) + "\n", "")
        commit = subprocess.CompletedProcess([], 0, "abc123\n2026-09-17T12:30:00-05:00\n", "")
        with patch("apps.estate.seal.subprocess.run", side_effect=[local, commit]):
            self.assertEqual(repository_provenance(self.root), ("abc123", "2026-09-17T17:30:00Z"))
        for failure in (FileNotFoundError(), subprocess.TimeoutExpired("git", 10)):
            with patch("apps.estate.seal.subprocess.run", side_effect=failure):
                self.assertEqual(repository_provenance(self.root), ("unversioned", EPOCH_TIMESTAMP))
        with patch("apps.estate.seal.subprocess.run", side_effect=[local, subprocess.CompletedProcess([], 1, "", "")]):
            self.assertEqual(repository_provenance(self.root), ("unversioned", EPOCH_TIMESTAMP))

    def test_commit_change_during_compilation_is_not_sealed(self) -> None:
        self.repository()
        with patch("apps.estate.seal.repository_provenance", side_effect=[("one", EPOCH_TIMESTAMP), ("two", EPOCH_TIMESTAMP)]):
            with self.assertRaisesRegex(EstateError, "commit changed"):
                compile_estate(self.root)

    def test_cache_decoder_rejects_wrong_shapes_and_round_trips_snapshot(self) -> None:
        self.repository()
        snapshot = compile_estate(self.root)
        self.assertEqual(decode_record(EstateSnapshot, asdict(snapshot)), snapshot)
        for value in ([], {"code": "a"}, {"code": 1, "subject": "b", "message": "c", "evidence_files": []}):
            with self.assertRaises(EstateError):
                decode_record(Diagnostic, value)
        unchanged = make_document(snapshot)
        self.assertIs(make_document(snapshot, unchanged), unchanged)
        changed = replace(snapshot, repo_commit="new", timestamp="2000-01-01T00:00:00Z")
        delta = compare_snapshots(snapshot, changed)
        self.assertEqual(delta.changed_metadata, ["repo_commit", "timestamp"])
