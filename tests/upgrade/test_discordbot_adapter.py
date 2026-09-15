# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_discordbot_adapter.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/bot.py, tests/upgrade/discord_sdk_double.py, apps/web/tools/generate-community.mjs
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/discordbot/bot.py; DEPENDS_ON tests/upgrade/discord_sdk_double.py; CONSUMES apps/web/tools/generate-community.mjs
# DAG Node:    none
# Intent:      Verify private replies, owned controls and deliberate synchronization while keeping SDK-double results distinct from native acceptance.
# ───────────────────────────────────────────────────────────────

"""Exercise the real adapter with an explicit SDK double when Discord.py is absent."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import importlib.util
import json
import logging
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from discord_sdk_double import sdk_double
from scripts.discordbot.contracts import Caller, Page, Quiz, Reply, Settings
from scripts.discordbot.public_data import Observation, PublicClient
from scripts.discordbot.service import COMMANDS

ROOT = Path(__file__).resolve().parents[2]
NATIVE_SDK = importlib.util.find_spec("discord") is not None


def load_adapter() -> object:
    """Load actual adapter code without calling main or accessing a token."""
    name = "scripts.discordbot._adapter_contract"
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/discordbot/bot.py")
    loaded = importlib.util.module_from_spec(spec)
    sys.modules[name] = loaded
    if NATIVE_SDK:
        spec.loader.exec_module(loaded)
    else:
        with patch.dict(sys.modules, {"discord": sdk_double()}):
            spec.loader.exec_module(loaded)
    return loaded


ADAPTER = load_adapter()


def interaction(user: int = 10, guild: int | None = 20, channel: int = 30) -> object:
    """Make a controlled interaction with no external delivery capability."""
    response = SimpleNamespace(done=False)

    async def acknowledge(**kwargs: object) -> None:
        response.done = True
    response.defer = AsyncMock(side_effect=acknowledge)
    response.send_message = AsyncMock(side_effect=lambda *args, **kwargs: setattr(response, "done", True))
    response.is_done = lambda: response.done
    message = SimpleNamespace(edit=AsyncMock())
    return SimpleNamespace(
        user=SimpleNamespace(id=user, bot=False), guild_id=guild, channel_id=channel,
        permissions=SimpleNamespace(manage_guild=False), response=response,
        followup=SimpleNamespace(send=AsyncMock()),
        edit_original_response=AsyncMock(return_value=message),
    )


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls) -> None:
        print("Discord adapter backend: " + ("native SDK (no login)" if NATIVE_SDK else "explicit transport double; native acceptance pending"))
        cls.feed = json.loads(subprocess.check_output([
            "node", "--input-type=module", "-e",
            "import {buildCommunityCatalogue} from './apps/web/tools/generate-community.mjs';"
            "import {resolveBuildRelease} from './scripts/ci/release.mjs';"
            "process.stdout.write(JSON.stringify(buildCommunityCatalogue(resolveBuildRelease())));",
        ], cwd=ROOT, text=True))

    async def asyncSetUp(self) -> None:
        self.reads = []

        def reader(resource: object) -> Observation:
            self.reads.append(resource.path)
            value = self.feed if resource.path == "/community-catalog.json" else None
            return Observation(value, 200, datetime.now(timezone.utc), 1)
        self.client = PublicClient(reader)
        self.bot = ADAPTER.BuildAndDoBot(Settings(), self.client)
        self.addAsyncCleanup(self.bot.close)
        self.service, self.caller = self.bot.service, Caller(10, 20, 30)

    async def test_registration_does_not_sync_or_require_message_content(self) -> None:
        self.assertEqual({command.name for command in self.bot.group.commands}, set(COMMANDS))
        self.assertTrue(self.bot.group.guild_only)
        self.assertFalse(self.bot.intents.message_content)
        self.assertFalse(self.bot.allowed_mentions.everyone)
        with patch.object(self.bot.tree, "sync", new_callable=AsyncMock) as sync:
            await self.bot.setup_hook()
            await self.bot.on_ready()
            await self.bot.on_ready()
            sync.assert_not_awaited()
        self.assertEqual(self.reads, [])

    async def test_registered_callbacks_keep_their_own_command(self) -> None:
        with patch.object(self.bot, "respond", new_callable=AsyncMock) as respond:
            for command in self.bot.group.commands:
                item = interaction()
                await command.callback(item)
                respond.assert_awaited_with(item, command.name, "")

    async def test_slash_defers_privately_and_suppresses_mentions(self) -> None:
        item = interaction()
        await self.bot.respond(item, "learn", "mission")
        item.response.defer.assert_awaited_once_with(ephemeral=True, thinking=True)
        result = item.edit_original_response.await_args.kwargs
        self.assertFalse(result["allowed_mentions"].everyone)
        self.assertFalse(result["allowed_mentions"].users)
        self.assertIsInstance(result["view"], ADAPTER.ReplyView)
        self.assertTrue(self.reads)
        result["view"].stop()

    async def test_denied_scope_reply_is_private_with_no_source_call(self) -> None:
        item = interaction(guild=None)
        await self.bot.respond(item, "learn", "")
        result = item.edit_original_response.await_args.kwargs
        self.assertIn("unavailable", result["embed"].to_dict()["title"])
        self.assertEqual(self.reads, [])
        result["view"].stop()

    async def test_navigation_updates_page_link_and_rejects_foreign_control(self) -> None:
        reply = Reply((Page("First", "One."), Page("Second", "Two.", "https://buildanddo.tech/about")))
        view = ADAPTER.ReplyView(self.service, self.caller, reply)
        self.addCleanup(view.stop)
        foreign = interaction(user=99)
        self.assertFalse(await view.interaction_check(foreign))
        foreign.edit_original_response.assert_not_awaited()
        self.assertTrue(foreign.response.send_message.await_args.kwargs["ephemeral"])
        owner = interaction()
        self.assertTrue(await view.interaction_check(owner))
        await view.next_page.callback(owner)
        self.assertEqual(view.session.index, 1)
        self.assertTrue(view.next_page.disabled)
        self.assertEqual(view.open_site.url, "https://buildanddo.tech/about")
        await view.previous.callback(interaction())
        self.assertEqual(view.session.index, 0)

    async def test_queued_quiz_answers_keep_exactly_one_explanation(self) -> None:
        reply = Reply((Page("Question", "Choose."),), quiz=Quiz(("A", "B"), 1, "B requires evidence."))
        view = ADAPTER.ReplyView(self.service, self.caller, reply)
        self.addCleanup(view.stop)
        first, second = interaction(), interaction()
        await asyncio.gather(view.answer(first, 1), view.answer(second, 0))
        self.assertTrue(view.session.answered)
        self.assertEqual(first.edit_original_response.await_count + second.edit_original_response.await_count, 1)
        self.assertEqual(first.followup.send.await_count + second.followup.send.await_count, 1)
        self.assertTrue(all(item.disabled for item in view.children if isinstance(item, ADAPTER.discord.ui.Select)))

    async def test_selection_replaces_search_and_retires_queued_controls(self) -> None:
        reply = await self.service.execute("quiz", "", self.caller)
        view = ADAPTER.ReplyView(self.service, self.caller, reply)
        self.addCleanup(view.stop)
        item = interaction()
        await view.select_lesson(item, reply.options[0].value)
        replacement = item.edit_original_response.await_args.kwargs["view"]
        self.addCleanup(replacement.stop)
        self.assertIsNotNone(replacement.session.reply.quiz)
        self.assertTrue(view.retired)
        again = interaction()
        await view.select_lesson(again, reply.options[1].value)
        again.edit_original_response.assert_not_awaited()
        self.assertTrue(again.followup.send.await_args.kwargs["ephemeral"])

    async def test_forged_selection_expiry_and_changed_scope_make_no_source_read(self) -> None:
        view = ADAPTER.ReplyView(self.service, self.caller, Reply((Page("Empty", "No selection."),)))
        self.addCleanup(view.stop)
        await view.select_lesson(interaction(), "not-in-the-results")
        view.session.expires_at = 0
        self.assertFalse(await view.interaction_check(interaction()))
        self.service.settings = Settings(frozenset({999}))
        self.assertFalse(await view.interaction_check(interaction()))
        self.assertFalse(self.reads)

    async def test_delayed_selection_cannot_reopen_an_expired_reader(self) -> None:
        search = await self.service.execute("learn", "", self.caller)
        view = ADAPTER.ReplyView(self.service, self.caller, search)
        self.addCleanup(view.stop)
        entered, release = asyncio.Event(), asyncio.Event()

        async def delayed(*args: object) -> Reply:
            entered.set()
            await release.wait()
            return Reply((Page("Late lesson", "This result must not replace expired controls."),))

        owner = interaction()
        with patch.object(self.service, "execute", side_effect=delayed):
            selecting = asyncio.create_task(view.select_lesson(owner, search.options[0].value))
            await entered.wait()
            expiring = asyncio.create_task(view.on_timeout())
            await asyncio.sleep(0)
            release.set()
            await selecting
            await expiring
        owner.edit_original_response.assert_not_awaited()
        self.assertTrue(owner.followup.send.await_args.kwargs["ephemeral"])

    async def test_lost_quiz_delivery_can_retry_the_same_answer(self) -> None:
        reply = Reply((Page("Question", "Choose."),), quiz=Quiz(("A", "B"), 1, "B requires evidence."))
        view = ADAPTER.ReplyView(self.service, self.caller, reply)
        self.addCleanup(view.stop)
        lost = interaction()
        lost.edit_original_response.side_effect = ADAPTER.discord.HTTPException(
            SimpleNamespace(status=503, reason="unavailable"), "Provider detail is not public",
        )
        with self.assertRaises(ADAPTER.discord.HTTPException):
            await view.answer(lost, 1)
        retry = interaction()
        await view.answer(retry, 1)
        rendered = retry.edit_original_response.await_args.kwargs["embed"].to_dict()
        self.assertIn("B requires evidence.", rendered["description"])

    async def test_timeout_disables_controls_and_keeps_public_links(self) -> None:
        view = ADAPTER.ReplyView(self.service, self.caller, Reply((Page("One", "First"), Page("Two", "Second"))))
        view.message = SimpleNamespace(edit=AsyncMock())
        await view.on_timeout()
        self.assertTrue(view.retired)
        self.assertTrue(view.previous.disabled)
        self.assertTrue(view.next_page.disabled)
        self.assertFalse(view.open_site.disabled)
        view.message.edit.assert_awaited_once_with(view=view)

    async def test_close_removes_reader_and_queued_callback_cannot_reopen_it(self) -> None:
        view = ADAPTER.ReplyView(self.service, self.caller, Reply((Page("One", "First"), Page("Two", "Second"))))
        owner = interaction()
        await view.close_reader.callback(owner)
        self.assertTrue(view.retired)
        self.assertIsNone(owner.edit_original_response.await_args.kwargs["view"])
        later = interaction()
        await view.move(later, 1)
        later.edit_original_response.assert_not_awaited()

    async def test_autocomplete_uses_only_loaded_content_in_permitted_scope(self) -> None:
        self.assertEqual(await self.bot.autocomplete_lessons(interaction(), "mission"), [])
        await self.service.execute("learn", "", self.caller)
        self.assertTrue(await self.bot.autocomplete_lessons(interaction(), "mission"))
        self.assertEqual(await self.bot.autocomplete_lessons(interaction(guild=None), "mission"), [])
        self.assertEqual(len(self.reads), 1)

    async def test_guild_sync_is_deliberate_once_and_not_repeated_on_ready(self) -> None:
        self.bot.settings = Settings(frozenset({12345678901234567}), sync="guild")
        with patch.object(self.bot.tree, "sync", new_callable=AsyncMock) as sync:
            await self.bot.setup_hook()
            await self.bot.setup_hook()
            await self.bot.on_ready()
            self.assertEqual(sync.await_count, 1)
            self.assertEqual(sync.await_args.kwargs["guild"].id, 12345678901234567)

    async def test_global_sync_needs_explicit_mode(self) -> None:
        self.bot.settings = Settings(sync="global")
        with patch.object(self.bot.tree, "sync", new_callable=AsyncMock) as sync:
            await self.bot.setup_hook()
            sync.assert_awaited_once_with()

    async def test_legacy_prefix_is_opt_in_and_ignores_unrelated_senders(self) -> None:
        channel = SimpleNamespace(id=30, send=AsyncMock(return_value=SimpleNamespace(edit=AsyncMock())))
        message = SimpleNamespace(
            author=SimpleNamespace(id=10, bot=False), guild=SimpleNamespace(id=20),
            channel=channel, webhook_id=None, content="!ping",
        )
        await self.bot.on_message(message)
        channel.send.assert_not_awaited()
        self.bot.settings = Settings(legacy_prefix=True)
        await self.bot.on_message(message)
        channel.send.assert_awaited_once()
        channel.send.await_args.kwargs["view"].stop()
        for values in [
            {"content": "ordinary conversation"}, {"content": "!unknown"}, {"content": "!"},
            {"content": "!ping", "webhook_id": 9}, {"webhook_id": None, "guild": None},
            {"guild": SimpleNamespace(id=20), "author": SimpleNamespace(id=10, bot=True)},
        ]:
            for key, value in values.items():
                setattr(message, key, value)
            await self.bot.on_message(message)
        self.assertEqual(channel.send.await_count, 1)

    async def test_rendering_escapes_mentions_and_respects_discord_limits(self) -> None:
        rendered = ADAPTER.render(Page("@everyone _Title_", "*@everyone " * 160)).to_dict()
        self.assertNotIn("@everyone", rendered["title"])
        self.assertNotIn("@everyone", rendered["description"])
        self.assertLessEqual(len(rendered["description"]), 4096)
        self.assertIn("Citadel Nexus Inc.", rendered["footer"]["text"])

    async def test_unexpected_error_has_a_private_sanitized_notice(self) -> None:
        item = interaction()
        with self.assertLogs("buildanddo.discord", level="ERROR") as events:
            await self.bot.tree.on_error(item, RuntimeError("private provider content"))
        self.assertNotIn("private provider content", str(events.output))
        self.assertTrue(item.response.send_message.await_args.kwargs["ephemeral"])

    async def test_formatter_drops_unapproved_fields(self) -> None:
        record = logging.LogRecord("buildanddo.discord", logging.INFO, "", 0, "discord.command.completed", (), None)
        record.command, record.outcome, record.duration_ms = "ping", "success", 2
        record.user_id, record.query, record.provider_payload = 1234567, "private", "private"
        event = json.loads(ADAPTER.EventFormatter().format(record))
        self.assertNotIn("user_id", event)
        self.assertNotIn("private", json.dumps(event))
        self.assertEqual(event["command"], "ping")

    async def test_main_missing_config_never_starts_client(self) -> None:
        with patch.dict("os.environ", {}, clear=True), patch.object(ADAPTER, "logger") as logger:
            with patch.object(ADAPTER, "BuildAndDoBot") as factory:
                self.assertEqual(ADAPTER.main(), 1)
                factory.assert_not_called()
                logger.error.assert_called_once()

    @unittest.skipUnless(NATIVE_SDK, "Discord.py is unavailable: native serialization remains an acceptance gate.")
    async def test_native_serialization_without_login(self) -> None:
        payload = self.bot.group.to_dict(self.bot.tree)
        self.assertEqual(payload["name"], "buildanddo")
        self.assertEqual(len(payload["options"]), 13)
        reply = await self.service.execute("quiz", "", self.caller)
        view = ADAPTER.ReplyView(self.service, self.caller, reply)
        self.addCleanup(view.stop)
        self.assertTrue(view.to_components())
