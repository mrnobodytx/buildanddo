# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/career_passport/matching.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/jobs.py, libs/career_passport/passport.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/career_passport/jobs.py; CONSUMES libs/career_passport/passport.py
# Intent:      Explain every job requirement against scoped personal evidence without inventing duration or a generic match score.
# ───────────────────────────────────────────────────────────────

"""Build deterministic requirement dossiers and mandatory exclusions."""

from __future__ import annotations

from dataclasses import dataclass

from libs.semantic_twin.contracts import require

from .jobs import MAX_JOB_AGE_SECONDS, Job, Requirement
from .models import Participation
from .passport import ClaimView, Passport


@dataclass(frozen=True, slots=True)
class Coverage:
    """Keep the source clause, matched facts and missing dimensions together."""

    requirement: Requirement
    state: str
    claim_ids: tuple[str, ...]
    reasons: tuple[str, ...]

    def to_dict(self) -> dict[str, object]:
        """Expose the original requirement alongside evidence and exact gaps."""
        return {
            "requirement_id": self.requirement.id,
            **self.requirement.to_dict(),
            "state": self.state,
            "claim_ids": list(self.claim_ids),
            "reasons": list(self.reasons),
        }


@dataclass(frozen=True, slots=True)
class Dossier:
    """Explain a role without granting employer eligibility or submit permission."""

    job: Job
    passport: Passport
    coverage: tuple[Coverage, ...]
    freshness: str

    @property
    def state(self) -> str:
        """Hold uncertain postings and preserve all mandatory requirement gaps."""
        required = [
            row for row in self.coverage if row.requirement.importance == "required"
        ]
        if self.freshness != "CURRENT" or not required:
            return "HOLD"
        if any(row.requirement.importance == "unclassified" for row in self.coverage):
            return "REVIEW_GAPS"
        return (
            "STRONG_CANDIDATE"
            if all(row.state == "SUPPORTED" for row in required)
            else "REVIEW_GAPS"
        )

    @property
    def do_not_claim(self) -> tuple[str, ...]:
        """Keep every unsupported clause out of generated personal statements."""
        return tuple(
            row.requirement.quote for row in self.coverage if row.state != "SUPPORTED"
        )

    @property
    def selected_claims(self) -> tuple[ClaimView, ...]:
        """Select only verified personal facts that support at least one dimension."""
        ids = {key for row in self.coverage for key in row.claim_ids}
        return tuple(
            c
            for c in self.passport.verified
            if str(c.contribution.subject.semantic_id) in ids
        )

    def to_dict(self) -> dict[str, object]:
        """Serialize dimensions instead of compressing uncertainty into one score."""
        required = [
            row for row in self.coverage if row.requirement.importance == "required"
        ]
        hard = [
            row
            for row in required
            if row.requirement.kind in ("human", "hard", "duration")
        ]
        return {
            "job": self.job.to_dict(),
            "job_id": self.job.id,
            "job_revision": self.job.revision,
            "person": str(self.passport.person),
            "workspace": self.passport.workspace,
            "as_of": self.passport.as_of.isoformat(),
            "state": self.state,
            "freshness": self.freshness,
            "coverage": [row.to_dict() for row in self.coverage],
            "do_not_claim": list(self.do_not_claim),
            "required_supported": sum(row.state == "SUPPORTED" for row in required),
            "required_total": len(required),
            "hard_requirements": "NOT_PROVEN" if hard else "NONE_EXTRACTED",
            "selected_claim_ids": [
                str(c.contribution.subject.semantic_id) for c in self.selected_claims
            ],
            "authority_granted": False,
        }


def _coverage(
    requirement: Requirement, passport: Passport, recency_days: int
) -> Coverage:
    if requirement.kind in ("duration", "human", "hard"):
        reasons = {
            "duration": "Work depth does not establish years of employment.",
            "human": "A scoped human answer is required; no personal attestation is inferred.",
            "hard": "Degree, license and certification evidence is not established by project history.",
        }
        return Coverage(
            requirement,
            "HUMAN_INPUT" if requirement.kind == "human" else "NOT_PROVEN",
            (),
            (reasons[requirement.kind],),
        )
    if (
        requirement.kind == "unparsed"
        or requirement.combination != "all"
        or requirement.importance == "unclassified"
    ):
        return Coverage(
            requirement,
            "NEEDS_REVIEW",
            (),
            (
                "This exact clause needs human interpretation; keyword presence cannot establish support.",
            ),
        )
    roles = {
        Participation.PERSONALLY_IMPLEMENTED,
        Participation.PERSONALLY_OPERATED,
        Participation.DESIGNED,
        Participation.DIRECTED,
    }
    if requirement.participation == "hands_on":
        roles = {
            Participation.PERSONALLY_IMPLEMENTED,
            Participation.PERSONALLY_OPERATED,
        }
    elif requirement.participation == "leadership":
        roles = {Participation.DESIGNED, Participation.DIRECTED}
    elif requirement.participation == "review":
        roles = {Participation.REVIEWED, Participation.VERIFIED}
    accepted: set[str] = set()
    selected: set[str] = set()
    gaps = []
    for capability in requirement.capabilities:
        possible = [
            c for c in passport.verified if capability in c.contribution.capabilities
        ]
        eligible = [
            c
            for c in possible
            if c.contribution.participation in roles
            and set(requirement.scope) <= set(c.contribution.scope)
            and 0
            <= (passport.as_of - c.contribution.occurred_at).total_seconds()
            <= recency_days * 86400
        ]
        if eligible:
            accepted.add(capability)
            selected.update(str(c.contribution.subject.semantic_id) for c in eligible)
        else:
            gaps.append(
                capability
                + (
                    ": verified work lacks the required participation, scope or recency."
                    if possible
                    else ": no independently verified personal evidence."
                )
            )
    state = (
        "SUPPORTED"
        if accepted and len(accepted) == len(requirement.capabilities)
        else "PARTIAL"
        if accepted
        else "GAP"
    )
    return Coverage(requirement, state, tuple(sorted(selected)), tuple(gaps))


def evaluate(job: Job, passport: Passport, *, recency_days: int = 730) -> Dossier:
    """Compare each extracted clause to currently verified, scoped personal work."""
    require(
        type(recency_days) is int and 1 <= recency_days <= 3650,
        "invalid career recency window",
    )
    age = (passport.as_of - job.captured_at).total_seconds()
    freshness = (
        "FUTURE" if age < 0 else "STALE" if age > MAX_JOB_AGE_SECONDS else "CURRENT"
    )
    return Dossier(
        job,
        passport,
        tuple(_coverage(row, passport, recency_days) for row in job.requirements),
        freshness,
    )


def shortlist(
    jobs: tuple[Job, ...], passport: Passport, *, limit: int = 10
) -> tuple[Dossier, ...]:
    """Rank explainable coverage while excluding stale or future postings."""
    require(type(limit) is int and 1 <= limit <= 100, "invalid shortlist bound")
    require(
        len(jobs) <= 1000 and len({j.id for j in jobs}) == len(jobs),
        "duplicate or oversized job batch",
    )
    dossiers = [evaluate(job, passport) for job in jobs]

    def order(row: Dossier) -> tuple[int, int, int, str]:
        required = [c for c in row.coverage if c.requirement.importance == "required"]
        return (
            0 if row.state == "STRONG_CANDIDATE" else 1,
            -sum(c.state == "SUPPORTED" for c in required),
            sum(c.state != "SUPPORTED" for c in required),
            row.job.id,
        )

    return tuple(
        sorted((d for d in dossiers if d.freshness == "CURRENT"), key=order)[:limit]
    )
