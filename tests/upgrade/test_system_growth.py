# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_system_growth.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-GROWTH-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GROWTH-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/system_growth.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/ci/system_growth.py; VALIDATES .bits/growth.lock.json
# Intent:      Prove the growth lock measures what it says, goes stale when the tree moves, and
#              replays its own history, against a small repository built for each test.
# ───────────────────────────────────────────────────────────────
"""System growth lock.

Each test builds a throwaway git repository with two apps, a shared test
directory, a registry and one dispatch, so every number the lock reports can be
checked by hand. The live lock is checked last, so this suite also fails when
the committed .bits/growth.lock.json falls behind the tree.
"""
from __future__ import annotations

import contextlib
import io
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts.ci import system_growth as growth

ROOT = Path(__file__).resolve().parents[2]

CGRF_PY = "# ─── CGRF Header ───\n# SRS:         SRS-DEMO-ALPHA-001\n# ─────────\nprint('a')\n"
REGISTRY = """srs:
  - code: SRS-DEMO-ALPHA-001
    status: in_progress
    risk: A1
  - code: SRS-DEMO-BETA-001
    status: delivered
    risk: A2
"""
DISPATCH = """# Dispatch VCC-DEMO-ALPHA-001

**SRS:** SRS-DEMO-ALPHA-001 **Risk:** A1 **Seat:** DEMO **Status:** in_progress

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | first | `true` | done |
| 2 | second | `true` | done |
| 3 | third | `true` | todo |
"""


class GrowthRepo:
    def __init__(self) -> None:
        self.dir = Path(tempfile.mkdtemp(prefix="growth-"))
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        self.write("apps/alpha/main.py", CGRF_PY)
        self.write("apps/alpha/helper.py", "x = 1\ny = 2\n")
        self.write("apps/alpha/README.md", "# Alpha\n\nThe alpha app.\n")
        self.write("apps/beta/widget.js", "export const w = 1;\n")
        self.write("apps/beta/logo.png", b"\x89PNG\0\0binary\n\n\n")
        self.write("tests/alpha/check_alpha.py", "assert True\n")
        self.write("tests/upgrade/test_widget.py", "assert True\n")
        self.write("tests/upgrade/test_orphan_thing.py", "assert True\n")
        self.write(".bits/srs_registry.yml", REGISTRY)
        self.write(".bits/queue/VCC-DEMO-ALPHA-001.md", DISPATCH)
        self.write(".bits/queue/TEMPLATE.md", "| 1 | ignored | `x` | todo |\n")
        self.write(".github/workflows/ci.yml", "name: ci\n")
        self.write(".gitlab-ci.yml", "verify:\n  script:\n    - echo ok\n")
        self.write("docs/guide.md", "# Guide\n")
        self.commit("initial")

    def git(self, *args: str) -> str:
        return subprocess.run(["git", *args], cwd=self.dir, check=True, capture_output=True, text=True).stdout

    def write(self, rel: str, content: str | bytes) -> None:
        path = self.dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8")

    def commit(self, message: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "--allow-empty", "-m", message)

    def run(self, *args: str) -> tuple[int, str]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = growth.main(["--root", str(self.dir), *args])
        return code, out.getvalue()

    def close(self) -> None:
        shutil.rmtree(self.dir, ignore_errors=True)


class GrowthLockTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = GrowthRepo()
        self.addCleanup(self.repo.close)
        self.doc = growth.measure(self.repo.dir)

    def test_systems_are_measured_from_tracked_source(self) -> None:
        alpha = self.doc["systems"]["apps/alpha"]
        self.assertEqual(alpha["files"], 3)
        self.assertEqual(alpha["source_lines"], 6)  # 4 + 2 Python lines; the README is markdown
        self.assertEqual(alpha["lines"], {"markdown": 3, "python": 6})
        self.assertTrue(alpha["readme"])
        self.assertEqual(alpha["cgrf_coverage"], 0.5)
        self.assertEqual(alpha["srs_codes"], ["SRS-DEMO-ALPHA-001"])
        beta = self.doc["systems"]["apps/beta"]
        self.assertEqual(beta["files"], 2)
        self.assertEqual(beta["lines"], {"javascript": 1}, "a binary file is counted, never read as lines")
        totals = self.doc["totals"]
        self.assertEqual(totals["files"], sum(s["files"] for s in self.doc["systems"].values()))
        self.assertEqual(totals["systems"], 2)

    def test_shared_tests_are_attributed_or_reported(self) -> None:
        self.assertEqual(self.doc["systems"]["apps/alpha"]["test_files"], 1)  # tests/alpha/…
        self.assertEqual(self.doc["systems"]["apps/beta"]["test_files"], 1)   # test_widget → widget.js
        self.assertEqual(self.doc["totals"]["test_files_unattributed"], 1)   # test_orphan_thing

    def test_progression_reads_the_registry_and_task_tables(self) -> None:
        progression = self.doc["progression"]
        self.assertEqual(progression["srs"]["by_status"], {"delivered": 1, "in_progress": 1})
        self.assertEqual(
            progression["dispatches"],
            {"VCC-DEMO-ALPHA-001": {"srs": "SRS-DEMO-ALPHA-001", "status": "in_progress", "tasks_done": 2, "tasks_total": 3}},
        )
        self.assertEqual(progression["dispatch_tasks"], {"done": 2, "total": 3, "progress": 0.6667})

    def test_surface_counts(self) -> None:
        surface = self.doc["surface"]
        self.assertEqual((surface["github_workflows"], surface["gitlab_jobs"], surface["docs_pages"], surface["readmes"]), (1, 1, 1, 1))

    def test_write_is_idempotent_and_check_passes(self) -> None:
        self.assertEqual(self.repo.run("--write")[0], 0)
        first = (self.repo.dir / growth.LOCK_PATH).read_bytes()
        self.assertEqual(self.repo.run("--write")[0], 0)
        self.assertEqual((self.repo.dir / growth.LOCK_PATH).read_bytes(), first)
        self.assertEqual(self.repo.run("--check")[0], 0)

    def test_control_a_new_tracked_file_makes_the_lock_stale(self) -> None:
        self.repo.run("--write")
        self.repo.commit("lock")
        self.repo.write("apps/beta/more.js", "a();\nb();\n")
        self.repo.commit("grow beta")
        code, out = self.repo.run("--check")
        self.assertEqual(code, 1, out)
        self.assertIn("stale", out)

    def test_the_lock_never_measures_itself(self) -> None:
        self.repo.run("--write")
        self.repo.commit("lock")
        self.assertEqual(self.repo.run("--check")[0], 0, "committing the lock must not make it stale")

    def test_diff_reports_added_systems_and_signed_deltas(self) -> None:
        self.repo.run("--write")
        self.repo.commit("lock")
        self.repo.write("apps/gamma/new.py", "a = 1\n")
        self.repo.write("apps/alpha/helper.py", "x = 1\n")
        self.repo.commit("change")
        code, out = self.repo.run("--diff", "HEAD~1")
        self.assertEqual(code, 0)
        self.assertIn("| `apps/gamma` | **added** | 1 |", out)
        self.assertIn("| `apps/alpha` | changed | -1 |", out)
        self.assertIn("| systems | 2 | 3 | +1 |", out)

    def test_diff_reports_progression_moves(self) -> None:
        self.repo.run("--write")
        self.repo.commit("lock")
        self.repo.write(".bits/queue/VCC-DEMO-ALPHA-001.md", DISPATCH.replace("| third | `true` | todo |", "| third | `true` | done |"))
        self.repo.write(".bits/srs_registry.yml", REGISTRY.replace("in_progress", "delivered"))
        self.repo.commit("finish")
        _, out = self.repo.run("--diff", "HEAD~1")
        self.assertIn("- `SRS-DEMO-ALPHA-001`: in_progress → delivered", out)
        self.assertIn("- `VCC-DEMO-ALPHA-001`: 2/3 → 3/3 tasks done", out)

    def test_diff_against_a_ref_without_a_lock_says_so(self) -> None:
        _, out = self.repo.run("--diff", "HEAD")
        self.assertIn("has no growth lock yet", out)

    def test_history_replays_the_lock_oldest_first(self) -> None:
        self.repo.run("--write")
        self.repo.commit("lock 1")
        self.repo.write("apps/beta/more.js", "a();\nb();\n")
        self.repo.run("--write")
        self.repo.commit("lock 2")
        _, out = self.repo.run("--history")
        rows = [line for line in out.splitlines() if line.startswith("| 20")]
        self.assertEqual(len(rows), 2, out)
        self.assertIn("| 7 |", rows[0])   # 6 python + 1 javascript source lines
        self.assertIn("| 9 |", rows[1])   # beta grew by 2
        self.assertIn("2 point(s)", out)

    def test_sparkline_scales_between_min_and_max(self) -> None:
        self.assertEqual(growth.spark([1, 5, 9]), "▁▄█")
        self.assertEqual(growth.spark([3, 3]), "▁▁")

    def test_the_live_lock_is_current(self) -> None:
        document = growth.measure(ROOT)
        committed = (ROOT / growth.LOCK_PATH).read_text(encoding="utf-8")
        self.assertEqual(json.loads(committed), json.loads(growth.render_lock(document)),
                         "run `python scripts/ci/system_growth.py --write`")


if __name__ == "__main__":
    unittest.main()
