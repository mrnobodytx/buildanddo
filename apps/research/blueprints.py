# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/blueprints.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/blueprint_models.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/research/blueprint_models.py
# DAG Node:    none
# Intent:      Extract source-linked blueprint structure and deterministic quality observations without verification authority.
# ───────────────────────────────────────────────────────────────

"""Extract a blueprint through CPU-only scan, parse and assessment passes."""
from __future__ import annotations

import hashlib

from apps.research.blueprint_assess import assess
from apps.research.blueprint_models import Blueprint, Scan
from apps.research.blueprint_parse import parse_scan
from apps.research.blueprint_scan import scan_pdf


def blueprint_from_scan(scan: Scan, input_sha256: str, name: str) -> Blueprint:
    """Parse and assess already scanned pages without losing input provenance."""
    parsed = parse_scan(scan, input_sha256)
    assessment = assess(scan, parsed)
    return Blueprint("blueprint-" + input_sha256, input_sha256, name, scan, parsed, assessment)


def extract_blueprint(data: bytes, name: str = "blueprint.pdf") -> Blueprint:
    """Run all three deterministic passes on a bounded untrusted PDF."""
    return blueprint_from_scan(scan_pdf(data, name), hashlib.sha256(data).hexdigest(), name)
