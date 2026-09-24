# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/career_passport/authority.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/application.py, libs/career_passport/jobs.py, libs/career_passport/models.py, libs/evolution/common.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/career_passport/application.py; CONSUMES libs/career_passport/jobs.py; CONSUMES libs/career_passport/models.py; CONSUMES libs/evolution/common.py
# Intent:      Fence application preparation and outcome tracking with exact human approval and preserve ambiguous submission states.
# ───────────────────────────────────────────────────────────────

"""Describe governed browser work without executing ATS writes or attestations."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from libs.evolution.common import digest, unique
from libs.semantic_twin.contracts import Contract, require
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest

from .application import ApplicationPackage
from .jobs import Job
from .models import Artifact, bounded_text

STAGES = {
    "J0": "Discover",
    "J1": "Evaluate",
    "J2": "Generate draft",
    "J3": "Fill approved form",
    "J4": "Submit approved application",
    "J5": "Human-reserved answers",
}


@dataclass(frozen=True, slots=True)
class Form(Contract):
    """Bind a receiving browser's exact field labels to one employer application."""

    apply_url: str
    questions: Mapping[str, str]
    observed_at: datetime
    challenge: bool = False

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        bounded_text(self.apply_url, "form URL", 1000)
        require(0 < len(self.questions) <= 150, "invalid form field count")
        for key, label in self.questions.items():
            bounded_text(key, "question id", 150)
            bounded_text(label, "question label", 6000)


@dataclass(frozen=True, slots=True)
class Approval(Contract):
    """Retain explicit human consent; authenticity comes from separate caller pins."""

    person: SemanticId
    human: SemanticId
    workspace: str
    job_revision: str
    package_sha256: ContentDigest
    form_sha256: ContentDigest
    answers_sha256: ContentDigest
    stage: Literal["J3", "J4"]
    issued_at: datetime
    expires_at: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.person.require_namespace("person")
        self.human.require_namespace("person")
        require(
            self.person == self.human, "the applicant must approve this application"
        )
        require(
            0 < (self.expires_at - self.issued_at).total_seconds() <= 86400,
            "approval must expire within one day",
        )


def browser_plan(
    package: ApplicationPackage,
    job: Job,
    form: Form,
    answers: Mapping[str, str],
    *,
    approval: Approval | None,
    authenticated_approvals: tuple[ContentDigest, ...],
    at: datetime,
    submit: bool = False,
    prior_events: tuple[OutcomeEvent, ...] = (),
    authenticated_events: tuple[ContentDigest, ...] = (),
) -> dict[str, object]:
    """Return a plan only after exact approval; never infer even unknown answers.

    All supplied answers are explicit human answers, including ordinary contact
    fields. The receiving owner authenticates approval pins separately from the
    package. This function has no browser, HTTP, cookie or submission capability.
    """
    require(
        job.revision == package.job_revision and job.id == package.job_id,
        "job changed since compilation",
    )
    require(
        form.apply_url == job.apply_url == package.apply_url,
        "form recipient differs from reviewed package",
    )
    require(
        0 <= (at - job.captured_at).total_seconds() <= 86400,
        "refresh the posting before browser work",
    )
    require(
        package.generated_at <= at
        and 0 <= (at - form.observed_at).total_seconds() <= 900,
        "form capture is stale or future",
    )
    history = outcome_summary(
        prior_events,
        person=SemanticId(package.person),
        workspace=package.workspace,
        at=at,
        authenticated_events=authenticated_events,
    )
    states = history["states"]
    assert isinstance(states, dict)
    require(
        not submit or job.id not in states,
        "submission was already started; reconcile its retained receipt instead of retrying",
    )
    require(
        set(answers) <= set(form.questions), "answer references an unknown form field"
    )
    for answer in answers.values():
        bounded_text(answer, "human answer", 20000)
    if form.challenge:
        return {"state": "STOP_HUMAN_CHALLENGE", "actions": [], "submitted": False}
    if approval is None:
        return {"state": "HUMAN_APPROVAL_REQUIRED", "actions": [], "submitted": False}
    require(
        ContentDigest(digest(approval)) in authenticated_approvals,
        "approval is not authenticated by the receiving owner",
    )
    require(
        str(approval.person) == package.person
        and approval.workspace == package.workspace,
        "approval person/workspace mismatch",
    )
    require(
        approval.package_sha256 == ContentDigest(package.sha256)
        and approval.job_revision == job.revision,
        "approval does not cover these package bytes or posting",
    )
    require(
        approval.form_sha256 == ContentDigest(digest(form))
        and approval.answers_sha256 == ContentDigest(digest(dict(answers))),
        "form or human answers changed after approval",
    )
    require(
        max(package.generated_at, form.observed_at)
        <= approval.issued_at
        <= at
        < approval.expires_at,
        "approval is premature, future or expired",
    )
    require(
        not submit or approval.stage == "J4",
        "fill approval cannot authorize submission",
    )
    missing = sorted(set(form.questions) - set(answers))
    if missing:
        return {
            "state": "HUMAN_ANSWERS_REQUIRED",
            "questions": missing,
            "actions": [],
            "submitted": False,
        }
    return {
        "state": "READY_FOR_RECEIVING_BROWSER",
        "stage": "J4" if submit else "J3",
        "package_sha256": package.sha256,
        "form_sha256": digest(form),
        "actions": [
            {
                "question_id": key,
                "answer": answers[key],
                "source": "explicit_human_answer",
            }
            for key in sorted(answers)
        ],
        "submit_requested": submit,
        "submitted": False,
        "authority_note": "J stages do not replace the receiving A3 dispatch or site permission.",
    }


@dataclass(frozen=True, slots=True)
class OutcomeEvent(Contract):
    """Retain an actual observed application event and its exact receipt artifact."""

    person: SemanticId
    workspace: str
    job_id: str
    package_sha256: ContentDigest
    kind: Literal[
        "submit_started",
        "submit_unknown",
        "submitted",
        "response",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
    ]
    occurred_at: datetime
    evidence: Artifact

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.person.require_namespace("person")
        bounded_text(self.workspace, "workspace")
        bounded_text(self.job_id, "job id")
        require(
            self.evidence.recorded_at <= self.occurred_at, "event predates its evidence"
        )


def outcome_summary(
    events: tuple[OutcomeEvent, ...],
    *,
    person: SemanticId,
    workspace: str,
    at: datetime,
    authenticated_events: tuple[ContentDigest, ...] = (),
) -> dict[str, object]:
    """Count evidenced events once and never turn a timeout into a submission."""
    require(len(events) <= 10000, "application event bound exceeded")
    unique(tuple(digest(e) for e in events), "outcome event")
    latest: dict[str, str] = {}
    counts: dict[str, set[str]] = {
        key: set() for key in ("submitted", "response", "interview", "offer")
    }
    transitions = {
        None: {"submit_started"},
        "submit_started": {"submit_unknown", "submitted"},
        "submit_unknown": {"submitted"},
        "submitted": {"response", "interview", "rejected", "withdrawn"},
        "response": {"interview", "rejected", "withdrawn"},
        "interview": {"offer", "rejected", "withdrawn"},
        "offer": {"withdrawn"},
        "rejected": set(),
        "withdrawn": set(),
    }
    packages: dict[str, ContentDigest] = {}
    last_at: datetime | None = None
    for event in events:
        require(
            ContentDigest(digest(event)) in authenticated_events,
            "outcome observation has no receiving-authenticated pin",
        )
        require(
            event.person == person and event.workspace == workspace,
            "foreign career outcome",
        )
        require(
            (last_at is None or last_at <= event.occurred_at)
            and event.occurred_at <= at,
            "outcome history is not chronological",
        )
        last_at = event.occurred_at
        require(
            event.job_id not in packages
            or packages[event.job_id] == event.package_sha256,
            "outcome history changed application package",
        )
        packages[event.job_id] = event.package_sha256
        require(
            event.kind in transitions[latest.get(event.job_id)],
            "invalid outcome transition; reconcile uncertainty before retry",
        )
        latest[event.job_id] = event.kind
        if event.kind in counts:
            counts[event.kind].add(event.job_id)
    return {
        "person": str(person),
        "workspace": workspace,
        "counts": {key: len(ids) for key, ids in counts.items()},
        "states": latest,
        "unknown_submissions": sum(
            value == "submit_unknown" for value in latest.values()
        ),
        "state": "OBSERVED" if events else "UNMEASURED",
        "authority_granted": False,
    }
