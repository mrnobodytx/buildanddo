# ─── CGRF Header ──────────────────────────────
# File:        apps/career/packages.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/compiler.py, apps/career/evidence.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/career/compiler.py; PRODUCES apps/career/outcomes.py; PRODUCES apps/career/fill.py
# DAG Node:    none
# Intent:      Reload a written application package only when its bytes still match the digest the human approved.
# ─────────────────────────────────────────────────────────────

"""Write and reload application package directories with digest verification."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from apps.career.compiler import PACKAGE_FILES, Package, canonical_json
from apps.career.evidence import CareerError


def write_package(folder: Path, package: Package) -> None:
    """Write package files and a manifest carrying the package digest."""
    folder.mkdir(parents=True)
    for filename, content in package.files.items():
        (folder / filename).write_text(content, encoding="utf-8")
    (folder / "manifest.json").write_text(
        canonical_json({**package.manifest, "package_digest": package.digest}), encoding="utf-8"
    )


def load_package(folder: Path) -> dict[str, Any]:
    """Reload a package directory; reject any file that changed after compilation."""
    try:
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        files = {name: (folder / name).read_text(encoding="utf-8") for name in PACKAGE_FILES}
    except (OSError, json.JSONDecodeError) as error:
        raise CareerError(f"cannot read package at {folder}") from error
    if not isinstance(manifest, dict):
        raise CareerError("package manifest must be an object")
    recorded = manifest.pop("package_digest", None)
    package = Package(manifest, files)
    if recorded != package.digest:
        raise CareerError("package contents do not match their recorded digest")
    return {
        "manifest": manifest,
        "files": files,
        "digest": package.digest,
        "role": str(manifest.get("role") or ""),
        "company": str(manifest.get("company") or ""),
        "application_system": manifest.get("application_system"),
    }
