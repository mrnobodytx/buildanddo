# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/gitlab_ci.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .gitlab/ci/day21-submission.yml
# EnumType:    Service
# EnumEdges:   VALIDATES .gitlab/ci/day21-submission.yml
# Intent:      Inspect reachable local GitLab commands without treating comments, optional jobs or external configuration as executed acceptance.
# ───────────────────────────────────────────────────────────────

"""Inspect the repository's literal GitLab configuration using only the stdlib.

This is a source inventory, not GitLab's YAML compiler or evidence of a run.
Only local includes and literal command lists are inspected. Unresolved includes,
cycles and duplicate job definitions prevent a governance wiring assertion.
Templates and commands inherited through YAML aliases/extends are not inferred.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath
import re
import shlex


@dataclass(frozen=True)
class Job:
    """Retain literal job commands with their source and failure policy."""

    name: str
    file: str
    commands: tuple[str, ...]
    required: bool


@dataclass(frozen=True)
class Configuration:
    """Describe reachable source without asserting pipeline execution."""

    files: tuple[str, ...]
    jobs: tuple[Job, ...]
    errors: tuple[str, ...]


def arguments(command: str) -> list[str]:
    """Tokenize a literal command without expanding variables or executing it."""
    try:
        return shlex.split(command, comments=True)
    except ValueError:
        return []


def _scalar(value: str) -> str:
    value = value.strip()
    if len(value) > 1 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    return value.split(" #", 1)[0].rstrip()


def _sections(text: str) -> list[tuple[str, str, str]]:
    pattern = re.compile(r"^([\w.][\w.-]*):[ \t]*([^\n]*)$", re.MULTILINE)
    matches = list(pattern.finditer(text))
    return [
        (
            match[1],
            match[2],
            text[
                match.end() : matches[index + 1].start()
                if index + 1 < len(matches)
                else len(text)
            ],
        )
        for index, match in enumerate(matches)
    ]


def _commands(body: str) -> tuple[str, ...]:
    commands: list[str] = []
    indent: int | None = None
    list_indent: int | None = None
    for line in body.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        width = len(line) - len(line.lstrip())
        if indent is not None and width <= indent:
            indent, list_indent = None, None
        if re.fullmatch(r"\s+(?:before_script|script):\s*(?:#.*)?", line):
            indent, list_indent = width, None
            continue
        if indent is not None and width > indent:
            item = re.match(r"\s+-\s+(.+)$", line)
            if item and (list_indent is None or list_indent == width):
                list_indent = width
                value = _scalar(item[1])
                # Block scalars, aliases and mappings need GitLab's compiler.
                if (
                    not value.startswith(("|", ">", "*", "!", "&"))
                    and ": " not in value
                ):
                    commands.append(value)
    return tuple(commands)


def collect(root: Path) -> Configuration:
    """Follow literal local includes without reading outside the repository."""
    root = root.resolve()
    files: list[str] = []
    jobs: dict[str, Job] = {}
    errors: list[str] = []
    stack: set[str] = set()
    reserved = {
        "include",
        "stages",
        "variables",
        "workflow",
        "default",
        "image",
        "services",
        "cache",
        "before_script",
        "after_script",
    }

    def visit(name: str) -> None:
        name = name.lstrip("/")
        parts = PurePosixPath(name).parts
        path = root / name
        if (
            not name
            or "\\" in name
            or ".." in parts
            or any(
                (root.joinpath(*parts[:i])).is_symlink()
                for i in range(1, len(parts) + 1)
            )
            or not path.resolve().is_relative_to(root)
        ):
            errors.append("Unsafe GitLab local include.")
            return
        if name in stack:
            errors.append("Cyclic GitLab local include: " + name)
            return
        if name in files:
            return
        if not path.is_file():
            errors.append("Missing GitLab configuration: " + name)
            return
        files.append(name)
        stack.add(name)
        sections = _sections(path.read_text())
        for key, inline, body in sections:
            if key != "include":
                continue
            entries = [inline] if inline.strip() else []
            entries.extend(line.strip() for line in body.splitlines())
            for entry in entries:
                if not entry or entry.startswith("#"):
                    continue
                local = re.fullmatch(r"(?:-\s*)?local:\s*(.+)", entry)
                value = _scalar(local[1] if local else re.sub(r"^-\s*", "", entry))
                if (not local and ": " in value) or not re.fullmatch(
                    r"/?[\w./-]+\.ya?ml", value
                ):
                    errors.append("Unresolved GitLab include in " + name)
                    continue
                visit(value)
        for key, _inline, body in sections:
            if key in reserved or key.startswith("."):
                continue
            if key in jobs:
                errors.append(
                    "Duplicate GitLab job requires merged-config review: " + key
                )
                del jobs[key]
            commands = _commands(body)
            if not commands:
                continue
            optional = bool(
                re.search(r"^\s+allow_failure:\s*(?:true|\{)", body, re.MULTILINE)
            )
            disabled = bool(
                re.search(
                    r"^  when:\s*never\s*(?:#.*)?$|^\s+(?:-\s+)?when:\s*manual\s*(?:#.*)?$",
                    body,
                    re.MULTILINE,
                )
            )
            inherited = bool(re.search(r"^  (?:extends|inherit):", body, re.MULTILINE))
            jobs[key] = Job(
                key, name, commands, not (optional or disabled or inherited)
            )
        stack.remove(name)

    visit(".gitlab-ci.yml")
    return Configuration(tuple(files), tuple(jobs.values()), tuple(errors))


def require_command(root: Path, script: str, *args: str) -> None:
    """Require an unsuppressed literal command in a reachable GitLab job."""
    config = collect(root)
    if config.errors:
        raise ValueError("; ".join(config.errors))
    for job in config.jobs:
        if not job.required:
            continue
        for command in job.commands:
            argv = arguments(command)
            if (
                argv
                and re.fullmatch(r"python(?:3(?:\.\d+)?)?", Path(argv[0]).name)
                and argv[1:] == [script, *args]
            ):
                return
    raise ValueError("Required GitLab CI command is missing or optional: " + script)
