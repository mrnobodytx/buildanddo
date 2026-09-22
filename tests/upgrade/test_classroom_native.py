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
# Depends:     tests/upgrade/test_dossier_native.py, apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_dossier_native.py; VALIDATES apps/pocketbase/pb_hooks/classrooms.js; VALIDATES apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
# DAG Node:    none
# Intent:      Require native classroom authentication, date serialization, concurrent receipt recovery and reversible schema before accepting an installed backend.
# ───────────────────────────────────────────────────────────────

"""Exercise classrooms on a disposable, loopback-only native PocketBase server."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import socket
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
# Every migration the classroom surface depends on, in order. The room-kind migration is not
# optional: classrooms.js requires `kind` in its schema guard, so a fixture without it answers
# 503 "the classroom backend needs an operator review" - which is the guard working.
MIGRATIONS = ("1790400000_classroom_rooms.js", "1791100000_room_kind.js")
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
    const members = create('workspace_members', [relation('workspace', 'workspaces'), relation('user', 'users'), { name: 'role', type: 'text' }]);
    for (const [user, role] of [['accountbravo001', 'editor'], ['accountview0001', 'viewer']]) {
        const member = new Record(members); member.set('workspace', workspace.id); member.set('user', user); member.set('role', role); app.save(member);
    }
    const tutorials = create('tutorials', [{ name: 'title', type: 'text' }, { name: 'summary', type: 'text' }, { name: 'category', type: 'text' },
        { name: 'effort_minutes', type: 'number' }, { name: 'order', type: 'number' }, { name: 'lesson', type: 'json', maxSize: 100000 }], true);
    const data = JSON.parse(__LESSON__);
    const record = new Record(tutorials); record.id = data.id;
    for (const key of ['title', 'summary', 'category', 'effort_minutes', 'order', 'lesson']) record.set(key, data[key]);
    app.save(record);
}, () => {});
"""


class ClassroomServer(NativeServer):
    """Reuse the native server lifecycle with only classroom schema and policies."""

    def __init__(self, binary: str) -> None:
        self.directory = tempfile.TemporaryDirectory(
            prefix="buildanddo-classroom-native-"
        )
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process = None
        self.log = (self.root / "native.log").open("w")
        self.environment = {
            "PATH": os.environ.get("PATH", ""),
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
            for name in (
                "classrooms.pb.js",
                "classrooms.js",
                "workspace-access.js",
                "workflow-policy.js",
            ):
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            migrations = self.root / "migrations"
            migrations.mkdir()
            self.lesson = json.loads(
                (
                    ROOT / "apps/pocketbase/pb_migrations/data/starter-tutorials.json"
                ).read_text()
            )["lessons"][0]
            # PocketBase applies migrations in byte-wise filename order, so "1_fixture.js"
            # sorted AFTER every timestamped product migration ("_" 0x5F > "7" 0x37) and
            # they aborted looking up collections this fixture creates. Sort it first.
            (migrations / "0000000001_fixture.js").write_text(
                SEED.replace("__LESSON__", json.dumps(json.dumps(self.lesson)))
            )
            for migration in MIGRATIONS:
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations" / migration,
                    migrations / migration,
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

    def migrate(self, direction: str, count: str = "") -> None:
        """Apply only this disposable fixture's registered migration files."""
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
            timeout=30,
            check=False,
            **NO_WINDOW,
        )
        if result.returncode:
            raise AssertionError(
                "The isolated classroom migration failed; native acceptance did not pass."
            )


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
    ) -> tuple[int, dict[str, Any]]:
        """Send one bounded command using a synthetic native user account."""
        self.sequence += 1
        return self.server.request(
            "POST",
            self.path,
            {
                "action": action,
                "payload": payload,
                "revision": revision,
                "request_key": key or f"classroom_native_{self.sequence:06}",
            },
            token=token or self.owner,
        )

    def create(self, key: str = "") -> tuple[int, dict[str, Any]]:
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
            key=key,
        )

    def detail(self, room: str, token: str = "") -> tuple[int, dict[str, Any]]:
        """Read the classroom through its native authenticated route."""
        return self.server.request(
            "GET", self.path + "/" + room, token=token or self.owner
        )

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
        self.server.stop()
        (self.server.root / "migrations/1790500000_revoke_fixture.js").write_text(
            "migrate((app) => { for (const row of app.findRecordsByFilter('workspace_members', 'user = {:user}', '', 10, 0, { user: 'accountbravo001' })) app.delete(row); }, () => {});"
        )
        self.server.migrate("up")
        self.server.start()
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
        self.server.revert("1")
        self.server.start()
        self.assertEqual(self.detail(room)[0], 503)
        self.server.stop()
        self.server.restore()
        self.server.start()
        status, view = self.detail(room)
        self.assertEqual(status, 200)
        self.assertEqual(view["messages"]["items"][0]["body"], "Retained on rollback.")


if __name__ == "__main__":
    if "--require-binary" in sys.argv:
        sys.argv.remove("--require-binary")
        if not BINARY or not Path(BINARY).is_file():
            raise SystemExit(
                "FAIL: set BUILDANDDO_TEST_POCKETBASE to the native test binary; classroom runtime acceptance did not run."
            )
    unittest.main()
