# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/check_federal_foundry.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     tests/upgrade/test_federal_foundry.py, apps/federal_foundry/catalog.py, apps/federal_foundry/evidence.py, apps/federal_foundry/compiler.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON tests/upgrade/test_federal_foundry.py; DEPENDS_ON apps/federal_foundry/catalog.py; DEPENDS_ON apps/federal_foundry/evidence.py; DEPENDS_ON apps/federal_foundry/compiler.py
# DAG Node:    none
# Intent:      Require measured portable portfolio behavior and coverage independently of unavailable browser or hosted-model dependencies.
# ───────────────────────────────────────────────────────────────

"""Require portable portfolio behavior and per-module statement coverage."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import threading
import trace
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


class ReportResult(unittest.TextTestResult):
    """Retain observed unittest outcomes for the repository's JUnit collector."""

    def startTest(self, test: unittest.TestCase) -> None:
        super().startTest(test)
        if not hasattr(self, "cases"):
            self.cases: list[unittest.TestCase] = []
        self.cases.append(test)


def main() -> int:
    """Fail on a skipped/failed behavior test or less than 80 percent module coverage."""
    sys.path.insert(0, str(ROOT))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.discover(
            str(ROOT / "tests/upgrade"), pattern="test_federal_foundry.py"
        )
        return unittest.TextTestRunner(verbosity=1, resultclass=ReportResult).run(suite)

    threading.settrace(tracer.globaltrace)
    try:
        result = tracer.runfunc(run)
    finally:
        threading.settrace(None)
    counts = tracer.results().counts
    measured = {}
    for path in sorted((ROOT / "apps/federal_foundry").glob("*.py")):
        executable = {
            line for line in trace._find_executable_linenos(str(path)) if line > 0
        }
        hit = {
            line
            for (filename, line), count in counts.items()
            if Path(filename) == path and count
        }
        covered = len(executable & hit)
        measured[str(path.relative_to(ROOT))] = {
            "covered": covered,
            "statements": len(executable),
            "percent": round(100 * covered / len(executable), 2)
            if executable
            else 100.0,
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
        "fixtures": "Explicit synthetic measurement/review receipts and in-process model adapters",
        "live_model_calls": 0,
        "research_campaigns_run": 0,
        "coverage": measured,
    }
    destination = ROOT / "reports/coverage/federal-foundry.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    suite_xml = ET.Element(
        "testsuite",
        {
            "name": "federal_foundry",
            "tests": str(result.testsRun),
            "failures": str(len(result.failures)),
            "errors": str(len(result.errors)),
            "skipped": str(len(result.skipped)),
        },
    )
    failures = {test.id(): detail for test, detail in result.failures + result.errors}
    skipped = {test.id(): reason for test, reason in result.skipped}
    cases = getattr(result, "cases", [])
    for case in cases:
        element = ET.SubElement(
            suite_xml, "testcase", {"classname": type(case).__name__, "name": case.id()}
        )
        # Subtest failures belong to their parent case even if its own addFailure wasn't called.
        details = [
            detail
            for name, detail in failures.items()
            if name == case.id() or name.startswith(case.id() + " ")
        ]
        if details:
            ET.SubElement(element, "failure").text = "\n".join(details)
        if case.id() in skipped:
            ET.SubElement(element, "skipped").text = skipped[case.id()]
    junit = ROOT / "reports/junit/federal-foundry.xml"
    junit.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(suite_xml).write(junit, encoding="utf-8", xml_declaration=True)
    print(json.dumps(report, indent=2))
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
