# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_discordbot_research.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/research.py, apps/research/worker.py, tests/upgrade/research_support.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/discordbot/research.py; VALIDATES apps/research/worker.py; CONSUMES tests/upgrade/research_support.py
# DAG Node:    none
# Intent:      Prove Discord-to-mission-to-parser-to-evidence flows and lost-response recovery using connected application source.
# ───────────────────────────────────────────────────────────────

"""Verify bot and worker contracts through the actual persistent research policy."""
from __future__ import annotations

import asyncio
import hashlib
import json
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from apps.research.contracts import Endpoint, ProcessorSettings, ResearchError
from apps.research.processing import Processor
from apps.research.worker import Worker
from scripts.discordbot.contracts import Caller, Settings
from scripts.discordbot.research import Attachment, Binding, RESEARCH_COMMANDS, ResearchBridge, bindings_from_env, configured_bridge
from research_support import Backend, GUILD, CHANNEL, USER
from test_discordbot_adapter import ADAPTER, interaction

CALLER = Caller(USER, GUILD, CHANNEL)
QUERY = {'mission': 'mission1', 'kind': 'search', 'title': 'Mission source', 'input': 'evidence methods', 'context': 'Compare approaches.'}
RID = 45678901234567890


class ResearchFlow(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.backend = Backend()
        self.client = self.backend.client('bot')
        self.bridge = ResearchBridge(self.client, (Binding(GUILD, CHANNEL, 'ws1'),))

    async def asyncTearDown(self) -> None:
        await self.bridge.close()
        await asyncio.to_thread(self.backend.close)

    async def test_discord_search_becomes_reviewable_and_only_explicit_review_creates_evidence(self) -> None:
        reply = await self.bridge.execute('submit', QUERY, CALLER, RID)
        source = reply.page.url.split('source=')[1]
        self.bridge.delivered(CALLER, reply.request_key)
        crawler = SimpleNamespace(json=AsyncMock(return_value={'success': True, 'data': {'web': [
            {'title': 'Methodology', 'url': 'https://buildanddo.tech/docs', 'description': 'A retrieved source excerpt.'}]} }), close=AsyncMock())
        worker = Worker(self.backend.client('worker'), 'ws1', Processor(ProcessorSettings(Endpoint('http://firecrawl:3002')), firecrawl=crawler))
        self.assertTrue(await worker.once())
        editor = self.backend.client('editor')
        detail = (await editor.json('/api/buildanddo/workspaces/ws1/research/' + source, method='GET'))['record']
        self.assertEqual(detail['status'], 'ready')
        self.assertEqual(detail['result']['input_sha256'], hashlib.sha256(QUERY['input'].encode()).hexdigest())
        before = await self.bridge.execute('evidence', {'mission': 'mission1'}, CALLER, RID + 1)
        self.assertIn('No readable', before.page.body)
        body = {'action': 'attach', 'payload': {'id': source, 'note': 'Compared the cited source and its limitations.'}, 'revision': detail['revision'], 'request_key': 'review_source_request_01'}
        saved = await editor.json('/api/buildanddo/workspaces/ws1/research', body=body)
        replay = await editor.json('/api/buildanddo/workspaces/ws1/research', body=body)
        self.assertTrue(replay['replayed'])
        self.assertEqual(saved['evidence'], replay['evidence'])
        evidence = await self.bridge.execute('evidence', {'mission': 'mission1'}, CALLER, RID + 2)
        self.assertIn('observed', evidence.page.body)
        missions = await self.bridge.execute('missions', {}, CALLER, RID + 3)
        self.assertIn('running', missions.page.body)
        await worker.close()

    async def test_discord_file_and_website_intake_share_the_same_queue_and_protected_parse(self) -> None:
        data = b'This is the actual uploaded source document.'
        self.bridge.downloader = AsyncMock(return_value=data)
        attachment = Attachment(56789012345678901, 'source.txt', len(data), 'https://cdn.discordapp.com/attachments/source')
        reply = await self.bridge.execute('submit', {**QUERY, 'kind': 'document', 'input': ''}, CALLER, RID, attachment)
        source = reply.page.url.split('source=')[1]
        worker = Worker(self.backend.client('worker'), 'ws1', Processor(ProcessorSettings()))
        self.assertTrue(await worker.once())
        result = await self.backend.client('editor').json('/api/buildanddo/workspaces/ws1/research/' + source, method='GET')
        self.assertEqual(result['record']['result']['text'], data.decode())
        self.assertEqual(result['record']['result']['input_sha256'], hashlib.sha256(data).hexdigest())
        self.assertEqual(result['record']['origin'], 'discord')
        await worker.close()

    async def test_unicode_document_excerpts_fit_the_backend_and_preserve_original_bytes(self) -> None:
        original = '\U0001f30d' * 18000
        data = original.encode()
        self.bridge.downloader = AsyncMock(return_value=data)
        attachment = Attachment(56789012345678901, 'unicode.txt', len(data), 'https://cdn.discordapp.com/attachments/source')
        reply = await self.bridge.execute('submit', {**QUERY, 'kind': 'document', 'input': ''}, CALLER, RID, attachment)
        worker = Worker(self.backend.client('worker'), 'ws1', Processor(ProcessorSettings()))
        try:
            self.assertTrue(await worker.once())
            record = (await self.backend.client('editor').json('/api/buildanddo/workspaces/ws1/research/' + reply.page.url.split('source=')[1], method='GET'))['record']
            self.assertEqual(record['status'], 'ready')
            self.assertTrue(record['result']['truncated'])
            self.assertTrue(original.startswith(record['result']['text']))
            self.assertLessEqual(len(record['result']['text'].encode('utf-16-le')) // 2, 16000)
            self.assertEqual(record['result']['input_sha256'], hashlib.sha256(data).hexdigest())
        finally:
            await worker.close()

    async def test_accepted_submission_with_lost_reply_recovers_one_durable_request(self) -> None:
        self.client.lost = 'submit'
        with self.assertRaises(ResearchError):
            await self.bridge.execute('submit', QUERY, CALLER, RID)
        other = await self.bridge.execute('mission', {'title': 'Different'}, CALLER, RID + 1)
        self.bridge.delivered(CALLER, other.request_key)
        self.assertTrue(self.bridge.pending)
        recovered = await self.bridge.execute('recover', {}, CALLER, RID + 2)
        self.assertIn('queued', recovered.page.body)
        data = await self.backend.client('editor').json('/api/buildanddo/workspaces/ws1/research', method='GET')
        self.assertEqual(len(data['items']), 1)
        self.bridge.delivered(CALLER, recovered.request_key)
        self.assertFalse(self.bridge.pending)
        self.assertIn('No pending', (await self.bridge.execute('recover', {}, CALLER, RID + 3)).page.title)

    async def test_lost_upload_receipt_is_found_without_downloading_the_attachment_twice(self) -> None:
        data = b'Upload receipt recovery.'
        attachment = Attachment(56789012345678901, 'source.txt', len(data), '')
        self.bridge.downloader = AsyncMock(return_value=data)
        raw = self.client.raw
        async def lose(*args, **kwargs):
            await raw(*args, **kwargs)
            self.client.raw = raw
            raise ResearchError('timeout')
        self.client.raw = lose
        with self.assertRaises(ResearchError):
            await self.bridge.execute('submit', {**QUERY, 'kind': 'document', 'input': ''}, CALLER, RID, attachment)
        recovered = await self.bridge.execute('recover', {}, CALLER, RID + 1)
        self.assertIn('queued', recovered.page.body)
        self.bridge.downloader.assert_awaited_once()

    async def test_revocation_denies_recovery_and_private_read_after_previous_success(self) -> None:
        await self.bridge.execute('submit', QUERY, CALLER, RID)
        await self.backend.call({'operation': 'revoke', 'path': '/'})
        for name in ['recover', 'missions', 'submissions']:
            with self.assertRaises(ResearchError) as failure:
                await self.bridge.execute(name, {}, CALLER, RID + 1)
            self.assertEqual(failure.exception.status, 403)
        self.assertFalse(self.bridge.pending)

    async def test_scope_denials_validation_and_read_only_replies_never_download_or_clear_pending_writes(self) -> None:
        self.bridge.downloader = AsyncMock()
        for caller in [Caller(USER, None, None), Caller(USER, GUILD, CHANNEL + 1), Caller(USER, GUILD, CHANNEL, True)]:
            with self.assertRaises(ResearchError):
                await self.bridge.execute('submit', QUERY, caller, RID)
        self.assertFalse(self.client.calls)
        with self.assertRaises(ResearchError):
            await self.bridge.execute('submit', {**QUERY, 'kind': 'video'}, CALLER, RID)
        await self.bridge.execute('submit', QUERY, CALLER, RID)
        response = await self.bridge.execute('submissions', {}, CALLER, RID + 1)
        self.bridge.delivered(CALLER, response.request_key)
        self.assertTrue(self.bridge.pending)
        self.bridge.downloader.assert_not_awaited()

    async def test_new_mission_is_a_proposal_and_pagination_and_submission_state_are_live(self) -> None:
        result = await self.bridge.execute('mission', {'title': 'Research objective', 'description': 'Needs source review.'}, CALLER, RID)
        self.assertIn('is proposed', result.page.body)
        self.bridge.delivered(CALLER, result.request_key)
        self.assertIn('proposed', (await self.bridge.execute('missions', {}, CALLER, RID + 1)).page.body)
        saved = await self.bridge.execute('submit', QUERY, CALLER, RID + 2)
        source = saved.page.url.split('source=')[1]
        state = await self.bridge.execute('submission', {'id': source}, CALLER, RID + 3)
        self.assertIn('queued', state.page.body)
        with self.assertRaises(ResearchError):
            await self.bridge.execute('evidence', {'page': -1}, CALLER, RID + 4)

    async def test_native_adapter_registers_typed_commands_and_sends_private_current_receipts(self) -> None:
        bot = ADAPTER.BuildAndDoBot(Settings(), research=self.bridge)
        names = {command.name: command for command in bot.group.commands}
        self.assertTrue(set(RESEARCH_COMMANDS) <= set(names))
        request = interaction(USER, GUILD, CHANNEL)
        request.id = RID
        await names['submit'].callback(request, 'mission1', 'search', 'Discord source', 'methods')
        self.assertTrue(request.response.defer.call_args.kwargs['ephemeral'])
        payload = request.edit_original_response.call_args.kwargs
        self.assertIsNone(payload['view'])
        self.assertFalse(payload['allowed_mentions'].everyone)
        self.assertIn('queued', payload['embed'].to_dict()['description'])
        self.assertFalse(self.bridge.pending)
        await bot.close()

    async def test_adapter_delivery_failure_retains_intent_and_denial_never_exposes_raw_source(self) -> None:
        bot = ADAPTER.BuildAndDoBot(Settings(), research=self.bridge)
        request = interaction(USER, GUILD, CHANNEL)
        request.id = RID
        request.edit_original_response.side_effect = RuntimeError('delivery failure')
        with self.assertRaises(RuntimeError):
            await bot.respond_research(request, 'submit', QUERY)
        self.assertTrue(self.bridge.pending)
        denied = interaction(USER, GUILD, CHANNEL + 1)
        denied.id = RID + 1
        await bot.respond_research(denied, 'submit', QUERY)
        self.assertNotIn(QUERY['input'], denied.edit_original_response.call_args.kwargs['embed'].to_dict()['description'])
        await bot.close()

    async def test_attachment_download_rejects_external_hosts_and_enforces_actual_bytes(self) -> None:
        for url in ['https://buildanddo.tech/file', 'http://cdn.discordapp.com/attachments/a', 'https://cdn.discordapp.com/not-an-attachment']:
            with self.assertRaises(ResearchError):
                await self.bridge.download(Attachment(RID, 'a.txt', 3, url))
        with patch('scripts.discordbot.research.HttpClient.raw', new=AsyncMock(return_value=b'too long')):
            with self.assertRaises(ResearchError):
                await self.bridge.download(Attachment(RID, 'a.txt', 3, 'https://cdn.discordapp.com/attachments/a?valid=1'))

    async def test_limits_expiry_and_changed_link_do_not_replay_as_another_account(self) -> None:
        self.bridge.clock = lambda: 0
        await self.bridge.execute('submit', QUERY, CALLER, RID)
        self.bridge.clock = lambda: 601
        self.assertIn('No pending', (await self.bridge.execute('recover', {}, CALLER, RID + 1)).page.title)
        self.bridge.clock = lambda: 1000
        await self.bridge.execute('submit', QUERY, CALLER, RID + 2)
        pending = next(iter(self.bridge.pending.values()))
        pending.link = 'changed_link'
        with self.assertRaises(ResearchError):
            await self.bridge.execute('recover', {}, CALLER, RID + 3)
        for index in range(4):
            await self.bridge.execute('missions', {}, CALLER, RID + index + 4)
        with self.assertRaises(ResearchError) as failure:
            await self.bridge.execute('missions', {}, CALLER, RID + 20)
        self.assertEqual(failure.exception.reason, 'rate_limited')


class ConfigurationTests(unittest.TestCase):
    def test_bridge_is_off_by_default_and_requires_explicit_identity_and_unique_scope(self) -> None:
        self.assertIsNone(configured_bridge({}))
        mapping = [{'guild_id': str(GUILD), 'channel_id': str(CHANNEL), 'workspace': 'ws1'}]
        for rows in [mapping + mapping, [{}], {}, 'invalid']:
            with self.assertRaises(ResearchError):
                bindings_from_env({'BUILDANDDO_DISCORD_RESEARCH_BINDINGS': json.dumps(rows)})
        env = {'BUILDANDDO_DISCORD_RESEARCH_BINDINGS': json.dumps(mapping)}
        with self.assertRaises(ResearchError):
            configured_bridge(env)
        bridge = configured_bridge({**env, 'BUILDANDDO_DISCORD_PB_TOKEN': 'test-native-session', 'BUILDANDDO_POCKETBASE_URL': 'http://127.0.0.1:8090'})
        self.assertEqual(bridge.bindings[0].workspace, 'ws1')
