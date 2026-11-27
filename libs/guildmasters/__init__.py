# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/guildmasters/__init__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     apps/pocketbase/pb_hooks/guildmasters.js
# EnumType:    Model
# EnumEdges:   MIRRORS apps/pocketbase/pb_hooks/guildmasters.js; VERIFIED_BY tests/upgrade/guildmaster-registry.test.mjs; VERIFIED_BY tests/upgrade/test_guildmasters.py
# DAG Node:    none
# Intent:      Give scripts the same eight guildmasters, in the same rota order, as the server registry.
# ───────────────────────────────────────────────────────────────

"""The eight guildmasters, mirrored from ``apps/pocketbase/pb_hooks/guildmasters.js``.

The server registry is canonical; ``as_json()`` returns exactly its entry shape so
``tests/upgrade/guildmaster-registry.test.mjs`` can compare the two byte for byte. The roster
is public (the website renders it). Which machine runs which seat is not, and nothing here
reads it: this module performs no I/O and reads no environment.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

SEAT_DOMAIN = "@ocn.buildanddo.invalid"


@dataclass(frozen=True)
class Guildmaster:
    """One guildmaster: its seat account id, public persona slug, name, guild and aliases."""

    seat: str
    slug: str
    name: str
    guild: str
    aliases: tuple[str, ...] = ()


# Rota order. The seat differs from the slug only for Director Nexus.
GUILDMASTERS: tuple[Guildmaster, ...] = (
    Guildmaster("forge", "forge", "Forge", "builder"),
    Guildmaster("scholar", "scholar", "Scholar", "research"),
    Guildmaster("oracle", "oracle", "Oracle", "intelligence"),
    Guildmaster("alex", "alex", "Alex", "commerce"),
    Guildmaster("sterling", "sterling", "Sterling", "finance"),
    Guildmaster("muse", "muse", "Muse", "creator"),
    Guildmaster("quill", "quill", "Quill", "writers"),
    Guildmaster("director", "director-nexus", "Director Nexus", "entertainment", ("director",)),
)
ORDER: tuple[str, ...] = tuple(entry.seat for entry in GUILDMASTERS)

_SEPARATORS = re.compile(r"[^a-z0-9]+")


def by_seat(seat: object) -> Guildmaster | None:
    """Return the entry whose seat id is exactly ``seat``, or None."""
    if not isinstance(seat, str):
        return None
    return next((entry for entry in GUILDMASTERS if entry.seat == seat), None)


def by_slug(slug: object) -> Guildmaster | None:
    """Return the entry whose persona slug is exactly ``slug``, or None."""
    if not isinstance(slug, str):
        return None
    return next((entry for entry in GUILDMASTERS if entry.slug == slug), None)


def resolve(value: object) -> Guildmaster | None:
    """Return the guildmaster a seat, slug, alias, display name or presence id names, or None.

    Same rules as the server: lowercase, collapse other characters to ``-``, drop a leading
    ``gm-``, then match exactly against slug, seat or alias across the roster before matching
    a ``-<slug>`` or ``-<alias>`` suffix.
    """
    if not isinstance(value, str):
        return None
    key = _SEPARATORS.sub("-", value.lower()).strip("-")
    if key.startswith("gm-"):
        key = key[3:]
    if not key:
        return None
    for entry in GUILDMASTERS:
        if key in (entry.slug, entry.seat, *entry.aliases):
            return entry
    for entry in GUILDMASTERS:
        if any(key.endswith("-" + name) for name in (entry.slug, *entry.aliases)):
            return entry
    return None


def persona_id(entry: Guildmaster) -> str:
    """Return the canonical classroom persona id of an entry: ``gm-<slug>``."""
    return "gm-" + entry.slug


def seat_email(seat: str) -> str | None:
    """Return the reserved account email of a registered seat, or None."""
    return seat + SEAT_DOMAIN if by_seat(seat) else None


def as_json() -> list[dict[str, object]]:
    """Return the roster in exactly the server registry's entry shape."""
    return [
        {
            "seat": entry.seat,
            "slug": entry.slug,
            "name": entry.name,
            "guild": entry.guild,
            "aliases": list(entry.aliases),
        }
        for entry in GUILDMASTERS
    ]


__all__ = [
    "GUILDMASTERS",
    "ORDER",
    "SEAT_DOMAIN",
    "Guildmaster",
    "as_json",
    "by_seat",
    "by_slug",
    "persona_id",
    "resolve",
    "seat_email",
]
