# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001/dogfood.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEVELOPMENT-LOOP-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/development.py, libs/evolution/development_sources.py, libs/evolution/candidate.py, libs/evolution/registry.py
# EnumType:    Test
# EnumEdges:   VALIDATES libs/evolution/development.py; VALIDATES libs/evolution/development_sources.py; CONSUMES libs/evolution/candidate.py; CONSUMES libs/evolution/registry.py
# Intent:      Reproduce one actual development observation and source-test experiment while preserving the absence of independent qualification.
# ───────────────────────────────────────────────────────────────

"""Exercise the local CLI using a separately acquired real provider capture."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from libs.evolution.candidate import discover_candidates
from libs.evolution.common import digest, mapping, read_json
from libs.evolution.development import FrozenPrediction, MeasuredTestRun
from libs.evolution.development_sources import GitHubRunCapture
from libs.evolution.loop import refresh_episodes
from libs.evolution.promotion import PromotionPolicy
from libs.evolution.registry import select
from libs.evolution.store import Journal
from libs.semantic_twin.contracts import require

ROOT = Path(__file__).resolve().parents[3]
MODULES = (
    "libs/evolution/development_sources.py",
    "libs/evolution/intelligence.py",
    "libs/evolution/development.py",
)


def main() -> int:
    """Retain a real prediction/run pair without supplying reviewer labels or proofs."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture", type=Path, required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--state", type=Path)
    parser.add_argument("--scope", default="buildanddo/public-development")
    parser.add_argument("--proposed-verifier", required=True)
    options = parser.parse_args()
    output = options.output.resolve()
    require(not output.exists(), "select a new dogfood directory")
    capture = GitHubRunCapture.from_dict(mapping(read_json(options.capture)))
    require(capture.repository == options.repository, "unexpected repository capture")
    output.mkdir(parents=True, exist_ok=False)
    state = options.state or output / "journal.sqlite"
    base = [
        sys.executable,
        "-m",
        "libs.evolution.development",
        "--scope",
        options.scope,
        "--state",
        str(state),
    ]
    commands: list[dict[str, object]] = []

    def execute(name: str, args: list[str]) -> None:
        started = datetime.now(timezone.utc)
        result = subprocess.run(
            [*base, *args],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
            timeout=600,
        )
        log = result.stdout + result.stderr
        (output / (name + ".log")).write_text(log, encoding="utf-8")
        commands.append(
            {
                "name": name,
                "argv": [*base, *args],
                "started_at": started.isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "exit_code": result.returncode,
                "output": log,
                "output_sha256": hashlib.sha256(log.encode()).hexdigest(),
            }
        )
        require(result.returncode == 0, "dogfood step failed; retain its log: " + name)

    changed = [part for path in MODULES for part in ("--changed", path)]
    prediction_path, run_path = output / "prediction.json", output / "test-run.json"
    execute(
        "predict",
        [
            "predict",
            "--root",
            str(ROOT),
            *changed,
            "--mission",
            "VCC-BUILDANDDO-DEVELOPMENT-LOOP-001",
            "--output",
            str(prediction_path),
        ],
    )
    execute(
        "mission",
        [
            "mission-from-run",
            str(prediction_path),
            str(options.capture.resolve()),
            "--repository",
            options.repository,
            "--srs",
            "SRS-BUILDANDDO-DEVELOPMENT-ACCEPTANCE-001",
            "--dispatch",
            "VCC-BUILDANDDO-DEVELOPMENT-ACCEPTANCE-001",
            "--builder",
            "cni://agent/bits-codegen",
            "--verifier",
            options.proposed_verifier,
            "--output",
            str(output / "mission-packet"),
        ],
    )
    execute(
        "test",
        [
            "test",
            str(prediction_path),
            "--root",
            str(ROOT),
            "--output",
            str(run_path),
        ],
    )
    execute("status", ["status"])
    prediction = FrozenPrediction.from_dict(mapping(read_json(prediction_path)))
    measured = MeasuredTestRun.from_dict(mapping(read_json(run_path)))
    packet = mapping(read_json(output / "mission-packet/mission.json"))
    at = datetime.now(timezone.utc)
    with Journal(state, scope_id=options.scope) as journal:
        episodes = refresh_episodes(journal)
        candidates = discover_candidates(
            episodes,
            before=at,
            discovered_at=at,
            compatibility=prediction.observation.graph.compatibility,
            actor_id=prediction.actor_id,
        )
        selection = select(
            journal.records(),
            prediction.observation,
            actor_id=prediction.actor_id,
            observed_at=at,
            mission_id=prediction.mission_id,
        )
        journal.put_events((selection.event,))
        verification_count = sum(e.status == "VERIFIED" for e in episodes)
        registered = len(journal.records())
    require(measured.status == "PASS", "actual source execution did not pass")
    # This dispatch provides no authentic independent receipts or model captures.
    # A real preferred capability would need its own retained receiving review.
    require(
        not candidates
        and verification_count == 0
        and registered == 0
        and selection.proposal is None,
        "qualification evidence differs; inspect it instead of rewriting this report",
    )
    snapshot = prediction.observation.to_dict()
    snapshot.pop("graph")
    summary = {
        "schema_version": "buildanddo.development-dogfood/v1",
        "captured_at": at.isoformat(),
        "scope_id": options.scope,
        "source_sha": prediction.observation.graph.source_sha,
        "source_scope": "Git HEAD context plus separately captured working-tree byte digests; not final candidate acceptance.",
        "provider": {
            "repository": capture.repository,
            "run_id": capture.run_id,
            "attempt": capture.attempt,
            "observed_at": capture.observed_at.isoformat(),
            "source_sha": capture.run["head_sha"],
            "status": capture.run["status"],
            "conclusion": capture.run.get("conclusion"),
            "url": capture.run["html_url"],
            "capture_id": str(capture.capture_id),
            "run_response_sha256": hashlib.sha256(
                capture.run_response.encode()
            ).hexdigest(),
            "jobs_response_sha256": hashlib.sha256(
                capture.jobs_response.encode()
            ).hexdigest()
            if capture.jobs_response is not None
            else None,
            "assurance": "Repository CLI authenticated acquisition; saved bytes do not reauthenticate themselves. No test truth inferred.",
        },
        "prediction": {
            "id": str(prediction.prediction_id),
            "actor_id": str(prediction.actor_id),
            "mission_id": prediction.mission_id,
            "observation": snapshot,
            "rule": prediction.rule.to_dict(),
            "file_digests": dict(prediction.file_digests),
            "context_root": prediction.observation.graph.root.value,
            "graph_objects": len(prediction.observation.graph.objects),
            "source_digest": digest(prediction.file_digests),
            "changed_paths": list(MODULES),
            "selected_tests": list(prediction.selected_tests),
        },
        "run": measured.to_dict(),
        "run_id": str(measured.run_id),
        "mission": {
            "status": packet["status"],
            "authority": packet["authority"],
            "rank": packet["rank"],
            "proposed_verifier": options.proposed_verifier,
            "verifier_assignment": "Proposed receiving seat only; no authenticated review or assignment is implied.",
            "files": {
                p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in sorted((output / "mission-packet").iterdir())
            },
        },
        "qualification": {
            "state": "HOLD",
            "independently_graded_pairs": verification_count,
            "discovered_candidates": len(candidates),
            "registered_capabilities": registered,
            "route": selection.mode.value,
            "reasons": selection.reasons,
            "accuracy": "UNMEASURED",
            "policy": PromotionPolicy().to_dict(),
            "gaps": [
                "independently authenticated reviewer labels and exact receipt pins",
                "repeated successful discovery and disjoint replay/shadow cases",
                "retained teacher predictions and independent TEVV/PromotionProof",
                "known source/schema/SBOM compatibility",
            ],
        },
        "commands": commands,
        "external_writes": 0,
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(
        json.dumps(
            {
                "summary": str(output / "summary.json"),
                "tests": measured.counts.to_dict() if measured.counts else None,
                "qualification": summary["qualification"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
