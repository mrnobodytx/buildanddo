#!/usr/bin/env python3
"""
bot.py - BuildAndDo's development-aid Discord bot.

Scope, deliberately minimal: report REAL live state, never invented numbers.
Reads only public, already-live HTTP endpoints (buildanddo.com/roadmap-status.json,
the site itself) - no cross-machine file access, no repo checkout needed on the
box this runs on, no secrets beyond the bot token itself.

Commands (prefix "!"):
  !ping      - liveness check
  !status    - is staging/production up right now (real HTTP probe)
  !roadmap   - live sprint day / planned% / actual% / last gate state

Token: BAD_DISCORD env var (set via systemd EnvironmentFile on the VPS, never
hardcoded, never committed - see scripts/discordbot/deploy.md).

Requires the "Message Content" privileged intent enabled for this bot in the
Discord Developer Portal, or on_message never sees command text. If that intent
is not enabled, discord.py raises PrivilegedIntentsRequired at startup - this is
surfaced as a real, loud failure (systemd log), never silently swallowed.
"""
from __future__ import annotations
import json
import os
import urllib.request

import discord

STATUS_URL = "https://buildanddo.com/roadmap-status.json"
SITES = {"production": "https://buildanddo.com/", "staging": "https://staging.buildanddo.com/"}
TOKEN = os.environ.get("BAD_DISCORD")

intents = discord.Intents.default()
intents.message_content = True
client = discord.Client(intents=intents)


def _probe(url: str) -> str:
    try:
        with urllib.request.urlopen(url, timeout=8) as resp:  # noqa: S310 - fixed URLs above, not user input
            return f"UP ({resp.status})"
    except Exception as exc:  # noqa: BLE001
        return f"DOWN ({type(exc).__name__})"


def _live_roadmap() -> dict | None:
    try:
        with urllib.request.urlopen(STATUS_URL, timeout=8) as resp:  # noqa: S310
            return json.loads(resp.read())
    except Exception:  # noqa: BLE001
        return None


@client.event
async def on_ready():
    print(f"BuildAndDo dev-aid bot online as {client.user} (guilds: {[g.name for g in client.guilds]})")


@client.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return
    content = message.content.strip()

    if content == "!ping":
        await message.channel.send("pong — BuildAndDo dev-aid bot is alive.")
        return

    if content == "!status":
        lines = [f"{name}: {_probe(url)}" for name, url in SITES.items()]
        await message.channel.send("**BuildAndDo status (live probe)**\n" + "\n".join(lines))
        return

    if content == "!roadmap":
        data = _live_roadmap()
        if not data:
            await message.channel.send("Unknown — roadmap-status.json unreachable right now.")
            return
        await message.channel.send(
            f"**BuildAndDo roadmap — live**\n"
            f"Sprint day: {data.get('sprint_day', 'Unknown')}\n"
            f"Planned: {data.get('planned_pct', 'Unknown')}%  ·  Actual: {data.get('actual_pct', 'Unknown')}%\n"
            f"Last gate: {data.get('gate_state', 'Unknown')}\n"
            f"Last deploy promoted: {data.get('last_deploy_promoted', 'Unknown')}"
        )
        return


def main() -> int:
    if not TOKEN:
        raise SystemExit("BAD_DISCORD is not set — refusing to start with no token")
    client.run(TOKEN)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
