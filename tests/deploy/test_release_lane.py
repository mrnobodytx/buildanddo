# --- CGRF Header ------------------------------------------------
# File:        tests/deploy/test_release_lane.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-GITLAB-RELEASE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GITLAB-RELEASE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     tools/buildanddo_release.py, .gitlab/ci/release.yml, .gitlab-ci.yml
# EnumType:    Test
# EnumEdges:   VALIDATES tools/buildanddo_release.py; VALIDATES .gitlab/ci/release.yml
# Intent:      Keep the GitLab release lane off unprotected refs and keep host-key checking strict on runners.
# ----------------------------------------------------------------

"""The GitLab release lane: when it may run, and how it trusts the web VM."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import re
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("release_lane_under_test", ROOT / "tools/buildanddo_release.py")
release = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = release
with patch.dict(os.environ, {"CITADEL_RELEASE_ENV": "synthetic-unused-store",
                             "CITADEL_WORKSPACE_ENV": "synthetic-unused-store"}, clear=True):
    spec.loader.exec_module(release)

LANE = (ROOT / ".gitlab/ci/release.yml").read_text(encoding="utf-8")


def job(name: str) -> str:
    return LANE.split(f"\n{name}:\n", 1)[1].split("\n\n", 1)[0]


class ReleaseLaneConfigTests(unittest.TestCase):
    def test_lane_is_included_and_runs_after_every_test_stage(self) -> None:
        root = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")
        self.assertIn("  - local: '.gitlab/ci/release.yml'", root)
        stages = root.split("\nstages:\n", 1)[1].split("\n\n", 1)[0].split()
        self.assertEqual([s for s in stages if s != "-"], ["verify", "test", "release"])

    def test_every_rule_needs_the_opt_in_and_a_protected_mirror(self) -> None:
        for name in ("release_staging", "release_production"):
            with self.subTest(job=name):
                rules = re.findall(r"- if: '([^']+)'", job(name))
                self.assertTrue(rules)
                for rule in rules:
                    self.assertIn('$CI_COMMIT_BRANCH == "buildanddo-source"', rule)
                    self.assertIn('$CI_COMMIT_REF_PROTECTED == "true"', rule)
                    self.assertIn('$BUILDANDDO_DEPLOY_ENABLE == "1"', rule)
                    self.assertNotIn("schedule", rule)
                    self.assertNotIn("review", rule)
                self.assertTrue(job(name).rstrip().endswith("- when: never"))

    def test_production_promotes_the_staged_artifact_and_never_rebuilds(self) -> None:
        staging, production = job("release_staging"), job("release_production")
        self.assertIn("tools/buildanddo_release.py pipeline-stage --root . --repo . --ack-authority A3", staging)
        self.assertIn("tools/buildanddo_release.py pipeline-promote --root . --repo . --ack-authority A3", production)
        self.assertIn("- job: release_staging\n      artifacts: true", production)
        self.assertIn("- .citadel-release/", staging)
        self.assertNotIn(" build ", production)
        for text in (staging, production):
            self.assertIn("resource_group: buildanddo-release", text)
            self.assertIn("interruptible: false", text)

    def test_automatic_production_is_a_second_explicit_opt_in(self) -> None:
        production = job("release_production")
        automatic, manual = re.findall(r"- if: '([^']+)'(.*?)(?=\n    - )", production, re.S)[:2]
        self.assertIn('$BUILDANDDO_PROMOTE_PRODUCTION == "1"', automatic[0])
        self.assertNotIn("when: manual", automatic[1])
        self.assertNotIn("BUILDANDDO_PROMOTE_PRODUCTION", manual[0])
        self.assertIn("when: manual", manual[1])


class HostKeyTests(unittest.TestCase):
    def setUp(self) -> None:
        directory = tempfile.TemporaryDirectory(prefix="release-lane-")
        self.addCleanup(directory.cleanup)
        self.dir = Path(directory.name)

    def options(self, value: str | None) -> list[str]:
        env = {} if value is None else {"BUILDANDDO_SSH_KNOWN_HOSTS": value}
        with patch.dict(os.environ, env, clear=True):
            return release.ssh_host_key_options()

    def test_default_keeps_the_operator_known_hosts_and_strict_checking(self) -> None:
        self.assertEqual(self.options(None), ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes"])

    def test_runner_known_hosts_file_is_used_and_checking_stays_strict(self) -> None:
        known = self.dir / "known_hosts"
        known.write_text("web.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample\n")
        options = self.options(str(known))
        self.assertIn("StrictHostKeyChecking=yes", options)
        self.assertNotIn("StrictHostKeyChecking=no", options)
        self.assertNotIn("StrictHostKeyChecking=accept-new", options)
        self.assertEqual(options[-1], f"UserKnownHostsFile={known}")

    def test_missing_or_empty_known_hosts_refuses_instead_of_trusting_anything(self) -> None:
        empty = self.dir / "empty"
        empty.write_text("")
        for value in (str(self.dir / "absent"), str(empty), str(self.dir)):
            with self.subTest(value=value), self.assertRaises(release.ReleaseError):
                self.options(value)

    def test_ssh_and_rsync_both_carry_the_known_hosts_file(self) -> None:
        known = self.dir / "known_hosts"
        known.write_text("web.example ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample\n")
        key = self.dir / "deploy_key"
        key.write_text("synthetic\n")
        artifact = self.dir / "artifact"
        artifact.mkdir()
        env = {
            "BUILDANDDO_SSH_KNOWN_HOSTS": str(known),
            "BUILDANDDO_STAGING_HOST": "web.example",
            "BUILDANDDO_STAGING_USER": "deploy",
            "BUILDANDDO_STAGING_SSH_KEY_FILE": str(key),
            "BUILDANDDO_STAGING_REMOTE_ROOT": "/var/www/buildanddo-staging",
        }
        calls: list[list[str]] = []

        def fake_run(command, **_kwargs):
            calls.append(list(command))
            return release.subprocess.CompletedProcess(command, 0, "", "")

        with patch.dict(os.environ, env, clear=True), \
                patch.object(release, "run", side_effect=fake_run), \
                patch.object(release.shutil, "which", return_value="/usr/bin/tool"), \
                patch.object(release.os, "name", "posix"):
            release.deploy_ssh_webroot(artifact, "a" * 40, "staging")
        self.assertEqual(len(calls), 2)
        self.assertIn(f"UserKnownHostsFile={known}", calls[0])
        remote_shell = calls[1][calls[1].index("-e") + 1]
        self.assertIn(f"UserKnownHostsFile={known}", remote_shell)
        self.assertIn("StrictHostKeyChecking=yes", remote_shell)


if __name__ == "__main__":
    unittest.main()
