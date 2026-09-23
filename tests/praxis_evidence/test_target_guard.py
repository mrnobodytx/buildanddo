# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/praxis_evidence/test_target_guard.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-TRUST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRUST-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     services/praxis_evidence/client.py, services/praxis_evidence/run_all_tests.py
# EnumType:    Test
# EnumEdges:   VALIDATES services/praxis_evidence/client.py; VALIDATES services/praxis_evidence/run_all_tests.py
# Intent:      Prove the evidence suites refuse a missing or production PocketBase target before any network call.
# ───────────────────────────────────────────────────────────────

"""Pure-python: no PocketBase, no network. urlopen and subprocess are trapped."""

from __future__ import annotations

import contextlib
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SERVICE = Path(__file__).resolve().parents[2] / "services" / "praxis_evidence"
sys.path.insert(0, str(SERVICE))
import client  # noqa: E402
import run_all_tests  # noqa: E402


def _no_network(*_args, **_kwargs):
    raise AssertionError("the guard must refuse before any network call")


class TargetGuardTests(unittest.TestCase):
    def test_unset_target_is_refused_without_a_default(self):
        with patch.object(client, "PB_API_URL", ""):
            with self.assertRaises(client.UnsafeTargetError):
                client.require_target()
            with self.assertRaises(client.UnsafeTargetError):
                client.require_test_target()
            with self.assertRaises(client.UnsafeTargetError):
                client.PocketBaseClient()

    def test_production_hosts_are_refused_on_any_path(self):
        for url in ("https://buildanddo.com/hcgi/platform", "https://buildanddo.com",
                    "http://www.buildanddo.com/anything/", "https://WWW.BuildAndDo.com./hcgi/platform",
                    "https://buildanddo.com:443/hcgi/platform", "http://45.82.75.40:8090/"):
            with self.subTest(url=url), self.assertRaises(client.UnsafeTargetError):
                client.require_test_target(url)

    def test_malformed_targets_are_refused(self):
        for url in ("buildanddo.com/hcgi/platform", "ftp://pb.test", "https://", "   "):
            with self.subTest(url=url), self.assertRaises(client.UnsafeTargetError):
                client.require_test_target(url)

    def test_non_production_targets_pass_unchanged(self):
        for url, expected in (("http://127.0.0.1:8090/", "http://127.0.0.1:8090"),
                              ("https://staging.buildanddo.com/hcgi/platform", "https://staging.buildanddo.com/hcgi/platform"),
                              ("http://pocketbase:8090", "http://pocketbase:8090"),
                              ("https://notbuildanddo.com", "https://notbuildanddo.com")):
            with self.subTest(url=url):
                self.assertEqual(client.require_test_target(url), expected)

    def test_runner_refuses_before_any_suite_or_request(self):
        for target in ("", "https://buildanddo.com/hcgi/platform"):
            with self.subTest(target=target or "unset"), patch.object(client, "PB_API_URL", target), \
                    patch("subprocess.run", side_effect=_no_network), \
                    patch("urllib.request.urlopen", side_effect=_no_network):
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    code = run_all_tests.main()
                self.assertNotEqual(code, 0)
                self.assertIn("REFUSED", out.getvalue())
                self.assertIn("non-production", out.getvalue())


if __name__ == "__main__":
    unittest.main()
