# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/discordbot/dossier.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/research.py, apps/pocketbase/pb_hooks/dossier.pb.js
# EnumType:    Adapter
# EnumEdges:   CONSUMES scripts/discordbot/research.py; CONSUMES apps/pocketbase/pb_hooks/dossier.pb.js
# DAG Node:    none
# Intent:      Connect private Discord entity recall to native linked accounts while retaining only expiring undelivered write intent.
# ───────────────────────────────────────────────────────────────

"""Connect explicit personal memory commands to encrypted account dossiers."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import TypeAlias

from apps.research.contracts import ResearchError, identifier, object_value, text
from scripts.discordbot.contracts import Caller, Limiter, Page, SITE_ORIGIN
from scripts.discordbot.research import BridgeReply, ResearchBridge

DOSSIER_COMMANDS = {
    "dossier": "Open your private dossier or recover an uncertain entity save.",
    "remember": "Explicitly save an entity or add a dated note to one you own.",
    "recall": "Search your private entities, aliases, tags and saved notes.",
    "entity": "Read a private entity's recent notes and source references.",
    "forget": "Delete a private entity at the revision you reviewed.",
}
KINDS = ("person", "organization", "project", "place", "topic")
DESTINATION = SITE_ORIGIN + "/app/dossier"
Scope: TypeAlias = tuple[int, int | None, int | None]


@dataclass
class Intent:
    """Retain an undelivered command with its original account and expiry."""

    body: dict[str, object]
    owner: str
    link: str
    expires: float
    timer: asyncio.TimerHandle | None = None


def integer(value: object, minimum: int = 1, maximum: int = 2**53 - 1) -> int:
    """Validate a bounded revision or page without accepting booleans."""
    if type(value) is not int or not minimum <= value <= maximum:
        raise ResearchError("invalid_data", 400)
    return value


class DossierBridge:
    """Share existing native transport while isolating personal retry intent."""

    def __init__(self, research: ResearchBridge) -> None:
        self.research = research
        self.pending: dict[Scope, Intent] = {}
        self.busy: set[Scope] = set()
        self.limiter = Limiter()

    def discard(self, scope: Scope) -> None:
        """Release private input immediately after delivery, expiry or unlinking."""
        previous = self.pending.pop(scope, None)
        if previous and previous.timer:
            previous.timer.cancel()

    def delivered(self, caller: Caller, request_key: str) -> None:
        """Acknowledge exactly the save whose Discord reply was delivered."""
        scope = (caller.user_id, caller.guild_id, caller.channel_id)
        previous = self.pending.get(scope)
        if previous and request_key and previous.body["request_key"] == request_key:
            self.discard(scope)

    async def request(self, caller: Caller, command: dict[str, object], link: str = "", owner: str = "") -> dict[str, object]:
        """Recheck native identity through the registered server/channel route."""
        workspace = self.research.binding(caller).workspace
        value = await self.research.client.json(f"/api/buildanddo/workspaces/{workspace}/discord-dossier", body={
            "guild_id": str(caller.guild_id), "channel_id": str(caller.channel_id),
            "discord_user_id": str(caller.user_id), "link_id": link, "command": command,
        })
        if value.get("workspace") != workspace or (link and value.get("link_id") != link) or (owner and value.get("owner") != owner):
            raise ResearchError("invalid_data")
        return value

    def command(self, name: str, args: dict[str, object], request_id: int) -> dict[str, object]:
        """Build explicit save/delete intent without guessing entity identity."""
        integer(request_id, maximum=2**64 - 1)
        if name == "forget":
            if args.get("confirm") is not True:
                raise ResearchError("confirmation", 400)
            action = "entity.delete"
            payload: dict[str, object] = {"id": identifier(args.get("id"))}
            revision = integer(args.get("revision"))
        else:
            note = text(args.get("note"), 2000)
            url = text(args.get("source_url", ""), 2048, empty=True)
            source = text(args.get("source_label", ""), 160, empty=True)
            if args.get("entity_id"):
                if args.get("label"):
                    raise ResearchError("invalid_data", 400)
                action = "note.add"
                payload = {"id": identifier(args["entity_id"]), "text": note, "source_url": url, "source_label": source}
                revision = integer(args.get("revision"))
            else:
                kind = args.get("kind", "topic")
                if kind not in KINDS:
                    raise ResearchError("invalid_data", 400)
                action = "entity.create"
                payload = {"label": text(args.get("label"), 160), "kind": kind, "aliases": [], "tags": [],
                           "note": note, "source_url": url, "source_label": source}
                revision = integer(args.get("revision", 0), minimum=0, maximum=0)
        return {"action": action, "payload": payload, "revision": revision, "request_key": f"dossier_{request_id:020d}"}

    async def execute(self, name: str, arguments: dict[str, object], caller: Caller, request_id: int) -> BridgeReply:
        """Recall current personal content or recover the original accepted save."""
        self.research.binding(caller)
        scope = (caller.user_id, caller.guild_id, caller.channel_id)
        for key, intent in list(self.pending.items()):
            if intent.expires <= self.research.clock():
                self.discard(key)
        if scope in self.busy or self.limiter.admit(caller, self.research.clock()):
            raise ResearchError("rate_limited")
        self.busy.add(scope)
        try:
            if name not in DOSSIER_COMMANDS:
                raise ResearchError("invalid_data", 400)
            access = await self.request(caller, {"action": "access"})
            owner, link = identifier(access.get("owner")), identifier(access.get("link_id"))
            if access.get("encrypted_storage") is not True:
                raise ResearchError("unavailable")
            previous = self.pending.get(scope)
            if previous and (previous.owner != owner or previous.link != link):
                self.discard(scope)
                raise ResearchError("forbidden", 403)
            recover = name == "dossier" and arguments.get("recover") is True
            if name in {"remember", "forget"} or recover:
                if recover:
                    if not previous:
                        return BridgeReply(Page("No pending dossier save", "Use /buildanddo recall to inspect saved entities after a restart or expired request.", DESTINATION))
                    intent = previous
                else:
                    if previous:
                        return BridgeReply(Page("Recover your previous save", "Use /buildanddo dossier recover:true before saving another change.", DESTINATION))
                    if len(self.pending) >= 100:
                        raise ResearchError("rate_limited")
                    intent = Intent(self.command(name, arguments, request_id), owner, link, self.research.clock() + 600)
                    self.pending[scope] = intent
                    intent.timer = asyncio.get_running_loop().call_later(600, self.discard, scope)
                result = await self.request(caller, intent.body, intent.link, intent.owner)
                if result.get("action") != intent.body["action"] or not isinstance(result.get("replayed"), bool):
                    raise ResearchError("invalid_data")
                expected = integer(intent.body["revision"], minimum=0) + 1
                if integer(result.get("revision")) != expected:
                    raise ResearchError("invalid_data")
                entity_id = identifier(result.get("id"))
                removed = result["action"] == "entity.delete"
                page = Page("Entity forgotten" if removed else "Dossier save recorded",
                            f"Entity: {entity_id}\nRevision: {expected}\n\n" + (
                                "Its current content was deleted. Prior retry receipts cannot restore it." if removed else
                                "Open your dossier or use /buildanddo entity to read the current record. This receipt contains no saved note text."),
                            DESTINATION if removed else DESTINATION + "?entity=" + entity_id)
                return BridgeReply(page, str(intent.body["request_key"]))
            if name == "entity":
                entity_id = identifier(arguments.get("id"))
                result = await self.request(caller, {"action": "entity", "id": entity_id}, link, owner)
                row = object_value(result.get("entity"))
                notes = row.get("notes")
                if row.get("id") != entity_id or not isinstance(notes, list):
                    raise ResearchError("invalid_data")
                if len(notes) > 20:
                    raise ResearchError("invalid_data")
                lines = [f"Entity: {entity_id} · Revision: {integer(row.get('revision'))}"]
                for item in notes[-3:]:
                    note = object_value(item)
                    lines.append(text(note.get("text"), 2000)[:280] + "\nSource: " + text(note.get("source_label", ""), 160, empty=True)[:80]
                                 + " · " + text(note.get("created"), 40))
                lines.append("Read all notes, correct details or remove notes in your private dossier.")
                return BridgeReply(Page(text(row.get("label"), 160), "\n\n".join(lines)[:1700], DESTINATION + "?entity=" + entity_id))
            query = text(arguments.get("query", ""), 200, empty=True) if name == "recall" else ""
            page_number = integer(arguments.get("page", 1), maximum=20)
            result = await self.request(caller, {"action": "recall", "query": query, "page": page_number}, link, owner)
            items = result.get("items")
            if not isinstance(items, list) or len(items) > 10 or result.get("page") != page_number or not isinstance(result.get("has_more"), bool):
                raise ResearchError("invalid_data")
            lines = []
            for item in items:
                row = object_value(item)
                lines.append(identifier(row.get("id")) + " · r" + str(integer(row.get("revision"))) + " · " + text(row.get("label"), 160)[:45]
                             + "\n" + text(row.get("excerpt"), 240, empty=True)[:55])
            count = integer(result.get("entity_count"), minimum=0, maximum=200)
            total = integer(result.get("total"), minimum=0, maximum=200)
            body = f"Your personal dossier: {count} entities. Matches: {total}. Page {page_number}.\n\n" + ("\n\n".join(lines) or "No saved entities match this view.")
            body = body[:1680] + ("\nMore results: request the next page." if result["has_more"] else "")
            return BridgeReply(Page("Your private dossier", body, DESTINATION, "Only explicit saved notes; no channel collection or inferred identity matching."))
        except ResearchError as error:
            if error.status in {400, 401, 403, 404, 409}:
                self.discard(scope)
            raise
        finally:
            self.busy.discard(scope)

    def close(self) -> None:
        """Erase pending content and cancel expiry timers without closing shared HTTP."""
        for scope in list(self.pending):
            self.discard(scope)
