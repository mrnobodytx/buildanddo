# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/check_work_exchange.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/evolution/work.py, libs/evolution/work_exchange.py, libs/evolution/work_cli.py, tests/upgrade/test_work_contracts.py, tests/upgrade/test_work_exchange.py, tests/upgrade/test_work_cli.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/work.py; VALIDATES libs/evolution/work_exchange.py; VALIDATES libs/evolution/work_cli.py; CONSUMES tests/upgrade/test_work_contracts.py; CONSUMES tests/upgrade/test_work_exchange.py; CONSUMES tests/upgrade/test_work_cli.py
# Intent:      Require connected work exchange behavior and measured per-module source coverage in the existing Python validation lane.
# ───────────────────────────────────────────────────────────────

"""Require passing work exchange tests and at least 80 percent statement coverage."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import trace
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULES = (
    "libs/evolution/work.py",
    "libs/evolution/work_exchange.py",
    "libs/evolution/work_cli.py",
    "scripts/ci/candidate_manifest.py",
)


def main() -> int:
    """Measure source behavior separately from hosted, native and deployed acceptance."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=ROOT / "reports/coverage/work-exchange.json"
    )
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.loadTestsFromNames(
            [
                "tests.upgrade.test_work_contracts",
                "tests.upgrade.test_work_exchange",
                "tests.upgrade.test_work_cli",
            ]
        )
        return unittest.TextTestRunner(verbosity=1).run(suite)

    result = tracer.runfunc(run)
    counts = tracer.results().counts
    coverage = {}
    for name in MODULES:
        path = ROOT / name
        executable = {
            line for line in trace._find_executable_linenos(str(path)) if line > 0
        }
        hit = {
            line
            for (filename, line), count in counts.items()
            if Path(filename) == path and count
        }
        covered = executable & hit
        coverage[name] = {
            "covered": len(covered),
            "statements": len(executable),
            "percent": round(100 * len(covered) / len(executable), 2),
            "missing": sorted(executable - hit),
        }
    passed = (
        result.wasSuccessful()
        and result.testsRun > 0
        and not result.skipped
        and all(entry["percent"] >= 80 for entry in coverage.values())
    )
    report = {
        "state": "PASS" if passed else "FAIL",
        "tests": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "coverage_kind": "Python trace statement lines; no branch coverage claim",
        "coverage": coverage,
        "fixtures": "Synthetic work, provider identities, source results and separately pinned reviews",
        "live_cscc_or_gitlab_runs": 0,
        "deployments": 0,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
