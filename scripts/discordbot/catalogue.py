# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/discordbot/catalogue.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/contracts.py, apps/web/tools/generate-community.mjs
# EnumType:    Service
# EnumEdges:   DEPENDS_ON scripts/discordbot/contracts.py; DEPENDS_ON apps/web/tools/generate-community.mjs
# DAG Node:    none
# Intent:      Reject malformed community feeds and render complete authored lessons without reading private records.
# ───────────────────────────────────────────────────────────────

"""Validate and present the site's deliberately public authored curriculum."""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import cast
from urllib.parse import urlsplit

from .contracts import DataFault, DataUnavailable, Page, Quiz, SITE_ORIGIN, paginate


def mapping(value: object) -> dict[str, object]:
    """Reject scalar, list and non-string-key data where an object is required."""
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise DataUnavailable(DataFault.INVALID)
    return cast(dict[str, object], value)


def text(value: object, maximum: int = 5000) -> str:
    """Validate bounded source text without interpreting it as markup."""
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise DataUnavailable(DataFault.INVALID)
    return value.strip()


def sequence(value: object, maximum: int = 20, minimum: int = 1) -> list[object]:
    """Validate a bounded source list."""
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise DataUnavailable(DataFault.INVALID)
    return cast(list[object], value)


def strings(value: object, maximum: int = 20, width: int = 5000) -> tuple[str, ...]:
    """Validate a bounded list of nonempty strings."""
    return tuple(text(item, width) for item in sequence(value, maximum))


def release_identity(value: object) -> tuple[str, str]:
    """Require the same complete release identity emitted by the web build."""
    source = mapping(value)
    version, sha = text(source.get("version"), 80), text(source.get("commit_sha"), 40)
    if (
        not re.fullmatch(r"[0-9]+\+[a-f0-9]{7}", version)
        or not re.fullmatch(r"[a-f0-9]{40}", sha)
        or not version.endswith("+" + sha[:7])
    ):
        raise DataUnavailable(DataFault.INVALID)
    return version, sha


def public_path(value: object) -> str:
    """Accept only public route paths in the documentation feed."""
    path = text(value, 120)
    if (
        not re.fullmatch(r"/(?:[a-z0-9-]+/?)*", path)
        or re.match(r"/(?:app|login|signup|forgot-password|onboarding|api|hcgi)(?:/|$)", path)
    ):
        raise DataUnavailable(DataFault.INVALID)
    return path


def reference_url(value: object) -> str:
    """Render authored references without fetching them or allowing active schemes."""
    url = text(value, 1000)
    if re.search(r"[\s\\<>]", url):
        raise DataUnavailable(DataFault.INVALID)
    if url.startswith("/") and not url.startswith("//"):
        return SITE_ORIGIN + url
    try:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError
    except ValueError:
        raise DataUnavailable(DataFault.INVALID) from None
    return url


@dataclass(frozen=True)
class PublicPage:
    """Describe one authored public page."""

    label: str
    description: str
    path: str


@dataclass(frozen=True)
class Lesson:
    """Keep a complete bounded lesson and its one knowledge check."""

    slug: str
    title: str
    summary: str
    category: str
    minutes: int
    parts: tuple[tuple[str, str], ...]
    question: str
    quiz: Quiz

    def reader(self, note: str) -> tuple[Page, ...]:
        """Paginate every authored section without retaining workspace data."""
        pages = tuple(
            page for heading, body in self.parts
            for page in paginate(heading, body, SITE_ORIGIN + "/docs", note)
        )
        if len(pages) > 80:
            raise DataUnavailable(DataFault.TOO_LARGE)
        return pages


def _lesson(value: object) -> Lesson:
    source = mapping(value)
    slug = text(source.get("slug"), 80)
    title = text(source.get("title"), 150)
    summary = text(source.get("summary"), 600)
    category = text(source.get("category"), 60)
    minutes = source.get("effort_minutes")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or type(minutes) is not int:
        raise DataUnavailable(DataFault.INVALID)
    if not 1 <= minutes <= 180:
        raise DataUnavailable(DataFault.INVALID)
    body = mapping(source.get("lesson"))
    if type(body.get("schema_version")) is not int or body["schema_version"] != 1:
        raise DataUnavailable(DataFault.INVALID)
    outcomes = strings(body.get("outcomes"))
    why = text(body.get("why"))
    preparation = strings(body.get("preparation"))
    parts = [
        (title, summary + "\n\n" + category + " | " + str(minutes) + " minutes"
         + "\n\nOutcomes\n" + "\n".join("- " + item for item in outcomes)),
        ("Why this matters", why),
        ("Prepare", "\n".join("- " + item for item in preparation)),
    ]
    for item in sequence(body.get("sections")):
        section = mapping(item)
        paragraphs = strings(section["paragraphs"]) if "paragraphs" in section else ()
        steps = strings(section["steps"]) if "steps" in section else ()
        if not paragraphs and not steps:
            raise DataUnavailable(DataFault.INVALID)
        content = "\n\n".join(paragraphs)
        if steps:
            content += "\n\n" + "\n".join(f"{index + 1}. {step}" for index, step in enumerate(steps))
        parts.append((text(section.get("heading"), 180), content))
    exercise = mapping(body.get("exercise"))
    parts.append((
        "Try the exercise",
        text(exercise.get("prompt")) + "\n\n" +
        "\n".join("- " + item for item in strings(exercise.get("checklist"))),
    ))
    references = []
    for item in sequence(body.get("references"), 12, 0):
        reference = mapping(item)
        references.append(text(reference.get("label"), 200) + "\n" + reference_url(reference.get("url")))
    if references:
        parts.append(("References", "\n\n".join(references)))
    check = mapping(body.get("check"))
    question = text(check.get("question"), 500)
    choices = strings(check.get("choices"), 6, 200)
    answer = check.get("answer")
    if len(choices) < 2 or type(answer) is not int or not 0 <= answer < len(choices):
        raise DataUnavailable(DataFault.INVALID)
    quiz = Quiz(choices, answer, text(check.get("explanation"), 1000))
    return Lesson(slug, title, summary, category, minutes, tuple(parts), question, quiz)


@dataclass(frozen=True)
class Catalogue:
    """Keep documentation and learning attached to the same served release."""

    curriculum_version: str
    release_version: str
    pages: tuple[PublicPage, ...]
    lessons: tuple[Lesson, ...]

    @classmethod
    def parse(cls, value: object) -> Catalogue:
        """Reject malformed or private-origin feed content before rendering it."""
        source = mapping(value)
        if (
            type(source.get("schema_version")) is not int or source["schema_version"] != 1
            or source.get("site_origin") != SITE_ORIGIN
        ):
            raise DataUnavailable(DataFault.INVALID)
        version, _ = release_identity(source.get("release"))
        pages = []
        for item in sequence(source.get("pages")):
            entry = mapping(item)
            pages.append(PublicPage(
                text(entry.get("label"), 80), text(entry.get("description"), 600),
                public_path(entry.get("path")),
            ))
        lessons = tuple(_lesson(item) for item in sequence(source.get("lessons"), 100))
        if len({lesson.slug for lesson in lessons}) != len(lessons):
            raise DataUnavailable(DataFault.INVALID)
        if len({page.path for page in pages}) != len(pages):
            raise DataUnavailable(DataFault.INVALID)
        return cls(text(source.get("curriculum_version"), 40), version, tuple(pages), lessons)

    def search(self, query: str) -> tuple[Lesson, ...]:
        """Match title, category, summary or slug using bounded literal words."""
        normalized = query.strip().casefold()
        exact = tuple(item for item in self.lessons if item.slug == normalized or item.title.casefold() == normalized)
        if exact:
            return exact
        words = normalized.split()
        return tuple(
            item for item in self.lessons
            if all(word in (item.title + " " + item.category + " " + item.slug + " " + item.summary).casefold()
                   for word in words)
        )
