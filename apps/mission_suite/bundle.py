# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/mission_suite/bundle.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     scripts/ci/evidence_epoch.py, apps/research/contracts.py, apps/federal_foundry/__main__.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/evidence_epoch.py; DEPENDS_ON apps/research/contracts.py; CONSUMES apps/federal_foundry/__main__.py
# DAG Node:    none
# Intent:      Package an explicit source closure for a box worker without copying credentials, runtime data or deployment authority.
# ───────────────────────────────────────────────────────────────

"""Build a portable standard-library worker archive from an allowlisted closure."""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import tarfile
from pathlib import Path

from apps.research.contracts import ResearchError
from scripts.ci.evidence_epoch import sha256_file, sha256_json

SOURCE_FILES = (
    "apps/mission_suite/__main__.py",
    "apps/mission_suite/bundle.py",
    "apps/mission_suite/engine.py",
    "apps/mission_suite/worker.py",
    "apps/research/contracts.py",
    "apps/research/transport.py",
    "scripts/discordbot/contracts.py",
    "scripts/ci/evidence_epoch.py",
    "apps/federal_foundry/__main__.py",
    "apps/federal_foundry/catalog.py",
    "apps/federal_foundry/compiler.py",
    "apps/federal_foundry/evidence.py",
    "apps/federal_foundry/protocol.py",
    "apps/federal_foundry/opportunities.json",
)

EXTRA_FILES = (
    "docs/mission-suite.md",
    "docs/federal-foundry.md",
    "apps/federal_foundry/opportunities.json.cgrf.yaml",
    ".bits/srs/SRS-BUILDANDDO-FEDERAL-INFLUENCE-001.md",
    ".bits/srs/SRS-BUILDANDDO-FEDERAL-NAVAIR-001.md",
    ".bits/srs/SRS-BUILDANDDO-FEDERAL-LOW-SWAP-001.md",
    ".bits/srs/SRS-BUILDANDDO-FEDERAL-SEMANTIC-ISR-001.md",
    ".bits/srs/SRS-BUILDANDDO-FEDERAL-MARITIME-001.md",
)


def source_manifest(root: Path | None = None) -> dict[str, object]:
    """Fingerprint the worker's exact source closure, including reused libraries."""
    base = root or Path(__file__).resolve().parents[2]
    files = []
    try:
        for name in SOURCE_FILES:
            path = base / name
            if (
                path.is_symlink()
                or not path.is_file()
                or not path.resolve().is_relative_to(base.resolve())
            ):
                raise ResearchError("configuration")
            files.append({"path": name, "sha256": sha256_file(path)})
    except OSError as error:
        raise ResearchError("configuration") from error
    return {
        "schema_version": "mission-suite.source/v1",
        "python_requires": ">=3.11",
        "files": files,
        "third_party_python_packages": [],
        "authority": "source_identity_only",
        "installed_runtime_proof": False,
    }


def source_fingerprint(root: Path | None = None) -> str:
    """Return a source identity, never a release-admission root."""
    return sha256_json(source_manifest(root))


def archive_bytes(base: Path, name: str) -> bytes:
    """Read an allowlisted regular file inside the package source directory."""
    path = base / name
    if (
        path.is_symlink()
        or not path.is_file()
        or not path.resolve().is_relative_to(base.resolve())
    ):
        raise ResearchError("configuration")
    return path.read_bytes()


def package(output: Path, root: Path | None = None) -> dict[str, object]:
    """Write a reproducible archive with only the reviewed source and usage guide."""
    base = root or Path(__file__).resolve().parents[2]
    manifest = source_manifest(base)
    manifest["source_sha256"] = sha256_json(manifest)
    contents = {
        name: archive_bytes(base, name) for name in (*SOURCE_FILES, *EXTRA_FILES)
    }
    packaged_source = [
        {"path": name, "sha256": hashlib.sha256(contents[name]).hexdigest()}
        for name in SOURCE_FILES
    ]
    if packaged_source != manifest["files"]:
        raise ResearchError("configuration")
    # Include the repository's existing distribution terms when present.
    for name in ("LICENSE", "LICENSE.md", "COMMERCIAL.md", "NOTICE"):
        path = base / name
        if path.exists() or path.is_symlink():
            contents[name] = archive_bytes(base, name)
    manifest["archive_files"] = [
        {"path": name, "sha256": hashlib.sha256(data).hexdigest()}
        for name, data in sorted(contents.items())
    ]
    contents["suite-manifest.json"] = (
        json.dumps(manifest, sort_keys=True, indent=2) + "\n"
    ).encode()
    with (
        output.open("xb") as stream,
        gzip.GzipFile(fileobj=stream, mode="wb", filename="", mtime=0) as zipped,
    ):
        with tarfile.open(fileobj=zipped, mode="w") as archive:
            for name, data in sorted(contents.items()):
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.mode = 0o644
                entry.mtime = 0
                archive.addfile(entry, io.BytesIO(data))
    return {
        "path": str(output),
        "source_sha256": manifest["source_sha256"],
        "archive_sha256": sha256_file(output),
        "files": len(contents),
        "deployed": False,
    }
