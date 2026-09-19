# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/policy/demo.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/research/policy/pipeline.py
# EnumType:    Scaffold
# EnumEdges:   CONSUMES apps/research/policy/pipeline.py
# DAG Node:    none
# Intent:      Exercise a reproducible small-business policy scenario without presenting fixture text as live government activity.
# ───────────────────────────────────────────────────────────────

"""Generate explicitly synthetic, nonpartisan demonstration observations."""

from __future__ import annotations

import hashlib

from apps.research.contracts import Parsed
from apps.research.policy.contracts import Observation, watch
from apps.research.policy.pipeline import Packet, make_packet, normalize

DEMO_AT = "2026-09-18T12:00:00Z"
DISCLAIMER = "Synthetic demonstration. No official document was retrieved. "


def demo_packet() -> Packet:
    """Return a fixed small-business scenario with a correction and open questions."""
    url = "https://www.federalregister.gov"
    samples = [
        (
            "supplier-reporting",
            "Example: supplier reporting consultation",
            "regulation",
            "OBSERVED",
            "",
            "2026-09-17T10:00:00Z",
            "The example reporting program opens a supplier consultation.",
            "The example reporting program opens a supplier consultation.",
        ),
        (
            "supplier-reporting",
            "Example: supplier reporting consultation updated",
            "regulation",
            "OBSERVED",
            "",
            "2026-09-18T10:00:00Z",
            "The example reporting program extends its supplier consultation window.",
            "The example reporting program extends its supplier consultation window.",
        ),
        (
            "supplier-statement",
            "Example: agency statement on supplier reporting",
            "statement",
            "ATTRIBUTED",
            "Example agency",
            "2026-09-18T10:30:00Z",
            "Example agency says supplier reporting will need a separate guidance note.",
            "",
        ),
        (
            "supplier-analysis",
            "Example: reporting workflow review",
            "regulation",
            "ANALYZED",
            "",
            "2026-09-18T11:00:00Z",
            "The example reporting program may affect a supplier's record-keeping workflow.",
            "The example reporting program may affect a supplier's record-keeping workflow.",
        ),
        (
            "supplier-gap",
            "Example: reporting scope remains unresolved",
            "regulation",
            "UNRESOLVED",
            "",
            "2026-09-18T11:30:00Z",
            "The example supplier reporting threshold is unresolved; a final source is required.",
            "",
        ),
    ]
    observations: list[Observation] = []
    for document, title, kind, state, attribution, at, content, quote in samples:
        parsed: Parsed = {
            "text": DISCLAIMER + content,
            "citations": [{"title": title, "url": url}],
            "processor": "synthetic-fixture",
            "version": "1",
            "input_sha256": hashlib.sha256(url.encode()).hexdigest(),
            "truncated": False,
        }
        note = {
            "source_id": "federal_register",
            "url": url,
            "document_id": document,
            "title": title,
            "kind": kind,
            "state": state,
            "attribution": attribution,
            "published_at": at,
            "mission_areas": ["small_business"],
            "entities": [
                {
                    "id": "program:supplier-reporting",
                    "type": "program",
                    "label": "Example supplier reporting program",
                }
            ],
            "relations": (
                [
                    {
                        "source": "event",
                        "relation": "affects",
                        "target": "program:supplier-reporting",
                        "quote": quote,
                        "state": "ANALYZED",
                    }
                ]
                if quote
                else []
            ),
        }
        observations.append(
            normalize(parsed, note, tenant_id="demo-public", observed_at=at)
        )
    watches = [
        watch(
            {
                "id": name,
                "name": label,
                "mission_areas": ["small_business"],
                "keywords": ["supplier"],
                "entity_ids": [],
                "object_refs": [target],
                "cadence": cadence,
                "window_hours": 48,
            }
        )
        for name, label, target, cadence in [
            (
                "supplier-operations",
                "Supplier operations",
                "business:vendor-intake",
                "realtime",
            ),
            (
                "supplier-daily",
                "Daily supplier policy brief",
                "system:reporting-register",
                "daily",
            ),
        ]
    ]
    return make_packet(
        tenant_id="demo-public",
        mode="demo",
        as_of=DEMO_AT,
        observations=observations,
        watches=watches,
    )
