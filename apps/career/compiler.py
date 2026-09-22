# ─── CGRF Header ──────────────────────────────
# File:        apps/career/compiler.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/authority.py, apps/career/dossier.py, apps/career/jobs.py, apps/career/passport.py, apps/career/taxonomy.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/dossier.py; DEPENDS_ON apps/career/passport.py; DEPENDS_ON apps/career/authority.py; PRODUCES application package
# DAG Node:    none
# Intent:      Compile an application package in which every claim traces to passport evidence and every reserved answer stays with the human.
# ─────────────────────────────────────────────────────────────

"""Compile deterministic, provenance-bound application packages."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from apps.career.authority import (
    COMPILER_MAX_TIER,
    AuthorityGrant,
    authorize,
    reserved_class,
)
from apps.career.dossier import Dossier
from apps.career.evidence import (
    PARTICIPATION_ORDER,
    CareerError,
    Participation,
    canonical_digest,
)
from apps.career.jobs import Job
from apps.career.passport import Passport, entry_by_id, parse_instant
from apps.career.taxonomy import BY_ID, capabilities_for_text

SCHEMA = "buildanddo.career.package/v1"
PACKAGE_FILES = (
    "resume_variant.md",
    "cover_letter.txt",
    "application_answers.json",
    "portfolio_manifest.json",
    "interview_brief.md",
    "evidence_manifest.json",
)
REFS_PER_CLAIM = 5


@dataclass(frozen=True, slots=True)
class Package:
    """Hold a compiled application package."""

    manifest: dict[str, Any]
    files: dict[str, str]

    @property
    def digest(self) -> str:
        """Return the digest over manifest and file contents."""
        return canonical_digest({"manifest": self.manifest, "files": self.files})


COUNT_PHRASES: dict[str, str] = {
    Participation.PERSONALLY_IMPLEMENTED.value: "authored",
    Participation.PERSONALLY_OPERATED.value: "operated",
    Participation.DESIGNED.value: "designed (attested)",
    Participation.DIRECTED.value: "directed (attested)",
    Participation.REVIEWED.value: "reviewed and integrated",
    Participation.VERIFIED.value: "verified (attested)",
    Participation.TEAM_DELIVERED.value: "team-delivered (attested)",
}


def _breakdown(counts: dict[str, int]) -> str:
    """Say how many records carry each participation, strongest first."""
    order = [item.value for item in PARTICIPATION_ORDER]
    parts = [
        f"{counts[key]} {COUNT_PHRASES[key]}"
        for key in sorted(counts, key=order.index)
        if key in COUNT_PHRASES
    ]
    return ", ".join(parts)


def _claims(dossier: Dossier, passport: Passport) -> list[dict[str, Any]]:
    entries = entry_by_id(passport)
    claims: list[dict[str, Any]] = []
    for item in dossier.body["strong_evidence"]:
        entry = entries[item["capability_id"]]
        refs = [ref["ref"] for ref in entry.evidence[:REFS_PER_CLAIM]]
        first = parse_instant(entry.first_seen).strftime("%Y-%m")
        last = parse_instant(entry.last_seen).strftime("%Y-%m")
        claims.append(
            {
                "claim_id": f"C{len(claims) + 1}",
                "capability_id": entry.capability_id,
                "claim": (
                    f"{entry.claim_verb} {BY_ID[entry.capability_id].claim_object} "
                    f"({_breakdown(entry.participation_counts)}; {first} to {last})"
                ),
                "participation": entry.claim_participation.value,
                "claim_state": entry.state.value,
                "evidence_refs": refs,
            }
        )
    return claims


def _answers(
    questions: list[dict[str, str]],
    claims: list[dict[str, Any]],
    stored: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    answers: list[dict[str, Any]] = []
    by_cap = {claim["capability_id"]: claim for claim in claims}
    for question in questions:
        qid, text = str(question.get("id", "")), str(question.get("text", ""))
        if not qid or not text:
            raise CareerError("each question needs an id and text")
        klass = reserved_class(text)
        if klass is not None:
            saved = stored.get(klass)
            if saved and saved.get("reusable") is True and isinstance(saved.get("answer"), str):
                answers.append({"id": qid, "question": text, "reserved_class": klass,
                                "status": "STORED_HUMAN_ANSWER", "answer": saved["answer"]})
            else:
                answers.append({"id": qid, "question": text, "reserved_class": klass,
                                "status": "HUMAN_REQUIRED", "answer": None})
            continue
        matched = [by_cap[cap] for cap in capabilities_for_text(text) if cap in by_cap]
        if matched:
            answers.append({
                "id": qid, "question": text, "reserved_class": None, "status": "DRAFT",
                "answer": " ".join(claim["claim"] + "." for claim in matched),
                "claim_ids": [claim["claim_id"] for claim in matched],
            })
        else:
            answers.append({"id": qid, "question": text, "reserved_class": None,
                            "status": "HUMAN_REQUIRED", "answer": None})
    return answers


def _markdown_list(values: list[str]) -> str:
    return "\n".join(f"- {value}" for value in values) if values else "- none"


def compile_application(
    job: Job,
    dossier: Dossier,
    passport: Passport,
    *,
    questions: list[dict[str, str]] | None = None,
    stored_answers: dict[str, dict[str, Any]] | None = None,
) -> Package:
    """Compile the package; refuse when the dossier and passport do not belong together."""
    if dossier.body["passport_digest"] != passport.digest or dossier.body["job_digest"] != job.digest:
        raise CareerError("dossier does not match this job and passport")
    claims = _claims(dossier, passport)
    answers = _answers(questions or [], claims, stored_answers or {})
    unresolved = tuple(
        str(item["reserved_class"]) for item in answers if item["status"] == "HUMAN_REQUIRED" and item["reserved_class"]
    )
    header = f"{job.role} - {job.company}"
    claim_lines = [f"{claim['claim']} [evidence: {', '.join(ref[:12] for ref in claim['evidence_refs'])}]" for claim in claims]
    resume = "\n".join([
        f"# {passport.person_id}",
        "",
        f"Target: {header}",
        "",
        "## Relevant recorded work",
        "",
        _markdown_list(claim_lines),
        "",
        f"Evidence manifest: passport {passport.digest}",
        "",
    ])
    cover = "\n".join([
        "DRAFT - requires human review before use.",
        "",
        f"Re: {header}",
        "",
        "The statements below summarize recorded work relevant to this role. Each is",
        "bound to evidence listed in evidence_manifest.json.",
        "",
        *[f"- {claim['claim']}." for claim in claims],
        "",
        "Company-specific motivation is intentionally left for the applicant to write.",
        "",
    ])
    brief = "\n".join([
        f"# Interview brief: {header}",
        "",
        f"State: {dossier.state}",
        f"Why: {dossier.body['why']}",
        "",
        "## Lead with",
        _markdown_list(list(dossier.body["application_strategy"]["lead_with"])),
        "",
        "## Weak areas",
        _markdown_list([f"{item['requirement']} ({item['status']})" for item in dossier.body["weak_areas"]]),
        "",
        "## Do not claim",
        _markdown_list(list(dossier.body["do_not_claim"])),
        "",
        "## Human-reserved",
        _markdown_list([f"{item['requirement']} ({item['reserved_class']})" for item in dossier.body["human_required"]]),
        "",
    ])
    evidence_manifest = {
        "passport_digest": passport.digest,
        "job_digest": job.digest,
        "dossier_digest": dossier.digest,
        "claims": claims,
    }
    portfolio = {
        claim["capability_id"]: claim["evidence_refs"] for claim in claims
    }
    files = {
        "resume_variant.md": resume,
        "cover_letter.txt": cover,
        "application_answers.json": canonical_json(answers),
        "portfolio_manifest.json": canonical_json(portfolio),
        "interview_brief.md": brief,
        "evidence_manifest.json": canonical_json(evidence_manifest),
    }
    next_step = authorize("fill", AuthorityGrant(), unresolved_reserved=unresolved)
    manifest = {
        "schema": SCHEMA,
        "job_id": job.job_id,
        "role": job.role,
        "company": job.company,
        "application_system": job.fields.get("application_system"),
        "apply_url": job.fields.get("apply_url"),
        "job_digest": job.digest,
        "passport_digest": passport.digest,
        "dossier_digest": dossier.digest,
        "authority_tier": COMPILER_MAX_TIER.name,
        "submission_state": "NOT_SUBMITTED",
        "unresolved_reserved": sorted(set(unresolved)),
        "next_step": next_step.to_dict(),
        "claim_count": len(claims),
    }
    package = Package(manifest, files)
    errors = validate_package(package, passport, dossier)
    if errors:  # pragma: no cover - construction above cannot produce these
        raise CareerError("; ".join(errors))
    return package


def canonical_json(value: Any) -> str:
    """Render stable, human-readable JSON."""
    return json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def validate_package(package: Package, passport: Passport, dossier: Dossier) -> list[str]:
    """Return every provenance or authority violation found in a package."""
    errors: list[str] = []
    entries = entry_by_id(passport)
    manifest = json.loads(package.files["evidence_manifest.json"])
    if manifest.get("passport_digest") != passport.digest:
        errors.append("evidence manifest names a different passport")
    weak = {cap for row in dossier.body["coverage"] if row["status"] != "SUPPORTED" for cap in row["missing_capabilities"]}
    for claim in manifest.get("claims", []):
        entry = entries.get(claim.get("capability_id"))
        if entry is None:
            errors.append(f"{claim.get('claim_id')}: capability absent from passport")
            continue
        refs = claim.get("evidence_refs") or []
        if not refs:
            errors.append(f"{claim['claim_id']}: claim has no evidence")
        if not set(refs) <= entry.refs():
            errors.append(f"{claim['claim_id']}: evidence reference not in passport")
        if not str(claim.get("claim", "")).startswith(entry.claim_verb + " "):
            errors.append(f"{claim['claim_id']}: wording exceeds recorded participation")
        if claim.get("participation") != entry.claim_participation.value:
            errors.append(f"{claim['claim_id']}: participation mismatch")
        if entry.capability_id in weak and entry.capability_id not in {
            item["capability_id"] for item in dossier.body["strong_evidence"]
        }:
            errors.append(f"{claim['claim_id']}: claims a capability the dossier marks unproven")
    for answer in json.loads(package.files["application_answers.json"]):
        if answer.get("reserved_class") and answer.get("status") not in ("HUMAN_REQUIRED", "STORED_HUMAN_ANSWER"):
            errors.append(f"{answer.get('id')}: reserved answer was generated")
    if package.manifest.get("submission_state") != "NOT_SUBMITTED":
        errors.append("compiler packages are never submitted")
    return errors
