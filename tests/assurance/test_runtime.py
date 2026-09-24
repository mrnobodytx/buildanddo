# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/assurance/test_runtime.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     tests/assurance/runtime.py, tests/upgrade/test_workspace_native.py
# EnumType:    Test
# EnumEdges:   CONSUMES tests/assurance/runtime.py; CONSUMES tests/upgrade/test_workspace_native.py
# Intent:      Measure concurrency and recovery against native auth, actual checkpoints and independent mission review in disposable databases.
# ───────────────────────────────────────────────────────────────

"""Run required native checks; absence of the runtime is an error, never a passing skip."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
from statistics import median
import time
from typing import Any
import unittest

from tests.assurance.runtime import AssuranceServer
from tests.upgrade import test_workspace_native as workspace_native
from tests.upgrade.test_workspace_native import (
    WORKSPACE,
    ALICE,
    BRAVO,
)


def native_mission_journey(server: AssuranceServer) -> dict[str, Any]:
    """Reuse the existing real signal, workflow, evidence, independent review and reflection acceptance."""
    case = workspace_native.NativeWorkspaceTests(
        "test_signal_workflow_independent_review_and_operator_readback"
    )
    case.server = server
    case.alice, case.bravo, case.other, case.viewer = (
        server.login(name) for name in ("alice", "bravo", "other", "viewer")
    )
    case.test_signal_workflow_independent_review_and_operator_readback()
    records = server.call("GET", "/api/collections/missions/records?perPage=100")[
        "items"
    ]
    return next(row for row in records if row["status"] == "verified")


def prepare_learning(
    server: AssuranceServer, actor: str = "alice"
) -> tuple[str, dict[str, Any]]:
    """Complete the real ordered lesson and practice, leaving final grading for the test."""
    lesson = server.lesson(actor=actor)
    path = f"/api/buildanddo/learning/{lesson['id']}"
    data = server.call("GET", path, actor=actor)
    digest = data["tutorial"]["content_digest"]

    def command(action: str, payload: dict[str, object]) -> dict[str, Any]:
        return server.call(
            "POST",
            path,
            {"action": action, "content_digest": digest, "payload": payload},
            actor=actor,
        )

    command("start", {})
    for index in range(len(data["tutorial"]["lesson"]["sections"])):
        command("section", {"index": index})
    command(
        "practice",
        {"checks": [True] * len(data["tutorial"]["lesson"]["exercise"]["checklist"])},
    )
    return path, {
        "action": "answer",
        "content_digest": digest,
        "payload": {"choice": data["tutorial"]["lesson"]["check"]["answer"]},
    }


def classroom(server: AssuranceServer) -> tuple[str, str]:
    """Start a real shared lesson with a separate host and learner."""
    path = f"/api/buildanddo/workspaces/{WORKSPACE}/classrooms"
    created = server.call(
        "POST",
        path,
        {
            "action": "room.create",
            "revision": 0,
            "request_key": "assurance_class_create_001",
            "payload": {
                "title": "Assurance shared lesson",
                "description": "Disposable test class",
                "tutorial": server.lesson()["id"],
                "starts_at": "",
            },
        },
        actor="bravo",
    )
    server.call(
        "POST",
        path,
        {
            "action": "room.start",
            "revision": created["revision"],
            "request_key": "assurance_class_start_001",
            "payload": {"id": created["id"]},
        },
        actor="bravo",
    )
    return path, created["id"]


class NativeCase(unittest.TestCase):
    def setUp(self) -> None:
        binary = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
        if not binary or not Path(binary).is_file():
            raise RuntimeError(
                "BLOCKED: supply a PocketBase binary for disposable native assurance."
            )
        self.server = AssuranceServer(binary)
        self.addCleanup(self.server.close)


class SecurityTests(NativeCase):
    def test_raw_membership_paywall_and_foreign_workspace_are_not_bypassable(
        self,
    ) -> None:
        server = self.server
        path = f"/api/buildanddo/workspaces/{WORKSPACE}/government"
        self.assertEqual(server.request("GET", path)[0], 401)
        for name in ("viewer", "other"):
            self.assertEqual(
                server.request("GET", path, token=server.login(name))[0], 403
            )
        paid = server.call("GET", path)
        self.assertEqual(len(paid["lessons"]), 8)
        for name in ("alice", "bravo", "viewer"):
            token = server.login(name)
            self.assertIn(
                server.request(
                    "POST",
                    "/api/collections/government_memberships/records",
                    {"user": ALICE, "tier": "government", "status": "active"},
                    token,
                )[0],
                (401, 403, 404),
            )
            self.assertIn(
                server.request(
                    "GET",
                    "/api/collections/government_memberships/records",
                    token=token,
                )[0],
                (401, 403, 404),
            )
            raw = server.call(
                "GET", "/api/collections/tutorials/records?perPage=100", actor=name
            )
            self.assertFalse(
                any(row["category"] == "Government submissions" for row in raw["items"])
            )
        lesson = paid["lessons"][0]["id"]
        self.assertEqual(
            server.request(
                "GET",
                f"/api/buildanddo/learning/{lesson}",
                token=server.login("viewer"),
            )[0],
            403,
        )
        self.assertEqual(
            server.call("GET", f"/api/buildanddo/learning/{lesson}")["tutorial"]["id"],
            lesson,
        )

    def test_revocation_rechecks_saved_learning_and_owner_role(self) -> None:
        server = self.server
        path = f"/api/buildanddo/workspaces/{WORKSPACE}/government"
        lesson = server.call("GET", path)["lessons"][0]["id"]
        endpoint = f"/api/buildanddo/learning/{lesson}"
        data = server.call("GET", endpoint)
        command = {
            "action": "start",
            "payload": {},
            "content_digest": data["tutorial"]["content_digest"],
        }
        server.call("POST", endpoint, command)
        server.set_membership(ALICE, {"status": "revoked"})
        token = server.login("alice")
        self.assertEqual(server.request("GET", endpoint, token=token)[0], 403)
        self.assertEqual(server.request("POST", endpoint, command, token)[0], 403)
        server.set_membership(BRAVO, {"approved_by": ""})
        self.assertEqual(
            server.request("GET", path, token=server.login("bravo"))[0], 403
        )


class LoadTests(NativeCase):
    def test_concurrent_completions_award_one_certificate(self) -> None:
        path, command = prepare_learning(self.server)
        token = self.server.login("alice")
        with ThreadPoolExecutor(max_workers=8) as pool:
            responses = list(
                pool.map(
                    lambda _: self.server.request("POST", path, command, token),
                    range(16),
                )
            )
        self.assertTrue(all(code == 200 for code, _ in responses))
        certificates = {
            data["enrollment"]["certificate"]["id"] for _, data in responses
        }
        self.assertEqual(len(certificates), 1)
        growth = self.server.call("GET", "/api/buildanddo/learning")
        self.assertEqual((growth["completed"], growth["points"]), (1, 100))

    def test_concurrent_join_retries_preserve_one_presence(self) -> None:
        path, room = classroom(self.server)
        token = self.server.login("alice")
        command = {
            "action": "room.join",
            "revision": 2,
            "request_key": "assurance_duplicate_join_001",
            "payload": {"id": room},
        }
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(
                pool.map(
                    lambda _: self.server.request("POST", path, command, token),
                    range(16),
                )
            )
        self.assertTrue(all(code == 200 for code, _ in results))
        current = self.server.call("GET", f"{path}/{room}")
        self.assertTrue(current["membership"]["active"])
        self.assertEqual(len(current["participants"]), 2)

    def test_sustained_reads_and_presence_do_not_lose_checkpoints(self) -> None:
        path, room = classroom(self.server)
        self.server.call(
            "POST",
            path,
            {
                "action": "room.join",
                "revision": 2,
                "request_key": "assurance_soak_join_0001",
                "payload": {"id": room},
            },
        )
        learning, answer = prepare_learning(self.server)
        self.server.call("POST", learning, answer)
        token = self.server.login("alice")
        saved = self.server.call("GET", f"{path}/{room}")["membership"]
        seconds = float(os.environ.get("BUILDANDDO_ASSURANCE_SOAK_SECONDS", "60"))
        self.assertGreaterEqual(seconds, 10)
        self.assertLessEqual(seconds, 3600)
        budget = float(os.environ.get("BUILDANDDO_ASSURANCE_LATENCY_BUDGET_MS", "2000"))
        self.assertGreater(budget, 0)
        self.assertLessEqual(budget, 30000)
        durations = []
        until = time.monotonic() + seconds
        while time.monotonic() < until:
            started = time.monotonic()
            status, current = self.server.request("GET", f"{path}/{room}", token=token)
            self.assertEqual(status, 200)
            self.assertTrue(current["membership"]["active"])
            code, _ = self.server.request(
                "POST",
                f"{path}/{room}/presence",
                {"membership": saved["id"], "revision": saved["revision"]},
                token,
            )
            self.assertEqual(code, 200)
            durations.append((time.monotonic() - started) * 1000)
            time.sleep(0.1)
        p95 = sorted(durations)[int((len(durations) - 1) * 0.95)]
        print(
            json.dumps(
                {
                    "scope": "disposable fixture round-trip pairs",
                    "samples": len(durations),
                    "seconds": seconds,
                    "median_ms": median(durations),
                    "p95_ms": p95,
                    "budget_ms": budget,
                }
            )
        )
        self.assertLessEqual(p95, budget)
        self.assertEqual(
            self.server.call("GET", "/api/buildanddo/learning")["points"], 100
        )


class RecoveryTests(NativeCase):
    def test_backup_restores_reviewed_evidence_permissions_and_learning(self) -> None:
        mission = native_mission_journey(self.server)
        path, answer = prepare_learning(self.server)
        completion = self.server.call("POST", path, answer)
        before = self.server.call(
            "GET", f"/api/collections/missions/records/{mission['id']}"
        )
        manifest = self.server.backup()
        self.server.call(
            "POST",
            "/api/collections/signals/records",
            {
                "workspace": WORKSPACE,
                "owner": ALICE,
                "title": "After backup only",
                "type": "user",
                "source": "Fixture",
                "severity": "low",
                "state": "new",
            },
        )
        self.server.restore(manifest)
        self.assertEqual(
            self.server.call(
                "GET", f"/api/collections/missions/records/{mission['id']}"
            ),
            before,
        )
        self.assertEqual(
            self.server.call("GET", path)["enrollment"]["certificate"],
            completion["enrollment"]["certificate"],
        )
        self.assertFalse(
            any(
                row["title"] == "After backup only"
                for row in self.server.call(
                    "GET", "/api/collections/signals/records?perPage=100"
                )["items"]
            )
        )
        code, _ = self.server.request(
            "GET",
            f"/api/collections/missions/records/{mission['id']}",
            token=self.server.login("other"),
        )
        self.assertIn(code, (403, 404))
        self.assertEqual(
            self.server.request(
                "GET",
                f"/api/buildanddo/workspaces/{WORKSPACE}/government",
                token=self.server.login("viewer"),
            )[0],
            403,
        )

    def test_corrupt_backup_is_rejected_before_stopping_working_database(self) -> None:
        manifest = self.server.backup()
        (self.server.root / "backup/data.db").write_bytes(b"corrupt fixture backup")
        with self.assertRaisesRegex(ValueError, "changed"):
            self.server.restore(manifest)
        self.assertEqual(self.server.request("GET", "/api/health")[0], 200)
        self.assertFalse((self.server.root / "after-backup").exists())

    def test_backup_links_cannot_replace_unrelated_paths(self) -> None:
        manifest = self.server.backup()
        (self.server.root / "backup/link").symlink_to(self.server.root / "native.log")
        with self.assertRaisesRegex(ValueError, "symlinks"):
            self.server.restore(manifest)
        self.assertEqual(self.server.request("GET", "/api/health")[0], 200)


if __name__ == "__main__":
    unittest.main()
