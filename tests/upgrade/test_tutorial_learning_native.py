# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_tutorial_learning_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001, VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     tests/upgrade/test_classroom_native.py, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js, apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js, apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js, apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js, apps/pocketbase/pb_hooks/lesson-keys.js, apps/pocketbase/pb_hooks/lesson-keys.pb.js, scripts/ci/lesson_keys.py
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_classroom_native.py; VALIDATES apps/pocketbase/pb_hooks/tutorial-learning.js; VALIDATES apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js; VALIDATES apps/pocketbase/pb_migrations/1791400001_broadcast_classroom_lessons.js; VALIDATES apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js; VALIDATES apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js; VALIDATES apps/pocketbase/pb_hooks/lesson-keys.js; VALIDATES apps/pocketbase/pb_hooks/lesson-keys.pb.js; VALIDATES apps/pocketbase/pb_migrations/1791100000_deepen_foundations.js; VALIDATES apps/pocketbase/pb_migrations/1791000000_fix_owasp_reference.js; CONSUMES scripts/ci/lesson_keys.py
# DAG Node:    none
# Intent:      Require real PocketBase auth, concurrent completion and migration retention before accepting installed interactive learning,
#              graded only from a private key file that the fixture generates synthetically at test time.
# ───────────────────────────────────────────────────────────────

"""Exercise learning on a disposable loopback PocketBase with synthetic accounts.

The curriculum files carry no knowledge-check answer or explanation
(SRS-BUILDANDDO-CURRICULUM-PRIVATE-001). Each fixture generates a synthetic key
file from the public question and choices with scripts/ci/lesson_keys.py and
stages it outside the PocketBase data directory. No real key is read. Equality
on key material uses assertTrue with a fixed message, so a failure never prints
an answer or an explanation.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
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

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.ci import lesson_keys as key_tool  # noqa: E402
from tests.upgrade.test_classroom_native import DiagnosticNativeServer  # noqa: E402
from tests.upgrade.test_dossier_native import NO_WINDOW  # noqa: E402

BINARY = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
MIGRATION = "1790600000_tutorial_learning.js"
MIGRATIONS = (
    MIGRATION,
    "1791400001_broadcast_classroom_lessons.js",
    "1791500000_learning_progress_authority.js",
    "1791500002_authority_repair_lessons.js",
    "1791500100_tutorial_answer_wait.js",
)
# The overwrite migrations that re-seed lessons from starter-tutorials.json. Run against the stripped
# data they drop any key the database held, so the key file must restore the same resolved lesson.
OVERWRITES = ("1791000000_fix_owasp_reference.js", "1791100000_deepen_foundations.js")
OVERWRITTEN = (
    "owasp-in-workspace-flows",
    "welcome-to-buildanddo",
    "domain-selection-and-authority",
    "reading-signals",
    "proposing-and-approving-missions",
    "inspecting-evidence",
)
# Lessons whose question or choices carry non-ASCII text, where Python and JavaScript canonical forms could part.
NON_ASCII = ("audience-and-content-brief", "publication-receipts", "weekly-operations-review")
KEY_HOOKS = ("lesson-keys.js", "lesson-keys.pb.js")
# Relative to a fixture root: beside, never inside, the PocketBase data directory and the curriculum data.
KEY_FILE = Path("private") / "lesson-keys.json"
KEY_MARK = key_tool.SYNTHETIC_PREFIX
KEY_VARIABLES = ("BUILDANDDO_LESSON_KEYS_FILE", "BUILDANDDO_LESSON_KEYS_SYNTHETIC")
NOT_INSTALLED = "This lesson's knowledge check is not installed on this server yet. You can still read the lesson."
KEYS_REVIEW = "Lesson grading keys need an operator review."
LESSON_REVIEW = "This lesson's knowledge check needs an operator review."


def write_lesson_keys(path: Path, entries: dict[str, dict[str, Any]]) -> None:
    """Write a synthetic key file whose integrity covers exactly these entries, readable by its owner only."""
    document = key_tool.key_document(
        entries, synthetic=True, kind="git", revision=key_tool.SYNTHETIC_REVISION
    )
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    path.write_bytes(key_tool.dump(document))
    path.chmod(0o600)


def stage_lesson_keys(
    root: Path, hooks: Path, environment: dict[str, str]
) -> dict[str, dict[str, Any]]:
    """Install the key resolver beside tutorial-learning.js and a synthetic key file outside the data directory.

    The keys come from lesson_keys.synthetic_document over the public question and choices, generated
    now and never committed. The explicitly built environment names the file and opts in to synthetic
    keys, which PocketBase refuses without BUILDANDDO_LESSON_KEYS_SYNTHETIC=1.
    """
    for name in KEY_HOOKS:
        shutil.copyfile(ROOT / "apps/pocketbase/pb_hooks" / name, hooks / name)
    entries = key_tool.synthetic_document(ROOT, "synthetic")["lessons"]
    write_lesson_keys(root / KEY_FILE, entries)
    environment[KEY_VARIABLES[0]] = str(root / KEY_FILE)
    environment[KEY_VARIABLES[1]] = "1"
    return entries


def keyed(lesson: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any]:
    """The lesson as the server resolves it: the public check with its key merged in, in memory only."""
    return {
        **lesson,
        "check": {**lesson["check"], "answer": entry["answer"], "explanation": entry["explanation"]},
    }


def carries_key_text(text: str, entries: dict[str, dict[str, Any]]) -> bool:
    """Whether text holds the synthetic marker or any staged explanation; the caller asserts on the boolean only."""
    return KEY_MARK in text or any(entry["explanation"] in text for entry in entries.values())


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
        listRule: "@request.auth.id != '' && @request.auth.id = owner",
        viewRule: "@request.auth.id != '' && @request.auth.id = owner",
        createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: "@request.auth.id != '' && @request.auth.id = owner",
        deleteRule: "@request.auth.id != '' && @request.auth.id = owner",
        fields: [{ name: 'owner', type: 'relation', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
            { name: 'tutorial', type: 'relation', collectionId: tutorials.id, maxSelect: 1, required: true },
            { name: 'status', type: 'select', values: ['not_started', 'in_progress', 'completed'], maxSelect: 1, required: true },
            { name: 'progress', type: 'number', min: 0, max: 100 },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }] });
    app.save(progress);
}, () => {});
"""


class LearningServer(DiagnosticNativeServer):
    """Use the existing native lifecycle with only the learning schema and hooks.

    The seeded lessons carry public text only. Grading keys come from a synthetic key file under
    <root>/private, outside the data directory <root>/data and the curriculum data directory.
    """

    def learning_fields(self) -> list[str]:
        """Read the stored learning schema (field names only) while the server is stopped."""
        with closing(sqlite3.connect(
            (self.root / "data/data.db").as_uri() + "?mode=ro", uri=True
        )) as database:
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
            # Beside tutorial-learning.js: the resolver library, its route and command, and the key file.
            self.keys = stage_lesson_keys(self.root, hooks, self.environment)
            migrations = self.root / "migrations"
            migrations.mkdir()
            curriculum = json.loads(
                (
                    ROOT / "apps/pocketbase/pb_migrations/data/starter-tutorials.json"
                ).read_text()
            )
            # The first starter lesson as the curriculum publishes it: question and choices, no key.
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
            for name in ("starter-tutorials.json", "broadcast-classroom-lessons.json", "authority-repairs-lessons.json"):
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

    @property
    def key_file(self) -> Path:
        """The staged synthetic key file the environment names."""
        return self.root / KEY_FILE

    def answer(self, slug: str = "") -> int:
        """The synthetic correct choice for a lesson by slug; the first starter lesson by default."""
        return self.keys[slug or self.lesson["slug"]]["answer"]

    def restart(self, **environment: str | None) -> None:
        """Restart with named variables set, or removed when None, in the explicitly built environment."""
        self.stop()
        for name, value in environment.items():
            if value is None:
                self.environment.pop(name, None)
            else:
                self.environment[name] = value
        self.start()

    def hold_keys_in_database(self, slugs: tuple[str, ...] | list[str]) -> None:
        """Store each lesson's synthetic key in its tutorials record, as a database seeded before the strip holds it."""
        keys = {slug: {"answer": self.keys[slug]["answer"], "explanation": self.keys[slug]["explanation"]} for slug in slugs}
        self.fixture_change(
            "const keys = " + json.dumps(keys) + ";\n"
            + """for (const slug of Object.keys(keys)) {
                const record = app.findFirstRecordByData('tutorials', 'slug', slug);
                const lesson = JSON.parse(record.getString('lesson'));
                lesson.check.answer = keys[slug].answer; lesson.check.explanation = keys[slug].explanation;
                record.set('lesson', lesson); app.save(record);
            }"""
        )

    def lesson_keys_check(self, *arguments: str) -> tuple[int, dict[str, Any], str]:
        """Run the read-only `pocketbase lesson-keys check` against this stopped fixture.

        Returns the exit code, the JSON report (the last JSON object printed) and the captured output.
        """
        try:
            result = subprocess.run(
                [self.binary, "lesson-keys", "check", *arguments, *self.paths()],
                cwd=self.root,
                env=self.environment,
                capture_output=True,
                text=True,
                timeout=45,
                check=False,
                **NO_WINDOW,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise AssertionError(
                f"Native lesson-keys check unavailable ({type(error).__name__}); acceptance did not run."
            ) from None
        output = result.stdout + result.stderr
        report: dict[str, Any] = {}
        for line in output.splitlines():
            # A console line may carry a timestamp prefix; the report is the JSON object after it.
            if "{" not in line:
                continue
            try:
                parsed = json.loads(line[line.index("{"):])
            except ValueError:
                continue
            if isinstance(parsed, dict) and "state" in parsed:
                report = parsed
        return result.returncode, report, output


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
        status, result = self.command("answer", {"choice": self.server.answer()})
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
        self.assertEqual(progress["totalItems"], 0)
        states = self.server.request(
            "GET", "/api/buildanddo/learning/states", token=self.owner
        )[1]
        self.assertEqual(states["items"][0]["status"], "completed")

    def test_authentication_grading_and_native_record_rules(self) -> None:
        self.assertIn(self.server.request("GET", self.path)[0], (401, 403))
        self.assertEqual(self.command("answer", {"choice": 1})[0], 409)
        self.practice()
        answer = self.server.answer()
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
        self.server.fixture_change("""
            const record = app.findFirstRecordByFilter('tutorial_learning', 'owner = "accountalice001"');
            record.set('answer_retry_at', '2000-01-01T00:00:00.000Z'); app.save(record);
        """)
        status, result = self.command("answer", {"choice": answer})
        self.assertEqual(status, 200)
        completed = result["enrollment"]
        self.assertIsNotNone(completed["certificate"])
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
        self.assertFalse(
            carries_key_text(json.dumps([viewed[1], listed[1]]), self.server.keys),
            "a catalogue read carried key text",
        )
        # The curriculum seeds public text only: no stored lesson holds a key, so grading needs the file.
        for row in self.server.stored("tutorials"):
            stored = json.loads(row["lesson"])["check"]
            self.assertFalse({"answer", "explanation"} & stored.keys(), row["slug"])

    def test_concurrent_completion_issues_one_certificate_and_one_award(self) -> None:
        with ThreadPoolExecutor(max_workers=3) as pool:
            starts = list(pool.map(lambda _: self.command("start"), range(3)))
        self.assertTrue(all(status == 200 for status, _ in starts))
        self.assertEqual(len({result["enrollment"]["id"] for _, result in starts}), 1)
        self.practice()
        with ThreadPoolExecutor(max_workers=3) as pool:
            results = list(
                pool.map(
                    lambda _: self.command("answer", {"choice": self.server.answer()}),
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
        certificate = self.command("answer", {"choice": self.server.answer()})[1][
            "enrollment"
        ]["certificate"]
        tutorials = self.server.stored("tutorials")
        self.assertEqual(len(tutorials), 27)
        self.server.stop()
        self.server.revert(str(len(MIGRATIONS)))
        # `serve` applies pending migrations on start (PocketBase 0.23+), which is why revert() moves the
        # reverted files aside. The rolled-back schema shows on disk first: commands lose their required
        # fields while every checkpoint and certificate row remains; served, the route is unavailable.
        fields = self.server.learning_fields()
        self.assertNotIn("protocol_version", fields)
        self.assertNotIn("answer_retry_at", fields)
        self.assertEqual(len(self.server.stored("tutorial_learning")), 1)
        self.server.start()
        self.assertEqual(
            self.server.request("GET", self.path, token=self.owner)[0], 503
        )
        self.server.stop()
        self.server.restore()
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
        self.assertEqual(len(self.server.stored("tutorials")), 27)
        for _ in range(2):
            code, detail = self.server.request("GET", path, token=self.owner)
            self.assertEqual(code, 200)
            self.assertIsNone(detail["enrollment"])
            self.assertEqual(
                detail["tutorial"]["curriculum_version"],
                self.server.broadcast["version"],
            )
            learner_lesson = {
                **lesson["lesson"],
                "check": {
                    key: lesson["lesson"]["check"][key]
                    for key in ("question", "choices")
                },
            }
            self.assertEqual(detail["tutorial"]["lesson"], learner_lesson)
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
        self.assertEqual(progress, [])
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
        # The enrolled learner keeps the frozen snapshot, so no key file is read for this read.
        code, retained = self.server.request("GET", path, token=self.owner)
        self.assertEqual(code, 200)
        self.assertEqual(retained["tutorial"], tutorial)
        self.assertEqual(retained["enrollment"], enrolled["enrollment"])
        # The key is bound to the previous curriculum_version, so a fresh learner is refused until the
        # operator re-binds it: never graded against a key written for different text.
        code, refused = self.server.request("GET", path, token=self.other)
        self.assertEqual((code, refused.get("message")), (503, LESSON_REVIEW))
        rebound = dict(self.server.keys)
        rebound[lesson["slug"]] = {**rebound[lesson["slug"]], "curriculum_version": "fixture-operator-revision"}
        write_lesson_keys(self.server.key_file, rebound)
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

    def test_authority_lesson_read_and_enrollment_keep_results_unawarded(self) -> None:
        path = "/api/buildanddo/learning/bdoauthority001"
        before = self.server.stored("tutorial_learning")
        status, detail = self.server.request("GET", path, token=self.owner)
        self.assertEqual(status, 200)
        self.assertEqual(detail["tutorial"]["curriculum_version"], "2026.09.authority.1")
        self.assertNotIn("answer", detail["tutorial"]["lesson"]["check"])
        self.assertIsNone(detail["enrollment"])
        # Rows hold resolved snapshots, so they are compared without printing them.
        self.assertTrue(self.server.stored("tutorial_learning") == before, "a read changed saved learning")
        status, started = self.server.request("POST", path, {
            "action": "start", "content_digest": detail["tutorial"]["content_digest"], "payload": {},
        }, self.owner)
        self.assertEqual(status, 200)
        self.assertEqual(started["enrollment"]["points"], 0)
        self.assertIsNone(started["enrollment"]["certificate"])
        self.assertEqual(self.server.stored("tutorial_progress"), [])
        status, states = self.server.request("GET", "/api/buildanddo/learning/states", token=self.owner)
        self.assertEqual(status, 200)
        self.assertEqual(states["items"][0]["tutorial"], "bdoauthority001")
        self.assertEqual(states["items"][0]["status"], "in_progress")

    def test_keyless_responses_keep_full_snapshots_and_server_feedback(self) -> None:
        check = self.server.lesson["lesson"]["check"]
        entry = self.server.keys[self.server.lesson["slug"]]
        answer = entry["answer"]
        expected = {key: check[key] for key in ("question", "choices")}
        self.assertEqual(
            self.server.request("GET", self.path, token=self.owner)[1]["tutorial"][
                "lesson"
            ]["check"],
            expected,
        )
        self.practice()
        before = self.server.stored("tutorial_learning")[0]
        snapshot = json.loads(before["snapshot"])
        # The frozen snapshot is the lesson with its key resolved from the file, never the stored keyless copy.
        self.assertTrue(
            snapshot["lesson"] == keyed(self.server.lesson["lesson"], entry),
            "the snapshot is not the resolved lesson",
        )
        for choice in ((answer + 1) % len(check["choices"]), answer):
            if choice == answer:
                self.assertEqual(self.command("answer", {"choice": choice})[0], 429)
                self.server.fixture_change("""
                    const record = app.findFirstRecordByFilter('tutorial_learning', 'owner = "accountalice001"');
                    record.set('answer_retry_at', '2000-01-01T00:00:00.000Z'); app.save(record);
                """)
            status, result = self.command("answer", {"choice": choice})
            self.assertEqual(status, 200)
            self.assertEqual(result["tutorial"]["lesson"]["check"], expected)
            self.assertTrue(
                result["feedback"]
                == (
                    {"correct": True, "explanation": entry["explanation"]}
                    if choice == answer
                    else {
                        "correct": False,
                        "explanation": "Not the expected answer. Review the lesson sections, then try again.",
                        "retry_after": 30,
                    }
                ),
                "the server feedback does not match the staged key",
            )
        after = self.server.stored("tutorial_learning")[0]
        self.assertTrue(after["snapshot"] == before["snapshot"], "answering changed the frozen snapshot")
        self.assertEqual(after["content_digest"], before["content_digest"])
        self.assertIn(
            "open-book tutorial completion; practice self-reported",
            result["enrollment"]["certificate"]["scope"],
        )

    def test_hookless_progress_write_denial_retains_owner_only_duplicate_history(
        self,
    ) -> None:
        self.server.fixture_change("""
            const collection = app.findCollectionByNameOrId('tutorial_progress');
            for (const status of ['completed', 'in_progress']) {
                const record = new Record(collection);
                record.set('owner', 'accountalice001'); record.set('tutorial', 'bdo25lesson0001');
                record.set('status', status); record.set('progress', status === 'completed' ? 100 : 50); app.save(record);
            }
        """)
        before = self.server.stored("tutorial_progress")
        self.assertEqual(len(before), 2)
        self.assertEqual(self.command("start")[0], 200)
        self.assertEqual(
            self.command("start")[1]["enrollment"]["status"], "in_progress"
        )
        self.assertEqual(self.server.stored("tutorial_progress"), before)
        self.server.stop()
        for name in ("tutorial-learning.pb.js", "lesson-keys.pb.js"):
            hook = self.server.root / "hooks" / name
            hook.rename(hook.with_suffix(".disabled"))
        self.server.start()
        self.assertFalse(list((self.server.root / "hooks").glob("*.pb.js")))
        raw = "/api/collections/tutorial_progress/records"
        for token in (self.owner, self.other):
            for method, suffix, body in (
                (
                    "POST",
                    "",
                    {
                        "owner": "accountalice001",
                        "tutorial": "bdo25lesson0001",
                        "status": "completed",
                        "progress": 100,
                    },
                ),
                ("PATCH", "/" + before[0]["id"], {"status": "completed"}),
                ("DELETE", "/" + before[0]["id"], None),
            ):
                self.assertIn(
                    self.server.request(method, raw + suffix, body, token)[0],
                    (400, 403, 404),
                )
        self.assertEqual(
            self.server.request("GET", raw, token=self.owner)[1]["totalItems"], 2
        )
        self.assertEqual(
            self.server.request("GET", raw, token=self.other)[1]["totalItems"], 0
        )
        self.assertEqual(
            self.server.request("GET", raw + "/" + before[0]["id"], token=self.other)[
                0
            ],
            404,
        )
        self.assertEqual(self.server.stored("tutorial_progress"), before)
        for rule in ("createRule", "updateRule", "deleteRule"):
            self.assertIsNone(self.server.collection("tutorial_progress")[rule])

    def test_canonical_state_pages_cover_more_than_five_certificates(self) -> None:
        tutorials = self.server.stored("tutorials")
        for index, tutorial in enumerate(tutorials):
            path = "/api/buildanddo/learning/" + tutorial["id"]
            detail = self.server.request("GET", path, token=self.owner)[1]
            digest = detail["tutorial"]["content_digest"]
            lesson = json.loads(tutorial["lesson"])
            actions = [("start", {})]
            if index < 6:
                actions += [
                    ("section", {"index": i}) for i in range(len(lesson["sections"]))
                ]
                actions += [
                    (
                        "practice",
                        {"checks": [True] * len(lesson["exercise"]["checklist"])},
                    ),
                    ("answer", {"choice": self.server.answer(tutorial["slug"])}),
                ]
            for action, payload in actions:
                self.assertEqual(
                    self.server.request(
                        "POST",
                        path,
                        {
                            "action": action,
                            "payload": payload,
                            "content_digest": digest,
                        },
                        self.owner,
                    )[0],
                    200,
                )
        first = self.server.request(
            "GET", "/api/buildanddo/learning/states?page=1", token=self.owner
        )[1]
        second = self.server.request(
            "GET", "/api/buildanddo/learning/states?page=2", token=self.owner
        )[1]
        self.assertEqual(len(first["items"]), 20)
        self.assertTrue(first["has_more"])
        self.assertFalse(second["has_more"])
        items = first["items"] + second["items"]
        self.assertEqual(len({item["tutorial"] for item in items}), len(tutorials))
        self.assertEqual(sum(item["status"] == "completed" for item in items), 6)
        self.assertEqual(
            self.server.request(
                "GET", "/api/buildanddo/learning/states", token=self.other
            )[1]["items"],
            [],
        )
        self.assertEqual(
            len(
                self.server.request(
                    "GET", "/api/buildanddo/learning", token=self.owner
                )[1]["certificates"]["items"]
            ),
            5,
        )

    def test_revoked_lesson_context_denies_current_reads_and_replay_without_changing_saved_bytes(
        self,
    ) -> None:
        self.practice()
        self.assertEqual(self.command("answer", {"choice": self.server.answer()})[0], 200)
        saved = self.server.stored("tutorial_learning")
        self.server.fixture_change("""
            const tutorials = app.findCollectionByNameOrId('tutorials');
            tutorials.viewRule = "@request.auth.id = 'accountbravo001'"; app.save(tutorials);
        """)
        for path in (
            self.path,
            "/api/buildanddo/learning",
            "/api/buildanddo/learning/states",
        ):
            self.assertEqual(self.server.request("GET", path, token=self.owner)[0], 403)
        self.assertEqual(self.command("start")[0], 403)
        self.assertTrue(self.server.stored("tutorial_learning") == saved, "a denied read changed saved learning")


    # ---- private lesson keys (SRS-BUILDANDDO-CURRICULUM-PRIVATE-001) ------------------------------

    def tutorial_ids(self) -> dict[str, str]:
        """Staged tutorials by slug."""
        return {row["slug"]: row["id"] for row in self.server.stored("tutorials")}

    def health(self) -> dict[str, Any]:
        """The public keys-health report: the key state and lesson counts only."""
        status, report = self.server.request("GET", "/api/buildanddo/learning/keys-health")
        self.assertEqual(status, 200)
        self.assertFalse(carries_key_text(json.dumps(report), self.server.keys), "keys-health carried key text")
        return report

    def assert_refused(self, path: str, token: str, message: str) -> None:
        """A learner read refused with the given message, creating nothing."""
        before = len(self.server.stored("tutorial_learning"))
        status, body = self.server.request("GET", path, token=token)
        self.assertEqual((status, body.get("message")), (503, message))
        self.assertEqual(len(self.server.stored("tutorial_learning")), before)

    def test_absent_keys_refuse_grading_before_any_enrollment(self) -> None:
        # No configured file and no lesson-keys.json in the data directory: the keys are ABSENT.
        self.assertFalse((self.server.root / "data/lesson-keys.json").exists())
        self.server.restart(BUILDANDDO_LESSON_KEYS_FILE=None)
        self.owner = self.server.login("alice")
        self.assert_refused(self.path, self.owner, NOT_INSTALLED)
        status, body = self.command("start")
        self.assertEqual((status, body.get("message")), (503, NOT_INSTALLED))
        self.assertEqual(self.server.stored("tutorial_learning"), [])
        self.assertEqual(self.server.stored("tutorial_progress"), [])
        self.assertEqual(
            self.health(),
            {"schema_version": 1, "keys": "ABSENT", "lessons": 27, "gradable": 0, "unavailable": 27},
        )
        # The lesson itself stays readable through the catalogue: only its check waits for the key.
        status, viewed = self.server.request(
            "GET", "/api/collections/tutorials/records/" + self.server.lesson["id"], token=self.owner
        )
        self.assertEqual(status, 200)
        self.assertEqual(set(viewed["lesson"]["check"]), {"question", "choices"})

    def test_enrolled_learner_finishes_from_the_snapshot_after_the_key_file_is_removed(self) -> None:
        self.practice()
        self.server.key_file.unlink()
        # A configured file that has gone is unusable, and no database key backs a fresh read.
        self.assert_refused(self.path, self.other, KEYS_REVIEW)
        self.assertEqual(self.server.request("GET", self.path, token=self.owner)[0], 200)
        status, result = self.command("answer", {"choice": self.server.answer()})
        self.assertEqual(status, 200)
        self.assertTrue(result["feedback"]["correct"])
        self.assertIsNotNone(result["enrollment"]["certificate"])
        self.assertEqual(len(self.server.stored("tutorial_learning")), 1)
        self.assertEqual(self.health()["keys"], "INVALID")
        self.assertFalse(
            carries_key_text(self.server.diagnostics(), self.server.keys),
            "retained native diagnostics carried key text",
        )

    def test_synthetic_keys_need_the_explicit_opt_in(self) -> None:
        self.server.restart(BUILDANDDO_LESSON_KEYS_SYNTHETIC=None)
        self.owner = self.server.login("alice")
        self.assert_refused(self.path, self.owner, KEYS_REVIEW)
        status, body = self.command("start")
        self.assertEqual((status, body.get("message")), (503, KEYS_REVIEW))
        self.assertEqual(self.server.stored("tutorial_learning"), [])
        self.assertEqual(
            self.health(),
            {"schema_version": 1, "keys": "INVALID", "lessons": 27, "gradable": 0, "unavailable": 27},
        )

    def test_a_relabelled_synthetic_file_is_refused_and_never_reports_private(self) -> None:
        unusable = {"schema_version": 1, "keys": "INVALID", "lessons": 27, "gradable": 0, "unavailable": 27}
        synthetic = key_tool.dump(key_tool.key_document(
            self.server.keys, synthetic=True, kind="git", revision=key_tool.SYNTHETIC_REVISION
        ))
        # Only the label flipped: the seal covers it. Relabelled and resealed: the placeholder explanations remain.
        flipped = synthetic.replace(b'"synthetic": true', b'"synthetic": false', 1)
        self.assertNotEqual(flipped, synthetic)
        resealed = key_tool.dump(key_tool.key_document(self.server.keys, synthetic=False, kind="git", revision="0" * 40))
        for label, text, reason in (("flipped", flipped, "integrity"), ("resealed", resealed, "synthetic_not_allowed")):
            with self.subTest(label):
                self.server.key_file.write_bytes(text)
                self.server.restart(BUILDANDDO_LESSON_KEYS_SYNTHETIC=None)
                owner = self.server.login("alice")
                self.assert_refused(self.path, owner, KEYS_REVIEW)
                status, body = self.server.request(
                    "POST", self.path, {"action": "start", "payload": {}, "content_digest": self.digest}, token=owner
                )
                self.assertEqual((status, body.get("message")), (503, KEYS_REVIEW))
                self.assertEqual(self.server.stored("tutorial_learning"), [])
                self.assertEqual(self.health(), unusable)
                self.server.stop()
                code, report, output = self.server.lesson_keys_check()
                self.assertFalse(carries_key_text(output, self.server.keys), "lesson-keys check printed key text")
                self.assertEqual(
                    (code, report.get("state"), report.get("reason"), report.get("unavailable")), (1, "INVALID", reason, 27)
                )
                self.server.start()
        # With the contributor opt-in the resealed relabel is still fixture keys: SYNTHETIC, never PRIVATE.
        self.server.restart(BUILDANDDO_LESSON_KEYS_SYNTHETIC="1")
        self.assertEqual(self.health()["keys"], "SYNTHETIC")

    def test_a_tampered_binding_or_version_refuses_only_that_lesson(self) -> None:
        slug = self.server.lesson["slug"]
        other = next(identity for name, identity in self.tutorial_ids().items() if name != slug)
        for change in ({"check_sha256": "0" * 64}, {"curriculum_version": "2026.09.tampered"}):
            with self.subTest(changed=sorted(change)):
                entries = dict(self.server.keys)
                entries[slug] = {**entries[slug], **change}
                # Integrity is recomputed, so the file stays valid and only that entry disagrees.
                write_lesson_keys(self.server.key_file, entries)
                self.assert_refused(self.path, self.owner, LESSON_REVIEW)
                self.assertEqual(self.command("start")[0], 503)
                self.assertEqual(self.server.stored("tutorial_learning"), [])
                self.assertEqual(
                    self.server.request("GET", "/api/buildanddo/learning/" + other, token=self.owner)[0], 200
                )
                self.assertEqual(
                    self.health(),
                    {"schema_version": 1, "keys": "SYNTHETIC", "lessons": 27, "gradable": 26, "unavailable": 1},
                )

    def test_an_invalid_file_keeps_lessons_with_database_keys_gradable(self) -> None:
        slug = self.server.lesson["slug"]
        other = next(identity for name, identity in self.tutorial_ids().items() if name != slug)
        self.server.hold_keys_in_database([slug])
        self.server.key_file.write_text("{ not a key file", encoding="utf-8")
        status, detail = self.server.request("GET", self.path, token=self.owner)
        self.assertEqual(status, 200)
        # The same key, held by the database or by the file, gives the same lesson digest.
        self.assertEqual(detail["tutorial"]["content_digest"], self.digest)
        self.assertNotIn("answer", detail["tutorial"]["lesson"]["check"])
        self.practice()
        status, result = self.command("answer", {"choice": self.server.answer()})
        self.assertEqual(status, 200)
        self.assertIsNotNone(result["enrollment"]["certificate"])
        # A lesson without a database key has nothing to fall back on.
        self.assert_refused("/api/buildanddo/learning/" + other, self.owner, KEYS_REVIEW)
        self.assertEqual(
            self.health(),
            {"schema_version": 1, "keys": "INVALID", "lessons": 27, "gradable": 1, "unavailable": 26},
        )
        # A valid file whose entry disagrees with the stored key refuses that lesson for a fresh learner.
        entries = dict(self.server.keys)
        choices = len(self.server.lesson["lesson"]["check"]["choices"])
        entries[slug] = {**entries[slug], "answer": (entries[slug]["answer"] + 1) % choices}
        write_lesson_keys(self.server.key_file, entries)
        self.assert_refused(self.path, self.other, LESSON_REVIEW)
        self.assertEqual(self.server.request("GET", self.path, token=self.owner)[0], 200)

    def test_pocketbase_accepts_the_python_bindings_for_every_staged_lesson(self) -> None:
        self.assertEqual(
            self.health(),
            {"schema_version": 1, "keys": "SYNTHETIC", "lessons": 27, "gradable": 27, "unavailable": 0},
        )
        stored = {row["slug"]: row for row in self.server.stored("tutorials")}
        self.assertTrue(set(NON_ASCII) <= stored.keys())
        for slug in NON_ASCII:
            check = json.loads(stored[slug]["lesson"])["check"]
            text = json.dumps({"question": check["question"], "choices": check["choices"]}, ensure_ascii=False)
            self.assertTrue(any(ord(char) > 127 for char in text), slug)
        for slug, row in stored.items():
            status, detail = self.server.request("GET", "/api/buildanddo/learning/" + row["id"], token=self.owner)
            self.assertEqual(status, 200, slug)
            self.assertEqual(set(detail["tutorial"]["lesson"]["check"]), {"question", "choices"}, slug)

    def test_overwrite_migrations_on_stripped_data_keep_the_resolved_digest(self) -> None:
        ids = self.tutorial_ids()
        self.assertTrue(set(OVERWRITTEN) <= ids.keys())
        # A database seeded before the strip holds each key itself.
        self.server.hold_keys_in_database(OVERWRITTEN)

        def stored_check(slug: str) -> dict[str, Any]:
            row = next(item for item in self.server.stored("tutorials") if item["slug"] == slug)
            return json.loads(row["lesson"])["check"]

        before = {}
        for slug in OVERWRITTEN:
            self.assertTrue({"answer", "explanation"} <= stored_check(slug).keys(), slug)
            status, detail = self.server.request("GET", "/api/buildanddo/learning/" + ids[slug], token=self.owner)
            self.assertEqual(status, 200, slug)
            before[slug] = detail["tutorial"]["content_digest"]
        self.server.stop()
        for name in OVERWRITES:
            shutil.copyfile(ROOT / "apps/pocketbase/pb_migrations" / name, self.server.root / "migrations" / name)
        self.server.migrate()
        self.server.start()
        for slug in OVERWRITTEN:
            # The real migrations re-seeded the lesson from the stripped file, dropping the database key...
            self.assertFalse({"answer", "explanation"} & stored_check(slug).keys(), f"{slug} was not re-seeded")
            # ...and the key file restores exactly the lesson the certificate digest was bound to.
            status, detail = self.server.request("GET", "/api/buildanddo/learning/" + ids[slug], token=self.owner)
            self.assertEqual((status, detail["tutorial"]["content_digest"]), (200, before[slug]), slug)

    def test_lesson_keys_check_reports_counts_only_and_fails_closed(self) -> None:
        self.server.stop()
        code, report, output = self.server.lesson_keys_check()
        self.assertFalse(carries_key_text(output, self.server.keys), "lesson-keys check printed key text")
        self.assertEqual(
            (code, report),
            (0, {"state": "SYNTHETIC", "reason": "", "lessons": 27, "stored_equal": 0, "file_only": 27,
                 "db_only": 0, "mismatch": 0, "unavailable": 0}),
        )
        entries = dict(self.server.keys)
        slug = self.server.lesson["slug"]
        entries[slug] = {**entries[slug], "check_sha256": "f" * 64}
        tampered = self.server.root / "private" / "tampered-lesson-keys.json"
        write_lesson_keys(tampered, entries)
        code, report, output = self.server.lesson_keys_check(str(tampered))
        self.assertFalse(carries_key_text(output, self.server.keys), "lesson-keys check printed key text")
        self.assertEqual(
            (code, report),
            (1, {"state": "SYNTHETIC", "reason": "", "lessons": 27, "stored_equal": 0, "file_only": 26,
                 "db_only": 0, "mismatch": 1, "unavailable": 1}),
        )
        self.server.start()
        # Read-only: the check wrote no learning row and changed no lesson.
        self.assertEqual(self.server.stored("tutorial_learning"), [])
        self.assertEqual(self.health()["unavailable"], 0)


if __name__ == "__main__":
    required = "--require-binary" in sys.argv
    if required:
        sys.argv.remove("--require-binary")
    if required and not (BINARY and Path(BINARY).is_file()):
        raise SystemExit(
            "FAIL: BUILDANDDO_TEST_POCKETBASE must name the disposable test binary; native learning tests did not run."
        )
    unittest.main()
