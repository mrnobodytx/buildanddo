# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_blueprints_native.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/pocketbase/pb_hooks/blueprint.pb.js
# EnumType:    Test
# EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/blueprint.pb.js
# DAG Node:    none
# Intent:      Verify actual PocketBase multipart, auth, protected files and blueprint persistence in a disposable loopback database.
# ───────────────────────────────────────────────────────────────

"""Exercise installed PocketBase and pypdf without connecting to shared services."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import unittest
from urllib.parse import quote

from apps.research.contracts import Endpoint, ProcessorSettings, ResearchError
from apps.research.processing import Processor
from apps.research.transport import HttpClient, decode_json, multipart
from apps.research.worker import Worker
from tests.upgrade.blueprint_fixture import pdf_bytes
from tests.upgrade.test_dossier_native import BINARY, NativeServer, ROOT, WORKSPACE
import hashlib

NATIVE_PDF = importlib.util.find_spec('pypdf') is not None


class BlueprintServer(NativeServer):
    """Extend the existing isolated native research fixture with blueprint hooks."""

    def __init__(self, binary: str) -> None:
        super().__init__(binary)
        try:
            self.stop()
            for name in ('blueprint.pb.js', 'workspace-blueprints.js', 'mission-research.js', 'mission-policy.js', 'research.pb.js'):
                shutil.copyfile(ROOT / 'apps/pocketbase/pb_hooks' / name, self.root / 'hooks' / name)
            migration = '1790500000_workspace_blueprints.js'
            shutil.copyfile(ROOT / 'apps/pocketbase/pb_migrations' / migration, self.root / 'migrations' / migration)
            (self.root / 'migrations/1790499999_blueprint_fixture.js').write_text("""
migrate((app) => {
    const record = new Record(app.findCollectionByNameOrId('workspace_integrations'));
    record.set('workspace', 'workspacealpha1');
    record.set('provider', 'firecrawl');
    record.set('desired_enabled', true);
    record.set('configuration', { binding: 'fixture', mode: 'read' });
    record.set('revision', 1);
    app.save(record);
}, () => {});
""")
            bindings = json.loads(self.environment['BUILDANDDO_RESEARCH_BINDINGS'])
            bindings[0]['capabilities'] = ['document']
            self.environment['BUILDANDDO_RESEARCH_BINDINGS'] = json.dumps(bindings)
            self.migrate('up')
            self.start()
        except BaseException:
            self.close()
            raise

    def migrate(self, direction: str, count: str = '') -> None:
        """Apply migration commands only to this fixture's temporary database."""
        result = subprocess.run([self.binary, 'migrate', direction, *([count] if count else []), *self.paths()],
                                input='y\n', text=True, cwd=self.root, env=self.environment,
                                stdout=self.log, stderr=subprocess.STDOUT, timeout=30, check=False)
        if result.returncode:
            raise AssertionError('The isolated blueprint migration failed.')


@unittest.skipUnless(BINARY and Path(BINARY).is_file() and NATIVE_PDF, 'PocketBase and pypdf are required for native blueprint acceptance')
class NativeBlueprintTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.server = BlueprintServer(BINARY)
        self.addCleanup(self.server.close)
        self.editor = HttpClient(Endpoint(self.server.base), lambda: self.editor_token)
        self.editor_token = self.server.login('alice')
        worker_token = self.server.login('worker')
        self.worker = Worker(HttpClient(Endpoint(self.server.base), lambda: worker_token), WORKSPACE, Processor(ProcessorSettings()))
        self.addAsyncCleanup(self.worker.close)
        self.addAsyncCleanup(self.editor.close)
        self.prefix = f'/api/buildanddo/workspaces/{WORKSPACE}/blueprints'

    async def upload(self) -> dict:
        """Submit the reproducible PDF using the production multipart helper."""
        data = pdf_bytes()
        body, content_type = multipart({'request_key': 'native_blueprint_upload01', 'input_sha256': hashlib.sha256(data).hexdigest()},
                                       'sample.pdf', data, field='asset')
        return decode_json(await self.editor.raw(self.prefix, method='POST', body=body, content_type=content_type))

    async def test_native_round_trip_duplicate_receipt_and_locked_collection_access(self) -> None:
        saved = await self.upload()
        self.assertEqual(saved['record']['status'], 'queued')
        self.assertEqual((await self.upload())['record']['id'], saved['record']['id'])
        self.assertTrue(await self.worker.once())
        result = await self.editor.json(self.prefix + '/' + saved['record']['id'], method='GET')
        self.assertEqual(result['record']['status'], 'ready')
        self.assertEqual(len(result['record']['blueprint']['requirements']), 6)
        self.assertEqual(result['record']['evaluation']['authority'], 'A0')
        self.assertFalse(result['record']['evaluation']['verified'])
        status, _ = self.server.request('GET', self.prefix + '/' + saved['record']['id'])
        self.assertIn(status, (401, 403))
        status, _ = self.server.request('GET', self.prefix + '/' + saved['record']['id'], token=self.server.login('bot'))
        self.assertEqual(status, 403)
        status, _ = self.server.request('POST', '/api/collections/workspace_blueprints/records',
                                        {'workspace': WORKSPACE, 'result': {'verified': True}}, self.editor_token)
        self.assertIn(status, (400, 403))
        protected = '/api/files/research_uploads/' + result['record']['upload']
        status, upload = self.server.request('GET', '/api/collections/research_uploads/records/' + result['record']['upload'], token=self.editor_token)
        self.assertEqual(status, 200)
        path = protected + '/' + quote(upload['asset'], safe='')
        anonymous = HttpClient(Endpoint(self.server.base), lambda: '')
        try:
            with self.assertRaises(ResearchError):
                await anonymous.raw(path, json_response=False)
        finally:
            await anonymous.close()
        session = await self.editor.json('/api/files/token', body={})
        data = await self.editor.raw(path + '?token=' + quote(session['token'], safe=''), json_response=False)
        self.assertEqual(data, pdf_bytes())

    async def test_native_rollback_retains_source_and_disables_blueprint_operations(self) -> None:
        saved = await self.upload()
        self.server.stop()
        self.server.migrate('down', '1')
        self.server.start()
        with self.assertRaises(ResearchError):
            await self.editor.json(self.prefix + '/' + saved['record']['id'], method='GET')
        self.server.stop()
        self.server.migrate('up')
        self.server.start()
        self.assertEqual((await self.editor.json(self.prefix + '/' + saved['record']['id'], method='GET'))['record']['id'], saved['record']['id'])
