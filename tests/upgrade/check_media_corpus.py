# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/check_media_corpus.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     tests/upgrade/test_media_corpus.py, scripts/publish/media_contracts.py, scripts/publish/media_corpus.py, scripts/publish/media_library.py
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/test_media_corpus.py; VALIDATES scripts/publish/media_contracts.py; VALIDATES scripts/publish/media_corpus.py; VALIDATES scripts/publish/media_library.py
# Intent:      Require connected media source behavior and measured coverage without substituting synthetic fixtures for provider execution.
# ───────────────────────────────────────────────────────────────

"""Run the media corpus suite with the repository's standard-library coverage gate."""

from __future__ import annotations

import json
import sys
import trace
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    """Require tests without skips and at least 80 percent statement coverage per module."""
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.loadTestsFromName(
            "tests.upgrade.test_media_corpus"
        )
        return unittest.TextTestRunner(verbosity=1).run(suite)

    result = tracer.runfunc(run)
    counts = tracer.results().counts
    measured = {}
    for name in ("media_contracts.py", "media_corpus.py", "media_library.py"):
        path = ROOT / "scripts/publish" / name
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
            "percent": round(100 * covered / len(executable), 2),
            "missing": sorted(executable - hit),
        }
    passed = (
        result.wasSuccessful()
        and result.testsRun > 0
        and not result.skipped
        and all(row["percent"] >= 80 for row in measured.values())
    )
    report = {
        "state": "PASS" if passed else "FAIL",
        "tests": result.testsRun,
        "errors": len(result.errors),
        "failures": len(result.failures),
        "skipped": len(result.skipped),
        "coverage_kind": "Python trace statement lines; no branch-coverage claim",
        "coverage": measured,
        "fixtures": "Synthetic source, review pins and provider observations",
        "provider_calls": 0,
        "publications": 0,
    }
    destination = ROOT / "reports/coverage/media-corpus.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
