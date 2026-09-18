# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/decision/adapters/components_to_missions.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/blueprint_models.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/research/blueprint_models.py
# DAG Node:    none
# Intent:      Connect source requirements to authority-bounded review plans while retaining evaluation and PDF provenance.
# ───────────────────────────────────────────────────────────────

"""Order component challenges without hiding cycles or missing dependencies."""
from __future__ import annotations

import hashlib
from typing import cast

from apps.decision.adapters.contracts import BlueprintPlanError, Challenge, ComponentGraph, MissionPlan


def components_to_missions(graph: ComponentGraph) -> MissionPlan:
    """Create a stable mission draft with dependencies before dependents."""
    by_id = {component.id: component for component in graph.components}
    if len(by_id) != len(graph.components) or graph.verified or graph.authority != "A0":
        raise BlueprintPlanError("invalid_component_graph")
    remaining = {key: {dep.component_id for dep in component.dependencies}
                 for key, component in by_id.items()}
    if any(dep not in by_id for deps in remaining.values() for dep in deps):
        raise BlueprintPlanError("missing_dependency")
    order: list[str] = []
    while remaining:
        ready = sorted(key for key, deps in remaining.items() if not deps)
        if not ready:
            raise BlueprintPlanError("cyclic_dependencies")
        order.extend(ready)
        for key in ready:
            del remaining[key]
        for deps in remaining.values():
            deps.difference_update(ready)
    challenges = []
    for number, key in enumerate(order, 1):
        component = by_id[key]
        if not component.requirements or not component.provenance:
            raise BlueprintPlanError("missing_requirement_provenance")
        scores = [receipt.decision.answers.get("complexity") for receipt in component.evaluations]
        estimates = [float(cast(float, score.value)) for score in scores if score and not score.abstained
                     and type(score.value) in (int, float)]
        challenges.append(Challenge("challenge-" + key.removeprefix("component-"), number, component,
                                    [req.id for req in component.requirements],
                                    sorted({dep.component_id for dep in component.dependencies}),
                                    max(estimates) if estimates else None, list(component.provenance)))
    identity = hashlib.sha256((graph.blueprint_id + ":" + ":".join(order)).encode()).hexdigest()
    return MissionPlan("mission-" + identity, graph.blueprint_id, graph.input_sha256,
                       "Blueprint implementation review", challenges, list(graph.warnings))
