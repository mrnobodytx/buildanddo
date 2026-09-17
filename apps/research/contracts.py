# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/contracts.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/contracts.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON scripts/discordbot/contracts.py
# DAG Node:    none
# Intent:      Bound source types, parser results and configured service endpoints without assuming deployed capabilities.
# ───────────────────────────────────────────────────────────────

"""Validate research inputs and provenance independently of provider SDKs."""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
import ipaddress
import re
import socket
from typing import NotRequired, TypedDict, cast
from urllib.parse import urlsplit

from scripts.discordbot.contracts import CitadelError

MAX_FILE = 20 * 1024 * 1024
EXTENSIONS = {"txt": "document", "md": "document", "pdf": "document", "docx": "document",
              "mp3": "audio", "wav": "audio", "m4a": "audio", "ogg": "audio", "mp4": "video", "webm": "video"}


class ResearchError(CitadelError):
    """Carry a bounded failure code without sensitive provider diagnostics."""

    def __init__(self, reason: str, status: int = 0) -> None:
        self.reason, self.status = reason, status
        super().__init__(reason)


def clip_text(value: str, maximum: int) -> str:
    """Bound an excerpt to JavaScript UTF-16 units without splitting a character."""
    try:
        return value[:maximum].encode('utf-16-le')[:maximum * 2].decode('utf-16-le', errors='ignore')
    except UnicodeError:
        raise ResearchError('invalid_data') from None


class Citation(TypedDict):
    """Identify a retrieved public source."""

    title: str
    url: str


class Parsed(TypedDict):
    """Retain bounded extracted text and its processing provenance."""

    text: str
    citations: list[Citation]
    processor: str
    version: str
    input_sha256: str
    truncated: bool
    blueprint: NotRequired[dict[str, object] | None]
    blueprint_failure: NotRequired[str]
    evaluation: NotRequired[dict[str, object] | None]
    evaluation_failure: NotRequired[str]


def object_value(value: object) -> dict[str, object]:
    """Require an object at a protocol boundary."""
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ResearchError("invalid_data")
    return cast(dict[str, object], value)


def text(value: object, maximum: int, *, empty: bool = False) -> str:
    """Require bounded printable source text."""
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()) or any(
        ord(char) < 32 and char not in "\t\n\r" for char in value
    ):
        raise ResearchError("invalid_data")
    return value.strip()


def identifier(value: object) -> str:
    """Require a bounded PocketBase record or workspace identifier."""
    result = text(value, 64)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", result):
        raise ResearchError("invalid_data")
    return result


def file_kind(name: str, size: int) -> str:
    """Reject unsupported or oversized explicit attachments."""
    text(name, 180)
    extension = name.rsplit(".", 1)[-1].lower()
    if extension not in EXTENSIONS or re.search(r'[\x00-\x1f/\\"]', name) or not 0 < size <= MAX_FILE:
        raise ResearchError("too_large" if size > MAX_FILE else "unsupported")
    return EXTENSIONS[extension]


def public_url(value: object, *, resolve: bool = False) -> str:
    """Reject private targets before a crawler receives user-controlled URLs."""
    url = text(value, 2048)
    try:
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.fragment or parsed.port not in (443, None) or (
            not re.fullmatch(r"[a-zA-Z0-9.-]+", host) or "." not in host or host.endswith(".") or
            host.rsplit(".", 1)[-1].lower() in {"localhost", "local", "internal", "test", "invalid", "example"}
        ) or any(char.isspace() or char == "\\" for char in url):
            raise ValueError
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise ValueError
        if resolve:
            addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
            if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
                raise ValueError
    except (ValueError, OSError):
        raise ResearchError("unsafe_source") from None
    return url


@dataclass(frozen=True)
class Endpoint:
    """Hold an operator-configured service URL without credentials."""

    url: str

    def __post_init__(self) -> None:
        try:
            value = urlsplit(self.url)
            host = value.hostname or ""
            if value.scheme not in {"http", "https"} or not host or value.username or value.password or value.query or value.fragment or (
                len(self.url) > 2048 or any(char.isspace() for char in self.url)
            ):
                raise ValueError
            if value.scheme == "http":
                # Plain HTTP is limited to explicit internal service names and IPs.
                try:
                    address = ipaddress.ip_address(host)
                    internal = address.is_private or address.is_loopback
                except ValueError:
                    internal = "." not in host or host.endswith((".internal", ".local"))
                if not internal:
                    raise ValueError
            value.port
        except ValueError:
            raise ResearchError("configuration") from None

    def path(self, path: str) -> str:
        """Append an application-owned relative endpoint."""
        if not path.startswith("/") or path.startswith("//") or ".." in path or "\\" in path or any(char.isspace() for char in path):
            raise ResearchError("configuration")
        return self.url.rstrip("/") + path


@dataclass(frozen=True)
class ProcessorSettings:
    """Separate Firecrawl from local documents and self-hosted transcription."""

    firecrawl: Endpoint | None = None
    firecrawl_version: str = "v2"
    transcription: Endpoint | None = None
    transcription_model: str = ""

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> ProcessorSettings:
        """Validate explicit endpoints without reading secret bindings."""
        firecrawl = env.get("BUILDANDDO_FIRECRAWL_URL", "").strip()
        version = env.get("BUILDANDDO_FIRECRAWL_VERSION", "v2")
        transcription = env.get("BUILDANDDO_TRANSCRIPTION_URL", "").strip()
        model = env.get("BUILDANDDO_TRANSCRIPTION_MODEL", "").strip()
        if version not in {"v1", "v2"} or (transcription and not model) or len(model) > 80:
            raise ResearchError("configuration")
        return cls(Endpoint(firecrawl) if firecrawl else None, version, Endpoint(transcription) if transcription else None, model)
