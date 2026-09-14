# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/supply_chain.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     package-lock.json
# EnumType:    Service
# EnumEdges:   DEPENDS_ON package-lock.json
# DAG Node:    none
# Intent:      Expose dependency advisories, licenses and manifest drift as explicit CI evidence.
# ───────────────────────────────────────────────────────────────

"""Collect report-only dependency risk and verify manifest/lock agreement."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
from typing import Any

SEVERITIES = ("critical", "high", "moderate", "low")
GROUPS = ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies")


def manifests(root: Path) -> dict[str, dict[str, Any]]:
    """Read the root and every declared workspace manifest."""
    result = {"": json.loads((root / "package.json").read_text())}
    workspaces = result[""].get("workspaces", [])
    patterns = workspaces.get("packages", []) if isinstance(workspaces, dict) else workspaces
    for pattern in patterns:
        for manifest in sorted(root.glob(f"{pattern}/package.json")):
            result[manifest.parent.relative_to(root).as_posix()] = json.loads(manifest.read_text())
    return result


def validate_lock(root: Path, packages: dict[str, Any]) -> list[str]:
    """Return manifest differences and missing direct resolutions without installing."""
    failures: list[str] = []
    for workspace, manifest in manifests(root).items():
        label = workspace or "."
        entry = packages.get(workspace)
        if not isinstance(entry, dict):
            failures.append(f"{label}: manifest entry is missing from package-lock.json")
            continue
        for field in (*GROUPS, "workspaces"):
            empty: Any = [] if field == "workspaces" else {}
            if manifest.get(field, empty) != entry.get(field, empty):
                failures.append(f"{label}: {field} differs from package-lock.json")
        for group in ("dependencies", "devDependencies", "optionalDependencies"):
            for name in manifest.get(group, {}):
                locations = [f"{workspace}/node_modules/{name}", f"node_modules/{name}"]
                if not any(location in packages for location in locations):
                    failures.append(f"{label}: {name} has no locked resolution")
    return failures


def vulnerability_metrics(report: Any) -> dict[str, int]:
    """Accept complete npm audit counts and leave unavailable results absent."""
    if not isinstance(report, dict) or report.get("error"):
        return {}
    metadata = report.get("metadata")
    if not isinstance(metadata, dict):
        return {}
    counts = metadata.get("vulnerabilities", {})
    if not isinstance(counts, dict) or not all(type(counts.get(s)) is int and counts[s] >= 0 for s in SEVERITIES):
        return {}
    return {f"deps.vulnerabilities.{severity}": counts[severity] for severity in SEVERITIES}


def license_inventory(root: Path, packages: dict[str, Any]) -> list[dict[str, Any]]:
    """Inventory direct dependencies, preserving unknown license information."""
    inventory: list[dict[str, Any]] = []
    for workspace, manifest in manifests(root).items():
        for group in ("dependencies", "devDependencies", "optionalDependencies"):
            for name, requested in sorted(manifest.get(group, {}).items()):
                locations = [f"{workspace}/node_modules/{name}".lstrip("/"), f"node_modules/{name}"]
                locked: dict[str, Any] = next((packages[p] for p in locations if p in packages), {})
                license_name = locked.get("license")
                if not license_name:
                    for location in locations:
                        try:
                            installed = json.loads((root / location / "package.json").read_text())
                            license_name = installed.get("license")
                            if license_name:
                                break
                        except (OSError, ValueError):
                            continue
                inventory.append({"workspace": workspace or ".", "name": name, "group": group,
                                  "requested": requested, "version": locked.get("version"),
                                  "license": license_name or "unknown"})
    return inventory


def collect(root: Path, audit_file: Path | None = None, skip_audit: bool = False) -> dict[str, Any]:
    """Collect dependency evidence without interpreting an unavailable audit as clean."""
    notes: list[str] = []
    try:
        lock = json.loads((root / "package-lock.json").read_text())
        if not isinstance(lock, dict):
            raise ValueError("invalid lock")
        packages = lock.get("packages", {})
        if not isinstance(packages, dict) or not all(isinstance(entry, dict) for entry in packages.values()):
            raise ValueError("invalid package entries")
        failures = validate_lock(root, packages)
    except (OSError, ValueError, TypeError):
        packages = {}
        failures = ["package-lock.json is missing or invalid"]
    audit: Any = None
    if audit_file:
        try:
            audit = json.loads(audit_file.read_text())
        except (OSError, ValueError):
            notes.append("Audit report is missing or invalid.")
    elif not skip_audit:
        try:
            result = subprocess.run(["npm", "audit", "--json", "--ignore-scripts"], cwd=root,
                                    capture_output=True, text=True, timeout=60, check=False)
            # npm uses exit 1 for valid reports containing advisories.
            if result.returncode in (0, 1):
                audit = json.loads(result.stdout)
            else:
                notes.append(f"npm audit exited {result.returncode}; counts are unknown.")
        except (OSError, ValueError, subprocess.TimeoutExpired):
            notes.append("npm audit was unavailable, timed out or returned invalid JSON.")
    metrics = vulnerability_metrics(audit)
    audit_available = bool(metrics)
    inventory = license_inventory(root, packages)
    metrics.update({"deps.audit_available": int(audit_available), "deps.lock_consistent": int(not failures),
                    "deps.licenses_unknown": sum(item["license"] == "unknown" for item in inventory)})
    return {"schema_version": 1, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "audit_status": "available" if audit_available else "unavailable",
            "metrics": metrics, "lock_failures": failures, "licenses": inventory, "notes": notes}


def main() -> int:
    """Write the supply report and optionally gate on manifest/lock consistency."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--audit-file", type=Path)
    parser.add_argument("--skip-audit", action="store_true")
    parser.add_argument("--check-lock", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("reports/supply-chain.json"))
    args = parser.parse_args()
    report = collect(args.root, args.audit_file, args.skip_audit)
    output = args.root / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    lines = ["### Dependency supply chain", "", f"Audit: {report['audit_status']}.",
             f"Lockfile: {'FAIL' if report['lock_failures'] else 'PASS'}."]
    for severity in SEVERITIES:
        value = report["metrics"].get(f"deps.vulnerabilities.{severity}", "unknown")
        lines.append(f"- {severity}: {value}")
    lines.extend(f"- {failure}" for failure in report["lock_failures"])
    summary = "\n".join(lines) + "\n"
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as handle:
            handle.write(summary)
    return int(args.check_lock and bool(report["lock_failures"]))


if __name__ == "__main__":
    raise SystemExit(main())
