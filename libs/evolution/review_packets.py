# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/review_packets.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/development.py, libs/capability_tokens/verification.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/evolution/development.py; CONSUMES libs/capability_tokens/verification.py
# Intent:      Retain the actual source and process bytes an independent reviewer needs to admit a development outcome through the existing trust gate.
# ───────────────────────────────────────────────────────────────

"""Transport measured development evidence without manufacturing review authority."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

from libs.capability_tokens.verification import ReviewPolicy
from libs.semantic_twin.contracts import ContractError, require
from libs.semantic_twin.receipts import VerificationReceipt

from .common import digest, mapping, read_json
from .development import (
    FrozenPrediction,
    MeasuredTestRun,
    OutcomeReviewRequest,
    _bind_run,
    admit_reviewed_outcome,
    observe_test_run,
    prediction_events,
    source_bytes,
)
from .replay import ReplayCase
from .scorer import OutcomeLabels
from .store import Journal

SCHEMA = "buildanddo.development-review-packet/v1"


def _json(value: object) -> bytes:
    return (
        json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n"
    ).encode()


def _sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _file(root: Path, name: str) -> Path:
    require(
        bool(name)
        and not Path(name).is_absolute()
        and "\\" not in name
        and all(part not in ("", ".", "..") for part in name.split("/")),
        "invalid review packet path",
    )
    path = root
    require(not path.is_symlink(), "review packet must not be a symlink")
    for part in name.split("/"):
        path /= part
        require(not path.is_symlink(), "review packet must not follow symlinks")
    require(path.resolve().is_relative_to(root.resolve()), "review path escapes packet")
    return path


def write_packet(
    root: Path,
    prediction: FrozenPrediction,
    run: MeasuredTestRun,
    output: Path,
    *,
    at: datetime | None = None,
) -> Path:
    """Export exact public source, prediction and process output into a new directory.

    Args:
        root: Repository containing the frozen source bytes.
        prediction: Decision frozen before executing the tests.
        run: Retained actual process observation, including failed or held runs.
        output: New local directory; existing packets are never replaced.
        at: Packet creation time, defaulting to the current UTC time.

    Returns:
        Path to the packet manifest. Labels and trust policy remain reviewer inputs.
    """
    _bind_run(prediction, run)
    observed = at or datetime.now(timezone.utc)
    require(
        observed.tzinfo is not None and observed >= run.completed_at,
        "invalid packet time",
    )
    sources = source_bytes(root)
    require(
        {name: _sha(raw) for name, raw in sources.items()} == prediction.file_digests,
        "current source no longer matches the frozen prediction",
    )
    require(
        not output.exists() and not output.is_symlink(), "choose a new packet directory"
    )
    files = {
        "prediction.json": _json(prediction.to_dict()),
        "test-run.json": _json(run.to_dict()),
        "test.log": run.log.encode(),
        **{"source/" + name: raw for name, raw in sources.items()},
    }
    manifest = {
        "schema_version": SCHEMA,
        "scope_id": prediction.observation.scope_id,
        "created_at": observed.isoformat(),
        "producer": str(prediction.actor_id),
        "prediction_id": str(prediction.prediction_id),
        "run_id": str(run.run_id),
        "candidate_sha": run.source_sha,
        "source_digest": digest(prediction.file_digests),
        "process_status": run.status,
        "grading": "UNMEASURED",
        "files": {name: _sha(raw) for name, raw in sorted(files.items())},
    }
    output.mkdir(parents=True, exist_ok=False)
    for name, raw in files.items():
        path = _file(output, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as stream:
            stream.write(raw)
    target = output / "packet.json"
    with target.open("xb") as stream:
        stream.write(_json(manifest))
    return target


def read_packet(
    path: Path, *, scope: str, at: datetime | None = None
) -> tuple[FrozenPrediction, MeasuredTestRun]:
    """Validate every captured byte before accepting a packet as an observation."""
    require(path.name == "packet.json", "select the packet manifest")
    root = path.parent
    manifest = mapping(read_json(_file(root, path.name)))
    expected = {
        "schema_version",
        "scope_id",
        "created_at",
        "producer",
        "prediction_id",
        "run_id",
        "candidate_sha",
        "source_digest",
        "process_status",
        "grading",
        "files",
    }
    require(
        set(manifest) == expected and manifest["schema_version"] == SCHEMA,
        "invalid packet schema",
    )
    require(
        manifest["scope_id"] == scope and bool(scope), "review packet scope mismatch"
    )
    require(
        manifest["grading"] == "UNMEASURED", "packet cannot certify its own outcome"
    )
    files = manifest["files"]
    require(
        isinstance(files, dict) and 3 < len(files) <= 503, "invalid packet inventory"
    )
    assert isinstance(files, dict)
    total = 0
    for name, checksum in files.items():
        require(
            isinstance(name, str) and isinstance(checksum, str), "invalid packet file"
        )
        require(
            name in {"prediction.json", "test-run.json", "test.log"}
            or name.startswith("source/")
            and name.endswith(".py"),
            "unexpected review packet file",
        )
        target = _file(root, name)
        require(
            target.is_file() and target.stat().st_size <= 16_000_000,
            "packet file missing or oversized",
        )
        raw = target.read_bytes()
        total += len(raw)
        require(
            total <= 64_000_000 and _sha(raw) == checksum, "review packet bytes changed"
        )
    require(
        {"prediction.json", "test-run.json", "test.log"} <= set(files),
        "review packet omits a process artifact",
    )
    prediction = FrozenPrediction.from_dict(
        mapping(read_json(root / "prediction.json"))
    )
    run = MeasuredTestRun.from_dict(mapping(read_json(root / "test-run.json")))
    _bind_run(prediction, run)
    require(prediction.observation.scope_id == scope, "prediction scope mismatch")
    require(
        {name: _sha(raw) for name, raw in source_bytes(root / "source").items()}
        == prediction.file_digests,
        "packet source differs from frozen source",
    )
    require(
        set(files)
        == {"prediction.json", "test-run.json", "test.log"}
        | {"source/" + name for name in prediction.file_digests},
        "packet inventory differs from prediction",
    )
    require(
        (root / "test.log").read_bytes() == run.log.encode(),
        "packet log differs from run",
    )
    require(
        all(
            manifest[key] == value
            for key, value in {
                "producer": str(prediction.actor_id),
                "prediction_id": str(prediction.prediction_id),
                "run_id": str(run.run_id),
                "candidate_sha": run.source_sha,
                "source_digest": digest(prediction.file_digests),
                "process_status": run.status,
            }.items()
        ),
        "packet identity differs from captured evidence",
    )
    try:
        created = datetime.fromisoformat(str(manifest["created_at"]))
        valid_time = run.completed_at <= created <= (at or datetime.now(timezone.utc))
    except (ValueError, TypeError):
        valid_time = False
    require(valid_time, "packet is future-dated or predates its outcome")
    return prediction, run


def admit_packet(
    path: Path,
    journal: Journal,
    labels: OutcomeLabels,
    receipt: VerificationReceipt,
    policy: ReviewPolicy,
    *,
    at: datetime,
) -> ReplayCase:
    """Admit a portable outcome using independently supplied labels and receipt pins."""
    prediction, run = read_packet(path, scope=journal.scope_id, at=at)
    request = OutcomeReviewRequest(prediction, run, labels)
    # Imported source and process observations remain unverified if admission fails.
    # The existing gate checks producer separation, exact labels, chronology and pins.
    journal.put_events(prediction_events(prediction))
    observe_test_run(journal, prediction, run)
    return admit_reviewed_outcome(journal, request, receipt, policy, at=at)


def main(argv: Sequence[str] | None = None) -> int:
    """Export or inspect evidence and accept only a separately supplied pinned review."""
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export")
    export.add_argument("--root", type=Path, default=Path.cwd())
    export.add_argument("--prediction", type=Path, required=True)
    export.add_argument("--run", type=Path, required=True)
    export.add_argument("--output", type=Path, required=True)
    for name in ("inspect", "admit"):
        command = sub.add_parser(name)
        command.add_argument("packet", type=Path)
        command.add_argument("--scope", required=True)
        if name == "admit":
            command.add_argument("--state", type=Path, required=True)
            command.add_argument("--labels", type=Path, required=True)
            command.add_argument("--receipt", type=Path, required=True)
            command.add_argument("--review-policy", type=Path, required=True)
            command.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "export":
            print(
                write_packet(
                    args.root,
                    FrozenPrediction.from_dict(mapping(read_json(args.prediction))),
                    MeasuredTestRun.from_dict(mapping(read_json(args.run))),
                    args.output,
                )
            )
        elif args.command == "inspect":
            prediction, run = read_packet(args.packet, scope=args.scope)
            print(
                json.dumps(
                    {
                        "prediction_id": str(prediction.prediction_id),
                        "run_id": str(run.run_id),
                        "source_files": len(prediction.file_digests),
                        "process_status": run.status,
                        "grading": "UNMEASURED",
                        "next_step": "Independently review source, labels and exact process evidence; supply the existing receipt and trusted policy separately.",
                    },
                    indent=2,
                )
            )
        else:
            require(
                not args.output.exists() and not args.output.is_symlink(),
                "choose a new outcome output",
            )
            with Journal(args.state, scope_id=args.scope) as journal:
                case = admit_packet(
                    args.packet,
                    journal,
                    OutcomeLabels.from_dict(mapping(read_json(args.labels))),
                    VerificationReceipt.from_dict(mapping(read_json(args.receipt))),
                    ReviewPolicy.from_dict(mapping(read_json(args.review_policy))),
                    at=datetime.now(timezone.utc),
                )
                args.output.parent.mkdir(parents=True, exist_ok=True)
                with args.output.open("xb") as stream:
                    stream.write(_json(case.to_dict()))
            print(args.output)
    except (ContractError, OSError, ValueError) as error:
        print("HOLD: " + str(error))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
