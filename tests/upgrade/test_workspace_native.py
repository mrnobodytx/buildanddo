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
# Depends:     tests/upgrade/test_classroom_native.py, apps/pocketbase/pb_hooks/mission-research.js, apps/pocketbase/pb_hooks/mission-policy.js, apps/pocketbase/pb_hooks/workflow-runs.js, apps/pocketbase/pb_hooks/workspace-replay.js, apps/pocketbase/pb_hooks/workspace-value.js, apps/pocketbase/pb_migrations/1791300001_assistant_turn_usage.js
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_classroom_native.py; VALIDATES apps/pocketbase/pb_hooks/mission-research.js; VALIDATES apps/pocketbase/pb_hooks/mission-policy.js; VALIDATES apps/pocketbase/pb_hooks/workflow-runs.js; VALIDATES apps/pocketbase/pb_hooks/business-policy.js; VALIDATES apps/pocketbase/pb_hooks/workspace-operator.js; VALIDATES apps/pocketbase/pb_hooks/workspace-replay.js; VALIDATES apps/pocketbase/pb_hooks/workspace-value.js; VALIDATES apps/pocketbase/pb_migrations/1791300001_assistant_turn_usage.js
# Intent:      Require real auth, production migrations and a connected signal-to-independent-review journey before declaring workspace acceptance.
# ───────────────────────────────────────────────────────────────

"""Exercise the public workspace on a disposable native backend, without providers."""

from __future__ import annotations

import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import shutil
import socket
import sys
import tempfile
from typing import Any
import unittest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from tests.upgrade.test_classroom_native import DiagnosticNativeServer  # noqa: E402

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
    "1790700000_workspace_onboarding",
    "1790800000_business_execution",
    "1790900000_workspace_assistant",
    "1791100000_objective_onboarding",
    "1791300001_assistant_turn_usage",
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
        try { app.findRecordById(name, id); return; }
        catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
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


class WorkspaceServer(DiagnosticNativeServer):
    """Install production public migrations with isolated synthetic auth and data."""

    def __init__(self, binary: str) -> None:
        self.directory = tempfile.TemporaryDirectory(
            prefix="buildanddo-workspace-native-"
        )
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process = None
        self.log = tempfile.TemporaryFile(mode="w+b")
        self.environment = {"PATH": os.environ.get("PATH", "")}
        try:
            hooks = self.root / "hooks"
            hooks.mkdir()
            for name in (
                "workspace-onboarding.js",
                "business-action-policy.js",
                "business-actions.js",
                "business-execution.pb.js",
                "workspace-replay.js",
                "assistant-policy.js",
                "workspace-assistant.js",
                "assistant.pb.js",
                "knowledge-graph.js",
                "workspace-knowledge.js",
                "mission-policy.js",
                "missions.pb.js",
                "workflow-policy.js",
                "workflow-runs.js",
                "workflows.pb.js",
                "evidence-policy.js",
                "evidence.pb.js",
                "business-policy.js",
                "tutorial-learning.js",
                "business.pb.js",
                "workspace-access.js",
                "government-access.js",
                "workspace-record-policy.js",
                "workspace-administration.js",
                "workspace-community.js",
                "administration.pb.js",
                "mission-research.js",
                "research-policy.js",
                "research.pb.js",
                "operator.pb.js",
                "workspace-operator.js",
                "workspace-value.js",
            ):
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            migrations = self.root / "migrations"
            migrations.mkdir()
            (migrations / "0000000001_auth.js").write_text(AUTH)
            for name in MIGRATIONS:
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations" / (name + ".js"),
                    migrations / (name + ".js"),
                )
            data_dir = self.root / "pb_migrations" / "data"
            data_dir.mkdir(parents=True)
            shutil.copyfile(
                ROOT / "apps/pocketbase/pb_migrations/data/starter-tutorials.json",
                data_dir / "starter-tutorials.json",
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
        for version in (None, 0, 2, "1", True):
            self.assertEqual(
                self.patch(
                    "missions",
                    mission,
                    {"status": "verified", "mission_review": {**review, "version": version}},
                    self.bravo,
                )[0],
                400,
            )
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
        self.assertEqual(verified["mission_review"]["version"], 1)
        self.assertEqual(
            verified["mission_review"]["evidence_snapshot"][0]["id"], evidence
        )
        self.assertEqual(
            self.patch(
                "evidence", evidence, {"content": "Rewrite the reviewed observation"}
            )[0],
            400,
        )
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
        self.assertEqual(item["value"]["state"], "VERIFIED")
        self.assertTrue(item["value"]["independent"])
        self.assertEqual(item["value"]["reviewer"], BRAVO)
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

    def test_review_utf8_boundary_after_snapshot_enrichment(self) -> None:
        fields = (
            "purpose", "beneficiary", "in_scope", "out_of_scope", "baseline", "target",
            "authorization", "input_validation", "data_handling", "rollback",
            "test", "evaluate", "verify", "validate",
        )
        tevv = ("test", "evaluate", "verify", "validate")
        snapshot_fields = (
            "id", "workspace", "mission", "owner", "type", "title", "source", "content",
            "url", "created", "updated",
        )
        plan = {"version": 1, "risk": "A1", "independent_review": True,
                **{key: "Observe the disposable fixture " + key for key in fields}}

        def size(value: dict[str, Any]) -> int:
            return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

        for token in ("\u6f22", "\U0001f680"):
            with self.subTest(token=ascii(token)):
                mission = self.record("missions", {"title": "Synthetic byte boundary",
                    "status": "proposed", "priority": "normal", "mission_plan": plan})["id"]
                self.assertEqual(self.patch("missions", mission, {"status": "approved"}, self.bravo)[0], 200)
                self.assertEqual(self.patch("missions", mission, {"status": "running"})[0], 200)
                evidence = [self.record("evidence", {"mission": mission, "type": "observed",
                    "source": "Disposable native byte fixture", "content": "Pending local observation"})
                    for _ in tevv]
                review = {"reflection": "\u6f22" * 1050, **{
                    key: {"outcome": "pass", "observation": "\u6f22" * 1050, "evidence": row["id"]}
                    for key, row in zip(tevv, evidence)
                }}
                code, draft = self.patch("missions", mission, {"mission_review": review}, self.bravo)
                self.assertEqual(code, 200)
                self.assertEqual(draft["mission_review"]["version"], 1)
                self.assertLess(size(draft["mission_review"]), 24000)
                for target in (24564, 24001, 24000):
                    snapshots = [{key: row.get(key, "") for key in snapshot_fields} for row in evidence]
                    for row in snapshots:
                        row["content"] = ""
                    expected = {**draft["mission_review"], "evidence_snapshot": snapshots}
                    remaining = target - size(expected)
                    width = len(token.encode("utf-8"))
                    for index, row in enumerate(evidence):
                        share = remaining // (len(evidence) - index)
                        content = token * (share // width) + "x" * (share % width)
                        self.assertLessEqual(len(content), 2000)
                        code, updated = self.patch("evidence", row["id"], {"content": content})
                        self.assertEqual(code, 200)
                        evidence[index] = updated
                        snapshots[index] = {key: updated.get(key, "") for key in snapshot_fields}
                        remaining -= share
                    self.assertEqual(size(expected), target)
                    code, result = self.patch("missions", mission, {"status": "verified"}, self.bravo)
                    if target > 24000:
                        self.assertEqual(code, 400)
                        self.assertIn("24,000", result["message"])
                        code, retained = self.server.request(
                            "GET", f"/api/collections/missions/records/{mission}", token=self.bravo)
                        self.assertEqual(code, 200)
                        self.assertEqual(retained["status"], "running")
                        self.assertEqual(retained["mission_review"], draft["mission_review"])
                        self.assertEqual(retained["mission_reviewed_at"], draft["mission_reviewed_at"])
                    else:
                        self.assertEqual(code, 200)
                        self.assertEqual(result["mission_review"], expected)
                        self.assertEqual(size(result["mission_review"]), 24000)
                        code, unchanged = self.patch("missions", mission, {"mission_learning": {"scope": "measured"}})
                        self.assertEqual(code, 200)
                        self.assertEqual(unchanged["mission_review"], expected)
                        self.assertEqual(unchanged["mission_reviewed_at"], result["mission_reviewed_at"])
                        code, cockpit = self.server.request(
                            "GET", f"/api/buildanddo/workspaces/{WORKSPACE}/operator", token=self.bravo)
                        self.assertEqual(code, 200)
                        item = next(row for row in cockpit["sources"]["missions"]["items"] if row["id"] == mission)
                        self.assertEqual(item["value"]["state"], "VERIFIED")
                        self.assertTrue(item["value"]["independent"])

    def test_atomic_onboarding_concurrent_retries_and_restart(self) -> None:
        body = {
            "name": "Native learning workspace",
            "domain": "",
            "intent": "build",
            "objective": "Deploy my first website",
            "business_context": "",
        }

        def create() -> tuple[int, dict[str, Any]]:
            return self.server.request(
                "POST", "/api/buildanddo/onboarding", body, self.alice
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: create(), range(2)))
        self.assertEqual([result[0] for result in results], [200, 200])
        self.assertEqual(results[0][1]["workspace"], results[1][1]["workspace"])
        self.assertEqual(len(set(results[0][1]["services"])), 7)
        identity = results[0][1]["workspace"]
        objective = results[0][1]["objective"]
        self.assertEqual(objective, results[1][1]["objective"])
        status, workspace = self.server.request(
            "GET",
            f"/api/collections/workspaces/records/{identity}?expand=onboarding_objective",
            token=self.alice,
        )
        self.assertEqual(status, 200)
        self.assertEqual(workspace["onboarding_intent"], "build")
        self.assertEqual(workspace["domain"], "")
        self.assertEqual(
            workspace["expand"]["onboarding_objective"]["title"], body["objective"]
        )
        self.assertEqual(
            workspace["expand"]["onboarding_objective"]["workspace"], identity
        )
        self.assertIn(
            self.server.request(
                "GET",
                f"/api/collections/erp_objectives/records/{objective}",
                token=self.other,
            )[0],
            (403, 404),
        )
        self.server.stop()
        self.server.migrate()
        self.server.start()
        self.alice = self.server.login("alice")
        self.assertEqual(create()[1]["workspace"], identity)
        self.assertEqual(create()[1]["objective"], objective)
        legacy = {"name": "Legacy workspace", "domain": "legacy.fixture"}
        first = self.server.request(
            "POST", "/api/buildanddo/onboarding", legacy, self.alice
        )
        again = self.server.request(
            "POST", "/api/buildanddo/onboarding", legacy, self.alice
        )
        self.assertEqual(first[0], 200)
        self.assertEqual(first[1]["workspace"], again[1]["workspace"])
        self.assertNotIn("objective", first[1])
        self.assertIn(
            self.server.request("POST", "/api/buildanddo/onboarding", body)[0],
            (401, 403),
        )

    def test_business_execution_atomic_erp_receipt_and_independent_review(self) -> None:
        _, proposal = self.propose(self.signal())
        mission = proposal["id"]
        keys = (
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
            **{key: "Inspect synthetic native " + key for key in keys},
        }
        self.assertEqual(
            self.patch("missions", mission, {"mission_plan": plan})[0], 200
        )
        self.assertEqual(
            self.patch("missions", mission, {"status": "approved"}, self.bravo)[0], 200
        )
        self.assertEqual(self.patch("missions", mission, {"status": "running"})[0], 200)
        action = {
            "provider": "erp",
            "binding": "",
            "max_seconds": 5,
            "parameters": {
                "title": "Native bounded task",
                "description": "Synthetic only",
                "objective": "",
                "contact": "",
                "priority": "normal",
                "due_date": "",
            },
        }
        workflow = self.record(
            "workflows",
            {
                "name": "Native business action",
                "status": "active",
                "steps": [
                    {
                        "id": "review",
                        "name": "Review frozen input",
                        "kind": "approval",
                        "detail": "",
                    },
                    {
                        "id": "execute",
                        "name": "Create task",
                        "kind": "execute",
                        "detail": "",
                        "action": action,
                    },
                ],
            },
        )
        code, started = self.server.request(
            "POST",
            "/api/buildanddo/workflow-runs",
            {
                "workspace": WORKSPACE,
                "workflow": workflow["id"],
                "mission": mission,
                "request_key": "native_business_start_001",
            },
            self.alice,
        )
        self.assertEqual(code, 201)
        run = started["record"]
        code, approved = self.server.request(
            "POST",
            f"/api/buildanddo/workflow-runs/{run['id']}/decisions",
            {
                "workspace": WORKSPACE,
                "revision": run["revision"],
                "request_key": "native_business_review_001",
                "action": "step",
                "step_id": "review",
                "outcome": "approved",
                "observation": "Reviewed synthetic task inputs and mission scope",
                "source": "",
            },
            self.bravo,
        )
        self.assertEqual(code, 200)
        command = {
            "action": "action.enqueue",
            "revision": approved["record"]["revision"],
            "request_key": "native_business_effect_001",
            "payload": {"run": run["id"], "step_id": "execute"},
        }
        endpoint = f"/api/buildanddo/workspaces/{WORKSPACE}/business"
        code, receipt = self.server.request("POST", endpoint, command, self.alice)
        self.assertEqual(code, 200)
        self.assertEqual(receipt["status"], "succeeded")
        self.assertEqual(
            self.server.request("POST", endpoint, command, self.alice)[1]["id"],
            receipt["id"],
        )
        task = receipt["result"]["reported"]["output"]["task"]
        code, saved = self.server.request(
            "GET", f"/api/collections/erp_tasks/records/{task}", token=self.alice
        )
        self.assertEqual(code, 200)
        self.assertEqual(saved["execution"], receipt["id"])
        self.assertEqual(saved["mission"], mission)
        self.assertEqual(saved["evidence"], receipt["evidence"])
        self.assertEqual(
            self.patch(
                "evidence",
                receipt["evidence"],
                {"content": "Alter retained observation"},
            )[0],
            400,
        )
        review = {
            "version": 1,
            "reflection": "Independent native review",
            **{
                key: {
                    "outcome": "pass",
                    "observation": "Observed native task and receipt",
                    "evidence": receipt["evidence"],
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
        code, verified = self.patch(
            "missions",
            mission,
            {"status": "verified", "mission_review": review},
            self.bravo,
        )
        self.assertEqual(code, 200)
        self.assertEqual(
            verified["mission_review"]["evidence_snapshot"][0]["id"],
            receipt["evidence"],
        )
        capture_url = f"/api/buildanddo/workspaces/{WORKSPACE}/mission-replay/{mission}"
        code, capture = self.server.request("GET", capture_url, token=self.bravo)
        self.assertEqual(code, 200)
        self.assertTrue(capture["capture_complete"])
        self.assertEqual(capture["integrity"], "consistent")
        self.assertEqual(capture["captured_by"], BRAVO)
        self.assertEqual(capture["evidence_state"], "recorded")
        self.assertEqual(capture["content"]["mission"]["mission_review"], verified["mission_review"])
        self.assertEqual(capture["content"]["mission"]["mission_review"]["version"], 1)
        self.assertEqual(capture["content"]["jobs"][0]["id"], receipt["id"])
        self.assertEqual(capture["content"]["tasks"][0]["id"], task)
        self.assertEqual(capture["content"]["runs"][0]["status"], "completed")
        self.assertNotIn("lease_id", capture["content"]["jobs"][0])
        canonical = json.dumps(
            capture["content"],
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode()
        self.assertEqual(
            hashlib.sha256(canonical).hexdigest(), capture["content_sha256"]
        )
        for leaf in capture["leaves"]:
            rows = (
                [capture["content"]["mission"]]
                if leaf["kind"] == "mission"
                else capture["content"][leaf["kind"]]
            )
            row = next(row for row in rows if row["id"] == leaf["id"])
            encoded = json.dumps(
                row, sort_keys=True, ensure_ascii=False, separators=(",", ":")
            ).encode()
            self.assertEqual(hashlib.sha256(encoded).hexdigest(), leaf["sha256"])
        self.assertEqual(
            self.server.request("GET", capture_url, token=self.viewer)[0], 200
        )
        self.assertIn(
            self.server.request("GET", capture_url, token=self.other)[0], (403, 404)
        )
        self.assertIn(
            self.server.request("GET", endpoint, token=self.other)[0], (403, 404)
        )
        self.assertIn(
            self.server.request(
                "GET", "/api/collections/business_jobs/records", token=self.alice
            )[0],
            (403, 404),
        )

    def test_assistant_isolates_personal_history_and_reports_unconfigured_inference(
        self,
    ) -> None:
        schema = self.server.collection("assistant_turns")
        fields = {field["name"]: field for field in schema["fields"]}
        self.assertIn(
            "usage", fields, "The usage migration must actually be installed."
        )
        self.assertEqual(fields["usage"]["type"], "json")
        self.assertEqual(fields["usage"]["maxSize"], 2000)
        self.assertFalse(fields["usage"]["required"])
        endpoint = f"/api/buildanddo/workspaces/{WORKSPACE}/assistant"
        code, session = self.server.request(
            "POST",
            endpoint,
            {
                "action": "session.start",
                "request_key": "native_assistant_start_001",
                "payload": {"title": "Personal native fixture session"},
            },
            self.alice,
        )
        self.assertEqual(code, 200)
        code, turn = self.server.request(
            "POST",
            endpoint + "/chat",
            {
                "session": session["id"],
                "request_key": "native_assistant_chat_001",
                "message": "Help me navigate to ERP",
                "surface": {
                    "id": "native-surface",
                    "route": "/app/erp",
                    "controls": [],
                },
            },
            self.alice,
        )
        self.assertEqual(code, 200)
        self.assertEqual(turn["status"], "unavailable")
        self.assertIsNone(turn["plan"])
        saved_turn = next(
            row
            for row in self.server.stored("assistant_turns")
            if row["id"] == turn["id"]
        )
        self.assertIn("usage", saved_turn)
        self.assertIn(saved_turn["usage"], (None, "null"))
        self.assertEqual(saved_turn["owner"], ALICE)
        self.assertEqual(saved_turn["workspace"], WORKSPACE)
        self.assertEqual(saved_turn["session"], session["id"])
        for token in (self.bravo, self.viewer, self.other):
            self.assertIn(
                self.server.request(
                    "GET", endpoint + "?session=" + session["id"], token=token
                )[0],
                (403, 404),
            )
        self.assertIn(
            self.server.request(
                "GET", "/api/collections/assistant_turns/records", token=self.alice
            )[0],
            (403, 404),
        )
        self.server.stop()
        self.server.start()
        self.alice = self.server.login("alice")
        code, recovered = self.server.request(
            "GET", endpoint + "?session=" + session["id"], token=self.alice
        )
        self.assertEqual(code, 200)
        self.assertEqual(recovered["turns"]["items"][0]["id"], turn["id"])
        code, _ = self.server.request(
            "POST",
            endpoint,
            {
                "action": "session.forget",
                "request_key": "native_assistant_forget_001",
                "payload": {"session": session["id"]},
            },
            self.alice,
        )
        self.assertEqual(code, 200)
        self.assertEqual(
            self.server.request(
                "GET", endpoint + "?session=" + session["id"], token=self.alice
            )[0],
            404,
        )

    def test_assistant_usage_down_up_preserves_history_and_locked_rules(self) -> None:
        endpoint = f"/api/buildanddo/workspaces/{WORKSPACE}/assistant"
        code, session = self.server.request(
            "POST",
            endpoint,
            {
                "action": "session.start",
                "request_key": "native_usage_session_001",
                "payload": {"title": "Usage compatibility; no provider"},
            },
            self.alice,
        )
        self.assertEqual(code, 200)
        body = {
            "session": session["id"],
            "request_key": "native_usage_absent_001",
            "message": "No provider is configured.",
            "surface": {"id": "usage-fixture", "route": "/app/erp", "controls": []},
        }
        self.server.stop()
        # The final seed is idempotent; the preceding migration is the usage field.
        self.server.migrate("down", "2")
        self.assertNotIn(
            "usage",
            {
                field["name"]
                for field in self.server.collection("assistant_turns")["fields"]
            },
        )
        self.server.start()
        code, absent = self.server.request("POST", endpoint + "/chat", body, self.alice)
        self.assertEqual(code, 200)
        self.assertEqual(absent["status"], "unavailable")
        self.assertIsNone(absent["plan"])
        self.assertNotIn("usage", self.server.stored("assistant_turns")[0])
        self.server.stop()
        self.server.migrate()
        self.server.migrate()
        self.server.start()
        fields = {
            field["name"]
            for field in self.server.collection("assistant_turns")["fields"]
        }
        self.assertIn("usage", fields)
        code, present = self.server.request(
            "POST",
            endpoint + "/chat",
            {
                **body,
                "request_key": "native_usage_present_001",
            },
            self.alice,
        )
        self.assertEqual(code, 200)
        self.assertEqual(present["status"], "unavailable")
        rows = self.server.stored("assistant_turns")
        self.assertEqual({row["id"] for row in rows}, {absent["id"], present["id"]})
        self.assertTrue(
            all("usage" in row and row["usage"] in (None, "null") for row in rows)
        )
        for collection, identity in (
            ("assistant_turns", present["id"]),
            ("assistant_sessions", session["id"]),
        ):
            installed = self.server.collection(collection)
            for rule in (
                "listRule",
                "viewRule",
                "createRule",
                "updateRule",
                "deleteRule",
            ):
                self.assertIsNone(installed[rule])
            for method, suffix, payload in (
                ("GET", "", None),
                ("POST", "", {"owner": ALICE}),
                ("PATCH", "/" + identity, {"usage": {"input_tokens": 42}}),
                ("DELETE", "/" + identity, None),
            ):
                with self.subTest(collection=collection, method=method):
                    self.assertIn(
                        self.server.request(
                            method,
                            f"/api/collections/{collection}/records" + suffix,
                            payload,
                            self.alice,
                        )[0],
                        (403, 404),
                    )
        self.assertEqual(
            {row["id"] for row in self.server.stored("assistant_turns")},
            {absent["id"], present["id"]},
        )

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
