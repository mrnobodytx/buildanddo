# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_dossier_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/pocketbase/pb_hooks/dossier.pb.js, apps/pocketbase/pb_hooks/private-dossier.js, apps/pocketbase/pb_hooks/dossier-vault.js, apps/pocketbase/pb_hooks/research-policy.js, apps/pocketbase/pb_migrations/1790200000_private_dossiers.js
# EnumType:    Test
# EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/dossier.pb.js; VALIDATES apps/pocketbase/pb_hooks/private-dossier.js; VALIDATES apps/pocketbase/pb_hooks/dossier-vault.js; VALIDATES apps/pocketbase/pb_hooks/research-policy.js; VALIDATES apps/pocketbase/pb_migrations/1790200000_private_dossiers.js
# DAG Node:    none
# Intent:      Require real PocketBase authentication, native OAuth models, encrypted persistence and concurrent retry behavior in an isolated loopback database.
# ───────────────────────────────────────────────────────────────

"""Run native dossier acceptance on a supplied binary without touching a shared database."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[2]
BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
ALICE, BOB, BOT = "accountalice001", "accountbravo001", "accountbot00001"
WORKSPACE, WORKER = "workspacealpha1", "accountwork0001"
GUILD, CHANNEL, DISCORD = "12345678901234567", "23456789012345678", "34567890123456789"

# This migration is copied only into a fresh temporary native test database.
# It seeds synthetic auth/link data; it does not simulate the Discord OAuth flow.
SEED = r"""
migrate((app) => {
    let users;
    try { users = app.findCollectionByNameOrId('users'); }
    catch { users = new Collection({ name: 'users', type: 'auth' }); }
    users.authRule = '';
    users.passwordAuth = { enabled: true, identityFields: ['email'] };
    users.authAlert = { enabled: false };
    app.save(users);
    for (const [id, name] of [['accountalice001', 'alice'], ['accountbravo001', 'bravo'], ['accountbot00001', 'bot'], ['accountwork0001', 'worker']]) {
        const user = new Record(users);
        user.id = id;
        user.set('email', name + '@fixture.invalid');
        user.set('verified', true);
        user.setPassword('local-fixture-password-only');
        app.save(user);
    }
    const relation = (name, target) => ({ name, type: 'relation', required: true, maxSelect: 1, collectionId: app.findCollectionByNameOrId(target).id });
    const create = (name, fields) => {
        const collection = new Collection({ name, type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields });
        app.save(collection); return collection;
    };
    const workspaces = create('workspaces', [relation('owner', 'users')]);
    const workspace = new Record(workspaces); workspace.id = 'workspacealpha1'; workspace.set('owner', 'accountbravo001'); app.save(workspace);
    const members = create('workspace_members', [relation('workspace', 'workspaces'), relation('user', 'users'), { name: 'role', type: 'text' }]);
    const member = new Record(members); member.set('workspace', workspace.id); member.set('user', 'accountalice001'); member.set('role', 'editor'); app.save(member);
    const integrations = create('workspace_integrations', [relation('workspace', 'workspaces'), { name: 'provider', type: 'text' },
        { name: 'desired_enabled', type: 'bool' }, { name: 'configuration', type: 'json' }, { name: 'revision', type: 'number' }]);
    const integration = new Record(integrations); integration.set('workspace', workspace.id); integration.set('provider', 'discord');
    integration.set('desired_enabled', true); integration.set('configuration', { guild_id: '12345678901234567', channel_id: '23456789012345678', mode: 'read' });
    integration.set('revision', 1); app.save(integration);
    create('missions', [relation('workspace', 'workspaces'), relation('owner', 'users')]);
    create('evidence', [relation('workspace', 'workspaces'), relation('owner', 'users')]);
    // A migration seeds the native system model; application code uses its
    // ExternalAuth API. No running database is hand-edited by the test driver.
    app.db().newQuery('insert into _externalAuths (id, collectionRef, recordRef, provider, providerId, created, updated) values ({:id}, {:collection}, {:record}, {:provider}, {:providerId}, {:created}, {:created})')
        .bind({ id: 'discordlink0001', collection: users.id, record: 'accountalice001', provider: 'discord', providerId: '34567890123456789', created: new Date().toISOString().replace('T', ' ') }).execute();
}, () => {});
"""


# Windows gives a console executable its own window unless told otherwise, and every native
# test starts the binary twice - once to migrate and once to serve - so a full run flashes a
# window per spawn across whoever is sitting at the machine. pythonw.exe silences a PARENT's
# console but never a CHILD's, which is why the earlier watchdog fix did not cover these.
# CREATE_NO_WINDOW is Windows-only, so this is an empty mapping everywhere else and the calls
# below read the same on every platform.
#
# MEASURED, same parent and binary with only the flag varying: spawning from a console-less
# pythonw.exe parent WITHOUT it adds two visible windows and WITH it adds none. Note the two:
# Windows 11 hosts a new console through ConPTY, so it appears as a Windows Terminal window
# (class CASCADIA_HOSTING_WINDOW_CLASS) plus a PseudoConsoleWindow - the classic
# ConsoleWindowClass is never created, and a detector looking only for that name reports a
# confident zero while the windows are on screen.
NO_WINDOW = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


class NativeServer:
    """Own a loopback server, restricted environment and disposable fixture database."""

    def __init__(self, binary: str) -> None:
        self.directory = tempfile.TemporaryDirectory(
            prefix="buildanddo-dossier-native-"
        )
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process: subprocess.Popen | None = None
        self.log = (self.root / "native.log").open("w")
        self.keys = json.dumps({"active": "fixture", "keys": {"fixture": "k" * 32}})
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
            "BUILDANDDO_DOSSIER_KEYS": self.keys,
            "BUILDANDDO_RESEARCH_BINDINGS": json.dumps(
                [
                    {
                        "workspace": WORKSPACE,
                        "bot_user": BOT,
                        "worker_user": WORKER,
                        "guild_id": GUILD,
                        "channel_id": CHANNEL,
                        "binding": "fixture",
                        "capabilities": [],
                    }
                ]
            ),
        }
        try:
            hooks = self.root / "hooks"
            hooks.mkdir()
            for name in [
                "dossier.pb.js",
                "private-dossier.js",
                "dossier-vault.js",
                "research-policy.js",
                "workspace-access.js",
                "government-access.js",
                "workflow-policy.js",
            ]:
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            migrations = self.root / "migrations"
            migrations.mkdir()
            # PocketBase applies migrations in byte-wise filename order, so "1_fixture.js"
            # sorted AFTER every timestamped product migration ("_" 0x5F > "7" 0x37) and
            # they aborted looking up collections this fixture creates. Sort it first.
            (migrations / "0000000001_fixture.js").write_text(SEED)
            for name in [
                "1790100000_mission_research.js",
                "1790200000_private_dossiers.js",
            ]:
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations" / name, migrations / name
                )
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                self.port = reservation.getsockname()[1]
            self.base = f"http://127.0.0.1:{self.port}"
            args = [self.binary, "migrate", "up", *self.paths()]
            result = subprocess.run(
                args,
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
                    "Native fixture migration failed; inspect the isolated runner without publishing startup tokens."
                )
            self.start()
        except BaseException:
            self.close()
            raise

    def paths(self) -> list[str]:
        """Restrict every command to this test's own schema, hooks and database."""
        return [
            f"--dir={self.root / 'data'}",
            f"--migrationsDir={self.root / 'migrations'}",
            f"--hooksDir={self.root / 'hooks'}",
        ]

    def revert(self, count: str = "1") -> list[str]:
        """Roll migrations back and keep them rolled back across the next start.

        MEASURED ON POCKETBASE 0.39.8, not assumed: `serve` re-applies pending JS migrations
        whatever --automigrate says. A migration reverted by `migrate down` came back on the
        next serve under `--automigrate=0`, under `--automigrate=false` and under a bare
        `--automigrate`. The flag cannot make a rollback observable, so every test that
        reverted, restarted and asserted a degraded 503 was asserting against a schema the
        restart had already healed - and passed or failed for reasons unrelated to rollback.

        A reverted file therefore has to LEAVE the migrations directory. Exactly the files
        PocketBase says it reverted are moved aside, so nothing is guessed about which ran.
        """
        result = subprocess.run(
            [self.binary, "migrate", "down", *([count] if count else []), *self.paths()],
            input="y\n",
            text=True,
            cwd=self.root,
            env=self.environment,
            capture_output=True,
            timeout=30,
            check=False,
            **NO_WINDOW,
        )
        output = (result.stdout or "") + (result.stderr or "")
        # The diagnostic servers log to an anonymous binary file; this base logs text.
        self.log.write(output.encode("utf-8", "replace") if "b" in getattr(self.log, "mode", "") else output)
        self.log.flush()
        if result.returncode:
            raise AssertionError(
                "Native rollback failed, so the degraded state under test was never reached."
            )
        reverted = [
            line.split("Reverted ", 1)[1].strip()
            for line in (result.stdout or "").splitlines()
            if "Reverted " in line
        ]
        if not reverted:
            raise AssertionError(
                "Nothing was reverted, so there is no rollback under test."
            )
        quarantine = self.root / "reverted"
        quarantine.mkdir(exist_ok=True)
        for name in reverted:
            source = self.root / "migrations" / name
            if source.is_file():
                shutil.move(str(source), str(quarantine / name))
        self.reverted = reverted
        return reverted

    def restore(self) -> None:
        """Return the quarantined migrations and re-apply them."""
        quarantine = self.root / "reverted"
        for name in getattr(self, "reverted", []):
            source = quarantine / name
            if source.is_file():
                shutil.move(str(source), str(self.root / "migrations" / name))
        self.reverted = []
        self.migrate("up")

    def start(self) -> None:
        """Start only the disposable loopback instance and wait for native health."""
        self.process = subprocess.Popen(
            [
                self.binary,
                "serve",
                f"--http=127.0.0.1:{self.port}",
                *self.paths(),
                "--hooksWatch=false",
                # This flag DOES NOT WORK on 0.39.8 and is kept only to declare the intent.
                # Measured: a migration reverted by `migrate down` is re-applied by the next
                # serve under --automigrate=0, --automigrate=false and a bare --automigrate
                # alike. Rollback is made observable by revert(), which moves the reverted
                # file out of the migrations directory; see NativeServer.revert.
                "--automigrate=0",
            ],
            cwd=self.root,
            env=self.environment,
            stdout=self.log,
            stderr=subprocess.STDOUT,
            **NO_WINDOW,
        )
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise AssertionError(
                    "The isolated native process exited before health acceptance."
                )
            try:
                if self.request("GET", "/api/health")[0] == 200:
                    return
            except (URLError, OSError):
                pass
            time.sleep(0.05)
        raise AssertionError("The isolated native process did not become healthy.")

    def stop(self) -> None:
        """Stop only the child process started by this fixture."""
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)

    def close(self) -> None:
        """Discard the server and all synthetic private test material."""
        self.stop()
        self.log.close()
        self.directory.cleanup()

    def request(
        self, method: str, path: str, body: dict | None = None, token: str = ""
    ) -> tuple[int, dict]:
        """Call the loopback native API without proxies or response logging."""
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = token
        request = Request(
            self.base + path,
            method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers=headers,
        )
        opener = build_opener(ProxyHandler({}))
        try:
            with opener.open(request, timeout=10) as response:
                raw = response.read(500000)
                return response.status, json.loads(raw) if raw else {}
        except HTTPError as error:
            raw = error.read(10000)
            return error.code, json.loads(raw) if raw else {}

    def login(self, name: str) -> str:
        """Authenticate a synthetic fixture user through PocketBase's native flow."""
        status, data = self.request(
            "POST",
            "/api/collections/users/auth-with-password",
            {
                "identity": name + "@fixture.invalid",
                "password": "local-fixture-password-only",
            },
        )
        if status != 200 or not isinstance(data.get("token"), str):
            raise AssertionError("Synthetic native user authentication failed.")
        return data["token"]

    def rows(self, name: str) -> list[tuple]:
        """Inspect only ciphertext in the fixture database using a read-only connection."""
        if name not in {"dossier_entities", "dossier_events", "user_dossiers"}:
            raise ValueError("Choose a dossier fixture table.")
        with sqlite3.connect(
            (self.root / "data/data.db").as_uri() + "?mode=ro", uri=True
        ) as database:
            return database.execute(
                f"select owner, key_id, sealed from {name}"
            ).fetchall()


@unittest.skipUnless(
    BINARY and Path(BINARY).is_file(),
    "Native PocketBase binary unavailable; no auth/rules/crypto claim.",
)
class NativeDossierTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = NativeServer(BINARY)
        self.addCleanup(self.server.close)
        self.alice, self.bob, self.bot = (
            self.server.login(name) for name in ["alice", "bravo", "bot"]
        )
        self.count = 0

    def command(
        self,
        action: str,
        payload: dict,
        revision: int = 0,
        key: str = "",
        token: str = "",
    ) -> tuple[int, dict]:
        """Submit the production command envelope through native authorization."""
        self.count += 1
        return self.server.request(
            "POST",
            "/api/buildanddo/dossier",
            {
                "action": action,
                "payload": payload,
                "revision": revision,
                "request_key": key or f"native_dossier_{self.count:010d}",
            },
            token or self.alice,
        )

    def input(self) -> dict:
        """Supply substantive synthetic entity context, never a live private record."""
        return {
            "label": "Native private entity",
            "kind": "project",
            "aliases": ["Native alias"],
            "tags": ["native"],
            "note": "Native private source note.",
            "source_url": "https://buildanddo.com/docs",
            "source_label": "Fixture source",
        }

    def read(self, token: str = "") -> tuple[int, dict]:
        """Recall only the authenticated fixture's personal entities."""
        return self.server.request(
            "POST",
            "/api/buildanddo/dossier/read",
            {"action": "recall", "query": "", "page": 1},
            token or self.alice,
        )

    def test_native_auth_locked_collections_and_encrypted_content(self) -> None:
        status, _ = self.server.request(
            "POST",
            "/api/buildanddo/dossier/read",
            {"action": "recall", "query": "", "page": 1},
        )
        self.assertIn(status, {401, 403})
        status, saved = self.command("entity.create", self.input())
        self.assertEqual(status, 200)
        self.assertEqual(saved["owner"], ALICE)
        status, recalled = self.read()
        self.assertEqual(status, 200)
        self.assertEqual(recalled["items"][0]["label"], "Native private entity")
        self.assertEqual(self.read(self.bob)[1]["entity_count"], 0)
        status, _ = self.server.request(
            "POST",
            "/api/buildanddo/dossier/read",
            {"action": "entity", "id": saved["id"]},
            self.bob,
        )
        self.assertEqual(status, 404)
        for name in ["user_dossiers", "dossier_entities", "dossier_events"]:
            self.assertIn(
                self.server.request(
                    "GET", f"/api/collections/{name}/records", token=self.alice
                )[0],
                {403, 404},
            )
            self.assertIn(
                self.server.request(
                    "POST",
                    f"/api/collections/{name}/records",
                    {"owner": ALICE},
                    self.alice,
                )[0],
                {403, 404},
            )
            persisted = json.dumps(self.server.rows(name))
            self.assertNotIn("Native private", persisted)
            self.assertNotIn("Native alias", persisted)
            self.assertNotIn("Fixture source", persisted)

    def test_native_concurrent_retries_and_deletion_do_not_duplicate_or_resurrect(
        self,
    ) -> None:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(
                pool.map(
                    lambda _: self.command(
                        "entity.create", self.input(), key="native_same_retry_00001"
                    ),
                    range(2),
                )
            )
        self.assertTrue(all(status == 200 for status, _ in results))
        self.assertEqual(results[0][1]["id"], results[1][1]["id"])
        self.assertEqual(len(self.server.rows("dossier_entities")), 1)
        entity = results[0][1]["id"]
        status, _ = self.command("entity.delete", {"id": entity}, 0)
        self.assertEqual(status, 409)
        status, _ = self.command("entity.delete", {"id": entity}, 1)
        self.assertEqual(status, 200)
        status, replay = self.command(
            "entity.create", self.input(), key="native_same_retry_00001"
        )
        self.assertEqual(status, 200)
        self.assertTrue(replay["replayed"])
        self.assertEqual(self.read()[1]["entity_count"], 0)

    def test_native_external_auth_link_resolves_user_and_unlink_revokes_discord(
        self,
    ) -> None:
        path = f"/api/buildanddo/workspaces/{WORKSPACE}/discord-dossier"
        body = {
            "guild_id": GUILD,
            "channel_id": CHANNEL,
            "discord_user_id": DISCORD,
            "link_id": "",
            "command": {"action": "access"},
        }
        status, access = self.server.request("POST", path, body, self.bot)
        self.assertEqual(status, 200)
        self.assertEqual(access["owner"], ALICE)
        body["link_id"] = access["link_id"]
        body["command"] = {
            "action": "entity.create",
            "payload": self.input(),
            "revision": 0,
            "request_key": "native_discord_save_001",
        }
        status, saved = self.server.request("POST", path, body, self.bot)
        self.assertEqual(status, 200)
        self.assertEqual(saved["owner"], ALICE)
        self.assertEqual(self.read()[1]["entity_count"], 1)
        self.assertEqual(
            self.server.request(
                "POST", path, {**body, "channel_id": DISCORD}, self.bot
            )[0],
            403,
        )
        status, _ = self.server.request(
            "DELETE",
            f"/api/collections/users/records/{ALICE}/external-auths/discord",
            token=self.alice,
        )
        self.assertEqual(status, 204)
        body["command"] = {"action": "access"}
        self.assertEqual(self.server.request("POST", path, body, self.bot)[0], 403)
        self.assertEqual(self.read()[1]["entity_count"], 1)

    def test_native_key_loss_fails_closed_without_overwriting_ciphertext(self) -> None:
        self.assertEqual(self.command("entity.create", self.input())[0], 200)
        stored = self.server.rows("dossier_entities")
        self.server.stop()
        self.server.environment["BUILDANDDO_DOSSIER_KEYS"] = ""
        self.server.start()
        self.assertEqual(self.read()[0], 503)
        self.assertEqual(self.command("entity.create", self.input())[0], 503)
        self.assertEqual(self.server.rows("dossier_entities"), stored)
        self.server.stop()
        self.server.environment["BUILDANDDO_DOSSIER_KEYS"] = self.server.keys
        self.server.start()
        self.assertEqual(self.read()[1]["entity_count"], 1)


if __name__ == "__main__":
    if "--require-binary" in sys.argv:
        sys.argv.remove("--require-binary")
        if not BINARY or not Path(BINARY).is_file():
            print(
                "FAIL: set BUILDANDDO_TEST_POCKETBASE to the native test binary; no native acceptance was run."
            )
            raise SystemExit(1)
    unittest.main(verbosity=2)
