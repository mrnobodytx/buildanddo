# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/check_discordbot.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     tests/upgrade/test_discordbot_public.py, tests/upgrade/test_discordbot_commands.py, tests/upgrade/test_discordbot_adapter.py
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_discordbot_public.py; CONSUMES tests/upgrade/test_discordbot_commands.py; CONSUMES tests/upgrade/test_discordbot_adapter.py
# DAG Node:    none
# Intent:      Produce reproducible bot coverage evidence and a separate native-SDK gate without installing packages or hiding skipped acceptance.
# ───────────────────────────────────────────────────────────────

"""Measure offline bot statement coverage and optionally require the real Discord SDK."""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import sys
import threading
import trace
import unittest

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Run real bot source tests and report the precise transport/coverage boundary."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-sdk", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, str(ROOT))
    native = importlib.util.find_spec("discord") is not None
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.discover(
            str(ROOT / "tests/upgrade"), pattern="test_discordbot_*.py",
        )
        return unittest.TextTestRunner(verbosity=1).run(suite)

    threading.settrace(tracer.globaltrace)
    try:
        result = tracer.runfunc(run)
    finally:
        threading.settrace(None)
    counts = tracer.results().counts
    measured = {}
    for path in sorted((ROOT / "scripts/discordbot").glob("*.py")):
        # Use the same executable-line inventory as Python's own trace report.
        executable = {line for line in trace._find_executable_linenos(str(path)) if line > 0}
        hit = {line for (filename, line), count in counts.items() if Path(filename) == path and count}
        covered = len(executable & hit)
        measured[str(path.relative_to(ROOT))] = {
            "covered": covered, "statements": len(executable),
            "percent": round(100 * covered / len(executable), 2) if executable else 100.0,
        }
    gate = result.wasSuccessful() and all(entry["percent"] >= 80 for entry in measured.values())
    if args.require_sdk and not native:
        gate = False
    summary = {
        "state": "PASS" if gate else "FAIL",
        "backend": "native_sdk_without_login" if native else "explicit_transport_double",
        "native_sdk": "available" if native else "unavailable",
        "tests_passed": result.testsRun - len(result.failures) - len(result.errors) - len(result.skipped),
        "tests_skipped": len(result.skipped),
        "coverage_kind": "Python trace statement lines; no branch or live-transport claim",
        "coverage": measured,
    }
    print(json.dumps(summary, indent=2))
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
