# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001/verify.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEVELOPMENT-LOOP-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/development.py, .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001/validation.json, .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001/dogfood.json, .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001/memory.json
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/development.py; VALIDATES .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001/validation.json; VALIDATES .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001/dogfood.json; VALIDATES .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001/memory.json
# Intent:      Check exact source and retained experimental evidence without elevating artifact consistency to independent qualification.
# ───────────────────────────────────────────────────────────────

"""Check this dispatch's evidence or reproduce standard-library line coverage."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import trace
import unittest
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).resolve().parent
MODULES = (
    "libs/evolution/development_sources.py",
    "libs/evolution/intelligence.py",
    "libs/evolution/development.py",
)
sys.path.insert(0, str(ROOT))


def checked_file(relative: str) -> Path:
    """Resolve an actual repository file without following an escaping symlink."""
    path = ROOT / relative
    if (
        not path.is_file()
        or path.is_symlink()
        or not path.resolve().is_relative_to(ROOT)
    ):
        raise ValueError("missing or unsafe evidence file: " + relative)
    return path


def sha256(raw: bytes) -> str:
    """Hash the exact retained bytes."""
    return hashlib.sha256(raw).hexdigest()


def secret_scan(paths: tuple[str, ...]) -> None:
    """Reject credential prefixes without printing any matching content."""
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
    for name in paths:
        raw = checked_file(name).read_bytes()
        if any(marker.encode() in raw for marker in markers):
            raise ValueError("credential prefix in changed file: " + name)


def coverage(output: Path) -> int:
    """Count executable module lines while importing and running the complete new suite."""
    if output.exists():
        raise ValueError("choose a new coverage output")
    tracer = trace.Trace(
        count=True, trace=False, ignoredirs=(sys.prefix, sys.exec_prefix)
    )

    def run_suite() -> unittest.TestResult:
        suite = unittest.defaultTestLoader.discover(
            str(ROOT / "tests/upgrade"), pattern="test_development*.py"
        )
        return unittest.TextTestRunner(verbosity=2).run(suite)

    started = datetime.now(timezone.utc)
    result = tracer.runfunc(run_suite)
    counts = tracer.results().counts
    rows: dict[str, dict[str, Any]] = {}
    find_executable = cast(
        Callable[[str], dict[int, int]], getattr(trace, "_find_executable_linenos")
    )
    for name in MODULES:
        path = checked_file(name)
        executable = {line for line in find_executable(str(path)) if line > 0}
        hits = {
            line
            for (filename, line), count in counts.items()
            if count and Path(filename).resolve() == path and line in executable
        }
        rows[name] = {
            "sha256": sha256(path.read_bytes()),
            "covered": len(hits),
            "executable": len(executable),
            "percent": round(100 * len(hits) / len(executable), 2),
            "missing": sorted(executable - hits),
        }
    document = {
        "method": "Python stdlib trace executable lines; not branch coverage",
        "started_at": started.isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "tests_run": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "skipped": len(result.skipped),
        "files": rows,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(document, indent=2) + "\n")
    print(json.dumps(document, indent=2))
    return (
        0
        if result.wasSuccessful()
        and not result.skipped
        and all(row["covered"] / row["executable"] >= 0.8 for row in rows.values())
        else 1
    )


def validate(*, scan_only: bool) -> None:
    """Reconstruct the prediction and check evidence integrity, source and governance."""
    from libs.evolution.candidate import Rule
    from libs.evolution.common import digest, mapping, read_json, timestamp
    from libs.evolution.compiler import DecisionInput
    from libs.evolution.development import (
        FrozenPrediction,
        MeasuredTestRun,
        source_bytes,
        test_graph,
    )
    from libs.evolution.promotion import PromotionPolicy
    from libs.semantic_twin.contracts import require
    from libs.semantic_twin.identity import SemanticId
    from libs.semantic_twin.merkle import ContentDigest

    validation = json.loads((OUTPUT / "validation.json").read_text())
    paths = tuple(validation["changed_files"])
    secret_scan(paths)
    if scan_only:
        print(f"PASS: {len(paths)} changed files; no credential prefixes detected.")
        return
    for name, expected in validation["source_files"].items():
        require(
            sha256(checked_file(name).read_bytes()) == expected,
            "changed evidence source: " + name,
        )
    for row in validation["checks"]:
        require(
            sha256(row["output"].encode()) == row["output_sha256"],
            "changed retained check log",
        )
        require(
            row["exit_code"] == row["expected_exit_code"],
            "unexpected retained check result",
        )
        timestamp(row["captured_at"])
        if row.get("started_at") is not None:
            require(
                timestamp(row["started_at"]) <= timestamp(row["completed_at"]),
                "reversed check time",
            )
    for name, row in validation["coverage"]["files"].items():
        require(
            sha256(checked_file(name).read_bytes()) == row["sha256"],
            "coverage source changed",
        )
        require(
            0 < row["executable"] and 0 <= row["covered"] <= row["executable"],
            "invalid coverage",
        )
        require(
            row["covered"] / row["executable"] >= 0.8, "coverage below dispatch gate"
        )

    dogfood = mapping(read_json(OUTPUT / "dogfood.json"))
    captured = mapping(dogfood["prediction"])
    observation = mapping(captured["observation"])
    graph = test_graph(
        source_bytes(ROOT),
        scope_id=str(dogfood["scope_id"]),
        source_sha=str(dogfood["source_sha"]),
        at=timestamp(observation["decision_at"]),
    )
    require(
        graph.root.value == captured["context_root"], "dogfood graph source changed"
    )
    require(
        len(graph.objects) == captured["graph_objects"],
        "dogfood object inventory changed",
    )
    observation["graph"] = graph.to_dict()
    prediction = FrozenPrediction.from_dict(
        {
            "observation": DecisionInput.from_dict(observation).to_dict(),
            "rule": Rule.from_dict(mapping(captured["rule"])).to_dict(),
            "actor_id": str(captured["actor_id"]),
            "mission_id": captured["mission_id"],
            "file_digests": captured["file_digests"],
        }
    )
    for path, fingerprint in prediction.file_digests.items():
        require(
            sha256(checked_file(path).read_bytes()) == fingerprint,
            "dogfood source changed: " + path,
        )
    require(
        str(prediction.prediction_id) == captured["id"], "dogfood prediction changed"
    )
    run = MeasuredTestRun.from_dict(mapping(dogfood["run"]))
    require(
        str(run.run_id) == dogfood["run_id"] and run.status == "PASS",
        "dogfood execution changed",
    )
    require(
        run.prediction_id == SemanticId(str(captured["id"])),
        "run names another prediction",
    )
    require(run.source_sha == dogfood["source_sha"], "dogfood revision mismatch")
    require(
        run.source_digest == ContentDigest(digest(prediction.file_digests)),
        "run source digest mismatch",
    )
    require(
        run.selected_tests == prediction.selected_tests,
        "execution differs from prediction",
    )
    require(
        run.started_at >= prediction.observation.decision_at,
        "execution preceded prediction",
    )
    commands = dogfood["commands"]
    require(isinstance(commands, list), "missing dogfood command records")
    assert isinstance(commands, list)
    for raw_command in commands:
        command = mapping(raw_command)
        command_output = command["output"]
        require(isinstance(command_output, str), "missing dogfood command output")
        assert isinstance(command_output, str)
        require(command["exit_code"] == 0, "retained dogfood command failed")
        require(
            sha256(command_output.encode()) == command["output_sha256"],
            "changed dogfood log",
        )
    qualification = mapping(dogfood["qualification"])
    require(
        qualification["state"] == "HOLD" and qualification["route"] == "UNRESOLVED",
        "unsupported competence claim",
    )
    require(
        all(
            qualification[key] == 0
            for key in (
                "independently_graded_pairs",
                "discovered_candidates",
                "registered_capabilities",
            )
        ),
        "unsupported independent evidence",
    )
    require(
        qualification["policy"] == PromotionPolicy().to_dict(),
        "promotion policy was weakened",
    )
    require(dogfood["external_writes"] == 0, "unsupported external effects")

    memory = json.loads((OUTPUT / "memory.json").read_text())
    vectors = memory["vectors"]
    files = [v for v in vectors if v["type"] == "A"]
    edges = [v for v in vectors if v["type"] == "B"]
    events = [v for v in vectors if v["type"] == "C"]
    require(
        {v["file_path"] for v in files} == set(paths), "memory file inventory mismatch"
    )
    endpoints = {v[key] for v in edges for key in ("source", "target")}
    for entry in files:
        require(entry["file_path"] in endpoints, "orphan metadata vector")
        require(
            all(
                entry[key] not in (None, "")
                for key in ("intent_statement", "objective_id", "outcome", "supersedes")
            ),
            "missing IOO metadata",
        )
        require(
            entry["lines"]
            == len(checked_file(entry["file_path"]).read_text().splitlines()),
            "stale line count",
        )
    summary = memory["summary"]
    require(
        (summary["type_a_count"], summary["type_b_count"], summary["type_c_count"])
        == (len(files), len(edges), len(events)),
        "memory totals differ",
    )
    for entry in events:
        timestamp(entry["timestamp"])
    for name in validation["new_files"]:
        header = checked_file(
            name + ".cgrf.yaml" if name.endswith(".json") else name
        ).read_text()
        require(
            "# Owner:       Citadel Nexus Inc." in header
            and "# CK:          pending" in header,
            "missing CGRF header: " + name,
        )
    print(
        "PASS: exact source, actual local experiment, coverage and memory bindings. Real qualification and submission remain HOLD."
    )


def main() -> int:
    """Choose artifact consistency checking or a fresh coverage run."""
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--coverage", type=Path)
    mode.add_argument("--secret-scan", action="store_true")
    options = parser.parse_args()
    if options.coverage:
        return coverage(options.coverage)
    validate(scan_only=options.secret_scan)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
