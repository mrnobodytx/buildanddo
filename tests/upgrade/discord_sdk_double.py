# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/discord_sdk_double.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/bot.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/discordbot/bot.py
# DAG Node:    none
# Intent:      Isolate Discord transport in offline behavior tests without substituting those tests for native SDK acceptance.
# ───────────────────────────────────────────────────────────────

"""Provide an explicit transport double for offline adapter contracts, not SDK acceptance."""
from __future__ import annotations

import inspect
import re
from types import ModuleType, SimpleNamespace
from unittest.mock import AsyncMock


class Generic:
    """Accept the SDK's generic annotations in the offline double."""

    @classmethod
    def __class_getitem__(cls, item: object) -> type:
        return cls


class Item(Generic):
    """Retain component options without simulating network behavior."""

    def __init__(self, **kwargs: object) -> None:
        self.disabled, self.url, self.view, self.values = False, None, None, []
        for key, value in kwargs.items():
            setattr(self, key, value)


class Button(Item):
    """Represent a view button."""


class Select(Item):
    """Represent a single-choice select."""


def button(**kwargs: object) -> object:
    """Retain decorated callback definitions for each instantiated view."""
    def decorate(callback: object) -> object:
        callback._button_options = kwargs
        return callback
    return decorate


class View(Generic):
    """Bind actual adapter callbacks to test-owned controls."""

    def __init__(self, *, timeout: float) -> None:
        self.timeout, self.children, self.stopped = timeout, [], False
        for name in dir(type(self)):
            method = getattr(self, name)
            if hasattr(method, "_button_options"):
                item = Button(**method._button_options)

                async def callback(interaction: object, target: object = method, control: object = item) -> None:
                    await target(interaction, control)
                item.callback = callback
                self.add_item(item)
                setattr(self, name, item)

    def add_item(self, item: object) -> None:
        """Attach a component to its real adapter view."""
        item.view = self
        self.children.append(item)

    def stop(self) -> None:
        """Record view disposal."""
        self.stopped = True


class AllowedMentions:
    """Represent complete mention suppression."""

    everyone = users = roles = replied_user = False

    @classmethod
    def none(cls) -> object:
        """Return a mention-disabled value."""
        return cls()


class Embed:
    """Expose the adapter's rendered payload for assertions."""

    def __init__(self, **kwargs: object) -> None:
        self.data = kwargs

    def set_footer(self, *, text: str) -> None:
        """Record the supplied footer."""
        self.data["footer"] = {"text": text}

    def to_dict(self) -> dict[str, object]:
        """Return only the values the adapter supplied."""
        return self.data


class Client:
    """Reject any accidental attempt to log in from an offline test."""

    def __init__(self, **kwargs: object) -> None:
        self.guilds, self.closed = [], False
        self.intents, self.allowed_mentions = kwargs["intents"], kwargs["allowed_mentions"]

    async def close(self) -> None:
        """Record client cleanup."""
        self.closed = True

    def run(self, token: str, **kwargs: object) -> None:
        """Reject startup; this double has no Discord transport."""
        raise AssertionError("A test must not start a Discord client.")


class Command(Generic):
    """Retain callbacks without claiming native command schema validation."""

    def __init__(self, **kwargs: object) -> None:
        self.autocompletes = {}
        for key, value in kwargs.items():
            setattr(self, key, value)
        parameters = list(inspect.signature(self.callback).parameters.values())
        if not parameters or parameters[0].name != 'interaction' or any(parameter.kind in (parameter.VAR_POSITIONAL, parameter.VAR_KEYWORD) for parameter in parameters):
            raise TypeError("Unexpected slash callback signature.")

    def autocomplete(self, name: str) -> object:
        """Bind a real autocomplete handler."""
        def register(callback: object) -> object:
            self.autocompletes[name] = callback
            return callback
        return register


class Group:
    """Retain the namespace and registered command set."""

    def __init__(self, **kwargs: object) -> None:
        self.commands = []
        for key, value in kwargs.items():
            setattr(self, key, value)

    def add_command(self, command: object) -> None:
        """Append one registered command."""
        self.commands.append(command)


class CommandTree(Generic):
    """Capture deliberate synchronization without making an API request."""

    def __init__(self, client: object) -> None:
        self.client, self.commands, self.copies = client, [], []
        self.sync = AsyncMock(return_value=[])

    def add_command(self, command: object) -> None:
        """Record an application command group."""
        self.commands.append(command)

    def copy_global_to(self, *, guild: object) -> None:
        """Record the requested guild registration scope."""
        self.copies.append(guild.id)


def sdk_double() -> ModuleType:
    """Build the minimal adapter boundary and label it as a transport double."""
    module = ModuleType("discord")
    module.Client = Client
    module.Intents = SimpleNamespace(default=lambda: SimpleNamespace(message_content=False))
    module.AllowedMentions, module.Embed = AllowedMentions, Embed
    module.ButtonStyle = SimpleNamespace(secondary=2)
    module.SelectOption, module.Object = SimpleNamespace, SimpleNamespace
    module.Attachment = SimpleNamespace
    module.HTTPException = type("HTTPException", (Exception,), {})
    module.LoginFailure = type("LoginFailure", (Exception,), {})
    module.PrivilegedIntentsRequired = type("PrivilegedIntentsRequired", (Exception,), {})
    module.ui = SimpleNamespace(View=View, Select=Select, Button=Button, Item=Item, button=button)
    module.utils = SimpleNamespace(
        escape_mentions=lambda value: re.sub(r"@(everyone|here|[!&]?[0-9]{17,20})", "@\u200b" + r"\1", value),
        escape_markdown=lambda value: re.sub(r"([\\*_~|\x60>])", r"\\\1", value),
    )
    module.app_commands = SimpleNamespace(
        CommandTree=CommandTree, Command=Command, Group=Group, Choice=SimpleNamespace,
        choices=lambda **kwargs: lambda callback: callback, AppCommandError=Exception,
    )
    return module
