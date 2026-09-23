# ─── CGRF Header ──────────────────────────────
# File:        apps/career/sources.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/evidence.py, apps/career/jobs.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/career/jobs.py; CONSUMES public ATS job boards; PRODUCES apps/career/jobs.py
# DAG Node:    none
# Intent:      Normalize public Lever, Greenhouse and Ashby job-board feeds into canonical jobs with read-only, opt-in fetching.
# ─────────────────────────────────────────────────────────────

"""Discover jobs from public ATS job-board feeds (J0, read-only).

Only three public posting endpoints are reachable and only over HTTPS GET.
Nothing here authenticates, applies or writes. Requirements are taken from
bulleted items under recognised section headings; a posting without a
requirement section is skipped and reported rather than guessed at.
"""

from __future__ import annotations

import html
import json
import re
import urllib.error
import urllib.request
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any

from apps.career.evidence import CareerError
from apps.career.jobs import Job, normalize_job

ENDPOINTS: dict[str, str] = {
    "lever": "https://api.lever.co/v0/postings/{board}?mode=json",
    "greenhouse": "https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true",
    "ashby": "https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true",
}
MAX_BYTES = 20 * 1024 * 1024
_BOARD = re.compile(r"^[A-Za-z0-9._-]{1,100}$")

REQUIREMENT_HEADINGS = (
    "requirements", "qualifications", "minimum qualifications", "basic qualifications",
    "required qualifications", "what you'll bring", "what you will bring", "what you bring",
    "you have", "must have", "must haves", "what we're looking for", "what we are looking for",
    "about you", "who you are", "skills",
)
PREFERRED_HEADINGS = (
    "preferred", "preferred qualifications", "nice to have", "nice to haves", "bonus",
    "bonus points", "pluses", "extra credit",
)
RESPONSIBILITY_HEADINGS = (
    "responsibilities", "what you'll do", "what you will do", "the role", "in this role",
    "your impact", "key responsibilities",
)
_BLOCK = {"p", "div", "br", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section"}
_BULLET = re.compile(r"^\s*(?:[-*\u2022\u25cf\u25aa\u2013]|\d+[.)])\s+")


class _Lines(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.lines: list[str] = []
        self.current: list[str] = []
        self.bullet = False
        self.heading = False

    def _flush(self) -> None:
        text = " ".join("".join(self.current).split())
        if text:
            prefix = "- " if self.bullet else ("# " if self.heading else "")
            self.lines.append(prefix + text)
        self.current, self.bullet, self.heading = [], False, False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _BLOCK:
            self._flush()
        self.bullet = self.bullet or tag == "li"
        self.heading = self.heading or tag in {"h1", "h2", "h3", "h4", "h5", "h6", "strong", "b"}

    def handle_endtag(self, tag: str) -> None:
        if tag in _BLOCK:
            self._flush()

    def handle_data(self, data: str) -> None:
        self.current.append(data)


def html_lines(markup: str) -> list[str]:
    """Flatten HTML into lines; list items start with '- ' and headings with '# '."""
    parser = _Lines()
    parser.feed(markup)
    parser.close()
    parser._flush()
    return parser.lines


def text_lines(plain: str) -> list[str]:
    """Split plain text into lines; bullet markers become '- '."""
    lines: list[str] = []
    for line in plain.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        lines.append("- " + _BULLET.sub("", stripped) if _BULLET.match(stripped) else stripped)
    return lines


def _heading_kind(line: str) -> str | None:
    text = line.lstrip("# ").strip().rstrip(":").strip().lower().replace("\u2019", "'")
    if len(text) > 60:
        return None
    for kind, names in (("preferred", PREFERRED_HEADINGS), ("requirements", REQUIREMENT_HEADINGS),
                        ("responsibilities", RESPONSIBILITY_HEADINGS)):
        if any(text == name or text.startswith(name + " ") or text.endswith(" " + name) for name in names):
            return kind
    return None


def sections(lines: Iterable[str]) -> dict[str, list[str]]:
    """Collect bullet items under requirement, preferred and responsibility headings."""
    found: dict[str, list[str]] = {"requirements": [], "preferred": [], "responsibilities": []}
    current: str | None = None
    for line in lines:
        kind = _heading_kind(line) if not line.startswith("- ") else None
        if kind is not None:
            current = kind
            continue
        if line.startswith("- "):
            if current is not None:
                found[current].append(line[2:].strip())
        elif line.startswith("# ") or len(line) <= 60:
            current = None
    return found


def _epoch_ms(value: Any) -> str | None:
    if isinstance(value, (int, float)) and value > 0:
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    return None


def _job(kind: str, board: str, native_id: str, fields: dict[str, Any], parts: dict[str, list[str]]) -> dict[str, Any]:
    return {
        "job_id": f"{kind}:{board}:{native_id}",
        "company": board,
        "source": f"{kind}:{board}",
        "application_system": kind,
        "requirements": parts["requirements"],
        "preferred": parts["preferred"],
        "responsibilities": parts["responsibilities"],
        "technologies": [],
        **fields,
    }


def lever_jobs(payload: Any, board: str) -> list[dict[str, Any]]:
    """Map a Lever postings list to raw job objects."""
    if not isinstance(payload, list):
        raise CareerError("lever payload must be a list")
    jobs: list[dict[str, Any]] = []
    for item in payload:
        lines: list[str] = []
        for block in item.get("lists") or []:
            lines.append("# " + str(block.get("text") or ""))
            lines.extend(line if line.startswith("- ") else "- " + line
                         for line in html_lines(str(block.get("content") or "")) if not line.startswith("# "))
        lines.extend(text_lines(str(item.get("descriptionPlain") or "")))
        categories = item.get("categories") or {}
        jobs.append(_job("lever", board, str(item.get("id") or ""), {
            "role": str(item.get("text") or ""),
            "location": categories.get("location"),
            "seniority": None,
            "source_updated_at": _epoch_ms(item.get("createdAt")),
            "apply_url": item.get("applyUrl") or item.get("hostedUrl"),
            "compensation": {},
        }, sections(lines)))
    return jobs


def greenhouse_jobs(payload: Any, board: str) -> list[dict[str, Any]]:
    """Map a Greenhouse job-board response to raw job objects."""
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
        raise CareerError("greenhouse payload must hold a jobs list")
    jobs: list[dict[str, Any]] = []
    for item in payload["jobs"]:
        content = html.unescape(str(item.get("content") or ""))
        location = item.get("location") or {}
        jobs.append(_job("greenhouse", board, str(item.get("id") or ""), {
            "role": str(item.get("title") or ""),
            "location": location.get("name") if isinstance(location, dict) else None,
            "seniority": None,
            "source_updated_at": item.get("updated_at"),
            "apply_url": item.get("absolute_url"),
            "compensation": {},
        }, sections(html_lines(content))))
    return jobs


def ashby_jobs(payload: Any, board: str) -> list[dict[str, Any]]:
    """Map an Ashby job-board response to raw job objects."""
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
        raise CareerError("ashby payload must hold a jobs list")
    jobs: list[dict[str, Any]] = []
    for item in payload["jobs"]:
        markup = item.get("descriptionHtml")
        lines = html_lines(str(markup)) if markup else text_lines(str(item.get("descriptionPlain") or ""))
        native = str(item.get("id") or str(item.get("jobUrl") or "").rstrip("/").rsplit("/", 1)[-1])
        compensation = item.get("compensation") or {}
        summary = compensation.get("compensationTierSummary") if isinstance(compensation, dict) else None
        jobs.append(_job("ashby", board, native, {
            "role": str(item.get("title") or ""),
            "location": item.get("location"),
            "seniority": None,
            "source_updated_at": item.get("publishedAt"),
            "apply_url": item.get("applyUrl") or item.get("jobUrl"),
            "compensation": {"summary": summary} if summary else {},
        }, sections(lines)))
    return jobs


MAPPERS: dict[str, Callable[[Any, str], list[dict[str, Any]]]] = {
    "lever": lever_jobs,
    "greenhouse": greenhouse_jobs,
    "ashby": ashby_jobs,
}


def endpoint(kind: str, board: str) -> str:
    """Return the public posting endpoint for a board; reject anything else."""
    if kind not in ENDPOINTS:
        raise CareerError(f"unsupported job source {kind!r}")
    if not _BOARD.match(board):
        raise CareerError("board name must be a plain slug")
    return ENDPOINTS[kind].format(board=board)


def fetch_json(url: str, *, timeout: float = 20.0) -> Any:
    """GET a public JSON document from an allow-listed endpoint."""
    if not any(url.startswith(template.split("{board}")[0]) for template in ENDPOINTS.values()):
        raise CareerError("url is not an allow-listed public job board")
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "buildanddo-career/1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - allow-listed https
            body = response.read(MAX_BYTES + 1)
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise CareerError(f"cannot fetch {url}") from error
    if len(body) > MAX_BYTES:
        raise CareerError("job board response exceeds the size limit")
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CareerError("job board response is not JSON") from error


@dataclass(slots=True)
class Discovery:
    """Hold normalized jobs and every posting that was skipped, with why."""

    jobs: list[Job] = field(default_factory=list)
    skipped: list[dict[str, str]] = field(default_factory=list)


def discover(kind: str, board: str, payload: Any) -> Discovery:
    """Normalize a board payload; skip postings without extractable requirements."""
    endpoint(kind, board)
    result = Discovery()
    seen: set[str] = set()
    for raw in MAPPERS[kind](payload, board):
        if not raw["requirements"]:
            result.skipped.append({"job_id": raw["job_id"], "role": raw["role"],
                                   "reason": "no requirement section found"})
            continue
        try:
            job = normalize_job(raw)
        except CareerError as error:
            result.skipped.append({"job_id": raw["job_id"], "role": raw["role"], "reason": str(error)})
            continue
        if job.job_id in seen:
            result.skipped.append({"job_id": job.job_id, "role": job.role, "reason": "duplicate job id"})
            continue
        seen.add(job.job_id)
        result.jobs.append(job)
    return result


def diff_jobs(previous: Iterable[dict[str, Any]], current: Iterable[Job]) -> dict[str, list[str]]:
    """Compare a previous discovery with the current one by job id and digest."""
    before = {str(item["job_id"]): str(item.get("digest", "")) for item in previous}
    after = {job.job_id: job.digest for job in current}
    return {
        "added": sorted(set(after) - set(before)),
        "removed": sorted(set(before) - set(after)),
        "changed": sorted(key for key in set(after) & set(before) if after[key] != before[key]),
        "unchanged": sorted(key for key in set(after) & set(before) if after[key] == before[key]),
    }
