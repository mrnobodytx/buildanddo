# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_tutorial_learning_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     tests/upgrade/test_classroom_native.py, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js, apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js, apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_classroom_native.py; VALIDATES apps/pocketbase/pb_hooks/tutorial-learning.js; VALIDATES apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js; VALIDATES apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js; VALIDATES apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js
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
import sqlite3
import sys
import tempfile
from typing import Any
import unittest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from tests.upgrade.test_classroom_native import DiagnosticNativeServer  # noqa: E402

BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
MIGRATION = "1790600000_tutorial_learning.js"
MIGRATIONS = (
    MIGRATION,
    "1791400001_broadcast_classroom_lessons.js",
    "1791500100_tutorial_answer_wait.js",
)
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
            { name: 'order', type: 'number' }, { name: 'prerequisites', type: 'text' }, { name: 'slug', type: 'text', max: 100 },
            { name: 'curriculum_version', type: 'text', max: 40 }, { name: 'lesson', type: 'json', maxSize: 65536 }] });
    app.save(tutorials);
    const dataDir = __FIXTURE_DATA_DIR__;
    const curriculum = JSON.parse(toString($os.readFile($filepath.join(dataDir, 'starter-tutorials.json'))));
    for (const data of curriculum.lessons) {
        const lesson = new Record(tutorials); lesson.id = data.id;
        for (const key of ['title', 'summary', 'category', 'effort_minutes', 'order', 'prerequisites', 'slug', 'lesson']) lesson.set(key, data[key]);
        lesson.set('curriculum_version', curriculum.version); app.save(lesson);
    }
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


class LearningServer(DiagnosticNativeServer):
    """Use the existing native lifecycle with only the learning schema and hooks."""

    def learning_fields(self) -> list[str]:
        """Read the stored learning schema (field names only) while the server is stopped."""
        with sqlite3.connect(
            (self.root / "data/data.db").as_uri() + "?mode=ro", uri=True
        ) as database:
            row = database.execute(
                "select fields from _collections where name = 'tutorial_learning'"
            ).fetchone()
        return [field["name"] for field in json.loads(row[0])]

    def __init__(self, binary: str) -> None:
        self.directory = tempfile.TemporaryDirectory(prefix="buildanddo-learning-")
        self.root = Path(self.directory.name)
        self.binary = str(Path(binary).resolve())
        self.process = None
        self.log = tempfile.TemporaryFile(mode="w+b")
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
                "tutorial-learning.pb.js",
                "tutorial-learning.js",
                "workspace-access.js",
                "government-access.js",
                "workflow-policy.js",
                "business-action-policy.js",
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
            self.broadcast = json.loads(
                (
                    ROOT
                    / "apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json"
                ).read_text()
            )
            data_dir = self.root / "pb_migrations/data"
            # The seed names its data directory itself: 0.28.4 has no __hooks in migrations.
            (migrations / "0000000001_fixture.js").write_text(
                SEED.replace("__FIXTURE_DATA_DIR__", json.dumps(str(data_dir)))
            )
            for name in MIGRATIONS:
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations" / name, migrations / name
                )
            data_dir.mkdir(parents=True)
            for name in ("starter-tutorials.json", "broadcast-classroom-lessons.json"):
                shutil.copyfile(
                    ROOT / "apps/pocketbase/pb_migrations/data" / name, data_dir / name
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
        detail = self.server.request("GET", self.path, token=self.owner)[1]
        self.assertNotIn("answer", detail["tutorial"]["lesson"]["check"])
        wrong = self.command("answer", {"choice": (answer + 1) % 3})
        self.assertEqual(wrong[0], 200)
        self.assertIsNone(wrong[1]["enrollment"]["certificate"])
        self.assertNotIn("answer", wrong[1]["tutorial"]["lesson"]["check"])
        self.assertEqual(wrong[1]["feedback"]["retry_after"], 30)
        waiting = self.command("answer", {"choice": answer})
        self.assertEqual(waiting[0], 429)
        self.assertRegex(waiting[1]["message"], r"again in \d+ seconds")
        completed = wrong[1]["enrollment"]
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

    def test_catalogue_reads_never_carry_the_answer(self) -> None:
        raw = "/api/collections/tutorials/records"
        viewed = self.server.request(
            "GET", raw + "/" + self.server.lesson["id"], token=self.owner
        )
        self.assertEqual(viewed[0], 200)
        listed = self.server.request("GET", raw + "?perPage=200", token=self.owner)
        self.assertEqual(listed[0], 200)
        for item in [viewed[1], *listed[1]["items"]]:
            check = item["lesson"]["check"]
            self.assertNotIn("answer", check)
            self.assertNotIn("explanation", check)
        stored = json.loads(self.server.stored("tutorials")[0]["lesson"])["check"]
        self.assertTrue({"answer", "explanation"} <= stored.keys())

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
        tutorials = self.server.stored("tutorials")
        self.assertEqual(len(tutorials), 26)
        self.server.stop()
        self.server.migrate("down", str(len(MIGRATIONS)))
        # `serve` applies pending migrations on start (PocketBase 0.23+), so the
        # rolled-back schema is observable only on disk: commands lose their
        # required fields while every checkpoint and certificate row remains.
        fields = self.server.learning_fields()
        self.assertNotIn("protocol_version", fields)
        self.assertNotIn("answer_retry_at", fields)
        self.assertEqual(len(self.server.stored("tutorial_learning")), 1)
        self.server.start()
        self.assertEqual(
            self.server.request("GET", self.path, token=self.owner)[1]["enrollment"][
                "certificate"
            ],
            certificate,
        )
        self.assertEqual(self.server.stored("tutorials"), tutorials)

    def test_broadcast_lesson_read_and_enrollment_snapshot_do_not_fabricate_awards(
        self,
    ) -> None:
        lesson = self.server.broadcast["lessons"][0]
        path = "/api/buildanddo/learning/" + lesson["id"]
        self.assertEqual(len(self.server.stored("tutorials")), 26)
        for _ in range(2):
            code, detail = self.server.request("GET", path, token=self.owner)
            self.assertEqual(code, 200)
            self.assertIsNone(detail["enrollment"])
            self.assertEqual(
                detail["tutorial"]["curriculum_version"],
                self.server.broadcast["version"],
            )
            public = {
                **lesson["lesson"],
                "check": {
                    key: value
                    for key, value in lesson["lesson"]["check"].items()
                    if key not in ("answer", "explanation")
                },
            }
            self.assertEqual(detail["tutorial"]["lesson"], public)
        self.assertEqual(self.server.stored("tutorial_learning"), [])
        self.assertEqual(self.server.stored("tutorial_progress"), [])
        tutorial = detail["tutorial"]
        code, enrolled = self.server.request(
            "POST",
            path,
            {
                "action": "start",
                "content_digest": tutorial["content_digest"],
                "payload": {},
            },
            self.owner,
        )
        self.assertEqual(code, 200)
        self.assertEqual(
            enrolled["tutorial"]["lesson"]["references"], lesson["lesson"]["references"]
        )
        self.assertEqual(enrolled["enrollment"]["next_section"], 0)
        self.assertFalse(enrolled["enrollment"]["practiced"])
        self.assertEqual(enrolled["enrollment"]["points"], 0)
        self.assertIsNone(enrolled["enrollment"]["certificate"])
        progress = self.server.stored("tutorial_progress")
        self.assertEqual(len(progress), 1)
        self.assertEqual(progress[0]["status"], "in_progress")
        self.assertEqual(progress[0]["progress"], 0)
        self.assertIn(
            self.server.request(
                "PATCH",
                "/api/collections/tutorials/records/" + lesson["id"],
                {"title": "Unauthorized rewrite"},
                self.owner,
            )[0],
            (403, 404),
        )
        self.server.fixture_change("""
            const tutorial = app.findRecordById('tutorials', 'bdobroadcast001');
            const lesson = JSON.parse(tutorial.getString('lesson'));
            lesson.references[0].label = 'Operator-edited public source reference';
            tutorial.set('lesson', lesson); tutorial.set('curriculum_version', 'fixture-operator-revision'); app.save(tutorial);
        """)
        code, retained = self.server.request("GET", path, token=self.owner)
        self.assertEqual(code, 200)
        self.assertEqual(retained["tutorial"], tutorial)
        self.assertEqual(retained["enrollment"], enrolled["enrollment"])
        code, fresh = self.server.request("GET", path, token=self.other)
        self.assertEqual(code, 200)
        self.assertIsNone(fresh["enrollment"])
        self.assertNotEqual(
            fresh["tutorial"]["content_digest"], tutorial["content_digest"]
        )
        self.assertEqual(
            fresh["tutorial"]["lesson"]["references"][0]["label"],
            "Operator-edited public source reference",
        )
        self.assertEqual(
            self.server.request(
                "POST",
                path,
                {
                    "action": "start",
                    "content_digest": tutorial["content_digest"],
                    "payload": {},
                },
                self.other,
            )[0],
            409,
        )
        for token in (self.owner, self.other):
            code, summary = self.server.request(
                "GET", "/api/buildanddo/learning", token=token
            )
            self.assertEqual(code, 200)
            self.assertEqual(summary["points"], 0)
            self.assertEqual(summary["certificates"]["items"], [])
        self.assertEqual(self.server.stored("tutorial_progress"), progress)


if __name__ == "__main__":
    required = "--require-binary" in sys.argv
    if required:
        sys.argv.remove("--require-binary")
    if required and not (BINARY and Path(BINARY).is_file()):
        raise SystemExit(
            "FAIL: BUILDANDDO_TEST_POCKETBASE must name the disposable test binary; native learning tests did not run."
        )
    unittest.main()
