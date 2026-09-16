# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/validation.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/models.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/models.py
# DAG Node:    none
# Intent:      Validate public input bytes and the published local schema before executing or exporting evidence.
# ───────────────────────────────────────────────────────────────

"""Validate bounded data, local schema contracts and artifact fingerprints."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile

from .models import FoundryValidationError

MAX_BYTES = 4 * 1024 * 1024


def mapping(value: object, label: str = "record") -> dict[str, object]:
    """Require an object with string keys."""
    if not isinstance(value, dict) or any(not isinstance(k, str) for k in value):
        raise FoundryValidationError(f"{label} must be an object with string keys")
    return dict(value)


def records(value: object, label: str = "records") -> list[dict[str, object]]:
    """Require a bounded list of objects."""
    if not isinstance(value, list) or len(value) > 10000:
        raise FoundryValidationError(f"{label} must be a bounded list")
    return [mapping(item, label) for item in value]


def strings(value: object, label: str = "identities") -> tuple[str, ...]:
    """Require unique nonempty strings."""
    if not isinstance(value, (list, tuple)) or any(
        not isinstance(item, str) or not item.strip() for item in value
    ):
        raise FoundryValidationError(f"{label} must be a list of nonempty strings")
    if len(set(value)) != len(value):
        raise FoundryValidationError(f"{label} contains duplicates")
    return tuple(value)


def finite(value: object, label: str = "measurement") -> float:
    """Require a finite numerical measurement."""
    if type(value) not in (int, float):
        raise FoundryValidationError(f"{label} must be a finite number")
    assert isinstance(value, (int, float))
    try:
        number = float(value)
    except (ValueError, OverflowError) as error:
        raise FoundryValidationError(f"{label} must be a finite number") from error
    if not math.isfinite(number):
        raise FoundryValidationError(f"{label} must be a finite number")
    return number


def integer(value: object, low: int, high: int, label: str) -> int:
    """Require an integer inside explicit inclusive bounds."""
    if (
        not isinstance(value, int)
        or isinstance(value, bool)
        or not low <= value <= high
    ):
        raise FoundryValidationError(f"{label} must be an integer in [{low}, {high}]")
    return value


def _json_value(value: object, depth: int = 0) -> None:
    if depth > 32:
        raise FoundryValidationError("JSON nesting exceeds 32 levels")
    if value is None or isinstance(value, (str, bool)):
        return
    if isinstance(value, (float, int)):
        finite(value)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _json_value(item, depth + 1)
    elif isinstance(value, Mapping):
        for key, item in value.items():
            if not isinstance(key, str):
                raise FoundryValidationError("JSON object keys must be strings")
            _json_value(item, depth + 1)
    else:
        raise FoundryValidationError("value is not JSON data")


def canonical(value: object) -> bytes:
    """Serialize finite JSON deterministically without changing its meaning."""
    _json_value(value)
    return (
        json.dumps(
            value,
            sort_keys=True,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
        + "\n"
    ).encode("utf-8")


def digest(data: bytes) -> str:
    """Fingerprint bytes without issuing a signature or authority."""
    return hashlib.sha256(data).hexdigest()


def _pairs(items: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in items:
        if key in result:
            raise FoundryValidationError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def decode(data: bytes) -> dict[str, object]:
    """Decode one bounded JSON object and reject ambiguous or nonfinite data."""
    if len(data) > MAX_BYTES:
        raise FoundryValidationError("JSON exceeds the byte limit")
    try:
        value = json.loads(data, object_pairs_hook=_pairs)
        _json_value(value)
        return mapping(value)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise FoundryValidationError(f"invalid JSON: {error}") from error


def relative_path(value: str) -> PurePosixPath:
    """Require a portable relative file path without parent traversal."""
    path = PurePosixPath(value)
    if (
        not value
        or path.is_absolute()
        or "\\" in value
        or any(part in {"", ".", ".."} for part in value.split("/"))
        or ":" in value
        or "\x00" in value
    ):
        raise FoundryValidationError("artifact path must be a relative file path")
    return path


def contained(root: Path, relative: str, *, must_exist: bool = True) -> Path:
    """Resolve a relative path while rejecting symlinks at every component."""
    parts = relative_path(relative).parts
    root = root.absolute()
    # Do not silently resolve a link passed as the root either.
    for parent in (root, *root.parents):
        if parent.is_symlink():
            raise FoundryValidationError("symlink roots are not allowed")
    path = root
    for part in parts:
        path = path / part
        if path.is_symlink():
            raise FoundryValidationError("symlink artifacts are not allowed")
    if must_exist and (not path.is_file() or path.stat().st_size > MAX_BYTES):
        raise FoundryValidationError(
            f"artifact is missing, not a file or too large: {relative}"
        )
    return path


def read_bytes(root: Path, relative: str) -> bytes:
    """Read a bounded regular artifact within its declared root."""
    try:
        path = contained(root, relative)
        data = path.read_bytes()
        if len(data) > MAX_BYTES:
            raise FoundryValidationError("artifact exceeds the byte limit")
        return data
    except OSError as error:
        raise FoundryValidationError(f"cannot read artifact: {relative}") from error


def read_json(root: Path, relative: str) -> dict[str, object]:
    """Read a finite JSON record from a confined local path."""
    return decode(read_bytes(root, relative))


def write_json(path: Path, value: object) -> None:
    """Create a new JSON artifact without replacing prior evidence."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(canonical(value))


def manifest(root: Path, *, exclude: tuple[str, ...] = ()) -> dict[str, str]:
    """Fingerprint every regular artifact while rejecting linked content."""
    result: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        name = path.relative_to(root).as_posix()
        if path.is_symlink():
            raise FoundryValidationError("symlink artifacts are not allowed")
        if path.is_file() and name not in exclude:
            result[name] = digest(read_bytes(root, name))
        if len(result) > 10000:
            raise FoundryValidationError("too many artifacts")
    return result


def verify_manifest(
    root: Path, expected: object, *, exclude: tuple[str, ...] = ()
) -> None:
    """Reject changed, missing and undeclared bundle files."""
    wanted = mapping(expected, "artifact manifest")
    if any(
        not isinstance(v, str) or not re.fullmatch(r"[0-9a-f]{64}", v)
        for v in wanted.values()
    ):
        raise FoundryValidationError("artifact manifest requires SHA-256 digests")
    if manifest(root, exclude=exclude) != wanted:
        raise FoundryValidationError(
            "artifact manifest mismatch: changed, missing or undeclared bytes"
        )


@contextmanager
def staging(destination: Path, protected: Path | None = None) -> Iterator[Path]:
    """Publish a complete new output directory or leave no partial bundle."""
    destination = destination.absolute()
    for part in (destination, *destination.parents):
        if part.is_symlink():
            raise FoundryValidationError("output paths cannot contain symlinks")
    if destination.exists():
        raise FoundryValidationError(f"output already exists: {destination}")
    if protected is not None and destination.is_relative_to(protected.absolute()):
        raise FoundryValidationError("output must be outside authored foundry source")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".foundry-", dir=destination.parent))
    try:
        yield temporary
        # Reserve the final name exclusively; an existing output is never replaced.
        destination.mkdir()
        try:
            temporary.rename(destination)
        except BaseException:
            destination.rmdir()
            raise
    finally:
        shutil.rmtree(temporary, ignore_errors=True)


_SCHEMA_KEYS = {
    "$schema",
    "$id",
    "$defs",
    "$ref",
    "title",
    "description",
    "type",
    "const",
    "enum",
    "required",
    "properties",
    "additionalProperties",
    "items",
    "minItems",
    "maxItems",
    "uniqueItems",
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "minProperties",
}


def validate_contract(
    value: object,
    schema: Mapping[str, object],
    *,
    document: Mapping[str, object] | None = None,
    location: str = "$",
    depth: int = 0,
) -> None:
    """Enforce the JSON Schema vocabulary used by the published local contracts.

    Only local $defs references and the listed keywords are supported. Unknown
    validation keywords fail closed; no schema or reference is fetched.
    """
    if depth > 32 or set(schema) - _SCHEMA_KEYS:
        raise FoundryValidationError(f"{location}: unsupported schema contract")
    source = schema if document is None else document
    if "$ref" in schema:
        reference = schema["$ref"]
        if not isinstance(reference, str) or not reference.startswith("#/$defs/"):
            raise FoundryValidationError("only local schema definitions are supported")
        name = reference.removeprefix("#/$defs/")
        target = mapping(mapping(source.get("$defs"), "$defs").get(name), reference)
        validate_contract(
            value, target, document=source, location=location, depth=depth + 1
        )
        return
    if "const" in schema and value != schema["const"]:
        raise FoundryValidationError(f"{location}: unexpected constant")
    if "enum" in schema:
        options = schema["enum"]
        if not isinstance(options, list) or not any(
            value == item and isinstance(value, bool) == isinstance(item, bool)
            for item in options
        ):
            raise FoundryValidationError(f"{location}: invalid enum value")
    types = schema.get("type", [])
    allowed = (types,) if isinstance(types, str) else strings(types, "schema types")
    matches = {
        "null": value is None,
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "integer": type(value) is int,
        "number": type(value) in (int, float),
        "boolean": type(value) is bool,
    }
    if allowed and not any(matches.get(str(kind), False) for kind in allowed):
        raise FoundryValidationError(f"{location}: incorrect type, expected {allowed}")
    if isinstance(value, dict):
        required = strings(schema.get("required", []), "schema required")
        if set(required) - set(value):
            raise FoundryValidationError(
                f"{location}: missing required fields {sorted(set(required) - set(value))}"
            )
        properties = mapping(schema.get("properties", {}), "properties")
        if schema.get("additionalProperties") is False and set(value) - set(properties):
            raise FoundryValidationError(
                f"{location}: unknown fields {sorted(set(value) - set(properties))}"
            )
        if len(value) < integer(
            schema.get("minProperties", 0), 0, MAX_BYTES, "minProperties"
        ):
            raise FoundryValidationError(f"{location}: empty object")
        for key, child in value.items():
            if key in properties:
                validate_contract(
                    child,
                    mapping(properties[key]),
                    document=source,
                    location=f"{location}.{key}",
                    depth=depth + 1,
                )
    if isinstance(value, list):
        if (
            not integer(schema.get("minItems", 0), 0, MAX_BYTES, "minItems")
            <= len(value)
            <= integer(schema.get("maxItems", 10000), 0, MAX_BYTES, "maxItems")
        ):
            raise FoundryValidationError(f"{location}: invalid list length")
        if schema.get("uniqueItems") and len(
            {canonical(item) for item in value}
        ) != len(value):
            raise FoundryValidationError(f"{location}: duplicate list entries")
        for index, item in enumerate(value):
            validate_contract(
                item,
                mapping(schema.get("items", {})),
                document=source,
                location=f"{location}[{index}]",
                depth=depth + 1,
            )
    if isinstance(value, str):
        if (
            not integer(schema.get("minLength", 0), 0, MAX_BYTES, "minLength")
            <= len(value)
            <= integer(schema.get("maxLength", MAX_BYTES), 0, MAX_BYTES, "maxLength")
        ):
            raise FoundryValidationError(f"{location}: invalid string length")
        if "pattern" in schema and not re.search(str(schema["pattern"]), value):
            raise FoundryValidationError(f"{location}: invalid string pattern")
    if type(value) in (int, float):
        number = finite(value)
        if number < finite(schema.get("minimum", -1e300)) or number > finite(
            schema.get("maximum", 1e300)
        ):
            raise FoundryValidationError(f"{location}: number out of range")
