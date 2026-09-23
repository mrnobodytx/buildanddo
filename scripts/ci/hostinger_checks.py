# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/hostinger_checks.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/hostinger_readiness.py
# EnumType:    Service
# EnumEdges:   PRODUCES scripts/ci/hostinger_readiness.py
# Intent:      Execute only reviewed local acceptance commands and retain observed failures, skips, runtime identity and exact log digests.
# ───────────────────────────────────────────────────────────────

"""Run the repository's acceptance checks without installing or deploying anything."""

from __future__ import annotations

import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass(frozen=True)
class Check:
    """Describe a fixed command, its proof level and any required output."""

    argv: tuple[str, ...]
    level: str
    test_format: str = ""
    artifacts: tuple[str, ...] = ()


SOURCE_PYTHON_SUITES = ("upgrade", "career", "knowledge_units", "integrity", "world_twin")


CHECKS = {
    "boundary": Check(("python", "scripts/ci/verify_public_boundary.py"), "source"),
    "dependency_lock": Check(
        ("python", "scripts/ci/supply_chain.py", "--skip-audit", "--check-lock"),
        "source",
    ),
    "source_node": Check(
        ("node", "--test", "--test-reporter=tap", "@node_tests"), "source", "tap"
    ),
    "source_python": Check(
        ("python", "-m", "unittest", "@python_tests"), "source", "unittest"
    ),
    "semantic_twin": Check(
        (
            "python",
            "-m",
            "unittest",
            "discover",
            "-s",
            "tests/upgrade",
            "-p",
            "test_semantic_twin*.py",
        ),
        "source",
        "unittest",
    ),
    "web_lint": Check(("npm", "--prefix", "apps/web", "run", "lint"), "source"),
    "web_tests": Check(
        (
            "npm",
            "--prefix",
            "apps/web",
            "run",
            "test:coverage",
            "--",
            "--reporter=default",
            "--reporter=junit",
            "--outputFile.junit=../../reports/junit/web.xml",
        ),
        "rendered",
        "junit",
        ("reports/junit/web.xml",),
    ),
    "web_build": Check(
        ("npm", "run", "build"), "build", artifacts=("dist/apps/web/index.html",)
    ),
    "native_workspace": Check(
        ("python", "tests/upgrade/test_workspace_native.py", "--require-binary"),
        "native",
        "unittest",
    ),
    "native_suite": Check(
        ("python", "tests/upgrade/test_suite_native.py", "--require-binary"),
        "native",
        "unittest",
    ),
    "native_learning": Check(
        (
            "python",
            "tests/upgrade/test_tutorial_learning_native.py",
            "--require-binary",
        ),
        "native",
        "unittest",
    ),
    "native_classroom": Check(
        ("python", "tests/upgrade/test_classroom_native.py", "--require-binary"),
        "native",
        "unittest",
    ),
    "native_dossier": Check(
        ("python", "tests/upgrade/test_dossier_native.py", "--require-binary"),
        "native",
        "unittest",
    ),
}


def command(root: Path, check: Check) -> list[str]:
    """Expand only fixed repository test globs, never shell text from a manifest."""
    result: list[str] = []
    for part in check.argv:
        if part == "@node_tests":
            result.extend(
                str(path.relative_to(root))
                for path in sorted((root / "tests/upgrade").glob("*.test.mjs"))
            )
        elif part == "@python_tests":
            result.extend(
                f"tests.{suite}.{path.stem}"
                for suite in SOURCE_PYTHON_SUITES
                for path in sorted((root / "tests" / suite).glob("test_*.py"))
                if path.is_file() and not path.stem.endswith("_native")
            )
        else:
            result.append(part)
    return result


def runtime_version(root: Path, profile: str) -> str:
    """Resolve one declared PocketBase runtime without downloading it."""
    if profile == "package":
        value = (root / "apps/pocketbase/.pocketbase-version").read_text().strip()
    elif profile == "compose":
        match = re.search(
            r"POCKETBASE_VERSION:-([0-9.]+)", (root / "docker-compose.yml").read_text()
        )
        value = match.group(1) if match else ""
    else:
        raise ValueError("Choose the package or compose runtime profile.")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", value):
        raise ValueError("The declared PocketBase version is invalid.")
    return value


def test_counts(text: str, kind: str, root: Path) -> dict[str, int]:
    """Extract actual counts; a successful empty test process is insufficient."""
    counts = {"tests": 0, "failures": 0, "skipped": 0}
    if kind == "tap":
        for field, label in (
            ("tests", "tests"),
            ("failures", "fail"),
            ("skipped", "skipped"),
        ):
            values = re.findall(rf"^# {label} (\d+)\s*$", text, re.MULTILINE)
            counts[field] = int(values[-1]) if values else 0
        for label in ("cancelled", "todo"):
            values = re.findall(rf"^# {label} (\d+)\s*$", text, re.MULTILINE)
            counts["skipped"] += int(values[-1]) if values else 0
    elif kind == "unittest":
        match = re.search(r"Ran (\d+) tests? in ", text)
        counts["tests"] = int(match.group(1)) if match else 0
        for field in ("failures", "errors", "skipped"):
            match = re.search(rf"\b{field}=(\d+)", text)
            if match:
                counts["skipped" if field == "skipped" else "failures"] += int(
                    match.group(1)
                )
    elif kind == "junit":
        try:
            document = ET.parse(root / "reports/junit/web.xml")
            cases = document.findall(".//testcase")
            counts = {
                "tests": len(cases),
                "failures": sum(
                    case.find("failure") is not None or case.find("error") is not None
                    for case in cases
                ),
                "skipped": sum(case.find("skipped") is not None for case in cases),
            }
        except (OSError, ET.ParseError):
            pass
    return counts


def candidate_binding(root: Path) -> tuple[str | None, bool]:
    """Observe the local revision and whether its source has uncommitted changes."""
    try:
        revision = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        ).stdout.strip()
        status = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=normal"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return None, False
    return (
        (revision, not status)
        if re.fullmatch(r"[a-f0-9]{40}", revision)
        else (None, False)
    )


def run_check(
    root: Path,
    output: Path,
    name: str,
    source_digest: str,
    profile: str = "package",
    timeout: int = 600,
) -> Path:
    """Capture one real process outcome with source binding and bounded runtime."""
    check = CHECKS[name]
    candidate, candidate_clean = candidate_binding(root)
    argv = command(root, check)
    environment = os.environ.copy()
    if name == "source_python":
        # unittest discovery normally adds this directory for sibling helpers.
        # Explicit module selection must preserve it while separating native tests.
        environment["PYTHONPATH"] = os.pathsep.join(
            value
            for value in (
                str(root / "tests/upgrade"),
                environment.get("PYTHONPATH", ""),
            )
            if value
        )
    output.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc)
    stem = f"{name}-{profile}-{time.time_ns()}"
    log = output / (stem + ".log")
    status, reason, exit_code = "FAIL", "", -1
    expected = runtime_version(root, profile) if check.level == "native" else ""
    observed = ""
    if name == "source_python":
        missing = [
            "tests/" + suite
            for suite in SOURCE_PYTHON_SUITES
            if not any(part.startswith(f"tests.{suite}.") for part in argv)
        ]
        if missing:
            status, reason = (
                "BLOCKED",
                "No source Python tests found in: " + ", ".join(missing),
            )
    if check.level == "native":
        binary = os.environ.get("BUILDANDDO_TEST_POCKETBASE", "")
        try:
            result = subprocess.run(
                [binary, "--version"],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            match = re.fullmatch(
                r"(?:pocketbase\s+(?:version\s+)?)?v?(\d+\.\d+\.\d+)\s*",
                result.stdout,
                re.IGNORECASE,
            )
            observed = match.group(1) if match and result.returncode == 0 else ""
        except (OSError, subprocess.TimeoutExpired):
            pass
        if observed != expected:
            status, reason = (
                "BLOCKED",
                "Install the declared disposable PocketBase test runtime and set BUILDANDDO_TEST_POCKETBASE.",
            )
    with log.open("xb") as stream:
        if reason:
            stream.write((reason + "\n").encode())
        else:
            try:
                executable = (
                    [sys.executable, *argv[1:]] if argv[0] == "python" else argv
                )
                with subprocess.Popen(
                    executable,
                    cwd=root,
                    env=environment,
                    stdout=stream,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                ) as process:
                    try:
                        exit_code = process.wait(timeout=timeout)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                        raise
                status = "PASS" if exit_code == 0 else "FAIL"
                reason = (
                    ""
                    if exit_code == 0
                    else "The required command failed; inspect its retained log."
                )
            except OSError:
                status, reason = "BLOCKED", "The required command cannot be started."
            except subprocess.TimeoutExpired:
                status, reason = "FAIL", "The required command exceeded its time limit."
            if reason:
                stream.write((reason + "\n").encode())
    raw = log.read_bytes()
    counts = test_counts(raw.decode(errors="replace"), check.test_format, root)
    artifacts: dict[str, str] = {}
    for name_path in check.artifacts:
        path = root / name_path
        if (
            path.is_file()
            and not path.is_symlink()
            and path.stat().st_mtime >= started.timestamp() - 1
        ):
            artifacts[name_path] = hashlib.sha256(path.read_bytes()).hexdigest()
        elif status == "PASS":
            status, reason = "FAIL", "A required fresh artifact was not produced."
    if (
        status == "PASS"
        and check.test_format
        and (not counts["tests"] or counts["failures"] or counts["skipped"])
    ):
        status, reason = (
            "HOLD",
            "Tests were empty, failing or skipped; acceptance is incomplete.",
        )
    final_candidate, final_clean = candidate_binding(root)
    receipt = {
        "schema_version": "buildanddo.acceptance/v1",
        "check": name,
        "level": check.level,
        "profile": profile,
        "runtime_expected": expected,
        "runtime_observed": observed,
        "source_sha256": source_digest,
        "candidate_sha": candidate,
        "candidate_clean": candidate_clean,
        "candidate_unchanged": candidate is not None
        and candidate == final_candidate
        and candidate_clean
        and final_clean,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "reason": reason,
        "exit_code": exit_code,
        "argv": argv,
        "counts": counts,
        "log": log.name,
        "log_sha256": hashlib.sha256(raw).hexdigest(),
        "artifacts": artifacts,
    }
    target = output / (stem + ".json")
    with target.open("x") as stream:
        json.dump(receipt, stream, indent=2, sort_keys=True)
        stream.write("\n")
    return target
