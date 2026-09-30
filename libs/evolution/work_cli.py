# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/work_cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     libs/evolution/work.py, libs/evolution/work_exchange.py, libs/evolution/intelligence.py, libs/evolution/common.py, libs/capability_tokens/verification.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/receipts.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/evolution/work.py; CONSUMES libs/evolution/work_exchange.py; CONSUMES libs/evolution/intelligence.py; CONSUMES libs/evolution/common.py; CONSUMES libs/capability_tokens/verification.py; CONSUMES libs/semantic_twin/contracts.py; CONSUMES libs/semantic_twin/identity.py; CONSUMES libs/semantic_twin/receipts.py
# Intent:      Make existing development missions and returned evidence usable as portable candidate-only work through local commands.
# ───────────────────────────────────────────────────────────────

"""Prepare, inspect and summarize public work without dispatching external effects."""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
import json
from pathlib import Path

from libs.capability_tokens.verification import ReviewPolicy
from libs.semantic_twin.contracts import Contract, ContractError, require
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.receipts import VerificationReceipt

from .common import decode_json, digest, mapping
from .intelligence import DevelopmentOpportunity
from .work import (
    AcceptanceCheck,
    EvidenceKind,
    Lane,
    Party,
    PUBLIC_FORBIDDEN,
    WorkContract,
    WorkResult,
    WorkSource,
    WorkSubmission,
    WorkerIdentity,
)
from .work_exchange import (
    ExperienceInput,
    MAX_CONTRACT_BYTES,
    assess_result,
    load_contract,
    read_bundle,
    read_bytes,
    worker_experience,
    write_bundle,
)


def from_development_mission(
    packet: Mapping[str, object],
    *,
    repository: str,
    producer: Party,
    lane: Lane,
    allowed_paths: tuple[str, ...],
    forbidden_paths: tuple[str, ...],
    capabilities: tuple[str, ...],
    evidence_required: tuple[EvidenceKind, ...],
    at: datetime,
) -> WorkContract:
    """Project the existing proposed mission while preserving its complete origin digest."""
    require(
        packet.get("schema_version") == "buildanddo.development-mission/v1"
        and packet.get("status") == "proposed",
        "expected an existing proposed development mission",
    )
    opportunity = DevelopmentOpportunity.from_dict(mapping(packet.get("opportunity")))
    proposal = opportunity.proposal
    require(
        all(signal.access == "public" for signal in opportunity.signals),
        "sanitize non-public observations before creating public work",
    )
    require(
        packet.get("source_sha") == proposal.source_sha
        and packet.get("proposal") == proposal.to_dict(),
        "mission proposal lineage changed",
    )
    require(
        packet.get("context_root") == proposal.context_root.to_dict()
        and packet.get("authority") == proposal.authority.value,
        "mission context or authority changed",
    )
    require(
        packet.get("independent_review") is True
        and packet.get("builder") != packet.get("verifier"),
        "mission requires independent review",
    )
    for name in ("builder", "verifier"):
        require(
            isinstance(packet.get(name), str),
            "mission omits declared participant identity",
        )
        SemanticId(str(packet[name]))
    require(at >= proposal.requested_at, "work contract predates mission")
    require(
        isinstance(packet.get("srs"), str) and isinstance(packet.get("dispatch"), str),
        "mission omits SRS or dispatch",
    )
    return WorkContract(
        schema="buildanddo.work/v1",
        mission_id=proposal.correlation_id,
        scope_id=proposal.scope_id,
        producer=producer,
        consumer="citadel-nexus" if producer == "buildanddo" else "buildanddo",
        lane=lane,
        objective=opportunity.hypothesis,
        srs=str(packet["srs"]),
        dispatch=str(packet["dispatch"]),
        source=WorkSource(repository, proposal.source_sha),
        created_at=at,
        allowed_paths=allowed_paths,
        forbidden_paths=forbidden_paths,
        required_capabilities=capabilities,
        acceptance=tuple(
            AcceptanceCheck(f"acceptance-{i + 1}", statement)
            for i, statement in enumerate(opportunity.acceptance)
        ),
        evidence_required=evidence_required,
        origin=SubjectRef(SemanticId(proposal.proposal_id), digest(packet)),
    )


def _write_new(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(value, indent=2, sort_keys=True) + "\n")


def _json_file(path: Path) -> object:
    return decode_json(read_bytes(path.parent, path.name, limit=MAX_CONTRACT_BYTES))


def main(argv: Sequence[str] | None = None) -> int:
    """Expose local work exchange with explicit expected work and candidate inputs."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    schema = commands.add_parser("schema")
    schema.add_argument("kind", choices=("work", "result", "worker"))
    schema.add_argument("--output", required=True, type=Path)
    validate = commands.add_parser("validate-work")
    validate.add_argument("work", type=Path)
    convert = commands.add_parser("from-mission")
    convert.add_argument("mission", type=Path)
    convert.add_argument("--repository", required=True)
    convert.add_argument(
        "--producer", choices=("buildanddo", "citadel-nexus"), required=True
    )
    convert.add_argument(
        "--lane",
        choices=("development", "experience", "research", "operations"),
        required=True,
    )
    convert.add_argument("--allowed-path", action="append", required=True)
    convert.add_argument("--forbidden-path", action="append", default=[])
    convert.add_argument("--capability", action="append", required=True)
    convert.add_argument(
        "--require-evidence",
        choices=("deployment", "runtime"),
        action="append",
        default=[],
    )
    convert.add_argument("--output", type=Path, required=True)
    prepare = commands.add_parser("bundle")
    prepare.add_argument("--work", type=Path, required=True)
    prepare.add_argument("--result", type=Path, required=True)
    prepare.add_argument("--candidate", required=True)
    prepare.add_argument("--evidence-root", type=Path, required=True)
    prepare.add_argument("--verification", type=Path)
    prepare.add_argument("--output", type=Path, required=True)
    inspect = commands.add_parser("inspect")
    inspect.add_argument("bundle", type=Path)
    inspect.add_argument("--work", type=Path, required=True)
    inspect.add_argument("--candidate", required=True)
    inspect.add_argument("--review-policy", type=Path)
    history = commands.add_parser("experience")
    history.add_argument(
        "selection",
        type=Path,
        help="array of {bundle, expected_work, candidate} selected by the receiving owner",
    )
    history.add_argument("--worker", required=True)
    history.add_argument("--review-policy", type=Path)
    history.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    at = datetime.now(timezone.utc)
    try:
        if args.command == "schema":
            contracts: dict[str, type[Contract]] = {
                "work": WorkContract,
                "result": WorkResult,
                "worker": WorkerIdentity,
            }
            contract = contracts[args.kind]
            _write_new(args.output, contract.json_schema())
            print("PREPARED: structural schema; semantic validation remains required")
        elif args.command == "validate-work":
            work = load_contract(args.work, WorkContract)
            require(work.created_at <= at, "work is from the future")
            print(
                json.dumps(
                    {
                        "schema": work.schema,
                        "mission_id": work.mission_id,
                        "work_digest": work.digest,
                        "status": "PROPOSED",
                        "production_authority": False,
                    },
                    sort_keys=True,
                )
            )
        elif args.command == "from-mission":
            work = from_development_mission(
                mapping(_json_file(args.mission)),
                repository=args.repository,
                producer=args.producer,
                lane=args.lane,
                allowed_paths=tuple(args.allowed_path),
                forbidden_paths=tuple(
                    dict.fromkeys((*PUBLIC_FORBIDDEN, *args.forbidden_path))
                ),
                capabilities=tuple(args.capability),
                evidence_required=(
                    "commit",
                    "test",
                    "artifact",
                    *args.require_evidence,
                ),
                at=at,
            )
            _write_new(args.output, work.to_dict())
            print(json.dumps({"status": "PROPOSED", "work_digest": work.digest}))
        elif args.command == "bundle":
            submission = WorkSubmission(
                load_contract(args.work, WorkContract),
                load_contract(args.result, WorkResult),
            )
            verification = (
                load_contract(args.verification, VerificationReceipt)
                if args.verification
                else None
            )
            write_bundle(
                args.output,
                submission,
                candidate=args.candidate,
                evidence_root=args.evidence_root,
                at=at,
                verification=verification,
            )
            print(
                json.dumps(
                    {
                        "status": "PREPARED",
                        "work_digest": submission.work.digest,
                        "result_digest": submission.result.digest,
                        "verification": "not_conferred_by_packaging",
                    }
                )
            )
        elif args.command == "inspect":
            bundle = read_bundle(args.bundle)
            policy = (
                load_contract(args.review_policy, ReviewPolicy)
                if args.review_policy
                else None
            )
            assessment = assess_result(
                bundle.submission,
                expected_work=load_contract(args.work, WorkContract),
                candidate=args.candidate,
                evidence_root=args.bundle / "evidence",
                at=at,
                verification=bundle.verification if policy else None,
                policy=policy,
            )
            print(assessment.to_json())
            return 0 if assessment.state == "REVIEWED_PASS" else 2
        elif args.command == "experience":
            selected = _json_file(args.selection)
            require(
                isinstance(selected, list) and len(selected) <= 1000,
                "expected bounded experience selection",
            )
            assert isinstance(selected, list)
            inputs = []
            for item in selected:
                row = mapping(item)
                require(
                    set(row) == {"bundle", "expected_work", "candidate"}
                    and all(isinstance(v, str) for v in row.values()),
                    "invalid experience selection",
                )
                inputs.append(
                    ExperienceInput(
                        Path(str(row["bundle"])),
                        load_contract(Path(str(row["expected_work"])), WorkContract),
                        str(row["candidate"]),
                    )
                )
            policy = (
                load_contract(args.review_policy, ReviewPolicy)
                if args.review_policy
                else None
            )
            report = worker_experience(
                tuple(inputs), worker=SemanticId(args.worker), at=at, policy=policy
            )
            _write_new(args.output, report)
            print(
                json.dumps(
                    {
                        "status": "RECORDED",
                        "attempts": report["attempts"],
                        "historical_reviewed_passes": report[
                            "historical_reviewed_passes"
                        ],
                    }
                )
            )
    except (ContractError, OSError, RecursionError) as exc:
        print(f"FAIL: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
