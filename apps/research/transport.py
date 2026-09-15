# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/transport.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/research/contracts.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/research/contracts.py
# DAG Node:    none
# Intent:      Bound authenticated research transport without redirects, ambient credentials or automatic mutation retries.
# ───────────────────────────────────────────────────────────────

"""Use bounded standard-library HTTP for explicit service bindings."""
from __future__ import annotations

import asyncio
from collections.abc import Callable, Mapping
import json
import time
from typing import TypeVar
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
import uuid

from apps.research.contracts import Endpoint, MAX_FILE, ResearchError, file_kind, object_value

T = TypeVar("T")


class NoRedirect(HTTPRedirectHandler):
    """Prevent authorization or protected data from following redirects."""

    def redirect_request(self, req: Request, fp: object, code: int, msg: str, headers: object, newurl: str) -> None:
        raise ResearchError("unsafe_source")


def encode_json(value: object) -> bytes:
    """Encode strict JSON with actual Unicode and no non-finite values."""
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError):
        raise ResearchError("invalid_data") from None


def multipart(fields: Mapping[str, str], name: str, data: bytes, *, field: str = "file") -> tuple[bytes, str]:
    """Build one bounded multipart attachment without header injection."""
    file_kind(name, len(data))
    if field not in {"file", "asset"}:
        raise ResearchError("invalid_data")
    boundary = "buildanddo_" + uuid.uuid4().hex
    pieces: list[bytes] = []
    for key, value in fields.items():
        if not key.replace("_", "").isalnum() or len(value) > 2000:
            raise ResearchError("invalid_data")
        pieces.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n').encode())
    pieces.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{name}"\r\n'
                   'Content-Type: application/octet-stream\r\n\r\n').encode())
    pieces.extend([data, f"\r\n--{boundary}--\r\n".encode()])
    return b"".join(pieces), f"multipart/form-data; boundary={boundary}"


class BoundedIO:
    """Track running work even when its caller times out or is cancelled."""

    def __init__(self, *, slots: int = 2, deadline: float = 75) -> None:
        self.slots, self.deadline = slots, deadline
        self.tasks: set[asyncio.Task[object]] = set()
        self.closed = False

    async def run(self, operation: Callable[[], T]) -> T:
        """Refuse overflow instead of spawning replacement blocked threads."""
        if self.closed or len(self.tasks) >= self.slots:
            raise ResearchError("unavailable")
        task = asyncio.create_task(asyncio.to_thread(operation))
        self.tasks.add(task)

        def done(finished: asyncio.Task[T]) -> None:
            self.tasks.discard(finished)
            if not finished.cancelled():
                finished.exception()
        task.add_done_callback(done)
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=self.deadline)
        except TimeoutError:
            raise ResearchError("timeout") from None

    async def close(self) -> None:
        """Drain the tracked operations during explicit worker shutdown."""
        self.closed = True
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)


class HttpClient:
    """Send credentials only to an explicitly configured service endpoint."""

    def __init__(self, endpoint: Endpoint, credential: Callable[[], str] = lambda: "", *, bearer: bool = False,
                 io: BoundedIO | None = None, timeout: float = 60) -> None:
        self.endpoint, self.credential, self.bearer = endpoint, credential, bearer
        self.io, self.timeout = io or BoundedIO(), timeout

    async def raw(self, path: str, *, method: str = "GET", body: bytes | None = None,
                  content_type: str = "application/json", maximum: int = 2 * 1024 * 1024, json_response: bool = True) -> bytes:
        """Read a bounded response without proxy inheritance or redirection."""
        url = self.endpoint.path(path) if path else self.endpoint.url
        if body is not None and len(body) > MAX_FILE + 65536:
            raise ResearchError("too_large")
        credential = self.credential()

        def perform() -> bytes:
            headers = {"Accept": "application/json" if json_response else "*/*", "Accept-Encoding": "identity", "Cache-Control": "no-store"}
            if credential:
                headers["Authorization"] = ("Bearer " if self.bearer else "") + credential
            if body is not None:
                headers["Content-Type"] = content_type
            started = time.monotonic()
            try:
                with build_opener(ProxyHandler({}), NoRedirect()).open(Request(url, data=body, headers=headers, method=method), timeout=self.timeout) as response:
                    if response.headers.get("Content-Encoding", "identity").lower() != "identity" or (
                        json_response and response.headers.get_content_type() != "application/json"
                    ):
                        raise ResearchError("invalid_data")
                    chunks: list[bytes] = []
                    size = 0
                    while True:
                        if time.monotonic() - started > self.timeout:
                            raise ResearchError("timeout")
                        chunk = response.read(min(65536, maximum - size + 1))
                        if not chunk:
                            return b"".join(chunks)
                        size += len(chunk)
                        if size > maximum:
                            raise ResearchError("too_large")
                        chunks.append(chunk)
            except HTTPError as error:
                error.close()
                raise ResearchError("forbidden" if error.code in {401, 403} else "conflict" if error.code == 409 else "unavailable", error.code) from None
            except TimeoutError:
                raise ResearchError("timeout") from None
            except (URLError, OSError):
                raise ResearchError("unavailable") from None
        return await self.io.run(perform)

    async def json(self, path: str, *, body: object = None, method: str = "POST") -> dict[str, object]:
        """Require JSON objects and reject malformed provider responses."""
        raw = await self.raw(path, method=method, body=encode_json(body) if body is not None else None)
        return decode_json(raw)

    async def close(self) -> None:
        """Drain the owned bounded transport."""
        await self.io.close()


def decode_json(raw: bytes) -> dict[str, object]:
    """Reject non-JSON and non-finite provider bodies."""
    def invalid(_value: str) -> None:
        raise ValueError
    try:
        return object_value(json.loads(raw, parse_constant=invalid))
    except (ValueError, UnicodeDecodeError):
        raise ResearchError("invalid_data") from None
