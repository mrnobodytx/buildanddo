"""Datadog DORA v2 takes started_at/finished_at as integer Unix timestamps. The release controller
used to send ISO-8601 strings and every production promotion ended in `dora: HOLD 400`; these tests
pin the boundary conversion and the wire body so that regression is caught without a live emit."""
from __future__ import annotations

import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

TOOL = Path(__file__).resolve().parents[2] / "tools" / "buildanddo_release.py"
spec = importlib.util.spec_from_file_location("buildanddo_release_under_test", TOOL)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)

DEPLOYED_AT = "2026-09-18T12:34:30.415550Z"
DEPLOYED_NS = 1789734870415550000
SHA = "4b376f048f8b0c8dc214dff4ec316aa6bea70608"


class DoraTimestampTests(unittest.TestCase):
    def test_iso_z_to_nanoseconds(self):
        self.assertEqual(mod._dd_unix_ns(DEPLOYED_AT), DEPLOYED_NS)

    def test_offset_and_naive_forms_are_utc(self):
        self.assertEqual(mod._dd_unix_ns("2026-09-18T12:34:30+00:00"), mod._dd_unix_ns("2026-09-18T12:34:30"))
        self.assertEqual(mod._dd_unix_ns("2026-09-18T12:34:30Z"), 1789734870 * 10**9)

    def test_integers_pass_through(self):
        self.assertEqual(mod._dd_unix_ns(DEPLOYED_NS), DEPLOYED_NS)

    def test_utcnow_round_trips_to_int(self):
        ns = mod._dd_unix_ns(mod.utcnow())
        self.assertIsInstance(ns, int)
        self.assertGreater(ns, 1_700_000_000 * 10**9)


class _FakeResponse(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class DoraBodyTests(unittest.TestCase):
    """Drive datadog_dora() over the urllib path (no data_dog_private bridge) and inspect the wire body."""

    def _receipts(self, path: Path):
        name = path.name
        if name.startswith("production_verification"):
            return {"state": "PASS", "deployed_sha": SHA, "verified_at": "2026-09-18T12:34:31.219915Z"}
        if name.startswith("production_deployment"):
            return {"deployed_at": DEPLOYED_AT}
        return {}

    def test_wire_body_uses_integer_timestamps(self):
        captured: dict = {}

        def fake_urlopen(req, timeout=0):
            captured["body"] = json.loads(req.data.decode("utf-8"))
            captured["headers"] = {k.lower() for k in req.headers}
            return _FakeResponse(b'{"data":{"id":"x"}}')

        with tempfile.TemporaryDirectory() as td, \
                patch.object(mod, "read_json", self._receipts), \
                patch.object(mod, "find_data_dog_private", lambda root: None), \
                patch.object(mod, "_repository_url", lambda repo: "https://github.com/mrnobodytx/buildanddo.git"), \
                patch.object(urllib.request, "urlopen", fake_urlopen), \
                patch.dict(os.environ, {"DD_API_KEY": "unit-test-key", "DD_SITE": "us5.datadoghq.com"}):
            result = mod.datadog_dora(Path(td), Path(td), SHA)

        attrs = captured["body"]["data"]["attributes"]
        self.assertIsInstance(attrs["started_at"], int)
        self.assertIsInstance(attrs["finished_at"], int)
        self.assertEqual(attrs["started_at"], DEPLOYED_NS)
        self.assertGreater(attrs["finished_at"], attrs["started_at"])
        self.assertEqual(attrs["git"]["commit_sha"], SHA)
        self.assertIn("dd-api-key", captured["headers"])
        self.assertEqual(result["state"], "PASS")
        self.assertIsNone(result["response_errors"])

    def test_sub_second_or_inverted_readback_still_orders_the_window(self):
        """Deploy and readback in the same instant (or a readback clock behind the deploy clock) must not
        produce finished_at <= started_at - that is the 400 Datadog returned on 2026-09-18."""
        captured: dict = {}

        def fake_urlopen(req, timeout=0):
            captured["body"] = json.loads(req.data.decode("utf-8"))
            return _FakeResponse(b'{"data":{"id":"x"}}')

        def receipts(path: Path):
            if path.name.startswith("production_verification"):
                return {"state": "PASS", "deployed_sha": SHA, "verified_at": "2026-09-18T12:34:30.100000Z"}  # before deployed_at
            if path.name.startswith("production_deployment"):
                return {"deployed_at": DEPLOYED_AT}
            return {}

        with tempfile.TemporaryDirectory() as td, \
                patch.object(mod, "read_json", receipts), \
                patch.object(mod, "find_data_dog_private", lambda root: None), \
                patch.object(mod, "_repository_url", lambda repo: "https://example.invalid/repo.git"), \
                patch.object(urllib.request, "urlopen", fake_urlopen), \
                patch.dict(os.environ, {"DD_API_KEY": "unit-test-key"}):
            mod.datadog_dora(Path(td), Path(td), SHA)

        attrs = captured["body"]["data"]["attributes"]
        self.assertEqual(attrs["started_at"], DEPLOYED_NS)
        self.assertEqual(attrs["finished_at"], DEPLOYED_NS + 1)

    def test_non_2xx_keeps_api_errors_in_receipt(self):
        def failing_urlopen(req, timeout=0):
            raise urllib.error.HTTPError(req.full_url, 400, "Bad Request", {}, io.BytesIO(b'{"errors":["started_at must be int64"]}'))

        with tempfile.TemporaryDirectory() as td, \
                patch.object(mod, "read_json", self._receipts), \
                patch.object(mod, "find_data_dog_private", lambda root: None), \
                patch.object(mod, "_repository_url", lambda repo: "https://example.invalid/repo.git"), \
                patch.object(urllib.request, "urlopen", failing_urlopen), \
                patch.dict(os.environ, {"DD_API_KEY": "unit-test-key"}):
            result = mod.datadog_dora(Path(td), Path(td), SHA)

        self.assertEqual(result["state"], "HOLD")
        self.assertEqual(result["http_status"], 400)
        self.assertEqual(result["response_errors"], ["started_at must be int64"])


if __name__ == "__main__":
    unittest.main()
