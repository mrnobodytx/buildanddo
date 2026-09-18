# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/census.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/metadata.py, apps/estate/common.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/estate/metadata.py; DEPENDS_ON apps/estate/common.py
# DAG Node:    none
# Intent:      Inventory stable filesystem evidence with bounded analysis and without following runtime or secret-bearing paths.
# ───────────────────────────────────────────────────────────────

"""Inventory repository paths deterministically with streamed content hashes."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
import hashlib
import os
from pathlib import Path, PurePosixPath
import stat

from apps.estate.common import EstateError
from apps.estate.metadata import parse_cgrf, srs_codes

MAX_ANALYSIS_BYTES = 2 * 1024 * 1024
HASH_CHUNK_BYTES = 256 * 1024
HEADER_BYTES = 32 * 1024
OPAQUE_DIRECTORIES = {
    "node_modules", ".git", "__pycache__", "dist", ".venv", "venv",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", ".cache", ".codex",
    "pb_data", "pb_snapshots", "secrets",
}
MANIFEST_NAMES = {"package.json", "pyproject.toml", "setup.py", "requirements.txt", "manifest.json"}
SOURCE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".go", ".rs", ".sh", ".sql"}
TEXT_EXTENSIONS = SOURCE_EXTENSIONS | {
    ".json", ".jsonc", ".yml", ".yaml", ".toml", ".txt", ".md", ".mdx",
    ".ini", ".cfg", ".conf", ".html", ".css", ".svg", ".xml",
}
OUTPUT_PREFIX = "state/estate"


@dataclass(frozen=True)
class CensusRecord:
    """Record a filesystem leaf or directory without mutable timestamps."""

    path: str
    kind: str
    extension: str
    size: int
    sha256: str
    classification: str
    candidate_module: bool
    cgrf_present: bool
    srs_ref: str | None
    dispatch_ref: str | None
    cgrf: dict[str, str] = field(default_factory=dict)
    analysis_status: str = "analyzed"


def is_sensitive(path: str) -> bool:
    """Recognize paths whose content is outside local inspection authority."""
    name = PurePosixPath(path).name.lower()
    return (
        name == ".env" or name.startswith(".env.") and name != ".env.example"
        or name in {"id_rsa", "id_ed25519", "credentials.json"}
        or name.endswith((".pem", ".key", ".p12", ".pfx", ".db", ".sqlite", ".sqlite3"))
        or "secrets" in PurePosixPath(path).parts
    )


def is_manifest(path: str) -> bool:
    """Recognize strong package and container boundary markers."""
    name = PurePosixPath(path).name
    return (
        name in MANIFEST_NAMES or name.startswith("Dockerfile")
        or name.startswith("docker-compose") and name.endswith((".yml", ".yaml"))
    )


def classify(path: str, kind: str) -> str:
    """Classify a path using explicit repository roles before suffix heuristics."""
    parts = PurePosixPath(path).parts
    name = parts[-1]
    lower = tuple(part.lower() for part in parts)
    if any(part in {"node_modules", "vendor", ".git", ".codex", "venv"} or part.startswith(".venv") for part in lower):
        return "VENDOR"
    if any(part in {"archive", "archives", "backup", "backups", "deprecated"} for part in lower):
        return "ARCHIVE"
    if lower[0] == "state" or any(part in {"pb_data", "pb_snapshots", "secrets"} for part in lower) or is_sensitive(path):
        return "STATE"
    if any(part in {"dist", "build", "coverage", "reports", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".cache"} for part in lower):
        return "GENERATED"
    if name.endswith(".lock") or name in {"package-lock.json", "npm-shrinkwrap.json"}:
        return "GENERATED"
    if parts[0] in {".bits", ".github"} or name in {"AGENTS.md", "CLAUDE.md", "CODEOWNERS", "LICENSE", "NOTICE", "COMMERCIAL.md"}:
        return "GOVERNANCE"
    if any(part in {"tests", "test", "__tests__"} for part in lower) or (
        name.startswith(("test_", "selftest")) or ".test." in name or ".spec." in name
    ):
        return "TEST"
    if "docs" in lower or PurePosixPath(name).suffix in {".md", ".mdx", ".rst"}:
        return "DOCS"
    if is_manifest(path) or PurePosixPath(name).suffix in {".json", ".jsonc", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf"}:
        return "CONFIG"
    return "SOURCE"


def _directory_candidate(path: str) -> bool:
    parts = PurePosixPath(path).parts
    return (
        len(parts) == 2 and parts[0] in {"apps", "scripts", "tests", "services", "foundry"}
        or path in {".bits", ".github", "docs"}
        or parts[-1] in {"pb_hooks", "pb_migrations"}
    )


def _hash_file(path: Path) -> tuple[str, bytes, int]:
    digest = hashlib.sha256()
    prefix = bytearray()
    size = 0
    with path.open("rb") as stream:
        while chunk := stream.read(HASH_CHUNK_BYTES):
            digest.update(chunk)
            size += len(chunk)
            if len(prefix) < HEADER_BYTES:
                prefix.extend(chunk[:HEADER_BYTES - len(prefix)])
    return digest.hexdigest(), bytes(prefix), size


def scan_repository(root: Path) -> list[CensusRecord]:
    """Scan stable metadata, pruning opaque trees and the compiler's own output.

    Directory sizes are zero because allocation sizes vary across filesystems.
    Symlinks hash their link text and are never traversed. Opaque directories
    have no content hash; lockfiles retain a streamed hash but no text analysis.
    """
    root = root.resolve()
    if not root.is_dir():
        raise EstateError("Estate root must be a directory")
    records: list[CensusRecord] = []

    def visit(directory: Path) -> None:
        try:
            entries = sorted(directory.iterdir(), key=lambda path: path.name)
        except OSError as error:
            raise EstateError("Cannot enumerate an estate directory") from error
        for path in entries:
            relative = path.relative_to(root).as_posix()
            if relative == OUTPUT_PREFIX:
                continue
            try:
                info = path.lstat()
                mode = info.st_mode
                kind = "directory" if stat.S_ISDIR(mode) else "file"
                extension = "" if kind == "directory" else path.suffix.lower()
                category = classify(relative, kind)
                status = "analyzed"
                digest, size = "", 0
                header: dict[str, str] = {}
                if stat.S_ISLNK(mode):
                    raw = os.fsencode(os.readlink(path))
                    digest, size, status = hashlib.sha256(raw).hexdigest(), len(raw), "symlink"
                elif kind == "directory":
                    if path.name in OPAQUE_DIRECTORIES or path.name.startswith(".venv"):
                        status = "excluded"
                    else:
                        visit(path)
                        # Creating only our output tree must not change the next census.
                        if relative == "state" and not any(row.path.startswith("state/") for row in records):
                            continue
                elif not stat.S_ISREG(mode):
                    status = "special_file"
                elif is_sensitive(relative):
                    size, status = info.st_size, "sensitive_metadata"
                else:
                    digest, prefix, size = _hash_file(path)
                    if size != info.st_size:
                        raise EstateError(f"File changed during census: {relative}")
                    if path.name.endswith(".lock") or path.name in {"package-lock.json", "npm-shrinkwrap.json"}:
                        status = "excluded"
                    elif b"\x00" in prefix or extension not in TEXT_EXTENSIONS and not is_manifest(relative):
                        status = "binary"
                    else:
                        header = parse_cgrf(prefix.decode("utf-8", errors="replace"))
                        if size > MAX_ANALYSIS_BYTES:
                            status = "analysis_limit"
                codes = srs_codes(header.get("SRS", ""))
                candidate = status not in {"excluded", "symlink", "sensitive_metadata", "special_file"} and (
                    _directory_candidate(relative) if kind == "directory" else (
                        is_manifest(relative) or header.get("EnumType") in {"Route", "Service", "Adapter", "Widget"}
                        or relative.startswith(".bits/srs/") and extension == ".md"
                        or "/pb_hooks/" in relative and path.name.endswith(".pb.js")
                        or "/pb_migrations/" in relative
                    )
                )
                records.append(CensusRecord(
                    relative, kind, extension, size, digest, category, candidate,
                    bool(header), codes[0] if codes else None, header.get("Dispatch"),
                    header, status,
                ))
            except OSError as error:
                raise EstateError(f"Cannot inventory path: {relative}") from error

    visit(root)
    # JSON/binary assets inherit the metadata of the repository's sibling CGRF sidecar.
    by_path = {record.path: record for record in records}
    result: list[CensusRecord] = []
    for record in records:
        sidecar = by_path.get(record.path + ".cgrf.yaml")
        if not record.cgrf_present and sidecar and sidecar.cgrf_present and record.analysis_status not in {"symlink", "sensitive_metadata"}:
            codes = srs_codes(sidecar.cgrf.get("SRS", ""))
            record = replace(record, cgrf_present=True, cgrf=dict(sidecar.cgrf),
                             srs_ref=codes[0] if codes else None, dispatch_ref=sidecar.dispatch_ref)
        result.append(record)
    return sorted(result, key=lambda record: record.path)


def read_source(root: Path, record: CensusRecord) -> str | None:
    """Read bounded text and reject a file that changed since the census."""
    if record.kind != "file" or record.analysis_status != "analyzed":
        return None
    path = root / record.path
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise EstateError(f"Source boundary changed after census: {record.path}")
    try:
        with path.open("rb") as stream:
            data = stream.read(MAX_ANALYSIS_BYTES + 1)
    except OSError as error:
        raise EstateError(f"Cannot read source: {record.path}") from error
    if len(data) > MAX_ANALYSIS_BYTES or hashlib.sha256(data).hexdigest() != record.sha256:
        raise EstateError(f"Source changed after census: {record.path}")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None
