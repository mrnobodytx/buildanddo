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
# Updated:     2026-09-11 (v2.1: strict bind, A3 ack, secret scrub, refusal-before-write)
# Depends:     scripts/deploy/ship.py, scripts/ci/candidate_manifest.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/deploy/ship.py;
#              VALIDATES scripts/ci/candidate_manifest.py
# Intent:      Pin the release-lane invariants of the deploy line against a fake
#              checkout in a temp dir - never the real estate, never the VM, never
#              the network. A staging build binds to a GitHub readback of HEAD or
#              refuses; the manifest is citadel.release-manifest/v2 and public-safe;
#              the flag-less run writes nothing; production needs the legacy flag
#              AND --ack-authority; no secret value ever reaches a record.
# ───────────────────────────────────────────────────────────────
"""Run: py -3.13 -m unittest tests.deploy.test_ship_manifest"""
from __future__ import annotations

import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SHIP_PATH = REPO / "scripts" / "deploy" / "ship.py"
CANDIDATE_PATH = REPO / "scripts" / "ci" / "candidate_manifest.py"

HEAD = "0123456789abcdef0123456789abcdef01234567"
OTHER = "fedcba9876543210fedcba9876543210fedcba98"
COMMIT_MESSAGE = "feat(lane): bind the staging build to a GitHub sha"
FAKE_SECRET_VALUE = "fake-secret-value-never-persisted"
FAKE_HOST_VALUE = "root@203.0.113.9"
SECRET_NAMES = ("BUILDANDDO_VM_HOST", "BUILDANDDO_SSH_KEY", "BUILDANDDO_PH", "DISCORD_WEBHOOK_URL",
                "FLARUM_ADMIN_PASS")
ENV_NAMES = ("BUILDANDDO_RELEASE_LANE_FILE", "BUILDANDDO_SECRETS_FILE", "BUILDANDDO_STATE_DIR",
             "CITADEL_EXECUTOR", "CITADEL_LANE_VERSION", "GITHUB_ACTIONS", "CITADEL_GITHUB_READBACK_SHA",
             "CITADEL_GITHUB_READBACK_AT", "CITADEL_GITHUB_SHA")
# The external contract (docs/operations/BUILDANDDO_TENANT_RAIL_V2.md C3 / BUILDANDDO_RELEASE_LANE.md),
# spelled out here on purpose so a drift in ship.MANIFEST_KEYS cannot silently pass.
MANIFEST_KEYS_CONTRACT = (
    "schema", "tenant_id", "commit", "commit_message", "commit_full", "branch",
    "package_version", "built_at", "target", "shipped_by", "github_sha", "github_ref",
    "gitlab_project_id", "gitlab_intake_sha", "gitlab_package_name", "gitlab_package_version",
    "lane", "executor", "lane_version",
)
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
        secrets = {"BUILDANDDO_VM_HOST": FAKE_HOST_VALUE, "BUILDANDDO_SSH_KEY": "secrets/keys/fake.pem",
                   "BUILDANDDO_PH": FAKE_SECRET_VALUE, "DISCORD_WEBHOOK_URL": FAKE_SECRET_VALUE,
                   **(secrets or {})}
        body = "".join(f"{k}={v}\n" for k, v in secrets.items())
        # A colon-separated line, the shape the real secrets file also carries: its NAME
        # must still be known to the redactor even though its value is never loaded.
        body += "  FLARUM_ADMIN_PASS: colon-secret-value-not-loaded\n"
        self.secrets_file.write_text(body, encoding="utf-8")
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
                        lane_version: str = "2.0.0", body: str | None = None, github: object = "default",
                        tenant_id: str = "buildanddo", github_state: str = "HOLD",
                        github_ref: str = "refs/heads/main") -> Path:
        path = self.tmp / "lane.latest.json"
        if body is not None:
            path.write_text(body, encoding="utf-8")
            return path
        payload = {"schema": "citadel.tenant-rail-lane/v1", "lane_version": lane_version, "tenant_id": tenant_id,
                   "candidate_sha": candidate_sha,
                   "remote_writes": 0, "secret_values_persisted": 0}
        if github == "default":
            payload["github"] = {"ref": github_ref, "sha": github_sha if github_sha is not None else candidate_sha,
                                 "state": github_state}
        elif github is not None:
            payload["github"] = github
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return path

    def rebind(self, lane: Path) -> None:
        self.env["BUILDANDDO_RELEASE_LANE_FILE"] = str(lane)
        self.ship = self._load()

    def fake_pipeline(self, production_calls: list, staging_probe_ok: bool = True,
                      staging_sync: dict | None = None) -> None:
        """Make build/gate/sync/probe succeed without npm, ssh, scp or HTTP."""
        ship = self.ship
        ship.DIST_DIR.mkdir(parents=True, exist_ok=True)
        ship._build = lambda: {"ok": True, "returncode": 0}
        ship._gate = lambda: {"ok": True, "state": "PASS", "build_ok": True, "lint_ok": True}

        def fake_rsync(local_dir: Path, remote_dir: str) -> dict:
            if remote_dir == ship.STAGING_REMOTE_DIR and staging_sync is not None:
                return staging_sync
            if remote_dir == ship.PROD_REMOTE_DIR:
                production_calls.append(remote_dir)
            return {"ok": True}

        ship._rsync = fake_rsync

        def fake_probe(url: str, retries: int = 5, delay: float = 2.0) -> dict:  # noqa: ARG001
            if url == ship.STAGING_URL and not staging_probe_ok:
                return {"ok": False, "status": 503, "attempts": retries, "error": "HTTPError: 503",
                        "body_prefix": "upstream unavailable"}
            return {"ok": True, "status": 200, "attempt": 1}

        ship._probe = fake_probe
        ship._evidence_epoch = lambda: (_ for _ in ()).throw(AssertionError("evidence epoch must not run"))

    def manifest(self) -> dict:
        return json.loads((self.clone / self.ship.RELEASE_MANIFEST_REL).read_text(encoding="utf-8"))

    def manifest_exists(self) -> bool:
        return (self.clone / self.ship.RELEASE_MANIFEST_REL).exists()

    def ledger_lines(self) -> list[dict]:
        path = self.state_dir / "history.jsonl"
        if not path.is_file():
            return []
        return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

    def ledger_text(self) -> str:
        out = []
        for name in ("history.jsonl", "latest.json"):
            path = self.state_dir / name
            if path.is_file():
                out.append(path.read_text(encoding="utf-8"))
        return "\n".join(out)


class ShipManifestTests(unittest.TestCase):
    def setUp(self) -> None:
        self._urlopen = urllib.request.urlopen
        urllib.request.urlopen = _refuse_network
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self._stdout = sys.stdout
        sys.stdout = io.StringIO()
        self._fake_publish_installed = False

    def tearDown(self) -> None:
        sys.stdout = self._stdout
        urllib.request.urlopen = self._urlopen
        if self._fake_publish_installed:
            sys.modules.pop("activity_publish", None)
        self._tmp.cleanup()

    def _install_fake_publish(self, calls: list) -> None:
        """The legacy line imports scripts/publish/activity_publish lazily; the offline
        suite supplies a stand-in that records the call and never touches a channel."""
        module = types.ModuleType("activity_publish")

        def publish(title: str, summary: str, evidence: dict) -> dict:
            calls.append({"title": title, "summary": summary, "evidence": evidence})
            return {"ok": True, "channels": {"fake": "recorded"}}

        module.publish = publish
        sys.modules["activity_publish"] = module
        self._fake_publish_installed = True

    def _assert_manifest_public_safe(self, manifest: dict) -> None:
        for key, value in manifest.items():
            if not isinstance(value, str):
                continue
            for mark in ("http", "://", "@", "buildanddo.com", "gitlab.citadel-nexus.com", "BUILDANDDO_VM_HOST",
                         "203.0.113.9"):
                self.assertNotIn(mark, value, f"manifest[{key}] leaks {mark!r}")
            for name in SECRET_NAMES:
                self.assertNotIn(name, value, f"manifest[{key}] names a secret")
            self.assertNotIn(FAKE_SECRET_VALUE, value, f"manifest[{key}] carries a secret value")
            self.assertNotIn(FAKE_HOST_VALUE, value, f"manifest[{key}] carries the host value")

    def _assert_record_clean(self, h: ShipHarness, *extra_paths: Path) -> None:
        texts = [h.ledger_text()] + [p.read_text(encoding="utf-8") for p in extra_paths]
        for text in texts:
            self.assertNotIn(FAKE_SECRET_VALUE, text, "a secret value reached a record")
            self.assertNotIn(FAKE_HOST_VALUE, text, "the host value reached a record")
            self.assertNotIn("203.0.113.9", text)
            self.assertNotIn("fake.pem", text, "the ssh key path reached a record")
            self.assertNotIn("colon-secret-value", text)
        for rec in h.ledger_lines():
            self.assertEqual(rec["secret_values_persisted"], 0)
            self.assertEqual(rec["ssh_key"], {"configured": True, "source": "relative_to_clone"})

    # (1) schema v2: exact key list (the external contract), full sha, public-safe values
    def test_manifest_v2_exact_keys_and_public_safe(self) -> None:
        h = ShipHarness(self.tmp, {"CITADEL_EXECUTOR": "rig1", "CITADEL_LANE_VERSION": "2.0.0"})
        binding = h.ship._bind_lane(HEAD)
        self.assertEqual(binding["state"], "required", "a controller build without a lane file must not bind")
        result = h.ship._write_release_manifest({"actual": HEAD, "ok": False, "lane_version": "2.0.0"})
        self.assertTrue(result["ok"], result)
        manifest = h.manifest()
        self.assertEqual(manifest["schema"], "citadel.release-manifest/v2")
        self.assertEqual(tuple(manifest), MANIFEST_KEYS_CONTRACT)
        self.assertEqual(h.ship.MANIFEST_KEYS, MANIFEST_KEYS_CONTRACT)
        self.assertRegex(manifest["commit_full"], r"^[0-9a-f]{40}$")
        self.assertEqual(manifest["commit"], HEAD[:7])
        self.assertEqual(manifest["package_version"], "0.9.1")
        self.assertEqual(manifest["target"], "staging")
        self.assertEqual(manifest["lane"], "unbound")
        self.assertIsNotNone(manifest["built_at"])
        for key in ("gitlab_project_id", "gitlab_intake_sha", "gitlab_package_name", "gitlab_package_version"):
            self.assertIsNone(manifest[key], key)
        self._assert_manifest_public_safe(manifest)
        for call in h.calls:
            self.assertEqual(call[0], "git", f"manifest writing must not run {call}")

    def test_manifest_redacts_urls_ips_hosts_and_secret_values(self) -> None:
        h = ShipHarness(self.tmp, {})
        original = h.ship._run
        subject = (f"fix: see https://example.invalid/x and {FAKE_HOST_VALUE} and 203.0.113.9 and staging-kvm1 "
                   f"and {FAKE_SECRET_VALUE} and BUILDANDDO_PH but keep scripts/deploy/ship.py and package.json")

        def leaky_run(cmd, cwd=None, timeout=600):  # noqa: ANN001
            if cmd[:2] == ["git", "log"]:
                return _ok(subject + "\n")
            return original(cmd, cwd, timeout)

        h.ship._run = leaky_run
        self.assertTrue(h.ship._write_release_manifest({"actual": HEAD, "ok": False})["ok"])
        manifest = h.manifest()
        self._assert_manifest_public_safe(manifest)
        self.assertNotIn("staging-kvm1", manifest["commit_message"])
        self.assertIn("[redacted]", manifest["commit_message"])
        self.assertIn("scripts/deploy/ship.py", manifest["commit_message"], "file names are not hostnames")
        self.assertIn("package.json", manifest["commit_message"])
        self.assertEqual(manifest["commit_message"].count("[redacted]"), 6)

    def test_public_safe_splits_on_any_whitespace(self) -> None:
        h = ShipHarness(self.tmp, {})
        self.assertEqual(h.ship._public_safe("fix\thttps://x.y/z\tdone"), "fix [redacted] done")
        self.assertEqual(h.ship._public_safe("chore: bump v2.0.0 of ship.py"), "chore: bump v2.0.0 of ship.py")

    # (2) lane file candidate != HEAD -> refused before build, exit 2
    def test_bind_sha_mismatch_refuses_before_build(self) -> None:
        h = ShipHarness(self.tmp, {})
        lane = h.write_lane_file(OTHER)
        h.rebind(lane)
        rc = h.ship.main(["--stage-only"])
        self.assertEqual(rc, 2)
        lines = h.ledger_lines()
        self.assertEqual(len(lines), 1)
        rec = lines[0]
        self.assertEqual(rec["stopped_at"], "bind_sha_mismatch")
        self.assertEqual(rec["bind"], {"expected": OTHER, "actual": HEAD, "ok": False, "state": "mismatch",
                                       "github_state": "HOLD", "reason": "candidate_sha != git rev-parse HEAD"})
        self.assertNotIn("build", rec["stages"])
        self.assertNotIn("staging_sync", rec["stages"])
        self.assertIsNone(rec["manifest"], "a refused run must not pre-claim a manifest")
        self.assertFalse(h.manifest_exists(), "no manifest for a refused build")
        for call in h.calls:
            self.assertEqual(call[0], "git", f"refused run must not execute {call}")
        self.assertEqual(rec["remote_writes"], 0)
        self.assertEqual(rec["lane_file"], str(lane))
        self._assert_record_clean(h)

    def test_invalid_lane_files_refuse_before_build(self) -> None:
        cases = {
            "not json": {"body": "{not json"},
            "json list": {"body": "[]"},
            "wrong schema": {"body": json.dumps({"schema": "citadel.tenant-rail-lane/v0", "tenant_id": "buildanddo",
                                                 "candidate_sha": HEAD})},
            "wrong tenant": {"candidate_sha": HEAD, "tenant_id": "someone-else"},
            "short sha": {"candidate_sha": HEAD[:7]},
            "uppercase sha": {"candidate_sha": HEAD.upper()},
            "no github block": {"candidate_sha": HEAD, "github": None},
            "github block not an object": {"candidate_sha": HEAD, "github": "PASS"},
            "github.sha differs": {"candidate_sha": HEAD, "github_sha": OTHER},
            "github.sha null": {"candidate_sha": HEAD, "github": {"ref": "refs/heads/main", "sha": None, "state": "PASS"}},
            "github.state FAIL": {"candidate_sha": HEAD, "github_state": "FAIL"},
            "github.state UNMEASURED": {"candidate_sha": HEAD, "github_state": "UNMEASURED"},
            "github.state missing": {"candidate_sha": HEAD, "github": {"ref": "refs/heads/main", "sha": HEAD}},
            "github.ref not a branch": {"candidate_sha": HEAD, "github_ref": "refs/tags/v1"},
            "github.ref hostile": {"candidate_sha": HEAD, "github_ref": "refs/heads/evil host"},
        }
        for label, spec in cases.items():
            with self.subTest(label):
                tmp = self.tmp / label.replace(" ", "_").replace(".", "_")
                tmp.mkdir()
                h = ShipHarness(tmp, {})
                lane = h.write_lane_file(None, body=spec["body"]) if "body" in spec else h.write_lane_file(**spec)
                h.rebind(lane)
                rc = h.ship.main(["--stage-only"])
                self.assertEqual(rc, 2, label)
                rec = h.ledger_lines()[-1]
                self.assertEqual(rec["stopped_at"], "lane_file_invalid", label)
                self.assertEqual(rec["stages"], {}, label)
                self.assertIsNone(rec["manifest"], label)
                self.assertFalse(h.manifest_exists(), label)
                self.assertFalse(rec["bind"]["ok"], label)
                self.assertEqual(rec["remote_writes"], 0, label)
                for call in h.calls:
                    self.assertEqual(call[0], "git", f"{label}: refused run must not execute {call}")

    # (3) matching lane file -> github-staging, sha == commit_full, ref from the file, executor from env
    def test_matching_lane_file_binds_manifest(self) -> None:
        h = ShipHarness(self.tmp, {"CITADEL_EXECUTOR": "rig1", "CITADEL_LANE_VERSION": "9.9.9"})
        lane = h.write_lane_file(HEAD, lane_version="2.0.0")
        h.rebind(lane)
        production: list = []
        h.fake_pipeline(production)
        rc = h.ship.main(["--stage-only", "--json", str(self.tmp / "receipt.json")])
        self.assertEqual(rc, 0, h.ledger_lines())
        manifest = h.manifest()
        self.assertEqual(manifest["lane"], "github-staging")
        self.assertEqual(manifest["github_sha"], HEAD)
        self.assertEqual(manifest["github_sha"], manifest["commit_full"], "github-staging means GitHub answered for HEAD")
        self.assertEqual(manifest["github_ref"], "refs/heads/main")
        self.assertEqual(manifest["executor"], "rig1")
        self.assertEqual(manifest["lane_version"], "2.0.0", "the lane file wins over CITADEL_LANE_VERSION")
        self.assertEqual(manifest["branch"], "main", "detached worktree names the bound ref")
        self.assertEqual(manifest["commit_full"], HEAD)
        self.assertEqual(manifest["target"], "staging")
        self._assert_manifest_public_safe(manifest)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "stage_only")
        self.assertTrue(rec["bind"]["ok"])
        self.assertEqual(rec["bind"]["github_state"], "HOLD")
        self.assertEqual(rec["lane"], "github-staging")
        self.assertEqual(rec["executor"], "rig1")
        self.assertEqual(rec["manifest"], {"schema": "citadel.release-manifest/v2", "commit_full": HEAD,
                                           "github_sha": HEAD, "lane": "github-staging", "target": "staging"})
        self.assertEqual(rec["remote_writes"], 1)
        self.assertEqual(production, [])
        self.assertFalse(rec["direct_production_legacy"])
        self.assertFalse(rec["promoted_to_production"])
        self.assertEqual(rec["authority"], {"required": None, "acknowledged": False})
        self._assert_record_clean(h, self.tmp / "receipt.json")

    def test_lane_file_github_state_pass_also_binds(self) -> None:
        h = ShipHarness(self.tmp, {})
        h.rebind(h.write_lane_file(HEAD, github_state="PASS"))
        h.fake_pipeline([])
        self.assertEqual(h.ship.main(["--stage-only"]), 0)
        self.assertEqual(h.manifest()["lane"], "github-staging")

    # (4) no lane file + --stage-only -> unbound for a human; refused for a controller
    def test_stage_only_without_lane_file_is_unbound_for_a_human(self) -> None:
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

    def test_controller_without_lane_file_is_refused(self) -> None:
        h = ShipHarness(self.tmp, {"CITADEL_EXECUTOR": "rig1"})
        h.fake_pipeline([])
        rc = h.ship.main(["--stage-only"])
        self.assertEqual(rc, 2)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "lane_file_required")
        self.assertEqual(rec["bind"]["state"], "required")
        self.assertEqual(rec["stages"], {})
        self.assertEqual(rec["remote_writes"], 0)
        self.assertFalse(h.manifest_exists())

    def test_lane_file_with_null_candidate_stays_unbound(self) -> None:
        h = ShipHarness(self.tmp, {})
        lane = h.write_lane_file(None, github=None)
        h.rebind(lane)
        h.fake_pipeline([])
        self.assertEqual(h.ship.main(["--stage-only"]), 0)
        self.assertEqual(h.manifest()["lane"], "unbound")
        self.assertIsNone(h.manifest()["github_sha"])
        self.assertFalse(h.ledger_lines()[-1]["bind"]["ok"])

    # (5) flag-less run: refused before anything is built or written
    def test_flagless_run_refuses_before_any_write(self) -> None:
        h = ShipHarness(self.tmp, {})
        production: list = []
        h.fake_pipeline(production)
        h.rebind(h.write_lane_file(HEAD))
        h.fake_pipeline(production)
        rc = h.ship.main([])
        self.assertEqual(rc, 2)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "direct_production_refused")
        self.assertEqual(rec["stages"], {}, "nothing is built, gated, synced or probed")
        self.assertFalse(h.manifest_exists())
        self.assertIsNone(rec["manifest"])
        self.assertFalse(rec["promoted_to_production"])
        self.assertFalse(rec["direct_production_legacy"])
        self.assertEqual(rec["remote_writes"], 0)
        self.assertEqual(production, [])
        self.assertEqual(h.calls, [], "the refused run must not even ask git")

    # (6) legacy line: refused without --ack-authority (exit 3, nothing written); runs with it
    def test_legacy_flag_without_ack_is_authority_refused_before_build(self) -> None:
        h = ShipHarness(self.tmp, {})
        production: list = []
        h.fake_pipeline(production)
        rc = h.ship.main(["--direct-production-legacy", "--json", str(self.tmp / "receipt.json")])
        self.assertEqual(rc, 3)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "authority_refused")
        self.assertIn("A3_REQUIRES_ACK_AUTHORITY", rec["refusal"])
        self.assertEqual(rec["authority"], {"required": "A3", "acknowledged": False})
        self.assertEqual(rec["stages"], {})
        self.assertEqual(rec["remote_writes"], 0)
        self.assertEqual(production, [])
        self.assertFalse(h.manifest_exists())
        self.assertFalse(rec["promoted_to_production"])
        self.assertTrue(rec["direct_production_legacy"])
        self.assertEqual(h.calls, [])
        receipt = json.loads((self.tmp / "receipt.json").read_text(encoding="utf-8"))
        self.assertEqual(receipt["stopped_at"], "authority_refused")

    def test_legacy_line_with_ack_runs_through_main(self) -> None:
        h = ShipHarness(self.tmp, {})
        production: list = []
        h.fake_pipeline(production)
        h.ship._evidence_epoch = lambda: {"ok": True, "stage": "create", "epoch_id": "fake-epoch", "verified": True}
        published: list = []
        self._install_fake_publish(published)
        rc = h.ship.main(["--direct-production-legacy", "--ack-authority"])
        self.assertEqual(rc, 0, h.ledger_lines())
        rec = h.ledger_lines()[-1]
        self.assertIsNone(rec["stopped_at"])
        self.assertTrue(rec["promoted_to_production"])
        self.assertEqual(rec["authority"], {"required": "A3", "acknowledged": True})
        self.assertEqual(rec["remote_writes"], 2)
        self.assertEqual(production, [h.ship.PROD_REMOTE_DIR])
        self.assertEqual(rec["lane"], "direct-legacy")
        self.assertTrue(rec["stages"]["prod_sync"]["ok"])
        self.assertTrue(rec["stages"]["prod_probe"]["ok"])
        self.assertEqual(rec["stages"]["evidence_epoch"]["epoch_id"], "fake-epoch")
        self.assertEqual(len(published), 1)
        self.assertEqual(published[0]["title"], COMMIT_MESSAGE)
        manifest = h.manifest()
        self.assertEqual(manifest["lane"], "direct-legacy")
        self.assertEqual(manifest["target"], "staging+production")
        self.assertIsNone(manifest["github_sha"])
        self._assert_manifest_public_safe(manifest)
        self._assert_record_clean(h)

    def test_legacy_line_stopping_at_prod_probe_is_not_promoted(self) -> None:
        h = ShipHarness(self.tmp, {})
        production: list = []
        h.fake_pipeline(production)
        original_probe = h.ship._probe
        h.ship._probe = lambda url, retries=5, delay=2.0: ({"ok": False, "status": 502, "attempts": retries,
                                                            "error": "HTTPError: 502", "body_prefix": "bad gateway"}
                                                           if url == h.ship.PROD_URL else original_probe(url))
        rc = h.ship.main(["--direct-production-legacy", "--ack-authority"])
        self.assertEqual(rc, 1)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "prod_probe")
        self.assertFalse(rec["promoted_to_production"])
        self.assertEqual(rec["remote_writes"], 2)
        self.assertNotIn("evidence_epoch", rec["stages"])
        self.assertEqual(rec["stages"]["prod_probe"]["body_prefix"], "bad gateway")

    def test_stage_only_and_legacy_flag_are_mutually_exclusive(self) -> None:
        h = ShipHarness(self.tmp, {})
        stderr = sys.stderr
        sys.stderr = io.StringIO()
        try:
            with self.assertRaises(SystemExit) as ctx:
                h.ship._parse_args(["--stage-only", "--direct-production-legacy"])
        finally:
            sys.stderr = stderr
        self.assertEqual(ctx.exception.code, 2)
        self.assertEqual(h.ledger_lines(), [])

    def test_help_lists_flags_and_docstring_dropped_auto_promote(self) -> None:
        h = ShipHarness(self.tmp, {})
        stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            with self.assertRaises(SystemExit):
                h.ship._parse_args(["--help"])
            help_text = sys.stdout.getvalue()
        finally:
            sys.stdout = stdout
        for flag in ("--stage-only", "--direct-production-legacy", "--ack-authority", "--json"):
            self.assertIn(flag, help_text)
        ns = h.ship._parse_args(["--direct-production-legacy", "--ack-authority", "--json", "x.json"])
        self.assertTrue(ns.direct_production_legacy)
        self.assertTrue(ns.ack_authority)
        self.assertEqual(ns.json_path, "x.json")
        self.assertNotIn("automatically pushed to production", h.ship.__doc__ or "")
        self.assertIn("direct_production_refused", h.ship.__doc__ or "")
        self.assertIn("authority_refused", h.ship.__doc__ or "")

    # (7) staging failures: rc 1, the probe body is kept, secrets scrubbed from the tails
    def test_staging_probe_failure_keeps_body_and_stops(self) -> None:
        h = ShipHarness(self.tmp, {})
        h.rebind(h.write_lane_file(HEAD))
        h.fake_pipeline([], staging_probe_ok=False)
        rc = h.ship.main(["--stage-only"])
        self.assertEqual(rc, 1)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "staging_probe")
        self.assertEqual(rec["remote_writes"], 1)
        self.assertEqual(rec["stages"]["staging_probe"]["status"], 503)
        self.assertEqual(rec["stages"]["staging_probe"]["body_prefix"], "upstream unavailable")

    def test_ssh_failure_stderr_is_scrubbed_of_secret_values(self) -> None:
        h = ShipHarness(self.tmp, {})
        failure = {"ok": False, "stage": "clear_remote", "returncode": 255,
                   "stdout_tail": "", "stderr_tail": f"ssh: connect to host {FAKE_HOST_VALUE} port 22: refused "
                                                     f"(token {FAKE_SECRET_VALUE})"}
        h.fake_pipeline([], staging_sync=failure)
        rc = h.ship.main(["--stage-only", "--json", str(self.tmp / "receipt.json")])
        self.assertEqual(rc, 1)
        rec = h.ledger_lines()[-1]
        self.assertEqual(rec["stopped_at"], "staging_sync")
        self.assertEqual(rec["remote_writes"], 0)
        self.assertEqual(rec["secret_values_scrubbed"], 2)
        self.assertEqual(rec["secret_values_persisted"], 0)
        self.assertIn("[redacted]", rec["stages"]["staging_sync"]["stderr_tail"])
        self._assert_record_clean(h, self.tmp / "receipt.json")

    def test_real_rsync_shape_uses_key_path_but_records_none(self) -> None:
        """_rsync builds ssh/scp from the resolved key path; the record only says a key is configured."""
        h = ShipHarness(self.tmp, {})
        seen: list = []

        def fake_run(cmd, cwd=None, timeout=600):  # noqa: ANN001, ARG001
            seen.append(list(cmd))
            return {"ok": False, "returncode": 255, "stdout_tail": "", "stderr_tail": f"{FAKE_HOST_VALUE}: refused"}

        h.ship._run = fake_run
        result = h.ship._rsync(h.clone / "dist", h.ship.STAGING_REMOTE_DIR)
        self.assertFalse(result["ok"])
        self.assertEqual(result["stage"], "clear_remote")
        self.assertEqual(seen[0][0], "ssh")
        self.assertEqual(seen[0][1], "-i")
        self.assertEqual(Path(seen[0][2]), (h.clone / "secrets" / "keys" / "fake.pem").resolve())
        self.assertIn(FAKE_HOST_VALUE, seen[0], "the host value is used for transport, by name from the file")
        h.state_dir.mkdir(parents=True, exist_ok=True)
        h.ship._finish({"stages": {"staging_sync": result}, "direct_production_legacy": False,
                        "ssh_key": {"configured": True, "source": "relative_to_clone"}})
        self._assert_record_clean(h)

    # (8) env overrides: ledger dir + secrets file, read by name; names from colon lines too
    def test_state_dir_and_secrets_file_overrides(self) -> None:
        h = ShipHarness(self.tmp, {"CITADEL_EXECUTOR": "rig1"},
                        secrets={"BUILDANDDO_SSH_KEY": "secrets/keys/fake.pem"})
        self.assertEqual(h.ship.LOCAL_SECRETS, h.secrets_file.resolve())
        self.assertEqual(h.ship.STATE_DIR, h.state_dir.resolve())
        self.assertEqual(h.ship._SECRETS["BUILDANDDO_VM_HOST"], FAKE_HOST_VALUE)
        self.assertEqual(h.ship.VM_HOST, FAKE_HOST_VALUE)
        self.assertIn("BUILDANDDO_VM_HOST", h.ship._SECRET_NAMES)
        self.assertIn("FLARUM_ADMIN_PASS", h.ship._SECRET_NAMES, "colon-separated lines contribute their NAME")
        self.assertNotIn("FLARUM_ADMIN_PASS", h.ship._SECRETS, "colon-separated lines never contribute a value")
        for control in ("BUILDANDDO_SECRETS_FILE", "BUILDANDDO_STATE_DIR", "CITADEL_EXECUTOR"):
            self.assertNotIn(control, h.ship._SECRET_NAMES, "control names are not secret names")
        self.assertEqual(h.ship.SSH_KEY_SOURCE, "relative_to_clone")
        self.assertEqual(Path(h.ship.SSH_KEY), (h.clone / "secrets" / "keys" / "fake.pem").resolve())
        h.rebind(h.write_lane_file(HEAD))
        h.fake_pipeline([])
        self.assertEqual(h.ship.main(["--stage-only", "--json", str(self.tmp / "receipt.json")]), 0)
        self.assertTrue((h.state_dir / "history.jsonl").is_file())
        self.assertTrue((h.state_dir / "latest.json").is_file())
        receipt = json.loads((self.tmp / "receipt.json").read_text(encoding="utf-8"))
        self.assertEqual(receipt["stopped_at"], "stage_only")
        self.assertEqual(receipt["secret_values_persisted"], 0)
        self.assertEqual(receipt["secret_values_scrubbed"], 0)
        self.assertEqual(receipt["lane_file"], str(self.tmp / "lane.latest.json"), "control values are not scrubbed")
        self._assert_record_clean(h, self.tmp / "receipt.json")

    def test_absolute_ssh_key_is_kept(self) -> None:
        absolute = str((self.tmp / "abs.pem").resolve())
        h = ShipHarness(self.tmp, {}, secrets={"BUILDANDDO_SSH_KEY": absolute})
        self.assertEqual(h.ship.SSH_KEY, absolute)
        self.assertEqual(h.ship.SSH_KEY_SOURCE, "absolute")

    # (9) probe keeps 4xx bodies (estate rule) and never swallows them
    def test_probe_keeps_4xx_status_and_body(self) -> None:
        h = ShipHarness(self.tmp, {})
        seen_ua: list = []

        def fake_urlopen(req, timeout=10):  # noqa: ANN001, ARG001
            seen_ua.append(req.get_header("User-agent"))
            raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, io.BytesIO(b"cloudflare says no"))

        urllib.request.urlopen = fake_urlopen
        h.ship.time.sleep = lambda s: None
        result = h.ship._probe("https://example.invalid/", retries=2, delay=0)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], 403)
        self.assertEqual(result["body_prefix"], "cloudflare says no")
        self.assertEqual(result["attempts"], 2)
        self.assertTrue(all(ua and ua.startswith("BuildAndDo-Ship-Probe") for ua in seen_ua), seen_ua)

    def test_activity_publish_contract_names_exist(self) -> None:
        h = ShipHarness(self.tmp, {})
        for name in ("_SECRETS", "_run", "_notify_guildmasters", "ROOT", "STATE_DIR", "LOCAL_SECRETS"):
            self.assertTrue(hasattr(h.ship, name), name)


class CandidateManifestTests(unittest.TestCase):
    """(10) candidate_manifest.py: additive fields, authority unchanged, temp git repo only."""

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

    def test_executor_env_name_is_accepted_as_readback(self) -> None:
        upstream = "abcdef0123456789abcdef0123456789abcdef01"
        manifest = self._run({"CITADEL_EXECUTOR": "rig1", "CITADEL_GITHUB_SHA": upstream})
        self.assertEqual(manifest["github_readback"], {"sha": upstream, "observed_at": None})
        readback_first = self._run({"CITADEL_GITHUB_READBACK_SHA": upstream, "CITADEL_GITHUB_SHA": "not-used"})
        self.assertEqual(readback_first["github_readback"]["sha"], upstream, "the controller's name wins")

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
