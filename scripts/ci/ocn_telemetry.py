#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-OCN-TELEMETRY-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/ocn_telemetry.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-OCN-TELEMETRY-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-OCN-TELEMETRY-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/public_redaction.py, scripts/ci/emit_datadog_metrics.py,
#              scripts/ci/ocn_seat_session.py, scripts/ci/ocn_feature_sweep.py,
#              scripts/ci/ocn_journey_report.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES scripts/ci/ocn_*.py receipts; PRODUCES posthog.events.ocn (project 597897);
#              PRODUCES datadog.events.buildanddo_ocn; PRODUCES datadog.logs.buildanddo_ocn;
#              VERIFIED_BY tests/upgrade/test_ocn_telemetry.py
# Intent:      Publish what an OCN probe measured as marked, personless PostHog events and bounded
#              Datadog events and logs, from the release workstation only, off by default.
# ───────────────────────────────────────────────────────────────
"""ocn_telemetry.py - a finished OCN probe receipt becomes marked PostHog and Datadog telemetry.

RUNS ON THE RELEASE WORKSTATION ONLY. A probe writes the receipt it always wrote; this reads it after
the probe has reached its verdict and publishes what the receipt says. No fleet box calls a vendor or
holds a key for it, and no probe script imports it.

    ocn_telemetry.py run [--telemetry off|dry-run|send] [--sinks posthog,datadog] [--probe NAME]
                         [--expect allow|deny] [--dd-metrics] [--fleet-map PATH] [--verify]
                         -- <probe command...>
    ocn_telemetry.py publish --receipt PATH|- [--probe NAME] [--mode off|dry-run|send] [--sinks ...]
                             [--tee] [--force] [--expect allow|deny] [--env staging|production]
                             [--fleet-map PATH] [--probe-digest HEX] [--dd-metrics] [--strict]
    ocn_telemetry.py verify (--pending | --run ID | --receipt PATH [--update-receipt] | --tags)
                            [--wait 120]
    ocn_telemetry.py probes
    ocn_telemetry.py selftest       offline, sockets refused; hostinger_checks CHECKS['ocn_telemetry']

OFF BY DEFAULT. Nothing is sent unless --telemetry, --mode or BUILDANDDO_OCN_TELEMETRY says `send`, and
BUILDANDDO_OCN_TELEMETRY=off vetoes all of them: turning the switch off stops every publish whatever a
prepared command line says, and that is the rollback. `publish` without --mode follows the switch and is a
dry run while the switch is unset. `dry-run` prints what WOULD be sent to stderr, runs both gates and
sends nothing. PostHog also waits for BUILDANDDO_OCN_TELEMETRY_POSTHOG=1, which the operator sets once
agent events are out of the public activity figure.

TELEMETRY NEVER CHANGES A PROBE. `run` starts the probe, streams its stdout through byte for byte,
exits with the probe's own exit code, and only publishes after the probe has exited. Every publisher
path is wrapped: a failure becomes UNSENT with a reason, never an exception in the probe's run.

PERSONAS, NEVER MACHINES. A box id is resolved to its guildmaster through the private fleet map, in
memory, and never leaves this process. Every outbound body passes a leak gate built on
public_redaction.Rule and a tag gate over closed enums before any key is attached; either failure
withholds the whole receipt.

A 200 IS NOT DELIVERY. PostHog answers 200 {"status":"Ok"} to a deliberately invalid key and never
stores that event (measured 2026-09-20). SENT here means only that a vendor accepted a request.
VERIFIED is written only by `verify`, which reads both vendors back and holds five controls: the
invalid-key twin is absent, a never-sent run id finds nothing in either vendor, the Citadel-nexus
project holds nothing of the run, and Datadog refuses an invalid key. A failed control is VOID.
"""
from __future__ import annotations

import argparse
import codecs
import contextlib
import copy
import datetime as dt
import functools
import hashlib
import importlib
import importlib.util
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
# The orchestrators' own default: the estate checkout that holds this repository as sites/<name>.
ESTATE_FLEET_MAP = ROOT.parent.parent / "config" / "master_citadel.fleet.json"
LEDGER_DIR = ROOT / "state" / "ocn_telemetry"

CONTRACT = "buildanddo.ocn-telemetry/v1"
LEDGER_SCHEMA = "buildanddo.ocn-telemetry-ledger/v1"
LIB = "bnd-ocn-telemetry"
LIB_VERSION = "1"
USER_AGENT = LIB + "/" + LIB_VERSION

# PostHog: the BuildAndDo project, pinned. POSTHOG_API_KEY, POSTHOG_HOST and the store's
# POSTHOG_PROJECT_ID name the Citadel-nexus project, so none of them decides where capture goes.
PH_PROJECT = 597897
PH_CAPTURE = "https://us.i.posthog.com/batch/"
PH_QUERY_BASE = "https://us.posthog.com/api/projects/"
PH_QUERY = PH_QUERY_BASE + str(PH_PROJECT) + "/query/"
PH_NOTE = "200 = accepted, not stored"

# Datadog: us5 only. .gitlab-ci.yml falls back to the US1 site; that fallback must never be copied.
DD_SITE = "us5.datadoghq.com"
DD_SITES_ALLOWED = frozenset({DD_SITE})
DD_API = "https://api." + DD_SITE
DD_EVENTS = DD_API + "/api/v1/events"
DD_SERIES = DD_API + "/api/v2/series"
DD_LOGS = "https://http-intake.logs." + DD_SITE + "/api/v2/logs"
DD_EVENTS_SEARCH = DD_API + "/api/v2/events/search"
DD_LOGS_SEARCH = DD_API + "/api/v2/logs/events/search"
DD_METRIC_QUERY = DD_API + "/api/v1/query"
DD_ALL_TAGS = DD_API + "/api/v2/metrics/%s/all-tags"
SERVICE = "buildanddo-ocn"
TEAM = "citadel-nexus"

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://buildanddo.com/ocn-telemetry/v1")
ENVS = ("staging", "production")
MODES = ("off", "dry-run", "send")
SINKS = ("posthog", "datadog")
OUTCOMES = ("pass", "degraded", "fail", "partial", "void", "unmeasured", "observed", "error")
CHECK_KINDS = ("login", "route", "data", "collection", "leg", "step", "check", "command", "race", "op",
               "control")
CHECK_CAP = 60
LIST_CAP = 40
BUDGET_S = 10.0
REQUEST_TIMEOUT_S = 3.0
EVENT_WINDOW_S = 17 * 3600
SERIES_MAX_AGE_S = 55 * 60
SERIES_MAX_AHEAD_S = 9 * 60
SERIES_CEILING = 178
RESPONSE_LIMIT = 2_000_000

SWITCH = "BUILDANDDO_OCN_TELEMETRY"
BUDGET_ENV = "BUILDANDDO_OCN_TELEMETRY_BUDGET_S"
METRICS_ENV = "BUILDANDDO_OCN_TELEMETRY_DD_METRICS"
ALLOW_CI_ENV = "BUILDANDDO_OCN_TELEMETRY_ALLOW_CI"
# Set to 1 by the operator once the estate precondition has landed: the public activity figure excludes
# agent events and the test-account filter excludes is_ocn_agent. Until then nothing is sent to PostHog.
POSTHOG_ACK_ENV = "BUILDANDDO_OCN_TELEMETRY_POSTHOG"
STORE_ENV = "CITADEL_WORKSPACE_ENV"
FLEET_ENV = "CITADEL_FLEET_MAP"
CAPTURE_KEY = "BUILDANDDO_PH"
READ_KEYS = ("POSTHOG_PERSONAL_API_KEY", "BAD_PERSONAL_PH_KEY")
CANARY_PROJECT = "POSTHOG_PROJECT_ID"
DD_KEY = "DD_API_KEY"
DD_APP_KEY = "DD_APP_KEY"
DD_SITE_NAME = "DD_SITE"
POLL_S = 10.0
WAIT_S = 120.0

# The unspecified address. Sent as $ip on agent events, AFTER the gates, so PostHog keeps no address
# of the machine that published (operator decision 2026-09-24). Built here rather than written out.
UNSPECIFIED_IP = ".".join("0" * 4)

METRIC_MEASURED = "buildanddo.ocn.run.measured"
METRIC_OUTCOME = "buildanddo.ocn.run.outcome"
METRIC_FAILED = "buildanddo.ocn.run.checks_failed"
METRIC_ALIVE = "buildanddo.ocn.feature.alive"
METRICS = (METRIC_MEASURED, METRIC_OUTCOME, METRIC_FAILED, METRIC_ALIVE)
MEASURED_VALUE = {"pass": 1.0, "degraded": 1.0, "fail": 1.0, "observed": 1.0, "partial": 0.5,
                  "void": 0.0, "unmeasured": 0.0, "error": 0.0}
OUTCOME_VALUE = {"pass": 1.0, "degraded": 0.5, "fail": 0.0}
ALERT_TYPE = {"pass": "success", "degraded": "warning", "partial": "warning", "void": "warning",
              "unmeasured": "warning", "fail": "error", "error": "error", "observed": "info"}

# Tag keys each Datadog signal may carry. A run id is fine on an event or a log and never on a metric.
EVENT_TAG_KEYS = frozenset({"service", "env", "team", "ocn_probe", "ocn_outcome", "ocn_persona", "ocn_run"})
SERIES_TAG_KEYS = frozenset({"service", "env", "team", "ocn_probe"})

# The PostHog properties each event may carry. Measures, lists and labels add ocn_/perc_ names.
PH_COMMON_KEYS = frozenset({"is_ocn_agent", "$lib", "$lib_version", "$process_person_profile",
                            "$geoip_disable", "ocn_contract", "ocn_run_id", "ocn_probe", "ocn_env",
                            "ocn_persona"})
PH_RUN_KEYS = PH_COMMON_KEYS | frozenset({
    "ocn_receipt_sha256", "ocn_publisher_digest", "ocn_probe_digest", "ocn_receipt_schema", "ocn_mode",
    "ocn_actor", "ocn_guild", "ocn_personas", "ocn_outcome", "ocn_state", "ocn_reason_code",
    "ocn_controls_held", "ocn_checks_total", "ocn_checks_failed", "ocn_checks_controls",
    "ocn_checks_truncated"})
PH_CHECK_KEYS = PH_COMMON_KEYS | frozenset({
    "ocn_check", "ocn_check_kind", "ocn_check_index", "ocn_http", "ocn_check_state", "ocn_as_expected",
    "ocn_is_control", "ocn_method", "ocn_path_template", "ocn_latency_ms", "ocn_prerendered_chars"})
PH_CONTROL_KEYS = (PH_COMMON_KEYS - {"ocn_persona"}) | frozenset({"ocn_control"})
DD_CHECK_ATTRS = frozenset({"run_id", "receipt_sha256", "probe", "env", "persona", "guild", "check",
                            "check_kind", "check_index", "http", "state", "as_expected", "is_control",
                            "method", "path_template", "latency_ms"})
DD_RUN_ATTRS = frozenset({"run_id", "receipt_sha256", "probe", "env", "persona", "guild", "outcome",
                          "state", "reason_code", "controls_held", "checks_total", "checks_failed",
                          "checks_controls", "checks_truncated", "publisher_digest", "probe_digest"})

# Each probe's own vocabularies. A state outside them is published as "other", never as text.
SWEEP_STATES = frozenset({"ROUTE_ABSENT", "RECORD_MISSING", "DEPENDENCY_MISSING", "NEEDS_AUTH",
                          "REFUSED_BY_POLICY", "REJECTED_PAYLOAD", "OK", "TRANSPORT_FAULT", "UNMEASURABLE"})
SWEEP_RUN = frozenset({"PASS", "REPAIR_NEEDED", "PARTIAL", "VOID", "UNMEASURED"})
JOURNEY_VERDICTS = frozenset({"OK", "REFUSED", "UNHELPFUL", "BROKEN", "BLOCKED"})
JOURNEY_RUN = frozenset({"CLEAN", "DEFECTS", "VOID", "UNMEASURED"})
CONTRACT_OUTCOMES = frozenset({"AS_EXPECTED", "CONTRACT_BROKEN"})
CLASSROOM_RUN = frozenset({"PASS", "FAIL"})
PROJECT_RUN = frozenset({"PASS", "CONTRACT_BROKEN", "UNMEASURED"})
RACE_VERDICTS = frozenset({"MUTUAL_EXCLUSION_HELD", "DOUBLE_CLAIM", "NOBODY_CLAIMED", "UNMEASURED"})
LOGIN_STATES = frozenset({"LOGIN_OK", "SIGN_FAILED", "LOGIN_FAILED", "NOT_ATTEMPTED"})
RBAC_STATES = frozenset({"ALLOWED", "DENIED", "TRANSPORT_FAULT", "OTHER", "LOGIN_FAILED"})
SUBSYSTEM_STATES = frozenset({"ROUTE_ABSENT", "NEEDS_AUTH", "REFUSED_BY_POLICY", "REJECTED_PAYLOAD",
                              "DEPENDENCY_MISSING", "TRANSPORT_FAULT", "OK"})
SPRINT_STATES = frozenset({"PROPOSED", "REFUSED", "NO_MEASURED_WORK"})
RBAC_OPS = frozenset({"whoami", "list_ws", "read_ws", "create_mission", "patch_mission", "add_member",
                      "delete_ws"})
FORUM_ACTIONS = frozenset({"hall.enable", "hall.member", "forum.create", "forum.reply", "wiki.save",
                           "wiki.publish", "list", "wiki.list", "topic"})
ROOM_ACTIONS = frozenset({"list", "lessons", "presence-health", "realtime-health", "room.create",
                          "room.update", "room.start", "room.end", "room.lesson", "room.join",
                          "room.leave", "room.message"})
DOGFOOD_ACTIONS = frozenset({"promote", "workload", "verify", "cleanup", "inventory", "resume", "sprint"})
PROJECT_CONTROLS = frozenset({"unbound-member-refused", "non-member-refused", "control-discriminates"})
# project_fleet records each race as a check of its own; the verdict it carries lives under this key.
PROJECT_RACES = {"concurrent-enqueue": ("race", "ocn_race_enqueue"),
                 "concurrent-claim": ("claim_race", "ocn_race_claim")}
# The seven scores ocn_seat_session.perceive() writes, and the eight collections guild_dogfood's
# inventory() reads. Only these become property names: any other key could carry a box name or address.
PERCEPTION_SCORES = ("reachable_routes", "median_latency_ms", "prerendered_text_chars", "persona_vocabulary_hits",
                     "persona_vocabulary_coverage", "data_endpoints_ok", "data_endpoints_total")
INVENTORY_COLLECTIONS = frozenset({"missions", "workflows", "workflow_runs", "signals", "evidence", "forum_topics",
                                   "forum_replies", "wiki_pages"})
READ_ACTIONS = frozenset({"list", "wiki.list", "topic", "lessons", "presence-health", "realtime-health"})
HTTP_METHODS = frozenset({"GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"})

_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
# An email address. Masked to :email before anything is slugged (slug() turns "@" into "-", after which
# nothing would recognise it), and refused by the leak gate wherever one survives.
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
_RECORD_ID = re.compile(r"(?<![A-Za-z0-9])(?=[a-z]*[0-9])[a-z0-9]{15}(?![A-Za-z0-9])")
_DIGITS = re.compile(r"(?<![0-9])[0-9]{4,}(?![0-9])")
_NAME = re.compile(r"[a-z][a-z0-9_]{0,63}")
_LABEL = re.compile(r"[A-Za-z0-9_.:-]{1,64}")
_WANTED = re.compile(r"\((\d{3}) wanted\)", re.I)
_EXPECTS = re.compile(r"\(expects (\d{3})", re.I)


class Unsent(Exception):
    """A receipt that is withheld before anything is built or sent. `reason` is a bounded code."""

    def __init__(self, reason: str, ids: dict[str, str] | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.ids = ids or {}


# ── small helpers ────────────────────────────────────────────────────────────────────────────


@functools.lru_cache(maxsize=None)
def _sibling(name: str) -> Any:
    """A module next to this one, and only that module.

    Imported through this module's own package when it has one (scripts.ci under the tests), else loaded
    from HERE by its path. A `scripts` package elsewhere on the import path, as the release workstation's
    PYTHONPATH carries one, is never imported, so nothing from another tree can stand in for the leak rule.
    Imported only when a receipt is being published, so `run` loads none of them while its probe runs.
    """
    if __package__:
        module = importlib.import_module(__package__ + "." + name)
    else:
        module = sys.modules.get(name)
        if module is None or not _beside(module):
            spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
            if spec is None or spec.loader is None:
                raise ImportError("no module %s beside the publisher" % name)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            try:
                spec.loader.exec_module(module)
            except BaseException:
                sys.modules.pop(name, None)
                raise
    if not _beside(module):
        raise ImportError("%s does not sit beside the publisher" % name)
    return module


def _beside(module: Any) -> bool:
    location = getattr(module, "__file__", None)
    return bool(location) and Path(location).resolve().parent == HERE


def slug(text: object, limit: int = 64) -> str:
    value = re.sub(r"[^a-z0-9._-]+", "-", str(text).lower())
    value = re.sub(r"-{2,}", "-", value).strip("-._")
    return value[:limit].strip("-._")


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest12(path: Path | None) -> str:
    """First 12 hex of a file's sha256, or "" when it cannot be read."""
    if path is None:
        return ""
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:12]
    except OSError:
        return ""


def parse_time(value: object) -> dt.datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        stamp = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    return stamp if stamp.tzinfo else stamp.replace(tzinfo=dt.timezone.utc)


def iso(stamp: dt.datetime) -> str:
    return stamp.astimezone(dt.timezone.utc).isoformat()


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _text(value: object) -> str:
    return value if isinstance(value, str) else ""


def _rows(value: object) -> list[dict[str, Any]]:
    return [row for row in value if isinstance(row, dict)] if isinstance(value, list) else []


def _strings(value: object) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
        return None
    return max(-1, min(int(value), 10 ** 9))


def _number(value: object) -> int | float | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value == value and abs(value) != float("inf"):
        return round(value, 4)
    return None


def _bool(value: object) -> bool | None:
    return value if isinstance(value, bool) else None


def _allow(mapping: dict[str, Any], allowed: frozenset[str], prefixes: tuple[str, ...] = ()) -> dict[str, Any]:
    """Only documented keys leave: the fixed set, plus validated names under the given prefixes."""
    return {key: value for key, value in mapping.items() if value is not None and (
        key in allowed or (bool(prefixes) and key.startswith(prefixes) and bool(_NAME.fullmatch(key))))}


def _relative(path: Path) -> str:
    try:
        return Path(path).resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return Path(path).name


# ── the probe registry ───────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Probe:
    """One OCN probe, as far as publishing its receipt needs to know it."""

    name: str
    schema: str                      # the receipt's schema; "" when it is recognised by key shape
    mode: str                        # read | write: whether the probe changes its target
    ph_checks: bool                  # one PostHog event per check, or the run event only
    dd_event: str                    # always | judged: rbac cells send logs only unless judged
    commands: tuple[str, ...] | None  # publishable subcommands; None when every invocation is one
    write_path: str = ""             # repository-relative receipt the probe persists with --write
    env_default: str = "staging"     # "" when the probe takes --env but its receipt never records it


REGISTRY = (
    Probe("ocn_box_exercise", "", "write", True, "always", None),
    Probe("ocn_classroom_fleet", "buildanddo.ocn-classroom-fleet/v1", "write", True, "always", ("run",)),
    Probe("ocn_classroom_live", "buildanddo.ocn-classroom-live/v1", "write", True, "always", ("run",)),
    Probe("ocn_content_assessment", "buildanddo.ocn-content-assessment/v1", "read", False, "always", None),
    Probe("ocn_feature_sweep", "buildanddo.ocn-feature-sweep/v1", "read", False, "always", ("sweep",),
          "state/ocn_feature_sweep/{env}.latest.json"),
    Probe("ocn_guild_dogfood", "buildanddo.ocn-guild-dogfood/v1", "write", True, "always", None, env_default=""),
    Probe("ocn_guild_forum", "buildanddo.ocn-guild-forum/v1", "write", True, "always", None),
    Probe("ocn_journey_report", "buildanddo.ocn-journey-report/v1", "read", True, "always", ("walk",)),
    Probe("ocn_mission_lifecycle", "buildanddo.ocn-mission-lifecycle/v1", "write", True, "always", None),
    Probe("ocn_mission_work", "buildanddo.ocn-mission-work/v1", "write", True, "always", None, env_default=""),
    Probe("ocn_observation_record", "buildanddo.ocn-observation-record/v1", "write", True, "always", None),
    Probe("ocn_project_fleet", "buildanddo.ocn-project-fleet/v1", "write", False, "always", ("run",),
          "state/ocn_project_fleet/{env}.latest.json"),
    Probe("ocn_rbac_probe", "", "write", False, "judged", None),
    Probe("ocn_room_probe", "buildanddo.ocn-room-probe/v1", "write", True, "always", None, env_default=""),
    Probe("ocn_seat_session", "buildanddo.ocn-seat-session/v1", "read", True, "always", None),
    Probe("ocn_signal_lifecycle", "buildanddo.ocn-signal-lifecycle/v1", "write", True, "always", None),
    Probe("ocn_subsystem_probe", "buildanddo.ocn-subsystem-probe/v1", "write", False, "always", None),
)
PROBES = {probe.name: probe for probe in REGISTRY}


def normalize_probe(name: object) -> str:
    """Accept `ocn_feature_sweep`, `feature_sweep` or a script path; return the registry name or ""."""
    text = Path(str(name or "")).stem.strip().lower().replace("-", "_")
    if text and not text.startswith("ocn_"):
        text = "ocn_" + text
    return text if text in PROBES else ""


def detect_probe(receipt: dict[str, Any]) -> str:
    schema = receipt.get("schema")
    if isinstance(schema, str):
        return next((probe.name for probe in REGISTRY if probe.schema and probe.schema == schema), "")
    if "seat" in receipt and "op" in receipt and isinstance(receipt.get("result"), dict):
        return "ocn_rbac_probe"
    if "seat" in receipt and "mode" in receipt and isinstance(receipt.get("login"), dict):
        return "ocn_box_exercise"
    return ""


# The probes whose receipt names the subcommand that produced it: the receipt decides, not the argv.
COMMAND_RECEIPTS = frozenset({"ocn_classroom_fleet", "ocn_classroom_live", "ocn_project_fleet"})


def publishable(probe: Probe, receipt: dict[str, Any]) -> bool:
    """A selftest, a route list or a seat roll call shares its probe's schema and is never published."""
    if probe.commands is None:
        return True
    if probe.name in COMMAND_RECEIPTS:
        return receipt.get("command") == "run"
    if probe.name == "ocn_journey_report":
        return all(key in receipt for key in ("box", "env", "legs"))
    return all(key in receipt for key in ("box", "env", "checks"))


# ── what every adapter shares ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Catalogue:
    """Public canon the adapters and gates bound themselves to, read from the probes' own modules."""

    personas: dict[str, str]          # persona slug -> guild
    persona_pattern: re.Pattern[str]
    guilds: frozenset[str]
    features: tuple[str, ...]         # the sweep's non-control features: the ocn_feature enum
    legs: dict[str, dict[str, Any]]   # journey leg id -> method, path, control


@functools.lru_cache(maxsize=1)
def catalogue() -> Catalogue:
    seat = _sibling("ocn_seat_session")
    sweep = _sibling("ocn_feature_sweep")
    journey = _sibling("ocn_journey_report")
    canon = {guild: entry["persona"] for guild, entry in seat.GUILDMASTERS.items()}
    personas = {slug(persona): guild for guild, persona in canon.items()}
    words = [r"[ _-]?".join(re.escape(part) for part in persona.split())
             for persona in sorted(canon.values(), key=len, reverse=True)]
    pattern = re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(words) + r")(?![A-Za-z0-9])", re.I)
    features = tuple(row[0] for row in sweep.PROBES if not row[0].startswith("control."))
    legs = {leg["id"]: {"method": leg.get("method"), "path": leg.get("path"),
                        "control": bool(leg.get("control"))} for leg in journey.LEGS}
    return Catalogue(personas, pattern, frozenset(canon), features, legs)


def persona_tags() -> frozenset[str]:
    return frozenset(catalogue().personas) | {"multiple", "unplaced"}


def _mask(value: str, rule: Any, pad: str = "") -> str:
    """Emails become :email, machine names :box and addresses :addr, by the rules the leak gate applies."""
    redaction = _sibling("public_redaction")
    value = _EMAIL.sub(pad + ":email" + pad, value)
    value = rule.machine.sub(pad + ":box" + pad, value)
    value = redaction.IPV4.sub(pad + ":addr" + pad, value)
    return redaction.IPV6.sub(lambda match: pad + ":addr" + pad if redaction.real_v6(match.group(0))
                              else match.group(0), value)


def check_label(text: object, rule: Any, persona_pattern: re.Pattern[str]) -> str:
    """A bounded check id: "<gm> joins from <box>" becomes persona-joins-from-box."""
    value = _mask(str(text if text is not None else "")[:240], rule, " ")
    value = persona_pattern.sub(" :persona ", value)
    value = _UUID.sub(" :id ", value)
    value = _RECORD_ID.sub(" :id ", value)
    value = _DIGITS.sub(" :id ", value)
    return slug(value) or "unnamed"


def path_template(path: object, rule: Any) -> str | None:
    """Query and fragment dropped; the workspace segment becomes :workspace, record ids :id.

    The segment after `records` is a record id whatever its shape: about one PocketBase id in 130 has no
    digit, and the id pattern labels use needs one.
    """
    if not isinstance(path, str) or not path:
        return None
    segments = _mask(path.split("?", 1)[0].split("#", 1)[0][:240], rule).split("/")
    out = []
    for index, segment in enumerate(segments):
        previous = segments[index - 1] if index else ""
        if previous == "workspaces" and segment and segment != "records":
            out.append(":workspace")
        elif previous == "records" and segment:
            out.append(":id")
        elif re.fullmatch(r"[{<][^/]*[}>]", segment) or segment.isdigit():
            out.append(":id")
        elif _UUID.fullmatch(segment) or _RECORD_ID.fullmatch(segment):
            out.append(":id")
        else:
            out.append(re.sub(r"[^A-Za-z0-9._:~-]", "-", segment)[:48])
    return "/".join(out)[:160]


def state_label(state: object, vocabulary: Iterable[str]) -> str | None:
    if state is None or state == "":
        return None
    text = str(state)
    if re.fullmatch(r"HTTP_\d+", text):
        return "http_other"
    return text if text in vocabulary else "other"


def login_label(value: object) -> tuple[str, int | None]:
    """A probe's login result as one of LOGIN_STATES, with the HTTP code it carried."""
    text = _text(value)
    if text in ("LOGIN_OK", "SIGN_FAILED", "NOT_ATTEMPTED"):
        return text, None
    code = re.fullmatch(r"LOGIN_(\d{3})", text)
    if code:
        return "LOGIN_FAILED", int(code.group(1))
    return ("LOGIN_FAILED" if text else "other"), None


def reason_code(state: str, reason: object) -> str:
    """The receipt's reason prose is never sent. Only this bounded class of it is."""
    if state == "VOID":
        return "CONTROLS_FAILED"
    text = _text(reason).lower()
    if not text:
        return ""
    if "no ssh key" in text:
        return "NO_SSH_KEY"
    if "ssh timeout" in text:
        return "SSH_TIMEOUT"
    if "fleet map" in text:
        return "NOT_IN_FLEET_MAP"
    if text.startswith("sign"):
        return "SIGN_FAILED"
    if "login" in text or "sign in" in text:
        return "LOGIN_FAILED"
    return "OTHER"


@dataclass(frozen=True)
class Context:
    probe: Probe
    rule: Any
    fleet: dict[str, str] | None     # box id -> guildmaster, from the private map; None when unread
    cat: Catalogue
    expect: str | None = None
    env: str | None = None

    def label(self, text: object) -> str:
        return check_label(text, self.rule, self.cat.persona_pattern)


def _persona(value: object, cat: Catalogue) -> str:
    candidate = slug(value)
    return candidate if candidate in cat.personas else ""


def _unresolved() -> dict[str, Any]:
    return {"kind": "unresolved", "persona": "unplaced", "guild": "", "personas": []}


def _guildmaster(persona: str, cat: Catalogue) -> dict[str, Any]:
    return {"kind": "guildmaster", "persona": persona, "guild": cat.personas[persona],
            "personas": [persona]}


def actor_for_box(ctx: Context, box: object) -> dict[str, Any]:
    """One box, mapped to its guildmaster in memory. The box id itself goes no further."""
    if ctx.fleet is None or not isinstance(box, str) or box not in ctx.fleet:
        return _unresolved()
    persona = _persona(ctx.fleet[box], ctx.cat)
    if not persona:
        return {"kind": "unplaced", "persona": "unplaced", "guild": "", "personas": []}
    return _guildmaster(persona, ctx.cat)


def actor_for_persona(ctx: Context, persona_value: object, guild_value: object = None) -> dict[str, Any]:
    persona = _persona(persona_value, ctx.cat)
    if not persona or (guild_value is not None and _text(guild_value).lower() != ctx.cat.personas[persona]):
        return _unresolved()
    return _guildmaster(persona, ctx.cat)


def actor_for_many(ctx: Context, boxes: Iterable[object] = (), personas: Iterable[object] = ()) -> dict[str, Any]:
    found = {persona for persona in (_persona(value, ctx.cat) for value in personas) if persona}
    for box in boxes:
        if ctx.fleet is not None and isinstance(box, str) and box in ctx.fleet:
            persona = _persona(ctx.fleet[box], ctx.cat)
            if persona:
                found.add(persona)
    return {"kind": "multiple", "persona": "multiple", "guild": "", "personas": sorted(found)}


def _check(ctx: Context, index: int, label: object, kind: str, *, http: object = None, state: object = None,
           vocabulary: Iterable[str] = (), as_expected: object = None, is_control: bool = False,
           method: object = None, path: object = None, latency_ms: object = None,
           prerendered_chars: object = None) -> dict[str, Any]:
    verb = _text(method).upper()
    return {"id": ctx.label(label), "kind": kind if kind in CHECK_KINDS else "check", "index": index,
            "http": _int(http), "state": state_label(state, vocabulary),
            "as_expected": as_expected if isinstance(as_expected, bool) else None,
            "is_control": bool(is_control), "method": verb if verb in HTTP_METHODS else None,
            "path_template": path_template(path, ctx.rule), "latency_ms": _int(latency_ms),
            "prerendered_chars": _int(prerendered_chars)}


def _cap(checks: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """At most CHECK_CAP checks, and a control is never the one dropped."""
    if len(checks) <= CHECK_CAP:
        return checks, 0
    controls = [c for c in checks if c["is_control"]]
    others = [c for c in checks if not c["is_control"]][:max(0, CHECK_CAP - len(controls))]
    keep = {id(c) for c in controls + others}
    kept = [c for c in checks if id(c) in keep]
    return kept, len(checks) - len(kept)


def _env_of(ctx: Context, receipt: dict[str, Any], key: str = "env") -> str:
    """The receipt's own env, else --env, else the probe's default. A probe that takes --env but never
    records it has no default: guessing staging would tag a production run as staging."""
    value = receipt.get(key)
    if isinstance(value, str) and value:
        return value
    env = ctx.env if ctx.env in ENVS else ctx.probe.env_default
    if not env:
        raise Unsent("NO_ENV")
    return env


def _view(ctx: Context, receipt: dict[str, Any], *, actor: dict[str, Any], outcome: str, state: str,
          reason: str = "", controls_held: bool | None = None, checks: Iterable[dict[str, Any]] = (),
          measures: dict[str, Any] | None = None, lists: dict[str, list[str]] | None = None,
          labels: dict[str, str] | None = None, env: str | None = None, at: object = None,
          judged: bool = True) -> dict[str, Any]:
    checks = list(checks)
    controls = [c for c in checks if c["is_control"]]
    if controls_held is None and controls:
        controls_held = all(c["as_expected"] is True for c in controls)
    kept, truncated = _cap(checks)
    stamp = parse_time(at if at is not None else receipt.get("at") or receipt.get("observed_at"))
    return {
        "probe": ctx.probe.name, "schema": ctx.probe.schema or "key-shape",
        "env": env or _env_of(ctx, receipt), "at": iso(stamp) if stamp else None,
        "actor": actor, "outcome": outcome if outcome in OUTCOMES else "unmeasured",
        "state": state or "other", "reason_code": reason, "controls_held": controls_held,
        "judged": judged,
        "counts": {"checks_total": len(checks),
                   "checks_failed": sum(1 for c in checks if c["as_expected"] is False),
                   "checks_controls": len(controls), "checks_truncated": truncated},
        "measures": {name: value for name, value in ((n, _number(v)) for n, v in (measures or {}).items())
                     if value is not None and _NAME.fullmatch(name)},
        "lists": {name: [ctx.label(item) for item in values][:LIST_CAP]
                  for name, values in (lists or {}).items() if _NAME.fullmatch(name)},
        "labels": {name: value for name, value in (labels or {}).items()
                   if _NAME.fullmatch(name) and isinstance(value, str) and _LABEL.fullmatch(value)},
        "checks": kept,
    }


def _login_failed(receipt: dict[str, Any]) -> bool:
    return receipt.get("login") == "FAILED"


def _step_checks(ctx: Context, steps: object) -> list[dict[str, Any]]:
    """Steps that carry the probe's own `ok` judgement. A CONTROL prefix marks a control."""
    checks = []
    for index, row in enumerate(_rows(steps)):
        label = _text(row.get("step"))
        control = label.strip().upper().startswith("CONTROL")
        checks.append(_check(ctx, index, label, "control" if control else "step", http=row.get("http"),
                             as_expected=_bool(row.get("ok")), is_control=control))
    return checks


def _judged_state(ok: bool | None, yes: str, no: str) -> str:
    return "other" if ok is None else yes if ok else no


# ── adapters: one pure function per probe, allowlist only ────────────────────────────────────


def adapt_feature_sweep(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    state = _text(receipt.get("state"))
    broken, degraded = _strings(receipt.get("broken")), _strings(receipt.get("degraded"))
    missing = _strings(receipt.get("record_missing"))
    if state == "REPAIR_NEEDED":
        outcome = "fail" if broken else "degraded"
    else:
        outcome = {"PASS": "pass", "PARTIAL": "partial", "VOID": "void",
                   "UNMEASURED": "unmeasured"}.get(state, "unmeasured")
    checks = []
    for index, row in enumerate(_rows(receipt.get("checks"))):
        feature = _text(row.get("feature"))
        control = feature.startswith("control.")
        alive = _bool(row.get("alive"))
        # On a VOID sweep no row's status means what it says (the probe's own words), so only the
        # controls that voided it are judged.
        judged = alive is not None and row.get("state") != "UNMEASURABLE" and (control or state != "VOID")
        checks.append(_check(ctx, index, feature, "control" if control else "route", http=row.get("http"),
                             state=row.get("state"), vocabulary=SWEEP_STATES,
                             as_expected=alive if judged else None, is_control=control,
                             method=row.get("method"), path=row.get("path")))
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("box")), outcome=outcome,
                 state=state if state in SWEEP_RUN else "other",
                 reason=reason_code(state, receipt.get("reason")),
                 controls_held=_bool(receipt.get("controls_held")), checks=checks,
                 measures={"ocn_broken_count": len(broken), "ocn_degraded_count": len(degraded),
                           "ocn_record_missing_count": len(missing)},
                 lists={"ocn_broken": broken, "ocn_degraded": degraded, "ocn_record_missing": missing})


def adapt_journey_report(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    state = _text(receipt.get("state"))
    defects = _rows(receipt.get("defects"))
    if state == "DEFECTS":
        outcome = ("fail" if any(_text(row.get("verdict")) in ("BROKEN", "BLOCKED") for row in defects)
                   else "degraded")
    else:
        outcome = {"CLEAN": "pass", "VOID": "void", "UNMEASURED": "unmeasured"}.get(state, "unmeasured")
    checks = []
    for index, row in enumerate(_rows(receipt.get("legs"))):
        leg = _text(row.get("leg"))
        known = ctx.cat.legs.get(leg, {})
        control = bool(known.get("control")) or leg.startswith("control.")
        verdict = _text(row.get("verdict"))
        # A VOID walk has no verdict that means what it says: only its controls are judged.
        judged = verdict in JOURNEY_VERDICTS and (control or state != "VOID")
        checks.append(_check(ctx, index, leg, "control" if control else "leg", http=row.get("http"),
                             state=verdict, vocabulary=JOURNEY_VERDICTS,
                             as_expected=(verdict in ("OK", "REFUSED")) if judged else None,
                             is_control=control, method=known.get("method"), path=known.get("path")))
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("box")), outcome=outcome,
                 state=state if state in JOURNEY_RUN else "other",
                 reason=reason_code(state, receipt.get("reason")),
                 controls_held=_bool(receipt.get("controls_held")), checks=checks,
                 lists={"ocn_defect_legs": [_text(row.get("leg")) for row in defects]})


def _contract_checks(ctx: Context, rows: object, controls: Iterable[str] = ()) -> list[dict[str, Any]]:
    """Checks recorded as AS_EXPECTED or CONTRACT_BROKEN by the classroom and project orchestrators."""
    named = set(controls)
    checks = []
    for index, row in enumerate(_rows(rows)):
        label = _text(row.get("check"))
        control = label.strip().upper().startswith("CONTROL") or label in named
        kind = "control" if control else "login" if label == "login" else "step"
        outcome = _text(row.get("outcome"))
        checks.append(_check(ctx, index, label, kind, http=row.get("http"), state=outcome,
                             vocabulary=CONTRACT_OUTCOMES,
                             as_expected=(outcome == "AS_EXPECTED") if outcome in CONTRACT_OUTCOMES else None,
                             is_control=control))
    return checks


def adapt_classroom_fleet(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    state = _text(receipt.get("state"))
    seats = _rows(receipt.get("seats"))
    summary = receipt.get("summary") if isinstance(receipt.get("summary"), dict) else {}
    readback = receipt.get("readback") if isinstance(receipt.get("readback"), dict) else {}
    boxes = [seat.get("box") for seat in seats] + [row.get("box") for row in _rows(receipt.get("checks"))]
    return _view(ctx, receipt, actor=actor_for_many(ctx, boxes, [seat.get("guildmaster") for seat in seats]),
                 outcome={"PASS": "pass", "FAIL": "fail"}.get(state, "unmeasured"),
                 state=state if state in CLASSROOM_RUN else "other",
                 reason=reason_code(state, receipt.get("reason")),
                 checks=_contract_checks(ctx, receipt.get("checks")),
                 env=_env_of(ctx, receipt, "environment"), at=receipt.get("observed_at"),
                 measures={"ocn_machines": summary.get("machines"),
                           "ocn_distinct_source_ips": summary.get("distinct_source_ips"),
                           "ocn_participants": readback.get("participants"),
                           "ocn_messages": readback.get("messages")})


def adapt_classroom_live(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    state = _text(receipt.get("state"))
    readback = receipt.get("readback") if isinstance(receipt.get("readback"), dict) else {}
    personas = [receipt.get("host"), *_strings(receipt.get("joiners"))]
    return _view(ctx, receipt, actor=actor_for_many(ctx, (), personas),
                 outcome={"PASS": "pass", "FAIL": "fail"}.get(state, "unmeasured"),
                 state=state if state in CLASSROOM_RUN else "other",
                 reason=reason_code(state, receipt.get("reason")),
                 checks=_contract_checks(ctx, receipt.get("checks")),
                 env=_env_of(ctx, receipt, "environment"), at=receipt.get("observed_at"),
                 measures={"ocn_participants": readback.get("participants"),
                           "ocn_messages": readback.get("messages")})


def adapt_project_fleet(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    state = _text(receipt.get("state"))
    rows = _rows(receipt.get("checks"))
    checks = _contract_checks(ctx, rows, PROJECT_CONTROLS)
    labels = {}
    verdicts = {}
    for name, (key, label) in PROJECT_RACES.items():
        race = receipt.get(key) if isinstance(receipt.get(key), dict) else {}
        verdict = _text(race.get("verdict"))
        if verdict:
            verdicts[name] = labels[label] = state_label(verdict, RACE_VERDICTS) or "other"
    # The probe records each race as a check of its own and judges it; that row becomes the race check.
    # Adding a second one would count a double claim twice.
    for row, check in zip(rows, checks):
        name = _text(row.get("check"))
        if name in PROJECT_RACES:
            check["kind"] = "race"
            check["state"] = verdicts.get(name, check["state"])
    machines = receipt.get("machines") if isinstance(receipt.get("machines"), dict) else {}
    return _view(ctx, receipt, actor=actor_for_many(ctx, list(machines)),
                 outcome={"PASS": "pass", "CONTRACT_BROKEN": "fail",
                          "UNMEASURED": "unmeasured"}.get(state, "unmeasured"),
                 state=state if state in PROJECT_RUN else "other",
                 reason=reason_code(state, receipt.get("reason")), checks=checks,
                 at=receipt.get("observed_at"), labels=labels,
                 measures={"ocn_distinct_public_ips": receipt.get("distinct_public_ips")})


def _seat_step(ctx: Context, index: int, row: dict[str, Any]) -> dict[str, Any] | None:
    step = row.get("step")
    if step == "ocn_login":
        label, code = login_label(row.get("result"))
        return _check(ctx, index, "login", "login", http=code, state=label, vocabulary=LOGIN_STATES,
                      as_expected=label == "LOGIN_OK")
    # Raw text goes to the label, never slug() first: slugging turns an email into something _mask no
    # longer recognises.
    if step == "pageview":
        route = _text(row.get("route"))
        return _check(ctx, index, "route." + (route.strip("/") or "home"), "route",
                      http=row.get("http"), method="GET", path=route, latency_ms=row.get("ms"),
                      prerendered_chars=row.get("prerendered_chars"))
    if step == "data":
        path = _text(row.get("path"))
        name = Path(path).stem.lstrip("_") or "document"
        return _check(ctx, index, "data." + name, "data", http=row.get("http"), method="GET", path=path)
    if step == "api_read":
        collection = _text(row.get("collection")) or "collection"
        return _check(ctx, index, "collection." + collection, "collection", http=row.get("http"),
                      method="GET", path="/api/collections/%s/records" % collection)
    return None


def _perception(receipt: dict[str, Any]) -> dict[str, Any]:
    """perc_* numbers from the seat's perception score, for the scores perceive() writes and no other key.
    Words and prose stay in the receipt."""
    perception = receipt.get("perception") if isinstance(receipt.get("perception"), dict) else {}
    score = perception.get("score") if isinstance(perception.get("score"), dict) else {}
    measures: dict[str, Any] = {}
    for key in PERCEPTION_SCORES:
        if key not in score:
            continue
        value = score[key]
        name = "perc_" + key
        ratio = re.fullmatch(r"(\d+)/(\d+)", value) if isinstance(value, str) else None
        if ratio:
            measures[name], measures[name + "_total"] = int(ratio.group(1)), int(ratio.group(2))
        elif isinstance(value, list):
            measures[name + "_count"] = len(value)
        else:
            measures[name] = value
    if isinstance(perception.get("observations"), list):
        measures["perc_observation_count"] = len(perception["observations"])
    return measures


def adapt_seat_session(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    identity = receipt.get("identity") if isinstance(receipt.get("identity"), dict) else {}
    if identity.get("state") == "REFUSED":
        # COMMUNITY-WEB-001 R6: a seat that could not say who it is refused before any network call.
        # Its refusal is not published anywhere either.
        raise Unsent("IDENTITY_REFUSED")
    login, _ = login_label(receipt.get("login"))
    checks = [check for check in (_seat_step(ctx, index, row)
                                  for index, row in enumerate(_rows(receipt.get("replay"))))
              if check is not None]
    return _view(ctx, receipt, actor=actor_for_persona(ctx, receipt.get("persona"), receipt.get("guild")),
                 outcome="pass" if login == "LOGIN_OK" else "fail",
                 state=login if login in LOGIN_STATES else "other",
                 reason="" if login == "LOGIN_OK" else "SIGN_FAILED" if login == "SIGN_FAILED" else "LOGIN_FAILED",
                 checks=checks, measures=_perception(receipt))


def adapt_rbac_probe(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    result = receipt.get("result") if isinstance(receipt.get("result"), dict) else {}
    state = _text(result.get("state"))
    op = _text(receipt.get("op"))
    judged = ctx.expect in ("allow", "deny")
    as_expected = None
    if state == "LOGIN_FAILED":
        outcome, reason = "fail", "LOGIN_FAILED"
    elif state == "TRANSPORT_FAULT" or state not in RBAC_STATES:
        outcome, reason = "unmeasured", "OTHER"
    elif judged:
        as_expected = state == ("ALLOWED" if ctx.expect == "allow" else "DENIED")
        outcome, reason = ("pass" if as_expected else "fail"), ""
    else:
        outcome, reason = "observed", ""
    check = _check(ctx, 0, "op." + (op if op in RBAC_OPS else "other"), "op", http=result.get("http"),
                   state=state, vocabulary=RBAC_STATES, as_expected=as_expected)
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")), outcome=outcome,
                 state=state if state in RBAC_STATES else "other", reason=reason, checks=[check],
                 judged=judged, labels={"ocn_expect": ctx.expect} if judged else None)


def _wanted(label: str, http: int | None) -> bool | None:
    """The only expectation box_exercise states is in its own step labels."""
    if http is None:
        return None
    if "(refusal wanted)" in label.lower():
        return 400 <= http < 500
    code = _WANTED.search(label) or _EXPECTS.search(label)
    return http == int(code.group(1)) if code else None


def adapt_box_exercise(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    login = receipt.get("login") if isinstance(receipt.get("login"), dict) else {}
    state, code = login_label(login.get("state"))
    checks = [_check(ctx, 0, "login", "login", http=code, state=state, vocabulary=LOGIN_STATES,
                     as_expected=state == "LOGIN_OK")]
    if "control_absent_collection" in receipt:
        code = _int(receipt.get("control_absent_collection"))
        checks.append(_check(ctx, len(checks), "control.absent-collection", "control", http=code,
                             as_expected=(code == 404) if code is not None else None, is_control=True))
    reads = receipt.get("authenticated_reads") if isinstance(receipt.get("authenticated_reads"), dict) else {}
    for name, read in reads.items():
        read = read if isinstance(read, dict) else {}
        checks.append(_check(ctx, len(checks), "collection." + (str(name) or "collection"), "collection",
                             http=read.get("http"), method="GET"))
    for row in _rows(receipt.get("steps")):
        label = _text(row.get("step"))
        control = label.strip().upper().startswith("CONTROL")
        checks.append(_check(ctx, len(checks), label, "control" if control else "step", http=row.get("http"),
                             as_expected=_wanted(label, _int(row.get("http"))), is_control=control))
    if state != "LOGIN_OK":
        outcome, reason = "fail", "SIGN_FAILED" if state == "SIGN_FAILED" else "LOGIN_FAILED"
    elif receipt.get("error"):
        outcome, reason = "error", "OTHER"
    else:
        outcome, reason = "observed", ""
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")), outcome=outcome,
                 state=state, reason=reason, checks=checks)


def adapt_content_assessment(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    failed = _login_failed(receipt)
    summary = receipt.get("summary") if isinstance(receipt.get("summary"), dict) else {}
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")),
                 outcome="fail" if failed else "observed", state="LOGIN_FAILED" if failed else "ASSESSED",
                 reason="LOGIN_FAILED" if failed else "",
                 checks=[_check(ctx, 0, "login", "login", state="LOGIN_FAILED" if failed else "LOGIN_OK",
                                vocabulary=LOGIN_STATES, as_expected=not failed)],
                 measures={"ocn_stable": summary.get("STABLE"), "ocn_working": summary.get("WORKING"),
                           "ocn_needs_work": summary.get("NEEDS_WORK"), "ocn_lessons": summary.get("total"),
                           "ocn_broken_references": summary.get("broken_references"),
                           "ocn_unanswerable_checks": summary.get("unanswerable_checks"),
                           "ocn_dangling_prerequisites": summary.get("dangling_prerequisites"),
                           "ocn_registered_routes": receipt.get("registered_routes"),
                           "ocn_tutorials": receipt.get("tutorials")})


def adapt_guild_dogfood(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    action = _text(receipt.get("action"))
    checks = _step_checks(ctx, receipt.get("steps"))
    measures: dict[str, Any] = {}

    def add(label: str, kind: str, **fields: Any) -> None:
        checks.append(_check(ctx, len(checks), label, kind, **fields))

    for number, row in enumerate(_rows(receipt.get("promoted")), 1):
        add("proposal.%d" % number, "op", http=row.get("signal_http", row.get("evidence_http")),
            as_expected=bool(row.get("signal")))
    for number, row in enumerate(_rows(receipt.get("signals_bound")), 1):
        add("bind-signal.%d" % number, "op", http=row.get("http"))
    for row in _rows(receipt.get("missions")):
        guild = _text(row.get("guild"))
        add("sprint." + (guild if guild in ctx.cat.guilds else "other"), "op", http=row.get("http"),
            state=row.get("state"), vocabulary=SPRINT_STATES)
    inventory = receipt.get("inventory") if isinstance(receipt.get("inventory"), dict) else {}
    for name, entry in inventory.items():
        entry = entry if isinstance(entry, dict) else {}
        known = name if name in INVENTORY_COLLECTIONS else "other"
        add("inventory." + known, "collection", http=200 if "total" in entry else entry.get("http"))
        if known != "other":
            measures["ocn_inventory_" + known] = entry.get("total")
    verified = receipt.get("verified") if isinstance(receipt.get("verified"), dict) else {}
    for key in ("mission_readable", "mission_running", "mission_has_approval"):
        if key in verified:
            add("verify." + key, "check", as_expected=_bool(verified.get(key)))
    for key in ("signals_bound_to_mission", "signals_whose_evidence_names_a_source"):
        if key in verified:
            measures["ocn_" + key] = verified.get(key)
    for number, row in enumerate(_rows(receipt.get("removed")), 1):
        code = _int(row.get("http"))
        add("cleanup.%d" % number, "op", http=code, as_expected=(code in (200, 204)) if code is not None else None)
    if _login_failed(receipt):
        outcome, reason, state = "fail", "LOGIN_FAILED", "LOGIN_FAILED"
    elif receipt.get("crashed"):
        outcome, reason, state = "error", "OTHER", "CRASHED"
    else:
        outcome, reason, state = "observed", "", "COMPLETED"
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")), outcome=outcome,
                 state=state, reason=reason, checks=checks, measures=measures,
                 labels={"ocn_action": action if action in DOGFOOD_ACTIONS else "other"})


def _answer_state(code: int | None) -> str:
    """What one request's status says. Both probes record a request that got no answer as http 0."""
    if code in (200, 201):
        return "ACCEPTED"
    if not code:
        return "TRANSPORT_FAULT"
    return "SERVER_ERROR" if code >= 500 else "REFUSED"


def _one_command(ctx: Context, receipt: dict[str, Any], actions: frozenset[str]) -> dict[str, Any]:
    """guild_forum and room_probe: one command or read per invocation, passing only on 200 or 201."""
    action = _text(receipt.get("action"))
    known = action if action in actions else "other"
    result = receipt.get("result") if isinstance(receipt.get("result"), dict) else {}
    code = _int(result.get("http"))
    ok = code in (200, 201)
    failed = _login_failed(receipt)
    checks = [] if failed else [_check(ctx, 0, ("read." if known in READ_ACTIONS else "command.") + known,
                                       "command", http=code, as_expected=ok)]
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")),
                 outcome="pass" if ok and not failed else "fail",
                 state="LOGIN_FAILED" if failed else _answer_state(code),
                 reason="LOGIN_FAILED" if failed else "", checks=checks, labels={"ocn_action": known})


def adapt_guild_forum(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    return _one_command(ctx, receipt, FORUM_ACTIONS)


def adapt_room_probe(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    return _one_command(ctx, receipt, ROOM_ACTIONS)


def adapt_mission_lifecycle(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    summary = receipt.get("summary") if isinstance(receipt.get("summary"), dict) else {}
    reached = summary.get("reached_verified") is True
    failed = _login_failed(receipt)
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")),
                 outcome="pass" if reached else "fail",
                 state="LOGIN_FAILED" if failed else _judged_state(reached, "REACHED_VERIFIED", "NOT_VERIFIED"),
                 reason="LOGIN_FAILED" if failed else "", checks=_step_checks(ctx, receipt.get("steps")),
                 measures={"ocn_failed_steps": len(_strings(summary.get("failed")))})


def adapt_mission_work(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    failed = _login_failed(receipt)
    created = [item for item in _strings(receipt.get("created")) if item]
    checks = []
    for number, row in enumerate(_rows(receipt.get("results")), 1):
        kind = _text(row.get("kind"))
        checks.append(_check(ctx, len(checks), "%s.%d" % (kind if kind in ("evidence", "correction", "workflow")
                                                           else "item", number),
                             "op", http=row.get("http"), as_expected=bool(row.get("id"))))
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")),
                 outcome="pass" if created else "fail",
                 state="LOGIN_FAILED" if failed else _judged_state(bool(created), "CREATED", "NOTHING_CREATED"),
                 reason="LOGIN_FAILED" if failed else "", checks=checks,
                 measures={"ocn_created": len(created), "ocn_results": len(checks)})


def adapt_observation_record(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    failed = _login_failed(receipt)
    chain = receipt.get("chain") if isinstance(receipt.get("chain"), dict) else {}
    provable = receipt.get("provable") if isinstance(receipt.get("provable"), dict) else {}
    checks = []
    for link in ("mission", "evidence", "signal"):
        if link in chain:
            value = chain[link]
            checks.append(_check(ctx, len(checks), "chain." + link, "step",
                                 http=value.get("http") if isinstance(value, dict) else None,
                                 as_expected=isinstance(value, str) and bool(value)))
    for key in ("signal_names_mission", "signal_cites_evidence", "evidence_names_mission",
                "evidence_source_is_forum_post"):
        if key in provable:
            checks.append(_check(ctx, len(checks), "provable." + key, "check", as_expected=_bool(provable[key])))
    for key, name in (("signal_readback_http", "readback.signal"), ("evidence_readback_http", "readback.evidence")):
        if key in provable:
            checks.append(_check(ctx, len(checks), name, "check", http=provable[key]))
    intact = provable.get("chain_intact") is True
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")),
                 outcome="pass" if intact else "fail",
                 state="LOGIN_FAILED" if failed else _judged_state(intact, "CHAIN_INTACT", "CHAIN_BROKEN"),
                 reason="LOGIN_FAILED" if failed else "", checks=checks)


def adapt_signal_lifecycle(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    failed = _login_failed(receipt)
    summary = receipt.get("summary") if isinstance(receipt.get("summary"), dict) else {}
    clean = not failed and isinstance(summary.get("failed"), list) and not summary["failed"]
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")),
                 outcome="pass" if clean else "fail",
                 state="LOGIN_FAILED" if failed else _judged_state(clean, "NO_FAILED_STEPS", "FAILED_STEPS"),
                 reason="LOGIN_FAILED" if failed else "", checks=_step_checks(ctx, receipt.get("steps")),
                 measures={"ocn_signals_raised": summary.get("signals_raised"),
                           "ocn_state_machine_enforced": _bool(summary.get("state_machine_enforced")),
                           "ocn_can_promote_signal_to_mission": _bool(summary.get("can_promote_signal_to_mission"))})


def adapt_subsystem_probe(receipt: dict[str, Any], ctx: Context) -> dict[str, Any]:
    failed = _login_failed(receipt)
    checks = []
    for index, row in enumerate(_rows(receipt.get("checks"))):
        subsystem = _text(row.get("subsystem"))
        control = subsystem == "control"
        state = row.get("state")
        checks.append(_check(ctx, index, subsystem + "." + _text(row.get("check")), "control" if control else "check",
                             http=row.get("http"), state=state, vocabulary=SUBSYSTEM_STATES,
                             as_expected=(state == "ROUTE_ABSENT") if control else None, is_control=control,
                             method=row.get("method"), path=row.get("path")))
    summary = receipt.get("summary") if isinstance(receipt.get("summary"), dict) else {}
    # Its control is reported and never gates the outcome: the probe itself exits 0 whatever it finds.
    return _view(ctx, receipt, actor=actor_for_box(ctx, receipt.get("seat")),
                 outcome="fail" if failed else "observed", state="LOGIN_FAILED" if failed else "PROBED",
                 reason="LOGIN_FAILED" if failed else "", checks=checks,
                 measures={"ocn_route_absent": summary.get("route_absent"), "ocn_ok": summary.get("ok"),
                           "ocn_refused_or_contract": summary.get("refused_or_contract"),
                           "ocn_dependency_missing": summary.get("dependency_missing"),
                           "ocn_transport_fault": summary.get("transport_fault")})


ADAPTERS: dict[str, Callable[[dict[str, Any], Context], dict[str, Any]]] = {
    "ocn_box_exercise": adapt_box_exercise,
    "ocn_classroom_fleet": adapt_classroom_fleet,
    "ocn_classroom_live": adapt_classroom_live,
    "ocn_content_assessment": adapt_content_assessment,
    "ocn_feature_sweep": adapt_feature_sweep,
    "ocn_guild_dogfood": adapt_guild_dogfood,
    "ocn_guild_forum": adapt_guild_forum,
    "ocn_journey_report": adapt_journey_report,
    "ocn_mission_lifecycle": adapt_mission_lifecycle,
    "ocn_mission_work": adapt_mission_work,
    "ocn_observation_record": adapt_observation_record,
    "ocn_project_fleet": adapt_project_fleet,
    "ocn_rbac_probe": adapt_rbac_probe,
    "ocn_room_probe": adapt_room_probe,
    "ocn_seat_session": adapt_seat_session,
    "ocn_signal_lifecycle": adapt_signal_lifecycle,
    "ocn_subsystem_probe": adapt_subsystem_probe,
}


# ── the private fleet map ────────────────────────────────────────────────────────────────────


def fleet_map_path(explicit: object = None) -> Path:
    """--fleet-map, then CITADEL_FLEET_MAP, then the orchestrators' own estate default."""
    for candidate in (explicit, os.environ.get(FLEET_ENV, "")):
        if isinstance(candidate, (str, Path)) and str(candidate).strip():
            return Path(str(candidate).strip())
    return ESTATE_FLEET_MAP


def load_fleet(path: Path) -> dict[str, str] | None:
    """Box id -> guildmaster slug ("" for a box with none). None when the map cannot be read."""
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    boxes = document.get("boxes") if isinstance(document, dict) else None
    if not isinstance(boxes, dict):
        return None
    return {str(box): _text(entry.get("guildmaster")) if isinstance(entry, dict) else ""
            for box, entry in boxes.items()}


# ── builders ─────────────────────────────────────────────────────────────────────────────────


def event_uuid(sha: str, suffix: str) -> str:
    return str(uuid.uuid5(NAMESPACE, sha + suffix))


def _stamp(at: dt.datetime, offset_ms: int = 0) -> str:
    return iso(at + dt.timedelta(milliseconds=offset_ms))


def _ph_common(view: dict[str, Any], run_id: str) -> dict[str, Any]:
    return {"is_ocn_agent": True, "$lib": LIB, "$lib_version": LIB_VERSION,
            "$process_person_profile": False, "$geoip_disable": True, "ocn_contract": CONTRACT,
            "ocn_run_id": run_id, "ocn_probe": view["probe"], "ocn_env": view["env"],
            "ocn_persona": view["actor"]["persona"]}


def posthog_batch(view: dict[str, Any], ids: dict[str, str], digests: dict[str, str], at: dt.datetime,
                  probe: Probe) -> list[dict[str, Any]]:
    """One ocn_probe_run event, plus one ocn_probe_check per check when the probe is marked for it."""
    distinct = "ocn:" + view["actor"]["persona"]
    common = _ph_common(view, ids["run_id"])
    counts = view["counts"]
    run = dict(common)
    run.update({"ocn_receipt_sha256": ids["sha"][:16], "ocn_publisher_digest": digests["publisher"],
                "ocn_probe_digest": digests["probe"], "ocn_receipt_schema": view["schema"],
                "ocn_mode": probe.mode, "ocn_actor": view["actor"]["kind"], "ocn_guild": view["actor"]["guild"],
                "ocn_personas": view["actor"]["personas"], "ocn_outcome": view["outcome"],
                "ocn_state": view["state"], "ocn_reason_code": view["reason_code"] or None,
                "ocn_controls_held": view["controls_held"], "ocn_checks_total": counts["checks_total"],
                "ocn_checks_failed": counts["checks_failed"], "ocn_checks_controls": counts["checks_controls"],
                "ocn_checks_truncated": counts["checks_truncated"]})
    for extra in (view["measures"], view["lists"], view["labels"]):
        run.update({key: value for key, value in extra.items() if key not in run})
    events = [{"event": "ocn_probe_run", "distinct_id": distinct, "uuid": event_uuid(ids["sha"], ":run"),
               "timestamp": _stamp(at), "properties": _allow(run, PH_RUN_KEYS, ("ocn_", "perc_"))}]
    if probe.ph_checks:
        for check in view["checks"]:
            properties = dict(common)
            properties.update({"ocn_check": check["id"], "ocn_check_kind": check["kind"],
                               "ocn_check_index": check["index"], "ocn_http": check["http"],
                               "ocn_check_state": check["state"], "ocn_as_expected": check["as_expected"],
                               "ocn_is_control": check["is_control"], "ocn_method": check["method"],
                               "ocn_path_template": check["path_template"], "ocn_latency_ms": check["latency_ms"],
                               "ocn_prerendered_chars": check["prerendered_chars"]})
            events.append({"event": "ocn_probe_check", "distinct_id": distinct,
                           "uuid": event_uuid(ids["sha"], ":check:%d" % check["index"]),
                           "timestamp": _stamp(at, check["index"] + 1),
                           "properties": _allow(properties, PH_CHECK_KEYS)})
    return events


def posthog_control(view: dict[str, Any], ids: dict[str, str], at: dt.datetime) -> dict[str, Any]:
    """The twin that goes out under an invalid key. It answers 200 and must never be stored."""
    properties = dict(_ph_common(view, ids["run_id"]))
    properties["ocn_control"] = "invalid_key"
    return {"event": "ocn_telemetry_control", "distinct_id": "ocn:control",
            "uuid": event_uuid(ids["sha"], ":control"), "timestamp": _stamp(at),
            "properties": _allow(properties, PH_CONTROL_KEYS)}


def invalid_capture_key() -> str:
    """A capture key no PostHog project can hold: real keys never contain a hyphen."""
    return "_".join(("phc", "-".join(("ocn", "invalid", "control"))))


def dd_tags(view: dict[str, Any], run_id: str | None = None) -> list[str]:
    tags = ["service:" + SERVICE, "env:" + view["env"], "team:" + TEAM, "ocn_probe:" + view["probe"]]
    if run_id is not None:
        tags += ["ocn_outcome:" + view["outcome"], "ocn_persona:" + view["actor"]["persona"],
                 "ocn_run:" + run_id]
    return tags


def dd_event(view: dict[str, Any], ids: dict[str, str], digests: dict[str, str], at: dt.datetime) -> dict[str, Any]:
    counts = view["counts"]
    failing = [check["id"] for check in view["checks"] if check["as_expected"] is False][:20]
    held = view["controls_held"]
    lines = ["- Outcome: %s (state: %s)" % (view["outcome"], view["state"]),
             "- Checks: %d, failed %d, controls %d, truncated %d" % (
                 counts["checks_total"], counts["checks_failed"], counts["checks_controls"],
                 counts["checks_truncated"]),
             "- Controls held: %s" % ("n/a" if held is None else "yes" if held else "NO"),
             "- Failing checks: %s" % (", ".join(failing) or "none"),
             "- Run: %s" % ids["run_id"],
             "- Publisher %s, probe %s" % (digests["publisher"] or "-", digests["probe"] or "-")]
    short = view["probe"][len("ocn_"):]
    return {"title": ("OCN %s on %s: %s" % (short, view["env"], view["outcome"].upper()))[:120],
            "text": "%%%\n" + "\n".join(lines)[:3990] + "\n%%%",
            "alert_type": ALERT_TYPE.get(view["outcome"], "info"), "source_type_name": "buildanddo",
            "aggregation_key": "ocn-%s-%s" % (short, view["env"]),
            "date_happened": int(at.timestamp()), "tags": dd_tags(view, ids["run_id"])}


def _yes(value: bool | None) -> str:
    return "unjudged" if value is None else "true" if value else "false"


def dd_logs(view: dict[str, Any], ids: dict[str, str], digests: dict[str, str],
            at: dt.datetime) -> list[dict[str, Any]]:
    """One run summary and one log per check. No hostname, so no machine rides along."""
    tags = ",".join(dd_tags(view, ids["run_id"]))
    counts = view["counts"]
    actor = view["actor"]
    stamp_ms = int(at.timestamp() * 1000)
    base = {"run_id": ids["run_id"], "receipt_sha256": ids["sha"], "probe": view["probe"], "env": view["env"],
            "persona": actor["persona"], "guild": actor["guild"]}
    status = "error" if view["outcome"] == "error" else "warn" if view["outcome"] in ("fail", "void") else "info"
    summary = dict(base)
    summary.update({"outcome": view["outcome"], "state": view["state"], "reason_code": view["reason_code"],
                    "controls_held": view["controls_held"], "publisher_digest": digests["publisher"],
                    "probe_digest": digests["probe"], **counts})
    logs = [{"ddsource": SERVICE, "service": SERVICE, "ddtags": tags, "status": status, "timestamp": stamp_ms,
             "message": "ocn %s %s run %s checks=%d failed=%d controls_held=%s run=%s" % (
                 view["probe"], view["env"], view["outcome"], counts["checks_total"], counts["checks_failed"],
                 _yes(view["controls_held"]), ids["run_id"]),
             "ocn": _allow(summary, DD_RUN_ATTRS)}]
    for check in view["checks"]:
        level = ("error" if check["is_control"] and check["as_expected"] is False
                 else "warn" if check["as_expected"] is False else "info")
        attributes = dict(base)
        attributes.update({"check": check["id"], "check_kind": check["kind"], "check_index": check["index"],
                           "http": check["http"], "state": check["state"], "as_expected": check["as_expected"],
                           "is_control": check["is_control"], "method": check["method"],
                           "path_template": check["path_template"], "latency_ms": check["latency_ms"]})
        logs.append({"ddsource": SERVICE, "service": SERVICE, "ddtags": tags, "status": level,
                     "timestamp": stamp_ms + check["index"] + 1,
                     "message": "ocn %s %s %s %s http=%s expected=%s run=%s" % (
                         view["probe"], view["env"], check["id"], check["state"] or "-",
                         "-" if check["http"] is None else check["http"], _yes(check["as_expected"]),
                         ids["run_id"]),
                     "ocn": _allow(attributes, DD_CHECK_ATTRS)})
    return logs


def dd_series(view: dict[str, Any], at: dt.datetime, features: Iterable[str]) -> list[dict[str, Any]]:
    """Opt-in gauges. GAUGE, so a re-send overwrites the point; no host, no run id, no persona."""
    gauge = _sibling("emit_datadog_metrics").GAUGE
    stamp = int(at.timestamp())
    base = dd_tags(view)
    series = []

    def point(name: str, value: float, extra: tuple[str, ...] = ()) -> None:
        series.append({"metric": name, "type": gauge, "points": [{"timestamp": stamp, "value": float(value)}],
                       "tags": sorted(base + list(extra))})

    point(METRIC_MEASURED, MEASURED_VALUE.get(view["outcome"], 0.0))
    # A failure count is a verdict too, so it goes only where the outcome gauge goes (pass, degraded, fail).
    # A void run's rows mean nothing by the probe's own account, and the other outcomes pass no verdict.
    if view["outcome"] in OUTCOME_VALUE:
        point(METRIC_OUTCOME, OUTCOME_VALUE[view["outcome"]])
        point(METRIC_FAILED, view["counts"]["checks_failed"])
    known = set(features)
    if view["probe"] == "ocn_feature_sweep" and view["controls_held"] is True:
        for check in view["checks"]:
            if (not check["is_control"] and check["as_expected"] is not None and check["id"] in known
                    and check["state"] != "UNMEASURABLE"):
                point(METRIC_ALIVE, 1.0 if check["as_expected"] else 0.0, ("ocn_feature:" + check["id"],))
    return series


def series_ceiling(features: Iterable[str]) -> int:
    """Worst-case distinct series: three run gauges per env and probe, and one per env and feature."""
    return 3 * len(ENVS) * len(PROBES) + len(ENVS) * len(tuple(features))


# ── gates ────────────────────────────────────────────────────────────────────────────────────


def tag_gate(bodies: dict[str, Any], cat: Catalogue) -> list[str]:
    """Every Datadog tag key inside its set and every value inside its enum. Problems name keys only."""
    enums = {"service": {SERVICE}, "env": set(ENVS), "team": {TEAM}, "ocn_probe": set(PROBES),
             "ocn_outcome": set(OUTCOMES), "ocn_persona": set(persona_tags()), "ocn_feature": set(cat.features)}
    problems: list[str] = []

    def check(where: str, tags: Iterable[object], allowed: frozenset[str]) -> None:
        for tag in tags:
            key, sep, value = str(tag).partition(":")
            if not sep or key not in allowed:
                problems.append("%s: tag key outside the allowed set" % where)
            elif key == "ocn_run":
                if not _UUID.fullmatch(value):
                    problems.append("%s: ocn_run is not a run id" % where)
            elif value not in enums[key]:
                problems.append("%s: %s value outside its enum" % (where, key))

    event = bodies.get("datadog.event")
    if isinstance(event, dict):
        check("datadog.event", event.get("tags") or [], EVENT_TAG_KEYS)
        if "host" in event:
            problems.append("datadog.event: carries a host")
    for record in bodies.get("datadog.logs") or []:
        check("datadog.logs", str(record.get("ddtags") or "").split(","), EVENT_TAG_KEYS)
        if "hostname" in record or "host" in record:
            problems.append("datadog.logs: carries a hostname")
    series = bodies.get("datadog.series") or []
    for item in series:
        metric = item.get("metric")
        if metric not in METRICS:
            problems.append("datadog.series: metric outside the catalogue")
        allowed = SERIES_TAG_KEYS | ({"ocn_feature"} if metric == METRIC_ALIVE else set())
        check("datadog.series", item.get("tags") or [], frozenset(allowed))
        if "resources" in item or "host" in item:
            problems.append("datadog.series: carries a resource or host")
    if series and series_ceiling(cat.features) > SERIES_CEILING:
        problems.append("datadog.series: the catalogue exceeds %d series" % SERIES_CEILING)
    return sorted(set(problems))


def _leaks(text: str, rule: Any) -> bool:
    found = rule.find_leaks(text, allow_loopback=False)
    return bool(found["ips"] or found["machines"] or _EMAIL.search(text))


def _leak_fields(value: Any, rule: Any, path: str) -> list[str]:
    fields: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            name = str(key)
            here = "%s.%s" % (path, "<withheld key>" if _leaks(name, rule) else name)
            if _leaks(name, rule):
                fields.append(here)
            fields += _leak_fields(item, rule, here)
    elif isinstance(value, list):
        for item in value:
            fields += _leak_fields(item, rule, path + "[]")
    elif isinstance(value, str) and _leaks(value, rule):
        fields.append(path)
    return fields


def leak_gate(bodies: dict[str, Any], rule: Any) -> dict[str, Any]:
    """The whole serialized set, checked with the private fleet map and for emails. Counts and field names
    only."""
    text = json.dumps(bodies, sort_keys=True, ensure_ascii=False)
    found = rule.find_leaks(text, allow_loopback=False)
    ips, machines, emails = len(found["ips"]), len(found["machines"]), len(set(_EMAIL.findall(text)))
    leaked = bool(ips or machines or emails)
    fields = sorted(set(_leak_fields(bodies, rule, "body"))) if leaked else []
    return {"state": "FAIL" if leaked else "PASS", "ips": ips, "machines": machines, "emails": emails,
            "fields": fields[:20] or (["body (serialized)"] if leaked else []), "rule": rule.source}


# ── credentials: names only ──────────────────────────────────────────────────────────────────


def store_path(root: Path = ROOT) -> Path | None:
    """ship.py's locator, rewritten: CITADEL_WORKSPACE_ENV, else that name in secrets/deploy.local.env."""
    explicit = os.environ.get(STORE_ENV, "").strip()
    if not explicit:
        try:
            text = (root / "secrets" / "deploy.local.env").read_text(encoding="utf-8", errors="replace")
        except OSError:
            text = ""
        for line in text.splitlines():
            name, sep, value = line.strip().partition("=")
            if sep and name.strip() == STORE_ENV:
                explicit = value.strip().strip('"').strip("'")
                break
    return Path(explicit) if explicit else None


def parse_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return values
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            name, _, value = line.partition("=")
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            values[name.strip()] = value
    return values


def resolve_credentials(names: Iterable[str], root: Path = ROOT) -> tuple[dict[str, str], dict[str, str]]:
    """The store first, the ambient environment second. Provenance records where, never what."""
    wanted = list(dict.fromkeys(names))
    path = store_path(root)
    stored = parse_env_file(path) if path is not None and path.is_file() else {}
    values: dict[str, str] = {}
    provenance: dict[str, str] = {}
    for name in wanted:
        if stored.get(name, "").strip():
            values[name], provenance[name] = stored[name].strip(), "store"
        elif os.environ.get(name, "").strip():
            values[name], provenance[name] = os.environ[name].strip(), "environment"
        else:
            provenance[name] = "absent"
    return values, provenance


def dd_site(value: str) -> str:
    return _sibling("emit_datadog_metrics")._site(value or "")


def ci_guard() -> bool:
    """hostinger_checks copies the whole environment into every check, CI keys included."""
    in_ci = bool(os.environ.get("CI", "").strip() or os.environ.get("GITLAB_CI", "").strip())
    return in_ci and os.environ.get(ALLOW_CI_ENV, "").strip() != "1"


# ── the one transport ────────────────────────────────────────────────────────────────────────


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """A key goes to the pinned host or nowhere: a redirect is answered as the 3xx it is."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, D102
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def _scrub(text: str, secrets: Iterable[str]) -> str:
    for secret in secrets:
        if secret:
            text = text.replace(secret, "[key]")
    text = re.sub(r"ph[cx]_[A-Za-z0-9_-]{8,}", "[key]", text)
    return re.sub(r"\b[0-9a-f]{32,}\b", "[key]", text)[:200]


def _json_or_none(raw: bytes) -> Any:
    try:
        return json.loads(raw.decode("utf-8", "replace")) if raw[:1] in (b"{", b"[") else None
    except ValueError:
        return None


def _send(method: str, url: str, body: Any, headers: dict[str, str] | None,
          timeout: float) -> tuple[int, str, Any]:
    """The module's only network path: one attempt, no retry, no redirect, never raises.

    Returns (status, detail, document). status 0 is a transport failure and detail its class name;
    otherwise detail is at most 200 characters with every key scrubbed, and document is the parsed
    JSON answer (used by verify's readback), or None.
    """
    head = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        head["Content-Type"] = "application/json"
    head.update(headers or {})
    secrets = [value for key, value in head.items() if key.lower() in ("dd-api-key", "dd-application-key",
                                                                        "authorization")]
    if isinstance(body, dict) and isinstance(body.get("api_key"), str):
        secrets.append(body["api_key"])
    request = urllib.request.Request(url, data=data, headers=head, method=method)
    try:
        with _OPENER.open(request, timeout=max(0.1, float(timeout))) as response:
            raw = response.read(RESPONSE_LIMIT)
            return int(response.status), _scrub(raw.decode("utf-8", "replace"), secrets), _json_or_none(raw)
    except urllib.error.HTTPError as error:
        try:
            raw = error.read(RESPONSE_LIMIT)
        except Exception:  # noqa: BLE001 - an unreadable error body is still an answer
            raw = b""
        return int(error.code), _scrub(raw.decode("utf-8", "replace"), secrets), _json_or_none(raw)
    except Exception as error:  # noqa: BLE001 - a dead hop is a measurement, never a crash
        return 0, type(error).__name__, None


class Budget:
    """One deadline shared by every request of one publish, each capped at REQUEST_TIMEOUT_S."""

    def __init__(self, seconds: float, monotonic: Callable[[], float]) -> None:
        self._clock = monotonic
        self.deadline = monotonic() + seconds

    def timeout(self) -> float:
        return max(0.0, min(REQUEST_TIMEOUT_S, self.deadline - self._clock()))


def budget_seconds(value: float | None = None) -> float:
    if value is None:
        try:
            value = float(os.environ.get(BUDGET_ENV, "") or BUDGET_S)
        except ValueError:
            value = BUDGET_S
    return max(0.5, min(float(value), 60.0))


# ── ledger ───────────────────────────────────────────────────────────────────────────────────


def ledger_file(ledger_dir: Path, run_id: str) -> Path:
    return Path(ledger_dir) / "runs" / (run_id + ".json")


def read_ledger(ledger_dir: Path, run_id: str) -> dict[str, Any] | None:
    try:
        entry = json.loads(ledger_file(ledger_dir, run_id).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return entry if isinstance(entry, dict) else None


def write_ledger(ledger_dir: Path, entry: dict[str, Any]) -> Path:
    path = ledger_file(ledger_dir, entry["run_id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    with open(temporary, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(entry, indent=2, sort_keys=True) + "\n")
    os.replace(temporary, path)
    return path


def _accepted_bodies(entry: dict[str, Any] | None) -> set[str]:
    """The bodies a ledger entry records as accepted: PostHog's request pair as one, Datadog part by part."""
    sinks = (entry or {}).get("sinks") or {}
    done: set[str] = set()
    posthog = sinks.get("posthog")
    if isinstance(posthog, dict) and posthog.get("state") in ("SENT", "VERIFIED"):
        done |= {"posthog.batch", "posthog.control"}
    datadog = sinks.get("datadog") if isinstance(sinks.get("datadog"), dict) else {}
    for key in ("event", "logs", "series"):
        part = datadog.get(key)
        if isinstance(part, dict) and part.get("state") in ("SENT", "VERIFIED"):
            done.add("datadog." + key)
    return done


def _carried(entry: dict[str, Any], name: str) -> dict[str, Any]:
    """An accepted body's result as the ledger recorded it, for a publish that does not post it again."""
    sinks = entry.get("sinks") or {}
    if name.startswith("posthog"):
        posthog = sinks.get("posthog") or {}
        return _sink(posthog.get("state", "SENT"),
                     http=posthog.get("http") if name == "posthog.batch" else posthog.get("control_http"))
    part = (sinks.get("datadog") or {}).get(name.split(".", 1)[1]) or {}
    return _sink(part.get("state", "SENT"), part.get("reason", ""), http=part.get("http"))


# ── publish: prepare, then deliver ───────────────────────────────────────────────────────────


@dataclass
class Plan:
    """Everything one receipt would send, built and not yet gated, keyed, or sent."""

    ids: dict[str, str]
    probe: Probe
    view: dict[str, Any]
    rule: Any
    fleet_readable: bool
    cat: Catalogue
    bodies: dict[str, Any]
    skipped: dict[str, str]
    digests: dict[str, str]
    expected: dict[str, Any]
    at: dt.datetime


def receipt_ids(receipt: dict[str, Any]) -> dict[str, str]:
    """The digest excludes the ocn_telemetry block, so a receipt keeps its run id once published."""
    sha = hashlib.sha256(canonical({k: v for k, v in receipt.items() if k != "ocn_telemetry"})).hexdigest()
    return {"sha": sha, "run_id": str(uuid.uuid5(NAMESPACE, sha))}


def prepare(receipt: object, *, probe: str | None = None, expect: str | None = None, env: str | None = None,
            fleet_map: object = None, probe_digest: str | None = None, dd_metrics: bool = False,
            now: dt.datetime | None = None) -> Plan:
    """Adapt, template and build. Raises Unsent with a bounded reason when the receipt is withheld."""
    if not isinstance(receipt, dict):
        raise Unsent("NO_RECEIPT")
    ids = receipt_ids(receipt)
    body = {key: value for key, value in receipt.items() if key != "ocn_telemetry"}
    detected = detect_probe(body)
    name = normalize_probe(probe) if probe else detected
    # A named probe must be the one the receipt's own schema or shape says it is.
    if not name or (detected and detected != name) or (isinstance(body.get("schema"), str) and not detected):
        raise Unsent("UNKNOWN_SCHEMA", ids)
    spec = PROBES[name]
    if not publishable(spec, body):
        raise Unsent("NOT_PUBLISHABLE", ids)
    path = fleet_map_path(fleet_map)
    rule = _sibling("public_redaction").Rule(str(path))
    fleet = load_fleet(path) if rule.names else None
    cat = catalogue()
    ctx = Context(spec, rule, fleet, cat, expect if expect in ("allow", "deny") else None,
                  env if env in ENVS else None)
    try:
        view = ADAPTERS[name](body, ctx)
    except Unsent as refusal:
        raise Unsent(refusal.reason, ids) from None
    if view["env"] not in ENVS:
        raise Unsent("TAG_GATE", ids)
    now = now or _utcnow()
    at = parse_time(view["at"]) or now
    age = (now - at).total_seconds()
    digests = {"publisher": digest12(Path(__file__)),
               "probe": probe_digest if probe_digest and re.fullmatch(r"[0-9a-f]{6,64}", probe_digest)
               else digest12(HERE / (name + ".py"))}
    digests["probe"] = digests["probe"][:12]
    bodies: dict[str, Any] = {}
    skipped: dict[str, str] = {}
    if view["actor"]["kind"] == "unresolved":
        skipped["posthog.batch"] = skipped["posthog.control"] = "IDENTITY_UNRESOLVED"
    else:
        bodies["posthog.batch"] = posthog_batch(view, ids, digests, at, spec)
        bodies["posthog.control"] = posthog_control(view, ids, at)
    if age > EVENT_WINDOW_S:
        skipped["datadog.event"] = skipped["datadog.logs"] = "WINDOW"
    else:
        if spec.dd_event == "judged" and not view["judged"]:
            skipped["datadog.event"] = "NOT_JUDGED"
        else:
            bodies["datadog.event"] = dd_event(view, ids, digests, at)
        bodies["datadog.logs"] = dd_logs(view, ids, digests, at)
    if not dd_metrics:
        skipped["datadog.series"] = "DISABLED"
    elif age > SERIES_MAX_AGE_S or -age > SERIES_MAX_AHEAD_S:
        skipped["datadog.series"] = "WINDOW"
    else:
        bodies["datadog.series"] = dd_series(view, at, cat.features)
    checks = sum(1 for event in bodies.get("posthog.batch") or [] if event["event"] == "ocn_probe_check")
    expected = {"posthog": {"ocn_probe_run": 1, "ocn_probe_check": checks, "ocn_telemetry_control": 0},
                "datadog": {"events": 1 if "datadog.event" in bodies else 0,
                            "logs": len(bodies.get("datadog.logs") or []),
                            "series": len(bodies.get("datadog.series") or [])}}
    return Plan(ids, spec, view, rule, bool(rule.names), cat, bodies, skipped, digests, expected, at)


def _sink(state: str = "UNSENT", reason: str = "", **extra: Any) -> dict[str, Any]:
    return {"state": state, "reason": reason, **extra}


# The reasons a Datadog part carries when the plan never built it. Any other unsent part was a request
# that failed, and leaves the receipt degraded.
PART_SKIPS = frozenset({"", "DISABLED", "NOT_JUDGED", "WINDOW"})


def _part_failed(part: object) -> bool:
    return (isinstance(part, dict) and part.get("state") not in ("SENT", "VERIFIED")
            and part.get("reason", "") not in PART_SKIPS)


def _block(mode: str, *, ids: dict[str, str] | None = None, reason: str = "", probe: str = "",
           posthog: dict[str, Any] | None = None, datadog: dict[str, Any] | None = None,
           gates: dict[str, Any] | None = None, credentials: dict[str, str] | None = None,
           ledger: str = "") -> dict[str, Any]:
    posthog = posthog or _sink(reason=reason)
    datadog = datadog or _sink(reason=reason)
    posthog.setdefault("project", PH_PROJECT)
    posthog.setdefault("note", PH_NOTE)
    datadog.setdefault("site", DD_SITE)
    states = [sink["state"] for sink in (posthog, datadog) if sink.get("reason") != "NOT_SELECTED"]
    if states and all(state == "VERIFIED" for state in states):
        state = "VERIFIED"
    elif any(state in ("SENT", "VERIFIED") for state in states):
        state = "SENT"
    else:
        state = "UNSENT"
    if state == "UNSENT" and not reason:
        reason = next((sink.get("reason") for sink in (posthog, datadog)
                       if sink.get("reason") and sink.get("reason") != "NOT_SELECTED"), "")
    # Partly sent: a selected sink sent nothing, or a Datadog part failed while another was accepted.
    degraded = state != "UNSENT" and (
        any(sink["state"] == "UNSENT" and sink.get("reason") != "NOT_SELECTED" for sink in (posthog, datadog))
        or any(_part_failed(datadog.get(key)) for key in ("event", "logs", "series")))
    return {"contract": CONTRACT, "run_id": (ids or {}).get("run_id", ""),
            "receipt_sha256": (ids or {}).get("sha", ""), "probe": probe, "mode": mode, "state": state,
            "degraded": degraded,
            "reason": reason if state == "UNSENT" else "", "posthog": posthog, "datadog": datadog,
            "gates": gates or {}, "credentials": credentials or {}, "ledger": ledger}


def _accepted(name: str, status: int) -> bool:
    return status == 200 if name.startswith("posthog") else 200 <= status < 300


def _call(name: str, method: str, url: str, body: Any, headers: dict[str, str], budget: Budget,
          transport: Callable[..., Any]) -> dict[str, Any]:
    """One request, held to its slice of the budget by the wall clock.

    A socket timeout bounds each blocking operation, not the request: name resolution has none, and a
    connect is retried with the full timeout on every address a host resolves to. So the request runs in a
    daemon thread that is abandoned once its slice has passed, and is recorded as TRANSPORT:BUDGET.
    """
    timeout = budget.timeout()
    if timeout <= 0:
        return _sink(reason="BUDGET")
    answers: list[Any] = []

    def attempt() -> None:
        try:
            answers.append(transport(method, url, body, headers, timeout))
        except BaseException as error:  # noqa: BLE001 - handed back to the publishing thread below
            answers.append(error)

    worker = threading.Thread(target=attempt, name="ocn-telemetry-" + name, daemon=True)
    worker.start()
    worker.join(timeout)
    if not answers:
        return _sink(reason="TRANSPORT:BUDGET")
    if isinstance(answers[0], BaseException):
        if not isinstance(answers[0], Exception):
            raise answers[0]    # an interrupt belongs to the caller
        # A transport that raises is a failed request, not a crash.
        return _sink(reason="TRANSPORT:" + type(answers[0]).__name__)
    status, detail, _document = answers[0]
    status = int(status or 0)
    if _accepted(name, status):
        return _sink("SENT", http=status)
    return _sink(reason="TRANSPORT:" + (str(status) if status else re.sub(r"[^A-Za-z0-9_]", "", str(detail))[:40]),
                 http=status or None)


def _counts(plan: Plan) -> dict[str, int]:
    return {"posthog.batch": len(plan.bodies.get("posthog.batch") or []),
            "datadog.logs": len(plan.bodies.get("datadog.logs") or []),
            "datadog.series": len(plan.bodies.get("datadog.series") or [])}


def _sinks_report(plan: Plan, results: dict[str, dict[str, Any]], selected: tuple[str, ...]) -> tuple[dict, dict]:
    counts = _counts(plan)
    if "posthog" in selected:
        batch = results.get("posthog.batch") or _sink(reason=plan.skipped.get("posthog.batch", ""))
        control = results.get("posthog.control") or {}
        posthog = _sink(batch["state"], batch.get("reason", ""), events=counts["posthog.batch"],
                        http=batch.get("http"), control_http=control.get("http"))
    else:
        posthog = _sink(reason="NOT_SELECTED")
    if "datadog" in selected:
        parts = {}
        for name, key in (("datadog.event", "event"), ("datadog.logs", "logs"), ("datadog.series", "series")):
            part = results.get(name) or _sink(reason=plan.skipped.get(name, ""))
            count = 1 if name == "datadog.event" and name in plan.bodies else counts.get(name, 0)
            parts[key] = {"state": part["state"], "reason": part.get("reason", ""), "http": part.get("http"),
                          "count": count}
        sent = [part for part in parts.values() if part["state"] == "SENT"]
        failed = next((part["reason"] for part in parts.values()
                       if part["state"] != "SENT" and part["reason"] not in ("", "DISABLED", "NOT_JUDGED")), "")
        datadog = _sink("SENT" if sent else "UNSENT", "" if sent else failed or "WINDOW", **parts)
    else:
        datadog = _sink(reason="NOT_SELECTED")
    return posthog, datadog


def _ledger_entry(plan: Plan, mode: str, posthog: dict, datadog: dict, provenance: dict[str, str],
                  now: dt.datetime, previous: dict[str, Any] | None) -> dict[str, Any]:
    def body_hash(name: str) -> str | None:
        return hashlib.sha256(canonical(plan.bodies[name])).hexdigest() if name in plan.bodies else None

    return {"schema": LEDGER_SCHEMA, "run_id": plan.ids["run_id"], "receipt_sha256": plan.ids["sha"],
            "probe": plan.probe.name, "env": plan.view["env"], "persona": plan.view["actor"]["persona"],
            "outcome": plan.view["outcome"], "mode": mode, "publisher_digest": plan.digests["publisher"],
            "probe_digest": plan.digests["probe"], "receipt_at": iso(plan.at),
            "first_published_at": (previous or {}).get("first_published_at") or iso(now),
            "published_at": iso(now), "expected": plan.expected,
            "body_sha256": {name: body_hash(name) for name in plan.bodies},
            "sinks": {"posthog": posthog, "datadog": datadog}, "credentials": provenance,
            "verification": (previous or {}).get("verification")}


def deliver(plan: Plan, *, mode: str, sinks: Iterable[str] = SINKS, force: bool = False,
            ledger_dir: Path | None = None, credentials: dict[str, str] | None = None,
            transport: Callable[..., Any] | None = None, monotonic: Callable[[], float] | None = None,
            budget_s: float | None = None, stderr: Any = None, now: dt.datetime | None = None) -> dict[str, Any]:
    """Gate, then (in send mode) attach keys and the $ip marker and send inside one budget."""
    selected = tuple(sink for sink in SINKS if sink in set(sinks))
    now = now or _utcnow()
    ledger_dir = Path(ledger_dir) if ledger_dir else LEDGER_DIR
    stream = stderr if stderr is not None else sys.stderr
    names = [name for name in plan.bodies if name.split(".")[0] in selected]
    bodies = {name: plan.bodies[name] for name in names}
    kwargs = {"ids": plan.ids, "probe": plan.probe.name}
    if mode == "send" and not plan.fleet_readable:
        return _block(mode, reason="NO_FLEET_MAP", **kwargs)
    problems = tag_gate(bodies, plan.cat)
    leak = leak_gate(bodies, plan.rule)
    gates = {"tag": "FAIL" if problems else "PASS", "tag_problems": problems, "leak": leak["state"],
             "leak_counts": {"ips": leak["ips"], "machines": leak["machines"], "emails": leak["emails"]},
             "leak_fields": leak["fields"], "leak_rule": leak["rule"]}
    if problems:
        return _block(mode, reason="TAG_GATE", gates=gates, **kwargs)
    if leak["state"] != "PASS":
        return _block(mode, reason="LEAK_GATE", gates=gates, **kwargs)
    previous = read_ledger(ledger_dir, plan.ids["run_id"])
    if mode == "dry-run":
        print("ocn_telemetry dry-run: %d request(s) would be sent, keys and the $ip marker attached only on "
              "send; leak gate %s (%s)" % (len(bodies), leak["state"], leak["rule"]), file=stream)
        for name in names:
            print("--- %s ---" % name, file=stream)
            print(json.dumps(bodies[name], indent=2, sort_keys=True), file=stream)
        results = {name: _sink(reason="DRY_RUN") for name in names}
        posthog, datadog = _sinks_report(plan, results, selected)
        path = ledger_file(ledger_dir, plan.ids["run_id"])
        if (previous or {}).get("mode") != "send":
            # A dry run never overwrites the record of a real send: pending, retry and verify read it.
            path = write_ledger(ledger_dir, _ledger_entry(plan, mode, posthog, datadog, {}, now, previous))
        return _block(mode, posthog=posthog, datadog=datadog, gates=gates, ledger=_relative(path), **kwargs)
    if ci_guard():
        return _block(mode, reason="CI_GUARD", gates=gates, **kwargs)
    # Datadog keeps every copy it accepts and verify counts exactly, so an accepted Datadog body is never
    # posted again. PostHog de-duplicates on the event uuid, so --force may post its pair again.
    done = _accepted_bodies(previous)
    pending = [name for name in names if name not in done or (force and name.startswith("posthog"))]
    if not pending:
        return _block(mode, reason="LEDGER_DUPLICATE", gates=gates,
                      ledger=_relative(ledger_file(ledger_dir, plan.ids["run_id"])), **kwargs)
    live = {name.split(".")[0] for name in pending}
    refused: dict[str, str] = {}
    if "posthog" in live and os.environ.get(POSTHOG_ACK_ENV, "").strip() != "1":
        refused["posthog"] = "POSTHOG_PRECONDITION"
    wanted = (([CAPTURE_KEY] if "posthog" in live and not refused.get("posthog") else [])
              + ([DD_KEY, DD_SITE_NAME] if "datadog" in live else []))
    if credentials is None:
        values, provenance = resolve_credentials(wanted) if wanted else ({}, {})
    else:
        values = {name: credentials[name] for name in wanted if credentials.get(name)}
        provenance = {name: "argument" if name in values else "absent" for name in wanted}
    if "posthog" in live and not refused.get("posthog"):
        key = values.get(CAPTURE_KEY, "")
        refused["posthog"] = "NO_KEY:" + CAPTURE_KEY if not key else "" if key.startswith("phc_") else "KEY_SHAPE"
    if "datadog" in live:
        refused["datadog"] = ("NO_KEY:" + DD_KEY if not values.get(DD_KEY)
                              else "" if dd_site(values.get(DD_SITE_NAME, "")) in DD_SITES_ALLOWED
                              else "SITE_NOT_ALLOWED")
    send = transport or _send
    budget = Budget(budget_seconds(budget_s), monotonic or time.monotonic)
    results = {name: _carried(previous or {}, name) for name in names if name not in pending}
    in_flight = ""
    try:
        for name in pending:
            in_flight = name
            sink = name.split(".")[0]
            results[name] = (_sink(reason=refused[sink]) if refused.get(sink)
                             else _post(name, bodies[name], values, budget, send))
    except BaseException:
        # Ctrl+C mid-publish. What already went out is recorded before the interrupt carries on, so
        # verify --pending finds it and a re-run posts only the rest.
        if in_flight and in_flight not in results:
            results[in_flight] = _sink(reason="TRANSPORT:INTERRUPTED")
        for name in pending:
            results.setdefault(name, _sink(reason="INTERRUPTED"))
        posthog, datadog = _sinks_report(plan, results, selected)
        write_ledger(ledger_dir, _ledger_entry(plan, mode, posthog, datadog, provenance, now, previous))
        raise
    posthog, datadog = _sinks_report(plan, results, selected)
    path = write_ledger(ledger_dir, _ledger_entry(plan, mode, posthog, datadog, provenance, now, previous))
    return _block(mode, posthog=posthog, datadog=datadog, gates=gates, credentials=provenance,
                  ledger=_relative(path), **kwargs)


def _post(name: str, body: Any, values: dict[str, str], budget: Budget,
          send: Callable[..., Any]) -> dict[str, Any]:
    """One body to its pinned endpoint. Keys and the $ip marker are attached here, after both gates."""
    if name == "posthog.batch":
        events = [{**event, "properties": {**event["properties"], "$ip": UNSPECIFIED_IP}} for event in body]
        return _call(name, "POST", PH_CAPTURE, {"api_key": values[CAPTURE_KEY], "historical_migration": False,
                                                "batch": events}, {}, budget, send)
    if name == "posthog.control":
        twin = {**body, "properties": {**body["properties"], "$ip": UNSPECIFIED_IP}}
        return _call(name, "POST", PH_CAPTURE, {"api_key": invalid_capture_key(), "historical_migration": False,
                                                "batch": [twin]}, {}, budget, send)
    url = {"datadog.event": DD_EVENTS, "datadog.logs": DD_LOGS, "datadog.series": DD_SERIES}[name]
    payload = {"series": body} if name == "datadog.series" else body
    return _call(name, "POST", url, payload, {"DD-API-KEY": values[DD_KEY]}, budget, send)


def switch_mode(value: object = None, default: str = "off") -> str:
    """The telemetry mode. BUILDANDDO_OCN_TELEMETRY=off vetoes every flag, so turning the switch off stops
    every publish whatever its command line says. Otherwise --telemetry or --mode, else the switch, else
    `default` when the switch is unset. An unknown value is off."""
    ambient = os.environ.get(SWITCH, "").strip().lower()
    if ambient == "off":
        return "off"
    if value is not None:
        text = str(value).strip().lower()
        return text if text in MODES else "off"
    if not ambient:
        return default if default in MODES else "off"
    return ambient if ambient in MODES else "off"


def metrics_enabled(flag: bool | None = None) -> bool:
    return bool(flag) or os.environ.get(METRICS_ENV, "").strip() == "1"


def publish(receipt: object, *, probe: str | None = None, mode: str = "dry-run", sinks: Iterable[str] = SINKS,
            force: bool = False, expect: str | None = None, env: str | None = None, fleet_map: object = None,
            probe_digest: str | None = None, dd_metrics: bool | None = None, ledger_dir: Path | None = None,
            credentials: dict[str, str] | None = None, transport: Callable[..., Any] | None = None,
            monotonic: Callable[[], float] | None = None, budget_s: float | None = None, stderr: Any = None,
            now: dt.datetime | None = None) -> dict[str, Any]:
    """Publish one receipt and return its ocn_telemetry block. Never raises into the caller."""
    mode = switch_mode(mode)
    try:
        if mode == "off":
            return _block(mode, ids=receipt_ids(receipt) if isinstance(receipt, dict) else None,
                          reason="DISABLED", probe=normalize_probe(probe) if probe else "")
        try:
            plan = prepare(receipt, probe=probe, expect=expect, env=env, fleet_map=fleet_map,
                           probe_digest=probe_digest, dd_metrics=metrics_enabled(dd_metrics), now=now)
        except Unsent as refusal:
            return _block(mode, ids=refusal.ids or None, reason=refusal.reason,
                          probe=normalize_probe(probe) if probe else "")
        return deliver(plan, mode=mode, sinks=sinks, force=force, ledger_dir=ledger_dir, credentials=credentials,
                       transport=transport, monotonic=monotonic, budget_s=budget_s, stderr=stderr, now=now)
    except KeyboardInterrupt:
        raise
    except Exception as error:  # noqa: BLE001 - telemetry must never raise into a probe or its driver
        return _block(mode, reason="PUBLISHER_ERROR:" + type(error).__name__)


def summary_line(block: dict[str, Any]) -> str:
    """The one line `run` prints on stderr after the probe has finished."""
    reason = " (%s)" % block["reason"] if block.get("reason") else ""
    degraded = " degraded" if block.get("degraded") else ""
    checked = " verify=%s" % block["verification"]["state"] if isinstance(block.get("verification"), dict) else ""
    return "ocn_telemetry: %s%s run=%s posthog=%s datadog=%s%s%s" % (
        block.get("state"), reason, block.get("run_id") or "-", (block.get("posthog") or {}).get("state"),
        (block.get("datadog") or {}).get("state"), degraded, checked)


# ── verify: delivery proved by readback, with controls ───────────────────────────────────────

READ_TIMEOUT_S = 30.0
# The run id reaches HogQL as a value, never spliced into the query text.
Q_RUN = ("SELECT event, count(DISTINCT uuid), "
         "countIf(coalesce(toString(properties.$ip), '') NOT IN ('', {unspecified})) "
         "FROM events WHERE properties.ocn_run_id = {run_id} "
         "AND timestamp >= toDateTime({since}) AND timestamp <= toDateTime({until}) GROUP BY event")
# Across the whole project since the first send: this publisher never builds ocn_seat or ocn_box_ip, so
# only box-side capture that is still live somewhere can put them there.
Q_LEGACY = ("SELECT count() FROM events WHERE (isNotNull(properties.ocn_seat) OR isNotNull(properties.ocn_box_ip)) "
            "AND timestamp >= toDateTime({since})")
Q_PERSONS = "SELECT count() FROM persons WHERE properties.is_ocn_agent = true AND created_at >= toDateTime({since})"
ALL_TAG_KEYS = frozenset({"service", "team", "env", "ocn_probe", "ocn_feature"})
VERDICTS = ("VOID", "UNMEASURED", "NOT_FOUND")


@dataclass
class Readback:
    """What verify needs to reach the vendors: keys by name, one transport, a clock and a sleep."""

    values: dict[str, str]
    provenance: dict[str, str]
    transport: Callable[..., Any]
    sleep: Callable[[float], None]
    monotonic: Callable[[], float]
    now: dt.datetime


def readback(credentials: dict[str, str] | None = None, transport: Callable[..., Any] | None = None,
             sleep: Callable[[float], None] | None = None, monotonic: Callable[[], float] | None = None,
             now: dt.datetime | None = None) -> Readback:
    names = [*READ_KEYS, CANARY_PROJECT, DD_KEY, DD_APP_KEY, DD_SITE_NAME]
    if credentials is None:
        values, provenance = resolve_credentials(names)
    else:
        values = {name: credentials[name] for name in names if credentials.get(name)}
        provenance = {name: "argument" if name in values else "absent" for name in names}
    return Readback(values, provenance, transport or _send, sleep or time.sleep, monotonic or time.monotonic,
                    now or _utcnow())


def _hogql(query: str, values: dict[str, Any]) -> dict[str, Any]:
    return {"query": {"kind": "HogQLQuery", "query": query, "values": values}, "refresh": "blocking"}


def _clock(stamp: dt.datetime) -> str:
    return stamp.astimezone(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _window(entry: dict[str, Any]) -> tuple[dt.datetime, dt.datetime]:
    at = parse_time(entry.get("receipt_at")) or _utcnow()
    return at - dt.timedelta(hours=1), at + dt.timedelta(hours=1)


def _ph_counts(read: Readback, key: str, project: str, run_id: str,
               window: tuple[dt.datetime, dt.datetime]) -> tuple[int, dict[str, list[int]] | None]:
    """(status, {event: [distinct uuids, events keeping an address]})."""
    values = {"run_id": run_id, "unspecified": UNSPECIFIED_IP, "since": _clock(window[0]), "until": _clock(window[1])}
    status, _detail, document = read.transport("POST", PH_QUERY_BASE + project + "/query/", _hogql(Q_RUN, values),
                                               {"Authorization": "Bearer " + key}, READ_TIMEOUT_S)
    rows = document.get("results") if isinstance(document, dict) else None
    if status != 200 or not isinstance(rows, list):
        return status, None
    counts: dict[str, list[int]] = {}
    for row in rows:
        if isinstance(row, list) and len(row) >= 3 and isinstance(row[0], str):
            counts[row[0]] = [_int(row[1]) or 0, _int(row[2]) or 0]
    return status, counts


def _ph_found(counts: dict[str, list[int]] | None, expected: dict[str, int]) -> bool:
    return counts is not None and all(counts.get(event, [0])[0] == number for event, number in expected.items()
                                      if event != "ocn_telemetry_control")


def _canary(read: Readback, key: str, run_id: str, window: tuple[dt.datetime, dt.datetime]) -> str:
    """C3: the project named by POSTHOG_PROJECT_ID must hold nothing of this run."""
    project = read.values.get(CANARY_PROJECT, "").strip()
    if not project.isdigit() or project == str(PH_PROJECT):
        return "NOT_CHECKED"
    _status, counts = _ph_counts(read, key, project, run_id, window)
    if counts is None:
        return "NOT_CHECKED"
    return "HELD" if not any(value[0] for value in counts.values()) else "FAILED"


def _project_count(read: Readback, key: str, query: str, since: dt.datetime) -> str:
    """A project-wide count since the first send: CLEAN at 0, FOUND above it, UNMEASURED unanswered."""
    status, _detail, document = read.transport("POST", PH_QUERY, _hogql(query, {"since": _clock(since)}),
                                               {"Authorization": "Bearer " + key}, READ_TIMEOUT_S)
    rows = document.get("results") if status == 200 and isinstance(document, dict) else None
    if not isinstance(rows, list) or not rows or not isinstance(rows[0], list) or not rows[0]:
        return "UNMEASURED"
    return "CLEAN" if not _int(rows[0][0]) else "FOUND"


def verify_posthog(entry: dict[str, Any], read: Readback, wait: float) -> dict[str, Any]:
    expected = (entry.get("expected") or {}).get("posthog") or {}
    name, key = next(((name, read.values[name]) for name in READ_KEYS if read.values.get(name)), (READ_KEYS[0], ""))
    if not key or key.startswith("phc_"):
        return {"state": "UNMEASURED", "reason": "NO_KEY:" + name if not key else "KEY_SHAPE", "expected": expected}
    run_id, window = entry["run_id"], _window(entry)
    started = read.monotonic()
    while True:
        status, counts = _ph_counts(read, key, str(PH_PROJECT), run_id, window)
        if status in (401, 403):
            return {"state": "UNMEASURED", "reason": "HTTP_%d" % status, "expected": expected}
        if _ph_found(counts, expected) or read.monotonic() - started >= wait:
            break
        read.sleep(POLL_S)
    if counts is None:
        return {"state": "UNMEASURED", "reason": "TRANSPORT:%s" % (status or "no answer"), "expected": expected}
    _never_status, never = _ph_counts(read, key, str(PH_PROJECT), str(uuid.uuid4()), window)
    controls = {"C1_invalid_key_absent": "HELD" if not counts.get("ocn_telemetry_control", [0])[0] else "FAILED",
                "C2_never_sent_id_empty": ("UNMEASURED" if never is None
                                           else "HELD" if not any(value[0] for value in never.values()) else "FAILED"),
                "C3_other_project_empty": _canary(read, key, run_id, window)}
    seen = any(value[0] for value in counts.values())
    since = parse_time(entry.get("first_published_at")) or window[0]
    privacy = {"ip": ("UNMEASURED" if not seen else "CLEAN" if not sum(v[1] for v in counts.values())
                      else "IP_STORED"),
               "legacy_properties": _project_count(read, key, Q_LEGACY, since),
               "agent_persons": _project_count(read, key, Q_PERSONS, since)}
    if "FAILED" in controls.values():
        state = "VOID"
    elif controls["C2_never_sent_id_empty"] == "UNMEASURED":
        state = "UNMEASURED"
    else:
        state = "VERIFIED" if _ph_found(counts, expected) else "NOT_FOUND"
    return {"state": state, "reason": "" if state == "VERIFIED" else state, "expected": expected,
            "counts": {event: value[0] for event, value in sorted(counts.items())}, "controls": controls,
            "privacy": privacy, "key": name}


def _dd_search(read: Readback, url: str, query: str, window: tuple[dt.datetime, dt.datetime],
               headers: dict[str, str]) -> tuple[int, int | None]:
    body = {"filter": {"query": query, "from": iso(window[0]), "to": iso(window[1])}, "page": {"limit": 100}}
    status, _detail, document = read.transport("POST", url, body, headers, READ_TIMEOUT_S)
    data = document.get("data") if isinstance(document, dict) else None
    return status, (len(data) if status == 200 and isinstance(data, list) else None)


def invalid_datadog_key(run_id: str) -> str:
    """32 hex characters no Datadog org issued, derived at run time."""
    return uuid.uuid5(NAMESPACE, "invalid-datadog-key:" + run_id).hex


def control_log(entry: dict[str, Any]) -> list[dict[str, Any]]:
    """The run's summary, rebuilt from the ledger, for C4: it goes out under an invalid key and must be refused."""
    tags = ["service:" + SERVICE, "env:" + entry["env"], "team:" + TEAM, "ocn_probe:" + entry["probe"],
            "ocn_outcome:" + entry["outcome"], "ocn_persona:" + entry["persona"], "ocn_run:" + entry["run_id"]]
    return [{"ddsource": SERVICE, "service": SERVICE, "ddtags": ",".join(tags), "status": "info",
             "message": "ocn %s %s control invalid_key run=%s" % (entry["probe"], entry["env"], entry["run_id"]),
             "ocn": _allow({"run_id": entry["run_id"], "receipt_sha256": entry.get("receipt_sha256"),
                            "probe": entry["probe"], "env": entry["env"], "persona": entry["persona"],
                            "outcome": entry["outcome"]}, DD_RUN_ATTRS)}]


def _dd_metric(read: Readback, entry: dict[str, Any], headers: dict[str, str]) -> str:
    since, until = _window(entry)
    query = "max:%s{env:%s,ocn_probe:%s}" % (METRIC_MEASURED, entry["env"], entry["probe"])
    url = DD_METRIC_QUERY + "?" + urllib.parse.urlencode({"from": int(since.timestamp()), "to": int(until.timestamp()),
                                                         "query": query})
    status, _detail, document = read.transport("GET", url, None, headers, READ_TIMEOUT_S)
    series = document.get("series") if status == 200 and isinstance(document, dict) else None
    if not isinstance(series, list):
        return "UNMEASURED"
    return "FOUND" if any(isinstance(item, dict) and item.get("pointlist") for item in series) else "NOT_FOUND"


def verify_datadog(entry: dict[str, Any], read: Readback, wait: float) -> dict[str, Any]:
    expected = (entry.get("expected") or {}).get("datadog") or {}
    api, app = read.values.get(DD_KEY, ""), read.values.get(DD_APP_KEY, "")
    refusal = ("NO_KEY:" + DD_KEY if not api else "NO_KEY:" + DD_APP_KEY if not app
               else "" if dd_site(read.values.get(DD_SITE_NAME, "")) in DD_SITES_ALLOWED else "SITE_NOT_ALLOWED")
    if refusal:
        return {"state": "UNMEASURED", "reason": refusal, "expected": expected}
    if entry.get("env") not in ENVS or entry.get("probe") not in PROBES:
        return {"state": "UNMEASURED", "reason": "LEDGER_SHAPE", "expected": expected}
    headers = {"DD-API-KEY": api, "DD-APPLICATION-KEY": app}
    run_id, window = entry["run_id"], _window(entry)
    started = read.monotonic()
    while True:
        event_status, events = (_dd_search(read, DD_EVENTS_SEARCH, "ocn_run:" + run_id, window, headers)
                                if expected.get("events") else (200, 0))
        log_status, logs = _dd_search(read, DD_LOGS_SEARCH, "service:%s ocn_run:%s" % (SERVICE, run_id), window,
                                      headers)
        refused = next((code for code in (event_status, log_status) if code in (401, 403)), 0)
        if refused:
            return {"state": "UNMEASURED", "reason": "HTTP_%d" % refused, "expected": expected}
        found = events == expected.get("events", 0) and logs == expected.get("logs", 0)
        if found or read.monotonic() - started >= wait:
            break
        read.sleep(POLL_S)
    status, _detail, _document = read.transport("POST", DD_LOGS, control_log(entry),
                                                {"DD-API-KEY": invalid_datadog_key(run_id)}, READ_TIMEOUT_S)
    never = str(uuid.uuid4())
    _event_status, never_events = _dd_search(read, DD_EVENTS_SEARCH, "ocn_run:" + never, window, headers)
    _log_status, never_logs = _dd_search(read, DD_LOGS_SEARCH, "service:%s ocn_run:%s" % (SERVICE, never), window,
                                         headers)
    controls = {"C4_invalid_key_refused": ("HELD" if status == 403 else "FAILED" if 200 <= status < 300
                                           else "UNMEASURED"),
                "C5_never_sent_id_empty": ("UNMEASURED" if never_events is None or never_logs is None
                                           else "HELD" if not never_events and not never_logs else "FAILED")}
    metrics = _dd_metric(read, entry, headers) if expected.get("series") else "NOT_SENT"
    if "FAILED" in controls.values():
        state, reason = "VOID", "VOID"
    elif "UNMEASURED" in controls.values() or events is None or logs is None:
        state, reason = "UNMEASURED", "UNMEASURED"
    elif found and metrics in ("FOUND", "NOT_SENT"):
        state, reason = "VERIFIED", ""
    else:
        state = "NOT_FOUND"
        reason = ("LOGS_NOT_FOUND" if events == expected.get("events", 0) and logs != expected.get("logs", 0)
                  else "METRICS_NOT_FOUND" if found else "NOT_FOUND")
    return {"state": state, "reason": reason, "expected": expected,
            "counts": {"events": events, "logs": logs, "metrics": metrics}, "controls": controls}


def _cut_off(reason: object) -> bool:
    """A request that got no status back (TRANSPORT:<class>, BUDGET or INTERRUPTED) may have been delivered.
    One answered with a status (TRANSPORT:403) was refused, and never was."""
    text = str(reason or "")
    return text.startswith("TRANSPORT:") and not text[len("TRANSPORT:"):].isdigit()


def _maybe_delivered(sink: dict[str, Any]) -> bool:
    """Accepted, or cut off mid-request, in the sink or any of its parts: a request that got no answer stays
    UNSENT until a readback finds it."""
    parts = [sink] + [part for part in sink.values() if isinstance(part, dict)]
    return any(part.get("state") in ("SENT", "VERIFIED") or _cut_off(part.get("reason")) for part in parts)


def verify_entry(entry: dict[str, Any], read: Readback, wait: float = WAIT_S) -> dict[str, Any]:
    """Read one published run back from both vendors. VERIFIED only when every sent sink is."""
    result: dict[str, Any] = {"run_id": entry.get("run_id"), "verified_at": iso(read.now)}
    sinks = entry.get("sinks") or {}
    for name, check in (("posthog", verify_posthog), ("datadog", verify_datadog)):
        sink = sinks.get(name) if isinstance(sinks.get(name), dict) else {}
        result[name] = (check(entry, read, wait) if _maybe_delivered(sink)
                        else {"state": "NOT_CHECKED", "reason": "NOT_SENT"})
    states = [result[name]["state"] for name in ("posthog", "datadog") if result[name]["state"] != "NOT_CHECKED"]
    result["state"] = ("NOT_CHECKED" if not states
                       else next((verdict for verdict in VERDICTS if verdict in states), "VERIFIED"))
    return result


def record_verification(ledger_dir: Path, entry: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    updated = dict(entry, verification=result)
    sinks = dict(entry.get("sinks") or {})
    for name in ("posthog", "datadog"):
        if result.get(name, {}).get("state") == "VERIFIED" and isinstance(sinks.get(name), dict):
            sinks[name] = dict(sinks[name], state="VERIFIED", reason="")
    updated["sinks"] = sinks
    write_ledger(ledger_dir, updated)
    return updated


def block_from_ledger(entry: dict[str, Any], ledger_dir: Path) -> dict[str, Any]:
    """The receipt's ocn_telemetry block, rebuilt from what the ledger recorded and verify found."""
    sinks = entry.get("sinks") or {}
    ids = {"run_id": entry.get("run_id", ""), "sha": entry.get("receipt_sha256", "")}
    block = _block(entry.get("mode", "send"), ids=ids, probe=entry.get("probe", ""),
                   posthog=dict(sinks.get("posthog") or {}),
                   datadog=dict(sinks.get("datadog") or {}), credentials=entry.get("credentials") or {},
                   ledger=_relative(ledger_file(ledger_dir, entry.get("run_id", ""))))
    block["verification"] = entry.get("verification")
    return block


def pending_entries(ledger_dir: Path) -> list[dict[str, Any]]:
    """Every sent run not yet VERIFIED, so an operator verifies without typing an id."""
    entries = []
    for path in sorted((Path(ledger_dir) / "runs").glob("*.json")):
        try:
            entry = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        sinks = [sink for sink in (entry.get("sinks") or {}).values() if isinstance(sink, dict)]
        verified = (entry.get("verification") or {}).get("state") == "VERIFIED"
        if entry.get("mode") == "send" and not verified and any(_maybe_delivered(sink) for sink in sinks):
            entries.append(entry)
    return entries


def persisted_receipt(path: Path) -> bool:
    """Only the receipts probes persist with --write are rewritten: state/<probe>/<env>.latest.json."""
    parts = Path(path).resolve().parts
    folders = {Path(probe.write_path).parent.name for probe in REGISTRY if probe.write_path}
    return (len(parts) >= 3 and parts[-3] == "state" and parts[-2] in folders
            and parts[-1] in {"%s.latest.json" % env for env in ENVS})


def verify_tags(read: Readback) -> dict[str, Any]:
    """The opt-in metrics' tag keys, read back: a subset of five, values inside their enums. Never values."""
    api, app = read.values.get(DD_KEY, ""), read.values.get(DD_APP_KEY, "")
    if not api or not app:
        return {"state": "UNMEASURED", "reason": "NO_KEY:" + (DD_KEY if not api else DD_APP_KEY)}
    enums = {"service": {SERVICE}, "team": {TEAM}, "env": set(ENVS), "ocn_probe": set(PROBES),
             "ocn_feature": set(catalogue().features)}
    report: dict[str, Any] = {}
    for metric in METRICS:
        status, _detail, document = read.transport("GET", DD_ALL_TAGS % metric, None,
                                                   {"DD-API-KEY": api, "DD-APPLICATION-KEY": app}, READ_TIMEOUT_S)
        if status == 404:
            report[metric] = {"state": "NOT_FOUND"}
            continue
        data = document.get("data") if status == 200 and isinstance(document, dict) else None
        tags = ((data or {}).get("attributes") or {}).get("tags") if isinstance(data, dict) else None
        if not isinstance(tags, list):
            report[metric] = {"state": "UNMEASURED", "reason": "HTTP_%d" % status}
            continue
        pairs = [str(tag).partition(":") for tag in tags]
        strange_keys = sum(1 for key, _sep, _value in pairs if key not in ALL_TAG_KEYS)
        strange_values = sum(1 for key, _sep, value in pairs if key in enums and value not in enums[key])
        report[metric] = {"state": "CLEAN" if not strange_keys and not strange_values else "UNEXPECTED",
                          "keys": sorted({key for key, _sep, _value in pairs if key in ALL_TAG_KEYS}),
                          "unexpected_keys": strange_keys, "unexpected_values": strange_values}
    states = [item["state"] for item in report.values()]
    state = ("UNEXPECTED" if "UNEXPECTED" in states else "UNMEASURED" if "UNMEASURED" in states
             else "CLEAN")
    return {"state": state, "metrics": report}


# ── reading a receipt ────────────────────────────────────────────────────────────────────────


def decode_bytes(raw: bytes) -> str:
    """UTF-8, or UTF-16 with a BOM: PowerShell 5.1's redirection writes UTF-16."""
    if raw.startswith(codecs.BOM_UTF16_LE) or raw.startswith(codecs.BOM_UTF16_BE):
        return raw.decode("utf-16", "replace")
    if raw.startswith(codecs.BOM_UTF8):
        return raw[len(codecs.BOM_UTF8):].decode("utf-8", "replace")
    return raw.decode("utf-8", "replace")


def _loads_dict(text: str) -> dict[str, Any] | None:
    try:
        value = json.loads(text)
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


def extract_receipt(text: str) -> dict[str, Any] | None:
    """The whole text as one JSON document, else the last line that starts with '{' (the rule
    citadel_ocn_perception.drive uses), else an indented document that starts on such a line. A
    node_drive envelope is unwrapped through its stdout."""
    text = text.strip()
    found = _loads_dict(text)
    if found is None:
        lines = text.splitlines()
        for index in reversed(range(len(lines))):
            if not lines[index].lstrip().startswith("{"):
                continue
            found = _loads_dict(lines[index]) or _loads_dict("\n".join(lines[index:]))
            if found is not None:
                break
    if found is None:
        return None
    if not any(key in found for key in ("schema", "seat", "box", "op", "mode")):
        for inner in (found.get("stdout"), (found.get("result") or {}).get("stdout")
                      if isinstance(found.get("result"), dict) else None):
            if isinstance(inner, str) and inner.strip():
                return extract_receipt(inner)
    return found


# ── run: the transparent wrapper ─────────────────────────────────────────────────────────────


def _script_of(argv: list[str]) -> Path | None:
    return next((Path(part) for part in argv if part.lower().endswith(".py")), None)


def _subcommand(argv: list[str], script: Path | None) -> str:
    if script is None:
        return ""
    position = next((index for index, part in enumerate(argv) if Path(part) == script), -1)
    return next((part for part in argv[position + 1:] if not part.startswith("-")), "")


def _argv_env(argv: list[str]) -> str | None:
    for index, part in enumerate(argv):
        if part == "--env" and index + 1 < len(argv) and argv[index + 1] in ENVS:
            return argv[index + 1]
        if part.startswith("--env=") and part.split("=", 1)[1] in ENVS:
            return part.split("=", 1)[1]
    return None


def _fingerprint(path: Path) -> tuple[int, int, str] | None:
    try:
        data = path.read_bytes()
        return path.stat().st_mtime_ns, len(data), hashlib.sha256(data).hexdigest()
    except OSError:
        return None


def _write_paths(probe: str, script: Path | None, argv: list[str]) -> dict[Path, tuple[int, int, str] | None]:
    """The receipt this invocation persists with --write, fingerprinted before it runs. Only its own env's
    file: a concurrent run for the other env rewriting its file must never be taken for this one."""
    spec = PROBES.get(probe)
    parents = script.resolve().parents if script is not None else ()
    if spec is None or not spec.write_path or len(parents) < 3:
        return {}
    path = parents[2] / spec.write_path.format(env=_argv_env(argv) or spec.env_default)
    return {path: _fingerprint(path)}


def _changed_receipt(snapshots: dict[Path, tuple[int, int, str] | None]) -> dict[str, Any] | None:
    for path, before in snapshots.items():
        after = _fingerprint(path)
        if after is not None and after != before:
            return _loads_dict(decode_bytes(path.read_bytes()))
    return None


def _exit_code(code: int | None) -> int:
    if code is None:
        return 1
    return 128 - code if code < 0 else code


def _pump(source: Any, sink: Any, captured: bytearray) -> None:
    reader = getattr(source, "read1", None) or source.read
    while True:
        chunk = reader(65536)
        if not chunk:
            return
        sink.write(chunk)
        sink.flush()
        captured.extend(chunk)


def _drain_after_interrupt(child: subprocess.Popen, sink: Any) -> int | None:
    """The probe got the interrupt too. Wait for it, still passing its output through."""
    while True:
        try:
            rest, _ = child.communicate()
        except KeyboardInterrupt:
            continue
        if rest:
            sink.write(rest)
            sink.flush()
        return child.returncode


def run_command(options: argparse.Namespace, command: list[str], *, stdout: Any = None, stderr: Any = None,
                publisher: Callable[..., dict[str, Any]] | None = None) -> int:
    """Start the probe without a shell, pass its stdout through untouched, exit with its own code, and
    only then publish. Nothing telemetry-related is imported until the probe has exited."""
    out = stdout if stdout is not None else sys.stdout.buffer
    err = stderr if stderr is not None else sys.stderr
    argv = list(command)
    script = _script_of(argv)
    if argv and argv[0].lower().endswith(".py"):
        argv = [sys.executable] + argv
    environment = dict(os.environ)
    environment["PYTHONIOENCODING"] = "utf-8"
    probe = normalize_probe(options.probe or (script.stem if script is not None else ""))
    snapshots = _write_paths(probe, script, argv)
    try:
        child = subprocess.Popen(argv, stdout=subprocess.PIPE, env=environment)
    except OSError as error:
        print("ocn_telemetry: the probe could not be started (%s)" % type(error).__name__, file=err)
        return 127
    captured = bytearray()
    try:
        _pump(child.stdout, out, captured)
        code = _exit_code(child.wait())
    except KeyboardInterrupt:
        code = _exit_code(_drain_after_interrupt(child, out))
        print("ocn_telemetry: interrupted; nothing was published", file=err)
        return code
    finally:
        child.stdout.close()
    try:
        block = _publish_run(options, argv, probe, script, bytes(captured), snapshots, err, publisher or publish)
        if getattr(options, "verify", False) and block.get("state") == "SENT" and block.get("run_id"):
            block["verification"] = _verify_after_run(block, options)
        print(summary_line(block), file=err)
    except KeyboardInterrupt:
        print("ocn_telemetry: interrupted while publishing; it may be partial, and the ledger records what went "
              "out (verify --pending reads it back)", file=err)
    except Exception as error:  # noqa: BLE001 - the probe's exit code is returned whatever happens here
        print("ocn_telemetry: UNSENT (PUBLISHER_ERROR:%s)" % type(error).__name__, file=err)
    return code


def _verify_after_run(block: dict[str, Any], options: argparse.Namespace) -> dict[str, Any]:
    """`run --verify`: read the run just sent back from both vendors, polling up to WAIT_S."""
    ledger_dir = Path(options.ledger_dir) if options.ledger_dir else LEDGER_DIR
    entry = read_ledger(ledger_dir, block["run_id"])
    if entry is None or ci_guard():
        return {"state": "UNMEASURED", "reason": "CI_GUARD" if entry is not None else "NOT_IN_LEDGER"}
    result = verify_entry(entry, readback(), WAIT_S)
    record_verification(ledger_dir, entry, result)
    return result


def _publish_run(options: argparse.Namespace, argv: list[str], probe: str, script: Path | None, stdout: bytes,
                 snapshots: dict[Path, Any], err: Any, publisher: Callable[..., dict[str, Any]]) -> dict[str, Any]:
    mode = switch_mode(options.telemetry)
    if mode == "off":
        return _block(mode, reason="DISABLED", probe=probe)
    spec = PROBES.get(probe)
    # A receipt that names its own subcommand is judged by publishable(): the argv cannot tell a
    # subcommand from the value of an option before it (`ocn_classroom_live.py --host forge run`).
    if (spec is not None and spec.commands is not None and probe not in COMMAND_RECEIPTS
            and _subcommand(argv, script) not in spec.commands):
        return _block(mode, reason="NOT_PUBLISHABLE", probe=probe)
    receipt = extract_receipt(decode_bytes(stdout)) or _changed_receipt(snapshots)
    if receipt is None:
        return _block(mode, reason="NO_RECEIPT", probe=probe)
    # An explicit --probe is passed as given, so a name outside the registry is refused, not guessed.
    return publisher(receipt, probe=options.probe or probe or None, mode=mode, sinks=options.sinks,
                     expect=options.expect,
                     env=_argv_env(argv), fleet_map=options.fleet_map,
                     probe_digest=digest12(script) if script is not None else None,
                     dd_metrics=options.dd_metrics or None,
                     ledger_dir=Path(options.ledger_dir) if options.ledger_dir else None, stderr=err)


# ── selftest: offline, a CI check ────────────────────────────────────────────────────────────


@contextlib.contextmanager
def _socket_guard(attempts: list[str]) -> Iterator[None]:
    """Every way out of this process refuses and is counted; the originals come back afterwards."""
    saved = (socket.create_connection, socket.getaddrinfo, socket.socket.connect, socket.socket.connect_ex)

    def refuse(*_args: Any, **_kwargs: Any) -> Any:
        attempts.append("socket")
        raise OSError("selftest: the network is closed")

    socket.create_connection = socket.getaddrinfo = refuse
    socket.socket.connect = socket.socket.connect_ex = refuse
    try:
        yield None
    finally:
        socket.create_connection, socket.getaddrinfo, socket.socket.connect, socket.socket.connect_ex = saved


@contextlib.contextmanager
def _selftest_environment() -> Iterator[None]:
    """The selftest's own sends go to a recorder behind the socket guard, so CI may run them, PostHog's
    precondition reads as landed, and the switch is unset, so the workstation's own settings change
    nothing. Every variable comes back afterwards."""
    wanted = {ALLOW_CI_ENV: "1", POSTHOG_ACK_ENV: "1", SWITCH: None}
    before = {name: os.environ.get(name) for name in wanted}
    try:
        for name, value in wanted.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        yield None
    finally:
        for name, value in before.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


def _selftest_receipt(box: str, address: str) -> dict[str, Any]:
    at = "2026-09-24T12:00:00+00:00"
    return {"schema": PROBES["ocn_journey_report"].schema, "at": at, "box": box, "env": "staging",
            "walked_from_ip": address, "workspace": "abc123def456ghi", "lesson_body_head": "from " + box,
            "legs": [{"leg": "control.absent", "doing": "CONTROL", "http": 404, "verdict": "OK"},
                     {"leg": "control.anon", "doing": "CONTROL", "http": 401, "verdict": "OK"},
                     {"leg": "missions", "doing": "Propose", "http": 400, "verdict": "UNHELPFUL",
                      "why": "refused " + box + " at " + address}],
            "controls_held": True, "defects": [{"leg": "missions", "verdict": "UNHELPFUL"}], "state": "DEFECTS"}


def selftest() -> dict[str, Any]:
    """Offline: sockets refuse, the planted machine name and documentation address are built here,
    and every send goes to an in-memory recorder."""
    checks: list[dict[str, Any]] = []
    attempts: list[str] = []
    calls: list[str] = []
    batches: list[Any] = []

    def record(name: str, ok: bool) -> None:
        checks.append({"check": name, "state": "PASS" if ok else "FAIL"})

    def recorder(method: str, url: str, body: Any, headers: dict[str, str], timeout: float) -> tuple[int, str, Any]:
        calls.append(url)
        if url == PH_CAPTURE:
            batches.append(body)
        return (202 if "datadoghq" in url else 200), "", {}

    box = "-".join(("ray", "xyz0", "0"))
    address = ".".join(("192", "0", "2", "10"))
    now = dt.datetime(2026, 9, 24, 12, 1, tzinfo=dt.timezone.utc)
    fake = {CAPTURE_KEY: "_".join(("phc", "selftest" * 3)), DD_KEY: "0" * 32, DD_SITE_NAME: DD_SITE}
    with tempfile.TemporaryDirectory(prefix="ocn-telemetry-selftest-") as folder, _socket_guard(attempts), \
            _selftest_environment():
        # The guard itself, shown to refuse: a numeric lookup never touches the network, so without a
        # working guard it would simply answer.
        blocked = False
        try:
            socket.getaddrinfo(address, 9)
        except OSError:
            blocked = True
        record("the socket guard refuses a lookup", blocked and attempts == ["socket"])
        attempts.clear()
        fleet = Path(folder) / "fleet.json"
        fleet.write_text(json.dumps({"boxes": {box: {"guildmaster": "forge", "guild": "builder"}}}), encoding="utf-8")
        ledger = Path(folder) / "ledger"
        receipt = _selftest_receipt(box, address)
        on_disk = {path.stem for path in HERE.glob("ocn_*.py")} - {Path(__file__).stem}
        record("the registry names exactly the %d probes on disk" % len(on_disk),
               set(PROBES) == on_disk and set(ADAPTERS) == set(PROBES))
        record("an unset or unknown switch reads as off", switch_mode("") == "off" and switch_mode("loud") == "off")
        plan = prepare(receipt, fleet_map=fleet, now=now)
        text = json.dumps(plan.bodies)
        record("no planted name or address reaches an outbound byte", box not in text and address not in text)
        record("the leak gate passes the clean bodies", leak_gate(plan.bodies, plan.rule)["state"] == "PASS")
        for label, planted, family in (("machine name", box, "machines"), ("documentation address", address, "ips"),
                                       ("email address", "@".join(("seat", "example.org")), "emails")):
            dirty = copy.deepcopy(plan.bodies)
            dirty["posthog.batch"][0]["properties"]["ocn_state"] = planted
            verdict = leak_gate(dirty, plan.rule)
            record("the leak gate withholds a planted %s" % label, verdict["state"] == "FAIL" and verdict[family] >= 1)
        tagged = copy.deepcopy(plan.bodies)
        tagged["datadog.event"]["tags"].append("ocn_probe:not_a_probe")
        record("the tag gate refuses a value outside its enum",
               bool(tag_gate(tagged, plan.cat)) and not tag_gate(plan.bodies, plan.cat))
        record("the metric catalogue stays within %d series" % SERIES_CEILING,
               series_ceiling(plan.cat.features) <= SERIES_CEILING)
        withheld = prepare(receipt, fleet_map=fleet, now=now)
        withheld.bodies["datadog.logs"][0]["message"] += " " + box
        block = deliver(withheld, mode="send", ledger_dir=ledger, credentials=fake, transport=recorder, now=now)
        record("a send carrying a planted name is withheld before any request",
               block["reason"] == "LEAK_GATE" and not calls)
        block = deliver(plan, mode="send", ledger_dir=ledger, credentials=fake, transport=recorder, now=now)
        record("a clean send goes out in order, to the pinned hosts only",
               block["state"] == "SENT" and calls == [PH_CAPTURE, PH_CAPTURE, DD_EVENTS, DD_LOGS])
        sent = [event for body in batches for event in body["batch"]]
        record("the $ip marker is attached to every sent event, and only after the gates",
               bool(sent) and all(event["properties"].get("$ip") == UNSPECIFIED_IP for event in sent)
               and "$ip" not in json.dumps(plan.bodies))
        off = publish(receipt, mode="off", fleet_map=fleet, ledger_dir=Path(folder) / "off", transport=recorder)
        record("off sends nothing and writes nothing",
               off["reason"] == "DISABLED" and len(calls) == 4 and not (Path(folder) / "off").exists())
        os.environ[SWITCH] = "off"
        vetoed = publish(receipt, mode="send", fleet_map=fleet, ledger_dir=Path(folder) / "vetoed", credentials=fake,
                         transport=recorder, now=now)
        os.environ.pop(SWITCH, None)
        record("the switch set to off vetoes a send flag",
               vetoed["reason"] == "DISABLED" and len(calls) == 4 and not (Path(folder) / "vetoed").exists())
        refused = {"schema": PROBES["ocn_seat_session"].schema, "seat": box, "env": "staging",
                   "identity": {"state": "REFUSED", "code": "IDENTITY_CONFLICT"}, "login": "NOT_ATTEMPTED"}
        record("a seat identity refusal is sent nowhere",
               publish(refused, mode="send", fleet_map=fleet, ledger_dir=ledger, credentials=fake,
                       transport=recorder, now=now)["reason"] == "IDENTITY_REFUSED" and len(calls) == 4)
    record("no socket was opened", not attempts)
    passed = sum(check["state"] == "PASS" for check in checks)
    return {"schema": CONTRACT, "command": "selftest", "checks": checks, "passed": passed, "total": len(checks),
            "sockets_opened": len(attempts), "state": "PASS" if passed == len(checks) else "FAIL"}


def selftest_main() -> int:
    result = selftest()
    print(json.dumps(result, indent=2))
    return 0 if result["state"] == "PASS" else 1


# ── command line ─────────────────────────────────────────────────────────────────────────────


def _sinks_arg(value: str) -> tuple[str, ...]:
    chosen = tuple(part.strip() for part in value.split(",") if part.strip())
    if not chosen or any(part not in SINKS for part in chosen):
        raise argparse.ArgumentTypeError("sinks are a comma list of: " + ", ".join(SINKS))
    return chosen


def run_main(argv: list[str], *, stdout: Any = None, stderr: Any = None) -> int:
    split = argv.index("--") if "--" in argv else len(argv)
    parser = argparse.ArgumentParser(prog="ocn_telemetry.py run",
                                     description="Run one probe, then publish its receipt.")
    parser.add_argument("--telemetry", choices=MODES, default=None,
                        help="default: BUILDANDDO_OCN_TELEMETRY, else off; the switch set to off vetoes it")
    parser.add_argument("--sinks", type=_sinks_arg, default=SINKS)
    parser.add_argument("--probe", default="")
    parser.add_argument("--expect", choices=("allow", "deny"), default=None)
    parser.add_argument("--dd-metrics", action="store_true")
    parser.add_argument("--fleet-map", default=None)
    parser.add_argument("--verify", action="store_true", help="after a send, read the run back (A3)")
    parser.add_argument("--ledger-dir", default=None)
    options = parser.parse_args(argv[:split])
    command = argv[split + 1:]
    if not command:
        print("ocn_telemetry run: put the probe command after --", file=stderr or sys.stderr)
        return 2
    return run_command(options, command, stdout=stdout, stderr=stderr)


def _strict_ok(block: dict[str, Any]) -> bool:
    """--strict: a send must be accepted by every selected sink; a dry run must pass both gates."""
    if block["mode"] == "send":
        return block["state"] in ("SENT", "VERIFIED") and not block["degraded"]
    if block["mode"] == "dry-run":
        return block["gates"].get("tag") == "PASS" and block["gates"].get("leak") == "PASS"
    return True


def publish_main(args: argparse.Namespace) -> int:
    try:
        raw = sys.stdin.buffer.read() if args.receipt == "-" else Path(args.receipt).read_bytes()
    except OSError:
        raw = b""
    receipt = extract_receipt(decode_bytes(raw))
    # Without --mode the switch decides, and an unset switch makes this a dry run.
    block = publish(receipt, probe=args.probe or None, mode=switch_mode(args.mode, default="dry-run"),
                    sinks=args.sinks, force=args.force,
                    expect=args.expect, env=args.env, fleet_map=args.fleet_map, probe_digest=args.probe_digest,
                    dd_metrics=args.dd_metrics or None,
                    ledger_dir=Path(args.ledger_dir) if args.ledger_dir else None)
    line = json.dumps({**receipt, "ocn_telemetry": block} if args.tee and receipt is not None else block,
                      sort_keys=False)
    print(line)
    print(summary_line(block), file=sys.stderr)
    return 1 if args.strict and not _strict_ok(block) else 0


def _verify_targets(args: argparse.Namespace, ledger_dir: Path, read: Readback) -> list[dict[str, Any]]:
    receipt, path = None, None
    if args.pending:
        entries = pending_entries(ledger_dir)
    elif args.run:
        if not _UUID.fullmatch(args.run):
            return [{"run_id": "", "state": "UNMEASURED", "reason": "NOT_A_RUN_ID"}]
        entry = read_ledger(ledger_dir, args.run.lower())
        if entry is None:
            return [{"run_id": args.run.lower(), "state": "UNMEASURED", "reason": "NOT_IN_LEDGER"}]
        entries = [entry]
    else:
        path = Path(args.receipt)
        receipt = extract_receipt(decode_bytes(path.read_bytes())) if path.is_file() else None
        if receipt is None:
            return [{"run_id": "", "state": "UNMEASURED", "reason": "NO_RECEIPT"}]
        entry = read_ledger(ledger_dir, receipt_ids(receipt)["run_id"])
        if entry is None:
            return [{"run_id": receipt_ids(receipt)["run_id"], "state": "UNMEASURED", "reason": "NOT_IN_LEDGER"}]
        entries = [entry]
    results = []
    for entry in entries:
        result = verify_entry(entry, read, args.wait)
        updated = record_verification(ledger_dir, entry, result)
        if receipt is not None and path is not None and args.update_receipt:
            result["receipt_updated"] = persisted_receipt(path)
            if result["receipt_updated"]:
                # The digest excludes this block, so the receipt keeps its run id after the rewrite.
                with open(path, "w", encoding="utf-8", newline="\n") as handle:
                    handle.write(json.dumps({**receipt, "ocn_telemetry": block_from_ledger(updated, ledger_dir)},
                                            indent=2) + "\n")
        results.append(result)
    return results


def verify_main(args: argparse.Namespace, read: Readback | None = None) -> int:
    """verify runs on the release workstation and is itself an A3 action: C4 posts under an invalid key."""
    ledger_dir = Path(args.ledger_dir) if args.ledger_dir else LEDGER_DIR
    if ci_guard():
        report: dict[str, Any] = {"contract": CONTRACT, "state": "UNMEASURED", "reason": "CI_GUARD", "results": []}
    elif args.tags:
        report = {"contract": CONTRACT, **verify_tags(read or readback())}
    else:
        results = _verify_targets(args, ledger_dir, read or readback())
        states = [result["state"] for result in results]
        state = (next((verdict for verdict in (*VERDICTS, "NOT_CHECKED") if verdict in states), "VERIFIED")
                 if states else "NOT_CHECKED")
        report = {"contract": CONTRACT, "state": state, "results": results}
    print(json.dumps(report))
    print("ocn_telemetry verify: %s" % report["state"], file=sys.stderr)
    return 1 if args.strict and report["state"] not in ("VERIFIED", "CLEAN") else 0


def probes_main() -> int:
    print(json.dumps({"contract": CONTRACT, "probes": [
        {"name": probe.name, "schema": probe.schema or "key-shape", "env_default": probe.env_default or None,
         "mode": probe.mode, "posthog_check_events": probe.ph_checks, "datadog_event": probe.dd_event,
         "publishable": list(probe.commands) if probe.commands is not None else "every invocation",
         "write_path": probe.write_path or None} for probe in REGISTRY]}, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("run", help="run a probe, then publish its receipt (options, then -- and the command)")
    pub = sub.add_parser("publish", help="publish one receipt read from a file or stdin")
    pub.add_argument("--receipt", required=True, help="a receipt file, or - for stdin")
    pub.add_argument("--probe", default="")
    pub.add_argument("--mode", choices=MODES, default=None,
                     help="default: BUILDANDDO_OCN_TELEMETRY, else dry-run; the switch set to off vetoes it")
    pub.add_argument("--sinks", type=_sinks_arg, default=SINKS)
    pub.add_argument("--tee", action="store_true", help="print the receipt with its block, not the block alone")
    pub.add_argument("--force", action="store_true", help="send again a run the ledger records as sent")
    pub.add_argument("--expect", choices=("allow", "deny"), default=None)
    pub.add_argument("--env", choices=ENVS, default=None, help="for receipts that do not record their env")
    pub.add_argument("--fleet-map", default=None)
    pub.add_argument("--probe-digest", default=None)
    pub.add_argument("--dd-metrics", action="store_true")
    pub.add_argument("--strict", action="store_true")
    pub.add_argument("--ledger-dir", default=None)
    ver = sub.add_parser("verify", help="read published runs back from both vendors, with controls (A3)")
    target = ver.add_mutually_exclusive_group(required=True)
    target.add_argument("--pending", action="store_true", help="every sent run the ledger has not verified")
    target.add_argument("--run", default=None, help="one run id")
    target.add_argument("--receipt", default=None, help="the run a receipt file was published as")
    target.add_argument("--tags", action="store_true", help="read back the opt-in metrics' tag keys")
    ver.add_argument("--update-receipt", action="store_true",
                     help="write the verified block into a persisted state/<probe>/<env>.latest.json")
    ver.add_argument("--wait", type=float, default=WAIT_S, help="seconds to poll for ingestion (default 120)")
    ver.add_argument("--ledger-dir", default=None)
    ver.add_argument("--strict", action="store_true")
    sub.add_parser("probes", help="print the closed probe registry")
    sub.add_parser("selftest", help="offline checks with sockets refused; a CI gate")
    return parser


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "run":
        return run_main(argv[1:])
    args = build_parser().parse_args(argv)
    if args.command == "publish":
        return publish_main(args)
    if args.command == "verify":
        return verify_main(args)
    if args.command == "selftest":
        return selftest_main()
    return probes_main()


if __name__ == "__main__":
    raise SystemExit(main())
