# ─── CGRF Header ──────────────────────────────
# File:        apps/career/fill.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/authority.py, apps/career/packages.py, apps/career/taxonomy.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/authority.py; DEPENDS_ON apps/career/packages.py; GATES application runner
# DAG Node:    none
# Intent:      Map an employer form to package content field by field, so a runner can only type what the human approved and must stop where the human must answer.
# ─────────────────────────────────────────────────────────────

"""Build a form fill plan from a verified package, a form schema and a human profile.

This module decides what each field would receive and whether filling and
submitting are authorized. It does not open a browser, contact a site or
submit. Every field value names where it came from.
"""

from __future__ import annotations

import json
import re
from typing import Any

from apps.career.authority import AuthorityGrant, Decision, JobTier, authorize, reserved_class
from apps.career.evidence import CareerError

PROFILE_FIELDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("first_name", ("first name", "given name")),
    ("last_name", ("last name", "surname", "family name")),
    ("full_name", ("full name", "name")),
    ("email", ("email", "e-mail")),
    ("phone", ("phone", "mobile", "telephone")),
    ("linkedin", ("linkedin",)),
    ("github", ("github",)),
    ("website", ("website", "portfolio", "personal site")),
    ("location", ("current location", "location", "city")),
)


def _matches(label: str, words: tuple[str, ...]) -> bool:
    return any(re.search(r"(?<![a-z])" + re.escape(word) + r"(?![a-z])", label) for word in words)


def grant_from_dict(raw: Any) -> AuthorityGrant:
    """Read a human authority grant; absent fields keep the J2 default."""
    if raw is None:
        return AuthorityGrant()
    if not isinstance(raw, dict):
        raise CareerError("grant must be an object")
    try:
        tier = JobTier[str(raw.get("max_tier", "J2_PACKAGE"))]
    except KeyError as error:
        raise CareerError("unknown max_tier") from error
    lists = {key: raw.get(key, []) for key in ("approved_packages", "approved_sites")}
    if not all(isinstance(value, list) for value in lists.values()):
        raise CareerError("grant approvals must be lists")
    return AuthorityGrant(
        max_tier=tier,
        approved_packages=frozenset(str(item) for item in lists["approved_packages"]),
        approved_sites=frozenset(str(item) for item in lists["approved_sites"]),
    )


def plan_fill(
    package: dict[str, Any],
    form: dict[str, Any],
    profile: dict[str, Any],
    grant: AuthorityGrant,
    *,
    challenge_present: bool = False,
) -> dict[str, Any]:
    """Return a per-field plan and the fill/submit authority decisions."""
    fields = form.get("fields") if isinstance(form, dict) else None
    if not isinstance(fields, list) or not fields:
        raise CareerError("form must hold a non-empty fields list")
    answers = json.loads(package["files"]["application_answers.json"])
    by_text = {str(item["question"]).strip().lower(): item for item in answers}
    stored = {item["reserved_class"]: item for item in answers if item["status"] == "STORED_HUMAN_ANSWER"}
    rows: list[dict[str, Any]] = []
    for field in fields:
        if not isinstance(field, dict) or not field.get("id") or not field.get("label"):
            raise CareerError("each form field needs an id and a label")
        label = str(field["label"]).strip()
        lowered = label.lower()
        kind = str(field.get("type", "text"))
        row: dict[str, Any] = {"id": field["id"], "label": label, "required": bool(field.get("required"))}
        klass = reserved_class(label)
        if klass is not None:
            saved = stored.get(klass)
            row.update({"reserved_class": klass, "source": "stored_human_answer" if saved else "human",
                        "status": "CONFIRM_STORED" if saved else "HUMAN_REQUIRED",
                        "value": saved["answer"] if saved else None})
        elif kind == "file" and _matches(lowered, ("resume", "cv")):
            row.update({"source": "package:resume_variant.md", "status": "READY", "value": "resume_variant.md",
                        "note": "markdown variant; render to the site's accepted format before upload"})
        elif kind == "file" and _matches(lowered, ("cover letter",)):
            row.update({"source": "package:cover_letter.txt", "status": "REVIEW_DRAFT", "value": "cover_letter.txt"})
        elif lowered in by_text and by_text[lowered]["answer"]:
            row.update({"source": f"package:answer:{by_text[lowered]['id']}", "status": "REVIEW_DRAFT",
                        "value": by_text[lowered]["answer"]})
        else:
            key = next((name for name, words in PROFILE_FIELDS if _matches(lowered, words)), None)
            if key is not None and isinstance(profile.get(key), str) and profile[key].strip():
                row.update({"source": f"profile:{key}", "status": "READY", "value": profile[key].strip()})
            else:
                row.update({"source": "human", "status": "HUMAN_REQUIRED", "value": None})
        rows.append(row)
    unresolved = tuple(row.get("reserved_class") or row["label"] for row in rows
                       if row["status"] in ("HUMAN_REQUIRED", "CONFIRM_STORED") and row["required"])
    manifest = package["manifest"]
    system = form.get("application_system") or manifest.get("application_system")
    fill = authorize("fill", grant, challenge_present=challenge_present, unresolved_reserved=unresolved)
    submit = authorize("submit", grant, package_digest=package["digest"], application_system=system,
                       challenge_present=challenge_present, unresolved_reserved=unresolved)
    return {
        "schema": "buildanddo.career.fill-plan/v1",
        "job_id": manifest["job_id"],
        "package_digest": package["digest"],
        "application_system": system,
        "fields": rows,
        "blocking": list(unresolved),
        "fill": fill.to_dict(),
        "submit": submit.to_dict(),
        "executable": fill.decision is Decision.ALLOWED,
        "note": "a plan only; no runner in this repository opens a browser or submits",
    }
