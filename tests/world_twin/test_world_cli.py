# --- CGRF Header ------------------------------------------------
# File:        tests/world_twin/test_world_cli.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/cli.py, tests/world_twin/test_capture.py, tests/world_twin/test_interop.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/world_twin/cli.py; CONSUMES tests/world_twin/test_capture.py; CONSUMES tests/world_twin/test_interop.py
# Intent:      Exercise the actual import and compile commands with explicitly synthetic captures, explicit read scope and externally supplied test review pins.
# ----------------------------------------------------------------

"""Exercise the complete local world-event command flow without remote effects."""

from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from apps.world_twin.cli import main
from libs.evolution.common import mapping
from libs.semantic_twin.identity import SemanticId
from apps.world_twin.projection import ProjectionScope
from tests.world_twin.test_capture import ACTORS, INGESTED, synthetic_capture
from tests.world_twin.test_interop import event, pins, review, scope


class WorldCliTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)

    def write(self, name: str, value: object) -> str:
        path = self.root / name
        path.write_text(json.dumps(value), encoding="utf-8")
        return str(path)

    def run_cli(self, *args: str) -> tuple[int, dict[str, object]]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = main(list(args))
        return code, mapping(json.loads(out.getvalue() or err.getvalue()))

    def test_existing_capture_import_compiles_without_promoting_provider_success(self) -> None:
        capture = self.write("capture.json", synthetic_capture())
        bindings = self.write("actors.json", {key: value.to_dict() for key, value in ACTORS.items()})
        args = ("import-capture", "--capture", capture, "--tenant", "ws1", "--mission", "mission1", "--actors", bindings)
        code, imported = self.run_cli(*args, "--ingested-at", INGESTED.isoformat())
        self.assertEqual(code, 0, imported)
        self.assertEqual(imported["schema_version"], "buildanddo.world-capture/v1")
        self.assertNotIn("PRIVATE BODY", json.dumps(imported))
        self.assertEqual(self.run_cli(*args)[0], 0)
        raw = imported["events"]
        assert isinstance(raw, list)
        request = ProjectionScope(tenant_id="ws1", subject_id=SemanticId("cni://tenant/pocketbase/ws1"), view="community",
                                  as_of=INGESTED, allowed_event_ids=tuple(SemanticId(str(mapping(e)["event_id"])) for e in raw))
        events = self.write("events.json", imported)
        selection = self.write("scope.json", request.to_dict())
        code, compiled = self.run_cli("compile", "--events", events, "--scope", selection)
        self.assertEqual(code, 0, compiled)
        self.assertEqual(mapping(compiled["graph"])["schema_version"], "semantic-twin.graph/v2")
        self.assertIn("capture_provenance", compiled)
        self.assertEqual(mapping(mapping(compiled["measures"])["reviewed_observations"])["value"], 0)
        self.assertEqual(compiled["capabilities"], {})
        changed_scope = {**request.to_dict(), "audience": "public"}
        public = self.write("public.json", changed_scope)
        _, hidden = self.run_cli("compile", "--events", events, "--scope", public)
        self.assertEqual(hidden["state"], "WITHHELD")
        self.assertNotIn("capture_provenance", hidden)

    def test_complete_schema_and_scoped_reviews_require_separate_pins(self) -> None:
        code, schema = self.run_cli("schema")
        self.assertEqual(code, 0)
        self.assertIn("WorldEvent", mapping(schema["$defs"]))
        value = event()
        events = self.write("events.json", [value.to_dict()])
        request = self.write("scope.json", scope((value,)).to_dict())
        receipt = review(value)
        reviews = self.write("reviews.json", [receipt.to_dict()])
        policy = self.write("policy.json", pins(receipt).to_dict())
        args = ("compile", "--events", events, "--scope", request, "--reviews", reviews)
        code, unsigned = self.run_cli(*args)
        self.assertEqual(code, 0)
        self.assertEqual(mapping(mapping(unsigned["measures"])["reviewed_observations"])["value"], 0)
        code, signed = self.run_cli(*args, "--review-policy", policy)
        self.assertEqual(code, 0)
        self.assertEqual(mapping(mapping(signed["measures"])["reviewed_observations"])["value"], 1)
        self.assertFalse(signed["authority_granted"])

    def test_bad_scope_legacy_claims_and_oversized_inputs_are_refused(self) -> None:
        request = self.write("scope.json", scope(()).to_dict())
        invalid: tuple[object, ...] = ({"events": []}, {"schema_version": "unknown", "events": []}, "not an array",
                                     [{"event_id": "legacy-event", "actor": "anyone", "state": "VERIFIED"}])
        for raw in invalid:
            with self.subTest(raw=raw):
                events = self.write("invalid.json", raw)
                self.assertEqual(self.run_cli("compile", "--events", events, "--scope", request)[0], 1)
        self.assertEqual(self.run_cli("world")[0], 1)
        self.assertEqual(self.run_cli("compile", "--events", str(self.root / "absent"), "--scope", request)[0], 1)
        valid = self.write("events.json", [])
        bad_reviews = self.write("reviews.json", {})
        self.assertEqual(self.run_cli("compile", "--events", valid, "--scope", request, "--reviews", bad_reviews)[0], 1)
        with patch("apps.world_twin.cli.Path.open") as opened:
            opened.return_value.__enter__.return_value.read.return_value = b" " * (16 * 1024 * 1024 + 1)
            self.assertEqual(self.run_cli("compile", "--events", valid, "--scope", request)[0], 1)
        Path(valid).write_text('[{"tenant_id":"one","tenant_id":"two"}]', encoding="utf-8")
        self.assertEqual(self.run_cli("compile", "--events", valid, "--scope", request)[0], 1)
