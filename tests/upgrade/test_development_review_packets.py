# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_development_review_packets.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/review_packets.py, tests/upgrade/test_development_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/review_packets.py; CONSUMES tests/upgrade/test_development_support.py
# Intent:      Prove that portable development evidence preserves actual bytes while labels and trust remain independent inputs.
# ───────────────────────────────────────────────────────────────

"""Exercise portable review with explicitly synthetic source and reviewer fixtures."""

from __future__ import annotations

from contextlib import redirect_stdout
from dataclasses import replace
from datetime import timedelta
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest

from libs.evolution import review_packets as packets
from libs.evolution.store import Journal
from libs.semantic_twin.contracts import ContractError
from tests.upgrade.test_development_support import (
    AT,
    MODULE,
    SCOPE,
    measured,
    pinned_review,
    prediction,
    review_request,
)


class ReviewPacketTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="review-packet-fixture-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / "repo"
        self.prediction = prediction(self.source)
        self.run = measured(self.prediction)
        self.at = AT + timedelta(seconds=5)
        self.path = packets.write_packet(
            self.source,
            self.prediction,
            self.run,
            self.root / "packet",
            at=self.at,
        )

    def write_manifest(self, value: object) -> None:
        self.path.write_text(json.dumps(value))

    def test_packet_retains_source_and_process_bytes_without_grading(self) -> None:
        first, second = packets.read_packet(self.path, scope=SCOPE, at=self.at)
        self.assertEqual(first, self.prediction)
        self.assertEqual(second, self.run)
        manifest = json.loads(self.path.read_text())
        self.assertEqual(manifest["grading"], "UNMEASURED")
        self.assertNotIn("review_policy", manifest)
        self.assertEqual((self.path.parent / "test.log").read_text(), self.run.log)
        duplicate = packets.write_packet(
            self.source,
            first,
            second,
            self.root / "duplicate",
            at=self.at,
        )
        self.assertEqual(self.path.read_bytes(), duplicate.read_bytes())

    def test_existing_outputs_and_changed_source_are_refused(self) -> None:
        with self.assertRaisesRegex(ContractError, "new packet"):
            packets.write_packet(
                self.source, self.prediction, self.run, self.path.parent
            )
        (self.source / MODULE).write_text("changed source\n")
        with self.assertRaisesRegex(ContractError, "frozen prediction"):
            packets.write_packet(
                self.source, self.prediction, self.run, self.root / "changed"
            )
        self.assertFalse((self.root / "changed").exists())

    def test_bad_scope_future_time_identity_and_self_grading_are_rejected(self) -> None:
        original = json.loads(self.path.read_text())
        for field, value in (
            ("scope_id", "foreign"),
            ("grading", "VERIFIED"),
            ("producer", "other"),
            ("candidate_sha", "b" * 40),
            ("run_id", "other"),
            ("created_at", (self.at + timedelta(days=1)).isoformat()),
            ("created_at", "invalid"),
            ("created_at", "2026-09-21T00:00:00"),
            ("source_digest", "0" * 64),
            ("files", []),
            ("schema_version", "other"),
        ):
            with self.subTest(field=field, value=value):
                self.write_manifest({**original, field: value})
                with self.assertRaises(ContractError):
                    packets.read_packet(self.path, scope=SCOPE, at=self.at)

    def test_modified_log_source_or_rehashed_source_cannot_replace_frozen_bytes(
        self,
    ) -> None:
        for name in ("test.log", "source/" + MODULE):
            target = self.path.parent / name
            original = target.read_bytes()
            target.write_bytes(b"modified bytes")
            with self.assertRaises(ContractError):
                packets.read_packet(self.path, scope=SCOPE, at=self.at)
            if name.startswith("source/"):
                manifest = json.loads(self.path.read_text())
                manifest["files"][name] = hashlib.sha256(
                    target.read_bytes()
                ).hexdigest()
                self.write_manifest(manifest)
                with self.assertRaisesRegex(ContractError, "frozen source"):
                    packets.read_packet(self.path, scope=SCOPE, at=self.at)
            target.write_bytes(original)

    def test_manifest_escape_symlink_omission_and_extra_source_are_rejected(
        self,
    ) -> None:
        original = json.loads(self.path.read_text())
        for name in (
            "../outside.py",
            "source/../../outside.py",
            "/outside.py",
            "source\\file.py",
            "review-policy.json",
        ):
            self.write_manifest(
                {**original, "files": {**original["files"], name: "0" * 64}}
            )
            with self.assertRaises(ContractError):
                packets.read_packet(self.path, scope=SCOPE, at=self.at)
        self.write_manifest(original)
        target = self.path.parent / "test.log"
        target.unlink()
        target.symlink_to(self.source / MODULE)
        with self.assertRaisesRegex(ContractError, "symlink"):
            packets.read_packet(self.path, scope=SCOPE, at=self.at)
        target.unlink()
        target.write_text(self.run.log)
        manifest = json.loads(self.path.read_text())
        del manifest["files"]["test-run.json"]
        self.write_manifest(manifest)
        with self.assertRaisesRegex(ContractError, "omits"):
            packets.read_packet(self.path, scope=SCOPE, at=self.at)
        self.write_manifest(original)
        (self.path.parent / "source/libs/evolution/extra.py").write_text(
            "extra = True\n"
        )
        with self.assertRaisesRegex(ContractError, "frozen source"):
            packets.read_packet(self.path, scope=SCOPE, at=self.at)

    def test_failed_run_remains_portable_but_cannot_qualify(self) -> None:
        failed = replace(self.run, exit_code=1)
        path = packets.write_packet(
            self.source, self.prediction, failed, self.root / "failed", at=self.at
        )
        request = review_request(self.prediction, failed)
        receipt, policy = pinned_review(request)
        with Journal(self.root / "failed.sqlite", scope_id=SCOPE) as journal:
            with self.assertRaisesRegex(ContractError, "failed or incomplete"):
                packets.admit_packet(
                    path, journal, request.labels, receipt, policy, at=self.at
                )
            self.assertFalse(journal.records())
            self.assertFalse(journal.artifacts("episode"))
            self.assertTrue(
                any(
                    event.data.get("process_status") == "FAIL"
                    for event in journal.events()
                )
            )

    def test_receiving_journal_requires_separate_trusted_exact_receipt(self) -> None:
        request = review_request(self.prediction, self.run)
        receipt, policy = pinned_review(request)
        with Journal(self.root / "receiver.sqlite", scope_id=SCOPE) as journal:
            with self.assertRaises(ContractError):
                packets.admit_packet(
                    self.path,
                    journal,
                    request.labels,
                    receipt,
                    replace(policy, receipt_digests=()),
                    at=self.at,
                )
            self.assertFalse(journal.artifacts("episode"))
            case = packets.admit_packet(
                self.path, journal, request.labels, receipt, policy, at=self.at
            )
            again = packets.admit_packet(
                self.path, journal, request.labels, receipt, policy, at=self.at
            )
            self.assertEqual(case, again)
            self.assertIsNotNone(case.truth)
            self.assertEqual(len(journal.artifacts("episode")), 1)
            self.assertFalse(
                journal.records(), "a reviewed pair must not promote itself"
            )

    def test_inspect_and_export_cli_leave_grading_unmeasured(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(
                packets.main(["inspect", str(self.path), "--scope", SCOPE]), 0
            )
        self.assertEqual(json.loads(output.getvalue())["grading"], "UNMEASURED")
        with redirect_stdout(io.StringIO()):
            self.assertEqual(
                packets.main(
                    [
                        "export",
                        "--root",
                        str(self.source),
                        "--prediction",
                        str(self.path.parent / "prediction.json"),
                        "--run",
                        str(self.path.parent / "test-run.json"),
                        "--output",
                        str(self.root / "cli"),
                    ]
                ),
                0,
            )
            self.assertEqual(
                packets.main(["inspect", str(self.path), "--scope", "wrong"]), 1
            )


if __name__ == "__main__":
    unittest.main()
