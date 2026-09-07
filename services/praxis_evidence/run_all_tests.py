#!/usr/bin/env python3
"""
run_all_tests.py - the Praxis Evidence Fabric's test layer entry point.

Runs every selftest_*.py (+ selftest.py) as a real subprocess against the
live PocketBase - not mocks, not simulated results. Each module is
independently runnable (`python selftest_pricing.py`) for local debugging;
this just aggregates them into one pass/fail gate for CI.

Exit code: 0 only if every suite passed. Wired into the GitLab CI pipeline
(.gitlab-ci.yml) so a push that breaks the evidence fabric fails the pipeline,
not just a manually-run script nobody remembers to run.
"""
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SUITES = sorted(p.name for p in ROOT.glob("selftest*.py"))


def main() -> int:
    if not SUITES:
        print("NO_SUITES_FOUND - this is a real failure, not a vacuous pass")
        return 1

    results = []
    for suite in SUITES:
        print(f"\n=== {suite} ===")
        proc = subprocess.run([sys.executable, str(ROOT / suite)], cwd=str(ROOT),
                                capture_output=True, text=True, timeout=120)
        print(proc.stdout)
        if proc.stderr:
            print(proc.stderr, file=sys.stderr)
        results.append((suite, proc.returncode == 0))

    print("\n=== SUMMARY ===")
    passed = sum(1 for _, ok in results if ok)
    for suite, ok in results:
        print(f"{'PASS' if ok else 'FAIL'}  {suite}")
    print(f"\n{passed}/{len(results)} suites passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
