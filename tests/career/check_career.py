# ─── CGRF Header ──────────────────────────────
# File:        tests/career/check_career.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     tests/career/test_career.py, tests/career/test_slice2.py, tests/career/test_redteam.py, tests/career/test_assessments.py, tests/career/test_profile.py, apps/career
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/career/test_career.py; DEPENDS_ON tests/career/test_slice2.py; DEPENDS_ON tests/career/test_redteam.py; DEPENDS_ON tests/career/test_assessments.py; DEPENDS_ON tests/career/test_profile.py; VALIDATES apps/career
# DAG Node:    none
# Intent:      Require the career behavior suite and at least 80 percent measured statement coverage per module.
# ───────────────────────────────────────────────────────────

"""Run career behavior tests and measure dependency-free statement coverage."""

from __future__ import annotations

import json
import sys
import trace
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Fail when behavior tests fail or a career module measures below 80 percent."""
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.loadTestsFromNames(["tests.career.test_career", "tests.career.test_slice2", "tests.career.test_redteam",
             "tests.career.test_assessments", "tests.career.test_profile"])
        return unittest.TextTestRunner(verbosity=1).run(suite)

    result = tracer.runfunc(run)
    counts = tracer.results().counts
    paths = sorted(
        path for path in (ROOT / "apps/career").glob("*.py")
        if path.name not in ("__init__.py", "__main__.py")
    )
    measured = {}
    for path in paths:
        executable = {line for line in trace._find_executable_linenos(str(path)) if line > 0}
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
    gate = result.wasSuccessful() and bool(measured) and all(
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
    destination = ROOT / "reports/coverage/career.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
