# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_mail_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-MAIL-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-MAIL-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-25
# Depends:     apps/pocketbase/pb_hooks/builder-mailer.pb.js, apps/pocketbase/pb_hooks/customerio-mail.js
# EnumType:    Test
# EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/builder-mailer.pb.js; VALIDATES apps/pocketbase/pb_hooks/customerio-mail.js
# DAG Node:    none
# Intent:      Prove a real PocketBase password reset reaches Customer.io through the hook with a link that works, and that nothing is sent when it must not be.
# ───────────────────────────────────────────────────────────────

"""Run a native password reset through the Customer.io mail hook against a loopback fake.

Nothing leaves this machine: the hook's host is overridden to a fake Customer.io on
127.0.0.1, which records what it is sent. The link it receives is then used to change
the password, so a pass means the delivered mail carried a working credential.
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[2]
BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
NO_WINDOW = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
LEARNER, SECOND, THIRD = "learner@fixture.invalid", "second@fixture.invalid", "third@fixture.invalid"
PASSWORD = "local-fixture-password-only"
FAKE_APP_KEY = "native-fixture"
APP_URL = "https://app.fixture.invalid"
TREE = "└─ "  # how PocketBase --dev prefixes an entry's attribute line
LINK = re.compile(re.escape(APP_URL) + r"/_/#/auth/confirm-password-reset/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)")

# Copied only into a fresh temporary database.
SEED = r"""
migrate((app) => {
    let users;
    try { users = app.findCollectionByNameOrId('users'); }
    catch { users = new Collection({ name: 'users', type: 'auth' }); }
    users.passwordAuth = { enabled: true, identityFields: ['email'] };
    users.authAlert = { enabled: false };
    app.save(users);
    for (const email of ['learner@fixture.invalid', 'second@fixture.invalid', 'third@fixture.invalid']) {
        const user = new Record(users);
        user.set('email', email);
        user.set('verified', true);
        user.setPassword('local-fixture-password-only');
        app.save(user);
    }
    const settings = app.settings();
    settings.meta.appURL = 'https://app.fixture.invalid';
    settings.meta.senderName = 'Support';
    settings.meta.senderAddress = 'support@example.com';
    app.save(settings);
}, () => {});
"""


class FakeCustomerIo:
    """Record every send request on loopback and answer with a scripted reply."""

    def __init__(self) -> None:
        self.requests: list[dict] = []
        self.reply: tuple[int, dict] = (200, {"delivery_id": "native-delivery-1", "queued_at": 1})
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802 - http.server naming
                raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                outer.requests.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()},
                                       "body": json.loads(raw or b"{}")})
                status, reply = outer.reply
                data = json.dumps(reply).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *_args) -> None:
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.origin = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def wait(self, count: int, seconds: float = 10) -> int:
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline and len(self.requests) < count:
            time.sleep(0.05)
        return len(self.requests)

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


class NativeServer:
    """A disposable loopback PocketBase with only the mail hooks and the fixture schema."""

    def __init__(self, binary: str, environment: dict[str, str]) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="buildanddo-mail-native-")
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process: subprocess.Popen | None = None
        self.log_path = self.root / "native.log"
        self.log = self.log_path.open("w")
        self.environment = {
            "PATH": os.environ.get("PATH", ""),
            # Windows initializes Winsock from SystemRoot; without it the child exits before health.
            **({"SystemRoot": os.environ["SystemRoot"]} if os.name == "nt" and "SystemRoot" in os.environ else {}),
            **environment,
        }
        try:
            hooks = self.root / "hooks"
            hooks.mkdir()
            for name in ["builder-mailer.pb.js", "customerio-mail.js"]:
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            migrations = self.root / "migrations"
            migrations.mkdir()
            (migrations / "0000000001_fixture.js").write_text(SEED)
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                self.port = reservation.getsockname()[1]
            self.base = f"http://127.0.0.1:{self.port}"
            result = subprocess.run([self.binary, "migrate", "up", *self.paths()], cwd=self.root, env=self.environment,
                                    stdout=self.log, stderr=subprocess.STDOUT, timeout=30, check=False, **NO_WINDOW)
            if result.returncode:
                raise AssertionError("Native fixture migration failed.")
            # --dev prints PocketBase's own log lines, so the hook's lines can be read back.
            self.process = subprocess.Popen([self.binary, "serve", f"--http=127.0.0.1:{self.port}", *self.paths(),
                                             "--hooksWatch=false", "--dev"], cwd=self.root, env=self.environment,
                                            stdout=self.log, stderr=subprocess.STDOUT, **NO_WINDOW)
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise AssertionError("The native process exited before health.")
                try:
                    if self.request("GET", "/api/health")[0] == 200:
                        return
                except (URLError, OSError):
                    pass
                time.sleep(0.05)
            raise AssertionError("The native process did not become healthy.")
        except BaseException:
            self.close()
            raise

    def paths(self) -> list[str]:
        return [f"--dir={self.root / 'data'}", f"--migrationsDir={self.root / 'migrations'}",
                f"--hooksDir={self.root / 'hooks'}"]

    def request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        request = Request(self.base + path, method=method, headers={"Content-Type": "application/json"},
                          data=json.dumps(body).encode() if body is not None else None)
        try:
            with build_opener(ProxyHandler({})).open(request, timeout=10) as response:
                raw = response.read(200000)
                return response.status, json.loads(raw) if raw else {}
        except HTTPError as error:
            raw = error.read(10000)
            return error.code, json.loads(raw) if raw else {}

    def hook_logs(self, marker: str, seconds: float = 5) -> list[tuple[dict, str]]:
        """(attributes, raw text) of each log entry whose message contains the marker.

        PocketBase --dev prints an entry's message on one line and its attributes as JSON on
        the next, after TREE. Its own SQL lines are not the hook's and are not read.
        """
        deadline = time.monotonic() + seconds
        while True:
            self.log.flush()
            lines = self.log_path.read_text(encoding="utf-8", errors="replace").splitlines()
            found = []
            for index, line in enumerate(lines):
                if marker not in line:
                    continue
                following = lines[index + 1] if index + 1 < len(lines) else ""
                attributes: dict = {}
                if following.startswith(TREE):
                    try:
                        attributes = json.loads(following[len(TREE):])
                    except ValueError:
                        attributes = {}
                found.append((attributes, line + "\n" + following))
            if found or time.monotonic() >= deadline:
                return found
            time.sleep(0.1)

    def close(self) -> None:
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self.log.close()
        self.directory.cleanup()


class NativeCustomerIoMail(unittest.TestCase):
    def start(self, switch: bool = True) -> None:
        self.fake = FakeCustomerIo()
        self.addCleanup(self.fake.close)
        environment = {
            "CUSTOMERIO_API_URL": self.fake.origin,
            "CUSTOMERIO_APP_API_KEY": FAKE_APP_KEY,
            "BUILDER_MAILER_SENDER_ADDRESS": "noreply@sender.invalid",
            "BUILDER_MAILER_SENDER_NAME": "BuildAndDo",
        }
        if switch:
            environment["BUILDER_MAILER_PROVIDER"] = "customerio"
        self.server = NativeServer(BINARY, environment)
        self.addCleanup(self.server.close)

    def reset(self, email: str) -> int:
        return self.server.request("POST", "/api/collections/users/request-password-reset", {"email": email})[0]

    def test_reset_mail_reaches_customerio_untracked_with_a_working_link(self) -> None:
        self.start()
        self.assertEqual(self.reset(LEARNER), 204)
        self.assertEqual(self.fake.wait(1), 1)
        sent = self.fake.requests[0]
        self.assertEqual(sent["path"], "/v1/send/email")
        self.assertEqual(sent["headers"]["authorization"], f"Bearer {FAKE_APP_KEY}")
        self.assertTrue(sent["headers"]["user-agent"].startswith("BuildAndDo-PocketBase/"))
        body = sent["body"]
        self.assertEqual(body["to"], LEARNER)
        self.assertEqual(body["identifiers"], {"email": LEARNER})
        self.assertEqual(body["from"], '"BuildAndDo" <noreply@sender.invalid>')
        self.assertIs(body["tracked"], False)
        self.assertIs(body["disable_message_retention"], True)
        self.assertIs(body["send_to_unsubscribed"], True)
        self.assertIn("password", body["subject"].lower())
        match = LINK.search(body["body"])
        self.assertIsNotNone(match, "the delivered mail carries the reset link")
        token = match.group(1)
        new_password = "a-new-local-fixture-password"
        status, _ = self.server.request("POST", "/api/collections/users/confirm-password-reset",
                                        {"token": token, "password": new_password, "passwordConfirm": new_password})
        self.assertEqual(status, 204, "the delivered link must actually reset the password")
        status, auth = self.server.request("POST", "/api/collections/users/auth-with-password",
                                           {"identity": LEARNER, "password": new_password})
        self.assertEqual(status, 200)
        self.assertIsInstance(auth.get("token"), str)
        handed = self.server.hook_logs("Account email handed to Customer.io")
        self.assertEqual([attributes.get("delivery") for attributes, _ in handed], ["native-delivery-1"])
        for _, raw in self.server.hook_logs("Customer.io"):
            for secret in (LEARNER, FAKE_APP_KEY, token):
                self.assertNotIn(secret, raw)

    def test_unknown_address_sends_nothing(self) -> None:
        self.start()
        self.assertEqual(self.reset("nobody@fixture.invalid"), 204, "no hint whether an address is registered")
        self.assertEqual(self.fake.wait(1, seconds=2), 0)

    def test_refusal_is_logged_without_address_or_key(self) -> None:
        self.start()
        self.fake.reply = (400, {"meta": {"error": f"from address not verified for {SECOND}"}})
        self.assertEqual(self.reset(SECOND), 204, "a reset request never reveals delivery trouble to the caller")
        self.assertEqual(self.fake.wait(1), 1)
        refused = self.server.hook_logs("Customer.io did not accept an account email")
        self.assertEqual(len(refused), 1, "the refusal must be logged once")
        attributes, raw = refused[0]
        self.assertEqual(attributes, {"reason": "rejected", "status": 400, "detail": "from address not verified for <address>"})
        self.assertNotIn(SECOND, raw)
        self.assertNotIn(FAKE_APP_KEY, raw)

    def test_control_without_the_switch_nothing_reaches_customerio(self) -> None:
        # Control: the same server and request without BUILDER_MAILER_PROVIDER must not reach
        # the fake, or the passing tests above would prove nothing about the switch.
        self.start(switch=False)
        self.assertEqual(self.reset(THIRD), 204)
        self.assertEqual(self.fake.wait(1, seconds=3), 0)


if __name__ == "__main__":
    if "--require-binary" in sys.argv:
        sys.argv.remove("--require-binary")
        if not BINARY or not Path(BINARY).is_file():
            print("FAIL: set BUILDANDDO_TEST_POCKETBASE to the native test binary; no native acceptance was run.")
            raise SystemExit(1)
    elif not BINARY or not Path(BINARY).is_file():
        print("SKIP: BUILDANDDO_TEST_POCKETBASE is not set; no native mail acceptance was run.")
        raise SystemExit(0)
    unittest.main(verbosity=2)
