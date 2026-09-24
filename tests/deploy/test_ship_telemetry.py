# --- CGRF Header ------------------------------------------------
# File:        tests/deploy/test_ship_telemetry.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/deploy/ship.py, apps/web/tools/release-telemetry.mjs
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/deploy/ship.py; VALIDATES apps/web/tools/release-telemetry.mjs
# Intent:      Exercise artifact admission and served-byte readback with synthetic data and no credential or network access.
# ----------------------------------------------------------------

from __future__ import annotations

import copy
from functools import lru_cache
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from contextlib import redirect_stdout


ROOT = Path(__file__).resolve().parents[2]
NODE = shutil.which("node") or "node"
VALIDATOR = ROOT / "apps/web/tools/release-telemetry.mjs"
spec = importlib.util.spec_from_file_location("ship_telemetry_under_test", ROOT / "scripts/deploy/ship.py")
ship = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = ship
# ship retains its operator-side credential loading. Tests must fence it before import.
with patch.dict(os.environ, {"CITADEL_WORKSPACE_ENV": "synthetic-unused-store"}, clear=True), \
        patch.object(Path, "is_file", return_value=False), \
        patch.object(Path, "read_text", side_effect=AssertionError("credential read during import")):
    spec.loader.exec_module(ship)

PUBLIC_INPUTS = {
    "VITE_BUILDANDDO_PH": "synthetic-posthog-input",
    "VITE_DD_APPLICATION_ID": "synthetic-datadog-application",
    "VITE_DD_CLIENT_TOKEN": "synthetic-datadog-intake",
    "VITE_DD_SESSION_SAMPLE_RATE": "100",
    "VITE_DD_REPLAY_SAMPLE_RATE": "20",
    "VITE_DD_TRACE_SAMPLE_RATE": "20",
    "VITE_DD_ENV": "",
    "VITE_BUILD_SHA": "a" * 40,
    "VITE_DD_VERSION": "38+aaaaaaa",
}


def local_validator(command: list[str], **kwargs) -> dict:
    """Run only the local, credential-free Node validator; never a deploy command."""
    if command[0] != "node" or Path(command[1]).name != VALIDATOR.name or command[2] not in {"contract", "verify"}:
        raise AssertionError("unexpected command")
    result = subprocess.run([NODE, str(VALIDATOR), *command[2:]], cwd=ROOT,
                            env=kwargs.get("env") or {"PATH": os.environ.get("PATH", "")},
                            capture_output=True, text=True, timeout=30)
    return {"ok": result.returncode == 0, "returncode": result.returncode,
            "stdout_tail": result.stdout[-2000:], "stderr_tail": result.stderr[-2000:]}


def command_double(command: list[str], **kwargs) -> dict:
    if command[0] == "node":
        return local_validator(command, **kwargs)
    if command[0] == "git":
        return {"ok": True, "stdout_tail": "a" * 40}
    if command[0] in {"ssh", "scp"}:
        return {"ok": True, "returncode": 0}
    raise AssertionError("unexpected command")


@lru_cache(maxsize=3)
def synthetic_descriptor(target: str) -> dict:
    with tempfile.TemporaryDirectory(prefix="telemetry-contract-") as temporary:
        root = Path(temporary)
        (root / ".version").write_text("38\n", encoding="utf-8")
        environment = {**PUBLIC_INPUTS, "BUILDANDDO_RELEASE_TARGET": target,
                       "BUILDANDDO_TELEMETRY_BUILD_ID": "11111111-1111-4111-8111-111111111111"}
        result = local_validator(["node", str(VALIDATOR), "contract", str(root), "a" * 40], env=environment)
        if not result["ok"]:
            raise AssertionError("synthetic contract setup failed")
        return json.loads(result["stdout_tail"])


def make_artifact(directory: Path, *, target: str = "staging-production") -> dict:
    """Create a synthetic bundler receipt, never a vendor-ingestion receipt."""
    (directory / "assets").mkdir(parents=True, exist_ok=True)
    (directory / "index.html").write_text('<script type="module" src="/assets/app.js"></script>', encoding="utf-8")
    code = ('p.init("synthetic-posthog-input",{api_host:"https://intake.invalid"});'
            'r.init({applicationId:"synthetic-datadog-application",clientToken:"synthetic-datadog-intake"});'
            'l.init({clientToken:"synthetic-datadog-intake",forwardErrorsToLogs:true});')
    (directory / "assets/app.js").write_text(code, encoding="utf-8")
    expected = copy.deepcopy(synthetic_descriptor(target))
    (directory / "version.json").write_text(json.dumps({"commit_sha": expected["commit_sha"], "version": expected["version"]}), encoding="utf-8")
    files = {}
    for name in ("index.html", "assets/app.js", "version.json"):
        data = (directory / name).read_bytes()
        files[name] = {"size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    sinks = {}
    for name in ("posthog", "datadog_rum", "datadog_logs"):
        sinks[name] = {"adapter": "assets/app.js", "sdk": "assets/app.js"}
    # A synthetic producer receipt for consumer tests. Real source execution and
    # bundling are tested separately in build.test.mjs, not asserted by this fixture.
    check = {"schema": "buildanddo.sdk-config-check/v1", "scope": "offline-sdk-stubs-not-ingestion",
             "config_sha256": expected["sdk_config_sha256"], "source_sha256": {
                 name: hashlib.sha256(("fixture:" + name).encode()).hexdigest() for name in (
                     "src/lib/telemetry.js", "src/lib/datadogRum.js", "src/lib/observability/context.js",
                     "src/lib/observability/config.js", "src/lib/navigationIntent.js")}}
    manifest = {**expected, "entries": ["assets/app.js"], "sinks": sinks, "files": files, "adapter_contract": check}
    (directory / ship.TELEMETRY_MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
    return expected


class TelemetryArtifactTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="ship-telemetry-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.dist = self.root / "dist"
        self.expected = make_artifact(self.dist)
        (self.root / ".version").write_text("38\n", encoding="utf-8")
        for patcher in (patch.object(ship, "ROOT", self.root), patch.object(ship, "DIST_DIR", self.dist),
                        patch.object(ship, "STATE_DIR", self.root / "state"), patch.object(ship, "VM_HOST", "deploy@host.invalid"),
                        patch.object(ship, "SSH_KEY", ""),
                        patch.object(ship, "_run", side_effect=command_double),
                        patch.object(ship.urllib.request, "urlopen", side_effect=AssertionError("unexpected network call"))):
            patcher.start()
            self.addCleanup(patcher.stop)

    def manifest(self) -> dict:
        return json.loads((self.dist / ship.TELEMETRY_MANIFEST).read_bytes())

    def write_manifest(self, value: dict) -> None:
        (self.dist / ship.TELEMETRY_MANIFEST).write_text(json.dumps(value), encoding="utf-8")

    def verify(self, environment: str = "production") -> dict:
        return ship._verify_telemetry_artifact(self.dist, self.expected, environment=environment)

    def test_valid_synthetic_artifact_is_admitted_for_both_environments(self) -> None:
        for environment in ("staging", "production"):
            self.assertTrue(self.verify(environment)["ok"])

    def test_changed_missing_truncated_and_extra_javascript_refuse_before_remote_commands(self) -> None:
        original = (self.dist / "assets/app.js").read_bytes()
        for kind in ("missing", "truncated", "stale", "extra"):
            with self.subTest(kind=kind):
                (self.dist / "assets/app.js").write_bytes(original)
                if kind == "missing":
                    (self.dist / "assets/app.js").unlink()
                elif kind == "truncated":
                    (self.dist / "assets/app.js").write_bytes(original[:12])
                elif kind == "stale":
                    (self.dist / "assets/app.js").write_bytes(original.replace(b"p.init", b"x.init"))
                else:
                    (self.dist / "assets/stale.js").write_text("old()", encoding="utf-8")
                with patch.object(ship, "_run", side_effect=local_validator) as command:
                    result = ship._rsync(self.dist, ship.PROD_REMOTE_DIR, expected_telemetry=self.expected)
                self.assertFalse(result["ok"])
                self.assertEqual(result["stage"], "telemetry_artifact")
                self.assertTrue(all(call.args[0][0] == "node" for call in command.call_args_list))
        (self.dist / "assets/stale.js").unlink()

    def test_bad_manifest_fields_refuse_before_any_copy(self) -> None:
        original = self.manifest()
        for key in ("schema", "build_id", "commit_sha", "version", "config_sha256", "public_input_sha256", "sdk_config_sha256", "adapter_contract", "target", "sinks", "entries"):
            with self.subTest(key=key):
                changed = copy.deepcopy(original)
                changed[key] = {} if key == "sinks" else [] if key == "entries" else "mismatched"
                self.write_manifest(changed)
                with patch.object(ship, "_run", side_effect=local_validator) as command:
                    result = ship._rsync(self.dist, ship.STAGING_REMOTE_DIR, expected_telemetry=self.expected)
                self.assertFalse(result["ok"])
                self.assertTrue(all(call.args[0][0] == "node" for call in command.call_args_list))
        self.write_manifest(original)

    def test_missing_malformed_symlinked_manifest_and_invalid_proof_are_refused(self) -> None:
        path = self.dist / ship.TELEMETRY_MANIFEST
        original = path.read_bytes()
        path.unlink()
        self.assertFalse(self.verify()["ok"])
        path.write_text("{", encoding="utf-8")
        self.assertFalse(self.verify()["ok"])
        path.unlink()
        path.symlink_to(self.dist / "version.json")
        self.assertFalse(self.verify()["ok"])
        path.unlink()
        path.write_bytes(original)
        manifest = self.manifest()
        manifest["adapter_contract"]["config_sha256"]["staging"]["posthog"] = "0" * 64
        self.write_manifest(manifest)
        self.assertFalse(self.verify()["ok"])

    def test_wrong_environment_and_unbound_booleans_cannot_authorize_copy(self) -> None:
        self.expected = make_artifact(self.dist, target="staging")
        self.assertTrue(self.verify("staging")["ok"])
        with patch.object(ship, "_run", side_effect=local_validator) as command:
            self.assertFalse(ship._rsync(self.dist, ship.PROD_REMOTE_DIR, expected_telemetry=self.expected)["ok"])
        self.assertTrue(all(call.args[0][0] == "node" for call in command.call_args_list))
        self.write_manifest({"posthog": True, "datadog": True, "ok": True})
        self.assertFalse(self.verify()["ok"])

    def test_manifest_is_pinned_between_staging_and_production(self) -> None:
        self.expected["manifest_sha256"] = self.verify()["manifest_sha256"]
        manifest = self.manifest()
        manifest["extra"] = "changed-after-staging"
        self.write_manifest(manifest)
        self.assertFalse(self.verify()["ok"])

    def test_validator_failure_precedes_copy_even_with_matching_manifest_hashes(self) -> None:
        with patch.object(ship, "_run", return_value={"ok": False}) as command:
            result = ship._rsync(self.dist, ship.PROD_REMOTE_DIR, expected_telemetry=self.expected)
        self.assertEqual(result["reason"], "telemetry artifact admission failed")
        self.assertEqual(len(command.call_args_list), 1)
        self.assertEqual(command.call_args.args[0][0], "node")

    def test_matching_html_hash_cannot_hide_a_wrong_entry_or_release(self) -> None:
        for name, replacement in (("index.html", '<script src="/assets/not-built.js"></script>'),
                                  ("version.json", '{"commit_sha":"stale","version":"stale"}')):
            with self.subTest(name=name):
                self.expected = make_artifact(self.dist)
                (self.dist / name).write_text(replacement, encoding="utf-8")
                manifest = self.manifest()
                manifest["files"][name] = {"size": len(replacement), "sha256": hashlib.sha256(replacement.encode()).hexdigest()}
                self.write_manifest(manifest)
                self.assertFalse(self.verify()["ok"])

    def test_release_inputs_are_public_only_and_match_node_contract(self) -> None:
        (self.root / ".version").write_text("38\n", encoding="utf-8")
        values = {"BUILDANDDO_PH": PUBLIC_INPUTS["VITE_BUILDANDDO_PH"],
                  "BUILDANDDO_DD_APPLICATION_ID": PUBLIC_INPUTS["VITE_DD_APPLICATION_ID"],
                  "BUILDANDDO_DD_CLIENT_TOKEN": PUBLIC_INPUTS["VITE_DD_CLIENT_TOKEN"],
                  "UNRELATED_PRIVATE_INPUT": "must-not-be-exported"}
        with patch.dict(os.environ, {}, clear=True), patch.object(ship, "_SECRETS", values), \
                patch.object(ship, "_run", side_effect=command_double):
            expected, environment = ship._release_build_context()
        self.assertNotIn("UNRELATED_PRIVATE_INPUT", environment)
        self.assertFalse((self.root / "apps/web/.env").exists())
        self.assertTrue(set(values) - {"UNRELATED_PRIVATE_INPUT"} <= set(ship.SHARED_KEYS))
        script = ('import {releaseTelemetryContract} from "./apps/web/tools/release-telemetry.mjs";'
                  'let data=""; for await (const part of process.stdin) data+=part;'
                  'const input=JSON.parse(data); const {publicConfig,...contract}=releaseTelemetryContract(input.env,input.release);'
                  'console.log(JSON.stringify(contract));')
        result = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, text=True,
                                input=json.dumps({"env": environment, "release": {"commit_sha": "a" * 40, "version": "38+aaaaaaa"}}),
                                capture_output=True, check=True, timeout=20)
        self.assertEqual(json.loads(result.stdout), expected)
        for value in values.values():
            self.assertNotIn(value, json.dumps(expected))

    def test_missing_public_keys_or_disabled_sessions_stop_before_build(self) -> None:
        for name in ("VITE_BUILDANDDO_PH", "VITE_DD_APPLICATION_ID", "VITE_DD_CLIENT_TOKEN", "VITE_DD_SESSION_SAMPLE_RATE", "VITE_DD_ENV"):
            with self.subTest(name=name):
                values = dict(PUBLIC_INPUTS)
                values[name] = "0" if name == "VITE_DD_SESSION_SAMPLE_RATE" else "production" if name == "VITE_DD_ENV" else ""
                with patch.object(ship, "_SECRETS", values), patch.object(ship, "_build") as build, \
                        patch.object(ship, "_gate") as gate, patch.object(ship, "_rsync") as sync, patch.object(ship, "_finish") as finish:
                    self.assertEqual(ship.main(), 1)
                self.assertEqual(finish.call_args.args[0]["stopped_at"], "telemetry_config")
                build.assert_not_called()
                gate.assert_not_called()
                sync.assert_not_called()

    def test_integrity_subprocess_failure_cannot_reuse_old_pass(self) -> None:
        report = self.root / "state/integrity/latest.json"
        report.parent.mkdir(parents=True)
        baseline = json.dumps({"state": "PASS", "generated_at": "2026-01-01T00:00:00+00:00",
                               "manifest": {"tracked_files": [{"path": "old.js", "sha256": "old"}]}})
        report.write_text(baseline, encoding="utf-8")
        for success in (False, True):
            with patch.object(ship, "_run", return_value={"ok": success}):
                self.assertFalse(ship._gate({})["ok"])
            self.assertEqual(report.read_text(encoding="utf-8"), baseline)

    def test_real_integrity_checker_sees_prior_manifest_and_produces_a_fresh_diff(self) -> None:
        spec = importlib.util.spec_from_file_location("integrity_checker_under_test", ROOT / "scripts/ci/integrity_regression_check.py")
        checker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(checker)
        state = self.root / "state/integrity"
        state.mkdir(parents=True)
        report = state / "latest.json"
        report.write_text(json.dumps({"state": "PASS", "manifest": {"tracked_files": [
            {"path": "retired.js", "sha256": "old"}, {"path": "changed.js", "sha256": "before"},
        ]}}), encoding="utf-8")
        current = {"tracked_files": [{"path": "added.js", "sha256": "new"}, {"path": "changed.js", "sha256": "after"}]}

        def invoke_checker(*args, **kwargs):
            self.assertEqual(json.loads(report.read_bytes())["manifest"]["tracked_files"][0]["path"], "retired.js")
            output = io.StringIO()
            with redirect_stdout(output):
                code = checker.main()
            return {"ok": code == 0, "stdout_tail": output.getvalue()}

        with patch.object(checker, "ROOT", self.root), patch.object(checker, "STATE_DIR", state), \
                patch.object(checker, "_load_manifest", return_value={"manifest": current}), \
                patch.object(checker, "_run", return_value={"returncode": 0}), \
                patch.object(ship, "_run", side_effect=invoke_checker):
            result = ship._gate({})
        self.assertTrue(result["ok"], result)
        self.assertTrue(result["fresh_report"])
        observed = json.loads(report.read_bytes())
        self.assertEqual(observed["diff"], {"added": ["added.js"], "removed": ["retired.js"], "changed": ["changed.js"],
                                           "total_prev": 2, "total_curr": 2})
        self.assertEqual(observed["manifest"], current)

    def test_failed_invocation_cannot_use_even_a_new_pass_report(self) -> None:
        report = self.root / "state/integrity/latest.json"
        report.parent.mkdir(parents=True)

        def failed(*args, **kwargs):
            report.write_text(json.dumps({"state": "PASS", "generated_at": ship.dt.datetime.now(ship.dt.timezone.utc).isoformat()}), encoding="utf-8")
            return {"ok": False}

        with patch.object(ship, "_run", side_effect=failed):
            result = ship._gate({})
        self.assertFalse(result["ok"])
        self.assertTrue(report.exists())

    def test_deployed_stamp_keeps_the_admitted_candidate_identity(self) -> None:
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(ship.subprocess, "run", return_value=SimpleNamespace(stdout="synthetic-branch")) as command:
            ship._write_deployed_version(self.expected["commit_sha"])
        for name in ("_version", ".well-known/citadel-release.json"):
            record = json.loads((self.dist / name).read_bytes())
            self.assertEqual(record["commit_sha"], self.expected["commit_sha"])
        self.assertEqual(len(command.call_args_list), 1)
        self.assertEqual(command.call_args.args[0][-2:], ["--abbrev-ref", "HEAD"])

    def test_best_effort_collectors_do_not_fail_the_designated_build(self) -> None:
        environment = {"BUILDANDDO_RELEASE_TARGET": "staging-production"}
        with patch.object(ship, "_write_roadmap_status", return_value={"ok": False}), \
                patch.object(ship, "_write_unmeasured_roadmap_status") as unmeasured, \
                patch.object(ship, "_write_capability_inventory", return_value={"ok": False}), \
                patch.object(ship, "_run", return_value={"ok": True}) as command:
            self.assertTrue(ship._build(environment)["ok"])
        unmeasured.assert_called_once()
        self.assertEqual(command.call_args.kwargs["env"], environment)
        self.assertFalse(self.dist.exists())

    def test_bad_served_bytes_prevent_production_copy(self) -> None:
        with patch.object(ship, "_release_build_context", return_value=(dict(self.expected), {})), \
                patch.object(ship, "_build", return_value={"ok": True}), patch.object(ship, "_gate", return_value={"ok": True}), \
                patch.object(ship, "_write_deployed_version"), patch.object(ship, "_run", side_effect=command_double) as commands, \
                patch.object(ship, "_probe", return_value={"ok": False, "reason": "served artifact mismatch"}), \
                patch.object(ship, "_finish") as finish:
            self.assertEqual(ship.main(), 1)
        self.assertEqual(len(commands.call_args_list), 5)
        self.assertEqual(finish.call_args.args[0]["stopped_at"], "staging_probe")

    def test_noop_rebuild_or_changed_artifact_stops_before_staging(self) -> None:
        stale = {**self.expected, "build_id": "22222222-2222-4222-8222-222222222222"}
        with patch.object(ship, "_release_build_context", return_value=(stale, {})), \
                patch.object(ship, "_build", return_value={"ok": True}), patch.object(ship, "_gate", return_value={"ok": True}), \
                patch.object(ship, "_rsync") as sync, patch.object(ship, "_write_deployed_version") as stamp, \
                patch.object(ship, "_finish") as finish:
            self.assertEqual(ship.main(), 1)
        self.assertEqual(finish.call_args.args[0]["stopped_at"], "telemetry_artifact")
        sync.assert_not_called()
        stamp.assert_not_called()

    def test_same_gated_bytes_pass_the_local_line_with_all_effects_mocked(self) -> None:
        publisher = SimpleNamespace(publish=Mock(return_value={"ok": True}))
        with patch.object(ship, "_release_build_context", return_value=(dict(self.expected), {"SYNTHETIC": "1"})), \
                patch.object(ship, "_build", return_value={"ok": True}) as build, \
                patch.object(ship, "_gate", return_value={"ok": True}) as gate, \
                patch.object(ship, "_write_deployed_version"), patch.object(ship, "_run", side_effect=command_double) as commands, \
                patch.object(ship, "_probe", return_value={"ok": True}), \
                patch.object(ship, "_refresh_capability_inventory", return_value={"ok": False}), \
                patch.object(ship, "_evidence_epoch", return_value={"ok": False}), \
                patch.object(ship, "_latest_commit", return_value={"message": "synthetic"}), \
                patch.dict(sys.modules, {"activity_publish": publisher}), patch.object(sys, "path", list(sys.path)), \
                patch.object(ship, "_finish") as finish:
            self.assertEqual(ship.main(), 0)
        self.assertEqual(build.call_args, gate.call_args)
        self.assertEqual(len(commands.call_args_list), 9)
        self.assertIsNone(finish.call_args.args[0]["stopped_at"])

    def test_changed_bytes_after_staging_cannot_reach_production_copy(self) -> None:
        def probe(*args, **kwargs):
            (self.dist / "assets/app.js").write_text("changed", encoding="utf-8")
            return {"ok": True}
        with patch.object(ship, "_release_build_context", return_value=(dict(self.expected), {})), \
                patch.object(ship, "_build", return_value={"ok": True}), patch.object(ship, "_gate", return_value={"ok": True}), \
                patch.object(ship, "_write_deployed_version"), patch.object(ship, "_run", side_effect=command_double) as commands, \
                patch.object(ship, "_probe", side_effect=probe), patch.object(ship, "_finish") as finish:
            self.assertEqual(ship.main(), 1)
        self.assertEqual(len(commands.call_args_list), 6)
        self.assertEqual(finish.call_args.args[0]["stopped_at"], "prod_sync")

    def test_served_html_and_javascript_are_compared_not_just_http_status(self) -> None:
        files = self.manifest()["files"]
        raw = (self.dist / ship.TELEMETRY_MANIFEST).read_bytes()
        files[ship.TELEMETRY_MANIFEST] = {"size": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        for changed in (None, "assets/app.js", ship.TELEMETRY_MANIFEST, "index.html"):
            with self.subTest(changed=changed):
                def fetch(request, **kwargs):
                    name = request.full_url.removeprefix("https://release.invalid/") or "index.html"
                    data = (self.dist / name).read_bytes() if name != changed else b"stale"
                    response = Mock(status=200)
                    response.read.side_effect = lambda length: data[:length]
                    response.geturl.return_value = request.full_url
                    response.__enter__ = Mock(return_value=response)
                    response.__exit__ = Mock(return_value=False)
                    return response
                with patch.object(ship.urllib.request, "urlopen", side_effect=fetch), patch.object(ship.time, "sleep"):
                    result = ship._probe("https://release.invalid/", artifacts=files, retries=1)
                self.assertEqual(result["ok"], changed is None)
                self.assertNotIn(PUBLIC_INPUTS["VITE_BUILDANDDO_PH"], json.dumps(result))


if __name__ == "__main__":
    unittest.main()
