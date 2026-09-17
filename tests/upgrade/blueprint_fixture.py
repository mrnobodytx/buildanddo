# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/blueprint_fixture.py
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
# Intent:      Generate a reproducible text-only specification PDF without adding a PDF creation dependency.
# ───────────────────────────────────────────────────────────────

"""Build a small PDF fixture using the PDF text operators consumed by pypdf."""
from __future__ import annotations

from pathlib import Path

SPEC = """CUSTOMER PORTAL BLUEPRINT
1. Architecture
API Gateway connects to Account Service and reads from User Database.
Account Service calls Mail Worker.
Mail Worker writes to Event Queue.
2. Functional requirements
REQ-001: Account Service shall register new accounts.
REQ-002: API Gateway should respond within 200 milliseconds.
REQ-003: User Database must encrypt personal data.
REQ-004: Mail Worker could send weekly summaries.
REQ-005: The system won't support anonymous purchases.
3. Constraints
The monthly budget must not exceed 500 dollars.
4. Assumptions
Assume the customer supplies an identity provider.
5. Open questions
TBD: data retention policy.
The deployment region is not yet decided.
"""


def pdf_bytes(value: str = SPEC, *, pages: int = 1, active_content: bool = False) -> bytes:
    """Build valid fixture bytes with optional inert PDF JavaScript metadata."""
    content = "BT /F1 11 Tf 45 780 Td 15 TL\n" + "\n".join(
        "(" + line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") + ") Tj T*"
        for line in value.splitlines()
    ) + "\nET"
    stream = content.encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R" + (b" /OpenAction << /S /JavaScript /JS (throw 'untrusted';) >>" if active_content else b"") + b" >>",
        ("<< /Type /Pages /Kids [" + " ".join(f"{5 + i} 0 R" for i in range(pages)) + f"] /Count {pages} >>").encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    objects.extend(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 840] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>" for _ in range(pages))
    # A binary comment prevents Git from normalizing the fixture's byte offsets.
    data = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\x00\n%BuildAndDo synthetic fixture\n")
    offsets = [0]
    for number, body in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = len(data)
    data.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        data.extend(f"{offset:010} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(data)


if __name__ == "__main__":
    target = Path(__file__).with_name("fixtures") / "sample-blueprint.pdf"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(pdf_bytes())
