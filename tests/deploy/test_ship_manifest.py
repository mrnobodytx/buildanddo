# CGRF: SRS=SRS-BUILDANDDO-TENANT-RAIL-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/deploy/test_ship_manifest.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-TENANT-RAIL-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     scripts/deploy/ship.py, scripts/ci/candidate_manifest.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/deploy/ship.py;
#              VALIDATES scripts/ci/candidate_manifest.py
# Intent:      Pin the release-lane invariants of the deploy line against a fake
#              checkout in a temp dir - never the real estate, never the VM, never
#              the network. A staging build binds to the GitHub sha a lane file
#              names or refuses; the manifest is citadel.release-manifest/v2 and
#              public-safe; the flag-less run can no longer reach production.
# ───────────────────────────────────────────────────────────────
"""Run: py -3.13 -m unittest tests.deploy.test_ship_manifest"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SHIP_PATH = REPO / "scripts" / "deploy" / "ship.py"
CANDIDATE_PATH = REPO / "scripts" / "ci" / "candidate_manifest.py"

HEAD = "0123456789abcdef0123456789abcdef01234567"
OTHER = "fedcba9876543210fedcba9876543210fedcba98"
COMMIT_MESSAGE = "feat(lane): bind the staging build to a GitHub sha"
FAKE_SECRET_VALUE = "fake-secret-value-never-persisted"
SECRET_NAMES = ("BUILDANDDO_VM_HOST", "BUILDANDDO_SSH_KEY", "BUILDANDDO_PH", "DISCORD_WEBHOOK_URL")
ENV_NAMES = ("BUILDANDDO_RELEASE_LANE_FILE", "BUILDANDDO_SECRETS_FILE", "BUILDANDDO_STATE_DIR",
             "CITADEL_EXECUTOR", "CITADEL_LANE_VERSION", "GITHUB_ACTIONS", "CITADEL_GITHUB_READBACK_SHA",
             "CITADEL_GITHUB_READBACK_AT")
_LOAD_COUNTER = [0]
REAL_HISTORY = REPO / "state" / "deploy" / "history.jsonl"
_REAL_HISTORY_LINES = [None]


def _history_lines() -> int | None:
    return len(REAL_HISTORY.read_text(encoding="utf-8").splitlines()) if REAL_HISTORY.is_file() else None


def setUpModule() -> None:
    _REAL_HISTORY_LINES[0] = _history_lines()


def tearDownModule() -> None:
    # The real ledger is evidence of real deploys; an offline test must never add a line to it.
    if _history_lines() != _REAL_HISTORY_LINES[0]:
        raise AssertionError("tests wrote to the real state/deploy/history.jsonl")


def _refuse_network(*args, **kwargs):  # noqa: ANN002, ANN003
    raise AssertionError("network call attempted from an offline test")


def _ok(stdout: str) -> dict:
    return {"ok": True, "returncode": 0, "stdout_tail": stdout, "stderr_tail": ""}


def fake_run_factory(calls: list) -> object:
    """Answers the git identity questions only; every other subprocess is a test failure."""

    def fake_run(cmd: list[str], cwd: Path | None = None, timeout: int = 600) -> dict:  # noqa: ARG001
        calls.append(list(cmd))
        if cmd[0] == "git":
            rest = cmd[1:]
            if rest == ["rev-parse", "HEAD"]:
                return _ok(HEAD + "\n")
            if rest == ["rev-parse", "--short", "HEAD"]:
                return _ok(HEAD[:7] + "\n")
            if rest == ["rev-parse", "--abbrev-ref", "HEAD"]:
                return _ok("HEAD\n")
            if rest[:2] == ["log", "-1"]:
                return _ok(COMMIT_MESSAGE + "\n")
        raise AssertionError(f"forbidden subprocess in an offline test: {cmd}")

    return fake_run


class ShipHarness:
    """A fake checkout in a temp dir plus a freshly imported ship module bound to it."""

    def __init__(self, tmp: Path, env: dict[str, str], secrets: dict[str, str] | None = None) -> None:
        self.tmp = tmp
        self.clone = tmp / "clone"
        self.state_dir = tmp / "ledger"
        self.secrets_file = self.clone / "secrets" / "deploy.local.env"
        self.secrets_file.parent.mkdir(parents=True)
        secrets = {"BUILDANDDO_VM_HOST": FAKE_SECRET_VALUE, "BUILDANDDO_SSH_KEY": "secrets/keys/fake.pem",
                   "BUILDANDDO_PH": FAKE_SECRET_VALUE, "DISCORD_WEBHOOK_URL": FAKE_SECRET_VALUE,
                   **(secrets or {})}
        self.secrets_file.write_text("".join(f"{k}={v}\n" for k, v in secrets.items()), encoding="utf-8")
        (self.clone / "apps" / "web").mkdir(parents=True)
        (self.clone / "apps" / "web" / "package.json").write_text(json.dumps({"version": "0.9.1"}), encoding="utf-8")
        self.env = {"BUILDANDDO_SECRETS_FILE": str(self.secrets_file), "BUILDANDDO_STATE_DIR": str(self.state_dir), **env}
        self.calls: list = []
        self.ship = self._load()

    def _load(self):  # noqa: ANN202
        saved = {name: os.environ.get(name) for name in ENV_NAMES}
        for name in ENV_NAMES:
            os.environ.pop(name, None)
        os.environ.update(self.env)
        try:
            _LOAD_COUNTER[0] += 1
            name = f"ship_under_test_{_LOAD_COUNTER[0]}"
            spec = importlib.util.spec_from_file_location(name, SHIP_PATH)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
        finally:
            for name, value in saved.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value
        module._run = fake_run_factory(self.calls)
        module.ROOT = self.clone
        module.DIST_DIR = self.clone / "dist" / "apps" / "web"
        return module

    def write_lane_file(self, candidate_sha: str | None, github_sha: str | None = None,
                        lane_version: str = "2.0.0", body: str | None = None) -> Path:
        path = self.tmp / "lane.latest.json"
        if body is not None:
            path.write_text(body, encoding="utf-8")
            return path
        payload = {"schema": "citadel.tenant-rail-lane/v1", "lane_version": lane_version, "tenant_id": "buildanddo",
                   "candidate_sha": candidate_sha,
                   "github": {"ref": "refs/heads/main", "sha": github_sha if github_sha is not None else candidate_sha,
                              "state": "PASS"},
                   "remote_writes": 0, "secret_values_persisted": 0}
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return path

    def fake_pipeline(self, production_calls: list) -> None:
        """Make build/gate/sync/probe succeed without npm, ssh, scp or HTTP."""
        ship = self.ship
        ship.DIST_DIR.mkdir(parents=True, exist_ok=True)
        ship._build = lambda: {"ok": True, "returncode": 0}
        ship._gate = lambda: {"ok": True, "state": "PASS", "build_ok": True, "lint_ok": True}

        def fake_rsync(local_dir: Path, remote_dir: str) -> dict:
            if remote_dir == ship.PROD_REMOTE_DIR:
                production_calls.append(remote_dir)
            return {"ok": True}

        ship._rsync = fake_rsync
        ship._probe = lambda url, retries=5, delay=2.0: {"ok": True, "status": 200, "attempt": 1}
        ship._evidence_epoch = lambda: (_ for _ in ()).throw(AssertionError("evidence epoch must not run"))

    def manifest(self) -> dict:
        return json.loads((self.clone / self.ship.RELEASE_MANIFEST_REL).read_text(encoding="utf-8"))

    def ledger_lines(self) -> list[dict]:
        path = self.state_dir / "history.jsonl"
        if not path.is_file():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class ShipManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self._urlopen = urllib.request.urlopen
        urllib.request.urlopen = _refuse_network
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self._stdout = sys.stdout
        sys.stdout = open(os.devnull, "w", encoding="utf-8")  # noqa: SIM115 - restored in tearDown

    def tearDown(self) -> None:
        sys.stdout.close()
        sys.stdout = self._stdout
        urllib.request.urlopen = self._urlopen
        self._tmp.cleanup()

    def _assert_manifest_public_safe(self, manifest: dict) -> None:
        for key, value in manifest.items():
            if not isinstance(value, str):
                continue
            for mark in ("http", "://", "@", "buildanddo.com", "gitlab.citadel-nexus.com", "BUILDANDDO_VM_HOST"):
                self.assertNotIn(mark, value, f"manifest[{key}] leaks {mark!r}")
            for name in SECRET_NAMES:
                self.assertNotIn(name, value, f"manifest[{key}] names a secret")
            self.assertNotIn(FAKE_SECRET_VALUE, value, f"manifest[{key}] carries a secret value")

    # (1) schema v2: exact key list, full sha, public-safe values
    def test_manifest_v2_exact_keys_and_public_safe(self) -> None:
        h = ShipHarness(self.tmp, {"CITADEL_EXECUTOR": "rig1", "CITADEL_LANE_VERSION": "2.0.0"})
        result = h.ship._write_release_manifest(stage_only=True)
        self.assertTrue(result["ok"], result)
        manifest = h.manifest()
        self.assertEqual(manifest["schema"], "citadel.release-manifest/v2")
        self.assertEqual(tuple(manifest), h.ship.MANIFEST_KEYS)
        self.assertRegex(manifest["commit_full"], r"^[0-9a-f]{40}$")
        self.assertEqual(manifest["commit"], HEAD[:7])
        self.assertEqual(manifest["package_version"], "0.9.1")
        self.assertEqual(manifest["target"], "staging")
        self.assertIsNotNone(manifest["built_at"])
        for key in ("gitlab_project_id", "gitlab_intake_sha", "gitlab_package_name", "gitlab_package_version"):
            self.assertIsNone(manifest[key], key)
        self._assert_manifest_public_safe(manifest)
        for call in h.calls:
            self.assertEqual(call[0], "git", f"manifest writing must not run {call}")

    def test_manifest_redacts_urls_in_commit_message(self) -> None:
        h = ShipHarness(self.tmp, {})
        original = h.ship._run

        def leaky_run(cmd, cwd=None, timeout=600):  # noqa: ANN001
            if cmd[:2] == ["git", "log"]:
                return _ok("fix: see https://example.invalid/x and root@203.0.113.9\n")
            return original(cmd, cwd, timeout)

        h.ship._run = leaky_run
        self.assertTrue(h.ship._write_release_manifest(stage_only=True)["ok"])
        manifest = h.manifest()
        self._assert_manifest_public_safe(manifest)
        self.assertIn("[redacted]", manifest["commit_message"])

    # (2) lane file candidate != HEAD -> refused before build, exit 2
    def test_bind_sha_mismatch_refuses_before_build(self) -> None:
        h = ShipHarness(self.tmp, {})
        lane = h.write_lane_file(OTHER)
        h.env["BUILDANDDO_RELEASE_LANE_FILE"] = str(lane)
        h.ship = h._load()
        rc = h.ship.main(["--stage-only"])
        self.assertEqual(rc, 2)
        lines = h.ledger_lines()
        self.assertEqual(len(lines), 1)
        rec = lines[0]
        self.assertEqual(rec["stopped_at"], "bind_sha_mismatch")
        self.assertEqual(rec["bind"], {"expected": OTHER, "actual": HEAD, "ok": False, "state": "mismatch",
                                       "reason": "candidate_sha != git rev-parse HEAD"})
        self.assertNotIn("build", rec["stages"])
        self.assertNotIn("staging_sync", rec["stages"])
        self.assertFalse((h.clone / h.ship.RELEASE_MANIFEST_REL).exists(), "no manifest for a refused build")
        for call in h.calls:
            self.assertEqual(call[0], "git", f"refused run must not execute {call}")
        self.assertEqual(rec["remote_writes"], 0)
        self.assertEqual(rec["lane_file"], str(lane))

    def test_invalid_lane_file_refuses_before_build(self) -> None:
        h = ShipHarness(self.tmp, {})
        lane = h.write_lane_file(None, body="{not json")
        h.env["BUILDANDDO_RELEASE_LANE_FILE"] = str(lane)
        h.ship = h._load()
        rc = h.ship.main(["--stage-only"])
        self.assertEqual(rc, 2)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "lane_file_invalid")
        self.assertNotIn("build", rec["stages"])

    # (3) matching lane file -> github-staging, sha/ref from the file, executor from env
    def test_matching_lane_file_binds_manifest(self) -> None:
        h = ShipHarness(self.tmp, {"CITADEL_EXECUTOR": "rig1", "CITADEL_LANE_VERSION": "9.9.9"})
        lane = h.write_lane_file(HEAD, lane_version="2.0.0")
        h.env["BUILDANDDO_RELEASE_LANE_FILE"] = str(lane)
        h.ship = h._load()
        production: list = []
        h.fake_pipeline(production)
        rc = h.ship.main(["--stage-only"])
        self.assertEqual(rc, 0, h.ledger_lines())
        manifest = h.manifest()
        self.assertEqual(manifest["lane"], "github-staging")
        self.assertEqual(manifest["github_sha"], HEAD)
        self.assertEqual(manifest["github_ref"], "refs/heads/main")
        self.assertEqual(manifest["executor"], "rig1")
        self.assertEqual(manifest["lane_version"], "2.0.0", "the lane file wins over CITADEL_LANE_VERSION")
        self.assertEqual(manifest["branch"], "main", "detached worktree names the bound ref")
        self.assertEqual(manifest["commit_full"], HEAD)
        self._assert_manifest_public_safe(manifest)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "stage_only")
        self.assertTrue(rec["bind"]["ok"])
        self.assertEqual(rec["lane"], "github-staging")
        self.assertEqual(rec["executor"], "rig1")
        self.assertEqual(rec["manifest"], {"schema": "citadel.release-manifest/v2", "commit_full": HEAD, "github_sha": HEAD})
        self.assertEqual(rec["remote_writes"], 1)
        self.assertEqual(production, [])
        self.assertFalse(rec["direct_production_legacy"])

    # (4) no lane file + --stage-only -> unbound
    def test_stage_only_without_lane_file_is_unbound(self) -> None:
        h = ShipHarness(self.tmp, {})
        production: list = []
        h.fake_pipeline(production)
        rc = h.ship.main(["--stage-only"])
        self.assertEqual(rc, 0)
        manifest = h.manifest()
        self.assertEqual(manifest["lane"], "unbound")
        self.assertIsNone(manifest["github_sha"])
        self.assertIsNone(manifest["github_ref"])
        self.assertEqual(manifest["executor"], "ship.py-direct")
        self.assertIsNone(manifest["lane_version"])
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["lane"], "unbound")
        self.assertIsNone(rec["lane_file"])
        self.assertEqual(production, [])

    def test_lane_file_with_null_candidate_stays_unbound(self) -> None:
        h = ShipHarness(self.tmp, {})
        lane = h.write_lane_file(None, github_sha=None)
        h.env["BUILDANDDO_RELEASE_LANE_FILE"] = str(lane)
        h.ship = h._load()
        h.fake_pipeline([])
        self.assertEqual(h.ship.main(["--stage-only"]), 0)
        self.assertEqual(h.manifest()["lane"], "unbound")
        self.assertFalse(h.ledger_lines()[-1]["bind"]["ok"])

    # (5) flag-less run without --direct-production-legacy stops before production
    def test_flagless_run_refuses_direct_production(self) -> None:
        h = ShipHarness(self.tmp, {})
        production: list = []
        h.fake_pipeline(production)
        rc = h.ship.main([])
        self.assertEqual(rc, 2)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "direct_production_refused")
        self.assertTrue(rec["stages"]["staging_sync"]["ok"])
        self.assertTrue(rec["stages"]["staging_probe"]["ok"])
        self.assertNotIn("prod_sync", rec["stages"])
        self.assertNotIn("prod_probe", rec["stages"])
        self.assertNotIn("evidence_epoch", rec["stages"])
        self.assertFalse(rec["promoted_to_production"])
        self.assertFalse(rec["direct_production_legacy"])
        self.assertEqual(rec["remote_writes"], 1)
        self.assertEqual(production, [], "production sync must never be called without the legacy flag")
        self.assertEqual(h.manifest()["lane"], "unbound")
        self.assertEqual(h.manifest()["target"], "staging")

    def test_legacy_flag_stamps_direct_legacy_manifest(self) -> None:
        h = ShipHarness(self.tmp, {})
        result = h.ship._write_release_manifest(stage_only=False, direct_legacy=True)
        self.assertTrue(result["ok"])
        manifest = h.manifest()
        self.assertEqual(manifest["lane"], "direct-legacy")
        self.assertEqual(manifest["target"], "staging+production")
        self._assert_manifest_public_safe(manifest)

    def test_help_lists_flags_and_docstring_dropped_auto_promote(self) -> None:
        h = ShipHarness(self.tmp, {})
        with self.assertRaises(SystemExit):
            h.ship._parse_args(["--help"])
        ns = h.ship._parse_args(["--stage-only", "--direct-production-legacy", "--json", "x.json"])
        self.assertTrue(ns.stage_only)
        self.assertTrue(ns.direct_production_legacy)
        self.assertEqual(ns.json_path, "x.json")
        self.assertNotIn("automatically pushed to production", h.ship.__doc__ or "")
        self.assertIn("direct_production_refused", h.ship.__doc__ or "")

    # (6) env overrides: ledger dir + secrets file, read by name
    def test_state_dir_and_secrets_file_overrides(self) -> None:
        h = ShipHarness(self.tmp, {"CITADEL_EXECUTOR": "rig1"},
                        secrets={"BUILDANDDO_SSH_KEY": "secrets/keys/fake.pem"})
        self.assertEqual(h.ship.LOCAL_SECRETS, h.secrets_file.resolve())
        self.assertEqual(h.ship.STATE_DIR, h.state_dir.resolve())
        self.assertEqual(h.ship._SECRETS["BUILDANDDO_VM_HOST"], FAKE_SECRET_VALUE)
        self.assertEqual(h.ship.VM_HOST, FAKE_SECRET_VALUE)
        self.assertIn("BUILDANDDO_VM_HOST", h.ship._SECRET_NAMES)
        self.assertEqual(h.ship.SSH_KEY_SOURCE, "relative_to_clone")
        self.assertEqual(Path(h.ship.SSH_KEY), (h.clone / "secrets" / "keys" / "fake.pem").resolve())
        h.fake_pipeline([])
        self.assertEqual(h.ship.main(["--stage-only", "--json", str(self.tmp / "receipt.json")]), 0)
        self.assertTrue((h.state_dir / "history.jsonl").is_file())
        self.assertTrue((h.state_dir / "latest.json").is_file())
        receipt = json.loads((self.tmp / "receipt.json").read_text(encoding="utf-8"))
        self.assertEqual(receipt["stopped_at"], "stage_only")
        self.assertEqual(receipt["secret_values_persisted"], 0)
        for path in (h.state_dir / "history.jsonl", h.state_dir / "latest.json", self.tmp / "receipt.json"):
            self.assertNotIn(FAKE_SECRET_VALUE, path.read_text(encoding="utf-8"), f"{path} persisted a secret value")
        self.assertEqual(receipt["ssh_key"]["source"], "relative_to_clone")

    def test_absolute_ssh_key_is_kept(self) -> None:
        absolute = str((self.tmp / "abs.pem").resolve())
        h = ShipHarness(self.tmp, {}, secrets={"BUILDANDDO_SSH_KEY": absolute})
        self.assertEqual(h.ship.SSH_KEY, absolute)
        self.assertEqual(h.ship.SSH_KEY_SOURCE, "absolute")

    def test_activity_publish_contract_names_exist(self) -> None:
        h = ShipHarness(self.tmp, {})
        for name in ("_SECRETS", "_run", "_notify_guildmasters", "ROOT", "STATE_DIR", "LOCAL_SECRETS"):
            self.assertTrue(hasattr(h.ship, name), name)


class CandidateManifestTests(unittest.TestCase):
    """(7) candidate_manifest.py: additive fields, authority unchanged, temp git repo only."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name) / "repo"
        self.repo.mkdir()
        self._git("init", "-q")
        self._git("config", "user.email", "test@example.invalid")
        self._git("config", "user.name", "Offline Test")
        (self.repo / "README.md").write_text("candidate\n", encoding="utf-8")
        self._git("add", "README.md")
        self._git("commit", "-q", "-m", "init")
        self.head = self._git("rev-parse", "HEAD")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _git(self, *args: str) -> str:
        p = subprocess.run(["git", "-C", str(self.repo), *args], text=True, capture_output=True, check=True)
        return p.stdout.strip()

    def _run(self, extra_env: dict[str, str]) -> dict:
        env = {k: v for k, v in os.environ.items() if k not in ENV_NAMES and not k.startswith("GITHUB_")}
        env.update(extra_env)
        p = subprocess.run([sys.executable, str(CANDIDATE_PATH), "--root", str(self.repo)],
                           text=True, capture_output=True, env=env, timeout=120)
        self.assertEqual(p.returncode, 0, p.stderr)
        return json.loads((self.repo / "BUILDANDDO_CANDIDATE_PROVENANCE.json").read_text(encoding="utf-8"))

    def test_additive_fields_from_executor_env(self) -> None:
        upstream = "abcdef0123456789abcdef0123456789abcdef01"
        manifest = self._run({"CITADEL_EXECUTOR": "rig1", "CITADEL_GITHUB_READBACK_SHA": upstream,
                              "CITADEL_GITHUB_READBACK_AT": "2026-09-11T00:00:00+00:00",
                              "CITADEL_LANE_VERSION": "2.0.0", "GITHUB_REPOSITORY": "example/repo",
                              "GITHUB_SHA": upstream, "GITHUB_REF": "refs/heads/main",
                              "GITHUB_ACTOR": "rig1-foundry", "GITHUB_RUN_ID": "rail-test"})
        self.assertEqual(manifest["executor"], "rig1")
        self.assertEqual(manifest["github_readback"], {"sha": upstream, "observed_at": "2026-09-11T00:00:00+00:00"})
        self.assertEqual(manifest["lane_version"], "2.0.0")
        self.assertEqual(manifest["authority"], "candidate_only")
        self.assertIs(manifest["production_authority"], False)
        self.assertEqual(manifest["upstream_sha"], upstream)
        self.assertEqual(manifest["mirror_commit_before_provenance"], self.head)
        self.assertEqual([f["path"] for f in manifest["tracked_files"]], ["README.md"])
        self.assertRegex(manifest["manifest_sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(manifest["schema_version"], 1)

    def test_defaults_when_unset(self) -> None:
        manifest = self._run({})
        self.assertEqual(manifest["executor"], "local")
        self.assertEqual(manifest["github_readback"], {"sha": None, "observed_at": None})
        self.assertIsNone(manifest["lane_version"])
        self.assertEqual(manifest["upstream_sha"], self.head)
        self.assertEqual(manifest["authority"], "candidate_only")

    def test_github_actions_default_executor(self) -> None:
        manifest = self._run({"GITHUB_ACTIONS": "true"})
        self.assertEqual(manifest["executor"], "github-actions")


if __name__ == "__main__":
    unittest.main()
