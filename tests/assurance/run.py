# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/assurance/run.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     tests/assurance/browser.py, tests/assurance/test_runtime.py, tools/day21/day21_acceptance.py
# EnumType:    Test
# EnumEdges:   CONSUMES tests/assurance/browser.py; CONSUMES tests/assurance/test_runtime.py; EXTENDS tools/day21/day21_acceptance.py
# Intent:      Retain eight explicit assurance profiles with source binding and non-passing missing prerequisites beside the unchanged Day-21 gate.
# ───────────────────────────────────────────────────────────────

"""Run bounded local assurance; never interpret a skipped runtime as acceptance."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any

from tests.assurance.browser import vite_entry
from tests.upgrade.test_workspace_native import ROOT

PROFILES = (
    "journey",
    "security",
    "evidence",
    "failure",
    "accessibility",
    "compatibility",
    "load",
    "recovery",
)
BROWSER = {"journey", "accessibility", "compatibility"}
SOURCE_COMMANDS = {
    "security": [
        [
            "node",
            "--test",
            "--test-reporter=tap",
            "tests/upgrade/government-access.test.mjs",
            "tests/upgrade/government-client.test.mjs",
        ]
    ],
    "evidence": [
        [
            sys.executable,
            "-m",
            "unittest",
            "tests.upgrade.test_research_sprint.DecisionPackageTests",
            "tests.upgrade.test_research_sprint.PolynomialTests",
            "tests.upgrade.test_research_sprint.SprintExportTests",
            "tests.upgrade.test_research_sprint.ResearchCliTests",
            "-v",
        ]
    ],
    "failure": [
        [
            sys.executable,
            "-m",
            "unittest",
            "tests.upgrade.test_research_sprint.MarketEpisodeTests",
            "-v",
        ],
        [
            "node",
            "--test",
            "--test-reporter=tap",
            "tests/upgrade/suite-system.test.mjs",
        ],
    ],
}
NATIVE_CLASSES = {
    "security": "SecurityTests",
    "load": "LoadTests",
    "recovery": "RecoveryTests",
}


def source_binding(root: Path = ROOT) -> dict[str, str]:
    """Bind the actual application, test and lock bytes while excluding local databases and secrets."""
    result = {}
    for name in (
        "apps/web/src",
        "apps/pocketbase/pb_hooks",
        "apps/pocketbase/pb_migrations",
        "apps/decision",
        "apps/federal_foundry",
        "apps/mission_suite",
        "libs/semantic_twin",
        "foundry/shared/federal_foundry",
        "tests/upgrade",
        "tests/assurance",
    ):
        for path in sorted((root / name).rglob("*")):
            if (
                path.is_file()
                and not path.is_symlink()
                and path.suffix
                in (".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".json", ".txt")
                and "__pycache__" not in path.parts
            ):
                result[str(path.relative_to(root))] = hashlib.sha256(
                    path.read_bytes()
                ).hexdigest()
    for name in (
        "package.json",
        "package-lock.json",
        "apps/web/package.json",
        "apps/web/vite.config.js",
        "tests/assurance/requirements.txt",
        ".nvmrc",
    ):
        path = root / name
        if path.is_file():
            result[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def missing(profile: str, binary: str) -> list[str]:
    """Report explicit runtime prerequisites without fetching or installing them."""
    requirements = []
    if not binary or not Path(binary).is_file() or not os.access(binary, os.X_OK):
        requirements.append("PocketBase executable")
    if profile in BROWSER:
        if not shutil.which("node"):
            requirements.append("Node")
        if vite_entry() is None:
            requirements.append("locked frontend dependencies (Vite)")
        if importlib.util.find_spec("playwright") is None:
            requirements.append("Python Playwright and browser binaries")
        else:
            try:
                from playwright.sync_api import sync_playwright

                with sync_playwright() as engine:
                    for name in (
                        ("chromium", "firefox", "webkit")
                        if profile == "compatibility"
                        else ("chromium",)
                    ):
                        if not Path(getattr(engine, name).executable_path).is_file():
                            requirements.append(name + " browser")
            except (ImportError, OSError, RuntimeError) as error:
                requirements.append(
                    "Usable Playwright runtime: " + type(error).__name__
                )
    return requirements


def counts(log: str) -> dict[str, int]:
    """Parse runner totals rather than count test definitions or assertions."""
    node = re.findall(r"^# (tests|pass|fail|skipped) (\d+)\s*$", log, re.M)
    if node:
        values = dict(node)
        return {
            "tests": int(values.get("tests", 0)),
            "passed": int(values.get("pass", 0)),
            "failed": int(values.get("fail", 0)),
            "skipped": int(values.get("skipped", 0)),
        }
    found = re.search(r"Ran (\d+) tests? in", log)
    tested = int(found[1]) if found else 0
    skipped = re.search(r"skipped=(\d+)", log)
    failures = sum(
        int(match)
        for match in re.findall(
            r"(?:\(|,\s*)(?:failures|errors|unexpected successes)=(\d+)", log
        )
    )
    expected_failures = re.search(r"expected failures=(\d+)", log)
    absent = (int(skipped[1]) if skipped else 0) + (
        int(expected_failures[1]) if expected_failures else 0
    )
    return {
        "tests": tested,
        "passed": max(0, tested - absent - failures)
        if re.search(r"^(?:OK|FAILED)(?:\s|$)", log, re.M)
        else 0,
        "failed": failures,
        "skipped": absent,
    }


def runtime_probe(binary: str, expected: str = "") -> dict[str, object]:
    """Record the actual disposable binary and reject unrecognized or mismatched versions."""
    result: dict[str, object] = {
        "state": "BLOCKED",
        "expected_version": expected or None,
        "version": None,
        "binary_sha256": None,
    }
    path = Path(binary)
    if not binary or not path.is_file() or not os.access(path, os.X_OK):
        return result
    try:
        process = subprocess.run(
            [binary, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        match = re.fullmatch(
            r"(?:pocketbase\s+(?:version\s+)?)?v?(\d+\.\d+\.\d+)\s*",
            process.stdout,
            re.I,
        )
        version = match[1] if match and process.returncode == 0 else ""
        if version:
            result["version"] = version
            result["binary_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            if not expected or version == expected:
                result["state"] = "AVAILABLE"
    except (OSError, subprocess.TimeoutExpired):
        pass
    return result


def execute(
    command: list[str], output: Path, label: str, env: dict[str, str]
) -> dict[str, object]:
    """Capture bounded runner output and fail closed on empty or skipped suites."""
    started = datetime.now(timezone.utc).isoformat()
    begin = time.monotonic()
    log = output / (label + ".log")
    exit_code = 2
    with log.open("w", encoding="utf-8") as stream:
        try:
            exit_code = subprocess.run(
                command,
                cwd=ROOT,
                env=env,
                stdout=stream,
                stderr=subprocess.STDOUT,
                timeout=4500 if label == "load-runtime" else 900,
                check=False,
            ).returncode
        except (OSError, subprocess.TimeoutExpired) as error:
            stream.write("Runner unavailable: " + type(error).__name__ + "\n")
    raw = log.read_bytes()
    totals = counts(raw.decode("utf-8", errors="replace"))
    browser = output / label / "browser-result.json"
    if browser.is_file():
        data = json.loads(browser.read_text(encoding="utf-8"))
        cases = data.get("cases", [])
        totals = {
            "tests": len(cases),
            "passed": sum(row["state"] == "PASS" for row in cases),
            "failed": sum(row["state"] != "PASS" for row in cases),
            "skipped": 0,
        }
    passed = (
        exit_code == 0
        and totals["tests"] > 0
        and totals["passed"] == totals["tests"]
        and totals["skipped"] == 0
    )
    return {
        "state": "PASS" if passed else "FAIL",
        "command": command,
        "exit_code": exit_code,
        "counts": totals,
        "started_at": started,
        "seconds": round(time.monotonic() - begin, 3),
        "log": log.name,
        "log_sha256": hashlib.sha256(raw).hexdigest(),
    }


def run(
    profiles: list[str],
    output: Path,
    *,
    binary: str = "",
    source_only: bool = False,
    expected_version: str = "",
) -> dict[str, Any]:
    """Run every selected independent check while retaining blocked requirements."""
    if (
        not profiles
        or len(set(profiles)) != len(profiles)
        or any(profile not in PROFILES for profile in profiles)
    ):
        raise ValueError("Choose distinct known profiles.")
    if output.exists() or any(path.is_symlink() for path in (output, *output.parents)):
        raise ValueError("Choose a new output directory without symlinks.")
    output.mkdir(parents=True)
    before = source_binding()
    native = (
        runtime_probe(binary, expected_version)
        if not source_only
        and any(profile in BROWSER or profile in NATIVE_CLASSES for profile in profiles)
        else {"state": "NOT_REQUESTED"}
    )
    results: dict[str, object] = {}
    env = {**os.environ, "BUILDANDDO_TEST_POCKETBASE": binary, "GIT_NO_LAZY_FETCH": "1"}
    for profile in profiles:
        checks = [
            execute(command, output, f"{profile}-source-{index}", env)
            for index, command in enumerate(SOURCE_COMMANDS.get(profile, []))
        ]
        runtime = profile in BROWSER or profile in NATIVE_CLASSES
        if runtime and not source_only:
            requirements = missing(profile, binary)
            if (
                native["state"] != "AVAILABLE"
                and "PocketBase executable" not in requirements
            ):
                requirements.append(
                    "Verified PocketBase version matching the selected runtime"
                )
            if requirements:
                checks.append({"state": "BLOCKED", "requires": requirements})
            else:
                command = (
                    [
                        sys.executable,
                        "-m",
                        "tests.assurance.browser",
                        profile,
                        "--output",
                        str(output / (profile + "-runtime")),
                    ]
                    if profile in BROWSER
                    else [
                        sys.executable,
                        "-m",
                        "unittest",
                        "tests.assurance.test_runtime." + NATIVE_CLASSES[profile],
                        "-v",
                    ]
                )
                checks.append(execute(command, output, profile + "-runtime", env))
        state = (
            "PASS"
            if checks and all(check["state"] == "PASS" for check in checks)
            else "FAIL"
            if any(check["state"] == "FAIL" for check in checks)
            else "BLOCKED"
        )
        results[profile] = {
            "state": state,
            "checks": checks,
            "runtime": "NOT_REQUESTED"
            if runtime and source_only
            else "REQUESTED"
            if runtime
            else "NOT_APPLICABLE",
        }
    stable = before == source_binding()
    result: dict[str, Any] = {
        "schema_version": "buildanddo.assurance/v1",
        "at": datetime.now(timezone.utc).isoformat(),
        "scope": "source-only"
        if source_only
        else "selected source and runtime profiles",
        "profiles": results,
        "source_unchanged": stable,
        "runtime_identity": native,
        "state": "PASS"
        if stable
        and all(
            isinstance(value, dict) and value["state"] == "PASS"
            for value in results.values()
        )
        else "HOLD",
        "runtime_acceptance": "UNMEASURED"
        if source_only
        else "See individual profiles; no deployment or production-scale claim.",
        "existing_day21_gate": "unchanged; all eighteen existing acceptance profiles remain required",
    }
    (output / "source-binding.json").write_text(
        json.dumps(before, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    result["source_binding_sha256"] = hashlib.sha256(
        (output / "source-binding.json").read_bytes()
    ).hexdigest()
    (output / "summary.json").write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return result


def main() -> int:
    """Run local profiles or explicitly reuse the existing CI PocketBase provisioning owner."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profiles", default=",".join(PROFILES))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-only", action="store_true")
    parser.add_argument(
        "--pocketbase", default=os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
    )
    parser.add_argument(
        "--provision-profile",
        choices=("package", "compose"),
        help="CI only: reuse Day-21's declared PocketBase image provisioning",
    )
    args = parser.parse_args()
    try:
        with tempfile.TemporaryDirectory(
            prefix="buildanddo-assurance-runtime-"
        ) as scratch:
            binary = args.pocketbase
            expected_version = ""
            if args.provision_profile:
                from tools.day21.day21_acceptance import extract_binary, version_for

                expected_version = version_for(ROOT, args.provision_profile)
                binary = str(extract_binary(ROOT, expected_version, Path(scratch)))
            result = run(
                args.profiles.split(","),
                args.output.absolute(),
                binary=binary,
                source_only=args.source_only,
                expected_version=expected_version,
            )
        print(
            json.dumps(
                {
                    "state": result["state"],
                    "scope": result["scope"],
                    "profiles": {
                        name: value["state"]
                        for name, value in result["profiles"].items()
                    },
                }
            )
        )
        return 0 if result["state"] == "PASS" else 1
    except (OSError, ValueError, RuntimeError) as error:
        print(
            json.dumps(
                {
                    "state": "BLOCKED",
                    "reason": type(error).__name__ + ": " + str(error)[:300],
                }
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
