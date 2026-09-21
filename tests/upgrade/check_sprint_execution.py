# ─── CGRF Header ───────────────────────────────────────────────
# File:         tests/upgrade/check_sprint_execution.py
# Stage:        08_TEST
# SRS:          SRS-BUILDANDDO-UPGRADE-001
# CAPS:         pending
# CK:           pending
# Dispatch:     VCC-BUILDANDDO-UPGRADE-001
# Seat:         BITS-CODEGEN
# Owner:        Citadel Nexus Inc.
# Created:      2026-09-21
# Depends:      tests/upgrade/test_business_worker.py, tests/upgrade/test_submission_readiness.py, apps/mission_suite/business_worker.py, scripts/ci/submission_readiness.py
# EnumType:     Test
# EnumEdges:    DEPENDS_ON tests/upgrade/test_business_worker.py; DEPENDS_ON tests/upgrade/test_submission_readiness.py; DEPENDS_ON apps/mission_suite/business_worker.py; DEPENDS_ON scripts/ci/submission_readiness.py
# DAG Node:     none
# Intent:       Keep worker uncertainty handling and submission admission above measured coverage requirements in the required readiness gate.
# ───────────────────────────────────────────────────────────────

"""Require executable worker/submission behavior and measured statement coverage."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import trace
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
MODULES = (
    "apps/mission_suite/business_worker.py",
    "scripts/ci/submission_readiness.py",
)


class ObservedResult(unittest.TextTestResult):
    """Retain executed cases for the standard JUnit evidence collector."""

    def startTest(self, test: unittest.TestCase) -> None:
        super().startTest(test)
        if not hasattr(self, "cases"):
            self.cases: list[unittest.TestCase] = []
        self.cases.append(test)


def main() -> int:
    """Reject skipped or failed cases and less than eighty percent module coverage."""
    sys.path.insert(0, str(ROOT))
    sys.path.insert(0, str(ROOT / "tests/upgrade"))
    tracer = trace.Trace(count=True, trace=False, ignoredirs=[sys.base_prefix])

    def run() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.loadTestsFromNames(
            [
                "tests.upgrade.test_business_worker",
                "tests.upgrade.test_submission_readiness",
            ]
        )
        return unittest.TextTestRunner(verbosity=1, resultclass=ObservedResult).run(
            suite
        )

    result = tracer.runfunc(run)
    counts = tracer.results().counts
    coverage = {}
    for relative in MODULES:
        path = ROOT / relative
        executable = {
            line for line in trace._find_executable_linenos(str(path)) if line > 0
        }
        hit = {
            line
            for (filename, line), count in counts.items()
            if Path(filename).resolve() == path and count
        }
        coverage[relative] = {
            "covered": len(executable & hit),
            "statements": len(executable),
            "percent": round(100 * len(executable & hit) / len(executable), 2),
        }
    gate = (
        result.wasSuccessful()
        and not result.skipped
        and all(row["percent"] >= 80 for row in coverage.values())
    )
    report = {
        "status": "PASS" if gate else "FAIL",
        "tests": result.testsRun,
        "failures": len(result.failures) + len(result.errors),
        "skipped": len(result.skipped),
        "coverage_kind": "Python trace statement lines; no branch-coverage claim",
        "fixture_scope": "Synthetic provider, runtime-loop and captured-evidence fixtures; zero external effects",
        "coverage": coverage,
    }
    destination = ROOT / "reports/coverage/sprint-execution.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n")
    suite_xml = ET.Element(
        "testsuite",
        {
            "name": "sprint_execution",
            "tests": str(result.testsRun),
            "failures": str(len(result.failures)),
            "errors": str(len(result.errors)),
            "skipped": str(len(result.skipped)),
        },
    )
    failures = {test.id(): detail for test, detail in result.failures + result.errors}
    skips = {test.id(): reason for test, reason in result.skipped}
    for case in getattr(result, "cases", []):
        item = ET.SubElement(
            suite_xml, "testcase", {"classname": type(case).__name__, "name": case.id()}
        )
        messages = [
            value
            for name, value in failures.items()
            if name == case.id() or name.startswith(case.id() + " ")
        ]
        if messages:
            ET.SubElement(item, "failure").text = "\n".join(messages)
        if case.id() in skips:
            ET.SubElement(item, "skipped").text = skips[case.id()]
    junit = ROOT / "reports/junit/sprint-execution.xml"
    junit.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(suite_xml).write(junit, encoding="utf-8", xml_declaration=True)
    print(json.dumps(report, indent=2))
    return 0 if gate else 1


if __name__ == "__main__":
    raise SystemExit(main())
