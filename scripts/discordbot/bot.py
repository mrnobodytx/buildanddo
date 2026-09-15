#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/discordbot/bot.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/service.py, scripts/discordbot/contracts.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON scripts/discordbot/service.py; DEPENDS_ON scripts/discordbot/contracts.py
# DAG Node:    none
# Intent:      Serve useful public Discord interactions with explicit scope, private replies and no import-time activation.
# ───────────────────────────────────────────────────────────────

"""Run the public command bot; hosting and workspace execution remain separately governed."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
import sys
import time

# Preserve the existing direct-script entry point as well as python -m usage.
if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import discord
from discord import app_commands

from scripts.discordbot.contracts import (
    Caller, ConfigurationError, DISPATCH, InteractionDenied, Page,
    PersonalSession, Reply, SESSION_SECONDS, Settings, SRS,
)
from scripts.discordbot.public_data import PublicClient
from scripts.discordbot.service import COMMANDS, CommandService, WORKSPACE_AREAS

logger = logging.getLogger("buildanddo.discord")


def caller_from(interaction: discord.Interaction) -> Caller:
    """Read transient Discord permissions without linking them to a website account."""
    return Caller(
        interaction.user.id, interaction.guild_id, interaction.channel_id,
        interaction.user.bot, interaction.permissions.manage_guild,
    )


def escaped(value: str) -> str:
    """Escape public source text and suppress mention-like display content."""
    return discord.utils.escape_markdown(discord.utils.escape_mentions(value))


def render(page: Page, index: int = 0, count: int = 1) -> discord.Embed:
    """Render bounded text using the site brand and a visible source note."""
    embed = discord.Embed(
        title=escaped(page.title), description=escaped(page.body),
        url=page.url, colour=0x00D9FF,
    )
    footer = "Powered by Citadel Nexus Inc."
    if count > 1:
        footer += f" | Page {index + 1}/{count}"
    if page.note:
        footer += " | " + page.note
    embed.set_footer(text=escaped(footer))
    return embed


async def notify_private(interaction: discord.Interaction, message: str) -> None:
    """Return an interaction notice without editing someone else's reader."""
    if interaction.response.is_done():
        await interaction.followup.send(message, ephemeral=True, allowed_mentions=discord.AllowedMentions.none())
    else:
        await interaction.response.send_message(message, ephemeral=True, allowed_mentions=discord.AllowedMentions.none())


async def transport_error(interaction: discord.Interaction) -> None:
    """Report a failed Discord delivery without disclosing exception payloads."""
    logger.error("discord.transport.failed", extra={"outcome": "error"})
    try:
        await notify_private(interaction, "The bot could not complete this reply. Run the command again.")
    except discord.HTTPException:
        logger.warning("discord.error_notice.unavailable", extra={"outcome": "unavailable"})


class LessonSelect(discord.ui.Select["ReplyView"]):
    """Select an authored lesson from one person's current results."""

    def __init__(self, reply: Reply) -> None:
        super().__init__(
            placeholder="Choose a lesson", row=1,
            options=[discord.SelectOption(label=item.label[:100], value=item.value) for item in reply.options],
        )

    async def callback(self, interaction: discord.Interaction) -> None:
        """Load the selected lesson through the same scoped command service."""
        if self.view is not None:
            await self.view.select_lesson(interaction, self.values[0])


class QuizSelect(discord.ui.Select["ReplyView"]):
    """Collect one answer without writing progress or broadcasting it."""

    def __init__(self, reply: Reply) -> None:
        assert reply.quiz is not None
        super().__init__(
            placeholder="Choose your answer", row=1,
            options=[
                discord.SelectOption(label=f"{index + 1}. {choice}"[:100], value=str(index))
                for index, choice in enumerate(reply.quiz.choices)
            ],
        )

    async def callback(self, interaction: discord.Interaction) -> None:
        """Submit one explicit answer to the guarded personal session."""
        if self.view is not None:
            await self.view.answer(interaction, int(self.values[0]))


class ReplyView(discord.ui.View):
    """Keep bounded, expiring reader controls owned by their initiating person."""

    def __init__(self, service: CommandService, caller: Caller, reply: Reply) -> None:
        super().__init__(timeout=SESSION_SECONDS)
        self.service, self.caller = service, caller
        self.session = PersonalSession(caller.user_id, reply)
        self.lock = asyncio.Lock()
        self.retired = False
        self.message: discord.Message | discord.InteractionMessage | None = None
        self.open_site = discord.ui.Button(label="Open in BuildAndDo", url=reply.pages[0].url, row=2)
        self.add_item(self.open_site)
        self.add_item(discord.ui.Button(
            label="Citadel status", url="https://citadel-nexus.com/status", row=2,
        ))
        if reply.options:
            self.add_item(LessonSelect(reply))
        if reply.quiz is not None:
            self.add_item(QuizSelect(reply))
        self.refresh()

    def refresh(self) -> None:
        """Keep navigation availability and the current public destination accurate."""
        self.previous.disabled = self.session.index == 0
        self.next_page.disabled = self.session.index == len(self.session.reply.pages) - 1
        self.open_site.url = self.session.reply.pages[self.session.index].url

    def require_owner(self, interaction: discord.Interaction) -> None:
        """Recheck scope and terminal state for queued callbacks as well as new ones."""
        if self.retired or not self.service.permitted(caller_from(interaction)):
            raise InteractionDenied("These controls are no longer available. Run the command again.")
        self.session.check(interaction.user.id, time.monotonic())

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        """Deny another user's or expired controls before dispatching callbacks."""
        try:
            self.require_owner(interaction)
            return True
        except InteractionDenied as error:
            await notify_private(interaction, str(error))
            return False

    async def move(self, interaction: discord.Interaction, step: int) -> None:
        """Acknowledge immediately and serialize changes to a complete lesson."""
        await interaction.response.defer()
        async with self.lock:
            try:
                self.require_owner(interaction)
                page = self.session.move(interaction.user.id, step, time.monotonic())
                self.refresh()
                self.message = await interaction.edit_original_response(
                    embed=render(page, self.session.index, len(self.session.reply.pages)),
                    view=self, allowed_mentions=discord.AllowedMentions.none(),
                )
            except InteractionDenied as error:
                await notify_private(interaction, str(error))

    async def select_lesson(self, interaction: discord.Interaction, slug: str) -> None:
        """Replace a search result only after its selected command has returned."""
        await interaction.response.defer()
        async with self.lock:
            try:
                self.require_owner(interaction)
                if slug not in {option.value for option in self.session.reply.options}:
                    raise InteractionDenied("Choose a lesson from this result.")
                reply = await self.service.execute(self.session.reply.selection, slug, caller_from(interaction))
                self.require_owner(interaction)
                replacement = ReplyView(self.service, self.caller, reply)
                replacement.message = await interaction.edit_original_response(
                    embed=render(reply.pages[0], count=len(reply.pages)), view=replacement,
                    allowed_mentions=discord.AllowedMentions.none(),
                )
                self.retired = True
                self.stop()
            except InteractionDenied as error:
                await notify_private(interaction, str(error))

    async def answer(self, interaction: discord.Interaction, choice: int) -> None:
        """Accept one answer and retain its explanation under serialized callbacks."""
        await interaction.response.defer()
        async with self.lock:
            try:
                self.require_owner(interaction)
                page = self.session.answer(interaction.user.id, choice, time.monotonic())
                for item in self.children:
                    if isinstance(item, discord.ui.Select):
                        item.disabled = True
                self.message = await interaction.edit_original_response(
                    embed=render(page), view=self, allowed_mentions=discord.AllowedMentions.none(),
                )
            except InteractionDenied as error:
                await notify_private(interaction, str(error))

    @discord.ui.button(label="Previous", style=discord.ButtonStyle.secondary, row=0)
    async def previous(self, interaction: discord.Interaction, button: discord.ui.Button["ReplyView"]) -> None:
        """Read the preceding page."""
        await self.move(interaction, -1)

    @discord.ui.button(label="Next", style=discord.ButtonStyle.secondary, row=0)
    async def next_page(self, interaction: discord.Interaction, button: discord.ui.Button["ReplyView"]) -> None:
        """Read the next page."""
        await self.move(interaction, 1)

    @discord.ui.button(label="Close", style=discord.ButtonStyle.secondary, row=0)
    async def close_reader(self, interaction: discord.Interaction, button: discord.ui.Button["ReplyView"]) -> None:
        """Close this person's reader and remove its interactive state."""
        await interaction.response.defer()
        async with self.lock:
            try:
                self.require_owner(interaction)
                await interaction.edit_original_response(
                    embed=render(Page("Reader closed", "Run /buildanddo help whenever you need it.")),
                    view=None, allowed_mentions=discord.AllowedMentions.none(),
                )
                self.retired = True
                self.stop()
            except InteractionDenied as error:
                await notify_private(interaction, str(error))

    async def on_timeout(self) -> None:
        """Disable expired controls while keeping ordinary public links usable."""
        self.retired = True
        async with self.lock:
            for item in self.children:
                if isinstance(item, discord.ui.Select) or (isinstance(item, discord.ui.Button) and item.url is None):
                    item.disabled = True
            if self.message is not None:
                try:
                    await self.message.edit(view=self)
                except discord.HTTPException:
                    logger.info("discord.reader.expiry_notice_unavailable", extra={"outcome": "unavailable"})
            self.stop()

    async def on_error(
        self, interaction: discord.Interaction, error: Exception, item: discord.ui.Item["ReplyView"],
    ) -> None:
        """Keep unexpected component failures out of public replies and logs."""
        await transport_error(interaction)


class PublicCommandTree(app_commands.CommandTree[discord.Client]):
    """Handle application-command failures without exposing provider payloads."""

    async def on_error(self, interaction: discord.Interaction, error: app_commands.AppCommandError) -> None:
        """Return a private retry notice when Discord command handling fails."""
        await transport_error(interaction)


class BuildAndDoBot(discord.Client):
    """Expose public commands with opt-in prefix intent and deliberate synchronization."""

    def __init__(self, settings: Settings, public_client: PublicClient | None = None) -> None:
        intents = discord.Intents.default()
        intents.message_content = settings.legacy_prefix
        super().__init__(intents=intents, allowed_mentions=discord.AllowedMentions.none())
        self.settings = settings
        self.public_client = public_client or PublicClient()
        self.service = CommandService(settings, self.public_client)
        self.tree = PublicCommandTree(self)
        self.group = app_commands.Group(
            name="buildanddo", description="Learn, navigate and inspect public BuildAndDo evidence.",
            guild_only=True,
        )
        self.tree.add_command(self.group)
        for name in COMMANDS:
            self.register_command(name)
        self._synchronized = False

    def register_command(self, name: str) -> None:
        """Register namespaced local definitions without performing a Discord write."""
        if name in {"docs", "learn", "lesson", "quiz", "workspace"}:
            async def with_query(interaction: discord.Interaction, query: str = "") -> None:
                await self.respond(interaction, name, query)

            if name == "workspace":
                with_query = app_commands.choices(query=[
                    app_commands.Choice(name=label, value=key)
                    for key, (label, _) in WORKSPACE_AREAS.items()
                ])(with_query)
            command = app_commands.Command(name=name, description=COMMANDS[name], callback=with_query)
            if name in {"learn", "lesson", "quiz"}:
                command.autocomplete("query")(self.autocomplete_lessons)
        else:
            async def simple(interaction: discord.Interaction) -> None:
                await self.respond(interaction, name, "")
            command = app_commands.Command(name=name, description=COMMANDS[name], callback=simple)
        self.group.add_command(command)

    async def autocomplete_lessons(self, interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
        """Suggest already-loaded public lessons without keystroke-triggered network traffic."""
        return [
            app_commands.Choice(name=option.label, value=option.value)
            for option in self.service.suggestions(current, caller_from(interaction))
        ]

    async def setup_hook(self) -> None:
        """Synchronize once only when the receiving operator configured that action."""
        if self._synchronized or self.settings.sync == "none":
            return
        if self.settings.sync == "guild":
            for guild_id in sorted(self.settings.guild_ids):
                guild = discord.Object(id=guild_id)
                self.tree.copy_global_to(guild=guild)
                await self.tree.sync(guild=guild)
        else:
            await self.tree.sync()
        self._synchronized = True
        logger.info("discord.commands.synchronized", extra={"outcome": "success"})

    async def on_ready(self) -> None:
        """Report gateway readiness without disclosing server names or claiming site health."""
        logger.info("discord.gateway.ready", extra={"outcome": "connected", "guild_count": len(self.guilds)})

    async def respond(self, interaction: discord.Interaction, name: str, query: str) -> None:
        """Acknowledge before I/O and deliver a private, mention-suppressed command result."""
        await interaction.response.defer(ephemeral=True, thinking=True)
        caller = caller_from(interaction)
        reply = await self.service.execute(name, query, caller)
        view = ReplyView(self.service, caller, reply)
        view.message = await interaction.edit_original_response(
            embed=render(reply.pages[0], count=len(reply.pages)),
            view=view, allowed_mentions=discord.AllowedMentions.none(),
        )

    async def on_message(self, message: discord.Message) -> None:
        """Retain explicit legacy prefix compatibility without listening by default."""
        if not self.settings.legacy_prefix or message.author.bot or message.webhook_id is not None:
            return
        content = message.content.strip()
        if not content.startswith("!"):
            return
        parts = content[1:].split(maxsplit=1)
        if not parts or parts[0].lower() not in COMMANDS:
            return
        caller = Caller(
            message.author.id, message.guild.id if message.guild else None, message.channel.id,
            message.author.bot, bool(getattr(getattr(message.author, "guild_permissions", None), "manage_guild", False)),
        )
        if not self.service.permitted(caller):
            return
        reply = await self.service.execute(parts[0].lower(), parts[1] if len(parts) > 1 else "", caller)
        view = ReplyView(self.service, caller, reply)
        try:
            view.message = await message.channel.send(
                embed=render(reply.pages[0], count=len(reply.pages)), view=view,
                allowed_mentions=discord.AllowedMentions.none(),
            )
        except discord.HTTPException:
            view.stop()
            logger.warning("discord.prefix.delivery_failed", extra={"outcome": "unavailable"})

    async def close(self) -> None:
        """Drain bounded public HTTP work before closing the gateway client."""
        await self.public_client.close()
        await super().close()


class EventFormatter(logging.Formatter):
    """Emit the bot's fixed event fields without raw source or account information."""

    def format(self, record: logging.LogRecord) -> str:
        """Serialize only the explicitly allowed observability fields."""
        event: dict[str, object] = {
            "event": record.getMessage(), "level": record.levelname.lower(),
            "srs_code": SRS, "seat": "BITS-CODEGEN", "dispatch_id": DISPATCH,
        }
        for name in ("command", "outcome", "duration_ms", "guild_count", "reason"):
            if hasattr(record, name):
                event[name] = getattr(record, name)
        return json.dumps(event, ensure_ascii=True)


def main() -> int:
    """Start only through explicit invocation and the existing runtime token binding."""
    handler = logging.StreamHandler()
    handler.setFormatter(EventFormatter())
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    try:
        settings = Settings.from_env(os.environ)
        token = os.environ.get("BAD_DISCORD", "").strip()
        if not token:
            raise ConfigurationError("The existing BAD_DISCORD runtime binding is unavailable.")
    except ConfigurationError:
        logger.error("discord.startup.blocked", extra={"reason": "configuration"})
        return 1
    client = BuildAndDoBot(settings)
    try:
        client.run(token, log_handler=None)
    except (discord.LoginFailure, discord.PrivilegedIntentsRequired, discord.HTTPException):
        logger.error("discord.startup.failed", extra={"reason": "discord_connection"})
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
