# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/blueprint_support.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/blueprints.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/research/blueprints.py
# DAG Node:    none
# Intent:      Distinguish deterministic layout test doubles from genuine PDF pipeline acceptance.
# ───────────────────────────────────────────────────────────────

"""Provide explicit layout doubles and a small genuine PDF fixture."""
from __future__ import annotations

import hashlib
from pathlib import Path

from apps.research.blueprint_models import TextBlock
from apps.research.blueprint_scan import scan_layout
from apps.research.blueprints import blueprint_from_scan

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/sample-blueprint.pdf"
LINES = [
    "1. Architecture",
    "REQ-001 The Event database shall store event records.",
    "1.1 Event worker",
    "REQ-002 The Event worker shall read event records from the Event database.",
    "1.2 Notification service",
    "REQ-003 The Notification service depends on the Event worker and shall publish alert events.",
    "See Section 1.1 for the worker contract.",
    "2. Interfaces",
    "| Interface | Direction |",
    "|-----------|-----------|",
    "| event records | read |",
    "API (Application Programming Interface)",
    "3. Open questions",
    "TBD: choose an appropriate retry schedule.",
]


def sample_blueprint(lines: list[str] | None = None):
    """Parse an explicit text-layout double, separate from native PDF tests."""
    blocks = [TextBlock(str(index), 1, text, 48.0, float(48 + index * 20), 12.0)
              for index, text in enumerate(LINES if lines is None else lines)]
    scan = scan_layout([(612.0, 792.0, blocks)], "explicit-layout-double")
    digest = hashlib.sha256(FIXTURE.read_bytes()).hexdigest()
    return blueprint_from_scan(scan, digest, "sample-blueprint.pdf")


def pdf_bytes(pages: list[list[str]]) -> bytes:
    """Build a minimal valid text PDF using the PDF object and xref format."""
    objects: list[bytes] = [b"<< /Type /Catalog /Pages 2 0 R >>", b"", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for lines in pages:
        page_id = len(objects) + 1
        stream_id = page_id + 1
        kids.append(f"{page_id} 0 R")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {stream_id} 0 R >>".encode())
        commands = ["BT", "/F1 10 Tf", "14 TL", "48 744 Td"]
        for line in lines:
            escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            commands.extend(["(" + escaped + ") Tj", "T*"])
        commands.append("ET")
        stream = "\n".join(commands).encode("ascii")
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>".encode()
    data = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(data)
    data.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        data.extend(f"{offset:010d} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(data)
