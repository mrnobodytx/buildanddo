# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# EnumType:    Service
# EnumEdges:   DEPENDS_ON .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# DAG Node:    none
# Intent:      Make the memory report reproducible by checking provenance, IOO, edges and source counts locally.
# ───────────────────────────────────────────────────────────────

"""Verify the dispatch memory payload against its recorded source files."""
from pathlib import Path
import json
import re
import sys
import subprocess
from datetime import datetime

ROOT = Path(__file__).resolve().parents[3]
DISPATCH = "VCC-BUILDANDDO-UPGRADE-001"
SRS = "SRS-BUILDANDDO-UPGRADE-001"
BASE = "67c95104962e4a17a6f43e6e9d4463056042ef27"


def header_fields(path: Path) -> dict[str, str]:
    """Read the existing CGRF block without interpreting source code or markup."""
    fields: dict[str, str] = {}
    current = ""
    for line in path.read_text().splitlines():
        text = re.sub(r"^\s*(?://|#|--|/\*|\*)?\s*", "", line).strip()
        if fields and re.match(r"^─{4,}", text):
            break
        match = re.match(r"^(File|Stage|SRS|CAPS|CK|Dispatch|Seat|Owner|Created|Depends|EnumType|EnumEdges|DAG Node|Intent):\s*(.*)$", text)
        if match:
            current = match.group(1)
            fields[current] = match.group(2)
        elif current and text and not text.startswith(("<", ">")):
            fields[current] += " " + text
        elif not text:
            current = ""
    return fields


def header_edges(path: Path) -> list[tuple[str, str]]:
    """Parse the declared relationship verbs and targets from a CGRF header."""
    value = header_fields(path).get("EnumEdges", "")
    edges = []
    for part in value.split(";"):
        match = re.match(r"^(CONSUMES|PRODUCES|VALIDATES|TRIGGERS|GATES|OWNS|DEPENDS_ON|EXTENDS|FIXES|SUPERSEDES|VERIFIED_BY|USES_TEMPLATE)\s+(.+)$", part.strip())
        if match:
            edges.append((match.group(1), match.group(2).strip()))
    return edges


def main() -> int:
    """Check vector counts, IOO fields, edges, provenance and source line counts."""
    payload = json.loads(Path(__file__).with_name("memory.json").read_text())
    vectors = payload["vectors"]
    summary = payload["summary"]
    groups = {kind: [entry for entry in vectors if entry["type"] == kind] for kind in "ABC"}
    assert sum(map(len, groups.values())) == len(vectors), "unexpected vector type"
    assert list(payload)[-1] == "summary", "summary must be last"
    for kind in "ABC":
        assert summary[f"type_{kind.lower()}_count"] == len(groups[kind]), "incorrect count"
    assert summary["dispatch_id"] == DISPATCH
    assert summary["srs_codes"] == [SRS]
    assert summary["seat"] == "BITS-CODEGEN"
    assert summary["ioo_compliance"] is True and summary["dkg_orphans"] == 0
    linked = {edge[endpoint] for edge in groups["B"] for endpoint in ("source", "target")}
    paths = [entry["file_path"] for entry in groups["A"]]
    base_paths = set(subprocess.check_output(["git", "ls-tree", "-r", "--name-only", BASE], cwd=ROOT, text=True).splitlines())
    declared: set[tuple[str, str, str]] = set()
    actual = {(edge["source"], edge["edge_type"], edge["target"]) for edge in groups["B"]}
    assert len(paths) == len(set(paths)), "duplicate file vectors"
    for entry in groups["A"]:
        name = entry["file_path"]
        path = ROOT / name
        assert path.resolve().is_relative_to(ROOT) and path.is_file(), f"missing file: {name}"
        assert name in linked, f"orphan: {name}"
        for field in ("intent_statement", "objective_id", "outcome", "supersedes"):
            assert entry[field] is not None and entry[field] != "", f"empty IOO: {name}"
        assert entry["objective_id"] == DISPATCH and entry["dispatch_id"] == DISPATCH
        assert entry["caps_grade"] == "pending" and entry["ck_stamp"] == "pending"
        data = path.read_bytes()
        assert entry["lines"] == (0 if path.suffix in (".png", ".pdf") else len(data.splitlines())), f"stale line count: {name}"
        if path.suffix not in (".png", ".pdf"):
            declared.update((name, verb, target) for verb, target in header_edges(path))
        if name not in base_paths:
            header_path = path.with_name(path.name + ".cgrf.yaml") if path.suffix in (".json", ".png", ".pdf") else path
            header = header_path.read_text()
            assert header_fields(header_path).get("File") == str(header_path.relative_to(ROOT)), f"missing header: {name}"
            assert "Citadel Nexus Inc." in header and DISPATCH in header and SRS in header
    assert actual == declared, "vectors disagree with CGRF relationship declarations"
    for edge in groups["B"]:
        assert edge["dispatch_id"] == DISPATCH and edge["created_by"] == "BITS-CODEGEN"
        assert 0 <= edge["weight"] <= 1
    for event in groups["C"]:
        assert event["dispatch_id"] == DISPATCH
        assert datetime.fromisoformat(event["timestamp"]).tzinfo is not None, "timestamp needs timezone"
        assert event["commit_sha"] is None or re.fullmatch(r"[0-9a-f]{40}", event["commit_sha"])
    print(f"PASS: {len(groups['A'])} file vectors, {len(groups['B'])} edges, {len(groups['C'])} events; IOO complete; no orphans.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
