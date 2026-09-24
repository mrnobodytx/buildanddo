# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/deploy/test_bundle_telemetry_check.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-TELEMETRY-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/deploy/bundle_telemetry_check.py, scripts/deploy/ship.py, tools/buildanddo_release.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/deploy/bundle_telemetry_check.py; VALIDATES scripts/deploy/ship.py;
#              VALIDATES tools/buildanddo_release.py
# Intent:      Prove neither deploy path can ship a web build that lacks its telemetry keys, and
#              that a complete build still ships.
# ───────────────────────────────────────────────────────────────

"""Pure-python against temporary dist trees: no build, no ssh, no network. The sample identifiers
are assembled at runtime and match only the shape the checker looks for."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


check = _load("bundle_telemetry_check_under_test", REPO / "scripts" / "deploy" / "bundle_telemetry_check.py")

PH_SAMPLE = "phc_" + "Q7" * 16
DD_SAMPLE = "pub" + "a1" * 16
INIT = "capture_pageleave:!0"


def _dist(root: Path, entry_body: str, chunk_body: str = "", entry="index-Ab12.js", name="dist") -> Path:
    web = root / name
    (web / "assets").mkdir(parents=True)
    (web / "index.html").write_text(
        f'<!doctype html><script type="module" crossorigin src="/assets/{entry}"></script>', encoding="utf-8")
    (web / "assets" / entry).write_text(entry_body, encoding="utf-8")
    if chunk_body:
        (web / "assets" / "vendor-Zz99.js").write_text(chunk_body, encoding="utf-8")
    return web


COMPLETE = f'posthog.init("{PH_SAMPLE}",{{{INIT},capture_pageview:"history_change"}});rum.init({{clientToken:"{DD_SAMPLE}"}})'
# The shape of the build production served on 2026-09-24 from 02:08 UTC: our init code is there,
# the keys are not, so both SDKs return early and send nothing.
KEYLESS = f'posthog.init(void 0,{{{INIT}}});rum.init({{clientToken:void 0}})'


class CheckDist(unittest.TestCase):
    def test_complete_build_passes(self):
        with tempfile.TemporaryDirectory() as td:
            result = check.check_dist(_dist(Path(td), COMPLETE))
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["entry_scripts"], ["assets/index-Ab12.js"])
        self.assertEqual(result["files_scanned"], 1)

    def test_keyless_build_is_refused_naming_what_is_missing(self):
        with tempfile.TemporaryDirectory() as td:
            result = check.check_dist(_dist(Path(td), KEYLESS))
        self.assertFalse(result["ok"])
        self.assertEqual(result["checks"], {"posthog_key": False, "datadog_client_token": False, "posthog_init": True})
        self.assertIn("posthog_key", result["reason"])
        self.assertIn("datadog_client_token", result["reason"])

    def test_one_missing_key_is_enough_to_refuse(self):
        with tempfile.TemporaryDirectory() as td:
            result = check.check_dist(_dist(Path(td), COMPLETE.replace(DD_SAMPLE, "void 0")))
        self.assertFalse(result["ok"])
        self.assertEqual(result["checks"]["datadog_client_token"], False)

    def test_keys_in_a_split_chunk_still_count(self):
        with tempfile.TemporaryDirectory() as td:
            result = check.check_dist(_dist(Path(td), "import './vendor-Zz99.js'", chunk_body=COMPLETE))
        self.assertTrue(result["ok"], result)

    def test_a_dist_nested_under_apps_web_is_found(self):
        with tempfile.TemporaryDirectory() as td:
            _dist(Path(td) / "apps", COMPLETE, name="web")
            result = check.check_dist(Path(td))
        self.assertTrue(result["ok"], result)

    def test_no_index_html_is_refused(self):
        with tempfile.TemporaryDirectory() as td:
            result = check.check_dist(Path(td))
        self.assertFalse(result["ok"])
        self.assertIn("no index.html", result["reason"])

    def test_an_entry_outside_the_dist_is_ignored(self):
        with tempfile.TemporaryDirectory() as td:
            outside = Path(td) / "outside.js"
            outside.write_text(COMPLETE, encoding="utf-8")
            web = _dist(Path(td) / "site", KEYLESS)
            (web / "index.html").write_text('<script src="/../../outside.js"></script>', encoding="utf-8")
            result = check.check_dist(web)
        self.assertFalse(result["ok"], result)

    def test_the_report_never_carries_a_key(self):
        with tempfile.TemporaryDirectory() as td:
            result = check.check_dist(_dist(Path(td), COMPLETE))
        text = json.dumps(result)
        self.assertNotIn(PH_SAMPLE, text)
        self.assertNotIn(DD_SAMPLE, text)

    def test_cli_exit_codes(self):
        with tempfile.TemporaryDirectory() as td:
            good = _dist(Path(td) / "good", COMPLETE)
            bad = _dist(Path(td) / "bad", KEYLESS)
            with patch("sys.stdout"):
                self.assertEqual(check.main(["x", str(good)]), 0)
                self.assertEqual(check.main(["x", str(bad)]), 1)


class ShipRefusesKeylessBuilds(unittest.TestCase):
    def setUp(self):
        self.ship = _load("ship_under_test_telemetry", REPO / "scripts" / "deploy" / "ship.py")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _run_main(self, body: str):
        dist = _dist(Path(self.tmp.name), body)
        finished = {}
        synced = []
        ship = self.ship
        with patch.object(ship, "DIST_DIR", dist), \
                patch.object(ship, "STATE_DIR", Path(self.tmp.name) / "state"), \
                patch.object(ship, "_build", return_value={"ok": True}), \
                patch.object(ship, "_gate", return_value={"ok": True, "lint_ok": True}), \
                patch.object(ship, "_write_deployed_version"), \
                patch.object(ship, "_rsync", side_effect=lambda local, remote: synced.append(remote) or {"ok": False}), \
                patch.object(ship, "_finish", side_effect=lambda record: finished.update(record)), \
                patch("builtins.print"):
            code = ship.main()
        return code, finished, synced

    def test_a_keyless_build_stops_before_anything_is_copied(self):
        code, record, synced = self._run_main(KEYLESS)
        self.assertEqual(code, 1)
        self.assertEqual(record["stopped_at"], "telemetry_keys")
        self.assertEqual(synced, [], "nothing may reach staging or production")
        self.assertFalse(record["stages"]["telemetry_keys"]["ok"])

    def test_a_complete_build_goes_on_to_the_staging_sync(self):
        code, record, synced = self._run_main(COMPLETE)
        self.assertTrue(record["stages"]["telemetry_keys"]["ok"])
        self.assertEqual(len(synced), 1, "the staging sync ran (and was stubbed to fail)")
        self.assertEqual(record["stopped_at"], "staging_sync")


class ReleaseRailRefusesKeylessBuilds(unittest.TestCase):
    def setUp(self):
        self.rail = _load("buildanddo_release_under_test", REPO / "tools" / "buildanddo_release.py")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        # A throwaway repo that carries the real checker, as a real checkout does.
        self.repo = Path(self.tmp.name) / "repo"
        (self.repo / "scripts" / "deploy").mkdir(parents=True)
        (self.repo / "scripts" / "deploy" / "bundle_telemetry_check.py").write_text(
            (REPO / "scripts" / "deploy" / "bundle_telemetry_check.py").read_text(encoding="utf-8"), encoding="utf-8")

    def _stage_artifact(self, body: str) -> None:
        artifact = _dist(self.repo / ".citadel-release" / "build", body)
        (self.repo / ".citadel-release" / "artifact.json").write_text(
            json.dumps({"commit_sha": "a" * 40, "artifact_dir": str(artifact)}), encoding="utf-8")

    def _deploy(self, env_name: str):
        rail = self.rail
        with patch.dict(os.environ, {f"BUILDANDDO_{env_name.upper()}_DEPLOY_MODE": "ssh_webroot"}), \
                patch.object(rail, "deploy_ssh_webroot", return_value={"mode": "ssh_webroot"}) as deployed, \
                patch.object(rail, "write_receipt"):
            try:
                result = rail.deploy_environment(Path(self.tmp.name), self.repo, env_name, ack="A3")
            except rail.ReleaseError as exc:
                return None, str(exc), deployed.call_count
        return result, "", deployed.call_count

    def test_production_refuses_a_keyless_artifact_before_it_moves(self):
        self._stage_artifact(KEYLESS)
        result, error, calls = self._deploy("production")
        self.assertIsNone(result)
        self.assertIn("refusing to deploy to production", error)
        self.assertEqual(calls, 0)

    def test_staging_refuses_it_too(self):
        self._stage_artifact(KEYLESS)
        _, error, calls = self._deploy("staging")
        self.assertIn("refusing to deploy to staging", error)
        self.assertEqual(calls, 0)

    def test_a_complete_artifact_deploys_and_the_receipt_says_why(self):
        self._stage_artifact(COMPLETE)
        result, error, calls = self._deploy("production")
        self.assertEqual(error, "")
        self.assertEqual(calls, 1)
        self.assertTrue(result["telemetry_keys"]["ok"])

    def test_a_repo_without_the_checker_cannot_vouch_for_its_bundle(self):
        self._stage_artifact(COMPLETE)
        (self.repo / "scripts" / "deploy" / "bundle_telemetry_check.py").unlink()
        _, error, calls = self._deploy("production")
        self.assertIn("telemetry checker missing", error)
        self.assertEqual(calls, 0)


if __name__ == "__main__":
    unittest.main()
