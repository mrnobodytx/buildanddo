# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_platform_health_public_projection.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/fleet_report.py, scripts/ci/public_redaction.py,
#              apps/web/src/lib/communityStatus.js
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/fleet_report.py;
#              VALIDATES apps/web/public/platform-health.json;
#              VALIDATES state/estate/platform-health.json
# Intent:      Prevent the fleet generator from recreating public operational observations while preserving complete operator reports.
# ───────────────────────────────────────────────────────────────
"""Execute the generator against a temporary tree with deliberately stale public copies."""
from __future__ import annotations

import contextlib
import copy
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.ci import fleet_report
from scripts.ci import public_redaction as redaction


def generate(extra: dict | None = None, stale: bool = False) -> tuple[list[str], dict]:
    """Retain the generator's real file effects without touching a deployed report."""
    original = fleet_report._platform_snapshot

    def snapshot() -> dict:
        document = original()
        document.update(copy.deepcopy(extra or {}))
        return document

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        public = root / "public"
        public.mkdir()
        if stale:
            for name in ("platform-health.json", "fleet-status.json"):
                (public / name).write_text("PRIVATE-SENTINEL", encoding="utf-8")
        (public / "community-status.json").write_text("public community", encoding="utf-8")
        private = root / "state/estate/platform-health.json"
        with contextlib.ExitStack() as stack:
            for patch in [mock.patch.dict(os.environ, {redaction.FLEET_MAP_ENV: ""}),
                          mock.patch.object(fleet_report, "ROOT", root),
                          mock.patch.object(fleet_report, "PUBLIC_DIR", public),
                          mock.patch.object(fleet_report, "PLATFORM_OUT", public / "platform-health.json"),
                          mock.patch.object(fleet_report, "PLATFORM_PRIVATE_OUT", private),
                          mock.patch.object(fleet_report, "FLEET_OUT", root / "state/estate/fleet-status.json"),
                          mock.patch.object(fleet_report, "_platform_snapshot", snapshot),
                          contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO())]:
                stack.enter_context(patch)
            if fleet_report.main([]) != 0:
                raise AssertionError("Fleet generator failed in its isolated output tree.")
        return sorted(path.name for path in public.iterdir()), json.loads(private.read_text(encoding="utf-8"))


class PrivateArtifactTests(unittest.TestCase):
    def test_no_operational_file_is_generated_for_public_delivery(self) -> None:
        public, private = generate()
        self.assertEqual(public, ["community-status.json"])
        self.assertTrue(private["platforms"])
        self.assertTrue({"platforms", "recommendations", "integration_timeline", "totals"}.issubset(private))

    def test_old_public_copies_are_removed_without_losing_operator_observations(self) -> None:
        public, private = generate(stale=True)
        self.assertEqual(public, ["community-status.json"])
        self.assertIn("features", private["platforms"][0])
        self.assertRegex(private["observed_at"], r"^\d{4}-\d{2}-\d{2}T")

    def test_new_diagnostic_fields_remain_available_only_in_the_operator_report(self) -> None:
        public, private = generate({"diagnostic": "PRIVATE-SENTINEL"}, stale=True)
        self.assertEqual(public, ["community-status.json"])
        self.assertEqual(private["diagnostic"], "PRIVATE-SENTINEL")


if __name__ == "__main__":
    unittest.main()
