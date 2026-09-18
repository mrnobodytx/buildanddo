"""M02: the served /.well-known/citadel-release.json (schema v2) is written atomically after the sync and read
back independently by verify_environment; build output directories are cleaned before every build.
Run directly: python tests/deploy/test_release_manifest.py (tests/ is not a package)."""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TOOL = Path(__file__).resolve().parents[2] / "tools" / "buildanddo_release.py"
spec = importlib.util.spec_from_file_location("buildanddo_release_manifest_under_test", TOOL)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)

SHA = "a5bdcad549738e9482d38380464bde4999dc9e89"
RELEASE_DOC = {"generated_at": "2026-09-18T14:57:49Z", "manifest": {"tree_sha256": "33f33d081cfb" + "0" * 52, "file_count": 173}}


class _Proc:
    def __init__(self, rc=0, stdout=""):
        self.returncode, self.stdout, self.stderr = rc, stdout, ""


class ManifestShapeTests(unittest.TestCase):
    def test_v2_manifest_carries_exact_identity(self):
        with patch.object(mod, "git_branch", lambda repo: "feat/m02-release-manifest"), \
                patch.object(mod.subprocess, "run", lambda *a, **k: _Proc(0, "feat(release): manifest\n")):
            m = mod.release_manifest(Path("."), SHA, RELEASE_DOC, "staging")
        self.assertEqual(m["schema"], "citadel.release-manifest/v2")
        self.assertEqual(m["commit_full"], SHA)
        self.assertEqual(m["commit"], SHA[:7])
        self.assertEqual(m["lane"], "github-staging")
        self.assertEqual(m["artifact_tree_sha256"], RELEASE_DOC["manifest"]["tree_sha256"])
        self.assertEqual(m["artifact_file_count"], 173)
        self.assertEqual(m["built_at"], "2026-09-18T14:57:49Z")
        self.assertTrue(re.fullmatch(r"\d{4}-\d\d-\d\dT.*Z", m["deployed_at"]))
        self.assertIsNone(m["github_sha"])  # never asserted by the deploy
        self.assertEqual(mod.release_manifest(Path("."), SHA, RELEASE_DOC, "production")["lane"], "gitlab-golden")
        self.assertEqual(mod.release_manifest(Path("."), SHA, RELEASE_DOC, "canary")["lane"], "unbound")


class ServedManifestWriteTests(unittest.TestCase):
    def test_written_after_sync_atomically_over_stdin(self):
        calls = []

        def fake_run(cmd, **kw):
            calls.append((cmd, kw.get("input")))
            return _Proc(0)

        manifest = {"commit_full": SHA, "lane": "github-staging", "deployed_at": "2026-09-18T15:00:00Z", "artifact_tree_sha256": "x"}
        with patch.object(mod.subprocess, "run", fake_run):
            out = mod.write_served_manifest(["ssh", "host"], "/var/www/buildanddo-staging", manifest)
        cmd, payload = calls[0]
        remote = cmd[-1]
        self.assertEqual(cmd[:2], ["ssh", "host"])
        self.assertIn("mkdir -p /var/www/buildanddo-staging/.well-known", remote)
        self.assertIn("cat > /var/www/buildanddo-staging/.well-known/.citadel-release.json.tmp", remote)
        self.assertIn("mv -f /var/www/buildanddo-staging/.well-known/.citadel-release.json.tmp /var/www/buildanddo-staging/.well-known/citadel-release.json", remote)
        self.assertEqual(json.loads(payload)["commit_full"], SHA)
        self.assertEqual(out["commit_full"], SHA)
        self.assertEqual(out["path"], "/.well-known/citadel-release.json")

    def test_failed_write_is_a_release_error(self):
        with patch.object(mod.subprocess, "run", lambda *a, **k: _Proc(1)):
            with self.assertRaises(mod.ReleaseError):
                mod.write_served_manifest(["ssh", "host"], "/var/www/x", {"commit_full": SHA, "lane": "l", "deployed_at": "t"})


class VerifyReadbackTests(unittest.TestCase):
    def _http(self, manifest):
        def fake_http_get(url):
            if "/_version" in url:
                return 200, json.dumps({"commit_sha": SHA}).encode(), {}
            if "/lessons/" in url:
                return 200, b"Deploy my first website", {}
            if "/.well-known/citadel-release.json" in url:
                if manifest is None:
                    raise mod.ReleaseError("404")
                return 200, json.dumps(manifest).encode(), {}
            return 200, b"<html>", {}
        return fake_http_get

    def _verify(self, manifest):
        with tempfile.TemporaryDirectory() as td, \
                patch.dict(os.environ, {"BUILDANDDO_STAGING_URL": "https://staging.example.test"}), \
                patch.object(mod, "http_get", self._http(manifest)):
            return mod.verify_environment(Path(td), "staging", SHA)

    def test_pass_requires_v2_manifest_with_exact_commit_full(self):
        good = {"schema": "citadel.release-manifest/v2", "commit_full": SHA, "lane": "github-staging", "artifact_tree_sha256": "t", "deployed_at": "d"}
        r = self._verify(good)
        self.assertTrue(r["manifest_pass"])
        self.assertEqual((r["state"], r["manifest_lane"], r["schema"]), ("PASS", "github-staging", "buildanddo.external-readback/v2"))

    def test_v1_or_stale_manifest_holds(self):
        stale_v1 = {"schema": "citadel.release-manifest/v1", "commit": "0b9faeb"}
        r = self._verify(stale_v1)
        self.assertFalse(r["manifest_pass"])
        self.assertEqual(r["state"], "HOLD")
        self.assertTrue(r["sha_match"])  # /_version alone no longer proves the deploy
        other = {"schema": "citadel.release-manifest/v2", "commit_full": "8ce003bae764c9475449e20dab8b9f6aae7f025b"}
        self.assertEqual(self._verify(other)["state"], "HOLD")

    def test_missing_manifest_holds(self):
        r = self._verify(None)
        self.assertEqual((r["manifest_status"], r["manifest_pass"], r["state"]), (0, False, "HOLD"))


class CleanOutDirTests(unittest.TestCase):
    def test_only_directories_inside_the_repo_are_removed(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td) / "repo"
            inside = repo / "dist" / "apps" / "web"
            inside.mkdir(parents=True)
            (inside / "index-OLD.js").write_text("stale", encoding="utf-8")
            outside = Path(td) / "elsewhere"
            outside.mkdir()
            (outside / "keep.txt").write_text("keep", encoding="utf-8")
            cleaned = mod.clean_artifact_candidates(repo, [str(inside), str(outside), str(repo), str(repo / "absent")])
            self.assertEqual(cleaned, [str(inside.resolve())])
            self.assertFalse(inside.exists())
            self.assertTrue((outside / "keep.txt").exists())
            self.assertTrue(repo.exists())


if __name__ == "__main__":
    unittest.main()
