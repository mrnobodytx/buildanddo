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
# Depends:     tests/upgrade/test_dossier_native.py, apps/mission_suite/engine.py, apps/pocketbase/pb_hooks/mission-suite.js
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/upgrade/test_dossier_native.py; VALIDATES apps/mission_suite/engine.py; VALIDATES apps/pocketbase/pb_hooks/mission-suite.js
# DAG Node:    none
# Intent:      Require native authentication, date fields, transactions and same-input Python processing before accepting a box-worker runtime.
# ───────────────────────────────────────────────────────────────

"""Exercise the real suite API in a disposable native PocketBase instance."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest

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
    for (const [id, name] of [['accountalice001', 'alice'], ['accountbravo001', 'bravo'], ['accountwork0001', 'worker'], ['accountother001', 'other']]) {
        const user = new Record(users); user.id = id; user.set('email', name + '@fixture.invalid'); user.set('verified', true);
        user.setPassword('local-fixture-password-only'); app.save(user);
    }
    const relation = (name, target, required = true) => ({ name, type: 'relation', required, maxSelect: 1, collectionId: app.findCollectionByNameOrId(target).id });
    const text = (name) => ({ name, type: 'text', max: 10000 });
    const create = (name, fields, rules = {}) => {
        const collection = new Collection({ name, type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null, fields, ...rules });
        app.save(collection); return collection;
    };
    const workspaces = create('workspaces', [relation('owner', 'users')]);
    const workspace = new Record(workspaces); workspace.id = 'workspacealpha1'; workspace.set('owner', 'accountbravo001'); app.save(workspace);
    const members = create('workspace_members', [relation('workspace', 'workspaces'), relation('user', 'users'), text('role')], { deleteRule: 'workspace.owner = @request.auth.id' });
    const member = new Record(members); member.id = 'memberalice0001'; member.set('workspace', workspace.id); member.set('user', 'accountalice001'); member.set('role', 'editor'); app.save(member);
    const readable = '@request.auth.id != "" && (owner = @request.auth.id || workspace.owner = @request.auth.id)';
    const missions = create('missions', [relation('workspace', 'workspaces'), relation('owner', 'users'), text('status')], { listRule: readable, viewRule: readable });
    const mission = new Record(missions); mission.id = 'missionalpha001'; mission.set('workspace', workspace.id); mission.set('owner', 'accountalice001'); mission.set('status', 'running'); app.save(mission);
    create('evidence', [relation('workspace', 'workspaces'), relation('owner', 'users'), relation('mission', 'missions'),
        ...['type', 'category', 'title', 'content', 'source', 'tags', 'url'].map(text),
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }], { listRule: readable, viewRule: readable });
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
            ):
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            migrations = self.root / "migrations"
            migrations.mkdir()
            (migrations / "1_fixture.js").write_text(SEED)
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
            for name in ("alice", "bravo", "worker", "other")
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
                "FAIL: set BUILDANDDO_TEST_POCKETBASE to the native test binary; no suite native acceptance was run."
            )
    unittest.main()
