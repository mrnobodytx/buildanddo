# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_tutorial_learning_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     tests/upgrade/test_dossier_native.py, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_dossier_native.py; VALIDATES apps/pocketbase/pb_hooks/tutorial-learning.js; VALIDATES apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js
# DAG Node:    none
# Intent:      Require real PocketBase auth, concurrent completion and migration retention before accepting installed interactive learning.
# ───────────────────────────────────────────────────────────────

"""Exercise learning on a disposable loopback PocketBase with synthetic accounts."""

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
from tests.upgrade.test_dossier_native import NativeServer  # noqa: E402

BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
MIGRATION = "1790600000_tutorial_learning.js"
SEED = r"""
migrate((app) => {
    let users;
    try { users = app.findCollectionByNameOrId('users'); }
    catch { users = new Collection({ name: 'users', type: 'auth' }); }
    users.authRule = ''; users.authAlert = { enabled: false };
    users.passwordAuth = { enabled: true, identityFields: ['email'] };
    if (!users.fields.getByName('name')) users.fields.add(new TextField({ name: 'name', max: 120 }));
    app.save(users);
    for (const [id, name] of [['accountalice001', 'alice'], ['accountbravo001', 'bravo']]) {
        const user = new Record(users); user.id = id; user.set('name', name);
        user.set('email', name + '@fixture.invalid'); user.set('verified', true);
        user.setPassword('local-fixture-password-only'); app.save(user);
    }
    const tutorials = new Collection({ name: 'tutorials', type: 'base',
        listRule: '@request.auth.id != ""', viewRule: '@request.auth.id != ""',
        createRule: null, updateRule: null, deleteRule: null,
        fields: [{ name: 'title', type: 'text' }, { name: 'summary', type: 'text' },
            { name: 'category', type: 'text' }, { name: 'effort_minutes', type: 'number' },
            { name: 'curriculum_version', type: 'text' }, { name: 'lesson', type: 'json', maxSize: 100000 }] });
    app.save(tutorials);
    const data = JSON.parse(__LESSON__);
    const lesson = new Record(tutorials); lesson.id = data.id;
    for (const key of ['title', 'summary', 'category', 'effort_minutes', 'curriculum_version', 'lesson']) lesson.set(key, data[key]);
    app.save(lesson);
    const progress = new Collection({ name: 'tutorial_progress', type: 'base',
        listRule: '@request.auth.id != "" && owner = @request.auth.id',
        viewRule: '@request.auth.id != "" && owner = @request.auth.id',
        createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
        updateRule: '@request.auth.id != "" && owner = @request.auth.id',
        deleteRule: '@request.auth.id != "" && owner = @request.auth.id',
        fields: [{ name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true },
            { name: 'tutorial', type: 'relation', collectionId: tutorials.id, maxSelect: 1, required: true },
            { name: 'status', type: 'select', values: ['not_started', 'in_progress', 'completed'], maxSelect: 1, required: true },
            { name: 'progress', type: 'number', min: 0, max: 100 },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }] });
    app.save(progress);
}, () => {});
"""


class LearningServer(NativeServer):
    """Use the existing native lifecycle with only the learning schema and hooks."""

    def __init__(self, binary: str) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="buildanddo-learning-")
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process = None
        self.log = (self.root / "native.log").open("w")
        self.environment = {"PATH": os.environ.get("PATH", "")}
        try:
            hooks = self.root / "hooks"
            hooks.mkdir()
            for name in (
                "tutorial-learning.pb.js",
                "tutorial-learning.js",
                "workspace-access.js",
                "workflow-policy.js",
            ):
                shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
            migrations = self.root / "migrations"
            migrations.mkdir()
            curriculum = json.loads(
                (
                    ROOT / "apps/pocketbase/pb_migrations/data/starter-tutorials.json"
                ).read_text()
            )
            self.lesson = {
                **curriculum["lessons"][0],
                "curriculum_version": curriculum["version"],
            }
            (migrations / "1_fixture.js").write_text(
                SEED.replace("__LESSON__", json.dumps(json.dumps(self.lesson)))
            )
            shutil.copyfile(
                ROOT / "apps/pocketbase/pb_migrations" / MIGRATION,
                migrations / MIGRATION,
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
        """Apply only this fixture's migrations, without exposing process logs."""
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
        )
        if result.returncode:
            raise AssertionError(
                "Isolated learning migration failed; native acceptance did not pass."
            )


@unittest.skipUnless(
    BINARY and Path(BINARY).is_file(),
    "Native PocketBase unavailable; learning runtime acceptance remains open.",
)
class NativeLearningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.server = LearningServer(BINARY)
        self.addCleanup(self.server.close)
        self.owner = self.server.login("alice")
        self.other = self.server.login("bravo")
        self.path = "/api/buildanddo/learning/" + self.server.lesson["id"]
        status, detail = self.server.request("GET", self.path, token=self.owner)
        self.assertEqual(status, 200)
        self.digest = detail["tutorial"]["content_digest"]

    def command(
        self, action: str, payload: dict[str, Any] | None = None
    ) -> tuple[int, dict[str, Any]]:
        """Submit a native, account-bound learning action."""
        return self.server.request(
            "POST",
            self.path,
            {"action": action, "payload": payload or {}, "content_digest": self.digest},
            token=self.owner,
        )

    def practice(self) -> None:
        """Complete the lesson checkpoints while preserving assertion failures."""
        self.assertEqual(self.command("start")[0], 200)
        for index in range(len(self.server.lesson["lesson"]["sections"])):
            self.assertEqual(self.command("section", {"index": index})[0], 200)
        checks = [True] * len(self.server.lesson["lesson"]["exercise"]["checklist"])
        self.assertEqual(self.command("practice", {"checks": checks})[0], 200)

    def test_checkpoints_and_certificate_survive_restart(self) -> None:
        self.assertEqual(self.command("start")[0], 200)
        self.assertEqual(self.command("section", {"index": 0})[0], 200)
        self.server.stop()
        self.server.start()
        self.owner = self.server.login("alice")
        self.assertEqual(
            self.server.request("GET", self.path, token=self.owner)[1]["enrollment"][
                "next_section"
            ],
            1,
        )
        self.practice()
        status, result = self.command(
            "answer", {"choice": self.server.lesson["lesson"]["check"]["answer"]}
        )
        self.assertEqual(status, 200)
        certificate = result["enrollment"]["certificate"]
        self.assertEqual(certificate["learner"], "alice")
        self.server.stop()
        self.server.start()
        self.owner = self.server.login("alice")
        summary = self.server.request(
            "GET", "/api/buildanddo/learning", token=self.owner
        )[1]
        self.assertEqual(summary["points"], 100)
        self.assertEqual(
            summary["certificates"]["items"][0]["certificate"], certificate
        )
        progress = self.server.request(
            "GET", "/api/collections/tutorial_progress/records", token=self.owner
        )[1]
        self.assertEqual(progress["totalItems"], 1)
        self.assertEqual(progress["items"][0]["status"], "completed")

    def test_authentication_grading_and_native_record_rules(self) -> None:
        self.assertIn(self.server.request("GET", self.path)[0], (401, 403))
        self.assertEqual(self.command("answer", {"choice": 1})[0], 409)
        self.practice()
        answer = self.server.lesson["lesson"]["check"]["answer"]
        wrong = self.command("answer", {"choice": (answer + 1) % 3})
        self.assertEqual(wrong[0], 200)
        self.assertIsNone(wrong[1]["enrollment"]["certificate"])
        completed = self.command("answer", {"choice": answer})[1]["enrollment"]
        self.assertIsNone(
            self.server.request("GET", self.path, token=self.other)[1]["enrollment"]
        )
        self.assertEqual(
            self.server.request("GET", "/api/buildanddo/learning", token=self.other)[1][
                "points"
            ],
            0,
        )
        raw = "/api/collections/tutorial_learning/records"
        for method, suffix, body in (
            ("GET", "", None),
            ("POST", "", {"owner": "accountalice001"}),
            ("PATCH", "/" + completed["id"], {"completed_at": ""}),
            ("DELETE", "/" + completed["id"], None),
        ):
            self.assertIn(
                self.server.request(method, raw + suffix, body, token=self.owner)[0],
                (400, 403, 404),
            )

    def test_concurrent_completion_issues_one_certificate_and_one_award(self) -> None:
        with ThreadPoolExecutor(max_workers=3) as pool:
            starts = list(pool.map(lambda _: self.command("start"), range(3)))
        self.assertTrue(all(status == 200 for status, _ in starts))
        self.assertEqual(len({result["enrollment"]["id"] for _, result in starts}), 1)
        self.practice()
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(
                pool.map(
                    lambda _: self.command(
                        "answer",
                        {"choice": self.server.lesson["lesson"]["check"]["answer"]},
                    ),
                    range(3),
                )
            )
        self.assertTrue(all(status == 200 for status, _ in results))
        self.assertEqual(
            len({item["enrollment"]["certificate"]["id"] for _, item in results}), 1
        )
        self.assertEqual(
            self.server.request("GET", "/api/buildanddo/learning", token=self.owner)[1][
                "points"
            ],
            100,
        )

    def test_down_up_retains_completion_and_reenables_commands(self) -> None:
        self.practice()
        certificate = self.command(
            "answer", {"choice": self.server.lesson["lesson"]["check"]["answer"]}
        )[1]["enrollment"]["certificate"]
        self.server.stop()
        self.server.migrate("down", "1")
        self.server.start()
        self.assertEqual(
            self.server.request("GET", self.path, token=self.owner)[0], 503
        )
        self.server.stop()
        self.server.migrate("up")
        self.server.start()
        self.assertEqual(
            self.server.request("GET", self.path, token=self.owner)[1]["enrollment"][
                "certificate"
            ],
            certificate,
        )


if __name__ == "__main__":
    required = "--require-binary" in sys.argv
    if required:
        sys.argv.remove("--require-binary")
    if required and not (BINARY and Path(BINARY).is_file()):
        raise SystemExit(
            "FAIL: BUILDANDDO_TEST_POCKETBASE must name the disposable test binary; native learning tests did not run."
        )
    unittest.main()
