# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_mission_suite.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/mission_suite/engine.py, apps/mission_suite/worker.py, apps/mission_suite/bundle.py, tests/upgrade/suite-backend-driver.mjs, tests/upgrade/research_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/mission_suite/engine.py; VALIDATES apps/mission_suite/worker.py; VALIDATES apps/mission_suite/bundle.py; DEPENDS_ON tests/upgrade/suite-backend-driver.mjs; DEPENDS_ON tests/upgrade/research_support.py
# DAG Node:    none
# Intent:      Verify real bounded computation, cross-language worker recovery and portable-source replay without claiming live government or native PocketBase acceptance.
# ───────────────────────────────────────────────────────────────

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import logging
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from apps.mission_suite import __main__ as cli
from apps.mission_suite.bundle import (
    SOURCE_FILES,
    package,
    source_fingerprint,
    source_manifest,
)
from apps.mission_suite.engine import (
    SuiteError,
    decode,
    distance,
    identity,
    instant,
    number,
    obj,
    official_url,
    replay,
    rows,
    run_suite,
    text,
)
from apps.mission_suite.worker import EventFormatter, Worker, configured
from apps.research.contracts import ResearchError
from scripts.ci.evidence_epoch import root_of, sha256_json
from tests.upgrade.research_support import Backend

ROOT = Path(__file__).resolve().parents[2]
PATH = "/api/buildanddo/workspaces/ws1/suite"


def observation(**values):
    return {
        "observation_id": "obs1",
        "source_id": "source1",
        "source_record_id": "row1",
        "entity_id": "vessel1",
        "event_time": "2026-01-01T00:00:00Z",
        "ingest_time": "2026-01-01T00:00:01Z",
        "latitude": 30,
        "longitude": -90,
        **values,
    }


def document():
    return {
        "schema_version": "mission-suite.input/v1",
        "suite": "maritime",
        "tenant_id": "ws1",
        "mission_id": "mission1",
        "evaluated_at": "2026-01-01T01:00:00Z",
        "rights": [
            {
                "source_id": "source1",
                "rights_id": "rights1",
                "license_ref": "Explicitly synthetic test permission",
                "classification": "PUBLIC",
                "processing_allowed": True,
                "export_allowed": False,
                "expires_at": "2099-01-01T00:00:00Z",
                "independence_group": "group1",
            }
        ],
        "parameters": {
            "gap_seconds": 900,
            "max_speed_knots": 45,
            "position_tolerance_m": 5000,
            "stale_seconds": 3600,
        },
        "payload": {"observations": [observation()]},
    }


def submission():
    result = document()
    result["suite"] = "submission"
    result["rights"] = []
    result["payload"] = {
        "requirements": [
            {
                "id": "proof",
                "criterion": "Demonstrate the capability",
                "source_url": "https://www.diu.mil/",
                "source_revision": "Illustrative rule reference",
                "status": "satisfied",
                "evidence_ids": ["proof1"],
                "justification": "",
            }
        ],
        "evidence": [{"id": "proof1", "sha256": "a" * 64, "type": "verified"}],
        "document": {
            "name": "Practice brief",
            "sha256": "b" * 64,
            "format": "paper",
            "pages": 7,
            "max_pages": 10,
            "rule_url": "https://www.diu.mil/",
            "rule_revision": "Illustrative only",
            "deadline": "2099-01-01T00:00:00Z",
        },
    }
    return result


def execute(value):
    return run_suite(
        json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    )


class EngineTests(unittest.TestCase):
    def test_full_result_has_scoped_evidence_and_uses_existing_epoch_implementation(
        self,
    ):
        result = execute(document())
        analysis = result["analysis"]
        self.assertEqual(
            analysis["summary"],
            {"observations": 1, "entities": 1, "candidates": 0, "admitted": 0},
        )
        self.assertEqual(analysis["observations"][0]["mission_id"], "mission1")
        self.assertEqual(
            analysis["geojson"]["features"][0]["geometry"]["coordinates"], [-90, 30]
        )
        self.assertEqual(
            result["proof"]["root_digest"], root_of(result["proof"]["artifacts"])
        )
        self.assertEqual(
            result["proof"]["artifacts"][1]["digest"], sha256_json(analysis)
        )
        self.assertEqual(result["source_sha256"], source_fingerprint())
        self.assertIsNone(result["proof"]["release_root"])
        self.assertEqual(result["release_state"], "HOLD")

    def test_conflicts_preserve_sources_and_never_silently_choose_a_truth_position(
        self,
    ):
        for same_source in (True, False):
            value = document()
            if not same_source:
                value["rights"].append({**value["rights"][0], "source_id": "source2"})
            value["payload"]["observations"].append(
                observation(
                    observation_id="obs2",
                    source_record_id="row2",
                    source_id="source1" if same_source else "source2",
                    longitude=20,
                )
            )
            result = execute(value)["analysis"]
            entity = result["entities"][0]
            self.assertEqual(entity["state_class"], "CONTRADICTED")
            self.assertIsNone(entity["position"])
            self.assertEqual(set(entity["contradicting_evidence"]), {"obs1", "obs2"})
            self.assertEqual(result["geojson"]["features"], [])
            self.assertEqual(
                result["candidates"][0]["independent_source_groups"], ["group1"]
            )
            self.assertEqual(result["candidates"][0]["admission_verdict"], "HOLD")

    def test_late_history_does_not_overwrite_latest_and_stochastic_admission_is_absent(
        self,
    ):
        value = document()
        value["payload"]["observations"].append(
            observation(
                observation_id="earlier",
                source_record_id="old",
                event_time="2025-12-31T20:00:00Z",
                longitude=90,
            )
        )
        first = execute(value)["analysis"]
        value["payload"]["observations"].reverse()
        second = execute(value)["analysis"]
        self.assertEqual(first, second)
        self.assertEqual(first["entities"][0]["position"]["longitude"], -90)
        self.assertEqual(first["entities"][0]["observation_ids"], ["earlier", "obs1"])
        self.assertTrue(
            all(
                cue["admission_verdict"] == "HOLD" and cue["confidence"] is None
                for cue in first["candidates"]
            )
        )
        self.assertEqual(
            {feature["kind"] for feature in first["features"]},
            {"observation_gap", "track_discontinuity"},
        )

    def test_duplicate_identity_is_idempotent_but_conflicting_identity_is_rejected(
        self,
    ):
        value = document()
        value["payload"]["observations"].append(
            copy.deepcopy(value["payload"]["observations"][0])
        )
        self.assertEqual(execute(value)["analysis"]["summary"]["observations"], 1)
        value["payload"]["observations"][1]["longitude"] = 20
        with self.assertRaises(SuiteError) as raised:
            execute(value)
        self.assertEqual(raised.exception.reason, "identity_conflict")
        value = document()
        value["payload"]["observations"].append(observation(observation_id="new-id"))
        with self.assertRaises(SuiteError):
            execute(value)

    def test_rights_deny_missing_expired_disallowed_and_controlled_sources(self):
        for field, changed in [
            ("classification", "CUI"),
            ("processing_allowed", False),
            ("expires_at", "2026-01-01T00:00:00Z"),
            ("export_allowed", "yes"),
        ]:
            value = document()
            value["rights"][0][field] = changed
            with self.assertRaises(SuiteError) as raised:
                execute(value)
            self.assertEqual(raised.exception.reason, "rights_denied")
        value = document()
        value["payload"]["observations"][0]["source_id"] = "missing"
        with self.assertRaises(SuiteError):
            execute(value)
        value = document()
        value["rights"] *= 2
        with self.assertRaises(SuiteError):
            execute(value)

    def test_scope_schema_numeric_clock_and_size_boundaries_fail_closed(self):
        for key, changed in [
            ("tenant_id", ""),
            ("mission_id", "../foreign"),
            ("schema_version", "future"),
            ("suite", "admit"),
        ]:
            value = document()
            value[key] = changed
            with self.assertRaises(SuiteError):
                execute(value)
        for field, changed in [
            ("latitude", 91),
            ("longitude", True),
            ("event_time", "2026-02-01T00:00:00Z"),
            ("ingest_time", "2026-03-01T00:00:00Z"),
        ]:
            value = document()
            value["payload"]["observations"][0][field] = changed
            with self.assertRaises(SuiteError):
                execute(value)
        value = document()
        value["payload"]["observations"] = [
            observation(observation_id=f"obs{i}", source_record_id=f"row{i}")
            for i in range(257)
        ]
        with self.assertRaises(SuiteError):
            execute(value)

    def test_no_nan_duplicate_json_keys_or_implied_utc(self):
        for raw in ['{"a":1,"a":2}', '{"a":NaN}', "[]", "{", "x" * 300001, "\ud800"]:
            with self.assertRaises(SuiteError):
                decode(raw)
        for raw in [
            "2026-01-01",
            "2026-01-01 00:00:00+00:00",
            "2026-02-30T00:00:00Z",
            "2026-01-01T00:00:00-05:00",
        ]:
            with self.assertRaises(SuiteError):
                instant(raw)
        for function, values in [
            (obj, [[], {1: "bad"}]),
            (identity, ["", "space id"]),
            (text, ["\x00", "\ud800"]),
            (lambda value: rows(value, 2), [None, [1, 2, 3]]),
            (lambda value: number(value, 0, 100), [True, float("inf"), -1, 10**400]),
        ]:
            for value in values:
                with self.assertRaises(SuiteError):
                    function(value)

    def test_dateline_distance_is_short_and_missing_old_sources_are_marked_stale(self):
        self.assertLess(
            distance(
                {"latitude": 0, "longitude": 179.99},
                {"latitude": 0, "longitude": -179.99},
            ),
            2500,
        )
        value = document()
        value["evaluated_at"] = "2026-01-02T00:00:00Z"
        self.assertEqual(
            execute(value)["analysis"]["entities"][0]["state_class"], "STALE"
        )

    def test_replay_compares_entire_result_and_keeps_release_on_hold(self):
        raw = json.dumps(document())
        result = run_suite(raw)
        self.assertEqual(replay(raw, result)["state"], "MATCH")
        result["analysis"]["summary"]["observations"] = 99
        mismatch = replay(raw, result)
        self.assertEqual(mismatch["state"], "DIVERGED")
        self.assertEqual(mismatch["release_state"], "HOLD")

    def test_submission_gaps_and_positive_review_never_create_a_portal_receipt(self):
        value = submission()
        result = execute(value)["analysis"]
        self.assertEqual(result["state"], "READY_FOR_HUMAN_REVIEW")
        self.assertIsNone(result["submission_receipt"])
        for kind in [
            "unverified",
            "missing-rule",
            "missing-evidence",
            "not-applicable",
            "open",
            "duplicate-evidence",
            "expired",
            "too-many-pages",
        ]:
            value = submission()
            requirement = value["payload"]["requirements"][0]
            artifact = value["payload"]["document"]
            if kind == "unverified":
                value["payload"]["evidence"][0]["type"] = "observed"
            elif kind == "missing-rule":
                requirement["source_url"] = ""
                artifact["rule_revision"] = ""
            elif kind == "missing-evidence":
                requirement["evidence_ids"] = []
            elif kind == "not-applicable":
                requirement["status"] = "not_applicable"
                requirement["justification"] = ""
            elif kind == "open":
                requirement["status"] = "open"
            elif kind == "duplicate-evidence":
                requirement["evidence_ids"] *= 2
            elif kind == "expired":
                artifact["deadline"] = "2020-01-01T00:00:00Z"
            else:
                artifact["pages"] = 11
            self.assertEqual(
                execute(value)["analysis"]["state"], "NEEDS_EVIDENCE", kind
            )

    def test_existing_ledger_states_are_accepted_without_promoting_attempts_to_verification(
        self,
    ):
        for state in ("observed", "decided", "attempted"):
            value = submission()
            value["payload"]["evidence"][0]["type"] = state
            self.assertEqual(execute(value)["analysis"]["state"], "NEEDS_EVIDENCE")

    def test_submission_rejects_invalid_documents_duplicate_rows_and_nonofficial_references(
        self,
    ):
        for url in [
            "https://example.com/",
            "https://www.diu.mil.evil.invalid/",
            "http://www.diu.mil/",
            "https://person@www.diu.mil/",
            "https://www.diu.mil:99/",
            "https://www.diu.mil:bad/",
        ]:
            with self.assertRaises(SuiteError):
                official_url(url)
        for mutate in [
            lambda v: v["payload"]["requirements"].append(
                copy.deepcopy(v["payload"]["requirements"][0])
            ),
            lambda v: v["payload"]["evidence"].append(
                copy.deepcopy(v["payload"]["evidence"][0])
            ),
            lambda v: v["payload"]["document"].update(pages=1.2),
            lambda v: v["payload"]["document"].update(sha256="placeholder"),
            lambda v: v["payload"]["requirements"][0].update(status="submitted"),
        ]:
            value = submission()
            mutate(value)
            with self.assertRaises(SuiteError):
                execute(value)


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.backend = Backend("tests/upgrade/suite-backend-driver.mjs")
        self.client = self.backend.client("suiteworker")
        self.worker = Worker(self.client, "ws1")
        self.sequence = 0

    async def asyncTearDown(self):
        await self.worker.close()
        self.backend.close()

    async def command(self, action, payload, revision=0):
        self.sequence += 1
        return await self.backend.client("editor").json(
            PATH,
            body={
                "action": action,
                "mission": "mission1",
                "payload": payload,
                "revision": revision,
                "request_key": f"suite_python_test_{self.sequence:06d}",
            },
        )

    async def enqueue(self):
        item = observation()
        del item["ingest_time"]
        return await self.command(
            "enqueue", {"suite": "maritime", "input": {"observations": [item]}}
        )

    async def test_one_box_worker_completes_the_real_api_chain_and_recovers_lost_claim(
        self,
    ):
        queued = await self.enqueue()
        self.client.lost = "claim"
        self.assertTrue(await self.worker.once())
        self.assertFalse(await self.worker.once())
        detail = await self.command("detail", {"id": queued["id"]})
        self.assertEqual(detail["record"]["status"], "ready")
        self.assertEqual(detail["record"]["attempt"], 1)
        self.assertEqual(
            detail["record"]["result"], run_suite(detail["record"]["input_canonical"])
        )
        canonical = detail["record"]["result_canonical"]
        self.assertEqual(
            hashlib.sha256(canonical.encode()).hexdigest(),
            detail["record"]["result_sha256"],
        )
        self.assertEqual(
            replay(detail["record"]["input_canonical"], decode(canonical))["state"],
            "MATCH",
        )
        self.assertTrue(all(path == PATH for path, _ in self.client.calls))

    async def test_lost_completion_does_not_duplicate_state_and_retains_exact_payload(
        self,
    ):
        await self.enqueue()
        self.client.lost = "complete"
        self.assertTrue(await self.worker.once())
        completion = [
            body for _, body in self.client.calls if body["action"] == "complete"
        ]
        self.assertEqual(len(completion), 2)
        self.assertEqual(completion[0], completion[1])
        state = await self.backend.call({"operation": "state"})
        self.assertEqual(state["suite_controls"][0]["state_revision"], 1)

    async def test_revoked_owner_never_runs_and_disabled_binding_fails_closed(self):
        await self.enqueue()
        await self.backend.call({"operation": "revoke"})
        self.assertFalse(await self.worker.once())
        await self.backend.call({"operation": "disable"})
        with self.assertRaises(ResearchError):
            await self.worker.once()

    async def test_worker_rejects_wrong_source_and_mismatched_input_hash_before_computing(
        self,
    ):
        queued = await self.enqueue()
        claim = await self.worker.request(
            "claim", "mission1", {"id": queued["id"]}, 1, "suite_mismatch_claim_01"
        )
        for alter in [
            lambda c: c["job"].update(source_sha256="b" * 64),
            lambda c: c["job"].update(input_sha256="c" * 64),
            lambda c: c["job"].update(mission="mission2"),
        ]:
            changed = copy.deepcopy(claim)
            alter(changed)
            with self.assertRaises(ResearchError):
                await self.worker.process(changed)
        state = await self.backend.call({"operation": "state"})
        self.assertEqual(state["suite_runs"][0]["status"], "processing")

    async def test_engine_failure_is_recorded_as_a_bounded_failure_without_private_text(
        self,
    ):
        queued = await self.enqueue()
        with patch(
            "apps.mission_suite.worker.run_suite",
            side_effect=SuiteError("invalid_data"),
        ):
            self.assertTrue(await self.worker.once())
        detail = await self.command("detail", {"id": queued["id"]})
        self.assertEqual(detail["record"]["status"], "failed")
        self.assertEqual(detail["record"]["failure"], "invalid_data")
        self.assertIsNone(detail["record"]["result"])


class PackagingTests(unittest.TestCase):
    def test_source_manifest_and_archive_include_only_the_portable_closure(self):
        self.assertEqual(
            {row["path"] for row in source_manifest()["files"]}, set(SOURCE_FILES)
        )
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.tgz"
            second = Path(directory) / "second.tgz"
            result = package(first)
            package(second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertFalse(result["deployed"])
            with tarfile.open(first) as archive:
                names = archive.getnames()
                self.assertIn("docs/mission-suite.md", names)
                self.assertIn("suite-manifest.json", names)
                self.assertTrue(
                    all(
                        not name.startswith("/") and ".." not in name.split("/")
                        for name in names
                    )
                )
                self.assertFalse(
                    any(
                        ".env" in name or "pb_data" in name or "/deploy/" in name
                        for name in names
                    )
                )
                # Extract only the exact known members of our just-generated archive.
                target = Path(directory) / "unpacked"
                target.mkdir()
                for member in archive.getmembers():
                    self.assertTrue(member.isfile())
                    destination = target / member.name
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(archive.extractfile(member).read())
                identity_result = subprocess.run(
                    [sys.executable, "-m", "apps.mission_suite", "identity"],
                    cwd=target,
                    capture_output=True,
                    text=True,
                    check=True,
                )
                self.assertEqual(
                    json.loads(identity_result.stdout)["source_sha256"],
                    source_fingerprint(),
                )
            with self.assertRaises(FileExistsError):
                package(first)

    def test_missing_or_symlinked_source_cannot_be_packaged_as_the_same_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            with self.assertRaises(ResearchError):
                source_manifest(base)
            first = base / SOURCE_FILES[0]
            first.parent.mkdir(parents=True)
            first.symlink_to(ROOT / SOURCE_FILES[0])
            with self.assertRaises(ResearchError):
                source_manifest(base)

    def test_archive_rejects_outside_guide_and_changed_source_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            for name in SOURCE_FILES:
                target = base / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
            (base / "docs").mkdir()
            guide = base / "docs/mission-suite.md"
            guide.symlink_to(ROOT / "docs/mission-suite.md")
            with self.assertRaises(ResearchError):
                package(base / "outside.tgz", base)
            guide.unlink()
            guide.write_text("Local guide")
            manifest = source_manifest(base)
            manifest["files"][0]["sha256"] = "0" * 64
            with (
                patch(
                    "apps.mission_suite.bundle.source_manifest", return_value=manifest
                ),
                self.assertRaises(ResearchError),
            ):
                package(base / "changed.tgz", base)
            self.assertFalse((base / "changed.tgz").exists())

    def test_configuration_and_diagnostics_reveal_presence_only_and_never_start_on_import(
        self,
    ):
        with self.assertRaises(ResearchError):
            configured({})
        worker = configured(
            {
                "BUILDANDDO_SUITE_TOKEN": "explicit-test-credential",
                "BUILDANDDO_POCKETBASE_URL": "http://127.0.0.1:8090",
                "BUILDANDDO_SUITE_WORKSPACE": "ws1",
            }
        )
        self.assertEqual(worker.workspace, "ws1")
        asyncio.run(worker.close())
        record = logging.LogRecord(
            "suite", logging.INFO, "", 0, "suite.run.recorded", (), None
        )
        record.private_text = "do not log this"
        result = EventFormatter().format(record)
        self.assertNotIn("do not log this", result)
        self.assertIn("SRS-BUILDANDDO-UPGRADE-001", result)

    def test_local_cli_analyze_replay_and_doctor_report_actual_operations(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = Path(directory) / "input.json"
            expected = Path(directory) / "result.json"
            raw.write_text(json.dumps(document()))
            expected.write_text(json.dumps(run_suite(raw.read_text())))
            for args in [
                ["identity"],
                ["analyze", str(raw)],
                ["replay", str(raw), str(expected)],
            ]:
                with (
                    patch("sys.argv", ["mission-suite", *args]),
                    patch("builtins.print") as printer,
                ):
                    self.assertEqual(cli.main(), 0)
                    self.assertTrue(printer.called)
            expected.write_text("{}")
            with (
                patch("sys.argv", ["mission-suite", "replay", str(raw), str(expected)]),
                patch("builtins.print"),
            ):
                self.assertEqual(cli.main(), 1)
            with (
                patch.dict("os.environ", {}, clear=True),
                patch("sys.argv", ["mission-suite", "doctor"]),
            ):
                self.assertEqual(cli.main(), 1)

    def test_cli_worker_closes_transport_after_once_failure_and_interruption(self):
        for failure in (False, True):
            worker = SimpleNamespace(
                source_sha256=source_fingerprint(),
                once=AsyncMock(
                    side_effect=ResearchError("unavailable") if failure else None
                ),
                close=AsyncMock(),
            )
            with (
                patch("apps.mission_suite.__main__.configured", return_value=worker),
                patch("sys.argv", ["mission-suite", "worker", "--once"]),
            ):
                self.assertEqual(cli.main(), 1 if failure else 0)
            worker.close.assert_awaited_once()
        worker = SimpleNamespace(
            source_sha256=source_fingerprint(), once=AsyncMock(), close=AsyncMock()
        )
        with (
            patch("apps.mission_suite.__main__.configured", return_value=worker),
            patch("sys.argv", ["mission-suite", "worker"]),
            patch(
                "apps.mission_suite.__main__.asyncio.sleep",
                side_effect=KeyboardInterrupt,
            ),
        ):
            self.assertEqual(cli.main(), 0)
        worker.close.assert_awaited_once()
        with (
            patch("apps.mission_suite.__main__.configured", return_value=worker),
            patch("sys.argv", ["mission-suite", "doctor"]),
            patch("builtins.print") as printer,
        ):
            self.assertEqual(cli.main(), 0)
            self.assertEqual(
                json.loads(printer.call_args.args[0])["activation"], "NOT_ATTEMPTED"
            )
        with (
            tempfile.TemporaryDirectory() as directory,
            patch(
                "sys.argv",
                ["mission-suite", "package", str(Path(directory) / "worker.tgz")],
            ),
            patch("builtins.print") as printer,
        ):
            self.assertEqual(cli.main(), 0)
            self.assertFalse(json.loads(printer.call_args.args[0])["deployed"])


if __name__ == "__main__":
    unittest.main()
