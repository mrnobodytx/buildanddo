# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_ocn_classroom_rota.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     scripts/ci/ocn_classroom_live.py, scripts/ci/ocn_classroom_fleet.py, libs/guildmasters/__init__.py, libs/guildmasters/rota.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/ocn_classroom_live.py; VALIDATES scripts/ci/ocn_classroom_fleet.py; CONSUMES libs/guildmasters/__init__.py; CONSUMES libs/guildmasters/rota.py
# DAG Node:    none
# Intent:      Prove both classroom verifiers cast the canonical eight from the weekly rota, refuse before any request when the rota cannot be seated, and never fall back to Forge or a fixed box.
# ───────────────────────────────────────────────────────────────

"""Exercise the rota cast of ocn_classroom_live.py and ocn_classroom_fleet.py with no network.

Every test runs with urllib.request.urlopen, subprocess.run and the socket layer refusing and
recording each attempt; the module fails if any was made. Where a run is driven end to end, the
scripts' own http/login/on_box seams are replaced by in-memory doubles. Seat ids here are invented
(seat-alpha to seat-india, and seat-zulu) and the only addresses come from the RFC 5737
documentation ranges.
"""
from __future__ import annotations

import ast
import importlib.util
import io
import json
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs.guildmasters import GUILDMASTERS, ORDER, by_seat  # noqa: E402
from libs.guildmasters import rota  # noqa: E402

SCRIPTS = ROOT / "scripts" / "ci"
LIVE_SCRIPT = SCRIPTS / "ocn_classroom_live.py"
FLEET_SCRIPT = SCRIPTS / "ocn_classroom_fleet.py"


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


live = load("ocn_classroom_live", LIVE_SCRIPT)
fleet = load("ocn_classroom_fleet", FLEET_SCRIPT)

_GUARDS: list = []
_ATTEMPTS: list = []


def setUpModule() -> None:  # noqa: N802 - unittest's name
    """Every way out of this process refuses, and each attempt is recorded."""
    def refuse(kind):
        def raiser(*_args, **_kwargs):
            _ATTEMPTS.append(kind)
            raise OSError(f"{kind} is forbidden in this test module")
        return raiser

    for target, kind in (("urllib.request.urlopen", "urlopen"), ("subprocess.run", "subprocess"),
                         ("socket.socket.connect", "socket"), ("socket.create_connection", "socket"),
                         ("socket.getaddrinfo", "socket")):
        guard = patch(target, side_effect=refuse(kind))
        guard.start()
        _GUARDS.append(guard)


def tearDownModule() -> None:  # noqa: N802
    while _GUARDS:
        _GUARDS.pop().stop()
    if _ATTEMPTS:
        raise AssertionError("%d network or process attempt(s) during the rota tests: %s"
                             % (len(_ATTEMPTS), sorted(set(_ATTEMPTS))))


def utc(*parts: int) -> datetime:
    return datetime(*parts, tzinfo=timezone.utc)


EPOCH = utc(2026, 11, 2)
# Opening week (2026-W45): slot 0 Forge hosts and Scholar audits; slot 1 Scholar hosts; slot 7
# Director Nexus hosts and Forge audits.
FORGE_CLASS = utc(2026, 11, 2, 15, 30)
SCHOLAR_CLASS = utc(2026, 11, 2, 19, 0)
DIRECTOR_CLASS = utc(2026, 11, 5, 18, 30)


def class_instants() -> list[datetime]:
    """Half an hour into every class from two weeks before the epoch to ten weeks after it."""
    found = []
    for offset in range(-2, 11):
        for item in rota.week(EPOCH + timedelta(weeks=offset))["classes"]:
            starts = datetime.fromisoformat(item["starts_at"].replace("Z", "+00:00"))
            found.append(starts + timedelta(minutes=30))
    return found


def address(last: int, block: int = 0) -> str:
    """A documentation address (RFC 5737), built so no address literal sits in this file."""
    prefix = (("192", "0", "2"), ("198", "51", "100"), ("203", "0", "113"))[block]
    return ".".join((*prefix, str(last)))


SPELLINGS = {"seat-alpha": "Forge", "seat-bravo": "scholar", "seat-charlie": "gm-oracle",
             "seat-delta": "Alex", "seat-echo": "STERLING", "seat-foxtrot": "muse",
             "seat-golf": "Quill", "seat-hotel": "Director Nexus"}


def boxes(spellings: dict[str, str] | None = None, extra: bool = True) -> dict[str, dict]:
    """Invented fleet-map records: box id -> guildmaster spelling and a documentation address."""
    chosen = SPELLINGS if spellings is None else spellings
    records = {box: {"guildmaster": gm, "guild": "as the map spells it", "public_ip": address(10 + i, i % 3)}
               for i, (box, gm) in enumerate(sorted(chosen.items()))}
    if extra:
        # A box whose seat is no guildmaster is ignored, never cast.
        records["seat-india"] = {"guildmaster": "c-one", "public_ip": address(99, 2)}
    return records


def without(*seats: str) -> dict[str, str]:
    return {box: gm for box, gm in SPELLINGS.items() if by_seat_of(gm) not in seats}


def by_seat_of(spelling: str) -> str:
    entry = fleet.resolve(spelling)
    return entry.seat if entry else ""


def box_of(seat: str, records: dict[str, dict]) -> str:
    return next(box for box, record in sorted(records.items()) if by_seat_of(record["guildmaster"]) == seat)


def default_joiners(plan: dict) -> list[str]:
    return [plan["auditor"], *[s for s in plan["attendees"] if s != plan["auditor"]][:2]]


class CanonTests(unittest.TestCase):
    """Both verifiers name exactly the eight registry seats, Director Nexus included."""

    def test_live_guildmasters_are_the_registry_eight(self) -> None:
        self.assertEqual(set(live.GUILDMASTERS), set(ORDER))
        self.assertEqual(len(live.GUILDMASTERS), 8)
        self.assertEqual(live.GUILDMASTERS["director"], "entertainment")
        self.assertEqual(live.GUILDMASTERS, {g.seat: g.guild for g in GUILDMASTERS})

    def test_fleet_resolves_every_spelling_to_the_canon(self) -> None:
        placed = fleet.placed(boxes())
        self.assertNotIn("seat-india", placed)
        self.assertEqual(sorted(entry.seat for entry in placed.values()), sorted(ORDER))
        for spelling in ("director", "Director Nexus", "gm-director-nexus", "DIRECTOR"):
            records = boxes({"seat-hotel": spelling}, extra=False)
            self.assertEqual(fleet.placed(records)["seat-hotel"].slug, "director-nexus", spelling)

    def test_the_fixed_boxes_are_gone(self) -> None:
        for attribute in ("HOST_BOX", "JOIN_BOXES", "OUTSIDER_BOX"):
            self.assertFalse(hasattr(fleet, attribute), attribute)

    def test_no_machine_literal_outside_ssh_keys(self) -> None:
        needles = ("mesh-" + "control", "ray-" + "tor")
        for path in (LIVE_SCRIPT, FLEET_SCRIPT):
            source = path.read_text(encoding="utf-8")
            lines = source.splitlines()
            for node in ast.walk(ast.parse(source)):
                if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "SSH_KEYS" for t in node.targets):
                    for index in range(node.lineno - 1, node.end_lineno):
                        lines[index] = ""
            rest = "\n".join(lines)
            for needle in needles:
                self.assertNotIn(needle, rest, f"{path.name} names a machine outside SSH_KEYS")

    def test_this_module_never_reads_the_real_box_ids(self) -> None:
        # The fleet's SSH_KEYS names real boxes. A test here may only replace it wholesale
        # (patch.dict with clear=True), never read it, so no real box is paired with a persona at run
        # time either - a pairing the literal scan above cannot see.
        tree = ast.parse(Path(__file__).read_text(encoding="utf-8"))
        replaced = {id(call.args[0]) for call in ast.walk(tree)
                    if isinstance(call, ast.Call) and ast.unparse(call.func) == "patch.dict" and call.args
                    and any(k.arg == "clear" and getattr(k.value, "value", None) is True for k in call.keywords)}
        reads = [node.lineno for node in ast.walk(tree)
                 if isinstance(node, ast.Attribute) and node.attr == "SSH_KEYS" and id(node) not in replaced]
        self.assertEqual(reads, [], "read fleet.SSH_KEYS only through patch.dict(..., clear=True)")

    def test_neither_script_restates_the_roster(self) -> None:
        for path in (LIVE_SCRIPT, FLEET_SCRIPT):
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Dict):
                    keys = {k.value for k in node.keys if isinstance(k, ast.Constant)}
                    self.assertFalse(keys & {"scholar", "sterling", "quill"},
                                     f"{path.name} line {node.lineno} restates guildmasters")


class LiveParticipantsTests(unittest.TestCase):
    """The live cast comes from the rota: host, then the auditor and two attendees."""

    def test_every_class_casts_its_rota_host_auditor_and_attendees(self) -> None:
        hosts = set()
        for at in class_instants():
            with self.subTest(at=at.isoformat()):
                host, joiners, plan = live.participants(at)
                self.assertEqual(plan, rota.current(at))
                self.assertEqual(host, plan["host"])
                self.assertEqual(joiners, default_joiners(plan))
                self.assertEqual(joiners[0], plan["auditor"])
                self.assertNotIn(host, joiners)
                self.assertEqual(len(set(joiners)), 3)
                outsider = live.outsider_of(plan, host, joiners)
                self.assertTrue(outsider)
                self.assertNotIn(outsider, [host, *joiners])
                self.assertEqual(outsider, [s for s in plan["attendees"] if s not in joiners][0])
                hosts.add(host)
        self.assertEqual(hosts, set(ORDER))

    def test_the_default_host_is_not_forge_when_the_rota_says_otherwise(self) -> None:
        host, joiners, plan = live.participants(SCHOLAR_CLASS)
        self.assertEqual((host, plan["host"]), ("scholar", "scholar"))
        self.assertNotIn("scholar", joiners)
        host, joiners, plan = live.participants(DIRECTOR_CLASS)
        self.assertEqual(host, "director")
        self.assertEqual(plan["auditor"], "forge")
        self.assertEqual(joiners, ["forge", "scholar", "oracle"])
        self.assertEqual(live.outsider_of(plan, host, joiners), "alex")

    def test_an_overridden_host_is_never_its_own_joiner(self) -> None:
        host, joiners, plan = live.participants(SCHOLAR_CLASS, host="muse")
        self.assertEqual(host, "muse")
        self.assertEqual(joiners[0], plan["auditor"])
        self.assertNotIn("muse", joiners)
        self.assertEqual(len(set(joiners)), 3)
        # The class's own auditor chosen as host: the joiners are the next three in rota order.
        host, joiners, plan = live.participants(SCHOLAR_CLASS, host=rota.current(SCHOLAR_CLASS)["auditor"])
        self.assertNotIn(host, joiners)
        self.assertEqual(len(set(joiners)), 3)
        self.assertNotIn(live.outsider_of(plan, host, joiners), [host, *joiners, ""])

    def test_explicit_joiners_are_kept_in_order(self) -> None:
        host, joiners, _ = live.participants(FORGE_CLASS, join=["director", "muse"])
        self.assertEqual((host, joiners), ("forge", ["director", "muse"]))

    def test_unknown_seats_and_a_hosting_joiner_are_refused(self) -> None:
        for host, join in (("forgery", None), ("Forge", None), ("director-nexus", None), ("", None),
                           (None, ["oracle", "zeta"]), (None, ["Oracle"]), (None, ["forge"]),
                           ("muse", ["muse", "quill"]), (None, ["oracle", "oracle"]), (None, [])):
            with self.subTest(host=host, join=join):
                with self.assertRaises(ValueError) as caught:
                    live.participants(FORGE_CLASS, host=host, join=join)
                self.assertTrue(str(caught.exception).startswith("not a guildmaster seat"), caught.exception)


class LiveMainTests(unittest.TestCase):
    """The command line has no Forge default, follows --at, and refuses before any request."""

    def main(self, *argv: str) -> tuple[int, str]:
        out = io.StringIO()
        with patch.object(sys, "argv", ["ocn_classroom_live.py", *argv]), redirect_stdout(out):
            code = live.main()
        return code, out.getvalue()

    def test_the_parser_defaults_are_none(self) -> None:
        args = live.parser().parse_args(["run"])
        self.assertEqual((args.host, args.join, args.at), (None, None, None))
        self.assertIsNone(fleet.parser().parse_args(["run"]).at)

    def test_the_resolved_host_follows_at(self) -> None:
        for at, host in ((FORGE_CLASS, "forge"), (SCHOLAR_CLASS, "scholar"), (DIRECTOR_CLASS, "director")):
            with self.subTest(host=host):
                recorder = Mock(return_value={"state": "PASS"})
                with patch.object(live, "run", recorder):
                    code, _ = self.main("run", "--at", at.isoformat().replace("+00:00", "Z"), "--json")
                self.assertEqual(code, 0)
                plan = rota.current(at)
                recorder.assert_called_once_with(host, default_joiners(plan), plan)

    def test_overrides_reach_run(self) -> None:
        recorder = Mock(return_value={"state": "FAIL"})
        with patch.object(live, "run", recorder):
            code, _ = self.main("run", "--at", "2026-11-02T19:00:00+00:00", "--host", "quill",
                                "--join", "director, muse", "--json")
        self.assertEqual(code, 1)
        self.assertEqual(recorder.call_args.args[:2], ("quill", ["director", "muse"]))

    def test_unknown_seats_fail_with_no_request(self) -> None:
        before = list(_ATTEMPTS)
        for argv in (["--host", "forgery"], ["--join", "oracle,zeta"], ["--host", "muse", "--join", "muse"],
                     ["--at", "2026-11-02T15:30Z", "--join", "forge"], ["--join", ","]):
            with self.subTest(argv=argv):
                login, http = Mock(), Mock()
                with patch.object(live, "login", login), patch.object(live, "http", http):
                    code, printed = self.main("run", *argv, "--json")
                self.assertEqual(code, 1)
                result = json.loads(printed)
                self.assertEqual(result["state"], "FAIL")
                self.assertTrue(result["reason"].startswith("not a guildmaster seat"), result["reason"])
                self.assertEqual((result["seats"], result["checks"]), ([], []))
                login.assert_not_called()
                http.assert_not_called()
        self.assertEqual(_ATTEMPTS, before)

    def test_a_naive_or_malformed_at_is_refused_by_the_parser(self) -> None:
        for value in ("2026-11-02T15:00", "next tuesday", ""):
            with self.subTest(value=value), redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as caught:
                    live.parser().parse_args(["run", "--at", value])
                self.assertEqual(caught.exception.code, 2)

    def test_selftest_lists_the_eight_and_the_offline_rota_class(self) -> None:
        code, printed = self.main("selftest", "--at", "2026-11-05T18:30:00Z")
        result = json.loads(printed)
        self.assertEqual(result["guildmasters"], list(ORDER))
        self.assertIn("director", result["guildmasters"])
        plan = rota.current(DIRECTOR_CLASS)
        self.assertEqual(result["rota"], {key: plan[key] for key in ("week", "slot", "host", "auditor", "starts_at")})
        self.assertEqual(result["cast"], {"host": "director", "joiners": ["forge", "scholar", "oracle"],
                                          "outsider": "alex"})
        self.assertEqual(code, 0 if result["signer_present"] else 1)


class FakeStaging:
    """In-memory classroom backend for the live verifier's http() seam.

    Membership persists for the life of the double, as it does on staging: member.set adds a seat
    and nothing removes it. The admin snapshot lists members `page_size` to a page.
    """

    def __init__(self, host: str, page_size: int = 20, members_readable: bool = True) -> None:
        self.host = host
        self.page_size = page_size
        self.members_readable = members_readable
        self.members: set[str] = set()
        self.calls: list[tuple] = []

    def __call__(self, path: str, token: str = "", body=None, method: str = "") -> tuple[int, dict]:
        seat = token.removeprefix("token-")
        self.calls.append((seat, path, (body or {}).get("action")))
        route, _, query = path.partition("?")
        if path.startswith("/api/collections/workspaces/records"):
            return 200, {"items": [{"id": "workspacealpha", "owner": "uid-" + self.host, "name": "Guild hall"}]}
        if route.endswith("/admin"):
            if body is None:
                if not query:
                    return 200, {"settings": {"revision": 3}}
                if not self.members_readable:
                    return 403, {"message": "forbidden"}
                page = int(query.removeprefix("members_page="))
                ordered = sorted(self.members)
                items = ordered[(page - 1) * self.page_size:page * self.page_size]
                return 200, {"settings": {"revision": 3},
                             "members": {"items": [{"user": user, "role": "editor"} for user in items], "page": page,
                                         "has_more": page * self.page_size < len(ordered)}}
            self.members.add(body["payload"]["user"])
            return 200, {}
        if path.startswith("/api/collections/tutorials/records"):
            return 200, {"items": []}
        if path.endswith("/classrooms"):
            return 200, ({"id": "roomalpha"} if body["action"] == "room.create" else {})
        if path.endswith("/classrooms/roomalpha"):
            if seat != self.host and "uid-" + seat not in self.members:
                return 404, {"message": "not found"}
            return 200, {"room": {"status": "live", "revision": 2, "section": 1},
                         "participants": sorted(self.members), "messages": {"items": [1, 2, 3]}}
        return 0, {"err": "unrouted"}


def signed_in(refuse: tuple[str, ...] = ()):
    def login(seat: str) -> dict:
        if seat in refuse:
            return {"seat": seat, "state": "REFUSED", "http": 401}
        return {"seat": seat, "state": "OK", "token": "token-" + seat, "uid": "uid-" + seat, "email": None,
                "guild": live.GUILDMASTERS.get(seat, "")}
    return login


class LiveRunTests(unittest.TestCase):
    """A full live run against the double: the outsider control is required for a PASS."""

    def hold(self, at: datetime, join=None, refuse: tuple[str, ...] = (),
             staging: FakeStaging | None = None) -> tuple[dict, FakeStaging, dict]:
        host, joiners, plan = live.participants(at, join=join)
        staging = staging or FakeStaging(host)
        with patch.object(live, "login", side_effect=signed_in(refuse)), patch.object(live, "http", staging):
            return live.run(host, joiners, plan), staging, plan

    def test_the_rota_class_passes_with_its_control(self) -> None:
        result, staging, plan = self.hold(DIRECTOR_CLASS)
        self.assertEqual(result["state"], "PASS", result.get("summary"))
        self.assertEqual((result["host"], result["joiners"]), ("director", ["forge", "scholar", "oracle"]))
        self.assertEqual(result["host_persona"], "director-nexus")
        self.assertEqual(result["joiner_personas"], ["forge", "scholar", "oracle"])
        self.assertEqual(result["rota"], {key: plan[key] for key in ("week", "slot", "host", "auditor", "starts_at")})
        self.assertEqual(result["outsider"], "alex")
        self.assertEqual(result["control"], {"state": "RUN", "persona": "alex"})
        labels = [check["check"] for check in result["checks"]]
        self.assertIn("Director Nexus schedules the class", labels)
        self.assertIn("CONTROL unseated Alex cannot read the class", labels)
        self.assertIn("host seats Forge in the workspace", labels)
        self.assertEqual({call[0] for call in staging.calls}, {"director", "forge", "scholar", "oracle", "alex"})

    def test_no_outsider_left_means_the_control_did_not_run_and_no_pass(self) -> None:
        everyone = [seat for seat in ORDER if seat != "forge"]
        result, staging, _ = self.hold(FORGE_CLASS, join=everyone)
        self.assertEqual(result["summary"]["contract_broken"], [])
        self.assertEqual(result["control"]["state"], "NOT_RUN")
        self.assertIsNone(result["outsider"])
        self.assertEqual(result["state"], "FAIL")

    def test_an_outsider_that_cannot_sign_in_is_reported_not_skipped(self) -> None:
        result, _, _ = self.hold(DIRECTOR_CLASS, refuse=("alex",))
        self.assertEqual(result["summary"]["contract_broken"], [])
        self.assertEqual(result["control"]["state"], "NOT_RUN")
        self.assertEqual(result["control"]["persona"], "alex")
        self.assertEqual(result["outsider"], "alex")
        self.assertEqual(result["state"], "FAIL")
        self.assertIn("CONTROL NOT RUN", live.table(result))

    def test_a_seat_an_earlier_run_seated_is_never_the_control_outsider(self) -> None:
        # Runs seat their joiners in the host's workspace and nothing removes them. In 2026-W48 Forge's
        # class leaves Alex over, whom the W45 to W47 runs seated; reading the class as Alex would get
        # 200 and report CONTRACT_BROKEN although the server behaved correctly.
        staging = FakeStaging("forge", page_size=2)
        weeks = []
        for offset in range(4):
            starts = next(item["starts_at"] for item in rota.week(EPOCH + timedelta(weeks=offset))["classes"]
                          if item["host"] == "forge")
            at = datetime.fromisoformat(starts.replace("Z", "+00:00")) + timedelta(minutes=30)
            seated = set(staging.members)
            result, _, plan = self.hold(at, staging=staging)
            weeks.append((plan["week"], result["outsider"], result["already_seated"]))
            self.assertEqual(result["state"], "PASS", result.get("summary"))
            self.assertEqual(result["control"], {"state": "RUN", "persona": live.persona(result["outsider"])})
            self.assertNotIn("uid-" + result["outsider"], seated)
            self.assertTrue(all("uid-" + seat in seated for seat in result["already_seated"]))
            candidates = live.outsiders(plan, "forge", result["joiners"])
            self.assertEqual(candidates[:len(result["already_seated"]) + 1], [*result["already_seated"], result["outsider"]])
        self.assertEqual(weeks[:3], [("2026-W45", "sterling", []), ("2026-W46", "sterling", []), ("2026-W47", "sterling", [])])
        self.assertEqual(weeks[3][0], "2026-W48")
        self.assertEqual(weeks[3][2], ["alex"])
        self.assertNotEqual(weeks[3][1], "alex")
        self.assertIn("CONTROL skipped, already members: Alex", live.table(result))

    def test_no_outsider_outside_the_workspace_means_the_control_did_not_run(self) -> None:
        staging = FakeStaging("director")
        staging.members = {"uid-" + seat for seat in ORDER if seat != "director"}
        result, _, _ = self.hold(DIRECTOR_CLASS, staging=staging)
        self.assertEqual(result["summary"]["contract_broken"], [])
        self.assertEqual(result["control"], {"state": "NOT_RUN",
                                             "reason": "every guildmaster left over is already a member of the host's workspace"})
        self.assertIsNone(result["outsider"])
        self.assertEqual(result["already_seated"], live.outsiders(rota.current(DIRECTOR_CLASS), "director",
                                                                  ["forge", "scholar", "oracle"]))
        self.assertEqual(result["state"], "FAIL")

    def test_an_unreadable_member_list_means_the_control_did_not_run(self) -> None:
        host, joiners, plan = live.participants(DIRECTOR_CLASS)
        staging = FakeStaging(host, members_readable=False)
        result, _, _ = self.hold(DIRECTOR_CLASS, staging=staging)
        self.assertEqual(result["control"], {"state": "NOT_RUN", "reason": "the host's workspace members could not be read"})
        self.assertIsNone(result["outsider"])
        self.assertEqual(result["state"], "FAIL")
        self.assertNotIn("alex", {call[0] for call in staging.calls})
        with patch.object(live, "http", return_value=(200, {"members": {"items": [], "has_more": True}})):
            self.assertIsNone(live.members_of("/admin", "token"))
        with patch.object(live, "http", return_value=(200, ["not", "a", "snapshot"])):
            self.assertIsNone(live.members_of("/admin", "token"))


class FakeFleet:
    """In-memory boxes and backend for the fleet verifier's on_box() seam. Every box starts seated."""

    def __init__(self, records: dict[str, dict], host_box: str) -> None:
        self.host_uid = "uid-" + host_box
        self.members = {"uid-" + box for box in records}
        self.calls: list[tuple] = []

    def __call__(self, box: str, record: dict, method: str, path: str = "", body=None) -> dict:
        uid = "uid-" + box
        self.calls.append((box, method, path, (body or {}).get("action")))
        if method == "WHOAMI":
            return {"stage": "login", "http": 200, "uid": uid, "email": None, "ip": record["public_ip"]}
        if path.startswith("/api/collections/workspaces/records"):
            return {"stage": "call", "http": 200,
                    "body": {"items": [{"id": "workspacealpha", "owner": self.host_uid, "name": "Guild hall"}]}}
        if path.endswith("/admin"):
            if method == "GET":
                return {"stage": "call", "http": 200, "body": {"settings": {"revision": 4}}}
            user = body["payload"]["user"]
            (self.members.add if body["action"] == "member.set" else self.members.discard)(user)
            return {"stage": "call", "http": 200, "body": {}}
        if path.startswith("/api/collections/tutorials/records"):
            return {"stage": "call", "http": 200, "body": {"items": []}}
        if path.endswith("/classrooms"):
            return {"stage": "call", "http": 200,
                    "body": {"id": "roomalpha"} if body["action"] == "room.create" else {}}
        if path.endswith("/classrooms/roomalpha"):
            if uid not in self.members:
                return {"stage": "call", "http": 403, "body": {"message": "forbidden"}}
            return {"stage": "call", "http": 200,
                    "body": {"room": {"status": "live", "revision": 2, "section": 1},
                             "participants": sorted(self.members), "messages": {"items": [1, 2]}}}
        return {"stage": "call", "http": 0, "error": "unrouted"}


class FleetCastTests(unittest.TestCase):
    """cast() seats the rota host's box, then the auditor's and the attendees', never a fixed box."""

    def test_every_class_casts_the_rota_hosts_box(self) -> None:
        records = boxes()
        for at in class_instants():
            with self.subTest(at=at.isoformat()):
                plan = rota.current(at)
                picked = fleet.cast(records, at)
                self.assertEqual(picked["state"], "CAST")
                entries = picked["entries"]
                self.assertEqual(entries[picked["host"]].seat, plan["host"])
                self.assertEqual([entries[box].seat for box in picked["joiners"]], default_joiners(plan))
                self.assertEqual(picked["joiners"][0], box_of(plan["auditor"], records))
                self.assertTrue(picked["auditor_seated"])
                cast_seats = [entries[box].seat for box in [picked["host"], *picked["joiners"]]]
                outsider = entries[picked["outsider"]].seat
                self.assertNotIn(outsider, cast_seats)
                self.assertEqual(outsider, [s for s in plan["attendees"] if s not in cast_seats][0])
                self.assertNotIn("seat-india", [picked["host"], *picked["joiners"], picked["outsider"]])
                self.assertEqual(picked["rota"]["host"], plan["host"])

    def test_director_spellings_seat_director_nexus(self) -> None:
        for spelling in ("director", "Director Nexus"):
            with self.subTest(spelling=spelling):
                records = boxes(dict(SPELLINGS, **{"seat-hotel": spelling}))
                picked = fleet.cast(records, DIRECTOR_CLASS)
                self.assertEqual(picked["host"], "seat-hotel")
                self.assertEqual(picked["entries"]["seat-hotel"].name, "Director Nexus")
                self.assertEqual(picked["joiners"][0], "seat-alpha")      # Forge audits this class

    def test_a_second_box_for_a_guildmaster_is_never_its_stand_in(self) -> None:
        records = boxes(dict(SPELLINGS, **{"seat-hotel": "Forge"}))
        picked = fleet.cast(records, DIRECTOR_CLASS)
        self.assertEqual(picked["state"], "FAIL")
        self.assertEqual(picked["reason"], "ROTA_HOST_UNSEATED: Director Nexus has no seat in the fleet map")

    def test_a_guildmaster_with_two_boxes_is_cast_once_from_its_first(self) -> None:
        records = boxes(dict(SPELLINGS, **{"seat-zulu": "forge"}))
        picked = fleet.cast(records, FORGE_CLASS)
        self.assertEqual(picked["host"], "seat-alpha")
        self.assertNotIn("seat-zulu", [*picked["joiners"], picked["outsider"]])
        picked = fleet.cast(records, DIRECTOR_CLASS)               # Forge audits this class
        self.assertEqual(picked["joiners"][0], "seat-alpha")
        self.assertNotIn("seat-zulu", [picked["host"], *picked["joiners"], picked["outsider"]])

    def test_an_unseated_auditor_is_reported(self) -> None:
        picked = fleet.cast(boxes(without("forge")), DIRECTOR_CLASS)
        self.assertEqual(picked["state"], "CAST")
        self.assertFalse(picked["auditor_seated"])
        self.assertEqual([picked["entries"][b].seat for b in picked["joiners"]], ["scholar", "oracle", "alex"])

    def test_too_few_seated_attendees_are_refused(self) -> None:
        picked = fleet.cast(boxes({"seat-hotel": "director", "seat-alpha": "forge", "seat-bravo": "scholar"}),
                            DIRECTOR_CLASS)
        self.assertEqual(picked["state"], "FAIL")
        self.assertTrue(picked["reason"].startswith("ROTA_ATTENDEES_UNSEATED"), picked["reason"])


class FleetRunTests(unittest.TestCase):
    """run() refuses before any hop when the rota cannot be seated, and needs its control to pass."""

    def run_fleet(self, records: dict[str, dict], at: datetime, double=None) -> tuple[dict, Mock]:
        hop = Mock(side_effect=double) if double is not None else Mock()
        with patch.object(fleet, "fleet", return_value=records), patch.object(fleet, "on_box", hop):
            return fleet.run(at), hop

    def test_an_absent_host_refuses_without_a_hop(self) -> None:
        for records in (boxes(without("director")), {}):
            with self.subTest(boxes=sorted(records)):
                result, hop = self.run_fleet(records, DIRECTOR_CLASS)
                self.assertEqual(result["state"], "FAIL")
                self.assertEqual(result["reason"], "ROTA_HOST_UNSEATED: Director Nexus has no seat in the fleet map")
                self.assertEqual(result["rota"]["host"], "director")
                hop.assert_not_called()
        self.assertFalse(hasattr(fleet, "HOST_BOX"))

    def test_too_few_attendees_refuse_without_a_hop(self) -> None:
        result, hop = self.run_fleet(boxes({"seat-alpha": "Forge", "seat-bravo": "scholar"}), FORGE_CLASS)
        self.assertEqual(result["state"], "FAIL")
        self.assertTrue(result["reason"].startswith("ROTA_ATTENDEES_UNSEATED"))
        hop.assert_not_called()

    def test_the_rota_class_runs_from_the_cast_boxes_and_passes_with_its_control(self) -> None:
        records = boxes(dict(SPELLINGS, **{"seat-hotel": "director"}))
        double = FakeFleet(records, "seat-hotel")
        result, _ = self.run_fleet(records, DIRECTOR_CLASS, double)
        self.assertEqual(result["state"], "PASS", result.get("summary"))
        self.assertEqual(result["host_persona"], "director-nexus")
        self.assertEqual(result["joiner_personas"], ["forge", "scholar", "oracle"])
        self.assertEqual([seat["guildmaster"] for seat in result["seats"]],
                         ["Director Nexus", "Forge", "Scholar", "Oracle"])
        self.assertEqual([seat["box"] for seat in result["seats"]],
                         ["seat-hotel", "seat-alpha", "seat-bravo", "seat-charlie"])
        self.assertEqual(result["control"], {"state": "RUN", "persona": "alex"})
        self.assertEqual(result["readback"]["from_box"], "seat-alpha")
        created = [call for call in double.calls if call[3] == "room.create"]
        self.assertEqual([call[0] for call in created], ["seat-hotel"])
        refused = [c for c in result["checks"] if c["check"].startswith("CONTROL")]
        self.assertEqual([(c["box"], c["http"], c["outcome"]) for c in refused], [("seat-delta", 403, "AS_EXPECTED")])
        touched = {call[0] for call in double.calls}
        self.assertEqual(touched, {"seat-hotel", "seat-alpha", "seat-bravo", "seat-charlie", "seat-delta"})
        self.assertIn("Director Nexus", fleet.table(result))

    def test_no_outsider_box_means_the_control_did_not_run_and_no_pass(self) -> None:
        plan = rota.current(DIRECTOR_CLASS)
        cast_only = {box: gm for box, gm in SPELLINGS.items()
                     if by_seat_of(gm) in [plan["host"], *default_joiners(plan)]}
        records = boxes(cast_only)
        double = FakeFleet(records, "seat-hotel")
        result, _ = self.run_fleet(records, DIRECTOR_CLASS, double)
        self.assertEqual(result["summary"]["contract_broken"], [])
        self.assertEqual(result["control"]["state"], "NOT_RUN")
        self.assertEqual(result["summary"]["control"], "NOT_RUN")
        self.assertEqual(result["state"], "FAIL")
        self.assertNotIn("member.remove", [call[3] for call in double.calls])
        self.assertIn("CONTROL NOT RUN", fleet.table(result))

    def test_seats_and_selftest_use_canonical_names(self) -> None:
        # seats() reports only boxes it holds a key for. The keys are replaced with invented box ids,
        # so no real fleet box is ever paired with a persona in this public test.
        keys = {"seat-alpha": "invented-key", "seat-bravo": "invented-key"}
        records = {"seat-alpha": {"guildmaster": "director", "public_ip": address(7)},
                   "seat-bravo": {"guildmaster": "not a persona", "public_ip": address(8, 1)},
                   "seat-charlie": {"guildmaster": "oracle", "public_ip": address(9, 2)}}
        hop = Mock(return_value={"stage": "login", "http": 0, "error": "double"})
        with patch.dict(fleet.SSH_KEYS, keys, clear=True), patch.object(fleet, "fleet", return_value=records), \
                patch.object(fleet, "on_box", hop):
            rows = fleet.seats()["seats"]
            checked = fleet.selftest(DIRECTOR_CLASS)
        self.assertEqual([row["box"] for row in rows], ["seat-alpha", "seat-bravo"])
        self.assertEqual(sorted(checked["ssh_keys_present"]), ["seat-alpha", "seat-bravo"])
        self.assertEqual([call.args[0] for call in hop.call_args_list], ["seat-alpha", "seat-bravo"])
        self.assertEqual([(row["guildmaster"], row["persona"]) for row in rows],
                         [("Director Nexus", "director-nexus"), (None, None)])
        self.assertEqual(checked["guildmasters"], list(ORDER))
        self.assertEqual(checked["rota"]["host"], "director")
        self.assertEqual(checked["seated"], ["oracle", "director"])
        self.assertTrue(checked["reason"].startswith("ROTA_ATTENDEES_UNSEATED"))


if __name__ == "__main__":
    unittest.main()
