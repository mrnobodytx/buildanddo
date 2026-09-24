# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/development_sources.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEVELOPMENT-LOOP-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/event.py, libs/evolution/common.py, libs/evolution/store.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/evolution/event.py; CONSUMES libs/evolution/common.py; CONSUMES libs/evolution/store.py
# Intent:      Feed repository-authenticated development observations into the existing journal without treating workflow status as test truth.
# ───────────────────────────────────────────────────────────────

"""Read one bounded repository run through the configured, authenticated CLI."""

from __future__ import annotations

import hashlib
import re
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

from libs.semantic_twin.contracts import Contract, ContractError, require, text
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState

from .common import decode_json, digest, identity, mapping, timestamp
from .event import CitadelEvent, Phase, SourceKind
from .store import Journal

MAX_RESPONSE_BYTES = 4_000_000
MAX_JOBS = 100
RepositoryReader = Callable[[tuple[str, ...]], bytes]


class SourceUnavailable(ContractError):
    """Identify a missing receiving transport without exposing its credentials."""


def repository_name(value: str) -> str:
    """Accept an explicit GitHub owner/repository, never a URL or command option."""
    require(
        bool(
            re.fullmatch(
                r"[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*", value
            )
        ),
        "expected owner/repository",
    )
    return value


def repository_read(argv: tuple[str, ...]) -> bytes:
    """Use existing CLI authentication for a fixed read; never obtain or print tokens."""
    require(
        len(argv) == 5
        and argv[:4] == ("gh", "api", "--method", "GET")
        and re.fullmatch(
            r"repos/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/actions/runs/[1-9][0-9]*(?:/attempts/[1-9][0-9]*/jobs\?per_page=100)?",
            argv[4],
        )
        is not None,
        "repository reader only permits bounded workflow GETs",
    )
    try:
        result = subprocess.run(argv, capture_output=True, timeout=45, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SourceUnavailable("repository CLI read unavailable") from exc
    if result.returncode:
        # Provider stderr may include session configuration; retain no such bytes.
        raise SourceUnavailable(
            "repository CLI read failed; no observation was inferred"
        )
    require(
        len(result.stdout) <= MAX_RESPONSE_BYTES, "repository response exceeds bound"
    )
    return result.stdout


def _payload(raw: str) -> dict[str, object]:
    require(0 < len(raw.encode()) <= MAX_RESPONSE_BYTES, "invalid capture size")
    return mapping(decode_json(raw))


def _integer(value: object, name: str) -> int:
    require(type(value) is int and value > 0, name + " must be a positive integer")
    assert isinstance(value, int)
    return value


@dataclass(frozen=True, slots=True)
class GitHubRunCapture(Contract):
    """Retain exact response bytes; a saved copy does not authenticate itself."""

    repository: str
    run_id: int
    attempt: int
    observed_at: datetime
    run_response: str
    jobs_response: str | None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        repository_name(self.repository)
        _integer(self.run_id, "run id")
        _integer(self.attempt, "attempt")
        run = self.run
        _integer(run.get("id"), "response run id")
        _integer(run.get("run_attempt"), "response attempt")
        require(
            run.get("id") == self.run_id and run.get("run_attempt") == self.attempt,
            "run or attempt differs from selected source",
        )
        require(
            mapping(run.get("repository")).get("full_name") == self.repository,
            "repository response crossed the selected scope",
        )
        require(
            run.get("html_url")
            == f"https://github.com/{self.repository}/actions/runs/{self.run_id}",
            "run URL differs from selected source",
        )
        require(isinstance(run.get("head_sha"), str), "missing source revision")
        SourceRevision(str(run["head_sha"]))
        created, updated = (
            timestamp(run.get("created_at")),
            timestamp(run.get("updated_at")),
        )
        require(created <= updated <= self.observed_at, "invalid provider chronology")
        text(str(run.get("status") or ""), "provider status")
        if run["status"] == "completed":
            text(str(run.get("conclusion") or ""), "completed run conclusion")
        if self.jobs_response is not None:
            data = _payload(self.jobs_response)
            jobs = data.get("jobs")
            require(isinstance(jobs, list), "missing job observations")
            assert isinstance(jobs, list)
            require(
                type(data.get("total_count")) is int
                and data["total_count"] == len(jobs)
                and len(jobs) <= MAX_JOBS,
                "job capture is incomplete or exceeds the bound",
            )
            ids: set[int] = set()
            for raw in jobs:
                job = mapping(raw)
                _integer(job.get("run_id"), "job run id")
                _integer(job.get("run_attempt"), "job attempt")
                job_id = _integer(job.get("id"), "job id")
                require(job_id not in ids, "duplicate provider job")
                ids.add(job_id)
                require(
                    job.get("run_id") == self.run_id
                    and job.get("run_attempt") == self.attempt
                    and job.get("head_sha") == run["head_sha"],
                    "job does not belong to selected run/attempt/revision",
                )
                steps = job.get("steps")
                require(
                    isinstance(steps, list) and len(steps) <= 1000, "invalid job steps"
                )
                assert isinstance(steps, list)
                numbers: set[int] = set()
                for value in steps:
                    step = mapping(value)
                    number = _integer(step.get("number"), "step number")
                    require(number not in numbers, "duplicate job step")
                    numbers.add(number)
                    for field in ("started_at", "completed_at"):
                        if step.get(field) is not None:
                            require(
                                timestamp(step[field]) <= self.observed_at,
                                "future job step",
                            )

    @property
    def run(self) -> dict[str, object]:
        """Decode retained source bytes with duplicate-key rejection."""
        return _payload(self.run_response)

    @property
    def capture_id(self) -> SemanticId:
        """Address the exact scope, run attempt, responses and observation time."""
        return identity("observation", self)

    def event(
        self, *, scope_id: str, expected_sha: str, ingested_at: datetime
    ) -> CitadelEvent:
        """Project provider facts as observations with explicit missing test assurance."""
        run = self.run
        require(
            run["head_sha"] == expected_sha,
            "provider run has a different candidate SHA",
        )
        jobs = []
        if self.jobs_response is not None:
            raw_jobs = _payload(self.jobs_response)["jobs"]
            assert isinstance(raw_jobs, list)
            for raw in raw_jobs:
                job = mapping(raw)
                raw_steps = job["steps"]
                assert isinstance(raw_steps, list)
                jobs.append(
                    {
                        "id": job["id"],
                        "name": job.get("name"),
                        "status": job.get("status"),
                        "conclusion": job.get("conclusion"),
                        "steps": [
                            {
                                k: mapping(step).get(k)
                                for k in (
                                    "number",
                                    "name",
                                    "status",
                                    "conclusion",
                                    "started_at",
                                    "completed_at",
                                )
                            }
                            for step in raw_steps
                        ],
                    }
                )
        return CitadelEvent(
            scope_id=scope_id,
            occurred_at=timestamp(run["updated_at"]),
            observed_at=self.observed_at,
            ingested_at=ingested_at,
            mission_id=None,
            correlation_id=f"github:{self.repository}:{self.run_id}:{self.attempt}",
            actor_id=SemanticId("cni://service/github-actions"),
            event_type="development.workflow_observed",
            subject_id=identity(
                "workflow", (self.repository, self.run_id, self.attempt)
            ),
            subject_version=digest(self),
            source_sha=expected_sha,
            source_kind=SourceKind.TEST,
            source_ref=str(run["html_url"]),
            source_digest=ContentDigest(
                hashlib.sha256(self.run_response.encode()).hexdigest()
            ),
            evidence_state=EvidenceState.OBSERVED,
            authority=AuthorityTier.A0,
            risk="read_only_provider_observation",
            phase=Phase.CONTEXT,
            evidence_refs=(str(self.capture_id),),
            data={
                "provider": "github",
                "repository": self.repository,
                "run_id": self.run_id,
                "attempt": self.attempt,
                "workflow": run.get("name"),
                "status": run["status"],
                "conclusion": run.get("conclusion"),
                "jobs": jobs,
                "jobs_observed": self.jobs_response is not None,
                "test_outcomes": "UNMEASURED",
                "assurance": "Provider status is not a test result, independent review or deployment receipt.",
            },
        )


def collect_github_run(
    repository: str,
    run_id: int,
    attempt: int,
    *,
    reader: RepositoryReader = repository_read,
) -> GitHubRunCapture:
    """Capture a caller-selected run attempt through existing repository authentication."""
    repository_name(repository)
    _integer(run_id, "run id")
    _integer(attempt, "attempt")
    endpoint = f"repos/{repository}/actions/runs/{run_id}"
    command = ("gh", "api", "--method", "GET")
    run = reader((*command, endpoint))
    try:
        try:
            jobs: str | None = reader(
                (*command, endpoint + f"/attempts/{attempt}/jobs?per_page=100")
            ).decode("utf-8")
        except SourceUnavailable:
            jobs = None
        return GitHubRunCapture(
            repository,
            run_id,
            attempt,
            datetime.now(timezone.utc),
            run.decode("utf-8"),
            jobs,
        )
    except UnicodeError as exc:
        raise ContractError("provider returned non-UTF-8 JSON") from exc


def ingest_run(
    journal: Journal,
    capture: GitHubRunCapture,
    *,
    repository: str,
    candidate: str,
    at: datetime,
) -> CitadelEvent:
    """Bind a captured source to independently selected repository, scope and revision."""
    require(
        capture.repository == repository_name(repository),
        "unexpected capture repository",
    )
    event = capture.event(
        scope_id=journal.scope_id, expected_sha=candidate, ingested_at=at
    )
    journal.put_events((event,))
    return event
