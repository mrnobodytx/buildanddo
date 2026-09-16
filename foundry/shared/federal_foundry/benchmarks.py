# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/benchmarks.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/execution.py, foundry/shared/federal_foundry/registry.py, foundry/shared/federal_foundry/baselines.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/execution.py; DEPENDS_ON foundry/shared/federal_foundry/registry.py; DEPENDS_ON foundry/shared/federal_foundry/baselines.py
# DAG Node:    none
# Intent:      Compare candidates across frozen seed groups and derive portfolio evidence from verified local run receipts.
# ───────────────────────────────────────────────────────────────

"""Run repeatable candidate comparisons and independently derive their summaries."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
import statistics

from .baselines import CANDIDATES
from .execution import (
    LocalExperimentRunner,
    builtin_command,
    source_manifest,
    verify_run,
)
from .interfaces import BenchmarkResult, BenchmarkSpec, ExperimentSpec
from .models import EvidenceRecord, FoundryValidationError, LaneResults
from .registry import OpportunityRegistry, load_yaml
from .validation import (
    decode,
    digest,
    finite,
    integer,
    manifest,
    mapping,
    read_bytes,
    read_json,
    records,
    staging,
    strings,
    validate_contract,
    verify_manifest,
    write_json,
)


@dataclass(frozen=True)
class ExperimentPlan:
    """Bind one lane to a frozen public dataset and finite comparison design."""

    lane_id: str
    document: dict[str, object]
    dataset: dict[str, object]
    dataset_bytes: bytes

    @property
    def candidates(self) -> tuple[str, ...]:
        """Return the explicitly registered candidate IDs."""
        return strings(self.document["candidates"], "candidates")

    @property
    def seeds(self) -> tuple[int, ...]:
        """Return unique integer seeds."""
        raw = self.document["seeds"]
        assert isinstance(raw, list)
        return tuple(integer(seed, 0, 2**32 - 1, "seed") for seed in raw)

    @property
    def repetitions(self) -> int:
        """Return the number of repeat trials within each seed group."""
        return integer(self.document["repetitions"], 2, 10, "repetitions")


def plan_from_document(
    repository: Path, value: dict[str, object], dataset_bytes: bytes
) -> ExperimentPlan:
    """Validate the experiment schema, dataset identity and opportunity references."""
    schema = read_json(repository, "foundry/registry/experiment.schema.json")
    validate_contract(value, schema)
    lane = str(value["lane_id"])
    opportunity = OpportunityRegistry(repository / "foundry").load(lane)
    candidates = strings(value["candidates"], "candidates")
    if lane not in CANDIDATES or not set(candidates).issubset(CANDIDATES[lane]):
        raise FoundryValidationError(
            "experiment selects an unknown reference candidate"
        )
    refs = strings(value["requirement_ids"], "requirement_ids")
    if not set(refs).issubset({str(row["id"]) for row in opportunity.requirements}):
        raise FoundryValidationError("experiment references a foreign requirement")
    dataset = decode(dataset_bytes)
    if (
        digest(dataset_bytes) != value["dataset_sha256"]
        or dataset.get("kind") != "synthetic"
        or dataset.get("classification") != "PUBLIC"
        or not isinstance(dataset.get("license"), str)
        or not dataset["license"]
        or dataset.get("lane_id") != lane
    ):
        raise FoundryValidationError(
            "experiment dataset fingerprint, lane or public rights mismatch"
        )
    metrics = records(value["metrics"], "metrics")
    names = strings([row["name"] for row in metrics], "metric names")
    if value["primary_metric"] not in names:
        raise FoundryValidationError("primary metric must be declared")
    plan = ExperimentPlan(lane, value, dataset, dataset_bytes)
    if len(plan.candidates) * len(plan.seeds) * plan.repetitions > 128:
        raise FoundryValidationError("experiment exceeds 128 attempts")
    return plan


def load_plan(repository: Path, lane_id: str) -> ExperimentPlan:
    """Load one lane's executable plan and check its pinned dataset bytes."""
    registry = OpportunityRegistry(repository / "foundry")
    if lane_id not in registry.lane_ids():
        raise FoundryValidationError("unknown foundry lane")
    value = dict(load_yaml(repository, f"foundry/lanes/{lane_id}/experiment.yaml"))
    if value.get("lane_id") != lane_id:
        raise FoundryValidationError("experiment lane differs from its directory")
    dataset_path = str(value.get("dataset"))
    if not dataset_path.startswith("foundry/fixtures/"):
        raise FoundryValidationError("reference dataset must be under foundry/fixtures")
    return plan_from_document(repository, value, read_bytes(repository, dataset_path))


def _trial_path(candidate: str, seed: int, repetition: int) -> str:
    return f"runs/{candidate}/seed-{seed}/repeat-{repetition}"


def _percentile(values: list[float], quantile: float) -> float:
    ordered = sorted(values)
    at = (len(ordered) - 1) * quantile
    below = int(at)
    above = min(below + 1, len(ordered) - 1)
    return ordered[below] + (ordered[above] - ordered[below]) * (at - below)


def distribution(values: list[float]) -> dict[str, object]:
    """Summarize observed seed means without asserting population confidence."""
    if not values:
        raise FoundryValidationError("cannot summarize an empty measurement set")
    for value in values:
        finite(value)
    return {
        "n": len(values),
        "mean": round(statistics.mean(values), 10),
        "stddev": round(statistics.stdev(values), 10) if len(values) > 1 else None,
        "min": min(values),
        "max": max(values),
        "p50": round(_percentile(values, 0.5), 10),
        "p95": round(_percentile(values, 0.95), 10),
        "population_confidence_interval": None,
    }


def summarize_lane(
    repository: Path, lane_root: Path
) -> tuple[dict[str, object], dict[str, object]]:
    """Recompute all candidate results from run bytes instead of trusting a summary."""
    document = read_json(lane_root, "experiment.json")
    plan = plan_from_document(
        repository, document, read_bytes(lane_root, "dataset.json")
    )
    metrics_config = records(document["metrics"], "metrics")
    requirement_ids = strings(document["requirement_ids"])
    evidence: list[dict[str, object]] = []
    experiments: list[dict[str, object]] = []
    benchmark_rows: list[dict[str, object]] = []
    candidates: list[dict[str, object]] = []
    failures: list[dict[str, object]] = []
    for candidate in plan.candidates:
        samples: dict[str, list[float]] = {
            str(metric["name"]): [] for metric in metrics_config
        }
        hashes: dict[int, set[str]] = {}
        evidence_ids: list[str] = []
        successful = 0
        for seed in plan.seeds:
            group: dict[str, list[float]] = {name: [] for name in samples}
            hashes[seed] = set()
            for repetition in range(1, plan.repetitions + 1):
                rel = _trial_path(candidate, seed, repetition)
                directory = lane_root / rel
                receipt = verify_run(directory, repository)
                request = read_json(directory, "request.json")
                inputs = read_json(directory, "input.json")
                expected_id = f"{plan.lane_id}-{candidate}-{seed}-{repetition}"
                if (
                    receipt["experiment_id"] != expected_id
                    or receipt["seed"] != seed
                    or inputs
                    != {
                        "lane_id": plan.lane_id,
                        "candidate_id": candidate,
                        "seed": seed,
                        "dataset": plan.dataset,
                    }
                    or request["command"] != list(builtin_command())
                    or request["expected_artifacts"] != ["measurement.json"]
                ):
                    raise FoundryValidationError(
                        "cross-lane, candidate or input mismatch in run"
                    )
                experiment: dict[str, object] = {
                    "id": expected_id,
                    "status": receipt["status"],
                    "seed": seed,
                    "repetition": repetition,
                    "candidate_id": candidate,
                    "receipt": f"{rel}/receipt.json",
                    "reason": receipt["reason"],
                }
                experiments.append(experiment)
                if receipt["status"] != "succeeded":
                    failures.append({"run": rel, "reason": receipt["reason"]})
                    continue
                measurement = read_json(directory, "measurement.json")
                values = {
                    **mapping(measurement["metrics"]),
                    **mapping(measurement.get("resources", {})),
                }
                for name in samples:
                    group[name].append(finite(values.get(name), name))
                hashes[seed].add(str(receipt["computational_sha256"]))
                successful += 1
                eid = f"RUN-{expected_id.upper()}"
                evidence_ids.append(eid)
                evidence.append(
                    {
                        "id": eid,
                        "title": f"{candidate}, seed {seed}, repeat {repetition}",
                        "state": "observed",
                        "locator": f"{rel}/measurement.json",
                        "digest": digest(read_bytes(directory, "measurement.json")),
                        "requirement_ids": list(requirement_ids),
                    }
                )
                experiment["evidence_ids"] = [eid]
            if all(len(values) == plan.repetitions for values in group.values()):
                for name, measurements in group.items():
                    samples[name].append(statistics.mean(measurements))
        expected_count = len(plan.seeds) * plan.repetitions
        reproducible = successful == expected_count and all(
            len(value) == 1 for value in hashes.values()
        )
        complete = successful == expected_count
        stats = {
            str(metric["name"]): {
                **distribution(samples[str(metric["name"])]),
                "unit": metric["unit"],
                "direction": metric["direction"],
                "aggregation": "mean within repeats, distribution across seed groups",
            }
            for metric in metrics_config
            if samples[str(metric["name"])]
        }
        acceptance: list[dict[str, object]] = []
        for metric in metrics_config:
            if "threshold" not in metric:
                continue
            threshold = mapping(metric["threshold"])
            name = str(metric["name"])
            value = finite(stats[name]["mean"]) if name in stats else None
            target = finite(threshold["value"])
            op = str(threshold["operator"])
            passed = (
                complete
                and value is not None
                and {
                    ">=": value >= target if value is not None else False,
                    "<=": value <= target if value is not None else False,
                    "==": value == target,
                }[op]
            )
            acceptance.append(
                {
                    "metric": name,
                    "operator": op,
                    "target": target,
                    "observed": value,
                    "passed": passed,
                }
            )
        status = "succeeded" if complete and reproducible else "failed"
        row: dict[str, object] = {
            "candidate_id": candidate,
            "status": status,
            "attempts": expected_count,
            "successful_attempts": successful,
            "reproducible": reproducible,
            "metrics": stats,
            "acceptance": acceptance,
            "local_criteria_pass": status == "succeeded"
            and all(row["passed"] for row in acceptance),
        }
        candidates.append(row)
        benchmark_rows.append(
            {
                "id": f"{plan.lane_id}-{candidate}",
                "status": status,
                "candidate_id": candidate,
                "metrics": {name: values["mean"] for name, values in stats.items()},
                "statistics": stats,
                "evidence_ids": evidence_ids,
                "reproducible": reproducible,
                "acceptance": acceptance,
            }
        )
    updates = [
        {
            "id": identity,
            "status": "partial",
            "evidence_ids": [str(item["id"]) for item in evidence],
            "justification": f"Observed public reference workload only: {document['scope']}",
        }
        for identity in requirement_ids
        if evidence
    ]
    results: dict[str, object] = {
        "schema_version": "foundry.results/v1",
        "lane_id": plan.lane_id,
        "requirement_updates": updates,
        "claim_updates": [],
        "evidence": evidence,
        "experiments": experiments,
        "benchmarks": benchmark_rows,
    }
    # Apply the shared result parser to the records that compilation consumes.
    LaneResults.from_mapping(results)
    summary: dict[str, object] = {
        "schema_version": "foundry.comparison/v1",
        "lane_id": plan.lane_id,
        "dataset_sha256": document["dataset_sha256"],
        "data_kind": "synthetic",
        "scope": document["scope"],
        "seeds": list(plan.seeds),
        "repetitions": plan.repetitions,
        "primary_metric": document["primary_metric"],
        "status": "completed"
        if all(row["status"] == "succeeded" for row in candidates)
        else "failed",
        "candidates": candidates,
        "failed_attempts": failures,
        "statistics_scope": "Descriptive seed-group statistics on a fixed fixture; repeat timings are not independent scientific samples.",
        "hardware_evidence": False,
        "submission_approval": False,
    }
    return summary, results


async def _run_lane(
    plan: ExperimentPlan, repository: Path, root: Path, semaphore: asyncio.Semaphore
) -> dict[str, object]:
    root.mkdir()
    write_json(root / "experiment.json", plan.document)
    (root / "dataset.json").write_bytes(plan.dataset_bytes)
    runner = LocalExperimentRunner(
        repository, timeout_seconds=finite(plan.document["timeout_seconds"])
    )

    async def trial(candidate: str, seed: int, repetition: int) -> None:
        async with semaphore:
            spec = ExperimentSpec(
                f"{plan.lane_id}-{candidate}-{seed}-{repetition}",
                builtin_command(),
                seed,
                {
                    "lane_id": plan.lane_id,
                    "candidate_id": candidate,
                    "seed": seed,
                    "dataset": plan.dataset,
                },
                ("measurement.json",),
            )
            await runner.run(spec, root / _trial_path(candidate, seed, repetition))

    tasks = [
        asyncio.create_task(trial(candidate, seed, repetition))
        for candidate in plan.candidates
        for seed in plan.seeds
        for repetition in range(1, plan.repetitions + 1)
    ]
    try:
        await asyncio.gather(*tasks)
    except BaseException:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    summary, results = summarize_lane(repository, root)
    write_json(root / "summary.json", summary)
    write_json(root / "results.json", results)
    return summary


async def run_campaign(
    repository: Path,
    destination: Path,
    *,
    lane_ids: tuple[str, ...] | None = None,
    jobs: int = 4,
) -> dict[str, object]:
    """Run selected lanes concurrently and retain complete attempt evidence."""
    repository = repository.resolve()
    integer(jobs, 1, 8, "jobs")
    registry = OpportunityRegistry(repository / "foundry")
    selected = lane_ids if lane_ids is not None else registry.lane_ids()
    if not selected or len(selected) != len(set(selected)):
        raise FoundryValidationError("select at least one unique lane")
    plans = [load_plan(repository, identity) for identity in sorted(selected)]
    before = source_manifest(repository)
    cancelled = False
    with staging(destination, repository / "foundry") as output:
        semaphore = asyncio.Semaphore(jobs)
        tasks = [
            asyncio.create_task(
                _run_lane(plan, repository, output / plan.lane_id, semaphore)
            )
            for plan in plans
        ]
        summaries: list[dict[str, object]] = []
        try:
            summaries = await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            cancelled = True
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        if source_manifest(repository) != before:
            raise FoundryValidationError("source changed during campaign")
        attempted = len(list(output.glob("*/runs/*/seed-*/repeat-*/receipt.json")))
        campaign: dict[str, object] = {
            "schema_version": "foundry.campaign/v1",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "lanes": [plan.lane_id for plan in plans],
            "source": before,
            "status": "cancelled"
            if cancelled
            else (
                "completed"
                if all(summary["status"] == "completed" for summary in summaries)
                else "failed"
            ),
            "attempts": attempted,
            "planned_attempts": sum(
                len(plan.candidates) * len(plan.seeds) * plan.repetitions
                for plan in plans
            ),
            "concurrency": jobs,
            "artifacts": manifest(output),
            "authority": "public_fixture_evidence_only",
        }
        write_json(output / "campaign.json", campaign)
    if cancelled:
        raise asyncio.CancelledError
    return campaign


def verify_campaign(repository: Path, directory: Path) -> dict[str, object]:
    """Verify all campaign bytes, run identities and recomputed summary statistics."""
    campaign = read_json(directory, "campaign.json")
    if campaign.get("schema_version") != "foundry.campaign/v1":
        raise FoundryValidationError("unknown campaign schema")
    verify_manifest(directory, campaign.get("artifacts"), exclude=("campaign.json",))
    if campaign.get("source") != source_manifest(repository.resolve()):
        raise FoundryValidationError("campaign source differs from current source")
    lane_ids = strings(campaign.get("lanes"), "lanes")
    if not lane_ids:
        raise FoundryValidationError("campaign has no lanes")
    statuses: list[str] = []
    count = 0
    planned = 0
    for lane_id in lane_ids:
        # Validate membership before joining a lane directory.
        if lane_id not in OpportunityRegistry(repository / "foundry").lane_ids():
            raise FoundryValidationError("campaign names an unknown lane")
        lane_root = directory / lane_id
        plan = plan_from_document(
            repository,
            read_json(lane_root, "experiment.json"),
            read_bytes(lane_root, "dataset.json"),
        )
        if (
            plan.lane_id != lane_id
            or plan.document != load_plan(repository, lane_id).document
        ):
            raise FoundryValidationError(
                "campaign experiment differs from the current plan"
            )
        planned += len(plan.candidates) * len(plan.seeds) * plan.repetitions
        if campaign.get("status") == "cancelled":
            allowed = {
                _trial_path(candidate, seed, repeat)
                for candidate in plan.candidates
                for seed in plan.seeds
                for repeat in range(1, plan.repetitions + 1)
            }
            for receipt_path in lane_root.glob("runs/*/seed-*/repeat-*/receipt.json"):
                run_root = receipt_path.parent
                if run_root.relative_to(lane_root).as_posix() not in allowed:
                    raise FoundryValidationError(
                        "cancelled campaign has an unplanned attempt"
                    )
                verify_run(run_root, repository)
                count += 1
            continue
        summary, results = summarize_lane(repository, directory / lane_id)
        if summary != read_json(
            directory / lane_id, "summary.json"
        ) or results != read_json(directory / lane_id, "results.json"):
            raise FoundryValidationError("campaign summary differs from measured runs")
        count += len(records(results["experiments"]))
        statuses.append(str(summary["status"]))
    expected_status = (
        "cancelled"
        if campaign.get("status") == "cancelled"
        else (
            "completed"
            if all(status == "completed" for status in statuses)
            else "failed"
        )
    )
    if (
        campaign.get("status") != expected_status
        or campaign.get("attempts") != count
        or campaign.get("planned_attempts") != planned
    ):
        raise FoundryValidationError("campaign totals disagree with measured runs")
    return campaign


class ReferenceBenchmarkHarness:
    """Implement the public benchmark protocol over the registered lane fixtures."""

    def __init__(self, repository_root: Path, lane_id: str) -> None:
        self.repository = repository_root.resolve()
        self.plan = load_plan(self.repository, lane_id)

    async def run(self, spec: BenchmarkSpec, workspace: Path) -> BenchmarkResult:
        """Compare one named candidate without replacing its frozen dataset."""
        if (
            spec.candidate_id not in self.plan.candidates
            or spec.dataset != self.plan.document["dataset"]
        ):
            raise FoundryValidationError(
                "benchmark candidate or dataset differs from the plan"
            )
        declared = {str(row["name"]) for row in records(self.plan.document["metrics"])}
        if not set(spec.metrics).issubset(declared):
            raise FoundryValidationError("benchmark requests an undeclared metric")
        repetitions = integer(spec.repetitions, 2, 10, "repetitions")
        plan = replace(
            self.plan,
            document={
                **self.plan.document,
                "candidates": [spec.candidate_id],
                "repetitions": repetitions,
            },
        )
        with staging(workspace, self.repository / "foundry") as output:
            summary = await _run_lane(
                plan, self.repository, output / plan.lane_id, asyncio.Semaphore(2)
            )
        row = records(summary["candidates"])[0]
        stats = mapping(row["metrics"])
        measurements = {
            name: finite(mapping(stats[name])["mean"])
            for name in spec.metrics
            if name in stats
        }
        artifact = workspace / plan.lane_id / "summary.json"
        proof = EvidenceRecord(
            f"BENCH-{spec.benchmark_id.upper()}",
            spec.benchmark_id,
            "observed",
            f"{plan.lane_id}/summary.json",
            digest(artifact.read_bytes()),
        )
        return BenchmarkResult(
            spec.benchmark_id, str(row["status"]), measurements, (proof,)
        )
