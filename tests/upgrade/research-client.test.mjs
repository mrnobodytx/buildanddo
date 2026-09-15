// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/research-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/missionResearch.js, apps/web/src/lib/discordAccount.js, tests/upgrade/research-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/missionResearch.js; VALIDATES apps/web/src/lib/discordAccount.js; CONSUMES tests/upgrade/research-fixture.mjs
// DAG Node:    none
// Intent:      Exercise browser-to-backend retries, account revocation and native OAuth isolation without claiming rendered or native-runtime acceptance.
// ───────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchClient } from '../../apps/web/src/lib/missionResearch.js';
import { createDiscordAccountLink } from '../../apps/web/src/lib/discordAccount.js';
import { researchFixture } from './research-fixture.mjs';
import { plain } from './admin-fixture.mjs';

function connected(options = {}) {
    const f = researchFixture(); let current = true; let key = 0;
    const requests = [];
    const client = { authStore: { record: { id: 'editor' } }, async send(path, config) {
        requests.push({ path, config });
        const event = f.event(client.authStore.record.id, config.body || {}, { id: path.split('/').at(-1), query: config.query || {} });
        return plain(config.method === 'POST' ? f.service.command(event) : path.endsWith('/research') ? f.service.snapshot(event) : f.service.detail(event));
    } };
    const api = createResearchClient({ client, workspaceId: 'ws1', accountId: 'editor', isCurrent: () => current,
        keyFactory: () => `research_client_key_${++key}`, ...options });
    return { f, api, client, requests, stale: () => { current = false; } };
}

test('browser commands survive a lost accepted response and replay exactly once through real backend source', async () => {
    const { f, api, client } = connected(); const send = client.send; let lost = true;
    client.send = async (...args) => { const result = await send(...args); if (lost) { lost = false; throw new Error('connection closed'); } return result; };
    const first = await api.command('submit', f.input()); assert.equal(first.reason, 'uncertain');
    assert.equal(f.data.research_submissions.length, 1);
    const other = await api.command('submit', f.input({ title: 'Different intent' })); assert.equal(other.reason, 'uncertain');
    const retry = await api.retry(); assert.equal(retry.ok, true); assert.equal(retry.result.replayed, true);
    assert.equal(f.data.research_submissions.length, 1); assert.equal(f.data.research_events.length, 1);
    assert.equal((await api.retry()).reason, 'invalid');
});

test('malformed save responses retain retry keys and stale scopes discard private results', async () => {
    const a = connected(); const send = a.client.send; a.client.send = async (...args) => { await send(...args); return {}; };
    assert.equal((await a.api.command('submit', a.f.input())).reason, 'uncertain'); a.client.send = send;
    assert.equal((await a.api.retry()).ok, true);
    a.client.send = async (...args) => { const value = await send(...args); a.stale(); return value; };
    assert.equal((await a.api.read()).reason, 'scope_changed'); assert.equal((await a.api.command('submit', a.f.input())).reason, 'scope_changed');
});

test('an account change during a save suppresses both its accepted receipt and any late error', async () => {
    for (const lost of [false, true]) {
        const { f, api, client } = connected(); const send = client.send;
        client.send = async (...args) => {
            const receipt = await send(...args);
            client.authStore.record = { id: 'another-account' };
            if (lost) throw new Error('The previous account connection closed.');
            return receipt;
        };
        assert.deepEqual(await api.command('submit', f.input()), { ok: false, reason: 'scope_changed', error: '' });
        assert.equal(f.data.research_submissions.length, 1);
        assert.equal(f.data.research_submissions[0].owner, 'editor');
        assert.equal((await api.retry()).reason, 'scope_changed');
        assert.equal(f.data.research_events.length, 1);
    }
});

test('viewer writes, revoked membership and foreign research never bypass server authorization', async () => {
    const { f, api } = connected(); const saved = await api.command('submit', f.input());
    assert.equal((await api.detail(saved.result.id)).ok, true);
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    assert.equal((await api.read()).reason, 'forbidden'); assert.equal((await api.detail(saved.result.id)).reason, 'forbidden');
    assert.equal((await api.command('cancel', { id: saved.result.id }, 1)).reason, 'forbidden');
});

test('incomplete lists, details and unsupported commands are rejected instead of becoming empty successes', async () => {
    const { api, client } = connected();
    client.send = async () => ({ workspace: 'ws1', items: [] });
    assert.equal((await api.read()).ok, false); assert.equal((await api.detail('source1')).ok, false); assert.equal((await api.detail('../other')).ok, false);
    assert.equal((await api.command('approve', {}, 0)).reason, 'invalid'); assert.equal((await api.command('submit', [], 0)).reason, 'invalid');
    assert.equal((await connected({ demo: true }).api.read()).reason, 'scope_changed');
    assert.equal((await connected({ keyFactory: () => { throw new Error(); } }).api.command('submit', {}, 0)).reason, 'invalid');
});

test('one active command blocks overlapping saves and recovered command payloads stay immutable', async () => {
    const { api, client, f } = connected(); let release; const send = client.send;
    client.send = (...args) => new Promise((resolve) => { release = async () => resolve(await send(...args)); });
    const payload = f.input(); const saving = api.command('submit', payload); payload.title = 'Changed after sending';
    assert.equal((await api.retry()).reason, 'busy'); await release(); assert.equal((await saving).ok, true);
    assert.notEqual(f.data.research_submissions[0].title, payload.title);
});

test('file upload responses are scoped, bounded and recoverable without blind upload retries', async () => {
    const { api, client } = connected(); const uploaded = []; const blob = new Blob(['Document content'], { type: 'text/plain' }); Object.defineProperty(blob, 'name', { value: 'source.txt' });
    client.collection = () => ({ create: async (body, options) => { uploaded.push({ body, options }); return { id: 'upload1', workspace: 'ws1', owner: 'editor', kind: 'document' }; },
        getList: async () => ({ items: [{ id: 'upload1', workspace: 'ws1', owner: 'editor' }], totalPages: 2 }) });
    client.filter = (expression) => expression;
    assert.equal((await api.upload(blob)).result.id, 'upload1'); assert.equal(uploaded[0].body.get('owner'), 'editor'); assert.equal(uploaded[0].options.requestKey, null);
    assert.equal((await api.upload({ name: 'oversized.pdf', size: 20971521 })).reason, 'invalid');
    assert.equal((await api.upload({ name: 'program.exe', size: 10 })).reason, 'invalid');
    assert.equal((await api.uploads()).hasMore, true);
    client.collection = () => ({ create: async () => { throw new Error(); }, getList: async () => ({ items: [{ id: 'bad', workspace: 'ws2', owner: 'editor' }] }) });
    assert.equal((await api.upload(blob)).reason, 'upload_uncertain'); assert.equal((await api.uploads()).ok, false);
});

test('original file links use native file tokens and disappear on scope change or foreign data', async () => {
    const { api, client } = connected();
    const file = { id: 'upload1', workspace: 'ws1', asset: 'source.txt' }; let tokens = 0;
    client.collection = () => ({ getOne: async () => file });
    client.files = { getToken: async () => { tokens++; return 'test-file-session'; }, getURL: (record, asset, options) => `/api/files/research_uploads/${record.id}/${asset}?token=${options.token}` };
    assert.equal((await api.original('upload1')).ok, true); assert.equal(tokens, 1);
    file.workspace = 'ws2'; assert.equal((await api.original('upload1')).ok, false); assert.equal(tokens, 1);
    file.workspace = 'ws1'; client.files.getToken = async () => { client.authStore.record = { id: 'newuser' }; return 'new-file-session'; };
    assert.equal((await api.original('upload1')).reason, 'scope_changed');
});

test('uploads and lists reject stale accounts and failed native operations without leaving the client busy', async () => {
    const { api, client } = connected(); const blob = new Blob(['text']); Object.defineProperty(blob, 'name', { value: 'source.txt' });
    client.collection = () => ({ create: async () => { throw { status: 403 }; }, getList: async () => { throw { status: 403 }; } }); client.filter = () => '';
    assert.equal((await api.upload(blob)).reason, 'forbidden'); assert.equal((await api.uploads()).reason, 'forbidden');
    client.collection = () => ({ create: async () => { client.authStore.record = { id: 'newuser' }; return {}; } });
    assert.equal((await api.upload(blob)).reason, 'scope_changed'); assert.equal((await api.uploads()).reason, 'scope_changed');
});

function oauth() {
    let linked = false; let current = true; let callbacks = {};
    const shared = { authStore: { record: { id: 'account1' }, token: 'test-native-session' }, collection: () => ({
        listExternalAuths: async () => linked ? [{ provider: 'discord' }] : [], unlinkExternalAuth: async () => { linked = false; },
    }) };
    const isolated = { authStore: { save: (token, record) => { callbacks.copied = record.id; }, clear: () => { callbacks.cleared = true; } },
        collection: () => ({ authWithOAuth2: async (options) => { callbacks.options = options; linked = true; return { record: { id: 'account1' } }; } }),
        cancelAllRequests: () => { callbacks.cancelled = true; }, realtime: { unsubscribe: async () => undefined } };
    const api = createDiscordAccountLink({ client: shared, createIsolated: () => isolated, accountId: 'account1', isCurrent: () => current });
    return { api, shared, isolated, callbacks, stale: () => { current = false; } };
}

test('Discord linking uses the authenticated native OAuth client while preserving the shared sign-in', async () => {
    const f = oauth(); assert.equal((await f.api.status()).linked, false);
    assert.equal((await f.api.link()).linked, true); assert.equal(f.callbacks.copied, 'account1');
    assert.equal(f.callbacks.options.provider, 'discord'); assert.equal(f.shared.authStore.record.id, 'account1'); assert.equal(f.callbacks.cleared, true);
    assert.equal((await f.api.unlink()).linked, false);
});

test('a different OAuth result, cancellation or missing provider cannot switch website accounts', async () => {
    const f = oauth(); f.isolated.collection = () => ({ authWithOAuth2: async () => ({ record: { id: 'different' } }) });
    assert.match((await f.api.link()).error, /different/); assert.equal(f.shared.authStore.record.id, 'account1');
    f.isolated.collection = () => ({ authWithOAuth2: async () => { f.api.dispose(); f.stale(); return { record: { id: 'account1' } }; } });
    assert.equal((await f.api.link()).ok, false); assert.equal(f.callbacks.cancelled, true);
    const g = oauth(); g.shared.collection = () => ({ listExternalAuths: async () => { throw new Error(); } });
    assert.equal((await g.api.status()).ok, false); assert.equal((await g.api.link()).ok, false);
});

test('OAuth overlap and failed unlinking preserve the current account and permit a later status check', async () => {
    const f = oauth(); let complete;
    f.isolated.collection = () => ({ authWithOAuth2: () => new Promise((resolve) => { complete = resolve; }) });
    const pending = f.api.link(); assert.equal((await f.api.link()).ok, false); assert.equal((await f.api.unlink()).ok, false);
    complete({ record: { id: 'account1' } }); await pending;
    f.shared.collection = () => ({ unlinkExternalAuth: async () => { throw new Error(); }, listExternalAuths: async () => [] });
    assert.equal((await f.api.unlink()).ok, false); assert.equal((await f.api.status()).linked, false);
    f.stale(); assert.equal((await f.api.link()).ok, false); assert.equal((await f.api.unlink()).ok, false); assert.equal((await f.api.status()).ok, false);
});
