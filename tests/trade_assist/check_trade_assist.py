# ─── CGRF Header ──────────────────────────────
# File:        tests/trade_assist/check_trade_assist.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     tests/trade_assist/test_trade_assist.py, apps/trade_assist
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/trade_assist/test_trade_assist.py; VALIDATES apps/trade_assist
# DAG Node:    none
# Intent:      Require the trade assist suite and at least 80 percent statement coverage per module.
# ───────────────────────────────────────────────────────────

"""Run trade assist behavior tests and measure dependency-free statement coverage."""

from __future__ import annotations

import json
import sys
import trace
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Fail when behavior tests fail, skip, or measure below 80 percent per module."""
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.discover(str(ROOT / "tests/trade_assist"), pattern="test_*.py", top_level_dir=str(ROOT))
        return unittest.TextTestRunner(verbosity=1).run(suite)

    result = tracer.runfunc(run)
    counts = tracer.results().counts
    paths = sorted(
        path for path in (ROOT / "apps/trade_assist").glob("*.py")
        if path.name not in ("__init__.py", "__main__.py")
    )
    measured = {}
    for path in paths:
        # Python 3.13 can report None for some line numbers; those are not executable statements.
        executable = {line for line in trace._find_executable_linenos(str(path)) if line and line > 0}
        hit = {
            line
            for (filename, line), count in counts.items()
            if Path(filename).resolve() == path.resolve() and count
        }
        covered = len(executable & hit)
        measured[str(path.relative_to(ROOT))] = {
            "covered": covered,
            "statements": len(executable),
            "percent": round(100 * covered / len(executable), 2) if executable else 100.0,
        }
    gate = result.wasSuccessful() and result.testsRun > 0 and not result.skipped and bool(measured) and all(
        row["percent"] >= 80 for row in measured.values()
    )
    report = {
        "state": "PASS" if gate else "FAIL",
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "coverage_kind": "Python trace statement lines; no branch-coverage claim",
        "network_calls": 0,
        "submissions": 0,
        "coverage": measured,
    }
    destination = ROOT / "reports/coverage/trade-assist.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
