# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/discordbot/public_data.py
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
# Intent:      Keep public source reads off the Discord event loop and bound their traffic, lifetime and failure evidence.
# ───────────────────────────────────────────────────────────────

"""Read fixed public resources with bounded blocking I/O off the event loop."""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, timezone
import http.client
import json
import time
from typing import NoReturn
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from .contracts import DataFault, DataUnavailable, SITE_ORIGIN

TIMEOUT = 4.0
TOTAL_TIMEOUT = 8.0


@dataclass(frozen=True)
class Resource:
    """Limit one fixed public resource."""

    path: str
    ttl: float
    max_bytes: int
    json: bool = True


RESOURCES = {
    "site": Resource("/", 10, 0, False),
    "roadmap": Resource("/roadmap-status.json", 30, 128_000),
    "release": Resource("/version.json", 30, 8192),
    "catalogue": Resource("/community-catalog.json", 300, 512_000),
}


@dataclass(frozen=True)
class Observation:
    """Keep the observed source and time attached to cached results."""

    data: object
    status: int
    observed_at: datetime
    elapsed_ms: int
    cached: bool = False


class NoRedirect(HTTPRedirectHandler):
    """Reject redirects instead of reading another host or resource."""

    def redirect_request(
        self, req: Request, fp: object, code: int, msg: str,
        headers: object, newurl: str,
    ) -> None:
        return None


def _invalid_constant(value: str) -> NoReturn:
    raise ValueError("Non-finite JSON is not source evidence.")


def read_resource(resource: Resource) -> Observation:
    """Read one fixed public endpoint in a worker, without credentials or redirects."""
    start = time.monotonic()
    request = Request(
        SITE_ORIGIN + resource.path,
        headers={
            "Accept": "application/json" if resource.json else "text/html",
            "Accept-Encoding": "identity",
            "User-Agent": "BuildAndDo-Community/1",
        },
    )
    try:
        # The targets are fixed public URLs. Do not use ambient proxy credentials.
        opener = build_opener(ProxyHandler({}), NoRedirect())
        with opener.open(request, timeout=TIMEOUT) as response:
            if not 200 <= response.status < 300:
                raise DataUnavailable(DataFault.HTTP)
            data: object = None
            if resource.json:
                content_type = response.headers.get_content_type()
                if content_type != "application/json" and not content_type.endswith("+json"):
                    raise DataUnavailable(DataFault.INVALID)
                if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                    raise DataUnavailable(DataFault.INVALID)
                parts: list[bytes] = []
                size = 0
                while True:
                    if time.monotonic() - start >= TOTAL_TIMEOUT:
                        raise DataUnavailable(DataFault.TIMEOUT)
                    chunk = response.read1(min(8192, resource.max_bytes + 1 - size))
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > resource.max_bytes:
                        raise DataUnavailable(DataFault.TOO_LARGE)
                    parts.append(chunk)
                try:
                    data = json.loads(b"".join(parts).decode("utf-8"), parse_constant=_invalid_constant)
                except (UnicodeError, ValueError, RecursionError) as error:
                    raise DataUnavailable(DataFault.INVALID) from error
            return Observation(
                data, response.status, datetime.now(timezone.utc),
                max(0, round((time.monotonic() - start) * 1000)),
            )
    except HTTPError as error:
        error.close()
        reason = DataFault.REDIRECT if 300 <= error.code < 400 else DataFault.HTTP
        raise DataUnavailable(reason) from error
    except TimeoutError:
        raise DataUnavailable(DataFault.TIMEOUT) from None
    except URLError as error:
        reason = DataFault.TIMEOUT if isinstance(error.reason, TimeoutError) else DataFault.UNAVAILABLE
        raise DataUnavailable(reason) from None
    except (OSError, http.client.HTTPException):
        raise DataUnavailable(DataFault.UNAVAILABLE) from None


@dataclass(frozen=True)
class CacheEntry:
    """Keep short-lived successes and bounded negative-cache reasons."""

    result: Observation | DataFault
    expires_at: float


class PublicClient:
    """Share in-flight reads and retain at most one entry for each fixed endpoint."""

    def __init__(
        self, reader: Callable[[Resource], Observation] = read_resource,
        clock: Callable[[], float] = time.monotonic,
        *, response_timeout: float = 10.0,
    ) -> None:
        self._reader, self._clock = reader, clock
        self._response_timeout = response_timeout
        self._slots = asyncio.Semaphore(2)
        self._cache: dict[str, CacheEntry] = {}
        self._flights: dict[str, asyncio.Task[Observation]] = {}
        self._closed = False
        self.cache_hits = 0
        self.reads = 0

    async def get(self, name: str) -> Observation:
        """Return a dated observation or a typed, sanitized availability failure."""
        if self._closed:
            raise DataUnavailable(DataFault.CLOSED)
        if name not in RESOURCES:
            raise DataUnavailable(DataFault.INVALID)
        cached = self._cache.get(name)
        if cached and self._clock() < cached.expires_at:
            self.cache_hits += 1
            if isinstance(cached.result, DataFault):
                raise DataUnavailable(cached.result)
            return replace(cached.result, cached=True)
        task = self._flights.get(name)
        if task is None:
            task = asyncio.create_task(self._load(name))
            self._flights[name] = task
            task.add_done_callback(self._observe_completion)
        # One cancelled interaction must not cancel another person's shared read.
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=self._response_timeout)
        except TimeoutError:
            # Keep the shared worker registered: a stalled resolver must not let
            # retries create unbounded threads, nor hold a Discord reply open.
            raise DataUnavailable(DataFault.TIMEOUT) from None

    @staticmethod
    def _observe_completion(task: asyncio.Task[Observation]) -> None:
        if not task.cancelled():
            task.exception()

    async def _load(self, name: str) -> Observation:
        resource = RESOURCES[name]
        try:
            async with self._slots:
                self.reads += 1
                result = await asyncio.to_thread(self._reader, resource)
            self._cache[name] = CacheEntry(result, self._clock() + resource.ttl)
            return result
        except DataUnavailable as error:
            self._cache[name] = CacheEntry(error.reason, self._clock() + 5)
            raise
        finally:
            self._flights.pop(name, None)

    async def close(self) -> None:
        """Finish bounded workers before closing, without abandoning thread work."""
        self._closed = True
        await asyncio.gather(*self._flights.values(), return_exceptions=True)
        self._cache.clear()
