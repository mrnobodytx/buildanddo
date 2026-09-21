// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/dossier-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/privateDossier.js, tests/upgrade/dossier-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/privateDossier.js; CONSUMES tests/upgrade/dossier-fixture.mjs
// DAG Node:    none
// Intent:      Verify the browser and backend share private identity, loss recovery and deletion semantics without persisting decrypted client data.
// ───────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDossierClient } from '../../apps/web/src/lib/privateDossier.js';
import { dossierFixture } from './dossier-fixture.mjs';
import { plain } from './admin-fixture.mjs';

function connected(options = {}) {
    const f = dossierFixture(); const requests = []; let current = true; let count = 0;
    const client = { authStore: { record: { id: 'editor' } }, async send(path, options) {
        requests.push({ path, options }); const e = f.event(client.authStore.record.id, options.body);
        return plain(path.endsWith('/read') ? f.service.read(e) : f.service.command(e));
    } };
    const api = createDossierClient({ client, accountId: 'editor', isCurrent: () => current,
        keyFactory: () => `browser_dossier_${String(++count).padStart(8, '0')}`, ...options });
    return { f, api, client, requests, stale: () => { current = false; } };
}

test('source-connected browser flow creates, searches, corrects and forgets one personal entity', async () => {
    const { f, api, requests } = connected();
    const created = await api.command('entity.create', f.input()); assert.equal(created.ok, true); const id = created.result.id;
    assert.equal((await api.recall('Reading room')).data.items[0].id, id);
    const note = (await api.detail(id)).data.entity.notes[0];
    assert.equal((await api.command('note.update', { id, note_id: note.id, text: 'Hours confirmed.', source_url: '', source_label: 'Phone call' }, 1)).ok, true);
    assert.equal((await api.recall('confirmed')).data.total, 1);
    assert.equal((await api.command('note.delete', { id, note_id: note.id }, 2)).ok, true);
    assert.equal((await api.detail(id)).data.entity.notes.length, 0);
    assert.equal((await api.command('entity.delete', { id }, 3)).ok, true);
    assert.equal((await api.recall()).data.entity_count, 0); assert.equal((await api.history()).data.items.length, 4);
    for (const { path, options } of requests) {
        assert.ok(!path.includes('?')); assert.equal(options.cache, 'no-store'); assert.equal(options.method, 'POST'); assert.equal(options.requestKey, null);
    }
});

test('lost accepted reply preserves immutable retry intent and does not duplicate data', async () => {
    const { f, api, client } = connected(); const send = client.send; let lost = true;
    client.send = async (...args) => { const result = await send(...args); if (lost) { lost = false; throw new Error('lost accepted response'); } return result; };
    const input = f.input(); assert.equal((await api.command('entity.create', input)).reason, 'uncertain');
    input.label = 'Changed after send'; input.aliases.push('Not part of saved intent');
    assert.equal((await api.command('entity.create', input)).reason, 'uncertain');
    const recovered = await api.retry(); assert.equal(recovered.ok, true); assert.equal(recovered.result.replayed, true);
    assert.equal((await api.detail(recovered.result.id)).data.entity.label, 'Library project');
    assert.equal(f.data.dossier_entities.length, 1); assert.equal((await api.retry()).reason, 'invalid');
});

test('accepted writes and reads finishing after account changes never reach the next account', async () => {
    for (const writing of [true, false]) for (const fails of [true, false]) {
        const { f, api, client } = connected(); const send = client.send;
        client.send = async (...args) => { const value = await send(...args); client.authStore.record = { id: 'admin' }; if (fails) throw new Error('old failure'); return value; };
        const result = writing ? await api.command('entity.create', f.input()) : await api.recall();
        assert.deepEqual(result, { ok: false, reason: 'scope_changed', error: '' });
        assert.equal((await api.retry()).reason, 'scope_changed');
    }
});

test('scope disposal fences in-flight responses and clears old intent while allowing a new mount', async () => {
    const { f, api, client } = connected(); let release; const send = client.send;
    client.send = async (...args) => { const result = await send(...args); await new Promise((resolve) => { release = resolve; }); return result; };
    const active = api.command('entity.create', f.input()); await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await api.command('entity.create', f.input())).reason, 'busy');
    api.dispose(); client.send = send; release(); assert.equal((await active).reason, 'scope_changed');
    assert.equal((await api.retry()).reason, 'invalid'); assert.equal((await api.recall()).data.entity_count, 1);
});

test('malformed receipt remains recoverable while forged cross-account reads are rejected', async () => {
    const { f, api, client } = connected(); const send = client.send;
    client.send = async (...args) => { await send(...args); return {}; };
    assert.equal((await api.command('entity.create', f.input())).reason, 'uncertain');
    client.send = send; const recovered = await api.retry(); assert.equal(recovered.ok, true);
    client.send = async (...args) => ({ ...await send(...args), owner: 'admin' });
    assert.equal((await api.recall()).ok, false); assert.equal((await api.detail(recovered.result.id)).ok, false); assert.equal((await api.history()).ok, false);
});

test('current revision failures keep the saved record and do not trap the client in recovery', async () => {
    const { f, api } = connected(); const created = await api.command('entity.create', f.input());
    f.command('note.add', { id: created.result.id, text: 'New revision.', source_url: '', source_label: '' }, { revision: 1 });
    assert.equal((await api.command('entity.delete', { id: created.result.id }, 1)).reason, 'conflict');
    assert.equal((await api.retry()).reason, 'invalid'); assert.equal((await api.detail(created.result.id)).data.entity.revision, 2);
    assert.equal((await api.command('entity.delete', { id: created.result.id }, 2)).ok, true);
});

test('unavailable encryption fails visibly and does not become an empty successful dossier', async () => {
    const { f, api } = connected(); f.privateEnv.keys = '';
    assert.equal((await api.recall()).reason, 'unavailable'); assert.equal((await api.command('entity.create', f.input())).reason, 'uncertain');
    f.privateEnv.keys = JSON.stringify(f.keys); assert.equal((await api.retry()).ok, true);
    assert.equal(f.data.dossier_entities.length, 1);
});

test('invalid commands, cyclic input, unavailable request IDs and demonstration mode cannot write', async () => {
    const { f, api } = connected(); const circular = {}; circular.circular = circular;
    for (const [action, payload, revision] of [['approve', {}, 0], ['entity.create', [], 0], ['entity.create', null, 0],
        ['entity.create', {}, -1], ['entity.create', circular, 0], ['entity.create', { note: 'x'.repeat(12001) }, 0]]) {
        assert.equal((await api.command(action, payload, revision)).reason, 'invalid');
    }
    for (const options of [{ keyFactory: () => 'bad' }, { keyFactory: () => { throw new Error(); } }]) {
        const next = connected(options); assert.equal((await next.api.command('entity.create', next.f.input())).reason, 'invalid');
    }
    for (const result of [await api.recall('', 0), await api.recall('x'.repeat(201)), await api.detail('../record'), await api.history(10000)]) assert.equal(result.reason, 'invalid');
    assert.equal((await connected({ demo: true }).api.recall()).reason, 'scope_changed');
    const other = connected(); other.stale(); assert.equal((await other.api.command('entity.create', f.input())).reason, 'scope_changed');
    assert.equal(f.data.dossier_entities.length, 0);
});

test('browser rejects unsafe source links and incomplete private result shapes', async () => {
    const { f, api, client } = connected(); const saved = await api.command('entity.create', f.input()); const send = client.send;
    for (const source_url of ['javascript:alert(1)', 'https://user:password@buildanddo.com/', 'invalid']) {
        client.send = async (...args) => { const data = await send(...args); data.entity.notes[0].source_url = source_url; return data; };
        assert.equal((await api.detail(saved.result.id)).ok, false);
    }
    client.send = async () => { throw { status: 403, response: { message: 'Untrusted server body must not reach the UI' } }; };
    const denied = await api.recall(); assert.equal(denied.reason, 'forbidden'); assert.ok(!denied.error.includes('Untrusted'));
    assert.equal((await api.command('dossier.update', { about: '' })).reason, 'forbidden');
    client.send = async () => { throw { status: 400 }; };
    assert.equal((await api.command('entity.create', f.input())).reason, 'invalid');
});
