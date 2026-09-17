# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/check_blueprint_pipeline.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     tests/upgrade/test_blueprint_pipeline.py
# EnumType:    Test
# EnumEdges:   VALIDATES tests/upgrade/test_blueprint_pipeline.py
# DAG Node:    none
# Intent:      Require measured blueprint pipeline coverage and distinguish missing native PDF acceptance from source test passes.
# ───────────────────────────────────────────────────────────────

"""Measure the blueprint pipeline and require native PDF acceptance when requested."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import sys
import trace
import unittest

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Run pipeline behavior tests and report per-module statement coverage."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-pdf", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT))
    native = importlib.util.find_spec("pypdf") is not None
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.TestSuite()
        for name in ("test_blueprint_extraction", "test_blueprint_pipeline", "test_blueprint_service"):
            suite.addTests(unittest.defaultTestLoader.loadTestsFromName("tests.upgrade." + name))
        return unittest.TextTestRunner(verbosity=1).run(suite)

    result = tracer.runfunc(run)
    counts = tracer.results().counts
    paths = sorted((ROOT / "apps/research").glob("blueprint*.py"))
    paths += sorted(path for path in (ROOT / "apps/decision/adapters").glob("*.py") if path.name != "__init__.py")
    paths += [ROOT / "apps/decision/workloads/blueprint_evaluation.py"]
    coverage = {}
    for path in paths:
        statements = {line for line in trace._find_executable_linenos(str(path)) if line > 0}
        hit = {line for (filename, line), count in counts.items() if Path(filename).resolve() == path and count}
        covered = len(statements & hit)
        coverage[str(path.relative_to(ROOT))] = {
            "covered": covered, "statements": len(statements),
            "percent": round(100 * covered / len(statements), 2) if statements else 100,
            "missing": sorted(statements - hit),
        }
    passed = result.wasSuccessful() and all(row["percent"] >= 80 for row in coverage.values()) and (native or not args.require_pdf)
    report = {"state": "PASS" if passed else "FAIL", "tests_run": result.testsRun,
              "passed": result.testsRun - len(result.failures) - len(result.errors) - len(result.skipped),
              "failures": len(result.failures), "errors": len(result.errors), "skipped": len(result.skipped),
              "native_pdf": native, "native_pdf_required": args.require_pdf,
              "coverage_kind": "stdlib trace statement lines; no branch coverage claim",
              "coverage": coverage}
    output = ROOT / "reports/coverage" / ("blueprint-pipeline-native.json" if args.require_pdf else "blueprint-pipeline.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
