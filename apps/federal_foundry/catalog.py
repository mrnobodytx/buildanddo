# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/federal_foundry/catalog.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/mission_suite/engine.py, apps/federal_foundry/opportunities.json
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/mission_suite/engine.py; DEPENDS_ON apps/federal_foundry/opportunities.json
# DAG Node:    none
# Intent:      Validate research-lane identities, requirements and evidence policies before agent intake or artifact generation.
# ───────────────────────────────────────────────────────────────

"""Validate the owner-supplied portfolio without promoting its research claims."""

from __future__ import annotations

import re
from pathlib import Path
from typing import NoReturn

from apps.mission_suite.engine import decode, number, obj, rows, text
from apps.research.contracts import ResearchError

ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = ROOT / "apps/federal_foundry/opportunities.json"
KINDS = {"source_test", "simulation", "empirical", "physical"}
DELIVERABLES = (
    "requirements_matrix.md",
    "claim_evidence_matrix.md",
    "architecture.md",
    "experiment_plan.md",
    "results.json",
    "benchmark_report.md",
    "gap_report.md",
    "risk_register.md",
    "SOW.md",
    "commercialization.md",
    "whitepaper.md",
    "slides/outline.md",
    "submission_checklist.md",
)


class FoundryError(ResearchError):
    """Carry a bounded portfolio failure without disclosing inputs or paths."""


def reject(reason: str = "invalid_portfolio") -> NoReturn:
    """Reject an unsupported catalogue, receipt or execution contract."""
    raise FoundryError(reason)


def require(condition: bool, reason: str = "invalid_portfolio") -> None:
    """Require a protocol invariant."""
    if not condition:
        reject(reason)


def objects(
    value: object, maximum: int = 100, minimum: int = 0
) -> list[dict[str, object]]:
    """Read a bounded list of objects."""
    return [obj(item) for item in rows(value, maximum, minimum)]


def strings(value: object, maximum: int = 100, minimum: int = 0) -> list[str]:
    """Read bounded nonempty text entries."""
    return [text(item, 2400) for item in rows(value, maximum, minimum)]


def slug(value: object) -> str:
    """Require an identifier safe for a generated lane directory."""
    result = text(value, 80)
    require(re.fullmatch(r"[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*", result) is not None)
    return result


def relative_path(value: object) -> str:
    """Require a public relative artifact path without ambiguous components."""
    name = text(value, 240)
    parts = name.split("/")
    require(
        all(
            re.fullmatch(r"[A-Za-z0-9_.-]+", part) and part not in {".", ".."}
            for part in parts
        )
        and not any(part.startswith(".env") for part in parts)
        and not any(
            part in {"_meta", "secrets", "private", "golden", "infra"} for part in parts
        ),
        "unsafe_artifact",
    )
    return name


def named(
    value: object, maximum: int = 100, minimum: int = 1
) -> dict[str, dict[str, object]]:
    """Index unique named catalogue records."""
    result: dict[str, dict[str, object]] = {}
    for item in objects(value, maximum, minimum):
        name = slug(item.get("id"))
        require(name not in result)
        result[name] = item
    return result


def seeds(value: object, minimum: int = 1) -> list[int]:
    """Require unique ordered experiment seeds."""
    values = rows(value, 100, minimum)
    result: list[int] = []
    for value_item in values:
        require(type(value_item) is int and 0 <= value_item <= 2147483647)
        result.append(int(number(value_item, 0, 2147483647)))
    require(result == sorted(set(result)))
    return result


def validate_lane(lane: dict[str, object]) -> None:
    """Validate a lane's references, measurement policy and milestone DAG."""
    obj(
        lane,
        {
            "id",
            "srs_code",
            "title",
            "mode",
            "topic",
            "objective",
            "eligibility",
            "submission_format",
            "requirements",
            "metrics",
            "candidates",
            "architecture",
            "risks",
            "reuse",
            "deadline",
            "deliverables",
            "milestones",
            "claims",
            "evidence_required",
            "evidence_available",
            "evidence_missing",
            "experiment",
        },
    )
    slug(lane["id"])
    require(
        re.fullmatch(r"SRS-BUILDANDDO-FEDERAL-[A-Z-]+-001", text(lane["srs_code"], 100))
        is not None
    )
    text(lane["title"], 160)
    text(lane["objective"], 2400)
    require(
        lane["mode"]
        in (
            "full_effort",
            "research_prototype",
            "prototype_and_evidence",
            "harden_existing",
        )
    )
    topic = obj(lane["topic"], {"agency", "reference", "status", "official_url"})
    text(topic["agency"], 100)
    text(topic["reference"], 160)
    # Official verification must be a reviewed source change, never a model assertion.
    require(topic["status"] == "unverified" and topic["official_url"] is None)
    eligibility = obj(lane["eligibility"], {"status", "checks"})
    require(eligibility["status"] == "unverified")
    strings(eligibility["checks"], 20, 1)
    deadline = obj(lane["deadline"], {"value", "status"})
    require(deadline == {"value": None, "status": "unverified"})
    submission = obj(lane["submission_format"], {"status", "notes"})
    require(submission["status"] == "unverified")
    text(submission["notes"], 2400)
    require(strings(lane["deliverables"]) == list(DELIVERABLES))
    metrics = named(lane["metrics"], 30)
    for metric in metrics.values():
        obj(metric, {"id", "unit", "direction", "target", "comparator", "aggregate"})
        require(
            metric["unit"]
            in ("ratio", "agents", "ms", "USD", "MiB", "J", "parameters", "kbit/s")
        )
        require(metric["direction"] in ("maximize", "minimize"))
        require(metric["aggregate"] in ("mean", "min", "max"))
        require(
            metric["comparator"]
            in (("gte", "gt") if metric["direction"] == "maximize" else ("lte", "lt"))
        )
        if metric["target"] is not None:
            number(metric["target"], 0, 1 if metric["unit"] == "ratio" else 1e15)
    requirements = named(lane["requirements"], 50)
    for requirement in requirements.values():
        obj(requirement, {"id", "statement", "kind", "metric_id"})
        text(requirement["statement"], 2400)
        require(requirement["kind"] in tuple(KINDS))
        require(
            requirement["metric_id"] is None
            or (
                isinstance(requirement["metric_id"], str)
                and requirement["metric_id"] in metrics
            )
        )
    required = objects(lane["evidence_required"], 50, 1)
    require(len(required) == len(requirements))
    for item in required:
        obj(item, {"requirement_id", "kind"})
    require(
        {str(item["requirement_id"]): item["kind"] for item in required}
        == {key: value["kind"] for key, value in requirements.items()}
    )
    require(lane["evidence_available"] == [])
    strings(lane["evidence_missing"], 30, 1)
    for claim in named(lane["claims"], 50).values():
        obj(claim, {"id", "statement", "requirements"})
        text(claim["statement"], 2400)
        refs = strings(claim["requirements"], 50, 1)
        require(len(refs) == len(set(refs)) and set(refs) <= set(requirements))
    candidates = named(lane["candidates"], 20, 2)
    for candidate in candidates.values():
        obj(candidate, {"id", "approach"})
        text(candidate["approach"], 2400)
    milestones = named(lane["milestones"], 20)
    visited: set[str] = set()
    visiting: set[str] = set()

    def visit(name: str) -> None:
        require(name in milestones and name not in visiting)
        if name in visited:
            return
        visiting.add(name)
        step = obj(milestones[name], {"id", "objective", "depends_on"})
        text(step["objective"], 2400)
        depends = strings(step["depends_on"], 20)
        require(len(depends) == len(set(depends)))
        for dependency in depends:
            visit(dependency)
        visiting.remove(name)
        visited.add(name)

    for name in milestones:
        visit(name)
    experiment = obj(lane["experiment"], {"seeds", "dataset_status", "controls"})
    seeds(experiment["seeds"])
    require(experiment["dataset_status"] == "required")
    strings(experiment["controls"], 30, 1)
    strings(lane["architecture"], 30, 1)
    for path in strings(lane["reuse"], 30, 1):
        relative_path(path)
    for risk in objects(lane["risks"], 30, 1):
        obj(risk, {"risk", "mitigation"})
        text(risk["risk"], 2400)
        text(risk["mitigation"], 2400)


def validate_catalog(document: object) -> dict[str, object]:
    """Reject duplicate lanes, invalid scope and inconsistent evidence policies."""
    data = obj(
        document,
        {
            "schema_version",
            "owner",
            "source_status",
            "registration",
            "max_parallel_lanes",
            "shared_components",
            "human_gates",
            "inactive_lanes",
            "opportunities",
        },
    )
    require(
        data["schema_version"] == "federal.portfolio/v1"
        and data["owner"] == "Citadel Nexus Inc."
    )
    text(data["source_status"], 2400)
    require(
        obj(data["registration"])
        == {
            "srs_code": "SRS-BUILDANDDO-UPGRADE-001",
            "dispatch_id": "VCC-BUILDANDDO-UPGRADE-001",
        }
    )
    maximum = data["max_parallel_lanes"]
    require(type(maximum) is int and 1 <= maximum <= 5)
    strings(data["human_gates"], 30, 1)
    for component in named(data["shared_components"], 20).values():
        obj(component, {"id", "intent", "source_paths"})
        text(component["intent"], 2400)
        for path in strings(component["source_paths"], 20, 1):
            relative_path(path)
    lanes = named(data["opportunities"], 5, 1)
    for lane in lanes.values():
        validate_lane(lane)
    require(len(lanes) == len({str(lane["srs_code"]) for lane in lanes.values()}))
    for inactive in objects(data["inactive_lanes"], 10):
        obj(inactive, {"id", "state", "verification", "active"})
        require(slug(inactive["id"]) not in lanes and inactive["active"] is False)
        require(
            inactive["state"] == "submission_reported_by_owner"
            and inactive["verification"] == "not_observed"
        )
    return data


def load_catalog(path: Path = CATALOG_PATH) -> dict[str, object]:
    """Load the reviewed repository catalogue using the existing strict JSON reader."""
    require(path.is_file() and not path.is_symlink(), "catalog_unavailable")
    return validate_catalog(decode(path.read_text(encoding="utf-8")))


def lane_for(catalog: dict[str, object], lane_id: str) -> dict[str, object]:
    """Select a known lane without accepting a caller-provided path."""
    lanes = named(catalog["opportunities"])
    require(lane_id in lanes, "unknown_lane")
    return lanes[lane_id]
