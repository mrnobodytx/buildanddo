# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_suite_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     tests/upgrade/test_dossier_native.py, apps/mission_suite/engine.py, apps/pocketbase/pb_hooks/mission-suite.js, apps/pocketbase/pb_hooks/operator.pb.js, apps/pocketbase/pb_hooks/workspace-operator.js
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/upgrade/test_dossier_native.py; VALIDATES apps/mission_suite/engine.py; VALIDATES apps/pocketbase/pb_hooks/mission-suite.js; VALIDATES apps/pocketbase/pb_hooks/operator.pb.js; VALIDATES apps/pocketbase/pb_hooks/workspace-operator.js
# DAG Node:    none
# Intent:      Require native suite execution and scoped, read-only operator observations before accepting a box-worker runtime.
# ───────────────────────────────────────────────────────────────

"""Exercise the suite and operator APIs in a disposable native PocketBase instance."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
from typing import Any
import unittest
from urllib.request import ProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# The standalone CI entry point must add the repository before local imports.
from apps.mission_suite.bundle import source_fingerprint  # noqa: E402
from apps.mission_suite.engine import decode, replay, run_suite  # noqa: E402
from tests.upgrade.test_dossier_native import NativeServer  # noqa: E402

BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
WORKSPACE = "workspacealpha1"
MISSION = "missionalpha001"
WORKER = "accountwork0001"

# This schema and its synthetic users exist only in an isolated test directory.
# Native API rules deliberately differ from raw suite collections, which stay locked.
SEED = r"""
migrate((app) => {
    let users;
    try { users = app.findCollectionByNameOrId('users'); }
    catch { users = new Collection({ name: 'users', type: 'auth' }); }
    users.authRule = ''; users.passwordAuth = { enabled: true, identityFields: ['email'] }; users.authAlert = { enabled: false }; app.save(users);
    for (const [id, name] of [['accountalice001', 'alice'], ['accountbravo001', 'bravo'], ['accountwork0001', 'worker'], ['accountother001', 'other'], ['accountviewer01', 'viewer']]) {
        const user = new Record(users); user.id = id; user.set('email', name + '@fixture.invalid'); user.set('verified', true);
        user.setPassword('local-fixture-password-only'); app.save(user);
    }
    const relation = (name, target, required = true) => ({ name, type: 'relation', required, maxSelect: 1, collectionId: app.findCollectionByNameOrId(target).id });
    const text = (name) => ({ name, type: 'text', max: 10000 });
    const stamps = () => [{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
    const create = (name, fields, rules = {}) => {
        const collection = new Collection({ name, type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields, ...rules });
        app.save(collection); return collection;
    };
    const workspaces = create('workspaces', [relation('owner', 'users')]);
    const workspace = new Record(workspaces); workspace.id = 'workspacealpha1'; workspace.set('owner', 'accountbravo001'); app.save(workspace);
    const foreign = new Record(workspaces); foreign.id = 'workspacebravo1'; foreign.set('owner', 'accountother001'); app.save(foreign);
    const members = create('workspace_members', [relation('workspace', 'workspaces'), relation('user', 'users'), text('role')],
        { updateRule: 'workspace.owner = @request.auth.id', deleteRule: 'workspace.owner = @request.auth.id' });
    const member = new Record(members); member.id = 'memberalice0001'; member.set('workspace', workspace.id); member.set('user', 'accountalice001'); member.set('role', 'editor'); app.save(member);
    const viewer = new Record(members); viewer.id = 'memberviewer001'; viewer.set('workspace', workspace.id); viewer.set('user', 'accountviewer01'); viewer.set('role', 'viewer'); app.save(viewer);
    const readable = '@request.auth.id != "" && (owner = @request.auth.id || workspace.owner = @request.auth.id)';
    const missions = create('missions', [relation('workspace', 'workspaces'), relation('owner', 'users'), text('status'), text('title'),
        { name: 'mission_plan', type: 'json', maxSize: 65536 }, ...stamps()], { listRule: readable, viewRule: readable });
    const mission = new Record(missions); mission.id = 'missionalpha001'; mission.set('workspace', workspace.id); mission.set('owner', 'accountalice001');
    mission.set('status', 'running'); mission.set('title', 'Synthetic suite acceptance'); app.save(mission);
    for (let index = 0; index < 22; index++) {
        const row = new Record(missions); row.id = 'page' + String(index).padStart(11, '0');
        row.set('workspace', workspace.id); row.set('owner', 'accountalice001'); row.set('status', 'proposed');
        row.set('title', 'Synthetic pagination ' + index); app.save(row);
    }
    const outside = new Record(missions); outside.id = 'missionbravo001'; outside.set('workspace', foreign.id);
    outside.set('owner', 'accountother001'); outside.set('status', 'running'); outside.set('title', 'Other workspace only'); app.save(outside);
    create('evidence', [relation('workspace', 'workspaces'), relation('owner', 'users'), relation('mission', 'missions'),
        ...['type', 'category', 'title', 'content', 'source', 'tags', 'url'].map(text), ...stamps()], { listRule: readable, viewRule: readable });
}, () => {});
"""


class SuiteServer(NativeServer):
    """Reuse the native fixture lifecycle with only this suite's source and schema."""

    def __init__(self, binary: str) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="buildanddo-suite-native-")
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
            "BUILDANDDO_SUITE_BINDINGS": json.dumps(
                [
                    {
                        "workspace": WORKSPACE,
                        "worker_user": WORKER,
                        "binding": "native-fixture",
                        "source_sha256": source_fingerprint(),
                        "enabled": True,
                    }
                ]
            ),
        }
        try:
            hooks = self.root / "hooks"
            hooks.mkdir()
            for name in (
                "suite.pb.js",
                "mission-suite.js",
                "suite-policy.js",
                "research-policy.js",
                "workspace-access.js",
                "workflow-policy.js",
                "operator.pb.js",
                "workspace-operator.js",
                "workspace-administration.js",
                "mission-policy.js",
            ):
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            migrations = self.root / "migrations"
            migrations.mkdir()
            # PocketBase applies migrations in byte-wise filename order, so "1_fixture.js"
            # sorted AFTER every timestamped product migration ("_" 0x5F > "7" 0x37) and
            # they aborted looking up collections this fixture creates. Sort it first.
            (migrations / "0000000001_fixture.js").write_text(SEED)
            name = "1790300000_mission_suite.js"
            shutil.copyfile(
                ROOT / "apps/pocketbase/pb_migrations" / name, migrations / name
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

    def migrate(self, direction: str) -> None:
        """Apply or roll back only the isolated test instance's migrations."""
        args = [self.binary, "migrate", direction]
        if direction == "down":
            args.append("1")
        result = subprocess.run(
            [*args, *self.paths()],
            input="y\n",
            text=True,
            cwd=self.root,
            env=self.environment,
            stdout=self.log,
            stderr=subprocess.STDOUT,
            timeout=30,
            check=False,
        )
        if result.returncode:
            raise AssertionError(
                "The isolated suite migration failed; native acceptance did not pass."
            )


@unittest.skipUnless(
    BINARY and Path(BINARY).is_file(), "Native PocketBase binary unavailable"
)
class NativeSuiteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = SuiteServer(BINARY)
        self.addCleanup(self.server.close)
        self.tokens = {
            name: self.server.login(name)
            for name in ("alice", "bravo", "worker", "other", "viewer")
        }
        self.sequence = 0
        self.source = source_fingerprint()
        self.path = f"/api/buildanddo/workspaces/{WORKSPACE}/suite"
        self.call(
            "configure",
            {
                "enabled": True,
                "rights": [
                    {
                        "source_id": "fixture",
                        "rights_id": "fixture-license",
                        "license_ref": "Synthetic test-only observations",
                        "classification": "PUBLIC",
                        "processing_allowed": True,
                        "export_allowed": False,
                        "expires_at": "2099-01-01T00:00:00Z",
                        "independence_group": "fixture",
                    }
                ],
                "parameters": {
                    "gap_seconds": 900,
                    "max_speed_knots": 45,
                    "position_tolerance_m": 5000,
                    "stale_seconds": 3600,
                },
            },
            actor="bravo",
        )

    def call(
        self,
        action: str,
        payload: dict,
        revision: int = 0,
        actor: str = "alice",
        key: str | None = None,
        expected: int = 200,
    ) -> dict:
        """Send one native command without exposing authentication responses."""
        self.sequence += 1
        status, data = self.server.request(
            "POST",
            self.path,
            {
                "action": action,
                "payload": payload,
                "mission": "" if action == "poll" else MISSION,
                "revision": revision,
                "request_key": key or f"suite_native_request_{self.sequence:06}",
            },
            self.tokens[actor],
        )
        self.assertEqual(
            status, expected, f"Native {action} returned {status}; expected {expected}"
        )
        return data

    def enqueue(self) -> dict:
        return self.call(
            "enqueue",
            {
                "suite": "maritime",
                "input": {
                    "observations": [
                        {
                            "observation_id": "observation1",
                            "source_id": "fixture",
                            "source_record_id": "record1",
                            "entity_id": "vessel1",
                            "event_time": "2026-01-01T00:00:00Z",
                            "latitude": 30,
                            "longitude": -90,
                        }
                    ]
                },
            },
        )

    def operator_snapshot(self, actor: str = "alice", page: int = 1) -> dict[str, Any]:
        """Read one operator page through the installed authenticated route."""
        status, data = self.server.request(
            "GET",
            f"/api/buildanddo/workspaces/{WORKSPACE}/operator?page={page}",
            token=self.tokens[actor],
        )
        self.assertEqual(status, 200)
        self.assertEqual(data["workspace"], WORKSPACE)
        return data

    def operator_state_fingerprint(self) -> str:
        """Fingerprint only fixture work and receipt rows without writing SQLite."""
        tables = (
            "workspaces",
            "workspace_members",
            "missions",
            "evidence",
            "suite_controls",
            "suite_runs",
            "suite_receipts",
        )
        with sqlite3.connect(
            (self.server.root / "data/data.db").as_uri() + "?mode=ro", uri=True
        ) as database:
            rows = {
                table: database.execute(
                    f'select * from "{table}" order by id'
                ).fetchall()
                for table in tables
            }
        return hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()

    def test_native_operator_reads_current_jobs_without_private_input_or_writes(
        self,
    ) -> None:
        queued = self.enqueue()
        before = self.operator_state_fingerprint()
        request = Request(
            self.server.base + f"/api/buildanddo/workspaces/{WORKSPACE}/operator",
            headers={"Authorization": self.tokens["alice"]},
        )
        with build_opener(ProxyHandler({})).open(request, timeout=10) as response:
            self.assertEqual(response.headers.get("Cache-Control"), "no-store")
            raw = response.read(500000)
            snapshot = json.loads(raw)
        self.assertEqual(snapshot["schema_version"], "buildanddo.operator-snapshot/v1")
        self.assertEqual(snapshot["role"], "editor")
        jobs = snapshot["sources"]["suite_runs"]
        self.assertEqual(jobs["state"], "available")
        self.assertEqual(len(jobs["items"]), 1)
        self.assertEqual(jobs["items"][0]["id"], queued["id"])
        self.assertEqual(jobs["items"][0]["status"], "queued")
        self.assertEqual(
            set(jobs["items"][0]),
            {
                "id",
                "workspace",
                "title",
                "status",
                "owner",
                "mission",
                "created",
                "updated",
                "attempt",
                "revision",
                "lease_until",
                "failure",
            },
        )
        for private_field in (
            b"input_canonical",
            b"result_canonical",
            b"configuration",
            b"vessel1",
        ):
            self.assertNotIn(private_field, raw)
        self.operator_snapshot("bravo")
        self.assertEqual(self.operator_state_fingerprint(), before)

        lease = self.call(
            "claim", {"id": queued["id"]}, queued["revision"], actor="worker"
        )
        before_readback = self.operator_state_fingerprint()
        observed = self.operator_snapshot()["sources"]["suite_runs"]["items"][0]
        self.assertEqual(observed["status"], "processing")
        self.assertEqual(observed["attempt"], lease["attempt"])
        self.assertTrue(observed["lease_until"])
        self.assertEqual(self.operator_state_fingerprint(), before_readback)

    def test_native_operator_membership_does_not_bypass_record_rules(self) -> None:
        self.enqueue()
        path = f"/api/buildanddo/workspaces/{WORKSPACE}/operator"
        self.assertIn(self.server.request("GET", path)[0], (401, 403))
        for actor in ("other", "worker"):
            self.assertEqual(
                self.server.request("GET", path, token=self.tokens[actor])[0], 403
            )
        self.assertEqual(
            self.server.request(
                "GET",
                "/api/buildanddo/workspaces/workspacebravo1/operator",
                token=self.tokens["alice"],
            )[0],
            403,
        )
        viewer = self.operator_snapshot("viewer")
        self.assertEqual(viewer["role"], "viewer")
        for name in ("missions", "suite_runs", "evidence"):
            self.assertEqual(viewer["sources"][name]["state"], "available")
            self.assertEqual(viewer["sources"][name]["items"], [])

    def test_native_operator_rechecks_downgraded_and_revoked_membership(self) -> None:
        self.assertEqual(self.operator_snapshot()["role"], "editor")
        member = "/api/collections/workspace_members/records/memberalice0001"
        self.assertEqual(
            self.server.request(
                "PATCH",
                member,
                {"role": "viewer"},
                token=self.tokens["bravo"],
            )[0],
            200,
        )
        self.assertEqual(self.operator_snapshot()["role"], "viewer")
        self.assertEqual(
            self.server.request("DELETE", member, token=self.tokens["bravo"])[0], 204
        )
        self.assertEqual(
            self.server.request(
                "GET",
                f"/api/buildanddo/workspaces/{WORKSPACE}/operator",
                token=self.tokens["alice"],
            )[0],
            403,
        )

    def test_native_operator_bounds_pages_and_keeps_missing_sources_unavailable(
        self,
    ) -> None:
        first, second = self.operator_snapshot(), self.operator_snapshot(page=2)
        one, two = (page["sources"]["missions"] for page in (first, second))
        self.assertEqual(first["page_size"], 20)
        self.assertEqual((one["page"], two["page"]), (1, 2))
        self.assertEqual((len(one["items"]), len(two["items"])), (20, 3))
        self.assertTrue(one["has_more"])
        self.assertFalse(two["has_more"])
        identifiers = [row["id"] for row in [*one["items"], *two["items"]]]
        self.assertEqual(len(set(identifiers)), 23)
        self.assertNotIn("missionbravo001", identifiers)
        for name in (
            "signals",
            "research",
            "workflow_runs",
            "seat_events",
            "integrations",
        ):
            self.assertEqual(first["sources"][name]["state"], "unavailable")
            self.assertEqual(first["sources"][name]["items"], [])
        path = f"/api/buildanddo/workspaces/{WORKSPACE}/operator"
        for page in ("0", "-1", "10000", "1.5", "invalid"):
            self.assertEqual(
                self.server.request(
                    "GET",
                    path + "?page=" + page,
                    token=self.tokens["alice"],
                )[0],
                400,
            )
        for method in ("POST", "PATCH", "DELETE"):
            self.assertIn(
                self.server.request(method, path, {}, self.tokens["bravo"])[0],
                (404, 405),
            )

    def test_native_dates_hashes_auth_and_completion_recovery(self) -> None:
        queued = self.enqueue()
        self.call("detail", {"id": queued["id"]}, actor="other", expected=403)
        self.call(
            "claim",
            {"id": queued["id"]},
            queued["revision"],
            actor="bravo",
            expected=403,
        )
        lease = self.call(
            "claim",
            {"id": queued["id"]},
            queued["revision"],
            actor="worker",
            key="suite_native_lease_recovery",
        )
        recovered = self.call(
            "claim",
            {"id": queued["id"]},
            queued["revision"],
            actor="worker",
            key="suite_native_lease_recovery",
        )
        self.assertTrue(recovered["replayed"])
        raw = lease["job"]["input_canonical"]
        result = run_suite(raw)
        self.assertEqual(result["input_sha256"], lease["job"]["input_sha256"])
        payload = {
            "id": queued["id"],
            "attempt": lease["attempt"],
            "source_sha256": self.source,
            "failure": "",
            "result_canonical": json.dumps(
                result, sort_keys=True, separators=(",", ":")
            ),
        }
        done = self.call(
            "complete",
            payload,
            lease["revision"],
            actor="worker",
            key="suite_native_completion_recovery",
        )
        self.assertEqual(done["status"], "ready")
        detail = self.call("detail", {"id": queued["id"]})["record"]
        self.assertEqual(detail["result_canonical"], payload["result_canonical"])
        self.assertEqual(
            replay(raw, decode(detail["result_canonical"]))["state"], "MATCH"
        )
        self.assertTrue(
            self.call(
                "complete",
                payload,
                lease["revision"],
                actor="worker",
                key="suite_native_completion_recovery",
            )["replayed"]
        )
        self.assertEqual(
            self.call("snapshot", {"page": 1})["control"]["state_revision"], 1
        )
        attached = self.call(
            "attach",
            {
                "id": queued["id"],
                "note": "Reviewed synthetic native result and limits.",
            },
            done["revision"],
        )
        status, evidence = self.server.request(
            "GET",
            "/api/collections/evidence/records/" + attached["evidence"],
            token=self.tokens["alice"],
        )
        self.assertEqual(status, 200)
        self.assertEqual(evidence["type"], "observed")
        for collection in ("suite_runs", "suite_controls", "suite_receipts"):
            status, _ = self.server.request(
                "GET",
                "/api/collections/" + collection + "/records",
                token=self.tokens["bravo"],
            )
            self.assertIn(status, (403, 404))

    def test_native_membership_revocation_fences_worker_completion(self) -> None:
        queued = self.enqueue()
        lease = self.call(
            "claim", {"id": queued["id"]}, queued["revision"], actor="worker"
        )
        status, _ = self.server.request(
            "DELETE",
            "/api/collections/workspace_members/records/memberalice0001",
            token=self.tokens["bravo"],
        )
        self.assertEqual(status, 204)
        self.call(
            "complete",
            {
                "id": queued["id"],
                "attempt": lease["attempt"],
                "source_sha256": self.source,
                "failure": "invalid_data",
                "result_canonical": "",
            },
            lease["revision"],
            actor="worker",
            expected=403,
        )
        self.assertEqual(self.call("poll", {"page": 1}, actor="worker")["items"], [])

    def test_native_rollback_retains_runs_and_reup_restores_protocol(self) -> None:
        queued = self.enqueue()
        self.server.stop()
        self.server.migrate("down")
        self.server.start()
        self.call("snapshot", {"page": 1}, expected=503)
        self.server.stop()
        self.server.migrate("up")
        self.server.start()
        self.assertEqual(
            self.call("snapshot", {"page": 1})["items"][0]["id"], queued["id"]
        )


if __name__ == "__main__":
    required = "--require-binary" in sys.argv
    if required:
        sys.argv.remove("--require-binary")
        if not BINARY or not Path(BINARY).is_file():
            raise SystemExit(
                "FAIL: set BUILDANDDO_TEST_POCKETBASE to the native test binary; no suite or operator native acceptance was run."
            )
    unittest.main()
