# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/discordbot/contracts.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# EnumType:    Service
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# DAG Node:    none
# Intent:      Bound bot configuration, replies and personal interactions without granting workspace authority.
# ───────────────────────────────────────────────────────────────

"""Define public command boundaries independent of the Discord SDK."""
from __future__ import annotations

from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
import math
import re
import time
from typing import Literal

SITE_ORIGIN = "https://buildanddo.tech"
SRS = "SRS-BUILDANDDO-UPGRADE-001"
DISPATCH = "VCC-BUILDANDDO-UPGRADE-001"
SESSION_SECONDS = 600


class CitadelError(Exception):
    """Represent an expected application failure."""


class ConfigurationError(CitadelError):
    """Reject invalid non-secret bot configuration."""


class InteractionDenied(CitadelError):
    """Reject another person's, expired or repeated interaction."""


class DataFault(str, Enum):
    """Name bounded failures without retaining remote content."""

    UNAVAILABLE = "unavailable"
    TIMEOUT = "timeout"
    REDIRECT = "redirect"
    HTTP = "http_error"
    INVALID = "invalid_data"
    TOO_LARGE = "too_large"
    CLOSED = "closed"


class DataUnavailable(CitadelError):
    """Describe a public read failure with a safe reason."""

    def __init__(self, reason: DataFault) -> None:
        self.reason = reason
        super().__init__(reason.value)


@dataclass(frozen=True)
class Settings:
    """Hold public bot preferences without the token."""

    guild_ids: frozenset[int] = frozenset()
    channel_ids: frozenset[int] = frozenset()
    legacy_prefix: bool = False
    sync: Literal["none", "guild", "global"] = "none"

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> Settings:
        """Validate optional scope and deliberate registration controls."""

        def ids(name: str) -> frozenset[int]:
            raw = env.get(name, "").strip()
            if not raw:
                return frozenset()
            parts = raw.split(",")
            if len(parts) > 100 or any(
                not re.fullmatch(r"[1-9][0-9]{16,19}", part.strip())
                or int(part.strip()) >= 2**64 for part in parts
            ):
                raise ConfigurationError("Configured Discord IDs must be valid snowflakes.")
            return frozenset(int(part.strip()) for part in parts)

        prefix = env.get("BUILDANDDO_DISCORD_LEGACY_PREFIX", "0").strip().lower()
        if prefix not in {"0", "1", "true", "false"}:
            raise ConfigurationError("Legacy prefix mode must be 0 or 1.")
        sync = env.get("BUILDANDDO_DISCORD_SYNC", "none").strip().lower()
        if sync not in {"none", "guild", "global"}:
            raise ConfigurationError("Command synchronization must be none, guild or global.")
        guilds = ids("BUILDANDDO_DISCORD_GUILD_IDS")
        channels = ids("BUILDANDDO_DISCORD_CHANNEL_IDS")
        if sync == "guild" and not guilds:
            raise ConfigurationError("Guild synchronization needs an explicit guild allowlist.")
        if channels and not guilds:
            raise ConfigurationError("A channel allowlist needs an explicit guild allowlist.")
        mode: Literal["none", "guild", "global"] = "none"
        if sync == "guild":
            mode = "guild"
        elif sync == "global":
            mode = "global"
        return cls(guilds, channels, prefix in {"1", "true"}, mode)


@dataclass(frozen=True)
class Caller:
    """Carry transient command scope; never write it to logs."""

    user_id: int
    guild_id: int | None
    channel_id: int | None
    is_bot: bool = False
    manage_guild: bool = False


@dataclass(frozen=True)
class Page:
    """Hold plain text that will be escaped at the Discord boundary."""

    title: str
    body: str
    url: str = SITE_ORIGIN + "/docs"
    note: str = ""

    def __post_init__(self) -> None:
        if not self.title or len(self.title) > 180 or len(self.body) > 1900:
            raise ValueError("A reply exceeds the public response budget.")
        if (
            not self.url.startswith(SITE_ORIGIN + "/")
            or re.search(r"[\s\\<>]", self.url)
            or len(self.url) > 500
            or len(self.note) > 200
        ):
            raise ValueError("A reply has an invalid public destination or note.")


@dataclass(frozen=True)
class Option:
    """Identify an authored lesson, never an executable instruction."""

    label: str
    value: str


@dataclass(frozen=True)
class Quiz:
    """Hold one authored knowledge check without saved progress."""

    choices: tuple[str, ...]
    answer: int
    explanation: str


@dataclass(frozen=True)
class Reply:
    """Describe a bounded reader or knowledge check."""

    pages: tuple[Page, ...]
    options: tuple[Option, ...] = ()
    quiz: Quiz | None = None
    outcome: str = "success"
    selection: Literal["lesson", "quiz"] = "lesson"

    def __post_init__(self) -> None:
        if not self.pages or len(self.pages) > 80 or len(self.options) > 25:
            raise ValueError("A reply has too many pages or choices.")


def paginate(title: str, text: str, url: str, note: str = "") -> tuple[Page, ...]:
    """Preserve a long lesson in bounded plain-text pages."""
    remaining = text.strip()
    pages: list[Page] = []
    while remaining:
        split = min(1800, len(remaining))
        if split < len(remaining):
            boundary = remaining.rfind("\n", 0, split)
            if boundary > 900:
                split = boundary
        pages.append(Page(title[:180], remaining[:split], url, note))
        remaining = remaining[split:].lstrip()
    return tuple(pages or [Page(title[:180], "No additional text.", url, note)])


class Limiter:
    """Bound per-person work, aggregate traffic and retained identities."""

    def __init__(self, per_user: int = 6, total: int = 60, window: float = 30.0) -> None:
        self.per_user, self.total, self.window = per_user, total, window
        self._users: dict[tuple[int | None, int], deque[float]] = {}
        self._all: deque[float] = deque()

    def admit(self, caller: Caller, now: float) -> int:
        """Return zero when admitted or the bounded retry delay."""
        cutoff = now - self.window
        for key in list(self._users):
            queue = self._users[key]
            while queue and queue[0] <= cutoff:
                queue.popleft()
            if not queue:
                del self._users[key]
        while self._all and self._all[0] <= cutoff:
            self._all.popleft()
        key = (caller.guild_id, caller.user_id)
        queue = self._users.get(key, deque())
        if len(self._all) >= self.total:
            return max(1, math.ceil(self._all[0] + self.window - now))
        if len(queue) >= self.per_user:
            return max(1, math.ceil(queue[0] + self.window - now))
        # The aggregate budget also bounds this map, including at window edges.
        queue.append(now)
        self._users[key] = queue
        self._all.append(now)
        return 0


class PersonalSession:
    """Enforce ownership, expiry and one answer even during overlapping callbacks."""

    def __init__(self, owner: int, reply: Reply, *, now: float | None = None) -> None:
        self.owner, self.reply = owner, reply
        self.expires_at = (time.monotonic() if now is None else now) + SESSION_SECONDS
        self.index = 0
        self.answered = False
        self._answer_choice: int | None = None
        self._answer_page: Page | None = None

    def check(self, user: int, now: float) -> None:
        """Reject foreign and expired interaction state."""
        if user != self.owner:
            raise InteractionDenied("These controls belong to the person who opened them.")
        if now >= self.expires_at:
            raise InteractionDenied("These controls expired. Run the command again.")

    def move(self, user: int, step: int, now: float) -> Page:
        """Move within the existing reader without wrapping or fetching."""
        self.check(user, now)
        self.index = max(0, min(self.index + step, len(self.reply.pages) - 1))
        return self.reply.pages[self.index]

    def answer(self, user: int, choice: int, now: float) -> Page:
        """Explain one submitted answer without advancing a mission or lesson record."""
        self.check(user, now)
        quiz = self.reply.quiz
        if self.answered and choice == self._answer_choice and self._answer_page is not None:
            return self._answer_page
        if self.answered or quiz is None or not 0 <= choice < len(quiz.choices):
            raise InteractionDenied("This knowledge check cannot accept another answer.")
        self.answered = True
        correct = choice == quiz.answer
        body = (
            ("Correct.\n\n" if correct else "Review the explanation.\n\n")
            + "Answer: " + quiz.choices[quiz.answer] + "\n\n" + quiz.explanation
            + "\n\nPractice only. Progress is saved through your signed-in BuildAndDo workspace."
        )
        self._answer_choice = choice
        self._answer_page = Page("Knowledge check", body, SITE_ORIGIN + "/docs")
        return self._answer_page
