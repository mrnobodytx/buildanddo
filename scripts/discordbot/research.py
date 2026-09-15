# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/discordbot/research.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/research/transport.py, apps/pocketbase/pb_hooks/research.pb.js, scripts/discordbot/contracts.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES apps/research/transport.py; CONSUMES apps/pocketbase/pb_hooks/research.pb.js; CONSUMES scripts/discordbot/contracts.py
# DAG Node:    none
# Intent:      Bind private Discord mission commands to linked native accounts and recover uncertain submissions without duplicating their evidence inputs.
# ───────────────────────────────────────────────────────────────

"""Bridge trusted Discord interactions to native account-scoped research commands."""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
import json
import re
import time
from urllib.parse import urlsplit

from apps.research.contracts import Endpoint, MAX_FILE, ResearchError, file_kind, identifier, object_value, text
from apps.research.transport import BoundedIO, HttpClient, decode_json, multipart
from scripts.discordbot.contracts import Caller, Page, Limiter, SITE_ORIGIN

RESEARCH_COMMANDS = {
    "missions": "List missions available through your linked BuildAndDo account.",
    "mission": "Propose a mission under your existing workspace permissions.",
    "evidence": "List recorded evidence for a mission you can access.",
    "submit": "Submit a search, web URL or explicit file for mission research.",
    "submissions": "List saved research requests from the website and Discord.",
    "submission": "Read a submission's recorded state and open its source review.",
    "recover": "Recover your previous submission after an uncertain reply.",
}


@dataclass(frozen=True)
class Binding:
    """Map one Discord server/channel to a server-registered workspace."""

    guild: int
    channel: int
    workspace: str


@dataclass(frozen=True)
class Attachment:
    """Hold trusted gateway attachment metadata without downloading it implicitly."""

    id: int
    name: str
    size: int
    url: str


@dataclass
class Pending:
    """Keep bounded retry intent until delivery succeeds or the interaction expires."""

    body: dict[str, object]
    link: str
    attachment: Attachment | None
    expires: float


@dataclass(frozen=True)
class BridgeReply:
    """Carry a response plus the exact request whose delivery can be acknowledged."""

    page: Page
    request_key: str = ""


def bindings_from_env(env: Mapping[str, str]) -> tuple[Binding, ...]:
    """Validate non-secret channel mappings without discovering private endpoints."""
    try:
        rows = json.loads(env.get("BUILDANDDO_DISCORD_RESEARCH_BINDINGS", "[]"))
    except ValueError:
        raise ResearchError("configuration") from None
    if not isinstance(rows, list) or len(rows) > 100:
        raise ResearchError("configuration")
    result: list[Binding] = []
    for item in rows:
        row = object_value(item)
        if set(row) != {"guild_id", "channel_id", "workspace"} or any(
            not isinstance(row.get(key), str) or not re.fullmatch(r"[1-9][0-9]{16,19}", str(row[key])) or int(str(row[key])) >= 2**64
            for key in ("guild_id", "channel_id")
        ):
            raise ResearchError("configuration")
        entry = Binding(int(str(row["guild_id"])), int(str(row["channel_id"])), identifier(row["workspace"]))
        if any(old.guild == entry.guild and old.channel == entry.channel for old in result):
            raise ResearchError("configuration")
        result.append(entry)
    return tuple(result)


class ResearchBridge:
    """Use current server authorization for every private command and retry."""

    def __init__(self, client: HttpClient, bindings: tuple[Binding, ...], *,
                 download: Callable[[Attachment], Awaitable[bytes]] | None = None, clock: Callable[[], float] = time.monotonic) -> None:
        self.client, self.bindings, self.clock = client, bindings, clock
        self.pending: dict[tuple[int, int | None, int | None], Pending] = {}
        self.busy: set[tuple[int, int | None, int | None]] = set()
        self.io = BoundedIO(slots=2, deadline=15)
        self.downloader = download or self.download
        self.limiter = Limiter()

    def binding(self, caller: Caller) -> Binding:
        """Reject DMs, bot accounts and unconfigured channels before transport."""
        value = next((row for row in self.bindings if row.guild == caller.guild_id and row.channel == caller.channel_id), None)
        if caller.is_bot or value is None:
            raise ResearchError("forbidden", 403)
        return value

    async def request(self, caller: Caller, command: dict[str, object], link: str = "") -> dict[str, object]:
        """Send only the trusted gateway caller and a bounded native command."""
        workspace = self.binding(caller).workspace
        body = {"guild_id": str(caller.guild_id), "channel_id": str(caller.channel_id), "discord_user_id": str(caller.user_id),
                "link_id": link, "command": command}
        value = await self.client.json(f"/api/buildanddo/workspaces/{workspace}/discord-research", body=body)
        if value.get("workspace") != workspace:
            raise ResearchError("invalid_data")
        return value

    async def download(self, attachment: Attachment) -> bytes:
        """Download only an explicit Discord attachment with response bounds."""
        file_kind(attachment.name, attachment.size)
        parsed = urlsplit(attachment.url)
        if parsed.scheme != "https" or parsed.hostname not in {"cdn.discordapp.com", "media.discordapp.net"} or parsed.username or parsed.password or (
            parsed.port not in (443, None) or not parsed.path.startswith("/attachments/") or parsed.fragment
        ):
            raise ResearchError("unsafe_source")
        client = HttpClient(Endpoint("https://" + parsed.hostname), io=self.io, timeout=12)
        data = await client.raw(parsed.path + ("?" + parsed.query if parsed.query else ""), maximum=MAX_FILE, json_response=False)
        if len(data) != attachment.size:
            raise ResearchError("invalid_data")
        return data

    async def upload(self, caller: Caller, attachment: Attachment, link: str) -> str:
        """Recover a saved attachment receipt before attempting another upload."""
        kind = file_kind(attachment.name, attachment.size)
        prior = await self.request(caller, {"action": "upload", "source_ref": str(attachment.id)}, link)
        if prior.get("id"):
            if prior.get("kind") != kind:
                raise ResearchError("conflict", 409)
            return identifier(prior["id"])
        data = await self.downloader(attachment)
        if len(data) != attachment.size or len(data) > MAX_FILE:
            raise ResearchError("invalid_data")
        body, content_type = multipart({"guild_id": str(caller.guild_id), "channel_id": str(caller.channel_id),
            "discord_user_id": str(caller.user_id), "link_id": link, "source_ref": str(attachment.id)}, attachment.name, data, field="asset")
        workspace = self.binding(caller).workspace
        saved = decode_json(await self.client.raw(f"/api/buildanddo/workspaces/{workspace}/discord-research/upload", method="POST", body=body, content_type=content_type))
        if saved.get("workspace") != workspace or saved.get("kind") != kind or saved.get("size") != attachment.size:
            raise ResearchError("invalid_data")
        return identifier(saved.get("id"))

    def delivered(self, caller: Caller, request_key: str) -> None:
        """Release retry intent only after Discord confirms the response edit."""
        scope = (caller.user_id, caller.guild_id, caller.channel_id)
        request = self.pending.get(scope)
        if request_key and request and request.body['request_key'] == request_key:
            self.pending.pop(scope)

    async def execute(self, name: str, arguments: dict[str, object], caller: Caller, request_id: int,
                      attachment: Attachment | None = None) -> BridgeReply:
        """Read or submit native records with ephemeral delivery and stable retry identity."""
        scope = (caller.user_id, caller.guild_id, caller.channel_id)
        self.binding(caller)
        self.pending = {key: value for key, value in self.pending.items() if value.expires > self.clock()}
        if scope in self.busy or self.limiter.admit(caller, self.clock()):
            raise ResearchError("rate_limited")
        self.busy.add(scope)
        try:
            if name in {"missions", "evidence", "submissions"}:
                page = arguments.get("page", 1)
                if type(page) is not int or not 1 <= page <= 9999:
                    raise ResearchError("invalid_data")
                mission = identifier(arguments["mission"]) if arguments.get("mission") else ""
                result = await self.request(caller, {"action": name, "mission": mission, "page": page})
                items = result.get("items")
                if not isinstance(items, list) or len(items) > 20 or result.get("page") != page or not isinstance(result.get("has_more"), bool):
                    raise ResearchError("invalid_data")
                lines = []
                for item in items:
                    row = object_value(item)
                    lines.append(identifier(row.get("id")) + " · " + text(row.get("title"), 300)[:35] + " · " + text(row.get("status"), 40))
                body = "\n".join(lines) or "No readable records in this view."
                body = body[:1500] + f"\n\nPage {page}." + (" More records: request the next page." if result["has_more"] else "")
                return BridgeReply(Page("BuildAndDo " + name, body, SITE_ORIGIN + ("/app/research" if name == "submissions" else "/app/" + name)))
            if name == "submission":
                result = await self.request(caller, {"action": name, "id": identifier(arguments.get("id"))})
                return BridgeReply(self.receipt(result))
            if name not in {"submit", "mission", "recover"}:
                raise ResearchError("invalid_data")
            access = await self.request(caller, {"action": "access"})
            if access.get("can_write") is not True:
                raise ResearchError("forbidden", 403)
            link = identifier(access.get("link_id"))
            previous = self.pending.get(scope)
            if name == "recover":
                if previous is None:
                    return BridgeReply(Page("No pending request", "Use /buildanddo submissions to find a saved source after a bot restart, or start a new request.", SITE_ORIGIN + "/app/research"))
                if previous.link != link:
                    self.pending.pop(scope)
                    raise ResearchError("forbidden", 403)
                request = previous
            else:
                if previous:
                    return BridgeReply(Page("Recover the previous request", "Use /buildanddo recover before starting a different submission. The saved source also appears on the website.", SITE_ORIGIN + "/app/research"))
                if len(self.pending) >= 100 or type(request_id) is not int or request_id <= 0:
                    raise ResearchError("unavailable")
                if name == "mission":
                    payload: dict[str, object] = {"title": text(arguments.get("title"), 160), "description": text(arguments.get("description", ""), 1000, empty=True)}
                    action = "mission.propose"
                else:
                    kind = text(arguments.get("kind"), 20)
                    if kind not in {"search", "url", "document", "audio", "video"}:
                        raise ResearchError("unsupported")
                    if (attachment is not None) != (kind in {"document", "audio", "video"}):
                        raise ResearchError("invalid_data")
                    if attachment and file_kind(attachment.name, attachment.size) != kind:
                        raise ResearchError("invalid_data")
                    payload = {"mission": identifier(arguments.get("mission")), "title": text(arguments.get("title"), 160),
                               "context": text(arguments.get("context", ""), 1200, empty=True), "kind": kind, "upload": "",
                               "input": text(arguments.get("input", ""), 500 if kind == "search" else 2048, empty=attachment is not None)}
                    if attachment and payload["input"]:
                        raise ResearchError("invalid_data")
                    action = "submit"
                request = Pending({"action": action, "payload": payload, "revision": 0, "request_key": f"discord_{request_id}"}, link, attachment, self.clock() + 600)
                self.pending[scope] = request
            payload = object_value(request.body["payload"])
            if request.attachment and not payload.get("upload"):
                payload["upload"] = await self.upload(caller, request.attachment, request.link)
            result = await self.request(caller, request.body, request.link)
            if result.get("action") != request.body["action"] or result.get("revision") != 1 or not isinstance(result.get("replayed"), bool):
                raise ResearchError("invalid_data")
            if result["action"] == "mission.propose":
                return BridgeReply(Page("Mission proposed", "Mission " + identifier(result.get("id")) + " is proposed. Complete its plan and approval in BuildAndDo before recording execution.", SITE_ORIGIN + "/app/missions"), str(request.body['request_key']))
            return BridgeReply(self.receipt(result), str(request.body['request_key']))
        except ResearchError as error:
            if error.status in {400, 401, 403, 404, 409} or error.reason in {"unsupported", "too_large", "unsafe_source"}:
                self.pending.pop(scope, None)
            raise
        finally:
            self.busy.discard(scope)

    def receipt(self, result: dict[str, object]) -> Page:
        """Display saved source state without exposing extracted private content."""
        source = identifier(result.get("id"))
        workspace = identifier(result.get('workspace'))
        status = text(result.get("status"), 40)
        if status not in {"queued", "processing", "blocked", "failed", "ready", "attached", "cancelled"}:
            raise ResearchError("invalid_data")
        return Page("Mission research", f"Submission: {source}\nState: {status}\n\nOpen BuildAndDo to review extracted material and attach it to evidence. A submission does not verify a mission.",
                    SITE_ORIGIN + "/app/research?workspace=" + workspace + "&source=" + source)

    async def close(self) -> None:
        """Discard transient intent and drain bounded transport on shutdown."""
        self.pending.clear()
        await self.io.close()
        await self.client.close()


def configured_bridge(env: Mapping[str, str]) -> ResearchBridge | None:
    """Enable mission commands only with explicit native service bindings."""
    bindings = bindings_from_env(env)
    if not bindings:
        return None
    if not env.get("BUILDANDDO_DISCORD_PB_TOKEN", ""):
        raise ResearchError("configuration")
    client = HttpClient(Endpoint(env.get("BUILDANDDO_POCKETBASE_URL", "")), lambda: env.get("BUILDANDDO_DISCORD_PB_TOKEN", ""),
                        io=BoundedIO(deadline=15), timeout=12)
    return ResearchBridge(client, bindings)
