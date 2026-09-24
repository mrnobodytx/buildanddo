# --- CGRF Header ------------------------------------------------
# File:        tests/deploy/test_release_telemetry.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     tools/buildanddo_release.py, tests/deploy/test_ship_telemetry.py
# EnumType:    Test
# EnumEdges:   VALIDATES tools/buildanddo_release.py; CONSUMES tests/deploy/test_ship_telemetry.py
# Intent:      Refuse incomplete canonical release artifacts before mocked copies and prove explicit release mode without secret or network access.
# ----------------------------------------------------------------

from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import patch

from tests.deploy.test_ship_telemetry import PUBLIC_INPUTS, ROOT, local_validator, make_artifact


spec = importlib.util.spec_from_file_location("canonical_telemetry_under_test", ROOT / "tools/buildanddo_release.py")
release = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = release
with patch.dict(os.environ, {"CITADEL_RELEASE_ENV": "synthetic-unused-store",
                             "CITADEL_WORKSPACE_ENV": "synthetic-unused-store"}, clear=True), \
        patch.object(Path, "read_text", side_effect=AssertionError("credential read during import")):
    spec.loader.exec_module(release)


class CanonicalTelemetryTests(unittest.TestCase):
    def test_both_release_guards_run_in_the_required_source_assurance_job(self) -> None:
        pipeline = (ROOT / ".gitlab/ci/source-validation.yml").read_text(encoding="utf-8")
        assurance = pipeline.split("\nsource_assurance:\n", 1)[1].split("\nassurance_full_runtime:\n", 1)[0]
        self.assertIn(
            "- state/ci/assurance-venv/bin/python -m unittest tests.deploy.test_ship_telemetry "
            "tests.deploy.test_release_telemetry tests.deploy.test_ship_swap", assurance
        )
        self.assertNotIn("allow_failure: true", assurance)

    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix="canonical-telemetry-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        (self.repo / ".version").write_text("38\n", encoding="utf-8")
        (self.repo / "package.json").write_text("{}", encoding="utf-8")
        self.artifact = self.repo / ".citadel-release/artifact"
        self.record_path = self.repo / ".citadel-release/artifact.json"
        self.expected = make_artifact(self.artifact)
        self.expected["manifest_sha256"] = release.sha256_file(self.artifact / "telemetry-manifest.json")
        self.record = {"state": "PASS", "commit_sha": "a" * 40, "artifact_dir": str(self.artifact),
                       "telemetry": self.expected, "manifest": release.artifact_manifest(self.artifact)}
        self.write_record()
        environment = {**PUBLIC_INPUTS,
                       "BUILDANDDO_STAGING_DEPLOY_MODE": "local_webroot", "BUILDANDDO_PRODUCTION_DEPLOY_MODE": "local_webroot",
                       "BUILDANDDO_STAGING_ROOT": str(self.root / "staging-webroot"),
                       "BUILDANDDO_PRODUCTION_ROOT": str(self.root / "production-webroot")}
        self.prepared = None
        for patcher in (patch.dict(os.environ, environment, clear=True),
                        patch.object(release, "git_head", return_value="a" * 40),
                        patch.object(release, "git_branch", return_value="synthetic-branch"),
                        patch.object(release, "write_receipt"),
                        patch.object(release, "run", side_effect=self.local_command),
                        patch.object(release.urllib.request, "urlopen", side_effect=AssertionError("network call"))):
            patcher.start()
            self.addCleanup(patcher.stop)

    def write_record(self) -> None:
        self.record_path.write_text(json.dumps(self.record), encoding="utf-8")

    def local_command(self, command, **kwargs):
        if command[0] != "node":
            raise AssertionError("unexpected command")
        result = local_validator(command, **kwargs)
        if command[2] == "contract" and result["ok"]:
            self.prepared = json.loads(result["stdout_tail"])
        return release.CommandResult(command, result["returncode"], result["stdout_tail"], result["stderr_tail"])

    def assert_no_copy(self, environment="production") -> None:
        with patch.object(release, "deploy_local_webroot") as local, patch.object(release, "deploy_ssh_webroot") as remote:
            with self.assertRaises(release.ReleaseError):
                release.deploy_environment(self.root, self.repo, environment, ack="A3")
        local.assert_not_called()
        remote.assert_not_called()

    def test_review_regression_canonical_copy_refuses_missing_manifest_for_both_modes(self) -> None:
        (self.artifact / "telemetry-manifest.json").unlink()
        for environment in ("staging", "production"):
            for mode in ("local_webroot", "ssh_webroot"):
                with self.subTest(environment=environment, mode=mode), \
                        patch.dict(os.environ, {f"BUILDANDDO_{environment.upper()}_DEPLOY_MODE": mode}):
                    self.assert_no_copy(environment)

    def test_legacy_unpinned_or_wrong_candidate_receipt_cannot_authorize_copy(self) -> None:
        original = copy.deepcopy(self.record)
        for problem in ("missing", "unpinned", "wrong_sha", "wrong_build_id", "wrong_schema"):
            with self.subTest(problem=problem):
                self.record = copy.deepcopy(original)
                if problem == "missing":
                    del self.record["telemetry"]
                elif problem == "unpinned":
                    del self.record["telemetry"]["manifest_sha256"]
                elif problem == "wrong_sha":
                    self.record["telemetry"]["commit_sha"] = "b" * 40
                elif problem == "wrong_build_id":
                    self.record["telemetry"]["build_id"] = "stale"
                else:
                    self.record["telemetry"]["schema"] = "buildanddo.release-telemetry/v1"
                self.write_record()
                self.assert_no_copy()

    def test_missing_truncated_stale_js_or_replaced_manifest_is_refused_before_copy(self) -> None:
        script = self.artifact / "assets/app.js"
        original = script.read_bytes()
        for problem in ("missing", "truncated", "stale"):
            with self.subTest(problem=problem):
                script.write_bytes(original)
                if problem == "missing":
                    script.unlink()
                elif problem == "truncated":
                    script.write_bytes(original[:10])
                else:
                    script.write_bytes(original.replace(b"p.init", b"x.init"))
                self.assert_no_copy()
        script.write_bytes(original)
        manifest = self.artifact / "telemetry-manifest.json"
        manifest.write_text(manifest.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        self.assert_no_copy()

    def test_staging_only_artifact_cannot_be_copied_to_production(self) -> None:
        self.expected = make_artifact(self.artifact, target="staging")
        self.expected["manifest_sha256"] = release.sha256_file(self.artifact / "telemetry-manifest.json")
        self.record.update(telemetry=self.expected, manifest=release.artifact_manifest(self.artifact))
        self.write_record()
        self.assert_no_copy("production")

    def test_complete_receipt_allows_only_mocked_copy_and_preserves_unverified_status(self) -> None:
        for environment in ("staging", "production"):
            with patch.object(release, "deploy_local_webroot", return_value={"mocked": True}) as local, \
                    patch.object(release, "deploy_ssh_webroot") as remote:
                result = release.deploy_environment(self.root, self.repo, environment, ack="A3")
            local.assert_called_once()
            remote.assert_not_called()
            self.assertEqual(result["state"], "MUTATED_UNVERIFIED")
            self.assertTrue(result["telemetry"]["ok"])
        self.assertFalse((self.root / "production-webroot").exists())

    def test_authority_and_complete_artifact_hash_remain_required(self) -> None:
        with patch.object(release, "run") as command:
            with self.assertRaises(release.ReleaseError):
                release.deploy_environment(self.root, self.repo, "production", ack="A2")
        command.assert_not_called()
        (self.artifact / "style.css").write_text("changed after build", encoding="utf-8")
        self.assert_no_copy()

    def test_designated_build_sets_fresh_release_context_and_admits_before_packaging(self) -> None:
        source = self.repo / "dist/apps/web"
        commands = []

        def run(command, **kwargs):
            commands.append((command, kwargs))
            if command[0] == "node":
                return self.local_command(command, **kwargs)
            if command == ["npm", "run", "build"]:
                env = kwargs["env"]
                self.assertEqual(env["BUILDANDDO_RELEASE_TARGET"], "staging-production")
                self.assertEqual(env["BUILDANDDO_TELEMETRY_BUILD_ID"], self.prepared["build_id"])
                make_artifact(source)
                path = source / "telemetry-manifest.json"
                manifest = json.loads(path.read_bytes())
                manifest.update(self.prepared)
                path.write_text(json.dumps(manifest), encoding="utf-8")
            elif "roadmap_status.py" not in str(command):
                raise AssertionError("unexpected command")
            return release.CommandResult(command, 0, "", "")

        with patch.object(release, "run", side_effect=run), \
                patch.object(release, "copy_tree_clean", wraps=release.copy_tree_clean) as package:
            result = release.build_release(self.repo, self.root, skip_install=True)
        package.assert_called_once_with(source, self.artifact)
        self.assertEqual(result["telemetry"]["build_id"], self.prepared["build_id"])
        self.assertNotEqual(result["telemetry"]["build_id"], self.expected["build_id"])
        self.assertEqual(result["telemetry"]["manifest_sha256"], hashlib.sha256((source / "telemetry-manifest.json").read_bytes()).hexdigest())
        self.assertEqual(sum(command[2] == "verify" for command, _kwargs in commands if command[0] == "node"), 2)
        for name in ("VITE_BUILDANDDO_PH", "VITE_DD_APPLICATION_ID", "VITE_DD_CLIENT_TOKEN"):
            self.assertNotIn(PUBLIC_INPUTS[name], json.dumps(result))

    def test_noop_build_cannot_package_a_stale_artifact(self) -> None:
        make_artifact(self.repo / "dist/apps/web")

        def run(command, **kwargs):
            if command[0] == "node":
                return self.local_command(command, **kwargs)
            return release.CommandResult(command, 0, "", "")

        with patch.object(release, "run", side_effect=run), patch.object(release, "copy_tree_clean") as package:
            with self.assertRaises(release.ReleaseError):
                release.build_release(self.repo, self.root, skip_install=True)
        package.assert_not_called()

    def test_missing_public_configuration_refuses_before_install_build_or_copy(self) -> None:
        for name in ("VITE_BUILDANDDO_PH", "VITE_DD_APPLICATION_ID", "VITE_DD_CLIENT_TOKEN"):
            with self.subTest(name=name), patch.dict(os.environ, {name: ""}), \
                    patch.object(release, "run", side_effect=self.local_command) as command, \
                    patch.object(release, "copy_tree_clean") as package:
                with self.assertRaises(release.ReleaseError):
                    release.build_release(self.repo, self.root)
                self.assertEqual(len(command.call_args_list), 1)
                self.assertEqual(command.call_args.args[0][2], "contract")
                package.assert_not_called()

    def test_runner_adoption_refuses_before_replacing_existing_candidate(self) -> None:
        before = self.record_path.read_bytes()

        def extract(_archive, destination):
            root = destination / ".citadel-release"
            artifact = root / "artifact"
            make_artifact(artifact)
            record = {"commit_sha": "a" * 40, "manifest": release.artifact_manifest(artifact)}
            (root / "artifact.json").write_text(json.dumps(record), encoding="utf-8")

        with patch.object(release, "gitlab_download_artifacts"), patch.object(release, "_safe_extract_zip", side_effect=extract), \
                patch.object(release.shutil, "copytree") as copytree:
            with self.assertRaises(release.ReleaseError):
                release.adopt_runner_artifact(self.root, self.repo, 1, "a" * 40)
        copytree.assert_not_called()
        self.assertEqual(self.record_path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
