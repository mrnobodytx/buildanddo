# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/worker.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/research/processing.py, apps/pocketbase/pb_hooks/research.pb.js
# EnumType:    Adapter
# EnumEdges:   CONSUMES apps/research/processing.py; CONSUMES apps/pocketbase/pb_hooks/research.pb.js
# DAG Node:    none
# Intent:      Consume authorized research leases and persist actual parser results while rejecting stale or cancelled work.
# ───────────────────────────────────────────────────────────────

"""Run the opt-in research consumer through native PocketBase authentication."""
from __future__ import annotations

import argparse
import asyncio
from collections.abc import Mapping
from datetime import datetime, timezone
import json
import logging
import os
from urllib.parse import quote

from apps.research.contracts import Endpoint, MAX_FILE, ProcessorSettings, ResearchError, identifier, object_value, text
from apps.research.processing import Processor
from apps.research.transport import BoundedIO, HttpClient

logger = logging.getLogger("buildanddo.research")


class Worker:
    """Consume one workspace through a registered least-privilege user identity."""

    def __init__(self, client: HttpClient, workspace: str, processor: Processor) -> None:
        self.client, self.workspace, self.processor = client, identifier(workspace), processor
        self.prefix = f"/api/buildanddo/workspaces/{self.workspace}/research-worker"
        self._queue_page = 1

    async def command(self, action: str, payload: dict[str, object], revision: int, key: str) -> dict[str, object]:
        """Recover one uncertain mutation using the identical durable request key."""
        body = {"action": action, "payload": payload, "revision": revision, "request_key": key}
        for attempt in range(2):
            try:
                response = await self.client.json(self.prefix, body=body)
                if response.get("workspace") != self.workspace or response.get("action") != action or response.get("id") != payload.get("id") or (
                    response.get("revision") != revision + 1 or not isinstance(response.get("replayed"), bool)
                ):
                    raise ResearchError("invalid_data")
                return response
            except ResearchError as error:
                if attempt or error.status in {400, 401, 403, 404, 409} or error.reason not in {"timeout", "unavailable", "invalid_data"}:
                    raise
        raise ResearchError("unavailable")

    async def download(self, job: dict[str, object]) -> tuple[bytes | None, str]:
        """Read only the upload included in this worker's current leased job."""
        if not job.get("upload"):
            return None, ""
        file = object_value(job.get("file"))
        file_id = identifier(file.get("id"))
        if file_id != job["upload"]:
            raise ResearchError("invalid_data")
        name = text(file.get("name"), 180)
        asset = text(file.get("asset"), 240)
        if "/" in asset or "\\" in asset or file.get("size") is None:
            raise ResearchError("invalid_data")
        receipt = await self.client.json("/api/files/token", body={})
        token = text(receipt.get("token"), 4096)
        data = await self.client.raw(f"/api/files/research_uploads/{file_id}/{quote(asset, safe='')}?token={quote(token, safe='')}",
                                     maximum=MAX_FILE, json_response=False)
        if len(data) != file["size"]:
            raise ResearchError("invalid_data")
        return data, name

    async def process_job(self, claim: dict[str, object]) -> None:
        """Persist a real result or bounded failure without asserting mission success."""
        job = object_value(claim.get("job"))
        job_id = identifier(job.get("id"))
        revision, attempt = claim.get("revision"), job.get("attempt")
        if job.get("workspace") != self.workspace or job_id != claim.get("id") or type(revision) is not int or type(attempt) is not int:
            raise ResearchError("invalid_data")
        result: object = None
        failure = ""

        async def process() -> object:
            data, name = await self.download(job)
            return await self.processor.process(job, data, name)
        try:
            result = await asyncio.wait_for(process(), timeout=85)
        except TimeoutError:
            failure = "timeout"
        except ResearchError as error:
            failure = error.reason if error.reason in {"unavailable", "timeout", "unsupported", "invalid_data", "too_large", "unsafe_source", "capability_unavailable"} else "unavailable"
        except Exception:
            failure = "invalid_data"
        await self.command("complete", {"id": job_id, "attempt": attempt, "result": result, "failure": failure}, revision,
                           f"complete_{job_id}_{revision}_{attempt}")
        logger.info("research.processing.recorded", extra={"outcome": "failed" if failure else "ready", "reason": failure})

    async def once(self) -> bool:
        """Find bounded queue work, claim its revision and honor the lease fence."""
        for _ in range(10):
            page = self._queue_page
            queue = await self.client.json(self.prefix + f"/queue?page={page}", method="GET")
            if queue.get("workspace") != self.workspace or not isinstance(queue.get("items"), list) or queue.get("page") != page:
                raise ResearchError("invalid_data")
            items = queue["items"]
            if not isinstance(items, list) or len(items) > 20 or not isinstance(queue.get("has_more"), bool):
                raise ResearchError("invalid_data")
            for item in items:
                row = object_value(item)
                job_id, revision = identifier(row.get("id")), row.get("revision")
                if type(revision) is not int or revision < 1:
                    raise ResearchError("invalid_data")
                if row.get("status") == "processing":
                    try:
                        until = datetime.fromisoformat(text(row.get("lease_until"), 80).replace("Z", "+00:00"))
                        if until.tzinfo is None or until > datetime.now(timezone.utc):
                            continue
                    except ValueError:
                        continue
                elif row.get("status") != "queued":
                    continue
                try:
                    claim = await self.command("claim", {"id": job_id}, revision, f"claim_{job_id}_{revision}")
                    await self.process_job(claim)
                    return True
                except ResearchError as error:
                    if error.status in {403, 409}:
                        logger.info("research.claim.rejected", extra={"outcome": "not_applied", "reason": error.reason})
                        continue
                    raise
            # Resume the bounded scan next poll instead of repeatedly examining
            # the same revoked, reconfigured or exhausted submissions.
            self._queue_page = page + 1 if queue["has_more"] and page < 9999 else 1
            if not queue["has_more"]:
                break
        return False

    async def close(self) -> None:
        """Drain the parser and authenticated transport during explicit shutdown."""
        await self.processor.close()
        await self.client.close()


def configured(env: Mapping[str, str]) -> Worker:
    """Construct source adapters from explicit operator bindings only."""
    settings = ProcessorSettings.from_env(env)
    if not env.get("BUILDANDDO_RESEARCH_TOKEN", ""):
        raise ResearchError("configuration")
    client = HttpClient(Endpoint(env.get("BUILDANDDO_POCKETBASE_URL", "")), lambda: env.get("BUILDANDDO_RESEARCH_TOKEN", ""),
                        timeout=12, io=BoundedIO(deadline=15))
    if settings.firecrawl and env.get("BUILDANDDO_FIRECRAWL_EGRESS_GUARDED") != "1":
        raise ResearchError("configuration")
    firecrawl = HttpClient(settings.firecrawl, lambda: env.get("BUILDANDDO_FIRECRAWL_KEY", ""), bearer=True) if settings.firecrawl else None
    transcription = HttpClient(settings.transcription, lambda: env.get("BUILDANDDO_TRANSCRIPTION_KEY", ""), bearer=True) if settings.transcription else None
    return Worker(client, env.get("BUILDANDDO_RESEARCH_WORKSPACE", ""), Processor(settings, firecrawl=firecrawl, transcription=transcription))


class EventFormatter(logging.Formatter):
    """Keep processing logs free of source text, user identifiers and credentials."""

    def format(self, record: logging.LogRecord) -> str:
        """Serialize only fixed event and outcome fields."""
        return json.dumps({"event": record.getMessage(), "outcome": getattr(record, "outcome", ""), "reason": getattr(record, "reason", ""),
                           "srs_code": "SRS-BUILDANDDO-UPGRADE-001", "seat": "BITS-CODEGEN", "dispatch_id": "VCC-BUILDANDDO-UPGRADE-001"})


def main() -> int:
    """Start processing only after an explicit operator invocation."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="Process at most one queued submission.")
    args = parser.parse_args()
    handler = logging.StreamHandler()
    handler.setFormatter(EventFormatter())
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    try:
        worker = configured(os.environ)
    except ResearchError:
        logger.error("research.startup.blocked", extra={"reason": "configuration"})
        return 1

    async def run() -> int:
        try:
            while True:
                try:
                    await worker.once()
                except ResearchError as error:
                    logger.warning("research.processing.unavailable", extra={"reason": error.reason})
                    if args.once:
                        return 1
                if args.once:
                    return 0
                await asyncio.sleep(5)
        finally:
            await worker.close()
    try:
        return asyncio.run(run())
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
