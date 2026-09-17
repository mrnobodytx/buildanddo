# ─── CGRF Header ──────────────────────────────
# File:        tests/upgrade/check_decision_runtime.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-DECISION-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     tests/upgrade/test_decision_runtime.py, tests/upgrade/test_blueprints.py, apps/decision
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/upgrade/test_decision_runtime.py; DEPENDS_ON tests/upgrade/test_blueprints.py; VALIDATES apps/decision
# DAG Node:    none
# Intent:      Require the decision behavior suite and at least 80 percent measured statement coverage per runtime module.
# ───────────────────────────────────────────────────────────

"""Run decision behavior tests and measure dependency-free statement coverage."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import trace
import unittest

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Fail when behavior tests fail or a decision module measures below 80 percent."""
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.discover(
            str(ROOT / "tests/upgrade"), pattern="test_decision_runtime.py"
        )
        suite.addTests(unittest.defaultTestLoader.discover(str(ROOT / "tests/upgrade"), pattern="test_blueprints.py"))
        return unittest.TextTestRunner(verbosity=1).run(suite)

    result = tracer.runfunc(run)
    counts = tracer.results().counts
    paths = sorted(
        path
        for path in (ROOT / "apps/decision").glob("*.py")
        if path.name != "__init__.py"
    )
    paths.extend(
        sorted(
            path
            for path in (ROOT / "apps/decision/workloads").glob("*.py")
            if path.name != "__init__.py"
        )
    )
    measured = {}
    for path in paths:
        executable = {
            line for line in trace._find_executable_linenos(str(path)) if line > 0
        }
        hit = {
            line
            for (filename, line), count in counts.items()
            if Path(filename).resolve() == path.resolve() and count
        }
        covered = len(executable & hit)
        measured[str(path.relative_to(ROOT))] = {
            "covered": covered,
            "statements": len(executable),
            "percent": (
                round(100 * covered / len(executable), 2) if executable else 100.0
            ),
        }
    gate = (
        result.wasSuccessful()
        and bool(measured)
        and all(row["percent"] >= 80 for row in measured.values())
    )
    report = {
        "state": "PASS" if gate else "FAIL",
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "coverage_kind": "Python trace statement lines; no branch-coverage claim",
        "external_model_calls": 0,
        "coverage": measured,
    }
    destination = ROOT / "reports/coverage/decision-runtime.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
