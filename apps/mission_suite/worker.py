# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/mission_suite/worker.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/mission_suite/engine.py, apps/mission_suite/bundle.py, apps/research/transport.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES apps/mission_suite/engine.py; DEPENDS_ON apps/mission_suite/bundle.py; DEPENDS_ON apps/research/transport.py
# DAG Node:    none
# Intent:      Execute scoped suite leases on an operator-selected box through the existing native-auth API and durable retries.
# ───────────────────────────────────────────────────────────────

"""Consume mission jobs over one authenticated API without listening on a port."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from collections.abc import Mapping
from typing import Protocol

from apps.mission_suite.bundle import source_fingerprint
from apps.mission_suite.engine import VERSION, SuiteError, run_suite
from apps.research.contracts import (
    Endpoint,
    ResearchError,
    identifier,
    object_value,
    text,
)
from apps.research.transport import BoundedIO, HttpClient

logger = logging.getLogger("buildanddo.mission_suite")


class Client(Protocol):
    """Describe the existing authenticated transport boundary."""

    async def json(
        self, path: str, *, body: object = None, method: str = "POST"
    ) -> dict[str, object]: ...
    async def close(self) -> None: ...


class Worker:
    """Process one workspace with immutable inputs and fenced write receipts."""

    def __init__(self, client: Client, workspace: str) -> None:
        self.client = client
        self.workspace = identifier(workspace)
        self.path = f"/api/buildanddo/workspaces/{self.workspace}/suite"
        self.source_sha256 = source_fingerprint()
        self.page = 1

    async def request(
        self,
        action: str,
        mission: str,
        payload: dict[str, object],
        revision: int,
        key: str,
    ) -> dict[str, object]:
        """Recover an uncertain reply by resending the exact same command."""
        body = {
            "action": action,
            "mission": mission,
            "payload": payload,
            "revision": revision,
            "request_key": key,
        }
        for attempt in range(2):
            try:
                result = await self.client.json(self.path, body=body)
                if (
                    result.get("workspace") != self.workspace
                    or result.get("mission") != mission
                ):
                    raise ResearchError("invalid_data")
                if action != "poll" and (
                    result.get("action") != action
                    or result.get("id") != payload.get("id")
                    or result.get("revision") != revision + 1
                    or type(result.get("replayed")) is not bool
                ):
                    raise ResearchError("invalid_data")
                return result
            except ResearchError as error:
                if (
                    attempt
                    or error.status in {400, 401, 403, 404, 409}
                    or error.reason not in {"timeout", "unavailable", "invalid_data"}
                ):
                    raise
        raise ResearchError("unavailable")

    async def process(self, claim: dict[str, object]) -> None:
        """Persist a computed result only for the current source-bound lease."""
        job = object_value(claim.get("job"))
        job_id, mission = identifier(job.get("id")), identifier(job.get("mission"))
        revision, attempt = job.get("revision"), job.get("attempt")
        if (
            job.get("workspace") != self.workspace
            or job_id != claim.get("id")
            or job.get("source_sha256") != self.source_sha256
            or (
                type(revision) is not int
                or type(attempt) is not int
                or revision != claim.get("revision")
                or attempt != claim.get("attempt")
            )
        ):
            raise ResearchError("invalid_data")
        raw = text(job.get("input_canonical"), 300000)
        if hashlib.sha256(raw.encode()).hexdigest() != job.get("input_sha256"):
            raise ResearchError("invalid_data")
        started = time.monotonic()
        failure = ""
        encoded = ""
        try:
            result = await asyncio.to_thread(run_suite, raw)
            if (
                result.get("tenant_id") != self.workspace
                or result.get("mission_id") != mission
                or result.get("source_sha256") != self.source_sha256
            ):
                raise SuiteError("invalid_data")
            encoded = json.dumps(
                result, sort_keys=True, separators=(",", ":"), allow_nan=False
            )
            if len(encoded.encode()) > 650000:
                raise SuiteError("too_large")
        except SuiteError as error:
            failure = (
                error.reason
                if error.reason
                in {
                    "invalid_data",
                    "rights_denied",
                    "clock_invalid",
                    "identity_conflict",
                    "unsupported",
                    "too_large",
                }
                else "invalid_data"
            )
            encoded = ""
        except (ValueError, UnicodeError, RecursionError):
            failure = "invalid_data"
            encoded = ""
        await self.request(
            "complete",
            mission,
            {
                "id": job_id,
                "attempt": attempt,
                "result_canonical": encoded,
                "failure": failure,
                "source_sha256": self.source_sha256,
            },
            revision,
            f"suite_complete_{job_id}_{revision}_{attempt}",
        )
        logger.info(
            "suite.run.recorded",
            extra={
                "outcome": "failed" if failure else "ready",
                "reason": failure,
                "duration_ms": round((time.monotonic() - started) * 1000),
                "version": VERSION,
                "source_sha256": self.source_sha256,
                "tenant_id": self.workspace,
                "mission_id": mission,
                "correlation_id": job_id,
            },
        )

    async def once(self) -> bool:
        """Process at most one eligible job and retain bounded queue progress."""
        for _ in range(10):
            page = self.page
            queue = await self.request(
                "poll", "", {"page": page}, 0, f"suite_poll_page_{page:04d}"
            )
            items = queue.get("items")
            if (
                not isinstance(items, list)
                or len(items) > 20
                or queue.get("page") != page
                or type(queue.get("has_more")) is not bool
            ):
                raise ResearchError("invalid_data")
            for value in items:
                row = object_value(value)
                job_id = identifier(row.get("id"))
                mission = identifier(row.get("mission"))
                revision = row.get("revision")
                if (
                    row.get("workspace") != self.workspace
                    or type(revision) is not int
                    or revision < 1
                ):
                    raise ResearchError("invalid_data")
                try:
                    claim = await self.request(
                        "claim",
                        mission,
                        {"id": job_id},
                        revision,
                        f"suite_claim_{job_id}_{revision}",
                    )
                    await self.process(claim)
                    return True
                except ResearchError as error:
                    if error.status in {403, 409}:
                        logger.info(
                            "suite.lease.rejected",
                            extra={
                                "outcome": "not_applied",
                                "reason": error.reason,
                                "tenant_id": self.workspace,
                                "mission_id": mission,
                                "correlation_id": job_id,
                                "source_sha256": self.source_sha256,
                            },
                        )
                        continue
                    raise
            self.page = page + 1 if queue["has_more"] and page < 9999 else 1
            if not queue["has_more"]:
                break
        return False

    async def close(self) -> None:
        """Drain the existing authenticated transport on shutdown."""
        await self.client.close()


def configured(env: Mapping[str, str]) -> Worker:
    """Bind an existing native PocketBase user credential supplied by the operator."""
    if not env.get("BUILDANDDO_SUITE_TOKEN"):
        raise ResearchError("configuration")
    client = HttpClient(
        Endpoint(env.get("BUILDANDDO_POCKETBASE_URL", "")),
        lambda: env.get("BUILDANDDO_SUITE_TOKEN", ""),
        timeout=12,
        io=BoundedIO(deadline=15),
    )
    return Worker(client, env.get("BUILDANDDO_SUITE_WORKSPACE", ""))


class EventFormatter(logging.Formatter):
    """Log fixed diagnostic fields without document or observation contents."""

    def format(self, record: logging.LogRecord) -> str:
        """Serialize only bounded, content-free source execution evidence."""
        return json.dumps(
            {
                "event": record.getMessage(),
                "outcome": getattr(record, "outcome", ""),
                "reason": getattr(record, "reason", ""),
                "duration_ms": getattr(record, "duration_ms", None),
                "version": VERSION,
                "source_sha256": getattr(record, "source_sha256", ""),
                "tenant_id": getattr(record, "tenant_id", ""),
                "mission_id": getattr(record, "mission_id", ""),
                "correlation_id": getattr(record, "correlation_id", ""),
                "srs_code": "SRS-BUILDANDDO-UPGRADE-001",
                "dispatch_id": "VCC-BUILDANDDO-UPGRADE-001",
                "seat": "BITS-CODEGEN",
            }
        )
