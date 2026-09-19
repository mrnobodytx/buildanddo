# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/sbom.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/inputs.py, libs/semantic_twin/phase1/common.py, libs/semantic_twin/phase1/compat.py, libs/semantic_twin/receipts.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/inputs.py; CONSUMES libs/semantic_twin/phase1/common.py; CONSUMES libs/semantic_twin/phase1/compat.py; CONSUMES libs/semantic_twin/receipts.py; CONSUMES libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-1.sbom
# Intent:      Normalize CycloneDX, SPDX and npm lock manifests into versioned package and dependency semantics.
# ───────────────────────────────────────────────────────

"""Parse local supply-chain manifests into semantic package graphs."""

from __future__ import annotations

from collections.abc import Mapping
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..ingestion.graph import SemanticGraph
from ..ingestion.inputs import SourceSnapshot
from ..receipts import EvidenceKind
from ..vocabulary import EvidenceState, RelationPredicate
from .common import as_mapping, relation, relative_path, stable_id
from .compat import make_object


@dataclass(frozen=True, slots=True)
class PackageRecord:
    """Represent one package and its manifest-local dependency references."""

    key: str
    name: str
    version: str | None
    license: str | None
    purl: str | None
    dependencies: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class SbomDocument:
    """Retain one parsed supply-chain document and its normalized packages."""

    source_path: str
    format: str
    packages: tuple[PackageRecord, ...]
    snapshot: SourceSnapshot


def discover_sbom_paths(repository_root: Path) -> tuple[Path, ...]:
    """Find root lock data and explicitly named JSON SBOM documents."""

    paths: set[Path] = set()
    lock = repository_root / "package-lock.json"
    if lock.is_file():
        paths.add(lock)
    for pattern in ("*sbom*.json", "*bom*.json", "*spdx*.json"):
        paths.update(
            path
            for path in repository_root.rglob(pattern)
            if not {
                "node_modules",
                ".git",
                ".mypy_cache",
                ".ruff_cache",
                "__pycache__",
                "dist",
                "build",
            }.intersection(path.parts)
        )
    return tuple(sorted(paths, key=lambda item: item.as_posix()))


def _text(value: Any) -> str | None:
    """Normalize a non-empty JSON scalar to text."""

    if isinstance(value, (str, int, float)) and str(value).strip():
        return str(value).strip()
    return None


def _license_text(component: Mapping[str, Any]) -> str | None:
    """Extract the first CycloneDX license identifier or expression."""

    licenses = component.get("licenses")
    if not isinstance(licenses, list):
        return None
    for item in licenses:
        entry = as_mapping(item)
        expression = _text(entry.get("expression"))
        if expression:
            return expression
        license_data = as_mapping(entry.get("license"))
        value = _text(license_data.get("id")) or _text(license_data.get("name"))
        if value:
            return value
    return None


def _cyclonedx(payload: Mapping[str, Any]) -> tuple[PackageRecord, ...]:
    """Parse CycloneDX components and dependency entries."""

    dependency_map: dict[str, tuple[str, ...]] = {}
    dependencies = payload.get("dependencies")
    if isinstance(dependencies, list):
        for item in dependencies:
            entry = as_mapping(item)
            reference = _text(entry.get("ref"))
            targets = entry.get("dependsOn")
            if reference and isinstance(targets, list):
                dependency_map[reference] = tuple(
                    value for target in targets if (value := _text(target)) is not None
                )
    result: list[PackageRecord] = []
    components = payload.get("components")
    if isinstance(components, list):
        for index, item in enumerate(components):
            component = as_mapping(item)
            name = _text(component.get("name")) or f"component-{index}"
            version = _text(component.get("version"))
            purl = _text(component.get("purl"))
            key = _text(component.get("bom-ref")) or purl or f"{name}@{version or '*'}"
            result.append(
                PackageRecord(
                    key=key,
                    name=name,
                    version=version,
                    license=_license_text(component),
                    purl=purl,
                    dependencies=dependency_map.get(key, ()),
                )
            )
    return tuple(result)


def _spdx(payload: Mapping[str, Any]) -> tuple[PackageRecord, ...]:
    """Parse SPDX packages and DEPENDS_ON relationships."""

    dependency_map: dict[str, list[str]] = {}
    relationships = payload.get("relationships")
    if isinstance(relationships, list):
        for item in relationships:
            edge = as_mapping(item)
            if str(edge.get("relationshipType", "")).upper() != "DEPENDS_ON":
                continue
            source = _text(edge.get("spdxElementId"))
            target = _text(edge.get("relatedSpdxElement"))
            if source and target:
                dependency_map.setdefault(source, []).append(target)
    result: list[PackageRecord] = []
    packages = payload.get("packages")
    if isinstance(packages, list):
        for index, item in enumerate(packages):
            package = as_mapping(item)
            name = _text(package.get("name")) or f"package-{index}"
            key = _text(package.get("SPDXID")) or name
            external_refs = package.get("externalRefs")
            purl = None
            if isinstance(external_refs, list):
                for reference in external_refs:
                    data = as_mapping(reference)
                    if str(data.get("referenceType", "")).casefold().endswith("purl"):
                        purl = _text(data.get("referenceLocator"))
                        break
            result.append(
                PackageRecord(
                    key=key,
                    name=name,
                    version=_text(package.get("versionInfo")),
                    license=_text(package.get("licenseConcluded")),
                    purl=purl,
                    dependencies=tuple(dependency_map.get(key, ())),
                )
            )
    return tuple(result)


def _npm_lock(payload: Mapping[str, Any]) -> tuple[PackageRecord, ...]:
    """Parse npm lockfile v2/v3 package records and dependency names."""

    package_map = payload.get("packages")
    if not isinstance(package_map, Mapping):
        return ()
    result: list[PackageRecord] = []
    known_keys = {str(key) for key in package_map}
    for raw_key, raw_value in package_map.items():
        key = str(raw_key)
        package = as_mapping(raw_value)
        default_name = Path(key).name if key else _text(payload.get("name")) or "root"
        name = _text(package.get("name")) or default_name
        dependencies = package.get("dependencies")
        targets: list[str] = []
        if isinstance(dependencies, Mapping):
            for dependency_name in dependencies:
                candidate = f"node_modules/{dependency_name}"
                targets.append(
                    candidate if candidate in known_keys else str(dependency_name)
                )
        result.append(
            PackageRecord(
                key=key or ".",
                name=name,
                version=_text(package.get("version")),
                license=_text(package.get("license")),
                purl=None,
                dependencies=tuple(sorted(targets)),
            )
        )
    return tuple(result)


def parse_sbom(path: Path, *, repository_root: Path | None = None) -> SbomDocument:
    """Parse CycloneDX, SPDX or npm lock JSON from one local file."""

    snapshot = SourceSnapshot.capture(
        path, source_path=relative_path(path, repository_root)
    )
    payload = as_mapping(json.loads(snapshot.content))
    if payload.get("bomFormat") == "CycloneDX":
        format_name = "cyclonedx"
        packages = _cyclonedx(payload)
    elif "spdxVersion" in payload:
        format_name = "spdx"
        packages = _spdx(payload)
    elif "lockfileVersion" in payload:
        format_name = "npm-lock"
        packages = _npm_lock(payload)
    else:
        raise ValueError(f"unsupported SBOM format: {path}")
    return SbomDocument(
        source_path=relative_path(path, repository_root),
        format=format_name,
        packages=packages,
        snapshot=snapshot,
    )


def sbom_graph(
    documents: tuple[SbomDocument, ...],
    *,
    anchor_id: str,
    commit: str | None = None,
) -> SemanticGraph:
    """Convert supply-chain documents into connected package dependency graphs."""

    objects = []
    for document in documents:
        document_id = stable_id("sbom", document.source_path, document.format)
        package_ids = {
            item.key: stable_id("package", document.source_path, item.key)
            for item in document.packages
        }
        objects.append(
            make_object(
                document_id,
                "SoftwareBillOfMaterials",
                document.source_path,
                snapshot=document.snapshot,
                claims=(
                    {
                        "format": document.format,
                        "package_count": len(document.packages),
                    },
                ),
                relations=(
                    relation(
                        RelationPredicate.REFINES,
                        anchor_id,
                        document.source_path,
                    ),
                ),
                evidence_state=EvidenceState.OBSERVED,
                lifecycle_state="OBSERVED_LOCAL_MANIFEST",
                commit=commit,
                documentation=(document.source_path,),
            )
        )
        for item in document.packages:
            dependency_relations = [
                relation(
                    RelationPredicate.MEMBER_OF,
                    document_id,
                    document.source_path,
                )
            ]
            dependency_relations.extend(
                relation(
                    RelationPredicate.DEPENDS_ON,
                    package_ids[target],
                    document.source_path,
                    state=EvidenceState.INFERRED,
                    kinds=(EvidenceKind.STATIC_ANALYSIS,),
                )
                for target in item.dependencies
                if target in package_ids
            )
            objects.append(
                make_object(
                    package_ids[item.key],
                    "SoftwarePackage",
                    document.source_path,
                    snapshot=document.snapshot,
                    claims=(
                        {
                            "key": item.key,
                            "name": item.name,
                            "version": item.version,
                            "license": item.license,
                            "purl": item.purl,
                        },
                    ),
                    relations=tuple(dependency_relations),
                    evidence_state=EvidenceState.OBSERVED,
                    lifecycle_state="OBSERVED_LOCAL_MANIFEST",
                    commit=commit,
                )
            )
    return SemanticGraph(tuple(objects))
