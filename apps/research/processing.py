# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/research/processing.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/research/transport.py, apps/research/documents.py, apps/research/blueprints.py, apps/decision/workloads/blueprint_evaluation.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES apps/research/transport.py; CONSUMES apps/research/documents.py; CONSUMES apps/research/blueprints.py; CONSUMES apps/decision/workloads/blueprint_evaluation.py
# DAG Node:    none
# Intent:      Produce actual source excerpts through self-hosted Firecrawl, local document parsing and configured audio transcription.
# ───────────────────────────────────────────────────────────────

"""Dispatch source extraction to an explicitly configured capability."""
from __future__ import annotations

from collections.abc import Callable
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

from apps.research.contracts import Citation, Parsed, ProcessorSettings, ResearchError, clip_text, file_kind, object_value, public_url, text
from apps.research.transport import BoundedIO, HttpClient, decode_json, multipart
from apps.research.blueprints import Blueprint
from apps.decision.workloads.blueprint_evaluation import DecideFn, evaluate_blueprint
from apps.decision.contract import decide

ROOT = Path(__file__).resolve().parents[2]


def parse_document(data: bytes, name: str, *, blueprint: bool = False) -> dict[str, object]:
    """Run the document parser with a deadline and automatic temporary-file cleanup."""
    with tempfile.TemporaryDirectory(prefix="buildanddo-research-") as folder:
        path = Path(folder) / "input"
        path.write_bytes(data)
        try:
            module = 'apps.research.blueprints' if blueprint else 'apps.research.documents'
            result = subprocess.run([sys.executable, "-m", module, str(path), "--name", name],
                                    cwd=ROOT, capture_output=True, timeout=30, check=False)
        except subprocess.TimeoutExpired:
            raise ResearchError("timeout") from None
    if len(result.stdout) > (300000 if blueprint else 150000):
        raise ResearchError("too_large")
    parsed = decode_json(result.stdout)
    if result.returncode or "failure" in parsed:
        code = parsed.get("failure")
        raise ResearchError(str(code) if code in {"unsupported", "too_large", "capability_unavailable", "invalid_data"} else "invalid_data")
    return parsed


def parse_blueprint_document(data: bytes, name: str) -> dict[str, object]:
    """Use the same child-process deadline and temporary-file lifecycle for blueprints."""
    return parse_document(data, name, blueprint=True)


class Processor:
    """Separate public web extraction from private file transcription."""

    def __init__(self, settings: ProcessorSettings, *, firecrawl: HttpClient | None = None,
                 transcription: HttpClient | None = None, guard: Callable[[object], str] = lambda value: public_url(value, resolve=True),
                 documents: Callable[[bytes, str], dict[str, object]] = parse_document,
                 blueprints: Callable[[bytes, str], dict[str, object]] = parse_blueprint_document,
                 decide_fn: DecideFn = decide) -> None:
        self.settings = settings
        self.firecrawl = firecrawl
        self.transcription = transcription
        self.guard, self.documents, self.io = guard, documents, BoundedIO(slots=1, deadline=40)
        self.blueprints, self.decide_fn = blueprints, decide_fn

    async def process(self, job: dict[str, object], data: bytes | None = None, name: str = "") -> Parsed:
        """Extract source text without approving, verifying or executing its instructions."""
        kind = job.get("kind")
        if job.get('mode') == 'blueprint':
            if kind != 'document' or data is None:
                raise ResearchError('invalid_data')
            return await self.process_blueprint(data, name)
        source = text(job.get("input"), 2048, empty=True)
        digest = hashlib.sha256(data if data is not None else source.encode()).hexdigest()
        citations: list[Citation] = []
        truncated = False
        if kind in {"search", "url"}:
            if not self.firecrawl or not self.settings.firecrawl:
                raise ResearchError("capability_unavailable")
            if data is not None:
                raise ResearchError("invalid_data")
            if kind == "url":
                await self.io.run(lambda: self.guard(source))
                body: dict[str, object] = {"url": source, "formats": ["markdown"], "onlyMainContent": True, "timeout": 30000}
                response = await self.firecrawl.json(f"/{self.settings.firecrawl_version}/scrape", body=body)
                if response.get("success") is not True:
                    raise ResearchError("unavailable")
                record = object_value(response.get("data"))
                value = text(record.get("markdown"), 1000000)
                metadata = object_value(record.get("metadata", {}))
                resolved = public_url(metadata.get("sourceURL", source))
                citations = [{"title": clip_text(str(metadata.get("title") or source), 160), "url": resolved}]
            else:
                text(source, 500)
                response = await self.firecrawl.json(f"/{self.settings.firecrawl_version}/search", body={"query": source, "limit": 5})
                if response.get("success") is not True:
                    raise ResearchError("unavailable")
                records = response.get("data")
                if self.settings.firecrawl_version == "v2":
                    records = object_value(records).get("web")
                if not isinstance(records, list) or not records or len(records) > 10:
                    raise ResearchError("invalid_data")
                parts: list[str] = []
                for entry in records:
                    row = object_value(entry)
                    url = public_url(row.get("url"))
                    title = clip_text(text(row.get("title"), 500), 160)
                    excerpt = text(row.get("markdown") or row.get("description"), 200000)
                    citations.append({"title": title, "url": url})
                    parts.append(title + "\n" + url + "\n" + excerpt)
                value = "\n\n".join(parts)
            processor, version = "firecrawl", self.settings.firecrawl_version
        else:
            if data is None or file_kind(name, len(data)) != kind:
                raise ResearchError("invalid_data")
            if kind == "document":
                document = await self.io.run(lambda: self.documents(data, name))
                value = text(document.get("text"), 16000)
                version = text(document.get("version"), 80)
                if not isinstance(document.get("truncated"), bool):
                    raise ResearchError("invalid_data")
                truncated, processor = bool(document["truncated"]), "local-document"
            elif kind in {"audio", "video"}:
                if not self.transcription or not self.settings.transcription or not self.settings.transcription_model:
                    raise ResearchError("capability_unavailable")
                body_bytes, content_type = multipart({"model": self.settings.transcription_model, "response_format": "json"}, name, data)
                response = decode_json(await self.transcription.raw("", method="POST", body=body_bytes, content_type=content_type))
                value = text(response.get("text"), 1000000)
                processor, version = "self-hosted-transcription", self.settings.transcription_model
            else:
                raise ResearchError("unsupported")
        excerpt = clip_text(value, 16000)
        result: Parsed = {"text": excerpt, "citations": citations, "processor": processor, "version": version,
                          "input_sha256": digest, "truncated": truncated or excerpt != value}
        # Stay inside the server command's byte budget even with multibyte text.
        while len(json.dumps(result, ensure_ascii=False).encode()) > 55000:
            result["text"] = result["text"][:max(1, len(result["text"]) - 1000)]
            result["truncated"] = True
        return result

    async def process_blueprint(self, data: bytes, name: str) -> Parsed:
        """Keep admitted text if structuring or A0 evaluation is unavailable."""
        if file_kind(name, len(data)) != 'document':
            raise ResearchError('unsupported')
        try:
            document = await self.io.run(lambda: self.blueprints(data, name))
        except Exception:
            # The fallback still performs every original document admission check.
            document = await self.io.run(lambda: self.documents(data, name))
            document['blueprint_failure'] = 'structure_failed'
        result: Parsed = {'text': text(document.get('text'), 16000), 'citations': [], 'processor': 'local-document',
                          'version': text(document.get('version'), 80), 'input_sha256': hashlib.sha256(data).hexdigest(),
                          'truncated': False, 'blueprint': None, 'blueprint_failure': 'structure_failed',
                          'evaluation': None, 'evaluation_failure': ''}
        if type(document.get('truncated')) is not bool:
            raise ResearchError('invalid_data')
        result['truncated'] = bool(document['truncated'])
        if document.get('blueprint') is not None:
            try:
                blueprint = Blueprint.from_dict(document['blueprint'])
                if blueprint.source_hash != result['input_sha256'] or blueprint.source_file != name:
                    raise ResearchError('invalid_data')
                result.update({'blueprint': blueprint.to_dict(), 'blueprint_failure': '', 'processor': 'local-blueprint',
                               'truncated': result['truncated'] or blueprint.truncated})
            except Exception:
                blueprint = None
            if blueprint is not None:
                try:
                    result['evaluation'] = (await evaluate_blueprint(blueprint, self.decide_fn)).to_dict()
                except Exception:
                    result['evaluation_failure'] = 'decision_failed'
        elif document.get('blueprint_failure') == 'no_requirements':
            result['blueprint_failure'] = 'no_requirements'
        # Structured data gets its own bounded worker envelope. The original flat
        # excerpt still fits the unchanged research result collection contract.
        while len(json.dumps({'text': result['text']}, ensure_ascii=False).encode()) > 54000:
            result['text'] = result['text'][:-1000]
            result['truncated'] = True
        if len(json.dumps(result, ensure_ascii=False).encode()) > 450000:
            result['evaluation'], result['evaluation_failure'] = None, 'decision_failed'
        return result

    async def close(self) -> None:
        """Drain provider and document work before releasing the worker."""
        await self.io.close()
        for client in (self.firecrawl, self.transcription):
            if client:
                await client.close()
