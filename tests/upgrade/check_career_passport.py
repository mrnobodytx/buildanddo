# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/check_career_passport.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport, tests/upgrade/test_career_passport.py, tests/upgrade/test_career_jobs.py, tests/upgrade/test_career_application.py, tests/upgrade/test_career_sources.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/career_passport; CONSUMES tests/upgrade/test_career_passport.py; CONSUMES tests/upgrade/test_career_jobs.py; CONSUMES tests/upgrade/test_career_application.py; CONSUMES tests/upgrade/test_career_sources.py
# Intent:      Measure career attribution, matching and application boundaries with portable statement coverage and explicit synthetic fixtures.
# ───────────────────────────────────────────────────────────────

"""Run the career behavior suite and require 80 percent per-module coverage."""

from __future__ import annotations

import argparse
import json
import sys
import trace
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Measure implementation statement lines without requiring a pytest plugin."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.discover(
            str(ROOT / "tests/upgrade"), pattern="test_career_*.py"
        )
        return unittest.TextTestRunner(verbosity=1).run(suite)

    result = tracer.runfunc(run)
    counts = tracer.results().counts
    measured = {}
    for path in sorted((ROOT / "libs/career_passport").glob("*.py")):
        if path.name in ("__init__.py", "__main__.py"):
            continue
        executable = {
            line for line in trace._find_executable_linenos(str(path)) if line > 0
        }
        hit = {
            line
            for (filename, line), count in counts.items()
            if Path(filename) == path and count
        }
        covered = executable & hit
        measured[str(path.relative_to(ROOT))] = {
            "covered": len(covered),
            "statements": len(executable),
            "percent": round(100 * len(covered) / len(executable), 2),
            "uncovered_lines": sorted(executable - hit),
        }
    gate = (
        result.wasSuccessful()
        and not result.skipped
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
        "excluded_scaffolds": ["__init__.py", "__main__.py"],
        "fixtures": "Synthetic work, review pins, ATS feeds and application events",
        "live_jobs_collected": 0,
        "real_applications_submitted": 0,
        "coverage": measured,
    }
    encoded = json.dumps(report, indent=2) + "\n"
    if args.output:
        with args.output.open("x") as stream:
            stream.write(encoded)
    print(encoded, end="")
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
