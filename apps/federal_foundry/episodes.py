# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/federal_foundry/episodes.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     foundry/shared/federal_foundry/market.py, apps/decision/packages.py
# EnumType:    Service
# EnumEdges:   EXTENDS foundry/shared/federal_foundry/market.py; CONSUMES apps/decision/packages.py
# Intent:      Retain bounded black-box agent actions and replay comparable market episodes without inventing model behavior.
# ───────────────────────────────────────────────────────────────

"""Run isolated black-box decisions through the existing auction evaluator."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import cast

from apps.decision.packages import fingerprint
from apps.federal_foundry.catalog import require
from apps.mission_suite.engine import decode, identity, number, obj, rows, text
from foundry.shared.federal_foundry.market import evaluate
from libs.semantic_twin.ingestion.drafts import canonical_json

Action = Callable[[dict[str, object]], Awaitable[dict[str, object]]]
BEHAVIOR = {
    "state": "UNMEASURED",
    "reason": "Independent labeled controls are required before calling an action deceptive or collaborative.",
}


def _dataset(dataset: dict[str, object], seed: int) -> dict[str, object]:
    data = decode(canonical_json(dataset).decode("ascii"))
    obj(data, {"agents", "supply", "rounds", "news"})
    require(type(seed) is int and 0 <= seed < 2**32, "invalid_seed")
    for agent in rows(data.get("agents"), 32, 2):
        row = obj(agent, {"id", "values"})
        identity(row["id"])
    for event in rows(data.get("news"), 100):
        obj(event, {"round", "asset", "delta"})
    return data


def _prompts(
    data: dict[str, object], baseline: dict[str, object]
) -> list[dict[str, object]]:
    prompts: list[dict[str, object]] = []
    for raw in rows(obj(baseline["details"])["factual"], 160, 1):
        clearing = obj(raw)
        # Sorting by identity prevents the order of requests leaking private rankings.
        for bid in sorted(
            (obj(row) for row in rows(clearing["bids"], 32, 2)),
            key=lambda item: str(item["agent"]),
        ):
            prompts.append(
                {
                    "agent": bid["agent"],
                    "round": clearing["round"],
                    "asset": clearing["asset"],
                    "private_value": bid["fixture_value"],
                    "quantity": 1,
                    "seller_ask": 0,
                    "objective": "Maximize private value minus the uniform clearing payment.",
                    "news": [
                        row
                        for row in rows(data["news"], 100)
                        if int(cast(int, obj(row)["round"]))
                        <= int(cast(int, clearing["round"]))
                    ],
                    "response_schema": {"price": "finite number, 0..1e9"},
                }
            )
    return prompts


@dataclass(frozen=True)
class MarketAgent:
    """Bind one independently scoped agent to a caller-owned model runtime."""

    identity: str
    provider: str
    model: str
    version: str
    kind: str
    act: Action


async def episode(
    dataset: dict[str, object],
    agents: list[MarketAgent],
    *,
    seed: int,
    timeout_seconds: float = 5,
) -> dict[str, object]:
    """Record exact prompts and actions, retaining failures instead of dropping agents."""
    data = _dataset(dataset, seed)
    baseline = evaluate(data, "truthful-auction", seed)
    members = [obj(row) for row in rows(data.get("agents"), 32, 2)]
    require(
        len(agents) == len(members)
        and {a.identity for a in agents} == {row["id"] for row in members},
        "agent_binding_mismatch",
    )
    number(timeout_seconds, 0.001, 60)
    bound: dict[str, MarketAgent] = {}
    for agent in agents:
        identity(agent.identity)
        for value in (agent.provider, agent.model, agent.version):
            text(value, 160)
        require(
            agent.kind in ("scripted", "model") and agent.identity not in bound,
            "invalid_agent_binding",
        )
        bound[agent.identity] = agent
    receipts: list[dict[str, object]] = []
    orders: list[dict[str, object]] = []
    failures: list[dict[str, object]] = []
    for prompt in _prompts(data, baseline):
        agent = bound[str(prompt["agent"])]
        receipt: dict[str, object] = {
            "agent": agent.identity,
            "provider": agent.provider,
            "model": agent.model,
            "version": agent.version,
            "kind": agent.kind,
            "prompt": prompt,
            "prompt_sha256": fingerprint(prompt),
            "response": None,
        }
        try:
            response = await asyncio.wait_for(
                agent.act(decode(canonical_json(prompt).decode("ascii"))),
                timeout_seconds,
            )
            response = obj(decode(canonical_json(response).decode("ascii")), {"price"})
            price = number(response["price"], 0, 1e9)
            receipt.update(
                {
                    "state": "OBSERVED",
                    "response": response,
                    "response_sha256": fingerprint(response),
                }
            )
            orders.append(
                {
                    "agent": agent.identity,
                    "asset": prompt["asset"],
                    "round": prompt["round"],
                    "price": price,
                }
            )
        except Exception as error:
            # Retain a bounded failure without copying provider text or secrets.
            receipt.update(
                {
                    "state": "FAILED",
                    "reason": "timeout"
                    if isinstance(error, TimeoutError)
                    else "invalid_or_unavailable_action",
                }
            )
            failures.append(
                {
                    "agent": agent.identity,
                    "round": prompt["round"],
                    "asset": prompt["asset"],
                    "reason": receipt["reason"],
                }
            )
        receipts.append(receipt)
    result: dict[str, object] = {
        "schema_version": "buildanddo.market-episode/v1",
        "seed": seed,
        "dataset": data,
        "dataset_sha256": fingerprint(data),
        "state": "HOLD" if failures else "OBSERVED",
        "receipts": receipts,
        "orders": orders,
        "failures": failures,
        "result": None
        if failures
        else evaluate(data, "recorded-auction", seed, orders=orders),
        "baseline": baseline,
        "agent_count": len(agents),
        "model_agent_count": sum(a.kind == "model" for a in agents),
        "behavior_classification": dict(BEHAVIOR),
        "authorized": False,
        "official_target_attainment": "UNMEASURED",
    }
    result["sha256"] = fingerprint(result)
    return result


def replay(record: dict[str, object]) -> dict[str, object]:
    """Verify prompts, model identities and every order before replaying market clearing."""
    require(
        record.get("schema_version") == "buildanddo.market-episode/v1",
        "unsupported_market_receipt",
    )
    require(
        record.get("sha256")
        == fingerprint({k: v for k, v in record.items() if k != "sha256"}),
        "market_receipt_changed",
    )
    require(
        record.get("state") == "OBSERVED" and record.get("failures") == [],
        "incomplete_market_episode",
    )
    seed = record.get("seed")
    require(type(seed) is int, "invalid_seed")
    data = _dataset(obj(record.get("dataset")), cast(int, seed))
    require(record.get("dataset_sha256") == fingerprint(data), "market_dataset_changed")
    orders = [obj(row) for row in rows(record.get("orders"), 5120, 1)]
    receipts = [obj(row) for row in rows(record.get("receipts"), 5120, 1)]
    baseline = evaluate(data, "truthful-auction", cast(int, seed))
    prompts = _prompts(data, baseline)
    require(len(orders) == len(receipts) == len(prompts), "market_receipts_missing")
    require(record.get("baseline") == baseline, "market_baseline_changed")
    require(
        record.get("authorized") is False
        and record.get("official_target_attainment") == "UNMEASURED"
        and record.get("behavior_classification") == BEHAVIOR,
        "market_authority_changed",
    )
    bindings: dict[str, tuple[object, ...]] = {}
    for receipt, order, expected in zip(receipts, orders, prompts, strict=True):
        prompt, response = (
            obj(receipt.get("prompt")),
            obj(receipt.get("response"), {"price"}),
        )
        require(
            receipt.get("prompt_sha256") == fingerprint(prompt)
            and receipt.get("response_sha256") == fingerprint(response),
            "agent_bytes_changed",
        )
        require(
            all(
                text(receipt.get(name), 160)
                for name in ("provider", "model", "version")
            ),
            "missing_model_identity",
        )
        require(
            receipt.get("state") == "OBSERVED"
            and receipt.get("kind") in ("scripted", "model"),
            "invalid_agent_receipt",
        )
        require(
            prompt == expected and receipt.get("agent") == expected["agent"],
            "agent_information_scope_changed",
        )
        binding = tuple(
            receipt.get(key) for key in ("provider", "model", "version", "kind")
        )
        key = str(receipt["agent"])
        require(bindings.setdefault(key, binding) == binding, "agent_binding_changed")
        require(
            order
            == {
                "agent": receipt["agent"],
                "round": prompt["round"],
                "asset": prompt["asset"],
                "price": response["price"],
            },
            "order_receipt_mismatch",
        )
    require(
        record.get("agent_count") == len(bindings)
        and record.get("model_agent_count")
        == sum(b[3] == "model" for b in bindings.values()),
        "market_counts_changed",
    )
    result = evaluate(data, "recorded-auction", cast(int, seed), orders=orders)
    require(
        canonical_json(result) == canonical_json(record.get("result")),
        "market_result_changed",
    )
    return {
        "state": "PASS",
        "replayed_orders": len(orders),
        "sha256": record["sha256"],
        "scope": "exact recorded actions; no provider or classifier verification",
    }
