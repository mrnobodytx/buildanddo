# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/discordbot/service.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-QUIZ-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-QUIZ-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/catalogue.py, scripts/discordbot/public_data.py, scripts/discordbot/grading.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON scripts/discordbot/catalogue.py; DEPENDS_ON scripts/discordbot/public_data.py; DEPENDS_ON scripts/discordbot/grading.py
# DAG Node:    none
# Intent:      Connect useful community commands to dated public evidence and the site's authored teaching content.
# ───────────────────────────────────────────────────────────────

"""Connect public Discord commands to the site's actual published source."""
from __future__ import annotations

import asyncio
from collections.abc import Callable, Collection
from datetime import datetime, timezone
import logging
import math
import time

from .catalogue import Catalogue, mapping, release_identity, text
from .contracts import (
    Caller, DataFault, DataUnavailable, DISPATCH, Limiter, Option, Page, Quiz, Reply,
    Settings, SITE_ORIGIN, SRS, paginate,
)
from .grading import Grader
from .public_data import Observation, PublicClient

logger = logging.getLogger("buildanddo.discord")

COMMANDS = {
    "help": "Browse the bot's commands and their purpose.",
    "start": "Follow a short guide to your first evidence-backed mission.",
    "ping": "Check whether this bot can respond.",
    "status": "Read the public site's HTTP reachability and observation time.",
    "release": "Read the version and source revision served by the public site.",
    "roadmap": "Read dated roadmap progress without inventing missing results.",
    "docs": "Search the site's public documentation and product pages.",
    "learn": "Search authored lessons, including government submissions, by topic or category.",
    "lesson": "Read a complete starter lesson in private pages.",
    "quiz": "Practice a lesson's knowledge check, graded by the site.",
    "workspace": "Open a workspace desk using your existing website permissions.",
    "support": "Find the product support and bug-reporting entry points.",
    "diagnostics": "Inspect bot scope and public-read counters as a server manager.",
}
# Members-only on the website; the bot shows the question and never grades these.
GOVERNMENT = "Government submissions"
WORKSPACE_AREAS = {
    "overview": ("Overview", "/app"),
    "missions": ("Missions", "/app/missions"),
    "workflows": ("Workflows", "/app/workflows"),
    "tutorials": ("Field Manual", "/app/tutorials"),
    "erp": ("ERP", "/app/erp"),
    "evidence": ("Evidence Ledger", "/app/evidence"),
    "research": ("Mission research", "/app/research"),
    "community": ("Community & Social", "/app/community"),
    "wiki": ("Workspace wiki", "/app/wiki"),
    "forums": ("Workspace forums", "/app/forums"),
    "integrations": ("Sinks & extensions", "/app/integrations"),
    "admin": ("Administration", "/app/admin"),
    "settings": ("Settings", "/app/settings"),
}

OUTCOME_EVENTS = frozenset({
    "discord.command.completed", "discord.command.dispatched", "discord.control.completed",
    "discord.research.command", "discord.dossier.command",
})
COMMAND_OUTCOMES = frozenset({
    "success", "denied", "rate_limited", "invalid", "unavailable", "unmeasured", "stale", "error", "cancelled",
    "delivered", "forbidden", "unsupported", "too_large", "unsafe_source", "conflict", "invalid_data",
    "confirmation", "timeout", "redirect", "http_error", "closed", "configuration",
})
CONTROL_ACTIONS = frozenset({"previous", "next", "close", "lesson_select", "quiz_answer"})
CONTROL_OUTCOMES = frozenset({"accepted", "rejected", "denied", "expired", "error", "cancelled"})


def log_outcome(
    event: str, operation: str, outcome: str, started: float, *,
    commands: Collection[str] = COMMANDS, clock: Callable[[], float] = time.monotonic,
) -> None:
    """Emit one bounded local outcome without letting the stderr sink alter application results."""
    if event not in OUTCOME_EVENTS:
        return
    control = event == "discord.control.completed"
    names = CONTROL_ACTIONS if control else commands
    outcomes = CONTROL_OUTCOMES if control else COMMAND_OUTCOMES
    fields: dict[str, object] = {
        "srs_code": SRS, "seat": "BITS-CODEGEN", "dispatch_id": DISPATCH,
        "control" if control else "command": operation if isinstance(operation, str) and operation in names else "unknown",
        "outcome": outcome if isinstance(outcome, str) and outcome in outcomes else "error",
    }
    try:
        elapsed = (clock() - started) * 1000
        if math.isfinite(elapsed):
            fields["duration_ms"] = min(2**53 - 1, max(0, round(elapsed)))
    except Exception:
        pass  # A failed timing observation must not suppress the outcome.
    try:
        logger.info(event, extra=fields)
    except Exception:
        pass  # Logging must not replace a reply, denial, cancellation or original exception.


def _time(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds")


def _note(observed: Observation) -> str:
    return ("Cached observation: " if observed.cached else "Observed: ") + _time(observed.observed_at)


def _number(value: object, maximum: float) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise DataUnavailable(DataFault.INVALID)
    number = float(value)
    if not math.isfinite(number) or not 0 <= number <= maximum:
        raise DataUnavailable(DataFault.INVALID)
    return f"{number:g}"


class CommandService:
    """Apply scope and traffic controls before performing any public request."""

    def __init__(
        self, settings: Settings, client: PublicClient,
        clock: Callable[[], float] = time.monotonic,
        utcnow: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        grader: Grader | None = None,
    ) -> None:
        self.settings, self.client = settings, client
        self.clock, self.utcnow = clock, utcnow
        self.grader = grader or Grader(None)
        self.limiter = Limiter()
        self._catalogue: Catalogue | None = None

    def permitted(self, caller: Caller) -> bool:
        """Check configured guild/channel scope without mapping Discord identity to an account."""
        return (
            not caller.is_bot and caller.guild_id is not None
            and (not self.settings.guild_ids or caller.guild_id in self.settings.guild_ids)
            and (not self.settings.channel_ids or caller.channel_id in self.settings.channel_ids)
        )

    def suggestions(self, query: str, caller: Caller) -> tuple[Option, ...]:
        """Autocomplete cached authored lessons without network calls or private reads."""
        if not self.permitted(caller) or self._catalogue is None or len(query) > 80:
            return ()
        return tuple(Option(item.title[:100], item.slug) for item in self._catalogue.search(query)[:25])

    async def execute(self, command: str, query: str, caller: Caller) -> Reply:
        """Return a safe result and emit only bounded command outcome/timing fields."""
        start = self.clock()
        name = command if command in COMMANDS else "unknown"
        outcome = "error"
        try:
            if not self.permitted(caller):
                outcome = "denied"
                return Reply((Page("Command unavailable here", "Use an allowed server and channel."),), outcome=outcome)
            delay = self.limiter.admit(caller, start)
            if delay:
                outcome = "rate_limited"
                return Reply((Page("Please wait", f"Try again in {delay} seconds."),), outcome=outcome)
            if len(query) > 80 or any(ord(char) < 32 and char not in "\t\n" for char in query):
                outcome = "invalid"
                return Reply((Page("Shorten the request", "Use a topic or desk name of at most 80 characters."),), outcome=outcome)
            if name == "unknown":
                outcome = "invalid"
                return Reply((Page("Unknown command", "Use /buildanddo help to browse the available commands."),), outcome=outcome)
            reply = await self._command(name, query.strip(), caller)
            outcome = reply.outcome
            return reply
        except DataUnavailable as error:
            outcome = "unavailable"
            return Reply((Page(
                "Public source unavailable",
                "BuildAndDo could not provide a usable public snapshot.\n"
                + "Reason: " + error.reason.value
                + "\nTry again shortly or open the site. No current result is inferred.",
                SITE_ORIGIN + ("/roadmap" if name == "roadmap" else "/docs"),
            ),), outcome=outcome)
        except asyncio.CancelledError:
            outcome = "cancelled"
            raise
        finally:
            log_outcome("discord.command.completed", name, outcome, start, clock=self.clock)

    async def grade(self, quiz: Quiz, choice: int, caller: Caller) -> tuple[Page, bool]:
        """Have the server grade one answer; log only the outcome, never the choice or the answer."""
        start = self.clock()
        outcome = "error"
        try:
            page, graded = await self.grader.grade(quiz, choice, caller)
            outcome = "graded" if graded else "unavailable"
            return page, graded
        finally:
            # Like log_outcome: a failing stderr sink must not replace the grade or its exception.
            try:
                logger.info("discord.quiz.graded", extra={
                    "srs_code": SRS, "seat": "BITS-CODEGEN", "dispatch_id": DISPATCH,
                    "command": "quiz", "outcome": outcome,
                    "duration_ms": max(0, round((self.clock() - start) * 1000)),
                })
            except Exception:
                pass

    async def _command(self, name: str, query: str, caller: Caller) -> Reply:
        if name == "help":
            content = "\n\n".join("/buildanddo " + key + "\n" + value for key, value in COMMANDS.items())
            return Reply(paginate("BuildAndDo commands", content, SITE_ORIGIN + "/docs"))
        if name == "start":
            return Reply((
                Page("Start with one small mission",
                     "1. Create an account and choose your workspace.\n"
                     "2. Read the Field Manual's first lesson.\n"
                     "3. Record one observation in Signals.\n"
                     "4. Propose a bounded mission with a measurable outcome and rollback.\n"
                     "5. Obtain the required approval before acting.\n"
                     "6. Record the attempt and review its evidence.\n\n"
                     "Use /buildanddo learn for guided practice.", SITE_ORIGIN + "/signup"),
            ))
        if name == "ping":
            return Reply((Page("Bot response", "This command reached the bot. Site health is checked separately with /buildanddo status."),))
        if name == "support":
            return Reply((Page(
                "Get help with BuildAndDo",
                "Open Contact for product questions, commercial inquiries or the GitHub issue link.\n\n"
                "For a bug, include the affected page, expected result, actual result and steps to reproduce. "
                "Use /buildanddo release for the site's reported version.\n\n"
                "This command opens the support entry point; it does not file a ticket.",
                SITE_ORIGIN + "/contact",
            ),))
        if name == "diagnostics":
            if not caller.manage_guild:
                return Reply((Page("Server manager access required", "Manage Server permission is required for bot diagnostics."),), outcome="denied")
            settings = self.settings
            scope = str(len(settings.guild_ids)) + " configured servers" if settings.guild_ids else "Installed servers"
            channels = str(len(settings.channel_ids)) + " configured channels" if settings.channel_ids else "Allowed server channels"
            return Reply((Page(
                "Bot diagnostics",
                "Scope: " + scope + "\nChannels: " + channels
                + "\nLegacy prefix: " + ("enabled" if settings.legacy_prefix else "disabled")
                + "\nCommand sync: " + settings.sync
                + f"\nPublic HTTP reads since start: {self.client.reads}"
                + f"\nPublic cache hits since start: {self.client.cache_hits}"
                + "\n\nThese are local bot counters. Workspace integration requests need a separately bound executor.",
                SITE_ORIGIN + "/app/integrations",
            ),))
        if name == "workspace":
            area = query.casefold() or "overview"
            if area not in WORKSPACE_AREAS:
                return Reply((Page("Choose a workspace desk", ", ".join(WORKSPACE_AREAS), SITE_ORIGIN + "/app"),))
            label, path = WORKSPACE_AREAS[area]
            return Reply((Page(
                label,
                "Open this desk in BuildAndDo and sign in. Your current workspace membership and role control access. "
                "The bot does not retrieve workspace records or grant permissions.",
                SITE_ORIGIN + path,
            ),))
        if name == "status":
            observed = await self.client.get("site")
            return Reply((Page(
                "Public site reachability",
                f"HTTP {observed.status} returned by {SITE_ORIGIN}/\n"
                f"HTTP request duration: {observed.elapsed_ms} ms\n\n"
                "This observes the public HTTP endpoint. It does not check authentication, workspace storage or private executors.",
                SITE_ORIGIN + "/", _note(observed),
            ),))
        if name == "release":
            observed = await self.client.get("release")
            version, sha = release_identity(observed.data)
            return Reply((Page(
                "Public site release",
                "Version: " + version + "\nSource revision: " + sha
                + "\n\nSource: " + SITE_ORIGIN + "/version.json",
                SITE_ORIGIN + "/", _note(observed),
            ),))
        if name == "roadmap":
            return await self._roadmap()
        return await self._learning(name, query)

    async def _roadmap(self) -> Reply:
        observed = await self.client.get("roadmap")
        source = mapping(observed.data)
        if source.get("state") != "MEASURED":
            return Reply((Page(
                "Roadmap unmeasured",
                "The public projection has no measured progress. Open the roadmap to inspect the plan.",
                SITE_ORIGIN + "/roadmap", _note(observed),
            ),), outcome="unmeasured")
        try:
            generated = datetime.fromisoformat(text(source.get("generated_at"), 80).replace("Z", "+00:00"))
            if generated.tzinfo is None or generated > self.utcnow():
                raise ValueError
        except ValueError:
            raise DataUnavailable(DataFault.INVALID) from None
        stale = (self.utcnow() - generated).total_seconds() > 48 * 3600
        day = source.get("sprint_day")
        if type(day) is not int or not 1 <= day <= 21:
            raise DataUnavailable(DataFault.INVALID)
        gate = source.get("gate_state")
        gate_text = text(gate, 60) if gate is not None else "Unknown"
        body = (
            "Generated: " + _time(generated) + f"\nSprint day: {day}"
            + "\nPlanned: " + _number(source.get("planned_pct"), 100) + "%"
            + "\nActual: " + _number(source.get("actual_pct"), 100) + "%"
            + "\nReported last gate: " + gate_text
            + ("\n\nThis snapshot is older than 48 hours; it does not establish current progress." if stale else "")
        )
        return Reply((Page(
            "Roadmap snapshot (stale)" if stale else "Roadmap snapshot",
            body, SITE_ORIGIN + "/roadmap", _note(observed),
        ),), outcome="stale" if stale else "success")

    async def _learning(self, name: str, query: str) -> Reply:
        observed = await self.client.get("catalogue")
        catalogue = Catalogue.parse(observed.data)
        self._catalogue = catalogue
        note = "Curriculum " + catalogue.curriculum_version + " | Site release " + catalogue.release_version
        if name == "docs":
            terms = query.casefold().split()
            pages = tuple(
                Page(item.label, item.description, SITE_ORIGIN + item.path, note)
                for item in catalogue.pages
                if all(term in (item.label + " " + item.description).casefold() for term in terms)
            )
            return Reply(pages or (Page("No matching public page", "Try a shorter topic or open Docs.", note=note),))
        found = catalogue.search(query)
        if name in {"lesson", "quiz"} and query and len(found) == 1:
            lesson = found[0]
            if name == "lesson":
                return Reply(lesson.reader(note))
            body = lesson.question + "\n\n" + "\n".join(
                f"{index + 1}. {choice}" for index, choice in enumerate(lesson.quiz.choices)
            )
            if lesson.category == GOVERNMENT:
                body += "\n\nGovernment lessons are graded on the website for current members."
                return Reply((Page(lesson.title, body, SITE_ORIGIN + "/app/tutorials", note),))
            return Reply((Page(lesson.title, body, note=note),), quiz=lesson.quiz)
        if not found:
            return Reply((Page("No matching lesson", "Search a topic such as missions, evidence, content or business.", note=note),))
        shown = found[:25]
        content = f"{len(found)} matching authored lessons.\nChoose a lesson below"
        content += " to practice its quiz." if name == "quiz" else " or use /buildanddo lesson with its title."
        if len(found) > len(shown):
            content += "\nThe first 25 are shown. Narrow the search for more."
        content += "\n\n" + "\n\n".join(
            item.title + f" | {item.minutes} min | " + item.category + "\n" + item.summary
            for item in shown
        )
        return Reply(
            paginate("BuildAndDo learning", content, SITE_ORIGIN + "/docs", note),
            tuple(Option(item.title[:100], item.slug) for item in shown),
            selection="quiz" if name == "quiz" else "lesson",
        )
