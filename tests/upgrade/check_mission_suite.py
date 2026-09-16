# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/check_mission_suite.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     tests/upgrade/test_mission_suite.py, apps/mission_suite/engine.py, apps/mission_suite/worker.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/upgrade/test_mission_suite.py; VALIDATES apps/mission_suite/engine.py; VALIDATES apps/mission_suite/worker.py
# DAG Node:    none
# Intent:      Require behavior tests and measured coverage for every portable suite module without depending on frontend installation.
# ───────────────────────────────────────────────────────────────

"""Run mission suite behavior and source coverage; native acceptance is separate."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import threading
import trace
import unittest

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Require successful behavior tests and 80 percent per-module statement lines."""
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.discover(
            str(ROOT / "tests/upgrade"), pattern="test_mission_suite.py"
        )
        return unittest.TextTestRunner(verbosity=1).run(suite)

    threading.settrace(tracer.globaltrace)
    try:
        result = tracer.runfunc(run)
    finally:
        threading.settrace(None)
    counts = tracer.results().counts
    measured = {}
    for path in sorted((ROOT / "apps/mission_suite").glob("*.py")):
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
    gate = (
        result.wasSuccessful()
        and not result.skipped
        and all(row["percent"] >= 80 for row in measured.values())
    )
    print(
        json.dumps(
            {
                "state": "PASS" if gate else "FAIL",
                "tests_passed": result.testsRun
                - len(result.failures)
                - len(result.errors)
                - len(result.skipped),
                "tests_skipped": len(result.skipped),
                "coverage_kind": "Python trace statement lines; no branch or native-transport claim",
                "backend": "actual Python worker and PocketBase policy with explicit storage/transport double",
                "native_acceptance": "separate test_suite_native.py gate",
                "coverage": measured,
            },
            indent=2,
        )
    )
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
