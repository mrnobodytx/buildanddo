# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_supply_chain.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     scripts/ci/supply_chain.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON scripts/ci/supply_chain.py
# DAG Node:    none
# Intent:      Prove audit unknown states, lockfile failures, regression detection and shared release tags.
# ───────────────────────────────────────────────────────────────

"""Exercise dependency evidence without contacting the npm registry."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / "ci" / f"{name}.py")
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


supply = module("supply_chain")
delta = module("telemetry_delta")
snapshot = module("telemetry_snapshot")
publisher = module("datadog_publish")


class SupplyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="buildanddo-supply-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "apps/web").mkdir(parents=True)
        self.root_manifest = {"name": "test", "workspaces": ["apps/*"]}
        self.web_manifest = {"name": "web", "dependencies": {"package-a": "^1.0.0"}}
        self.packages = {"": self.root_manifest, "apps/web": self.web_manifest,
                         "node_modules/package-a": {"version": "1.2.0", "license": "MIT"}}
        self.write("package.json", self.root_manifest)
        self.write("apps/web/package.json", self.web_manifest)
        self.write("package-lock.json", {"lockfileVersion": 3, "packages": self.packages})

    def write(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value))
        return target

    def audit(self, **counts):
        values = dict.fromkeys(supply.SEVERITIES, 0)
        values.update(counts)
        return {"metadata": {"vulnerabilities": values}}

    def test_agreeing_workspace_manifests_pass(self):
        self.assertEqual(supply.validate_lock(self.root, self.packages), [])
        self.assertEqual(supply.collect(self.root, skip_audit=True)["metrics"]["deps.lock_consistent"], 1)

    def test_changed_direct_dependency_fails_lock_gate(self):
        self.write("apps/web/package.json", {"name": "web", "dependencies": {"package-a": "^2.0.0"}})
        self.assertIn("apps/web: dependencies differs from package-lock.json", supply.validate_lock(self.root, self.packages))

    def test_new_workspace_missing_from_lock_fails(self):
        self.write("apps/backend/package.json", {"name": "backend"})
        self.assertTrue(any("apps/backend: manifest entry is missing" in failure for failure in supply.validate_lock(self.root, self.packages)))

    def test_optional_and_peer_dependency_changes_fail(self):
        for group in ["optionalDependencies", "peerDependencies", "devDependencies"]:
            with self.subTest(group=group):
                self.write("apps/web/package.json", {**self.web_manifest, group: {"package-b": "^1.0.0"}})
                self.assertTrue(any(group in failure for failure in supply.validate_lock(self.root, self.packages)))

    def test_missing_resolution_fails(self):
        del self.packages["node_modules/package-a"]
        self.assertIn("apps/web: package-a has no locked resolution", supply.validate_lock(self.root, self.packages))

    def test_nested_workspace_resolution_and_license_are_found(self):
        self.packages["apps/web/node_modules/package-a"] = self.packages.pop("node_modules/package-a")
        self.assertEqual(supply.validate_lock(self.root, self.packages), [])
        item = supply.license_inventory(self.root, self.packages)[0]
        self.assertEqual(item["license"], "MIT")
        self.assertEqual(item["version"], "1.2.0")
        self.assertEqual(item["workspace"], "apps/web")

    def test_unknown_license_is_not_invented(self):
        del self.packages["node_modules/package-a"]["license"]
        self.assertEqual(supply.license_inventory(self.root, self.packages)[0]["license"], "unknown")
        self.write("node_modules/package-a/package.json", {"license": "Apache-2.0"})
        self.assertEqual(supply.license_inventory(self.root, self.packages)[0]["license"], "Apache-2.0")

    def test_complete_zero_counts_are_a_real_audit(self):
        report = supply.collect(self.root, self.write("audit.json", self.audit()))
        self.assertEqual(report["audit_status"], "available")
        self.assertEqual(report["metrics"]["deps.vulnerabilities.critical"], 0)
        self.assertEqual(report["metrics"]["deps.audit_available"], 1)

    def test_missing_malformed_and_error_reports_stay_unknown(self):
        reports = [None, [], {"error": {"code": "unavailable"}}, {"metadata": {"vulnerabilities": {"critical": 0}}}, self.audit(high=-1), self.audit(high=True)]
        for report in reports:
            with self.subTest(report=report):
                self.assertEqual(supply.vulnerability_metrics(report), {})
        for path in [self.root / "missing.json", self.write("bad.json", {})]:
            report = supply.collect(self.root, path)
            self.assertEqual(report["audit_status"], "unavailable")
            self.assertNotIn("deps.vulnerabilities.critical", report["metrics"])

    def test_audit_exit_one_with_advisories_is_report_only(self):
        result = SimpleNamespace(returncode=1, stdout=json.dumps(self.audit(high=2)))
        with patch.object(supply.subprocess, "run", return_value=result):
            report = supply.collect(self.root)
        self.assertEqual(report["metrics"]["deps.vulnerabilities.high"], 2)
        self.assertEqual(report["audit_status"], "available")

    def test_unavailable_registry_never_claims_zero_vulnerabilities(self):
        outcomes = [OSError("offline"), subprocess.TimeoutExpired("npm", 60)]
        for failure in outcomes:
            with patch.object(supply.subprocess, "run", side_effect=failure):
                report = supply.collect(self.root)
                self.assertEqual(report["audit_status"], "unavailable")
                self.assertNotIn("deps.vulnerabilities.high", report["metrics"])
        with patch.object(supply.subprocess, "run", return_value=SimpleNamespace(returncode=2, stdout="")):
            self.assertEqual(supply.collect(self.root)["audit_status"], "unavailable")

    def test_missing_or_malformed_lockfile_is_a_failure(self):
        (self.root / "package-lock.json").unlink()
        self.assertEqual(supply.collect(self.root, skip_audit=True)["metrics"]["deps.lock_consistent"], 0)
        (self.root / "package-lock.json").write_text("broken")
        self.assertEqual(supply.collect(self.root, skip_audit=True)["metrics"]["deps.lock_consistent"], 0)

    def test_cli_fails_only_the_lock_gate_and_writes_evidence(self):
        args = [sys.executable, str(ROOT / "scripts/ci/supply_chain.py"), "--root", str(self.root), "--skip-audit", "--check-lock"]
        good = subprocess.run(args, capture_output=True, text=True, check=False)
        self.assertEqual(good.returncode, 0, good.stdout + good.stderr)
        self.write("apps/web/package.json", {"name": "web", "dependencies": {"package-a": "^9.0.0"}})
        bad = subprocess.run(args, capture_output=True, text=True, check=False)
        self.assertEqual(bad.returncode, 1)
        self.assertTrue((self.root / "reports/supply-chain.json").is_file())

    def test_new_high_and_critical_findings_are_regressions(self):
        baseline = {"metrics": {"deps.vulnerabilities.high": 0, "deps.vulnerabilities.critical": 0}}
        current = {"metrics": {"deps.vulnerabilities.high": 1, "deps.vulnerabilities.critical": 1}}
        report = delta.compare(current, baseline)
        self.assertEqual(len(report["regressions"]), 2)
        self.assertEqual(delta.compare(current, None)["regressions"], [])
        self.assertEqual(delta.compare({"metrics": {}}, baseline)["regressions"], [])

    def test_snapshot_imports_only_valid_supply_metrics(self):
        path = self.write("supply.json", {"metrics": {"deps.audit_available": 0, "deps.vulnerabilities.high": 2, "arbitrary": 1, "deps.vulnerabilities.low": "unknown"}})
        self.assertEqual(snapshot.supply_metrics(path), {"deps.audit_available": 0, "deps.vulnerabilities.high": 2})
        self.assertEqual(snapshot.supply_metrics(self.root / "missing"), {})

    def test_release_tags_are_on_main_metrics_and_not_per_pr_metrics(self):
        args = SimpleNamespace(pipeline="main", branch="main", service="buildanddo-web", env="ci", tag=[], release_version="")
        self.assertIn("version:38+abc1234", publisher.base_tags(args, {"version": "38+abc1234"}))
        args.pipeline = "pr"
        self.assertNotIn("version:38+abc1234", publisher.base_tags(args, {"version": "38+abc1234"}))
        args.pipeline = "main"
        args.release_version = "39+1234abc"
        self.assertIn("version:39+1234abc", publisher.base_tags(args, {}))

    def test_ci_release_resolver_uses_the_checked_out_source(self):
        result = snapshot.release_context(ROOT)
        expected = json.loads(subprocess.check_output(["node", str(ROOT / "scripts/ci/release.mjs"), "--json"], text=True))
        self.assertEqual(result["version"], expected["version"])
        self.assertEqual(result["commit_sha"], expected["commit_sha"])
        with patch.object(snapshot.subprocess, "run", side_effect=OSError("node absent")):
            self.assertEqual(snapshot.release_context(ROOT), {})


if __name__ == "__main__":
    unittest.main()
