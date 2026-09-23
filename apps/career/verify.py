# ─── CGRF Header ──────────────────────────────
# File:        apps/career/verify.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/history.py, apps/career/passport.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/history.py; DEPENDS_ON apps/career/passport.py; VALIDATES apps/career/passport.py
# DAG Node:    none
# Intent:      Let a recruiter or reviewer re-derive a passport's repository claims themselves, so a claim is checked against the work rather than taken on trust.
# ─────────────────────────────────────────────────────────────

"""Verify a Career Passport against a repository clone, and render a shareable card.

A passport digest only shows the file is internally consistent; anyone can
recompute it. Verification re-reads the repository at the passport's recorded
head with the candidate's identity file, re-attributes every commit and
compares. Evidence from attestations and mission exports cannot be re-derived
from git and is reported separately with its claim state.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError, Participation
from apps.career.history import Identity, attribute, read_git_history
from apps.career.passport import Passport

COUNTERS = ("commits_total", "authored", "integrated", "agent_integrated", "agent_assisted",
            "excluded_agent", "excluded_other", "unmapped")
GIT_ONLY = (Participation.PERSONALLY_IMPLEMENTED.value, Participation.AGENT_ASSISTED.value)
LIMITS = [
    "git author names, emails and dates are chosen by whoever made each commit; this proves the "
    "passport matches the repository, not that the repository history is authentic",
    "verify against a clone of the canonical remote, and check that the identity file's addresses "
    "belong to the candidate (for example through the hosting provider's account)",
    "attestation and mission evidence is not re-derivable from git; its VERIFIED state rests on "
    "the named independent reviewer and receipt",
]


def verify_passport(raw: dict[str, Any], repo: Path, identity: Identity) -> dict[str, Any]:
    """Re-derive the git portion of a passport and list every disagreement."""
    passport = Passport.from_dict(raw)
    mismatches: list[str] = []
    git = next((item for item in passport.sources if item.get("kind") == "git"), None)
    if git is None:
        raise CareerError("passport has no git source to verify")
    if git.get("identity_digest") not in (None, identity.digest()):
        mismatches.append("identity file differs from the one the passport was built with")
    if passport.person_id != identity.person_id:
        mismatches.append("person_id differs from the identity file")
    max_count = git.get("max_count")
    head, commits = read_git_history(
        repo, rev=str(git["head"]), max_count=int(max_count) if max_count is not None else None
    )
    attribution = attribute(commits, identity)
    for key in COUNTERS:
        if git.get(key) != getattr(attribution, key):
            mismatches.append(f"{key}: passport {git.get(key)}, repository {getattr(attribution, key)}")
    derived = {(item.ref, item.capability_id, item.participation.value) for item in attribution.evidence}
    per_capability: dict[str, Counter[str]] = {}
    for item in attribution.evidence:
        per_capability.setdefault(item.capability_id, Counter())[item.participation.value] += 1
    checked = 0
    other: Counter[str] = Counter()
    for entry in passport.capabilities:
        for ref in entry.evidence:
            if ref["kind"] != "commit":
                other[f"{ref['kind']}:{ref['state']}"] += 1
                continue
            checked += 1
            if (ref["ref"], entry.capability_id, ref["participation"]) not in derived:
                mismatches.append(
                    f"{entry.capability_id}: commit {ref['ref'][:12]} is not {ref['participation']} "
                    "for this identity in the repository"
                )
        expected = per_capability.get(entry.capability_id, Counter())
        for participation in GIT_ONLY:
            claimed = entry.participation_counts.get(participation, 0)
            if claimed != expected.get(participation, 0):
                mismatches.append(f"{entry.capability_id}: {claimed} {participation} records claimed, "
                                  f"repository shows {expected.get(participation, 0)}")
        reviewed = entry.participation_counts.get(Participation.REVIEWED.value, 0)
        if reviewed < expected.get(Participation.REVIEWED.value, 0):
            mismatches.append(f"{entry.capability_id}: REVIEWED count below the repository's")
    return {
        "state": "MISMATCH" if mismatches else "VERIFIED_AGAINST_REPOSITORY",
        "passport_digest": passport.digest,
        "head": head,
        "checked_commit_refs": checked,
        "mismatches": mismatches,
        "not_repository_verifiable": dict(sorted(other.items())),
        "limits": LIMITS,
    }


def render_card(passport: Passport) -> str:
    """Render a shareable summary whose every line can be checked with ``verify``."""
    git = next((item for item in passport.sources if item.get("kind") == "git"), {})
    rows = []
    for entry in sorted(passport.capabilities, key=lambda item: (-item.confidence, item.capability_id)):
        counts = ", ".join(f"{count} {name.lower()}" for name, count in sorted(entry.participation_counts.items()))
        rows.append(f"| {entry.label} | {entry.claim_verb.rstrip(':')} | {counts} | {entry.state.value} "
                    f"| {entry.first_seen[:10]} to {entry.last_seen[:10]} |")
    excluded = int(git.get("excluded_agent", 0)) + int(git.get("excluded_other", 0))
    return "\n".join([
        f"# Career Passport: {passport.person_id}",
        "",
        f"As of {passport.as_of[:10]}. Repository head `{str(git.get('head', ''))[:12]}`. "
        f"Passport `{passport.digest}`.",
        "",
        "| Capability | Headline | Records by participation | Best state | Observed |",
        "|---|---|---|---|---|",
        *rows,
        "",
        f"Credited: {git.get('authored', 0)} authored commits ({git.get('agent_assisted', 0)} with an AI "
        f"co-author) and {git.get('integrated', 0)} integrated through the person's merges. "
        f"Not credited: {excluded} commits by others or agents that the person did not integrate.",
        "",
        "OBSERVED means the repository records the work. VERIFIED means a named reviewer other than",
        "the person attached a receipt. Nothing here states employment tenure.",
        "",
        "## Check it yourself",
        "",
        "```",
        "git clone <canonical remote> repo",
        "python -m apps.career verify --passport passport.json --repo repo --identity identity.json",
        "```",
        "",
    ])
