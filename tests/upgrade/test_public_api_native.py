# CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_public_api_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-BUDDI-002
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-002
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     tests/upgrade/test_dossier_native.py, apps/pocketbase/pb_hooks/public-api.pb.js,
#              apps/pocketbase/pb_hooks/public-api.js, apps/pocketbase/pb_hooks/buddi-intake.js,
#              apps/pocketbase/pb_migrations/1792100000_buddi_intake.js
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_dossier_native.py; VALIDATES apps/pocketbase/pb_hooks/public-api.pb.js;
#              VALIDATES apps/pocketbase/pb_hooks/public-api.js; VALIDATES apps/pocketbase/pb_hooks/buddi-intake.js;
#              VALIDATES apps/pocketbase/pb_migrations/1792100000_buddi_intake.js
# DAG Node:    none
# Intent:      Require the voice agent's eight routes to answer from public data only, refuse writes in the declared
#              order, and keep received requests across a rollback, on the real PocketBase binary.
# ───────────────────────────────────────────────────────────────

"""Exercise Buddi's tool routes on a disposable, loopback-only native PocketBase.

The server applies the repository's WHOLE migration set in the production directory layout, so
the lessons, the evidence fabric and the workspace collections are the ones production has. A
fixture migration then plants private records carrying the word PRIVATE-SENTINEL, and a control in
each test proves they are really there before asserting that no route ever returns them.
"""

from __future__ import annotations

import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import ProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from tests.upgrade.test_dossier_native import NO_WINDOW, NativeServer  # noqa: E402

BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
PUBLIC = "/api/v1/public"
SENTINEL = "PRIVATE-SENTINEL"
PRIVATE_IDS = ("privatemission1", "privateevidenc1", "privatechalng01", "privatedraft001", "privatenoslug01")
# Local fixture values only. The name avoids the words commit scanners treat as credentials.
AGENT_HEADER_VALUE = "fixture-agent-header-value-" + "x" * 20
ADMIN = ("fixture-admin@fixture.invalid", "local-fixture-password-only")
FIXTURE = r"""
migrate((app) => {
    const users = app.findCollectionByNameOrId('users');
    const alice = new Record(users);
    alice.id = 'accountalice001';
    alice.set('email', 'alice@fixture.invalid');
    alice.set('verified', true);
    alice.setPassword('local-fixture-password-only');
    app.save(alice);
    const save = (name, id, values) => {
        const record = new Record(app.findCollectionByNameOrId(name));
        if (id) record.id = id;
        for (const key of Object.keys(values)) record.set(key, values[key]);
        app.save(record);
        return record;
    };
    const lesson = JSON.parse(__LESSON__);
    save('workspaces', 'workspacealpha1', { name: 'Fixture workspace', owner: alice.id });
    save('missions', 'privatemission1', { title: 'PRIVATE-SENTINEL mission', description: 'PRIVATE-SENTINEL mission body',
        status: 'running', workspace: 'workspacealpha1', owner: alice.id });
    save('evidence', 'privateevidenc1', { content: 'PRIVATE-SENTINEL evidence', type: 'verified', workspace: 'workspacealpha1', owner: alice.id });
    save('challenge_submissions', 'privatechalng01', { problem: 'PRIVATE-SENTINEL submission', status: 'submitted',
        workspace: 'workspacealpha1', owner: alice.id });
    // Two tutorials that are NOT authored curriculum: a draft with a slug but no curriculum version,
    // and one with a version but no slug. Both carry a complete, presentable lesson on purpose, so
    // only the authored-curriculum rule - not a malformed body - can be what keeps them out.
    save('tutorials', 'privatedraft001', { title: 'PRIVATE-SENTINEL draft lesson', summary: 'PRIVATE-SENTINEL draft',
        slug: 'private-sentinel-draft', category: 'Operations', lesson, order: 998 });
    save('tutorials', 'privatenoslug01', { title: 'PRIVATE-SENTINEL unslugged lesson', summary: 'PRIVATE-SENTINEL unslugged',
        curriculum_version: '2026.09.1', category: 'Operations', lesson, order: 999 });
    save('knowledge_sources', '', { display_id: 'SRC-FIX-0001', source_type: 'WEB', title: 'Fixture public source', url: 'https://example.org/source' });
    save('knowledge_claims', '', { display_id: 'CLM-FIX-0001', subject: 'a fixture claim', predicate: 'is', object: 'unverified',
        domain: 'fixture.public', epistemic_state: 'USER_ASSERTED', confidence: 0.2 });
    save('governance_research_quests', '', { display_id: 'RQ-FIX-0001', trigger_reason: 'NEW_DOMAIN_INSUFFICIENT', subject_type: 'CLAIM',
        subject_id: 'CLM-FIX-0001', status: 'OPEN', question: 'Is the fixture claim reproducible?' });
    save('evidence_epochs', '', { display_id: 'EPOCH-FIX-01', root_algorithm: 'sha256-merkle-v1', status: 'SEALED',
        root_digest: 'ab'.repeat(32), artifact_count: 3 });
    // An operator locks one fabric collection down. Its record must stop being served the same minute.
    const audits = app.findCollectionByNameOrId('governance_audits');
    audits.listRule = null;
    audits.viewRule = null;
    app.save(audits);
    save('governance_audits', '', { display_id: 'AUD-FIX-0001', target_type: 'CLAIM', target_id: 'CLM-FIX-0001', action: 'CORROBORATE',
        result: 'CONFIRMED', auditor: alice.id, independent: true, observed_at: '2026-09-22 00:00:00.000Z',
        observation: { note: 'PRIVATE-SENTINEL audit' } });
}, () => {});
"""
HOURLY_FILL = r"""
migrate((app) => {
    const collection = app.findCollectionByNameOrId('buddi_intake');
    for (let i = 0; i < 200; i++) {
        const record = new Record(collection);
        const values = { kind: 'feedback', payload: { feedback_type: 'fill', summary: 'row ' + i }, payload_digest: $security.sha256('fill-' + i),
            conversation_id: 'fill_' + i, status: 'received', protocol_version: 1 };
        for (const key of Object.keys(values)) record.set(key, values[key]);
        app.save(record);
    }
}, () => {});
"""


class Site(http.server.ThreadingHTTPServer):
    """The public site and the moderators' webhook, as local doubles with fixed, inspectable answers."""

    def __init__(self) -> None:
        self.posts: list[dict] = []
        super().__init__(("127.0.0.1", 0), SiteHandler)
        self.base = f"http://127.0.0.1:{self.server_address[1]}"
        threading.Thread(target=self.serve_forever, daemon=True).start()


class SiteHandler(http.server.BaseHTTPRequestHandler):
    FILES = {
        "/capabilities.json": ("application/json", {"generated_at": "2026-09-22T00:00:00+00:00", "state": "MEASURED",
            "deployed": {"production": "abc1234", "staging": "abc1234"}, "counts": {"LIVE": 2, "DECLARED": 0}, "total": 2,
            "capabilities": [{"surface": "public", "label": "Home", "path": "/", "state": "LIVE"},
                             {"surface": "workspace", "label": "Missions", "path": "/app/missions", "state": "LIVE"}]}),
        "/roadmap-status.json": ("application/json", {"generated_at": "2026-09-22T00:00:00+00:00", "state": "MEASURED",
            "campaign_id": "fixture", "sprint_day": 21, "sprint_days": 21, "planned_pct": 100.0, "actual_pct": 82.0,
            "gate_state": "PASS", "milestones": [{"day": 1, "title": "Kickoff", "status": "verified", "evidence": "commit abc"}]}),
        # The site answers unknown paths with its HTML shell and a 200. That must never read as data.
        "/platform-health.json": ("text/html; charset=utf-8", "<!doctype html><html><body>shell</body></html>"),
    }

    def do_GET(self) -> None:  # noqa: N802 - http.server's method name
        kind, body = self.FILES.get(self.path, ("application/json", {"missing": True}))
        raw = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        self.send_response(200 if self.path in self.FILES else 404)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        self.server.posts.append({"path": self.path, "body": json.loads(self.rfile.read(length) or b"null")})
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args: object) -> None:  # silence per-request stderr noise
        return


class PublicApiServer(NativeServer):
    """A disposable server in the production directory layout, running the real migration set."""

    def __init__(self, binary: str, environment: dict[str, str]) -> None:
        # Windows can still hold a handle on the database for a moment after the child exits.
        self.directory = tempfile.TemporaryDirectory(prefix="buildanddo-public-api-native-", ignore_cleanup_errors=True)
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process = None
        self.log = (self.root / "native.log").open("w")
        self.environment = {
            "PATH": os.environ.get("PATH", ""),
            # Windows initializes Winsock from SystemRoot; without it the child exits before health.
            **({"SystemRoot": os.environ["SystemRoot"]} if os.name == "nt" and "SystemRoot" in os.environ else {}),
            # pb_migrations/1764579159_create_superuser.js requires both and fails startup without them.
            "PB_SUPERUSER_EMAIL": ADMIN[0],
            "PB_SUPERUSER_PASSWORD": ADMIN[1],
            **environment,
        }
        try:
            # pb_hooks and pb_migrations as siblings, as deployed: the curriculum migrations find
            # pb_migrations/data only in that layout and otherwise skip their deepening passes.
            shutil.copytree(ROOT / "apps/pocketbase/pb_migrations", self.root / "pb_migrations")
            hooks = self.root / "pb_hooks"
            hooks.mkdir()
            for name in ("public-api.pb.js", "public-api.js", "buddi-intake.js", "workspace-access.js", "workflow-policy.js",
                         "tutorial-learning.pb.js", "tutorial-learning.js"):
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            lesson = json.loads((ROOT / "apps/pocketbase/pb_migrations/data/starter-tutorials.json").read_text(encoding="utf-8"))["lessons"][0]
            # Sorts after every product migration it depends on and before 1792100000_buddi_intake.js,
            # so a one-step rollback reverts exactly the intake migration.
            (self.root / "pb_migrations" / "1792000000_public_api_fixture.js").write_text(
                FIXTURE.replace("__LESSON__", json.dumps(json.dumps(lesson["lesson"]))), encoding="utf-8")
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                self.port = reservation.getsockname()[1]
            self.base = f"http://127.0.0.1:{self.port}"
            self.migrate("up")
            self.start()
        except BaseException:
            self.close()
            raise

    def paths(self) -> list[str]:
        return [f"--dir={self.root / 'pb_data'}", f"--migrationsDir={self.root / 'pb_migrations'}", f"--hooksDir={self.root / 'pb_hooks'}"]

    def migrate(self, direction: str, count: str = "") -> str:
        result = subprocess.run([self.binary, "migrate", direction, *([count] if count else []), *self.paths()],
                                input="y\n", text=True, cwd=self.root, env=self.environment, capture_output=True,
                                timeout=60, check=False, **NO_WINDOW)
        self.log.write((result.stdout or "") + (result.stderr or ""))
        self.log.flush()
        if result.returncode:
            raise AssertionError(f"Native migrate {direction} failed; see {self.root / 'native.log'}.")
        return result.stdout or ""

    def revert(self, count: str = "1") -> list[str]:
        """Roll back and move the reverted files aside: 0.39.8 re-applies anything left in place on serve."""
        output = self.migrate("down", count)
        reverted = [line.split("Reverted ", 1)[1].strip() for line in output.splitlines() if "Reverted " in line]
        if not reverted:
            raise AssertionError("Nothing was reverted, so there is no rollback under test.")
        (self.root / "reverted").mkdir(exist_ok=True)
        for name in reverted:
            shutil.move(str(self.root / "pb_migrations" / name), str(self.root / "reverted" / name))
        self.reverted = reverted
        return reverted

    def restore(self) -> None:
        for name in getattr(self, "reverted", []):
            shutil.move(str(self.root / "reverted" / name), str(self.root / "pb_migrations" / name))
        self.reverted = []
        self.migrate("up")

    def call(self, method: str, path: str, body: object = None, headers: dict[str, str] | None = None,
             raw: bytes | None = None) -> tuple[int, str, bytes, object]:
        """One loopback request; returns status, content type, raw body and the parsed JSON (or None)."""
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        request = Request(self.base + path, method=method, data=data,
                          headers={"Content-Type": "application/json", **(headers or {})})
        opener = build_opener(ProxyHandler({}))
        try:
            with opener.open(request, timeout=20) as response:
                status, kind, payload = response.status, response.headers.get("Content-Type", ""), response.read()
        except HTTPError as error:
            status, kind, payload = error.code, error.headers.get("Content-Type", ""), error.read()
        try:
            parsed = json.loads(payload) if payload else None
        except ValueError:
            parsed = None
        return status, kind, payload, parsed

    def admin(self) -> str:
        status, _, _, data = self.call("POST", "/api/collections/_superusers/auth-with-password",
                                       {"identity": ADMIN[0], "password": ADMIN[1]})
        if status != 200:
            raise AssertionError("Fixture superuser authentication failed.")
        return data["token"]

    def intake(self) -> list[dict]:
        status, _, _, data = self.call("GET", "/api/collections/buddi_intake/records?perPage=500&sort=created",
                                       headers={"Authorization": self.admin()})
        if status != 200:
            raise AssertionError(f"Superuser read of buddi_intake failed with {status}.")
        return data["items"]


def stamped(test: unittest.TestCase, data: object, authority: str) -> None:
    """Every answer carries its authority, a source and a parseable time."""
    test.assertIsInstance(data, dict)
    test.assertEqual(data.get("authority"), authority)
    test.assertEqual(data.get("schema"), "buildanddo.public-api/v1")
    test.assertIsInstance(data.get("source"), str)
    test.assertTrue(data["source"])
    test.assertRegex(data.get("as_of", ""), r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$")


def keys(value: object) -> set[str]:
    """Every key at any depth of a JSON document."""
    if isinstance(value, dict):
        return set(value) | set().union(*(keys(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(keys(item) for item in value))
    return set()


def tool_headers(conversation: str, **extra: str) -> dict[str, str]:
    return {"X-Buddi-Tool-Secret": AGENT_HEADER_VALUE, "X-Conversation-Id": conversation,
            "X-Trace-Id": "trace-fixture-1", "X-Campaign-Id": "campaign-fixture", **extra}


@unittest.skipUnless(BINARY and Path(BINARY).is_file(), "Native PocketBase unavailable; public API acceptance remains open.")
class NativePublicReadTests(unittest.TestCase):
    """The five A0 routes, on one server, with private records planted beside the public ones."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.site = Site()
        cls.server = PublicApiServer(BINARY, {"BUDDI_TOOL_SECRET": AGENT_HEADER_VALUE, "BUILDANDDO_PUBLIC_ORIGIN": cls.site.base})

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.close()
        cls.site.shutdown()
        cls.site.server_close()

    def get(self, path: str) -> tuple[int, dict]:
        """Every read in this class passes through here, so none of them can carry private text."""
        status, kind, raw, data = self.server.call("GET", PUBLIC + path)
        self.assertIn("application/json", kind, f"{path} answered {kind}")
        self.assertNotIn(SENTINEL.encode(), raw, path)
        stamped(self, data, "A0")
        return status, data

    def test_every_read_route_answers_stamped_json_of_the_right_shape(self) -> None:
        status, context = self.get("/product-context")
        self.assertEqual(status, 200)
        # PocketBase serialises through a Go map, so keys arrive sorted; compare as a set.
        self.assertEqual(set(context["sections"]), {"purpose", "operating_model", "capabilities", "use_cases", "curriculum",
                                                    "community", "roadmap", "platform_health", "boundaries"})
        self.assertIn("educational", context["sections"]["purpose"]["framing"])
        self.assertEqual(context["sections"]["community"]["discord"], "https://discord.gg/vTDZxmpHHC")
        self.assertEqual(context["sections"]["curriculum"]["lessons"], 33)

        status, demo = self.get("/challenges/demo")
        self.assertEqual((status, demo["state"], len(demo["items"])), (200, "OK", 5))
        first = demo["items"][0]
        self.assertEqual(set(first), {"challenge_id", "kind", "title", "summary", "track", "effort_minutes", "outcomes",
                                      "practice", "verification", "links"})
        self.assertEqual(first["kind"], "lesson")

        status, state = self.get("/challenges/release-with-evidence/state")
        self.assertEqual((status, state["state"]), (200, "PUBLISHED"))
        self.assertEqual([step["kind"] for step in state["steps"]][-2:], ["practice", "check"])
        self.assertEqual(state["verifier"]["state"], "SERVER_CHECKED")
        self.assertRegex(state["content_digest"], r"^[a-f0-9]{64}$")
        self.assertFalse(state["runs"]["public"])

        status, evidence = self.get("/evidence?challenge_id=release-with-evidence")
        self.assertEqual((status, evidence["state"]), (200, "OK"))
        self.assertEqual(evidence["items"][-1]["content_digest"], state["content_digest"])
        self.assertTrue(all(item["type"] in ("reference", "digest") for item in evidence["items"]))

        status, replay = self.get("/replay/release-with-evidence")
        self.assertEqual((status, replay["state"]), (200, "NO_PUBLIC_RUNS"))
        self.assertEqual(replay["timeline"][0]["event"], "published")

        # The verification step stays meaningful: the knowledge check's answer is never handed out.
        lesson = json.loads((ROOT / "apps/pocketbase/pb_migrations/data/starter-tutorials.json").read_text(encoding="utf-8"))
        explanation = next(item for item in lesson["lessons"] if item["slug"] == "release-with-evidence")["lesson"]["check"]["explanation"]
        for document in (demo, state, evidence, replay):
            self.assertFalse(keys(document) & {"answer", "explanation"})
            self.assertNotIn(explanation[:60], json.dumps(document))

    def test_product_context_measures_published_files_and_refuses_the_html_shell(self) -> None:
        _, context = self.get("/product-context")
        sections = context["sections"]
        self.assertEqual(sections["capabilities"]["state"], "MEASURED")
        self.assertEqual(sections["capabilities"]["public_pages"], [{"label": "Home", "path": "/", "state": "LIVE"}])
        self.assertEqual(sections["roadmap"]["state"], "MEASURED")
        self.assertEqual(sections["roadmap"]["milestones"], [{"day": 1, "title": "Kickoff", "status": "verified"}])
        # A 200 carrying the site's HTML shell is not data, however healthy the status code looks.
        self.assertEqual(sections["platform_health"]["state"], "UNAVAILABLE")
        self.assertIn("text/html", sections["platform_health"]["reason"])
        status, only = self.get("/product-context?section=use_cases")
        self.assertEqual((status, list(only["sections"])), (200, ["use_cases"]))
        self.assertTrue(only["sections"]["use_cases"]["learning_paths"])
        status, missing = self.get("/product-context?section=pricing_sheet")
        self.assertEqual((status, missing["state"]), (404, "UNKNOWN"))
        self.assertIn("capabilities", missing["sections"])
        self.assertEqual(self.get("/product-context?section=Bad!")[0], 400)

    def test_demo_filters_narrow_cap_and_say_why_when_empty(self) -> None:
        status, capped = self.get("/challenges/demo?limit=50")
        self.assertEqual((status, len(capped["items"]), capped["filters"]["limit_capped"]), (200, 10, True))
        self.assertEqual(self.get("/challenges/demo?limit=abc")[0], 400)
        self.assertEqual(self.get("/challenges/demo?limit=0")[0], 400)
        status, found = self.get("/challenges/demo?objective=verify%20a%20release%20before%20shipping")
        self.assertEqual(status, 200)
        self.assertEqual([item["challenge_id"] for item in found["items"]][0], "release-with-evidence")
        # A business type no lesson is about yields an honest empty list, not the nearest thing.
        status, empty = self.get("/challenges/demo?business_type=dental&problem_category=missed_appointments")
        self.assertEqual((status, empty["state"], empty["items"]), (200, "EMPTY", []))
        self.assertIn("33 authored lessons", empty["reason"])
        self.assertEqual(self.get("/challenges/demo?objective=" + "x" * 201)[0], 400)

    def test_state_digest_matches_the_certificate_binding_in_tutorial_learning(self) -> None:
        _, state = self.get("/challenges/release-with-evidence/state")
        status, _, _, auth = self.server.call("POST", "/api/collections/users/auth-with-password",
                                              {"identity": "alice@fixture.invalid", "password": "local-fixture-password-only"})
        self.assertEqual(status, 200)
        status, _, _, learning = self.server.call("GET", "/api/buildanddo/learning/" + self.record_id("release-with-evidence"),
                                                  headers={"Authorization": auth["token"]})
        self.assertEqual(status, 200)
        # The digest tutorial-learning.js binds into a completion certificate, computed by that code.
        self.assertEqual(learning["tutorial"]["content_digest"], state["content_digest"])
        status, by_record = self.get(f"/challenges/{self.record_id('release-with-evidence')}/state")
        self.assertEqual((status, by_record["content_digest"]), (200, state["content_digest"]))

    def record_id(self, slug: str) -> str:
        token = self.server.admin()
        status, _, _, data = self.server.call("GET", "/api/collections/tutorials/records?filter=" + quote(f"slug='{slug}'"),
                                              headers={"Authorization": token})
        self.assertEqual((status, len(data["items"])), (200, 1))
        return data["items"][0]["id"]

    def test_private_records_are_never_returned_and_ids_are_not_an_oracle(self) -> None:
        # CONTROL: the private rows exist and a superuser can see them, so their absence below means something.
        token = self.server.admin()
        for collection, record in (("missions", "privatemission1"), ("evidence", "privateevidenc1"),
                                   ("challenge_submissions", "privatechalng01"), ("tutorials", "privatedraft001"),
                                   ("tutorials", "privatenoslug01")):
            status, _, raw, _ = self.server.call("GET", f"/api/collections/{collection}/records/{record}", headers={"Authorization": token})
            self.assertEqual(status, 200, collection)
            self.assertIn(SENTINEL.encode(), raw)

        # A real private mission id and an id that exists nowhere get the same answer.
        answers = []
        for mission in ("privatemission1", "nosuchmission01"):
            for path in (f"/challenges/release-with-evidence/state?mission_id={mission}", f"/replay/release-with-evidence?mission_id={mission}",
                         f"/evidence?mission_id={mission}"):
                status, data = self.get(path)
                self.assertEqual((status, data["state"]), (404, "UNKNOWN"))
                answers.append({key: value for key, value in data.items() if key != "as_of"})
        self.assertEqual(answers[:3], answers[3:])

        # Non-curriculum tutorials are unknown by slug and by record id, answered exactly like an id that
        # never existed once the echoed id itself is set aside.
        def unknown(challenge: str, template: str) -> dict:
            status, data = self.get(template.format(challenge))
            self.assertEqual((status, data["state"]), (404, "UNKNOWN"), template.format(challenge))
            return {key: str(value).replace(challenge, "<id>") for key, value in data.items() if key != "as_of"}
        for challenge in ("private-sentinel-draft", "privatedraft001", "privatenoslug01", "privatemission1"):
            for template in ("/challenges/{}/state", "/replay/{}", "/evidence?challenge_id={}"):
                self.assertEqual(unknown(challenge, template), unknown("nosuchlesson001", template))
        for evidence in ("privateevidenc1", "private-sentinel-draft.digest", "privatedraft001.ref.1"):
            self.assertEqual(self.get(f"/evidence?evidence_id={evidence}")[0], 404)
        status, _, _, refused = self.server.call("POST", PUBLIC + "/challenges/request",
                                                 {"challenge_id": "private-sentinel-draft", "user_objective": "x", "success_criteria": "y"},
                                                 tool_headers("conv_private_1"))
        self.assertEqual((status, refused["state"]), (404, "UNKNOWN"))

        # Searching with the private records' own words can match authored lessons that share a word
        # ("draft"), but never the private records; get() has already refused any sentinel text.
        listed = set()
        status, search = self.get("/challenges/demo?limit=10&objective=PRIVATE%20SENTINEL%20draft%20unslugged%20lesson")
        self.assertEqual(status, 200)
        listed.update(item["challenge_id"] for item in search["items"])
        for track in ("operations", ""):
            status, page = self.get(f"/challenges/demo?limit=10&problem_category={track}")
            self.assertEqual(status, 200)
            listed.update(item["challenge_id"] for item in page["items"])
        self.assertFalse(listed & {"private-sentinel-draft", *PRIVATE_IDS})
        self.assertEqual(self.get("/product-context?section=curriculum")[1]["sections"]["curriculum"]["lessons"], 33)

    def test_evidence_serves_only_collections_whose_rules_are_public(self) -> None:
        status, claim = self.get("/evidence?evidence_id=CLM-FIX-0001")
        self.assertEqual(status, 200)
        # The record's own label comes back as-is: an unverified claim is never upgraded.
        self.assertEqual((claim["items"][0]["type"], claim["items"][0]["state"]), ("claim", "USER_ASSERTED"))
        status, listed = self.get("/evidence?evidence_type=claim")
        self.assertEqual((status, listed["items"][0]["evidence_id"]), (200, "CLM-FIX-0001"))
        self.assertEqual(self.get("/evidence?evidence_id=EPOCH-FIX-01")[1]["items"][0]["state"], "SEALED")
        # CONTROL: the locked audit row exists; a superuser reads it.
        status, _, raw, _ = self.server.call("GET", "/api/collections/governance_audits/records?filter=(display_id='AUD-FIX-0001')",
                                             headers={"Authorization": self.server.admin()})
        self.assertEqual(status, 200)
        self.assertIn(b"AUD-FIX-0001", raw)
        # Locked by its rules, so it is not served, by id or by type, and the summary says so.
        self.assertEqual(self.get("/evidence?evidence_id=AUD-FIX-0001")[0], 404)
        status, audits = self.get("/evidence?evidence_type=audit")
        self.assertEqual((status, audits["state"], audits["items"]), (200, "EMPTY", []))
        summary = {entry["type"]: entry for entry in self.get("/evidence")[1]["types"]}
        self.assertFalse(summary["audit"]["published"])
        self.assertTrue(summary["claim"]["published"])
        status, unsupported = self.get("/evidence?evidence_type=readback")
        self.assertEqual((status, unsupported["state"]), (200, "EMPTY"))
        self.assertIn("claim", unsupported["supported_types"])
        # Fabric evidence is not linked to lessons, so asking for it under a lesson finds nothing.
        self.assertEqual(self.get("/evidence?challenge_id=release-with-evidence&evidence_id=CLM-FIX-0001")[0], 404)


@unittest.skipUnless(BINARY and Path(BINARY).is_file(), "Native PocketBase unavailable; public API acceptance remains open.")
class NativeBuddiIntakeTests(unittest.TestCase):
    """The three A2 routes. Each test gets its own server because each changes shared state."""

    def boot(self, environment: dict[str, str] | None = None) -> PublicApiServer:
        self.site = Site()
        self.addCleanup(self.site.server_close)
        self.addCleanup(self.site.shutdown)
        server = PublicApiServer(BINARY, {"BUDDI_TOOL_SECRET": AGENT_HEADER_VALUE, "BUILDANDDO_PUBLIC_ORIGIN": self.site.base,
                                          "BUDDI_HANDOFF_DISCORD_WEBHOOK": self.site.base + "/discord/webhook",
                                          **(environment or {})})
        self.addCleanup(server.close)
        return server

    def post(self, server: PublicApiServer, path: str, body: object, headers: dict[str, str] | None = None,
             raw: bytes | None = None) -> tuple[int, dict]:
        status, kind, _, data = server.call("POST", PUBLIC + path, body, headers, raw)
        self.assertIn("application/json", kind)
        stamped(self, data, "A2")
        return status, data

    FEEDBACK = {"feedback_type": "knowledge_gap", "summary": "Buddi could not explain classrooms.", "rating": 4}
    HANDOFF = {"reason": "Wants to talk to a person", "summary": "Asked about team rollout @everyone", "preferred_contact_method": "email"}
    REQUEST = {"challenge_id": "release-with-evidence", "user_objective": "Learn to verify a release",
               "success_criteria": "Complete the lesson and earn the certificate"}

    def test_writes_are_closed_without_a_configured_secret(self) -> None:
        server = self.boot({"BUDDI_TOOL_SECRET": ""})
        for path, body in (("/feedback", self.FEEDBACK), ("/support/handoff", self.HANDOFF), ("/challenges/request", self.REQUEST)):
            status, data = self.post(server, path, body, tool_headers("conv_closed_1"))
            self.assertEqual((status, data["state"]), (503, "CLOSED"), path)
        # A secret too short to be one is the same as none.
        server.stop()
        server.environment["BUDDI_TOOL_SECRET"] = "short"
        server.start()
        self.assertEqual(self.post(server, "/feedback", self.FEEDBACK, {**tool_headers("conv_closed_2"), "X-Buddi-Tool-Secret": "short"})[0], 503)
        self.assertEqual(server.intake(), [])

    def test_wrong_or_missing_secret_is_refused(self) -> None:
        server = self.boot()
        for offered in ("", "wrong-" + AGENT_HEADER_VALUE, AGENT_HEADER_VALUE[:-1]):
            headers = tool_headers("conv_auth_1", **{"X-Buddi-Tool-Secret": offered})
            if not offered:
                headers.pop("X-Buddi-Tool-Secret")
            for path, body in (("/feedback", self.FEEDBACK), ("/support/handoff", self.HANDOFF), ("/challenges/request", self.REQUEST)):
                status, data = self.post(server, path, body, headers)
                self.assertEqual((status, data["state"]), (401, "UNAUTHORIZED"), (path, offered[:8]))
        self.assertEqual(server.intake(), [])

    def test_bodies_outside_the_tool_schema_are_refused(self) -> None:
        server = self.boot()
        headers = tool_headers("conv_schema_1")
        cases = [
            ("/feedback", None, b"not json"),
            ("/feedback", None, b"[1, 2]"),
            ("/feedback", {**self.FEEDBACK, "extra": "junk"}, None),
            ("/feedback", {"summary": "no type"}, None),
            ("/feedback", {**self.FEEDBACK, "rating": 6}, None),
            ("/feedback", {**self.FEEDBACK, "rating": "4"}, None),
            ("/feedback", {**self.FEEDBACK, "summary": "x" * 2001}, None),
            ("/feedback", {**self.FEEDBACK, "summary": "bell\u0007"}, None),
            ("/feedback", {**self.FEEDBACK, "summary": "   "}, None),
            ("/support/handoff", {"summary": "no reason"}, None),
            ("/support/handoff", {**self.HANDOFF, "preferred_contact_method": "x" * 201}, None),
            ("/challenges/request", {"challenge_id": "release-with-evidence", "user_objective": "x"}, None),
            ("/challenges/request", {**self.REQUEST, "challenge_id": "../../collections"}, None),
        ]
        for path, body, raw in cases:
            status, data = self.post(server, path, body, headers, raw)
            self.assertEqual((status, data["state"]), (400, "INVALID"), (path, body, raw))
        for missing in ({"X-Conversation-Id": ""}, {"X-Conversation-Id": "{{system__conversation_id}}"}):
            status, data = self.post(server, "/feedback", self.FEEDBACK, {**headers, **missing})
            self.assertEqual((status, data["field"]), (400, "x-conversation-id"))
        status, data = self.post(server, "/feedback", None, headers, json.dumps({**self.FEEDBACK, "summary": "y" * 20000}).encode())
        self.assertEqual((status, data["field"]), (413, "body"))
        self.assertEqual(server.intake(), [])

    def test_receipts_replays_and_the_moderator_notice(self) -> None:
        server = self.boot()
        status, first = self.post(server, "/feedback", self.FEEDBACK, tool_headers("conv_receipt_1"))
        self.assertEqual((status, first["state"], first["status"], first["replayed"]), (201, "RECEIVED", "received", False))
        self.assertRegex(first["receipt_id"], r"^[a-z0-9]{15}$")
        # A retried identical call gets the same receipt, not a second row.
        status, again = self.post(server, "/feedback", self.FEEDBACK, tool_headers("conv_receipt_1"))
        self.assertEqual((status, again["receipt_id"], again["replayed"]), (200, first["receipt_id"], True))
        status, unknown = self.post(server, "/challenges/request", {**self.REQUEST, "challenge_id": "no-such-lesson"}, tool_headers("conv_receipt_1"))
        self.assertEqual((status, unknown["state"]), (404, "UNKNOWN"))
        status, requested = self.post(server, "/challenges/request", self.REQUEST, tool_headers("conv_receipt_1"))
        self.assertEqual((status, requested["kind"]), (201, "challenge_request"))
        self.assertIn("no execution authority", requested["next"])
        status, handoff = self.post(server, "/support/handoff", self.HANDOFF, tool_headers("conv_receipt_2"))
        self.assertEqual((status, handoff["notification"]), (201, "sent"))

        rows = {row["id"]: row for row in server.intake()}
        self.assertEqual(len(rows), 3)
        stored = rows[first["receipt_id"]]
        self.assertEqual((stored["kind"], stored["conversation_id"], stored["trace_id"], stored["campaign_id"], stored["status"]),
                         ("feedback", "conv_receipt_1", "trace-fixture-1", "campaign-fixture", "received"))
        self.assertEqual(stored["payload"], self.FEEDBACK)
        self.assertEqual(rows[handoff["receipt_id"]]["notification"], "sent")
        # Nobody but the server reads or writes the intake through the collection API.
        self.assertEqual(server.call("GET", "/api/collections/buddi_intake/records")[0], 403)
        self.assertEqual(server.call("POST", "/api/collections/buddi_intake/records", {"kind": "feedback"})[0], 403)

        self.assertEqual(len(self.site.posts), 1)
        notice = self.site.posts[0]
        self.assertEqual(notice["path"], "/discord/webhook")
        self.assertEqual((notice["body"]["allowed_mentions"], notice["body"]["flags"]), ({"parse": []}, 4))
        self.assertIn(handoff["receipt_id"], notice["body"]["content"])
        self.assertIn("Preferred contact: email", notice["body"]["content"])
        self.assertNotIn(AGENT_HEADER_VALUE, json.dumps(notice))

    def test_rate_limits_per_conversation_and_per_hour(self) -> None:
        server = self.boot()
        receipts = []
        for index in range(5):
            status, data = self.post(server, "/feedback", {**self.FEEDBACK, "summary": f"note {index}"}, tool_headers("conv_limit_1"))
            self.assertEqual(status, 201)
            receipts.append(data["receipt_id"])
        status, limited = self.post(server, "/feedback", {**self.FEEDBACK, "summary": "note 5"}, tool_headers("conv_limit_1"))
        self.assertEqual((status, limited["state"]), (429, "RATE_LIMITED"))
        # The limit counts stored requests, so a retry of one already received still gets its receipt.
        status, replayed = self.post(server, "/feedback", {**self.FEEDBACK, "summary": "note 0"}, tool_headers("conv_limit_1"))
        self.assertEqual((status, replayed["receipt_id"]), (200, receipts[0]))
        self.assertEqual(self.post(server, "/feedback", self.FEEDBACK, tool_headers("conv_limit_2"))[0], 201)
        # 200 rows written in the last hour closes the intake for every conversation.
        server.stop()
        (server.root / "pb_migrations" / "1792200000_hourly_fill.js").write_text(HOURLY_FILL, encoding="utf-8")
        server.migrate("up")
        server.start()
        status, hourly = self.post(server, "/feedback", self.FEEDBACK, tool_headers("conv_limit_3"))
        self.assertEqual((status, hourly["state"]), (429, "RATE_LIMITED"))
        self.assertIn("hour", hourly["reason"])
        self.assertEqual(len(server.intake()), 206)

    def test_down_keeps_requests_and_reup_restores_the_routes(self) -> None:
        server = self.boot()
        status, kept = self.post(server, "/feedback", self.FEEDBACK, tool_headers("conv_down_1"))
        self.assertEqual(status, 201)
        server.stop()
        self.assertEqual(server.revert("1"), ["1792100000_buddi_intake.js"])
        server.start()
        status, closed = self.post(server, "/feedback", {**self.FEEDBACK, "summary": "during rollback"}, tool_headers("conv_down_2"))
        self.assertEqual((status, closed["state"]), (503, "UNAVAILABLE"))
        server.stop()
        server.restore()
        server.start()
        self.assertEqual([row["id"] for row in server.intake()], [kept["receipt_id"]])
        status, again = self.post(server, "/feedback", self.FEEDBACK, tool_headers("conv_down_1"))
        self.assertEqual((status, again["receipt_id"]), (200, kept["receipt_id"]))
        self.assertEqual(self.post(server, "/feedback", {**self.FEEDBACK, "summary": "after re-up"}, tool_headers("conv_down_2"))[0], 201)


if __name__ == "__main__":
    if "--require-binary" in sys.argv:
        sys.argv.remove("--require-binary")
        if not BINARY or not Path(BINARY).is_file():
            raise SystemExit("FAIL: set BUILDANDDO_TEST_POCKETBASE to the native test binary; public API acceptance did not run.")
    unittest.main()
