# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/career_passport/jobs.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/models.py, libs/evolution/common.py, libs/semantic_twin/contracts.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/career_passport/models.py; CONSUMES libs/evolution/common.py; CONSUMES libs/semantic_twin/contracts.py
# Intent:      Retain bounded public ATS observations and literal requirement coverage without granting application API access.
# ───────────────────────────────────────────────────────────────

"""Read public postings and preserve the limits of deterministic extraction."""

from __future__ import annotations

import hashlib
import re
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Literal
from urllib.parse import urlsplit

from libs.evolution.common import decode_json, digest, mapping, timestamp, unique
from libs.semantic_twin.contracts import Contract, ContractError, require

from .models import bounded_text

MAX_FEED_BYTES = 4_000_000
MAX_JOBS = 1000
MAX_JOB_AGE_SECONDS = 7 * 86400
CAPABILITIES = {
    "python": r"\bpython\b",
    "javascript": r"\bjavascript\b|\bnode\.?js\b",
    "typescript": r"\btypescript\b",
    "react": r"\breact(?:\.js)?\b",
    "go": r"\bgolang\b|\bGo\b",
    "sql": r"\bsql\b",
    "postgresql": r"\bpostgres(?:ql)?\b",
    "distributed_systems": r"\bdistributed systems?\b",
    "event_architecture": r"\bevent.driven\b",
    "nats": r"\bnats\b",
    "kafka": r"\bkafka\b",
    "cicd": r"\bci/cd\b|\bcontinuous (?:integration|delivery|deployment)\b",
    "gitlab_ci": r"\bgitlab (?:ci|runners?)\b",
    "observability": r"\bobservability\b",
    "datadog": r"\bdatadog\b",
    "kubernetes": r"\bkubernetes\b|\bk8s\b",
    "cloud_infrastructure": r"\bcloud infrastructure\b",
    "aws": r"\baws\b",
    "azure": r"\bazure\b",
    "gcp": r"\bgcp\b",
    "security": r"\bsecurity\b",
    "nist": r"\bnist\b",
    "owasp": r"\bowasp\b",
    "testing": r"\btesting\b|\btevv\b|\btest automation\b",
    "ai_infrastructure": r"\bai infrastructure\b|\bllm infrastructure\b|\bmodel serving\b",
    "architecture_leadership": r"\barchitecture leadership\b|\blead (?:technical|architecture|engineering)\b",
    "flink": r"\bflink\b",
}
HUMAN_FIELDS = (
    "work_authorization",
    "security_clearance",
    "criminal_history",
    "salary_commitment",
    "relocation_commitment",
    "contract_acceptance",
    "background_check_consent",
    "disability",
    "veteran_status",
    "demographics",
    "binding_attestation",
)
HUMAN_PATTERN = re.compile(
    r"\b(?:work authori[sz]|visa|sponsorship|citizen|security clearance|criminal|background check|"
    r"salary expectation|salary requirement|compensation expectation|relocat|consent|"
    r"disabilit|veteran|race\b|ethnic|gender|demograph|legally|attest|sign.{0,20}contract)",
    re.I,
)
# This deliberately small grammar establishes only literal skill/role/scope
# requirements. Unknown technologies, proficiency levels, scales or qualifiers
# remain review work instead of disappearing after the first keyword match.
GRAMMAR_WORDS = frozenset(
    "a an the and with in of for to must required require requirements should preferred bonus nice have has experience knowledge skill skills using use know implement implemented implementing implementation develop developing development code coding programming operate operating operations design designing architecture architect lead leading leadership review reviewing verify verifying validation outcome outcomes systems system service services hands on production test testing technical".split()
)


def _unparsed_qualifier(clause: str) -> bool:
    remaining = clause
    for key, pattern in CAPABILITIES.items():
        remaining = re.sub(pattern, " ", remaining, flags=0 if key == "go" else re.I)
    return any(
        word.lower() not in GRAMMAR_WORDS for word in re.findall(r"[\w+]+", remaining)
    )


class FeedUnavailable(ContractError):
    """Report an unavailable public feed without retaining provider error bodies."""


class _Text(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self.hidden += 1
        if tag in ("li", "p", "br", "h1", "h2", "h3", "h4", "div"):
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)
        if tag in ("li", "p", "h1", "h2", "h3", "h4", "div"):
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.hidden:
            self.parts.append(data)


def plain_text(content: str) -> str:
    """Strip executable markup while retaining paragraph and list boundaries."""
    require(len(content) <= 200_000, "posting text exceeds bound")
    parser = _Text()
    parser.feed(content)
    return "\n".join(
        " ".join(line.split())
        for line in "".join(parser.parts).splitlines()
        if line.strip()
    )


@dataclass(frozen=True, slots=True)
class Board(Contract):
    """Select one public ATS tenant independently of any returned URL."""

    provider: Literal["lever", "ashby"]
    board: str
    company: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,99}", self.board) is not None,
            "invalid ATS board",
        )
        bounded_text(self.company, "company", 160)

    def endpoint(self, offset: int = 0) -> str:
        """Build only the provider's public posting GET endpoint."""
        require(type(offset) is int and 0 <= offset <= MAX_JOBS, "invalid feed offset")
        if self.provider == "lever":
            return f"https://api.lever.co/v0/postings/{self.board}?mode=json&limit=100&skip={offset}"
        require(offset == 0, "Ashby feed is not paginated")
        return f"https://api.ashbyhq.com/posting-api/job-board/{self.board}?includeCompensation=true"


@dataclass(frozen=True, slots=True)
class Requirement(Contract):
    """Keep the exact normalized excerpt and extraction uncertainty visible."""

    quote: str
    importance: Literal["required", "preferred", "responsibility", "unclassified"]
    kind: Literal["capability", "duration", "human", "hard", "unparsed"]
    capabilities: tuple[str, ...]
    combination: Literal["all", "review"]
    scope: tuple[str, ...]
    participation: Literal["hands_on", "leadership", "review", "any"]

    @property
    def id(self) -> str:
        """Bind requirement identity to the excerpt and every extraction decision."""
        return digest(self)


def extract_requirements(source: str) -> tuple[Requirement, ...]:
    """Extract literal clauses; alternatives and unknown wording require review."""
    result: list[Requirement] = []
    section: Literal["required", "preferred", "responsibility", "unclassified"] = (
        "unclassified"
    )
    headings = {
        "required": r"^(?:requirements|qualifications|required qualifications|what you(?:'|’)ll bring|what you bring|minimum qualifications|you have|about you)\s*:?$",
        "preferred": r"^(?:preferred qualifications|preferred|nice to have|bonus|bonus points)\s*:?$",
        "responsibility": r"^(?:responsibilities|what you(?:'|’)ll do|the role|your impact)\s*:?$",
    }
    require(len(source) <= 200_000, "normalized posting exceeds bound")
    for line in source.splitlines():
        line = line.strip()
        if not line:
            continue
        heading = next(
            (
                key
                for key, pattern in headings.items()
                if re.fullmatch(pattern, line, re.I)
            ),
            None,
        )
        if heading is not None:
            # Literal constructors below preserve the closed importance vocabulary.
            section = {
                "required": "required",
                "preferred": "preferred",
                "responsibility": "responsibility",
            }[heading]  # type: ignore[assignment]
            continue
        for clause in re.split(r"(?<=[.;])\s+(?=[A-Z0-9])", line):
            require(
                len(clause) <= 6000 and len(result) < 200,
                "requirement extraction exceeds bound",
            )
            importance = section
            if re.search(r"\b(?:preferred|nice to have|bonus)\b", clause, re.I):
                importance = "preferred"
            elif re.search(r"\b(?:must|required|minimum)\b", clause, re.I):
                importance = "required"
            capabilities = tuple(
                k
                for k, pattern in CAPABILITIES.items()
                if re.search(pattern, clause, 0 if k == "go" else re.I)
            )
            kind: Literal["capability", "duration", "human", "hard", "unparsed"] = (
                "capability" if capabilities else "unparsed"
            )
            if re.search(
                r"\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty)\s*(?:\+|to\s+\d+|-\s*\d+)?\s*years?\b",
                clause,
                re.I,
            ):
                kind = "duration"
            elif HUMAN_PATTERN.search(clause):
                kind = "human"
            elif re.search(
                r"\b(?:degree|bachelor|master|ph\.?d|certifi(?:cation|ed)|licen[sc]e)\b",
                clause,
                re.I,
            ):
                kind = "hard"
            scope = (
                ("production",) if re.search(r"\bproduction\b", clause, re.I) else ()
            )
            participation: Literal["hands_on", "leadership", "review", "any"] = "any"
            hands_on = bool(
                re.search(
                    r"hands.on|implement|develop|coding|programming|operate",
                    clause,
                    re.I,
                )
            )
            leadership = bool(re.search(r"\blead|\bdesign|\barchitect", clause, re.I))
            review = bool(re.search(r"\breview|\bverif|\bvalidat", clause, re.I))
            if hands_on:
                participation = "hands_on"
            elif leadership:
                participation = "leadership"
            elif review:
                participation = "review"
            combination: Literal["all", "review"] = (
                "review"
                if re.search(r"\bor\b|and/or", clause, re.I)
                or _unparsed_qualifier(clause)
                or sum((hands_on, leadership, review)) > 1
                else "all"
            )
            result.append(
                Requirement(
                    clause,
                    importance,
                    kind,
                    capabilities,
                    combination,
                    scope,
                    participation,
                )
            )
    # Duplicate source paragraphs must not inflate coverage.
    return tuple({r.id: r for r in result}.values())


@dataclass(frozen=True, slots=True)
class Job(Contract):
    """Retain one source observation, not an employer's verified eligibility decision."""

    board: Board
    posting_id: str
    role: str
    location: str
    compensation: object
    source_url: str
    apply_url: str
    captured_at: datetime
    source_updated_at: datetime | None
    source_sha256: str
    source_text: str
    requirements: tuple[Requirement, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            re.fullmatch(r"[A-Za-z0-9_-]{1,100}", self.posting_id) is not None,
            "invalid posting id",
        )
        for name in ("role", "location"):
            bounded_text(getattr(self, name), name, 500)
        expected_host = (
            "jobs.lever.co" if self.board.provider == "lever" else "jobs.ashbyhq.com"
        )
        for url in (self.source_url, self.apply_url):
            parts = urlsplit(url)
            require(
                parts.scheme == "https"
                and parts.netloc == expected_host
                and not parts.query
                and not parts.fragment,
                "posting URL crossed the selected ATS",
            )
            expected = f"/{self.board.board}/{self.posting_id}"
            require(
                parts.path
                in (expected, expected + "/apply", expected + "/application"),
                "posting URL crossed the selected board/id",
            )
        require(
            re.fullmatch(r"[a-f0-9]{64}", self.source_sha256) is not None,
            "missing feed hash",
        )
        require(
            self.source_updated_at is None
            or self.source_updated_at <= self.captured_at,
            "future posting update",
        )
        require(
            self.requirements == extract_requirements(self.source_text),
            "requirements differ from source extraction",
        )

    @property
    def id(self) -> str:
        """Keep identity stable across observations, with separate content revisions."""
        return f"{self.board.provider}:{self.board.board}:{self.posting_id}"

    @property
    def revision(self) -> str:
        """Bind matching, applications and consent to the exact posting capture."""
        return digest(self)


def normalize_feed(
    board: Board, raw: bytes, *, captured_at: datetime
) -> tuple[Job, ...]:
    """Normalize retained public responses without silently skipping malformed rows."""
    require(
        0 < len(raw) <= MAX_FEED_BYTES and captured_at.tzinfo is not None,
        "invalid feed capture",
    )
    data = decode_json(raw)
    rows = data if board.provider == "lever" else mapping(data).get("jobs")
    require(
        isinstance(rows, list) and len(rows) <= MAX_JOBS,
        "invalid or oversized posting list",
    )
    assert isinstance(rows, list)
    output = []
    for value in rows:
        row = mapping(value)
        if board.provider == "ashby" and row.get("isListed") is False:
            continue
        if board.provider == "lever":
            body = str(row.get("descriptionPlain") or row.get("description") or "")
            lists = row.get("lists", [])
            require(
                isinstance(lists, list) and len(lists) <= 30, "invalid Lever sections"
            )
            assert isinstance(lists, list)
            for section in lists:
                item = mapping(section)
                body += (
                    "\n"
                    + str(item.get("text", ""))
                    + "\n"
                    + str(item.get("content", ""))
                )
            body += "\n" + str(
                row.get("additionalPlain") or row.get("additional") or ""
            )
            updated = row.get("updatedAt")
            require(
                updated is None
                or type(updated) is int
                and 0 <= updated <= 253402300799000,
                "invalid Lever update time",
            )
            when = (
                datetime.fromtimestamp(updated / 1000, timezone.utc)
                if isinstance(updated, int)
                else None
            )
            job_id, title = row.get("id"), row.get("text")
            categories = mapping(row.get("categories", {}))
            location = categories.get("location") or "Unspecified"
            source_url, apply_url = row.get("hostedUrl"), row.get("applyUrl")
        else:
            body = str(row.get("descriptionHtml") or row.get("descriptionPlain") or "")
            # publishedAt is not last-updated time; leave the latter unknown.
            when = timestamp(row["updatedAt"]) if row.get("updatedAt") else None
            source_url, apply_url = row.get("jobUrl"), row.get("applyUrl")
            job_id = urlsplit(str(source_url)).path.rstrip("/").split("/")[-1]
            title, location = row.get("title"), row.get("location") or "Unspecified"
        require(
            all(
                isinstance(v, str)
                for v in (job_id, title, location, source_url, apply_url)
            ),
            "posting is missing required fields",
        )
        normalized = plain_text(body)
        require(bool(normalized), "posting has no requirements text")
        output.append(
            Job(
                board,
                str(job_id),
                str(title),
                str(location),
                row.get("compensation") or row.get("salaryRange"),
                str(source_url),
                str(apply_url),
                captured_at,
                when,
                hashlib.sha256(raw).hexdigest(),
                normalized,
                extract_requirements(normalized),
            )
        )
    unique(tuple(job.id for job in output), "posting id")
    return tuple(output)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self, req: object, fp: object, code: int, msg: str, headers: object, newurl: str
    ) -> None:
        raise FeedUnavailable("public posting redirects require source review")


def public_get(url: str) -> bytes:
    """Read an allowlisted public feed without credentials, redirects or writes."""
    require(
        re.fullmatch(
            r"https://api\.lever\.co/v0/postings/[A-Za-z0-9_-]+\?mode=json&limit=100&skip=\d+|https://api\.ashbyhq\.com/posting-api/job-board/[A-Za-z0-9_-]+\?includeCompensation=true",
            url,
        )
        is not None,
        "only public posting endpoints are allowed",
    )
    opener = urllib.request.build_opener(_NoRedirect())
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "BuildAndDo-Career/1"},
        method="GET",
    )
    try:
        with opener.open(request, timeout=20) as response:
            require(response.status == 200, "posting GET did not succeed")
            raw = response.read(MAX_FEED_BYTES + 1)
    except (OSError, urllib.error.URLError) as error:
        raise FeedUnavailable(
            "public posting GET unavailable; no jobs inferred"
        ) from error
    require(
        isinstance(raw, bytes) and len(raw) <= MAX_FEED_BYTES,
        "public feed exceeds bound",
    )
    assert isinstance(raw, bytes)
    return raw


@dataclass(frozen=True, slots=True)
class Discovery:
    """Keep partial source failures and raw captures alongside deduplicated jobs."""

    jobs: tuple[Job, ...]
    captures: tuple[tuple[str, bytes], ...]
    gaps: tuple[str, ...]
    target: int


def discover(
    boards: tuple[Board, ...],
    *,
    at: datetime,
    target: int = 100,
    transport: Callable[[str], bytes] = public_get,
) -> Discovery:
    """Collect a bounded job batch without concealing missing providers or quotas."""
    require(
        0 < len(boards) <= 30 and type(target) is int and 1 <= target <= MAX_JOBS,
        "invalid discovery bounds",
    )
    unique(tuple(b.provider + ":" + b.board for b in boards), "board")
    jobs: dict[str, Job] = {}
    captures: list[tuple[str, bytes]] = []
    gaps = []
    for board in boards:
        for offset in range(0, MAX_JOBS, 100):
            if len(jobs) >= target:
                break
            url = board.endpoint(offset)
            try:
                raw = transport(url)
                found = normalize_feed(board, raw, captured_at=at)
                captures.append((url, raw))
                for job in found:
                    if job.id in jobs and jobs[job.id].revision != job.revision:
                        raise ContractError(
                            "conflicting posting revisions during discovery"
                        )
                    if len(jobs) < target:
                        jobs[job.id] = job
                if board.provider == "ashby" or len(found) < 100:
                    break
                if offset == MAX_JOBS - 100:
                    gaps.append(board.board + ": source pagination bound reached")
            except (ContractError, OSError):
                gaps.append(
                    board.provider
                    + ":"
                    + board.board
                    + ": feed unavailable or invalid; retained jobs are partial"
                )
                break
    if len(jobs) < target:
        gaps.append(f"Requested {target} jobs; observed {len(jobs)} unique postings.")
    return Discovery(
        tuple(sorted(jobs.values(), key=lambda j: j.id)),
        tuple(captures),
        tuple(gaps),
        target,
    )
