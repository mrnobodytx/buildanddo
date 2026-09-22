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
import shutil
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
    # An agent can drive a whole class headlessly: no browser, no fleet box, no CitadelKey.
    # The scenario carries controls that must be REFUSED, so a green run cannot mean an open room.
    "classroom_drive": Check(
        ("python", "scripts/ci/classroom_drive.py", "scenario"),
        "native",
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
    # The OCN detector's OFFLINE half. `sweep` needs ssh keys to a fleet box and so cannot be a
    # gate - a check that only passes on rig1 is a false red everywhere else. What is gated here is
    # the part that decides what a status MEANS: that 403 reads as working software, that a 404
    # where 200 was required reads as absent, and that both controls are present. If that logic
    # rots, an operator running `sweep` gets confident nonsense, which is worse than no detector.
    "ocn_feature_sweep": Check(
        ("python", "scripts/ci/ocn_feature_sweep.py", "selftest"),
        "source",
    ),
    # The journey's offline half. `walk` needs ssh keys to a fleet box, so what is gated is the
    # GRADER: that PocketBase's generic 400 reads as BROKEN rather than a polite refusal, that a
    # refusal naming its contract reads as REFUSED, and that a control is judged on its status
    # rather than its prose. Those rules are the whole difference between "the route answered"
    # and "a person could finish", and a walk is only worth reading while they hold.
    "ocn_journey_report": Check(
        ("python", "scripts/ci/ocn_journey_report.py", "selftest"),
        "source",
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
                "tests.upgrade." + path.stem
                for path in sorted((root / "tests/upgrade").glob("test_*.py"))
                if not path.stem.endswith("_native")
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



def _twin_state(status, counts, artifacts):
    """Semantic-twin state for one acceptance receipt, or a named reason it is absent.

    Not an inference: each axis is set from something this run actually knows. A check that could
    not start is NOT_TESTED and UNMEASURED - it did not run and we are saying so. A check that ran
    with nothing of its kind to test is NOT_APPLICABLE, which is why a passing linter reporting zero
    tests stops looking like a silent no-op. VERIFIED is never claimed here, because the twin
    requires a verification receipt for it and this function has none to offer.
    """
    try:
        import sys as _sys  # noqa: PLC0415
        # os, not pathlib: this module does not import pathlib, and reaching for it produced a
        # NameError the fail-closed path reported as ABSENT rather than crashing the check.
        root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if root not in _sys.path:
            _sys.path.insert(0, root)
        from libs.semantic_twin import EvidenceState, TevvState  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        return {"vocabulary": "ABSENT:%s" % type(exc).__name__}

    ran = status in ("PASS", "FAIL")
    tested = bool(counts.get("tests"))
    if not ran:
        tevv = TevvState.NOT_TESTED          # meant to run, did not
        evidence = EvidenceState.UNMEASURED  # an honest declaration, not a failure
    elif not tested:
        tevv = TevvState.NOT_APPLICABLE      # ran; nothing of this kind to test
        evidence = EvidenceState.OBSERVED
    else:
        tevv = TevvState.PASS if status == "PASS" else TevvState.FAIL
        evidence = EvidenceState.OBSERVED

    return {
        "vocabulary": "semantic_twin",
        "tevv_state": tevv.value,
        "evidence_state": evidence.value,
        # Counts describe THIS run only when it ran. Saying so stops a reader pairing a stale number
        # with a status that means nothing happened.
        "counts_describe_this_run": ran,
        "artifacts_fresh": bool(artifacts),
        "note": ("counts are carried from an earlier receipt and do not describe this run"
                 if not ran and any(v for v in counts.values()) else ""),
    }

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
                # The program name carries an extension on Windows, where the binary
                # self-reports "pocketbase.exe version X".
                r"(?:pocketbase(?:\.\w+)?\s+(?:version\s+)?)?v?(\d+\.\d+\.\d+)\s*",
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
                # "python" already resolves to this interpreter. Everything else is resolved
                # through PATH, because on Windows npm is npm.cmd and cannot be spawned by bare
                # name: Popen raises FileNotFoundError, which this function catches as OSError and
                # reports as BLOCKED. That is indistinguishable in the receipt from a genuinely
                # unavailable runtime, so web_lint, web_build and web_tests recorded "cannot be
                # started" on every Windows run and the gate quietly had no web coverage there.
                # ship.py resolves npm the same way; this keeps the two consistent.
                if argv[0] == "python":
                    executable = [sys.executable, *argv[1:]]
                else:
                    resolved = shutil.which(argv[0])
                    executable = [resolved, *argv[1:]] if resolved else list(argv)
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
    receipt = {
        "schema_version": "buildanddo.acceptance/v1",
        "check": name,
        "level": check.level,
        "profile": profile,
        "runtime_expected": expected,
        "runtime_observed": observed,
        "source_sha256": source_digest,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "reason": reason,
        "exit_code": exit_code,
        "argv": argv,
        "counts": counts,
        # What this receipt MEANS, in the estate's own frozen vocabulary, so nobody has to infer it
        # from the shape of the other fields.
        "twin_state": _twin_state(status, counts, artifacts),
        "log": log.name,
        "log_sha256": hashlib.sha256(raw).hexdigest(),
        "artifacts": artifacts,
    }
    target = output / (stem + ".json")
    with target.open("x") as stream:
        json.dump(receipt, stream, indent=2, sort_keys=True)
        stream.write("\n")
    return target
