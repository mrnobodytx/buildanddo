# ─── CGRF Header ──────────────────────────────
# File:        apps/world_twin/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/events.py, apps/world_twin/twin.py, apps/world_twin/projection.py, apps/world_twin/capture.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/world_twin/events.py; DEPENDS_ON apps/world_twin/twin.py; DEPENDS_ON apps/world_twin/projection.py; CONSUMES apps/world_twin/capture.py
# DAG Node:    none
# Intent:      Record events and disputes and print twins, projections and world state from the command line.
# ─────────────────────────────────────────────────────────────

"""Command-line entry point for the personal world twin."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError
from apps.career.ledger import read_chain
from apps.world_twin.capture import ActorBinding, import_mission_capture
from apps.world_twin.events import WorldEvent, record_event
from apps.world_twin.projection import ProjectionScope, SECTIONS, compile_projection, project, world_state
from apps.world_twin.twin import record_dispute, record_resolution
from libs.capability_tokens.verification import ReviewPolicy
from libs.evolution.common import decode_json, digest, mapping, timestamp
from libs.semantic_twin.contracts import ContractError, require
from libs.semantic_twin.receipts import VerificationReceipt


def _input(path: str) -> object:
    """Read a bounded local interchange file without following external references."""
    with Path(path).open("rb") as stream:
        content = stream.read(16 * 1024 * 1024 + 1)
    require(len(content) <= 16 * 1024 * 1024, "world input exceeds size limit")
    return decode_json(content)


def _compile(args: argparse.Namespace) -> dict[str, object]:
    """Compile explicitly selected inputs; neither file is an authorization token."""
    raw = _input(args.events)
    provenance: dict[str, object] | None = None
    if isinstance(raw, dict):
        require(set(raw) == {"schema_version", "events", "captured_at", "content_sha256", "gaps"}
                and raw["schema_version"] == "buildanddo.world-capture/v1", "unsupported world capture")
        provenance = {key: raw[key] for key in ("captured_at", "content_sha256", "gaps")}
        raw = raw["events"]
    require(isinstance(raw, list), "world events must be an array")
    assert isinstance(raw, list)
    events = tuple(WorldEvent.from_dict(mapping(value)) for value in raw)
    scope = ProjectionScope.from_dict(mapping(_input(args.scope)))
    reviews: tuple[VerificationReceipt, ...] = ()
    if args.reviews:
        values = _input(args.reviews)
        require(isinstance(values, list), "reviews must be an array")
        assert isinstance(values, list)
        reviews = tuple(VerificationReceipt.from_dict(mapping(value)) for value in values)
    policy = ReviewPolicy.from_dict(mapping(_input(args.review_policy))) if args.review_policy else None
    result = compile_projection(events, scope, reviews=reviews, review_policy=policy)
    # The private input receipt is useful for operators; never expose its gaps or
    # capture metadata through public/community projections.
    if provenance is not None and scope.audience == "private":
        result["capture_provenance"] = provenance
        result["digest"] = digest({key: value for key, value in result.items() if key != "digest"})
    return result


def main(argv: list[str] | None = None) -> int:
    """Run the CLI; print JSON; return 1 on malformed input."""
    parser = argparse.ArgumentParser(prog="python -m apps.world_twin")
    parser.add_argument("--ledger", help="local prototype ledger; not a canonical world capture")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("schema", help="print the strict world-event/v1 interchange schema")
    imported = sub.add_parser("import-capture", help="convert an existing complete mission export into private observed events")
    imported.add_argument("--capture", required=True)
    imported.add_argument("--tenant", required=True)
    imported.add_argument("--mission", required=True)
    imported.add_argument("--actors", required=True, help="receiving identity bindings, independent of the capture")
    imported.add_argument("--ingested-at")
    compiled = sub.add_parser("compile", help="compile authorized world events into existing semantic graphs and episodes")
    compiled.add_argument("--events", required=True)
    compiled.add_argument("--scope", required=True, help="receiving read/share selection, not an authority grant")
    compiled.add_argument("--reviews")
    compiled.add_argument("--review-policy", help="externally authenticated receipt pins; never obtained from events")
    sub.add_parser("record").add_argument("event", help="event JSON file")
    view = sub.add_parser("twin")
    view.add_argument("subject")
    view.add_argument("--audience", default="private")
    view.add_argument("--share", nargs="*", default=[], choices=SECTIONS)
    view.add_argument("--minor", action="store_true")
    contest = sub.add_parser("dispute")
    for name in ("subject", "inference", "reason", "at"):
        contest.add_argument(f"--{name}", required=True)
    settle = sub.add_parser("resolve")
    for name in ("subject", "inference", "by", "decision", "note", "at"):
        settle.add_argument(f"--{name}", required=True)
    sub.add_parser("world")
    args = parser.parse_args(argv)
    try:
        result: Any
        if args.command == "schema":
            result = WorldEvent.json_schema()
        elif args.command == "import-capture":
            bindings = {key: ActorBinding.from_dict(mapping(value)) for key, value in mapping(_input(args.actors)).items()}
            imported_capture = import_mission_capture(_input(args.capture), tenant_id=args.tenant, mission_id=args.mission,
                actors=bindings, ingested_at=timestamp(args.ingested_at) if args.ingested_at else datetime.now(timezone.utc))
            result = {"schema_version": "buildanddo.world-capture/v1", **imported_capture.to_dict()}
        elif args.command == "compile":
            result = _compile(args)
        else:
            require(bool(args.ledger), "prototype ledger commands require --ledger")
            result = _legacy(args, Path(args.ledger))
    except (CareerError, ContractError, OSError) as error:
        print(json.dumps({"state": "FAIL", "error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, allow_nan=False))
    return 0


def _legacy(args: argparse.Namespace, ledger: Path) -> object:
    """Keep shipped local ledger commands separate from scoped interchange inputs."""
    if args.command == "record":
        try:
            raw = json.loads(Path(args.event).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise CareerError(f"cannot read {args.event}") from error
        return record_event(ledger, raw)
    if args.command == "twin":
        return project(read_chain(ledger), args.subject, args.audience, shared=tuple(args.share), minor=args.minor)
    if args.command == "dispute":
        return record_dispute(ledger, subject=args.subject, inference=args.inference, reason=args.reason, at=args.at)
    if args.command == "resolve":
        return record_resolution(ledger, subject=args.subject, inference=args.inference, by=args.by,
                                 decision=args.decision, note=args.note, at=args.at)
    return world_state(read_chain(ledger))
