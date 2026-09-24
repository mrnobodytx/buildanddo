# --- CGRF Header ------------------------------------------------
# File:        tests/upgrade/test_discordbot_telemetry.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/discordbot/service.py, scripts/discordbot/bot.py, tests/upgrade/test_discordbot_adapter.py, tests/upgrade/discord_sdk_double.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/discordbot/service.py; VALIDATES scripts/discordbot/bot.py; CONSUMES tests/upgrade/test_discordbot_adapter.py; CONSUMES tests/upgrade/discord_sdk_double.py
# Intent:      Verify personless command and control outcomes with synthetic permissions, clocks and transports without SDK login or hosting claims.
# ----------------------------------------------------------------

"""Exercise actual command/control logic through the existing offline SDK boundary."""
from __future__ import annotations

import asyncio
import json
import logging
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

from apps.research.contracts import ResearchError
from scripts.discordbot import service as service_module
from scripts.discordbot.contracts import Caller, DataFault, DataUnavailable, Option, Page, Quiz, Reply, Settings
from scripts.discordbot.dossier import DOSSIER_COMMANDS
from scripts.discordbot.public_data import PublicClient
from scripts.discordbot.research import RESEARCH_COMMANDS
from scripts.discordbot.service import (
    COMMANDS, COMMAND_OUTCOMES, CONTROL_ACTIONS, CONTROL_OUTCOMES, OUTCOME_EVENTS, log_outcome,
)
from tests.upgrade.test_discordbot_adapter import ADAPTER, NATIVE_SDK, interaction

USER, GUILD, CHANNEL, FOREIGN = 11111111111111111, 22222222222222222, 33333333333333333, 44444444444444444


def events(captured: object, name: str | None = None) -> list[dict[str, object]]:
    """Inspect the existing JSON stderr formatter rather than a vendor client."""
    rows = [json.loads(ADAPTER.EventFormatter().format(record)) for record in captured.records]
    return [row for row in rows if name is None or row["event"] == name]


class OutcomeContractTests(unittest.TestCase):
    def test_event_command_and_control_enums_are_closed(self) -> None:
        self.assertEqual(OUTCOME_EVENTS, {
            "discord.command.completed", "discord.command.dispatched", "discord.control.completed",
            "discord.research.command", "discord.dossier.command", "discord.quiz.graded",
        })
        self.assertEqual(CONTROL_ACTIONS, {"previous", "next", "close", "lesson_select", "quiz_answer"})
        self.assertEqual(CONTROL_OUTCOMES, {"accepted", "rejected", "denied", "expired", "error", "cancelled"})
        self.assertEqual((len(COMMANDS), len(RESEARCH_COMMANDS), len(DOSSIER_COMMANDS)), (13, 7, 5))
        self.assertEqual(len(COMMAND_OUTCOMES), 22)
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            for label, names in (("discord.command.completed", COMMANDS), ("discord.command.dispatched", COMMANDS),
                                 ("discord.research.command", RESEARCH_COMMANDS), ("discord.dossier.command", DOSSIER_COMMANDS)):
                for command in names:
                    log_outcome(label, command, "success", 1.0, commands=names, clock=lambda: 1.025)
            for control in CONTROL_ACTIONS:
                for outcome in CONTROL_OUTCOMES:
                    log_outcome("discord.control.completed", control, outcome, 1.0, clock=lambda: 1.025)
            for outcome in COMMAND_OUTCOMES:
                log_outcome("discord.command.completed", "ping", outcome, 1.0, clock=lambda: 1.025)
        rows = events(captured)
        self.assertEqual(len(rows), 90)
        for row in rows:
            self.assertEqual(row["duration_ms"], 25)
            self.assertEqual(set(row), {"event", "level", "srs_code", "seat", "dispatch_id", "outcome", "duration_ms",
                                        "control" if row["event"] == "discord.control.completed" else "command"})

    def test_unknown_values_and_failed_measurement_never_log_private_payloads(self) -> None:
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            log_outcome("discord.command.completed", "PRIVATE_COMMAND", "PRIVATE_OUTCOME", 1, clock=lambda: 0)
            log_outcome("discord.control.completed", "PRIVATE_CONTROL", {"PRIVATE_BODY": "PRIVATE_PROSE"}, 1,
                        clock=Mock(side_effect=RuntimeError("PRIVATE_CLOCK")))
            log_outcome("discord.command.completed", "ping", "error", 1, clock=lambda: float("nan"))
            log_outcome("PRIVATE_EVENT", "PRIVATE_COMMAND", "PRIVATE_OUTCOME", 1)
        rows = events(captured)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["command"], "unknown")
        self.assertEqual(rows[0]["duration_ms"], 0)
        self.assertEqual(rows[1]["control"], "unknown")
        self.assertTrue(all(row["outcome"] == "error" for row in rows))
        self.assertNotIn("duration_ms", rows[1])
        self.assertNotIn("duration_ms", rows[2])
        self.assertNotIn("PRIVATE_", str([record.__dict__ for record in captured.records]))

    def test_formatter_closes_strings_and_rejects_unapproved_fields_and_numbers(self) -> None:
        for duration in [True, -1, float("nan"), float("inf"), 2**53, "PRIVATE_DURATION", {"PRIVATE": 1}]:
            record = logging.LogRecord("buildanddo.discord", logging.INFO, "", 0, "PRIVATE_MESSAGE %s", ("PRIVATE_ARGUMENT",),
                                       (RuntimeError, RuntimeError("PRIVATE_EXCEPTION"), None))
            record.command, record.control, record.outcome, record.reason = "PRIVATE_COMMAND", "PRIVATE_CONTROL", "success", "PRIVATE_REASON"
            record.duration_ms, record.guild_count = duration, duration
            record.user_id, record.channel_id, record.guild_id = USER, CHANNEL, GUILD
            record.username, record.content, record.question, record.answer = "PRIVATE_USER", "PRIVATE_CONTENT", "PRIVATE_QUESTION", "PRIVATE_ANSWER"
            record.getMessage = Mock(side_effect=AssertionError("Do not interpolate log prose."))
            row = json.loads(ADAPTER.EventFormatter().format(record))
            self.assertEqual(row["event"], "discord.event.unknown")
            self.assertEqual((row["command"], row["control"], row["outcome"], row["reason"]), ("unknown", "unknown", "error", "unknown"))
            self.assertNotIn("duration_ms", row)
            self.assertNotIn("guild_count", row)
            self.assertNotIn("PRIVATE_", json.dumps(row))
            for value in (USER, CHANNEL, GUILD):
                self.assertNotIn(str(value), json.dumps(row))


class DiscordTelemetryTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls) -> None:
        print("Discord telemetry boundary: " + ("native SDK objects; mocked transport, no login" if NATIVE_SDK
                                                else "existing SDK double; native serialization unavailable"))

    async def asyncSetUp(self) -> None:
        self.now = 100.0
        self.clock = patch.object(ADAPTER, "time", SimpleNamespace(monotonic=lambda: self.now))
        self.clock.start()
        self.addCleanup(self.clock.stop)
        self.reader = Mock(side_effect=AssertionError("No HTTP is allowed in telemetry tests."))
        self.client = PublicClient(self.reader)
        self.bot = ADAPTER.BuildAndDoBot(Settings(), self.client)
        self.addAsyncCleanup(self.bot.close)
        self.service = self.bot.service
        self.service.clock = lambda: self.now
        def grade_response(_route: str, *, body: dict[str, object]) -> dict[str, object]:
            return {"correct": True, "explanation": "PRIVATE_EXPLANATION"} if body["choice"] == 1 else {"correct": False}
        self.grading = SimpleNamespace(json=AsyncMock(side_effect=grade_response), close=AsyncMock())
        self.service.grader = ADAPTER.Grader(self.grading)
        self.caller = Caller(USER, GUILD, CHANNEL)
        self.items = []

    async def asyncTearDown(self) -> None:
        for item in self.items:
            for call in item.edit_original_response.await_args_list:
                view = call.kwargs.get("view")
                if view is not None:
                    view.stop()
        self.reader.assert_not_called()

    def request(self, *, user: int = USER, guild: int | None = GUILD) -> object:
        item = interaction(user, guild, CHANNEL)
        item.user.name = "PRIVATE_USERNAME"
        item.id = 55555555555555555
        self.items.append(item)
        return item

    def reader_view(self, control: str) -> object:
        reply = Reply((Page("PRIVATE_PAGE", "PRIVATE_BODY"), Page("PRIVATE_NEXT_PAGE", "PRIVATE_NEXT_BODY")))
        if control == "lesson_select":
            reply = Reply(reply.pages, options=(Option("PRIVATE_LESSON", "PRIVATE_SLUG"),))
        elif control == "quiz_answer":
            reply = Reply((Page("PRIVATE_QUESTION", "PRIVATE_PROMPT"),), quiz=Quiz("PRIVATE_SLUG", ("PRIVATE_CHOICE_A", "PRIVATE_CHOICE_B")))
        view = ADAPTER.ReplyView(self.service, self.caller, reply)
        view.session.expires_at = self.now + 600
        if control == "previous":
            view.session.index = 1
            view.refresh()
        self.addCleanup(view.stop)
        for name, item in (("previous", view.previous), ("next", view.next_page), ("close", view.close_reader)):
            item.custom_id = "PRIVATE_COMPONENT_" + name
        for item in view.children:
            if isinstance(item, ADAPTER.LessonSelect):
                item.custom_id = "PRIVATE_COMPONENT_lesson_select"
            elif isinstance(item, ADAPTER.QuizSelect):
                item.custom_id = "PRIVATE_COMPONENT_quiz_answer"
        return view

    async def dispatch(self, view: object, control: str, item: object) -> None:
        if control == "previous":
            await view.previous.callback(item)
        elif control == "next":
            await view.next_page.callback(item)
        elif control == "close":
            await view.close_reader.callback(item)
        elif control == "lesson_select":
            await view.select_lesson(item, "PRIVATE_SLUG")
        else:
            await view.answer(item, 1)

    def assert_private_free(self, captured: object) -> None:
        raw = str([record.__dict__ for record in captured.records])
        self.assertNotIn("PRIVATE_", raw)
        for value in (USER, GUILD, CHANNEL, FOREIGN, 55555555555555555):
            self.assertNotIn(str(value), raw)
        for row in events(captured):
            self.assertGreaterEqual(row.get("duration_ms", 0), 0)

    async def test_service_results_preserve_reply_identity_and_original_exceptions(self) -> None:
        reply = Reply((Page("PRIVATE_TITLE", "PRIVATE_CONTENT"),), outcome="PRIVATE_OUTCOME")
        failure = RuntimeError("PRIVATE_EXCEPTION")
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            with patch.object(self.service, "_command", new=AsyncMock(return_value=reply)):
                self.assertIs(await self.service.execute("docs", "PRIVATE_QUERY", self.caller), reply)
            with patch.object(self.service, "_command", new=AsyncMock(side_effect=failure)):
                with self.assertRaises(RuntimeError) as raised:
                    await self.service.execute("docs", "PRIVATE_QUERY", self.caller)
                self.assertIs(raised.exception, failure)
            with patch.object(self.service, "_command", new=AsyncMock(side_effect=asyncio.CancelledError)):
                with self.assertRaises(asyncio.CancelledError):
                    await self.service.execute("docs", "PRIVATE_QUERY", self.caller)
        self.assertEqual([row["outcome"] for row in events(captured)], ["error", "error", "cancelled"])
        self.assert_private_free(captured)

    async def test_failed_logger_or_timing_cannot_replace_service_results(self) -> None:
        expected = Reply((Page("PRIVATE_TITLE", "PRIVATE_BODY"),))
        failure = RuntimeError("PRIVATE_ORIGINAL_FAILURE")
        with patch.object(service_module.logger, "info", side_effect=OSError("PRIVATE_LOGGER")):
            with patch.object(self.service, "_command", new=AsyncMock(return_value=expected)):
                self.assertIs(await self.service.execute("docs", "PRIVATE_QUERY", self.caller), expected)
            with patch.object(self.service, "_command", new=AsyncMock(side_effect=failure)):
                with self.assertRaises(RuntimeError) as raised:
                    await self.service.execute("docs", "PRIVATE_QUERY", self.caller)
                self.assertIs(raised.exception, failure)
        self.service.clock = Mock(side_effect=[self.now, RuntimeError("PRIVATE_CLOCK")])
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            reply = await self.service.execute("ping", "", self.caller)
        self.assertEqual(reply.outcome, "success")
        self.assertEqual(events(captured)[0]["outcome"], "success")
        self.assertNotIn("duration_ms", events(captured)[0])
        self.assert_private_free(captured)

    async def test_slash_service_and_dispatch_outcomes_are_distinct_and_timed(self) -> None:
        item = self.request()

        async def deliver(**kwargs: object) -> object:
            self.now += 0.025
            return SimpleNamespace(edit=AsyncMock())

        item.edit_original_response.side_effect = deliver
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await self.bot.respond(item, "ping", "PRIVATE_QUERY")
        rows = events(captured)
        self.assertEqual([row["event"] for row in rows], ["discord.command.completed", "discord.command.dispatched"])
        self.assertEqual([row["outcome"] for row in rows], ["success", "success"])
        self.assertEqual([row["duration_ms"] for row in rows], [0, 25])
        item.response.defer.assert_awaited_once_with(ephemeral=True, thinking=True)
        self.assertFalse(item.edit_original_response.await_args.kwargs["allowed_mentions"].everyone)
        self.assert_private_free(captured)

    async def test_slash_deferral_execution_and_delivery_failures_cannot_report_dispatch_success(self) -> None:
        for stage in ("defer", "execute", "edit"):
            with self.subTest(stage=stage):
                self.now += 40
                item, failure = self.request(), RuntimeError("PRIVATE_TRANSPORT_FAILURE")
                execute = AsyncMock(side_effect=failure) if stage == "execute" else AsyncMock(return_value=Reply((Page("PRIVATE_TITLE", "PRIVATE_BODY"),)))
                if stage == "defer":
                    item.response.defer.side_effect = failure
                if stage == "edit":
                    item.edit_original_response.side_effect = failure
                with patch.object(self.service, "_command", new=execute), self.assertLogs("buildanddo.discord", level="INFO") as captured:
                    with self.assertRaises(RuntimeError) as raised:
                        await self.bot.respond(item, "docs", "PRIVATE_QUERY")
                self.assertIs(raised.exception, failure)
                self.assertEqual([row["outcome"] for row in events(captured, "discord.command.dispatched")], ["error"])
                if stage == "defer":
                    execute.assert_not_awaited()
                self.assert_private_free(captured)

    async def test_slash_denial_and_cancellation_retain_their_outcomes(self) -> None:
        denied, cancelled = self.request(guild=None), self.request()
        cancelled.response.defer.side_effect = asyncio.CancelledError
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await self.bot.respond(denied, "learn", "PRIVATE_QUERY")
            with self.assertRaises(asyncio.CancelledError):
                await self.bot.respond(cancelled, "learn", "PRIVATE_QUERY")
        self.assertEqual([row["outcome"] for row in events(captured, "discord.command.dispatched")], ["denied", "cancelled"])
        self.assertEqual(denied.edit_original_response.await_args.kwargs["embed"].to_dict()["description"], "Use an allowed server and channel.")
        self.assert_private_free(captured)

    async def test_prefix_denial_is_silent_and_delivery_failure_is_not_success(self) -> None:
        self.bot.settings = Settings(legacy_prefix=True)
        message = SimpleNamespace(author=SimpleNamespace(id=USER, bot=False, name="PRIVATE_USERNAME"),
                                  guild=None, channel=SimpleNamespace(id=CHANNEL, send=AsyncMock()), webhook_id=None,
                                  content="!ping PRIVATE_QUERY")
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await self.bot.on_message(message)
        message.channel.send.assert_not_awaited()
        self.assertEqual([row["outcome"] for row in events(captured)], ["denied"])
        self.assert_private_free(captured)
        message.guild = SimpleNamespace(id=GUILD)
        message.channel.send.side_effect = ADAPTER.discord.HTTPException(SimpleNamespace(status=503, reason="PRIVATE_REASON"), "PRIVATE_MESSAGE")
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await self.bot.on_message(message)
        self.assertEqual(events(captured, "discord.command.dispatched")[0]["outcome"], "unavailable")
        self.assertEqual(events(captured, "discord.prefix.delivery_failed")[0]["outcome"], "unavailable")
        message.channel.send.await_args.kwargs["view"].stop()
        self.assert_private_free(captured)

    async def test_ignored_prefix_messages_produce_no_command_events(self) -> None:
        message = SimpleNamespace(author=SimpleNamespace(id=USER, bot=False), guild=SimpleNamespace(id=GUILD),
                                  channel=SimpleNamespace(id=CHANNEL, send=AsyncMock()), webhook_id=None, content="!ping PRIVATE_QUERY")
        with self.assertNoLogs("buildanddo.discord", level="INFO"):
            await self.bot.on_message(message)
            self.bot.settings = Settings(legacy_prefix=True)
            for content in ("PRIVATE_CONVERSATION", "!PRIVATE_COMMAND", "!"):
                message.content = content
                await self.bot.on_message(message)
        message.channel.send.assert_not_awaited()

    async def test_private_commands_bound_errors_and_include_deferral_and_delivery_failures(self) -> None:
        for family, name in (("research", "submit"), ("dossier", "remember")):
            for stage in ("success", "defer", "execute", "edit", "cancel_notice"):
                with self.subTest(family=family, stage=stage):
                    item = self.request()
                    bridge = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(page=Page("PRIVATE_TITLE", "PRIVATE_BODY"), request_key="PRIVATE_REQUEST")),
                                             delivered=Mock(), close=AsyncMock() if family == "research" else Mock())
                    setattr(self.bot, family, bridge)
                    failure = RuntimeError("PRIVATE_TRANSPORT")
                    if stage == "defer":
                        item.response.defer.side_effect = failure
                    if stage in {"execute", "cancel_notice"}:
                        bridge.execute.side_effect = ResearchError("PRIVATE_REASON")
                    if stage == "edit":
                        item.edit_original_response.side_effect = failure
                    if stage == "cancel_notice":
                        item.edit_original_response.side_effect = asyncio.CancelledError
                    with self.assertLogs("buildanddo.discord", level="INFO") as captured:
                        call = getattr(self.bot, "respond_" + family)(item, name, {"query": "PRIVATE_QUERY", "content": "PRIVATE_CONTENT"})
                        if stage in {"defer", "edit"}:
                            with self.assertRaises(RuntimeError) as raised:
                                await call
                            self.assertIs(raised.exception, failure)
                        elif stage == "cancel_notice":
                            with self.assertRaises(asyncio.CancelledError):
                                await call
                        else:
                            await call
                    rows = events(captured, "discord." + family + ".command")
                    self.assertEqual(len(rows), 1)
                    self.assertEqual(rows[0]["outcome"], "delivered" if stage == "success" else "cancelled" if stage == "cancel_notice" else "error")
                    if stage == "success":
                        bridge.delivered.assert_called_once()
                    else:
                        bridge.delivered.assert_not_called()
                    if stage == "defer":
                        bridge.execute.assert_not_awaited()
                    self.assert_private_free(captured)

    async def test_successful_precheck_does_not_log_an_accepted_control(self) -> None:
        view, item = self.reader_view("next"), self.request()
        item.data = {"custom_id": "PRIVATE_COMPONENT_next"}
        with self.assertNoLogs("buildanddo.discord", level="INFO"):
            self.assertTrue(await view.interaction_check(item))
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await view.next_page.callback(item)
        self.assertEqual([(row["control"], row["outcome"]) for row in events(captured)], [("next", "accepted")])
        self.assertEqual(view.session.index, 1)
        self.assert_private_free(captured)

    async def test_a_private_error_reason_cannot_claim_success_or_delivery(self) -> None:
        for family, name in (("research", "submit"), ("dossier", "remember")):
            for reason in ("success", "delivered", "accepted"):
                with self.subTest(family=family, reason=reason):
                    bridge = SimpleNamespace(execute=AsyncMock(side_effect=ResearchError(reason)), delivered=Mock(),
                                             close=AsyncMock() if family == "research" else Mock())
                    setattr(self.bot, family, bridge)
                    with self.assertLogs("buildanddo.discord", level="INFO") as captured:
                        await getattr(self.bot, "respond_" + family)(self.request(), name, {"content": "PRIVATE_CONTENT"})
                    self.assertEqual([row["outcome"] for row in events(captured)], ["error"])
                    bridge.delivered.assert_not_called()
                    self.assert_private_free(captured)

    async def test_all_five_controls_are_observed_only_after_response_completion(self) -> None:
        reply = Reply((Page("PRIVATE_SELECTED", "PRIVATE_LESSON_TEXT"),))
        for control in sorted(CONTROL_ACTIONS):
            with self.subTest(control=control):
                view, item = self.reader_view(control), self.request()
                with patch.object(self.service, "_command", new=AsyncMock(return_value=reply)), self.assertLogs("buildanddo.discord", level="INFO") as captured:
                    await self.dispatch(view, control, item)
                self.assertEqual([(row["control"], row["outcome"]) for row in events(captured, "discord.control.completed")], [(control, "accepted")])
                item.response.defer.assert_awaited_once_with()
                item.edit_original_response.assert_awaited_once()
                self.assert_private_free(captured)

    async def test_all_five_controls_report_denied_or_expired_prechecks_without_dispatch(self) -> None:
        for control in sorted(CONTROL_ACTIONS):
            for expired in (False, True):
                with self.subTest(control=control, expired=expired):
                    view = self.reader_view(control)
                    item = self.request(user=USER if expired else FOREIGN)
                    item.data = {"custom_id": "PRIVATE_COMPONENT_" + control, "values": ["PRIVATE_INPUT"]}
                    if expired:
                        view.session.expires_at = self.now
                    with self.assertLogs("buildanddo.discord", level="INFO") as captured:
                        self.assertFalse(await view.interaction_check(item))
                    self.assertEqual([(row["control"], row["outcome"]) for row in events(captured)], [(control, "expired" if expired else "denied")])
                    item.edit_original_response.assert_not_awaited()
                    expected = "These controls expired. Run the command again." if expired else "These controls belong to the person who opened them."
                    self.assertEqual(item.response.send_message.await_args.args, (expected,))
                    self.assertTrue(item.response.send_message.await_args.kwargs["ephemeral"])
                    self.assert_private_free(captured)

    async def test_queued_controls_recheck_retirement_scope_owner_and_expiry(self) -> None:
        for control in sorted(CONTROL_ACTIONS):
            for boundary in ("retired", "scope", "owner", "expiry"):
                with self.subTest(control=control, boundary=boundary):
                    self.service.settings = Settings()
                    view, item = self.reader_view(control), self.request(user=FOREIGN if boundary == "owner" else USER)
                    if boundary == "retired":
                        view.retired = True
                    elif boundary == "scope":
                        self.service.settings = Settings(frozenset({FOREIGN}))
                    elif boundary == "expiry":
                        view.session.expires_at = self.now
                    before = (view.session.index, view.session.answered)
                    with self.assertLogs("buildanddo.discord", level="INFO") as captured:
                        await self.dispatch(view, control, item)
                    self.assertEqual([(row["control"], row["outcome"]) for row in events(captured)], [(control, "expired" if boundary == "expiry" else "denied")])
                    self.assertEqual((view.session.index, view.session.answered), before)
                    item.edit_original_response.assert_not_awaited()
                    self.assertTrue(item.followup.send.await_args.kwargs["ephemeral"])
                    self.assert_private_free(captured)

    async def test_quiz_logs_dispatch_only_for_correct_wrong_replayed_and_rejected_answers(self) -> None:
        for choice in (0, 1):
            self.grading.json.reset_mock()
            view = self.reader_view("quiz_answer")
            first, retry, changed = self.request(), self.request(), self.request()
            with self.assertLogs("buildanddo.discord", level="INFO") as captured:
                await view.answer(first, choice)
                await view.answer(retry, choice)
                await view.answer(changed, 1 - choice)
            self.assertEqual([row["outcome"] for row in events(captured, "discord.control.completed")], ["accepted", "accepted", "rejected"])
            self.assertEqual([row["outcome"] for row in events(captured, "discord.quiz.graded")], ["graded"])
            self.grading.json.assert_awaited_once()
            rendered = first.edit_original_response.await_args.kwargs["embed"].to_dict()
            self.assertEqual(rendered, retry.edit_original_response.await_args.kwargs["embed"].to_dict())
            expected = ("Correct.\n\nPRIVATE_EXPLANATION" if choice == 1 else "Not the expected answer. Review the lesson, then run the quiz again.") + "\n\nPractice only. Progress is saved through your signed-in BuildAndDo workspace."
            self.assertEqual(rendered["description"], ADAPTER.escaped(expected))
            self.assertNotIn("PRIVATE_CHOICE", rendered["description"])
            self.assertNotIn("verified", json.dumps(events(captured)))
            self.assert_private_free(captured)

    async def test_unavailable_server_grade_is_not_accepted_or_cached_and_retry_remains_open(self) -> None:
        view, item = self.reader_view("quiz_answer"), self.request()
        self.grading.json.side_effect = ResearchError("unavailable", 503)
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await view.answer(item, 1)
        self.assertEqual([row["outcome"] for row in events(captured, "discord.quiz.graded")], ["unavailable"])
        self.assertEqual([row["outcome"] for row in events(captured, "discord.control.completed")], ["rejected"])
        self.assertFalse(view.session.answered)
        self.assertFalse(any(child.disabled for child in view.children if isinstance(child, ADAPTER.QuizSelect)))
        self.assert_private_free(captured)
        self.grading.json.side_effect = None
        self.grading.json.return_value = {"correct": False}
        with self.assertLogs("buildanddo.discord", level="INFO") as retry:
            await view.answer(self.request(), 0)
        self.assertTrue(view.session.answered)
        self.assertEqual([row["outcome"] for row in events(retry, "discord.control.completed")], ["accepted"])
        self.assert_private_free(retry)

    async def test_delayed_server_grade_cannot_publish_after_expiry_or_scope_revocation(self) -> None:
        for boundary in ("expiry", "scope"):
            with self.subTest(boundary=boundary):
                self.service.settings = Settings()
                view, item = self.reader_view("quiz_answer"), self.request()
                entered, release = asyncio.Event(), asyncio.Event()

                async def delayed(*args: object, **kwargs: object) -> dict[str, object]:
                    entered.set()
                    await release.wait()
                    return {"correct": True, "explanation": "PRIVATE_EXPLANATION"}

                self.grading.json.side_effect = delayed
                with self.assertLogs("buildanddo.discord", level="INFO") as captured:
                    answering = asyncio.create_task(view.answer(item, 1))
                    await entered.wait()
                    if boundary == "expiry":
                        view.session.expires_at = self.now
                    else:
                        self.service.settings = Settings(frozenset({FOREIGN}))
                    release.set()
                    await answering
                item.edit_original_response.assert_not_awaited()
                self.assertEqual([row["outcome"] for row in events(captured, "discord.control.completed")],
                                 ["expired" if boundary == "expiry" else "denied"])
                self.assert_private_free(captured)

    async def test_forged_and_unavailable_lesson_selections_are_not_accepted(self) -> None:
        view = self.reader_view("lesson_select")
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await view.select_lesson(self.request(), "PRIVATE_FORGED_SLUG")
            with patch.object(self.service, "_command", new=AsyncMock(side_effect=DataUnavailable(DataFault.TIMEOUT))):
                await view.select_lesson(self.request(), "PRIVATE_SLUG")
        self.assertEqual([row["outcome"] for row in events(captured, "discord.control.completed")], ["rejected", "rejected"])
        self.assert_private_free(captured)

    async def test_failed_deferral_or_edit_retains_each_control_exception(self) -> None:
        for control in sorted(CONTROL_ACTIONS):
            for stage in ("defer", "edit"):
                with self.subTest(control=control, stage=stage):
                    view, item = self.reader_view(control), self.request()
                    failure = RuntimeError("PRIVATE_TRANSPORT_EXCEPTION")
                    target = item.response.defer if stage == "defer" else item.edit_original_response
                    target.side_effect = failure
                    with patch.object(self.service, "_command", new=AsyncMock(return_value=Reply((Page("PRIVATE_SELECTED", "PRIVATE_BODY"),)))), self.assertLogs("buildanddo.discord", level="INFO") as captured:
                        with self.assertRaises(RuntimeError) as raised:
                            await self.dispatch(view, control, item)
                    self.assertIs(raised.exception, failure)
                    self.assertEqual([row["outcome"] for row in events(captured, "discord.control.completed")], ["error"])
                    self.assert_private_free(captured)

    async def test_cancellation_while_each_control_waits_for_the_lock_is_not_acceptance(self) -> None:
        for control in sorted(CONTROL_ACTIONS):
            with self.subTest(control=control):
                view, item = self.reader_view(control), self.request()
                before = (view.session.index, view.session.answered, view.retired)
                await view.lock.acquire()
                with self.assertLogs("buildanddo.discord", level="INFO") as captured:
                    task = asyncio.create_task(self.dispatch(view, control, item))
                    await asyncio.sleep(0)
                    task.cancel()
                    with self.assertRaises(asyncio.CancelledError):
                        await task
                view.lock.release()
                self.assertEqual((view.session.index, view.session.answered, view.retired), before)
                self.assertEqual([row["outcome"] for row in events(captured)], ["cancelled"])
                item.edit_original_response.assert_not_awaited()
                self.assert_private_free(captured)

    async def test_delayed_selection_cannot_claim_acceptance_after_timeout_or_revocation(self) -> None:
        for boundary in ("timeout", "scope"):
            with self.subTest(boundary=boundary):
                self.service.settings = Settings()
                view, item = self.reader_view("lesson_select"), self.request()
                entered, release = asyncio.Event(), asyncio.Event()

                async def delayed(*args: object) -> Reply:
                    entered.set()
                    await release.wait()
                    return Reply((Page("PRIVATE_LATE", "PRIVATE_BODY"),))

                with patch.object(self.service, "_command", side_effect=delayed), self.assertLogs("buildanddo.discord", level="INFO") as captured:
                    selecting = asyncio.create_task(view.select_lesson(item, "PRIVATE_SLUG"))
                    await entered.wait()
                    if boundary == "timeout":
                        expiring = asyncio.create_task(view.on_timeout())
                        await asyncio.sleep(0)
                    else:
                        self.service.settings = Settings(frozenset({FOREIGN}))
                    release.set()
                    await selecting
                    if boundary == "timeout":
                        await expiring
                item.edit_original_response.assert_not_awaited()
                self.assertEqual([row["outcome"] for row in events(captured, "discord.control.completed")], ["expired" if boundary == "timeout" else "denied"])
                self.assert_private_free(captured)

    async def test_timeout_does_not_invent_control_clicks_and_late_closed_controls_are_denied(self) -> None:
        view = self.reader_view("next")
        with self.assertNoLogs("buildanddo.discord", level="INFO"):
            await view.on_timeout()
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await view.next_page.callback(self.request())
        self.assertEqual(events(captured)[0]["outcome"], "expired")
        other = self.reader_view("close")
        with self.assertLogs("buildanddo.discord", level="INFO") as captured:
            await other.close_reader.callback(self.request())
            await other.next_page.callback(self.request())
        self.assertEqual([row["outcome"] for row in events(captured)], ["accepted", "denied"])

    async def test_precheck_notice_errors_and_unknown_components_do_not_leak_or_claim_acceptance(self) -> None:
        view = self.reader_view("next")
        for failing in (False, True):
            item = self.request(user=FOREIGN)
            item.data = {"custom_id": "PRIVATE_UNKNOWN_COMPONENT", "values": ["PRIVATE_ANSWER"]}
            failure = RuntimeError("PRIVATE_NOTICE_FAILURE")
            if failing:
                item.response.send_message.side_effect = failure
            with self.assertLogs("buildanddo.discord", level="INFO") as captured:
                if failing:
                    with self.assertRaises(RuntimeError) as raised:
                        await view.interaction_check(item)
                    self.assertIs(raised.exception, failure)
                else:
                    self.assertFalse(await view.interaction_check(item))
            self.assertEqual([(row["control"], row["outcome"]) for row in events(captured)], [("unknown", "error" if failing else "denied")])
            self.assert_private_free(captured)

    async def test_select_parsing_rejections_and_detached_controls_do_not_get_accepted(self) -> None:
        for control, values, exception in (("lesson_select", [], IndexError), ("quiz_answer", [], IndexError),
                                            ("quiz_answer", ["PRIVATE_NON_INTEGER"], ValueError)):
            view = self.reader_view(control)
            select = next(item for item in view.children if isinstance(item, ADAPTER.discord.ui.Select))
            with patch.object(type(select), "values", new=property(lambda _: values), create=True), self.assertLogs("buildanddo.discord", level="INFO") as captured:
                with self.assertRaises(exception):
                    await select.callback(self.request())
            self.assertEqual([(row["control"], row["outcome"]) for row in events(captured)], [(control, "rejected")])
            self.assert_private_free(captured)
        for constructor, control in ((ADAPTER.LessonSelect, "lesson_select"), (ADAPTER.QuizSelect, "quiz_answer")):
            select = constructor(Reply((Page("PRIVATE_QUESTION", "PRIVATE_BODY"),), quiz=Quiz("PRIVATE_SLUG", ("PRIVATE_A", "PRIVATE_B"))))
            with self.assertLogs("buildanddo.discord", level="INFO") as captured:
                await select.callback(self.request())
            self.assertEqual([(row["control"], row["outcome"]) for row in events(captured)], [(control, "denied")])
            self.assert_private_free(captured)

    async def test_valid_select_callbacks_emit_one_result_without_selection_values(self) -> None:
        for control, values in (("lesson_select", ["PRIVATE_SLUG"]), ("quiz_answer", ["0"])):
            view, item = self.reader_view(control), self.request()
            select = next(child for child in view.children if isinstance(child, ADAPTER.discord.ui.Select))
            reply = Reply((Page("PRIVATE_SELECTED", "PRIVATE_BODY"),))
            with patch.object(type(select), "values", new=property(lambda _: values), create=True), patch.object(
                self.service, "_command", new=AsyncMock(return_value=reply),
            ), self.assertLogs("buildanddo.discord", level="INFO") as captured:
                await select.callback(item)
            self.assertEqual([(row["control"], row["outcome"]) for row in events(captured, "discord.control.completed")], [(control, "accepted")])
            item.edit_original_response.assert_awaited_once()
            self.assert_private_free(captured)

    async def test_failing_stderr_logger_cannot_change_any_control_response_or_exception(self) -> None:
        for control in sorted(CONTROL_ACTIONS):
            with self.subTest(control=control):
                view, item = self.reader_view(control), self.request()
                failure = RuntimeError("PRIVATE_ORIGINAL_FAILURE")
                with patch.object(service_module.logger, "info", side_effect=OSError("PRIVATE_LOGGER")), patch.object(
                    self.service, "_command", new=AsyncMock(return_value=Reply((Page("PRIVATE_SELECTED", "PRIVATE_BODY"),))),
                ):
                    await self.dispatch(view, control, item)
                    item.edit_original_response.assert_awaited_once()
                    other, broken = self.reader_view(control), self.request()
                    broken.response.defer.side_effect = failure
                    with self.assertRaises(RuntimeError) as raised:
                        await self.dispatch(other, control, broken)
                    self.assertIs(raised.exception, failure)
