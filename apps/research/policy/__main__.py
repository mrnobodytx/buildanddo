# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/policy/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/research/policy/pipeline.py, apps/research/policy/demo.py, apps/mission_suite/engine.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES apps/research/policy/pipeline.py; CONSUMES apps/research/policy/demo.py; CONSUMES apps/mission_suite/engine.py
# DAG Node:    none
# Intent:      Compile portable policy review artifacts from retained research excerpts without starting services, contacting sources or sending alerts.
# ───────────────────────────────────────────────────────────────

"""Compile a policy review pack with no network or external effects."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
import hashlib
from pathlib import Path
import sys

from apps.mission_suite.engine import decode
from apps.research.contracts import Parsed, ResearchError
from apps.research.policy.contracts import (
    MAX_PACKET,
    bounded,
    canonical,
    instant,
    record,
    reject,
    rows,
    tenant,
    watch,
)
from apps.research.policy.demo import demo_packet
from apps.research.policy.pipeline import (
    Packet,
    brief_text,
    make_packet,
    normalize,
    project,
)
from typing import cast


def compile_input(raw: str) -> Packet:
    """Normalize exact saved research results and operator-supplied annotations."""
    value = record(decode(raw), ("tenant_id", "as_of", "observations", "watches"))
    tenant_id = tenant(value["tenant_id"])
    observations = []
    for item in rows(value["observations"], 100):
        row = record(item, ("parsed", "annotations", "observed_at", "research_id"))
        parsed = record(
            row["parsed"],
            ("text", "citations", "processor", "version", "input_sha256", "truncated"),
        )
        observations.append(
            normalize(
                cast(Parsed, parsed),
                row["annotations"],
                tenant_id=tenant_id,
                observed_at=instant(row["observed_at"]),
                research_id=bounded(row["research_id"], 64, empty=True),
            )
        )
    return make_packet(
        tenant_id=tenant_id,
        mode="research",
        as_of=instant(value["as_of"]),
        observations=observations,
        watches=[watch(item) for item in rows(value["watches"], 20)],
    )


def write_bundle(packet: Packet, output: Path) -> None:
    """Write a new review directory and refuse to replace an existing artifact."""
    data = {
        "policy.json": canonical(packet.to_dict()) + b"\n",
        "projection.json": canonical(project(packet)) + b"\n",
        "brief.txt": brief_text(packet).encode(),
    }
    manifest = {
        "schema_version": "citadel.policy-artifacts.v1",
        "tenant_id": packet.tenant_id,
        "mode": packet.mode,
        "verification": "unreviewed",
        "files": {
            name: hashlib.sha256(content).hexdigest() for name, content in data.items()
        },
    }
    # Exclusive creation preserves both an earlier run and an operator's files.
    output.mkdir(exist_ok=False)
    for name, content in data.items():
        with (output / name).open("xb") as target:
            target.write(content)
    with (output / "manifest.json").open("xb") as target:
        target.write(canonical(manifest) + b"\n")


def main(argv: Sequence[str] | None = None) -> int:
    """Compile local observations or the labelled demonstration dataset."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("demo", "compile"))
    parser.add_argument("--input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if (args.command == "compile") != (args.input is not None):
            reject()
        if args.command == "demo":
            packet = demo_packet()
        else:
            with args.input.open("rb") as stream:
                raw = stream.read(MAX_PACKET + 1)
            if len(raw) > MAX_PACKET:
                reject("too_large")
            packet = compile_input(raw.decode("utf-8"))
        write_bundle(packet, args.output)
    except (OSError, UnicodeError, ResearchError) as error:
        code = error.reason if isinstance(error, ResearchError) else "local_io_failed"
        print("FAIL: policy pack " + code, file=sys.stderr)
        return 2
    print(
        "PASS: policy review pack written; source verification and delivery remain unperformed."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
