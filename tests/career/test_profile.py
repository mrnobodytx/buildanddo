# ─── CGRF Header ──────────────────────────────
# File:        tests/career/test_profile.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/career/profile.py, tests/career/test_career.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/career/profile.py; VALIDATES apps/career/cli.py
# DAG Node:    none
# Intent:      Prove the login envelope binds one digest-checked passport to one account and carries nothing else.
# ─────────────────────────────────────────────────────────────

"""Exercise the Citadel-served login profile envelope."""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from apps.career import CareerError
from apps.career.cli import main
from apps.career.profile import SCHEMA, build_profile
from tests.career import test_career as base

NOW = datetime(2026, 9, 23, tzinfo=timezone.utc)


class ProfileTests(base.RepoCase):
    def test_envelope_binds_subject_and_only_the_passport(self) -> None:
        raw = self.passport().to_dict()
        envelope = build_profile(raw, "u_abc123", NOW)
        self.assertEqual(sorted(envelope), ["card", "issued_at", "passport", "schema", "subject_id"])
        self.assertEqual((envelope["schema"], envelope["subject_id"]), (SCHEMA, "u_abc123"))
        self.assertEqual(envelope["passport"]["digest"], raw["digest"])
        self.assertIn("Check it yourself", envelope["card"])
        tampered = {**raw, "person_id": "someone.else"}
        for args in ((tampered, "u_abc123", NOW), (raw, "../etc", NOW), (raw, "u", datetime(2026, 1, 1))):
            with self.subTest(args=str(args[1:])), self.assertRaises(CareerError):
                build_profile(*args)

    def test_cli(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "passport.json").write_text(json.dumps(self.passport().to_dict()))
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = main(["profile", "--passport", str(root / "passport.json"), "--subject-id", "u_abc123",
                             "--output", str(root / "o"), "--issued-at", "2026-09-23T00:00:00Z"])
            self.assertEqual(code, 0)
            self.assertEqual(json.loads((root / "o/profile.json").read_text())["subject_id"], "u_abc123")


if __name__ == "__main__":
    unittest.main()
