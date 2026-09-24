# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/schema.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/common.py, libs/semantic_twin/contracts.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/semantic_twin/contracts.py
# Intent:      Validate a bounded portable JSON Schema profile without silently ignoring unsupported constraints.
# ───────────────────────────────────────────────────────────────

"""Validate typed variables with a deliberately bounded JSON Schema profile."""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

from libs.evolution.common import mapping
from libs.semantic_twin.contracts import Contract, require

_TYPES = {"object", "array", "string", "integer", "number", "boolean", "null"}
_COMMON = {"type", "description", "enum", "x-data-classification"}
_KEYS = {
    "object": {"properties", "required", "additionalProperties"},
    "array": {"items", "minItems", "maxItems"},
    "string": {"minLength", "maxLength"},
    "integer": {"minimum", "maximum"},
    "number": {"minimum", "maximum"},
    "boolean": set(),
    "null": set(),
}


def _number(value: object) -> int | float:
    require(type(value) in (int, float), "expected a number")
    assert isinstance(value, (int, float))
    require(type(value) is int or math.isfinite(value), "nonfinite number")
    return value


def _sequence(value: object) -> tuple[object, ...]:
    require(isinstance(value, (tuple, list)), "schema requires an array")
    assert isinstance(value, (tuple, list))
    return tuple(value)


def _validate(schema: Mapping[str, object], value: object, depth: int = 0) -> None:
    require(depth <= 16, "value exceeds schema depth limit")
    kind = schema["type"]
    if "enum" in schema:
        require(
            any(
                type(value) is type(v) and value == v for v in _sequence(schema["enum"])
            ),
            "value outside enum",
        )
    if kind == "object":
        data = mapping(value)
        props = mapping(schema["properties"])
        require(set(data) <= set(props), "unexpected object property")
        require(
            set(_sequence(schema["required"])) <= set(data), "missing required property"
        )
        for key, item in data.items():
            _validate(mapping(props[key]), item, depth + 1)
    elif kind == "array":
        values = _sequence(value)
        require(
            int(str(schema.get("minItems", 0)))
            <= len(values)
            <= int(str(schema.get("maxItems", 1000))),
            "array length outside bounds",
        )
        for item in values:
            _validate(mapping(schema["items"]), item, depth + 1)
    elif kind == "string":
        require(type(value) is str, "expected string")
        assert isinstance(value, str)
        require(
            int(str(schema.get("minLength", 0)))
            <= len(value)
            <= int(str(schema.get("maxLength", 16384))),
            "string length outside bounds",
        )
    elif kind in ("number", "integer"):
        require(
            type(value) in ((int,) if kind == "integer" else (int, float)),
            "expected finite number",
        )
        assert isinstance(value, (int, float))
        _number(value)
        if "minimum" in schema:
            require(value >= _number(schema["minimum"]), "number below minimum")
        if "maximum" in schema:
            require(value <= _number(schema["maximum"]), "number above maximum")
    elif kind == "boolean":
        require(type(value) is bool, "expected boolean")
    else:
        require(value is None, "expected null")


def _check(schema: Mapping[str, object], depth: int = 0) -> None:
    require(depth <= 16, "schema exceeds depth limit")
    kind = schema.get("type")
    require(isinstance(kind, str) and kind in _TYPES, "unsupported schema type")
    assert isinstance(kind, str)
    require(set(schema) <= _COMMON | _KEYS[kind], "unsupported schema keyword")
    if "description" in schema:
        require(type(schema["description"]) is str, "invalid schema description")
    require(
        schema.get("x-data-classification", "public")
        in ("public", "tenant_private", "secret"),
        "unknown data classification",
    )
    if kind == "object":
        props = mapping(schema.get("properties"))
        require(
            len(props) <= 128 and all(k and len(k) <= 128 for k in props),
            "invalid schema property names",
        )
        required = _sequence(schema.get("required"))
        require(all(type(k) is str for k in required), "invalid required properties")
        require(
            len(set(required)) == len(required) and set(required) <= set(props),
            "invalid required property set",
        )
        require(schema.get("additionalProperties") is False, "objects must be closed")
        for value in props.values():
            _check(mapping(value), depth + 1)
    if kind == "array":
        _check(mapping(schema.get("items")), depth + 1)
    for low, high, cap in (
        ("minLength", "maxLength", 16384),
        ("minItems", "maxItems", 1000),
    ):
        if low in schema or high in schema:
            left, right = schema.get(low, 0), schema.get(high, cap)
            require(type(left) is int and type(right) is int, "noninteger length bound")
            assert isinstance(left, int) and isinstance(right, int)
            require(0 <= left <= right <= cap, "invalid length bounds")
    for name in ("minimum", "maximum"):
        if name in schema:
            value = schema[name]
            _number(value)
    if "minimum" in schema and "maximum" in schema:
        require(
            _number(schema["minimum"]) <= _number(schema["maximum"]),
            "inverted numeric bounds",
        )
    if "enum" in schema:
        values = _sequence(schema["enum"])
        require(0 < len(values) <= 128, "invalid enum size")
        require(kind not in ("array", "object"), "structured enums are unsupported")
        bare = {k: v for k, v in schema.items() if k != "enum"}
        for value in values:
            _validate(bare, value)
        require(
            len({(type(v).__name__, str(v)) for v in values}) == len(values),
            "duplicate enum value",
        )


@dataclass(frozen=True, slots=True)
class ValueSchema(Contract):
    """Freeze a closed, bounded JSON Schema subset for inputs and outputs."""

    document: Mapping[str, object]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        _check(self.document)

    def validate(self, value: object) -> None:
        """Reject unknown properties, wrong types and values outside declared bounds."""
        _validate(self.document, value)

    def field(self, name: str, *, required: bool = False) -> ValueSchema:
        """Select a declared field for conservative composition type checking."""
        require(self.document["type"] == "object", "field selection needs an object")
        props = mapping(self.document["properties"])
        require(name in props, "unknown schema field")
        if required:
            require(
                name in _sequence(self.document["required"]), "output field is optional"
            )
        return ValueSchema(mapping(props[name]))

    def accepts(self, source: ValueSchema) -> bool:
        """Require equal validation constraints instead of guessing schema subsumption."""

        def constraints(doc: Mapping[str, object]) -> dict[str, object]:
            return {
                k: v
                for k, v in doc.items()
                if k not in ("description", "x-data-classification")
            }

        return constraints(self.document) == constraints(source.document)

    @property
    def classification(self) -> str:
        """Return the declared data boundary for an input or output."""
        return str(self.document.get("x-data-classification", "public"))
