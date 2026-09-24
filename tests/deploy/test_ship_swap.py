# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/deploy/test_ship_swap.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-DEPLOY-SWAP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEPLOY-SWAP-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/deploy/ship.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/deploy/ship.py
# Intent:      Prove a deploy copies the build beside the live webroot and swaps it in, so the live site is never
#              emptied first and a failed copy changes nothing live.
# ───────────────────────────────────────────────────────────────
"""ship.py copies a build beside the live webroot and swaps it in (SRS-BUILDANDDO-DEPLOY-SWAP-001).

The previous _rsync() emptied the live directory and then copied into it, so for the whole copy, and for good
after a failed copy, the site served an empty or half-filled directory. These tests hold the new order: nothing
before the swap names the live directory, and a failed copy issues no swap. The swap itself runs against real
temporary directories under bash: it checks index.html, keeps the previous release and moves dotfiles along.

No test opens a connection. The host is made up, and every remote command is recorded, never run.
"""
from __future__ import annotations

import importlib.util
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SHIP = Path(__file__).resolve().parents[2] / "scripts" / "deploy" / "ship.py"
spec = importlib.util.spec_from_file_location("ship_under_test", SHIP)
ship = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = ship
spec.loader.exec_module(ship)

HOST = "deploy@host.invalid"                     # made up; nothing connects to it
LIVE = "/var/www/site"
# The live directory itself, not a sibling such as /var/www/site.incoming.
LIVE_NAMED = re.compile(re.escape(LIVE) + r"(?![.\w-])")
BASH = shutil.which("bash")


class Recorder:
    """Stands in for ship._run: records each command and answers ok, except where told to fail."""

    def __init__(self, fail_when=None):
        self.calls: list[list[str]] = []
        self.fail_when = fail_when

    def __call__(self, cmd, cwd=None, timeout=600):
        self.calls.append([str(part) for part in cmd])
        if self.fail_when and self.fail_when(cmd):
            return {"ok": False, "returncode": 1, "stdout_tail": "", "stderr_tail": "simulated failure"}
        return {"ok": True, "returncode": 0, "stdout_tail": "SWAPPED", "stderr_tail": ""}


def deploy(fail_when=None) -> tuple[dict, list[list[str]]]:
    recorder = Recorder(fail_when)
    with mock.patch.object(ship, "VM_HOST", HOST), mock.patch.object(ship, "SSH_KEY", ""), \
            mock.patch.object(ship, "_run", recorder):
        result = ship._rsync(Path("dist/apps/web"), LIVE)
    return result, recorder.calls


class SwapOrderTests(unittest.TestCase):
    """What the deploy asks the server to do, and in which order."""

    def test_nothing_touches_the_live_directory_before_a_complete_copy_is_beside_it(self):
        result, calls = deploy()
        self.assertTrue(result["ok"], result)
        copy = next(i for i, cmd in enumerate(calls) if cmd[0] == "scp")
        for cmd in calls[:copy + 1]:
            self.assertIsNone(LIVE_NAMED.search(" ".join(cmd)), f"names the live directory before the swap: {cmd}")
        self.assertEqual(calls[copy][-1], f"{HOST}:{LIVE}.incoming/")
        self.assertEqual(len(calls), copy + 2, "one swap, and only after the copy")
        swap = calls[-1][-1]
        self.assertLess(swap.index(f"mv {LIVE} {LIVE}.previous"), swap.index(f"mv {LIVE}.incoming {LIVE}"))

    def test_a_failed_copy_leaves_the_live_directory_alone(self):
        result, calls = deploy(fail_when=lambda cmd: cmd[0] == "scp")
        self.assertFalse(result["ok"])
        self.assertEqual(result["stage"], "scp")
        for cmd in calls:
            self.assertIsNone(LIVE_NAMED.search(" ".join(cmd)), f"touched the live directory: {cmd}")

    def test_a_refused_swap_is_reported_as_the_swap_stage(self):
        result, calls = deploy(fail_when=lambda cmd: cmd[0] == "ssh" and "mv " in cmd[-1])
        self.assertFalse(result["ok"])
        self.assertEqual(result["stage"], "swap")

    def test_without_a_host_nothing_runs(self):
        recorder = Recorder()
        with mock.patch.object(ship, "VM_HOST", ""), mock.patch.object(ship, "_run", recorder):
            result = ship._rsync(Path("dist/apps/web"), LIVE)
        self.assertEqual((result["ok"], result["stage"]), (False, "config"))
        self.assertEqual(recorder.calls, [])


@unittest.skipUnless(BASH, "the swap runs under bash on the server, and there is no bash here")
class SwapScriptTests(unittest.TestCase):
    """The server half of the swap, run for real against temporary directories."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.live = self.root / "site"

    def tearDown(self):
        self.tmp.cleanup()

    def tree(self, name: str, files: dict[str, str]) -> Path:
        base = self.root / name
        base.mkdir(parents=True, exist_ok=True)
        for relative, text in files.items():
            path = base / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
        return base

    def swap(self) -> subprocess.CompletedProcess:
        return subprocess.run([BASH, "-c", ship._swap_script(self.live.as_posix())],
                              capture_output=True, text=True, timeout=60)

    def read(self, *parts: str) -> str:
        return self.root.joinpath(*parts).read_text(encoding="utf-8")

    def test_the_new_release_replaces_the_old_one_whole_and_the_old_one_is_kept(self):
        self.tree("site", {"index.html": "old", ".well-known/citadel-release.json": "old", "assets/old.js": "old"})
        self.tree("site.incoming", {"index.html": "new", ".well-known/citadel-release.json": "new", "_version": "new"})
        done = self.swap()
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertEqual(self.read("site", "index.html"), "new")
        self.assertEqual(self.read("site", ".well-known", "citadel-release.json"), "new")
        self.assertEqual(self.read("site", "_version"), "new")
        self.assertFalse((self.live / "assets" / "old.js").exists(), "nothing from the old release lingers")
        self.assertEqual(self.read("site.previous", "index.html"), "old")
        self.assertFalse((self.root / "site.incoming").exists())

    def test_a_copy_without_its_entry_page_is_refused_and_nothing_changes(self):
        self.tree("site", {"index.html": "old"})
        self.tree("site.incoming", {"assets/app.js": "new"})
        done = self.swap()
        self.assertNotEqual(done.returncode, 0)
        self.assertEqual(self.read("site", "index.html"), "old")
        self.assertTrue((self.root / "site.incoming").exists())
        self.assertFalse((self.root / "site.previous").exists())

    def test_an_older_previous_release_gives_way_to_the_one_just_replaced(self):
        self.tree("site.previous", {"index.html": "older"})
        self.tree("site", {"index.html": "old"})
        self.tree("site.incoming", {"index.html": "new"})
        done = self.swap()
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertEqual(self.read("site.previous", "index.html"), "old")
        self.assertEqual(self.read("site", "index.html"), "new")

    def test_a_first_deploy_moves_the_copy_into_place(self):
        self.tree("site.incoming", {"index.html": "new"})
        done = self.swap()
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertEqual(self.read("site", "index.html"), "new")
        self.assertFalse((self.root / "site.previous").exists())


if __name__ == "__main__":
    unittest.main()
