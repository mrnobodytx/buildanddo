#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        tools/day21/day21_architecture_snapshot.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .gitlab/ci/day21-submission.yml, scripts/ci/hostinger_readiness.py
# EnumType:    Service
# EnumEdges:   CONSUMES .gitlab/ci/day21-submission.yml; CONSUMES scripts/ci/hostinger_readiness.py
# Intent:      Describe source-declared architecture and GitLab execution without promoting configuration into runtime evidence.
# ───────────────────────────────────────────────────────────────
"""Generate a source-observed BuildAndDo architecture snapshot for submission."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

COMPONENTS = [
    ("Public React/Vite site", "apps/web/src/App.jsx"),
    ("Challenge intake", "apps/web/src/pages/HomePage.jsx"),
    ("PocketBase backend", "apps/pocketbase"),
    ("Mission suite", "apps/mission_suite"),
    ("Evidence fabric", "services/praxis_evidence"),
    ("Semantic twin", "libs/semantic_twin"),
    ("Hostinger readiness", "scripts/ci/hostinger_readiness.py"),
    ("Verified replay", "scripts/ci/hostinger_replay.py"),
    ("Private GitLab intake", ".gitlab-ci.yml"),
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compile_snapshot(repo: Path, output: Path) -> dict[str, object]:
    observed_at = datetime.now(timezone.utc).isoformat()
    components = []
    missing = []
    for name, rel in COMPONENTS:
        path = repo / rel
        state = "PRESENT" if path.exists() else "ABSENT"
        components.append({"name": name, "path": rel, "state": state})
        if state == "ABSENT":
            missing.append(rel)
    if missing:
        raise RuntimeError("architecture source paths missing: " + ", ".join(missing))
    output.mkdir(parents=True, exist_ok=True)
    mermaid = """flowchart LR
    U[Small-business operator] --> WEB[BuildAndDo public React/Vite site]
    WEB --> PB[PocketBase auth + workspace state]
    PB --> SIG[Signals / challenge intake]
    SIG --> MIS[Bounded mission]
    MIS --> WF[Workflow / authorized executor boundary]
    WF --> EV[Evidence + independent verification]
    EV --> OP[Operator readback / Daily Edition]
    CI[GitHub public source / collaboration] --> GL[GitLab CI / acceptance / release evidence]
    GL --> VPS[Hostinger VPS runtime]
    HOST[Hostinger Web Hosting / AI Builder / Agent] --> WEB
    VPS --> OBS[Datadog / PostHog / operational receipts]
    OBS --> EV
"""
    diagram = output / "architecture.mmd"
    diagram.write_text(mermaid, encoding="utf-8")
    data = {
        "schema": "buildanddo.day21-architecture-snapshot/v1",
        "observed_at": observed_at,
        "epistemic_state": "SOURCE_OBSERVED",
        "components": components,
        "runtime_claim": "UNMEASURED_BY_THIS_TOOL",
        "note": "The diagram maps source-declared components. Runtime acceptance is supplied separately.",
    }
    data_path = output / "architecture-data.json"
    data_path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md = output / "architecture.md"
    md.write_text(
        "# BuildAndDo challenge architecture\n\n"
        "```mermaid\n" + mermaid + "```\n\n"
        "## Evidence boundary\n\n"
        "This diagram is compiled from repository structure and is labelled SOURCE_OBSERVED. It does not claim that every external integration is live. Runtime proof comes from the separate acceptance, browser, replay, and Hostinger-product receipts.\n",
        encoding="utf-8",
    )
    wrapper = {
        "schema": "buildanddo.day21-architecture/v1",
        "title": "BuildAndDo source-observed architecture",
        "evidence": [
            {"path": "artifacts/architecture.mmd", "sha256": sha(diagram), "observed_at": observed_at},
            {"path": "artifacts/architecture-data.json", "sha256": sha(data_path), "observed_at": observed_at},
            {"path": "artifacts/architecture.md", "sha256": sha(md), "observed_at": observed_at},
        ],
    }
    return {"data": data, "wrapper": wrapper}


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo", type=Path, default=Path.cwd())
    p.add_argument("--evidence", type=Path, default=Path("state/day21/evidence"))
    args = p.parse_args(argv)
    root = args.repo.resolve()
    evidence = args.evidence if args.evidence.is_absolute() else root / args.evidence
    try:
        result = compile_snapshot(root, evidence / "artifacts")
        (evidence / "architecture.json").write_text(json.dumps(result["wrapper"], indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print("PASS architecture snapshot: source-observed")
        return 0
    except (OSError, RuntimeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
