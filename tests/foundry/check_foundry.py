# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/foundry/check_foundry.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     tests/foundry/test_foundry.py, tests/foundry/test_validation.py, tests/foundry/test_workloads.py, tests/foundry/test_execution.py, tests/foundry/test_campaign.py, foundry/shared/federal_foundry
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/foundry/test_foundry.py; DEPENDS_ON tests/foundry/test_validation.py; DEPENDS_ON tests/foundry/test_workloads.py; DEPENDS_ON tests/foundry/test_execution.py; DEPENDS_ON tests/foundry/test_campaign.py; VALIDATES foundry/shared/federal_foundry
# DAG Node:    foundry.coverage
# Intent:      Require passing behavior and at least 80 percent trace statement coverage in every executable shared foundry module.
# ───────────────────────────────────────────────────────────────

"""Run foundry behavior and per-module statement coverage without pytest."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import threading
import trace
import unittest


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "foundry" / "shared" / "federal_foundry"


def main() -> int:
    """Require successful behavior tests and 80 percent per-module statement lines."""

    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.discover(
            str(ROOT / "tests" / "foundry"), pattern="test_*.py"
        )
        return unittest.TextTestRunner(verbosity=1).run(suite)

    threading.settrace(tracer.globaltrace)
    try:
        result = tracer.runfunc(run)
    finally:
        threading.settrace(None)
    counts = tracer.results().counts
    measured: dict[str, dict[str, int | float]] = {}
    for path in sorted(
        path for path in SOURCE.glob("*.py") if path.name != "__init__.py"
    ):
        executable = {
            line for line in trace._find_executable_linenos(str(path)) if line > 0
        }
        hit = {
            line
            for (filename, line), count in counts.items()
            if Path(filename) == path and count
        }
        covered = len(executable & hit)
        measured[str(path.relative_to(ROOT))] = {
            "covered": covered,
            "statements": len(executable),
            "percent": round(100 * covered / len(executable), 2)
            if executable
            else 100.0,
        }
    passing = result.wasSuccessful() and all(
        item["percent"] >= 80 for item in measured.values()
    )
    print(
        json.dumps(
            {
                "state": "PASS" if passing else "FAIL",
                "tests_run": result.testsRun,
                "tests_failed": len(result.failures),
                "tests_errored": len(result.errors),
                "coverage_kind": "Python trace statement lines; no branch, live-provider or hardware claim",
                "coverage": measured,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passing else 1


if __name__ == "__main__":
    raise SystemExit(main())
