#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/lesson_keys.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     none (standard library only, so it runs under python3 -I)
# EnumType:    Service
# EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/data/starter-tutorials.json;
#              CONSUMES apps/pocketbase/pb_migrations/data/government-submissions.json;
#              CONSUMES apps/pocketbase/pb_migrations/data/authority-repairs-lessons.json;
#              CONSUMES apps/pocketbase/pb_migrations/data/broadcast-classroom-lessons.json;
#              CONSUMES .bits/hostinger-readiness.lock.json; VERIFIED_BY tests/upgrade/test_lesson_keys.py
# Intent:      Export, verify, synthesise and strip knowledge-check answer keys without ever printing
#              one, so the private key file and the public curriculum can be proved to agree.
# ───────────────────────────────────────────────────────────────
"""lesson_keys.py - private knowledge-check keys, handled without printing one.

A knowledge check's answer index and explanation are private golden data
(SRS-BUILDANDDO-CURRICULUM-PRIVATE-001). The public curriculum files keep each
lesson's question and choices. A private key file supplies the rest, and
PocketBase reads it at runtime. This tool produces and checks that file.

Key file, schema ``buildanddo.lesson-keys/1``::

    {"schema_version": "buildanddo.lesson-keys/1", "synthetic": false,
     "source": {"kind": "git" | "pocketbase", "revision": "..."},
     "integrity": "<sha256 of canonical({lessons, source, synthetic})>",
     "lessons": {"<slug>": {"id", "curriculum_version", "check_sha256",
                            "answer", "explanation"}}}

``check_sha256`` binds an entry to the public text it grades: sha256 over the
UTF-8 of canonical({question, choices}). canonical() is the rule
workspace-access.js uses: keys sorted, compact separators, non-ASCII kept, and
lone surrogates refused. ``integrity`` seals every member a reader trusts, so
neither the ``synthetic`` label nor the source can be edited without resealing.
A file is synthetic when it is labelled so or when any explanation starts with
the fixture placeholder prefix; every reader treats it the same way.

    lesson_keys.py export (--source-rev REV | --from-db DATA_DB_COPY [--source-rev REV]) --out FILE
        keys from a git revision that still carries them, or from a copy of a
        PocketBase data.db opened read-only; with both, the database's own key
        wins and the revision fills every public lesson the copy holds no key for
    lesson_keys.py verify --keys FILE [--require-private | --allow-synthetic] [--against-rev REV]
        schema, integrity, coverage, version, binding, range; --against-rev also
        proves that stripping REV gives HEAD and that HEAD plus the keys gives
        back the bytes the readiness lock recorded at REV
    lesson_keys.py synthetic --out FILE [--salt synthetic]
        labelled fixture keys built from public data only
    lesson_keys.py strip (--write | --check)
        remove the keys from the four tracked curriculum files, with a
        round-trip proof, or check that none remain
    lesson_keys.py digests --base-url ORIGIN (--out FILE | --compare FILE)
        capture or compare the public content_digest of every public lesson

Output is counts, booleans and lesson slugs, never an answer, an explanation or
a hash of either. Key and digest files are written atomically with mode 0600,
and only outside the work tree or to a path git ignores. Exit 0 is OK, 1 is a
failure, 3 is BLOCKED (a key or baseline file that is absent or empty).
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, NamedTuple

SCHEMA = "buildanddo.lesson-keys/1"
DIGEST_SCHEMA = "buildanddo.lesson-digests/1"
DATA_DIR = "apps/pocketbase/pb_migrations/data"
CURRICULA = (
    "starter-tutorials.json",
    "government-submissions.json",
    "authority-repairs-lessons.json",
    "broadcast-classroom-lessons.json",
)
READINESS_LOCK = ".bits/hostinger-readiness.lock.json"
KEY_MEMBERS = ("answer", "explanation")
TOP_FIELDS = frozenset({"schema_version", "synthetic", "source", "integrity", "lessons"})
ENTRY_FIELDS = frozenset({"id", "curriculum_version", "check_sha256", "answer", "explanation"})
SOURCE_FIELDS = frozenset({"kind", "revision"})
SOURCE_KINDS = ("git", "pocketbase")
SYNTHETIC_PREFIX = "SYNTHETIC FIXTURE:"
SYNTHETIC_REVISION = "worktree"
# The same limits the runtime resolver applies, so a file this tool passes is one PocketBase loads.
MAX_FILE_BYTES = 256 * 1024
MAX_ENTRIES = 500
MAX_ANSWER = 5
MAX_EXPLANATION = 5000
MAX_RESPONSE = 1024 * 1024
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
RECORD_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")
HEX64 = re.compile(r"[0-9a-f]{64}")
HEX40 = re.compile(r"[0-9a-f]{40}")
REVISION = re.compile(r"[A-Za-z0-9 :._+-]{0,64}")
ORIGIN = re.compile(r"https?://[A-Za-z0-9.-]+(?::[0-9]{1,5})?")
# ECMAScript WhiteSpace and LineTerminator: what String.prototype.trim() removes.
JS_SPACE = frozenset("\t\n\v\f\r          "
                     "        　﻿")
EXIT_OK, EXIT_FAIL, EXIT_BLOCKED = 0, 1, 3


class Refusal(Exception):
    """A refusal whose message names files, slugs and counts only."""


class Blocked(Exception):
    """An input file that is absent or empty."""


# ---- canonical form and bindings -------------------------------------------------------------

def _string(value: str) -> str:
    if any(0xD800 <= ord(char) <= 0xDFFF for char in value):
        raise Refusal("a string holds a lone surrogate, which has no canonical form")
    return json.dumps(value, ensure_ascii=False)


def canonical(value: Any, depth: int = 0) -> str:
    """workspace-access.js canonical(): sorted keys, compact separators, non-ASCII kept."""
    if depth > 6:
        raise Refusal("nesting exceeds the canonical format")
    if isinstance(value, bool) or value is None:
        return json.dumps(value)
    if isinstance(value, str):
        return _string(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, list):
        return "[" + ",".join(canonical(item, depth + 1) for item in value) + "]"
    if isinstance(value, dict):
        quoted = {name: _string(name) for name in value}
        # JavaScript sorts property names by UTF-16 code unit, so this does too.
        names = sorted(value, key=lambda name: name.encode("utf-16-be"))
        return "{" + ",".join(quoted[name] + ":" + canonical(value[name], depth + 1) for name in names) + "}"
    raise Refusal("only strings, whole numbers, booleans, null, lists and objects have a canonical form")


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def binding(check: dict) -> str:
    """The public text an entry grades: sha256 of canonical({question, choices})."""
    return sha256_text(canonical({"question": check["question"], "choices": check["choices"]}))


def integrity(doc: dict) -> str:
    """The seal: sha256 of canonical({lessons, source, synthetic}). It covers the label, so a relabel breaks it."""
    return sha256_text(canonical({"lessons": doc["lessons"], "source": doc["source"], "synthetic": doc["synthetic"]}))


def placeholders(lessons: dict) -> int:
    """How many entries carry the fixture placeholder explanation; any at all makes the file synthetic."""
    return sum(isinstance(entry, dict) and isinstance(entry.get("explanation"), str)
               and entry["explanation"].startswith(SYNTHETIC_PREFIX) for entry in lessons.values())


def js_length(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def js_text(value: Any, maximum: int) -> bool:
    """workflow-policy.js text(): a string within maximum UTF-16 units that is not blank."""
    return isinstance(value, str) and js_length(value) <= maximum and any(char not in JS_SPACE for char in value)


def is_answer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= MAX_ANSWER


# ---- strict JSON -----------------------------------------------------------------------------

def _pairs(pairs: list) -> dict:
    result: dict = {}
    for name, value in pairs:
        if name in result:
            raise Refusal("a JSON object repeats a member name")
        result[name] = value
    return result


def _constant(_name: str) -> Any:
    raise Refusal("JSON holds NaN or Infinity")


def loads(text: str) -> Any:
    try:
        return json.loads(text, object_pairs_hook=_pairs, parse_constant=_constant)
    except json.JSONDecodeError as error:
        raise Refusal(f"not valid JSON (line {error.lineno}, column {error.colno})") from None


def decode(raw: bytes, name: str) -> str:
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        raise Refusal(f"{name} is not UTF-8") from None


# ---- curriculum text: strip and merge --------------------------------------------------------

CHECK_OPEN = re.compile(r'( *)"check": \{')
CHECK_MEMBER = re.compile(r'\s*"check"\s*:')
QUESTION = re.compile(r'( +)"question": ".*",')


class Block(NamedTuple):
    """One knowledge check in a curriculum file: member indentation, the line closing its choices."""

    indent: str
    close_choices: int
    keyed: bool


def parse_curriculum(text: str, name: str) -> dict:
    doc = loads(text)
    if not isinstance(doc, dict) or not isinstance(doc.get("version"), str) or not isinstance(doc.get("lessons"), list):
        raise Refusal(f"{name} is not a curriculum (version and lessons)")
    for index, lesson in enumerate(doc["lessons"]):
        body = lesson.get("lesson") if isinstance(lesson, dict) else None
        check = body.get("check") if isinstance(body, dict) else None
        if not isinstance(check, dict) or not isinstance(lesson.get("slug"), str):
            raise Refusal(f"{name} lesson {index + 1} has no slug or no knowledge check")
        if not isinstance(check.get("question"), str) or not isinstance(check.get("choices"), list):
            raise Refusal(f"{name} lesson {index + 1} check has no question or choices")
    return doc


def _blocks(text: str, doc: dict, name: str) -> list[Block]:
    """Every check, located by line, each proved to parse to its lesson's check."""
    lines = text.split("\n")
    lessons = doc["lessons"]
    blocks: list[Block] = []
    for number, line in enumerate(lines):
        opened = CHECK_OPEN.fullmatch(line)
        if not opened:
            if CHECK_MEMBER.match(line):
                raise Refusal(f"{name} line {number + 1}: a check member is not laid out as one object")
            continue
        outer = opened.group(1)
        where = f"{name} check {len(blocks) + 1}"
        question = QUESTION.fullmatch(lines[number + 1]) if number + 1 < len(lines) else None
        if not question or len(question.group(1)) <= len(outer):
            raise Refusal(f"{where}: the question is not the first member on its own line")
        indent = question.group(1)
        if number + 2 >= len(lines) or lines[number + 2] != indent + '"choices": [':
            raise Refusal(f"{where}: the choices list does not follow the question")
        cursor = number + 3
        item = re.compile(re.escape(indent) + r' +".*",?')
        while cursor < len(lines) and item.fullmatch(lines[cursor]):
            cursor += 1
        if cursor >= len(lines) or cursor == number + 3:
            raise Refusal(f"{where}: the choices list is empty or unterminated")
        closing_line = re.compile(re.escape(outer) + r"\},?")
        if lines[cursor] == indent + "]":
            keyed, closing = False, cursor + 1
        elif lines[cursor] == indent + "],":
            answer = cursor + 1 < len(lines) and re.fullmatch(
                re.escape(indent) + r'"answer": (?:0|[1-9][0-9]*),', lines[cursor + 1])
            explanation = cursor + 2 < len(lines) and re.fullmatch(
                re.escape(indent) + r'"explanation": ".*"', lines[cursor + 2])
            if not answer or not explanation:
                raise Refusal(f"{where}: the members after the choices are not exactly answer then explanation")
            keyed, closing = True, cursor + 3
        else:
            raise Refusal(f"{where}: the choices list is not closed at the member indentation")
        if closing >= len(lines) or not closing_line.fullmatch(lines[closing]):
            raise Refusal(f"{where}: the check does not close after its last member")
        if len(blocks) >= len(lessons):
            raise Refusal(f"{name} has more checks than lessons")
        body = loads("{" + "\n".join(lines[number + 1:closing]) + "\n}")
        if body != lessons[len(blocks)]["lesson"]["check"]:
            raise Refusal(f"{where}: the text does not parse to lesson {len(blocks) + 1}'s check")
        blocks.append(Block(indent, cursor, keyed))
    if len(blocks) != len(lessons):
        raise Refusal(f"{name} has {len(blocks)} checks for {len(lessons)} lessons")
    return blocks


def strip_text(text: str, name: str = "curriculum") -> str:
    """Remove every answer and explanation member, and the comma that preceded them."""
    doc = parse_curriculum(text, name)
    blocks = _blocks(text, doc, name)
    if not all(block.keyed for block in blocks):
        raise Refusal(f"{name}: every check must carry both keys before it is stripped")
    lines = text.split("\n")
    for block in reversed(blocks):
        lines[block.close_choices:block.close_choices + 3] = [block.indent + "]"]
    return "\n".join(lines)


def merge_text(text: str, keys: dict, name: str = "curriculum") -> str:
    """Put each lesson's answer and explanation back, at the choices indentation."""
    doc = parse_curriculum(text, name)
    blocks = _blocks(text, doc, name)
    if any(block.keyed for block in blocks):
        raise Refusal(f"{name}: a check already carries keys")
    lines = text.split("\n")
    expected = copy.deepcopy(doc)
    for index in reversed(range(len(blocks))):
        block, slug = blocks[index], doc["lessons"][index]["slug"]
        key = keys.get(slug)
        if not isinstance(key, dict) or not is_answer(key.get("answer")) or not isinstance(key.get("explanation"), str):
            raise Refusal(f"{name}: no usable key for {_slug(slug)}")
        explanation = json.dumps(key["explanation"], ensure_ascii=False)
        lines[block.close_choices:block.close_choices + 1] = [
            block.indent + "],",
            block.indent + f'"answer": {key["answer"]},',
            block.indent + '"explanation": ' + explanation,
        ]
        expected["lessons"][index]["lesson"]["check"].update(answer=key["answer"], explanation=key["explanation"])
    result = "\n".join(lines)
    if loads(result) != expected:
        raise Refusal(f"{name}: the merged text does not parse to the curriculum plus its keys")
    return result


def without_keys(doc: dict) -> dict:
    result = copy.deepcopy(doc)
    for lesson in result["lessons"]:
        for member in KEY_MEMBERS:
            lesson["lesson"]["check"].pop(member, None)
    return result


def keys_of(doc: dict, name: str) -> dict:
    """{slug: {answer, explanation}} from a keyed curriculum; refuses a lesson with neither or one."""
    result, missing = {}, 0
    for lesson in doc["lessons"]:
        check = lesson["lesson"]["check"]
        present = [member in check for member in KEY_MEMBERS]
        if not any(present):
            missing += 1
            continue
        if not all(present) or not is_answer(check["answer"]) or not isinstance(check["explanation"], str):
            raise Refusal(f"{name}: {_slug(lesson['slug'])} carries an incomplete or malformed key")
        result[lesson["slug"]] = {"answer": check["answer"], "explanation": check["explanation"]}
    if missing:
        raise Refusal(f"{name}: {missing} of {len(doc['lessons'])} lessons carry no key")
    return result


def _slug(value: Any) -> str:
    """A slug safe to print: the slug itself when it is one, otherwise a placeholder."""
    return value if isinstance(value, str) and len(value) <= 80 and SLUG.fullmatch(value) else "<invalid slug>"


# ---- repository access -----------------------------------------------------------------------

def git(root: Path, *args: str) -> bytes:
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, check=False)
    if result.returncode != 0:
        raise Refusal(f"git {args[0]} failed with exit {result.returncode}")
    return result.stdout


def commit_of(root: Path, revision: str) -> str:
    if not revision or revision.startswith("-"):
        raise Refusal("name a revision")
    return git(root, "rev-parse", "--verify", "--quiet", revision + "^{commit}").decode().strip()


def read_curriculum(root: Path, name: str) -> str:
    try:
        return decode((root / DATA_DIR / name).read_bytes(), name)
    except OSError:
        raise Refusal(f"{name} is not readable") from None


def public_lessons(root: Path) -> dict:
    """{slug: {id, version, check}} for the four curricula in the work tree."""
    lessons: dict = {}
    for name in CURRICULA:
        doc = parse_curriculum(read_curriculum(root, name), name)
        for lesson in doc["lessons"]:
            slug = lesson["slug"]
            if slug in lessons:
                raise Refusal(f"{_slug(slug)} appears in two curricula")
            lessons[slug] = {"id": lesson.get("id"), "version": doc["version"], "check": lesson["lesson"]["check"]}
    return lessons


def guard_out(root: Path, out: str) -> Path:
    """A key or digest file goes outside the work tree, or to a path git ignores."""
    if not out:
        raise Refusal("name an output file")
    target = Path(out).expanduser()
    if not target.is_absolute():
        target = Path.cwd() / target
    try:
        parent = target.parent.resolve(strict=True)
    except OSError:
        raise Refusal("the output directory does not exist") from None
    target = parent / target.name
    if target.is_symlink() or target.is_dir():
        raise Refusal("the output path is a directory or a symbolic link")
    top = subprocess.run(["git", "-C", str(root), "rev-parse", "--show-toplevel"], capture_output=True, check=False)
    tree = Path(top.stdout.decode().strip()).resolve() if top.returncode == 0 else root.resolve()
    try:
        relative = target.relative_to(tree)
    except ValueError:
        return target
    ignored = subprocess.run(["git", "-C", str(tree), "check-ignore", "-q", "--", str(relative)],
                             capture_output=True, check=False)
    if ignored.returncode != 0:
        raise Refusal("the output path is inside the work tree and git does not ignore it")
    return target


def write_atomic(path: Path, data: bytes, mode: int = 0o600) -> None:
    """Write beside the target and rename over it, so a reader never sees half a file."""
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix="." + path.name + ".", suffix=".tmp")
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def dump(doc: dict) -> bytes:
    return (json.dumps(doc, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")


def report(body: dict) -> None:
    print(json.dumps(body, sort_keys=True))


# ---- key file --------------------------------------------------------------------------------

def key_document(entries: dict, *, synthetic: bool, kind: str, revision: str) -> dict:
    doc = {"schema_version": SCHEMA, "synthetic": synthetic, "source": {"kind": kind, "revision": revision},
           "lessons": entries}
    doc["integrity"] = integrity(doc)
    return doc


def entry_for(lesson_id: Any, version: str, check: dict, answer: int, explanation: str) -> dict:
    return {"id": lesson_id, "curriculum_version": version, "check_sha256": binding(check),
            "answer": answer, "explanation": explanation}


def entry_problems(slug: Any, entry: Any) -> list[str]:
    """Structural problems with one entry, named without values."""
    if not isinstance(slug, str) or len(slug) > 80 or not SLUG.fullmatch(slug):
        return ["slug"]
    if not isinstance(entry, dict) or set(entry) != ENTRY_FIELDS:
        return ["fields"]
    problems = []
    if not isinstance(entry["id"], str) or not RECORD_ID.fullmatch(entry["id"]):
        problems.append("id")
    if not isinstance(entry["curriculum_version"], str) or not 1 <= len(entry["curriculum_version"]) <= 40:
        problems.append("curriculum_version")
    if not isinstance(entry["check_sha256"], str) or not HEX64.fullmatch(entry["check_sha256"]):
        problems.append("check_sha256")
    if not is_answer(entry["answer"]):
        problems.append("answer")
    if not js_text(entry["explanation"], MAX_EXPLANATION):
        problems.append("explanation")
    return problems


def read_keys(path_text: str) -> bytes:
    if not path_text:
        raise Blocked("no key file is named")
    path = Path(path_text)
    if not path.exists() and not path.is_symlink():
        raise Blocked("the key file is absent")
    try:
        with path.open("rb") as handle:
            raw = handle.read(MAX_FILE_BYTES + 1)
    except OSError:
        raise Refusal("the key file is not readable") from None
    if not raw:
        raise Blocked("the key file is empty")
    return raw


def check_document(raw: bytes) -> tuple[dict | None, dict]:
    """Schema, exact members, per-entry structure and integrity. Returns (doc or None, findings)."""
    findings: dict = {"bytes_ok": len(raw) <= MAX_FILE_BYTES, "schema": False, "integrity": False}
    if not findings["bytes_ok"]:
        return None, findings
    try:
        doc = loads(decode(raw, "the key file"))
    except Refusal:
        findings["parse"] = False
        return None, findings
    findings["parse"] = True
    source = doc.get("source") if isinstance(doc, dict) else None
    lessons = doc.get("lessons") if isinstance(doc, dict) else None
    schema = (isinstance(doc, dict) and set(doc) == TOP_FIELDS and doc["schema_version"] == SCHEMA
              and isinstance(doc["synthetic"], bool) and isinstance(doc["integrity"], str)
              and bool(HEX64.fullmatch(doc["integrity"])) and isinstance(source, dict) and set(source) == SOURCE_FIELDS
              and source["kind"] in SOURCE_KINDS and isinstance(source["revision"], str)
              and bool(REVISION.fullmatch(source["revision"])) and isinstance(lessons, dict)
              and len(lessons) <= MAX_ENTRIES)
    findings["schema"] = schema
    if not schema:
        return None, findings
    malformed = {slug: entry_problems(slug, entry) for slug, entry in lessons.items()}
    malformed = {slug: problems for slug, problems in malformed.items() if problems}
    findings["entries"] = len(lessons)
    findings["malformed"] = len(malformed)
    findings["malformed_slugs"] = sorted(_slug(slug) for slug in malformed)
    findings["malformed_fields"] = sorted({problem for problems in malformed.values() for problem in problems})
    try:
        findings["integrity"] = integrity(doc) == doc["integrity"]
    except Refusal:
        findings["integrity"] = False
    # The runtime resolver applies the same rule: a placeholder explanation marks fixture keys whatever the label says.
    findings["synthetic"] = doc["synthetic"] or placeholders(lessons) > 0
    return doc, findings


def against_revision(root: Path, revision: str, entries: dict) -> dict:
    """Byte-identity oracle: strip(REV) == HEAD, and sha256(merge(HEAD, keys)) == lock@REV."""
    commit = commit_of(root, revision)
    try:
        recorded = loads(decode(git(root, "show", f"{commit}:{READINESS_LOCK}"), READINESS_LOCK))
    except Refusal:
        recorded = None
    sources = recorded.get("sources") if isinstance(recorded, dict) else None
    lock = sources if isinstance(sources, dict) else {}
    keys = {slug: {"answer": entry["answer"], "explanation": entry["explanation"]} for slug, entry in entries.items()}
    strip_equal = lock_match = 0
    for name in CURRICULA:
        path = f"{DATA_DIR}/{name}"
        try:
            before = decode(git(root, "show", f"{commit}:{path}"), name)
            head = decode(git(root, "show", f"HEAD:{path}"), name)
        except Refusal:
            continue
        try:
            strip_equal += strip_text(before, name).encode("utf-8") == head.encode("utf-8")
        except Refusal:
            pass
        try:
            merged = merge_text(head, keys, name).encode("utf-8")
            lock_match += isinstance(lock.get(path), str) and hashlib.sha256(merged).hexdigest() == lock[path]
        except Refusal:
            pass
    total = len(CURRICULA)
    return {"strip_equal": f"{strip_equal}/{total}", "lock_match": f"{lock_match}/{total}",
            "against_ok": strip_equal == total and lock_match == total}


# ---- subcommands -----------------------------------------------------------------------------

def revision_entries(root: Path, revision: str) -> tuple[dict, str]:
    """Entries for every lesson of a revision whose curriculum files still carry keys, and its full commit."""
    commit = commit_of(root, revision)
    entries: dict = {}
    for name in CURRICULA:
        doc = parse_curriculum(decode(git(root, "show", f"{commit}:{DATA_DIR}/{name}"), name), name)
        keys = keys_of(doc, name)
        for lesson in doc["lessons"]:
            key = keys[lesson["slug"]]
            entries[lesson["slug"]] = entry_for(lesson.get("id"), doc["version"], lesson["lesson"]["check"],
                                                key["answer"], key["explanation"])
    return entries, commit


def cmd_export(args: argparse.Namespace) -> int:
    if not args.source_rev and not args.from_db:
        raise Refusal("name --source-rev, --from-db or both")
    root = Path(args.root)
    out = guard_out(root, args.out)
    public = public_lessons(root)
    keyed, commit = revision_entries(root, args.source_rev) if args.source_rev else (None, "")
    extra: dict = {}
    if args.from_db:
        entries, revision, extra = from_database(Path(args.from_db), public, keyed)
        kind = "pocketbase"
    else:
        entries, revision, kind = keyed or {}, commit, "git"
    refuse_malformed(entries)
    write_atomic(out, dump(key_document(entries, synthetic=False, kind=kind, revision=revision)))
    report({"state": "OK", "lessons": len(entries), "public": len(public), "source": kind, "synthetic": False,
            "mode": "0600", **extra})
    return EXIT_OK


def refuse_malformed(entries: dict) -> None:
    bad = sorted(_slug(slug) for slug, entry in entries.items() if entry_problems(slug, entry))
    if bad:
        raise Refusal(f"{len(bad)} entries are malformed: {', '.join(bad)}")


def from_database(path: Path, public: dict, fill: dict | None = None) -> tuple[dict, str, dict]:
    """Keys for the public slugs from a copy of a PocketBase data.db, opened read-only.

    A public lesson whose record stores no key, or that has no record (a lesson a pending
    migration inserts, or one an overwrite migration re-seeded from the stripped file), is
    refused by name unless ``fill`` holds entries from a keyed revision; those lessons then take
    the revision's entry. Where the copy stores a key, that key wins, because the resolver
    refuses a file entry that disagrees with a key the database holds. Returns the entries, the
    copy's latest update stamp and, when filling, counts and slugs of where each entry came from.
    """
    if not path.is_file():
        raise Refusal("the database copy is not a file")
    uri = "file:" + urllib.parse.quote(str(path.resolve())) + "?mode=ro"
    try:
        connection = sqlite3.connect(uri, uri=True)
    except sqlite3.Error:
        raise Refusal("the database copy cannot be opened read-only") from None
    try:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(tutorials)")}
        if not {"id", "slug", "curriculum_version", "lesson"} <= columns:
            raise Refusal("the database copy has no tutorials collection with lessons")
        updated = ", updated" if "updated" in columns else ", ''"
        rows = connection.execute(
            "SELECT id, slug, curriculum_version, lesson" + updated
            + " FROM tutorials WHERE slug != '' AND curriculum_version != ''").fetchall()
    except sqlite3.Error:
        raise Refusal("the database copy cannot be read") from None
    finally:
        connection.close()
    entries: dict = {}
    latest = ""
    keyless = []
    for record_id, slug, version, lesson_text, stamp in rows:
        if slug not in public:
            continue
        if slug in entries:
            raise Refusal(f"{_slug(slug)} has two tutorials records")
        try:
            lesson = loads(lesson_text) if isinstance(lesson_text, str) else None
        except Refusal:
            lesson = None
        check = lesson.get("check") if isinstance(lesson, dict) else None
        if (not isinstance(check, dict) or not isinstance(check.get("question"), str)
                or not isinstance(check.get("choices"), list)):
            raise Refusal(f"{_slug(slug)} has no readable knowledge check")
        if not all(member in check for member in KEY_MEMBERS):
            keyless.append(slug)
            continue
        entries[slug] = entry_for(record_id, version, check, check["answer"], check["explanation"])
        latest = max(latest, str(stamp or ""))
    absent = [slug for slug in public if slug not in entries and slug not in keyless]
    lacking = sorted(keyless + absent)
    if lacking and fill is None:
        raise Refusal(f"{len(keyless)} public lessons have no stored key and {len(absent)} have no record; "
                      f"{len(entries)} of {len(public)} carry keys: {', '.join(_slug(slug) for slug in lacking)}. "
                      "Add --source-rev with a keyed revision to fill them")
    revision = latest[:64] if REVISION.fullmatch(latest[:64]) else ""
    if fill is None:
        return entries, revision, {}
    unfilled = [slug for slug in lacking if slug not in fill]
    if unfilled:
        raise Refusal(f"{len(unfilled)} public lessons have no key in the database copy or at the revision: "
                      f"{', '.join(_slug(slug) for slug in unfilled)}")
    differs = sorted(slug for slug, entry in entries.items() if slug in fill and (
        entry["answer"], entry["explanation"]) != (fill[slug]["answer"], fill[slug]["explanation"]))
    from_db = len(entries)
    for slug in lacking:
        entries[slug] = fill[slug]
    return entries, revision, {"from_db": from_db, "from_rev": len(lacking),
                               "from_rev_slugs": [_slug(slug) for slug in lacking],
                               "differs_from_rev": len(differs), "differs_slugs": [_slug(slug) for slug in differs]}


def cmd_verify(args: argparse.Namespace) -> int:
    root = Path(args.root)
    try:
        raw = read_keys(args.keys)
    except Blocked as blocked:
        report({"state": "BLOCKED", "reason": str(blocked)})
        return EXIT_BLOCKED
    doc, findings = check_document(raw)
    ok = doc is not None and findings["integrity"] and findings.get("malformed") == 0
    result = {**findings}
    if doc is not None:
        lessons = doc["lessons"]
        public = public_lessons(root)
        missing = sorted(slug for slug in public if slug not in lessons)
        extra = sorted(_slug(slug) for slug in lessons if slug not in public)
        bound = version_match = in_range = 0
        unbound, wrong_version, out_of_range = [], [], []
        for slug, entry in lessons.items():
            if slug not in public or entry_problems(slug, entry):
                continue
            lesson = public[slug]
            try:
                is_bound = entry["check_sha256"] == binding(lesson["check"])
            except Refusal:
                is_bound = False
            bound += is_bound
            if not is_bound:
                unbound.append(slug)
            same_version = entry["curriculum_version"] == lesson["version"]
            version_match += same_version
            if not same_version:
                wrong_version.append(slug)
            fits = entry["answer"] < len(lesson["check"]["choices"])
            in_range += fits
            if not fits:
                out_of_range.append(slug)
        result.update(lessons=len(lessons), public=len(public), missing=len(missing), extra=len(extra),
                      missing_slugs=missing, extra_slugs=extra, bound=bound, unbound_slugs=sorted(unbound),
                      version_match=version_match, version_mismatch_slugs=sorted(wrong_version),
                      in_range=in_range, out_of_range_slugs=sorted(out_of_range))
        ok = ok and not missing and not extra and bound == version_match == in_range == len(public)
        synthetic = findings["synthetic"]
        if synthetic and not args.allow_synthetic:
            result["synthetic_refused"] = True
            ok = False
        if args.require_private:
            private = (not synthetic
                       and (doc["source"]["kind"] != "git" or bool(HEX40.fullmatch(doc["source"]["revision"]))))
            result["private"] = private
            ok = ok and private
        if args.against_rev:
            oracle = against_revision(root, args.against_rev, {
                slug: entry for slug, entry in lessons.items() if not entry_problems(slug, entry)})
            result.update(oracle)
            ok = ok and oracle["against_ok"]
    result["state"] = "OK" if ok else "FAIL"
    report(result)
    return EXIT_OK if ok else EXIT_FAIL


def synthetic_document(root: Path, salt: str) -> dict:
    entries = {}
    for slug, lesson in public_lessons(root).items():
        choices = lesson["check"]["choices"]
        if not choices:
            raise Refusal(f"{_slug(slug)} has no choices")
        answer = int(hashlib.sha256(f"{salt}:{slug}".encode()).hexdigest()[:8], 16) % len(choices)
        entries[slug] = entry_for(lesson["id"], lesson["version"], lesson["check"], answer,
                                  f"{SYNTHETIC_PREFIX} explanation placeholder for {slug}.")
    refuse_malformed(entries)
    return key_document(entries, synthetic=True, kind="git", revision=SYNTHETIC_REVISION)


def cmd_synthetic(args: argparse.Namespace) -> int:
    root = Path(args.root)
    out = guard_out(root, args.out)
    doc = synthetic_document(root, args.salt)
    write_atomic(out, dump(doc))
    report({"state": "OK", "lessons": len(doc["lessons"]), "synthetic": True, "mode": "0600"})
    return EXIT_OK


def cmd_strip(args: argparse.Namespace) -> int:
    root = Path(args.root)
    files: dict = {}
    pending: list[tuple[Path, str]] = []
    ok = True
    for name in CURRICULA:
        path = root / DATA_DIR / name
        original = read_curriculum(root, name)
        doc = parse_curriculum(original, name)
        blocks = _blocks(original, doc, name)
        keyed = sum(block.keyed for block in blocks)
        files[name] = {"lessons": len(blocks), "keyed": keyed}
        if keyed and keyed != len(blocks):
            raise Refusal(f"{name} is partly stripped ({keyed} of {len(blocks)} checks keyed); restore it first")
        if args.check:
            ok = ok and keyed == 0
            continue
        if not keyed:
            continue
        result = strip_text(original, name)
        if loads(result) != without_keys(doc):
            raise Refusal(f"{name}: the stripped text does not parse to the curriculum minus its keys")
        if merge_text(result, keys_of(doc, name), name).encode("utf-8") != original.encode("utf-8"):
            raise Refusal(f"{name}: merging the keys back does not give the original bytes")
        pending.append((path, result))
    for path, result in pending:
        write_atomic(path, result.encode("utf-8"), path.stat().st_mode & 0o777)
    body = {"state": "OK" if ok else "FAIL", "files": files, "keyed": sum(entry["keyed"] for entry in files.values())}
    if not args.check:
        body["stripped"] = sum(files[path.name]["keyed"] for path, _ in pending)
    report(body)
    return EXIT_OK if ok else EXIT_FAIL


def fetch_digest(origin: str, slug: str, timeout: float) -> tuple[str, str | None]:
    url = f"{origin}/api/v1/public/challenges/{urllib.parse.quote(slug, safe='')}/state"
    request = urllib.request.Request(url, headers={"Accept": "application/json",
                                                   "User-Agent": "buildanddo-lesson-keys/1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(MAX_RESPONSE + 1)
    except urllib.error.HTTPError as error:
        return ("missing", None) if error.code == 404 else ("error", None)
    except (urllib.error.URLError, OSError, ValueError):
        return "error", None
    if len(body) > MAX_RESPONSE:
        return "error", None
    try:
        value = loads(decode(body, "response"))
    except Refusal:
        return "error", None
    digest = value.get("content_digest") if isinstance(value, dict) else "invalid"
    if digest is None:
        return "unavailable", None
    if isinstance(digest, str) and HEX64.fullmatch(digest):
        return "published", digest
    return "error", None


def read_baseline(path_text: str) -> dict:
    path = Path(path_text)
    if not path_text or not path.exists() or (path.is_file() and path.stat().st_size == 0):
        raise Blocked("the digest baseline is absent or empty")
    try:
        doc = loads(decode(path.read_bytes(), "the digest baseline"))
    except OSError:
        raise Refusal("the digest baseline is not readable") from None
    digests = doc.get("digests") if isinstance(doc, dict) else None
    if (not isinstance(doc, dict) or set(doc) != {"schema_version", "digests"} or doc["schema_version"] != DIGEST_SCHEMA
            or not isinstance(digests, dict)
            or not all(isinstance(slug, str) and SLUG.fullmatch(slug) and (value is None or (
                isinstance(value, str) and HEX64.fullmatch(value))) for slug, value in digests.items())):
        raise Refusal("the digest baseline is not a lesson digest file")
    return digests


def cmd_digests(args: argparse.Namespace) -> int:
    root = Path(args.root)
    origin = args.base_url.rstrip("/")
    if not ORIGIN.fullmatch(origin):
        raise Refusal("the base URL must be an http or https origin with no path")
    out = guard_out(root, args.out) if args.out else None
    try:
        baseline = read_baseline(args.compare) if args.compare else None
    except Blocked as blocked:
        report({"state": "BLOCKED", "reason": str(blocked)})
        return EXIT_BLOCKED
    slugs = sorted(public_lessons(root))
    current: dict = {}
    counts = {"published": 0, "unavailable": 0, "missing": 0, "error": 0}
    for slug in slugs:
        state, digest = fetch_digest(origin, slug, args.timeout)
        counts[state] += 1
        if state != "error":
            current[slug] = digest
    errors = counts.pop("error")
    if baseline is None:
        if errors:
            report({"state": "FAIL", "lessons": len(slugs), "errors": errors, **counts})
            return EXIT_FAIL
        write_atomic(out, dump({"schema_version": DIGEST_SCHEMA, "digests": current}))
        report({"state": "OK", "lessons": len(slugs), "errors": 0, **counts, "mode": "0600"})
        return EXIT_OK
    same = gained = 0
    changed, lost = [], []
    for slug in sorted(set(baseline) | set(current)):
        before, after = baseline.get(slug), current.get(slug)
        if slug not in current and slug in slugs:
            continue  # a fetch error, already counted
        if before and after:
            same += before == after
            if before != after:
                changed.append(slug)
        elif before:
            lost.append(slug)
        elif after:
            gained += 1
    ok = not changed and not lost and not errors
    report({"state": "OK" if ok else "FAIL", "lessons": len(slugs), "same": same, "changed": len(changed),
            "lost": len(lost), "gained": gained, "errors": errors, "changed_slugs": changed, "lost_slugs": lost})
    return EXIT_OK if ok else EXIT_FAIL


# ---- entry point -----------------------------------------------------------------------------

def parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--root", default=str(Path(__file__).resolve().parents[2]),
                        help="repository root (default: this checkout)")
    top = argparse.ArgumentParser(prog="lesson_keys.py", description=(__doc__ or "").split("\n\n")[0],
                                  formatter_class=argparse.RawDescriptionHelpFormatter,
                                  epilog="Exit 0 OK, 1 failure, 3 BLOCKED. Output never carries a key value.")
    sub = top.add_subparsers(dest="command", required=True)

    export = sub.add_parser("export", parents=[common], help="write a private key file from a revision or a database copy")
    export.add_argument("--source-rev", help="a git revision whose curriculum files still carry keys; with --from-db, "
                                             "fills the lessons the database copy holds no key for")
    export.add_argument("--from-db", help="a copy of a PocketBase data.db (opened read-only)")
    export.add_argument("--out", required=True, help="outside the work tree, or a path git ignores")
    export.set_defaults(handler=cmd_export)

    verify = sub.add_parser("verify", parents=[common], help="check a key file against the public curriculum")
    verify.add_argument("--keys", required=True, help="the key file; absent or empty is BLOCKED (exit 3)")
    mode = verify.add_mutually_exclusive_group()
    mode.add_argument("--require-private", action="store_true", help="refuse a synthetic or placeholder file")
    mode.add_argument("--allow-synthetic", action="store_true", help="accept a file marked synthetic")
    verify.add_argument("--against-rev", help="pre-strip revision for the byte-identity oracle")
    verify.set_defaults(handler=cmd_verify)

    synthetic = sub.add_parser("synthetic", parents=[common], help="write labelled fixture keys from public data")
    synthetic.add_argument("--out", required=True, help="outside the work tree, or a path git ignores")
    synthetic.add_argument("--salt", default="synthetic", help="varies the fixture answers (default: synthetic)")
    synthetic.set_defaults(handler=cmd_synthetic)

    strip = sub.add_parser("strip", parents=[common], help="remove keys from the tracked curriculum files")
    action = strip.add_mutually_exclusive_group(required=True)
    action.add_argument("--write", action="store_true", help="strip, after proving the round trip")
    action.add_argument("--check", action="store_true", help="exit 1 while any key remains")
    strip.set_defaults(handler=cmd_strip)

    digests = sub.add_parser("digests", parents=[common], help="capture or compare public lesson digests")
    digests.add_argument("--base-url", required=True, help="the public API origin, e.g. https://example.org")
    target = digests.add_mutually_exclusive_group(required=True)
    target.add_argument("--out", help="write a baseline (outside the work tree, or a path git ignores)")
    target.add_argument("--compare", help="compare against a baseline written earlier")
    digests.add_argument("--timeout", type=float, default=15.0, help="seconds per request (default: 15)")
    digests.set_defaults(handler=cmd_digests)
    return top


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return args.handler(args)
    except Refusal as refusal:
        print(f"lesson_keys: {refusal}", file=sys.stderr)
        return EXIT_FAIL
    except Exception as error:  # noqa: BLE001 - never echo an unexpected message that might hold a value
        print(f"lesson_keys: unexpected {type(error).__name__}", file=sys.stderr)
        return EXIT_FAIL


if __name__ == "__main__":
    sys.exit(main())
