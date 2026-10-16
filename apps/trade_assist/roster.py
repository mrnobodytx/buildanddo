# ─── CGRF Header ──────────────────────────────
# File:        apps/trade_assist/roster.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/web/src/data/personas.js
# EnumType:    Model
# EnumEdges:   DEPENDS_ON apps/web/src/data/personas.js; CONSUMED_BY apps/trade_assist/drafting.py
# DAG Node:    none
# Intent:      Bind each content role to the guildmaster whose published role it already is, and keep producers and verifiers apart.
# ─────────────────────────────────────────────────────────────

"""Which guildmaster produces or verifies each part of a trade-site package.

Each binding follows the role line in ``apps/web/src/data/personas.js``; the reason is
recorded beside it so a reviewer can check the binding against the canon.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Assignment:
    """One content role and the guildmaster bound to it."""

    role: str
    guildmaster: str
    guild: str
    reason: str


PRODUCERS: tuple[Assignment, ...] = (
    Assignment("site_plan", "forge", "builder", "Builds and ships: the change and whether the result stays up."),
    Assignment("brand_brief", "muse", "creator", "Design, story and craft: turns an idea into something people can see."),
    Assignment("home_copy", "quill", "writers", "Drafts and edits: from the rough thought to the finished sentence."),
    Assignment("service_explainers", "scholar", "research", "Traces a claim back to its sources before the conclusion."),
    Assignment("offer", "alex", "commerce", "Customers, offers and the path to a sale, with claims backed by evidence."),
    Assignment("pricing", "sterling", "finance", "Costs and risk, with the numbers reconciled before anything is claimed."),
)

VERIFIERS: tuple[Assignment, ...] = (
    Assignment("claims", "oracle", "intelligence", "Says how confident a reading is before saying what it shows."),
    Assignment("safety", "director-nexus", "entertainment", "Content safety always on."),
)


class RosterError(ValueError):
    """A role has no guildmaster, or a producer would verify its own work."""


def producer(role: str) -> Assignment:
    """Return the guildmaster who produces a content role."""
    for assignment in PRODUCERS:
        if assignment.role == role:
            return assignment
    raise RosterError(f"no guildmaster produces {role}")


def verifier(check: str) -> Assignment:
    """Return the guildmaster who runs a check."""
    for assignment in VERIFIERS:
        if assignment.role == check:
            return assignment
    raise RosterError(f"no guildmaster runs the {check} check")


def require_separation(producer_slug: str, verifier_slug: str) -> None:
    """Refuse a check run by the seat that produced the work."""
    if producer_slug == verifier_slug:
        raise RosterError(f"{producer_slug} cannot verify its own section")


def slugs() -> list[str]:
    """Every guildmaster this package assigns, producers then verifiers."""
    return [assignment.guildmaster for assignment in PRODUCERS + VERIFIERS]
