# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/seal.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/census.py, apps/estate/dependencies.py, apps/estate/reconcile.py, apps/estate/validate.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/estate/census.py; DEPENDS_ON apps/estate/dependencies.py; DEPENDS_ON apps/estate/reconcile.py; DEPENDS_ON apps/estate/validate.py
# DAG Node:    none
# Intent:      Seal canonical estate evidence reproducibly and retain local history for exact module, file and edge comparisons.
# ───────────────────────────────────────────────────────────────

"""Compile reproducible estate snapshots and maintain a local seal archive."""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from apps.estate.census import CensusRecord, OUTPUT_PREFIX, scan_repository
from apps.estate.common import Diagnostic, EstateError, canonical_json, content_hash, decode_record
from apps.estate.dependencies import Collection, DependencyEdge, Reference, extract_dependencies
from apps.estate.evidence import collect_evidence
from apps.estate.metadata import RegistryEntry
from apps.estate.modules import EstateModule, identify_modules
from apps.estate.reconcile import Reconciliation, ReconciliationResult, reconcile
from apps.estate.syntax import Route
from apps.estate.validate import Violation, validate

SCHEMA_VERSION = 1
EPOCH_TIMESTAMP = "1970-01-01T00:00:00Z"
SEAL_ID_PATTERN = re.compile(r"ESTATE-[0-9]{8}-[0-9a-f]{16}")
MAX_CACHE_BYTES = 128 * 1024 * 1024


@dataclass(frozen=True)
class EstateSnapshot:
    """Expose the canonical evidence payload for downstream graph ingestion."""

    schema_version: int
    repo_commit: str
    timestamp: str
    census: list[CensusRecord]
    modules: list[EstateModule]
    edges: list[DependencyEdge]
    references: list[Reference]
    routes: list[Route]
    collections: list[Collection]
    registry: list[RegistryEntry]
    reconciliation: Reconciliation
    violations: list[Violation]
    analysis_notes: list[Diagnostic]


@dataclass(frozen=True)
class EstateSeal:
    """Identify source evidence independently of local observation history."""

    seal_id: str
    timestamp: str
    repo_commit: str
    census_hash: str
    module_count: int
    edge_count: int
    reconciliation: ReconciliationResult
    validation_violations: int
    previous_seal: str | None
    sha256: str


@dataclass(frozen=True)
class EstateDelta:
    """Describe exact changes in module metadata, file content and typed edges."""

    from_seal: str
    to_seal: str
    added_modules: list[str]
    removed_modules: list[str]
    modified_modules: list[str]
    added_files: list[str]
    removed_files: list[str]
    modified_files: list[str]
    added_directories: list[str]
    removed_directories: list[str]
    added_edges: list[DependencyEdge]
    removed_edges: list[DependencyEdge]
    changed_metadata: list[str]


@dataclass(frozen=True)
class SealDocument:
    """Store source identity and separately hashed local history metadata."""

    seal: EstateSeal
    snapshot: EstateSnapshot
    delta: EstateDelta | None
    document_sha256: str


def repository_provenance(root: Path) -> tuple[str, str]:
    """Read only local Git identity and commit time, or use a fixed non-Git epoch."""
    try:
        location = subprocess.run(["git", "-C", str(root), "rev-parse", "--show-toplevel"],
                                  capture_output=True, text=True, timeout=10, check=False)
        if location.returncode or Path(location.stdout.strip()).resolve() != root.resolve():
            return "unversioned", EPOCH_TIMESTAMP
        commit = subprocess.run(["git", "-C", str(root), "show", "-s", "--format=%H%n%cI", "HEAD"],
                                capture_output=True, text=True, timeout=10, check=False)
        if commit.returncode:
            return "unversioned", EPOCH_TIMESTAMP
        sha, timestamp = commit.stdout.strip().splitlines()
        date = datetime.fromisoformat(timestamp).astimezone(timezone.utc)
        return sha, date.isoformat(timespec="seconds").replace("+00:00", "Z")
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return "unversioned", EPOCH_TIMESTAMP


def compile_estate(root: Path) -> EstateSnapshot:
    """Compile a read-only estate snapshot from the current stable filesystem."""
    root = root.resolve()
    commit, timestamp = repository_provenance(root)
    census = scan_repository(root)
    evidence = collect_evidence(root, census)
    modules = identify_modules(census, evidence)
    dependencies = extract_dependencies(census, modules, evidence)
    reconciliation = reconcile(census, modules, dependencies, evidence)
    violations = validate(census, modules, dependencies, evidence)
    if repository_provenance(root) != (commit, timestamp):
        raise EstateError("Repository commit changed during estate compilation")
    return EstateSnapshot(
        SCHEMA_VERSION, commit, timestamp, census, modules, dependencies.edges, dependencies.references,
        dependencies.routes, dependencies.collections, evidence.registry, reconciliation, violations,
        sorted(evidence.notes + dependencies.notes, key=lambda note: (note.code, note.subject, note.message)),
    )


def merkle_root(census: list[CensusRecord]) -> str:
    """Hash sorted census leaves with domain-separated Merkle parent nodes."""
    leaves = [
        hashlib.sha256(b"\x00" + canonical_json(asdict(record)).encode("utf-8")).digest()
        for record in sorted(census, key=lambda record: record.path)
    ]
    if not leaves:
        return hashlib.sha256(b"").hexdigest()
    while len(leaves) > 1:
        if len(leaves) % 2:
            leaves.append(leaves[-1])
        leaves = [hashlib.sha256(b"\x01" + leaves[index] + leaves[index + 1]).digest() for index in range(0, len(leaves), 2)]
    return leaves[0].hex()


def _snapshot_identity(snapshot: EstateSnapshot) -> tuple[str, str]:
    digest = content_hash(asdict(snapshot))
    try:
        date = datetime.fromisoformat(snapshot.timestamp.replace("Z", "+00:00")).strftime("%Y%m%d")
    except ValueError as error:
        raise EstateError("Invalid estate evidence timestamp") from error
    return "ESTATE-" + date + "-" + digest[:16], digest


def create_seal(snapshot: EstateSnapshot, previous_seal: str | None = None) -> EstateSeal:
    """Seal canonical source content; previous-seal linkage does not change identity.

    A content-derived suffix replaces a run counter. The timestamp is the commit
    timestamp, never the wall clock. The envelope has its own digest covering
    previous_seal and delta, so history is inspectable without destabilizing the
    source identity on a rerun or when an earlier source state is restored.
    """
    if previous_seal is not None and not SEAL_ID_PATTERN.fullmatch(previous_seal):
        raise EstateError("Invalid previous seal ID")
    seal_id, digest = _snapshot_identity(snapshot)
    return EstateSeal(
        seal_id, snapshot.timestamp, snapshot.repo_commit, merkle_root(snapshot.census),
        len(snapshot.modules), len(snapshot.edges), snapshot.reconciliation.summary,
        len(snapshot.violations), previous_seal, digest,
    )


def _module_hashes(snapshot: EstateSnapshot) -> dict[str, str]:
    records = {record.path: asdict(record) for record in snapshot.census}
    return {
        module.module_id: content_hash({
            "module": asdict(module),
            "files": {path: records[path] for path in module.files if path in records},
            "outgoing_edges": [asdict(edge) for edge in snapshot.edges if edge.source == module.module_id],
        })
        for module in snapshot.modules
    }


def compare_snapshots(previous: EstateSnapshot, current: EstateSnapshot) -> EstateDelta:
    """Compare semantic nodes and their evidence, including body-only edits."""
    before, after = _module_hashes(previous), _module_hashes(current)
    old_files = {record.path: record for record in previous.census if record.kind == "file"}
    new_files = {record.path: record for record in current.census if record.kind == "file"}
    old_directories = {record.path for record in previous.census if record.kind == "directory"}
    new_directories = {record.path for record in current.census if record.kind == "directory"}
    old_edges = {canonical_json(asdict(edge)): edge for edge in previous.edges}
    new_edges = {canonical_json(asdict(edge)): edge for edge in current.edges}
    old_values, new_values = asdict(previous), asdict(current)
    metadata_keys = ["schema_version", "repo_commit", "timestamp", "registry", "reconciliation", "violations", "analysis_notes"]
    return EstateDelta(
        _snapshot_identity(previous)[0], _snapshot_identity(current)[0],
        sorted(after.keys() - before.keys()), sorted(before.keys() - after.keys()),
        sorted(name for name in before.keys() & after.keys() if before[name] != after[name]),
        sorted(new_files.keys() - old_files.keys()), sorted(old_files.keys() - new_files.keys()),
        sorted(path for path in old_files.keys() & new_files.keys() if old_files[path] != new_files[path]),
        sorted(new_directories - old_directories), sorted(old_directories - new_directories),
        [new_edges[key] for key in sorted(new_edges.keys() - old_edges.keys())],
        [old_edges[key] for key in sorted(old_edges.keys() - new_edges.keys())],
        [key for key in metadata_keys if old_values[key] != new_values[key]],
    )


def _document_hash(document: SealDocument) -> str:
    data = asdict(document)
    del data["document_sha256"]
    return content_hash(data)


def make_document(snapshot: EstateSnapshot, previous: SealDocument | None = None) -> SealDocument:
    """Create a history envelope while preserving byte-identical unchanged runs."""
    seal = create_seal(snapshot, previous.seal.seal_id if previous else None)
    if previous and seal.sha256 == previous.seal.sha256:
        return previous
    document = SealDocument(seal, snapshot, compare_snapshots(previous.snapshot, snapshot) if previous else None, "")
    return replace(document, document_sha256=_document_hash(document))


def _state_directory(root: Path, *, create: bool = False) -> Path:
    current = root.resolve()
    for part in OUTPUT_PREFIX.split("/"):
        current = current / part
        if current.is_symlink() or current.exists() and not current.is_dir():
            raise EstateError("Estate state directory must not cross a symlink or file")
        if create:
            current.mkdir(exist_ok=True)
    return current


def _load_document(path: Path) -> SealDocument:
    if path.is_symlink():
        raise EstateError("Cached seal must not be a symlink")
    try:
        with path.open("rb") as stream:
            payload = stream.read(MAX_CACHE_BYTES + 1)
        if len(payload) > MAX_CACHE_BYTES:
            raise EstateError("Cached seal exceeds the supported size bound")
        value: object = json.loads(payload)
        document = decode_record(SealDocument, value)
    except (OSError, ValueError, RecursionError) as error:
        raise EstateError("Cannot read a valid cached estate seal") from error
    if document.snapshot.schema_version != SCHEMA_VERSION:
        raise EstateError("Unsupported estate snapshot schema version")
    if document.document_sha256 != _document_hash(document):
        raise EstateError("Cached estate envelope hash does not match")
    if document.seal != create_seal(document.snapshot, document.seal.previous_seal):
        raise EstateError("Cached estate content hash or seal metadata does not match")
    return document


def load_latest(root: Path) -> SealDocument:
    """Load and validate the cached seal without scanning repository source."""
    path = _state_directory(root) / "seal.latest.json"
    if not path.exists():
        raise EstateError("No cached estate seal; run scripts/estate_census.py first")
    return _load_document(path)


def load_archive(root: Path, seal_id: str) -> SealDocument:
    """Load one archived snapshot using a validated content-derived seal ID."""
    if not SEAL_ID_PATTERN.fullmatch(seal_id):
        raise EstateError("Invalid seal ID")
    archive = _state_directory(root) / "seals"
    if archive.is_symlink():
        raise EstateError("Estate archive must not be a symlink")
    document = _load_document(archive / (seal_id + ".json"))
    if document.seal.seal_id != seal_id:
        raise EstateError("Archive filename and seal identity differ")
    return document


def _atomic_write(path: Path, text: str) -> None:
    if path.is_symlink():
        raise EstateError("Estate output must not replace a symlink")
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         prefix=".estate-", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except OSError as error:
        raise EstateError("Cannot store estate seal") from error
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def save_snapshot(root: Path, snapshot: EstateSnapshot) -> SealDocument:
    """Archive a seal and atomically update local state/estate/seal.latest.json."""
    state = _state_directory(root, create=True)
    latest = state / "seal.latest.json"
    previous = _load_document(latest) if latest.exists() else None
    document = make_document(snapshot, previous)
    archive = state / "seals"
    if archive.is_symlink():
        raise EstateError("Estate archive must not be a symlink")
    archive.mkdir(exist_ok=True)
    stored = archive / (document.seal.seal_id + ".json")
    text = json.dumps(asdict(document), indent=2, sort_keys=True, ensure_ascii=True, allow_nan=False) + "\n"
    if stored.exists():
        archived = _load_document(stored)
        if archived.seal.sha256 != document.seal.sha256:
            raise EstateError("Seal ID collision with different archived content")
    else:
        _atomic_write(stored, text)
    if previous != document:
        _atomic_write(latest, text)
    return document
