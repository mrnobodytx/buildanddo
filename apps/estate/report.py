# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/estate/report.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/estate/seal.py, apps/estate/validate.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/estate/seal.py; DEPENDS_ON apps/estate/validate.py
# DAG Node:    none
# Intent:      Project sealed estate evidence into readable summaries and precise module, defect and delta views.
# ───────────────────────────────────────────────────────────────

"""Render human-readable projections from sealed estate evidence."""

from __future__ import annotations

from collections import Counter
import textwrap

from apps.estate.common import EstateError
from apps.estate.modules import EstateModule
from apps.estate.seal import EstateDelta, EstateSnapshot, SealDocument
from apps.estate.validate import SHAPES


def select_module(snapshot: EstateSnapshot, query: str) -> EstateModule:
    """Resolve a full ID, path or unambiguous short module name."""
    exact = [module for module in snapshot.modules if query in {module.module_id, module.path}]
    matches = exact or [module for module in snapshot.modules if query in {module.path.rsplit("/", 1)[-1], module.module_id.rsplit(".", 1)[-1]}]
    if len(matches) != 1:
        raise EstateError("Module query is ambiguous; use a full ID or path" if matches else "Module was not found in the cached estate")
    return matches[0]


def render_delta(delta: EstateDelta | None) -> str:
    """Render exact changes or identify the first local seal."""
    if delta is None:
        return "DELTA from previous seal: (first run)"
    lines = [f"DELTA {delta.from_seal} -> {delta.to_seal}"]
    categories = [
        ("Modules added", delta.added_modules), ("Modules removed", delta.removed_modules),
        ("Modules modified", delta.modified_modules), ("Files added", delta.added_files),
        ("Files removed", delta.removed_files), ("Files modified", delta.modified_files),
        ("Directories added", delta.added_directories), ("Directories removed", delta.removed_directories),
        ("Metadata changed", delta.changed_metadata),
    ]
    for label, values in categories:
        lines.append(f"  {label}: {len(values)}")
        lines.extend("    " + value for value in values)
    lines.append(f"  Edges added: {len(delta.added_edges)}")
    lines.extend(f"    {edge.source} {edge.edge_type} {edge.target} ({edge.evidence})" for edge in delta.added_edges)
    lines.append(f"  Edges removed: {len(delta.removed_edges)}")
    lines.extend(f"    {edge.source} {edge.edge_type} {edge.target} ({edge.evidence})" for edge in delta.removed_edges)
    return "\n".join(lines)


def render_report(document: SealDocument) -> str:
    """Render the estate census, graph coverage, structural defects and delta."""
    snapshot, seal = document.snapshot, document.seal
    census = snapshot.census
    summary = snapshot.reconciliation.summary
    edge_counts = Counter(edge.evidence for edge in snapshot.edges)
    defects = Counter(violation.shape for violation in snapshot.violations)
    lines = [
        "BUILDANDDO ESTATE INTELLIGENCE", "=" * 32,
        f"Seal: {seal.seal_id}", f"Commit: {seal.repo_commit}", f"SHA-256: {seal.sha256}",
        f"Evidence timestamp: {seal.timestamp}", "", "CENSUS",
        f"  Files inventoried:    {sum(record.kind == 'file' for record in census):,}",
        f"  Directories:         {sum(record.kind == 'directory' for record in census):,}",
        f"  CGRF-tagged files:   {sum(record.kind == 'file' and record.cgrf_present for record in census):,}",
        f"  Boundary indicators: {sum(record.candidate_module for record in census):,}",
        f"  Text files analyzed: {sum(record.kind == 'file' and record.analysis_status == 'analyzed' for record in census):,}",
        f"  Analysis notes:      {len(snapshot.analysis_notes):,}", "", "MODULES",
    ]
    width = max((len(module.path) for module in snapshot.modules), default=0)
    for module in snapshot.modules:
        routes = sum(route.module_id == module.module_id for route in snapshot.routes)
        collections = len({(collection.backend, collection.name) for collection in snapshot.collections if collection.module_id == module.module_id})
        counts = f"{len(module.files)} files"
        if routes:
            counts += f", {routes} routes"
        if collections:
            counts += f", {collections} collections"
        description = textwrap.shorten(module.description or module.utility_role or module.kind.lower(), width=85, placeholder="...")
        lines.append(f"  {module.path:<{width}}  {module.plane:<13} {counts}; {description}")
    lines.extend([
        "", "DEPENDENCIES", f"  Total module edges:  {len(snapshot.edges):,}",
        f"  From imports:        {edge_counts['import']:,}",
        f"  From CGRF headers:   {edge_counts['cgrf_header']:,}",
        f"  From route regs:     {edge_counts['route_registration']:,}",
        f"  From manifests:      {edge_counts['package_manifest']:,}",
        f"  External references: {sum(reference.status == 'external' for reference in snapshot.references):,}",
        "", "RECONCILIATION", f"  Declared modules:       {summary.declared_modules}",
        f"  Observed modules:       {summary.observed_modules}", f"  Matched:                {summary.matched}",
        f"  Orphan implementations: {summary.orphan_implementations}",
        f"  Declared but missing:   {summary.declared_but_missing}",
        f"  Duplicate implementations: {summary.duplicate_implementations}",
        f"  Stale references:       {summary.stale_references}", f"  Coverage:               {summary.coverage_pct:g}%",
        "", "VALIDATION (structural defects)",
    ])
    lines.extend(f"  {shape} violations: {defects[shape]}" for shape in SHAPES)
    lines.extend(["", render_delta(document.delta)])
    return "\n".join(lines)


def render_module(snapshot: EstateSnapshot, query: str) -> str:
    """Render one module and the evidence directly attached to it."""
    module = select_module(snapshot, query)
    lines = [
        module.module_id, f"Path: {module.path}",
        f"Kind: {module.kind}  Plane: {module.plane}  Lifecycle: {module.lifecycle}",
        "SRS: " + (", ".join(module.srs_codes) or "(none)"),
        "Dispatches: " + (", ".join(module.dispatch_ids) or "(none)"),
        "Utility role: " + (module.utility_role or "(none)"), "", "PROVENANCE",
    ]
    for kind, paths in module.provenance.items():
        lines.append("  " + kind + ": " + ", ".join(paths))
    lines.extend(["", "CAPABILITIES", *("  " + value for value in module.capabilities), "", "FILES"])
    lines.extend("  " + path for path in module.files)
    lines.extend(["", "EDGES"])
    lines.extend(f"  {edge.source} {edge.edge_type} {edge.target} ({edge.evidence}, {edge.confidence:g})"
                 for edge in snapshot.edges if module.module_id in {edge.source, edge.target})
    return "\n".join(lines)


def render_orphans(snapshot: EstateSnapshot) -> str:
    """List semantic modules lacking an observed declaration match."""
    ids = set(snapshot.reconciliation.orphan_module_ids)
    return "\n".join(f"{module.module_id}  {module.path}" for module in snapshot.modules if module.module_id in ids) or "No unreconciled modules."


def render_violations(snapshot: EstateSnapshot) -> str:
    """List structural defects with their source evidence paths."""
    lines = [
        f"{item.shape} [{item.code}] {item.subject}\n  {item.message}\n  Evidence: {', '.join(item.evidence_files) or '(module graph)'}"
        for item in snapshot.violations
    ]
    return "\n".join(lines) or "No structural defects."
