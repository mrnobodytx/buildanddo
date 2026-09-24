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
import ipaddress
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import threading
import time
import types
import unittest
import urllib.error
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
SESSION = "0f0e0d0c-0b0a-4908-8706-050403020100"
# A PocketBase id with no digit, as about one in 130 are: the label id pattern needs a digit.
DIGITLESS = "mqzrtplkvbnwxyc"
# A word planted in the free-text fields (said, why, message): nothing masks it, so it shows prose copied
# into a label even where masking would hide the names and addresses in that prose.
PROSE = "quokka" + "prose"
PLANTED = (BOX, ALIAS, BOX_TWO, BOX_UNPLACED, ADDRESS, EGRESS, EMAIL, RECORD, "forum.example.org", SESSION,
           DIGITLESS, PROSE)
# The probes that take --env and never record it: their receipts publish only with an env named.
NO_ENV = frozenset({"ocn_guild_dogfood", "ocn_mission_work", "ocn_room_probe"})
KEEP = ("SYSTEMROOT", "WINDIR", "PATH", "PATHEXT", "COMSPEC", "TEMP", "TMP")

_GUARDS: list = []
_ATTEMPTS: list = []


def setUpModule() -> None:  # noqa: N802 - unittest's name
    """Every way out of this process refuses, and each attempt is recorded. The publisher's own transport
    turns a refusal into an ordinary dead hop, so only the record shows that something tried."""
    def refuse(*_args, **_kwargs):
        _ATTEMPTS.append("socket")
        raise OSError("network is forbidden in this test module")

    for target in ("socket.socket.connect", "socket.socket.connect_ex", "socket.create_connection",
                   "socket.getaddrinfo"):
        patcher = mock.patch(target, side_effect=refuse)
        patcher.start()
        _GUARDS.append(patcher)


def tearDownModule() -> None:  # noqa: N802
    while _GUARDS:
        _GUARDS.pop().stop()
    if _ATTEMPTS:
        raise AssertionError("%d network attempt(s) during the telemetry tests" % len(_ATTEMPTS))


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
            "session_id": SESSION, "distinct_id": "ocn:" + BOX, "at": AT,
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
                        "said": "workspace of " + BOX + " " + EMAIL + " " + PROSE},
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
                      "why": "400 from " + BOX + " " + PROSE}],
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
                        "http": 409, "stage": "call", "outcome": "CONTRACT_BROKEN", "message": EMAIL + " " + PROSE},
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
                        "http": 404, "outcome": "AS_EXPECTED", "message": EMAIL + " " + PROSE}],
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
                       {"check": "concurrent-enqueue", "box": BOX + "+" + BOX_TWO, "expect": "exactly one winner",
                        "http": 200, "stage": "call", "outcome": "AS_EXPECTED", "message": ""},
                       {"check": "non-member-refused", "box": BOX_TWO, "expect": "403/404", "http": 403,
                        "stage": "call", "outcome": "AS_EXPECTED", "message": "member " + EMAIL + " " + PROSE}],
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
                      {"step": "CONTROL skip approval (refusal wanted)", "http": 400, "message": BOX + " " + PROSE,
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
                       "message": "said by " + BOX + " " + PROSE}],
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
                       "message": "by " + EMAIL + " " + PROSE}],
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
                        "path": "/api/collections/missions/records/" + DIGITLESS, "http": 403,
                        "state": "REFUSED_BY_POLICY", "message": EMAIL + " " + PROSE, "fields": ["status"]},
                       {"subsystem": "suite", "check": "suite with empty body (contract)", "method": "POST",
                        "path": "/api/buildanddo/workspaces/%s/suite" % RECORD, "http": 418,
                        "state": "HTTP_418", "message": None, "fields": None}],
            "summary": {"checks": 3, "route_absent": 0, "ok": 0, "refused_or_contract": 1,
                        "dependency_missing": 0, "transport_fault": 0}},
    }


def dogfood(action: str, **fields) -> dict:
    """A guild_dogfood receipt for one action, shaped like the probe's own output for it."""
    receipt = {"schema": "buildanddo.ocn-guild-dogfood/v1", "seat": BOX, "guild": "builder", "action": action,
               "workspace": RECORD, "at": AT, "login": "OK", "uid": RECORD}
    receipt.update(fields)
    return receipt


def dogfood_actions() -> dict[str, dict]:
    """Every dogfood branch the adapter reads, with private values in the fields it must not copy."""
    return {
        "sprint": dogfood("sprint", proposed=[RECORD], missions=[
            {"guild": "builder", "http": 403, "headline": "raised by " + EMAIL + " on " + BOX, "state": "REFUSED",
             "message": "refused for " + EMAIL + " from " + ADDRESS + " " + PROSE,
             "fields": {"title": "too long: " + EMAIL}},
            {"guild": "research", "http": 200, "headline": "from " + BOX, "mission": RECORD, "state": "PROPOSED"},
            {"guild": "guild of " + BOX, "http": 200, "headline": "x", "mission": RECORD, "state": "PROPOSED"}]),
        "promote": dogfood("promote", signals=[RECORD], promoted=[
            {"n": 1, "short": "from " + EMAIL, "evidence": RECORD, "signal": RECORD, "signal_http": 201},
            {"n": 2, "short": BOX, "evidence": RECORD, "signal": None, "signal_http": 400, "message": EMAIL,
             "fields": {"title": ADDRESS}}]),
        "verify": dogfood("verify", mission=RECORD, verified={
            "mission_readable": True, "mission_running": False, "mission_has_approval": True,
            "signals_bound_to_mission": 2, "signals_whose_evidence_names_a_source": 1}),
        "cleanup": dogfood("cleanup", removed=[{"id": RECORD, "http": 204}, {"id": RECORD, "http": 404}]),
        "inventory": dogfood("inventory", inventory={
            "missions": {"total": 2, "items": [{"id": RECORD, "owner": RECORD, "label": "by " + EMAIL}]},
            "wiki_pages": {"http": 403}}),
        "login-failed": dogfood("workload", login="FAILED"),
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
        # into this directory, so no test can read the workstation's real ones. The PostHog precondition
        # reads as landed here; PostHogPreconditionTests take it away.
        kept = {name: os.environ[name] for name in KEEP if os.environ.get(name)}
        kept.update({"CITADEL_WORKSPACE_ENV": str(self.dir / "no-store.env"), "CITADEL_FLEET_MAP": str(self.fleet),
                     "BUILDANDDO_OCN_TELEMETRY_POSTHOG": "1"})
        patcher = mock.patch.dict(os.environ, kept, clear=True)
        patcher.start()
        self.addCleanup(patcher.stop)

    def plan(self, receipt: dict, **options) -> t.Plan:
        options.setdefault("fleet_map", self.fleet)
        options.setdefault("now", NOW)
        if t.detect_probe(receipt) in NO_ENV:
            options.setdefault("env", "staging")
        return t.prepare(receipt, **options)

    def publish(self, receipt: dict, mode: str = "send", **options) -> dict:
        options.setdefault("fleet_map", self.fleet)
        options.setdefault("ledger_dir", self.ledger)
        options.setdefault("now", NOW)
        options.setdefault("stderr", io.StringIO())
        if t.detect_probe(receipt) in NO_ENV:
            options.setdefault("env", "staging")
        if mode == "send":
            options.setdefault("credentials", keys())
        return t.publish(receipt, mode=mode, **options)

    def assert_clean(self, plan: t.Plan) -> None:
        """No planted value reaches an outbound body, as written or as slug() would rewrite it."""
        text = json.dumps(plan.bodies)
        for index, value in enumerate(PLANTED):
            self.assertFalse(value in text, "planted value %d reached an outbound body" % index)
            self.assertFalse(t.slug(value) in text, "planted value %d reached an outbound body slugged" % index)


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

    def test_project_races_are_the_probes_own_checks_and_labels(self):
        receipt = receipts()["ocn_project_fleet"]
        view = self.plan(receipt).view
        races = {c["id"]: c for c in view["checks"] if c["kind"] == "race"}
        self.assertEqual(list(races), ["concurrent-enqueue"])
        self.assertEqual(races["concurrent-enqueue"]["state"], "MUTUAL_EXCLUSION_HELD")
        self.assertIs(races["concurrent-enqueue"]["as_expected"], True)
        self.assertEqual(view["labels"], {"ocn_race_enqueue": "MUTUAL_EXCLUSION_HELD", "ocn_race_claim": "UNMEASURED"})
        self.assertIs([c for c in view["checks"] if c["id"] == "non-member-refused"][0]["is_control"], True)
        # One check per row the probe recorded, never a second one per race.
        self.assertEqual(view["counts"]["checks_total"], len(receipt["checks"]))

    def test_a_double_claim_counts_once(self):
        receipt = copy.deepcopy(receipts()["ocn_project_fleet"])
        receipt.update(state="CONTRACT_BROKEN", contract_broken=["concurrent-enqueue"],
                       race={"verdict": "DOUBLE_CLAIM", "why": "x", "winners": [BOX, BOX_TWO]})
        receipt["checks"][1].update(http=0, outcome="CONTRACT_BROKEN")
        view = self.plan(receipt).view
        self.assertEqual((view["outcome"], view["counts"]["checks_failed"]), ("fail", len(receipt["contract_broken"])))
        self.assertEqual([(c["id"], c["state"]) for c in view["checks"] if c["as_expected"] is False],
                         [("concurrent-enqueue", "DOUBLE_CLAIM")])

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

    def test_failure_shapes_follow_each_probe(self):
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

    def void_sweep(self, state: str = "VOID") -> dict:
        """The SPA fallback: every route answers 200, both controls with it, so the sweep is VOID."""
        sweep = copy.deepcopy(receipts()["ocn_feature_sweep"])
        for row in sweep["checks"][:2]:
            row.update(http=200, state="OK", alive=False)
        if state != "VOID":
            for row in sweep["checks"][:2]:
                row.update(alive=True)
        sweep.update(state=state, controls_held=state != "VOID", broken=[] if state == "VOID" else ["workspace.admin"],
                     degraded=[])
        return sweep

    def test_a_void_sweep_judges_only_the_controls_that_voided_it(self):
        plan = self.plan(self.void_sweep(), dd_metrics=True)
        view = plan.view
        self.assertEqual(view["outcome"], "void")
        self.assertEqual([c["id"] for c in view["checks"] if c["as_expected"] is False],
                         ["control.absent-route", "control.unauthenticated"])
        self.assertEqual([c["as_expected"] for c in view["checks"] if not c["is_control"]], [None, None])
        self.assertEqual(view["counts"]["checks_failed"], 2)
        self.assertIn("Failing checks: control.absent-route, control.unauthenticated\n",
                      plan.bodies["datadog.event"]["text"])
        statuses = [record["status"] for record in plan.bodies["datadog.logs"]]
        self.assertEqual(statuses, ["warn", "error", "error", "info", "info"])
        self.assertEqual([s["metric"] for s in plan.bodies["datadog.series"]], [t.METRIC_MEASURED])
        # The control for this test: the same rows on a run whose controls held are judged.
        held = self.plan(self.void_sweep("REPAIR_NEEDED")).view
        self.assertEqual([c["as_expected"] for c in held["checks"] if not c["is_control"]], [False, True])

    def test_a_void_walk_judges_only_its_controls(self):
        walk = copy.deepcopy(receipts()["ocn_journey_report"])
        for row in walk["legs"][:2]:
            row.update(http=200, verdict="BROKEN")
        walk.update(state="VOID", controls_held=False, defects=[])
        plan = self.plan(walk)
        self.assertEqual(plan.view["counts"]["checks_failed"], 2)
        self.assertEqual([c["as_expected"] for c in plan.view["checks"]], [False, False, None])
        judged = [event["properties"].get("ocn_as_expected") for event in plan.bodies["posthog.batch"][1:]]
        self.assertEqual(judged, [False, False, None])
        walked = self.plan(dict(walk, state="DEFECTS", controls_held=True)).view
        self.assertIs(walked["checks"][2]["as_expected"], False)

    def test_a_probe_that_never_records_its_env_needs_one(self):
        self.assertEqual({name for name, probe in t.PROBES.items() if not probe.env_default}, NO_ENV)
        for name in sorted(NO_ENV):
            with self.subTest(probe=name):
                source = (ROOT / "scripts" / "ci" / (name + ".py")).read_text(encoding="utf-8")
                self.assertIn('add_argument("--env"', source)
                self.assertNotIn('"env":', source)
                receipt = receipts()[name]
                with self.assertRaises(t.Unsent) as refused:
                    self.plan(receipt, env=None)
                self.assertEqual(refused.exception.reason, "NO_ENV")
                self.assertEqual(self.publish(receipt, mode="dry-run", env=None)["reason"], "NO_ENV")
                self.assertEqual(self.plan(receipt, env="production").view["env"], "production")
        for name in ("ocn_rbac_probe", "ocn_box_exercise"):
            self.assertEqual(self.plan(receipts()[name]).view["env"], "staging")

    def test_a_request_that_got_no_answer_is_a_transport_fault(self):
        for name in ("ocn_guild_forum", "ocn_room_probe"):
            for code, state in ((0, "TRANSPORT_FAULT"), (None, "TRANSPORT_FAULT"), (403, "REFUSED"),
                                (502, "SERVER_ERROR"), (201, "ACCEPTED")):
                with self.subTest(probe=name, http=code):
                    view = self.plan(dict(receipts()[name], result={"http": code, "err": "URLError"})).view
                    self.assertEqual((view["state"], view["outcome"]), (state, "pass" if code == 201 else "fail"))

    def test_only_known_score_and_collection_names_become_property_names(self):
        seat = copy.deepcopy(receipts()["ocn_seat_session"])
        seat["perception"]["score"].update({BOX: 1, ADDRESS: 2, EMAIL: 3})
        inventory = dict(receipts()["ocn_guild_dogfood"],
                         inventory={"missions": {"total": 3}, BOX: {"total": 1}, ADDRESS: {"http": 403}})
        for receipt in (seat, inventory):
            text = json.dumps(self.plan(receipt).bodies)
            for value in (BOX, ADDRESS, EMAIL):
                # The rewrite the old key handling made: every character outside [a-z0-9_] became "_".
                self.assertNotIn(re.sub(r"[^a-z0-9_]", "_", value.lower()), text)
        run = self.plan(seat).bodies["posthog.batch"][0]["properties"]
        self.assertEqual({name for name in run if name.startswith("perc_")}, {
            "perc_reachable_routes", "perc_reachable_routes_total", "perc_median_latency_ms",
            "perc_prerendered_text_chars", "perc_persona_vocabulary_hits_count", "perc_persona_vocabulary_coverage",
            "perc_persona_vocabulary_coverage_total", "perc_data_endpoints_ok", "perc_data_endpoints_total",
            "perc_observation_count"})
        plan = self.plan(inventory)
        run = plan.bodies["posthog.batch"][0]["properties"]
        self.assertEqual({name for name in run if name.startswith("ocn_inventory_")}, {"ocn_inventory_missions"})
        self.assertEqual([c["id"] for c in plan.view["checks"] if c["kind"] == "collection"],
                         ["inventory.missions", "inventory.other", "inventory.other"])

    def test_the_allowlists_are_the_names_the_probes_write(self):
        seat = t._sibling("ocn_seat_session")
        score = seat.perceive("seat-alpha", {"persona": "Forge", "guild": "builder", "lens": "x"},
                              [{"route": "/", "status": 200, "ms": 5, "text": "build"}], [])["score"]
        self.assertEqual(set(score), set(t.PERCEPTION_SCORES))
        from scripts.ci import ocn_guild_dogfood

        out: dict = {}
        with mock.patch.object(ocn_guild_dogfood, "http", return_value=(200, {"items": [], "totalItems": 0})):
            ocn_guild_dogfood.inventory("root", {}, argparse.Namespace(workspace="w"), out)
        self.assertEqual(set(out["inventory"]), t.INVENTORY_COLLECTIONS)

    def test_reason_prose_becomes_a_bounded_code(self):
        table = {"no ssh key for " + BOX: "NO_SSH_KEY", "ssh timeout after 12s": "SSH_TIMEOUT",
                 BOX + " is not in the fleet map at x": "NOT_IN_FLEET_MAP", "sign failed: " + EMAIL: "SIGN_FAILED",
                 "could not sign in: 403": "LOGIN_FAILED", "login refused": "LOGIN_FAILED",
                 "something else from " + ADDRESS: "OTHER", "": "", None: ""}
        for reason, code in table.items():
            self.assertEqual(t.reason_code("UNMEASURED", reason), code)
        self.assertEqual(t.reason_code("VOID", "anything at all"), "CONTROLS_FAILED")

    def test_reason_prose_and_list_items_never_leave_as_text(self):
        sweep = dict(receipts()["ocn_feature_sweep"], state="UNMEASURED", reason="seat " + EMAIL + " record " + RECORD,
                     broken=["workspace.admin", RECORD, BOX], degraded=[ADDRESS])
        plan = self.plan(sweep)
        self.assertEqual(plan.view["reason_code"], "OTHER")
        self.assertEqual(plan.view["lists"]["ocn_broken"], ["workspace.admin", "id", "box"])
        self.assertEqual(plan.view["lists"]["ocn_degraded"], ["addr"])
        self.assert_clean(plan)

    def test_every_dogfood_action_is_read_by_allowlist(self):
        expected = {
            "sprint": [("sprint.builder", 403, "REFUSED", None), ("sprint.research", 200, "PROPOSED", None),
                       ("sprint.other", 200, "PROPOSED", None)],
            "promote": [("proposal.1", 201, None, True), ("proposal.2", 400, None, False)],
            "verify": [("verify.mission_readable", None, None, True), ("verify.mission_running", None, None, False),
                       ("verify.mission_has_approval", None, None, True)],
            "cleanup": [("cleanup.1", 204, None, True), ("cleanup.2", 404, None, False)],
            "inventory": [("inventory.missions", 200, None, None), ("inventory.wiki_pages", 403, None, None)],
            "login-failed": []}
        for action, receipt in dogfood_actions().items():
            with self.subTest(action=action):
                plan = self.plan(receipt)
                self.assertEqual([(c["id"], c["http"], c["state"], c["as_expected"]) for c in plan.view["checks"]],
                                 expected[action])
                self.assertEqual(plan.view["outcome"], "fail" if action == "login-failed" else "observed")
                self.assert_clean(plan)
        verified = self.plan(dogfood_actions()["verify"]).view["measures"]
        self.assertEqual((verified["ocn_signals_bound_to_mission"],
                          verified["ocn_signals_whose_evidence_names_a_source"]), (2, 1))

    def test_a_box_exercise_probe_reads_its_control_and_collections(self):
        probe = {"seat": BOX, "mode": "probe", "at": AT,
                 "login": {"state": "LOGIN_OK", "record_id": RECORD, "name": "OCN seat " + BOX},
                 "control_absent_collection": 404,
                 "authenticated_reads": {"missions": {"http": 200, "items": 3},
                                         "evidence": {"http": 403, "items": None}}}
        plan = self.plan(probe)
        self.assertEqual([(c["id"], c["kind"], c["http"], c["as_expected"]) for c in plan.view["checks"]],
                         [("login", "login", None, True), ("control.absent-collection", "control", 404, True),
                          ("collection.missions", "collection", 200, None),
                          ("collection.evidence", "collection", 403, None)])
        self.assertIs(plan.view["controls_held"], True)
        self.assert_clean(plan)
        self.assertIs(self.plan(dict(probe, control_absent_collection=200)).view["controls_held"], False)
        refused = self.plan(dict(probe, login={"state": "LOGIN_403"})).view
        self.assertEqual((refused["outcome"], refused["reason_code"], refused["checks"][0]["http"]),
                         ("fail", "LOGIN_FAILED", 403))


# The receipt fields each adapter turns into a check label, a list entry or a path template.
LABEL_FIELDS = {
    "ocn_feature_sweep": (("checks", "feature"), ("checks", "path")),
    "ocn_journey_report": (("legs", "leg"), ("defects", "leg")),
    "ocn_classroom_fleet": (("checks", "check"),), "ocn_classroom_live": (("checks", "check"),),
    "ocn_project_fleet": (("checks", "check"),),
    "ocn_guild_dogfood": (("steps", "step"),), "ocn_mission_lifecycle": (("steps", "step"),),
    "ocn_signal_lifecycle": (("steps", "step"),), "ocn_box_exercise": (("steps", "step"),),
    "ocn_subsystem_probe": (("checks", "subsystem"), ("checks", "check"), ("checks", "path")),
    "ocn_seat_session": (("replay", "route"), ("replay", "path"), ("replay", "collection")),
}
LIST_FIELDS = {"ocn_feature_sweep": ("broken", "degraded", "record_missing")}


def with_email_in_labels(name: str, receipt: dict) -> dict:
    """The receipt with an email added to every field its adapter turns into a label, list entry or path."""
    receipt = copy.deepcopy(receipt)
    for key, field in LABEL_FIELDS.get(name, ()):
        for row in receipt.get(key) or []:
            if isinstance(row.get(field), str):
                row[field] += " by " + EMAIL
    for key in LIST_FIELDS.get(name, ()):
        receipt[key] = list(receipt.get(key) or []) + ["from " + EMAIL]
    if name == "ocn_box_exercise":
        receipt["authenticated_reads"] = {"reads by " + EMAIL: {"http": 200}}
    return receipt


# Each probe's own rule, applied to the receipt receipts() shapes like its real output.
EXPECTED_OUTCOME = {
    "ocn_box_exercise": "observed", "ocn_classroom_fleet": "fail", "ocn_classroom_live": "pass",
    "ocn_content_assessment": "observed", "ocn_feature_sweep": "fail", "ocn_guild_dogfood": "observed",
    "ocn_guild_forum": "pass", "ocn_journey_report": "degraded", "ocn_mission_lifecycle": "pass",
    "ocn_mission_work": "pass", "ocn_observation_record": "pass", "ocn_project_fleet": "pass",
    "ocn_rbac_probe": "observed", "ocn_room_probe": "pass", "ocn_seat_session": "pass",
    "ocn_signal_lifecycle": "fail", "ocn_subsystem_probe": "observed"}


class PerAdapterTests(Harness):
    """One test per adapter, each fed a receipt shaped like that probe's real output with private
    values planted in every field the adapter must not copy."""

    def adapt(self, name: str) -> dict:
        """The contract every adapter shares; returns the view for the probe-specific assertion."""
        receipt = receipts()[name]
        self.assertEqual(t.detect_probe(receipt), name)
        plan = self.plan(receipt, dd_metrics=True)
        self.assertEqual((plan.view["probe"], plan.view["outcome"]), (name, EXPECTED_OUTCOME[name]))
        self.assertTrue(plan.view["checks"])
        self.assert_clean(plan)
        self.assertEqual(t.tag_gate(plan.bodies, plan.cat), [])
        self.assertEqual(t.leak_gate(plan.bodies, plan.rule)["state"], "PASS")
        # The same receipt with an email in every field that becomes a label or a path.
        self.assert_clean(self.plan(with_email_in_labels(name, receipt), dd_metrics=True))
        return plan.view

    def test_the_table_covers_every_probe(self):
        self.assertEqual(set(EXPECTED_OUTCOME), set(t.PROBES))

    def test_the_email_is_really_planted_in_every_label_field(self):
        # The control for the label check in adapt(): a field list that planted nothing would pass.
        for name in LABEL_FIELDS:
            with self.subTest(probe=name):
                planted = json.dumps(with_email_in_labels(name, receipts()[name]))
                self.assertGreater(planted.count(EMAIL), json.dumps(receipts()[name]).count(EMAIL))

    def test_box_exercise(self):
        self.assertIs(self.adapt("ocn_box_exercise")["controls_held"], True)

    def test_classroom_fleet(self):
        self.assertEqual(self.adapt("ocn_classroom_fleet")["counts"]["checks_failed"], 1)

    def test_classroom_live(self):
        self.assertEqual(self.adapt("ocn_classroom_live")["actor"]["personas"], ["alex", "forge", "oracle"])

    def test_content_assessment(self):
        self.assertEqual(self.adapt("ocn_content_assessment")["measures"]["ocn_stable"], 1)

    def test_feature_sweep(self):
        self.assertEqual(self.adapt("ocn_feature_sweep")["lists"]["ocn_broken"], ["workspace.admin"])

    def test_guild_dogfood(self):
        self.assertEqual(self.adapt("ocn_guild_dogfood")["labels"]["ocn_action"], "workload")

    def test_guild_forum(self):
        self.assertEqual(self.adapt("ocn_guild_forum")["checks"][0]["id"], "command.forum.reply")

    def test_journey_report(self):
        self.assertEqual(self.adapt("ocn_journey_report")["env"], "production")

    def test_mission_lifecycle(self):
        self.assertEqual(self.adapt("ocn_mission_lifecycle")["state"], "REACHED_VERIFIED")

    def test_mission_work(self):
        self.assertEqual(self.adapt("ocn_mission_work")["measures"]["ocn_created"], 1)

    def test_observation_record(self):
        self.assertEqual(self.adapt("ocn_observation_record")["state"], "CHAIN_INTACT")

    def test_project_fleet(self):
        self.assertEqual(self.adapt("ocn_project_fleet")["measures"]["ocn_distinct_public_ips"], 2)

    def test_rbac_probe(self):
        self.assertEqual(self.adapt("ocn_rbac_probe")["checks"][0]["id"], "op.read_ws")

    def test_room_probe(self):
        self.assertEqual(self.adapt("ocn_room_probe")["checks"][0]["id"], "command.room.join")

    def test_seat_session(self):
        self.assertEqual(self.adapt("ocn_seat_session")["actor"]["persona"], "forge")

    def test_signal_lifecycle(self):
        self.assertIs(self.adapt("ocn_signal_lifecycle")["controls_held"], False)

    def test_subsystem_probe(self):
        self.assertEqual(self.adapt("ocn_subsystem_probe")["checks"][2]["state"], "http_other")


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

    def test_a_record_id_is_an_id_whether_or_not_it_has_a_digit(self):
        rule = self.rule()
        for record in (DIGITLESS, RECORD):
            with self.subTest(digits=record != DIGITLESS):
                self.assertEqual(t.path_template("/api/collections/missions/records/" + record, rule),
                                 "/api/collections/missions/records/:id")
        listing = "/api/collections/missions/records"
        self.assertEqual(t.path_template(listing, rule), listing)

    def test_an_email_becomes_email_before_anything_is_slugged(self):
        rule = self.rule()
        pattern = t.catalogue().persona_pattern
        email = "alice.smith" + "@" + "example.org"
        self.assertEqual(t.check_label("reply from " + email, rule, pattern), "reply-from-email")
        self.assertEqual(t.path_template("/api/users/" + email + "/x", rule), "/api/users/:email/x")
        for text in (t.check_label("reply from " + email, rule, pattern), t.path_template("/u/" + email, rule)):
            self.assertNotIn("alice", text)
            self.assertNotIn("example.org", text)

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

    def test_the_leak_gate_reads_the_private_map(self):
        # A name only the private map knows: it matches no public family, so a gate that fell back to the
        # families would pass it.
        private = "node" + "-" + "sample"
        self.assertEqual(pr.Rule("").find_machines(private), [])
        fleet = json.loads(self.fleet.read_text(encoding="utf-8"))
        fleet["boxes"][private] = {"guildmaster": "forge", "guild": "builder"}
        self.fleet.write_text(json.dumps(fleet), encoding="utf-8")
        plan = self.plan(receipts()["ocn_journey_report"])
        plan.bodies["datadog.logs"][0]["message"] += " via " + private
        recorder = Recorder()
        block = t.deliver(plan, mode="send", ledger_dir=self.ledger, credentials=keys(), transport=recorder, now=NOW)
        self.assertEqual((block["reason"], recorder.calls), ("LEAK_GATE", []))
        self.assertEqual(block["gates"]["leak_counts"]["machines"], 1)
        self.assertNotIn(private, json.dumps(block))

    def test_the_leak_gate_withholds_an_email(self):
        plan = self.plan(receipts()["ocn_journey_report"])
        plan.bodies["posthog.batch"][1]["properties"]["ocn_check"] = "reply-from-" + EMAIL
        recorder = Recorder()
        block = t.deliver(plan, mode="send", ledger_dir=self.ledger, credentials=keys(), transport=recorder, now=NOW)
        self.assertEqual((block["reason"], recorder.calls), ("LEAK_GATE", []))
        self.assertEqual(block["gates"]["leak_counts"], {"ips": 0, "machines": 0, "emails": 1})
        self.assertIn("body.posthog.batch[].properties.ocn_check", block["gates"]["leak_fields"])
        self.assertNotIn(EMAIL, json.dumps(block))

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

    def test_every_tag_gate_rule_refuses_its_shape(self):
        clean = self.plan(receipts()["ocn_feature_sweep"], dd_metrics=True)
        self.assertEqual(t.tag_gate(clean.bodies, clean.cat), [])
        alive = next(index for index, item in enumerate(clean.bodies["datadog.series"])
                     if item["metric"] == t.METRIC_ALIVE)
        other = next(index for index, item in enumerate(clean.bodies["datadog.series"])
                     if item["metric"] != t.METRIC_ALIVE)

        # (the problem the gate must report, where the shape goes, the key it sets or the tag it adds, value)
        cases = [
            ("datadog.event: ocn_run is not a run id", ("datadog.event",), "tags", ["ocn_run:not-a-run"]),
            ("datadog.event: carries a host", ("datadog.event",), "host", "x"),
            ("datadog.event: tag key outside the allowed set", ("datadog.event",), "tags", ["untagged"]),
            ("datadog.logs: carries a hostname", ("datadog.logs", 0), "hostname", "x"),
            ("datadog.logs: carries a hostname", ("datadog.logs", 1), "host", "x"),
            ("datadog.series: carries a resource or host", ("datadog.series", 0), "resources", [{"type": "host"}]),
            ("datadog.series: carries a resource or host", ("datadog.series", 0), "host", "x"),
            ("datadog.series: metric outside the catalogue", ("datadog.series", 0), "metric", "buildanddo.ocn.x"),
            ("datadog.series: tag key outside the allowed set", ("datadog.series", other), "tags",
             ["ocn_feature:" + clean.cat.features[0]]),
            ("datadog.series: ocn_feature value outside its enum", ("datadog.series", alive), "tags",
             ["ocn_feature:not-a-feature"]),
        ]
        for problem, where, key, value in cases:
            with self.subTest(problem=problem, key=key):
                bodies = copy.deepcopy(clean.bodies)
                target = bodies[where[0]] if len(where) == 1 else bodies[where[0]][where[1]]
                if key == "tags" and where[0] == "datadog.event" and value[0].startswith("ocn_run:"):
                    target["tags"] = [tag for tag in target["tags"] if not tag.startswith("ocn_run:")] + value
                elif key == "tags":
                    target["tags"] = target["tags"] + value
                else:
                    target[key] = value
                self.assertIn(problem, t.tag_gate(bodies, clean.cat))
        with mock.patch.object(t, "SERIES_CEILING", 100):
            self.assertIn("datadog.series: the catalogue exceeds 100 series", t.tag_gate(clean.bodies, clean.cat))

    def test_an_env_outside_the_two_is_refused_even_for_posthog_alone(self):
        # No Datadog tag carries the env on a PostHog-only send, so the tag gate would never see it.
        recorder = Recorder()
        block = self.publish(dict(receipts()["ocn_journey_report"], env="staging-2"), sinks=("posthog",),
                             transport=recorder)
        self.assertEqual((block["reason"], recorder.calls), ("TAG_GATE", []))

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

    def test_the_switch_set_to_off_vetoes_every_flag(self):
        with mock.patch.dict(os.environ, {"BUILDANDDO_OCN_TELEMETRY": "off"}):
            self.assertEqual([t.switch_mode(mode) for mode in ("send", "dry-run", None)], ["off"] * 3)
            self.assertEqual(t.switch_mode(None, default="dry-run"), "off")
            recorder = Recorder()
            block = self.publish(receipts()["ocn_journey_report"], mode="send", transport=recorder)
        self.assertEqual((block["state"], block["reason"], recorder.calls), ("UNSENT", "DISABLED", []))
        self.assertFalse(self.ledger.exists())
        # The control: the same flag sends once the switch no longer says off.
        self.assertEqual(self.publish(receipts()["ocn_journey_report"], mode="send", transport=Recorder())["state"],
                         "SENT")

    def test_publish_without_a_mode_follows_the_switch(self):
        path = self.dir / "receipt.json"
        path.write_text(json.dumps(receipts()["ocn_journey_report"]), encoding="utf-8")

        def publish(switch: str | None) -> dict:
            environment = {"BUILDANDDO_OCN_TELEMETRY": switch} if switch else {}
            out = io.StringIO()
            with mock.patch.dict(os.environ, environment), contextlib.redirect_stdout(out), \
                    contextlib.redirect_stderr(io.StringIO()):
                t.main(["publish", "--receipt", str(path), "--fleet-map", str(self.fleet),
                        "--ledger-dir", str(self.ledger)])
            return json.loads(out.getvalue())

        off = publish("off")
        self.assertEqual((off["mode"], off["reason"]), ("off", "DISABLED"))
        self.assertFalse(self.ledger.exists())
        # With the switch unset, publish is a dry run; with it set, the switch decides. No key is in this
        # environment, so a send stops at NO_KEY before any request.
        self.assertEqual((publish(None)["mode"], publish("dry-run")["reason"]), ("dry-run", "DRY_RUN"))
        sent = publish("send")
        self.assertEqual((sent["mode"], sent["posthog"]["reason"]), ("send", "NO_KEY:BUILDANDDO_PH"))

    def test_posthog_waits_for_the_operators_acknowledgement(self):
        store = self.dir / "workspace.env"
        store.write_text("BUILDANDDO_PH=%s\nDD_API_KEY=%s\n" % (capture_key(), datadog_key()), encoding="utf-8")
        recorder = Recorder()
        with mock.patch.dict(os.environ, {"CITADEL_WORKSPACE_ENV": str(store)}):
            del os.environ["BUILDANDDO_OCN_TELEMETRY_POSTHOG"]
            block = self.publish(receipts()["ocn_journey_report"], credentials=None, transport=recorder)
            self.assertFalse([url for url in recorder.urls() if "posthog" in url])
            self.assertEqual((block["state"], block["degraded"]), ("SENT", True))
            self.assertEqual(block["posthog"]["reason"], "POSTHOG_PRECONDITION")
            self.assertNotIn("BUILDANDDO_PH", block["credentials"])
            os.environ["BUILDANDDO_OCN_TELEMETRY_POSTHOG"] = "1"
            later = Recorder()
            block = self.publish(receipts()["ocn_journey_report"], credentials=None, transport=later)
        # Once acknowledged, a plain re-publish sends only what PostHog never got.
        self.assertEqual(later.urls(), [t.PH_CAPTURE, t.PH_CAPTURE])
        self.assertEqual((block["state"], block["degraded"], block["posthog"]["state"]), ("SENT", False, "SENT"))

    def test_a_datadog_only_send_never_touches_posthog(self):
        recorder = Recorder()
        block = self.publish(receipts()["ocn_journey_report"], sinks=("datadog",), transport=recorder)
        self.assertEqual(recorder.urls(), [t.DD_EVENTS, t.DD_LOGS])
        self.assertEqual((block["state"], block["degraded"], block["posthog"]["reason"]),
                         ("SENT", False, "NOT_SELECTED"))

    def test_the_store_is_found_through_the_deploy_file(self):
        store = self.dir / "elsewhere.env"
        (self.dir / "secrets").mkdir()
        (self.dir / "secrets" / "deploy.local.env").write_text(
            "# deploy settings\nOTHER=1\nCITADEL_WORKSPACE_ENV = \"%s\"\n" % store, encoding="utf-8")
        with mock.patch.dict(os.environ):
            del os.environ["CITADEL_WORKSPACE_ENV"]
            self.assertEqual(t.store_path(root=self.dir), store)
            self.assertIsNone(t.store_path(root=self.dir / "nowhere"))
        self.assertEqual(t.store_path(root=self.dir), self.dir / "no-store.env")

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

    def test_the_budget_is_a_wall_clock(self):
        # A request that never answers: a resolver or a connect that hangs, which no socket timeout bounds.
        release = threading.Event()
        self.addCleanup(release.set)

        def hang(method, url, body, headers, timeout):
            release.wait(30)
            return 200, "", {}

        started = time.monotonic()
        block = self.publish(receipts()["ocn_journey_report"], transport=hang, budget_s=0.5)
        self.assertLess(time.monotonic() - started, 2.5)
        self.assertEqual(block["posthog"]["reason"], "TRANSPORT:BUDGET")
        self.assertEqual((block["datadog"]["event"]["reason"], block["datadog"]["logs"]["reason"]),
                         ("BUDGET", "BUDGET"))

    def test_a_hanging_connect_cannot_hold_the_real_transport(self):
        release, entered = threading.Event(), threading.Event()
        self.addCleanup(release.set)

        def hang(*_args, **_kwargs):
            entered.set()
            release.wait(30)
            raise OSError("never connected")

        started = time.monotonic()
        with mock.patch("socket.create_connection", side_effect=hang):
            block = self.publish(receipts()["ocn_journey_report"], transport=t._send, budget_s=0.5)
            # The abandoned request is inside the stand-in connect, never the module's guard.
            self.assertTrue(entered.wait(10))
        self.assertLess(time.monotonic() - started, 2.5)
        self.assertEqual(block["posthog"]["reason"], "TRANSPORT:BUDGET")

    def test_a_failed_datadog_part_is_degraded_and_retried_alone(self):
        for failure in ((500, "server error", None), TimeoutError("slow")):
            with self.subTest(failure=type(failure).__name__):
                ledger = self.dir / ("ledger-" + type(failure).__name__)
                failed: list[str] = []

                def send(method, url, body, headers, timeout, failure=failure, failed=failed):
                    if url == t.DD_LOGS and not failed:
                        failed.append(url)
                        if isinstance(failure, BaseException):
                            raise failure
                        return failure
                    return (202 if "datadoghq" in url else 200), "", {}

                first = self.publish(receipts()["ocn_journey_report"], transport=send, ledger_dir=ledger)
                reason = "TRANSPORT:500" if isinstance(failure, tuple) else "TRANSPORT:TimeoutError"
                self.assertEqual((first["state"], first["degraded"], first["datadog"]["logs"]["reason"]),
                                 ("SENT", True, reason))
                self.assertFalse(t._strict_ok(first))
                # A plain re-publish posts only the logs: a second Datadog event would never verify.
                retry = Recorder()
                second = self.publish(receipts()["ocn_journey_report"], transport=retry, ledger_dir=ledger)
                self.assertEqual(retry.urls(), [t.DD_LOGS])
                self.assertEqual((second["state"], second["degraded"]), ("SENT", False))
                self.assertTrue(t._strict_ok(second))
                self.assertEqual(self.publish(receipts()["ocn_journey_report"], transport=Recorder(),
                                              ledger_dir=ledger)["reason"], "LEDGER_DUPLICATE")
                forced = Recorder()
                self.publish(receipts()["ocn_journey_report"], transport=forced, ledger_dir=ledger, force=True)
                self.assertEqual(forced.urls(), [t.PH_CAPTURE, t.PH_CAPTURE])

    def test_a_dry_run_never_overwrites_a_send(self):
        sent = self.publish(receipts()["ocn_journey_report"], transport=Recorder())
        self.publish(receipts()["ocn_journey_report"], mode="dry-run")
        entry = t.read_ledger(self.ledger, sent["run_id"])
        self.assertEqual((entry["mode"], entry["sinks"]["datadog"]["state"]), ("send", "SENT"))
        self.assertEqual(self.publish(receipts()["ocn_journey_report"], transport=Recorder())["reason"],
                         "LEDGER_DUPLICATE")

    def test_an_interrupt_mid_publish_is_recorded_before_it_carries_on(self):
        recorder = Recorder([(200, "", {}), KeyboardInterrupt()])
        with self.assertRaises(KeyboardInterrupt):
            self.publish(receipts()["ocn_journey_report"], transport=recorder)
        run_id = t.receipt_ids(receipts()["ocn_journey_report"])["run_id"]
        entry = t.read_ledger(self.ledger, run_id)
        self.assertEqual(entry["sinks"]["posthog"]["state"], "SENT")
        self.assertEqual(entry["sinks"]["datadog"]["event"]["reason"], "INTERRUPTED")
        self.assertEqual([item["run_id"] for item in t.pending_entries(self.ledger)], [run_id])
        rest = Recorder()
        self.publish(receipts()["ocn_journey_report"], transport=rest)
        self.assertEqual(rest.urls(), [t.DD_EVENTS, t.DD_LOGS])

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
        ahead = self.plan(dict(receipts()["ocn_journey_report"], at="2026-09-24T12:31:00+00:00"), dd_metrics=True)
        self.assertEqual(ahead.skipped["datadog.series"], "WINDOW")
        self.assertIn("datadog.series", self.plan(receipts()["ocn_journey_report"], dd_metrics=True).bodies)
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


class TransportTests(Harness):
    """_send, the module's one network function, with its opener faked: nothing leaves the process."""

    class Opener:
        def __init__(self, answer):
            self.answer, self.seen = answer, []

        def open(self, request, timeout=None):
            self.seen.append((request.full_url, request.get_method(), timeout, request.get_header("User-agent")))
            if isinstance(self.answer, BaseException):
                raise self.answer
            return self.answer

    class Response(io.BytesIO):
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

    def test_the_opener_never_follows_a_redirect(self):
        self.assertTrue(any(isinstance(handler, t._NoRedirect) for handler in t._OPENER.handlers))
        self.assertIsNone(t._NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://example.org/"))

    def test_a_dead_hop_is_status_zero_and_keeps_its_timeout(self):
        opener = self.Opener(urllib.error.URLError("unreachable"))
        with mock.patch.object(t, "_OPENER", opener):
            self.assertEqual(t._send("POST", t.PH_CAPTURE, {"batch": []}, {}, 1.5), (0, "URLError", None))
        self.assertEqual(opener.seen, [(t.PH_CAPTURE, "POST", 1.5, t.USER_AGENT)])

    def test_an_answer_is_read_and_every_key_scrubbed(self):
        key = datadog_key()
        with mock.patch.object(t, "_OPENER", self.Opener(self.Response(b'{"status": "ok"}'))):
            self.assertEqual(t._send("POST", t.DD_EVENTS, {"x": 1}, {"DD-API-KEY": key}, 2.0),
                             (200, '{"status": "ok"}', {"status": "ok"}))
        refusal = urllib.error.HTTPError(t.DD_LOGS, 403, "Forbidden", {},
                                         io.BytesIO(('{"errors": ["bad key %s"]}' % key).encode()))
        with mock.patch.object(t, "_OPENER", self.Opener(refusal)):
            status, detail, _document = t._send("POST", t.DD_LOGS, [], {"DD-API-KEY": key}, 2.0)
        self.assertEqual(status, 403)
        self.assertNotIn(key, detail)
        self.assertIn("[key]", detail)


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
        argv = ["publish", "--receipt", str(path), "--tee", "--env", "staging", "--fleet-map", str(self.fleet),
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

    def test_a_scripts_package_elsewhere_on_the_path_is_never_imported(self):
        # The release workstation's PYTHONPATH names a tree whose `scripts` is a regular package, which wins
        # over this repository's namespace one. Every module of this stand-in tree records its own import.
        shadow, marker = self.dir / "shadow", self.dir / "imported.txt"
        (shadow / "scripts" / "ci").mkdir(parents=True)
        record = "open(%r, 'a').write(__name__ + chr(10))\n" % str(marker)
        for path in ("scripts/__init__.py", "scripts/ci/__init__.py", "scripts/ci/public_redaction.py",
                     "public_redaction.py", "emit_datadog_metrics.py", "ocn_seat_session.py"):
            (shadow / path).write_text(record, encoding="utf-8")
        receipt = self.dir / "receipt.json"
        receipt.write_text(json.dumps(receipts()["ocn_classroom_fleet"]), encoding="utf-8")
        done = subprocess.run([sys.executable, str(SCRIPT), "publish", "--receipt", str(receipt), "--mode", "dry-run",
                               "--fleet-map", str(self.fleet), "--ledger-dir", str(self.ledger)], cwd=ROOT,
                              env=dict(os.environ, PYTHONPATH=str(shadow)), capture_output=True, text=True,
                              encoding="utf-8", timeout=120)
        self.assertEqual(done.returncode, 0, done.stderr[-400:])
        self.assertEqual(json.loads(done.stdout)["reason"], "DRY_RUN")
        self.assertFalse(marker.exists(), marker.read_text(encoding="utf-8") if marker.exists() else "")
        self.assertIn("persona-joins-from-box", done.stderr)

    def test_a_sibling_from_another_folder_is_refused(self):
        stranger = types.SimpleNamespace(__file__=str(self.dir / "public_redaction.py"))
        with mock.patch.object(t.importlib, "import_module", return_value=stranger):
            with self.assertRaises(ImportError):
                t._sibling.__wrapped__("public_redaction")


def read_keys(**overrides: str) -> dict[str, str]:
    values = {"POSTHOG_PERSONAL_API_KEY": "_".join(("phx", "read" * 5)), "DD_API_KEY": datadog_key(),
              "DD_APP_KEY": datadog_key()[::-1], "DD_SITE": "us5.datadoghq.com", "POSTHOG_PROJECT_ID": "123456"}
    values.update(overrides)
    return {name: value for name, value in values.items() if value}


class Vendor:
    """Canned PostHog and Datadog readback. A run counts as sent when the ledger holds it."""

    def __init__(self, ledger: Path, **settings):
        self.ledger = ledger
        self.s = {"ph_status": 200, "run": 1, "checks": 3, "control": 0, "ip_kept": 0, "legacy": 0,
                  "never_rows": 0, "canary_status": 200, "canary_rows": 0, "persons": 0, "late": 0,
                  "dd_status": 200, "events": 1, "logs": 4, "never_events": 0, "never_logs": 0,
                  "invalid_status": 403, "points": True, "tags": ["env:staging", "service:buildanddo-ocn"]}
        self.s.update(settings)
        self.calls: list[dict] = []

    def mine(self, run_id: str) -> bool:
        return t.ledger_file(self.ledger, run_id).is_file()

    def never_sent(self, run_id: str) -> tuple[int, str, dict] | None:
        """The answer to a lookup of a run nobody sent; None to answer it like any other."""
        return None

    def __call__(self, method, url, body, headers, timeout):
        self.calls.append({"method": method, "url": url, "body": copy.deepcopy(body), "headers": sorted(headers),
                           "real_datadog_key": headers.get("DD-API-KEY") == datadog_key()})
        s = self.s
        if url.startswith(t.PH_QUERY_BASE):
            project = url[len(t.PH_QUERY_BASE):].split("/")[0]
            query, values = body["query"]["query"], body["query"]["values"]
            if "FROM persons" in query:
                return s["ph_status"], "", {"results": [[s["persons"]]]}
            if "ocn_box_ip" in query:
                return s["ph_status"], "", {"results": [[s["legacy"]]]}
            if project != str(t.PH_PROJECT):
                return s["canary_status"], "", {"results": [["ocn_probe_run", s["canary_rows"], 0]]}
            if s["ph_status"] != 200:
                return s["ph_status"], "", {"detail": "refused"}
            if not self.mine(values["run_id"]):
                return self.never_sent(values["run_id"]) or (
                    200, "", {"results": [["ocn_probe_run", s["never_rows"], 0]] if s["never_rows"] else []})
            if s["late"]:
                s["late"] -= 1
                return 200, "", {"results": []}
            rows = [["ocn_probe_run", s["run"], s["ip_kept"]], ["ocn_probe_check", s["checks"], 0]]
            if s["control"]:
                rows.append(["ocn_telemetry_control", s["control"], 0])
            return 200, "", {"results": rows}
        if url in (t.DD_EVENTS_SEARCH, t.DD_LOGS_SEARCH):
            if s["dd_status"] != 200:
                return s["dd_status"], "", {"errors": ["Forbidden"]}
            run_id = re.search(r"ocn_run:([0-9a-f-]{36})", body["filter"]["query"]).group(1)
            if not self.mine(run_id) and self.never_sent(run_id):
                return self.never_sent(run_id)
            if url == t.DD_EVENTS_SEARCH:
                count = s["events"] if self.mine(run_id) else s["never_events"]
            else:
                count = s["logs"] if self.mine(run_id) else s["never_logs"]
            return 200, "", {"data": [{"id": str(index)} for index in range(count)]}
        if url == t.DD_LOGS:
            # The real key is accepted, as the real intake would: only an invalid key may meet the control.
            if headers.get("DD-API-KEY") == datadog_key():
                return 202, "", {}
            return s["invalid_status"], "", {}
        if url.startswith(t.DD_METRIC_QUERY):
            return 200, "", {"series": [{"pointlist": [[1, 1.0]]}] if s["points"] else []}
        if url.startswith(t.DD_API + "/api/v2/metrics/"):
            if "feature" in url:
                return 404, "", {"errors": ["not found"]}
            return 200, "", {"data": {"attributes": {"tags": s["tags"]}}}
        raise AssertionError("an unexpected request")


class Stored:
    """Both vendors as a store: what they accept, they keep and read back. PostHog keeps a batch sent under
    the capture key (never the invalid-key twin), Datadog each event and log line by its ocn_run tag, and
    a Datadog key other than the real one is refused. `fail_logs` answers the first logs intake with 500;
    `fail_control` answers the invalid-key twin with 500, so the twin never reaches PostHog."""

    def __init__(self, fail_logs: bool = False, fail_control: bool = False):
        self.posthog: dict[tuple[str, str], set] = {}
        self.datadog: dict[str, list[str]] = {"events": [], "logs": []}
        self.fail_logs = fail_logs
        self.fail_control = fail_control

    @staticmethod
    def run_of(tags: str) -> str:
        return re.search(r"ocn_run:([0-9a-f-]{36})", tags).group(1)

    def __call__(self, method, url, body, headers, timeout):
        if url == t.PH_CAPTURE:
            if body["api_key"] != capture_key() and self.fail_control:
                return 500, "", None
            for event in body["batch"] if body["api_key"] == capture_key() else []:
                self.posthog.setdefault((event["properties"]["ocn_run_id"], event["event"]), set()).add(event["uuid"])
            return 200, "", {"status": "Ok"}
        if url in (t.DD_EVENTS, t.DD_LOGS):
            if headers.get("DD-API-KEY") != datadog_key():
                return 403, "", {}
            if url == t.DD_LOGS and self.fail_logs:
                self.fail_logs = False
                return 500, "", None
            if url == t.DD_EVENTS:
                self.datadog["events"].append(self.run_of(",".join(body["tags"])))
            else:
                self.datadog["logs"] += [self.run_of(record["ddtags"]) for record in body]
            return 202, "", {}
        if url.startswith(t.PH_QUERY_BASE):
            values = body["query"]["values"]
            if "run_id" not in values or not url.startswith(t.PH_QUERY):
                return 200, "", {"results": [[0]] if "run_id" not in values else []}
            return 200, "", {"results": [[event, len(uuids), 0] for (run, event), uuids in self.posthog.items()
                                         if run == values["run_id"]]}
        if url in (t.DD_EVENTS_SEARCH, t.DD_LOGS_SEARCH):
            found = self.datadog["events" if url == t.DD_EVENTS_SEARCH else "logs"]
            return 200, "", {"data": [{}] * found.count(self.run_of(body["filter"]["query"]))}
        raise AssertionError("an unexpected request")


class VerifyTests(Harness):
    def sent(self, receipt: dict | None = None) -> dict:
        block = self.publish(receipt or receipts()["ocn_journey_report"], transport=Recorder(), force=True)
        self.assertEqual(block["state"], "SENT")
        return t.read_ledger(self.ledger, block["run_id"])

    def read(self, vendor: Vendor, **overrides: str) -> t.Readback:
        ticks = iter(range(0, 10 ** 6, 10))
        return t.readback(credentials=read_keys(**overrides), transport=vendor, sleep=lambda seconds: None,
                          monotonic=lambda: float(next(ticks)), now=NOW)

    def verify(self, entry: dict, wait: float = 0, **settings) -> dict:
        return t.verify_entry(entry, self.read(Vendor(self.ledger, **settings)), wait)

    def test_a_delivered_run_is_verified_with_every_control_held(self):
        entry = self.sent()
        result = self.verify(entry)
        self.assertEqual(result["state"], "VERIFIED")
        self.assertEqual(result["posthog"]["counts"], {"ocn_probe_check": 3, "ocn_probe_run": 1})
        self.assertEqual(set(result["posthog"]["controls"].values()), {"HELD"})
        self.assertEqual(set(result["datadog"]["controls"].values()), {"HELD"})
        self.assertEqual(result["posthog"]["privacy"], {"ip": "CLEAN", "legacy_properties": "CLEAN",
                                                        "agent_persons": "CLEAN"})
        updated = t.record_verification(self.ledger, entry, result)
        self.assertEqual(t.block_from_ledger(updated, self.ledger)["state"], "VERIFIED")
        self.assertEqual(t.read_ledger(self.ledger, entry["run_id"])["sinks"]["posthog"]["state"], "VERIFIED")

    def test_a_run_whose_logs_were_retried_verifies(self):
        vendor = Stored(fail_logs=True)
        first = self.publish(receipts()["ocn_journey_report"], transport=vendor)
        self.assertEqual((first["state"], first["degraded"]), ("SENT", True))
        before = t.verify_entry(t.read_ledger(self.ledger, first["run_id"]), self.read(vendor), 0)
        self.assertEqual((before["state"], before["datadog"]["reason"]), ("NOT_FOUND", "LOGS_NOT_FOUND"))
        # The retry posts the logs alone, so Datadog holds the one event verify expects.
        self.publish(receipts()["ocn_journey_report"], transport=vendor)
        after = t.verify_entry(t.read_ledger(self.ledger, first["run_id"]), self.read(vendor), 0)
        self.assertEqual((after["state"], after["datadog"]["counts"]["events"]), ("VERIFIED", 1))

    def test_only_a_verified_result_promotes_a_sink(self):
        entry = self.sent()
        result = self.verify(entry, run=0, checks=0, events=0, logs=0)
        self.assertEqual(result["state"], "NOT_FOUND")
        updated = t.record_verification(self.ledger, entry, result)
        self.assertEqual({name: sink["state"] for name, sink in updated["sinks"].items()},
                         {"posthog": "SENT", "datadog": "SENT"})
        self.assertEqual(t.read_ledger(self.ledger, entry["run_id"])["sinks"]["datadog"]["state"], "SENT")
        self.assertEqual(t.block_from_ledger(updated, self.ledger)["state"], "SENT")
        self.assertEqual([item["run_id"] for item in t.pending_entries(self.ledger)], [entry["run_id"]])

    def test_a_delivered_twin_is_recorded_as_sent(self):
        block = self.publish(receipts()["ocn_journey_report"], transport=Stored())
        self.assertEqual((block["state"], block["degraded"]), ("SENT", False))
        self.assertEqual(block["posthog"]["control_state"], "SENT")

    def test_a_twin_that_never_went_out_leaves_the_send_degraded_and_c1_unmeasured(self):
        vendor = Stored(fail_control=True)
        block = self.publish(receipts()["ocn_journey_report"], transport=vendor)
        self.assertEqual((block["state"], block["degraded"]), ("SENT", True))
        self.assertEqual(block["posthog"]["control_state"], "UNSENT")
        result = t.verify_entry(t.read_ledger(self.ledger, block["run_id"]), self.read(vendor), 0)
        # An absent twin proves nothing when the twin was never sent, so C1 cannot hold and nothing verifies.
        self.assertEqual(result["posthog"]["controls"]["C1_invalid_key_absent"], "UNMEASURED")
        self.assertEqual(result["posthog"]["state"], "UNMEASURED")
        self.assertNotEqual(result["state"], "VERIFIED")

    def test_a_ledger_without_control_state_falls_back_to_the_twin_status(self):
        entry = self.sent()
        for control_http, expected in ((200, "HELD"), (None, "UNMEASURED")):
            legacy = copy.deepcopy(entry)
            legacy["sinks"]["posthog"].pop("control_state", None)
            legacy["sinks"]["posthog"]["control_http"] = control_http
            self.assertEqual(self.verify(legacy)["posthog"]["controls"]["C1_invalid_key_absent"], expected)

    def test_a_send_after_a_dry_run_does_not_inherit_its_time(self):
        receipt = receipts()["ocn_journey_report"]
        earlier = NOW - dt.timedelta(minutes=5)
        dry = self.publish(receipt, mode="dry-run", now=earlier)
        self.assertEqual(t.read_ledger(self.ledger, dry["run_id"])["first_published_at"], t.iso(earlier))
        sent = self.publish(receipt, transport=Stored())
        self.assertEqual(t.read_ledger(self.ledger, sent["run_id"])["first_published_at"], t.iso(NOW))
        # A later send of the same run keeps the first real send's time.
        self.publish(receipt, transport=Stored(), now=NOW + dt.timedelta(minutes=5))
        self.assertEqual(t.read_ledger(self.ledger, sent["run_id"])["first_published_at"], t.iso(NOW))

    def test_a_control_that_could_not_be_measured_is_never_held(self):
        entry = self.sent()
        dead_hop = self.verify(entry, invalid_status=0)
        self.assertEqual(dead_hop["datadog"]["controls"]["C4_invalid_key_refused"], "UNMEASURED")
        self.assertEqual((dead_hop["datadog"]["state"], dead_hop["state"]), ("UNMEASURED", "UNMEASURED"))

        class Unanswered(Vendor):
            def never_sent(self, run_id):
                return 500, "", {"errors": ["server error"]}

        unanswered = t.verify_entry(entry, self.read(Unanswered(self.ledger)), 0)
        self.assertEqual(unanswered["posthog"]["controls"]["C2_never_sent_id_empty"], "UNMEASURED")
        self.assertEqual(unanswered["datadog"]["controls"]["C5_never_sent_id_empty"], "UNMEASURED")
        self.assertEqual((unanswered["posthog"]["state"], unanswered["datadog"]["state"]), ("UNMEASURED", "UNMEASURED"))

    def test_a_partial_ingest_is_not_found(self):
        result = self.verify(self.sent(), checks=2)
        self.assertEqual((result["posthog"]["state"], result["state"]), ("NOT_FOUND", "NOT_FOUND"))

    def test_the_invalid_key_control_never_carries_the_real_key(self):
        entry = self.sent()
        vendor = Vendor(self.ledger)
        self.assertEqual(t.verify_entry(entry, self.read(vendor), 0)["state"], "VERIFIED")
        control = [call for call in vendor.calls if call["url"] == t.DD_LOGS]
        self.assertEqual(len(control), 1)
        self.assertFalse(control[0]["real_datadog_key"])

    def test_legacy_properties_are_read_across_the_project(self):
        entry = self.sent()
        vendor = Vendor(self.ledger, legacy=3)
        result = t.verify_entry(entry, self.read(vendor), 0)
        self.assertEqual(result["posthog"]["privacy"]["legacy_properties"], "FOUND")
        legacy = [call["body"]["query"] for call in vendor.calls
                  if call["url"].startswith(t.PH_QUERY_BASE) and "ocn_box_ip" in call["body"]["query"]["query"]]
        self.assertEqual(len(legacy), 1)
        # The run's own events never carry them, so the count reads the project, since the first send.
        self.assertEqual(legacy[0]["values"], {"since": t._clock(t.parse_time(entry["first_published_at"]))})
        self.assertEqual(self.verify(entry)["posthog"]["privacy"]["legacy_properties"], "CLEAN")

    def test_a_cut_off_send_is_pending_and_a_refused_one_is_not(self):
        refused = self.publish(receipts()["ocn_journey_report"], sinks=("datadog",),
                               transport=Recorder([(403, "forbidden", None)] * 2))
        self.assertEqual((refused["state"], refused["reason"]), ("UNSENT", "TRANSPORT:403"))
        self.assertEqual(t.pending_entries(self.ledger), [])
        mixed = self.publish(dict(receipts()["ocn_journey_report"], at="2026-09-24T12:00:20+00:00"),
                             sinks=("datadog",),
                             transport=Recorder([(403, "forbidden", None), (0, "TimeoutError", None)]))
        cut = self.publish(dict(receipts()["ocn_journey_report"], at="2026-09-24T12:00:30+00:00"),
                           transport=Recorder([(0, "TimeoutError", None)] * 4))
        self.assertEqual((cut["state"], cut["posthog"]["reason"]), ("UNSENT", "TRANSPORT:TimeoutError"))
        self.assertEqual(sorted(entry["run_id"] for entry in t.pending_entries(self.ledger)),
                         sorted([mixed["run_id"], cut["run_id"]]))

    def test_sent_gauges_are_read_back(self):
        entry = self.sent_with_metrics()
        self.assertGreater(entry["expected"]["datadog"]["series"], 0)
        found = self.verify(entry)
        self.assertEqual((found["state"], found["datadog"]["counts"]["metrics"]), ("VERIFIED", "FOUND"))
        missing = self.verify(entry, points=False)
        self.assertEqual((missing["datadog"]["state"], missing["datadog"]["reason"]),
                         ("NOT_FOUND", "METRICS_NOT_FOUND"))

    def sent_with_metrics(self) -> dict:
        block = self.publish(receipts()["ocn_journey_report"], transport=Recorder(), dd_metrics=True, force=True)
        return t.read_ledger(self.ledger, block["run_id"])

    def test_the_ip_marker_and_the_project_are_pinned(self):
        self.assertTrue(ipaddress.ip_address(t.UNSPECIFIED_IP).is_unspecified)
        self.assertEqual(t.PH_QUERY, "https://us.posthog.com/api/projects/597897/query/")
        self.assertEqual(t.PH_CAPTURE, "https://us.i.posthog.com/batch/")

    def test_nothing_found_is_not_found(self):
        result = self.verify(self.sent(), run=0, checks=0, events=0, logs=0)
        self.assertEqual((result["state"], result["posthog"]["state"], result["datadog"]["state"]),
                         ("NOT_FOUND", "NOT_FOUND", "NOT_FOUND"))

    def test_an_event_without_its_logs_is_reported_and_never_verified(self):
        result = self.verify(self.sent(), logs=2)
        self.assertEqual((result["datadog"]["state"], result["datadog"]["reason"]), ("NOT_FOUND", "LOGS_NOT_FOUND"))
        self.assertEqual(result["state"], "NOT_FOUND")

    def test_a_failed_control_voids_the_run(self):
        cases = {"control": ("posthog", "C1_invalid_key_absent"), "never_rows": ("posthog", "C2_never_sent_id_empty"),
                 "canary_rows": ("posthog", "C3_other_project_empty"),
                 "never_logs": ("datadog", "C5_never_sent_id_empty")}
        for setting, (sink, control) in cases.items():
            with self.subTest(control=control):
                result = self.verify(self.sent(), **{setting: 1})
                self.assertEqual(result[sink]["controls"][control], "FAILED")
                self.assertEqual((result[sink]["state"], result["state"]), ("VOID", "VOID"))
        accepted = self.verify(self.sent(), invalid_status=202)
        self.assertEqual(accepted["datadog"]["controls"]["C4_invalid_key_refused"], "FAILED")
        self.assertEqual(accepted["state"], "VOID")

    def test_no_read_key_or_a_refusal_is_unmeasured(self):
        entry = self.sent()
        no_key = t.verify_entry(entry, self.read(Vendor(self.ledger), POSTHOG_PERSONAL_API_KEY="", DD_APP_KEY=""), 0)
        self.assertEqual(no_key["posthog"]["reason"], "NO_KEY:POSTHOG_PERSONAL_API_KEY")
        self.assertEqual(no_key["datadog"]["reason"], "NO_KEY:DD_APP_KEY")
        self.assertEqual(no_key["state"], "UNMEASURED")
        fallback = t.verify_entry(entry, self.read(Vendor(self.ledger), POSTHOG_PERSONAL_API_KEY="",
                                                   BAD_PERSONAL_PH_KEY="_".join(("phx", "other" * 4))), 0)
        self.assertEqual((fallback["posthog"]["state"], fallback["posthog"]["key"]),
                         ("VERIFIED", "BAD_PERSONAL_PH_KEY"))
        capture = t.verify_entry(entry, self.read(Vendor(self.ledger), POSTHOG_PERSONAL_API_KEY=capture_key()), 0)
        self.assertEqual(capture["posthog"]["reason"], "KEY_SHAPE")
        for status in (401, 403):
            with self.subTest(status=status):
                refused = self.verify(entry, ph_status=status, dd_status=status)
                self.assertEqual(refused["posthog"]["reason"], "HTTP_%d" % status)
                self.assertEqual(refused["datadog"]["reason"], "HTTP_%d" % status)
                self.assertEqual(refused["state"], "UNMEASURED")

    def test_the_canary_project_is_not_checked_when_unreadable(self):
        entry = self.sent()
        absent = t.verify_entry(entry, self.read(Vendor(self.ledger), POSTHOG_PROJECT_ID=""), 0)
        self.assertEqual(absent["posthog"]["controls"]["C3_other_project_empty"], "NOT_CHECKED")
        self.assertEqual(absent["state"], "VERIFIED")
        forbidden = self.verify(entry, canary_status=403)
        self.assertEqual(forbidden["posthog"]["controls"]["C3_other_project_empty"], "NOT_CHECKED")
        same = t.verify_entry(entry, self.read(Vendor(self.ledger), POSTHOG_PROJECT_ID=str(t.PH_PROJECT)), 0)
        self.assertEqual(same["posthog"]["controls"]["C3_other_project_empty"], "NOT_CHECKED")

    def test_a_kept_address_and_legacy_properties_are_reported(self):
        result = self.verify(self.sent(), ip_kept=1, legacy=1, persons=2)
        self.assertEqual(result["posthog"]["privacy"], {"ip": "IP_STORED", "legacy_properties": "FOUND",
                                                        "agent_persons": "FOUND"})
        self.assertEqual(result["posthog"]["state"], "VERIFIED")

    def test_the_run_id_is_a_value_never_query_text(self):
        entry = self.sent()
        vendor = Vendor(self.ledger)
        t.verify_entry(entry, self.read(vendor), 0)
        queries = [call["body"]["query"] for call in vendor.calls if call["url"].startswith(t.PH_QUERY_BASE)]
        self.assertTrue(queries)
        for query in queries:
            self.assertNotIn(entry["run_id"], query["query"])
        self.assertIn(entry["run_id"], [query["values"].get("run_id") for query in queries])
        self.assertTrue(all(call["body"].get("refresh") == "blocking" for call in vendor.calls
                            if call["url"].startswith(t.PH_QUERY_BASE)))

    def test_verify_polls_until_ingestion_and_then_stops(self):
        entry = self.sent()
        slept: list[float] = []
        ticks = iter(range(0, 10 ** 6, 10))
        read = t.readback(credentials=read_keys(), transport=Vendor(self.ledger, late=2), sleep=slept.append,
                          monotonic=lambda: float(next(ticks)), now=NOW)
        self.assertEqual(t.verify_entry(entry, read, 120)["posthog"]["state"], "VERIFIED")
        self.assertEqual(slept, [10.0, 10.0])
        impatient = t.readback(credentials=read_keys(), transport=Vendor(self.ledger, late=5), sleep=slept.append,
                               monotonic=lambda: float(next(ticks)), now=NOW)
        self.assertEqual(t.verify_entry(entry, impatient, 0)["posthog"]["state"], "NOT_FOUND")

    def test_nothing_sent_is_not_checked(self):
        dry = self.publish(receipts()["ocn_journey_report"], mode="dry-run")
        result = self.verify(t.read_ledger(self.ledger, dry["run_id"]))
        self.assertEqual(result["state"], "NOT_CHECKED")

    def args(self, **values) -> argparse.Namespace:
        base = {"pending": False, "run": None, "receipt": None, "tags": False, "update_receipt": False, "wait": 0,
                "ledger_dir": str(self.ledger), "strict": False}
        base.update(values)
        return argparse.Namespace(**base)

    def verify_main(self, vendor: Vendor, **values) -> tuple[int, dict]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = t.verify_main(self.args(**values), read=self.read(vendor))
        lines = out.getvalue().splitlines()
        self.assertEqual(len(lines), 1)
        return code, json.loads(lines[0])

    def test_pending_verifies_every_sent_run_and_skips_dry_runs(self):
        first = self.sent()
        second = self.sent(dict(receipts()["ocn_journey_report"], at="2026-09-24T12:00:30+00:00"))
        self.publish(dict(receipts()["ocn_journey_report"], at="2026-09-24T12:00:40+00:00"), mode="dry-run")
        code, report = self.verify_main(Vendor(self.ledger), pending=True)
        self.assertEqual(code, 0)
        self.assertEqual(sorted(result["run_id"] for result in report["results"]),
                         sorted([first["run_id"], second["run_id"]]))
        self.assertEqual(report["state"], "VERIFIED")
        _code, again = self.verify_main(Vendor(self.ledger), pending=True)
        self.assertEqual(again["results"], [])

    def test_a_run_id_must_be_a_run_id(self):
        _code, report = self.verify_main(Vendor(self.ledger), run="not-a-run")
        self.assertEqual(report["results"][0]["reason"], "NOT_A_RUN_ID")
        code, missing = self.verify_main(Vendor(self.ledger), run="00000000-0000-5000-8000-000000000000", strict=True)
        self.assertEqual((code, missing["results"][0]["reason"]), (1, "NOT_IN_LEDGER"))

    def test_update_receipt_rewrites_only_a_persisted_receipt_and_keeps_its_run_id(self):
        persisted = self.dir / "state" / "ocn_feature_sweep" / "staging.latest.json"
        persisted.parent.mkdir(parents=True)
        receipt = receipts()["ocn_feature_sweep"]
        persisted.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
        self.publish(t.extract_receipt(persisted.read_text(encoding="utf-8")), transport=Recorder())
        vendor = Vendor(self.ledger, checks=0, logs=5)
        _code, report = self.verify_main(vendor, receipt=str(persisted), update_receipt=True)
        self.assertIs(report["results"][0]["receipt_updated"], True)
        written = json.loads(persisted.read_text(encoding="utf-8"))
        self.assertEqual(written["ocn_telemetry"]["state"], "VERIFIED")
        self.assertEqual(t.receipt_ids(written), t.receipt_ids(receipt))
        loose = self.dir / "receipt.json"
        loose.write_text(json.dumps(receipt), encoding="utf-8")
        _code, report = self.verify_main(vendor, receipt=str(loose), update_receipt=True)
        self.assertIs(report["results"][0]["receipt_updated"], False)
        self.assertNotIn("ocn_telemetry", json.loads(loose.read_text(encoding="utf-8")))

    def test_verify_refuses_under_ci(self):
        vendor = Vendor(self.ledger)
        with mock.patch.dict(os.environ, {"CI": "true"}):
            _code, report = self.verify_main(vendor, pending=True)
        self.assertEqual((report["state"], report["reason"]), ("UNMEASURED", "CI_GUARD"))
        self.assertEqual(vendor.calls, [])

    def test_tags_read_back_keys_and_never_values(self):
        _code, clean = self.verify_main(Vendor(self.ledger), tags=True)
        self.assertEqual(clean["state"], "CLEAN")
        self.assertEqual(clean["metrics"][t.METRIC_ALIVE]["state"], "NOT_FOUND")
        self.assertNotIn("staging", json.dumps(clean))
        _code, odd = self.verify_main(Vendor(self.ledger, tags=["env:staging", "host:" + BOX, "env:elsewhere"]),
                                      tags=True)
        self.assertEqual(odd["state"], "UNEXPECTED")
        self.assertEqual(odd["metrics"][t.METRIC_MEASURED]["unexpected_keys"], 1)
        self.assertEqual(odd["metrics"][t.METRIC_MEASURED]["unexpected_values"], 1)
        self.assertNotIn(BOX, json.dumps(odd))

    def test_run_verify_reads_the_run_back_after_the_send(self):
        probe = self.dir / "scripts" / "ci" / "ocn_journey_report.py"
        probe.parent.mkdir(parents=True)
        probe.write_text("import json\nprint(json.dumps(%r))\n" % receipts()["ocn_journey_report"], encoding="utf-8")
        options = argparse.Namespace(telemetry="send", sinks=t.SINKS, probe="", expect=None, dd_metrics=False,
                                     fleet_map=str(self.fleet), ledger_dir=str(self.ledger), verify=True)
        publisher = functools.partial(t.publish, transport=Recorder(), credentials=keys(), now=NOW)
        err = io.StringIO()
        with mock.patch.dict(os.environ, read_keys()), mock.patch.object(t, "_send", Vendor(self.ledger)):
            code = t.run_command(options, [str(probe), "walk", "--json"], stdout=io.BytesIO(), stderr=err,
                                 publisher=publisher)
        self.assertEqual(code, 0)
        self.assertIn("ocn_telemetry: SENT", err.getvalue())
        self.assertIn("verify=VERIFIED", err.getvalue())


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


WRITING_PROBE = r'''
import json, sys
from pathlib import Path
state = Path(__file__).resolve().parents[2] / "state" / "ocn_feature_sweep"
env = sys.argv[sys.argv.index("--env") + 1]
other = "staging" if env == "production" else "production"
receipt = json.loads(%r)
# A run for the other env rewrites its own file while this one is running.
(state / (other + ".latest.json")).write_text(json.dumps(dict(receipt, env=other)), encoding="utf-8")
(state / (env + ".latest.json")).write_text(json.dumps(dict(receipt, env=env)), encoding="utf-8")
print("OCN feature sweep: the table only")
sys.exit(1)
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

    def test_the_switch_set_to_off_vetoes_a_send_flag(self):
        publisher = mock.Mock()
        with mock.patch.dict(os.environ, {"BUILDANDDO_OCN_TELEMETRY": "off"}):
            code, _, err = self.wrapped(self.options("send"), "sweep", "--json", publisher=publisher)
        self.assertEqual(code, 3)
        publisher.assert_not_called()
        self.assertIn("ocn_telemetry: UNSENT (DISABLED)", err)

    def test_an_interrupt_while_publishing_says_it_may_be_partial(self):
        publisher = functools.partial(t.publish, transport=Recorder([(200, "", {}), KeyboardInterrupt()]),
                                      credentials=keys(), now=NOW)
        code, _, err = self.wrapped(self.options("send"), "sweep", "--json", publisher=publisher)
        self.assertEqual(code, 3)
        self.assertIn("interrupted while publishing; it may be partial", err)
        self.assertEqual(len(list((self.ledger / "runs").glob("*.json"))), 1)

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

    def test_nothing_is_loaded_before_the_probe_and_no_error_changes_its_code(self):
        direct = self.direct("sweep", "--json")
        with mock.patch.object(t, "catalogue", side_effect=ImportError("a sibling module is broken")):
            code, out, _err = self.wrapped(self.options(None), "sweep", "--json")
        self.assertEqual((code, out), (direct.returncode, direct.stdout))
        code, out, err = self.wrapped(self.options("dry-run"), "sweep", "--json",
                                      publisher=mock.Mock(side_effect=OSError("disk full")))
        self.assertEqual((code, out), (direct.returncode, direct.stdout))
        self.assertIn("ocn_telemetry: UNSENT (PUBLISHER_ERROR:OSError)", err)

    def test_a_probe_that_cannot_start_exits_127(self):
        err = io.StringIO()
        code = t.run_command(self.options("dry-run"), [str(self.dir / "no-such-probe.exe")], stdout=io.BytesIO(),
                             stderr=err)
        self.assertEqual(code, 127)
        self.assertIn("the probe could not be started", err.getvalue())

    def test_a_persisted_receipt_is_this_invocations_own(self):
        state = self.dir / "state" / "ocn_feature_sweep"
        state.mkdir(parents=True)
        for env in ("staging", "production"):
            (state / (env + ".latest.json")).write_text(json.dumps({"env": env, "at": "old"}), encoding="utf-8")
        self.probe.write_text(WRITING_PROBE % json.dumps(receipts()["ocn_feature_sweep"]), encoding="utf-8")
        publisher = mock.Mock(return_value=t._block("dry-run", reason="DRY_RUN"))
        code, _, _ = self.wrapped(self.options("dry-run"), "sweep", "--env", "production", "--write",
                                  publisher=publisher)
        self.assertEqual(code, 1)
        receipt, options = publisher.call_args.args[0], publisher.call_args.kwargs
        self.assertEqual((receipt["env"], options["env"]), ("production", "production"))

    def test_a_receipt_that_names_its_command_is_judged_by_it(self):
        live = self.dir / "scripts" / "ci" / "ocn_classroom_live.py"
        for command, reason in (("run", "DRY_RUN"), ("seats", "NOT_PUBLISHABLE")):
            live.write_text("import json\nprint(json.dumps(%r))\n" % dict(receipts()["ocn_classroom_live"],
                                                                         command=command), encoding="utf-8")
            # --host and --join take values before the positional command, so the argv cannot name it.
            for argv in (["--host", "forge", "run", "--json"], ["run", "--host", "forge"], ["--json", "run"]):
                with self.subTest(command=command, argv=argv):
                    err = io.StringIO()
                    t.run_command(self.options("dry-run"), [str(live), *argv], stdout=io.BytesIO(), stderr=err)
                    self.assertIn("ocn_telemetry: UNSENT (%s)" % reason, err.getvalue())

    def test_the_command_line_passes_the_exit_code_through(self):
        environment = {key: value for key, value in os.environ.items()}
        done = subprocess.run([sys.executable, str(SCRIPT), "run", "--", str(self.probe), "sweep", "--json"],
                              env=environment, capture_output=True, timeout=120)
        self.assertEqual(done.returncode, 3)
        self.assertEqual(done.stdout, self.direct("sweep", "--json").stdout)
        self.assertIn(b"ocn_telemetry: UNSENT (DISABLED)", done.stderr)


class GuardTests(unittest.TestCase):
    """Both socket guards are shown to refuse. A lookup of a numeric documentation address never reaches
    the network even with a broken guard, so a guard that does nothing shows up as no refusal."""

    ADDRESS = ".".join(("192", "0", "2", "1"))

    def test_this_modules_guard_refuses_and_records(self):
        self.assertIsInstance(socket.create_connection, mock.Mock)
        before = len(_ATTEMPTS)
        with self.assertRaises(OSError):
            socket.getaddrinfo(self.ADDRESS, 9)
        self.assertEqual(len(_ATTEMPTS), before + 1)
        del _ATTEMPTS[before:]

    def test_the_selftests_guard_refuses_and_counts(self):
        attempts: list[str] = []
        before = len(_ATTEMPTS)
        with t._socket_guard(attempts):
            with self.assertRaises(OSError):
                socket.getaddrinfo(self.ADDRESS, 9)
        del _ATTEMPTS[before:]
        self.assertEqual(attempts, ["socket"])


class SelftestTests(Harness):
    def test_the_selftest_passes_offline(self):
        result = t.selftest()
        self.assertEqual((result["state"], result["sockets_opened"]), ("PASS", 0))
        self.assertEqual(result["passed"], result["total"])

    def test_the_selftest_fails_when_the_leak_gate_is_broken(self):
        def leaky(bodies, rule):
            return {"state": "PASS", "ips": 0, "machines": 0, "emails": 0, "fields": [], "rule": rule.source}

        with mock.patch.object(t, "leak_gate", leaky):
            result = t.selftest()
        failed = {check["check"] for check in result["checks"] if check["state"] == "FAIL"}
        self.assertEqual(result["state"], "FAIL")
        self.assertIn("the leak gate withholds a planted machine name", failed)
        self.assertIn("the leak gate withholds a planted email address", failed)
        self.assertIn("a send carrying a planted name is withheld before any request", failed)

    def test_the_selftest_runs_under_ci_and_puts_the_environment_back(self):
        with mock.patch.dict(os.environ, {"GITLAB_CI": "true", "BUILDANDDO_OCN_TELEMETRY": "off"}):
            del os.environ["BUILDANDDO_OCN_TELEMETRY_POSTHOG"]
            # The workstation's own switch and acknowledgement change nothing in the selftest.
            self.assertEqual(t.selftest()["state"], "PASS")
            self.assertNotIn("BUILDANDDO_OCN_TELEMETRY_ALLOW_CI", os.environ)
            self.assertNotIn("BUILDANDDO_OCN_TELEMETRY_POSTHOG", os.environ)
            self.assertEqual(os.environ["BUILDANDDO_OCN_TELEMETRY"], "off")

    def test_the_selftest_is_a_source_check(self):
        from scripts.ci import hostinger_checks

        check = hostinger_checks.CHECKS["ocn_telemetry"]
        self.assertEqual((check.argv, check.level), (("python", "scripts/ci/ocn_telemetry.py", "selftest"), "source"))

    def test_the_selftest_command_exits_zero_and_writes_nothing_here(self):
        state = ROOT / "state" / "ocn_telemetry"
        before = state.exists()
        done = subprocess.run([sys.executable, str(SCRIPT), "selftest"], cwd=ROOT, env=dict(os.environ),
                              capture_output=True, text=True, timeout=120)
        self.assertEqual(done.returncode, 0, done.stderr[-300:])
        self.assertEqual(json.loads(done.stdout)["state"], "PASS")
        self.assertEqual(state.exists(), before)


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
