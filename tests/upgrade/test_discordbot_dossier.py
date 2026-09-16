# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/upgrade/test_discordbot_dossier.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     scripts/discordbot/dossier.py, scripts/discordbot/bot.py, tests/upgrade/dossier-backend-driver.mjs, tests/upgrade/research_support.py, tests/upgrade/test_discordbot_adapter.py
# EnumType:    Test
# EnumEdges:   VALIDATES scripts/discordbot/dossier.py; VALIDATES scripts/discordbot/bot.py; CONSUMES tests/upgrade/dossier-backend-driver.mjs; CONSUMES tests/upgrade/research_support.py; CONSUMES tests/upgrade/test_discordbot_adapter.py
# DAG Node:    none
# Intent:      Exercise connected private Discord saves, encrypted backend recall, account revocation and uncertain-response recovery without a live bot login.
# ───────────────────────────────────────────────────────────────

"""Exercise the actual personal-memory service and its native-boundary adapters."""
from __future__ import annotations

import json
import unittest
from unittest.mock import AsyncMock, patch

from apps.research.contracts import ResearchError
from scripts.discordbot.contracts import Caller, Settings
from scripts.discordbot.dossier import DossierBridge, Intent, DOSSIER_COMMANDS
from scripts.discordbot.research import Binding, BridgeReply, ResearchBridge
from research_support import Backend, GUILD, CHANNEL, USER
from test_discordbot_adapter import ADAPTER, interaction


class DossierTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.backend = Backend('tests/upgrade/dossier-backend-driver.mjs')
        self.addCleanup(self.backend.close)
        self.client = self.backend.client('bot')
        self.time = 1000.0
        self.research = ResearchBridge(self.client, (Binding(GUILD, CHANNEL, 'ws1'),), clock=lambda: self.time)
        self.addAsyncCleanup(self.research.close)
        self.dossier = DossierBridge(self.research)
        self.addCleanup(self.dossier.close)
        self.caller = Caller(USER, GUILD, CHANNEL)
        self.number = 10000

    async def call(self, name: str, values: dict | None = None) -> BridgeReply:
        self.time += 9
        self.number += 1
        return await self.dossier.execute(name, values or {}, self.caller, self.number)

    async def remember(self, **values: object) -> tuple[BridgeReply, str]:
        reply = await self.call('remember', {'label': 'Library project', 'kind': 'project', 'note': 'Confirm opening hours.', **values})
        self.dossier.delivered(self.caller, reply.request_key)
        state = await self.backend.call({'path': '/api/buildanddo/dossier/read', 'body': {'action': 'recall', 'query': '', 'page': 1}})
        return reply, state['items'][0]['id']

    async def test_discord_and_website_recall_the_same_encrypted_entity(self) -> None:
        reply, entity_id = await self.remember(source_label='My interview', source_url='https://buildanddo.tech/docs')
        self.assertNotIn('Confirm opening hours.', reply.page.body)
        self.assertIn(entity_id, reply.page.url)
        viewed = await self.call('entity', {'id': entity_id})
        self.assertIn('Confirm opening hours.', viewed.page.body)
        self.assertIn('My interview', viewed.page.body)
        recall = await self.call('recall', {'query': 'opening'})
        self.assertIn('Matches: 1', recall.page.body)
        self.assertIn('Library project', recall.page.body)
        stored = await self.backend.call({'operation': 'storage'})
        self.assertNotIn('opening hours', json.dumps(stored))
        self.assertNotIn('Library project', json.dumps(stored))
        await self.backend.call({'path': '/api/buildanddo/dossier', 'body': {
            'action': 'entity.update', 'payload': {'id': entity_id, 'label': 'Reading project', 'kind': 'project', 'aliases': ['Study'], 'tags': ['books']},
            'revision': 1, 'request_key': 'website_changes_00001'}})
        self.assertIn('Reading project', (await self.call('recall', {'query': 'study books'})).page.body)

    async def test_add_to_known_entity_then_forget_requires_reviewed_revision(self) -> None:
        _, entity_id = await self.remember()
        added = await self.call('remember', {'entity_id': entity_id, 'revision': 1, 'note': 'Open on Tuesday.'})
        self.dossier.delivered(self.caller, added.request_key)
        with self.assertRaises(ResearchError) as error:
            await self.call('forget', {'id': entity_id, 'revision': 1, 'confirm': True})
        self.assertEqual(error.exception.status, 409)
        with self.assertRaises(ResearchError) as error:
            await self.call('forget', {'id': entity_id, 'revision': 2, 'confirm': False})
        self.assertEqual(error.exception.reason, 'confirmation')
        forgotten = await self.call('forget', {'id': entity_id, 'revision': 2, 'confirm': True})
        self.assertEqual(forgotten.page.title, 'Entity forgotten')
        self.dossier.delivered(self.caller, forgotten.request_key)
        self.assertIn('0 entities', (await self.call('dossier')).page.body)

    async def test_lost_accepted_response_recovers_without_duplicate_or_content_snapshot(self) -> None:
        self.client.lost = 'entity.create'
        with self.assertRaises(ResearchError):
            await self.call('remember', {'label': 'One person', 'kind': 'person', 'note': 'My explicit note.'})
        self.assertEqual(len(self.dossier.pending), 1)
        blocked = await self.call('remember', {'label': 'Another', 'note': 'Unrelated.'})
        self.assertIn('previous save', blocked.page.title)
        recovered = await self.call('dossier', {'recover': True})
        self.assertNotIn('My explicit note.', recovered.page.body)
        stored = await self.backend.call({'operation': 'storage'})
        self.assertEqual(len(stored['entities']), 1)
        self.assertEqual(len(stored['events']), 1)
        self.dossier.delivered(self.caller, 'wrong_request')
        self.assertEqual(len(self.dossier.pending), 1)
        self.dossier.delivered(self.caller, recovered.request_key)
        self.assertFalse(self.dossier.pending)
        self.assertEqual((await self.call('dossier', {'recover': True})).page.title, 'No pending dossier save')

    async def test_expired_and_closed_intent_erases_content_without_removing_saved_records(self) -> None:
        reply = await self.call('remember', {'label': 'Retain record', 'note': 'Temporary delivery intent.'})
        saved = next(iter(self.dossier.pending.values()))
        self.assertIsNotNone(saved.timer)
        self.time += 601
        self.assertEqual((await self.call('dossier', {'recover': True})).page.title, 'No pending dossier save')
        self.assertFalse(self.dossier.pending)
        self.assertTrue(saved.timer.cancelled())
        self.assertIn('1 entities', (await self.call('dossier')).page.body)
        self.dossier.delivered(self.caller, reply.request_key)
        await self.call('remember', {'label': 'Second', 'note': 'Clear on shutdown.'})
        self.dossier.close()
        self.assertFalse(self.dossier.pending)

    async def test_membership_revocation_and_account_relinking_reject_private_read_and_retry(self) -> None:
        await self.remember()
        await self.backend.call({'operation': 'revoke'})
        with self.assertRaises(ResearchError) as error:
            await self.call('recall')
        self.assertEqual(error.exception.status, 403)

    async def test_relink_drops_pending_input_instead_of_saving_under_another_identity(self) -> None:
        self.client.lost = 'entity.create'
        with self.assertRaises(ResearchError):
            await self.call('remember', {'label': 'Original identity', 'note': 'Keep private.'})
        await self.backend.call({'operation': 'relink'})
        with self.assertRaises(ResearchError) as error:
            await self.call('dossier', {'recover': True})
        self.assertEqual(error.exception.reason, 'forbidden')
        self.assertFalse(self.dossier.pending)
        self.assertIn('0 entities', (await self.call('dossier')).page.body)

    async def test_missing_encryption_binding_never_creates_an_entity(self) -> None:
        await self.backend.call({'operation': 'locked'})
        with self.assertRaises(ResearchError):
            await self.call('remember', {'label': 'Unavailable', 'note': 'Must not save.'})
        self.assertFalse(self.dossier.pending)
        self.assertEqual((await self.backend.call({'operation': 'storage'}))['entities'], [])

    async def test_scope_limits_and_invalid_command_inputs_fail_before_any_save(self) -> None:
        for caller in [Caller(USER, None, None), Caller(USER, GUILD, CHANNEL, True), Caller(USER, GUILD, CHANNEL + 1)]:
            with self.assertRaises(ResearchError):
                await self.dossier.execute('dossier', {}, caller, 11)
        for args in [{'label': 'A', 'note': 'Note', 'kind': 'owner'}, {'label': 'A', 'note': 'x' * 2001},
                     {'entity_id': 'known', 'label': 'Different label', 'revision': 1, 'note': 'Note'},
                     {'entity_id': 'known', 'revision': True, 'note': 'Note'}, {'label': 'New', 'revision': 1, 'note': 'Note'}]:
            with self.assertRaises(ResearchError):
                await self.call('remember', args)
        for name, args in [('recall', {'page': 0}), ('recall', {'page': 21}), ('entity', {'id': '../x'}), ('unknown', {})]:
            with self.assertRaises(ResearchError):
                await self.call(name, args)
        self.assertEqual((await self.backend.call({'operation': 'storage'}))['entities'], [])

    async def test_overlapping_commands_and_pending_capacity_remain_bounded(self) -> None:
        scope = (USER, GUILD, CHANNEL)
        self.dossier.busy.add(scope)
        with self.assertRaises(ResearchError) as error:
            await self.call('dossier')
        self.assertEqual(error.exception.reason, 'rate_limited')
        self.dossier.busy.clear()
        for number in range(100):
            self.dossier.pending[(number, GUILD, CHANNEL)] = Intent({}, 'editor', 'discordlink', self.time + 1000)
        with self.assertRaises(ResearchError) as error:
            await self.call('remember', {'label': 'At capacity', 'note': 'No allocation.'})
        self.assertEqual(error.exception.reason, 'rate_limited')
        self.dossier.close()
        with patch.object(self.dossier.limiter, 'admit', return_value='wait'):
            with self.assertRaises(ResearchError):
                await self.call('dossier')

    async def test_malformed_and_cross_account_responses_are_never_rendered(self) -> None:
        _, entity_id = await self.remember()
        original = self.client.json

        async def corrupt(path: str, *, body: dict, **kwargs: object) -> dict:
            value = await original(path, body=body)
            if body['command']['action'] != 'access':
                value['owner'] = 'another-account'
            return value

        self.client.json = corrupt
        with self.assertRaises(ResearchError):
            await self.call('entity', {'id': entity_id})
        self.client.json = AsyncMock(return_value={'workspace': 'ws1', 'link_id': 'discordlink', 'owner': 'editor', 'encrypted_storage': False})
        with self.assertRaises(ResearchError):
            await self.call('dossier')

    async def test_malformed_receipt_preserves_uncertain_intent_for_recovery(self) -> None:
        original = self.client.json

        async def corrupt(path: str, *, body: dict, **kwargs: object) -> dict:
            value = await original(path, body=body)
            if body['command']['action'] == 'entity.create':
                value['revision'] = 999
            return value

        self.client.json = corrupt
        with self.assertRaises(ResearchError):
            await self.call('remember', {'label': 'One saved', 'note': 'Saved exactly once.'})
        self.assertEqual(len(self.dossier.pending), 1)
        self.client.json = original
        reply = await self.call('dossier', {'recover': True})
        self.dossier.delivered(self.caller, reply.request_key)
        self.assertEqual(len((await self.backend.call({'operation': 'storage'}))['entities']), 1)

    async def test_pagination_and_private_excerpt_bounds(self) -> None:
        for i in range(12):
            await self.remember(label=f'Contact {i}', note='A long explicit note. ' * 90)
        first = await self.call('recall')
        self.assertIn('More results', first.page.body)
        self.assertLessEqual(len(first.page.body), 1900)
        second = await self.call('recall', {'page': 2})
        self.assertNotIn('More results', second.page.body)
        self.assertIn('Matches: 12', second.page.body)

    async def test_adapter_registers_25_commands_and_delivers_private_results_without_readers(self) -> None:
        bot = ADAPTER.BuildAndDoBot(Settings(), research=self.research)
        self.addAsyncCleanup(bot.close)
        self.assertEqual(len(bot.group.commands), 25)
        self.assertTrue(set(DOSSIER_COMMANDS) <= {command.name for command in bot.group.commands})
        call = interaction(USER, GUILD, CHANNEL)
        call.id = 55555555555555555
        with self.assertLogs('buildanddo.discord', level='INFO') as logs:
            await bot.respond_dossier(call, 'remember', {'label': 'Private name', 'note': 'Private original note.'})
        call.response.defer.assert_awaited_once_with(ephemeral=True, thinking=True)
        sent = call.edit_original_response.call_args.kwargs
        self.assertIsNone(sent['view'])
        self.assertIsNotNone(sent['allowed_mentions'])
        self.assertFalse(bot.dossier.pending)
        self.assertNotIn('Private name', '\n'.join(logs.output))
        self.assertNotIn('Private original note.', '\n'.join(logs.output))

    async def test_adapter_delivery_failure_keeps_recoverable_input_and_errors_are_bounded(self) -> None:
        bot = ADAPTER.BuildAndDoBot(Settings(), research=self.research)
        self.addAsyncCleanup(bot.close)
        call = interaction(USER, GUILD, CHANNEL)
        call.id = 55555555555555555
        call.edit_original_response.side_effect = RuntimeError('lost reply')
        with self.assertRaises(RuntimeError):
            await bot.respond_dossier(call, 'remember', {'label': 'One save', 'note': 'Retry without duplicates.'})
        self.assertEqual(len(bot.dossier.pending), 1)
        bot.dossier.close()
        for reason in ['forbidden', 'confirmation', 'conflict', 'invalid_data', 'rate_limited', 'unavailable']:
            with patch.object(bot.dossier, 'execute', side_effect=ResearchError(reason)):
                call = interaction(USER, GUILD, CHANNEL)
                call.id = 55555555555555555
                await bot.respond_dossier(call, 'dossier', {})
                self.assertIsNone(call.edit_original_response.call_args.kwargs['view'])
        bot.dossier = None
        await bot.respond_dossier(call, 'dossier', {})

    async def test_typed_command_callbacks_forward_intent_without_implicit_identity_lookup(self) -> None:
        bot = ADAPTER.BuildAndDoBot(Settings(), research=self.research)
        self.addAsyncCleanup(bot.close)
        bot.respond_dossier = AsyncMock()
        args = {'dossier': (), 'recall': (), 'entity': ('entity1',), 'forget': ('entity1', 1, True), 'remember': ('Explicit note.',)}
        call = interaction(USER, GUILD, CHANNEL)
        for command in bot.group.commands:
            if command.name in args:
                await command.callback(call, *args[command.name])
        self.assertEqual(bot.respond_dossier.await_count, 5)
        remembered = next(call for call in bot.respond_dossier.call_args_list if call.args[1] == 'remember')
        self.assertEqual(remembered.args[2]['note'], 'Explicit note.')


if __name__ == '__main__':
    unittest.main()
