# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/registry.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/models.py, foundry/registry/opportunity.schema.json
# EnumType:    Service
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/models.py; VALIDATES foundry/registry/opportunity.schema.json
# DAG Node:    foundry.registry
# Intent:      Load deterministic opportunity and result records from bounded foundry paths.
# ───────────────────────────────────────────────────────────────

"""Load and validate foundry registries and lane results."""

from __future__ import annotations

from pathlib import Path
from typing import Mapping
import json

import yaml  # type: ignore[import-untyped]

from .models import FoundryValidationError, LaneResults, Opportunity


REQUIRED_OPPORTUNITY_FIELDS = frozenset(
    {
        "topic",
        "requirements",
        "eligibility",
        "deliverables",
        "metrics",
        "milestones",
        "claims",
        "evidence_required",
        "evidence_available",
        "evidence_missing",
        "deadline",
        "submission_format",
    }
)


def _mapping(value: object, label: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise FoundryValidationError(f"{label} must contain an object")
    return value


def _bounded_file(root: Path, path: Path) -> Path:
    resolved_root = root.resolve()
    resolved_path = path.resolve()
    if not resolved_path.is_relative_to(resolved_root) or not resolved_path.is_file():
        raise FoundryValidationError(f"path is outside the foundry or missing: {path}")
    return resolved_path


def validate_schema_contract(path: Path) -> None:
    """Verify that the published JSON schema requires the canonical fields."""

    try:
        schema = _mapping(json.loads(path.read_text(encoding="utf-8")), str(path))
    except (OSError, json.JSONDecodeError) as error:
        raise FoundryValidationError(
            f"cannot read opportunity schema: {error}"
        ) from error
    required = schema.get("required")
    if not isinstance(required, list) or not REQUIRED_OPPORTUNITY_FIELDS.issubset(
        required
    ):
        raise FoundryValidationError(
            "opportunity schema omits canonical required fields"
        )


class OpportunityRegistry:
    """Discover validated opportunities under one foundry root."""

    def __init__(self, foundry_root: Path) -> None:
        self.root = foundry_root.resolve()
        self.registry_root = self.root / "registry"
        validate_schema_contract(
            _bounded_file(self.root, self.registry_root / "opportunity.schema.json")
        )

    def lane_ids(self) -> tuple[str, ...]:
        """Return all registered lane identities in stable order."""

        return tuple(
            sorted(
                path.parent.name
                for path in self.registry_root.glob("*/opportunity.yaml")
            )
        )

    def load(self, lane_id: str) -> Opportunity:
        """Load one opportunity and require its directory identity to match."""

        if lane_id not in self.lane_ids():
            raise FoundryValidationError(f"unknown foundry lane: {lane_id}")
        path = _bounded_file(
            self.root, self.registry_root / lane_id / "opportunity.yaml"
        )
        try:
            value = yaml.safe_load(path.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError) as error:
            raise FoundryValidationError(f"cannot read {path}: {error}") from error
        opportunity = Opportunity.from_mapping(_mapping(value, str(path)))
        if opportunity.lane_id != lane_id:
            raise FoundryValidationError(
                f"lane_id {opportunity.lane_id} does not match registry path {lane_id}"
            )
        return opportunity

    def load_results(self, lane_id: str) -> LaneResults:
        """Load one lane's machine-readable result record."""

        if lane_id not in self.lane_ids():
            raise FoundryValidationError(f"unknown foundry lane: {lane_id}")
        path = _bounded_file(self.root, self.root / "lanes" / lane_id / "results.json")
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise FoundryValidationError(f"cannot read {path}: {error}") from error
        results = LaneResults.from_mapping(_mapping(value, str(path)))
        if results.lane_id != lane_id:
            raise FoundryValidationError(
                f"results lane_id {results.lane_id} does not match {lane_id}"
            )
        return results
