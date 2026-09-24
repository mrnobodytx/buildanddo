# ─── CGRF Header ──────────────────────────────
# File:        apps/career/profile.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/career/passport.py, apps/career/verify.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON apps/career/passport.py; DEPENDS_ON apps/career/verify.py; PRODUCES apps/pocketbase/pb_hooks/career-profile.js
# DAG Node:    none
# Intent:      Define the one profile envelope Citadel Nexus serves to BuildAndDo at login, so both sides validate the same shape.
# ─────────────────────────────────────────────────────────────

"""Build the ``buildanddo.career.profile/v1`` envelope Citadel Nexus serves at login.

The envelope binds one verified-digest passport to one BuildAndDo account id.
It deliberately carries nothing else: identity files, question banks, stored
reserved answers and ledgers stay in Citadel's stores.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from apps.career.evidence import CareerError
from apps.career.passport import Passport
from apps.career.verify import render_card

SCHEMA = "buildanddo.career.profile/v1"
SUBJECT = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def build_profile(passport_raw: dict[str, Any], subject_id: str, issued_at: datetime) -> dict[str, Any]:
    """Wrap a passport for one BuildAndDo account; reject a passport whose digest does not match."""
    if not SUBJECT.match(subject_id):
        raise CareerError("subject_id must be the BuildAndDo account id")
    if issued_at.tzinfo is None:
        raise CareerError("issued_at must be timezone-aware")
    passport = Passport.from_dict(passport_raw)
    return {
        "schema": SCHEMA,
        "subject_id": subject_id,
        "issued_at": issued_at.isoformat(),
        "passport": passport.to_dict(),
        "card": render_card(passport),
    }
