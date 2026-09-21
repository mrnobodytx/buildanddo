# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/interop.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/models.py, libs/capability_tokens/schema.py, libs/evolution/common.py, libs/evolution/compiler.py, libs/semantic_twin/contracts.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/schema.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/evolution/compiler.py; DEPENDS_ON libs/semantic_twin/contracts.py
# Intent:      Use portable skill and MCP formats as inert inputs without importing their authority claims.
# ───────────────────────────────────────────────────────────────

"""Import inert Agent Skills and captured MCP resources without network access."""

from __future__ import annotations

import io
import json
import re
import stat
import zipfile
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from libs.evolution.common import decode_json, json_value, mapping
from libs.evolution.compiler import ActionProposal, DecisionInput
from libs.semantic_twin.contracts import Contract, ContractError, require

from .models import MAX_BYTES, TokenBundle, safe_path
from .schema import ValueSchema


def _frontmatter(content: str) -> dict[str, str]:
    lines = content.splitlines()
    require(bool(lines) and lines[0] == "---", "SKILL.md needs YAML frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ContractError("unterminated skill frontmatter") from exc
    require(bool("\n".join(lines[end + 1 :]).strip()), "skill instructions are empty")
    result: dict[str, str] = {}
    index = 1
    while index < end:
        line = lines[index]
        index += 1
        if not line.strip() or line.startswith("#"):
            continue
        match = re.fullmatch(r"([a-z][a-z-]*):\s*(.*)", line)
        require(match is not None, "unsupported skill YAML; use scalar metadata")
        assert match is not None
        key, value = match.groups()
        require(key not in result, "duplicate skill metadata")
        if value in ("|", ">"):
            parts = []
            while index < end and (lines[index].startswith("  ") or not lines[index]):
                parts.append(lines[index][2:] if lines[index] else "")
                index += 1
            value = ("\n" if value == "|" else " ").join(parts).strip()
        elif value.startswith('"'):
            decoded = decode_json(value)
            require(type(decoded) is str, "skill metadata must be text")
            value = str(decoded)
        elif value.startswith("'"):
            require(
                value.endswith("'") and len(value) >= 2, "invalid quoted skill metadata"
            )
            value = value[1:-1].replace("''", "'")
        else:
            require(
                bool(value) and not any(ch in value for ch in "{}[]&*!"),
                "unsupported skill YAML syntax",
            )
        result[key] = value
    require(bool(result.get("description", "").strip()), "skill description is missing")
    require(
        re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", result.get("name", "")) is not None
        and len(result["name"]) <= 64,
        "invalid Agent Skill name",
    )
    require(len(result["description"]) <= 1024, "skill description is too long")
    return result


@dataclass(frozen=True, slots=True)
class SkillPackage(Contract):
    """Retain a portable skill as untrusted instructions and inert resources."""

    name: str
    description: str
    files: Mapping[str, str]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            "SKILL.md" in self.files and len(self.files) <= 128,
            "invalid skill file set",
        )
        for path, content in self.files.items():
            safe_path(path)
            require(len(content.encode()) <= 1_000_000, "skill resource is too large")
        require(
            sum(len(c.encode()) for c in self.files.values()) <= MAX_BYTES,
            "skill is too large",
        )
        meta = _frontmatter(self.files["SKILL.md"])
        require(
            (self.name, self.description) == (meta["name"], meta["description"]),
            "skill metadata disagrees with source",
        )

    @classmethod
    def from_files(cls, files: Mapping[str, str]) -> SkillPackage:
        """Parse frontmatter without interpreting scripts, tools or instructions."""
        require("SKILL.md" in files, "SKILL.md is missing")
        meta = _frontmatter(files["SKILL.md"])
        return cls(meta["name"], meta["description"], files)


def import_skill(path: Path) -> SkillPackage:
    """Read a bounded directory or ZIP while rejecting symlinks and unsafe paths."""
    require(not path.is_symlink(), "symlink skill source is forbidden")
    files: dict[str, str] = {}
    total = 0
    try:
        if path.is_dir():
            for item in sorted(path.rglob("*")):
                require(not item.is_symlink(), "symlink skill resource is forbidden")
                if item.is_dir():
                    continue
                relative = item.relative_to(path).as_posix()
                safe_path(relative)
                size = item.stat().st_size
                require(
                    size <= 1_000_000
                    and total + size <= MAX_BYTES
                    and len(files) < 128,
                    "skill exceeds resource limits",
                )
                require(item.is_file(), "skill resource is not a regular file")
                files[relative] = item.read_text(encoding="utf-8")
                total += size
        else:
            require(path.stat().st_size <= MAX_BYTES, "skill archive is too large")
            with zipfile.ZipFile(path) as archive:
                for info in archive.infolist():
                    safe_path(
                        info.filename.rstrip("/") if info.is_dir() else info.filename
                    )
                    require(
                        not stat.S_ISLNK(info.external_attr >> 16),
                        "archive symlink is forbidden",
                    )
                    require(
                        not info.flag_bits & 1, "encrypted archives are unsupported"
                    )
                    if info.is_dir():
                        continue
                    require(info.filename not in files, "duplicate archive resource")
                    require(
                        info.file_size <= 1_000_000
                        and total + info.file_size <= MAX_BYTES
                        and len(files) < 128,
                        "archive exceeds resource limits",
                    )
                    files[info.filename] = archive.read(info).decode("utf-8")
                    total += info.file_size
    except (OSError, UnicodeError, zipfile.BadZipFile) as exc:
        raise ContractError("cannot read portable UTF-8 skill") from exc
    return SkillPackage.from_files(files)


def skill_zip(skill: SkillPackage) -> bytes:
    """Produce reproducible ZIP bytes with fixed metadata and no executable mode."""
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, content in sorted(skill.files.items()):
            info = zipfile.ZipInfo(path, (1980, 1, 1, 0, 0, 0))
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(info, content.encode())
    return stream.getvalue()


def export_skill(bundle: TokenBundle, implementation: str) -> SkillPackage:
    """Export an ordinary skill with an attached contract and no inherited certification."""
    impl = bundle.token.implementation(implementation)
    if impl.kind == "agent_skill":
        require(
            impl.entrypoint == "SKILL.md", "Agent Skill entrypoint must be SKILL.md"
        )
        return SkillPackage.from_files(
            {a.path: bundle.files[a.path] for a in impl.assets}
        )
    name = (
        re.sub(r"[^a-z0-9]+", "-", bundle.token.name.lower())
        .strip("-")[:64]
        .rstrip("-")
    )
    require(bool(name), "token name cannot become an Agent Skill name")
    description = "Prepare governed proposals for " + bundle.token.name + "."
    instructions = (
        "---\nname: " + name + "\ndescription: " + json.dumps(description) + "\n---\n\n"
        "Inspect the exact contract in references/capability.json and its compatibility "
        "before requesting a proposal through CNWB. Obtain independent authorization "
        "through the receiving AAXP policy and transaction boundary before any effect. "
        "This portable wrapper carries no certification, permission or executable adapter.\n"
    )
    return SkillPackage(
        name,
        description,
        {
            "SKILL.md": instructions,
            "references/capability.json": bundle.token.to_json(),
        },
    )


@dataclass(frozen=True, slots=True)
class McpToolCapture(Contract):
    """Describe a captured MCP tool without treating annotations as trust or authority."""

    name: str
    description: str
    inputs: ValueSchema
    outputs: ValueSchema

    @classmethod
    def from_descriptor(cls, value: Mapping[str, object]) -> McpToolCapture:
        """Import the supported closed JSON Schema tool profile."""
        require(
            set(value)
            <= {"name", "description", "inputSchema", "outputSchema", "annotations"},
            "unsupported MCP tool descriptor",
        )
        require(
            type(value.get("name")) is str and type(value.get("description")) is str,
            "MCP tool needs name and description",
        )
        return cls(
            str(value["name"]),
            str(value["description"]),
            ValueSchema(mapping(value.get("inputSchema"))),
            ValueSchema(mapping(value.get("outputSchema"))),
        )


def mcp_descriptor(bundle: TokenBundle, implementation: str) -> dict[str, object]:
    """Describe a receiving proposal tool using MCP input/output schema fields."""
    bundle.token.implementation(implementation)
    observation_schema = DecisionInput.json_schema()
    definitions = observation_schema.pop("$defs", {})
    observation_schema.pop("$schema", None)
    return {
        "name": "cnwb_propose_" + implementation,
        "description": bundle.token.description
        + " Returns a proposal requiring separate authorization.",
        "inputSchema": {
            "type": "object",
            "$defs": definitions,
            "properties": {
                "variables": json_value(bundle.token.inputs.document),
                "observation": observation_schema,
            },
            "required": ["variables", "observation"],
            "additionalProperties": False,
        },
        "outputSchema": ActionProposal.json_schema(),
        "annotations": {
            "readOnlyHint": True,
            "destructiveHint": False,
            "openWorldHint": False,
        },
        "_meta": {
            "cnwb": {
                "pin": bundle.token.pin.to_dict(),
                "implementation": implementation,
            }
        },
    }


def import_skill_index(
    index: Mapping[str, object], resources: Mapping[str, str]
) -> tuple[SkillPackage, ...]:
    """Resolve a captured skill index from supplied resources only, without fetching URIs."""
    require(set(index) == {"skills"}, "unsupported captured skill index")
    entries = index["skills"]
    require(
        isinstance(entries, (tuple, list)) and len(entries) <= 128,
        "invalid skill index",
    )
    assert isinstance(entries, (tuple, list))
    output = []
    seen = set()
    for raw in entries:
        entry = mapping(raw)
        require(
            set(entry) == {"name", "description", "uri"},
            "unsupported skill index entry",
        )
        uri = entry["uri"]
        require(
            isinstance(uri, str) and uri.startswith("skill://") and uri in resources,
            "skill resource is not captured locally",
        )
        assert isinstance(uri, str)
        require(uri not in seen, "duplicate skill index resource")
        seen.add(uri)
        skill = SkillPackage.from_files({"SKILL.md": resources[uri]})
        require(
            entry["name"] == skill.name and entry["description"] == skill.description,
            "index metadata disagrees with captured skill",
        )
        output.append(skill)
    require(
        len({s.name for s in output}) == len(output), "duplicate indexed skill name"
    )
    return tuple(output)


def export_skill_index(skills: tuple[SkillPackage, ...]) -> dict[str, object]:
    """Produce a captured skill://index.json profile and its inline resources."""
    require(len({s.name for s in skills}) == len(skills), "duplicate skill name")
    return {
        "index": {
            "skills": [
                {
                    "name": s.name,
                    "description": s.description,
                    "uri": f"skill://{s.name}/SKILL.md",
                }
                for s in skills
            ]
        },
        "resources": {
            f"skill://{s.name}/SKILL.md": s.files["SKILL.md"] for s in skills
        },
        "limitations": "Index profile carries instructions only; resource archives require separate capture.",
    }
