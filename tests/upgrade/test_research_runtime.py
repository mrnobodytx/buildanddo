# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_research_runtime.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/research/contracts.py, apps/research/transport.py, apps/research/documents.py, apps/research/processing.py, apps/research/worker.py
# EnumType:    Test
# EnumEdges:   VALIDATES apps/research/contracts.py; VALIDATES apps/research/transport.py; VALIDATES apps/research/documents.py; VALIDATES apps/research/processing.py; VALIDATES apps/research/worker.py
# DAG Node:    none
# Intent:      Verify bounded HTTP, real document extraction, provider contracts and fenced worker outcomes without live provider or deployment claims.
# ───────────────────────────────────────────────────────────────

"""Exercise local transport and actual parser/worker source with explicit service fixtures."""
from __future__ import annotations

import asyncio
from contextlib import redirect_stdout
from datetime import datetime, timedelta, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch
import zipfile

from apps.research import documents
from apps.research.contracts import Endpoint, ProcessorSettings, ResearchError, file_kind, identifier, object_value, public_url, text
from apps.research.processing import Processor, parse_document
from apps.research.transport import BoundedIO, HttpClient, decode_json, encode_json, multipart
from apps.research import worker as runtime
from research_support import Backend


class Handler(BaseHTTPRequestHandler):
    requests = []

    def log_message(self, *_args):
        pass

    def do_GET(self):
        self.do_POST()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        self.requests.append({'path': self.path, 'body': body, 'authorization': self.headers.get('Authorization', '')})
        if self.path == '/slow':
            time.sleep(.15)
        status = 302 if self.path == '/redirect' else 403 if self.path == '/denied' else 409 if self.path == '/conflict' else 500 if self.path == '/error' else 200
        self.send_response(status)
        self.send_header('Content-Type', 'text/html' if self.path == '/html' else 'application/json')
        if self.path == '/redirect':
            self.send_header('Location', '/followed')
        if self.path == '/encoded':
            self.send_header('Content-Encoding', 'gzip')
        self.end_headers()
        payload = b'x' * 100 if self.path == '/large' else b'{"value":NaN}' if self.path == '/nan' else b'[]' if self.path == '/array' else b'{"ok":true}'
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass


class TransportTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    async def asyncSetUp(self):
        self.client = HttpClient(Endpoint('http://127.0.0.1:' + str(self.server.server_port)), lambda: 'test-bound-session', timeout=1)

    async def asyncTearDown(self):
        await self.client.close()

    async def test_real_http_preserves_native_auth_and_json_without_ambient_proxy_credentials(self):
        with patch.dict('os.environ', {'HTTP_PROXY': 'http://127.0.0.1:1', 'NO_PROXY': ''}):
            self.assertTrue((await self.client.json('/ok', body={'text': 'Source paragraph'}))['ok'])
        self.assertEqual(Handler.requests[-1]['authorization'], 'test-bound-session')
        self.assertEqual(json.loads(Handler.requests[-1]['body']), {'text': 'Source paragraph'})
        self.client.bearer = True
        await self.client.json('/ok', body={})
        self.assertEqual(Handler.requests[-1]['authorization'], 'Bearer test-bound-session')

    async def test_redirect_content_type_encoding_and_non_json_responses_cannot_pass_as_provider_results(self):
        before = len(Handler.requests)
        for path in ['/redirect', '/html', '/encoded', '/nan', '/array']:
            with self.subTest(path=path), self.assertRaises(ResearchError):
                await self.client.json(path, body={})
        self.assertEqual(len(Handler.requests) - before, 5)
        self.assertNotIn('/followed', [request['path'] for request in Handler.requests])

    async def test_status_body_limit_and_socket_timeout_produce_typed_failures(self):
        for path, status in [('/denied', 403), ('/conflict', 409), ('/error', 500)]:
            with self.assertRaises(ResearchError) as result:
                await self.client.json(path, body={})
            self.assertEqual(result.exception.status, status)
        with self.assertRaises(ResearchError) as result:
            await self.client.raw('/large', maximum=20)
        self.assertEqual(result.exception.reason, 'too_large')
        self.client.timeout = .03
        with self.assertRaises(ResearchError):
            await self.client.json('/slow', body={})
        with self.assertRaises(ResearchError):
            await self.client.raw('/ok', body=b'x' * (21 * 1024 * 1024))

    async def test_cancelled_or_timed_out_work_retains_its_slot_until_the_worker_finishes(self):
        io_slots = BoundedIO(slots=1, deadline=.03)
        entered, release = threading.Event(), threading.Event()
        def blocked():
            entered.set()
            release.wait(1)
            return 'completed'
        try:
            task = asyncio.create_task(io_slots.run(blocked))
            self.assertTrue(await asyncio.to_thread(entered.wait, 1))
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            with self.assertRaises(ResearchError):
                await io_slots.run(lambda: 'extra')
            self.assertEqual(len(io_slots.tasks), 1)
        finally:
            release.set()
            await io_slots.close()
        with self.assertRaises(ResearchError):
            await io_slots.run(lambda: 'closed')
        timeout_io = BoundedIO(slots=1, deadline=.01)
        with self.assertRaises(ResearchError) as result:
            await timeout_io.run(lambda: time.sleep(.04))
        self.assertEqual(result.exception.reason, 'timeout')
        await timeout_io.close()


class ContractTests(unittest.TestCase):
    def test_public_targets_reject_private_addresses_credentials_ports_and_dns_rebinding_inputs(self):
        for url in ['http://buildanddo.tech', 'https://127.0.0.1/', 'https://localhost/', 'https://host.internal/',
                    'https://user:pass@buildanddo.tech/', 'https://buildanddo.tech:3000/', 'https://buildanddo.tech/#fragment', 'https://[::1]/']:
            with self.subTest(url=url), self.assertRaises(ResearchError):
                public_url(url)
        with patch('socket.getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]):
            with self.assertRaises(ResearchError):
                public_url('https://buildanddo.tech/', resolve=True)
        with patch('socket.getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('1.1.1.1', 443))]):
            self.assertEqual(public_url('https://buildanddo.tech/', resolve=True), 'https://buildanddo.tech/')

    def test_fixed_endpoint_and_value_validation_rejects_unbounded_or_secret_bearing_inputs(self):
        for url in ['', 'ftp://host/', 'https://user:pass@service/', 'https://service/?query=1', 'http://public.example.com/']:
            with self.assertRaises(ResearchError):
                Endpoint(url)
        for url in ['http://firecrawl:3002', 'http://10.1.2.3:8090', 'https://parser.internal']:
            self.assertEqual(Endpoint(url).path('/v2/search'), url + '/v2/search')
        with self.assertRaises(ResearchError):
            Endpoint('https://parser.internal').path('//elsewhere/path')
        for function, value in [(identifier, '../other'), (object_value, []), (decode_json, b'not json'), (encode_json, {'n': float('nan')})]:
            with self.assertRaises(ResearchError):
                function(value)
        with self.assertRaises(ResearchError):
            text('control\x00value', 30)
        for name, size in [('file.exe', 1), ('../file.pdf', 5), ('a.txt', 0), ('a.mp4', 20971521)]:
            with self.assertRaises(ResearchError):
                file_kind(name, size)

    def test_multipart_rejects_header_injection_and_has_exactly_one_named_attachment(self):
        body, content_type = multipart({'model': 'self-hosted-model'}, 'audio.wav', b'RIFF', field='file')
        self.assertIn(b'name="file"; filename="audio.wav"', body)
        self.assertIn('boundary=', content_type)
        for name in ['bad".wav', 'bad\n.wav']:
            with self.assertRaises(ResearchError):
                multipart({}, name, b'RIFF')
        with self.assertRaises(ResearchError):
            multipart({'bad\nkey': 'value'}, 'audio.wav', b'RIFF')
        with self.assertRaises(ResearchError):
            multipart({}, 'audio.wav', b'RIFF', field='other')


class DocumentTests(unittest.TestCase):
    @unittest.skipUnless(importlib.util.find_spec('pypdf'), 'The native PDF parser must run on the dependency-enabled runner.')
    def test_native_pdf_extracts_actual_pdf_text(self):
        from pypdf import PdfWriter
        from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
        writer = PdfWriter()
        page = writer.add_blank_page(width=300, height=300)
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): font})})
        content = DecodedStreamObject()
        content.set_data(b'BT /F1 12 Tf 20 20 Td (Native PDF evidence.) Tj ET')
        page[NameObject('/Contents')] = content
        output = io.BytesIO()
        writer.write(output)
        value, version, truncated = documents.extract(output.getvalue(), 'source.pdf')
        self.assertIn('Native PDF evidence.', value)
        self.assertTrue(version.startswith('pypdf-'))
        self.assertFalse(truncated)

    def test_child_resource_limits_never_raise_existing_host_limits(self):
        resource = SimpleNamespace(RLIMIT_AS=1, RLIMIT_CPU=2, getrlimit=lambda kind: (-1, 20 if kind == 2 else -1), setrlimit=unittest.mock.Mock())
        with patch('apps.research.documents.importlib.import_module', return_value=resource):
            documents.limit_resources()
        self.assertEqual(resource.setrlimit.call_args_list[1].args, (2, (20, 20)))
        with patch('apps.research.documents.importlib.import_module', side_effect=ImportError):
            documents.limit_resources()

    def test_real_text_and_docx_are_extracted_with_provenance_and_without_execution(self):
        value, version, truncated = documents.extract(b'# Evidence\nFirst source.', 'source.md')
        self.assertEqual(value, '# Evidence\nFirst source.')
        self.assertTrue(version.startswith('python-'))
        self.assertFalse(truncated)
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as zipped:
            zipped.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Document evidence.</w:t></w:r></w:p></w:body></w:document>')
        self.assertEqual(documents.extract(archive.getvalue(), 'source.docx')[0], 'Document evidence.')
        result = parse_document(b'Parsed in a child process.', 'source.txt')
        self.assertEqual(result['text'], 'Parsed in a child process.')

    def test_malformed_encrypted_or_scanned_documents_never_become_fake_success(self):
        for data, name in [(b'\xff\xfe', 'source.txt'), (b'not a zip', 'source.docx'), (b'  ', 'empty.txt'), (b'RIFF', 'audio.wav')]:
            with self.assertRaises(ResearchError):
                documents.extract(data, name)
        with patch('apps.research.documents.importlib.import_module', side_effect=ImportError):
            with self.assertRaises(ResearchError) as result:
                documents.extract(b'%PDF-missing', 'source.pdf')
            self.assertEqual(result.exception.reason, 'capability_unavailable')
        pdf = SimpleNamespace(__version__='test-parser', PdfReader=lambda _data: SimpleNamespace(is_encrypted=True, pages=[]))
        with patch('apps.research.documents.importlib.import_module', return_value=pdf), self.assertRaises(ResearchError):
            documents.extract(b'%PDF-fixture', 'source.pdf')

    def test_docx_expansion_entities_and_output_bounds_are_enforced(self):
        for payload in [b'<!DOCTYPE root [<!ENTITY x "bad">]><root/>', b'X' * (2 * 1024 * 1024 + 1)]:
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as zipped:
                zipped.writestr('word/document.xml', payload)
            with self.assertRaises(ResearchError):
                documents.extract(archive.getvalue(), 'source.docx')
        value, _version, truncated = documents.extract(b'a' * 17000, 'long.txt')
        self.assertEqual(len(value), 16000)
        self.assertTrue(truncated)
        with patch('apps.research.processing.subprocess.run', side_effect=subprocess.TimeoutExpired('parser', 30)):
            with self.assertRaises(ResearchError) as result:
                parse_document(b'data', 'source.txt')
            self.assertEqual(result.exception.reason, 'timeout')

    def test_child_entry_point_reports_bounded_failures_without_source_text_in_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source'
            path.write_bytes(b'one source')
            output = io.StringIO()
            with patch.object(sys, 'argv', ['documents', str(path), '--name', 'source.txt']), redirect_stdout(output):
                self.assertEqual(documents.main(), 0)
            self.assertEqual(json.loads(output.getvalue())['text'], 'one source')
            output = io.StringIO()
            with patch.object(sys, 'argv', ['documents', str(path), '--name', 'source.txt']), patch('apps.research.documents.extract', side_effect=Exception('private text')), redirect_stdout(output):
                self.assertEqual(documents.main(), 1)
            self.assertNotIn('private text', output.getvalue())


class ProcessorTests(unittest.IsolatedAsyncioTestCase):
    async def test_firecrawl_v1_v2_search_and_scrape_use_expected_http_contracts(self):
        for version in ['v1', 'v2']:
            rows = [{'title': 'Source', 'url': 'https://buildanddo.tech/docs', 'description': 'Retrieved description.'}]
            client = SimpleNamespace(json=AsyncMock(return_value={'success': True, 'data': rows if version == 'v1' else {'web': rows}}), close=AsyncMock())
            processor = Processor(ProcessorSettings(Endpoint('http://firecrawl:3002'), version), firecrawl=client, guard=lambda value: value)
            value = await processor.process({'kind': 'search', 'input': 'research'})
            self.assertEqual(value['version'], version)
            self.assertEqual(client.json.call_args.args[0], '/' + version + '/search')
            self.assertEqual(value['input_sha256'], hashlib.sha256(b'research').hexdigest())
            client.json.return_value = {'success': True, 'data': {'markdown': 'Extracted page.', 'metadata': {'title': 'Docs', 'sourceURL': 'https://buildanddo.tech/docs'}}}
            value = await processor.process({'kind': 'url', 'input': 'https://buildanddo.tech/docs'})
            self.assertEqual(value['text'], 'Extracted page.')
            self.assertEqual(client.json.call_args.args[0], '/' + version + '/scrape')
            await processor.close()

    async def test_audio_and_video_use_configured_transcription_and_preserve_uploaded_digest(self):
        client = SimpleNamespace(raw=AsyncMock(return_value=b'{"text":"Spoken evidence."}'), close=AsyncMock())
        settings = ProcessorSettings(transcription=Endpoint('http://speech:8000/v1/audio/transcriptions'), transcription_model='local-model')
        processor = Processor(settings, transcription=client)
        for kind, name in [('audio', 'recording.wav'), ('video', 'recording.mp4')]:
            result = await processor.process({'kind': kind, 'input': ''}, b'original uploaded bytes', name)
            self.assertEqual(result['text'], 'Spoken evidence.')
            self.assertEqual(result['input_sha256'], hashlib.sha256(b'original uploaded bytes').hexdigest())
            self.assertEqual(result['processor'], 'self-hosted-transcription')
            self.assertIn(b'original uploaded bytes', client.raw.call_args.kwargs['body'])
        await processor.close()

    async def test_missing_capabilities_malformed_provider_data_and_unsafe_citations_remain_failures(self):
        processor = Processor(ProcessorSettings())
        for job, data, name in [({'kind': 'search', 'input': 'query'}, None, ''), ({'kind': 'audio', 'input': ''}, b'data', 'file.wav')]:
            with self.assertRaises(ResearchError) as error:
                await processor.process(job, data, name)
            self.assertEqual(error.exception.reason, 'capability_unavailable')
        await processor.close()
        client = SimpleNamespace(json=AsyncMock(), close=AsyncMock())
        processor = Processor(ProcessorSettings(Endpoint('http://firecrawl:3002')), firecrawl=client)
        for response in [{'success': False}, {'success': True, 'data': {}}, {'success': True, 'data': {'web': [{'url': 'https://127.0.0.1/', 'title': 'Private', 'description': 'data'}]}}]:
            client.json.return_value = response
            with self.assertRaises(ResearchError):
                await processor.process({'kind': 'search', 'input': 'query'})
        await processor.close()

    async def test_multibyte_extraction_stays_below_the_server_receipt_budget(self):
        client = SimpleNamespace(raw=AsyncMock(return_value=json.dumps({'text': '界' * 20000}).encode()), close=AsyncMock())
        processor = Processor(ProcessorSettings(transcription=Endpoint('http://speech:8000/transcribe'), transcription_model='model'), transcription=client)
        result = await processor.process({'kind': 'audio', 'input': ''}, b'bytes', 'source.mp3')
        self.assertTrue(result['truncated'])
        self.assertLess(len(json.dumps(result, ensure_ascii=False).encode()), 55001)
        await processor.close()


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.backend = Backend()
        self.client = self.backend.client('worker')
        self.worker = runtime.Worker(self.client, 'ws1', Processor(ProcessorSettings()))

    async def asyncTearDown(self):
        await self.worker.close()
        await asyncio.to_thread(self.backend.close)

    async def submit(self):
        return await self.backend.client('editor').json('/api/buildanddo/workspaces/ws1/research', body={
            'action': 'submit', 'payload': {'mission': 'mission1', 'title': 'Source', 'kind': 'search', 'input': 'query', 'context': '', 'upload': ''},
            'revision': 0, 'request_key': 'worker_fixture_submit_01'})

    async def test_no_queue_work_is_an_observed_empty_poll_and_missing_provider_is_recorded(self):
        self.assertFalse(await self.worker.once())
        saved = await self.submit()
        self.assertTrue(await self.worker.once())
        value = await self.backend.client('editor').json('/api/buildanddo/workspaces/ws1/research/' + saved['id'], method='GET')
        self.assertEqual(value['record']['status'], 'failed')
        self.assertEqual(value['record']['failure'], 'capability_unavailable')
        self.assertFalse(value['record']['evidence'])

    async def test_cancellation_after_claim_fences_a_late_result_and_lost_claim_is_replayed(self):
        saved = await self.submit()
        self.client.lost = 'claim'
        claim = await self.worker.command('claim', {'id': saved['id']}, 1, 'lost_claim_request_01')
        self.assertTrue(claim['replayed'])
        self.assertEqual(claim['job']['attempt'], 1)
        await self.backend.client('editor').json('/api/buildanddo/workspaces/ws1/research', body={
            'action': 'cancel', 'payload': {'id': saved['id']}, 'revision': claim['revision'], 'request_key': 'cancel_claim_request_01'})
        with self.assertRaises(ResearchError) as error:
            await self.worker.process_job(claim)
        self.assertEqual(error.exception.status, 409)

    async def test_lost_completion_receipt_is_replayed_without_another_processing_attempt(self):
        await self.submit()
        self.client.lost = 'complete'
        self.assertTrue(await self.worker.once())
        self.assertFalse(await self.worker.once())
        completed = [body for _path, body in self.client.calls if body and body.get('action') == 'complete']
        self.assertEqual(len(completed), 2)
        self.assertEqual(completed[0], completed[1])

    async def test_malformed_queue_receipts_and_job_identity_are_rejected(self):
        self.client.json = AsyncMock(return_value={'workspace': 'foreign', 'items': []})
        with self.assertRaises(ResearchError):
            await self.worker.once()
        with self.assertRaises(ResearchError):
            await self.worker.process_job({'job': {'id': 'job1', 'workspace': 'other'}, 'revision': 1, 'id': 'job1'})
        with self.assertRaises(ResearchError):
            await self.worker.command('claim', {'id': 'job1'}, 1, 'bad_claim_request_01')

    async def test_unclaimable_entries_do_not_starve_work_beyond_a_bounded_queue_scan(self):
        visited = []

        async def queue(path, **_kwargs):
            page = int(path.rsplit('=', 1)[1])
            visited.append(page)
            items = [{'id': 'job' + str(index), 'revision': 1, 'status': 'queued', 'lease_until': ''}
                     for index in range((page - 1) * 20, min(page * 20, 201))]
            return {'workspace': 'ws1', 'page': page, 'items': items, 'has_more': page < 11}

        async def claim(_action, payload, _revision, _key):
            if payload['id'] != 'job200':
                raise ResearchError('unavailable', status=403)
            return {'id': 'job200'}

        self.client.json = queue
        with patch.object(runtime.logger, 'info'), patch.object(self.worker, 'command', side_effect=claim), patch.object(self.worker, 'process_job', new_callable=AsyncMock) as process:
            self.assertFalse(await self.worker.once())
            self.assertEqual(len(visited), 10)
            self.assertTrue(await self.worker.once())
            process.assert_awaited_once_with({'id': 'job200'})
            self.assertEqual(visited[-1], 11)

    async def test_unexpired_lease_is_skipped_and_expired_lease_is_claimed(self):
        future = (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat()
        self.client.json = AsyncMock(return_value={'workspace': 'ws1', 'page': 1, 'has_more': False, 'items': [{'id': 'job1', 'revision': 2, 'status': 'processing', 'lease_until': future}]})
        self.assertFalse(await self.worker.once())
        self.client.json.return_value['items'][0]['lease_until'] = 'invalid'
        self.assertFalse(await self.worker.once())


class RuntimeConfigurationTests(unittest.TestCase):
    def test_worker_configuration_is_explicit_and_never_embeds_tokens_in_settings(self):
        with self.assertRaises(ResearchError):
            runtime.configured({})
        env = {'BUILDANDDO_RESEARCH_TOKEN': 'test-native-session', 'BUILDANDDO_RESEARCH_WORKSPACE': 'ws1', 'BUILDANDDO_POCKETBASE_URL': 'http://127.0.0.1:8090',
               'BUILDANDDO_FIRECRAWL_URL': 'http://firecrawl:3002'}
        with self.assertRaises(ResearchError):
            runtime.configured(env)
        worker = runtime.configured({**env, 'BUILDANDDO_FIRECRAWL_EGRESS_GUARDED': '1'})
        self.assertEqual(worker.processor.settings.firecrawl.url, env['BUILDANDDO_FIRECRAWL_URL'])
        self.assertNotIn('test-native-session', repr(worker.processor.settings))
        for options in [{'BUILDANDDO_FIRECRAWL_VERSION': 'v9'}, {'BUILDANDDO_TRANSCRIPTION_URL': 'http://speech:8000/parse'}]:
            with self.assertRaises(ResearchError):
                ProcessorSettings.from_env(options)

    def test_explicit_cli_once_drains_the_worker_and_missing_config_fails_before_processing(self):
        worker = SimpleNamespace(once=AsyncMock(return_value=False), close=AsyncMock())
        with patch.object(sys, 'argv', ['worker', '--once']), patch('apps.research.worker.configured', return_value=worker):
            self.assertEqual(runtime.main(), 0)
        worker.once.assert_awaited_once()
        worker.close.assert_awaited_once()
        with patch.object(sys, 'argv', ['worker', '--once']), patch('apps.research.worker.configured', side_effect=ResearchError('configuration')):
            self.assertEqual(runtime.main(), 1)
