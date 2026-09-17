# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/common.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     .bits/srs/SRS-BUILDANDDO-ESTATE-001.md
# EnumType:    Service
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-ESTATE-001.md
# DAG Node:    none
# Intent:      Keep estate serialization, diagnostics and typed errors consistent across compiler phases.
# ───────────────────────────────────────────────────────────────

"""Define deterministic serialization and evidence diagnostics."""

from __future__ import annotations

from dataclasses import dataclass, fields, is_dataclass
from functools import lru_cache
import hashlib
import json
from types import UnionType
from typing import TypeVar, Union, cast, get_args, get_origin, get_type_hints


class EstateError(ValueError):
    """Reject an incomplete or inconsistent estate compilation."""


@dataclass(frozen=True)
class Diagnostic:
    """Describe evidence that could not be established statically."""

    code: str
    subject: str
    message: str
    evidence_files: list[str]


def canonical_json(value: object) -> str:
    """Serialize a value without machine-dependent spacing or key ordering."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)


def content_hash(value: object) -> str:
    """Hash a canonical JSON value."""
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


T = TypeVar("T")


@lru_cache(maxsize=None)
def _hints(cls: type[object]) -> dict[str, object]:
    return cast(dict[str, object], get_type_hints(cls))


def _decode(expected: object, value: object) -> object:
    origin = get_origin(expected)
    arguments = get_args(expected)
    if origin in (Union, UnionType):
        for choice in arguments:
            try:
                return _decode(choice, value)
            except EstateError:
                pass
        raise EstateError("Invalid optional value in cached estate")
    if origin is list:
        if not isinstance(value, list):
            raise EstateError("Expected a list in cached estate")
        return [_decode(arguments[0], item) for item in value]
    if origin is dict:
        if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
            raise EstateError("Expected an object in cached estate")
        return {key: _decode(arguments[1], item) for key, item in value.items()}
    if isinstance(expected, type) and is_dataclass(expected):
        if not isinstance(value, dict):
            raise EstateError("Expected an estate record")
        names = {field.name for field in fields(expected)}
        if set(value) != names:
            raise EstateError("Unexpected or missing fields in cached estate record")
        decoded = {name: _decode(kind, value[name]) for name, kind in _hints(expected).items()}
        return expected(**decoded)
    if expected is float and type(value) in (int, float):
        return float(cast(float, value))
    if expected in (str, int, bool, type(None)) and type(value) is expected:
        return value
    raise EstateError("Invalid field type in cached estate")


def decode_record(cls: type[T], value: object) -> T:
    """Validate a cached dataclass recursively before exposing it to callers."""
    return cast(T, _decode(cls, value))

