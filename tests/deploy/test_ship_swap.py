# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/deploy/test_ship_swap.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-DEPLOY-SWAP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
# Seat:        BITS-CODEGEN, C-ONE (owner and mode)
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/deploy/ship.py, tests/deploy/test_ship_telemetry.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/deploy/ship.py; CONSUMES tests/deploy/test_ship_telemetry.py
# Intent:      Prove a sync never empties the live directory before a verified copy exists, and never disables host-key checking.
# ───────────────────────────────────────────────────────────────

"""Pure-python: `_run` is replaced, so no ssh, scp or network call is made. The remote
swap script itself is executed by a local /bin/sh against temporary directories."""

from __future__ import annotations

import hashlib
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TOOL = Path(__file__).resolve().parents[2] / "scripts" / "deploy" / "ship.py"
sys.path.insert(0, str(TOOL.parents[2]))
from tests.deploy.test_ship_telemetry import local_validator, make_artifact, ship  # noqa: E402 - allow direct invocation from this test directory

HOST = "deploy@host.invalid"
LIVE = "/var/www/buildanddo"


def _dist(root: Path) -> tuple[Path, dict]:
    dist = root / "dist"
    expected = make_artifact(dist)
    (dist / ".well-known").mkdir()
    (dist / ".well-known" / "citadel-release.json").write_text("{}", encoding="utf-8")
    return dist, expected


class Recorder:
    """Stands in for ship._run; fails the first command matching `fail_on`."""

    def __init__(self, fail_on: str | None = None, returncode: int = 1):
        self.commands: list[list[str]] = []
        self.fail_on, self.returncode = fail_on, returncode

    def __call__(self, cmd, cwd=None, timeout=600):
        if cmd[0] == "node":
            return local_validator(cmd, cwd=cwd, timeout=timeout)
        self.commands.append(list(cmd))
        if self.fail_on and self.fail_on in " ".join(cmd):
            self.fail_on = None
            return {"ok": False, "returncode": self.returncode, "stdout_tail": "", "stderr_tail": "synthetic"}
        return {"ok": True, "returncode": 0, "stdout_tail": "", "stderr_tail": ""}

    def remote(self) -> list[str]:
        return [" ".join(c[c.index(HOST) + 1:]) if c[0] == "ssh" else " ".join(c) for c in self.commands]


class ShipSwapTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.dist, self.expected_telemetry = _dist(self.tmp)
        for patcher in (patch.object(ship, "VM_HOST", HOST), patch.object(ship, "SSH_KEY", "")):
            patcher.start()
            self.addCleanup(patcher.stop)

    def _sync(self, recorder: Recorder) -> dict:
        with patch.object(ship, "_run", recorder):
            return ship._rsync(self.dist, LIVE, expected_telemetry=self.expected_telemetry)

    def test_copy_then_verify_then_swap(self):
        rec = Recorder()
        result = self._sync(rec)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["files"], 5)
        kinds = [c[0] for c in rec.commands]
        self.assertEqual(kinds, ["ssh", "scp", "ssh"])
        prepare, copy, swap = rec.remote()
        incoming = copy.split(f"{HOST}:")[1].rstrip("/")
        self.assertTrue(incoming.startswith(f"{LIVE}.incoming-"))
        self.assertIn(f"mkdir -p {incoming}", prepare)
        self.assertNotIn(f"rm -rf {LIVE} ", prepare + " ")
        # The swap verifies the staged copy before it touches the live tree.
        self.assertLess(swap.index("index.html"), swap.index(f"mv {LIVE} {LIVE}.previous"))
        self.assertLess(swap.index("-eq 5"), swap.index(f"mv {LIVE} {LIVE}.previous"))
        self.assertLess(swap.index("sha256sum --check"), swap.index(f"mv {LIVE} {LIVE}.previous"))
        self.assertLess(swap.index(f"rm -rf {LIVE}.previous"), swap.index(f"mv {LIVE} {LIVE}.previous"))
        self.assertLess(swap.index(f"mv {LIVE} {LIVE}.previous"), swap.index(f"mv {incoming} {LIVE}"))

    def test_live_dir_is_never_deleted(self):
        rec = Recorder()
        self._sync(rec)
        for command in rec.remote():
            self.assertNotIn("-delete", command)
            self.assertNotIn(f"find {LIVE} ", command + " ")
            self.assertNotRegex(command, rf"rm -rf {LIVE}(?:/|\s|$)")

    def test_failed_copy_leaves_live_untouched(self):
        rec = Recorder(fail_on="scp")
        result = self._sync(rec)
        self.assertEqual((result["ok"], result["stage"]), (False, "scp"))
        after_copy = rec.remote()[2:]
        self.assertEqual(len(after_copy), 1)
        self.assertRegex(after_copy[0], rf"^rm -rf {LIVE}\.incoming-\S+$")

    def test_failed_verify_reports_its_stage(self):
        rec = Recorder(fail_on="VERIFY_FAILED", returncode=3)
        result = self._sync(rec)
        self.assertEqual((result["ok"], result["stage"]), (False, "verify_remote"))
        rec = Recorder(fail_on="VERIFY_FAILED", returncode=4)
        self.assertEqual(self._sync(rec)["stage"], "swap")

    def test_failed_prepare_stops_before_copy(self):
        rec = Recorder(fail_on="mkdir -p")
        result = self._sync(rec)
        self.assertEqual((result["ok"], result["stage"]), (False, "prepare_remote"))
        self.assertEqual(len(rec.commands), 1)

    def test_empty_build_is_refused_locally(self):
        (self.dist / "index.html").unlink()
        rec = Recorder()
        result = self._sync(rec)
        self.assertEqual((result["ok"], result["stage"]), (False, "telemetry_artifact"))
        self.assertEqual(rec.commands, [])

    def test_host_keys_are_checked(self):
        rec = Recorder()
        self._sync(rec)
        (self.tmp / "apps" / "web" / "public").mkdir(parents=True)
        (self.tmp / "apps" / "web" / "public" / "capabilities.json").write_text("{}", encoding="utf-8")
        with patch.object(ship, "_run", rec), patch.object(ship, "ROOT", self.tmp):
            self.assertTrue(ship._refresh_capability_inventory()["ok"])
        remote = [c for c in rec.commands if c[0] in ("ssh", "scp")]
        self.assertGreater(len(remote), 3)
        for command in remote:
            joined = " ".join(command)
            self.assertNotIn("StrictHostKeyChecking=no", joined)
            self.assertIn("StrictHostKeyChecking=accept-new", joined)
        self.assertNotIn("StrictHostKeyChecking=no", TOOL.read_text(encoding="utf-8"))

    def test_capabilities_upload_is_renamed_into_place(self):
        (self.tmp / "apps" / "web" / "public").mkdir(parents=True)
        (self.tmp / "apps" / "web" / "public" / "capabilities.json").write_text("{}", encoding="utf-8")
        rec = Recorder()
        with patch.object(ship, "_run", rec), patch.object(ship, "ROOT", self.tmp):
            self.assertTrue(ship._refresh_capability_inventory()["ok"])
        uploads = [c for c in rec.commands if c[0] == "scp"]
        for upload in uploads:
            self.assertRegex(upload[-1], r":/var/www/buildanddo(?:-staging)?/capabilities\.json\.incoming-\S+$")
        self.assertEqual(len(uploads), 2)


@unittest.skipUnless(shutil.which("sh"), "needs a POSIX shell")
class SwapScriptTests(unittest.TestCase):
    """Runs the exact remote script locally against temporary directories."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.live, self.incoming, self.previous = (self.tmp / "site", self.tmp / "site.incoming-x",
                                                   self.tmp / "site.previous")
        self.live.mkdir()
        (self.live / "index.html").write_text("old", encoding="utf-8")
        self.incoming.mkdir()
        (self.incoming / "index.html").write_text("new", encoding="utf-8")
        (self.incoming / "app.js").write_text("", encoding="utf-8")

    def _swap(self, expected: int) -> subprocess.CompletedProcess:
        script = ship._swap_script(str(self.incoming), str(self.live), str(self.previous), expected)
        return subprocess.run(["sh", "-c", script], capture_output=True, text=True, timeout=30)

    def test_swap_promotes_and_keeps_previous(self):
        (self.previous).mkdir()
        (self.previous / "stale").write_text("", encoding="utf-8")
        proc = self._swap(2)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual((self.live / "index.html").read_text(encoding="utf-8"), "new")
        self.assertEqual((self.previous / "index.html").read_text(encoding="utf-8"), "old")
        self.assertFalse((self.previous / "stale").exists())
        self.assertFalse(self.incoming.exists())

    def test_incomplete_copy_is_refused_and_live_kept(self):
        proc = self._swap(5)
        self.assertEqual(proc.returncode, 3)
        self.assertIn("VERIFY_FAILED", proc.stderr)
        self.assertEqual((self.live / "index.html").read_text(encoding="utf-8"), "old")
        self.assertFalse(self.previous.exists())

    def test_missing_index_is_refused(self):
        (self.incoming / "index.html").unlink()
        proc = self._swap(1)
        self.assertEqual(proc.returncode, 3)
        self.assertEqual((self.live / "index.html").read_text(encoding="utf-8"), "old")

    def test_same_file_count_with_corrupt_javascript_is_refused_before_swap(self):
        digests = {"index.html": hashlib.sha256(b"new").hexdigest(),
                   "app.js": hashlib.sha256(b"expected JavaScript").hexdigest()}
        script = ship._swap_script(str(self.incoming), str(self.live), str(self.previous), 2, digests)
        proc = subprocess.run(["sh", "-c", script], capture_output=True, text=True, timeout=30)
        self.assertEqual(proc.returncode, 3)
        self.assertIn("artifact digest mismatch", proc.stderr)
        self.assertEqual((self.live / "index.html").read_text(encoding="utf-8"), "old")
        self.assertFalse(self.previous.exists())

    def test_staged_copy_takes_the_live_owner_and_mode(self):
        script = ship._swap_script(str(self.incoming), str(self.live), str(self.previous), 2)
        live, staged = shlex.quote(str(self.live)), shlex.quote(str(self.incoming))
        self.assertIn(f"chown --reference={live} {staged}", script)
        self.assertIn(f"chmod --reference={live} {staged}", script)
        if os.name == "nt":
            return  # Windows only emulates POSIX modes; the text check above still guards the step.
        self.live.chmod(0o750)
        self.incoming.chmod(0o777)
        proc = self._swap(2)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(self.live.stat().st_mode & 0o777, 0o750)

    def test_first_deploy_without_live_dir(self):
        shutil.rmtree(self.live)
        proc = self._swap(2)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual((self.live / "index.html").read_text(encoding="utf-8"), "new")
        self.assertFalse(self.previous.exists())


if __name__ == "__main__":
    unittest.main()
