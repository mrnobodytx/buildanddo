# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_platform_health_public_projection.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-WORKSPACE-001, SRS-BUILDANDDO-PUBLIC-REDACTION-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/fleet_report.py, scripts/ci/public_redaction.py,
#              apps/web/src/lib/communityStatus.js
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/fleet_report.py;
#              VALIDATES apps/web/public/platform-health.json;
#              VALIDATES state/estate/platform-health.json
# Intent:      Hold the public platform-health artifact to a closed set of keys, and prove the
#              selection is an allowlist by showing a field newly added to the full report never
#              reaches it.
# ───────────────────────────────────────────────────────────────
"""apps/web/public/platform-health.json is served to anyone at a stable URL.

The browser-side filter in communityStatus.js readPlatformHealth already refuses to carry the
report's free text, but that filter runs on the READER, on the way to the screen. It does nothing
for a caller that fetches the file directly. These tests put the same closed set on the ARTIFACT.

The second test is the one that matters over time. The public file grew into an infrastructure
assessment because fields were added to the full report and inherited by the published copy. A
denylist cannot catch that, because the field being added is by definition not on it. So the test
adds a field to the full payload and asserts its absence from the public projection: it passes only
while the projection SELECTS what it publishes.
"""
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

# The closed set, transcribed from the contract rather than from the generator, so that a generator
# that starts emitting more fails here instead of redefining what "allowed" means.
PUBLIC_TOP_LEVEL = {"schema", "generated_at", "observed_at", "platforms"}
PUBLIC_PLATFORM = {"id", "label", "state", "verified"}

# What readPlatformHealth reads out of the document. Kept separate from the set above: the artifact
# may not carry MORE than the closed set, and may not carry LESS than the reader needs.
READER_NEEDS_TOP_LEVEL = {"generated_at", "observed_at", "platforms"}
READER_NEEDS_PLATFORM = {"id", "label", "state", "verified"}

# Follows a machine family so the redaction rule must catch it, while no machine carries it. It
# is assembled at runtime because this file ships to the public mirror: a literal shaped like a
# fleet name trips the mirror's scrubber and the no-machine-name rule whether or not the machine
# exists, and a reader cannot tell a made-up name from a real one by looking.
FAMILY_NAME = "-".join(("ray", "xyz0", "0"))


def generate(platforms: list[dict] | None = None, extra_top_level: dict | None = None) -> tuple[dict, dict]:
    """Run fleet_report as the build does, into a temporary directory.

    Args:
        platforms: Replacement for fleet_report.PLATFORMS, or None to use the recorded assessment.
        extra_top_level: Fields to graft onto the full report after it is built, standing in for a
            field a later change adds to the private document.

    Returns:
        The public document and the private one, parsed.
    """
    real_snapshot = fleet_report._platform_snapshot

    def snapshot_with_extra() -> dict:
        document = real_snapshot()
        document.update(copy.deepcopy(extra_top_level or {}))
        return document

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        public_out = root / "public" / "platform-health.json"
        private_out = root / "state" / "estate" / "platform-health.json"
        out = io.StringIO()
        patches = [
            mock.patch.dict(os.environ, {redaction.FLEET_MAP_ENV: ""}),
            mock.patch.object(fleet_report, "ROOT", root),
            mock.patch.object(fleet_report, "PUBLIC_DIR", root / "public"),
            mock.patch.object(fleet_report, "PLATFORM_OUT", public_out),
            mock.patch.object(fleet_report, "FLEET_OUT", root / "state" / "estate" / "fleet-status.json"),
            # create=True so this harness runs against a generator that has no private platform
            # output yet: the controls below must then fail on the published keys, not on a
            # missing attribute.
            mock.patch.object(fleet_report, "PLATFORM_PRIVATE_OUT", private_out, create=True),
            mock.patch.object(fleet_report, "_platform_snapshot", snapshot_with_extra),
            contextlib.redirect_stdout(out),
            contextlib.redirect_stderr(out),
        ]
        if platforms is not None:
            patches.insert(1, mock.patch.object(fleet_report, "PLATFORMS", platforms))
        with contextlib.ExitStack() as stack:
            for patch in patches:
                stack.enter_context(patch)
            status = fleet_report.main([])
        if status != 0:
            raise AssertionError(f"fleet_report exited {status}: {out.getvalue()[-400:]}")
        if not public_out.is_file():
            raise AssertionError(f"no public artifact written: {out.getvalue()[-400:]}")
        public = json.loads(public_out.read_text(encoding="utf-8"))
        private = (
            json.loads(private_out.read_text(encoding="utf-8"))
            if private_out.is_file()
            else {}
        )
        return public, private


class PublicArtifactTests(unittest.TestCase):
    """What the site serves to anyone at /platform-health.json."""

    def test_no_key_outside_the_allowed_set(self):
        # Key sets, not a word search: a grep for "recommendation" passes the day the field is
        # renamed, and the point is that nothing UNANTICIPATED is published.
        public, _ = generate()
        self.assertEqual(set(public) - PUBLIC_TOP_LEVEL, set(), "top-level keys outside the closed set")
        self.assertEqual(set(public), PUBLIC_TOP_LEVEL)
        for entry in public["platforms"]:
            self.assertEqual(set(entry) - PUBLIC_PLATFORM, set(), f"platform keys outside the closed set: {entry}")
            self.assertEqual(set(entry), PUBLIC_PLATFORM)

    def test_a_field_added_to_the_full_report_does_not_reach_the_public_one(self):
        # The allowlist control. A denylist passes every other test in this file and fails this one.
        platforms = copy.deepcopy(fleet_report.PLATFORMS)
        platforms[0]["credential_state"] = "key rotates 2026-10-01"
        public, private = generate(
            platforms=platforms,
            extra_top_level={"siem_entitlement": "unreadable from the current key"},
        )
        self.assertNotIn("siem_entitlement", public)
        self.assertNotIn("credential_state", public["platforms"][0])
        self.assertNotIn("credential_state", json.dumps(public))
        # The same two fields are the operator's to read, so the private report must still carry them.
        self.assertEqual(private.get("siem_entitlement"), "unreadable from the current key")
        self.assertEqual(private["platforms"][0].get("credential_state"), "key rotates 2026-10-01")

    def test_the_public_artifact_still_satisfies_the_reader(self):
        public, _ = generate()
        self.assertTrue(READER_NEEDS_TOP_LEVEL.issubset(set(public)), "readPlatformHealth would read ABSENT")
        self.assertTrue(public["platforms"], "no platform survived the projection")
        for entry in public["platforms"]:
            self.assertTrue(READER_NEEDS_PLATFORM.issubset(set(entry)), entry)
            self.assertIsInstance(entry["id"], str)
            self.assertIsInstance(entry["label"], str)
            self.assertIsInstance(entry["state"], str)
            self.assertIsInstance(entry["verified"], bool)
            self.assertTrue(entry["id"] and entry["label"] and entry["state"])
        # observed_at is what the reader ages the document by. An unparseable value reads as
        # UNMEASURED, which is a worse page than a stale one.
        for field in ("observed_at", "generated_at"):
            self.assertRegex(public[field], r"^\d{4}-\d{2}-\d{2}T[\d:.]+")

    def test_the_full_report_is_the_one_kept_private(self):
        public, private = generate()
        self.assertEqual(
            {"platforms", "recommendations", "integration_timeline", "totals"} - set(private),
            set(),
            "the private report lost part of the full assessment",
        )
        self.assertIn("features", private["platforms"][0])
        # Every word of the assessment that made the public file a target brief stays on this side.
        self.assertNotIn("recommendation", json.dumps(public))
        self.assertNotIn("features", json.dumps(public))

    def test_the_public_artifact_still_passes_the_redaction_rule(self):
        # Defence in depth: the projection decides WHICH fields ship, the rule still scrubs what is
        # inside them. Planted in label because that is a field the projection publishes.
        platforms = copy.deepcopy(fleet_report.PLATFORMS)
        platforms[0]["label"] = f"{platforms[0]['label']} on {FAMILY_NAME}"
        public, _ = generate(platforms=platforms)
        self.assertIn(redaction.BAR, public["platforms"][0]["label"])
        self.assertEqual(redaction.Rule("").find_leaks(json.dumps(public)), {"ips": [], "machines": []})


if __name__ == "__main__":
    unittest.main()
