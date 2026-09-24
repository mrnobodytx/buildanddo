# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_classroom_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     tests/upgrade/test_dossier_native.py, apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_hooks/classroom-media.js, apps/pocketbase/pb_migrations/1791400000_classroom_media_sessions.js
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_dossier_native.py; VALIDATES apps/pocketbase/pb_hooks/classrooms.js; VALIDATES apps/pocketbase/pb_hooks/classroom-media.js; VALIDATES apps/pocketbase/pb_migrations/1791400000_classroom_media_sessions.js
# DAG Node:    none
# Intent:      Require native classroom authentication, date serialization, concurrent receipt recovery and reversible schema before accepting an installed backend.
# ───────────────────────────────────────────────────────────────

"""Exercise classrooms on a disposable, loopback-only native PocketBase server."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
from typing import Any
import unittest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from tests.upgrade.test_dossier_native import NO_WINDOW, NativeServer  # noqa: E402

BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
WORKSPACE = "workspacealpha1"
MIGRATION = "1790400000_classroom_rooms.js"
# Every migration the classroom surface depends on, in filename order. The room-kind migration
# is not optional: classrooms.js requires `kind` in its schema guard, so a fixture without it
# answers 503 "the classroom backend needs an operator review" - which is the guard working.
MIGRATIONS = (
    MIGRATION,
    "1790600000_classroom_presence.js",
    "1791100000_room_kind.js",
    "1791300000_classroom_attendance.js",
    "1791400000_classroom_media_sessions.js",
    "1791400001_broadcast_classroom_lessons.js",
)
HOOKS = (
    "classrooms.pb.js",
    "classrooms.js",
    "classroom-realtime.pb.js",
    "classroom-realtime-lib.js",
    "classroom-media.js",
    "classroom-presence.pb.js",
    "metrics.pb.js",
    "telemetry.js",
    "workspace-access.js",
    "government-access.js",
    "workflow-policy.js",
    "business-action-policy.js",
)
OFFER = {"type": "offer", "sdp": "v=0\r\ns=fixture-only; no media negotiated\r\n"}
ANSWER = {**OFFER, "type": "answer"}
SEED = r"""
migrate((app) => {
    let users;
    try { users = app.findCollectionByNameOrId('users'); }
    catch { users = new Collection({ name: 'users', type: 'auth' }); }
    users.authRule = ''; users.authAlert = { enabled: false };
    users.passwordAuth = { enabled: true, identityFields: ['email'] };
    if (!users.fields.getByName('name')) users.fields.add(new TextField({ name: 'name', max: 120 }));
    app.save(users);
    for (const [id, name] of [['accountalice001', 'alice'], ['accountbravo001', 'bravo'], ['accountview0001', 'viewer'], ['accountguest001', 'guest']]) {
        const record = new Record(users); record.id = id; record.set('name', name);
        record.set('email', name + '@fixture.invalid'); record.set('verified', true);
        record.setPassword('local-fixture-password-only'); app.save(record);
    }
    const relation = (name, target) => ({ name, type: 'relation', required: true, maxSelect: 1, collectionId: app.findCollectionByNameOrId(target).id });
    const create = (name, fields, readable = false) => {
        const collection = new Collection({ name, type: 'base', listRule: readable ? '@request.auth.id != ""' : null,
            viewRule: readable ? '@request.auth.id != ""' : null, createRule: null, updateRule: null, deleteRule: null, fields });
        app.save(collection); return collection;
    };
    const workspaces = create('workspaces', [relation('owner', 'users')]);
    const workspace = new Record(workspaces); workspace.id = 'workspacealpha1'; workspace.set('owner', 'accountalice001'); app.save(workspace);
    const foreign = new Record(workspaces); foreign.id = 'workspacebravo1'; foreign.set('owner', 'accountguest001'); app.save(foreign);
    const members = create('workspace_members', [relation('workspace', 'workspaces'), relation('user', 'users'), { name: 'role', type: 'text' }]);
    for (const [user, role] of [['accountbravo001', 'editor'], ['accountview0001', 'viewer']]) {
        const member = new Record(members); member.set('workspace', workspace.id); member.set('user', user); member.set('role', role); app.save(member);
    }
    const tutorials = create('tutorials', [{ name: 'title', type: 'text' }, { name: 'summary', type: 'text' }, { name: 'category', type: 'text' },
        { name: 'effort_minutes', type: 'number' }, { name: 'order', type: 'number' }, { name: 'prerequisites', type: 'text' },
        { name: 'slug', type: 'text', max: 100 }, { name: 'curriculum_version', type: 'text', max: 40 },
        { name: 'lesson', type: 'json', maxSize: 65536 }], true);
    const dataDir = $filepath.join(__hooks, '..', 'pb_migrations', 'data');
    const curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'starter-tutorials.json'))));
    for (const data of curriculum.lessons) {
        const record = new Record(tutorials); record.id = data.id;
        for (const key of ['title', 'summary', 'category', 'effort_minutes', 'order', 'prerequisites', 'slug', 'lesson']) record.set(key, data[key]);
        record.set('curriculum_version', curriculum.version); app.save(record);
    }
}, () => {});
"""

# Fixture-only provider responses. Native auth, room scope, relations, session
# storage and request hooks remain the production implementation. No SFU runs.
PROVIDER_DOUBLE = r"""
const actual = require(`${__hooks}/fixture-original-realtime-lib.js`);
module.exports = { ...actual,
    callRealtime(path, _secret, payload, method) {
        const audit = $filepath.join(__hooks, '..', 'fixture-provider-calls.txt');
        let before = '';
        try { before = toString($os.readFile(audit)); } catch (_) { /* first fixture call */ }
        $os.writeFile(audit, before + (method || 'POST') + ' ' + path + '\n', 0o600);
        if (!__PROVIDER_ENABLED__) throw new Error('Fixture forbids provider network calls.');
        const description = { type: 'answer', sdp: 'v=0\r\ns=fixture-only; no media negotiated\r\n' };
        if (path.endsWith('/sessions/new')) return { status: 201, body: {
            sessionId: 'fixture-session-' + (before.split('\n').filter(Boolean).length + 1), sessionDescription: description,
        } };
        if (path.endsWith('/tracks/new')) return { status: 200, body: {
            tracks: payload.tracks.map((track) => ({ location: track.location, trackName: track.trackName,
                ...(track.location === 'local' ? { mid: track.mid } : { sessionId: track.sessionId }) })),
            sessionDescription: { ...description,
                type: payload.tracks.some((track) => track.location === 'remote') ? 'offer' : 'answer' },
            requiresImmediateRenegotiation: payload.tracks.some((track) => track.location === 'remote'),
        } };
        if (path.endsWith('/renegotiate')) return { status: 200, body: {} };
        throw new Error('Unexpected fixture-only provider operation.');
    },
};
if (__PROVIDER_ENABLED__) module.exports.realtimeConfig = () => ({ appId: 'fixture-only-app', secret: 'fixture-only-not-a-credential', reason: '' });
"""


def sanitize_diagnostics(raw: str) -> str:
    """Retain bounded errors without startup links or credential-bearing lines."""
    raw = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", raw)
    lines = []
    for line in raw.splitlines():
        if re.search(
            r"password|passwd|credential|secret|token|authorization|bearer|cookie|superuser|eyJ",
            line,
            re.IGNORECASE,
        ):
            lines.append("[redacted credential-bearing diagnostic]")
            continue
        line = re.sub(r"https?://[^\s]+", "[redacted URL]", line, flags=re.IGNORECASE)
        line = re.sub(r"[\w.+-]+@[\w.-]+", "[redacted account]", line)
        line = re.sub(r"[A-Za-z0-9_+/=-]{40,}", "[redacted opaque value]", line)
        lines.append(line[:2000])
    return "\n".join(lines)[-12000:]


class DiagnosticNativeServer(NativeServer):
    """Retain sanitized failures for the owned fixtures without changing their base."""

    def diagnostics(self) -> str:
        """Read a bounded log tail without moving the running child's file offset."""
        self.log.flush()
        descriptor = self.log.fileno()
        length = os.fstat(descriptor).st_size
        offset = max(0, length - 64000)
        if hasattr(os, "pread"):
            raw = os.pread(descriptor, 64000, offset)
        else:
            # Windows has no pread. Every caller reads after the child it started has exited or
            # been stopped, so moving the shared offset and putting it back misplaces no write.
            position = os.lseek(descriptor, 0, os.SEEK_CUR)
            try:
                os.lseek(descriptor, offset, os.SEEK_SET)
                raw = os.read(descriptor, 64000)
            finally:
                os.lseek(descriptor, position, os.SEEK_SET)
        if offset:
            raw = raw.partition(b"\n")[2]
        return sanitize_diagnostics(raw.decode("utf-8", errors="replace"))

    def migrate(self, direction: str = "up", count: str = "") -> None:
        """Apply isolated migrations and preserve only sanitized subprocess errors."""
        try:
            result = subprocess.run(
                [
                    self.binary,
                    "migrate",
                    direction,
                    *([count] if count else []),
                    *self.paths(),
                ],
                input="y\n",
                text=True,
                cwd=self.root,
                env=self.environment,
                stdout=self.log,
                stderr=subprocess.STDOUT,
                timeout=45,
                check=False,
                **NO_WINDOW,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise AssertionError(
                f"Native migration unavailable ({type(error).__name__}); acceptance did not run.\n"
                + self.diagnostics()
            ) from None
        if result.returncode:
            raise AssertionError(
                f"Native migration {direction} failed (exit {result.returncode}); acceptance did not pass.\n"
                + self.diagnostics()
            )

    def start(self) -> None:
        """Keep the base health check while exposing its sanitized failure reason."""
        try:
            super().start()
        except Exception as error:
            self.stop()
            raise AssertionError(
                f"Native startup failed ({type(error).__name__}); acceptance did not run.\n"
                + self.diagnostics()
            ) from None

    def close(self) -> None:
        """Discard private fixture data after emitting only sanitized diagnostics."""
        if self.log.closed:
            return
        try:
            self.stop()
            diagnostic = self.diagnostics()
            if diagnostic:
                print(
                    "Native fixture diagnostics (sanitized):\n" + diagnostic,
                    file=sys.stderr,
                )
        finally:
            self.log.close()
            self.directory.cleanup()

    def collection(self, name: str) -> dict[str, Any]:
        """Inspect the actual installed schema using a read-only local connection."""
        with sqlite3.connect(
            (self.root / "data/data.db").as_uri() + "?mode=ro", uri=True
        ) as database:
            database.row_factory = sqlite3.Row
            row = database.execute(
                "select * from _collections where name = ?", (name,)
            ).fetchone()
        if row is None:
            raise AssertionError(f"Required native collection is missing: {name}")
        result = dict(row)
        result["fields"] = json.loads(result["fields"])
        return result

    def stored(self, name: str) -> list[dict[str, Any]]:
        """Observe only whitelisted disposable records, never auth or secret tables."""
        allowed = {
            "classroom_rooms",
            "classroom_members",
            "classroom_messages",
            "classroom_receipts",
            "classroom_attendance",
            "classroom_presence",
            "classroom_media_sessions",
            "assistant_sessions",
            "assistant_turns",
            "assistant_patterns",
            "tutorials",
            "tutorial_learning",
            "tutorial_progress",
            "evidence",
            "missions",
        }
        if name not in allowed:
            raise ValueError("Choose a public synthetic fixture table.")
        with sqlite3.connect(
            (self.root / "data/data.db").as_uri() + "?mode=ro", uri=True
        ) as database:
            database.row_factory = sqlite3.Row
            return [
                dict(row)
                for row in database.execute(f'select * from "{name}" order by id')
            ]

    def fixture_change(self, source: str) -> None:
        """Apply a test-only migration while stopped, never hand-edit a running DB."""
        self.stop()
        self.fixture_sequence = getattr(self, "fixture_sequence", 0) + 1
        path = (
            self.root
            / "migrations"
            / f"{2000000000 + self.fixture_sequence}_fixture.js"
        )
        path.write_text("migrate((app) => {\n" + source + "\n}, () => {});\n")
        self.migrate()
        self.start()


class ClassroomServer(DiagnosticNativeServer):
    """Install the complete classroom hooks with real security and no provider I/O."""

    def __init__(self, binary: str) -> None:
        self.directory = tempfile.TemporaryDirectory(
            prefix="buildanddo-classroom-native-"
        )
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process = None
        self.log = tempfile.TemporaryFile(mode="w+b")
        self.environment = {
            "PATH": os.environ.get("PATH", ""),
            "BUILDANDDO_CLASSROOM_PUBLISHERS": "alice@fixture.invalid,bravo@fixture.invalid,viewer@fixture.invalid,guest@fixture.invalid",
            # Windows initializes Winsock from SystemRoot. Without it the child
            # exits before health with "socket: The requested service provider
            # could not be loaded or initialized"; the env stays otherwise restricted.
            **(
                {"SystemRoot": os.environ["SystemRoot"]}
                if os.name == "nt" and "SystemRoot" in os.environ
                else {}
            ),
        }
        try:
            hooks = self.root / "hooks"
            hooks.mkdir()
            for name in HOOKS:
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            shutil.copyfile(
                hooks / "classroom-realtime-lib.js",
                hooks / "fixture-original-realtime-lib.js",
            )
            (hooks / "classroom-realtime-lib.js").write_text(
                PROVIDER_DOUBLE.replace("__PROVIDER_ENABLED__", "false")
            )
            migrations = self.root / "migrations"
            migrations.mkdir()
            self.lesson = json.loads(
                (
                    ROOT / "apps/pocketbase/pb_migrations/data/starter-tutorials.json"
                ).read_text()
            )["lessons"][0]
            (migrations / "0000000001_fixture.js").write_text(SEED)
            for name in MIGRATIONS:
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations" / name, migrations / name
                )
            data_dir = self.root / "pb_migrations/data"
            data_dir.mkdir(parents=True)
            for name in ("starter-tutorials.json", "broadcast-classroom-lessons.json"):
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations/data" / name, data_dir / name
                )
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                self.port = reservation.getsockname()[1]
            self.base = f"http://127.0.0.1:{self.port}"
            self.migrate("up")
            self.start()
        except BaseException:
            self.close()
            raise

    def enable_fixture_provider(self) -> None:
        """Enable labelled canned signalling, not a credential or an actual SFU."""
        self.stop()
        (self.root / "hooks/classroom-realtime-lib.js").write_text(
            PROVIDER_DOUBLE.replace("__PROVIDER_ENABLED__", "true")
        )
        self.start()

    def provider_calls(self) -> list[str]:
        """Read the fixture-only transport audit containing no SDP or credentials."""
        path = self.root / "fixture-provider-calls.txt"
        return path.read_text().splitlines() if path.exists() else []


@unittest.skipUnless(
    BINARY and Path(BINARY).is_file(),
    "Native PocketBase unavailable; classroom runtime acceptance remains open.",
)
class NativeClassroomTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = ClassroomServer(BINARY)
        self.addCleanup(self.server.close)
        self.owner = self.server.login("alice")
        self.editor = self.server.login("bravo")
        self.viewer = self.server.login("viewer")
        self.guest = self.server.login("guest")
        self.path = f"/api/buildanddo/workspaces/{WORKSPACE}/classrooms"
        self.sequence = 0

    def command(
        self,
        action: str,
        payload: dict[str, object],
        revision: int,
        token: str = "",
        key: str = "",
        workspace: str = WORKSPACE,
    ) -> tuple[int, dict[str, Any]]:
        """Send one bounded command using a synthetic native user account."""
        self.sequence += 1
        return self.server.request(
            "POST",
            f"/api/buildanddo/workspaces/{workspace}/classrooms",
            {
                "action": action,
                "payload": payload,
                "revision": revision,
                "request_key": key or f"classroom_native_{self.sequence:06}",
            },
            token=token or self.owner,
        )

    def create(
        self, key: str = "", token: str = "", workspace: str = WORKSPACE
    ) -> tuple[int, dict[str, Any]]:
        """Schedule a class around an actual authored lesson."""
        return self.command(
            "room.create",
            {
                "title": "Native shared lesson",
                "description": "Synthetic classroom acceptance.",
                "tutorial": self.server.lesson["id"],
                "starts_at": "",
            },
            0,
            token=token,
            key=key,
            workspace=workspace,
        )

    def detail(self, room: str, token: str = "") -> tuple[int, dict[str, Any]]:
        """Read the classroom through its native authenticated route."""
        return self.server.request(
            "GET", self.path + "/" + room, token=token or self.owner
        )

    def live_room(self, token: str = "", workspace: str = WORKSPACE) -> str:
        """Create native attendance via registered commands, not seeded outcomes."""
        status, created = self.create(token=token, workspace=workspace)
        self.assertEqual(status, 200)
        self.assertEqual(
            self.command(
                "room.start", {"id": created["id"]}, 1, token, workspace=workspace
            )[0],
            200,
        )
        return str(created["id"])

    def media_session(self, room: str, token: str = "") -> str:
        """Create a server-owned binding using the explicitly enabled provider double."""
        before = len(self.server.provider_calls())
        status, session = self.server.request(
            "POST",
            "/api/classroom/session",
            {
                "room": room,
                "sessionDescription": OFFER,
            },
            token or self.owner,
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(self.server.provider_calls()), before + 1)
        self.assertTrue(session["sessionId"].startswith("fixture-session-"))
        return str(session["sessionId"])

    def denied_before_provider(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None,
        token: str,
        expected: tuple[int, ...] = (400, 403, 404, 409),
    ) -> None:
        """Require an authority/input refusal, never an unconfigured-provider 503."""
        before = self.server.provider_calls()
        status, _ = self.server.request(method, path, body, token)
        self.assertIn(
            status, expected, f"Expected a pre-provider denial from {method} {path}."
        )
        self.assertEqual(self.server.provider_calls(), before)

    def presence_body(
        self, room: str, session: str, track: str = "fixture-audio"
    ) -> dict[str, Any]:
        """Advertise only synthetic track identities for a short fixture lifetime."""
        return {
            "room": room,
            "session_id": session,
            "tracks": [{"trackName": track, "kind": "audio"}],
            "expires_at": (
                datetime.now(timezone.utc) + timedelta(seconds=30)
            ).isoformat(),
        }

    def test_native_lifecycle_lesson_presence_and_locked_raw_collections(self) -> None:
        self.assertIn(self.server.request("GET", self.path)[0], (401, 403))
        self.assertEqual(
            self.server.request("GET", self.path, token=self.guest)[0], 403
        )
        status, created = self.create()
        self.assertEqual(status, 200)
        room = created["id"]
        self.assertEqual(self.command("room.start", {"id": room}, 1)[0], 200)
        self.assertEqual(
            self.command("room.join", {"id": room}, 2, self.viewer)[0], 200
        )
        status, view = self.detail(room, self.viewer)
        self.assertEqual(status, 200)
        self.assertTrue(view["membership"]["active"])
        self.assertEqual(len(view["participants"]), 2)
        self.assertFalse(view["media"]["available"])
        self.assertEqual(
            self.server.request(
                "POST",
                "/api/classroom/session",
                {
                    "room": room,
                    "sessionDescription": OFFER,
                },
                self.owner,
            )[0],
            503,
        )
        self.assertEqual(self.server.provider_calls(), [])
        member = view["membership"]
        self.assertEqual(
            self.server.request(
                "POST",
                self.path + f"/{room}/presence",
                {"membership": member["id"], "revision": member["revision"]},
                self.viewer,
            )[0],
            200,
        )
        self.assertEqual(
            self.command(
                "room.message",
                {"id": room, "body": "Denied viewer write"},
                2,
                self.viewer,
            )[0],
            403,
        )
        self.assertEqual(
            self.command(
                "room.lesson",
                {"id": room, "tutorial": self.server.lesson["id"], "section": 1},
                2,
            )[0],
            200,
        )
        self.assertEqual(self.detail(room, self.viewer)[1]["room"]["section"], 1)
        self.assertEqual(self.command("room.end", {"id": room}, 3)[0], 200)
        self.assertFalse(self.detail(room, self.viewer)[1]["membership"]["active"])
        self.assertEqual(
            self.command("room.join", {"id": room}, 4, self.viewer)[0], 409
        )
        for collection in (
            "classroom_rooms",
            "classroom_members",
            "classroom_messages",
            "classroom_receipts",
            "classroom_attendance",
            "classroom_presence",
            "classroom_media_sessions",
        ):
            self.assertIn(
                self.server.request(
                    "GET", f"/api/collections/{collection}/records", token=self.owner
                )[0],
                (403, 404),
            )
            self.assertIn(
                self.server.request(
                    "POST", f"/api/collections/{collection}/records", {}, self.owner
                )[0],
                (403, 404),
            )

    def test_native_concurrent_retries_and_membership_revocation(self) -> None:
        with ThreadPoolExecutor(max_workers=2) as executor:
            replies = list(
                executor.map(
                    lambda _: self.create("classroom_same_create_key"), range(2)
                )
            )
        self.assertEqual([code for code, _ in replies], [200, 200])
        self.assertEqual(replies[0][1]["id"], replies[1][1]["id"])
        self.assertEqual(
            sorted(reply["replayed"] for _, reply in replies), [False, True]
        )
        room = replies[0][1]["id"]
        self.assertEqual(self.command("room.start", {"id": room}, 1)[0], 200)
        self.assertEqual(
            self.command("room.join", {"id": room}, 2, self.editor)[0], 200
        )
        with ThreadPoolExecutor(max_workers=2) as executor:
            replies = list(
                executor.map(
                    lambda _: self.command(
                        "room.message",
                        {"id": room, "body": "One recovered question."},
                        2,
                        self.editor,
                        "classroom_same_message_key",
                    ),
                    range(2),
                )
            )
        self.assertEqual([code for code, _ in replies], [200, 200])
        self.assertEqual(len(self.detail(room)[1]["messages"]["items"]), 1)
        self.server.fixture_change(
            "for (const row of app.findRecordsByFilter('workspace_members', 'user = {:user}', '', 10, 0, { user: 'accountbravo001' })) app.delete(row);"
        )
        self.assertEqual(self.detail(room, self.editor)[0], 403)
        self.assertEqual(
            self.command(
                "room.message",
                {"id": room, "body": "One recovered question."},
                2,
                self.editor,
                "classroom_same_message_key",
            )[0],
            403,
        )

    def test_native_down_retains_history_and_reup_restores_the_protocol(self) -> None:
        status, created = self.create()
        self.assertEqual(status, 200)
        room = created["id"]
        self.assertEqual(self.command("room.start", {"id": room}, 1)[0], 200)
        self.assertEqual(
            self.command(
                "room.message", {"id": room, "body": "Retained on rollback."}, 2
            )[0],
            200,
        )
        self.server.stop()
        self.server.revert(str(len(MIGRATIONS)))
        self.server.start()
        self.assertEqual(self.detail(room)[0], 503)
        self.server.stop()
        self.server.restore()
        self.server.start()
        status, view = self.detail(room)
        self.assertEqual(status, 200)
        self.assertEqual(view["messages"]["items"][0]["body"], "Retained on rollback.")

    def test_native_attendance_relations_and_additive_lesson_are_installed(
        self,
    ) -> None:
        targets = {
            name: self.server.collection(name)["id"]
            for name in ("users", "workspaces", "classroom_rooms", "classroom_members")
        }
        session_schema = self.server.collection("classroom_media_sessions")
        fields = {field["name"]: field for field in session_schema["fields"]}
        self.assertTrue(
            {
                "owner",
                "workspace",
                "room",
                "membership",
                "member_revision",
                "provider_app",
                "session_id",
                "tracks",
                "expires_at",
                "active",
                "busy",
                "protocol_version",
            }.issubset(fields)
        )
        for field, target in (
            ("owner", "users"),
            ("workspace", "workspaces"),
            ("room", "classroom_rooms"),
            ("membership", "classroom_members"),
        ):
            self.assertEqual(fields[field]["type"], "relation")
            self.assertEqual(fields[field]["collectionId"], targets[target])
            self.assertTrue(fields[field]["required"])
            self.assertEqual(fields[field]["maxSelect"], 1)
        self.assertEqual(fields["tracks"]["type"], "json")
        self.assertEqual(fields["expires_at"]["type"], "date")
        self.assertEqual(fields["active"]["type"], "bool")
        self.assertEqual(fields["busy"]["type"], "bool")
        self.assertEqual(fields["protocol_version"]["type"], "number")
        self.assertEqual(fields["member_revision"]["min"], 1)
        self.assertTrue(fields["member_revision"]["onlyInt"])
        for name in (
            "classroom_attendance",
            "classroom_presence",
            "classroom_media_sessions",
        ):
            schema = self.server.collection(name)
            for rule in (
                "listRule",
                "viewRule",
                "createRule",
                "updateRule",
                "deleteRule",
            ):
                self.assertIsNone(schema[rule])
        status, listing = self.server.request("GET", self.path, token=self.owner)
        self.assertEqual(status, 200)
        self.assertEqual(len(listing["lessons"]["items"]), 26)
        self.assertIn(
            "bdobroadcast001", {row["id"] for row in listing["lessons"]["items"]}
        )
        room = self.live_room()

        def join() -> tuple[int, dict[str, Any]]:
            return self.command(
                "room.join", {"id": room}, 2, self.viewer, "native_attendance_retry_001"
            )

        self.assertEqual(join()[0], 200)
        self.assertTrue(join()[1]["replayed"])
        membership = self.detail(room, self.viewer)[1]["membership"]
        self.assertEqual(
            self.command(
                "room.leave",
                {"id": room, "membership_revision": membership["revision"]},
                2,
                self.viewer,
            )[0],
            200,
        )
        self.assertEqual(
            self.command(
                "room.lesson",
                {"id": room, "tutorial": "bdobroadcast001", "section": 0},
                2,
            )[0],
            200,
        )
        self.assertEqual(self.detail(room)[1]["lesson"]["id"], "bdobroadcast001")
        self.assertEqual(self.command("room.end", {"id": room}, 3)[0], 200)
        status, record = self.server.request(
            "GET", self.path + f"/{room}/record", token=self.owner
        )
        self.assertEqual(status, 200)
        self.assertTrue(record["installed"])
        self.assertEqual(record["attendees"], 2)
        self.assertFalse(record["truncated"])
        self.assertGreaterEqual(record["minutes"], 0)
        self.assertTrue(record["hours"])
        self.assertNotIn("owner", json.dumps(record))
        for token in (self.editor, self.viewer, self.guest):
            self.assertEqual(
                self.server.request("GET", self.path + f"/{room}/record", token=token)[
                    0
                ],
                403,
            )
        history = self.server.stored("classroom_attendance")
        self.assertEqual(
            sorted((row["owner"], row["event"]) for row in history),
            sorted(
                [
                    ("accountalice001", "start"),
                    ("accountalice001", "join"),
                    ("accountview0001", "join"),
                    ("accountview0001", "leave"),
                    ("accountalice001", "end"),
                ]
            ),
        )
        for row in history:
            self.assertEqual(row["workspace"], WORKSPACE)
            self.assertEqual(row["room"], room)
            self.assertIsNotNone(
                datetime.fromisoformat(row["at"].replace(" ", "T")).tzinfo
            )

    def test_native_signalling_rejects_auth_scope_and_input_before_provider(
        self,
    ) -> None:
        self.server.enable_fixture_provider()
        room = self.live_room()
        requests = (
            (
                "POST",
                "/api/classroom/session",
                {"room": room, "sessionDescription": OFFER},
            ),
            (
                "POST",
                "/api/classroom/tracks",
                {
                    "room": room,
                    "sessionId": "unbound-session",
                    "action": "push",
                    "tracks": [
                        {
                            "location": "local",
                            "mid": "0",
                            "trackName": "fixture-audio",
                            "kind": "audio",
                        }
                    ],
                    "sessionDescription": OFFER,
                },
            ),
            (
                "PUT",
                "/api/classroom/renegotiate",
                {
                    "room": room,
                    "sessionId": "unbound-session",
                    "sessionDescription": ANSWER,
                },
            ),
            (
                "POST",
                "/api/classroom/presence",
                self.presence_body(room, "unbound-session"),
            ),
        )
        for method, path, body in requests:
            with self.subTest(path=path):
                self.denied_before_provider(method, path, body, "", (401, 403))
                self.denied_before_provider(
                    method,
                    path,
                    {key: value for key, value in body.items() if key != "room"},
                    self.owner,
                    (400,),
                )
                self.denied_before_provider(method, path, body, self.guest, (403, 404))
                self.denied_before_provider(method, path, body, self.viewer, (403, 409))
                self.denied_before_provider(
                    method,
                    path,
                    {**body, "room": "missingroom0001"},
                    self.owner,
                    (404,),
                )
        for offer in (
            None,
            ANSWER,
            {"type": "offer", "sdp": {}},
            {"type": "offer", "sdp": ""},
        ):
            self.denied_before_provider(
                "POST",
                "/api/classroom/session",
                {"room": room, "sessionDescription": offer},
                self.owner,
                (400,),
            )
        for method, path, body in requests[1:]:
            self.denied_before_provider(method, path, body, self.owner)
        self.assertEqual(self.server.provider_calls(), [])
        self.assertEqual(self.server.stored("classroom_media_sessions"), [])

    def test_native_session_store_push_pull_and_scoped_presence_with_fixture_provider(
        self,
    ) -> None:
        self.server.enable_fixture_provider()
        room = self.live_room()
        self.assertEqual(
            self.command("room.join", {"id": room}, 2, self.viewer)[0], 200
        )
        publisher = self.media_session(room)
        subscriber = self.media_session(room, self.viewer)
        saved = next(
            row
            for row in self.server.stored("classroom_media_sessions")
            if row["session_id"] == publisher
        )
        member = self.detail(room)[1]["membership"]
        self.assertEqual(
            (
                saved["owner"],
                saved["workspace"],
                saved["room"],
                saved["membership"],
                saved["member_revision"],
            ),
            ("accountalice001", WORKSPACE, room, member["id"], member["revision"]),
        )
        self.assertEqual(saved["provider_app"], "fixture-only-app")
        self.assertTrue(saved["active"])
        self.assertFalse(saved["busy"])
        self.assertEqual(saved["protocol_version"], 1)
        remaining = datetime.fromisoformat(
            saved["expires_at"].replace(" ", "T")
        ) - datetime.now(timezone.utc)
        self.assertGreater(remaining, timedelta(hours=3, minutes=55))
        self.assertLessEqual(remaining, timedelta(hours=4))
        self.assertEqual(json.loads(saved["tracks"]), [])
        self.denied_before_provider(
            "POST",
            "/api/classroom/presence",
            self.presence_body(room, publisher),
            self.owner,
        )
        push = {
            "room": room,
            "sessionId": publisher,
            "action": "push",
            "sessionDescription": OFFER,
            "tracks": [
                {
                    "location": "local",
                    "mid": "0",
                    "trackName": "fixture-audio",
                    "kind": "audio",
                }
            ],
        }
        track = push["tracks"][0]
        for malformed in (
            {key: value for key, value in track.items() if key != "kind"},
            {**track, "kind": "data"},
            {**track, "location": "remote"},
            {**track, "mid": 0},
            {**track, "trackName": {"name": "fixture-audio"}},
        ):
            with self.subTest(track=malformed):
                self.denied_before_provider(
                    "POST",
                    "/api/classroom/tracks",
                    {**push, "tracks": [malformed]},
                    self.owner,
                    (400,),
                )
        self.denied_before_provider(
            "POST",
            "/api/classroom/tracks",
            {**push, "sessionId": subscriber},
            self.viewer,
            (403,),
        )
        code, pushed = self.server.request(
            "POST", "/api/classroom/tracks", push, self.owner
        )
        self.assertEqual(code, 200)
        self.assertEqual(
            pushed["tracks"],
            [{"location": "local", "mid": "0", "trackName": "fixture-audio"}],
        )
        published = next(
            row
            for row in self.server.stored("classroom_media_sessions")
            if row["session_id"] == publisher
        )
        self.assertEqual(
            json.loads(published["tracks"]),
            [{"trackName": "fixture-audio", "kind": "audio"}],
        )
        self.assertFalse(published["busy"])
        self.denied_before_provider(
            "POST",
            "/api/classroom/presence",
            self.presence_body(room, publisher, "never-published"),
            self.owner,
        )
        self.denied_before_provider(
            "POST",
            "/api/classroom/presence",
            self.presence_body(room, publisher),
            self.viewer,
        )
        status, advertised = self.server.request(
            "POST",
            "/api/classroom/presence",
            self.presence_body(room, publisher),
            self.owner,
        )
        self.assertEqual(status, 200)
        self.assertFalse(
            advertised["verified"],
            "Fixture signalling cannot establish delivered media.",
        )
        self.assertNotEqual(advertised["access_basis"], "publisher_grant")
        status, presence = self.server.request(
            "GET", "/api/classroom/presence?room=" + room, token=self.viewer
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(presence["items"]), 1)
        self.assertEqual(presence["items"][0]["session_id"], publisher)
        self.assertEqual(
            presence["items"][0]["tracks"],
            [{"trackName": "fixture-audio", "kind": "audio"}],
        )
        self.assertNotIn("@fixture.invalid", json.dumps(presence))
        pull = {
            "room": room,
            "sessionId": subscriber,
            "action": "pull",
            "tracks": [
                {
                    "location": "remote",
                    "sessionId": publisher,
                    "trackName": "fixture-audio",
                }
            ],
        }
        status, pulled = self.server.request(
            "POST", "/api/classroom/tracks", pull, self.viewer
        )
        self.assertEqual(status, 200)
        self.assertTrue(pulled["requiresImmediateRenegotiation"])
        self.assertEqual(pulled["sessionDescription"]["type"], "offer")
        self.assertEqual(pulled["tracks"], pull["tracks"])
        self.denied_before_provider(
            "PUT",
            "/api/classroom/renegotiate",
            {
                "room": room,
                "sessionId": subscriber,
                "sessionDescription": OFFER,
            },
            self.viewer,
            (400,),
        )
        self.assertEqual(
            self.server.request(
                "PUT",
                "/api/classroom/renegotiate",
                {
                    "room": room,
                    "sessionId": subscriber,
                    "sessionDescription": ANSWER,
                },
                self.viewer,
            )[0],
            200,
        )
        self.assertEqual(len(self.server.provider_calls()), 5)
        for collection, identity in (
            ("classroom_media_sessions", saved["id"]),
            ("classroom_presence", advertised["id"]),
        ):
            for method, suffix, body in (
                ("GET", "", None),
                ("GET", "/" + identity, None),
                ("POST", "", {"owner": "accountalice001"}),
                ("PATCH", "/" + identity, {"active": False}),
                ("DELETE", "/" + identity, None),
            ):
                self.denied_before_provider(
                    method,
                    f"/api/collections/{collection}/records" + suffix,
                    body,
                    self.owner,
                    (403, 404),
                )
        self.denied_before_provider(
            "POST",
            "/api/classroom/close",
            {"room": room, "sessionId": publisher},
            self.viewer,
            (403,),
        )
        self.denied_before_provider(
            "POST",
            "/api/classroom/close",
            {"room": "missingroom0001", "sessionId": publisher},
            self.owner,
            (403,),
        )
        self.assertEqual(
            self.command(
                "room.leave", {"id": room, "membership_revision": member["revision"]}, 2
            )[0],
            200,
        )
        for session, token in ((publisher, self.owner), (subscriber, self.viewer)):
            for _ in range(2):
                code, closed = self.server.request(
                    "POST",
                    "/api/classroom/close",
                    {"room": room, "sessionId": session},
                    token,
                )
                self.assertEqual(code, 200)
                self.assertTrue(closed["closed"])
            self.denied_before_provider(
                "PUT",
                "/api/classroom/renegotiate",
                {
                    "room": room,
                    "sessionId": session,
                    "sessionDescription": ANSWER,
                },
                token,
                (403,),
            )
        self.assertEqual(
            len(self.server.provider_calls()),
            5,
            "Close invalidates local ownership without calling a provider.",
        )
        self.assertTrue(
            all(
                not row["active"] and not row["busy"]
                for row in self.server.stored("classroom_media_sessions")
            )
        )
        code, remaining_presence = self.server.request(
            "GET", "/api/classroom/presence?room=" + room, token=self.viewer
        )
        self.assertEqual(code, 200)
        self.assertEqual(remaining_presence["items"], [])

    def test_native_media_rollback_retains_sessions_without_reactivating_bindings(
        self,
    ) -> None:
        self.server.enable_fixture_provider()
        room = self.live_room()
        session = self.media_session(room)
        before = self.server.stored("classroom_media_sessions")[0]
        self.server.stop()
        # The additive lesson is last; the media migration is immediately before it. revert()
        # moves them aside too, because serve re-applies a pending migration on 0.39.8.
        self.server.revert("2")
        self.assertNotIn(
            "protocol_version",
            {
                field["name"]
                for field in self.server.collection("classroom_media_sessions")[
                    "fields"
                ]
            },
        )
        self.server.start()
        self.denied_before_provider(
            "POST",
            "/api/classroom/session",
            {"room": room, "sessionDescription": OFFER},
            self.owner,
            (503,),
        )
        self.server.stop()
        self.server.migrate("up")
        self.server.start()
        retained = self.server.stored("classroom_media_sessions")
        self.assertEqual(len(retained), 1)
        self.assertEqual(retained[0]["id"], before["id"])
        self.assertEqual(retained[0]["owner"], before["owner"])
        self.assertEqual(retained[0]["session_id"], session)
        self.assertEqual(retained[0]["protocol_version"], 0)
        self.denied_before_provider(
            "PUT",
            "/api/classroom/renegotiate",
            {
                "room": room,
                "sessionId": session,
                "sessionDescription": ANSWER,
            },
            self.owner,
            (403,),
        )
        self.assertNotEqual(self.media_session(room), session)

    def test_native_foreign_sessions_tracks_and_allowlisted_nonhosts_are_denied(
        self,
    ) -> None:
        self.server.enable_fixture_provider()
        room = self.live_room()
        other_room = self.live_room()
        foreign_room = self.live_room(self.guest, "workspacebravo1")
        self.assertEqual(
            self.command("room.join", {"id": room}, 2, self.editor)[0], 200
        )
        publisher = self.media_session(room)
        editor_session = self.media_session(room, self.editor)
        other_session = self.media_session(other_room)
        foreign_session = self.media_session(foreign_room, self.guest)
        push = {
            "room": room,
            "sessionId": publisher,
            "action": "push",
            "sessionDescription": OFFER,
            "tracks": [
                {
                    "location": "local",
                    "mid": "0",
                    "trackName": "fixture-audio",
                    "kind": "audio",
                }
            ],
        }
        self.assertEqual(
            self.server.request("POST", "/api/classroom/tracks", push, self.owner)[0],
            200,
        )
        self.assertEqual(
            self.server.request(
                "POST",
                "/api/classroom/tracks",
                {
                    **push,
                    "room": foreign_room,
                    "sessionId": foreign_session,
                },
                self.guest,
            )[0],
            200,
        )
        self.denied_before_provider(
            "POST",
            "/api/classroom/session",
            {
                "room": foreign_room,
                "sessionDescription": OFFER,
            },
            self.owner,
            (403, 404),
        )
        for body, token in (
            (push, self.editor),
            ({**push, "sessionId": editor_session}, self.editor),
            ({**push, "room": other_room}, self.owner),
            ({**push, "sessionId": "unbound-session"}, self.owner),
        ):
            self.denied_before_provider("POST", "/api/classroom/tracks", body, token)
        for body, token in (
            ({"room": room, "sessionId": publisher}, self.editor),
            ({"room": other_room, "sessionId": publisher}, self.owner),
            ({"room": foreign_room, "sessionId": foreign_session}, self.owner),
            ({"room": room, "sessionId": "unbound-session"}, self.owner),
        ):
            self.denied_before_provider(
                "PUT",
                "/api/classroom/renegotiate",
                {**body, "sessionDescription": ANSWER},
                token,
            )
        for target_room, target_session, source_session, track in (
            (other_room, other_session, publisher, "fixture-audio"),
            (room, publisher, foreign_session, "fixture-audio"),
            (room, publisher, publisher, "unpublished-track"),
            (room, publisher, "unbound-session", "fixture-audio"),
        ):
            self.denied_before_provider(
                "POST",
                "/api/classroom/tracks",
                {
                    "room": target_room,
                    "sessionId": target_session,
                    "action": "pull",
                    "tracks": [
                        {
                            "location": "remote",
                            "sessionId": source_session,
                            "trackName": track,
                        }
                    ],
                },
                self.owner,
            )
        self.denied_before_provider(
            "POST",
            "/api/classroom/presence",
            self.presence_body(other_room, publisher),
            self.owner,
        )
        self.denied_before_provider(
            "POST",
            "/api/classroom/presence",
            self.presence_body(room, "unbound-session"),
            self.guest,
        )
        self.denied_before_provider(
            "GET", "/api/classroom/presence?room=" + room, None, self.guest, (403, 404)
        )
        self.denied_before_provider(
            "GET",
            "/api/classroom/presence?room=" + foreign_room,
            None,
            self.owner,
            (403, 404),
        )

    def test_native_leave_rejoin_stale_and_revoked_attendance_fence_media(self) -> None:
        self.server.enable_fixture_provider()
        room = self.live_room(self.editor)
        session = self.media_session(room, self.editor)
        member = self.detail(room, self.editor)[1]["membership"]
        self.assertEqual(
            self.command(
                "room.leave",
                {"id": room, "membership_revision": member["revision"]},
                2,
                self.editor,
            )[0],
            200,
        )
        self.denied_before_provider(
            "POST",
            "/api/classroom/session",
            {"room": room, "sessionDescription": OFFER},
            self.editor,
        )
        self.assertEqual(
            self.command("room.join", {"id": room}, 2, self.editor)[0], 200
        )
        self.denied_before_provider(
            "PUT",
            "/api/classroom/renegotiate",
            {"room": room, "sessionId": session, "sessionDescription": ANSWER},
            self.editor,
        )
        session = self.media_session(room, self.editor)
        self.server.fixture_change("""
            for (const row of app.findRecordsByFilter('classroom_members', 'owner = {:owner}', '', 10, 0, { owner: 'accountbravo001' })) {
                row.set('last_seen', '2000-01-01T00:00:00.000Z'); app.save(row);
            }
        """)
        self.denied_before_provider(
            "POST",
            "/api/classroom/session",
            {"room": room, "sessionDescription": OFFER},
            self.editor,
        )
        self.denied_before_provider(
            "PUT",
            "/api/classroom/renegotiate",
            {"room": room, "sessionId": session, "sessionDescription": ANSWER},
            self.editor,
        )
        self.denied_before_provider(
            "GET", "/api/classroom/presence?room=" + room, None, self.editor
        )
        self.assertEqual(
            self.command("room.join", {"id": room}, 2, self.editor)[0], 200
        )
        session = self.media_session(room, self.editor)
        self.server.fixture_change("""
            for (const row of app.findRecordsByFilter('workspace_members', 'user = {:user}', '', 10, 0, { user: 'accountbravo001' })) app.delete(row);
        """)
        self.denied_before_provider(
            "POST",
            "/api/classroom/session",
            {"room": room, "sessionDescription": OFFER},
            self.editor,
        )
        self.denied_before_provider(
            "PUT",
            "/api/classroom/renegotiate",
            {"room": room, "sessionId": session, "sessionDescription": ANSWER},
            self.editor,
        )
        self.denied_before_provider(
            "POST",
            "/api/classroom/presence",
            self.presence_body(room, session),
            self.editor,
        )
        self.denied_before_provider(
            "GET", "/api/classroom/presence?room=" + room, None, self.editor
        )

    def test_native_expired_inactive_provider_mismatch_and_ended_sessions_fail_closed(
        self,
    ) -> None:
        self.server.enable_fixture_provider()
        for field, value in (
            ("expires_at", "2000-01-01T00:00:00.000Z"),
            ("active", False),
            ("provider_app", "different-fixture-app"),
            ("protocol_version", 0),
            ("busy", True),
        ):
            with self.subTest(field=field):
                room = self.live_room()
                session = self.media_session(room)
                self.server.fixture_change(
                    "const row = app.findRecordsByFilter('classroom_media_sessions', 'session_id = {:session}', '', 1, 0, "
                    + json.dumps({"session": session})
                    + ")[0]; row.set("
                    + json.dumps(field)
                    + ", "
                    + json.dumps(value)
                    + "); app.save(row);"
                )
                self.denied_before_provider(
                    "PUT",
                    "/api/classroom/renegotiate",
                    {"room": room, "sessionId": session, "sessionDescription": ANSWER},
                    self.owner,
                )
                self.denied_before_provider(
                    "POST",
                    "/api/classroom/presence",
                    self.presence_body(room, session),
                    self.owner,
                )
        room = self.live_room()
        session = self.media_session(room)
        self.assertEqual(self.command("room.end", {"id": room}, 2)[0], 200)
        self.denied_before_provider(
            "POST",
            "/api/classroom/session",
            {"room": room, "sessionDescription": OFFER},
            self.owner,
        )
        self.denied_before_provider(
            "POST",
            "/api/classroom/tracks",
            {
                "room": room,
                "sessionId": session,
                "action": "push",
                "sessionDescription": OFFER,
                "tracks": [
                    {
                        "location": "local",
                        "mid": "0",
                        "trackName": "fixture-audio",
                        "kind": "audio",
                    }
                ],
            },
            self.owner,
        )
        self.denied_before_provider(
            "PUT",
            "/api/classroom/renegotiate",
            {"room": room, "sessionId": session, "sessionDescription": ANSWER},
            self.owner,
        )
        self.denied_before_provider(
            "POST",
            "/api/classroom/presence",
            self.presence_body(room, session),
            self.owner,
        )
        self.denied_before_provider(
            "GET", "/api/classroom/presence?room=" + room, None, self.owner
        )


if __name__ == "__main__":
    if "--require-binary" in sys.argv:
        sys.argv.remove("--require-binary")
        if not BINARY or not Path(BINARY).is_file():
            raise SystemExit(
                "FAIL: set BUILDANDDO_TEST_POCKETBASE to the native test binary; classroom runtime acceptance did not run."
            )
    unittest.main()
