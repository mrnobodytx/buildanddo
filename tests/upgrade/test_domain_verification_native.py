# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_domain_verification_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-SITE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SITE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     tests/upgrade/test_classroom_native.py, apps/pocketbase/pb_hooks/domains.pb.js, apps/pocketbase/pb_hooks/domain-verification.js, apps/pocketbase/pb_hooks/workspace-record-policy.js, apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js, apps/pocketbase/pb_migrations/1791600000_domain_verification.js
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_classroom_native.py; VALIDATES apps/pocketbase/pb_hooks/domains.pb.js; VALIDATES apps/pocketbase/pb_hooks/domain-verification.js; VALIDATES apps/pocketbase/pb_hooks/workspace-record-policy.js; VALIDATES apps/pocketbase/pb_migrations/1791600000_domain_verification.js
# DAG Node:    none
# Intent:      Require real PocketBase to hide the challenge token, refuse browser-asserted ownership and fail closed on resolver errors.
# ───────────────────────────────────────────────────────────────

"""Exercise DNS domain verification on a disposable loopback PocketBase.

Nothing here reaches the internet. The resolver is either a closed loopback
port or, when openssl is available, a fixture-only HTTPS responder on 127.0.0.1
trusted through a throwaway certificate given to the child process alone.
"""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import ssl
import subprocess
import sys
import tempfile
import threading
from typing import Any
import unittest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from tests.upgrade.test_classroom_native import DiagnosticNativeServer  # noqa: E402

BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
WORKSPACE = "workspacealpha1"
DOMAIN = "domainalpha0001"
LEGACY = "domainlegacy001"
MIGRATION = "1791600000_domain_verification.js"
MIGRATIONS = ("1788474000_create_workspace_collections.js", MIGRATION)
HOOKS = (
    "domains.pb.js",
    "domain-verification.js",
    "workspace-record-policy.js",
    "workspace-access.js",
    "government-access.js",
    "workflow-policy.js",
    "business-action-policy.js",
)
PROOF = (
    "verification_token",
    "verification_requested_at",
    "verification_checked_at",
    "verification_result",
    "verified_at",
)
USERS = r"""
migrate((app) => {
    let users;
    try { users = app.findCollectionByNameOrId('users'); }
    catch { users = new Collection({ name: 'users', type: 'auth' }); }
    users.authRule = ''; users.authAlert = { enabled: false };
    users.passwordAuth = { enabled: true, identityFields: ['email'] };
    if (!users.fields.getByName('name')) users.fields.add(new TextField({ name: 'name', max: 120 }));
    app.save(users);
    for (const [id, name] of [['accountalice001', 'alice'], ['accountbravo001', 'bravo'], ['accountcarol001', 'carol']]) {
        const user = new Record(users); user.id = id; user.set('name', name);
        user.set('email', name + '@fixture.invalid'); user.set('verified', true);
        user.setPassword('local-fixture-password-only'); app.save(user);
    }
}, () => {});
"""
# Production domains/workspaces come from 1788474000; this adds the production
# RBAC end state for workspaces, membership, and one legacy self-asserted status.
WORKSPACES = r"""
migrate((app) => {
    const workspaces = app.findCollectionByNameOrId('workspaces');
    workspaces.updateRule = null; workspaces.deleteRule = null; app.save(workspaces);
    const members = new Collection({ name: 'workspace_members', type: 'base', listRule: null, viewRule: null,
        createRule: null, updateRule: null, deleteRule: null, fields: [
            { name: 'workspace', type: 'relation', required: true, maxSelect: 1, collectionId: workspaces.id },
            { name: 'user', type: 'relation', required: true, maxSelect: 1, collectionId: '_pb_users_auth_' },
            { name: 'role', type: 'select', required: true, maxSelect: 1, values: ['owner', 'admin', 'editor', 'viewer'] }] });
    app.save(members);
    const domains = app.findCollectionByNameOrId('domains');
    const add = (collection, values) => { const record = new Record(collection);
        for (const [key, value] of Object.entries(values)) record.set(key, value); app.save(record); return record; };
    add(domains, { id: 'domainalpha0001', domain: 'example.com', status: 'selected', has_website: true, owner: 'accountalice001' });
    add(domains, { id: 'domainlegacy001', domain: 'legacy.example', status: 'verified', has_website: true, owner: 'accountalice001' });
    add(workspaces, { id: 'workspacealpha1', name: 'Alpha', domain: 'domainalpha0001', owner: 'accountalice001' });
    add(workspaces, { id: 'workspacelegacy', name: 'Legacy', domain: 'domainlegacy001', owner: 'accountalice001' });
    add(members, { workspace: 'workspacealpha1', user: 'accountbravo001', role: 'editor' });
    add(members, { workspace: 'workspacealpha1', user: 'accountcarol001', role: 'admin' });
}, () => {});
"""


def free_port() -> int:
    """Reserve and release a loopback port that nothing is listening on."""
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        return reservation.getsockname()[1]


class DomainServer(DiagnosticNativeServer):
    """Install only the domain schema, verification hooks and synthetic accounts."""

    def __init__(self, binary: str, environment: dict[str, str] | None = None) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="buildanddo-domain-native-")
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process = None
        self.log = tempfile.TemporaryFile(mode="w+b")
        self.environment = {"PATH": os.environ.get("PATH", ""), **(environment or {})}
        try:
            hooks = self.root / "hooks"
            hooks.mkdir()
            for name in HOOKS:
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            migrations = self.root / "migrations"
            migrations.mkdir()
            (migrations / "0000000001_fixture.js").write_text(USERS)
            (migrations / "1788474001_fixture.js").write_text(WORKSPACES)
            for name in MIGRATIONS:
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations" / name, migrations / name
                )
            self.port = free_port()
            self.base = f"http://127.0.0.1:{self.port}"
            self.migrate("up")
            self.start()
        except BaseException:
            self.close()
            raise

    def restart(self, **environment: str) -> None:
        """Change only this child's environment and restart it on the same data."""
        self.stop()
        self.environment.update(environment)
        self.start()

    def domains(self) -> list[dict[str, Any]]:
        """Read synthetic domain rows directly, including the hidden field."""
        with sqlite3.connect(
            (self.root / "data/data.db").as_uri() + "?mode=ro", uri=True
        ) as database:
            database.row_factory = sqlite3.Row
            return [
                dict(row) for row in database.execute("select * from domains order by id")
            ]

    def workspace_ids(self) -> list[str]:
        with sqlite3.connect(
            (self.root / "data/data.db").as_uri() + "?mode=ro", uri=True
        ) as database:
            return [row[0] for row in database.execute("select id from workspaces order by id")]

    def forget_migration(self, name: str) -> None:
        """While stopped, mark a migration unapplied so `migrate up` replays it on existing fields."""
        self.stop()
        with sqlite3.connect(self.root / "data/data.db") as database:
            database.execute("delete from _migrations where file = ?", (name,))


class FixtureResolver:
    """Answer DNS-over-HTTPS JSON on loopback only, recording each request line."""

    def __init__(self, directory: Path) -> None:
        self.certificate = directory / "resolver.pem"
        key = directory / "resolver.key"
        subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
             "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
             "-keyout", str(key), "-out", str(self.certificate)],
            check=True, capture_output=True, timeout=60,
        )
        self.answer: dict[str, Any] = {"Status": 3}
        self.requests: list[tuple[str, str]] = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 - stdlib handler name
                owner.requests.append((self.path, self.headers.get("accept", "")))
                body = json.dumps(owner.answer).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/dns-json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_: Any) -> None:
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(self.certificate, key)
        self.server.socket = context.wrap_socket(self.server.socket, server_side=True)
        self.url = f"https://127.0.0.1:{self.server.server_address[1]}/dns-query"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@unittest.skipUnless(
    BINARY and Path(BINARY).is_file(),
    "Native PocketBase unavailable; domain verification runtime acceptance remains open.",
)
class NativeDomainVerificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.closed = free_port()
        self.server = DomainServer(
            BINARY, {"BUILDANDDO_DOH_URL": f"https://127.0.0.1:{self.closed}/dns-query"}
        )
        self.addCleanup(self.server.close)
        self.owner = self.server.login("alice")
        self.editor = self.server.login("bravo")
        self.admin = self.server.login("carol")
        self.route = f"/api/buildanddo/workspaces/{WORKSPACE}/domain"

    def challenge(self, token: str = "") -> dict[str, Any]:
        status, record = self.server.request(
            "POST", self.route + "/challenge", {}, token or self.owner
        )
        self.assertEqual(status, 200)
        return record

    def test_token_never_appears_in_record_api_responses(self) -> None:
        record = self.challenge()
        self.assertEqual(record["record_name"], "_buildanddo-verify.example.com")
        self.assertEqual(record["record_type"], "TXT")
        token = record["record_value"].removeprefix("buildanddo-verify=")
        self.assertRegex(token, r"^[A-Za-z0-9]{32}$")
        stored = next(row for row in self.server.domains() if row["id"] == DOMAIN)
        self.assertEqual(stored["verification_token"], token)
        raw = "/api/collections/domains/records"
        responses = [
            self.server.request("GET", f"{raw}/{DOMAIN}", token=self.owner),
            self.server.request("GET", raw, token=self.owner),
            self.server.request("GET", f"{raw}?fields=*,verification_token", token=self.owner),
            self.server.request("GET", f"{raw}?filter=(verification_token!='')", token=self.owner),
            self.server.request(
                "GET", f"/api/collections/workspaces/records/{WORKSPACE}?expand=domain", token=self.owner
            ),
        ]
        self.assertEqual(responses[0][0], 200)
        self.assertEqual(responses[1][0], 200)
        self.assertEqual(responses[1][1]["totalItems"], 2)
        self.assertNotIn("verification_token", responses[0][1])
        for status, body in responses:
            self.assertNotIn(token, json.dumps(body), status)
        for status, body in (
            self.server.request("GET", self.route, token=self.editor),
            self.server.request("GET", self.route, token=self.owner),
        ):
            self.assertEqual(status, 200)
        editor_view = self.server.request("GET", self.route, token=self.editor)[1]
        self.assertEqual(
            editor_view,
            {"workspace": WORKSPACE, "domain": "example.com", "status": "selected", "can_manage": False},
        )
        owner_view = self.server.request("GET", self.route, token=self.owner)[1]
        self.assertEqual(owner_view["challenge"]["record_value"], record["record_value"])

    def test_challenge_is_for_owners_and_admins_only(self) -> None:
        self.assertIn(self.server.request("POST", self.route + "/challenge", {})[0], (401, 403))
        self.assertEqual(self.challenge(self.admin)["record_name"], "_buildanddo-verify.example.com")
        status, body = self.server.request("POST", self.route + "/challenge", {}, self.editor)
        self.assertEqual(status, 403)
        self.assertNotIn("buildanddo-verify=", json.dumps(body))
        self.assertEqual(
            self.server.request("POST", self.route, {"domain": "other.example"}, self.editor)[0], 403
        )
        self.assertEqual(self.server.request("POST", self.route + "/verify", {}, self.editor)[0], 403)

    def test_browser_writes_cannot_assert_ownership_or_delete_a_linked_domain(self) -> None:
        raw = "/api/collections/domains/records"
        token = self.challenge()["record_value"].removeprefix("buildanddo-verify=")
        for body in (
            {"status": "verified"},
            {"domain": "attacker.example"},
            {"verification_result": "verified"},
            {"verified_at": "2026-09-24 00:00:00.000Z"},
            {"verification_requested_at": "2026-09-24 00:00:00.000Z"},
            {"owner": "accountbravo001"},
        ):
            status, _ = self.server.request("PATCH", f"{raw}/{DOMAIN}", body, self.owner)
            self.assertEqual(status, 400, body)
        # PocketBase drops hidden fields from non-superuser writes, so the token cannot be chosen either.
        status, echoed = self.server.request("PATCH", f"{raw}/{DOMAIN}", {"verification_token": "chosen"}, self.owner)
        self.assertIn(status, (200, 400))
        self.assertNotIn("verification_token", echoed)
        self.assertEqual(next(row for row in self.server.domains() if row["id"] == DOMAIN)["verification_token"], token)
        status, _ = self.server.request("POST", raw, {"domain": "chosen.example", "status": "selected", "owner": "accountalice001",
                                                       "verification_token": "chosen"}, self.owner)
        self.assertIn(status, (200, 400))
        self.assertNotIn("chosen", [row["verification_token"] for row in self.server.domains()])
        for row in self.server.domains():
            if row["domain"] == "chosen.example":
                self.assertEqual(self.server.request("DELETE", f"{raw}/{row['id']}", token=self.owner)[0], 204)
        self.assertEqual(self.server.request("PATCH", f"{raw}/{DOMAIN}", {"has_website": False}, self.owner)[0], 200)
        created = {"domain": "new.example", "has_website": True, "owner": "accountalice001"}
        self.assertEqual(self.server.request("POST", raw, {**created, "status": "verified"}, self.owner)[0], 400)
        status, fresh = self.server.request("POST", raw, {**created, "status": "selected"}, self.owner)
        self.assertEqual(status, 200)
        stored = next(row for row in self.server.domains() if row["id"] == DOMAIN)
        self.assertEqual(stored["status"], "selected")
        self.assertEqual(stored["domain"], "example.com")

        status, body = self.server.request("DELETE", f"{raw}/{DOMAIN}", token=self.owner)
        self.assertEqual(status, 400)
        self.assertIn("linked to a workspace", body.get("message", ""))
        self.assertIn(WORKSPACE, self.server.workspace_ids())
        # After a change the old row is history: its holder may remove it and the workspace stays.
        status, changed = self.server.request("POST", self.route, {"domain": "shop.example.org"}, self.admin)
        self.assertEqual(status, 200)
        self.assertTrue(changed["changed"])
        self.assertIn(self.server.request("DELETE", f"{raw}/{DOMAIN}", token=self.admin)[0], (403, 404))
        self.assertEqual(self.server.request("DELETE", f"{raw}/{DOMAIN}", token=self.owner)[0], 204)
        self.assertEqual(self.server.request("DELETE", f"{raw}/{fresh['id']}", token=self.owner)[0], 204)
        self.assertIn(WORKSPACE, self.server.workspace_ids())
        linked = next(row for row in self.server.domains() if row["domain"] == "shop.example.org")
        self.assertEqual(linked["owner"], "accountalice001")
        self.assertEqual(self.server.request("DELETE", f"{raw}/{linked['id']}", token=self.owner)[0], 400)

    def test_migration_demotes_legacy_status_and_replays_on_existing_fields(self) -> None:
        legacy = next(row for row in self.server.domains() if row["id"] == LEGACY)
        self.assertEqual(legacy["status"], "needs_attention")
        token = self.challenge()["record_value"]
        schema = {field["name"]: field for field in self.server.collection("domains")["fields"]}
        self.assertTrue(schema["verification_token"]["hidden"])
        self.assertEqual(schema["verified_at"]["type"], "date")
        # Replay the up step with every field already present (the native type() path).
        self.server.forget_migration(MIGRATION)
        self.server.migrate("up")
        self.server.migrate("up")
        self.server.start()
        self.assertEqual(self.server.request("GET", self.route, token=self.owner)[1]["challenge"]["record_value"], token)
        self.server.stop()
        self.server.migrate("down", "1")
        names = {field["name"] for field in self.server.collection("domains")["fields"]}
        self.assertFalse(names & set(PROOF))
        self.assertEqual(
            {row["id"]: row["status"] for row in self.server.domains()},
            {DOMAIN: "selected", LEGACY: "needs_attention"},
        )
        self.server.migrate("up")
        self.server.start()
        view = self.server.request("GET", self.route, token=self.owner)[1]
        self.assertEqual((view["domain"], view["status"], view["challenge"]), ("example.com", "selected", None))

    def test_unreachable_resolver_fails_closed_and_checks_are_rate_limited(self) -> None:
        self.assertEqual(self.server.request("POST", self.route + "/verify", {}, self.owner)[0], 409)
        self.challenge()
        status, result = self.server.request("POST", self.route + "/verify", {}, self.owner)
        self.assertEqual(status, 200)
        self.assertEqual(set(result), {"status", "result", "checked_at"})
        self.assertEqual((result["status"], result["result"]), ("selected", "lookup_failed"))
        self.assertNotRegex(json.dumps(result), r"127\.0\.0\.1|dial|refused|tcp")
        status, limited = self.server.request("POST", self.route + "/verify", {}, self.admin)
        self.assertEqual(status, 429)
        self.assertTrue(1 <= limited["retry_after"] <= 30)
        self.assertRegex(limited["message"], r"^Check again in \d+ seconds\.$")
        self.assertEqual(limited["result"], "lookup_failed")
        stored = next(row for row in self.server.domains() if row["id"] == DOMAIN)
        self.assertEqual((stored["status"], stored["verification_result"], stored["verified_at"]), ("selected", "lookup_failed", ""))

    def test_non_https_resolver_override_is_refused(self) -> None:
        self.challenge()
        self.server.restart(BUILDANDDO_DOH_URL=f"http://127.0.0.1:{self.closed}/dns-query")
        status, body = self.server.request("POST", self.route + "/verify", {}, self.owner)
        self.assertEqual(status, 503)
        self.assertIn("must be an https URL", body["message"])
        stored = next(row for row in self.server.domains() if row["id"] == DOMAIN)
        self.assertEqual(stored["verification_checked_at"], "")

    @unittest.skipUnless(shutil.which("openssl"), "openssl unavailable for the loopback resolver certificate.")
    def test_exact_match_at_a_loopback_resolver_verifies(self) -> None:
        resolver = FixtureResolver(self.server.root)
        self.addCleanup(resolver.close)
        self.server.restart(BUILDANDDO_DOH_URL=resolver.url, SSL_CERT_FILE=str(resolver.certificate))
        value = self.challenge()["record_value"]
        resolver.answer = {"Status": 0, "Answer": [
            {"name": "_buildanddo-verify.example.com.", "type": 16, "TTL": 60, "data": f'"{value}x"'}]}
        status, result = self.server.request("POST", self.route + "/verify", {}, self.owner)
        self.assertEqual((status, result["status"], result["result"]), (200, "selected", "mismatch"))
        self.assertEqual(resolver.requests, [
            ("/dns-query?name=_buildanddo-verify.example.com&type=TXT", "application/dns-json")])
        self.server.fixture_change(
            f"const row = app.findRecordById('domains', '{DOMAIN}'); row.set('verification_checked_at', ''); app.save(row);"
        )
        resolver.answer = {"Status": 0, "Answer": [
            {"name": "_buildanddo-verify.example.com.", "type": 16, "TTL": 60, "data": f'"{value[:20]}" "{value[20:]}"'}]}
        status, result = self.server.request("POST", self.route + "/verify", {}, self.owner)
        self.assertEqual((status, result["status"], result["result"]), (200, "verified", "verified"))
        stored = next(row for row in self.server.domains() if row["id"] == DOMAIN)
        self.assertEqual(stored["status"], "verified")
        self.assertTrue(stored["verified_at"])
        self.assertEqual(len(resolver.requests), 2)


if __name__ == "__main__":
    required = "--require-binary" in sys.argv
    if required:
        sys.argv.remove("--require-binary")
    if required and not (BINARY and Path(BINARY).is_file()):
        raise SystemExit(
            "FAIL: BUILDANDDO_TEST_POCKETBASE must name the disposable test binary; native domain verification tests did not run."
        )
    unittest.main()
