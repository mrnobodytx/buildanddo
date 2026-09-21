# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/check_policy_intelligence.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     tests/upgrade/test_policy_intelligence.py
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_policy_intelligence.py
# DAG Node:    none
# Intent:      Measure local policy behavior and per-module statement coverage without conflating fixtures with live Sentinel acceptance.
# ───────────────────────────────────────────────────────────────

"""Run the policy suite using the repository's standard-library coverage pattern."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import threading
import trace
import unittest

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Require passing tests and at least 80 percent statement coverage per module."""
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.discover(
            str(ROOT / "tests/upgrade"), pattern="test_policy_intelligence.py"
        )
        return unittest.TextTestRunner(verbosity=1).run(suite)

    threading.settrace(tracer.globaltrace)
    try:
        result = tracer.runfunc(run)
    finally:
        threading.settrace(None)
    counts = tracer.results().counts
    coverage = {}
    for path in sorted((ROOT / "apps/research/policy").glob("*.py")):
        executable = {
            line for line in trace._find_executable_linenos(str(path)) if isinstance(line, int) and line > 0
        }
        hit = {
            line
            for (filename, line), count in counts.items()
            if count and Path(filename).resolve() == path
        }
        coverage[str(path.relative_to(ROOT))] = {
            "covered": len(hit & executable),
            "statements": len(executable),
            "percent": round(100 * len(hit & executable) / len(executable), 2),
        }
    passed = result.wasSuccessful() and all(
        row["percent"] >= 80 for row in coverage.values()
    )
    report = {
        "state": "PASS" if passed else "FAIL",
        "tests": result.testsRun,
        "skipped": len(result.skipped),
        "coverage_kind": "Python trace statement lines; no branch-coverage claim",
        "coverage": coverage,
        "live_sources": "not_run",
        "private_sentinel": "not_attached",
    }
    destination = ROOT / "reports/coverage/policy-intelligence.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
