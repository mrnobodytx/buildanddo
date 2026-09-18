# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/estate/check_estate.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     tests/estate, apps/estate
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/estate; DEPENDS_ON apps/estate
# DAG Node:    none
# Intent:      Gate each estate compiler phase and measure offline behavior coverage without adding test dependencies.
# ───────────────────────────────────────────────────────────────

"""Run estate behavior gates using the repository's stdlib coverage pattern."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import trace
import unittest

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Print PASS or FAIL after the requested behavior and coverage gate."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=["census", "modules", "dependencies", "reconcile", "validate", "seal", "report", "cli"])
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT))
    sys.dont_write_bytecode = True
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        pattern = f"test_{args.phase}.py" if args.phase else "test_*.py"
        suite = unittest.defaultTestLoader.discover(str(ROOT / "tests/estate"), pattern=pattern, top_level_dir=str(ROOT))
        return unittest.TextTestRunner(verbosity=1).run(suite)

    result = tracer.runfunc(run)
    measured: dict[str, dict[str, int | float]] = {}
    if not args.phase:
        counts = tracer.results().counts
        paths = sorted((ROOT / "apps/estate").glob("*.py"))
        paths.append(ROOT / "scripts/estate_census.py")
        for path in paths:
            if path.name == "__init__.py":
                continue
            executable = {line for line in trace._find_executable_linenos(str(path)) if line > 0}
            hit = {line for (filename, line), count in counts.items() if Path(filename).resolve() == path and count}
            covered = len(executable & hit)
            measured[path.relative_to(ROOT).as_posix()] = {
                "covered": covered, "statements": len(executable),
                "percent": round(100 * covered / len(executable), 2) if executable else 100.0,
            }
    passed = result.wasSuccessful() and result.testsRun > 0 and all(row["percent"] >= 80 for row in measured.values())
    payload = {"state": "PASS" if passed else "FAIL", "tests_run": result.testsRun,
               "failures": len(result.failures), "errors": len(result.errors),
               "coverage_kind": "stdlib trace statement lines; no branch-coverage claim",
               "coverage": measured}
    if not args.phase:
        output = ROOT / "reports/coverage/estate.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2, sort_keys=True))
    print(f"{payload['state']}: estate {args.phase or 'all phases'}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
