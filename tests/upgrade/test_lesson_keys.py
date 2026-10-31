# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_lesson_keys.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     scripts/ci/lesson_keys.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/lesson_keys.py
# Intent:      Prove the lesson-key tool exports, verifies, synthesises, strips and compares digests
#              correctly on throwaway repositories, without ever reading or printing a real key.
# ───────────────────────────────────────────────────────────────

"""Exercise scripts/ci/lesson_keys.py on synthetic curricula in throwaway git repositories.

Nothing here reads the real curriculum files or a real key file. Every fixture
explanation carries a marker, and every tool run asserts that its captured
stdout and stderr hold no marker. Equality on key material uses assertTrue with
a fixed message, so a failure never prints a value.
"""

from __future__ import annotations

import hashlib
import http.server
import io
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

from scripts.ci import lesson_keys as lk

REPO = Path(__file__).resolve().parents[2]
TOOL = REPO / "scripts" / "ci" / "lesson_keys.py"
FIXTURE_MARK = "Fixture explanation"
MARKERS = (FIXTURE_MARK, lk.SYNTHETIC_PREFIX)
GIT = ("git", "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false")

# name: (slugs, version, indent, trailing newline, extra top-level members)
CURRICULA = {
    "starter-tutorials.json": (("fixture-welcome", "fixture-signals", "fixture-evidence"), "2026.fx.1", 1, False, {}),
    "government-submissions.json": (("fixture-gov-intake", "fixture-gov-review"), "2026.fx.gov.1", 1, False,
                                    {"reference_status": "fixture", "mission": {"title": "Fixture mission"}}),
    "authority-repairs-lessons.json": (("fixture-authority",), "2026.fx.authority.1", 2, True,
                                       {"source_evidence": {"commit": "fixture"}}),
    "broadcast-classroom-lessons.json": (("fixture-broadcast",), "2026.fx.broadcast.1", 2, True,
                                         {"source_evidence": {"commit": "fixture"}}),
}
ALL_SLUGS = [slug for slugs, *_ in CURRICULA.values() for slug in slugs]


def fixture_lesson(slug: str, number: int) -> dict:
    question = f"Which step comes first in fixture lesson {number}?"
    choices = [f"First option {number}", f"Second option {number}", f"Third option {number}"]
    explanation = f"{FIXTURE_MARK} {number} for {slug}."
    if number == 0:
        question = "Which café sign is naïve — the first or the last?"
        choices = ["The first – plainly", "The last", "Neither"]
    if number == 1:
        explanation = f'{FIXTURE_MARK} 1: the "draft" path is C:\\fixture, résumé included.'
    return {
        "id": f"fx{number:013d}",
        "slug": slug,
        "title": f"Fixture lesson {number}",
        "summary": "A lesson built for tests.",
        "category": "Fixture",
        "effort_minutes": 10,
        "prerequisites": "",
        "order": number,
        "lesson": {
            "schema_version": 1,
            "outcomes": ["Name the first step."],
            "why": "Tests need a lesson.",
            "preparation": ["Read the fixture."],
            "sections": [{"heading": "Read", "paragraphs": ["Fixture text."]}],
            "exercise": {"prompt": "Do the fixture.", "checklist": ["Done"]},
            "check": {"question": question, "choices": choices, "answer": number % 3, "explanation": explanation},
            "references": [{"label": "Fixture reference", "url": "https://example.org/fixture"}],
        },
    }


def curriculum_docs() -> dict:
    docs, number = {}, 0
    for name, (slugs, version, _indent, _newline, extra) in CURRICULA.items():
        lessons = []
        for slug in slugs:
            lessons.append(fixture_lesson(slug, number))
            number += 1
        if "mission" in extra:
            docs[name] = {"version": version, **extra, "lessons": lessons}
        else:
            docs[name] = {"version": version, "lessons": lessons, **extra}
    return docs


def serialise(name: str, doc: dict) -> str:
    _slugs, _version, indent, newline, _extra = CURRICULA[name]
    return json.dumps(doc, ensure_ascii=False, indent=indent) + ("\n" if newline else "")


def fixture_keys() -> dict:
    return {lesson["slug"]: {"answer": lesson["lesson"]["check"]["answer"],
                             "explanation": lesson["lesson"]["check"]["explanation"]}
            for doc in curriculum_docs().values() for lesson in doc["lessons"]}


class Repo:
    """A throwaway git repository holding a synthetic curriculum and a readiness lock."""

    def __init__(self, test: unittest.TestCase) -> None:
        directory = tempfile.TemporaryDirectory(prefix="lesson-keys-")
        test.addCleanup(directory.cleanup)
        self.base = Path(directory.name)
        self.root = self.base / "repo"
        self.outside = self.base / "outside"
        self.root.mkdir()
        self.outside.mkdir()
        self.git("init", "-q", "-b", "main")

    def git(self, *args: str) -> str:
        return subprocess.run([*GIT, "-C", str(self.root), *args], check=True, capture_output=True,
                              text=True).stdout.strip()

    def path(self, name: str) -> Path:
        return self.root / lk.DATA_DIR / name

    def write(self, relative: str, text: str) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def commit(self, message: str) -> str:
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)
        return self.git("rev-parse", "HEAD")

    def seed(self, docs: dict | None = None, lock_skip: str | None = None) -> str:
        """Commit the keyed curriculum and a readiness lock recording its bytes; return the commit."""
        docs = docs or curriculum_docs()
        sources = {}
        for name, doc in docs.items():
            text = serialise(name, doc)
            self.write(f"{lk.DATA_DIR}/{name}", text)
            if name != lock_skip:
                sources[f"{lk.DATA_DIR}/{name}"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
        self.write(lk.READINESS_LOCK, json.dumps({"contract_sha256": "0" * 64,
                                                  "schema_version": "buildanddo.hostinger-review/v1",
                                                  "sources": sources}, indent=2) + "\n")
        self.write(".gitignore", "private-keys/\n")
        (self.root / "private-keys").mkdir(exist_ok=True)
        return self.commit("keyed fixture curriculum")


class ToolCase(unittest.TestCase):
    def run_tool(self, repo: Repo, *args: str, env: dict | None = None) -> tuple[int, str, str]:
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.dict(os.environ, env or {}), redirect_stdout(stdout), redirect_stderr(stderr):
            code = lk.main([*args, "--root", str(repo.root)])
        out, err = stdout.getvalue(), stderr.getvalue()
        self.assertFalse(any(marker in out or marker in err for marker in MARKERS),
                         "captured tool output holds an explanation")
        return code, out, err

    def report(self, out: str) -> dict:
        return json.loads(out.strip().splitlines()[-1])

    def stripped_repo(self) -> tuple[Repo, str, str]:
        repo = Repo(self)
        keyed = repo.seed()
        code, _out, _err = self.run_tool(repo, "strip", "--write")
        self.assertEqual(code, 0)
        return repo, keyed, repo.commit("strip the fixture keys")

    def export(self, repo: Repo, revision: str, name: str = "keys.json") -> Path:
        out = repo.outside / name
        code, _out, _err = self.run_tool(repo, "export", "--source-rev", revision, "--out", str(out))
        self.assertEqual(code, 0)
        return out


class CanonicalTests(unittest.TestCase):
    def test_canonical_matches_the_javascript_rule(self) -> None:
        value = {"b": [1, "é", True, None], "a": {"z": "\u2028 \n \x01 \"q\" \\"}}
        self.assertEqual(lk.canonical(value),
                         json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
        self.assertEqual(lk.canonical({"b": 1, "a": 2}), '{"a":2,"b":1}')
        self.assertEqual(lk.canonical("\x01é"), '"\\u0001é"')

    def test_property_names_sort_by_utf16_code_unit(self) -> None:
        # U+1F600 is the surrogate pair D83D DE00, which JavaScript sorts before U+FF61.
        self.assertEqual(lk.canonical({"\uff61": 1, "\U0001F600": 2}), '{"\U0001F600":2,"\uff61":1}')

    def test_lone_surrogates_and_fractions_are_refused(self) -> None:
        for value in ("\ud800", {"\udfff": 1}, 1.5):
            with self.assertRaises(lk.Refusal):
                lk.canonical(value)

    def test_binding_covers_question_and_choices_only(self) -> None:
        check = {"question": "Q é", "choices": ["a", "b"], "answer": 1, "explanation": "synthetic"}
        expected = hashlib.sha256('{"choices":["a","b"],"question":"Q é"}'.encode()).hexdigest()
        self.assertEqual(lk.binding(check), expected)
        self.assertEqual(lk.binding({**check, "answer": 0, "explanation": "other"}), expected)
        self.assertNotEqual(lk.binding({**check, "choices": ["a", "c"]}), expected)

    def test_text_rule_counts_utf16_units_and_refuses_blank(self) -> None:
        self.assertTrue(lk.js_text("\U0001F600" * 2500, 5000))
        self.assertFalse(lk.js_text("\U0001F600" * 2501, 5000))
        self.assertFalse(lk.js_text("\u3000 \ufeff\n", 5000))
        self.assertFalse(lk.js_text(7, 5000))
        self.assertTrue(lk.js_text("x", 5000))


class StripTests(ToolCase):
    def test_strip_write_is_minimal_and_round_trips(self) -> None:
        repo = Repo(self)
        keyed = repo.seed()
        os.chmod(repo.path("government-submissions.json"), 0o640)
        before = {name: repo.path(name).read_bytes() for name in CURRICULA}
        code, out, _err = self.run_tool(repo, "strip", "--write")
        self.assertEqual(code, 0)
        self.assertEqual(self.report(out)["stripped"], len(ALL_SLUGS))
        numstat = repo.git("diff", "--numstat", keyed, "--", lk.DATA_DIR).splitlines()
        self.assertEqual(len(numstat), 4)
        for row in numstat:
            added, deleted, path = row.split("\t")
            lessons = len(CURRICULA[Path(path).name][0])
            self.assertEqual((int(added), int(deleted)), (lessons, 3 * lessons), path)
        inserted = [line for line in repo.git("diff", "-U0", keyed, "--", lk.DATA_DIR).splitlines()
                    if line.startswith("+") and not line.startswith("+++")]
        self.assertEqual(len(inserted), len(ALL_SLUGS))
        self.assertTrue(all(re.fullmatch(r"\+\s*\]", line) for line in inserted), "every insertion is a bare ]")
        keys = fixture_keys()
        for name, original in before.items():
            after = repo.path(name).read_bytes()
            text = original.decode("utf-8")
            self.assertEqual(after.endswith(b"\n"), CURRICULA[name][3], name)
            self.assertEqual(json.loads(after), lk.without_keys(json.loads(original)), name)
            merged = lk.merge_text(after.decode("utf-8"), keys, name).encode("utf-8")
            self.assertTrue(merged == text.encode("utf-8"), "merging the keys back gives the original bytes")
        self.assertEqual(os.stat(repo.path("government-submissions.json")).st_mode & 0o777, 0o640)

    def test_strip_check_fails_while_keys_remain_and_write_is_idempotent(self) -> None:
        repo = Repo(self)
        repo.seed()
        code, out, _err = self.run_tool(repo, "strip", "--check")
        self.assertEqual((code, self.report(out)["keyed"]), (1, len(ALL_SLUGS)))
        self.assertEqual(self.run_tool(repo, "strip", "--write")[0], 0)
        stripped = {name: repo.path(name).read_bytes() for name in CURRICULA}
        code, out, _err = self.run_tool(repo, "strip", "--check")
        self.assertEqual((code, self.report(out)["keyed"]), (0, 0))
        code, out, _err = self.run_tool(repo, "strip", "--write")
        self.assertEqual((code, self.report(out)["stripped"]), (0, 0))
        self.assertTrue(all(repo.path(name).read_bytes() == stripped[name] for name in CURRICULA))

    def refused(self, mutate) -> None:
        repo = Repo(self)
        docs = curriculum_docs()
        mutate(docs["starter-tutorials.json"]["lessons"][1]["lesson"])
        repo.seed(docs)
        before = {name: repo.path(name).read_bytes() for name in CURRICULA}
        code, out, err = self.run_tool(repo, "strip", "--write")
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn("starter-tutorials.json", err)
        self.assertTrue(all(repo.path(name).read_bytes() == before[name] for name in CURRICULA),
                        "a refused strip writes nothing")

    def test_strip_refuses_explanation_before_answer(self) -> None:
        def swap(lesson: dict) -> None:
            check = lesson["check"]
            lesson["check"] = {"question": check["question"], "choices": check["choices"],
                               "explanation": check["explanation"], "answer": check["answer"]}
        self.refused(swap)

    def test_strip_refuses_a_check_with_one_key(self) -> None:
        self.refused(lambda lesson: lesson["check"].pop("explanation"))

    def test_strip_refuses_a_partly_stripped_file(self) -> None:
        def strip_one(lesson: dict) -> None:
            lesson["check"].pop("answer")
            lesson["check"].pop("explanation")
        self.refused(strip_one)

    def test_strip_refuses_an_extra_check_member(self) -> None:
        self.refused(lambda lesson: lesson["check"].update(hint="extra member"))

    def test_merge_refuses_keyed_text_and_missing_keys(self) -> None:
        name = "authority-repairs-lessons.json"
        keyed = serialise(name, curriculum_docs()[name])
        with self.assertRaises(lk.Refusal):
            lk.merge_text(keyed, fixture_keys(), name)
        with self.assertRaises(lk.Refusal):
            lk.merge_text(lk.strip_text(keyed, name), {}, name)


class ExportTests(ToolCase):
    def test_export_from_a_revision_writes_mode_0600_outside_the_tree(self) -> None:
        repo, keyed, _head = self.stripped_repo()
        out = repo.outside / "keys.json"
        code, stdout, _err = self.run_tool(repo, "export", "--source-rev", keyed, "--out", str(out))
        self.assertEqual(code, 0)
        self.assertEqual(self.report(stdout)["lessons"], len(ALL_SLUGS))
        self.assertEqual(out.stat().st_mode & 0o777, 0o600)
        doc = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(set(doc), lk.TOP_FIELDS)
        self.assertEqual((doc["schema_version"], doc["synthetic"]), (lk.SCHEMA, False))
        self.assertEqual(doc["source"], {"kind": "git", "revision": keyed})
        self.assertEqual(doc["integrity"], lk.integrity(doc))
        keys = fixture_keys()
        self.assertTrue(all(doc["lessons"][slug]["answer"] == keys[slug]["answer"]
                            and doc["lessons"][slug]["explanation"] == keys[slug]["explanation"] for slug in ALL_SLUGS),
                        "exported keys equal the fixture keys")
        self.assertEqual(self.run_tool(repo, "verify", "--keys", str(out))[0], 0)

    def test_export_refuses_a_revision_without_keys(self) -> None:
        repo, _keyed, head = self.stripped_repo()
        out = repo.outside / "keys.json"
        code, _out, err = self.run_tool(repo, "export", "--source-rev", head, "--out", str(out))
        self.assertEqual(code, 1)
        self.assertIn("carry no key", err)
        self.assertFalse(out.exists())

    def test_export_writes_only_outside_the_tree_or_where_git_ignores(self) -> None:
        repo, keyed, _head = self.stripped_repo()
        lock = repo.root / lk.READINESS_LOCK
        recorded = lock.read_bytes()
        for target in (repo.root / "keys.json", lock, repo.root / lk.DATA_DIR / "keys.json"):
            code, _out, err = self.run_tool(repo, "export", "--source-rev", keyed, "--out", str(target))
            self.assertEqual(code, 1, target.name)
            self.assertIn("git does not ignore", err)
        self.assertFalse((repo.root / "keys.json").exists())
        self.assertEqual(lock.read_bytes(), recorded)
        ignored = repo.root / "private-keys" / "keys.json"
        self.assertEqual(self.run_tool(repo, "export", "--source-rev", keyed, "--out", str(ignored))[0], 0)
        self.assertEqual(ignored.stat().st_mode & 0o777, 0o600)
        self.assertEqual(repo.git("status", "--porcelain"), "")
        missing = repo.outside / "absent-directory" / "keys.json"
        self.assertEqual(self.run_tool(repo, "export", "--source-rev", keyed, "--out", str(missing))[0], 1)

    def database(self, repo: Repo, keyed: bool = True) -> Path:
        path = repo.outside / "data.db"
        connection = sqlite3.connect(path)
        connection.execute("CREATE TABLE tutorials (id TEXT PRIMARY KEY, slug TEXT, curriculum_version TEXT, "
                           "lesson JSON, updated TEXT)")
        for number, (name, doc) in enumerate(curriculum_docs().items()):
            for index, lesson in enumerate(doc["lessons"]):
                body = lesson["lesson"] if keyed else lk.without_keys({"lessons": [lesson]})["lessons"][0]["lesson"]
                connection.execute("INSERT INTO tutorials VALUES (?, ?, ?, ?, ?)",
                                   (f"db{number}{index:012d}", lesson["slug"], doc["version"],
                                    json.dumps(body, ensure_ascii=False), f"2026-10-0{number + 1} 10:00:00.000Z"))
        connection.execute("INSERT INTO tutorials VALUES ('custom000000001', 'custom-lesson', 'custom', '{}', '')")
        connection.execute("INSERT INTO tutorials VALUES ('legacy000000001', '', '', 'null', '')")
        connection.commit()
        connection.close()
        return path

    def test_export_from_a_database_copy_reads_without_writing(self) -> None:
        repo, _keyed, _head = self.stripped_repo()
        database = self.database(repo)
        os.chmod(database, 0o400)
        before = database.read_bytes()
        out = repo.outside / "keys.json"
        code, stdout, _err = self.run_tool(repo, "export", "--from-db", str(database), "--out", str(out))
        self.assertEqual(code, 0)
        self.assertEqual(self.report(stdout)["source"], "pocketbase")
        self.assertEqual(database.read_bytes(), before)
        doc = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(doc["source"], {"kind": "pocketbase", "revision": "2026-10-04 10:00:00.000Z"})
        self.assertEqual(sorted(doc["lessons"]), sorted(ALL_SLUGS))
        self.assertTrue(all(entry["id"].startswith("db") for entry in doc["lessons"].values()))
        self.assertEqual(self.run_tool(repo, "verify", "--keys", str(out), "--require-private")[0], 0)

    def production_like(self, repo: Repo) -> Path:
        """A database copy as production holds it after migrate up: two lessons seeded stripped, one record missing,
        and one stored key that differs from the revision's."""
        database = self.database(repo)
        connection = sqlite3.connect(database)
        for slug in ("fixture-broadcast", "fixture-authority"):
            (text,) = connection.execute("SELECT lesson FROM tutorials WHERE slug = ?", (slug,)).fetchone()
            lesson = json.loads(text)
            for member in lk.KEY_MEMBERS:
                del lesson["check"][member]
            connection.execute("UPDATE tutorials SET lesson = ? WHERE slug = ?", (json.dumps(lesson), slug))
        connection.execute("DELETE FROM tutorials WHERE slug = 'fixture-gov-review'")
        (text,) = connection.execute("SELECT lesson FROM tutorials WHERE slug = 'fixture-signals'").fetchone()
        lesson = json.loads(text)
        lesson["check"]["answer"] = (lesson["check"]["answer"] + 1) % 3
        lesson["check"]["explanation"] = f"{FIXTURE_MARK} held only by this database."
        connection.execute("UPDATE tutorials SET lesson = ? WHERE slug = 'fixture-signals'", (json.dumps(lesson),))
        connection.commit()
        connection.close()
        return database

    def test_a_partial_database_refusal_names_the_lessons_it_lacks(self) -> None:
        repo, _keyed, _head = self.stripped_repo()
        out = repo.outside / "keys.json"
        code, _out, err = self.run_tool(repo, "export", "--from-db", str(self.production_like(repo)), "--out", str(out))
        self.assertEqual(code, 1)
        self.assertIn("2 public lessons have no stored key and 1 have no record", err)
        self.assertIn("fixture-authority, fixture-broadcast, fixture-gov-review", err)
        self.assertIn("--source-rev", err)
        self.assertFalse(out.exists())

    def test_export_fills_a_partial_database_from_a_keyed_revision(self) -> None:
        repo, keyed, head = self.stripped_repo()
        database = self.production_like(repo)
        out = repo.outside / "keys.json"
        code, stdout, _err = self.run_tool(
            repo, "export", "--from-db", str(database), "--source-rev", keyed, "--out", str(out))
        self.assertEqual(code, 0)
        result = self.report(stdout)
        self.assertEqual(
            {name: result[name] for name in ("state", "lessons", "source", "from_db", "from_rev", "from_rev_slugs",
                                             "differs_from_rev", "differs_slugs")},
            {"state": "OK", "lessons": 7, "source": "pocketbase", "from_db": 4, "from_rev": 3,
             "from_rev_slugs": ["fixture-authority", "fixture-broadcast", "fixture-gov-review"],
             "differs_from_rev": 1, "differs_slugs": ["fixture-signals"]})
        self.assertEqual(out.stat().st_mode & 0o777, 0o600)
        doc = json.loads(out.read_text(encoding="utf-8"))
        keys = fixture_keys()
        # The database's own key wins where it holds one: the resolver refuses a file entry that disagrees with it.
        self.assertTrue(doc["lessons"]["fixture-signals"]["answer"] != keys["fixture-signals"]["answer"]
                        and doc["lessons"]["fixture-signals"]["explanation"].endswith("held only by this database."),
                        "the database key is kept")
        self.assertTrue(all(doc["lessons"][slug]["answer"] == keys[slug]["answer"]
                            and doc["lessons"][slug]["explanation"] == keys[slug]["explanation"]
                            for slug in result["from_rev_slugs"]), "lessons the database lacks come from the revision")
        self.assertEqual(self.run_tool(repo, "verify", "--keys", str(out), "--require-private")[0], 0)
        # A revision that carries no keys cannot fill the gap.
        code, _out, err = self.run_tool(
            repo, "export", "--from-db", str(database), "--source-rev", head, "--out", str(repo.outside / "other.json"))
        self.assertEqual(code, 1)
        self.assertIn("carry no key", err)

    def test_export_refuses_a_database_without_keys(self) -> None:
        repo, _keyed, _head = self.stripped_repo()
        out = repo.outside / "keys.json"
        database = self.database(repo, keyed=False)
        code, _out, err = self.run_tool(repo, "export", "--from-db", str(database), "--out", str(out))
        self.assertEqual(code, 1)
        self.assertIn("no stored key", err)
        empty = repo.outside / "empty.db"
        sqlite3.connect(empty).close()
        for source in (empty, repo.outside / "absent.db"):
            self.assertEqual(self.run_tool(repo, "export", "--from-db", str(source), "--out", str(out))[0], 1)
        self.assertFalse(out.exists())


class VerifyTests(ToolCase):
    def setUp(self) -> None:
        self.repo, self.keyed, _head = self.stripped_repo()
        self.keys = self.export(self.repo, self.keyed)
        self.doc = json.loads(self.keys.read_text(encoding="utf-8"))

    def write_variant(self, mutate, fix_integrity: bool = True) -> Path:
        doc = json.loads(json.dumps(self.doc))
        mutate(doc)
        if fix_integrity and isinstance(doc.get("lessons"), dict):
            try:
                doc["integrity"] = lk.integrity(doc)
            except (lk.Refusal, KeyError):
                pass
        path = self.repo.outside / "variant.json"
        path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        return path

    def verify(self, path: Path, *flags: str) -> tuple[int, dict]:
        code, out, _err = self.run_tool(self.repo, "verify", "--keys", str(path), *flags)
        return code, self.report(out)

    def test_a_good_file_passes_with_counts_only(self) -> None:
        code, result = self.verify(self.keys)
        self.assertEqual(code, 0)
        expected = {"state": "OK", "schema": True, "integrity": True, "lessons": 7, "public": 7, "bound": 7,
                    "version_match": 7, "in_range": 7, "missing": 0, "extra": 0, "malformed": 0}
        self.assertEqual({name: result[name] for name in expected}, expected)

    def test_an_absent_or_empty_file_is_blocked(self) -> None:
        empty = self.repo.outside / "empty.json"
        empty.write_bytes(b"")
        for path in (str(self.repo.outside / "absent.json"), str(empty), ""):
            code, out, _err = self.run_tool(self.repo, "verify", "--keys", path)
            self.assertEqual((code, self.report(out)["state"]), (3, "BLOCKED"), path)

    def test_each_check_fails_on_its_own(self) -> None:
        first = ALL_SLUGS[0]

        def entry(**changes):
            return lambda doc: doc["lessons"][first].update(changes)

        cases = [
            ("schema_version", lambda doc: doc.update(schema_version="buildanddo.lesson-keys/0"), True, "schema"),
            ("top member", lambda doc: doc.update(note="extra"), True, "schema"),
            ("source kind", lambda doc: doc["source"].update(kind="mail"), True, "schema"),
            ("entry member", entry(hint="extra"), True, "malformed"),
            ("integrity", entry(answer=(self.doc["lessons"][first]["answer"] + 1) % 3), False, "integrity"),
            ("missing slug", lambda doc: doc["lessons"].pop(first), True, "missing"),
            ("extra slug", lambda doc: doc["lessons"].update({"fixture-extra": doc["lessons"][first]}), True, "extra"),
            ("version", entry(curriculum_version="2026.fx.0"), True, "version_match"),
            ("binding", entry(check_sha256="0" * 64), True, "bound"),
            ("range", entry(answer=3), True, "in_range"),
            ("boolean answer", entry(answer=True), True, "malformed"),
            ("answer above five", entry(answer=6), True, "malformed"),
            ("blank explanation", entry(explanation=" \n"), True, "malformed"),
            ("long explanation", entry(explanation="x" * 5001), True, "malformed"),
            ("bad slug", lambda doc: doc["lessons"].update({"Not A Slug": doc["lessons"][first]}), True, "malformed"),
        ]
        for label, mutate, fix, field in cases:
            with self.subTest(label):
                code, result = self.verify(self.write_variant(mutate, fix))
                self.assertEqual((code, result["state"]), (1, "FAIL"))
                if field in ("schema", "integrity"):
                    self.assertFalse(result[field])
                elif field in ("missing", "extra", "malformed"):
                    self.assertGreater(result[field], 0)
                else:
                    self.assertLess(result[field], result["public"])

    def test_unparseable_duplicate_and_oversize_files_fail(self) -> None:
        path = self.repo.outside / "variant.json"
        for raw, field in ((b"{not json", "parse"), (b'{"lessons": {}, "lessons": {}}', "parse"),
                           (b"{" + b" " * (256 * 1024) + b"}", "bytes_ok")):
            path.write_bytes(raw)
            code, result = self.verify(path)
            self.assertEqual(code, 1)
            self.assertFalse(result[field])

    def test_synthetic_needs_the_opt_in_and_never_passes_as_private(self) -> None:
        synthetic = self.repo.outside / "synthetic.json"
        self.assertEqual(self.run_tool(self.repo, "synthetic", "--out", str(synthetic))[0], 0)
        code, result = self.verify(synthetic)
        self.assertEqual((code, result.get("synthetic_refused")), (1, True))
        self.assertEqual(self.verify(synthetic, "--allow-synthetic")[0], 0)
        code, result = self.verify(synthetic, "--require-private")
        self.assertEqual((code, result["private"]), (1, False))
        doc = json.loads(synthetic.read_text(encoding="utf-8"))
        # The seal covers the label and the source, so neither can change without resealing.
        for change in ({"synthetic": False}, {"source": {"kind": "git", "revision": "0" * 40}}):
            with self.subTest(changed=sorted(change)):
                synthetic.write_text(json.dumps({**doc, **change}), encoding="utf-8")
                for flags in ((), ("--allow-synthetic",), ("--require-private",)):
                    code, result = self.verify(synthetic, *flags)
                    self.assertEqual((code, result["integrity"]), (1, False), flags)
        # Resealed, a relabelled file still carries placeholder explanations, so it is still synthetic.
        relabelled = {**doc, "synthetic": False, "source": {"kind": "git", "revision": "0" * 40}}
        relabelled["integrity"] = lk.integrity(relabelled)
        synthetic.write_text(json.dumps(relabelled), encoding="utf-8")
        code, result = self.verify(synthetic)
        self.assertEqual((code, result["integrity"], result["synthetic"], result.get("synthetic_refused")), (1, True, True, True))
        self.assertEqual(self.verify(synthetic, "--allow-synthetic")[0], 0)
        code, result = self.verify(synthetic, "--require-private")
        self.assertEqual((code, result["private"]), (1, False), "a relabelled synthetic file is not private")

    def test_the_seal_covers_the_label_the_source_and_every_entry(self) -> None:
        seals = {lk.integrity(self.doc)}
        for change in ({"synthetic": True}, {"source": {**self.doc["source"], "revision": "0" * 40}},
                       {"source": {**self.doc["source"], "kind": "pocketbase"}},
                       {"lessons": {**self.doc["lessons"], ALL_SLUGS[0]: {**self.doc["lessons"][ALL_SLUGS[0]],
                                                                     "answer": (self.doc["lessons"][ALL_SLUGS[0]]["answer"] + 1) % 3}}}):
            seals.add(lk.integrity({**self.doc, **change}))
        self.assertEqual(len(seals), 5, "every sealed member changes the seal")
        self.assertEqual(lk.integrity({**self.doc, "integrity": "0" * 64}), lk.integrity(self.doc), "the seal never covers itself")

    def test_require_private_wants_a_full_commit_for_a_git_source(self) -> None:
        path = self.write_variant(lambda doc: doc["source"].update(revision="main"))
        self.assertEqual(self.verify(path)[0], 0)
        self.assertEqual(self.verify(path, "--require-private")[0], 1)
        self.assertEqual(self.verify(self.keys, "--require-private")[0], 0)


class OracleTests(ToolCase):
    def test_against_rev_proves_byte_identity(self) -> None:
        repo, keyed, _head = self.stripped_repo()
        keys = self.export(repo, keyed)
        code, out, _err = self.run_tool(repo, "verify", "--keys", str(keys), "--require-private", "--against-rev", keyed)
        result = self.report(out)
        self.assertEqual((code, result["strip_equal"], result["lock_match"]), (0, "4/4", "4/4"))

    def tampered(self, repo: Repo, keys: Path, slug: str, **changes) -> Path:
        doc = json.loads(keys.read_text(encoding="utf-8"))
        doc["lessons"][slug].update(changes)
        doc["integrity"] = lk.integrity(doc)
        path = repo.outside / "tampered.json"
        path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
        return path

    def test_against_rev_catches_a_changed_key_that_passes_every_other_check(self) -> None:
        repo, keyed, _head = self.stripped_repo()
        keys = self.export(repo, keyed)
        slug = "fixture-authority"
        answer = json.loads(keys.read_text(encoding="utf-8"))["lessons"][slug]["answer"]
        for changes in ({"explanation": f"{FIXTURE_MARK} rewritten."}, {"answer": (answer + 1) % 3}):
            with self.subTest(min(changes)):
                path = self.tampered(repo, keys, slug, **changes)
                self.assertEqual(self.run_tool(repo, "verify", "--keys", str(path))[0], 0)
                code, out, _err = self.run_tool(repo, "verify", "--keys", str(path), "--against-rev", keyed)
                result = self.report(out)
                self.assertEqual((code, result["strip_equal"], result["lock_match"]), (1, "4/4", "3/4"))

    def test_against_rev_catches_a_changed_public_byte(self) -> None:
        repo, keyed, _head = self.stripped_repo()
        keys = self.export(repo, keyed)
        path = repo.path("starter-tutorials.json")
        path.write_text(path.read_text(encoding="utf-8").replace("Fixture lesson 2", "Fixture lesson two"),
                        encoding="utf-8")
        repo.commit("edit a public title")
        code, out, _err = self.run_tool(repo, "verify", "--keys", str(keys), "--against-rev", keyed)
        result = self.report(out)
        self.assertEqual((code, result["strip_equal"], result["lock_match"]), (1, "3/4", "3/4"))

    def test_against_rev_needs_the_recorded_lock(self) -> None:
        repo = Repo(self)
        keyed = repo.seed(lock_skip="broadcast-classroom-lessons.json")
        self.assertEqual(self.run_tool(repo, "strip", "--write")[0], 0)
        repo.commit("strip")
        keys = self.export(repo, keyed)
        code, out, _err = self.run_tool(repo, "verify", "--keys", str(keys), "--against-rev", keyed)
        result = self.report(out)
        self.assertEqual((code, result["strip_equal"], result["lock_match"]), (1, "4/4", "3/4"))

    def test_against_rev_refuses_an_unknown_revision(self) -> None:
        repo, keyed, _head = self.stripped_repo()
        keys = self.export(repo, keyed)
        code, _out, err = self.run_tool(repo, "verify", "--keys", str(keys), "--against-rev", "no-such-revision")
        self.assertEqual(code, 1)
        self.assertIn("rev-parse", err)


class SyntheticTests(ToolCase):
    def test_synthetic_follows_the_published_formula(self) -> None:
        repo, _keyed, _head = self.stripped_repo()
        out = repo.outside / "synthetic.json"
        code, stdout, _err = self.run_tool(repo, "synthetic", "--out", str(out))
        self.assertEqual((code, self.report(stdout)["lessons"]), (0, len(ALL_SLUGS)))
        self.assertEqual(out.stat().st_mode & 0o777, 0o600)
        raw = out.read_bytes()
        doc = json.loads(raw)
        self.assertEqual(raw, (json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8"))
        self.assertEqual((doc["synthetic"], doc["source"]), (True, {"kind": "git", "revision": "worktree"}))
        for slug in ALL_SLUGS:
            entry = doc["lessons"][slug]
            expected = int(hashlib.sha256(f"synthetic:{slug}".encode()).hexdigest()[:8], 16) % 3
            self.assertTrue(entry["answer"] == expected, "synthetic answer follows the formula")
            self.assertTrue(entry["explanation"] == f"SYNTHETIC FIXTURE: explanation placeholder for {slug}.",
                            "synthetic explanation is the labelled placeholder")
        again = repo.outside / "again.json"
        self.assertEqual(self.run_tool(repo, "synthetic", "--out", str(again))[0], 0)
        self.assertEqual(again.read_bytes(), raw)

    def test_a_salt_changes_the_answers(self) -> None:
        repo, _keyed, _head = self.stripped_repo()
        first, second = repo.outside / "a.json", repo.outside / "b.json"
        self.assertEqual(self.run_tool(repo, "synthetic", "--out", str(first))[0], 0)
        self.assertEqual(self.run_tool(repo, "synthetic", "--out", str(second), "--salt", "second")[0], 0)
        answers = [{slug: entry["answer"] for slug, entry in json.loads(path.read_text())["lessons"].items()}
                   for path in (first, second)]
        self.assertTrue(answers[0] != answers[1], "a different salt gives a different answer set")
        for path in (first, second):
            self.assertEqual(self.run_tool(repo, "verify", "--keys", str(path), "--allow-synthetic")[0], 0)

    def test_synthetic_refuses_a_tracked_output_path(self) -> None:
        repo, _keyed, _head = self.stripped_repo()
        self.assertEqual(self.run_tool(repo, "synthetic", "--out", str(repo.root / "synthetic.json"))[0], 1)
        self.assertFalse((repo.root / "synthetic.json").exists())

    def test_the_tool_runs_isolated(self) -> None:
        repo, _keyed, _head = self.stripped_repo()
        out = repo.outside / "isolated.json"
        for args in (["--help"], ["synthetic", "--root", str(repo.root), "--out", str(out)]):
            result = subprocess.run([sys.executable, "-I", str(TOOL), *args], capture_output=True, text=True,
                                    cwd=repo.base, check=False)
            self.assertEqual(result.returncode, 0, args[0])
            self.assertFalse(any(marker in result.stdout + result.stderr for marker in MARKERS),
                             "isolated run output holds an explanation")
        self.assertTrue(out.is_file())


class DigestServer(http.server.ThreadingHTTPServer):
    digests: dict[str, str | None]


class DigestHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        match = re.fullmatch(r"/api/v1/public/challenges/([a-z0-9-]+)/state", self.path)
        state = self.server.digests.get(match.group(1), "missing") if match else "missing"
        status, body = (404, {"state": "UNKNOWN"}) if state == "missing" else (
            (500, {"state": "ERROR"}) if state == "error" else (200, {"content_digest": state}))
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args) -> None:
        pass


class DigestTests(ToolCase):
    def setUp(self) -> None:
        self.repo, _keyed, _head = self.stripped_repo()
        self.server = DigestServer(("localhost", 0), DigestHandler)
        self.server.digests = {slug: hashlib.sha256(f"fixture-digest:{slug}".encode()).hexdigest()
                               for slug in ALL_SLUGS}
        self.server.digests[ALL_SLUGS[-1]] = None
        self.server.digests.pop(ALL_SLUGS[-2])
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.origin = f"http://localhost:{self.server.server_address[1]}"
        self.env = {"NO_PROXY": "*", "no_proxy": "*"}

    def digests(self, *args: str) -> tuple[int, dict, str]:
        code, out, _err = self.run_tool(self.repo, "digests", "--base-url", self.origin, *args, env=self.env)
        published = [value for value in self.server.digests.values() if value and len(value) == 64]
        self.assertFalse(any(value in out for value in published), "digest values are not printed")
        return code, self.report(out) if out else {}, out

    def test_capture_then_compare_unchanged(self) -> None:
        baseline = self.repo.outside / "digests.json"
        code, result, _out = self.digests("--out", str(baseline))
        self.assertEqual((code, result["published"], result["unavailable"], result["missing"]), (0, 5, 1, 1))
        self.assertEqual(baseline.stat().st_mode & 0o777, 0o600)
        recorded = json.loads(baseline.read_text())
        self.assertEqual(recorded["schema_version"], lk.DIGEST_SCHEMA)
        self.assertEqual(sorted(recorded["digests"]), sorted(ALL_SLUGS))
        code, result, _out = self.digests("--compare", str(baseline))
        self.assertEqual((code, result["same"], result["changed"], result["lost"]), (0, 5, 0, 0))

    def test_compare_reports_changed_and_lost_lessons(self) -> None:
        baseline = self.repo.outside / "digests.json"
        self.assertEqual(self.digests("--out", str(baseline))[0], 0)
        self.server.digests[ALL_SLUGS[0]] = "f" * 64
        self.server.digests[ALL_SLUGS[1]] = None
        code, result, _out = self.digests("--compare", str(baseline))
        self.assertEqual((code, result["changed"], result["lost"]), (1, 1, 1))
        self.assertEqual((result["changed_slugs"], result["lost_slugs"]), ([ALL_SLUGS[0]], [ALL_SLUGS[1]]))

    def test_capture_refuses_errors_bad_origins_and_tracked_paths(self) -> None:
        self.server.digests[ALL_SLUGS[0]] = "error"
        baseline = self.repo.outside / "digests.json"
        code, result, _out = self.digests("--out", str(baseline))
        self.assertEqual((code, result["errors"]), (1, 1))
        self.assertFalse(baseline.exists())
        for origin in ("ftp://localhost", f"{self.origin}/api"):
            code, _out, err = self.run_tool(self.repo, "digests", "--base-url", origin, "--out", str(baseline))
            self.assertEqual(code, 1)
            self.assertIn("origin", err)
        code, _out, _err = self.run_tool(self.repo, "digests", "--base-url", self.origin, "--out",
                                         str(self.repo.root / "digests.json"), env=self.env)
        self.assertEqual(code, 1)

    def test_a_missing_baseline_is_blocked(self) -> None:
        code, result, _out = self.digests("--compare", str(self.repo.outside / "absent.json"))
        self.assertEqual((code, result["state"]), (3, "BLOCKED"))


if __name__ == "__main__":
    unittest.main()
