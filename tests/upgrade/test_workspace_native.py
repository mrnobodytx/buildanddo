# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_workspace_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     tests/upgrade/test_dossier_native.py, apps/pocketbase/pb_hooks/mission-research.js, apps/pocketbase/pb_hooks/mission-policy.js, apps/pocketbase/pb_hooks/workflow-runs.js
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_dossier_native.py; VALIDATES apps/pocketbase/pb_hooks/mission-research.js; VALIDATES apps/pocketbase/pb_hooks/mission-policy.js; VALIDATES apps/pocketbase/pb_hooks/workflow-runs.js; VALIDATES apps/pocketbase/pb_hooks/business-policy.js; VALIDATES apps/pocketbase/pb_hooks/workspace-operator.js
# Intent:      Require real auth, production migrations and a connected signal-to-independent-review journey before declaring workspace acceptance.
# ───────────────────────────────────────────────────────────────

"""Exercise the public workspace on a disposable native backend, without providers."""

from __future__ import annotations

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
from tests.upgrade.test_dossier_native import NativeServer  # noqa: E402

BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
WORKSPACE = "workspacealpha1"
ALICE, BRAVO, OTHER, VIEWER = (
    "accountalice001",
    "accountbravo001",
    "accountother001",
    "accountviewer01",
)
MIGRATIONS = (
    "1788474000_create_workspace_collections",
    "1788477655_create_editorial_collections",
    "1788900000_create_workspace_members_rbac",
    "1788940000_create_community_contributor_collections",
    "1789000000_extend_workspace_operations",
    "1789500000_add_mission_learning",
    "1789600000_create_workflow_runs",
    "1789700000_expand_business_learning",
    "1789800000_restore_workspace_evidence_access",
    "1789900000_secure_workspace_rbac",
    "1790000000_workspace_administration",
    "1790100000_mission_research",
    "1790300000_mission_suite",
)
AUTH = r"""
migrate((app) => {
    let users;
    try { users = app.findCollectionByNameOrId('users'); }
    catch { users = new Collection({ name: 'users', type: 'auth' }); }
    users.authRule = ''; users.passwordAuth = { enabled: true, identityFields: ['email'] };
    users.authAlert = { enabled: false }; app.save(users);
    for (const [id, name] of [['accountalice001', 'alice'], ['accountbravo001', 'bravo'], ['accountother001', 'other'], ['accountviewer01', 'viewer']]) {
        const user = new Record(users); user.id = id; user.set('email', name + '@fixture.invalid');
        user.set('verified', true); user.setPassword('local-fixture-password-only'); app.save(user);
    }
}, () => {});
"""
SEED = r"""
migrate((app) => {
    const save = (name, id, values) => {
        const record = new Record(app.findCollectionByNameOrId(name)); record.id = id;
        for (const [key, value] of Object.entries(values)) record.set(key, value);
        app.save(record);
    };
    save('workspaces', 'workspacealpha1', { owner: 'accountbravo001', name: 'Synthetic business acceptance' });
    save('workspaces', 'workspacebravo1', { owner: 'accountother001', name: 'Synthetic foreign workspace' });
    save('workspace_members', 'memberalice0001', { workspace: 'workspacealpha1', user: 'accountalice001', role: 'editor' });
    save('workspace_members', 'memberviewer001', { workspace: 'workspacealpha1', user: 'accountviewer01', role: 'viewer' });
}, () => {});
"""


class WorkspaceServer(NativeServer):
    """Install production public migrations with isolated synthetic auth and data."""

    def __init__(self, binary: str) -> None:
        self.directory = tempfile.TemporaryDirectory(
            prefix="buildanddo-workspace-native-"
        )
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process = None
        self.log = (self.root / "native.log").open("w")
        self.environment = {"PATH": os.environ.get("PATH", "")}
        try:
            hooks = self.root / "hooks"
            hooks.mkdir()
            for name in (
                "mission-policy.js",
                "missions.pb.js",
                "workflow-policy.js",
                "workflow-runs.js",
                "workflows.pb.js",
                "evidence-policy.js",
                "evidence.pb.js",
                "business-policy.js",
                "business.pb.js",
                "workspace-access.js",
                "workspace-record-policy.js",
                "workspace-administration.js",
                "workspace-community.js",
                "administration.pb.js",
                "mission-research.js",
                "research-policy.js",
                "research.pb.js",
                "operator.pb.js",
                "workspace-operator.js",
            ):
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            migrations = self.root / "migrations"
            migrations.mkdir()
            (migrations / "1_auth.js").write_text(AUTH)
            for name in MIGRATIONS:
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations" / (name + ".js"),
                    migrations / (name + ".js"),
                )
            (migrations / "data").mkdir()
            shutil.copyfile(
                ROOT / "apps/pocketbase/pb_migrations/data/starter-tutorials.json",
                migrations / "data/starter-tutorials.json",
            )
            (migrations / "1999999000_seed.js").write_text(SEED)
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                self.port = reservation.getsockname()[1]
            self.base = f"http://127.0.0.1:{self.port}"
            self.migrate()
            self.start()
        except BaseException:
            self.close()
            raise

    def migrate(self) -> None:
        """Apply only the fixture's copied public migrations."""
        result = subprocess.run(
            [self.binary, "migrate", "up", *self.paths()],
            cwd=self.root,
            env=self.environment,
            stdout=self.log,
            stderr=subprocess.STDOUT,
            timeout=45,
            check=False,
        )
        if result.returncode:
            raise AssertionError(
                "The disposable workspace migration failed; native acceptance did not pass."
            )


@unittest.skipUnless(
    BINARY and Path(BINARY).is_file(),
    "Native PocketBase unavailable; the connected workspace journey is unmeasured.",
)
class NativeWorkspaceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = WorkspaceServer(BINARY)
        self.addCleanup(self.server.close)
        self.alice, self.bravo, self.other, self.viewer = (
            self.server.login(name) for name in ("alice", "bravo", "other", "viewer")
        )

    def record(
        self,
        collection: str,
        values: dict[str, Any],
        *,
        token: str | None = None,
        workspace: str = WORKSPACE,
        owner: str = ALICE,
    ) -> dict[str, Any]:
        """Create one actual record through native authentication and request hooks."""
        status, data = self.server.request(
            "POST",
            f"/api/collections/{collection}/records",
            {"workspace": workspace, "owner": owner, **values},
            token or self.alice,
        )
        self.assertEqual(
            status, 200, f"Native {collection} create failed with status {status}."
        )
        return data

    def signal(self) -> dict[str, Any]:
        """Save an explicitly synthetic business observation."""
        return self.record(
            "signals",
            {
                "title": "Missing appointment outcome",
                "description": "A synthetic local record lacks evidence.",
                "type": "user",
                "source": "Disposable acceptance fixture",
                "severity": "medium",
                "state": "new",
            },
        )

    def propose(
        self,
        signal: dict[str, Any],
        token: str | None = None,
        key: str = "native_signal_proposal_0001",
    ) -> tuple[int, dict[str, Any]]:
        """Use the same reviewed signal command as the browser."""
        return self.server.request(
            "POST",
            f"/api/buildanddo/workspaces/{WORKSPACE}/research",
            {
                "action": "signal.propose",
                "revision": 0,
                "request_key": key,
                "payload": {
                    "signal": signal["id"],
                    "signal_updated": signal["updated"],
                },
            },
            self.alice if token is None else token,
        )

    def patch(
        self,
        collection: str,
        identity: str,
        values: dict[str, Any],
        token: str | None = None,
    ) -> tuple[int, dict[str, Any]]:
        """Apply a native user request, never a direct database update."""
        return self.server.request(
            "PATCH",
            f"/api/collections/{collection}/records/{identity}",
            values,
            token or self.alice,
        )

    def test_signal_workflow_independent_review_and_operator_readback(self) -> None:
        signal = self.signal()
        status, proposal = self.propose(signal)
        self.assertEqual(status, 200)
        mission = proposal["id"]
        fields = (
            "purpose",
            "beneficiary",
            "in_scope",
            "out_of_scope",
            "baseline",
            "target",
            "authorization",
            "input_validation",
            "data_handling",
            "rollback",
            "test",
            "evaluate",
            "verify",
            "validate",
        )
        plan = {
            "version": 1,
            "risk": "A1",
            "independent_review": True,
            **{key: "Observe the disposable fixture " + key for key in fields},
        }
        self.assertEqual(
            self.patch("missions", mission, {"mission_plan": plan})[0], 200
        )
        self.assertEqual(
            self.patch("missions", mission, {"status": "approved"}, self.bravo)[0], 200
        )
        self.assertEqual(self.patch("missions", mission, {"status": "running"})[0], 200)
        workflow = self.record(
            "workflows",
            {
                "name": "Review the synthetic appointment",
                "description": "Record local fixture checks.",
                "status": "active",
                "steps": [
                    {
                        "id": "read",
                        "name": "Read the record",
                        "kind": "read",
                        "detail": "Local fixture only",
                    },
                    {
                        "id": "record",
                        "name": "Record the observed result",
                        "kind": "record",
                        "detail": "Local fixture only",
                    },
                ],
            },
        )
        start = {
            "workspace": WORKSPACE,
            "workflow": workflow["id"],
            "mission": mission,
            "request_key": "native_workflow_start_0001",
        }
        status, response = self.server.request(
            "POST", "/api/buildanddo/workflow-runs", start, self.alice
        )
        self.assertEqual(status, 201)
        run = response["record"]
        for index, step in enumerate(("read", "record")):
            decision = {
                "workspace": WORKSPACE,
                "request_key": f"native_step_decision_{index:04}",
                "revision": run["revision"],
                "action": "step",
                "step_id": step,
                "outcome": "passed",
                "observation": "The synthetic fixture observation was inspected.",
                "source": "Disposable native fixture",
            }
            path = f"/api/buildanddo/workflow-runs/{run['id']}/decisions"
            status, result = self.server.request("POST", path, decision, self.alice)
            self.assertEqual(status, 200)
            run = result["record"]
            status, replay = self.server.request("POST", path, decision, self.alice)
            self.assertEqual(status, 200)
            self.assertTrue(replay["replayed"])
            self.assertEqual(len(replay["record"]["events"]), index + 1)
        self.assertEqual(run["status"], "completed")
        evidence = run["events"][-1]["evidence"]
        review = {
            "reflection": "A separate fixture account reviewed the synthetic outcome.",
            **{
                key: {
                    "outcome": "pass",
                    "observation": "Observed a disposable acceptance result.",
                    "evidence": evidence,
                }
                for key in ("test", "evaluate", "verify", "validate")
            },
        }
        self.assertEqual(
            self.patch(
                "missions", mission, {"status": "verified", "mission_review": review}
            )[0],
            400,
        )
        status, verified = self.patch(
            "missions",
            mission,
            {"status": "verified", "mission_review": review},
            self.bravo,
        )
        self.assertEqual(status, 200)
        self.assertEqual(verified["mission_reviewed_by"], BRAVO)
        self.assertEqual(self.patch("missions", mission, {"status": "running"})[0], 400)
        status, cockpit = self.server.request(
            "GET", f"/api/buildanddo/workspaces/{WORKSPACE}/operator", token=self.bravo
        )
        self.assertEqual(status, 200)
        item = next(
            row
            for row in cockpit["sources"]["missions"]["items"]
            if row["id"] == mission
        )
        self.assertEqual(item["status"], "verified")
        self.assertTrue(
            any(
                row["id"] == evidence for row in cockpit["sources"]["evidence"]["items"]
            )
        )
        self.server.stop()
        self.server.migrate()
        self.server.start()
        self.alice = self.server.login("alice")
        status, recovered = self.propose(signal)
        self.assertEqual(status, 200)
        self.assertEqual(recovered["id"], mission)
        self.assertTrue(recovered["replayed"])

    def test_source_auth_revocation_staleness_and_foreign_denial(self) -> None:
        signal = self.signal()
        for token in ("", self.viewer, self.other):
            self.assertIn(self.propose(signal, token)[0], (401, 403, 404))
        self.assertEqual(
            self.propose({**signal, "updated": "2020-01-01 00:00:00.000Z"})[0], 409
        )
        status, first = self.propose(signal)
        self.assertEqual(status, 200)
        self.assertIn(
            self.server.request(
                "GET",
                f"/api/collections/evidence/records/{first['evidence']}",
                token=self.other,
            )[0],
            (403, 404),
        )
        body = {
            "action": "member.remove",
            "revision": 0,
            "request_key": "native_member_revoke_001",
            "payload": {"user": ALICE},
        }
        status, _ = self.server.request(
            "POST", f"/api/buildanddo/workspaces/{WORKSPACE}/admin", body, self.bravo
        )
        self.assertEqual(status, 200)
        self.assertIn(self.propose(signal)[0], (403, 404))

    def test_erp_links_edition_persistence_and_cross_workspace_rejection(self) -> None:
        objective = self.record(
            "erp_objectives",
            {
                "title": "Reduce missing evidence",
                "status": "active",
                "success_metric": "Every fixture task has a receipt.",
            },
        )
        contact = self.record(
            "erp_contacts",
            {"name": "Synthetic operator", "email": "operator@fixture.invalid"},
        )
        task = self.record(
            "erp_tasks",
            {
                "title": "Review appointment evidence",
                "status": "todo",
                "priority": "normal",
                "objective": objective["id"],
                "contact": contact["id"],
            },
        )
        self.assertEqual(
            self.patch("erp_tasks", task["id"], {"status": "done"})[0], 200
        )
        foreign = self.record(
            "erp_contacts",
            {"name": "Foreign fixture contact"},
            token=self.other,
            workspace="workspacebravo1",
            owner=OTHER,
        )
        self.assertIn(
            self.patch("erp_tasks", task["id"], {"contact": foreign["id"]})[0],
            (400, 403),
        )
        self.assertIn(
            self.patch("erp_tasks", task["id"], {"status": "todo"}, self.viewer)[0],
            (403, 404),
        )
        edition = self.record(
            "daily_editions",
            {
                "title": "Synthetic acceptance edition",
                "summary": "Observed local task completion.",
                "body": "The fixture task was reviewed.",
                "status": "draft",
            },
        )
        status, saved = self.server.request(
            "GET",
            f"/api/collections/daily_editions/records/{edition['id']}",
            token=self.bravo,
        )
        self.assertEqual(status, 200)
        self.assertEqual(saved["summary"], edition["summary"])


if __name__ == "__main__":
    required = "--require-binary" in sys.argv
    if required:
        sys.argv.remove("--require-binary")
    if required and not (BINARY and Path(BINARY).is_file()):
        raise SystemExit(
            "FAIL: install the declared PocketBase test binary; native workspace acceptance did not run."
        )
    unittest.main(verbosity=2)
