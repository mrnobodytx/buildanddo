# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_activity_publish.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-BUDDI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     scripts/publish/activity_publish.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/publish/activity_publish.py
# DAG Node:    none
# Intent:      Prove release publication withholds every IP address and configured fleet machine name
#              while version numbers, clock times and code in the same text pass through untouched.
# ───────────────────────────────────────────────────────────────
"""Exercise public-text redaction without importing the deploy pipeline or reading its secrets."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
BAR = "**" + chr(0x2588) * 8 + "**"
POSITIVES = {
    "from 198.51.100.4.": f"from {BAR}.",
    "(10.87.65.43)": f"({BAR})",
    "http://127.0.0.1:8090": "http://localhost:8090",
    "2001:db8:0:0:0:0:0:1": BAR,
    "::1": BAR,
}
NEGATIVE_CONTROLS = ("PocketBase 0.39.8", "v1.2.3.", "10:30:00", "std::string", "a::b", "1.2.3.4.5")


def _load_publisher() -> types.ModuleType:
    """Import the publisher against a stub `ship`, so the test never loads a credential store."""
    stub = types.ModuleType("ship")
    stub._SECRETS = {}
    stub._run = lambda *args, **kwargs: {"stdout_tail": ""}
    saved_path, saved_ship = list(sys.path), sys.modules.get("ship")
    sys.modules["ship"] = stub
    spec = importlib.util.spec_from_file_location(
        "activity_publish_under_test", ROOT / "scripts" / "publish" / "activity_publish.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path[:] = saved_path
        if saved_ship is None:
            sys.modules.pop("ship", None)
        else:
            sys.modules["ship"] = saved_ship
    return module


publisher = _load_publisher()


def _event(title: str, summary: str, evidence: dict | None = None) -> dict:
    return {
        "event_id": "BD-REL-20260922-000000",
        "event_type": "production_release",
        "product": "buildanddo",
        "timestamp": "2026-09-22T10:30:00+00:00",
        "git": {"repository": "buildanddo", "commit": "abc1234", "commit_message": title},
        "deployment": {"environment": "production", "state": "VERIFIED_LIVE"},
        "change": {"title": title, "summary": summary},
        "evidence": evidence if evidence is not None else {"build": "PASS"},
        "publication": {"visibility": "PUBLIC_SAFE"},
    }


@contextlib.contextmanager
def _fleet_map(location: str | None):
    """Run with CITADEL_FLEET_MAP set to `location`, or absent when it is None."""
    with mock.patch.dict(os.environ):
        os.environ.pop(publisher.FLEET_MAP_ENV, None)
        if location is not None:
            os.environ[publisher.FLEET_MAP_ENV] = location
        yield


class AddressRedactionTests(unittest.TestCase):
    """Every IP address is withheld; text that only resembles one is left alone."""

    def test_every_address_form_is_withheld(self) -> None:
        for raw, expected in POSITIVES.items():
            with self.subTest(raw=raw):
                self.assertEqual(publisher.redact_public_text(raw), expected)

    def test_negative_controls_pass_through_unchanged(self) -> None:
        for text in NEGATIVE_CONTROLS:
            with self.subTest(text=text):
                self.assertEqual(publisher.redact_public_text(text), text)

    def test_an_address_both_patterns_claim_is_withheld_whole(self) -> None:
        self.assertEqual(publisher.redact_public_text("mapped ::ffff:192.0.2.1 here"), f"mapped {BAR} here")


class ProjectionTests(unittest.TestCase):
    """The projection every adapter renders from carries no address, and does not hold for one."""

    def test_addresses_are_redacted_and_the_release_still_publishes(self) -> None:
        event = _event("fix: reach 10.87.65.43 from http://127.0.0.1:8090", "Deployed from 198.51.100.4.",
                       {"build": "PASS", "hosts": ["2001:db8:0:0:0:0:0:1", "::1"]})
        with _fleet_map(None):
            projection, finding = publisher.compile_public_projection(event)
        self.assertIsNone(finding)
        self.assertEqual(projection["title"], f"fix: reach {BAR} from http://localhost:8090")
        self.assertEqual(projection["summary"], f"Deployed from {BAR}.")
        self.assertEqual(projection["evidence"]["hosts"], [BAR, BAR])
        self.assertEqual(publisher._address_spans(json.dumps(projection, ensure_ascii=False)), [])

    def test_negative_controls_publish_verbatim(self) -> None:
        text = ", ".join(NEGATIVE_CONTROLS)
        with _fleet_map(None):
            projection, finding = publisher.compile_public_projection(_event(text, text))
        self.assertIsNone(finding)
        self.assertEqual((projection["title"], projection["summary"]), (text, text))

    def test_an_address_redaction_cannot_reach_holds_the_release(self) -> None:
        with _fleet_map(None):
            projection, finding = publisher.compile_public_projection(_event("ok", "ok", {"10.0.0.1": "PASS"}))
        self.assertIsNone(projection)
        self.assertEqual(finding, "ip_address")


class FleetNameTests(unittest.TestCase):
    """Machine names come from the private map at publish time, never from this public repo."""

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.map_path = Path(temporary.name) / "fleet.json"
        self.map_path.write_text(json.dumps({"boxes": {
            "box-alpha-1": {"aka": ["alpha1", "Alpha-One"], "datadog_host": "dd-alpha-1",
                            "provider_name": "srv0000001", "hostname": "alpha-host-1"},
            "box-beta-2": {"aka": [], "datadog_host": None, "provider_name": "srv0000002",
                           "hostname": "beta-host-2"},
        }}), encoding="utf-8")

    def test_every_declared_name_is_withheld_in_any_case(self) -> None:
        text = "Shipped from box-alpha-1 (ALPHA1, Alpha-One) via dd-alpha-1, srv0000002 and beta-host-2."
        with _fleet_map(str(self.map_path)):
            projection, finding = publisher.compile_public_projection(_event(text, text))
        self.assertIsNone(finding)
        self.assertEqual(projection["title"], f"Shipped from {BAR} ({BAR}, {BAR}) via {BAR}, {BAR} and {BAR}.")

    def test_a_name_inside_a_longer_token_is_left_whole(self) -> None:
        text = "box-alpha-10 and xbox-alpha-1 are not fleet machines"
        with _fleet_map(str(self.map_path)):
            projection, finding = publisher.compile_public_projection(_event(text, text))
        self.assertIsNone(finding)
        self.assertEqual(projection["title"], text)

    def test_unset_map_skips_names_silently(self) -> None:
        with _fleet_map(None):
            projection, finding = publisher.compile_public_projection(_event("box-alpha-1", "box-alpha-1"))
        self.assertIsNone(finding)
        self.assertEqual(projection["title"], "box-alpha-1")

    def test_a_configured_map_that_cannot_be_read_holds_every_channel(self) -> None:
        adapters = {name: mock.Mock() for name in ("_publish_wiki", "_publish_discord", "_publish_reddit")}
        with tempfile.TemporaryDirectory() as state, _fleet_map(str(self.map_path.with_name("absent.json"))), \
                mock.patch.multiple(publisher, STATE_DIR=Path(state), **adapters), \
                contextlib.redirect_stdout(io.StringIO()):
            result = publisher.publish("title", "summary", {"build": "PASS"})
        self.assertEqual((result["state"], result["finding"]), ("HOLD_SCRUB_FAILED", "fleet_map_unreadable"))
        for adapter in adapters.values():
            adapter.assert_not_called()


if __name__ == "__main__":
    unittest.main()
