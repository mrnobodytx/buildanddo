# ─── CGRF Header ──────────────────────────────
# File:        .bits/out/USO-BUILDANDDO-CRAWL-001/verify.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CRAWL-001
# CAPS:        pending
# CK:          pending
# Dispatch:    USO-BUILDANDDO-CRAWL-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     .bits/out/USO-BUILDANDDO-CRAWL-001/memory.json
# EnumType:    Test
# EnumEdges:   DEPENDS_ON .bits/out/USO-BUILDANDDO-CRAWL-001/memory.json; VALIDATES scripts/crawl_check.py; VALIDATES tests/test_crawl_check.py
# DAG Node:    public.crawl.check.memory.verify
# Intent:      Verify memory counts, IOO fields, DKG linkage and source line provenance before review.
# ───────────────────────────────

"""Verify the crawl dispatch memory payload against its recorded files."""

from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[3]
DISPATCH = "USO-BUILDANDDO-CRAWL-001"
SRS = "SRS-BUILDANDDO-CRAWL-001"


def header_edges(path: Path) -> list[tuple[str, str]]:
    """Read EnumSpeak edges from a source file's leading CGRF block."""
    value = ""
    collecting = False
    for line in path.read_text(encoding="utf-8").splitlines():
        text = re.sub(r"^\s*(?://|#)?\s*", "", line).strip()
        if collecting and re.match(r"^\u2500{4,}", text):
            break
        if text.startswith("EnumEdges:"):
            value = text.removeprefix("EnumEdges:").strip()
            collecting = True
        elif collecting and re.match(
            r"^(DAG Node|Intent|File|Stage|SRS|CAPS|CK|Dispatch|Seat|Owner|Created|Depends|EnumType):",
            text,
        ):
            break
        elif collecting and text:
            value += " " + text
    edges: list[tuple[str, str]] = []
    for part in value.split(";"):
        match = re.match(
            r"^(CONSUMES|PRODUCES|VALIDATES|TRIGGERS|GATES|OWNS|DEPENDS_ON|EXTENDS|FIXES|SUPERSEDES|VERIFIED_BY|USES_TEMPLATE)\s+(.+)$",
            part.strip(),
        )
        if match:
            edges.append((match.group(1), match.group(2).strip()))
    return edges


def main() -> int:
    """Validate memory structure, provenance, linkage and current line counts."""
    payload = json.loads(
        Path(__file__).with_name("memory.json").read_text(encoding="utf-8")
    )
    vectors = payload["vectors"]
    groups = {
        kind: [entry for entry in vectors if entry["type"] == kind] for kind in "ABC"
    }
    summary = payload["summary"]
    assert list(payload)[-1] == "summary"
    assert sum(len(group) for group in groups.values()) == len(vectors)
    assert summary == {
        "type_a_count": len(groups["A"]),
        "type_b_count": len(groups["B"]),
        "type_c_count": len(groups["C"]),
        "ioo_compliance": True,
        "dkg_orphans": 0,
        "dispatch_id": DISPATCH,
        "srs_codes": [SRS],
        "seat": "BITS-CODEGEN",
    }
    linked = {edge[field] for edge in groups["B"] for field in ("source", "target")}
    declared: set[tuple[str, str, str]] = set()
    for entry in groups["A"]:
        path = ROOT / entry["file_path"]
        assert path.is_file() and path.resolve().is_relative_to(ROOT)
        assert entry["file_path"] in linked
        assert entry["objective_id"] == DISPATCH and entry["dispatch_id"] == DISPATCH
        assert entry["caps_grade"] == "pending" and entry["ck_stamp"] == "pending"
        for field in ("intent_statement", "objective_id", "outcome", "supersedes"):
            assert entry[field] is not None and entry[field] != ""
        assert entry["lines"] == len(path.read_bytes().splitlines())
        if path.suffix not in {".json"}:
            declared.update(
                (entry["file_path"], verb, target)
                for verb, target in header_edges(path)
            )
    actual = {
        (edge["source"], edge["edge_type"], edge["target"]) for edge in groups["B"]
    }
    assert actual == declared
    for edge in groups["B"]:
        assert edge["dispatch_id"] == DISPATCH and edge["created_by"] == "BITS-CODEGEN"
        assert 0 <= edge["weight"] <= 1
    for event in groups["C"]:
        assert event["dispatch_id"] == DISPATCH
        assert datetime.fromisoformat(event["timestamp"]).tzinfo is not None
    print(
        f"PASS: {len(groups['A'])} file vectors, {len(groups['B'])} edges, {len(groups['C'])} events; IOO complete; no orphans."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
