# ─── CGRF Header ──────────────────────────────
# File:        apps/career/imports.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/evidence.py, apps/career/taxonomy.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/career/evidence.py; DEPENDS_ON apps/career/taxonomy.py; CONSUMES LinkedIn data export; CONSUMES JSON Resume; CONSUMES Open Badges assertions; PRODUCES apps/career/assessments.py
# DAG Node:    none
# Intent:      Bring skills, certifications, positions and badges from other platforms in as self-reported claims that an assessment can later upgrade.
# ─────────────────────────────────────────────────────────────

"""Import profile claims from other platforms without trusting them.

Supported inputs:

- a LinkedIn data export folder (``Skills.csv``, ``Endorsement_Received_Info.csv``,
  ``Certifications.csv``, ``Positions.csv``; any subset),
- a JSON Resume document (``skills``, ``work``, ``certificates``),
- Open Badges 2.0 assertions (one object or a list).

Every imported item is SELF_REPORTED and DECLARED. Endorsement counts are kept
as context and never change a claim state. A badge whose recipient identity
does not hash to one of the person's addresses is rejected; issuer signatures
and hosted verification need the network and are not checked here.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from collections import Counter
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError, ClaimState, EvidenceRef, Participation, canonical_digest
from apps.career.taxonomy import capabilities_for_text

SCHEMA = "buildanddo.career.imports/v1"
PLATFORMS = ("linkedin", "jsonresume", "openbadge")
_MONTHS = {name: index for index, name in enumerate(
    ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), start=1)}
_SLUG = re.compile(r"[^a-z0-9]+")


def month_of(value: str) -> tuple[int, int] | None:
    """Parse ``2020-03``, ``2020-03-15``, ``Mar 2020`` or ``2020``; empty means open-ended."""
    text = value.strip()
    if not text:
        return None
    match = re.match(r"^(\d{4})-(\d{2})(?:-\d{2})?$", text)
    if match:
        return int(match[1]), int(match[2])
    match = re.match(r"^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$", text)
    if match and match[1].lower() in _MONTHS:
        return int(match[2]), _MONTHS[match[1].lower()]
    if re.match(r"^\d{4}$", text):
        return int(text), 1
    raise CareerError(f"unrecognised date {value!r}")


def employment_months(intervals: Iterable[tuple[str, str]], as_of: datetime) -> int:
    """Return declared employment months with overlapping positions counted once."""
    spans: list[tuple[int, int]] = []
    now = as_of.year * 12 + as_of.month
    for start, end in intervals:
        begin = month_of(start)
        if begin is None:
            continue
        finish = month_of(end)
        stop = finish[0] * 12 + finish[1] + 1 if finish else now + 1
        spans.append((begin[0] * 12 + begin[1], stop))
    total, current = 0, None
    for low, high in sorted(spans):
        if current is None or low > current[1]:
            if current:
                total += current[1] - current[0]
            current = [low, high]
        else:
            current[1] = max(current[1], high)
    if current:
        total += current[1] - current[0]
    return total


def _claim(platform: str, kind: str, name: str, observed_at: str, **extra: Any) -> dict[str, Any]:
    name = " ".join(name.split())
    if not name:
        raise CareerError(f"{platform} {kind} has no name")
    slug = _SLUG.sub("-", name.lower()).strip("-")
    return {
        "ref": f"{platform}:{kind}:{slug}",
        "platform": platform,
        "kind": kind,
        "name": name,
        "capabilities": list(capabilities_for_text(" ".join([name, str(extra.pop("text", ""))]))),
        "observed_at": observed_at,
        "issuer": extra.pop("issuer", None),
        "endorsements": extra.pop("endorsements", 0),
        "recipient_match": extra.pop("recipient_match", None),
        "interval": extra.pop("interval", None),
    }


def _csv_rows(path: Path, column: str) -> list[dict[str, str]]:
    """Read a LinkedIn CSV, skipping any preamble lines before the header."""
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    start = next((index for index, line in enumerate(lines) if column in line), None)
    if start is None:
        raise CareerError(f"{path.name} has no {column!r} column")
    return list(csv.DictReader(io.StringIO("\n".join(lines[start:]))))


def _iso(value: tuple[int, int] | None, fallback: str) -> str:
    return f"{value[0]:04d}-{value[1]:02d}-01T00:00:00+00:00" if value else fallback


def read_linkedin(folder: Path, as_of: datetime) -> list[dict[str, Any]]:
    """Read an unzipped LinkedIn data export."""
    if not folder.is_dir():
        raise CareerError("LinkedIn import expects the unzipped export folder")
    now = as_of.isoformat()
    endorsed = Counter(
        row.get("Skill Name", "").strip().lower()
        for row in _csv_rows(folder / "Endorsement_Received_Info.csv", "Skill Name")
        if row.get("Endorsement Status", "ACCEPTED").upper() != "REJECTED"
    )
    claims = [
        _claim("linkedin", "skill", row["Name"], now, endorsements=endorsed.get(row["Name"].strip().lower(), 0))
        for row in _csv_rows(folder / "Skills.csv", "Name") if row.get("Name", "").strip()
    ]
    for row in _csv_rows(folder / "Certifications.csv", "Authority"):
        when = month_of(row.get("Started On", "") or "")
        claims.append(_claim("linkedin", "certification", row.get("Name", ""), _iso(when, now),
                             issuer=row.get("Authority") or None))
    for row in _csv_rows(folder / "Positions.csv", "Company Name"):
        start, end = row.get("Started On", "") or "", row.get("Finished On", "") or ""
        claims.append(_claim("linkedin", "position", f"{row.get('Title', '')} at {row.get('Company Name', '')}",
                             _iso(month_of(end) or month_of(start), now), text=row.get("Description", ""),
                             interval=[start, end]))
    if not claims:
        raise CareerError("the export folder held no skills, certifications or positions")
    return claims


def read_json_resume(raw: Any, as_of: datetime) -> list[dict[str, Any]]:
    """Read a JSON Resume document."""
    if not isinstance(raw, dict):
        raise CareerError("JSON Resume must be an object")
    now = as_of.isoformat()
    claims: list[dict[str, Any]] = []
    for item in raw.get("skills") or []:
        keywords = " ".join(str(word) for word in item.get("keywords") or [])
        claims.append(_claim("jsonresume", "skill", str(item.get("name", "")), now, text=keywords))
    for item in raw.get("certificates") or []:
        claims.append(_claim("jsonresume", "certification", str(item.get("name", "")),
                             _iso(month_of(str(item.get("date") or "")), now), issuer=item.get("issuer")))
    for item in raw.get("work") or []:
        start, end = str(item.get("startDate") or ""), str(item.get("endDate") or "")
        text = " ".join([str(item.get("summary") or ""), *[str(h) for h in item.get("highlights") or []]])
        claims.append(_claim("jsonresume", "position", f"{item.get('position', '')} at {item.get('name', '')}",
                             _iso(month_of(end) or month_of(start), now), text=text, interval=[start, end]))
    if not claims:
        raise CareerError("the JSON Resume held no skills, certificates or work")
    return claims


def recipient_matches(recipient: Any, emails: frozenset[str]) -> bool | None:
    """Check an Open Badges recipient against the person's emails; None when not an email identity."""
    if not isinstance(recipient, dict) or recipient.get("type", "email") != "email":
        return None
    identity = str(recipient.get("identity", ""))
    if not recipient.get("hashed"):
        return identity.lower() in emails
    algorithm, _, expected = identity.partition("$")
    if algorithm.lower() != "sha256":
        raise CareerError("only sha256 badge recipient hashes are supported")
    salt = str(recipient.get("salt") or "")
    return any(hashlib.sha256((email + salt).encode()).hexdigest() == expected.lower() for email in emails)


def read_open_badges(raw: Any, emails: frozenset[str], as_of: datetime) -> list[dict[str, Any]]:
    """Read Open Badges 2.0 assertions; a badge issued to someone else is rejected."""
    assertions = raw if isinstance(raw, list) else [raw]
    claims: list[dict[str, Any]] = []
    for assertion in assertions:
        if not isinstance(assertion, dict) or assertion.get("type") != "Assertion":
            raise CareerError("each badge must be an Open Badges Assertion")
        match = recipient_matches(assertion.get("recipient"), emails)
        if match is False:
            raise CareerError("badge recipient does not match the person's addresses")
        badge = assertion.get("badge")
        name = str(badge.get("name", "")) if isinstance(badge, dict) else str(badge or "")
        text = " ".join([str(badge.get("description", "")), *map(str, badge.get("tags") or [])]) \
            if isinstance(badge, dict) else ""
        issuer = badge.get("issuer") if isinstance(badge, dict) else None
        issuer_name = issuer.get("name") if isinstance(issuer, dict) else issuer
        issued = str(assertion.get("issuedOn") or as_of.isoformat())
        claims.append(_claim("openbadge", "badge", name, issued, text=text,
                             issuer=str(issuer_name) if issuer_name else None, recipient_match=match))
    return claims


def build_inventory(person_id: str, platform: str, claims: list[dict[str, Any]], as_of: datetime) -> dict[str, Any]:
    """Return a digest-bound inventory of imported claims."""
    if platform not in PLATFORMS:
        raise CareerError(f"unsupported platform {platform!r}")
    unique = {item["ref"]: item for item in claims}
    intervals = [tuple(item["interval"]) for item in unique.values() if item["interval"]]
    body = {
        "schema": SCHEMA,
        "person_id": person_id,
        "platform": platform,
        "as_of": as_of.isoformat(),
        "claims": sorted(unique.values(), key=lambda item: item["ref"]),
        "declared_employment_months": employment_months(intervals, as_of),
        "state": ClaimState.DECLARED.value,
        "note": "imported claims are self-reported; endorsements are context, not verification",
    }
    return {**body, "digest": canonical_digest(body)}


def load_inventory(raw: Any) -> dict[str, Any]:
    """Reload an inventory and reject one edited after import."""
    if not isinstance(raw, dict) or raw.get("schema") != SCHEMA:
        raise CareerError("not an imported-claims inventory")
    if raw.get("digest") != canonical_digest({key: value for key, value in raw.items() if key != "digest"}):
        raise CareerError("imported-claims inventory was edited after import")
    return raw


def import_evidence(inventory: dict[str, Any]) -> tuple[dict[str, Any], list[EvidenceRef]]:
    """Turn an inventory into SELF_REPORTED, DECLARED evidence plus a passport source summary."""
    evidence = [
        EvidenceRef("import", item["ref"], capability, Participation.SELF_REPORTED, ClaimState.DECLARED,
                    item["observed_at"], f"{item['kind']} imported from {item['platform']}"
                    + (f" ({item['endorsements']} endorsements, not counted as verification)"
                       if item["endorsements"] else ""))
        for item in inventory["claims"] for capability in item["capabilities"]
    ]
    kinds = Counter(item["kind"] for item in inventory["claims"])
    summary = {
        "kind": "imported_profile",
        "platform": inventory["platform"],
        "inventory_digest": inventory["digest"],
        "claims": len(inventory["claims"]),
        "by_kind": dict(sorted(kinds.items())),
        "unmapped": sum(not item["capabilities"] for item in inventory["claims"]),
        "declared_employment_months": inventory["declared_employment_months"],
    }
    return summary, evidence
