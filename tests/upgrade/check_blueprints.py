# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/check_blueprints.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/blueprints.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/research/blueprints.py
# DAG Node:    none
# Intent:      Require blueprint behavior and measured statement coverage while reporting unavailable native dependencies.
# ───────────────────────────────────────────────────────────────

"""Run blueprint and research regressions with the existing standard-library coverage pattern."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys
import threading
import trace
import unittest

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Require passing behavior and at least 80 percent statement lines per changed Python module."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-native', action='store_true')
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.TestSuite()
        for pattern in ('test_blueprints.py', 'test_blueprints_native.py', 'test_research_runtime.py'):
            suite.addTests(unittest.defaultTestLoader.discover(str(ROOT / 'tests/upgrade'), pattern=pattern))
        return unittest.TextTestRunner(verbosity=1).run(suite)

    threading.settrace(tracer.globaltrace)
    try:
        result = tracer.runfunc(run)
    finally:
        threading.settrace(None)
    counts = tracer.results().counts
    paths = ['apps/research/blueprints.py', 'apps/research/processing.py', 'apps/research/contracts.py',
             'apps/research/worker.py', 'apps/decision/workloads/blueprint_evaluation.py']
    measured = {}
    for name in paths:
        path = ROOT / name
        executable = {line for line in trace._find_executable_linenos(str(path)) if line > 0}
        hit = {line for (filename, line), count in counts.items() if Path(filename).resolve() == path and count}
        covered = len(executable & hit)
        measured[name] = {'covered': covered, 'statements': len(executable), 'percent': round(100 * covered / len(executable), 2)}
    native = importlib.util.find_spec('pypdf') is not None
    pocketbase = bool(os.environ.get('BUILDANDDO_TEST_POCKETBASE') and Path(os.environ['BUILDANDDO_TEST_POCKETBASE']).is_file())
    gate = result.wasSuccessful() and all(row['percent'] >= 80 for row in measured.values()) and ((native and pocketbase) or not args.require_native)
    report = {'state': 'PASS' if gate else 'FAIL', 'passed': result.testsRun - len(result.failures) - len(result.errors) - len(result.skipped),
              'skipped': len(result.skipped), 'coverage_kind': 'Python trace statement lines; no branch-coverage claim',
              'native_pdf': native, 'native_pocketbase': pocketbase, 'coverage': measured}
    target = ROOT / 'reports/coverage/blueprints.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    return 0 if gate else 1


if __name__ == '__main__':
    raise SystemExit(main())
