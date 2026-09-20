#!/usr/bin/env python3
# # --- CGRF Header ------------------------------------------------
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DAY21-CLOSURE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DAY21-CLOSURE-001
# Seat:        CLA-INSTALLER
# Owner:       Citadel Nexus Inc.
# Intent:      Close Hostinger Day-21 runtime evidence and submission packaging gaps without granting deployment authority.
# ----------------------------------------------------------------
"""Run BuildAndDo's existing Hostinger acceptance suite on a self-hosted runner.

No deployment or remote mutation is performed. Docker is used only to build the
repository's declared PocketBase test image and extract the pinned binary.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SOURCE_CHECKS = ("boundary", "dependency_lock", "source_node", "source_python", "semantic_twin", "web_lint", "web_tests", "web_build")
NATIVE_CHECKS = ("native_workspace", "native_suite", "native_learning", "native_classroom", "native_dossier")


def run(argv: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> int:
    print("+ " + " ".join(argv), flush=True)
    return subprocess.run(argv, cwd=cwd, env=env, check=False).returncode


def version_for(root: Path, profile: str) -> str:
    if profile == "package":
        value = (root / "apps/pocketbase/.pocketbase-version").read_text().strip()
    else:
        match = re.search(r"POCKETBASE_VERSION:-([0-9.]+)", (root / "docker-compose.yml").read_text())
        value = match.group(1) if match else ""
    if not re.fullmatch(r"\d+\.\d+\.\d+", value):
        raise ValueError(f"invalid {profile} PocketBase version")
    return value


def extract_binary(root: Path, version: str, work: Path) -> Path:
    if not shutil.which("docker"):
        raise RuntimeError("Docker is required for native acceptance provisioning")
    tag = "buildanddo-day21-pb-" + version.replace(".", "-")
    if run(["docker", "build", "--build-arg", f"POCKETBASE_VERSION={version}", "--tag", tag, "apps/pocketbase"], cwd=root):
        raise RuntimeError(f"PocketBase image build failed for {version}")
    created = subprocess.run(["docker", "create", tag], cwd=root, capture_output=True, text=True, check=False)
    if created.returncode:
        raise RuntimeError("could not create test container")
    cid = created.stdout.strip()
    target = work / f"pocketbase-{version}"
    try:
        if run(["docker", "cp", f"{cid}:/pb/pocketbase", str(target)], cwd=root):
            raise RuntimeError("could not extract PocketBase binary")
    finally:
        subprocess.run(["docker", "rm", cid], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    target.chmod(0o755)
    return target


def readiness(root: Path, evidence: Path, name: str, profile: str, env: dict[str, str] | None = None) -> int:
    argv = [sys.executable, "scripts/ci/hostinger_readiness.py", "--run", name, "--runtime", profile, "--evidence-dir", str(evidence)]
    return run(argv, cwd=root, env=env)


EXPECTED_PROFILES = tuple(SOURCE_CHECKS) + tuple(
    f"{name}:{profile}" for profile in ("package", "compose") for name in NATIVE_CHECKS
)


def latest_acceptance(evidence: Path) -> dict[str, dict[str, object]]:
    selected: dict[str, tuple[str, dict[str, object]]] = {}
    for path in evidence.glob("*.json"):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if value.get("schema_version") != "buildanddo.acceptance/v1":
            continue
        name, profile = value.get("check"), value.get("profile")
        if name not in SOURCE_CHECKS + NATIVE_CHECKS or profile not in ("package", "compose"):
            continue
        key = f"{name}:{profile}" if name in NATIVE_CHECKS else str(name)
        stamp = str(value.get("finished_at") or "")
        if key not in selected or stamp >= selected[key][0]:
            value["_path"] = str(path)
            selected[key] = (stamp, value)
    return {key: pair[1] for key, pair in selected.items()}


def _file_ref(path: Path, relative: str, observed_at: str) -> dict[str, str]:
    return {
        "path": relative,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "observed_at": observed_at,
    }


def write_summary(root: Path, evidence: Path, target: Path) -> dict[str, object]:
    selected = latest_acceptance(evidence)
    profiles = {key: str(selected.get(key, {}).get("status", "UNMEASURED")) for key in EXPECTED_PROFILES}
    digests = {str(value.get("source_sha256")) for value in selected.values() if value.get("source_sha256")}
    source = next(iter(digests)) if len(digests) == 1 else ""
    git_result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=False)
    git_sha = git_result.stdout.strip() if git_result.returncode == 0 else ""
    counts = {state: list(profiles.values()).count(state) for state in ("PASS", "HOLD", "FAIL", "BLOCKED", "UNMEASURED", "STALE", "INVALID")}
    evidence_refs: dict[str, dict[str, dict[str, str]]] = {}
    proof_dir = target.parent / "acceptance"
    proof_dir.mkdir(parents=True, exist_ok=True)
    evidence_complete = True
    for key in EXPECTED_PROFILES:
        receipt = selected.get(key)
        if not receipt:
            evidence_complete = False
            continue
        source_path = Path(str(receipt.get("_path", "")))
        log_name = receipt.get("log")
        finished_at = str(receipt.get("finished_at") or "")
        if not source_path.is_file() or not isinstance(log_name, str) or not log_name:
            evidence_complete = False
            continue
        log_path = evidence / log_name
        if not log_path.is_file():
            evidence_complete = False
            continue
        safe_key = key.replace(":", "-")
        receipt_target = proof_dir / f"{safe_key}.json"
        log_target = proof_dir / f"{safe_key}.log"
        shutil.copy2(source_path, receipt_target)
        shutil.copy2(log_path, log_target)
        evidence_refs[key] = {
            "receipt": _file_ref(receipt_target, f"acceptance/{receipt_target.name}", finished_at),
            "log": _file_ref(log_target, f"acceptance/{log_target.name}", finished_at),
        }
    state = "PASS" if profiles and all(value == "PASS" for value in profiles.values()) and len(selected) == len(EXPECTED_PROFILES) and source and git_sha and evidence_complete and len(evidence_refs) == len(EXPECTED_PROFILES) else "HOLD"
    summary = {
        "schema": "buildanddo.day21-acceptance-summary/v1",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "state": state,
        "candidate_sha": git_sha,
        "source_sha256": source,
        "expected_profiles": len(EXPECTED_PROFILES),
        "profiles": profiles,
        "counts": counts,
        "evidence": evidence_refs,
        "scope": "Existing Hostinger readiness checks only. PASS does not itself prove public deployment or competition submission.",
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return summary


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo", type=Path, default=Path.cwd())
    p.add_argument("--evidence-dir", type=Path, default=Path("reports/day21/acceptance"))
    p.add_argument("--source-only", action="store_true")
    p.add_argument("--native-only", action="store_true")
    p.add_argument("--install-deps", action="store_true", help="run npm ci and declared Python requirements before source checks")
    p.add_argument("--summary-output", type=Path, default=Path("state/day21/evidence/acceptance-summary.json"))
    args = p.parse_args(argv)
    root = args.repo.resolve()
    evidence = args.evidence_dir if args.evidence_dir.is_absolute() else root / args.evidence_dir
    evidence.mkdir(parents=True, exist_ok=True)
    if run([sys.executable, "scripts/ci/hostinger_readiness.py", "--check"], cwd=root):
        return 2
    failures = 0
    if not args.native_only:
        if args.install_deps:
            failures += bool(run(["npm", "ci"], cwd=root))
            failures += bool(run([sys.executable, "-m", "pip", "install", "-r", "scripts/discordbot/requirements.txt", "-r", "apps/research/requirements.txt"], cwd=root))
        for name in SOURCE_CHECKS:
            failures += bool(readiness(root, evidence, name, "package"))
    if not args.source_only:
        with tempfile.TemporaryDirectory(prefix="buildanddo-day21-pb-") as tmp:
            work = Path(tmp)
            for profile in ("package", "compose"):
                try:
                    binary = extract_binary(root, version_for(root, profile), work)
                except (OSError, ValueError, RuntimeError) as exc:
                    print(f"BLOCKED {profile}: {exc}", file=sys.stderr)
                    failures += len(NATIVE_CHECKS)
                    continue
                env = os.environ.copy()
                env["BUILDANDDO_TEST_POCKETBASE"] = str(binary)
                for name in NATIVE_CHECKS:
                    failures += bool(readiness(root, evidence, name, profile, env))
    summary_target = args.summary_output if args.summary_output.is_absolute() else root / args.summary_output
    summary = write_summary(root, evidence, summary_target)
    print(f"DAY21 ACCEPTANCE {'PASS' if failures == 0 else 'HOLD'} failures={failures} summary={summary['state']}")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
