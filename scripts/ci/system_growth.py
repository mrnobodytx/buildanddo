#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/system_growth.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-GROWTH-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GROWTH-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/agent_context.py, scripts/ci/gitlab_ci.py, .bits/srs_registry.yml,
#              .bits/queue
# EnumType:    Service
# EnumEdges:   PRODUCES .bits/growth.lock.json; CONSUMES .bits/srs_registry.yml;
#              CONSUMES .bits/queue; GATES .github/workflows/growth.yml;
#              GATES .github/workflows/pr-governance.yml; GATES .gitlab-ci.yml
# Intent:      Record how every system develops, measured from the repository alone, so growth
#              is a history anyone can replay rather than a claim.
# ───────────────────────────────────────────────────────────────
"""System growth lock: per-system development and progression, measured from source.

The context lock says what the repository is. This says how each part of it is
growing: size by language, tests, READMEs and CGRF coverage per system, plus
how far every SRS and dispatch has progressed. The lock carries no timestamp
and no commit id, because it cannot contain its own commit. The growth history
is the git history of .bits/growth.lock.json, one point per merge to main,
written by .github/workflows/growth.yml.

    python scripts/ci/system_growth.py               # human summary
    python scripts/ci/system_growth.py --write       # refresh .bits/growth.lock.json
    python scripts/ci/system_growth.py --check       # fail when the lock is stale
    python scripts/ci/system_growth.py --diff origin/main   # what this branch grows or shrinks
    python scripts/ci/system_growth.py --history 20  # the lock's history as a time series

Size is not value. Nothing here scores a system; it records what changed.
Standard library only, matching the other scripts in this directory.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

_MODULE_ROOT = Path(__file__).resolve().parents[2]
if str(_MODULE_ROOT) not in sys.path:
    sys.path.insert(0, str(_MODULE_ROOT))
from scripts.ci import gitlab_ci  # noqa: E402
from scripts.ci.agent_context import parse_registry  # noqa: E402

ROOT = _MODULE_ROOT
LOCK_PATH = ".bits/growth.lock.json"
REGISTRY_PATH = ".bits/srs_registry.yml"
QUEUE_DIR = ".bits/queue"
SCHEMA = "buildanddo.growth-lock/v1"

# A system is each child of these directories, plus each of SINGLE_SYSTEMS as a whole.
SYSTEM_PARENTS = ("apps", "services", "libs", "scripts")
SINGLE_SYSTEMS = ("foundry", "tools")

LANGUAGES = {
    ".py": "python",
    ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".css": "css", ".html": "html",
    ".sh": "shell", ".ps1": "shell",
    ".sql": "sql",
    ".md": "markdown",
    ".json": "data", ".yml": "data", ".yaml": "data", ".toml": "data",
}
# Markdown and data are counted per language but are not source lines.
NON_SOURCE = {"markdown", "data"}

TEST_PATH = re.compile(
    r"(?:^|/)(?:tests?|__tests__)/|(?:^|/)test_[^/]*\.py$|[^/]+_test\.py$|\.(?:test|spec)\.[cm]?[jt]sx?$"
)
CGRF_MARK = "CGRF Header"
SRS_RE = re.compile(r"\bSRS-[A-Z0-9]+(?:-[A-Z0-9]+)+\b")
TASK_ROW = re.compile(r"^\|\s*(\d+)\s*\|(.*)\|\s*([A-Za-z_ -]+?)\s*\|\s*$")
STATUS_LINE = re.compile(r"\*\*Status:\*\*\s*([A-Za-z_]+)")
SRS_LINE = re.compile(r"\*\*SRS:\*\*\s*(SRS-[A-Z0-9-]+)")
SPARK = "▁▂▃▄▅▆▇█"


class GrowthError(Exception):
    """Raised when the repository cannot be measured."""


# ── reading the repository ─────────────────────────────────────────────────────────────────


def git(root: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise GrowthError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def tracked_files(root: Path) -> list[str]:
    """Tracked files plus untracked ones git does not ignore, and only those still on disk.

    A local build or cache is ignored, so it never changes the measurement, while a file
    written but not yet committed is counted: `--write` before a commit sees the commit.
    A clean checkout (the refresh workflow) measures exactly its tracked files.
    """
    listed = git(root, "ls-files", "-z", "-c", "-o", "--exclude-standard").split("\0")
    return sorted({line for line in listed if line and (root / line).is_file()})


def read_bytes(path: Path) -> bytes | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    return None if b"\0" in data[:8192] else data


def system_of(path: str) -> str | None:
    parts = path.split("/")
    if parts[0] in SINGLE_SYSTEMS and len(parts) > 1:
        return parts[0]
    if parts[0] in SYSTEM_PARENTS and len(parts) > 2:
        return f"{parts[0]}/{parts[1]}"
    return None


def module_owners(files: list[str]) -> dict[str, str]:
    """Map each module file stem to its system, keeping only stems that name exactly one system."""
    owners: dict[str, set[str]] = {}
    for path in files:
        system = system_of(path)
        suffix = Path(path).suffix.lower()
        if system and LANGUAGES.get(suffix) not in (None, *NON_SOURCE) and not TEST_PATH.search(path):
            stem = Path(path).name.split(".", 1)[0].lower()
            if len(stem) >= 4 and stem not in {"index", "main", "__init__", "__main__", "utils", "types"}:
                owners.setdefault(stem, set()).add(system)
    return {stem: next(iter(systems)) for stem, systems in owners.items() if len(systems) == 1}


def shared_test_owner(path: str, systems: list[str], modules: dict[str, str]) -> str | None:
    """Attribute a test that lives outside every system, most specific evidence first:

    1. tests/<system name>/…                      (tests/career/check_career.py → apps/career)
    2. the module it is named after                (test_readme_check.py → scripts/ci)
    3. the system's name as whole tokens            (test_discordbot_adapter.py → scripts/discordbot)
    """
    parts = path.split("/")
    if parts[0] != "tests" or len(parts) < 2:
        return None
    by_base = {system.rsplit("/", 1)[-1]: system for system in systems}
    if len(parts) > 2 and parts[1] in by_base:
        return by_base[parts[1]]
    stem = Path(path).name.split(".", 1)[0].lower()
    for prefix in ("test_", "check_", "selftest_"):
        if stem.startswith(prefix) and stem[len(prefix):] in modules:
            return modules[stem[len(prefix):]]
    if stem in modules:
        return modules[stem]
    stem_tokens = re.split(r"[^a-z0-9]+", stem)
    best = None
    for base, system in by_base.items():
        tokens = re.split(r"[^a-z0-9]+", base.lower())
        width = len(tokens)
        if any(stem_tokens[i:i + width] == tokens for i in range(len(stem_tokens) - width + 1)):
            # The most specific name wins: mission_suite over suite.
            if best is None or width > best[0]:
                best = (width, system)
    return best[1] if best else None


# ── measuring ──────────────────────────────────────────────────────────────────────────────


def measure_systems(root: Path, files: list[str]) -> tuple[dict[str, dict], int]:
    names = sorted({s for s in map(system_of, files) if s})
    systems: dict[str, dict] = {
        name: {
            "files": 0,
            "lines": {},
            "source_lines": 0,
            "source_files": 0,
            "cgrf_files": 0,
            "test_files": 0,
            "readme": False,
            "srs_codes": set(),
        }
        for name in names
    }
    modules = module_owners(files)
    unattributed = 0
    for path in files:
        name = system_of(path)
        if name is None:
            if TEST_PATH.search(path) and LANGUAGES.get(Path(path).suffix.lower()) not in (None, *NON_SOURCE):
                owner = shared_test_owner(path, names, modules)
                if owner:
                    systems[owner]["test_files"] += 1
                else:
                    unattributed += 1
            continue
        entry = systems[name]
        entry["files"] += 1
        if Path(path).name.lower() == "readme.md":
            entry["readme"] = True
        if TEST_PATH.search(path):
            entry["test_files"] += 1
        language = LANGUAGES.get(Path(path).suffix.lower())
        if language is None:
            continue
        data = read_bytes(root / path)
        if data is None:
            continue
        count = data.count(b"\n") + (1 if data and not data.endswith(b"\n") else 0)
        entry["lines"][language] = entry["lines"].get(language, 0) + count
        if language in NON_SOURCE:
            continue
        entry["source_lines"] += count
        entry["source_files"] += 1
        head = data[:2048].decode("utf-8", errors="replace")
        if CGRF_MARK in head:
            entry["cgrf_files"] += 1
            for line in head.splitlines():
                if re.match(r"^\W*SRS:", line):
                    entry["srs_codes"].update(SRS_RE.findall(line))
    for entry in systems.values():
        entry["lines"] = dict(sorted(entry["lines"].items()))
        entry["srs_codes"] = sorted(entry["srs_codes"])
        entry["cgrf_coverage"] = round(entry["cgrf_files"] / entry["source_files"], 4) if entry["source_files"] else 0.0
    return systems, unattributed


def parse_dispatch(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    statuses = [match.group(3).strip().lower() for match in map(TASK_ROW.match, text.splitlines()) if match]
    done = sum(1 for status in statuses if status in {"done", "delivered", "complete", "completed"})
    status = STATUS_LINE.search(text)
    srs = SRS_LINE.search(text)
    return {
        "status": status.group(1).lower() if status else "unknown",
        "srs": srs.group(1) if srs else "",
        "tasks_total": len(statuses),
        "tasks_done": done,
    }


def measure_progression(root: Path) -> dict:
    registry, error = parse_registry(root / REGISTRY_PATH)
    if error:
        raise GrowthError(f"{REGISTRY_PATH}: {error}")
    by_status: dict[str, int] = {}
    by_risk: dict[str, int] = {}
    specs: dict[str, str] = {}
    for entry in registry:
        code = entry.get("code", "")
        status = entry.get("status", "unknown")
        by_status[status] = by_status.get(status, 0) + 1
        by_risk[entry.get("risk", "unknown")] = by_risk.get(entry.get("risk", "unknown"), 0) + 1
        if code:
            specs[code] = status
    dispatches = {
        path.stem: parse_dispatch(path)
        for path in sorted((root / QUEUE_DIR).glob("*.md"))
        if path.stem != "TEMPLATE"
    }
    total = sum(d["tasks_total"] for d in dispatches.values())
    done = sum(d["tasks_done"] for d in dispatches.values())
    return {
        "srs": {
            "total": len(registry),
            "by_status": dict(sorted(by_status.items())),
            "by_risk": dict(sorted(by_risk.items())),
            "specs": dict(sorted(specs.items())),
        },
        "dispatches": dispatches,
        "dispatch_tasks": {"total": total, "done": done, "progress": round(done / total, 4) if total else 0.0},
    }


def measure_surface(root: Path, files: list[str]) -> dict:
    configuration = gitlab_ci.collect(root)
    return {
        "github_workflows": sum(1 for f in files if re.fullmatch(r"\.github/workflows/[^/]+\.ya?ml", f)),
        "gitlab_jobs": len(configuration.jobs),
        "docs_pages": sum(1 for f in files if f.startswith("docs/") and f.endswith(".md")),
        "readmes": sum(1 for f in files if Path(f).name.lower() == "readme.md"),
        "pocketbase_migrations": sum(1 for f in files if re.fullmatch(r"apps/pocketbase/pb_migrations/[^/]+\.js", f)),
        "pocketbase_hooks": sum(1 for f in files if re.fullmatch(r"apps/pocketbase/pb_hooks/[^/]+\.pb\.js", f)),
        "tracked_files": len(files),
    }


def measure(root: Path) -> dict:
    files = [f for f in tracked_files(root) if f != LOCK_PATH]
    systems, unattributed = measure_systems(root, files)
    source = sum(s["source_lines"] for s in systems.values())
    source_files = sum(s["source_files"] for s in systems.values())
    cgrf = sum(s["cgrf_files"] for s in systems.values())
    return {
        "schema": SCHEMA,
        "totals": {
            "systems": len(systems),
            "files": sum(s["files"] for s in systems.values()),
            "source_lines": source,
            "test_files": sum(s["test_files"] for s in systems.values()),
            # Tests outside every system that no rule could attribute. Reported, never guessed.
            "test_files_unattributed": unattributed,
            "systems_with_tests": sum(1 for s in systems.values() if s["test_files"]),
            "systems_with_readme": sum(1 for s in systems.values() if s["readme"]),
            "cgrf_coverage": round(cgrf / source_files, 4) if source_files else 0.0,
        },
        "systems": systems,
        "progression": measure_progression(root),
        "surface": measure_surface(root, files),
    }


def render_lock(document: dict) -> str:
    return json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def lock_at(root: Path, ref: str) -> dict | None:
    """The lock as committed at `ref`, or None when that ref has none."""
    result = subprocess.run(
        ["git", "-C", str(root), "show", f"{ref}:{LOCK_PATH}"], capture_output=True, text=True
    )
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except ValueError:
        return None


# ── presenting ─────────────────────────────────────────────────────────────────────────────


def signed(value: float, digits: int = 0) -> str:
    if digits:
        return f"{value:+.{digits}f}" if value else "0"
    return f"{int(value):+,}" if value else "0"


def bar(value: int, top: int, width: int = 20) -> str:
    filled = round(width * value / top) if top else 0
    return "█" * filled + "░" * (width - filled)


def summary(document: dict) -> str:
    totals, progression = document["totals"], document["progression"]
    rows = sorted(document["systems"].items(), key=lambda item: (-item[1]["source_lines"], item[0]))
    top = rows[0][1]["source_lines"] if rows else 0
    tasks = progression["dispatch_tasks"]
    lines = [
        "BuildAndDo system growth",
        "",
        f"{totals['systems']} systems · {totals['files']:,} files · {totals['source_lines']:,} source lines · "
        f"{totals['test_files']:,} test files ({totals['test_files_unattributed']} unattributed) · "
        f"CGRF coverage {totals['cgrf_coverage']:.0%}",
        f"{totals['systems_with_tests']}/{totals['systems']} systems have tests · "
        f"{totals['systems_with_readme']}/{totals['systems']} have a README",
        f"SRS {progression['srs']['total']}: "
        + ", ".join(f"{count} {status}" for status, count in progression["srs"]["by_status"].items()),
        f"Dispatch tasks {tasks['done']}/{tasks['total']} done ({tasks['progress']:.0%}) "
        f"across {len(progression['dispatches'])} dispatches",
        "",
        f"{'system':28} {'source lines':>12}  {'':20}  {'tests':>5}  {'readme':6}  cgrf",
    ]
    for name, entry in rows:
        lines.append(
            f"{name:28} {entry['source_lines']:>12,}  {bar(entry['source_lines'], top)}  "
            f"{entry['test_files']:>5}  {'yes' if entry['readme'] else '-':6}  {entry['cgrf_coverage']:.0%}"
        )
    return "\n".join(lines)


def diff(before: dict | None, after: dict, ref: str) -> str:
    """Markdown: how the tree differs from the lock at `ref`, for a PR job summary."""
    out = [f"### System growth against `{ref}`", ""]
    if before is None:
        out += [f"`{ref}` has no growth lock yet, so this is the first measurement.", ""]
        before = {"totals": {}, "systems": {}, "progression": {"srs": {"specs": {}}, "dispatches": {}}}
    out += ["| Metric | Before | After | Change |", "|---|---:|---:|---:|"]
    for key, value in after["totals"].items():
        old = before["totals"].get(key, 0)
        if isinstance(value, float):
            out.append(f"| {key} | {old:.0%} | {value:.0%} | {signed((value - old) * 100, 1)} pts |")
        else:
            out.append(f"| {key} | {old:,} | {value:,} | {signed(value - old)} |")
    changed = []
    for name in sorted(set(before["systems"]) | set(after["systems"])):
        old, new = before["systems"].get(name), after["systems"].get(name)
        if old == new:
            continue
        if old is None:
            changed.append(f"| `{name}` | **added** | {new['source_lines']:,} | {new['test_files']} | {'yes' if new['readme'] else '-'} |")
        elif new is None:
            changed.append(f"| `{name}` | **removed** | {signed(-old['source_lines'])} | {signed(-old['test_files'])} | - |")
        else:
            changed.append(
                f"| `{name}` | changed | {signed(new['source_lines'] - old['source_lines'])} | "
                f"{signed(new['test_files'] - old['test_files'])} | "
                f"{'added' if new['readme'] and not old['readme'] else 'yes' if new['readme'] else '-'} |"
            )
    out += [""]
    if changed:
        out += ["| System | | Source lines | Test files | README |", "|---|---|---:|---:|---|", *changed]
    else:
        out.append("No system changed size, tests or README.")
    old_specs, new_specs = before["progression"]["srs"]["specs"], after["progression"]["srs"]["specs"]
    moves = [
        f"- `{code}`: {old_specs.get(code, 'new')} → {new_specs.get(code, 'removed')}"
        for code in sorted(set(old_specs) | set(new_specs))
        if old_specs.get(code) != new_specs.get(code)
    ]
    old_d, new_d = before["progression"]["dispatches"], after["progression"]["dispatches"]
    moves += [
        f"- `{name}`: {old_d.get(name, {}).get('tasks_done', 0)}/{old_d.get(name, {}).get('tasks_total', 0)}"
        f" → {new_d[name]['tasks_done']}/{new_d[name]['tasks_total']} tasks done"
        for name in sorted(new_d)
        if (old_d.get(name, {}).get("tasks_done"), old_d.get(name, {}).get("tasks_total"))
        != (new_d[name]["tasks_done"], new_d[name]["tasks_total"])
    ]
    if moves:
        out += ["", "**Progression**", "", *moves]
    return "\n".join(out)


def spark(values: list[int]) -> str:
    if not values:
        return ""
    low, high = min(values), max(values)
    span = high - low
    return "".join(SPARK[(len(SPARK) - 1) * (v - low) // span] if span else SPARK[0] for v in values)


def history(root: Path, limit: int) -> str:
    """The lock's own git history, oldest first: one row per commit that changed it."""
    log = git(root, "log", "--format=%H%x01%cs%x01%h", "--", LOCK_PATH)
    commits = [line.split("\x01") for line in log.splitlines() if line.strip()][:limit][::-1]
    rows, source, tests = [], [], []
    for full, date, short in commits:
        doc = lock_at(root, full)
        if doc is None or doc.get("schema") != SCHEMA:
            continue
        t, p = doc["totals"], doc["progression"]
        source.append(t["source_lines"])
        tests.append(t["test_files"])
        rows.append(
            f"| {date} | `{short}` | {t['systems']} | {t['source_lines']:,} | {t['test_files']:,} | "
            f"{p['srs']['by_status'].get('delivered', 0)}/{p['srs']['total']} | "
            f"{p['dispatch_tasks']['done']}/{p['dispatch_tasks']['total']} |"
        )
    if not rows:
        return f"No committed history for {LOCK_PATH} yet."
    return "\n".join([
        f"### System growth history ({len(rows)} point(s))",
        "",
        f"Source lines `{spark(source)}` · test files `{spark(tests)}`",
        "",
        "| Date | Commit | Systems | Source lines | Test files | SRS delivered | Dispatch tasks done |",
        "|---|---|---:|---:|---:|---:|---:|",
        *rows,
    ])


# ── entry point ────────────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=ROOT)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--write", action="store_true", help=f"refresh {LOCK_PATH}")
    mode.add_argument("--check", action="store_true", help=f"fail when {LOCK_PATH} is stale")
    mode.add_argument("--json", action="store_true", help="print the measurement as JSON")
    mode.add_argument("--diff", metavar="REF", help="Markdown delta against the lock committed at REF")
    mode.add_argument("--history", metavar="N", type=int, nargs="?", const=30,
                      help="the lock's git history as a time series (default 30 points)")
    args = parser.parse_args(argv)
    root = args.root.resolve()
    try:
        if args.history is not None:
            print(history(root, args.history))
            return 0
        document = measure(root)
    except GrowthError as exc:
        print(f"FAIL: growth: {exc}", file=sys.stderr)
        return 2
    lock = root / LOCK_PATH
    rendered = render_lock(document)
    if args.write:
        changed = not lock.is_file() or lock.read_text(encoding="utf-8") != rendered
        if changed:
            lock.write_text(rendered, encoding="utf-8", newline="\n")
        print(f"growth: {LOCK_PATH} {'refreshed' if changed else 'already current'}")
        return 0
    if args.check:
        if lock.is_file() and lock.read_text(encoding="utf-8") == rendered:
            print(f"PASS: {LOCK_PATH} matches the repository ({document['totals']['systems']} systems)")
            return 0
        print(f"FAIL: {LOCK_PATH} is stale; run `python scripts/ci/system_growth.py --write`")
        return 1
    if args.json:
        print(rendered, end="")
        return 0
    if args.diff:
        print(diff(lock_at(root, args.diff), document, args.diff))
        return 0
    print(summary(document))
    return 0


if __name__ == "__main__":
    sys.exit(main())
