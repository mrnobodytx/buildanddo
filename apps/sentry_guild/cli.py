# ─── CGRF Header ──────────────────────────────
# File:        apps/sentry_guild/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/sentry_guild/scrub.py, apps/sentry_guild/seer.py, apps/sentry_guild/lessons.py, apps/sentry_guild/verify.py, apps/sentry_guild/handoff.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/sentry_guild/handoff.py
# DAG Node:    none
# Intent:      Scrub events, fold Seer deliveries and write verified handoffs from local JSON files.
# ─────────────────────────────────────────────────────────────

"""Command line for the Sentry guild.

    python -m apps.sentry_guild scrub   --event event.json
    python -m apps.sentry_guild runs    --deliveries deliveries.json --output out/
    python -m apps.sentry_guild verify  --metrics metrics.json

``runs`` reads a JSON list of Seer deliveries (or a JSON-lines file), folds them into runs
and writes one handoff JSON and Markdown file per run. When ``--metrics`` is given as a
JSON object keyed by group id with ``before``, ``after``, ``threshold`` and ``evidence``,
the matching lesson is verified and promoted. Inputs are local files only. Exit status is
0 on success, 1 when an event is dropped or a fix is not recovered, and 2 on bad input.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from apps.sentry_guild import handoff, lessons, seer, verify
from apps.sentry_guild.scrub import scrub_event

MAX_INPUT = 4 * 1024 * 1024


def _load(path: str) -> Any:
    file = Path(path)
    if not file.is_file() or file.stat().st_size > MAX_INPUT:
        raise ValueError(f"unreadable or oversized input: {path}")
    text = file.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return [json.loads(line) for line in text.splitlines() if line.strip()]


def _scrub(args: argparse.Namespace) -> int:
    clean = scrub_event(_load(args.event))
    print(json.dumps({"dropped": clean is None, "event": clean}, indent=2, sort_keys=True))
    return 1 if clean is None else 0


def _verdict(spec: dict[str, Any]) -> verify.Verdict:
    return verify.assess(spec.get("before") or [], spec.get("after") or [], float(spec["threshold"]))


def _runs(args: argparse.Namespace) -> int:
    deliveries = _load(args.deliveries)
    if not isinstance(deliveries, list):
        raise ValueError("deliveries must be a JSON list")
    metrics = _load(args.metrics) if args.metrics else {}
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    status = 0
    summary = []
    for run in seer.fold(seer.parse(item) for item in deliveries).values():
        lesson = lessons.from_run(run) if run.root_cause is not None else None
        spec = metrics.get(run.group_id)
        verdict = _verdict(spec) if spec else None
        if lesson and verdict:
            lesson = lessons.promote(lesson, verdict.verdict, str(spec.get("evidence") or ""))
            status = status or (0 if verdict.verdict == "RECOVERED" else 1)
        data = handoff.record(run, lesson, verdict)
        stem = out / f"sentry-guild-{run.group_id}-{run.run_id}"
        stem.with_suffix(".json").write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        stem.with_suffix(".md").write_text(handoff.markdown(data), encoding="utf-8")
        summary.append({"run_id": run.run_id, "stage": run.stage, "label": lesson.label if lesson else None})
    print(json.dumps({"runs": summary}, indent=2))
    return status


def _verify(args: argparse.Namespace) -> int:
    results = {group: vars(_verdict(spec)) for group, spec in _load(args.metrics).items()}
    print(json.dumps(results, indent=2, sort_keys=True))
    return 0 if all(r["verdict"] == "RECOVERED" for r in results.values()) else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="apps.sentry_guild")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("scrub")
    p.add_argument("--event", required=True)
    p.set_defaults(func=_scrub)
    p = sub.add_parser("runs")
    p.add_argument("--deliveries", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--metrics")
    p.set_defaults(func=_runs)
    p = sub.add_parser("verify")
    p.add_argument("--metrics", required=True)
    p.set_defaults(func=_verify)
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (ValueError, KeyError, TypeError, seer.SeerError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 2
