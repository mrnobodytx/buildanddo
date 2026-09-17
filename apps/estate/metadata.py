# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/metadata.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     .bits/srs_registry.yml, apps/estate/common.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON .bits/srs_registry.yml; DEPENDS_ON apps/estate/common.py
# DAG Node:    none
# Intent:      Compile the repository's CGRF and flat SRS declarations without interpreting source code.
# ───────────────────────────────────────────────────────────────

"""Read the existing CGRF header and flat SRS registry contracts."""

from __future__ import annotations

from dataclasses import dataclass
import re

from apps.estate.common import EstateError

BACKTICK = chr(96)
SRS_PATTERN = re.compile(r"\bSRS-[A-Z0-9]+(?:-[A-Z0-9]+)+\b")
FIELD_PATTERN = re.compile(r"^([A-Za-z][A-Za-z0-9 _-]*):\s*(.*)$")
_FIELD_NAMES = {
    "file": "File", "stage": "Stage", "srs": "SRS", "caps": "CAPS", "ck": "CK",
    "dispatch": "Dispatch", "seat": "Seat", "owner": "Owner", "created": "Created",
    "depends": "Depends", "enumtype": "EnumType", "enumedges": "EnumEdges",
    "dagnode": "DAG Node", "intent": "Intent", "module": "Module",
    "moduleid": "ModuleID", "modulepath": "ModulePath", "kind": "Kind",
    "plane": "Plane", "lifecycle": "Lifecycle", "capabilities": "Capabilities",
    "utilityrole": "UtilityRole", "auth": "Auth", "route": "Route", "routes": "Routes",
}


def parse_cgrf(text: str) -> dict[str, str]:
    """Extract fields and wrapped values from a leading CGRF comment block."""
    result: dict[str, str] = {}
    started = False
    current = ""
    for raw in text.lstrip("\ufeff").splitlines():
        stripped = raw.strip()
        if stripped.startswith("#!") and not started:
            continue
        if not stripped:
            if started:
                break
            continue
        comment = re.match(r"^(?:<!--|//|/\*+|\*|#|--)\s?(.*)$", stripped)
        if not comment:
            break
        body = comment.group(1).rstrip().removesuffix("-->").removesuffix("*/").rstrip()
        if "CGRF Header" in body:
            started = True
            continue
        if not started:
            continue
        if re.fullmatch(r"[\s─━—=-]{3,}", body) or stripped in {"*/", "-->"}:
            break
        match = FIELD_PATTERN.match(body.strip())
        if match:
            raw_name, value = match.groups()
            name = _FIELD_NAMES.get(re.sub(r"[\s_-]", "", raw_name).lower(), raw_name)
            result[name] = value.split(" #", 1)[0].strip()
            current = name
        elif current and body.strip() and not body.lstrip().startswith("#"):
            result[current] += " " + body.strip()
    return result


def srs_codes(value: str) -> list[str]:
    """Return sorted, unique governance codes from a metadata value."""
    return sorted(set(SRS_PATTERN.findall(value)))


def split_references(value: str) -> list[str]:
    """Split the comma/semicolon reference lists used by repository headers."""
    return sorted({
        part.strip().strip(BACKTICK + "'\"").rstrip("/")
        for part in re.split(r"[,;]", value)
        if part.strip().lower() not in {"", "none", "pending", "n/a"}
    })


def enum_edges(value: str) -> list[tuple[str, str]]:
    """Read typed declarations while retaining targets verbatim."""
    found: set[tuple[str, str]] = set()
    for item in value.split(";"):
        match = re.match(r"^\s*([A-Z_]+)\s+(.+?)\s*$", item)
        if match:
            found.add((match[1], match[2].strip(BACKTICK).rstrip("/")))
    return sorted(found)


@dataclass(frozen=True)
class RegistryEntry:
    """Retain the authority and paths explicitly registered for one SRS."""

    code: str
    title: str
    status: str
    risk: str
    spec: str
    dispatch: str
    paths: list[str]


def parse_registry(text: str) -> list[RegistryEntry]:
    """Parse the flat YAML subset documented by srs_registry.yml.

    No YAML tags, anchors, nested structures or source evaluation are accepted.
    """
    entries: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    active = False
    for raw in text.splitlines():
        line = raw.split(" #", 1)[0].rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line == "srs:":
            active = True
            continue
        if not active:
            continue
        item = re.fullmatch(r"\s+-\s+code:\s*(.+)", line)
        if item:
            current = {"code": item[1].strip("'\"")}
            entries.append(current)
            continue
        field = re.fullmatch(r"\s+([A-Za-z_]+):\s*(.*)", line)
        if field and current is not None:
            current[field[1]] = field[2].strip("'\"")
            continue
        raise EstateError("SRS registry must use the documented flat mapping format")
    if not active:
        raise EstateError("SRS registry has no srs list")
    return [
        RegistryEntry(
            code=row["code"], title=row.get("title", ""), status=row.get("status", ""),
            risk=row.get("risk", ""), spec=row.get("spec", ""),
            dispatch=row.get("dispatch", row.get("dispatch_id", "")),
            paths=split_references(",".join(row.get(key, "") for key in ("path", "paths", "files", "module_path"))),
        )
        for row in sorted(entries, key=lambda row: row["code"])
    ]


def scope_paths(text: str) -> list[str]:
    """Extract backticked repository paths from a spec's explicit scope section."""
    result: set[str] = set()
    active = False
    for line in text.splitlines():
        if line.startswith("## "):
            active = line[3:].strip().lower() in {"scope", "implementation", "files", "changes"}
        if active:
            for literal in re.findall(rf"{BACKTICK}([^{BACKTICK}\n]+){BACKTICK}", line):
                if re.fullmatch(r"(?:apps|scripts|tests|services|docs|foundry|\.bits)/[\w./*?-]+", literal):
                    result.add(literal.rstrip("/"))
    return sorted(result)
