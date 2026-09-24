# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/discordbot/grading.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-QUIZ-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-QUIZ-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     apps/research/transport.py, apps/pocketbase/pb_hooks/community-quiz.pb.js, scripts/discordbot/contracts.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES apps/research/transport.py; CONSUMES apps/pocketbase/pb_hooks/community-quiz.pb.js; DEPENDS_ON scripts/discordbot/contracts.py
# DAG Node:    none
# Intent:      Grade practice answers on the server so the bot never holds or publishes a lesson's answer.
# ───────────────────────────────────────────────────────────────

"""Ask the configured PocketBase server whether one practice answer is right."""
from __future__ import annotations

from collections.abc import Mapping

from apps.research.contracts import Endpoint, ResearchError
from apps.research.transport import BoundedIO, HttpClient
from scripts.discordbot.contracts import Caller, Page, Quiz, SITE_ORIGIN

TOKEN_VARIABLE = "BUILDANDDO_COMMUNITY_BOT_TOKEN"
MINIMUM_TOKEN = 32
ROUTE = "/api/buildanddo/community/quiz/check"
LESSONS = SITE_ORIGIN + "/app/tutorials"
PRACTICE = "\n\nPractice only. Progress is saved through your signed-in BuildAndDo workspace."
UNAVAILABLE = Page(
    "Grading unavailable",
    "Quiz grading is unavailable right now, so this answer was not graded. "
    "Try again later, or take the lesson's knowledge check on the website.",
    LESSONS,
)
REFUSALS = {
    403: Page("Graded on the website", "Government lessons are graded on the website for current members.", LESSONS),
    404: Page("Lesson not gradable", "This lesson is not available for community grading. Open it on the website.", LESSONS),
    429: Page("Please wait", "Too many answers for now. Review the lesson and try again in a few minutes.", LESSONS),
}


class Grader:
    """Send one answer to the server; no answer or explanation is kept before it is earned."""

    def __init__(self, client: HttpClient | None) -> None:
        self.client = client

    async def grade(self, quiz: Quiz, choice: int, caller: Caller) -> tuple[Page, bool]:
        """Return the reply page and whether the server actually graded the answer."""
        if self.client is None:
            return UNAVAILABLE, False
        try:
            result = await self.client.json(
                ROUTE, body={"slug": quiz.slug, "choice": choice, "discord_user_id": str(caller.user_id)},
            )
            correct = result.get("correct")
            if correct is False:
                # The server sends nothing that points at the right choice; neither does this reply.
                return Page("Knowledge check", "Not the expected answer. Review the lesson, then run the quiz again." + PRACTICE, LESSONS), True
            explanation = result.get("explanation")
            if correct is not True or not isinstance(explanation, str) or not explanation.strip() or len(explanation) > 1500:
                return UNAVAILABLE, False
            return Page("Knowledge check", "Correct.\n\n" + explanation.strip() + PRACTICE, LESSONS), True
        except ResearchError as error:
            return REFUSALS.get(error.status, UNAVAILABLE), False

    async def close(self) -> None:
        """Drain the bounded transport on shutdown."""
        if self.client is not None:
            await self.client.close()


def configured_grader(env: Mapping[str, str]) -> Grader:
    """Grade only with an explicit server URL and a long enough token; otherwise say grading is unavailable."""
    token = env.get(TOKEN_VARIABLE, "").strip()
    if len(token) < MINIMUM_TOKEN:
        return Grader(None)
    try:
        endpoint = Endpoint(env.get("BUILDANDDO_POCKETBASE_URL", ""))
    except ResearchError:
        return Grader(None)
    return Grader(HttpClient(endpoint, lambda: token, bearer=True, io=BoundedIO(slots=2, deadline=10), timeout=8))
