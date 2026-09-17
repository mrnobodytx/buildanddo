# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/decision/adapters/service.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/contract.py, apps/research/blueprints.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/decision/contract.py; DEPENDS_ON apps/research/blueprints.py
# DAG Node:    none
# Intent:      Run authenticated application decisions and blueprint analysis through a bounded local CPU process.
# ───────────────────────────────────────────────────────────────

"""Run a bounded local decision or blueprint request in a disposable process."""
from __future__ import annotations

import asyncio
import base64
import binascii
import json
import sys
from time import perf_counter
from typing import cast

from apps.decision.contract import decide
from apps.decision.primitives import DecisionValidationError, question_from_dict
from apps.decision.router import AUTHORITY
from apps.decision.adapters.blueprint_to_components import blueprint_to_components
from apps.decision.adapters.components_to_missions import components_to_missions
from apps.decision.adapters.contracts import BlueprintPlanError
from apps.decision.adapters.missions_to_sessions import missions_to_sessions
from apps.decision.workloads.blueprint_evaluation import evaluate_blueprint
from apps.research.blueprints import extract_blueprint
from apps.research.contracts import MAX_FILE, ResearchError, object_value, text
from apps.research.documents import limit_resources

MAX_REQUEST = 28 * 1024 * 1024
MAX_RESPONSE = 12 * 1024 * 1024


def json_object(data: bytes) -> dict[str, object]:
    """Decode a bounded strict JSON object, rejecting non-finite constants."""
    def invalid_constant(_value: str) -> object:
        raise ResearchError("invalid_data")

    try:
        return object_value(json.loads(data, parse_constant=invalid_constant))
    except (ValueError, UnicodeError, RecursionError):
        raise ResearchError("invalid_data") from None


async def dispatch(operation: str, payload: dict[str, object]) -> dict[str, object]:
    """Evaluate only declared operations with no external calls or actions."""
    if operation == "decide":
        if set(payload) - {"state", "questions", "evidence", "authority", "trace_id"}:
            raise ResearchError("invalid_data")
        questions = object_value(payload.get("questions"))
        if not 1 <= len(questions) <= 32:
            raise ResearchError("invalid_data")
        authority = payload.get("authority", "A0")
        if not isinstance(authority, str) or authority not in AUTHORITY:
            raise ResearchError("authority_denied")
        selected = {name: question_from_dict(object_value(value)) for name, value in questions.items()}
        started = perf_counter()
        result = await decide(cast(dict[str, object] | str, payload.get("state")), selected,
                              evidence=cast(bool, payload.get("evidence", False)), authority=authority,
                              trace_id=cast(str | None, payload.get("trace_id")))
        response = result.to_dict()
        # Actual local execution latency replaces the Phase 1 backend estimates.
        response["latency_ms"] = round((perf_counter() - started) * 1000, 3)
        return response
    if operation != "blueprint" or set(payload) - {"pdf_base64", "name", "authority", "include_prompts"}:
        raise ResearchError("invalid_data")
    if payload.get("authority", "A0") != "A0":
        raise ResearchError("authority_denied")
    if type(payload.get("include_prompts", False)) is not bool:
        raise ResearchError("invalid_data")
    name = text(payload.get("name"), 180)
    encoded = payload.get("pdf_base64")
    if not isinstance(encoded, str) or len(encoded) > (MAX_FILE + 2) // 3 * 4:
        raise ResearchError("too_large")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise ResearchError("invalid_data") from None
    blueprint = extract_blueprint(data, name)
    if len(blueprint.requirements) > 500:
        raise ResearchError("too_large")
    evaluations = await evaluate_blueprint(blueprint)
    graph = blueprint_to_components(blueprint, evaluations)
    response = {"blueprint": blueprint.to_dict(), "evaluations": [e.to_dict() for e in evaluations],
                "component_graph": graph.to_dict(), "mission_plan": None, "session_prompts": [],
                "planning_error": None, "authority": "A0", "verified": False}
    try:
        mission = components_to_missions(graph)
    except BlueprintPlanError as error:
        # Preserve extraction/evaluation for review when a graph cannot be ordered.
        response["planning_error"] = error.reason
        return response
    response["mission_plan"] = mission.to_dict()
    if payload.get("include_prompts"):
        response["session_prompts"] = [prompt.to_dict() for prompt in missions_to_sessions(mission)]
    return response


def process_request(data: bytes) -> bytes:
    """Return bounded JSON or a sanitized error envelope."""
    try:
        if len(data) > MAX_REQUEST:
            raise ResearchError("too_large")
        request = json_object(data)
        if set(request) != {"operation", "payload"}:
            raise ResearchError("invalid_data")
        result = asyncio.run(dispatch(text(request["operation"], 20), object_value(request["payload"])))
        encoded = json.dumps(result, ensure_ascii=True, separators=(",", ":"), allow_nan=False).encode()
        if len(encoded) > MAX_RESPONSE:
            raise ResearchError("too_large")
        return encoded
    except DecisionValidationError:
        return b'{"failure":"invalid_data"}'
    except ResearchError as error:
        return json.dumps({"failure": error.reason}).encode()
    except Exception:
        return b'{"failure":"invalid_data"}'


def main() -> int:
    """Read a single request from stdin inside the parser resource limits."""
    limit_resources()
    result = process_request(sys.stdin.buffer.read(MAX_REQUEST + 1))
    sys.stdout.buffer.write(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
