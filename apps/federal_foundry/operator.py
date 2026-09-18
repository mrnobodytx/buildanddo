# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/federal_foundry/operator.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/federal_foundry/catalog.py, apps/federal_foundry/protocol.py, apps/research/blueprints.py, apps/mission_suite/bundle.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/federal_foundry/catalog.py; DEPENDS_ON apps/federal_foundry/protocol.py; CONSUMES apps/research/blueprints.py; DEPENDS_ON apps/mission_suite/bundle.py
# DAG Node:    none
# Intent:      Discover public source capabilities and compile bounded operator proposals without inventing runtime readiness or authorizing work.
# ───────────────────────────────────────────────────────────────

"""Compile source-backed operator proposals using the existing foundry contracts.

Bundle publication requires Linux renameat2(RENAME_NOREPLACE) support from libc,
the kernel and the destination filesystem. Unsupported publication fails closed.
"""

from __future__ import annotations

import ctypes
import errno
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import struct
import tempfile
from datetime import datetime, timezone

from apps.federal_foundry.catalog import (
    ROOT,
    FoundryError,
    named,
    objects,
    relative_path,
    require,
    strings,
    validate_catalog,
)
from apps.federal_foundry.compiler import cgrf, json_text
from apps.federal_foundry.protocol import make_task
from apps.mission_suite.bundle import source_fingerprint
from apps.mission_suite.engine import decode, instant, obj, text
from apps.research.blueprints import Blueprint, MAX_BLUEPRINT_BYTES
from scripts.ci.evidence_epoch import sha256_json

SCHEMA = "buildanddo.operator-blueprint/v1"
DEFAULT_PROBLEM = (
    "Coordinate capability discovery, evidence gathering and human decisions "
    "for the BuildAndDo demo and federal portfolio."
)
EXTRA_CAPABILITIES = (
    (
        "blueprint-extraction",
        "Structured blueprint extraction",
        "Preserve document requirements, sections and source provenance as observations.",
        ("apps/research/blueprints.py", "apps/research/documents.py"),
    ),
    (
        "research-pipeline",
        "Bounded research processing",
        "Reuse public-source admission, protected uploads, transport and leased workers.",
        (
            "apps/research/processing.py",
            "apps/research/contracts.py",
            "apps/research/transport.py",
            "apps/research/worker.py",
        ),
    ),
    (
        "suite-worker",
        "Mission suite worker",
        "Replay scoped maritime and submission analyses with exact input and source identity.",
        ("apps/mission_suite/engine.py", "apps/mission_suite/worker.py"),
    ),
    (
        "source-telemetry",
        "BuildAndDo telemetry source",
        "Inspect existing collectors before binding approved runtime observations.",
        ("scripts/ci/emit_datadog_metrics.py", "apps/web/src/lib/datadogRum.js"),
    ),
)
SYSTEMS = (
    "datadog", "posthog", "github", "nxc", "supabase", "n8n",
    "cloudflare", "digitalocean", "rig2-fleet", "gpt-workers",
)


def _hash_value(value: object) -> object:
    if value is None:
        return ["null"]
    if type(value) is bool:
        return ["boolean", value]
    if isinstance(value, str):
        value.encode("utf-8")
        return ["string", value]
    if isinstance(value, (int, float)):
        require(type(value) in (int, float) and abs(value) <= 2**53 - 1, "invalid_number")
        number = float(value)
        require(math.isfinite(number), "invalid_number")
        return ["number", struct.pack(">d", number).hex()]
    if isinstance(value, list):
        return ["array", [_hash_value(item) for item in value]]
    data = obj(value)
    return ["object", [[key, _hash_value(data[key])] for key in sorted(data, key=lambda key: key.encode("utf-16-be"))]]


def content_fingerprint(proposal: dict[str, object]) -> str:
    """Hash portable typed JSON while excluding compiler time and identity fields."""
    content = {key: value for key, value in proposal.items() if key not in {"id", "content_sha256", "created_at"}}
    try:
        raw = json.dumps(_hash_value(content), ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    except (UnicodeError, ValueError, TypeError, RecursionError):
        raise FoundryError("invalid_proposal") from None
    return hashlib.sha256(raw).hexdigest()


def _source_reference(root: Path, name: str) -> dict[str, object] | None:
    name = relative_path(name)
    path = root / name
    require(
        root.is_dir()
        and not any(part.is_symlink() for part in (path, *path.parents))
        and path.resolve().is_relative_to(root.resolve()),
        "unsafe_source",
    )
    try:
        require(stat.S_ISREG(path.lstat().st_mode), "unsafe_source")
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
        with os.fdopen(descriptor, "rb") as stream:
            metadata = os.fstat(stream.fileno())
            require(stat.S_ISREG(metadata.st_mode), "unsafe_source")
            require(metadata.st_size <= 2_000_000, "source_too_large")
            data = stream.read(2_000_001)
        require(len(data) <= 2_000_000, "source_too_large")
    except FileNotFoundError:
        return None
    except OSError:
        raise FoundryError("source_unavailable") from None
    return {
        "id": "source-" + hashlib.sha256(name.encode()).hexdigest()[:20],
        "kind": "source_file",
        "path": name,
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def _capability_definitions(catalog: dict[str, object]) -> list[dict[str, object]]:
    result = [
        {"id": key, "name": key, "intent": value["intent"], "paths": value["source_paths"]}
        for key, value in named(catalog["shared_components"]).items()
    ]
    result.extend(
        {"id": key, "name": name, "intent": intent, "paths": list(paths)}
        for key, name, intent, paths in EXTRA_CAPABILITIES
    )
    require(len({row["id"] for row in result}) == len(result), "duplicate_capability")
    return result


def _dependencies(work: list[dict[str, object]]) -> list[dict[str, object]]:
    indexed = named(work, 30)
    visited: set[str] = set()
    visiting: set[str] = set()

    def visit(key: str) -> None:
        require(key in indexed and key not in visiting, "invalid_dependencies")
        if key in visited:
            return
        visiting.add(key)
        dependencies = strings(indexed[key]["depends_on"], 30)
        require(len(dependencies) == len(set(dependencies)), "invalid_dependencies")
        for dependency in dependencies:
            visit(dependency)
        visiting.remove(key)
        visited.add(key)

    for key in indexed:
        visit(key)
    return [{"id": row["id"], "depends_on": row["depends_on"]} for row in work]


def _work_queue(capabilities: list[dict[str, object]], source: bool) -> list[dict[str, object]]:
    definitions = [
        (
            "discover-capabilities", "Inspect current capability owners and source interfaces",
            "discovery", [], [str(row["id"]) for row in capabilities],
        ),
        (
            "official-opportunities", "Inspect official notices, amendments and acquisition deadlines",
            "research", [], ["requirements", "research-pipeline"],
        ),
        (
            "cultural-property-discovery",
            "Locate the Cultural Property notice and existing Photo Organizer, FAISS and Sentinel owners",
            "discovery", [], ["research-pipeline"],
        ),
        (
            "buildanddo-acceptance", "Run available BuildAndDo acceptance checks and retain exact failures",
            "verification", ["discover-capabilities"], ["blueprint-extraction", "mission-review", "suite-worker"],
        ),
        (
            "runtime-bindings", "Inspect existing NXC, telemetry and model/fleet read interfaces",
            "discovery", ["discover-capabilities"], ["experiment", "source-telemetry"],
        ),
        (
            "federal-evidence", "Prepare evidence and compliance gaps from the inspected official requirements",
            "research", ["official-opportunities"], ["requirements", "evidence", "mission-review"],
        ),
    ]
    if source:
        definitions.append((
            "document-review", "Review extracted requirements against the source and existing capabilities",
            "review", ["discover-capabilities"], ["blueprint-extraction", "requirements"],
        ))
    by_id = {str(row["id"]): row for row in capabilities}
    result: list[dict[str, object]] = []
    for key, title, kind, dependencies, refs in definitions:
        require(set(refs) <= set(by_id), "capability_missing")
        evidence = sorted({
            str(reference["id"])
            for capability in refs
            for reference in objects(by_id[capability]["source_refs"], 20)
        })
        result.append({
            "id": key, "title": title, "kind": kind,
            "status": "planned" if dependencies else "ready",
            "depends_on": dependencies, "capability_ids": refs,
            "evidence_refs": evidence, "authority": "A0", "owner": None,
        })
    return result


def operator_blueprint(
    catalog: dict[str, object],
    *,
    blueprint: dict[str, object] | None = None,
    problem: str | None = None,
    evaluated_at: str | None = None,
    root: Path | None = None,
) -> dict[str, object]:
    """Discover source capabilities and return an unapproved management proposal."""
    catalog = decode(json_text(validate_catalog(catalog)))
    base = root or ROOT
    at = evaluated_at if evaluated_at is not None else datetime.now(timezone.utc).isoformat()
    instant(at)
    statement = text(problem if problem is not None else DEFAULT_PROBLEM, 2400)
    source: dict[str, object] | None = None
    if blueprint is not None:
        try:
            raw = json.dumps(blueprint, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            raw.encode("utf-8")
        except (TypeError, ValueError, UnicodeError, RecursionError):
            raise FoundryError("invalid_blueprint") from None
        require(len(raw.encode()) <= MAX_BLUEPRINT_BYTES, "blueprint_too_large")
        source = decode(raw)
        Blueprint.from_dict(source)
        extracted = datetime.fromisoformat(str(source["extracted_at"]).replace("Z", "+00:00"))
        require(extracted <= instant(at), "future_blueprint")
    definitions = _capability_definitions(catalog)
    paths = {
        path
        for row in definitions
        for path in strings(row["paths"], 20, 1)
    } | {
        "apps/federal_foundry/operator.py", "apps/federal_foundry/__main__.py",
        "apps/federal_foundry/opportunities.json", "apps/mission_suite/bundle.py",
    }
    references = {path: _source_reference(base, path) for path in sorted(paths)}
    source_hash = source_fingerprint(base)
    capabilities: list[dict[str, object]] = [
        {
            "id": row["id"], "name": row["name"], "intent": row["intent"],
            "source_refs": [references[path] for path in strings(row["paths"], 20, 1) if references[path] is not None],
            "missing_source_paths": [path for path in strings(row["paths"], 20, 1) if references[path] is None],
            "evidence_state": "source_inspected" if all(references[path] is not None for path in strings(row["paths"], 20, 1)) else "source_incomplete",
            "runtime_readiness": "unknown",
        }
        for row in definitions
    ]
    work = _work_queue(capabilities, source is not None)
    evidence = [reference for reference in references.values() if reference is not None]
    if source is not None:
        evidence.append({
            "id": "input-blueprint", "kind": "blueprint_input", "path": "source_blueprint",
            "sha256": sha256_json(source),
        })
    tasks = [
        make_task(catalog, lane_id, role)
        for lane_id in sorted(named(catalog["opportunities"]))
        for role in ("builder", "verifier")
    ]
    result: dict[str, object] = {
        "schema_version": SCHEMA, "authority": "A0", "status": "proposal", "verified": False,
        "created_at": at, "source_sha256": source_hash, "catalog_sha256": sha256_json(catalog),
        "problem": statement, "evidence": evidence, "evidence_refs": evidence,
        "existing_capabilities": capabilities,
        "missing_capabilities": [
            {
                "id": key, "name": name, "state": "discovery_required", "reason": reason,
                "work_item": task_id,
            }
            for key, name, reason, task_id in (
                ("official-notices", "Current official opportunity evidence", "No official notice or deadline receipts are supplied.", "official-opportunities"),
                ("cultural-scope", "Cultural Property requirements and reuse", "The public catalogue has no Cultural Property requirements; existing private components remain uninspected.", "cultural-property-discovery"),
                ("runtime-owners", "NXC and model/fleet runtime bindings", "Source inspection does not establish an available runtime, credentials, health or worker capacity.", "runtime-bindings"),
            )
        ] + [
            {"id": "inspect-" + str(row["id"]), "name": row["name"], "state": "discovery_required", "reason": "Referenced source is not included in this checkout or portable archive; locate its existing owner before proposing new code.", "work_item": "discover-capabilities"}
            for row in capabilities if row["missing_source_paths"]
        ],
        "proposed_modules": [
            {"id": "document-intake", "name": "Existing blueprint intake", "action": "reuse", "capability_ids": ["blueprint-extraction", "research-pipeline"], "reason": "Keep document observations on the existing research pipeline."},
            {"id": "operator-projection", "name": "Federal operator projection", "action": "extend", "capability_ids": ["requirements", "experiment", "evidence", "mission-review"], "reason": "Combine existing source, task and evidence contracts before adding runtime integrations."},
            {"id": "private-bindings", "name": "Existing private runtime interfaces", "action": "discover", "capability_ids": ["experiment", "source-telemetry"], "reason": "Locate current owners and accepted interfaces before proposing adapter code."},
        ],
        "dependencies": _dependencies(work), "owner": {"seat": None, "status": "unassigned"},
        "tests": [
            {"id": key, "command": command, "status": "not_run", "purpose": purpose}
            for key, command, purpose in (
                ("operator", "python -m unittest tests.upgrade.test_operator_compiler", "Verify source discovery, immutable proposals and output safety."),
                ("foundry", "python tests/upgrade/check_federal_foundry.py", "Verify existing task and evidence boundaries."),
                ("blueprints", "python tests/upgrade/check_blueprints.py", "Verify extraction and research regressions; record native skips separately."),
                ("mission-suite", "python tests/upgrade/check_mission_suite.py", "Verify scope, retries, source identity and evidence replay."),
            )
        ],
        "telemetry": [{"id": key, "status": "not_observed", "observed_at": None, "evidence_refs": []} for key in SYSTEMS],
        "risks": [
            {"id": "runtime-assumption", "description": "Source availability can be mistaken for runtime readiness.", "mitigation": "Keep readiness unknown until a current scoped runtime receipt is inspected."},
            {"id": "untrusted-content", "description": "Documents and provider outputs can contain instructions or unsupported claims.", "mitigation": "Keep them as data and use existing authority and independent review contracts."},
            {"id": "stale-opportunity", "description": "A prior brief can omit current terms, deadlines or amendments.", "mitigation": "Read current official sources before preparing claim or compliance decisions."},
        ],
        "rollback": {
            "strategy": "Stop consuming this proposal while preserving historical evidence and existing missions.",
            "steps": ["Retain the proposal identity and source references.", "Create a revised proposal for changed requirements or evidence."],
        },
        "acceptance_criteria": [
            {"id": key, "text": value, "status": "pending", "evidence_refs": []}
            for key, value in (
                ("discovery", "Every proposed extension cites inspected reuse and its remaining runtime gaps."),
                ("evidence", "Record actual checks and failed experiments without turning source hashes into verified claims."),
                ("decisions", "Separate ordinary evidence work from explicit human rights, pricing, legal and release decisions."),
            )
        ],
        "work_queue": work,
        "human_decisions": [
            {"id": key, "title": title, "condition": condition, "state": "conditional", "required_for": required_for, "decision": None}
            for key, title, condition, required_for in (
                ("rights", "Approve required data and IP rights", "If a selected source or deliverable needs rights not already granted.", "Use or release of restricted data or IP"),
                ("pricing", "Approve pricing and financial commitments", "Before making a price, funding request or financial commitment.", "An external cost proposal or paid commitment"),
                ("legal", "Approve legal and certification representations", "Before attesting to eligibility, security compliance or corporate facts.", "A contractual or federal attestation"),
                ("production", "Approve production changes", "If a separate receiving dispatch proposes a production effect.", "Production deployment or mutation"),
                ("submission", "Approve external submission", "If the owner later chooses to submit a reviewed response.", "A procurement or proposal submission"),
            )
        ],
        "opportunities": [
            {"id": key, "title": lane["title"], "srs_code": lane["srs_code"], "deadline": lane["deadline"], "evidence_state": "unverified"}
            for key, lane in sorted(named(catalog["opportunities"]).items())
        ],
        "source_blueprint": source, "prepared_tasks": tasks, "hosted_dispatches_created": 0,
    }
    require(
        source_fingerprint(base) == source_hash
        and all(task["source_sha256"] == source_hash for task in tasks)
        and references == {path: _source_reference(base, path) for path in sorted(paths)},
        "source_changed_during_compile",
    )
    # Compilation time is provenance, not a new mission identity on every refresh.
    result["content_sha256"] = content_fingerprint(result)
    result["id"] = "OP-" + str(result["content_sha256"])[:24]
    return result


def _directory_identity(metadata: os.stat_result) -> tuple[int, int]:
    return metadata.st_dev, metadata.st_ino


def _directory_matches(
    name: str | Path, directory: int | None, expected: tuple[int, int]
) -> bool:
    try:
        metadata = os.stat(name, dir_fd=directory, follow_symlinks=False)
    except OSError:
        return False
    return stat.S_ISDIR(metadata.st_mode) and _directory_identity(metadata) == expected


def _publish_directory(source_fd: int, source: str, target_fd: int, target: str) -> None:
    """Publish an already-bound directory with Linux atomic no-replace semantics."""
    try:
        operation = ctypes.CDLL(None, use_errno=True).renameat2
    except (AttributeError, OSError):
        raise FoundryError("atomic_publication_unavailable") from None
    operation.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    operation.restype = ctypes.c_int
    result = operation(source_fd, os.fsencode(source), target_fd, os.fsencode(target), 1)
    if result != 0:
        reason = ctypes.get_errno()
        if reason in {errno.ENOSYS, errno.EINVAL, errno.ENOTSUP}:
            raise FoundryError("atomic_publication_unavailable")
        raise OSError(reason, os.strerror(reason))


def compile_operator(
    catalog: dict[str, object],
    output: Path,
    *,
    blueprint: dict[str, object] | None = None,
    problem: str | None = None,
    evaluated_at: str | None = None,
) -> dict[str, object]:
    """Write a new proposal bundle without overwriting or retaining failed output."""
    require(not output.exists() and not output.is_symlink(), "output_exists")
    require(
        output.name not in {"", ".", ".."} and output.parent.is_dir()
        and not any(parent.is_symlink() for parent in (output.parent, *output.parents)),
        "unsafe_output",
    )
    proposal = operator_blueprint(catalog, blueprint=blueprint, problem=problem, evaluated_at=evaluated_at)
    files = {
        "operator-blueprint.json": json_text(proposal),
        "bits_tasks.json": json_text({
            "schema_version": "federal.bits-intake/v1", "catalog_sha256": proposal["catalog_sha256"],
            "source_sha256": proposal["source_sha256"], "intake_status": "PREPARED",
            "max_parallel_lanes": catalog["max_parallel_lanes"], "model_selection": "caller",
            "tasks": proposal["prepared_tasks"], "hosted_dispatches_created": 0,
        }),
    }
    files["operator-manifest.json"] = json_text({
        "schema_version": "buildanddo.operator-bundle/v1", "proposal_id": proposal["id"],
        "content_sha256": proposal["content_sha256"], "authority": "A0",
        "files": [{"path": name, "sha256": hashlib.sha256(data.encode()).hexdigest()} for name, data in sorted(files.items())],
    })
    for name in list(files):
        sidecar = name + ".cgrf.yaml"
        files[sidecar] = cgrf(sidecar, "SRS-BUILDANDDO-UPGRADE-001", str(proposal["created_at"]), stage="11_COMMIT") + (
            "schema_version: 1\ngoverns: " + name + "\n"
        )
    # Bind and finish the candidate inside private staging. The public path is
    # never adopted or pre-created: one atomic no-replace rename publishes it.
    owned: list[tuple[str, int, int]] = []
    parent_fd: int | None = None
    output_fd: int | None = None
    reserved: tuple[int, int] | None = None
    directory_flags = getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    require(
        bool(getattr(os, "O_DIRECTORY", 0)) and bool(getattr(os, "O_NOFOLLOW", 0)),
        "output_handles_unavailable",
    )
    try:
        with tempfile.TemporaryDirectory(prefix=".operator-", dir=output.parent) as staging:
            staged = Path(staging)
            for name, content in sorted(files.items()):
                (staged / name).write_text(content, encoding="utf-8", newline="\n")
            parent_fd = os.open(output.parent, os.O_RDONLY | directory_flags)
            parent_identity = _directory_identity(os.fstat(parent_fd))
            staging_fd = os.open(staged, os.O_RDONLY | directory_flags)
            try:
                candidate = "candidate"
                os.mkdir(candidate, mode=0o700, dir_fd=staging_fd)
                output_fd = os.open(candidate, os.O_RDONLY | directory_flags, dir_fd=staging_fd)
                reserved = _directory_identity(os.fstat(output_fd))
                for name in sorted(files):
                    metadata = os.stat(name, dir_fd=staging_fd, follow_symlinks=False)
                    if not stat.S_ISREG(metadata.st_mode):
                        raise OSError("Staged file was replaced")
                    owned.append((name, metadata.st_dev, metadata.st_ino))
                    os.link(name, name, src_dir_fd=staging_fd, dst_dir_fd=output_fd, follow_symlinks=False)
                if (
                    not _directory_matches(output.parent, None, parent_identity)
                    or not _directory_matches(candidate, staging_fd, reserved)
                ):
                    raise OSError("Publication directory changed")
                _publish_directory(staging_fd, candidate, parent_fd, output.name)
                if (
                    not _directory_matches(output.parent, None, parent_identity)
                    or not _directory_matches(output.name, parent_fd, reserved)
                ):
                    raise OSError("Output directory changed during publication")
            finally:
                os.close(staging_fd)
    except BaseException as error:
        # The visible path may now belong to another actor. Clean only links
        # still owned by this invocation in the directory whose handle we hold.
        if output_fd is not None and _directory_identity(os.fstat(output_fd)) == reserved:
            for name, device, inode in reversed(owned):
                try:
                    metadata = os.stat(name, dir_fd=output_fd, follow_symlinks=False)
                    if _directory_identity(metadata) == (device, inode):
                        os.unlink(name, dir_fd=output_fd)
                except FileNotFoundError:
                    pass
        if parent_fd is not None and reserved is not None and _directory_matches(output.name, parent_fd, reserved):
            try:
                os.rmdir(output.name, dir_fd=parent_fd)
            except OSError:
                pass  # Preserve concurrent files and any replacement directory.
        if isinstance(error, OSError):
            raise FoundryError("output_write_failed") from None
        raise
    finally:
        if output_fd is not None:
            os.close(output_fd)
        if parent_fd is not None:
            os.close(parent_fd)
    return {
        "state": "COMPILED", "output": str(output), "proposal_id": proposal["id"],
        "content_sha256": proposal["content_sha256"], "files": len(files),
        "opportunities": len(named(catalog["opportunities"])), "tasks": len(objects(proposal["prepared_tasks"], 10)),
        "hosted_dispatches_created": 0, "authority": "A0", "submission_authorized": False,
    }
