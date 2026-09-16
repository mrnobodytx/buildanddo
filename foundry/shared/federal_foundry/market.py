# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/market.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/validation.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/validation.py
# DAG Node:    none
# Intent:      Provide a replayable auction reference workload with explicit welfare denominators and scripted-agent limits.
# ───────────────────────────────────────────────────────────────

"""Evaluate a deterministic multi-asset auction on authored synthetic inputs."""

from __future__ import annotations

import random
from typing import NamedTuple

from .models import FoundryValidationError
from .validation import finite, integer, mapping, records, strings


class Bid(NamedTuple):
    """Record one unit bid and its true fixture valuation."""

    agent: str
    asset: str
    round: int
    value: float
    price: float


def evaluate(
    dataset: dict[str, object], candidate: str, seed: int
) -> dict[str, object]:
    """Clear seeded auctions and compare allocation value to the feasible optimum."""
    if candidate not in {"truthful-auction", "shaded-auction"}:
        raise FoundryValidationError("unknown auction candidate")
    agents = records(dataset.get("agents"), "agents")
    if not 2 <= len(agents) <= 32:
        raise FoundryValidationError("auction needs 2 to 32 scripted agents")
    identities = strings([row.get("id") for row in agents], "agents")
    supply_raw = mapping(dataset.get("supply"), "supply")
    if not 1 <= len(supply_raw) <= 8:
        raise FoundryValidationError("auction needs 1 to 8 assets")
    supply = {
        asset: integer(count, 1, len(agents), "supply")
        for asset, count in supply_raw.items()
    }
    rounds = integer(dataset.get("rounds"), 1, 20, "rounds")
    values = {str(row["id"]): mapping(row.get("values"), "values") for row in agents}
    for row in values.values():
        if set(row) != set(supply) or any(finite(v) <= 0 for v in row.values()):
            raise FoundryValidationError(
                "every agent must value every asset positively"
            )
    news = records(dataset.get("news"), "news")
    for event in news:
        integer(event.get("round"), 0, rounds - 1, "news round")
        if event.get("asset") not in supply:
            raise FoundryValidationError("news references an unknown asset")
        finite(event.get("delta"), "news delta")
    rng = random.Random(seed)
    # Freeze heterogeneity once; factual and counterfactual runs share it.
    adjustments = {
        (agent, asset): rng.randint(-3, 3)
        for agent in sorted(identities)
        for asset in sorted(supply)
    }
    sensitivities = {
        agent: rng.choice((0.5, 1.0, 1.5, 2.0)) for agent in sorted(identities)
    }
    shading = {agent: rng.uniform(0.35, 1.0) for agent in sorted(identities)}

    def auction(
        events: list[dict[str, object]],
    ) -> tuple[list[dict[str, object]], float, float]:
        output: list[dict[str, object]] = []
        total, optimal = 0.0, 0.0
        for round_id in range(rounds):
            for asset in sorted(supply):
                delta = sum(
                    finite(row["delta"])
                    for row in events
                    if row["asset"] == asset and int(str(row["round"])) <= round_id
                )
                bids: list[Bid] = []
                for agent in sorted(identities):
                    value = max(
                        0.01,
                        finite(values[agent][asset])
                        + adjustments[agent, asset]
                        + sensitivities[agent] * delta,
                    )
                    price = (
                        value
                        if candidate == "truthful-auction"
                        else value * shading[agent]
                    )
                    bids.append(
                        Bid(agent, asset, round_id, round(value, 6), round(price, 6))
                    )
                bids.sort(key=lambda bid: (-bid.price, bid.agent))
                winners = bids[: supply[asset]]
                clearing_price = (
                    bids[supply[asset]].price if supply[asset] < len(bids) else 0.0
                )
                achieved = sum(bid.value for bid in winners)
                optimum = sum(
                    sorted((bid.value for bid in bids), reverse=True)[: supply[asset]]
                )
                total += achieved
                optimal += optimum
                output.append(
                    {
                        "round": round_id,
                        "asset": asset,
                        "quantity": supply[asset],
                        "price": clearing_price,
                        "allocations": [bid.agent for bid in winners],
                        "utility": achieved,
                        "optimal_utility": optimum,
                        "bids": [
                            {
                                "agent": bid.agent,
                                "time": round_id,
                                "asset": asset,
                                "quantity": 1,
                                "price": bid.price,
                                "fixture_value": bid.value,
                            }
                            for bid in bids
                        ],
                    }
                )
        return output, total, optimal

    factual, total, optimum = auction(news)
    counterfactual, _, _ = auction([])
    changed = sum(
        a["allocations"] != b["allocations"]
        for a, b in zip(factual, counterfactual, strict=True)
    )
    return {
        "metrics": {
            "allocative_efficiency_pct": round(100 * total / optimum, 8),
            "total_utility": round(total, 6),
            "optimal_utility": round(optimum, 6),
            "agent_count": len(agents),
            "clearing_count": len(factual),
            "counterfactual_changes": changed,
        },
        "details": {
            "factual": factual,
            "counterfactual": counterfactual,
            "agent_kind": "scripted valuations; no LLM or behavioral classifier",
        },
        "limitations": [
            "Synthetic auction fixture; does not establish LLM-agent behavior, provider costs or federal target attainment."
        ],
    }
