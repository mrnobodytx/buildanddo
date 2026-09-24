# ─── CGRF Header ──────────────────────────────
# File:        apps/career/history.py
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
# EnumEdges:   DEPENDS_ON apps/career/evidence.py; DEPENDS_ON apps/career/taxonomy.py; CONSUMES git log; PRODUCES apps/career/passport.py
# DAG Node:    none
# Intent:      Turn local git history into participation-classified evidence, crediting a person only for work they authored or integrated.
# ─────────────────────────────────────────────────────────────

"""Read local git history and classify each commit's participation for one person."""

from __future__ import annotations

import re
import subprocess
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

from apps.career.evidence import (
    CareerError,
    ClaimState,
    EvidenceRef,
    Participation,
    canonical_digest,
    looks_automated,
)
from apps.career.taxonomy import capabilities_for_change

RECORD = "\x1e"
FIELD = "\x1f"
LOG_FORMAT = f"{RECORD}%H{FIELD}%P{FIELD}%an{FIELD}%ae{FIELD}%aI{FIELD}%s{FIELD}%b{FIELD}"
_FOOTER = re.compile(r"^(SRS|Dispatch):\s*(\S+)", re.MULTILINE)
_COAUTHOR = re.compile(r"^co-authored-by:\s*(.*?)\s*<([^>]*)>\s*$", re.MULTILINE | re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class Commit:
    """Hold the fields of one commit needed for attribution."""

    sha: str
    parents: tuple[str, ...]
    author_name: str
    author_email: str
    authored_at: str
    subject: str
    body: str
    paths: tuple[str, ...]

    @property
    def is_merge(self) -> bool:
        """Return whether the commit has more than one parent."""
        return len(self.parents) > 1

    def coauthors(self) -> tuple[tuple[str, str], ...]:
        """Return (name, lowercased email) for every Co-authored-by trailer."""
        return tuple((name.strip(), email.strip().lower()) for name, email in _COAUTHOR.findall(self.body))

    def footer(self, key: str) -> str | None:
        """Return the first governance footer value for key, if present."""
        for name, value in _FOOTER.findall(self.body):
            if name == key:
                return str(value)
        return None


@dataclass(frozen=True, slots=True)
class Identity:
    """Say which author identities belong to the person and which to agents."""

    person_id: str
    person_emails: frozenset[str]
    agent_emails: frozenset[str] = frozenset()

    def __post_init__(self) -> None:
        if not self.person_id.strip():
            raise CareerError("person_id is required")
        if not self.person_emails:
            raise CareerError("at least one person email is required")
        if self.person_emails & self.agent_emails:
            raise CareerError("an identity cannot be both person and agent")
        automated = sorted(email for email in self.person_emails if looks_automated(email))
        if automated:
            raise CareerError("person identity includes bot or agent addresses: " + ", ".join(automated))

    def is_person(self, email: str) -> bool:
        """Return whether the email belongs to the person."""
        return email.lower() in self.person_emails

    def is_agent(self, email: str, name: str = "") -> bool:
        """Return whether a declared agent seat or a recognisable bot wrote the commit."""
        return email.lower() in self.agent_emails or looks_automated(email) or looks_automated(name)

    def digest(self) -> str:
        """Return a commitment to the identity used, so a verifier can confirm the same one."""
        return canonical_digest({"person_emails": sorted(self.person_emails),
                                 "agent_emails": sorted(self.agent_emails)})


@dataclass(slots=True)
class Attribution:
    """Collect person evidence and the counts of work that earned no credit."""

    evidence: list[EvidenceRef] = field(default_factory=list)
    commits_total: int = 0
    authored: int = 0
    integrated: int = 0
    agent_integrated: int = 0
    agent_assisted: int = 0
    excluded_agent: int = 0
    excluded_other: int = 0
    unmapped: int = 0


def parse_git_log(text: str) -> list[Commit]:
    """Parse output of ``git log --format=LOG_FORMAT --name-only``."""
    commits: list[Commit] = []
    for record in text.split(RECORD):
        if not record.strip():
            continue
        parts = record.split(FIELD)
        if len(parts) != 8:
            raise CareerError("malformed git log record")
        sha, parents, name, email, when, subject, body, tail = parts
        paths = tuple(line.strip() for line in tail.splitlines() if line.strip())
        commits.append(
            Commit(
                sha=sha.strip(),
                parents=tuple(parents.split()),
                author_name=name,
                author_email=email.strip().lower(),
                authored_at=when.strip(),
                subject=subject.strip(),
                body=body.strip(),
                paths=paths,
            )
        )
    return commits


def read_git_history(
    repo: Path, *, max_count: int | None = None, rev: str = "HEAD"
) -> tuple[str, list[Commit]]:
    """Read history reachable from ``rev``; return the resolved commit and commits, newest first."""
    base = ["git", "-C", str(repo)]
    if rev.startswith("-"):
        raise CareerError("revision must not look like an option")
    try:
        head = subprocess.run(
            [*base, "rev-parse", "--verify", "--end-of-options", f"{rev}^{{commit}}"],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        command = [*base, "log", "--no-color", f"--format={LOG_FORMAT}", "--name-only", head]
        if max_count is not None:
            command.append(f"--max-count={max_count}")
        log = subprocess.run(command, check=True, capture_output=True, text=True).stdout
    except (OSError, subprocess.CalledProcessError) as error:
        raise CareerError(f"cannot read git history from {repo}") from error
    return head, parse_git_log(log)


def _integrations(commits: list[Commit], identity: Identity) -> dict[str, str]:
    """Map each commit brought in by one of the person's merges to that merge's sha.

    The mainline is the first-parent chain from the newest commit. For every
    mainline merge the person authored, the side branch is walked until it
    reaches the mainline; everything found was integrated by that merge.
    """
    if not commits:
        return {}
    by_sha = {commit.sha: commit for commit in commits}
    mainline: set[str] = set()
    cursor: str | None = commits[0].sha
    while cursor in by_sha:
        mainline.add(cursor)
        parents = by_sha[cursor].parents
        cursor = parents[0] if parents else None
    integrated: dict[str, str] = {}
    for commit in commits:
        if commit.sha not in mainline or not commit.is_merge:
            continue
        if not identity.is_person(commit.author_email):
            continue
        stack = list(commit.parents[1:])
        while stack:
            sha = stack.pop()
            if sha in mainline or sha in integrated or sha not in by_sha:
                continue
            integrated[sha] = commit.sha
            stack.extend(by_sha[sha].parents)
    return integrated


def attribute(commits: Iterable[Commit], identity: Identity) -> Attribution:
    """Classify each commit for the person and emit evidence only where credit is earned.

    - authored by the person, not a merge: PERSONALLY_IMPLEMENTED, or
      AGENT_ASSISTED when a bot or AI co-author trailer is present
    - authored by anyone else and integrated by the person's merge: REVIEWED
    - agent-authored and not integrated by the person: excluded, no credit
    - authored by another human and not integrated by the person: excluded
    Git evidence is OBSERVED; a repository record is not independent verification.
    """
    items = list(commits)
    integrated = _integrations(items, identity)
    result = Attribution(commits_total=len(items))
    for commit in items:
        if commit.is_merge:
            continue
        if identity.is_person(commit.author_email):
            agents = [email for name, email in commit.coauthors()
                      if not identity.is_person(email) and identity.is_agent(email, name)]
            if agents:
                participation = Participation.AGENT_ASSISTED
                detail = f"{commit.subject} [co-authored by agent {agents[0]}]"
                result.agent_assisted += 1
            else:
                participation = Participation.PERSONALLY_IMPLEMENTED
                detail = commit.subject
            result.authored += 1
        elif commit.sha in integrated:
            participation = Participation.REVIEWED
            agent = identity.is_agent(commit.author_email, commit.author_name)
            actor = "agent" if agent else "contributor"
            detail = f"{commit.subject} [{actor}-authored; integrated by merge {integrated[commit.sha][:12]}]"
            result.integrated += 1
            if actor == "agent":
                result.agent_integrated += 1
        else:
            if identity.is_agent(commit.author_email, commit.author_name):
                result.excluded_agent += 1
            else:
                result.excluded_other += 1
            continue
        capabilities = capabilities_for_change(commit.subject, commit.paths)
        if not capabilities:
            result.unmapped += 1
            continue
        for capability in capabilities:
            result.evidence.append(
                EvidenceRef(
                    kind="commit",
                    ref=commit.sha,
                    capability_id=capability,
                    participation=participation,
                    state=ClaimState.OBSERVED,
                    observed_at=commit.authored_at,
                    detail=detail,
                )
            )
    return result
