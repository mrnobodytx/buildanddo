# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/adapters.py, libs/evolution/benchmark.py, libs/evolution/loop.py, libs/evolution/promotion.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/adapters.py; CONSUMES libs/evolution/benchmark.py; CONSUMES libs/evolution/loop.py; CONSUMES libs/evolution/promotion.py
# Intent:      Expose the complete local feedback lifecycle with retained evidence and explicit HOLD outcomes.
# ───────────────────────────────────────────────────────────────

"""Expose the local evolution lifecycle without provider, model or execution clients."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path

from libs.semantic_twin.contracts import ContractError, require
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.vocabulary import AuthorityTier

from .adapters import ingest_local, observe_git
from .benchmark import (
    BenchmarkReport,
    HistoricalModelCapture,
    benchmark,
    compare_epochs,
)
from .candidate import Compatibility, discover_candidates
from .common import mapping, read_json, timestamp
from .compiler import DecisionInput
from .loop import capture_epoch, next_actions, observe_compatibility, refresh_episodes
from .promotion import (
    CapabilityRecord,
    CompetenceState,
    HealthObservation,
    advance,
    demote,
    register,
)
from .registry import compile_capability, select
from .replay import (
    EvaluationMode,
    EvaluationReport,
    ReplayCase,
    TeacherPrediction,
    evaluate,
)
from .store import Journal


def parser() -> argparse.ArgumentParser:
    """Declare local input/output boundaries for each lifecycle command."""
    root = argparse.ArgumentParser(
        prog="citadel-evolve",
        description="Measure local proposal competence without increasing authority.",
    )
    root.add_argument(
        "--state", type=Path, default=Path("state/evolution/journal.sqlite")
    )
    root.add_argument("--scope", default="buildanddo-public")
    root.add_argument("--actor", default="cni://agent/bits-codegen")
    commands = root.add_subparsers(dest="command", required=True)

    observe = commands.add_parser(
        "observe", help="Normalize a permitted local export or local Git history."
    )
    source = observe.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path)
    source.add_argument("--git", type=Path)
    observe.add_argument(
        "--format",
        choices=(
            "capture",
            "events",
            "mission-learning",
            "memory",
            "telemetry",
            "phase1",
        ),
        default="capture",
    )
    observe.add_argument(
        "--authority", choices=tuple(t.value for t in AuthorityTier), default="A0"
    )
    observe.add_argument("--limit", type=int, default=100)

    episodes = commands.add_parser(
        "episodes", help="Rebuild current episodes from retained observations."
    )
    episodes.add_argument("--as-of", type=timestamp)
    candidates = commands.add_parser(
        "candidates", help="Discover structured hypotheses in a declared window."
    )
    candidates.add_argument("--before", type=timestamp, required=True)
    candidates.add_argument("--compatibility", type=Path, required=True)
    candidates.add_argument("--min-observations", type=int, default=2)

    for name in ("replay", "shadow"):
        command = commands.add_parser(
            name, help="Evaluate frozen holdout cases without effects."
        )
        command.add_argument("--candidate", required=True)
        command.add_argument("--cases", type=Path, required=True)
        if name == "shadow":
            command.add_argument("--teachers", type=Path, required=True)

    promote = commands.add_parser(
        "promote", help="Advance competence using exact typed evaluation evidence."
    )
    promote.add_argument("--candidate", required=True)
    promote.add_argument(
        "--to", choices=tuple(state.value for state in CompetenceState), required=True
    )
    promote.add_argument("--replay")
    promote.add_argument("--shadow")
    promote.add_argument("--proof", type=Path)
    promote.add_argument(
        "--through",
        action="store_true",
        help="Traverse each intermediate gate, retaining any qualified prefix on HOLD.",
    )

    health = commands.add_parser(
        "demote", help="Apply a measured health observation without changing authority."
    )
    health.add_argument("--candidate", required=True)
    health.add_argument("--health", type=Path, required=True)

    use = commands.add_parser(
        "use",
        help="Produce a bounded proposal and record its observation; no execution.",
    )
    use.add_argument("--input", type=Path, required=True)
    use.add_argument("--mission")

    bench = commands.add_parser(
        "benchmark",
        help="Benchmark actual parent trees and retained reviewed outcomes.",
    )
    bench.add_argument("--repository", type=Path, default=Path("."))
    bench.add_argument("--limit", type=int, default=100)
    bench.add_argument("--models", type=Path)
    bench.add_argument(
        "--output",
        type=Path,
        help="Create a new full report file; existing files are never replaced.",
    )

    status = commands.add_parser(
        "status", help="Capture an epoch and report observed competence and routing."
    )
    status.add_argument("--human", action="store_true")
    return root


def _array(path: Path) -> tuple[dict[str, object], ...]:
    value = read_json(path)
    require(isinstance(value, list), "capture input must be a JSON array")
    assert isinstance(value, list)
    return tuple(mapping(item) for item in value)


def _record(journal: Journal, candidate_id: str) -> CapabilityRecord:
    record = journal.registry(candidate_id)
    require(record is not None, "candidate is not registered in this scope")
    assert record is not None
    return record


def _evaluation(
    journal: Journal,
    reference: str | None,
    record: CapabilityRecord,
    mode: EvaluationMode,
) -> EvaluationReport | None:
    if reference is not None:
        artifact = journal.get("evaluation", reference.rsplit("/", 1)[-1])
        require(
            artifact is not None, "evaluation artifact is not retained in this scope"
        )
        assert artifact is not None
        result = EvaluationReport.from_dict(artifact)
        require(
            result.candidate == record.candidate and result.mode is mode,
            "evaluation candidate or mode mismatch",
        )
        return result
    reports = [
        EvaluationReport.from_dict(value) for value in journal.artifacts("evaluation")
    ]
    matching = [
        report
        for report in reports
        if report.candidate == record.candidate and report.mode is mode
    ]
    return max(matching, key=lambda report: report.evaluated_at) if matching else None


def _promote(
    args: argparse.Namespace, journal: Journal, now: datetime
) -> dict[str, object]:
    record = _record(journal, args.candidate)
    target = CompetenceState(args.to)
    replay = _evaluation(journal, args.replay, record, EvaluationMode.REPLAY)
    shadow = _evaluation(journal, args.shadow, record, EvaluationMode.SHADOW)
    proof = (
        PromotionProof.from_dict(mapping(read_json(args.proof))) if args.proof else None
    )
    ladder = (
        CompetenceState.HYPOTHESIS,
        CompetenceState.CANDIDATE,
        CompetenceState.REPLAY_PASS,
        CompetenceState.SHADOW,
        CompetenceState.VERIFIED_CAPABILITY,
        CompetenceState.TOKENLESS_PREFERRED,
    )
    targets: tuple[CompetenceState, ...] = (target,)
    if args.through:
        require(
            record.state in ladder
            and target in ladder
            and ladder.index(target) > ladder.index(record.state),
            "automatic progression must follow the competence ladder",
        )
        targets = ladder[ladder.index(record.state) + 1 : ladder.index(target) + 1]
    for next_state in targets:
        updated = advance(
            record, next_state, at=now, replay=replay, shadow=shadow, proof=proof
        )
        journal.save_registry(updated, expected_revision=record.revision)
        record = updated
    output: dict[str, object] = {
        "candidate": record.candidate.candidate_id,
        "state": record.state.value,
        "authority": record.candidate.authority.value,
        "registry_revision": record.revision,
    }
    if record.state in (
        CompetenceState.VERIFIED_CAPABILITY,
        CompetenceState.TOKENLESS_PREFERRED,
    ):
        program = compile_capability(record)
        output["program"] = program.to_dict()
        output["program_digest"] = program.program_digest
    return output


def execute(
    args: argparse.Namespace, journal: Journal, *, now: datetime
) -> dict[str, object]:
    """Run one bounded local phase and retain its concrete artifacts."""
    actor = SemanticId(args.actor)
    if args.command == "observe":
        result = (
            observe_git(
                args.git,
                scope_id=args.scope,
                observed_at=now,
                actor_id=actor,
                limit=args.limit,
            )
            if args.git is not None
            else ingest_local(
                args.input,
                format_name=args.format,
                scope_id=args.scope,
                actor_id=actor,
                observed_at=now,
                ingested_at=now,
                authority=AuthorityTier(args.authority),
            )
        )
        inserted = journal.put_events(result.events)
        return {
            "observed": len(result.events),
            "inserted": inserted,
            "gaps": result.gaps,
        }
    if args.command == "episodes":
        values = refresh_episodes(journal, as_of=args.as_of or now)
        return {
            "episodes": [
                {
                    "episode_id": value.episode_id,
                    "status": value.status,
                    "attempts": len(value.attempts),
                }
                for value in values
            ]
        }
    if args.command == "candidates":
        require(args.before <= now, "discovery cutoff is in the future")
        compatibility = Compatibility.from_dict(mapping(read_json(args.compatibility)))
        discovered = discover_candidates(
            refresh_episodes(journal, as_of=now),
            before=args.before,
            discovered_at=now,
            compatibility=compatibility,
            actor_id=actor,
            min_observations=args.min_observations,
        )
        entries = []
        for value in discovered:
            current = journal.registry(value.candidate_id)
            # An identical discovery window is an idempotent read of the existing hypothesis.
            if current is not None and (
                current.candidate.rule == value.rule
                and current.candidate.training == value.training
                and current.candidate.compatibility == value.compatibility
                and current.candidate.discovery_cutoff == value.discovery_cutoff
            ):
                registered = current
            else:
                registered = register(value, policy=current.policy if current else None)
                journal.save("candidate", value)
                journal.save_registry(
                    registered, expected_revision=current.revision if current else None
                )
            entries.append(
                {
                    "candidate": registered.candidate.candidate_id,
                    "subject": registered.candidate.subject.to_dict(),
                    "state": registered.state.value,
                    "observations": registered.candidate.observations,
                    "successful_repairs": registered.candidate.successful_repairs,
                    "authority": registered.candidate.authority.value,
                }
            )
        return {"candidates": entries}
    if args.command in ("replay", "shadow"):
        record = _record(journal, args.candidate)
        cases = tuple(ReplayCase.from_dict(value) for value in _array(args.cases))
        teachers = (
            tuple(TeacherPrediction.from_dict(value) for value in _array(args.teachers))
            if args.command == "shadow"
            else ()
        )
        evaluation = evaluate(
            record.candidate,
            cases,
            evaluated_at=now,
            mode=EvaluationMode(args.command.upper()),
            teachers=teachers,
        )
        journal.save("evaluation", evaluation)
        return evaluation.summary()
    if args.command == "promote":
        return _promote(args, journal, now)
    if args.command == "demote":
        record = _record(journal, args.candidate)
        health = HealthObservation.from_dict(mapping(read_json(args.health)))
        require(health.observed_at <= now, "health capture is in the future")
        changed = demote(record, health)
        if changed != record:
            journal.save_registry(changed, expected_revision=record.revision)
        return {
            "candidate": record.candidate.candidate_id,
            "state": changed.state.value,
            "authority": changed.candidate.authority.value,
            "changed": changed != record,
        }
    if args.command == "use":
        observation = DecisionInput.from_dict(mapping(read_json(args.input)))
        demoted = observe_compatibility(journal, observation, at=now)
        selection = select(
            journal.records(),
            observation,
            actor_id=actor,
            observed_at=now,
            mission_id=args.mission,
        )
        journal.put_events((selection.event,))
        journal.save("selection", selection)
        return {**selection.to_dict(), "demoted_capabilities": demoted}
    if args.command == "benchmark":
        models = (
            tuple(
                HistoricalModelCapture.from_dict(value) for value in _array(args.models)
            )
            if args.models
            else ()
        )
        previous = journal.artifacts("benchmark")
        if args.output is not None:
            require(not args.output.exists(), "benchmark output already exists")
        report = benchmark(
            args.repository,
            scope_id=args.scope,
            evaluated_at=now,
            limit=args.limit,
            outcomes=refresh_episodes(journal, as_of=now),
            models=models,
        )
        journal.save("benchmark", report)
        if args.output is not None:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with args.output.open("x", encoding="utf-8") as stream:
                stream.write(report.to_json() + "\n")
        summary = report.summary()
        summary["delta"] = (
            compare_epochs(BenchmarkReport.from_dict(previous[-1]), report)
            if previous
            else {"status": "UNMEASURED", "reason": "no earlier benchmark"}
        )
        return summary
    epoch, delta = capture_epoch(journal, at=now)
    output = epoch.summary()
    output["delta"] = delta
    output["next"] = next_actions(journal)
    return output


def _human_status(output: dict[str, object]) -> str:
    lines = ["CITADEL VERIFIED EVOLUTION", "", f"Events observed: {output['events']}"]
    for title, key in (("EPISODES", "episodes"), ("LEARNING", "learning")):
        lines.extend(("", title))
        lines.extend(
            f"  {name.lower():24s} {count}"
            for name, count in mapping(output[key]).items()
        )
    lines.extend(("", "COGNITION"))
    for name, value in mapping(output["cognition"]).items():
        item = mapping(value)
        percentage = item["value"]
        displayed = (
            "UNMEASURED"
            if percentage is None
            else f"{float(str(percentage)) * 100:.1f}%"
        )
        lines.append(
            f"  {name.lower():24s} {displayed} ({item['numerator']}/{item['denominator']})"
        )
    lines.extend(("", "SAFETY"))
    safety = mapping(output["safety"])
    lines.append(f"  authority expansions     {safety['authority_expansions']}")
    lines.append("  execution effects        none; proposals only")
    lines.extend(
        ("", "DELTA", "  " + json.dumps(output["delta"], sort_keys=True), "", "NEXT")
    )
    next_items = output["next"]
    if isinstance(next_items, (tuple, list)):
        lines.extend("  " + str(item) for item in next_items)
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None, *, now: datetime | None = None) -> int:
    """Run the local CLI, returning HOLD for unmet evidence or malformed input."""
    args = parser().parse_args(argv)
    observed = now or datetime.now(timezone.utc)
    try:
        with Journal(args.state, scope_id=args.scope) as journal:
            output = execute(args, journal, now=observed)
        if args.command == "status" and args.human:
            print(_human_status(output))
        else:
            print(json.dumps(output, indent=2, sort_keys=True, allow_nan=False))
        return 0
    except (ContractError, OSError, sqlite3.Error, ValueError) as exc:
        print(
            json.dumps(
                {
                    "status": "HOLD",
                    "reason": str(exc),
                    "scope": "local evidence consistency; no actions executed",
                }
            ),
            file=sys.stderr,
        )
        return 2
