# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/decision/adapters/blueprint_to_components.py
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

"""Infer a component graph from requirement entities and BDR receipts."""
from __future__ import annotations

from collections import defaultdict
import hashlib
import re

from apps.decision.adapters.contracts import (
    BlueprintPlanError, Component, ComponentGraph, Dependency, Provenance,
)
from apps.decision.workloads.blueprint_evaluation import COMPONENT_TYPES, RequirementEvaluation
from apps.research.blueprint_models import Blueprint
from apps.research.blueprint_parse import STOP

DATA = re.compile(r"\b([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)?)\s+(records?|events?|messages?|data)\b"
                  r"(?!\s+(?:records?|events?|messages?|data)\b)", re.I)
PRODUCES = re.compile(r"\b(produces?|publish(?:es)?|stores?|writes?|emits?)\b", re.I)
CONSUMES = re.compile(r"\b(consumes?|reads?|quer(?:y|ies)|receives?|subscribes?)\b", re.I)


def _data_entities(value: str) -> list[tuple[str, str]]:
    found = []
    for match in DATA.finditer(value):
        noun = STOP.split(match.group(1))[-1].strip().casefold()
        if noun:
            found.append((noun + " " + match.group(2).lower().rstrip("s"), match.group()))
    return found


def blueprint_to_components(blueprint: Blueprint, evaluations: list[RequirementEvaluation]) -> ComponentGraph:
    """Group requirements and retain the evidence for each dependency edge."""
    receipts = {receipt.requirement_id: receipt for receipt in evaluations}
    if (len(receipts) != len(evaluations) or set(receipts) != {req.id for req in blueprint.requirements}
            or any(receipt.blueprint_id != blueprint.id or receipt.decision.verified
                   or receipt.decision.authority != "A0" for receipt in evaluations)):
        raise BlueprintPlanError("invalid_evaluation_provenance")
    entity_by_id = {entity.id: entity for entity in blueprint.parsed.entities}
    components: dict[str, Component] = {}
    owners: dict[str, str] = {}
    warnings: list[str] = []
    for requirement in blueprint.requirements:
        receipt = receipts[requirement.id]
        if receipt.source != requirement.source:
            raise BlueprintPlanError("invalid_evaluation_provenance")
        answer = receipt.decision.answers.get("component_type")
        component_type = answer.value if answer and not answer.abstained and answer.value in COMPONENT_TYPES else "unassigned"
        entity = entity_by_id.get(requirement.entity_ids[0]) if requirement.entity_ids else None
        key = entity.id if entity else "section-" + requirement.source.section_id
        name = entity.name if entity else "Unassigned: " + requirement.source.section_id
        kind = str(component_type) if component_type != "unassigned" else entity.kind if entity else "unassigned"
        if key not in components:
            identity = hashlib.sha256((blueprint.id + ":" + key).encode()).hexdigest()[:24]
            components[key] = Component("component-" + identity, name, kind, [], [], [], [])
        component = components[key]
        component.requirements.append(requirement)
        component.evaluations.append(receipt)
        component.provenance.append(Provenance(blueprint.id, requirement.id, receipt.id, requirement.source))
        owners[requirement.id] = component.id
    by_id = {component.id: component for component in components.values()}

    def edge(owner: Component, target: Component, requirement_id: str, reason: str, contract: str) -> None:
        if owner.id == target.id:
            return
        value = Dependency(target.id, [requirement_id], reason, contract,
                           list(target.requirements), list(target.provenance))
        if value not in owner.dependencies:
            owner.dependencies.append(value)

    data_sources: dict[str, set[str]] = defaultdict(set)
    for component in components.values():
        for req in component.requirements:
            if PRODUCES.search(req.text):
                for key, _phrase in _data_entities(req.text):
                    data_sources[key].add(component.id)
    for component in components.values():
        for req in component.requirements:
            for entity_id in req.entity_ids:
                if entity_id not in components:
                    entity = entity_by_id[entity_id]
                    warnings.append(f"unspecified_dependency:{component.id}:{entity.name}")
                    continue
                target = components[entity_id]
                if target.id == component.id:
                    continue
                before = req.text.casefold().split(target.name.casefold(), 1)[0]
                if re.search(r"\b(?:not|never)\s+(?:depend(?:s)? on|call|use|read)\s+(?:the\s+)?$", before):
                    continue
                # Requirements name their subject first; subsequent named
                # components are interface/dependency candidates.
                reason = "explicit_depends_on" if re.search(r"\bdepends? on\b", req.text, re.I) else "interface_reference"
                edge(component, target, req.id, reason, req.text)
            if CONSUMES.search(req.text):
                for key, phrase in _data_entities(req.text):
                    for producer in sorted(data_sources.get(key, set())):
                        edge(component, by_id[producer], req.id, "shared_data_entity", phrase)
            for ref in blueprint.parsed.cross_references:
                if not set(ref.source.block_ids).intersection(req.source.block_ids) or not ref.resolved_id:
                    continue
                referenced = [ref.resolved_id] if ref.kind == "requirement" else [
                    other.id for other in blueprint.requirements if other.source.section_id == ref.resolved_id
                ] if ref.kind == "section" else []
                for requirement_id in referenced:
                    target_id = owners.get(requirement_id)
                    if target_id:
                        edge(component, by_id[target_id], req.id, "resolved_reference", ref.text)
        component.dependencies.sort(key=lambda dep: (dep.component_id, dep.reason, dep.requirement_ids))
    return ComponentGraph(blueprint.id, blueprint.input_sha256, list(components.values()),
                          sorted(set(warnings)))
