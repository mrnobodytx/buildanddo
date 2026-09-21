#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        tools/day21/day21_acceptance.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        CLA-INSTALLER
# Owner:       Citadel Nexus Inc.
# Depends:     scripts/ci/hostinger_checks.py, scripts/ci/hostinger_readiness.py, scripts/ci/day21_submission.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/hostinger_checks.py; CONSUMES scripts/ci/hostinger_readiness.py; CONSUMES scripts/ci/day21_submission.py
# Intent:      Run the declared acceptance profiles and retain current failures without mistaking an incomplete run for acceptance.
# ───────────────────────────────────────────────────────────────
"""Run BuildAndDo's existing Hostinger acceptance suite on a self-hosted runner.

Use installed dependencies and explicit PocketBase paths with --offline.
Otherwise Docker may build the declared test images and extract their binaries.
All native tests use disposable local instances; this runner does not deploy.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.ci import hostinger_checks as checks  # noqa: E402
from scripts.ci.day21_submission import Day21Error, export_acceptance  # noqa: E402
from scripts.ci.hostinger_readiness import ReadinessError  # noqa: E402

SOURCE_CHECKS = tuple(
    name for name, check in checks.CHECKS.items() if check.level != "native"
)
NATIVE_CHECKS = tuple(
    name for name, check in checks.CHECKS.items() if check.level == "native"
)


def run(argv: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> int:
    """Execute a fixed argument list without invoking a shell."""
    print("+ " + " ".join(argv), flush=True)
    return subprocess.run(argv, cwd=cwd, env=env, check=False).returncode


def version_for(root: Path, profile: str) -> str:
    """Reuse the acceptance gate's declared runtime versions."""
    return checks.runtime_version(root, profile)


def extract_binary(root: Path, version: str, work: Path) -> Path:
    """Extract a declared test binary without starting its packaged services."""
    if not shutil.which("docker"):
        raise RuntimeError("Docker is required for native acceptance provisioning")
    tag = "buildanddo-day21-pb-" + version.replace(".", "-")
    if run(
        [
            "docker",
            "build",
            "--build-arg",
            f"POCKETBASE_VERSION={version}",
            "--tag",
            tag,
            "apps/pocketbase",
        ],
        cwd=root,
    ):
        raise RuntimeError(f"PocketBase image build failed for {version}")
    created = subprocess.run(
        ["docker", "create", tag], cwd=root, capture_output=True, text=True, check=False
    )
    if created.returncode:
        raise RuntimeError("could not create test container")
    cid = created.stdout.strip()
    target = work / f"pocketbase-{version}"
    try:
        if run(["docker", "cp", f"{cid}:/pb/pocketbase", str(target)], cwd=root):
            raise RuntimeError("could not extract PocketBase binary")
    finally:
        subprocess.run(
            ["docker", "rm", cid],
            cwd=root,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    target.chmod(0o755)
    return target


def readiness(
    root: Path,
    evidence: Path,
    name: str,
    profile: str,
    env: dict[str, str] | None = None,
) -> int:
    """Run the existing check that verifies runtime identity and writes its receipt."""
    argv = [
        sys.executable,
        "scripts/ci/hostinger_readiness.py",
        "--run",
        name,
        "--runtime",
        profile,
        "--evidence-dir",
        str(evidence),
    ]
    return run(argv, cwd=root, env=env)


def write_summary(root: Path, evidence: Path, target: Path) -> dict[str, object]:
    """Revalidate and export exact receipts, logs and artifacts with the shared gate."""
    if target.name != "acceptance-summary.json":
        raise Day21Error("summary output must be named acceptance-summary.json")
    candidate, clean = checks.candidate_binding(root)
    if candidate is None or not clean:
        raise Day21Error("acceptance requires an unchanged committed candidate")
    exported = export_acceptance(root, evidence, target.parent, candidate)
    summary: dict[str, object] = json.loads(exported.read_text())
    return summary


def main(argv: list[str] | None = None) -> int:
    """Execute the selected checks and succeed only when full acceptance passes."""
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo", type=Path, default=Path.cwd())
    p.add_argument(
        "--evidence-dir", type=Path, default=Path("reports/day21/acceptance")
    )
    selection = p.add_mutually_exclusive_group()
    selection.add_argument("--source-only", action="store_true")
    selection.add_argument("--native-only", action="store_true")
    provisioning = p.add_mutually_exclusive_group()
    provisioning.add_argument(
        "--install-deps",
        action="store_true",
        help="run npm ci and declared Python requirements before source checks",
    )
    provisioning.add_argument(
        "--offline",
        action="store_true",
        help="use installed dependencies and supplied binaries without installs or Docker builds",
    )
    p.add_argument(
        "--pocketbase-package",
        type=Path,
        help="installed package-profile PocketBase binary",
    )
    p.add_argument(
        "--pocketbase-compose",
        type=Path,
        help="installed compose-profile PocketBase binary",
    )
    p.add_argument(
        "--summary-output",
        type=Path,
        default=Path("state/day21/evidence/acceptance-summary.json"),
    )
    args = p.parse_args(argv)
    root = args.repo.resolve()
    evidence = (
        args.evidence_dir
        if args.evidence_dir.is_absolute()
        else root / args.evidence_dir
    )
    summary_target = (
        args.summary_output
        if args.summary_output.is_absolute()
        else root / args.summary_output
    )
    try:
        if summary_target.name != "acceptance-summary.json":
            raise Day21Error("summary output must be named acceptance-summary.json")
        for path in (summary_target, summary_target.parent / "acceptance"):
            if path.exists() or path.is_symlink():
                raise Day21Error(
                    "acceptance evidence already exists; select a new directory"
                )
        candidate, clean = checks.candidate_binding(root)
        if candidate is None or not clean:
            raise Day21Error("acceptance requires an unchanged committed candidate")
        evidence.mkdir(parents=True, exist_ok=True)
        if run(
            [sys.executable, "scripts/ci/hostinger_readiness.py", "--check"], cwd=root
        ):
            return 2
        failures = 0
        if not args.native_only:
            if args.install_deps:
                failures += bool(run(["npm", "ci"], cwd=root))
                failures += bool(
                    run(
                        [
                            sys.executable,
                            "-m",
                            "pip",
                            "install",
                            "-r",
                            "scripts/discordbot/requirements.txt",
                            "-r",
                            "apps/research/requirements.txt",
                        ],
                        cwd=root,
                    )
                )
            for name in SOURCE_CHECKS:
                failures += bool(readiness(root, evidence, name, "package"))
        if not args.source_only:
            with tempfile.TemporaryDirectory(prefix="buildanddo-day21-pb-") as tmp:
                for profile, supplied in (
                    ("package", args.pocketbase_package),
                    ("compose", args.pocketbase_compose),
                ):
                    binary = None
                    if supplied is not None:
                        binary = supplied if supplied.is_absolute() else root / supplied
                    elif not args.offline:
                        try:
                            binary = extract_binary(
                                root, version_for(root, profile), Path(tmp)
                            )
                        except (OSError, ValueError, RuntimeError) as exc:
                            print(f"BLOCKED {profile}: {exc}", file=sys.stderr)
                            failures += 1
                    env = os.environ.copy()
                    # Never reuse a different profile's inherited runtime after setup fails.
                    # The existing checks retain a BLOCKED receipt for every missing binary.
                    env["BUILDANDDO_TEST_POCKETBASE"] = str(binary) if binary else ""
                    for name in NATIVE_CHECKS:
                        failures += bool(readiness(root, evidence, name, profile, env))
        summary = write_summary(root, evidence, summary_target)
        passed = failures == 0 and summary["state"] == "PASS"
        print(
            f"DAY21 ACCEPTANCE {'PASS' if passed else 'HOLD'} failed_commands={failures} summary={summary['state']}"
        )
        return 0 if passed else 1
    except (Day21Error, ReadinessError, OSError, ValueError) as exc:
        print(f"DAY21 ACCEPTANCE HOLD: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
