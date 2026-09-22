# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/decision/packages.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/decision/primitives.py, apps/mission_suite/engine.py, libs/semantic_twin/ingestion/drafts.py
# EnumType:    Service
# EnumEdges:   EXTENDS apps/decision/primitives.py; CONSUMES apps/mission_suite/engine.py; CONSUMES libs/semantic_twin/ingestion/drafts.py
# Intent:      Preserve evidence-backed decision comparisons and refresh explanations without granting execution authority.
# ───────────────────────────────────────────────────────────────

"""Evaluate bounded decision packages and retain the inputs needed for replay."""

from __future__ import annotations

import hashlib
import math
from typing import cast

from apps.decision.primitives import DecisionValidationError
from apps.mission_suite.engine import decode, identity, instant, number, obj, rows, text
from libs.semantic_twin.ingestion.drafts import (
    GraphDraft,
    RelationDraft,
    canonical_json,
    make_object,
)
from libs.semantic_twin.vocabulary import EvidenceState, RelationPredicate
from libs.semantic_twin.ingestion.serializer import graph_payload

INPUT_SCHEMA = "buildanddo.decision-input/v1"
PACKAGE_SCHEMA = "buildanddo.decision-package/v1"


def fingerprint(value: object) -> str:
    """Hash the existing canonical JSON profile."""
    return hashlib.sha256(canonical_json(value)).hexdigest()


def require(condition: bool, message: str) -> None:
    """Reject a malformed decision contract."""
    if not condition:
        raise DecisionValidationError(message)


def _named(
    value: object, maximum: int = 32, minimum: int = 1
) -> dict[str, dict[str, object]]:
    result: dict[str, dict[str, object]] = {}
    for raw in rows(value, maximum, minimum):
        item = obj(raw)
        key = identity(item.get("id"))
        require(key not in result, "duplicate decision identity")
        result[key] = item
    return result


def evidence_record(
    name: str,
    tenant: str,
    value: float,
    source: str,
    source_sha256: str,
    observed_at: str,
    expires_at: str,
    *,
    synthetic: bool = False,
) -> dict[str, object]:
    """Bind a numeric observation to an exact source revision and validity window."""
    payload: dict[str, object] = {
        "id": name,
        "tenant_id": tenant,
        "value": value,
        "source": source,
        "source_sha256": source_sha256,
        "observed_at": observed_at,
        "expires_at": expires_at,
        "synthetic": synthetic,
    }
    return {**payload, "sha256": fingerprint(payload)}


def evaluate(document: dict[str, object], *, at: str) -> dict[str, object]:
    """Rank feasible alternatives using declared weights and current observed evidence.

    Scores use a weighted sum of min/max normalized measurements. All constraints
    are hard gates. Equal scores cause abstention; a missing, stale or conflicting
    observation holds the whole comparison instead of silently excluding a rival.
    """
    data = decode(canonical_json(document).decode("ascii"))
    obj(
        data,
        {
            "schema_version",
            "decision_id",
            "tenant_id",
            "question",
            "objective",
            "criteria",
            "options",
            "constraints",
            "assumptions",
            "risks",
            "bias_checks",
            "evidence",
        },
    )
    require(data["schema_version"] == INPUT_SCHEMA, "unsupported decision input")
    tenant = identity(data["tenant_id"])
    decision_id = identity(data["decision_id"])
    text(data["question"], 2400)
    text(data["objective"], 2400)
    current = instant(at)
    criteria = _named(data["criteria"], 16)
    for criterion in criteria.values():
        obj(criterion, {"id", "direction", "weight", "unit"})
        require(criterion["direction"] in ("maximize", "minimize"), "unknown direction")
        number(criterion["weight"], 0, 100)
        text(criterion["unit"], 80)
    total_weight = sum(float(cast(float, c["weight"])) for c in criteria.values())
    require(total_weight > 0, "at least one criterion must have positive weight")
    options = _named(data["options"])
    require(len(options) >= 2, "compare at least two alternatives")
    evidence = _named(data["evidence"], 128, 0)
    gaps: list[str] = []
    measurements: dict[str, dict[str, float]] = {}
    for key, item in evidence.items():
        obj(
            item,
            {
                "id",
                "tenant_id",
                "value",
                "source",
                "source_sha256",
                "observed_at",
                "expires_at",
                "synthetic",
                "sha256",
            },
        )
        require(item["tenant_id"] == tenant, "foreign evidence")
        require(type(item["synthetic"]) is bool, "evidence kind is required")
        source_hash = text(item["source_sha256"], 64)
        require(
            len(source_hash) == 64
            and all(c in "0123456789abcdef" for c in source_hash),
            "invalid source digest",
        )
        require(
            item["sha256"]
            == fingerprint({k: v for k, v in item.items() if k != "sha256"}),
            "changed evidence bytes",
        )
        text(item["source"], 2048)
        number(item["value"], -1e15, 1e15)
        observed, expiry = instant(item["observed_at"]), instant(item["expires_at"])
        require(observed < expiry, "invalid evidence window")
        if not observed <= current < expiry:
            gaps.append(f"Evidence {key} is stale or future dated.")
    for key, option in options.items():
        obj(option, {"id", "label", "measurements"})
        text(option["label"], 240)
        refs = obj(option["measurements"])
        require(set(refs) == set(criteria), "every alternative needs every criterion")
        measurements[key] = {}
        for criterion_id, raw_ref in refs.items():
            ref = identity(raw_ref)
            if ref not in evidence:
                gaps.append(f"Alternative {key} lacks evidence {ref}.")
            else:
                measurements[key][criterion_id] = number(
                    evidence[ref]["value"], -1e15, 1e15
                )
    constraints: list[dict[str, object]] = []
    for raw in rows(data["constraints"], 32):
        item = obj(raw, {"criterion", "operator", "threshold"})
        require(
            item["criterion"] in criteria and item["operator"] in ("gte", "lte"),
            "invalid hard constraint",
        )
        number(item["threshold"], -1e15, 1e15)
        constraints.append(item)
    for field in ("assumptions", "risks", "bias_checks"):
        for key, item in _named(data[field]).items():
            expected = {"id", "statement", "evidence_ids"} | (
                {"expires_at"}
                if field == "assumptions"
                else {"mitigation"}
                if field == "risks"
                else {"status"}
            )
            obj(item, expected)
            text(item["statement"], 2400)
            for evidence_ref in rows(item["evidence_ids"], 32, 1):
                if identity(evidence_ref) not in evidence:
                    gaps.append(f"{field} {key} has missing support.")
            if field == "assumptions" and instant(item["expires_at"]) <= current:
                gaps.append(f"Assumption {key} expired.")
            if field == "risks":
                text(item["mitigation"], 2400)
            if field == "bias_checks":
                require(
                    item["status"] in ("reviewed", "open", "conflicting"),
                    "invalid bias-check state",
                )
                if item["status"] != "reviewed":
                    gaps.append(f"Bias check {key} requires review.")
    tradeoffs: list[dict[str, object]] = []
    selected: str | None = None
    if not gaps:
        bounds = {
            key: (
                min(row[key] for row in measurements.values()),
                max(row[key] for row in measurements.values()),
            )
            for key in criteria
        }
        for key in sorted(options):
            values = measurements[key]
            failures = [
                f"{rule['criterion']} {rule['operator']} {rule['threshold']}"
                for rule in constraints
                if (
                    values[str(rule["criterion"])]
                    < float(cast(float, rule["threshold"]))
                    if rule["operator"] == "gte"
                    else values[str(rule["criterion"])]
                    > float(cast(float, rule["threshold"]))
                )
            ]
            components = {}
            for name, criterion in criteria.items():
                low, high = bounds[name]
                score = 0.5 if low == high else (values[name] - low) / (high - low)
                if criterion["direction"] == "minimize":
                    score = 1 - score
                components[name] = (
                    score * float(cast(float, criterion["weight"])) / total_weight
                )
            tradeoffs.append(
                {
                    "option": key,
                    "measurements": values,
                    "score": sum(components.values()),
                    "components": components,
                    "feasible": not failures,
                    "constraint_failures": failures,
                }
            )
        feasible = sorted(
            (row for row in tradeoffs if row["feasible"]),
            key=lambda row: (-float(cast(float, row["score"])), str(row["option"])),
        )
        if not feasible:
            gaps.append("No alternative satisfies every hard constraint.")
        elif len(feasible) > 1 and math.isclose(
            float(cast(float, feasible[0]["score"])),
            float(cast(float, feasible[1]["score"])),
            abs_tol=1e-12,
        ):
            gaps.append("The best alternatives tie; human preference is required.")
        else:
            selected = str(feasible[0]["option"])
    result: dict[str, object] = {
        "schema_version": PACKAGE_SCHEMA,
        "decision_id": decision_id,
        "tenant_id": tenant,
        "evaluated_at": at,
        "input": data,
        "input_sha256": fingerprint(data),
        "decision": {
            "state": "HOLD" if gaps else "RECOMMENDATION",
            "selected": selected,
            "gaps": sorted(set(gaps)),
        },
        "tradeoffs": tradeoffs,
        "decision_flip_conditions": {
            "hard_constraints": constraints,
            "scoring": "weighted_minmax",
            "reevaluate_on": [
                "evidence revision",
                "assumption expiry",
                "constraint change",
                "weight change",
                "bias conflict",
            ],
            "tie_policy": "abstain",
        },
        "verification": {
            "state": "UNMEASURED",
            "reviewer": None,
            "requires_independent_review": True,
        },
        "human_approval": {"state": "PENDING", "approver": None},
        "authority": "A0",
        "verified": False,
        "authorized": False,
        "synthetic": any(item["synthetic"] for item in evidence.values()),
    }
    result["sha256"] = fingerprint(result)
    return result


def verify(package: dict[str, object]) -> bool:
    """Recompute a package instead of trusting its recommendation or digest alone."""
    require(package.get("schema_version") == PACKAGE_SCHEMA, "unsupported package")
    reproduced = evaluate(
        obj(package.get("input")), at=text(package.get("evaluated_at"), 40)
    )
    require(
        canonical_json(reproduced) == canonical_json(package), "package does not replay"
    )
    return True


def refresh(
    previous: dict[str, object], document: dict[str, object], *, at: str
) -> dict[str, object]:
    """Keep both revisions and explain changed inputs and recommendations."""
    verify(previous)
    result = evaluate(document, at=at)
    require(
        result["decision_id"] == previous["decision_id"]
        and result["tenant_id"] == previous["tenant_id"],
        "refresh changes decision identity",
    )
    require(
        instant(at) >= instant(previous["evaluated_at"]), "refresh precedes history"
    )
    before = obj(previous["input"])
    after = obj(result["input"])
    changed = [
        key
        for key in sorted(before)
        if canonical_json(before[key]) != canonical_json(after[key])
    ]
    old_evidence, new_evidence = (
        _named(before["evidence"], 128, 0),
        _named(after["evidence"], 128, 0),
    )
    evidence_changes = [
        {"id": key, "before": old_evidence.get(key), "after": new_evidence.get(key)}
        for key in sorted(old_evidence.keys() | new_evidence.keys())
        if old_evidence.get(key) != new_evidence.get(key)
    ]
    return {
        "schema_version": "buildanddo.decision-refresh/v1",
        "previous_sha256": previous["sha256"],
        "current_sha256": result["sha256"],
        "previous": previous,
        "current": result,
        "changed_fields": changed,
        "flipped": obj(previous["decision"])["selected"]
        != obj(result["decision"])["selected"],
        "evidence_changes": evidence_changes,
        "explanation": "Recomputed the declared policy over the retained changed inputs; this is a model dependency, not proof of real-world causality.",
        "authorized": False,
    }


def semantic_graph(package: dict[str, object]) -> dict[str, object]:
    """Project the package into the existing canonical Twin envelope vocabulary."""
    verify(package)
    data = obj(package["input"])
    evidence = _named(data["evidence"], 128, 0)
    decision_key = f"{package['tenant_id']}:{package['decision_id']}"
    source = "decision/input.json"
    drafts = [
        make_object(
            decision_key,
            "Decision",
            source,
            claims=(
                {
                    "package_sha256": package["sha256"],
                    "decision": package["decision"],
                    "authorized": False,
                },
            ),
            evidence_state=EvidenceState.INFERRED,
            input_digest=str(package["input_sha256"]),
            relations=tuple(
                RelationDraft(
                    RelationPredicate.DERIVED_FROM,
                    f"{decision_key}:{key}",
                    (source,),
                    confidence=None,
                    state=EvidenceState.INFERRED,
                )
                for key in sorted(evidence)
            ),
        )
    ]
    drafts.extend(
        make_object(
            f"{decision_key}:{key}",
            "Observation",
            source,
            claims=({"observation": item, "externally_verified": False},),
            input_digest=str(package["input_sha256"]),
        )
        for key, item in sorted(evidence.items())
    )
    graph = GraphDraft(tuple(drafts)).resolve(
        observed_at=instant(package["evaluated_at"])
    )
    return cast(dict[str, object], graph_payload(graph))
