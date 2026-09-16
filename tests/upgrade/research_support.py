# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/research_support.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     tests/upgrade/research-backend-driver.mjs
# EnumType:    Test
# EnumEdges:   CONSUMES tests/upgrade/research-backend-driver.mjs
# DAG Node:    none
# Intent:      Exercise cross-language client and processing contracts against one real policy execution with explicitly simulated native storage.
# ───────────────────────────────────────────────────────────────

"""Connect Python contracts to the persistent JavaScript policy fixture."""
from __future__ import annotations

import asyncio
import base64
from email.parser import BytesParser
from email.policy import default
import json
from pathlib import Path
import subprocess
import threading

from apps.research.contracts import ResearchError

ROOT = Path(__file__).resolve().parents[2]
GUILD, CHANNEL, USER = 12345678901234567, 23456789012345678, 34567890123456789


class Backend:
    """Keep one Node policy instance for both intake and processing clients."""

    def __init__(self, driver: str = 'tests/upgrade/research-backend-driver.mjs') -> None:
        self.process = subprocess.Popen(['node', driver], cwd=ROOT,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.lock = threading.Lock()

    async def call(self, request: dict) -> dict:
        """Route a request through actual JavaScript handlers without HTTP authentication claims."""
        def run() -> dict:
            with self.lock:
                self.process.stdin.write(json.dumps(request) + '\n')
                self.process.stdin.flush()
                line = self.process.stdout.readline()
                if not line:
                    raise AssertionError('The policy driver stopped without a receipt.')
                result = json.loads(line)
                if result.get('error'):
                    status = result['error']
                    raise ResearchError('forbidden' if status == 403 else 'conflict' if status == 409 else 'unavailable', status)
                return result['value']
        return await asyncio.to_thread(run)

    def client(self, actor: str) -> PolicyClient:
        """Bind a test client to a native-record identity in the storage double."""
        return PolicyClient(self, actor)

    def close(self) -> None:
        """Close the driver without leaving a child process behind."""
        self.process.stdin.close()
        self.process.wait(timeout=5)
        self.process.stdout.close()
        self.process.stderr.close()


class PolicyClient:
    """Replace HTTP transport while retaining real application policy and state."""

    def __init__(self, backend: Backend, actor: str) -> None:
        self.backend, self.actor = backend, actor
        self.calls = []
        self.lost = ''

    async def json(self, path: str, *, body: object = None, method: str = 'POST') -> dict:
        """Return the actual handler result, optionally losing one accepted response."""
        self.calls.append((path, body))
        result = await self.backend.call({'path': path, 'body': body, 'method': method, 'actor': self.actor})
        action = (body or {}).get('command', body or {}).get('action', '')
        if action and action == self.lost:
            self.lost = ''
            raise ResearchError('timeout')
        return result

    async def raw(self, path: str, **options: object) -> bytes:
        """Exercise multipart fields and protected file policy through the fixture."""
        if options.get('method') == 'POST':
            message = BytesParser(policy=default).parsebytes(('Content-Type: ' + options['content_type'] + '\r\n\r\n').encode() + options['body'])
            fields = {}
            for part in message.iter_parts():
                field = part.get_param('name', header='content-disposition')
                if field == 'asset':
                    data = part.get_payload(decode=True)
                    name = part.get_filename()
                else:
                    fields[field] = part.get_payload(decode=True).decode()
            result = await self.backend.call({'operation': 'upload', 'path': path, 'actor': self.actor, 'body': fields,
                                              'name': name, 'bytes': base64.b64encode(data).decode()})
            return json.dumps(result).encode()
        result = await self.backend.call({'path': path, 'actor': self.actor, 'method': 'GET'})
        return base64.b64decode(result['bytes'])

    async def close(self) -> None:
        """Leave process lifecycle to the owning test."""
