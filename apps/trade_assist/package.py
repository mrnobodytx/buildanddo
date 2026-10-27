# ─── CGRF Header ──────────────────────────────
# File:        apps/trade_assist/package.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/trade_assist/intake.py, apps/trade_assist/drafting.py, apps/trade_assist/verify.py, apps/trade_assist/roster.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/trade_assist/verify.py; CONSUMED_BY apps/trade_assist/cli.py
# DAG Node:    none
# Intent:      Assemble a verified content package as an open review mission with a digest-bound delivery envelope that can only dry-run.
# ─────────────────────────────────────────────────────────────

"""Assemble the package, its review mission and its delivery envelope.

Delivery is ``dry_run`` only in this slice. Sending a package to TradeBuilder or walk-in
is an external write, which AGENTS.md classes as A3: it needs a human dispatch and the
CNWB-side ingest described in ``.bits/handoffs/2026-10-16-C-ONE-CNWB-trade-assist.md``.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from apps.trade_assist.drafting import Provider, Section, TemplateProvider
from apps.trade_assist.intake import BusinessRecord, gaps
from apps.trade_assist.roster import VERIFIERS
from apps.trade_assist.verify import Finding, verify

PACKAGE_VERSION = 1
DELIVERY_MODES = ("dry_run",)
TARGETS = {"walkin": "walkin", "tradebuilder": "tradebuilder"}


class DeliveryRefused(PermissionError):
    """Delivery other than a dry run was requested."""


def canonical(value: Any) -> bytes:
    """Stable JSON bytes for hashing."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value: Any) -> str:
    """SHA-256 of the canonical form."""
    return hashlib.sha256(canonical(value)).hexdigest()


def _status(findings: list[Finding]) -> str:
    return "blocked" if findings else "ready_for_review"


def build_package(record: BusinessRecord, provider: Provider | None = None) -> dict[str, Any]:
    """Draft, verify and wrap one business's content package."""
    drafter = provider or TemplateProvider()
    sections: list[Section] = drafter.draft(record)
    findings = verify(sections, record)
    rejected = sorted({finding.role for finding in findings})
    content = {
        "version": PACKAGE_VERSION,
        "provider": drafter.name,
        "business": record.to_dict(),
        "sections": [section.to_dict() for section in sections],
    }
    content_digest = digest(content)
    reference = record.get("tenant_slug") or record.get("record_id") or record.get("business_name")
    package_id = f"tap-{content_digest[:16]}"
    return {
        "package_id": package_id,
        "status": _status(findings),
        "content": content,
        "content_digest": content_digest,
        "findings": [finding.to_dict() for finding in findings],
        "rejected_sections": rejected,
        "gaps": gaps(record),
        "mission": {
            "mission_id": f"mission-{package_id}",
            "title": f"Review site content for {record.get('business_name')}",
            "status": "open",
            "review_required": True,
            "closes_only_on": "human review",
            "producers": sorted({section.producer for section in sections}),
            "verifiers": [assignment.guildmaster for assignment in VERIFIERS],
            "blocked_by": rejected,
        },
        "envelope": {
            "target": TARGETS[record.source],
            "reference": reference,
            "content_digest": content_digest,
            "mode": "dry_run",
        },
    }


def deliver(package: dict[str, Any], mode: str = "dry_run") -> dict[str, Any]:
    """Produce a delivery receipt; only a dry run is permitted, and nothing leaves the process."""
    if mode not in DELIVERY_MODES:
        raise DeliveryRefused("delivery to TradeBuilder or walk-in is an A3 external write and needs a human dispatch")
    envelope = package["envelope"]
    if digest(package["content"]) != envelope["content_digest"]:
        raise ValueError("package content does not match its envelope digest")
    return {
        "mode": mode,
        "delivered": False,
        "would_send_to": envelope["target"],
        "reference": envelope["reference"],
        "content_digest": envelope["content_digest"],
        "eligible": package["status"] == "ready_for_review",
        "reason": "dry run" if package["status"] == "ready_for_review" else "package is blocked by verification findings",
    }
