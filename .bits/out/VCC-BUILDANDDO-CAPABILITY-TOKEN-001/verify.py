# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-CAPABILITY-TOKEN-001/verify.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/models.py, libs/capability_tokens/conformance.py, libs/semantic_twin/ingestion/source.py
# EnumType:    Test
# EnumEdges:   DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/conformance.py; DEPENDS_ON libs/semantic_twin/ingestion/source.py
# Intent:      Keep source claims and governance memory reproducible without upgrading absent runtime evidence.
# ───────────────────────────────────────────────────────────────

"""Verify retained local evidence and governance without inventing operational acceptance."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from libs.capability_tokens.conformance import ConformanceReport
from libs.capability_tokens.models import TokenBundle, content_hash
from libs.evolution.compiler import GraphSnapshot
from libs.semantic_twin.contracts import require
from libs.semantic_twin.ingestion.source import ingest_release_source

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).resolve().parent


def checked_file(relative: str) -> Path:
    """Require an actual repository file without following outside symlinks."""
    path = ROOT / relative
    require(
        path.is_file()
        and not path.is_symlink()
        and path.resolve().is_relative_to(ROOT),
        "missing or unsafe evidence file",
    )
    return path


def prefixes(names: tuple[str, ...]) -> None:
    """Check changed content without printing potential credential values."""
    markers = (
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
        data = checked_file(name).read_bytes()
        require(
            not any(value.encode() in data for value in markers),
            "credential prefix detected in changed file: " + name,
        )


def main() -> int:
    """Check exact source, outputs, coverage, real public-source capture and memory lineage."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--secret-scan", action="store_true")
    args = parser.parse_args()
    validation = json.loads((OUTPUT / "validation.json").read_text())
    paths = tuple(validation["changed_files"])
    prefixes(paths)
    if args.secret_scan:
        print(f"PASS: {len(paths)} changed files; no credential prefixes detected.")
        return 0
    for name, expected in validation["source_files"].items():
        require(
            hashlib.sha256(checked_file(name).read_bytes()).hexdigest() == expected,
            "source differs from retained validation: " + name,
        )
    for check in validation["checks"]:
        require(
            hashlib.sha256(check["output"].encode()).hexdigest()
            == check["output_sha256"],
            "retained log digest mismatch",
        )
        require(
            check["exit_code"] == check["expected_exit_code"],
            "unexpected retained process outcome",
        )
        require(
            datetime.fromisoformat(check["finished_at"]).tzinfo is not None,
            "undated retained check",
        )
    for name, row in validation["coverage"]["files"].items():
        require(
            0 < row["total"] and 0 <= row["covered"] <= row["total"],
            "invalid measured coverage",
        )
        require(
            row["covered"] / row["total"] >= 0.8,
            "coverage below dispatch gate: " + name,
        )

    summary = json.loads((OUTPUT / "dogfood.json").read_text())
    bundle = TokenBundle.from_json((OUTPUT / "dogfood-bundle.json").read_text())
    require(
        bundle.token.pin.to_dict() == summary["pin"],
        "dogfood manifest identity mismatch",
    )
    report = ConformanceReport.from_dict(summary["conformance"])
    cli_capture = validation["cli_capture"]
    require(
        hashlib.sha256(cli_capture["output"].encode()).hexdigest()
        == cli_capture["output_sha256"],
        "CLI artifact digest mismatch",
    )
    cli_result = json.loads(cli_capture["output"])
    require(
        cli_result["status"] == "HOLD"
        and cli_result["report"] == summary["conformance"],
        "CLI and direct conformance disagree",
    )
    require(
        report.verdict == summary["status"] == "HOLD",
        "independent evidence gap was hidden",
    )
    require(
        summary["registry"]["certifications"] == 0
        and summary["effects_executed"] == summary["funds_moved"] == 0,
        "dogfood claims unsupported effects or certification",
    )
    require(
        sum(c.verdict == "PASS" for c in report.checks) == 6
        and next(c for c in report.checks if c.name == "replay").verdict == "HOLD",
        "dogfood conformance results changed",
    )
    source = checked_file(summary["source_path"])
    require(
        content_hash(source.read_bytes()).value == summary["source_sha256"],
        "dogfood source bytes changed",
    )
    captured = datetime.fromisoformat(summary["captured_at"])
    graph = ingest_release_source(
        source, repository_root=ROOT, commit=summary["source_sha"], observed_at=captured
    )
    snapshot = GraphSnapshot(
        scope_id="public/buildanddo-release",
        source_sha=summary["source_sha"],
        as_of=captured,
        objects=graph.objects,
    )
    require(
        len(graph.objects) == summary["graph_objects"]
        and snapshot.root.value == summary["context_root"],
        "dogfood semantic context changed",
    )
    require(
        bundle.program("graph-v1").compatibility == snapshot.compatibility,
        "dogfood program context mismatch",
    )

    memory = json.loads((OUTPUT / "memory.json").read_text())
    vectors = memory["vectors"]
    a = [v for v in vectors if v["type"] == "A"]
    b = [v for v in vectors if v["type"] == "B"]
    c = [v for v in vectors if v["type"] == "C"]
    require({v["file_path"] for v in a} == set(paths), "file-vector inventory mismatch")
    endpoints = {v[key] for v in b for key in ("source", "target")}
    for item in a:
        require(item["file_path"] in endpoints, "orphan file vector")
        require(
            all(
                item[k] not in (None, "")
                for k in ("intent_statement", "objective_id", "outcome", "supersedes")
            ),
            "missing IOO",
        )
        require(
            item["lines"]
            == len(checked_file(item["file_path"]).read_text().splitlines()),
            "file-vector length mismatch",
        )
    for name in validation["new_files"]:
        path = checked_file(name)
        header = checked_file(name + ".cgrf.yaml") if path.suffix == ".json" else path
        text = header.read_text()
        require(
            "# Owner:       Citadel Nexus Inc." in text
            and "# CK:          pending" in text
            and "# CAPS:        pending" in text
            and "SRS-BUILDANDDO-CAPABILITY-TOKEN-001" in text,
            "new artifact lacks its governance header",
        )
        require(
            re.search(
                r"^# File:\s+" + re.escape(header.relative_to(ROOT).as_posix()) + "$",
                text,
                re.M,
            )
            is not None,
            "header file identity mismatch",
        )
        declared = re.search(r"^# EnumEdges:\s*(.*)$", text, re.M)
        require(declared is not None, "header lacks relationships")
        assert declared is not None
        for edge in declared.group(1).split(";"):
            verb, target = edge.strip().split(" ", 1)
            require(
                any(
                    row["source"] == header.relative_to(ROOT).as_posix()
                    and row["target"] == target
                    and row["edge_type"] == verb
                    for row in b
                ),
                "memory omits a declared relationship",
            )
    for event in c:
        require(
            datetime.fromisoformat(event["timestamp"]).tzinfo is not None,
            "memory event lacks actual time",
        )
    recorded = memory["summary"]
    require(
        (recorded["type_a_count"], recorded["type_b_count"], recorded["type_c_count"])
        == (len(a), len(b), len(c)),
        "memory counts mismatch",
    )
    print(
        f"PASS: {len(validation['checks'])} retained checks; exact source and 157-object capture; "
        f"{len(a)} files, {len(b)} relationships, {len(c)} events; no orphans. Runtime acceptance remains unmeasured."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
