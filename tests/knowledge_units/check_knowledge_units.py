# ─── CGRF Header ──────────────────────────────
# File:        tests/knowledge_units/check_knowledge_units.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-KNOWLEDGE-UNIT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     tests/knowledge_units/test_units.py, apps/knowledge_units
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/knowledge_units/test_units.py; VALIDATES apps/knowledge_units
# DAG Node:    none
# Intent:      Require the Knowledge Unit suite and at least 80 percent statement coverage per module.
# ───────────────────────────────────────────────────────────

"""Run knowledge unit behavior tests and measure dependency-free statement coverage."""

from __future__ import annotations

import json
import sys
import trace
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Fail when behavior tests fail or a knowledge unit module measures below 80 percent."""
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.loadTestsFromNames(["tests.knowledge_units.test_units"])
        return unittest.TextTestRunner(verbosity=1).run(suite)

    result = tracer.runfunc(run)
    counts = tracer.results().counts
    paths = sorted(
        path for path in (ROOT / "apps/knowledge_units").glob("*.py")
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
    destination = ROOT / "reports/coverage/knowledge-units.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
