# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/praxis_evidence/test_target_guard.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRUST-001, VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     services/praxis_evidence/client.py, services/praxis_evidence/run_all_tests.py
# EnumType:    Test
# EnumEdges:   VALIDATES services/praxis_evidence/client.py; VALIDATES services/praxis_evidence/run_all_tests.py
# Intent:      Prove the evidence suites refuse a missing or production PocketBase target before any network call.
# ───────────────────────────────────────────────────────────────

"""Screen targets without I/O; only the isolated runner may start mutating tests."""

from __future__ import annotations

import contextlib
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from services.praxis_evidence import client, isolated_test, run_all_tests  # noqa: E402


def _no_network(*_args: object, **_kwargs: object) -> None:
    raise AssertionError("the guard must refuse before any network call")


class TargetGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.enterContext(patch("urllib.request.urlopen", side_effect=_no_network))
        self.enterContext(patch("urllib.request.OpenerDirector.open", side_effect=_no_network))

    def test_unset_target_is_refused_without_a_default(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(client.UnsafeTargetError):
                client.require_target()
            with self.assertRaises(client.UnsafeTargetError):
                client.require_test_target()
            with self.assertRaises(client.UnsafeTargetError):
                client.PocketBaseClient()

    def test_production_hosts_are_refused_on_any_path(self) -> None:
        for url in ("https://buildanddo.com/hcgi/platform", "https://buildanddo.com",
                    "http://www.buildanddo.com/anything/", "https://WWW.BuildAndDo.com./hcgi/platform",
                    "https://buildanddo.com:443/hcgi/platform"):
            with self.subTest(url=url), self.assertRaises(client.UnsafeTargetError):
                client.require_test_target(url)

    def test_public_addresses_are_refused_so_production_needs_no_name(self) -> None:
        # The production VM is also reachable by its address, which this public repository must not spell, so
        # the guard refuses every globally reachable address; the standard library classifies them. A test may
        # plant only documentation addresses (RFC 5737, RFC 3849), which are not globally reachable, so here the
        # classifier is told to answer "public".
        with patch.object(client, "_public_address", return_value=True):
            for url in ("http://203.0.113.9:8090/", "https://[2001:db8::9]/hcgi/platform"):
                with self.subTest(url=url), self.assertRaises(client.UnsafeTargetError):
                    client.require_test_target(url)

    def test_names_loopback_and_documentation_addresses_are_not_public(self) -> None:
        for host in ("localhost", "pocketbase", "staging.buildanddo.com", "127.0.0.1", "::1", "203.0.113.9"):
            with self.subTest(host=host):
                self.assertFalse(client._public_address(host))

    def test_malformed_targets_are_refused(self) -> None:
        for url in ("buildanddo.com/hcgi/platform", "ftp://pb.test", "https://", "   ",
                    "http://user:fixture-only@127.0.0.1:8090", "http://127.0.0.1:8090?target=remote",
                    "http://127.0.0.1:8090#fragment", " http://127.0.0.1:8090", "http://127.0.0.1:8090\n",
                    "http://127.0.0.1:8090\\@remote", "http://127.0.0.1:999999", "http://127.0.0.1:bad", "http://["):
            with self.subTest(url=url):
                with self.assertRaises(client.UnsafeTargetError):
                    client.require_test_target(url)
                with self.assertRaises(client.UnsafeTargetError):
                    client.PocketBaseClient(url)

    def test_non_production_targets_pass_unchanged(self) -> None:
        for url, expected in (("http://127.0.0.1:8090/", "http://127.0.0.1:8090"),
                              ("https://staging.buildanddo.com/hcgi/platform", "https://staging.buildanddo.com/hcgi/platform"),
                              ("http://pocketbase:8090", "http://pocketbase:8090"),
                              ("https://notbuildanddo.com", "https://notbuildanddo.com")):
            with self.subTest(url=url):
                self.assertEqual(client.require_test_target(url), expected)

    def test_target_configuration_is_not_snapshotted_at_import(self) -> None:
        with patch.dict("os.environ", {"PB_API_URL": "http://127.0.0.1:8090/"}, clear=True):
            self.assertEqual(client.require_target(), "http://127.0.0.1:8090")
            self.assertEqual(client.PocketBaseClient().base_url, "http://127.0.0.1:8090")
            with self.assertRaises(client.UnsafeTargetError):
                client.require_target("")
            with patch.dict("os.environ", {"PB_API_URL": ""}):
                with self.assertRaises(client.UnsafeTargetError):
                    client.require_target()
                self.assertEqual(client.PocketBaseClient("http://127.0.0.1:18090").base_url, "http://127.0.0.1:18090")

    def test_non_production_screening_cannot_replace_fixture_authority(self) -> None:
        for target in ("https://staging.buildanddo.com/hcgi/platform", "http://pocketbase:8090", "http://127.0.0.1:8090"):
            with self.subTest(target=target), patch.dict("os.environ", {"PB_API_URL": target}, clear=True):
                self.assertEqual(client.require_test_target(), target)
                with self.assertRaisesRegex(isolated_test.TestIsolationError, "an isolated fixture is required"):
                    isolated_test.isolated_client()

    def test_runner_refuses_before_any_suite_or_request(self) -> None:
        for target in ("", "https://buildanddo.com/hcgi/platform", "http://203.0.113.9:8090",
                       "https://staging.buildanddo.com/hcgi/platform", "http://127.0.0.1:8090"):
            with self.subTest(target=target or "unset"), patch.dict("os.environ", {"PB_API_URL": target}, clear=True), \
                    patch("subprocess.run", side_effect=_no_network), \
                    patch.object(run_all_tests, "PraxisServer", side_effect=_no_network), \
                    patch.object(run_all_tests, "extract_binary", side_effect=_no_network):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    code = run_all_tests.main([])
                self.assertEqual(code, 2)
                self.assertIn("BLOCKED", out.getvalue())
                self.assertIn("no Praxis tests ran", out.getvalue())


if __name__ == "__main__":
    unittest.main()
