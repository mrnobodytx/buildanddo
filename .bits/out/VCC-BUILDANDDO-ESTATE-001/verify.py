# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-ESTATE-001/verify.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/metadata.py, apps/estate/seal.py, .bits/context.lock.json, .bits/out/VCC-BUILDANDDO-ESTATE-001/memory.json
# EnumType:    Test
# EnumEdges:   DEPENDS_ON apps/estate/metadata.py; DEPENDS_ON apps/estate/seal.py; DEPENDS_ON .bits/context.lock.json; DEPENDS_ON .bits/out/VCC-BUILDANDDO-ESTATE-001/memory.json
# DAG Node:    none
# Intent:      Verify estate governance receipts, exact header edges and the unchanged existing-code boundary with optional repeatable-seal evidence.
# ───────────────────────────────────────────────────────────────

"""Verify the additive estate dispatch and its local evidence receipts."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
import json
from pathlib import Path
import subprocess
import sys
from typing import cast

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from apps.estate.metadata import enum_edges, parse_cgrf, parse_registry  # noqa: E402
from apps.estate.seal import compile_estate, save_snapshot  # noqa: E402

BASE = "4864e8e1a60347cc70fbd9133551255f055cffff"
DISPATCH = "VCC-BUILDANDDO-ESTATE-001"
SRS = "SRS-BUILDANDDO-ESTATE-001"
OUTPUT = ROOT / ".bits/out" / DISPATCH


def main() -> int:
    """Print observed governance checks and optionally prove stable local seals."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seal", action="store_true")
    args = parser.parse_args()
    payload = cast(dict[str, object], json.loads((OUTPUT / "memory.json").read_text()))
    vectors = cast(list[dict[str, object]], payload["vectors"])
    summary = cast(dict[str, object], payload["summary"])
    counts = Counter(str(vector["type"]) for vector in vectors)
    rows = [vector for vector in vectors if vector["type"] == "A"]
    a_paths = {str(vector["file_path"]) for vector in rows}
    base_files = set(subprocess.check_output(["git", "ls-tree", "-rz", "--name-only", BASE], cwd=ROOT).decode().split("\0")) - {""}
    changed = set(subprocess.check_output(["git", "diff", "--name-only", "-z", BASE], cwd=ROOT).decode().split("\0")) - {""}
    checks: dict[str, bool] = {
        "memory_types": set(counts) == {"A", "B", "C"},
        "memory_counts": all(summary.get(f"type_{kind.lower()}_count") == counts[kind] for kind in "ABC"),
        "memory_file_coverage": a_paths == changed,
        "existing_code_unchanged": changed & base_files <= {".bits/srs_registry.yml", ".bits/context.lock.json"},
        "registered_scope": any(entry.code == SRS and entry.status == "in_progress" for entry in parse_registry((ROOT / ".bits/srs_registry.yml").read_text())),
        "dispatch_exists": (ROOT / ".bits/queue" / (DISPATCH + ".md")).is_file(),
    }
    actual_edges = {(str(row["source"]), str(row["target"]), str(row["edge_type"])) for row in vectors if row["type"] == "B"}
    expected_edges: set[tuple[str, str, str]] = set()
    header_count = 0
    headers_ok = True
    ioo_ok = True
    line_counts_ok = True
    for row in rows:
        relative = str(row["file_path"])
        path = ROOT / relative
        line_counts_ok &= row["lines"] == len(path.read_text().splitlines())
        ioo_ok &= all(row.get(key) is not None and row.get(key) != "" for key in ("intent_statement", "objective_id", "outcome", "supersedes"))
        fields = parse_cgrf(path.read_text()[:32768])
        if fields:
            expected_edges.update((relative, target, kind) for kind, target in enum_edges(fields.get("EnumEdges", "")))
        if relative not in base_files:
            if path.suffix == ".json":
                fields = parse_cgrf(Path(str(path) + ".cgrf.yaml").read_text())
            headers_ok &= bool(fields) and fields.get("SRS") == SRS and fields.get("Dispatch") == DISPATCH
            headers_ok &= fields.get("Owner") == "Citadel Nexus Inc." and fields.get("CAPS") == fields.get("CK") == "pending"
            headers_ok &= fields.get("Intent") == row["intent_statement"]
            header_count += 1
    checks["new_headers"] = headers_ok
    checks["header_edges_exact"] = actual_edges == expected_edges
    checks["ioo_fields"] = ioo_ok and summary.get("ioo_compliance") is True
    checks["line_counts"] = line_counts_ok
    orphans = sorted(path for path in a_paths if not any(path in edge[:2] for edge in actual_edges))
    checks["dkg_edges"] = not orphans and summary.get("dkg_orphans") == 0
    checks["event_timestamps"] = all(datetime.fromisoformat(str(row["timestamp"]).replace("Z", "+00:00")).tzinfo is not None for row in vectors if row["type"] == "C")
    seal_result: dict[str, object] = {}
    if args.seal:
        first = save_snapshot(ROOT, compile_estate(ROOT))
        path = ROOT / "state/estate/seal.latest.json"
        encoded = path.read_bytes()
        second = save_snapshot(ROOT, compile_estate(ROOT))
        checks["repeatable_seal"] = first.seal.sha256 == second.seal.sha256 and path.read_bytes() == encoded
        seal_result = {"module_count": first.seal.module_count, "edge_count": first.seal.edge_count,
                       "structural_defects": first.seal.validation_violations,
                       "route_count": len(first.snapshot.routes)}
    result = {"state": "PASS" if all(checks.values()) else "FAIL", "checks": checks,
              "new_files_with_headers": header_count, "memory_counts": dict(counts), "dkg_orphans": orphans,
              "seal": seal_result}
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())

