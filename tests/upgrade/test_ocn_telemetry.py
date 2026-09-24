# CGRF: SRS=SRS-BUILDANDDO-OCN-TELEMETRY-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_ocn_telemetry.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-OCN-TELEMETRY-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-OCN-TELEMETRY-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/ocn_telemetry.py, scripts/ci/public_redaction.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/ocn_telemetry.py
# DAG Node:    none
# Intent:      Prove, with fakes only, that OCN receipts become marked telemetry that carries no machine
#              name, address, key or record id, that the gates and switches fail closed, and that the
#              wrapper never changes a probe's output or exit code.
# ───────────────────────────────────────────────────────────────
"""Exercise ocn_telemetry.py offline: sockets blocked, environment cleared, transport faked.

Every private value planted below is built at run time from the fixture families and documentation
ranges that public_redaction.py allows in a test, so the source of this public file names none.
"""
from __future__ import annotations

import argparse
import contextlib
import copy
import datetime as dt
import functools
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.ci import ocn_telemetry as t
from scripts.ci import public_redaction as pr

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "ci" / "ocn_telemetry.py"
NOW = dt.datetime(2026, 9, 24, 12, 1, tzinfo=dt.timezone.utc)
AT = "2026-09-24T12:00:00+00:00"

BOX = "-".join(("ray", "xyz0", "0"))
ALIAS = "rig" + "0"
BOX_TWO = "kvm" + "0"
BOX_UNPLACED = "-".join(("mesh", "sample"))
ADDRESS = ".".join(("203", "0", "113", "7"))
EGRESS = ".".join(("198", "51", "100", "9"))
EMAIL = "seat" + "@" + "example.org"
RECORD = "q" * 3 + "1234567890ab"
FORUM = "https://" + "forum.example.org" + "/t/topic/1"
PLANTED = (BOX, ALIAS, BOX_TWO, BOX_UNPLACED, ADDRESS, EGRESS, EMAIL, RECORD, "forum.example.org")
KEEP = ("SYSTEMROOT", "WINDIR", "PATH", "PATHEXT", "COMSPEC", "TEMP", "TMP")

_GUARDS: list = []


def setUpModule() -> None:  # noqa: N802 - unittest's name
    def refuse(*_args, **_kwargs):
        raise AssertionError("network is forbidden in this test module")

    for target in ("socket.socket.connect", "socket.socket.connect_ex", "socket.create_connection",
                   "socket.getaddrinfo"):
        patcher = mock.patch(target, side_effect=refuse)
        patcher.start()
        _GUARDS.append(patcher)


def tearDownModule() -> None:  # noqa: N802
    while _GUARDS:
        _GUARDS.pop().stop()


def capture_key() -> str:
    return "_".join(("phc", "unit" + "test" * 3))


def datadog_key() -> str:
    return "".join(format(index, "x") for index in range(16)) * 2


def keys(**overrides: str) -> dict[str, str]:
    values = {"BUILDANDDO_PH": capture_key(), "DD_API_KEY": datadog_key(), "DD_SITE": "us5.datadoghq.com"}
    values.update(overrides)
    return values


class Recorder:
    """A fake transport: records URL, header names and body, and answers as scripted."""

    def __init__(self, answers=None):
        self.calls: list[dict] = []
        self.answers = list(answers or [])

    def __call__(self, method, url, body, headers, timeout):
        self.calls.append({"method": method, "url": url, "body": copy.deepcopy(body),
                           "headers": sorted((headers or {}).keys()), "timeout": timeout})
        answer = self.answers.pop(0) if self.answers else (202 if "datadoghq" in url else 200, "", {})
        if isinstance(answer, BaseException):
            raise answer
        return answer

    def urls(self) -> list[str]:
        return [call["url"] for call in self.calls]


def seat_session() -> dict:
    return {"schema": "buildanddo.ocn-seat-session/v1", "seat": BOX, "env": "staging", "persona": "Forge",
            "guild": "builder", "egress_ip": EGRESS,
            "identity": {"state": "RESOLVED", "guild_from": ["node.json"], "sources": {"node.json": "read"}},
            "session_id": "0f0e0d0c-0b0a-4908-8706-050403020100", "distinct_id": "ocn:" + BOX, "at": AT,
            "login": "LOGIN_OK",
            "replay": [{"step": "ocn_login", "result": "LOGIN_OK"},
                       {"step": "pageview", "route": "/", "http": 200, "ms": 120, "prerendered_chars": 900},
                       {"step": "pageview", "route": "/roadmap", "http": 200, "ms": 140, "prerendered_chars": 40},
                       {"step": "data", "path": "/roadmap-status.json", "http": 200, "json": True},
                       {"step": "data", "path": "/_version", "http": 200, "json": True},
                       {"step": "api_read", "collection": "workspaces", "http": 200, "items": 3}],
            "authenticated_reads": {"workspaces": {"http": 200, "items": 3}},
            "perception": {"persona": "Forge", "guild": "builder", "lens": "operational, safety-first",
                           "score": {"reachable_routes": "2/2", "median_latency_ms": 130,
                                     "prerendered_text_chars": 900, "persona_vocabulary_hits": ["build"],
                                     "persona_vocabulary_coverage": "1/7", "data_endpoints_ok": 2,
                                     "data_endpoints_total": 2},
                           "observations": ["Served from " + BOX + " at " + ADDRESS]},
            "telemetry": {"accepted": 0, "refused": 0, "note": "x"}}


def receipts() -> dict[str, dict]:
    """One receipt per probe, shaped like its real output, with private values in every forbidden field."""
    control = {"feature": "control.absent-route", "method": "GET",
               "path": "/api/buildanddo/definitely-not-a-route-9f3", "http": 404, "state": "ROUTE_ABSENT",
               "alive": True, "expected": [404]}
    anon = {"feature": "control.unauthenticated", "method": "GET", "path": "/api/buildanddo/learning",
            "http": 401, "state": "NEEDS_AUTH", "alive": True, "expected": [401]}
    return {
        "ocn_feature_sweep": {
            "schema": "buildanddo.ocn-feature-sweep/v1", "at": AT, "box": BOX, "env": "staging",
            "public_ip": ADDRESS, "seat_uid": RECORD, "measured_from_ip": EGRESS,
            "checks": [control, anon,
                       {"feature": "workspace.admin", "method": "GET",
                        "path": "/api/buildanddo/workspaces/<workspace>/admin", "http": 404,
                        "state": "ROUTE_ABSENT", "alive": False, "expected": [200, 403],
                        "said": "workspace of " + BOX + " " + EMAIL},
                       {"feature": "learning.catalogue", "method": "GET", "path": "/api/buildanddo/learning",
                        "http": 200, "state": "OK", "alive": True, "expected": [200]}],
            "controls_held": True, "broken": ["workspace.admin"], "degraded": [], "state": "REPAIR_NEEDED"},
        "ocn_journey_report": {
            "schema": "buildanddo.ocn-journey-report/v1", "at": AT, "box": BOX, "env": "production",
            "walked_from_ip": EGRESS, "workspace": RECORD, "workspace_source": "session", "lesson": RECORD,
            "lesson_http": 200, "lesson_body_head": "written by " + EMAIL,
            "legs": [{"leg": "control.absent", "doing": "CONTROL", "http": 404, "verdict": "OK"},
                     {"leg": "control.anon", "doing": "CONTROL", "http": 401, "verdict": "OK"},
                     {"leg": "missions", "doing": "Propose", "http": 400, "verdict": "UNHELPFUL",
                      "why": "400 from " + BOX}],
            "controls_held": True, "defects": [{"leg": "missions", "verdict": "UNHELPFUL", "why": BOX}],
            "state": "DEFECTS"},
        "ocn_classroom_fleet": {
            "schema": "buildanddo.ocn-classroom-fleet/v1", "command": "run", "observed_at": AT,
            "environment": "staging", "identity_model": "FOUR_IDENTITIES_FOUR_MACHINES",
            "seats": [{"box": BOX, "guildmaster": "forge", "guild": "builder", "public_ip": ADDRESS,
                       "source_ip": ADDRESS, "email": EMAIL, "uid": RECORD, "http": 200},
                      {"box": BOX_TWO, "guildmaster": "oracle", "guild": "intelligence", "public_ip": EGRESS,
                       "source_ip": EGRESS, "email": EMAIL, "uid": RECORD, "http": 200}],
            "distinct_source_ips": [ADDRESS, EGRESS],
            "workspace": {"id": RECORD, "name": "hall of %s, also called %s" % (BOX, ALIAS)},
            "lesson": RECORD, "room": RECORD,
            "checks": [{"check": "forge signs in on its own box", "box": BOX, "expect": "200", "http": 200,
                        "stage": "login", "outcome": "AS_EXPECTED", "message": None},
                       {"check": "host seats oracle (%s)" % BOX_TWO, "box": BOX, "expect": "200", "http": 200,
                        "stage": "call", "outcome": "AS_EXPECTED", "message": None},
                       {"check": "oracle joins from %s" % BOX_TWO, "box": BOX_TWO, "expect": "200",
                        "http": 409, "stage": "call", "outcome": "CONTRACT_BROKEN", "message": EMAIL},
                       {"check": "CONTROL unseated oracle refused from %s" % BOX_TWO, "box": BOX_TWO,
                        "expect": "not 200", "http": 403, "stage": "call", "outcome": "AS_EXPECTED",
                        "message": "no"}],
            "readback": {"from_box": BOX_TWO, "http": 200, "status": "live", "section": 1, "participants": 2,
                         "messages": 2},
            "summary": {"checks": 4, "machines": 2, "distinct_source_ips": 2,
                        "contract_broken": ["oracle joins from %s" % BOX_TWO]},
            "state": "FAIL"},
        "ocn_classroom_live": {
            "schema": "buildanddo.ocn-classroom-live/v1", "command": "run", "observed_at": AT,
            "environment": "staging", "host": "forge", "joiners": ["oracle", "alex"],
            "identity_model": "FOUR_IDENTITIES_ONE_MACHINE",
            "seats": [{"seat": "forge", "state": "OK", "uid": RECORD, "email": EMAIL, "guild": "builder"}],
            "workspace": {"id": RECORD, "name": "x"}, "lesson": RECORD, "room": RECORD,
            "checks": [{"check": "host seats oracle in the workspace", "expect": "200", "http": 200,
                        "outcome": "AS_EXPECTED", "message": None},
                       {"check": "CONTROL unseated muse cannot read the class", "expect": "not 200",
                        "http": 404, "outcome": "AS_EXPECTED", "message": EMAIL}],
            "readback": {"http": 200, "status": "live", "section": 1, "participants": 2, "messages": 2},
            "summary": {"checks": 2, "contract_broken": [], "guildmasters": 3}, "state": "PASS"},
        "ocn_project_fleet": {
            "schema": "buildanddo.ocn-project-fleet/v1", "command": "run", "env": "staging",
            "observed_at": AT,
            "machines": {BOX: {"ip": ADDRESS, "uid": RECORD, "login_http": 200},
                         BOX_TWO: {"ip": EGRESS, "uid": RECORD, "login_http": 200}},
            "distinct_public_ips": 2, "workspace": RECORD, "mission_title": "OCN Multiplayer x", "mission": RECORD,
            "checks": [{"check": "login", "box": BOX, "expect": "200", "http": 200, "stage": "login",
                        "outcome": "AS_EXPECTED", "message": None},
                       {"check": "non-member-refused", "box": BOX_TWO, "expect": "403/404", "http": 403,
                        "stage": "call", "outcome": "AS_EXPECTED", "message": "member " + EMAIL}],
            "race": {"verdict": "MUTUAL_EXCLUSION_HELD", "why": "x", "winners": [BOX], "refused": [BOX_TWO],
                     "errored": []},
            "race_detail": [{"box": BOX, "http": 200, "message": ""}], "job_id": RECORD, "run_status": "queued",
            "claim_race": {"verdict": "UNMEASURED", "why": "no queued run to contend for"},
            "control_workspace": RECORD,
            "control_detail": {"owner": {"box": BOX, "http": 200, "message": ""}},
            "state": "PASS", "contract_broken": []},
        "ocn_seat_session": seat_session(),
        "ocn_rbac_probe": {"seat": BOX, "op": "read_ws", "args": [RECORD, BOX_UNPLACED], "at": AT, "uid": RECORD,
                           "result": {"http": 404, "state": "DENIED", "message": "hidden from " + EMAIL}},
        "ocn_box_exercise": {
            "seat": BOX, "mode": "exercise", "at": AT,
            "login": {"state": "LOGIN_OK", "record_id": RECORD, "name": "OCN seat " + BOX},
            "steps": [{"step": "create mission (complete plan)", "http": 200, "id": RECORD},
                      {"step": "CONTROL skip approval (refusal wanted)", "http": 400, "message": BOX,
                       "fields": {"status": EMAIL}},
                      {"step": "CONTROL stale revision (409 wanted)", "http": 409, "message": "stale"},
                      {"step": "create research_upload (expects 400: needs a real asset)", "http": 400}]},
        "ocn_content_assessment": {
            "schema": "buildanddo.ocn-content-assessment/v1", "seat": BOX, "env": "staging", "at": AT,
            "login": "OK", "registered_routes": 16, "tutorials": 2,
            "diag": {"titles_indexed": 2, "routes_sample": ["/"], "first_prereq_repr": "'" + EMAIL + "'"},
            "by_section": {"Build": {"STABLE": 1, "WORKING": 1, "NEEDS_WORK": 0, "lessons": 2}},
            "lessons": [{"slug": "a", "title": "by " + EMAIL, "grade": "STABLE", "findings": [ADDRESS],
                         "facts": {}}],
            "summary": {"STABLE": 1, "WORKING": 1, "NEEDS_WORK": 0, "total": 2, "broken_references": 0,
                        "unanswerable_checks": 0, "dangling_prerequisites": 0}},
        "ocn_guild_dogfood": {
            "schema": "buildanddo.ocn-guild-dogfood/v1", "seat": BOX, "guild": "builder", "action": "workload",
            "workspace": RECORD, "at": AT, "login": "OK", "uid": RECORD, "mission": RECORD, "workflow": RECORD,
            "steps": [{"step": "create mission (proposed, full plan)", "http": 200, "ok": True, "message": ""},
                      {"step": "CONTROL run on an unapproved mission must be refused", "http": 409, "ok": True,
                       "message": "said by " + BOX}],
            "signals_bound": [{"signal": RECORD, "http": 200}], "run": RECORD, "run_status": "running",
            "run_body_keys": ["record"]},
        "ocn_guild_forum": {
            "schema": "buildanddo.ocn-guild-forum/v1", "seat": BOX, "action": "forum.reply", "workspace": RECORD,
            "env": "staging", "at": AT, "login": "OK", "uid": RECORD,
            "result": {"http": 201, "sent_action": "forum.reply", "sent_revision": 2,
                       "request_key": "key-" + BOX, "id": RECORD, "revision": 3, "status": "published"}},
        "ocn_room_probe": {
            "schema": "buildanddo.ocn-room-probe/v1", "seat": BOX, "action": "room.join", "workspace": RECORD,
            "at": AT, "login": "OK", "uid": RECORD,
            "result": {"http": 200, "room_id": RECORD, "status": "live", "revision": 3, "keys": ["id"]}},
        "ocn_mission_lifecycle": {
            "schema": "buildanddo.ocn-mission-lifecycle/v1", "seat": BOX, "env": "staging", "workspace": RECORD,
            "at": AT, "login": "OK", "mission": RECORD, "evidence": {"test": RECORD}, "final_status": "verified",
            "readback": {"http": 200, "status": "verified"},
            "steps": [{"step": "create mission (proposed, with full plan)", "http": 200, "ok": True},
                      {"step": "CONTROL proposed->verified must be refused", "http": 400, "ok": True,
                       "message": "by " + EMAIL}],
            "summary": {"steps": 2, "failed": [], "reached_verified": True}},
        "ocn_mission_work": {
            "schema": "buildanddo.ocn-mission-work/v1", "seat": BOX, "action": "evidence", "at": AT, "login": "OK",
            "results": [{"kind": "evidence", "title": "found by " + EMAIL, "http": 201, "id": RECORD,
                         "error": None, "fields": None}],
            "created": [RECORD]},
        "ocn_observation_record": {
            "schema": "buildanddo.ocn-observation-record/v1", "seat": BOX, "persona": "Forge on " + BOX,
            "workspace": RECORD, "env": "staging", "forum_url": FORUM, "at": AT, "login": "OK",
            "chain": {"mission": RECORD, "evidence": RECORD, "signal": RECORD},
            "provable": {"signal_names_mission": True, "signal_cites_evidence": True,
                         "evidence_names_mission": True, "evidence_source_is_forum_post": True,
                         "signal_readback_http": 200, "evidence_readback_http": 200, "chain_intact": True}},
        "ocn_signal_lifecycle": {
            "schema": "buildanddo.ocn-signal-lifecycle/v1", "seat": BOX, "env": "staging", "workspace": RECORD,
            "at": AT, "login": "OK", "raised": {"fact": RECORD}, "lifecycle_enforced": False,
            "steps": [{"step": "raise fact signal", "http": 200, "ok": True, "expected": "accept"},
                      {"step": "CONTROL dismissed -> new should be refused", "http": 200, "ok": False,
                       "expected": "refuse"}],
            "summary": {"steps": 2, "failed": ["CONTROL dismissed -> new should be refused"],
                        "signals_raised": 1, "state_machine_enforced": False,
                        "can_promote_signal_to_mission": True}},
        "ocn_subsystem_probe": {
            "schema": "buildanddo.ocn-subsystem-probe/v1", "seat": BOX, "env": "staging", "workspace": RECORD,
            "at": AT, "login": "OK",
            "checks": [{"subsystem": "control", "check": "unregistered route must 404", "method": "GET",
                        "path": "/api/buildanddo/definitely-not-a-route-9f3", "http": 404,
                        "state": "ROUTE_ABSENT", "message": None, "fields": None},
                       {"subsystem": "mission", "check": "approve mission", "method": "PATCH",
                        "path": "/api/collections/missions/records/" + RECORD, "http": 403,
                        "state": "REFUSED_BY_POLICY", "message": EMAIL, "fields": ["status"]},
                       {"subsystem": "suite", "check": "suite with empty body (contract)", "method": "POST",
                        "path": "/api/buildanddo/workspaces/%s/suite" % RECORD, "http": 418,
                        "state": "HTTP_418", "message": None, "fields": None}],
            "summary": {"checks": 3, "route_absent": 0, "ok": 0, "refused_or_contract": 1,
                        "dependency_missing": 0, "transport_fault": 0}},
    }


class Harness(unittest.TestCase):
    """A cleared environment, a private fleet map, a ledger and a store, all in a temporary directory."""

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="ocn-telemetry-")
        self.addCleanup(self.temp.cleanup)
        self.dir = Path(self.temp.name)
        self.ledger = self.dir / "ledger"
        self.fleet = self.dir / "fleet.json"
        self.fleet.write_text(json.dumps({"boxes": {
            BOX: {"guildmaster": "forge", "guild": "builder", "public_ip": ADDRESS, "aka": [ALIAS]},
            BOX_TWO: {"guildmaster": "oracle", "guild": "intelligence", "public_ip": EGRESS},
            BOX_UNPLACED: {"public_ip": ADDRESS}}}), encoding="utf-8")
        # Only what a child interpreter needs to start survives, and the store and the fleet map point
        # into this directory, so no test can read the workstation's real ones.
        kept = {name: os.environ[name] for name in KEEP if os.environ.get(name)}
        kept.update({"CITADEL_WORKSPACE_ENV": str(self.dir / "no-store.env"), "CITADEL_FLEET_MAP": str(self.fleet)})
        patcher = mock.patch.dict(os.environ, kept, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def plan(self, receipt: dict, **options) -> t.Plan:
        options.setdefault("fleet_map", self.fleet)
        options.setdefault("now", NOW)
        return t.prepare(receipt, **options)

    def publish(self, receipt: dict, mode: str = "send", **options) -> dict:
        options.setdefault("fleet_map", self.fleet)
        options.setdefault("ledger_dir", self.ledger)
        options.setdefault("now", NOW)
        options.setdefault("stderr", io.StringIO())
        if mode == "send":
            options.setdefault("credentials", keys())
        return t.publish(receipt, mode=mode, **options)


class RegistryTests(Harness):
    def test_the_registry_names_exactly_the_seventeen_probes(self):
        on_disk = {path.stem for path in (ROOT / "scripts" / "ci").glob("ocn_*.py")} - {"ocn_telemetry"}
        self.assertEqual(set(t.PROBES), on_disk)
        self.assertEqual(len(t.PROBES), 17)
        self.assertEqual(set(t.ADAPTERS), set(t.PROBES))

    def test_per_check_events_only_for_journeys_and_lifecycles(self):
        scans = {name for name, probe in t.PROBES.items() if not probe.ph_checks}
        self.assertEqual(scans, {"ocn_feature_sweep", "ocn_subsystem_probe", "ocn_rbac_probe",
                                 "ocn_content_assessment", "ocn_project_fleet"})

    def test_every_probe_is_detected_from_its_own_receipt(self):
        for name, receipt in receipts().items():
            with self.subTest(probe=name):
                self.assertEqual(t.detect_probe(receipt), name)

    def test_a_probe_named_against_its_receipt_is_refused(self):
        block = self.publish(receipts()["ocn_journey_report"], mode="dry-run", probe="ocn_feature_sweep")
        self.assertEqual((block["state"], block["reason"]), ("UNSENT", "UNKNOWN_SCHEMA"))
        unknown = dict(receipts()["ocn_journey_report"], schema="buildanddo.something-else/v1")
        self.assertEqual(self.publish(unknown, mode="dry-run")["reason"], "UNKNOWN_SCHEMA")

    def test_selftest_route_and_seat_outputs_are_never_published(self):
        selftest = {"schema": "buildanddo.ocn-feature-sweep/v1", "at": AT, "checks": [], "state": "PASS",
                    "passed": 1, "total": 1}
        seats = {"schema": "buildanddo.ocn-classroom-fleet/v1", "command": "seats", "observed_at": AT,
                 "seats": [], "state": "PASS"}
        for receipt in (selftest, seats):
            with self.subTest(receipt=receipt.get("command", "selftest")):
                self.assertEqual(self.publish(receipt, mode="dry-run")["reason"], "NOT_PUBLISHABLE")


class AdapterTests(Harness):
    def test_no_planted_value_reaches_any_outbound_byte(self):
        for name, receipt in receipts().items():
            with self.subTest(probe=name):
                plan = self.plan(receipt, dd_metrics=True)
                text = json.dumps(plan.bodies)
                for value in PLANTED:
                    self.assertNotIn(value, text)
                self.assertEqual(t.tag_gate(plan.bodies, plan.cat), [])
                self.assertEqual(t.leak_gate(plan.bodies, plan.rule)["state"], "PASS")

    def test_the_planted_values_are_really_in_the_receipts(self):
        # The control for the test above: without it, a receipt that planted nothing would pass.
        text = json.dumps(receipts())
        for index, value in enumerate(PLANTED):
            self.assertTrue(value in text, "planted value %d is missing from the receipts" % index)

    def test_sweep_outcomes_follow_the_sweep(self):
        sweep = receipts()["ocn_feature_sweep"]
        self.assertEqual(self.plan(sweep).view["outcome"], "fail")
        only_degraded = dict(sweep, broken=[], degraded=["workspace.admin"])
        self.assertEqual(self.plan(only_degraded).view["outcome"], "degraded")
        for state, outcome in (("PASS", "pass"), ("PARTIAL", "partial"), ("VOID", "void"),
                               ("UNMEASURED", "unmeasured"), ("SOMETHING_NEW", "unmeasured")):
            with self.subTest(state=state):
                view = self.plan(dict(sweep, state=state)).view
                self.assertEqual(view["outcome"], outcome)
                self.assertEqual(view["state"], state if state != "SOMETHING_NEW" else "other")

    def test_the_unmerged_sweep_shape_is_read_by_allowlist(self):
        row = {"feature": "research.read", "method": "GET", "path": "/api/buildanddo/workspaces/<workspace>/research",
               "http": -1, "state": "UNMEASURABLE", "alive": False, "expected": [200]}
        sweep = dict(receipts()["ocn_feature_sweep"], workspace_note="measured on " + BOX, state="PARTIAL")
        sweep["checks"] = sweep["checks"] + [row, dict(row, feature="wiki.read", state="HTTP_502", http=502)]
        view = self.plan(sweep).view
        unmeasurable = [c for c in view["checks"] if c["id"] == "research.read"][0]
        self.assertIsNone(unmeasurable["as_expected"])
        self.assertEqual(unmeasurable["state"], "UNMEASURABLE")
        self.assertEqual([c["state"] for c in view["checks"] if c["id"] == "wiki.read"], ["http_other"])
        self.assertNotIn(BOX, json.dumps(self.plan(sweep).bodies))

    def test_journey_defects_that_are_only_unhelpful_are_degraded(self):
        journey = receipts()["ocn_journey_report"]
        self.assertEqual(self.plan(journey).view["outcome"], "degraded")
        broken = dict(journey, defects=[{"leg": "missions", "verdict": "BROKEN"}])
        self.assertEqual(self.plan(broken).view["outcome"], "fail")
        self.assertEqual(self.plan(dict(journey, state="CLEAN", defects=[])).view["outcome"], "pass")
        self.assertEqual(self.plan(dict(journey, state="VOID")).view["reason_code"], "CONTROLS_FAILED")

    def test_journey_legs_carry_their_templated_paths(self):
        checks = {c["id"]: c for c in self.plan(receipts()["ocn_journey_report"]).view["checks"]}
        self.assertEqual(checks["missions"]["path_template"], "/api/buildanddo/workspaces/:workspace/suite")
        self.assertEqual(checks["missions"]["method"], "POST")
        self.assertTrue(checks["control.anon"]["is_control"])

    def test_rbac_cells_follow_the_matrix_expectation(self):
        cell = receipts()["ocn_rbac_probe"]
        self.assertEqual(self.plan(cell, expect="deny").view["outcome"], "pass")
        self.assertEqual(self.plan(cell, expect="allow").view["outcome"], "fail")
        unjudged = self.plan(cell)
        self.assertEqual(unjudged.view["outcome"], "observed")
        self.assertEqual(unjudged.skipped["datadog.event"], "NOT_JUDGED")
        self.assertIn("datadog.logs", unjudged.bodies)
        fault = dict(cell, result={"http": 0, "state": "TRANSPORT_FAULT"})
        self.assertEqual(self.plan(fault, expect="deny").view["outcome"], "unmeasured")
        login = dict(cell, result={"http": None, "state": "LOGIN_FAILED"})
        self.assertEqual(self.plan(login).view["outcome"], "fail")

    def test_box_exercise_expects_only_what_its_labels_say(self):
        checks = {c["id"]: c for c in self.plan(receipts()["ocn_box_exercise"]).view["checks"]}
        self.assertIs(checks["control-skip-approval-refusal-wanted"]["as_expected"], True)
        self.assertIs(checks["control-stale-revision-409-wanted"]["as_expected"], True)
        self.assertIs(checks["create-research_upload-expects-400-needs-a-real-asset"]["as_expected"], True)
        self.assertIsNone(checks["create-mission-complete-plan"]["as_expected"])
        wrong = copy.deepcopy(receipts()["ocn_box_exercise"])
        wrong["steps"][2]["http"] = 200
        view = self.plan(wrong).view
        self.assertEqual(view["outcome"], "observed")
        self.assertIs(view["controls_held"], False)

    def test_classroom_labels_are_templated_to_persona_and_box(self):
        ids = [c["id"] for c in self.plan(receipts()["ocn_classroom_fleet"]).view["checks"]]
        self.assertEqual(ids, ["persona-signs-in-on-its-own-box", "host-seats-persona-box",
                               "persona-joins-from-box", "control-unseated-persona-refused-from-box"])

    def test_multi_machine_runs_publish_as_multiple(self):
        for name in ("ocn_classroom_fleet", "ocn_classroom_live", "ocn_project_fleet"):
            with self.subTest(probe=name):
                plan = self.plan(receipts()[name])
                self.assertEqual(plan.view["actor"]["persona"], "multiple")
                self.assertEqual(plan.bodies["posthog.batch"][0]["distinct_id"], "ocn:multiple")
        self.assertEqual(self.plan(receipts()["ocn_classroom_fleet"]).view["actor"]["personas"], ["forge", "oracle"])

    def test_project_races_are_checks_and_labels(self):
        view = self.plan(receipts()["ocn_project_fleet"]).view
        races = {c["id"]: c for c in view["checks"] if c["kind"] == "race"}
        self.assertEqual(races["race.enqueue"]["state"], "MUTUAL_EXCLUSION_HELD")
        self.assertIs(races["race.enqueue"]["as_expected"], True)
        self.assertIsNone(races["race.claim"]["as_expected"])
        self.assertEqual(view["labels"]["ocn_race_enqueue"], "MUTUAL_EXCLUSION_HELD")
        self.assertIs([c for c in view["checks"] if c["id"] == "non-member-refused"][0]["is_control"], True)

    def test_seat_sessions_publish_their_persona_and_perception(self):
        plan = self.plan(receipts()["ocn_seat_session"])
        self.assertEqual(plan.view["actor"], {"kind": "guildmaster", "persona": "forge", "guild": "builder",
                                              "personas": ["forge"]})
        run = plan.bodies["posthog.batch"][0]["properties"]
        self.assertEqual((run["perc_reachable_routes"], run["perc_reachable_routes_total"]), (2, 2))
        self.assertEqual(run["perc_persona_vocabulary_hits_count"], 1)
        self.assertEqual(run["perc_observation_count"], 1)
        ids = [c["id"] for c in plan.view["checks"]]
        self.assertEqual(ids, ["login", "route.home", "route.roadmap", "data.roadmap-status", "data.version",
                               "collection.workspaces"])
        self.assertEqual(len(plan.bodies["posthog.batch"]), 7)

    def test_a_seat_whose_persona_contradicts_its_guild_is_unresolved(self):
        plan = self.plan(dict(receipts()["ocn_seat_session"], guild="finance"))
        self.assertEqual(plan.view["actor"]["kind"], "unresolved")
        self.assertEqual(plan.skipped["posthog.batch"], "IDENTITY_UNRESOLVED")
        self.assertIn("datadog.logs", plan.bodies)

    def test_boxes_resolve_through_the_private_map_only(self):
        self.assertEqual(self.plan(receipts()["ocn_rbac_probe"]).view["actor"]["persona"], "forge")
        unplaced = dict(receipts()["ocn_rbac_probe"], seat=BOX_UNPLACED)
        self.assertEqual(self.plan(unplaced).view["actor"]["kind"], "unplaced")
        stranger = dict(receipts()["ocn_rbac_probe"], seat="seat-without-a-map-entry")
        self.assertEqual(self.plan(stranger).view["actor"]["kind"], "unresolved")
        missing = self.plan(receipts()["ocn_rbac_probe"], fleet_map=self.dir / "absent.json")
        self.assertEqual(missing.view["actor"]["kind"], "unresolved")
        self.assertFalse(missing.fleet_readable)

    def test_a_published_block_does_not_change_the_run_id(self):
        receipt = receipts()["ocn_mission_work"]
        before = t.receipt_ids(receipt)
        self.assertEqual(t.receipt_ids(dict(receipt, ocn_telemetry={"state": "SENT"})), before)
        self.assertNotEqual(t.receipt_ids(dict(receipt, action="workflow")), before)

    def test_checks_are_capped_and_controls_are_always_kept(self):
        sweep = copy.deepcopy(receipts()["ocn_feature_sweep"])
        filler = [{"feature": "filler.%d" % n, "method": "GET", "path": "/x", "http": 200, "state": "OK",
                   "alive": True} for n in range(70)]
        sweep["checks"] = filler + sweep["checks"][:2]
        view = self.plan(sweep).view
        self.assertEqual(len(view["checks"]), t.CHECK_CAP)
        self.assertEqual(view["counts"]["checks_truncated"], 72 - t.CHECK_CAP)
        self.assertEqual(sum(c["is_control"] for c in view["checks"]), 2)

    def test_other_outcomes_follow_each_probe(self):
        cases = {
            "ocn_guild_forum": "pass", "ocn_room_probe": "pass", "ocn_mission_lifecycle": "pass",
            "ocn_mission_work": "pass", "ocn_observation_record": "pass", "ocn_signal_lifecycle": "fail",
            "ocn_subsystem_probe": "observed", "ocn_content_assessment": "observed",
            "ocn_guild_dogfood": "observed", "ocn_classroom_live": "pass", "ocn_classroom_fleet": "fail",
            "ocn_project_fleet": "pass"}
        for name, outcome in cases.items():
            with self.subTest(probe=name):
                self.assertEqual(self.plan(receipts()[name]).view["outcome"], outcome)
        crashed = dict(receipts()["ocn_guild_dogfood"], crashed="KeyError: " + BOX)
        self.assertEqual(self.plan(crashed).view["outcome"], "error")
        refused = dict(receipts()["ocn_guild_forum"], result={"http": 403, "message": EMAIL})
        self.assertEqual(self.plan(refused).view["outcome"], "fail")
        failed = {"schema": "buildanddo.ocn-mission-work/v1", "seat": BOX, "action": "evidence", "at": AT,
                  "login": "FAILED"}
        self.assertEqual(self.plan(failed).view["reason_code"], "LOGIN_FAILED")

    def test_the_subsystem_control_is_reported_and_never_gates(self):
        view = self.plan(receipts()["ocn_subsystem_probe"]).view
        self.assertIs(view["controls_held"], True)
        self.assertEqual(view["outcome"], "observed")
        paths = [c["path_template"] for c in view["checks"]]
        self.assertIn("/api/collections/missions/records/:id", paths)
        self.assertIn("/api/buildanddo/workspaces/:workspace/suite", paths)


class TemplatingTests(Harness):
    def rule(self):
        return pr.Rule(str(self.fleet))

    def test_labels_lose_machines_personas_addresses_and_ids(self):
        pattern = t.catalogue().persona_pattern
        rule = self.rule()
        self.assertEqual(t.check_label("Director Nexus joins from " + ALIAS, rule, pattern),
                         "persona-joins-from-box")
        self.assertEqual(t.check_label("reached " + ADDRESS + " as " + RECORD, rule, pattern),
                         "reached-addr-as-id")
        self.assertEqual(t.check_label("control.absent-route", rule, pattern), "control.absent-route")
        self.assertLessEqual(len(t.check_label("x" * 500, rule, pattern)), 64)

    def test_paths_drop_queries_and_ids(self):
        rule = self.rule()
        self.assertEqual(t.path_template("/api/buildanddo/workspaces/%s/admin?q=%s#f" % (RECORD, EMAIL), rule),
                         "/api/buildanddo/workspaces/:workspace/admin")
        self.assertEqual(t.path_template("/api/collections/workspaces/records?perPage=1", rule),
                         "/api/collections/workspaces/records")
        self.assertEqual(t.path_template("/api/buildanddo/learning/{lesson}", rule), "/api/buildanddo/learning/:id")
        self.assertEqual(t.path_template("/x/" + BOX + "/y", rule), "/x/:box/y")

    def test_states_stay_inside_their_vocabulary(self):
        self.assertEqual(t.state_label("HTTP_418", t.SWEEP_STATES), "http_other")
        self.assertEqual(t.state_label("said something by " + BOX, t.SWEEP_STATES), "other")
        self.assertEqual(t.state_label("ROUTE_ABSENT", t.SWEEP_STATES), "ROUTE_ABSENT")


class PayloadTests(Harness):
    def test_posthog_events_are_marked_personless_and_keyed_by_persona(self):
        plan = self.plan(receipts()["ocn_journey_report"])
        forbidden = {"$pageview", "$identify", "$set", "$set_once", "$session_id", "$current_url", "ocn_seat",
                     "ocn_box_ip", "$ip"}
        for event in plan.bodies["posthog.batch"]:
            properties = event["properties"]
            self.assertIn(event["event"], ("ocn_probe_run", "ocn_probe_check"))
            self.assertIs(properties["is_ocn_agent"], True)
            self.assertIs(properties["$process_person_profile"], False)
            self.assertIs(properties["$geoip_disable"], True)
            self.assertEqual(properties["$lib"], "bnd-ocn-telemetry")
            self.assertEqual(event["distinct_id"], "ocn:forge")
            self.assertFalse(forbidden & set(properties))
        run, *checks = plan.bodies["posthog.batch"]
        self.assertLessEqual(set(run["properties"]) - {k for k in run["properties"] if k.startswith(("ocn_", "perc_"))},
                             t.PH_RUN_KEYS)
        for event in checks:
            self.assertLessEqual(set(event["properties"]), t.PH_CHECK_KEYS)
        self.assertEqual(set(plan.bodies["posthog.control"]["properties"]), t.PH_CONTROL_KEYS)

    def test_the_documented_key_sets(self):
        self.assertEqual(t.PH_CHECK_KEYS - t.PH_COMMON_KEYS, {
            "ocn_check", "ocn_check_kind", "ocn_check_index", "ocn_http", "ocn_check_state", "ocn_as_expected",
            "ocn_is_control", "ocn_method", "ocn_path_template", "ocn_latency_ms", "ocn_prerendered_chars"})
        self.assertEqual(t.EVENT_TAG_KEYS, {"service", "env", "team", "ocn_probe", "ocn_outcome", "ocn_persona",
                                            "ocn_run"})
        self.assertEqual(t.SERIES_TAG_KEYS, {"service", "env", "team", "ocn_probe"})

    def test_datadog_signals_carry_no_host_and_bounded_tags(self):
        plan = self.plan(receipts()["ocn_feature_sweep"], dd_metrics=True)
        event = plan.bodies["datadog.event"]
        self.assertEqual(event["title"], "OCN feature_sweep on staging: FAIL")
        self.assertEqual(event["source_type_name"], "buildanddo")
        self.assertTrue(event["text"].startswith("%%%\n") and event["text"].endswith("\n%%%"))
        for record in plan.bodies["datadog.logs"]:
            self.assertNotIn("hostname", record)
            self.assertEqual(record["service"], "buildanddo-ocn")
            self.assertIn("run=" + plan.ids["run_id"], record["message"])
        for series in plan.bodies["datadog.series"]:
            self.assertNotIn("resources", series)
            self.assertFalse([tag for tag in series["tags"] if tag.startswith(("ocn_run", "ocn_persona", "http"))])

    def test_metrics_are_off_by_default_and_bounded(self):
        plan = self.plan(receipts()["ocn_feature_sweep"])
        self.assertNotIn("datadog.series", plan.bodies)
        self.assertEqual(plan.skipped["datadog.series"], "DISABLED")
        self.assertEqual(t.series_ceiling(t.catalogue().features), 178)
        self.assertEqual(len(t.catalogue().features), 38)

    def test_a_void_sweep_sends_no_outcome_or_alive_gauge(self):
        void = dict(receipts()["ocn_feature_sweep"], state="VOID", controls_held=False)
        names = [series["metric"] for series in self.plan(void, dd_metrics=True).bodies["datadog.series"]]
        self.assertNotIn(t.METRIC_OUTCOME, names)
        self.assertNotIn(t.METRIC_ALIVE, names)
        held = [series["metric"] for series in self.plan(receipts()["ocn_feature_sweep"], dd_metrics=True)
                .bodies["datadog.series"]]
        self.assertIn(t.METRIC_ALIVE, held)
        self.assertIn(t.METRIC_OUTCOME, held)

    def test_the_same_receipt_always_gives_the_same_ids(self):
        first = self.plan(receipts()["ocn_journey_report"])
        second = self.plan(copy.deepcopy(receipts()["ocn_journey_report"]))
        self.assertEqual(first.ids, second.ids)
        self.assertEqual([e["uuid"] for e in first.bodies["posthog.batch"]],
                         [e["uuid"] for e in second.bodies["posthog.batch"]])


class GateTests(Harness):
    def test_the_leak_gate_blocks_a_planted_name_and_address_before_any_request(self):
        for planted in (BOX, ADDRESS):
            with self.subTest(planted="name" if planted == BOX else "address"):
                plan = self.plan(receipts()["ocn_journey_report"])
                plan.bodies["posthog.batch"][1]["properties"]["ocn_check"] = "via " + planted
                recorder = Recorder()
                block = t.deliver(plan, mode="send", ledger_dir=self.ledger, credentials=keys(), transport=recorder,
                                  now=NOW)
                self.assertEqual((block["state"], block["reason"]), ("UNSENT", "LEAK_GATE"))
                self.assertEqual(recorder.calls, [])
                self.assertIn("body.posthog.batch[].properties.ocn_check", block["gates"]["leak_fields"])
                self.assertNotIn(planted, json.dumps(block))

    def test_the_same_receipt_without_the_planted_value_sends(self):
        recorder = Recorder()
        block = t.deliver(self.plan(receipts()["ocn_journey_report"]), mode="send", ledger_dir=self.ledger,
                          credentials=keys(), transport=recorder, now=NOW)
        self.assertEqual(block["state"], "SENT")
        self.assertEqual(len(recorder.calls), 4)

    def test_the_tag_gate_refuses_a_tag_outside_its_enum(self):
        plan = self.plan(receipts()["ocn_journey_report"])
        plan.bodies["datadog.event"]["tags"].append("ocn_probe:not_a_probe")
        recorder = Recorder()
        block = t.deliver(plan, mode="send", ledger_dir=self.ledger, credentials=keys(), transport=recorder, now=NOW)
        self.assertEqual(block["reason"], "TAG_GATE")
        self.assertEqual(recorder.calls, [])
        series = self.plan(receipts()["ocn_feature_sweep"], dd_metrics=True)
        series.bodies["datadog.series"][0]["tags"].append("ocn_run:" + series.ids["run_id"])
        self.assertTrue(t.tag_gate(series.bodies, series.cat))
        clean = self.plan(receipts()["ocn_feature_sweep"], dd_metrics=True)
        self.assertEqual(t.tag_gate(clean.bodies, clean.cat), [])

    def test_send_refuses_without_the_private_map_and_dry_run_says_families_only(self):
        missing = self.dir / "absent.json"
        recorder = Recorder()
        block = self.publish(receipts()["ocn_journey_report"], fleet_map=missing, transport=recorder)
        self.assertEqual(block["reason"], "NO_FLEET_MAP")
        self.assertEqual(recorder.calls, [])
        dry = self.publish(receipts()["ocn_journey_report"], mode="dry-run", fleet_map=missing)
        self.assertIn("families only", dry["gates"]["leak_rule"])


class SwitchTests(Harness):
    def test_off_is_the_default_and_touches_nothing(self):
        self.assertEqual(t.switch_mode(None), "off")
        recorder = Recorder()
        block = self.publish(receipts()["ocn_journey_report"], mode=None, transport=recorder)
        self.assertEqual((block["state"], block["reason"]), ("UNSENT", "DISABLED"))
        self.assertEqual(recorder.calls, [])
        self.assertFalse(self.ledger.exists())
        with mock.patch.dict(os.environ, {"BUILDANDDO_OCN_TELEMETRY": "loud"}):
            self.assertEqual(t.switch_mode(None), "off")

    def test_dry_run_writes_payloads_to_stderr_only(self):
        recorder, err, out = Recorder(), io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out):
            block = self.publish(receipts()["ocn_journey_report"], mode="dry-run", transport=recorder, stderr=err)
        self.assertEqual((block["state"], block["reason"]), ("UNSENT", "DRY_RUN"))
        self.assertEqual(recorder.calls, [])
        self.assertEqual(out.getvalue(), "")
        self.assertIn("ocn_probe_run", err.getvalue())
        entry = t.read_ledger(self.ledger, block["run_id"])
        self.assertEqual(entry["sinks"]["posthog"]["reason"], "DRY_RUN")
        self.assertEqual(entry["expected"]["posthog"]["ocn_probe_check"], 3)

    def test_off_and_dry_run_never_open_the_store(self):
        store = self.dir / "workspace.env"
        store.write_text("BUILDANDDO_PH=%s\n" % capture_key(), encoding="utf-8")
        with mock.patch.dict(os.environ, {"CITADEL_WORKSPACE_ENV": str(store)}), \
                mock.patch.object(t, "parse_env_file", side_effect=AssertionError("the store was opened")):
            self.assertEqual(self.publish(receipts()["ocn_journey_report"], mode="dry-run")["reason"], "DRY_RUN")
            self.assertEqual(self.publish(receipts()["ocn_journey_report"], mode="off")["reason"], "DISABLED")
            opened = self.publish(receipts()["ocn_journey_report"], credentials=None, transport=Recorder())
        self.assertEqual(opened["reason"], "PUBLISHER_ERROR:AssertionError")

    def test_no_key_is_reported_per_sink(self):
        recorder = Recorder()
        block = self.publish(receipts()["ocn_journey_report"], credentials={}, transport=recorder)
        self.assertEqual(block["posthog"]["reason"], "NO_KEY:BUILDANDDO_PH")
        self.assertEqual(block["datadog"]["reason"], "NO_KEY:DD_API_KEY")
        self.assertEqual(recorder.calls, [])
        only_datadog = self.publish(receipts()["ocn_journey_report"], transport=recorder,
                                    credentials={"DD_API_KEY": datadog_key()}, force=True)
        self.assertEqual((only_datadog["state"], only_datadog["degraded"]), ("SENT", True))

    def test_the_urls_are_pinned(self):
        recorder = Recorder()
        self.publish(receipts()["ocn_journey_report"], transport=recorder, dd_metrics=True)
        self.assertEqual(recorder.urls(), ["https://us.i.posthog.com/batch/", "https://us.i.posthog.com/batch/",
                                           "https://api.us5.datadoghq.com/api/v1/events",
                                           "https://http-intake.logs.us5.datadoghq.com/api/v2/logs",
                                           "https://api.us5.datadoghq.com/api/v2/series"])

    def test_posthog_api_key_and_host_are_never_read(self):
        sentinel_key = "_".join(("phc", "sentinel" * 3))
        sentinel_host = "sentinel-host.example.org"
        store = self.dir / "workspace.env"
        store.write_text("BUILDANDDO_PH=%s\nDD_API_KEY=%s\n" % (capture_key(), datadog_key()), encoding="utf-8")
        recorder = Recorder()
        with mock.patch.dict(os.environ, {"POSTHOG_API_KEY": sentinel_key, "POSTHOG_HOST": sentinel_host,
                                          "CITADEL_WORKSPACE_ENV": str(store)}):
            block = self.publish(receipts()["ocn_journey_report"], credentials=None, transport=recorder)
        self.assertEqual(block["state"], "SENT")
        text = json.dumps(recorder.calls)
        self.assertNotIn(sentinel_key, text)
        self.assertNotIn(sentinel_host, text)
        with mock.patch.dict(os.environ, {"POSTHOG_API_KEY": sentinel_key}):
            fallback = self.publish(receipts()["ocn_journey_report"], credentials=None, transport=Recorder(),
                                    force=True)
        self.assertEqual(fallback["posthog"]["reason"], "NO_KEY:BUILDANDDO_PH")

    def test_the_store_beats_the_ambient_environment(self):
        stored, ambient = capture_key(), "_".join(("phc", "ambient" * 3))
        store = self.dir / "workspace.env"
        store.write_text("# the estate store\nBUILDANDDO_PH='%s'\n" % stored, encoding="utf-8")
        recorder = Recorder()
        with mock.patch.dict(os.environ, {"CITADEL_WORKSPACE_ENV": str(store), "BUILDANDDO_PH": ambient,
                                          "DD_API_KEY": datadog_key()}):
            block = self.publish(receipts()["ocn_journey_report"], credentials=None, transport=recorder)
        self.assertEqual(recorder.calls[0]["body"]["api_key"], stored)
        self.assertEqual(block["credentials"], {"BUILDANDDO_PH": "store", "DD_API_KEY": "environment",
                                                "DD_SITE": "absent"})
        self.assertNotIn(stored, json.dumps(block))

    def test_the_wrong_datadog_site_and_a_personal_capture_key_are_refused(self):
        recorder = Recorder()
        block = self.publish(receipts()["ocn_journey_report"], transport=recorder,
                             credentials=keys(DD_SITE="datadoghq.com", BUILDANDDO_PH="_".join(("phx", "x" * 20))))
        self.assertEqual(block["datadog"]["reason"], "SITE_NOT_ALLOWED")
        self.assertEqual(block["posthog"]["reason"], "KEY_SHAPE")
        self.assertEqual(recorder.calls, [])

    def test_the_ci_guard(self):
        recorder = Recorder()
        with mock.patch.dict(os.environ, {"GITLAB_CI": "true"}):
            self.assertEqual(self.publish(receipts()["ocn_journey_report"], transport=recorder)["reason"], "CI_GUARD")
            self.assertEqual(recorder.calls, [])
            with mock.patch.dict(os.environ, {"BUILDANDDO_OCN_TELEMETRY_ALLOW_CI": "1"}):
                self.assertEqual(self.publish(receipts()["ocn_journey_report"], transport=recorder)["state"], "SENT")

    def test_the_ip_marker_is_attached_after_the_gates(self):
        recorder = Recorder()
        plan = self.plan(receipts()["ocn_journey_report"])
        self.assertNotIn("$ip", json.dumps(plan.bodies))
        t.deliver(plan, mode="send", ledger_dir=self.ledger, credentials=keys(), transport=recorder, now=NOW)
        for call in recorder.calls[:2]:
            for event in call["body"]["batch"]:
                self.assertEqual(event["properties"]["$ip"], t.UNSPECIFIED_IP)
        self.assertEqual(recorder.calls[1]["body"]["batch"][0]["event"], "ocn_telemetry_control")
        self.assertNotEqual(recorder.calls[1]["body"]["api_key"], capture_key())
        self.assertIn("-", recorder.calls[1]["body"]["api_key"])


class FailureTests(Harness):
    def test_a_raising_transport_leaves_the_receipt_untouched(self):
        receipt = receipts()["ocn_journey_report"]
        original = copy.deepcopy(receipt)
        block = self.publish(receipt, transport=Recorder([TimeoutError("slow")] * 5))
        self.assertEqual(block["state"], "UNSENT")
        self.assertTrue(block["posthog"]["reason"].startswith("TRANSPORT:"))
        self.assertEqual(receipt, original)

    def test_a_publisher_error_never_raises(self):
        with mock.patch.object(t, "prepare", side_effect=RuntimeError("boom " + BOX)):
            block = self.publish(receipts()["ocn_journey_report"])
        self.assertEqual((block["state"], block["reason"]), ("UNSENT", "PUBLISHER_ERROR:RuntimeError"))
        self.assertNotIn(BOX, json.dumps(block))

    def test_the_budget_stops_requests_that_have_not_started(self):
        ticks = iter(range(0, 400, 4))
        block = self.publish(receipts()["ocn_journey_report"], transport=Recorder(), budget_s=10,
                             monotonic=lambda: float(next(ticks)))
        self.assertEqual(block["posthog"]["state"], "SENT")
        self.assertEqual(block["datadog"]["event"]["reason"], "BUDGET")
        self.assertEqual(block["datadog"]["logs"]["reason"], "BUDGET")
        self.assertIs(block["degraded"], True)

    def test_each_request_waits_at_most_three_seconds(self):
        recorder = Recorder()
        self.publish(receipts()["ocn_journey_report"], transport=recorder)
        self.assertTrue(all(0 < call["timeout"] <= 3.0 for call in recorder.calls))

    def test_a_repeat_is_a_ledger_duplicate_and_force_resends_the_same_uuids(self):
        first = Recorder()
        self.assertEqual(self.publish(receipts()["ocn_journey_report"], transport=first)["state"], "SENT")
        again = Recorder()
        block = self.publish(receipts()["ocn_journey_report"], transport=again)
        self.assertEqual(block["reason"], "LEDGER_DUPLICATE")
        self.assertEqual(again.calls, [])
        forced = Recorder()
        self.assertEqual(self.publish(receipts()["ocn_journey_report"], transport=forced, force=True)["state"], "SENT")
        uuids = [[event["uuid"] for event in recorder.calls[0]["body"]["batch"]] for recorder in (first, forced)]
        self.assertEqual(uuids[0], uuids[1])

    def test_the_ledger_holds_no_value_key_box_or_address(self):
        block = self.publish(receipts()["ocn_journey_report"], transport=Recorder())
        text = t.ledger_file(self.ledger, block["run_id"]).read_text(encoding="utf-8")
        for value in PLANTED + (capture_key(), datadog_key()):
            self.assertNotIn(value, text)
        self.assertIn(block["run_id"], text)

    def test_the_vendor_windows(self):
        two_hours = dict(receipts()["ocn_journey_report"], at="2026-09-24T10:01:00+00:00")
        plan = self.plan(two_hours, dd_metrics=True)
        self.assertEqual(plan.skipped["datadog.series"], "WINDOW")
        self.assertIn("datadog.logs", plan.bodies)
        stale = dict(receipts()["ocn_journey_report"], at="2026-09-23T17:00:00+00:00")
        recorder = Recorder()
        block = self.publish(stale, transport=recorder)
        self.assertEqual(block["datadog"]["reason"], "WINDOW")
        self.assertEqual(block["posthog"]["state"], "SENT")
        self.assertFalse([url for url in recorder.urls() if "datadoghq" in url])

    def test_an_identity_refusal_is_sent_nowhere(self):
        refused = {"schema": "buildanddo.ocn-seat-session/v1", "seat": BOX, "env": "staging", "at": AT,
                   "identity": {"state": "REFUSED", "code": "IDENTITY_CONFLICT", "detail": BOX, "sources": {}},
                   "login": "NOT_ATTEMPTED", "replay": []}
        recorder = Recorder()
        block = self.publish(refused, transport=recorder)
        self.assertEqual((block["state"], block["reason"]), ("UNSENT", "IDENTITY_REFUSED"))
        self.assertEqual(recorder.calls, [])
        self.assertFalse(self.ledger.exists())


class ReceiptParsingTests(Harness):
    def test_a_stream_an_indented_document_and_an_envelope(self):
        receipt = receipts()["ocn_feature_sweep"]
        line = json.dumps(receipt)
        self.assertEqual(t.extract_receipt("noise\n{not json\n" + line + "\n"), receipt)
        indented = "RECEIPT  state/ocn_feature_sweep/staging.latest.json\n" + json.dumps(receipt, indent=2)
        self.assertEqual(t.extract_receipt(indented), receipt)
        envelope = json.dumps({"ok": True, "stdout": "boot\n" + line + "\n", "exit_code": 0})
        self.assertEqual(t.extract_receipt(envelope), receipt)
        self.assertIsNone(t.extract_receipt("no receipt here"))

    def test_utf16_with_a_bom_is_read(self):
        receipt = receipts()["ocn_rbac_probe"]
        raw = json.dumps(receipt).encode("utf-16")
        self.assertEqual(t.extract_receipt(t.decode_bytes(raw)), receipt)

    def test_publish_prints_exactly_one_line_and_tee_carries_the_receipt(self):
        path = self.dir / "receipt.json"
        path.write_bytes(json.dumps(receipts()["ocn_mission_work"]).encode("utf-16"))
        out, err = io.StringIO(), io.StringIO()
        argv = ["publish", "--receipt", str(path), "--tee", "--fleet-map", str(self.fleet),
                "--ledger-dir", str(self.ledger)]
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = t.main(argv)
        self.assertEqual(code, 0)
        lines = out.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        document = json.loads(lines[0])
        self.assertEqual(document["ocn_telemetry"]["reason"], "DRY_RUN")
        self.assertEqual(document["created"], [RECORD])
        self.assertIn("ocn_telemetry: UNSENT (DRY_RUN)", err.getvalue())

    def test_strict_fails_a_dry_run_whose_gate_fails(self):
        path = self.dir / "receipt.json"
        path.write_text(json.dumps({"schema": "buildanddo.unknown/v1"}), encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(t.main(["publish", "--receipt", str(path), "--strict"]), 1)
            self.assertEqual(t.main(["publish", "--receipt", str(path)]), 0)

    def test_publishing_never_imports_the_deploy_rail_or_the_bridge(self):
        path = self.dir / "receipt.json"
        path.write_text(json.dumps(receipts()["ocn_journey_report"]), encoding="utf-8")
        program = ("import json, sys; sys.path.insert(0, %r); from scripts.ci import ocn_telemetry as t; "
                   "t.publish(json.load(open(%r)), mode='dry-run', fleet_map=%r, ledger_dir=%r, "
                   "stderr=open(__import__('os').devnull, 'w')); "
                   "print(json.dumps(sorted(m for m in sys.modules if 'ship' in m.split('.')[-1] "
                   "or 'data_dog' in m)))") % (str(ROOT), str(path), str(self.fleet), str(self.ledger))
        done = subprocess.run([sys.executable, "-c", program], cwd=ROOT, env=dict(os.environ), capture_output=True,
                              text=True, timeout=120)
        self.assertEqual(done.returncode, 0, done.stderr[-400:])
        self.assertEqual(json.loads(done.stdout.strip().splitlines()[-1]), [])


FAKE_PROBE = r'''
import json, os, sys
receipt = json.loads(%r)
if len(sys.argv) > 1 and sys.argv[1] == "selftest":
    print(json.dumps({"schema": receipt["schema"], "at": receipt["at"], "checks": [], "state": "PASS",
                      "passed": 1, "total": 1}, indent=2))
    sys.exit(0)
print("OCN feature sweep — a table line with a non-ASCII dash")
print(json.dumps(receipt, indent=2, ensure_ascii=False))
marker = os.environ.get("FAKE_PROBE_MARKER")
if marker:
    open(marker, "w").write("done")
sys.exit(3)
'''


class WrapperTests(Harness):
    def setUp(self) -> None:
        super().setUp()
        receipt = dict(receipts()["ocn_feature_sweep"], said_note="— " + BOX)
        self.probe = self.dir / "scripts" / "ci" / "ocn_feature_sweep.py"
        self.probe.parent.mkdir(parents=True)
        self.probe.write_text(FAKE_PROBE % json.dumps(receipt), encoding="utf-8")
        self.marker = self.dir / "marker"
        os.environ["FAKE_PROBE_MARKER"] = str(self.marker)

    def options(self, telemetry=None, **extra) -> argparse.Namespace:
        values = {"telemetry": telemetry, "sinks": t.SINKS, "probe": "", "expect": None, "dd_metrics": False,
                  "fleet_map": str(self.fleet), "ledger_dir": str(self.ledger)}
        values.update(extra)
        return argparse.Namespace(**values)

    def direct(self, *args: str) -> subprocess.CompletedProcess:
        environment = dict(os.environ, PYTHONIOENCODING="utf-8")
        return subprocess.run([sys.executable, str(self.probe), *args], env=environment, capture_output=True,
                              timeout=120)

    def wrapped(self, options, *args: str, publisher=None) -> tuple[int, bytes, str]:
        out, err = io.BytesIO(), io.StringIO()
        code = t.run_command(options, [str(self.probe), *args], stdout=out, stderr=err, publisher=publisher)
        return code, out.getvalue(), err.getvalue()

    def test_stdout_and_exit_code_are_the_probes_own_in_every_mode(self):
        direct = self.direct("sweep", "--json")
        self.assertEqual(direct.returncode, 3)
        failing = functools.partial(t.publish, transport=Recorder([(0, "TimeoutError", None)] * 5),
                                    credentials=keys(), now=NOW)
        for mode, publisher in (("off", None), ("dry-run", None), ("send", failing)):
            with self.subTest(mode=mode):
                code, out, err = self.wrapped(self.options(mode), "sweep", "--json", publisher=publisher)
                self.assertEqual(code, direct.returncode)
                self.assertEqual(out, direct.stdout)
                self.assertEqual(len([line for line in err.splitlines() if line.startswith("ocn_telemetry: ")]), 1)
        self.assertIn("ocn_telemetry: UNSENT (TRANSPORT:TimeoutError)", err)

    def test_off_by_default_never_calls_the_publisher(self):
        publisher = mock.Mock()
        code, _, err = self.wrapped(self.options(None), "sweep", "--json", publisher=publisher)
        self.assertEqual(code, 3)
        publisher.assert_not_called()
        self.assertIn("ocn_telemetry: UNSENT (DISABLED)", err)
        self.assertFalse(self.ledger.exists())

    def test_publishing_starts_only_after_the_probe_has_exited(self):
        seen = []

        def publisher(receipt, **options):
            seen.append(self.marker.exists())
            return t.publish(receipt, **options)

        code, _, err = self.wrapped(self.options("dry-run"), "sweep", "--json", publisher=publisher)
        self.assertEqual((code, seen), (3, [True]))
        self.assertIn("ocn_telemetry: UNSENT (DRY_RUN)", err)

    def test_a_selftest_is_never_published(self):
        publisher = mock.Mock()
        code, _, err = self.wrapped(self.options("send"), "selftest", publisher=publisher)
        self.assertEqual(code, 0)
        publisher.assert_not_called()
        self.assertIn("NOT_PUBLISHABLE", err)

    def test_an_interrupted_probe_publishes_nothing(self):
        class Child:
            returncode = 130
            stdout = mock.Mock(read1=mock.Mock(side_effect=KeyboardInterrupt))

            def communicate(self):
                return b"rest", None

        publisher = mock.Mock()
        out = io.BytesIO()
        with mock.patch.object(t.subprocess, "Popen", return_value=Child()):
            code = t.run_command(self.options("send"), [str(self.probe), "sweep"], stdout=out, stderr=io.StringIO(),
                                 publisher=publisher)
        self.assertEqual(code, 130)
        self.assertEqual(out.getvalue(), b"rest")
        publisher.assert_not_called()

    def test_the_command_line_passes_the_exit_code_through(self):
        environment = {key: value for key, value in os.environ.items()}
        done = subprocess.run([sys.executable, str(SCRIPT), "run", "--", str(self.probe), "sweep", "--json"],
                              env=environment, capture_output=True, timeout=120)
        self.assertEqual(done.returncode, 3)
        self.assertEqual(done.stdout, self.direct("sweep", "--json").stdout)
        self.assertIn(b"ocn_telemetry: UNSENT (DISABLED)", done.stderr)


class PublicSourceTests(unittest.TestCase):
    MACHINE = re.compile(r"\b(ray-[a-z]{3}\d+-\d+|mesh-[a-z]+|kvm\d+|rig\d+)\b", re.I)
    IPV4 = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")

    def test_the_module_and_this_test_name_no_machine_and_no_address(self):
        for path in (SCRIPT, Path(__file__)):
            with self.subTest(path=path.name):
                source = path.read_text(encoding="utf-8")
                self.assertIsNone(self.MACHINE.search(source))
                self.assertIsNone(self.IPV4.search(source))
                self.assertEqual(pr.Rule("").find_leaks(source, allow_loopback=True), {"ips": [], "machines": []})

    def test_the_check_is_not_vacuous(self):
        self.assertIsNotNone(self.MACHINE.search("SEATS = {%r: 1}" % BOX))
        self.assertIsNotNone(self.IPV4.search("egress " + ADDRESS))
        self.assertTrue(pr.Rule("").find_leaks("from " + BOX + " at " + ADDRESS)["machines"])


if __name__ == "__main__":
    unittest.main()
