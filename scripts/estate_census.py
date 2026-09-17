# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/estate_census.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/seal.py, apps/estate/report.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/estate/seal.py; DEPENDS_ON apps/estate/report.py
# DAG Node:    none
# Intent:      Expose local estate compilation and cached views without mutating existing application code or contacting a service.
# ───────────────────────────────────────────────────────────────

"""Compile Citadel Estate Intelligence or inspect its cached local evidence."""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from dataclasses import asdict
from pathlib import Path
import sys

# Source inspection must not create bytecode directories in the scanned estate.
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.estate.common import EstateError, canonical_json  # noqa: E402
from apps.estate.report import (  # noqa: E402
    render_delta, render_module, render_orphans, render_report, render_violations, select_module,
)
from apps.estate.seal import compare_snapshots, compile_estate, load_archive, load_latest, save_snapshot  # noqa: E402


def main(argv: Sequence[str] | None = None) -> int:
    """Run the offline compiler or a source-independent cached projection."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root (default: this repository)")
    views = parser.add_mutually_exclusive_group()
    views.add_argument("--report", action="store_true", help="report from the cached seal")
    views.add_argument("--delta", metavar="SEAL_ID", help="compare an archived seal with the cached latest seal")
    views.add_argument("--module", metavar="MODULE", help="inspect one cached module by name, ID or path")
    views.add_argument("--orphans", action="store_true", help="list cached unreconciled modules")
    views.add_argument("--violations", action="store_true", help="list cached structural defects")
    parser.add_argument("--json", action="store_true", help="emit canonical JSON for the selected view")
    args = parser.parse_args(argv)
    try:
        root = args.root.resolve()
        cached = args.report or args.delta or args.module or args.orphans or args.violations
        document = load_latest(root) if cached else save_snapshot(root, compile_estate(root))
        payload: object
        if args.delta:
            previous = load_archive(root, args.delta)
            delta = compare_snapshots(previous.snapshot, document.snapshot)
            payload, rendered = asdict(delta), render_delta(delta)
        elif args.module:
            payload = asdict(select_module(document.snapshot, args.module))
            rendered = render_module(document.snapshot, args.module)
        elif args.orphans:
            payload = {"orphan_module_ids": document.snapshot.reconciliation.orphan_module_ids}
            rendered = render_orphans(document.snapshot)
        elif args.violations:
            payload = [asdict(violation) for violation in document.snapshot.violations]
            rendered = render_violations(document.snapshot)
        else:
            payload, rendered = asdict(document), render_report(document)
        print(canonical_json(payload) if args.json else rendered)
        return 0
    except (EstateError, OSError) as error:
        print(f"estate: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
