# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/common.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/ingestion/drafts.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/contracts.py; CONSUMES libs/semantic_twin/ingestion/drafts.py
# Intent:      Keep evolution identities and wire data on the semantic twin serialization contract.
# ───────────────────────────────────────────────────────────────

"""Reuse strict semantic contracts and canonical serialization throughout the loop."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

from libs.semantic_twin.contracts import Contract, ContractError, require
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.ingestion.drafts import canonical_json


def json_value(value: object) -> object:
    """Project immutable contracts into the existing canonical JSON profile."""
    if isinstance(value, Contract):
        return value.to_dict()
    if isinstance(value, datetime):
        require(value.tzinfo is not None, "timestamp must have a timezone")
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, str):
        return str(value)
    if isinstance(value, Mapping):
        require(all(isinstance(k, str) for k in value), "object keys must be strings")
        return {k: json_value(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [json_value(v) for v in value]
    require(value is None or type(value) in (str, int, float, bool), "non-JSON value")
    return value


def digest(value: object) -> str:
    """Hash all supplied fields with the semantic twin's canonical profile."""
    return hashlib.sha256(canonical_json(json_value(value))).hexdigest()


def identity(namespace: str, value: object) -> SemanticId:
    """Address an immutable evolution artifact by its canonical content."""
    return SemanticId(f"cni://{namespace}/evolution/{digest(value)}")


def timestamp(value: object) -> datetime:
    """Parse an aware timestamp without inventing absent observation times."""
    require(isinstance(value, str), "timestamp must be ISO-8601 text")
    assert isinstance(value, str)
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ContractError("invalid ISO-8601 timestamp") from exc
    require(result.tzinfo is not None, "timestamp must have a timezone")
    return result.astimezone(timezone.utc)


def mapping(value: object) -> dict[str, object]:
    """Require a JSON object with string keys."""
    require(isinstance(value, Mapping), "expected an object")
    assert isinstance(value, Mapping)
    require(all(type(k) is str for k in value), "expected string keys")
    return dict(value)


def string_tuple(value: object) -> tuple[str, ...]:
    """Reject a scalar or mixed array where explicit names are required."""
    require(isinstance(value, (tuple, list)), "expected a string array")
    assert isinstance(value, (tuple, list))
    require(
        all(type(v) is str and bool(v.strip()) for v in value), "empty/non-text name"
    )
    return tuple(str(v) for v in value)


def decode_json(content: str | bytes) -> object:
    """Decode captured bytes, rejecting duplicate keys and non-finite numbers."""

    def pairs(items: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in items:
            require(key not in result, "duplicate JSON key")
            result[key] = value
        return result

    def invalid(value: str) -> object:
        raise ContractError("non-finite JSON value")

    try:
        return json.loads(
            content,
            object_pairs_hook=pairs,
            parse_constant=invalid,
        )
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ContractError("invalid JSON input") from exc


def read_json(path: Path) -> object:
    """Read and decode one strict local JSON snapshot."""
    try:
        content = path.read_bytes()
    except OSError as exc:
        raise ContractError(f"cannot read JSON input: {path.name}") from exc
    return decode_json(content)


def unique(values: tuple[str, ...], name: str) -> None:
    """Require nonempty, unique values without normalizing their identity."""
    require(len(values) == len(set(values)), f"duplicate {name}")
    require(all(v.strip() for v in values), f"empty {name}")
