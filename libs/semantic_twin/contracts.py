# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/contracts.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     none
# EnumType:    Schema
# EnumEdges:   EXTENDS .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-001.md
# DAG Node:    semantic-twin.phase-0.wire
# Intent:      Make every P0 contract strictly typed, deeply immutable and round-trippable without runtime dependencies.
# ───────────────────────────────────────────────────────────────

"""Validate and serialize immutable dataclass contracts using the standard library."""

from __future__ import annotations

import json
import math
import types
from collections.abc import Mapping
from dataclasses import MISSING, fields
from datetime import datetime, timezone
from enum import Enum
from types import MappingProxyType
from typing import (
    Any,
    ClassVar,
    Literal,
    Self,
    Union,
    get_args,
    get_origin,
    get_type_hints,
)

SCHEMA_VERSION = "2"


class CitadelError(Exception):
    """Identify a local semantic contract error without private-stack imports."""


class ContractError(CitadelError, ValueError):
    """Report invalid or inconsistent contract data."""


def require(condition: bool, message: str) -> None:
    """Reject a contract condition with a typed error."""
    if not condition:
        raise ContractError(message)


def text(value: str, name: str) -> None:
    """Require meaningful text without silently trimming identity."""
    require(isinstance(value, str) and bool(value.strip()), f"{name} must be non-empty")


class WireString(str):
    """Mark a validated string subtype for lossless wire decoding."""


def freeze_json(value: object, ancestors: frozenset[int] = frozenset()) -> object:
    """Copy JSON data into immutable containers and reject cycles or foreign types."""
    if value is None or type(value) in (str, bool, int):
        return value
    if type(value) is float:
        require(math.isfinite(value), "JSON numbers must be finite")
        return value
    require(id(value) not in ancestors, "JSON data must not contain cycles")
    seen = ancestors | {id(value)}
    if isinstance(value, Mapping):
        require(all(type(k) is str for k in value), "JSON object keys must be strings")
        return MappingProxyType({k: freeze_json(v, seen) for k, v in value.items()})
    if isinstance(value, (tuple, list)):
        return tuple(freeze_json(v, seen) for v in value)
    raise ContractError(f"unsupported JSON value: {type(value).__name__}")


_TYPE_HINTS: dict[type[Contract], dict[str, Any]] = {}


def _hints(cls: type[Contract]) -> dict[str, Any]:
    if cls not in _TYPE_HINTS:
        _TYPE_HINTS[cls] = get_type_hints(cls)
    return _TYPE_HINTS[cls]


def _decode(value: Any, annotation: Any, *, wire: bool) -> Any:
    origin, args = get_origin(annotation), get_args(annotation)
    if annotation is object:
        return freeze_json(value)
    if origin in (Union, types.UnionType):
        for alternative in args:
            try:
                return _decode(value, alternative, wire=wire)
            except (ContractError, TypeError):
                continue
        raise ContractError("value does not match any permitted type")
    if origin is Literal:
        require(
            any(type(value) is type(v) and value == v for v in args), f"expected {args}"
        )
        return value
    if origin is tuple:
        require(isinstance(value, (list, tuple)), "expected an array")
        require(
            len(args) == 2 and args[1] is Ellipsis,
            "only homogeneous arrays are supported",
        )
        return tuple(_decode(v, args[0], wire=wire) for v in value)
    if origin is Mapping:
        require(isinstance(value, Mapping), "expected an object")
        return MappingProxyType(
            {
                _decode(k, args[0], wire=wire): _decode(v, args[1], wire=wire)
                for k, v in value.items()
            }
        )
    if annotation is type(None):
        require(value is None, "expected null")
    elif annotation is datetime:
        if wire and type(value) is str:
            try:
                value = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as exc:
                raise ContractError("invalid ISO-8601 timestamp") from exc
        require(isinstance(value, datetime), "expected a timestamp")
        require(
            value.tzinfo is not None and value.utcoffset() is not None,
            "timestamp must be timezone-aware",
        )
        return value.astimezone(timezone.utc)
    elif isinstance(annotation, type) and issubclass(annotation, WireString):
        require(isinstance(value, str), "expected an identifier string")
        return annotation(value)
    elif isinstance(annotation, type) and issubclass(annotation, Enum):
        if wire and type(value) is str:
            try:
                return annotation(value)
            except ValueError as exc:
                raise ContractError(f"unknown {annotation.__name__} value") from exc
        require(type(value) is annotation, f"expected {annotation.__name__}")
    elif isinstance(annotation, type) and issubclass(annotation, Contract):
        if wire:
            require(
                isinstance(value, Mapping), f"expected {annotation.__name__} object"
            )
            return annotation.from_dict(value)
        require(type(value) is annotation, f"expected {annotation.__name__}")
    elif annotation is float:
        require(
            type(value) in (float, int) and math.isfinite(value),
            "expected a finite number",
        )
        return float(value)
    else:
        require(
            type(value) is annotation,
            f"expected {getattr(annotation, '__name__', annotation)}",
        )
    return value


def _encode(value: object) -> Any:
    if isinstance(value, Contract):
        return value.to_dict()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, Mapping):
        return {k: _encode(v) for k, v in value.items()}
    if isinstance(value, tuple):
        return [_encode(v) for v in value]
    if isinstance(value, WireString):
        return str(value)
    return value


class Contract:
    """Supply strict runtime validation, JSON Schema and immutable wire conversion."""

    __slots__ = ()
    WIRE_ALIASES: ClassVar[Mapping[str, str]] = MappingProxyType({})

    def __post_init__(self) -> None:
        """Validate annotated fields, defensively copying every collection."""
        hints = _hints(type(self))
        for f in fields(self):  # type: ignore[arg-type]
            try:
                value = _decode(getattr(self, f.name), hints[f.name], wire=False)
            except (ContractError, TypeError) as exc:
                raise ContractError(f"{type(self).__name__}.{f.name}: {exc}") from exc
            object.__setattr__(self, f.name, value)

    def to_dict(self) -> dict[str, Any]:
        """Return a detached JSON-compatible projection of this contract."""
        return {
            self.WIRE_ALIASES.get(f.name, f.name): _encode(getattr(self, f.name))
            for f in fields(self)  # type: ignore[arg-type]
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, object]) -> Self:
        """Parse a wire object, rejecting unknown fields and invalid nested data."""
        require(isinstance(payload, Mapping), "wire payload must be an object")
        declared = {cls.WIRE_ALIASES.get(f.name, f.name): f for f in fields(cls)}  # type: ignore[arg-type]
        require(
            not payload.keys() - declared.keys(), f"unknown fields in {cls.__name__}"
        )
        values: dict[str, Any] = {}
        for name, f in declared.items():
            if name not in payload:
                require(
                    f.default is not MISSING or f.default_factory is not MISSING,
                    f"missing field: {name}",
                )
                continue
            try:
                values[f.name] = _decode(payload[name], _hints(cls)[f.name], wire=True)
            except (ContractError, TypeError) as exc:
                raise ContractError(f"{cls.__name__}.{name}: {exc}") from exc
        return cls(**values)

    def to_json(self) -> str:
        """Serialize the P0 JSON profile with sorted keys and stable UTC timestamps."""
        return json.dumps(
            self.to_dict(),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )

    @classmethod
    def from_json(cls, payload: str) -> Self:
        """Decode JSON while rejecting duplicate keys and non-finite constants."""

        def pairs(items: list[tuple[str, object]]) -> dict[str, object]:
            result: dict[str, object] = {}
            for key, value in items:
                require(key not in result, f"duplicate JSON key: {key}")
                result[key] = value
            return result

        def invalid_constant(value: str) -> object:
            raise ContractError(f"non-finite JSON number: {value}")

        try:
            parsed = json.loads(
                payload, object_pairs_hook=pairs, parse_constant=invalid_constant
            )
        except (ValueError, RecursionError) as exc:
            raise ContractError(f"invalid JSON: {exc}") from exc
        return cls.from_dict(parsed)

    @classmethod
    def json_schema(cls) -> dict[str, Any]:
        """Describe wire structure; semantic invariants are enforced by from_dict."""
        definitions: dict[str, Any] = {}
        root = _schema(cls, definitions)
        return {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            **root,
            "$defs": definitions,
        }


def _schema(annotation: Any, definitions: dict[str, Any]) -> dict[str, Any]:
    origin, args = get_origin(annotation), get_args(annotation)
    if origin in (Union, types.UnionType):
        return {"anyOf": [_schema(a, definitions) for a in args]}
    if origin is Literal:
        return {"enum": list(args)}
    if origin is tuple:
        return {"type": "array", "items": _schema(args[0], definitions)}
    if origin is Mapping:
        return {"type": "object", "additionalProperties": _schema(args[1], definitions)}
    if isinstance(annotation, type) and issubclass(annotation, Contract):
        name = annotation.__name__
        if name not in definitions:
            definitions[name] = {}
            fs = fields(annotation)  # type: ignore[arg-type]
            definitions[name] = {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    annotation.WIRE_ALIASES.get(f.name, f.name): _schema(
                        _hints(annotation)[f.name], definitions
                    )
                    for f in fs
                },
                "required": [
                    annotation.WIRE_ALIASES.get(f.name, f.name)
                    for f in fs
                    if f.default is MISSING and f.default_factory is MISSING
                ],
            }
        return {"$ref": f"#/$defs/{name}"}
    if isinstance(annotation, type) and issubclass(annotation, Enum):
        return {"type": "string", "enum": [v.value for v in annotation]}
    if isinstance(annotation, type) and issubclass(annotation, WireString):
        return {"type": "string", "format": "uri", "minLength": 1}
    if annotation is datetime:
        return {"type": "string", "format": "date-time"}
    if annotation is object:
        return {}
    return {
        "type": {
            str: "string",
            int: "integer",
            float: "number",
            bool: "boolean",
            type(None): "null",
        }[annotation]
    }
