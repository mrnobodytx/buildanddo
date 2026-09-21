# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-EVOLUTION-001/verify.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .bits/out/VCC-BUILDANDDO-EVOLUTION-001/validation.json, .bits/out/VCC-BUILDANDDO-EVOLUTION-001/memory.json, .bits/out/VCC-BUILDANDDO-EVOLUTION-001/benchmark.json, .bits/context.lock.json, .bits/hostinger-readiness.lock.json
# EnumType:    Service
# EnumEdges:   VALIDATES .bits/out/VCC-BUILDANDDO-EVOLUTION-001/validation.json; VALIDATES .bits/out/VCC-BUILDANDDO-EVOLUTION-001/memory.json; VALIDATES .bits/out/VCC-BUILDANDDO-EVOLUTION-001/benchmark.json; CONSUMES .bits/context.lock.json; CONSUMES .bits/hostinger-readiness.lock.json
# Intent:      Recheck exact source and log bindings, historical denominators and dispatch memory integrity.
# ───────────────────────────────────────────────────────────────

"""Verify retained source-test evidence without granting runtime standing."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).resolve().parent
DISPATCH = "VCC-BUILDANDDO-EVOLUTION-001"
SRS = "SRS-BUILDANDDO-EVOLUTION-001"
sys.path.insert(0, str(ROOT))

from libs.evolution.benchmark import BenchmarkReport, compare_epochs  # noqa: E402
from libs.evolution.common import json_value, mapping, read_json  # noqa: E402
from libs.semantic_twin.contracts import require  # noqa: E402


def header(path: Path) -> dict[str, str]:
    """Read the declared CGRF fields without interpreting file contents."""
    values: dict[str, str] = {}
    for line in path.read_text().splitlines()[:30]:
        found = re.match(
            r"^# (File|Stage|Owner|Intent|EnumEdges|Depends|EnumType):\s*(.*)", line
        )
        if found:
            values[found[1]] = found[2]
    return values


def file_at(name: str) -> Path:
    """Require a retained repository file inside the current root."""
    path = (ROOT / name).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), f"missing artifact: {name}")
    return path


def check_prefixes(names: tuple[str, ...]) -> None:
    """Reject credential prefixes without displaying captured values."""
    prefixes = (
        "KP" + "-",
        "glpat" + "-",
        "sk_" + "live_",
        "cf" + "ut_",
        "gh" + "p_",
        "gh" + "s_",
        "ey" + "J",
        "AK" + "IA",
        "xo" + "x",
    )
    for name in names:
        data = file_at(name).read_bytes()
        require(
            not any(prefix.encode() in data for prefix in prefixes),
            f"credential prefix detected in changed file: {name}",
        )


def main() -> int:
    """Check source fingerprints, measurements, headers and three-type memory."""
    validation = json.loads((OUTPUT / "validation.json").read_text())
    for name, expected in validation["source_files"].items():
        require(
            hashlib.sha256(file_at(name).read_bytes()).hexdigest() == expected,
            f"source changed after validation: {name}",
        )
    for check in validation["checks"]:
        require(
            hashlib.sha256(check["output"].encode()).hexdigest()
            == check["output_sha256"],
            f"log changed: {check['name']}",
        )
        require(check["exit_code"] == 0, f"failed retained check: {check['name']}")
        require(
            datetime.fromisoformat(check["finished_at"]).tzinfo is not None,
            "check timestamp needs timezone",
        )
    for name, row in validation["coverage"]["files"].items():
        require(row["total"] > 0 and row["covered"] <= row["total"], "invalid coverage")
        require(
            row["covered"] / row["total"] >= 0.8, f"coverage below 80 percent: {name}"
        )

    bundle = mapping(read_json(OUTPUT / "benchmark.json"))
    reports = tuple(
        BenchmarkReport.from_dict(mapping(item)) for item in bundle["reports"]
    )
    require(
        len(reports) == 2 and all(len(report.cases) == 100 for report in reports),
        "historical corpus count changed",
    )
    require(
        [json_value(report.summary()) for report in reports]
        == validation["benchmark"]["summaries"],
        "retained benchmark summary changed",
    )
    require(
        compare_epochs(*reports) == validation["benchmark"]["delta"],
        "retained chronological comparison changed",
    )
    require(
        all(report.summary()["reviewed_outcomes"] == 0 for report in reports),
        "unobserved historical truth was added",
    )

    memory = json.loads((OUTPUT / "memory.json").read_text())
    vectors, summary = memory["vectors"], memory["summary"]
    check_prefixes(
        tuple(entry["file_path"] for entry in vectors if entry["type"] == "A")
    )
    require(list(memory)[-1] == "summary", "memory summary must be last")
    groups = {
        kind: [entry for entry in vectors if entry["type"] == kind] for kind in "ABC"
    }
    require(
        sum(map(len, groups.values())) == len(vectors), "unknown memory vector type"
    )
    for kind in "ABC":
        require(
            summary[f"type_{kind.lower()}_count"] == len(groups[kind]),
            "vector count changed",
        )
    require(
        summary["dispatch_id"] == DISPATCH and summary["srs_codes"] == [SRS],
        "memory scope changed",
    )
    require(
        summary["ioo_compliance"] is True and summary["dkg_orphans"] == 0,
        "invalid memory integrity claim",
    )
    actual = {(e["source"], e["edge_type"], e["target"]) for e in groups["B"]}
    linked = {endpoint for source, _, target in actual for endpoint in (source, target)}
    declared = set()
    names = set()
    for entry in groups["A"]:
        name = entry["file_path"]
        require(
            name not in names and name in linked, f"duplicate or orphan file: {name}"
        )
        names.add(name)
        path = file_at(name)
        require(
            entry["lines"] == len(path.read_bytes().splitlines()),
            f"line count changed: {name}",
        )
        require(
            entry["objective_id"] == DISPATCH and entry["dispatch_id"] == DISPATCH,
            "wrong file-vector dispatch",
        )
        require(
            all(
                entry[k] is not None and entry[k] != ""
                for k in ("intent_statement", "objective_id", "outcome", "supersedes")
            ),
            "missing intent, objective or outcome",
        )
        require(
            entry["caps_grade"] == entry["ck_stamp"] == "pending",
            "uncomputed grade claim",
        )
        fields = header(path)
        for part in fields.get("EnumEdges", "").split(";"):
            if part.strip():
                verb, target = part.strip().split(" ", 1)
                declared.add((name, verb, target))
        if entry["authored_in_dispatch"]:
            own_header = (
                header(path.with_name(path.name + ".cgrf.yaml"))
                if path.suffix == ".json"
                else fields
            )
            require(
                own_header.get("Owner") == "Citadel Nexus Inc.",
                f"missing CGRF owner: {name}",
            )
            require(
                own_header.get("File")
                == name + (".cgrf.yaml" if path.suffix == ".json" else ""),
                f"missing CGRF identity: {name}",
            )
    require(actual == declared, "memory edges disagree with CGRF declarations")
    for edge in groups["B"]:
        require(
            edge["dispatch_id"] == DISPATCH and edge["created_by"] == "BITS-CODEGEN",
            "wrong edge provenance",
        )
    for event in groups["C"]:
        require(event["dispatch_id"] == DISPATCH, "wrong event dispatch")
        require(
            datetime.fromisoformat(event["timestamp"]).tzinfo is not None,
            "memory timestamp needs timezone",
        )
        require(
            event["commit_sha"] is None,
            "this source report records observations, not commits",
        )
    print(
        f"PASS: {len(validation['checks'])} retained checks; source hashes and benchmark epochs match; "
        f"{len(groups['A'])} files, {len(groups['B'])} edges, {len(groups['C'])} events; no orphans."
    )
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--secret-scan"]:
        payload = json.loads((OUTPUT / "memory.json").read_text())
        names = tuple(
            entry["file_path"] for entry in payload["vectors"] if entry["type"] == "A"
        )
        check_prefixes(names)
        print(f"PASS: {len(names)} changed files; no credential prefixes detected.")
    else:
        raise SystemExit(main())
