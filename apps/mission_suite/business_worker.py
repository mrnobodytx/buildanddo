# ─── CGRF Header ───────────────────────────────────────────────
# File:         apps/mission_suite/business_worker.py
# Stage:        07_BUILD
# SRS:          SRS-BUILDANDDO-UPGRADE-001
# CAPS:         pending
# CK:           pending
# Dispatch:     VCC-BUILDANDDO-UPGRADE-001
# Seat:         BITS-CODEGEN
# Owner:        Citadel Nexus Inc.
# Created:      2026-09-20
# Depends:      apps/research/processing.py, apps/research/transport.py, apps/pocketbase/pb_hooks/business-actions.js
# EnumType:     Service
# EnumEdges:    DEPENDS_ON apps/research/processing.py; DEPENDS_ON apps/research/transport.py; DEPENDS_ON apps/pocketbase/pb_hooks/business-actions.js
# DAG Node:     none
# Intent:       Execute approved business effects using existing bounded transport and retain uncertain outcomes for read-only reconciliation.
# ───────────────────────────────────────────────────────────────

"""Execute one registered business binding with durable dispatch and reconciliation."""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
import re
from typing import Protocol
import uuid

from apps.research.contracts import (
    Endpoint,
    ProcessorSettings,
    ResearchError,
    identifier,
    object_value,
    text,
)
from apps.research.processing import Processor
from apps.research.transport import BoundedIO, HttpClient

logger = logging.getLogger(__name__)


class Transport(Protocol):
    """Describe the existing bounded JSON transport at the worker boundary."""

    async def json(
        self, path: str, *, body: object = None, method: str = "POST"
    ) -> dict[str, object]: ...


class Extraction(Protocol):
    """Accept the existing Firecrawl processor without introducing another parser."""

    async def process(
        self, job: dict[str, object], data: bytes | None = None, name: str = ""
    ) -> object: ...


def stamp() -> str:
    """Return an actual UTC observation time."""
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def fingerprint(value: object) -> str:
    """Identify the exact sanitized provider response."""
    return hashlib.sha256(
        json.dumps(
            value,
            sort_keys=True,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
    ).hexdigest()


def relative(value: object) -> str:
    """Accept only a fixed operator-configured provider path."""
    path = text(value, 500)
    if not path.startswith("/") or any(
        part in path for part in ("..", "//", "\\", "?", "#")
    ):
        raise ResearchError("configuration")
    return path


@dataclass(frozen=True)
class Binding:
    """Bind one worker process to one workspace and one registered connector."""

    workspace: str
    provider: str
    name: str
    health_path: str
    operations: dict[str, str]
    reconcile_path: str = ""

    @classmethod
    def parse(cls, value: object) -> Binding:
        """Validate an operator-owned binding without accepting user-supplied endpoints."""
        source = object_value(value)
        if set(source) != {
            "workspace",
            "provider",
            "binding",
            "health_path",
            "operations",
            "reconcile_path",
        }:
            raise ResearchError("configuration")
        provider = text(source["provider"], 20)
        name = text(source["binding"], 64)
        if provider not in {"firecrawl", "n8n"} or not re.fullmatch(
            r"[a-z][a-z0-9._-]{1,63}", name
        ):
            raise ResearchError("configuration")
        operations = object_value(source["operations"])
        if len(operations) > 20 or any(
            not re.fullmatch(r"[a-z][a-z0-9_-]{1,63}", key) for key in operations
        ):
            raise ResearchError("configuration")
        reconciliation = text(source["reconcile_path"], 500, empty=True)
        if provider == "n8n" and (not operations or not reconciliation):
            raise ResearchError("configuration")
        return cls(
            identifier(source["workspace"]),
            provider,
            name,
            relative(source["health_path"]),
            {key: relative(path) for key, path in operations.items()},
            relative(reconciliation) if reconciliation else "",
        )


class BusinessWorker:
    """Drive already-approved jobs without replaying a possibly issued effect."""

    def __init__(
        self,
        backend: Transport,
        provider: Transport,
        binding: Binding,
        *,
        processor: Extraction | None = None,
    ) -> None:
        self.backend, self.provider, self.binding, self.processor = (
            backend,
            provider,
            binding,
            processor,
        )
        self.base = f"/api/buildanddo/workspaces/{binding.workspace}"

    async def command(
        self, action: str, revision: object, payload: dict[str, object]
    ) -> dict[str, object]:
        """Write a native command using a fresh retry identity and scoped authentication."""
        if type(revision) is not int or revision < 0:
            raise ResearchError("invalid_data")
        return await self.backend.json(
            self.base + "/business",
            body={
                "action": action,
                "revision": revision,
                "request_key": uuid.uuid4().hex,
                "payload": payload,
            },
        )

    async def health(self) -> None:
        """Publish an actual provider probe against the current requested configuration."""
        snapshot = await self.backend.json(self.base + "/integrations", method="GET")
        items = snapshot.get("items")
        if snapshot.get("workspace") != self.binding.workspace or not isinstance(
            items, list
        ):
            raise ResearchError("invalid_data")
        rows = [
            object_value(row)
            for row in items
            if isinstance(row, dict) and row.get("provider") == self.binding.provider
        ]
        if len(rows) != 1:
            raise ResearchError("configuration")
        row = rows[0]
        if object_value(row.get("configuration")).get("binding") != self.binding.name:
            raise ResearchError("configuration")
        if row.get("desired_enabled") is False:
            state, receipt = "disabled", "disabled-by-current-configuration"
        elif row.get("desired_enabled") is True:
            try:
                response = await self.provider.json(
                    self.binding.health_path, method="GET"
                )
                state = (
                    "healthy"
                    if response.get("success") is True
                    or response.get("status") == "ok"
                    or response.get("healthy") is True
                    else "degraded"
                )
                receipt = "probe-sha256:" + fingerprint(response)
            except ResearchError:
                state, receipt = "failed", "probe-failed:" + uuid.uuid4().hex
        else:
            raise ResearchError("invalid_data")
        await self.command(
            "integration.observe",
            row.get("revision"),
            {
                "provider": self.binding.provider,
                "binding": self.binding.name,
                "state": state,
                "observed_at": stamp(),
                "receipt_ref": receipt,
            },
        )

    def admits(self, job: dict[str, object]) -> bool:
        """Reject foreign scope and unconfigured operations before any provider call."""
        if (
            job.get("workspace") != self.binding.workspace
            or job.get("provider") != self.binding.provider
            or job.get("binding") != self.binding.name
        ):
            return False
        value = object_value(job.get("input"))
        seconds = value.get("max_seconds")
        if (
            type(seconds) is not int
            or not 5 <= seconds <= 60
            or not re.fullmatch(r"[a-f0-9]{64}", str(job.get("effect_key", "")))
        ):
            raise ResearchError("invalid_data")
        if (
            self.binding.provider == "n8n"
            and object_value(value.get("parameters")).get("operation")
            not in self.binding.operations
        ):
            return False
        return True

    async def jobs(self) -> list[dict[str, object]]:
        """Read at most ten explicit pages without treating partial work as idle capacity."""
        result: list[dict[str, object]] = []
        for page in range(1, 11):
            response = await self.backend.json(
                self.base
                + f"/business?page={page}&worker=1&provider={self.binding.provider}&binding={self.binding.name}",
                method="GET",
            )
            items = response.get("items")
            if response.get("workspace") != self.binding.workspace or not isinstance(
                items, list
            ):
                raise ResearchError("invalid_data")
            for value in items:
                row = object_value(value)
                if self.admits(row):
                    result.append(row)
            if response.get("has_more") is False:
                return result
            if response.get("has_more") is not True:
                raise ResearchError("invalid_data")
        raise ResearchError("scan_limit")

    def n8n_result(
        self, job: dict[str, object], response: dict[str, object]
    ) -> dict[str, object]:
        """Accept only a provider receipt that identifies the exact issued effect."""
        if response.get("effect_key") != job["effect_key"] or response.get(
            "status"
        ) not in {"succeeded", "failed"}:
            raise ResearchError("invalid_data")
        execution = text(response.get("execution_id"), 100)
        if response["status"] == "succeeded":
            output: dict[str, object] = {
                "effect_key": job["effect_key"],
                "execution_id": execution,
                "summary": text(response.get("summary"), 1600),
            }
        else:
            output = {
                "reason": "Provider reported a failed execution; inspect its retained receipt."
            }
        return {
            "status": response["status"],
            "observed_at": stamp(),
            "receipt_ref": f"n8n:{execution}:{fingerprint(response)}",
            "output": output,
        }

    async def execute(self, job: dict[str, object]) -> dict[str, object]:
        """Perform the one allowed call after the backend records dispatch."""
        parameters = object_value(object_value(job["input"])["parameters"])
        if self.binding.provider == "firecrawl":
            if self.processor is None:
                raise ResearchError("capability_unavailable")
            url = text(parameters.get("url"), 2048)
            parsed = object_value(
                await self.processor.process({"kind": "url", "input": url})
            )
            citations = parsed.get("citations")
            if (
                not isinstance(citations, list)
                or not citations
                or object_value(citations[0]).get("url") != url
            ):
                raise ResearchError("invalid_data")
            content = text(parsed.get("text"), 16000)
            return {
                "status": "succeeded",
                "observed_at": stamp(),
                "receipt_ref": "firecrawl:" + fingerprint(parsed),
                "output": {
                    "url": url,
                    "title": text(object_value(citations[0]).get("title"), 200),
                    "text": content,
                    "content_sha256": hashlib.sha256(content.encode()).hexdigest(),
                    "truncated": parsed.get("truncated") is True,
                },
            }
        operation = text(parameters.get("operation"), 64)
        response = await self.provider.json(
            self.binding.operations[operation],
            body={
                "schema_version": "buildanddo.business-effect/v1",
                "workspace": self.binding.workspace,
                "effect_key": job["effect_key"],
                "operation": operation,
                "input": object_value(parameters.get("input")),
                "mission": job.get("mission"),
                "run": job.get("run"),
                "release_context": job.get("release_context"),
            },
        )
        return self.n8n_result(job, response)

    async def run(self, job: dict[str, object]) -> str:
        """Claim once, persist dispatch, and preserve ambiguity on any uncertain response."""
        if not self.admits(job):
            raise ResearchError("forbidden")
        current = await self.command(
            "action.claim", job.get("revision"), {"id": identifier(job.get("id"))}
        )
        current = await self.command(
            "action.begin",
            current.get("revision"),
            {"id": current["id"], "lease_id": current["lease_id"]},
        )
        if current.get("status") != "dispatched" or not self.admits(current):
            raise ResearchError("invalid_data")
        try:
            seconds = object_value(current["input"])["max_seconds"]
            if type(seconds) is not int:
                raise ResearchError("invalid_data")
            async with asyncio.timeout(seconds):
                result = await self.execute(current)
            await self.command(
                "action.complete",
                current["revision"],
                {
                    "id": current["id"],
                    "lease_id": current["lease_id"],
                    "result": result,
                },
            )
            return text(result["status"], 20)
        except (ResearchError, TimeoutError):
            # Even an HTTP error can arrive after the provider committed its effect.
            # If this write also fails, the saved dispatched state still prevents retry.
            try:
                await self.command(
                    "action.hold",
                    current["revision"],
                    {
                        "id": current["id"],
                        "lease_id": current["lease_id"],
                        "reason": "reconciliation_required",
                    },
                )
            except ResearchError:
                pass
            return "hold"

    async def reconcile(self, job: dict[str, object]) -> str:
        """Read an existing provider receipt without issuing a second effect."""
        if (
            not self.admits(job)
            or self.binding.provider != "n8n"
            or job.get("status") not in {"hold", "dispatched"}
        ):
            raise ResearchError("forbidden")
        response = await self.provider.json(
            self.binding.reconcile_path.rstrip("/") + "/" + str(job["effect_key"]),
            method="GET",
        )
        result = self.n8n_result(job, response)
        await self.command(
            "action.reconcile",
            job.get("revision"),
            {
                "id": job["id"],
                "lease_id": text(job.get("lease_id"), 80),
                "result": result,
            },
        )
        return text(result["status"], 20)


async def serve(once: bool, reconcile: bool) -> None:
    """Run an explicitly provisioned worker using runtime-only credential bindings."""
    try:
        binding = Binding.parse(
            json.loads(os.environ.get("BUILDANDDO_BUSINESS_WORKER", "{}"))
        )
        backend_url = Endpoint(os.environ["BUILDANDDO_POCKETBASE_URL"])
        provider_url = Endpoint(os.environ["BUILDANDDO_BUSINESS_PROVIDER_URL"])
        if not os.environ.get("BUILDANDDO_WORKER_TOKEN"):
            raise ResearchError("configuration")
    except (KeyError, ValueError):
        raise ResearchError("configuration") from None
    io = BoundedIO(slots=2, deadline=65)
    backend = HttpClient(
        backend_url,
        lambda: os.environ.get("BUILDANDDO_WORKER_TOKEN", ""),
        io=io,
        timeout=20,
    )
    provider = HttpClient(
        provider_url,
        lambda: os.environ.get("BUILDANDDO_BUSINESS_PROVIDER_TOKEN", ""),
        bearer=True,
        io=io,
        timeout=60,
    )
    processor = (
        Processor(ProcessorSettings(firecrawl=provider_url), firecrawl=provider)
        if binding.provider == "firecrawl"
        else None
    )
    worker = BusinessWorker(backend, provider, binding, processor=processor)
    try:
        while True:
            await worker.health()
            for job in await worker.jobs():
                state = job.get("status")
                try:
                    if (
                        state == "queued"
                        or state == "claimed"
                        and datetime.fromisoformat(
                            str(job["lease_until"]).replace("Z", "+00:00")
                        )
                        <= datetime.now(timezone.utc)
                    ):
                        outcome = await worker.run(job)
                    elif (
                        reconcile
                        and state in {"hold", "dispatched"}
                        and job.get("lease_id")
                    ):
                        outcome = await worker.reconcile(job)
                    else:
                        continue
                    logger.info(
                        "business_action_result",
                        extra={
                            "workspace": binding.workspace,
                            "job_id": job["id"],
                            "outcome": outcome,
                            "srs_code": "SRS-BUILDANDDO-UPGRADE-001",
                            "seat": "BITS-CODEGEN",
                        },
                    )
                except ResearchError as error:
                    logger.warning(
                        "business_action_unavailable",
                        extra={"job_id": job.get("id"), "reason": error.reason},
                    )
            if once:
                break
            await asyncio.sleep(10)
    finally:
        if processor:
            await processor.io.close()
        await io.close()


def main() -> int:
    """Start the worker only through an explicit operator invocation."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    parser.add_argument(
        "--reconcile",
        action="store_true",
        help="Read retained n8n results for uncertain effects; never resubmit them.",
    )
    options = parser.parse_args()
    try:
        asyncio.run(serve(options.once, options.reconcile))
    except ResearchError as error:
        logger.error("business_worker_stopped", extra={"reason": error.reason})
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
