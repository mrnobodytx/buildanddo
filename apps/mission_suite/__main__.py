# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/mission_suite/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/mission_suite/worker.py, apps/mission_suite/bundle.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/mission_suite/worker.py; DEPENDS_ON apps/mission_suite/bundle.py
# DAG Node:    none
# Intent:      Expose packaging, local replay and explicit worker startup through one portable command.
# ───────────────────────────────────────────────────────────────

"""Package, inspect, replay or explicitly run the BuildAndDo mission suite."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
from pathlib import Path
from typing import cast

from apps.mission_suite.bundle import package, source_fingerprint, source_manifest
from apps.mission_suite.engine import replay, run_suite
from apps.mission_suite.worker import EventFormatter, configured, logger
from apps.research.contracts import ResearchError


def main() -> int:
    """Execute only the explicitly selected local or worker operation."""
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("identity")
    sub.add_parser("doctor")
    bundler = sub.add_parser("package")
    bundler.add_argument("output", type=Path)
    analysis = sub.add_parser("analyze")
    analysis.add_argument("input", type=Path)
    rerun = sub.add_parser("replay")
    rerun.add_argument("input", type=Path)
    rerun.add_argument("expected", type=Path)
    consumer = sub.add_parser("worker")
    consumer.add_argument("--once", action="store_true")
    args = parser.parse_args()
    handler = logging.StreamHandler()
    handler.setFormatter(EventFormatter())
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    try:
        if args.command == "identity":
            print(
                json.dumps(
                    {"source_sha256": source_fingerprint(), **source_manifest()},
                    sort_keys=True,
                )
            )
        elif args.command == "package":
            print(json.dumps(package(args.output), sort_keys=True))
        elif args.command == "analyze":
            print(json.dumps(run_suite(args.input.read_text()), sort_keys=True))
        elif args.command == "replay":
            result = replay(
                args.input.read_text(),
                cast(dict[str, object], json.loads(args.expected.read_text())),
            )
            print(json.dumps(result, sort_keys=True))
            return 0 if result["state"] == "MATCH" else 1
        else:
            worker = configured(os.environ)
            if args.command == "doctor":
                print(
                    json.dumps(
                        {
                            "configuration": "PRESENT",
                            "source_sha256": worker.source_sha256,
                            "native_auth": "UNVERIFIED",
                            "api_health": "UNVERIFIED",
                            "activation": "NOT_ATTEMPTED",
                        }
                    )
                )
                return 0

            async def consume() -> int:
                try:
                    while True:
                        try:
                            await worker.once()
                        except ResearchError as error:
                            logger.warning(
                                "suite.worker.unavailable",
                                extra={"reason": error.reason},
                            )
                            if args.once:
                                return 1
                        if args.once:
                            return 0
                        await asyncio.sleep(5)
                finally:
                    await worker.close()

            return asyncio.run(consume())
    except (ResearchError, OSError, ValueError, RecursionError):
        logger.error(
            "suite.operation.blocked", extra={"reason": "configuration_or_input"}
        )
        return 1
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
