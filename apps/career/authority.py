# ─── CGRF Header ──────────────────────────────
# File:        apps/career/authority.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/evidence.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/evidence.py; GATES apps/career/compiler.py
# DAG Node:    none
# Intent:      Bound every application step by an explicit J0-J5 tier so answers a human must give are never inferred or auto-submitted.
# ─────────────────────────────────────────────────────────────

"""Define application authority tiers, reserved question classes and the submission policy."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum, IntEnum


class JobTier(IntEnum):
    """Order the application actions by the authority they require."""

    J0_DISCOVER = 0
    J1_EVALUATE = 1
    J2_PACKAGE = 2
    J3_FILL = 3
    J4_SUBMIT = 4
    J5_ATTEST = 5


ACTION_TIER: dict[str, JobTier] = {
    "discover": JobTier.J0_DISCOVER,
    "evaluate": JobTier.J1_EVALUATE,
    "package": JobTier.J2_PACKAGE,
    "fill": JobTier.J3_FILL,
    "submit": JobTier.J4_SUBMIT,
    "attest": JobTier.J5_ATTEST,
}

# The highest tier this repository's code performs. J3/J4 are policy decisions only.
COMPILER_MAX_TIER = JobTier.J2_PACKAGE

RESERVED_CLASSES: dict[str, tuple[str, ...]] = {
    "work_authorization": ("work authorization", "authorized to work", "authorised to work",
                           "sponsorship", "visa", "right to work", "citizenship", "citizen"),
    "security_clearance": ("clearance", "ts/sci", "secret clearance", "polygraph"),
    "criminal_history": ("criminal", "convicted", "conviction", "felony"),
    "compensation": ("salary", "compensation expectation", "desired pay", "pay expectation",
                     "expected compensation"),
    "relocation": ("relocate", "relocation", "willing to move"),
    "contract_acceptance": ("accept the terms", "employment agreement", "non-compete",
                            "arbitration agreement"),
    "background_check": ("background check", "background screening", "drug test", "drug screen"),
    "disability": ("disability", "disabled"),
    "veteran": ("veteran", "military service", "protected veteran"),
    "demographic": ("race", "ethnicity", "gender", "sexual orientation", "pronoun", "hispanic",
                    "demographic"),
    "age": ("years of age", "date of birth", "your age", "over 18", "at least 18", "birth date"),
    "export_control": ("u.s. person", "us person", "itar", "export control", "export-controlled"),
    "legal_attestation": ("i certify", "i attest", "true and complete", "under penalty"),
}

_RESERVED = tuple(
    (name, re.compile(r"(?<![a-z0-9])" + re.escape(keyword) + r"(?![a-z0-9])"))
    for name, keywords in RESERVED_CLASSES.items()
    for keyword in keywords
)


# Engineering phrases that contain a reserved keyword but ask nothing personal.
NEUTRAL_PHRASES = ("race condition", "race-condition", "data race", "disability insurance product")


def reserved_class(text: str) -> str | None:
    """Return the reserved class a question or requirement belongs to, if any."""
    lowered = text.lower()
    for phrase in NEUTRAL_PHRASES:
        lowered = lowered.replace(phrase, " ")
    for name, pattern in _RESERVED:
        if pattern.search(lowered):
            return name
    return None


class Decision(str, Enum):
    """Name the outcome of an authority check."""

    ALLOWED = "ALLOWED"
    REQUIRES_APPROVAL = "REQUIRES_APPROVAL"
    HUMAN_REQUIRED = "HUMAN_REQUIRED"
    STOP_FOR_HUMAN_CHALLENGE = "STOP_FOR_HUMAN_CHALLENGE"
    DENIED = "DENIED"


@dataclass(frozen=True, slots=True)
class AuthorityGrant:
    """Record what the human has delegated.

    ``approved_packages`` holds digests of application packages the human approved.
    ``approved_sites`` names application systems J4 may target without per-package
    approval; it never covers reserved classes.
    """

    max_tier: JobTier = JobTier.J2_PACKAGE
    approved_packages: frozenset[str] = frozenset()
    approved_sites: frozenset[str] = frozenset()
    reusable_reserved: frozenset[str] = field(default_factory=frozenset)


@dataclass(frozen=True, slots=True)
class AuthorityResult:
    """Carry an authority decision and its reason."""

    action: str
    tier: JobTier
    decision: Decision
    reason: str

    def to_dict(self) -> dict[str, str]:
        """Serialize to plain JSON values."""
        return {
            "action": self.action,
            "tier": self.tier.name,
            "decision": self.decision.value,
            "reason": self.reason,
        }


def authorize(
    action: str,
    grant: AuthorityGrant,
    *,
    package_digest: str | None = None,
    application_system: str | None = None,
    challenge_present: bool = False,
    unresolved_reserved: tuple[str, ...] = (),
) -> AuthorityResult:
    """Decide whether an application action may proceed under the grant.

    An anti-bot challenge always stops for a human; there is no bypass path.
    J5 attestations are never delegated. Submission requires either an approved
    package digest or an approved site, and no unresolved reserved question.
    """
    if action not in ACTION_TIER:
        return AuthorityResult(action, JobTier.J5_ATTEST, Decision.DENIED, "unknown action")
    tier = ACTION_TIER[action]
    if challenge_present and tier >= JobTier.J3_FILL:
        return AuthorityResult(
            action, tier, Decision.STOP_FOR_HUMAN_CHALLENGE,
            "anti-bot challenge present; a human completes it before the runner continues",
        )
    if tier is JobTier.J5_ATTEST:
        return AuthorityResult(action, tier, Decision.HUMAN_REQUIRED, "attestations are human-reserved")
    if tier > grant.max_tier:
        return AuthorityResult(action, tier, Decision.DENIED, f"grant stops at {grant.max_tier.name}")
    if tier >= JobTier.J3_FILL and unresolved_reserved:
        return AuthorityResult(
            action, tier, Decision.HUMAN_REQUIRED,
            "awaiting the human: " + ", ".join(sorted(set(unresolved_reserved))),
        )
    if tier is JobTier.J4_SUBMIT:
        if package_digest is None:
            return AuthorityResult(action, tier, Decision.DENIED, "submission needs a package digest")
        approved = package_digest in grant.approved_packages or (
            application_system is not None and application_system in grant.approved_sites
        )
        if not approved:
            return AuthorityResult(
                action, tier, Decision.REQUIRES_APPROVAL, "package digest not approved by the human"
            )
    return AuthorityResult(action, tier, Decision.ALLOWED, "within delegated tier")
