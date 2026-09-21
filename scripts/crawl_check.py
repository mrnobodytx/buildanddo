# ─── CGRF Header ──────────────────────────────
# File:        scripts/crawl_check.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CRAWL-001
# CAPS:        pending
# CK:          pending
# Dispatch:    USO-BUILDANDDO-CRAWL-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/web/src/lib/publicPages.js, apps/research/contracts.py, apps/research/transport.py
# EnumType:    Service
# EnumEdges:   CONSUMES apps/web/src/lib/publicPages.js; CONSUMES apps/research/transport.py; VALIDATES https://buildanddo.com
# DAG Node:    public.crawl.check
# Intent:      Produce bounded Firecrawl evidence that every canonical public page renders its required metadata and content.
# ───────────────────────────────

"""Verify canonical BuildAndDo public pages through the existing Firecrawl client."""

from __future__ import annotations

import argparse
import ast
import asyncio
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
import datetime as dt
import html
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.research.contracts import (  # noqa: E402
    Endpoint,
    ProcessorSettings,
    ResearchError,
    object_value,
    public_url,
)
from apps.research.transport import HttpClient  # noqa: E402

DEFAULT_PAGES_FILE = ROOT / "apps/web/src/lib/publicPages.js"
DEFAULT_OUTPUT = Path("reports/public-crawl.json")
DEFAULT_MINIMUM_CONTENT = 200
REQUIRED_PAGE_FIELDS = ("path", "title", "description", "type")
JAVASCRIPT_LITERAL = r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\""
PROPERTY_PATTERN = re.compile(
    rf"\b({'|'.join(REQUIRED_PAGE_FIELDS)})\s*:\s*({JAVASCRIPT_LITERAL})", re.DOTALL
)
ERROR_STATE_PATTERNS = (
    re.compile(r"(?im)^\s*#{0,3}\s*(?:404|500|502|503)\s*$"),
    re.compile(
        r"(?im)^\s*#{0,3}\s*(?:404|500|502|503)(?:\s*[-:]\s*|\s+)(?:page\s+)?(?:not found|error|unavailable)\s*[.!]?\s*$"
    ),
    re.compile(
        r"(?im)^\s*#{0,3}\s*(?:page not found|not found|internal server error|application error|service unavailable|something went wrong)\s*[.!]?\s*$"
    ),
    re.compile(
        r"(?im)^\s*(?:this page could not be found|web server is returning an unknown error)\s*[.!]?\s*$"
    ),
)
CLASSROOM_LESSON_MARKERS = ("start with a lesson", "lessons to explore", "field manual")
CLASSROOM_CTA_MARKERS = ("open your classrooms", "explore the lessons")

Guard = Callable[[object], str]


@dataclass(frozen=True)
class PublicPage:
    """Hold one canonical public-page contract."""

    path: str
    title: str
    description: str
    page_type: str


def _decode_javascript_string(literal: str) -> str:
    """Decode one quoted JavaScript catalogue value without executing JavaScript."""
    try:
        value = ast.literal_eval(literal)
    except (SyntaxError, ValueError):
        raise ResearchError("invalid_data") from None
    if not isinstance(value, str) or not value.strip():
        raise ResearchError("invalid_data")
    return value


def _balanced_entries(source: str, opening: int, start: str, end: str) -> list[str]:
    """Return top-level balanced entries while ignoring delimiters in strings."""
    depth = 0
    quote = ""
    escaped = False
    entry_start: int | None = None
    entries: list[str] = []
    for index in range(opening, len(source)):
        char = source[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = ""
            continue
        if char in {"'", '"', "`"}:
            quote = char
            continue
        if char == start:
            if depth == 0 and start == "{":
                entry_start = index
            depth += 1
        elif char == end:
            depth -= 1
            if depth < 0:
                raise ResearchError("invalid_data")
            if start == "{" and depth == 0 and entry_start is not None:
                entries.append(source[entry_start : index + 1])
                entry_start = None
            if start != "{" and depth == 0:
                return [source[opening : index + 1]]
    if start == "{" and depth == 0 and entries:
        return entries
    raise ResearchError("invalid_data")


def load_public_pages(path: Path = DEFAULT_PAGES_FILE) -> tuple[str, list[PublicPage]]:
    """Read the site origin and canonical page contracts from publicPages.js."""
    try:
        source = path.read_text(encoding="utf-8")
    except OSError:
        raise ResearchError("configuration") from None
    origin_match = re.search(rf"\bSITE_ORIGIN\s*=\s*({JAVASCRIPT_LITERAL})", source)
    pages_match = re.search(r"\bPUBLIC_PAGES\s*=\s*\[", source)
    if not origin_match or not pages_match:
        raise ResearchError("invalid_data")
    origin = _decode_javascript_string(origin_match.group(1)).rstrip("/")
    public_url(origin)
    array_region = _balanced_entries(source, pages_match.end() - 1, "[", "]")[0]
    objects = _balanced_entries(array_region, 0, "{", "}")
    pages: list[PublicPage] = []
    seen: set[str] = set()
    for entry in objects:
        properties = PROPERTY_PATTERN.findall(entry)
        values = {
            name: _decode_javascript_string(literal) for name, literal in properties
        }
        if len(properties) != len(REQUIRED_PAGE_FIELDS) or set(values) != set(
            REQUIRED_PAGE_FIELDS
        ):
            raise ResearchError("invalid_data")
        route = values["path"]
        if (
            not route.startswith("/")
            or route.startswith("//")
            or "?" in route
            or "#" in route
            or route in seen
        ):
            raise ResearchError("invalid_data")
        seen.add(route)
        pages.append(
            PublicPage(route, values["title"], values["description"], values["type"])
        )
    if not pages:
        raise ResearchError("invalid_data")
    return origin, pages


def configured_firecrawl(
    env: Mapping[str, str],
) -> tuple[ProcessorSettings, HttpClient]:
    """Build the existing Firecrawl transport from validated operator settings."""
    settings = ProcessorSettings.from_env(env)
    endpoint: Endpoint | None = settings.firecrawl
    if endpoint is None or not env.get("BUILDANDDO_FIRECRAWL_KEY", "").strip():
        raise ResearchError("configuration")
    client = HttpClient(
        endpoint, lambda: env.get("BUILDANDDO_FIRECRAWL_KEY", ""), bearer=True
    )
    return settings, client


def _normalized(value: str) -> str:
    """Normalize document metadata while preserving meaningful case and punctuation."""
    return re.sub(
        r"\s+", " ", unicodedata.normalize("NFKC", html.unescape(value))
    ).strip()


def _status(value: object) -> int | None:
    """Read a provider status code without accepting booleans or ambiguous values."""
    if type(value) is int and 100 <= value <= 599:
        return value
    if isinstance(value, str) and value.isdigit() and 100 <= int(value) <= 599:
        return int(value)
    return None


def _check(name: str, passed: bool, detail: str) -> dict[str, object]:
    """Build one stable validation result."""
    return {"name": name, "passed": passed, "detail": detail}


def failed_page(page: PublicPage, origin: str, reason: str) -> dict[str, object]:
    """Represent a bounded scrape or protocol failure for one page."""
    return {
        "path": page.path,
        "url": urljoin(origin + "/", page.path.lstrip("/")),
        "expected": {
            "title": page.title,
            "description": page.description,
            "type": page.page_type,
        },
        "actual": {
            "http_status": None,
            "title": "",
            "meta_description": "",
            "content_length": 0,
        },
        "checks": [_check("scrape_success", False, reason)],
        "failures": ["scrape_success"],
        "passed": False,
    }


def validate_page(
    page: PublicPage, origin: str, record: Mapping[str, object], minimum_content: int
) -> dict[str, object]:
    """Evaluate metadata, HTTP and rendered-content invariants for one page."""
    metadata_value = record.get("metadata", {})
    metadata = metadata_value if isinstance(metadata_value, dict) else {}
    markdown_value = record.get("markdown")
    markdown = markdown_value if isinstance(markdown_value, str) else ""
    title_value = metadata.get("title")
    title = _normalized(title_value) if isinstance(title_value, str) else ""
    description_value = metadata.get("description")
    description = (
        _normalized(description_value) if isinstance(description_value, str) else ""
    )
    status = _status(metadata.get("statusCode"))
    content = _normalized(markdown)
    provider_error = metadata.get("error")
    rendered_error = bool(provider_error) or any(
        pattern.search(markdown) for pattern in ERROR_STATE_PATTERNS
    )
    checks = [
        _check("scrape_success", True, "Firecrawl returned a structured scrape."),
        _check(
            "http_status",
            status == 200,
            f"Expected 200; received {status if status is not None else 'missing'}.",
        ),
        _check(
            "title_present",
            bool(title),
            "Title metadata is present." if title else "Title metadata is missing.",
        ),
        _check(
            "title_matches",
            title == _normalized(page.title),
            "Title matches the canonical catalogue."
            if title == _normalized(page.title)
            else "Title differs from the canonical catalogue.",
        ),
        _check(
            "meta_description",
            bool(description),
            "Meta description is present."
            if description
            else "Meta description is missing.",
        ),
        _check(
            "error_state_absent",
            not rendered_error,
            "No rendered error state detected."
            if not rendered_error
            else "Rendered error state detected.",
        ),
        _check(
            "minimum_content",
            len(content) >= minimum_content,
            f"Rendered content length is {len(content)}; minimum is {minimum_content}.",
        ),
    ]
    if page.path == "/classrooms":
        folded = content.casefold()
        lesson_markers = [
            marker for marker in CLASSROOM_LESSON_MARKERS if marker in folded
        ]
        cta_markers = [marker for marker in CLASSROOM_CTA_MARKERS if marker in folded]
        checks.extend(
            [
                _check(
                    "classrooms_lesson_content",
                    len(lesson_markers) >= 2,
                    f"Found {len(lesson_markers)} of {len(CLASSROOM_LESSON_MARKERS)} lesson markers.",
                ),
                _check(
                    "classrooms_ctas",
                    len(cta_markers) == len(CLASSROOM_CTA_MARKERS),
                    f"Found {len(cta_markers)} of {len(CLASSROOM_CTA_MARKERS)} required calls to action.",
                ),
            ]
        )
    failures = [str(check["name"]) for check in checks if check["passed"] is False]
    return {
        "path": page.path,
        "url": urljoin(origin + "/", page.path.lstrip("/")),
        "expected": {
            "title": page.title,
            "description": page.description,
            "type": page.page_type,
        },
        "actual": {
            "http_status": status,
            "title": title,
            "meta_description": description,
            "content_length": len(content),
        },
        "checks": checks,
        "failures": failures,
        "passed": not failures,
    }


async def crawl_pages(
    pages: Sequence[PublicPage],
    origin: str,
    settings: ProcessorSettings,
    client: HttpClient,
    minimum_content: int = DEFAULT_MINIMUM_CONTENT,
    guard: Guard = lambda value: public_url(value, resolve=True),
) -> dict[str, object]:
    """Scrape pages sequentially and continue after bounded per-page failures."""
    if settings.firecrawl is None or minimum_content < 1 or not pages:
        raise ResearchError("configuration")
    results: list[dict[str, object]] = []
    for page in pages:
        target = urljoin(origin + "/", page.path.lstrip("/"))
        try:
            guarded_target = await asyncio.to_thread(guard, target)
            response = await client.json(
                f"/{settings.firecrawl_version}/scrape",
                body={
                    "url": guarded_target,
                    "formats": ["markdown"],
                    "onlyMainContent": True,
                    "timeout": 30000,
                },
            )
            if response.get("success") is not True:
                raise ResearchError("unavailable")
            record = object_value(response.get("data"))
            results.append(validate_page(page, origin, record, minimum_content))
        except ResearchError as error:
            results.append(failed_page(page, origin, error.reason))
    passed = sum(result["passed"] is True for result in results)
    return {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "site_origin": origin,
        "firecrawl_version": settings.firecrawl_version,
        "minimum_content_length": minimum_content,
        "summary": {
            "status": "pass" if passed == len(results) else "fail",
            "total": len(results),
            "passed": passed,
            "failed": len(results) - passed,
        },
        "pages": results,
    }


def fatal_report(reason: str) -> dict[str, object]:
    """Build a structured report when checking cannot start."""
    return {
        "schema_version": 1,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "site_origin": "",
        "firecrawl_version": "",
        "minimum_content_length": 0,
        "summary": {"status": "fail", "total": 0, "passed": 0, "failed": 0},
        "pages": [],
        "fatal_error": reason,
    }


def write_report(report: Mapping[str, object], output: Path) -> None:
    """Write stable JSON evidence for CI artifact collection."""
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def report_exit_code(report: Mapping[str, object]) -> int:
    """Fail whenever startup or any page validation failed."""
    summary = report.get("summary")
    return int(not isinstance(summary, dict) or summary.get("status") != "pass")


async def _crawl_and_close(
    pages: Sequence[PublicPage],
    origin: str,
    settings: ProcessorSettings,
    client: HttpClient,
    minimum_content: int,
) -> dict[str, object]:
    """Keep transport shutdown on the event loop that performed its requests."""
    try:
        return await crawl_pages(pages, origin, settings, client, minimum_content)
    finally:
        await client.close()


def main(argv: Sequence[str] | None = None) -> int:
    """Run the public crawl check and persist its structured result."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--public-pages",
        type=Path,
        default=DEFAULT_PAGES_FILE,
        help="Path to the canonical publicPages.js catalogue.",
    )
    parser.add_argument(
        "--output", type=Path, default=DEFAULT_OUTPUT, help="JSON report path."
    )
    parser.add_argument(
        "--minimum-content",
        type=int,
        default=DEFAULT_MINIMUM_CONTENT,
        help="Minimum normalized rendered characters per page.",
    )
    args = parser.parse_args(argv)
    try:
        origin, pages = load_public_pages(args.public_pages)
        settings, client = configured_firecrawl(os.environ)
        report = asyncio.run(
            _crawl_and_close(pages, origin, settings, client, args.minimum_content)
        )
    except ResearchError as error:
        report = fatal_report(error.reason)
    write_report(report, args.output)
    print(json.dumps(report["summary"], sort_keys=True))
    return report_exit_code(report)


if __name__ == "__main__":
    raise SystemExit(main())
