# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/federal_foundry/evidence.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/federal_foundry/catalog.py, apps/mission_suite/engine.py, scripts/ci/evidence_epoch.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/federal_foundry/catalog.py; DEPENDS_ON apps/mission_suite/engine.py; DEPENDS_ON scripts/ci/evidence_epoch.py
# DAG Node:    none
# Intent:      Reject unsupported claims and unmatched bakeoffs by checking scoped receipt bytes, measurement kinds and independent declared reviews.
# ───────────────────────────────────────────────────────────────

"""Evaluate exact public receipts and compare explicitly matched experiments."""

from __future__ import annotations

import hashlib
import statistics
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from apps.mission_suite.engine import (
    decode,
    digest,
    identity,
    instant,
    number,
    obj,
    text,
)
from scripts.ci.evidence_epoch import sha256_json
from apps.federal_foundry.catalog import (
    FoundryError,
    KINDS,
    lane_for,
    named,
    objects,
    relative_path,
    require,
    seeds,
    strings,
    validate_catalog,
)

MAX_ARTIFACT_BYTES = 300000


@dataclass(frozen=True)
class Receipt:
    """Retain inspected measurement bytes and every declared review verdict."""

    data: dict[str, object]
    sha256: str
    path: str
    verdicts: tuple[str, ...]


def read_artifact(root: Path, reference: object) -> tuple[dict[str, object], str, str]:
    """Read one bounded regular receipt inside an explicit evidence directory."""
    ref = obj(reference, {"path", "sha256"})
    name = relative_path(ref["path"])
    expected = digest(ref["sha256"])
    require(root.is_dir() and not root.is_symlink(), "unsafe_artifact")
    base = root.resolve()
    path = base
    for part in name.split("/"):
        path = path / part
        require(not path.is_symlink(), "unsafe_artifact")
    require(
        path.resolve().is_relative_to(base)
        and path.is_file()
        and path.suffix == ".json"
        and path.stat().st_size <= MAX_ARTIFACT_BYTES,
        "unsafe_artifact",
    )
    with path.open("rb") as stream:
        data = stream.read(MAX_ARTIFACT_BYTES + 1)
    require(len(data) <= MAX_ARTIFACT_BYTES, "artifact_too_large")
    actual = hashlib.sha256(data).hexdigest()
    require(actual == expected, "artifact_hash_mismatch")
    try:
        document = decode(data.decode("utf-8"))
    except UnicodeError:
        raise FoundryError("invalid_artifact_encoding") from None
    return document, actual, name


def metric_values(receipt: dict[str, object], metric_id: str) -> list[float]:
    """Read validated measurements for a single metric in seed order."""
    for metric in objects(receipt["metrics"], 30):
        if metric["metric_id"] == metric_id:
            return [
                number(sample["value"], 0, 1e15)
                for sample in objects(metric["samples"], 100, 1)
            ]
    return []


def aggregate(values: list[float], policy: dict[str, object]) -> float:
    """Apply the catalogue's declared aggregate without substituting missing data."""
    require(bool(values), "measurement_missing")
    if policy["aggregate"] == "min":
        return min(values)
    if policy["aggregate"] == "max":
        return max(values)
    return statistics.mean(values)


def measurement(
    data: dict[str, object], lane: dict[str, object], evaluated_at: str
) -> None:
    """Validate receipt scope, provenance, finite measurements and public rights."""
    obj(
        data,
        {
            "schema_version",
            "record_id",
            "lane_id",
            "requirement_id",
            "candidate_id",
            "kind",
            "outcome",
            "measured_at",
            "producer",
            "source_sha256",
            "benchmark_sha256",
            "dataset_sha256",
            "scenario_id",
            "environment",
            "seeds",
            "metrics",
            "measurement_mode",
            "method",
            "command",
            "classification",
            "rights",
        },
    )
    require(
        data["schema_version"] == "federal.measurement/v1"
        and data["lane_id"] == lane["id"],
        "receipt_scope_mismatch",
    )
    identity(data["record_id"])
    require(
        text(data["requirement_id"], 80) in named(lane["requirements"]),
        "receipt_scope_mismatch",
    )
    require(
        text(data["candidate_id"], 80) in named(lane["candidates"]),
        "receipt_scope_mismatch",
    )
    require(
        data["kind"] in tuple(KINDS)
        and data["outcome"] in ("pass", "fail", "inconclusive"),
        "invalid_receipt",
    )
    require(instant(data["measured_at"]) <= instant(evaluated_at), "future_receipt")
    require(
        data["classification"] == "PUBLIC" and data["rights"] == "public_use_reviewed",
        "public_rights_required",
    )
    producer = obj(data["producer"], {"seat", "model"})
    identity(producer["seat"])
    if producer["model"] is not None:
        model = obj(
            producer["model"], {"provider", "model", "version", "configuration_sha256"}
        )
        for field in ("provider", "model", "version"):
            text(model[field], 160)
        digest(model["configuration_sha256"])
    digest(data["source_sha256"])
    digest(data["benchmark_sha256"])
    if data["dataset_sha256"] is not None:
        digest(data["dataset_sha256"])
    identity(data["scenario_id"])
    environment = obj(data["environment"], {"hardware", "runtime"})
    text(environment["hardware"], 160)
    text(environment["runtime"], 160)
    observed_seeds = seeds(data["seeds"], 0)
    require(data["measurement_mode"] in ("observed", "estimated"), "invalid_receipt")
    text(data["method"], 2400)
    strings(data["command"], 40, 1)
    policies = named(lane["metrics"], 30)
    metric_ids: set[str] = set()
    for metric in objects(data["metrics"], 30):
        obj(metric, {"metric_id", "unit", "samples"})
        metric_id = text(metric["metric_id"], 80)
        require(metric_id in policies and metric_id not in metric_ids, "invalid_metric")
        metric_ids.add(metric_id)
        policy = policies[metric_id]
        require(metric["unit"] == policy["unit"], "metric_unit_mismatch")
        samples = objects(metric["samples"], 100, 1)
        measured_seeds = []
        for sample in samples:
            obj(sample, {"seed", "value"})
            measured_seeds.append(sample["seed"])
            number(sample["value"], 0, 1 if policy["unit"] == "ratio" else 1e15)
        require(seeds(measured_seeds) == observed_seeds, "sample_seed_mismatch")
        require(data["dataset_sha256"] is not None, "dataset_required")


def load_evidence(
    catalog: dict[str, object],
    manifest: object,
    root: Path,
) -> tuple[dict[str, object], dict[str, object], list[Receipt]]:
    """Verify all referenced bytes before making any evidence assertion."""
    validate_catalog(catalog)
    document = obj(
        manifest, {"schema_version", "lane_id", "evaluated_at", "receipts", "reviews"}
    )
    require(document["schema_version"] == "federal.evidence/v1", "invalid_evidence")
    lane = lane_for(catalog, text(document["lane_id"], 80))
    at = text(document["evaluated_at"], 40)
    instant(at)
    records: dict[str, tuple[dict[str, object], str, str]] = {}
    paths: set[str] = set()
    for reference in objects(document["receipts"], 200):
        data, checksum, path = read_artifact(root, reference)
        measurement(data, lane, at)
        record_id = text(data["record_id"], 80)
        require(record_id not in records and path not in paths, "duplicate_receipt")
        records[record_id] = data, checksum, path
        paths.add(path)
    verdicts: dict[str, list[str]] = {key: [] for key in records}
    reviewers: set[tuple[str, str]] = set()
    for reference in objects(document["reviews"], 400):
        review, _checksum, path = read_artifact(root, reference)
        obj(
            review,
            {
                "schema_version",
                "record_id",
                "lane_id",
                "receipt_sha256",
                "reviewer_seat",
                "reviewed_at",
                "verdict",
                "notes",
            },
        )
        require(
            review["schema_version"] == "federal.review/v1"
            and review["lane_id"] == lane["id"],
            "review_scope_mismatch",
        )
        record_id = text(review["record_id"], 80)
        require(record_id in records and path not in paths, "review_scope_mismatch")
        paths.add(path)
        data, checksum, _path = records[record_id]
        require(digest(review["receipt_sha256"]) == checksum, "stale_review")
        seat = identity(review["reviewer_seat"])
        require(seat != obj(data["producer"])["seat"], "independent_verifier_required")
        require((record_id, seat) not in reviewers, "duplicate_review")
        reviewers.add((record_id, seat))
        require(
            instant(data["measured_at"])
            <= instant(review["reviewed_at"])
            <= instant(at),
            "invalid_review_time",
        )
        require(
            review["verdict"] in ("accepted", "rejected", "needs_work"),
            "invalid_review",
        )
        text(review["notes"], 2400)
        verdicts[record_id].append(str(review["verdict"]))
    return (
        lane,
        document,
        [
            Receipt(data, checksum, path, tuple(verdicts[record_id]))
            for record_id, (data, checksum, path) in records.items()
        ],
    )


def record_state(receipt: Receipt, lane: dict[str, object]) -> str:
    """Keep missing review, wrong evidence kinds and contrary results visible."""
    verdicts = set(receipt.verdicts)
    if "accepted" in verdicts and ("rejected" in verdicts or "needs_work" in verdicts):
        return "CONFLICT"
    if "rejected" in verdicts:
        return "REJECTED"
    if verdicts != {"accepted"}:
        return "UNREVIEWED"
    data = receipt.data
    requirement = named(lane["requirements"])[str(data["requirement_id"])]
    if data["kind"] != requirement["kind"] or data["measurement_mode"] != "observed":
        return "INSUFFICIENT_EVIDENCE"
    if data["outcome"] != "pass":
        return "FAIL" if data["outcome"] == "fail" else "INCONCLUSIVE"
    if requirement["metric_id"] is None:
        return "PASS"
    metric_id = str(requirement["metric_id"])
    values = metric_values(data, metric_id)
    if not values:
        return "MISSING_MEASUREMENT"
    if data["seeds"] != obj(lane["experiment"])["seeds"]:
        return "INSUFFICIENT_SEEDS"
    policy = named(lane["metrics"])[metric_id]
    if policy["target"] is None:
        return "TARGET_UNSET"
    value = aggregate(values, policy)
    target = number(policy["target"], 0, 1e15)
    passed = {
        "gte": value >= target,
        "gt": value > target,
        "lte": value <= target,
        "lt": value < target,
    }[str(policy["comparator"])]
    return "PASS" if passed else "FAIL"


def evaluate(
    catalog: dict[str, object], manifest: object, root: Path
) -> dict[str, object]:
    """Project admitted declared evidence into claims while retaining human gates."""
    lane, document, receipts = load_evidence(catalog, manifest, root)
    records: list[dict[str, object]] = []
    for receipt in receipts:
        data = receipt.data
        records.append(
            {
                "record_id": data["record_id"],
                "requirement_id": data["requirement_id"],
                "candidate_id": data["candidate_id"],
                "kind": data["kind"],
                "state": record_state(receipt, lane),
                "receipt_sha256": receipt.sha256,
                "path": receipt.path,
                "review_verdicts": list(receipt.verdicts),
            }
        )
    requirements: list[dict[str, object]] = []
    for name, requirement in named(lane["requirements"]).items():
        relevant = [row for row in records if row["requirement_id"] == name]
        candidate_states = []
        for candidate in named(lane["candidates"]):
            states = {
                str(row["state"])
                for row in relevant
                if row["candidate_id"] == candidate
            }
            if "CONFLICT" in states or (
                "PASS" in states and states & {"FAIL", "REJECTED"}
            ):
                candidate_state = "CONFLICT"
            elif states == {"PASS"}:
                candidate_state = "PASS"
            elif not states:
                candidate_state = "MISSING"
            elif len(states) == 1:
                candidate_state = next(iter(states))
            else:
                candidate_state = "PARTIAL"
            candidate_states.append(
                {"candidate_id": candidate, "state": candidate_state}
            )
        supported = [
            row["candidate_id"] for row in candidate_states if row["state"] == "PASS"
        ]
        observed = {
            row["state"] for row in candidate_states if row["state"] != "MISSING"
        }
        state = (
            "PASS"
            if supported
            else next(iter(observed))
            if len(observed) == 1
            else "PARTIAL"
            if observed
            else "MISSING"
        )
        requirements.append(
            {
                "id": name,
                "statement": requirement["statement"],
                "required_kind": requirement["kind"],
                "metric_id": requirement["metric_id"],
                "state": state,
                "record_ids": [row["record_id"] for row in relevant],
                "supported_candidates": supported,
                "candidate_states": candidate_states,
            }
        )
    support_by_id = {
        str(row["id"]): set(strings(row["supported_candidates"]))
        for row in requirements
    }
    claims = []
    for name, claim in named(lane["claims"]).items():
        # A composite claim cannot combine disjoint successes from different candidates.
        claim_candidates = set.intersection(
            *(support_by_id[ref] for ref in strings(claim["requirements"]))
        )
        state = "SUPPORTED_FOR_REVIEW" if claim_candidates else "UNSUPPORTED"
        claims.append(
            {
                "id": name,
                "statement": claim["statement"],
                "state": state,
                "requirements": claim["requirements"],
                "human_approved": False,
                "supported_candidates": sorted(claim_candidates),
            }
        )
    return {
        "schema_version": "federal.results/v1",
        "lane_id": lane["id"],
        "catalog_sha256": sha256_json(catalog),
        "evidence_manifest_sha256": sha256_json(document),
        "evaluated_at": document["evaluated_at"],
        "requirements": requirements,
        "claims": claims,
        "records": records,
        "requirements_with_passing_evidence": sum(
            row["state"] == "PASS" for row in requirements
        ),
        "requirements_total": len(requirements),
        "fully_supported_candidates": sorted(set.intersection(*support_by_id.values())),
        "submission_state": "HOLD",
        "submission_authorized": False,
        "human_gates": [
            {"gate": gate, "state": "PENDING"}
            for gate in strings(catalog["human_gates"])
        ],
        "verification_scope": "Receipt bytes and declared independent reviews; reviewer identity, experimental truth and official eligibility require operator verification.",
    }


def compare(
    catalog: dict[str, object],
    manifest: object,
    root: Path,
    metric_id: str,
    candidate_ids: list[str] | None = None,
) -> dict[str, object]:
    """Compare reviewed candidates only on a shared experiment and seed plan."""
    lane, _document, receipts = load_evidence(catalog, manifest, root)
    policies = named(lane["metrics"])
    require(metric_id in policies, "unknown_metric")
    policy = policies[metric_id]
    known = set(named(lane["candidates"]))
    candidates = candidate_ids if candidate_ids is not None else sorted(known)
    require(
        2 <= len(candidates) <= 20
        and len(candidates) == len(set(candidates))
        and set(candidates) <= known,
        "invalid_candidates",
    )
    base: dict[str, object] = {
        "schema_version": "federal.comparison/v1",
        "lane_id": lane["id"],
        "metric_id": metric_id,
        "unit": policy["unit"],
        "aggregate": policy["aggregate"],
        "requested_candidates": candidates,
        "state": "INCOMPARABLE",
        "rankings": [],
        "leading_candidate": None,
        "promotion_state": "HUMAN_REVIEW_REQUIRED",
        "statistical_inference": "descriptive_only",
    }
    matched: list[Receipt] = []
    gaps = []
    for candidate_id in candidates:
        options = [
            receipt
            for receipt in receipts
            if receipt.data["candidate_id"] == candidate_id
            and named(lane["requirements"])[str(receipt.data["requirement_id"])][
                "metric_id"
            ]
            == metric_id
            and metric_values(receipt.data, metric_id)
        ]
        if len(options) != 1:
            gaps.append(
                {
                    "candidate_id": candidate_id,
                    "reason": "missing_or_ambiguous_measurement",
                }
            )
            continue
        receipt = options[0]
        if (
            record_state(receipt, lane) not in ("PASS", "TARGET_UNSET", "FAIL")
            or receipt.data["outcome"] != "pass"
            or receipt.data["seeds"] != obj(lane["experiment"])["seeds"]
        ):
            gaps.append(
                {
                    "candidate_id": candidate_id,
                    "reason": "review_or_experiment_incomplete",
                }
            )
            continue
        matched.append(receipt)
    if gaps:
        return {**base, "gaps": gaps}
    conditions = [
        {
            key: receipt.data[key]
            for key in (
                "benchmark_sha256",
                "dataset_sha256",
                "scenario_id",
                "environment",
                "seeds",
                "kind",
                "measurement_mode",
            )
        }
        for receipt in matched
    ]
    if any(condition != conditions[0] for condition in conditions[1:]):
        return {**base, "gaps": [{"reason": "experiment_conditions_differ"}]}
    rankings: list[dict[str, object]] = []
    for receipt in matched:
        values = metric_values(receipt.data, metric_id)
        rankings.append(
            {
                "candidate_id": receipt.data["candidate_id"],
                "value": aggregate(values, policy),
                "mean": statistics.mean(values),
                "sample_stddev": statistics.stdev(values) if len(values) > 1 else None,
                "sample_count": len(values),
                "receipt_sha256": receipt.sha256,
                "source_sha256": receipt.data["source_sha256"],
                "producer": receipt.data["producer"],
                "meets_target": None
                if policy["target"] is None
                else record_state(receipt, lane) == "PASS",
            }
        )
    direction = -1 if policy["direction"] == "maximize" else 1
    rankings.sort(
        key=lambda row: (
            direction * cast(float, row["value"]),
            str(row["candidate_id"]),
        )
    )
    leading = (
        rankings[0]["candidate_id"]
        if rankings[0]["value"] != rankings[1]["value"]
        else None
    )
    return {
        **base,
        "state": "COMPARABLE_FOR_REVIEW",
        "rankings": rankings,
        "leading_candidate": leading,
        "experiment": conditions[0],
        "gaps": [],
    }
