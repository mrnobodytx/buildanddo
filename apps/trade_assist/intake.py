# ─── CGRF Header ──────────────────────────────
# File:        apps/trade_assist/intake.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     none
# EnumType:    Model
# EnumEdges:   CONSUMED_BY apps/trade_assist/drafting.py; CONSUMED_BY apps/trade_assist/verify.py
# DAG Node:    none
# Intent:      Turn a walk-in intake or a TradeBuilder site record into one typed business record that never guesses a field.
# ─────────────────────────────────────────────────────────────

"""Normalize source records into a business record whose every field is either measured or absent.

The two sources name the same facts differently. TradeBuilder's store of record selects
``id, guild, tenant_slug, business_name, city, state, status, elevenlabs_agent_id,
agent_phone, tenant_id``. The walk-in intake schema is not published in this repository,
so its aliases below are the common spellings, and any key that matches none of them is
kept in ``unmapped`` for a person to see rather than dropped or guessed at.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Mapping

SOURCES = ("walkin", "tradebuilder")

# Canonical field -> accepted source keys, in priority order.
ALIASES: dict[str, tuple[str, ...]] = {
    "business_name": ("business_name", "company", "company_name", "name"),
    "trade": ("trade", "category", "industry", "service_category"),
    "city": ("city", "town"),
    "state": ("state", "region"),
    "phone": ("phone", "owner_phone", "business_phone", "agent_phone"),
    "email": ("email", "owner_email", "business_email"),
    "services": ("services", "service_list", "offerings"),
    "service_area": ("service_area", "areas_served", "coverage"),
    "hours": ("hours", "business_hours"),
    "tagline": ("tagline", "slogan"),
    "website": ("website", "existing_site", "site_url", "url"),
    "tenant_slug": ("tenant_slug", "slug"),
    "tenant_id": ("tenant_id",),
    "record_id": ("id", "record_id", "submission_id", "intake_id"),
    "guild": ("guild",),
    "status": ("status",),
    # Gated claims: content may state these only when the record carries them.
    "license_number": ("license_number", "licence_number", "license", "licence", "license_no"),
    "insured": ("insured", "is_insured", "insurance"),
    "bonded": ("bonded", "is_bonded"),
    "certifications": ("certifications", "certs"),
    "years_in_business": ("years_in_business", "years", "established_years"),
    "rating": ("rating", "star_rating"),
    "review_count": ("review_count", "reviews"),
    "awards": ("awards",),
    "guarantee": ("guarantee", "warranty"),
    "price_from": ("price_from", "starting_price", "min_price"),
    "free_estimates": ("free_estimates", "free_quote", "free_estimate"),
}

GATED_FIELDS = (
    "license_number", "insured", "bonded", "certifications", "years_in_business",
    "rating", "review_count", "awards", "guarantee", "price_from", "free_estimates",
)

LIST_FIELDS = ("services", "service_area", "certifications", "awards")
BOOL_FIELDS = ("insured", "bonded", "free_estimates")
MAX_TEXT = 500
MAX_ITEMS = 25


class IntakeError(ValueError):
    """A source record cannot become a business record."""


@dataclass(frozen=True)
class BusinessRecord:
    """One business, with each present field marked as measured from its source."""

    source: str
    fields: Mapping[str, Any]
    unmapped: tuple[str, ...] = field(default_factory=tuple)

    def has(self, name: str) -> bool:
        """True when the field is present and meaningful; False and empty values are absent."""
        value = self.fields.get(name)
        if value is None or value is False:
            return False
        if isinstance(value, (str, list, tuple)) and not value:
            return False
        return True

    def get(self, name: str, default: Any = None) -> Any:
        """Return a present field, or the default."""
        return self.fields[name] if self.has(name) else default

    def provenance(self) -> dict[str, str]:
        """Every present field is MEASURED from the named source; nothing else is listed."""
        return {name: f"MEASURED:{self.source}" for name in sorted(self.fields) if self.has(name)}

    def to_dict(self) -> dict[str, Any]:
        """Serialize for packages and receipts."""
        return {
            "source": self.source,
            "fields": {name: self.fields[name] for name in sorted(self.fields)},
            "provenance": self.provenance(),
            "unmapped": list(self.unmapped),
        }


def _text(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value)).strip()
    if len(text) > MAX_TEXT:
        raise IntakeError("field value exceeds 500 characters")
    return text


def _items(value: Any) -> list[str]:
    if isinstance(value, str):
        parts = re.split(r"[,;\n]", value)
    elif isinstance(value, (list, tuple)):
        parts = [str(part) for part in value]
    else:
        raise IntakeError("list field must be a string or a list")
    items = [_text(part) for part in parts if str(part).strip()]
    if len(items) > MAX_ITEMS:
        raise IntakeError("list field exceeds 25 items")
    seen: list[str] = []
    for item in items:
        if item.lower() not in {existing.lower() for existing in seen}:
            seen.append(item)
    return seen


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    if text in ("true", "yes", "y", "1"):
        return True
    if text in ("false", "no", "n", "0", ""):
        return False
    raise IntakeError("boolean field must be yes/no or true/false")


def _value(name: str, raw: Any) -> Any:
    if raw is None:
        return None
    if name in LIST_FIELDS:
        return _items(raw)
    if name in BOOL_FIELDS:
        return _bool(raw)
    if name in ("years_in_business", "review_count"):
        if isinstance(raw, bool):
            raise IntakeError(f"{name} must be a whole number")
        try:
            number = int(str(raw).strip())
        except ValueError as error:
            raise IntakeError(f"{name} must be a whole number") from error
        if number < 0:
            raise IntakeError(f"{name} cannot be negative")
        return number
    if name == "rating":
        try:
            number = float(str(raw).strip())
        except ValueError as error:
            raise IntakeError("rating must be a number") from error
        if not 0 <= number <= 5:
            raise IntakeError("rating must be between 0 and 5")
        return number
    if isinstance(raw, (dict, list, tuple)):
        raise IntakeError(f"{name} must be a single value")
    text = _text(raw)
    return text or None


def normalize(raw: Mapping[str, Any], source: str) -> BusinessRecord:
    """Map a source record onto canonical fields; unknown keys are kept aside, never guessed."""
    if source not in SOURCES:
        raise IntakeError(f"source must be one of {', '.join(SOURCES)}")
    if not isinstance(raw, Mapping):
        raise IntakeError("record must be a JSON object")
    fields: dict[str, Any] = {}
    used: set[str] = set()
    for name, keys in ALIASES.items():
        for key in keys:
            if key in raw and raw[key] is not None and key not in used:
                fields[name] = _value(name, raw[key])
                used.add(key)
                break
    record = BusinessRecord(
        source=source,
        fields=fields,
        unmapped=tuple(sorted(str(key) for key in raw if key not in used)),
    )
    if not record.has("business_name"):
        raise IntakeError("record has no business name")
    return record


def gaps(record: BusinessRecord) -> list[str]:
    """Fields that would make the content better, reported instead of invented."""
    wanted = ("trade", "city", "state", "phone", "services")
    missing = [name for name in wanted if not record.has(name)]
    if not record.has("phone") and not record.has("email"):
        missing.append("contact (phone or email)")
    return missing
