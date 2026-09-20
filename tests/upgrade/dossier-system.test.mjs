// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/dossier-system.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     tests/upgrade/dossier-fixture.mjs, apps/pocketbase/pb_hooks/dossier.pb.js, apps/pocketbase/pb_hooks/dossier-vault.js, apps/pocketbase/pb_migrations/1790200000_private_dossiers.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/dossier-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/dossier.pb.js; VALIDATES apps/pocketbase/pb_hooks/dossier-vault.js; VALIDATES apps/pocketbase/pb_migrations/1790200000_private_dossiers.js
// DAG Node:    none
// Intent:      Verify cross-account denial, encrypted persistence, source-aware recall, corrections and deletion-safe transactional retry behavior.
// ───────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { dossierFixture, DOSSIER_SCHEMA } from './dossier-fixture.mjs';
import { source } from './admin-fixture.mjs';
const status = (code) => (error) => error.status === code;
const detail = (f, id, actor) => f.read({ action: 'entity', id }, actor).entity;

test('Discord identity lookup uses native ExternalAuth models without querying a synthetic record collection', () => {
    const f = dossierFixture(); const find = f.app.findRecordsByFilter.bind(f.app);
    f.app.findRecordsByFilter = (name, ...args) => {
        if (name === '_externalAuths') throw new Error('Native OAuth links are not a PocketBase record collection.');
        return find(name, ...args);
    };
    assert.equal(f.bridge({ action: 'access' }).owner, 'editor');
    // Native request properties need not be enumerable JavaScript own fields.
    const event = f.event('bot', { discord_user_id: '34567890123456789', guild_id: '12345678901234567',
        channel_id: '23456789012345678', link_id: 'discordlink', command: { action: 'access' } }, { workspace: 'ws1' });
    for (const name of ['auth', 'request', 'requestInfo'])
        Object.defineProperty(event, name, { ...Object.getOwnPropertyDescriptor(event, name), enumerable: false });
    assert.equal(f.service.discord(event).owner, 'editor');
    f.app.findFirstExternalAuthByExpr = () => ({ id: 'wrong', provider: 'discord', providerId: '34567890123456789',
        collectionRef: 'a-foreign-auth-collection', recordRef: 'editor' });
    assert.throws(() => f.bridge({ action: 'access' }), status(403));
});

test('first explicit save creates one personal dossier and stores no entity or note plaintext', () => {
    const f = dossierFixture(); assert.equal(f.read().dossier.id, ''); assert.equal(f.data.user_dossiers.length, 0);
    const saved = f.create(); assert.equal(saved.owner, 'editor'); assert.equal(saved.revision, 1);
    assert.equal(f.data.user_dossiers.length, 1); assert.equal(f.data.dossier_entities.length, 1);
    const stored = JSON.stringify([f.data.user_dossiers, f.data.dossier_entities, f.data.dossier_events]);
    for (const text of ['Library project', 'Reading room', 'opening hours', 'My source', 'https://buildanddo.com/docs']) assert.ok(!stored.includes(text));
    const entity = detail(f, saved.id); assert.equal(entity.notes[0].origin, 'website');
    assert.equal(entity.notes[0].source_label, 'My source'); assert.ok(Date.parse(entity.notes[0].created));
    assert.equal(f.read().dossier.owner, 'editor'); assert.equal(f.read().entity_count, 1);
});

test('admins, viewers and unrelated members cannot read or mutate another personal dossier', () => {
    const f = dossierFixture(); const saved = f.create();
    for (const actor of ['admin', 'owner', 'viewer', 'outsider', 'bot', 'worker']) {
        assert.equal(f.read(undefined, actor).entity_count, 0);
        assert.throws(() => detail(f, saved.id, actor), status(404));
        assert.throws(() => f.command('entity.delete', { id: saved.id }, { actor, revision: 1 }), status(404));
    }
    assert.throws(() => f.read(undefined, ''), status(403));
    assert.throws(() => f.create({ owner: 'owner' }), status(400));
    assert.equal(f.create({}, { actor: 'viewer' }).owner, 'viewer');
});

test('personal content survives workspace changes while Discord checks current membership and OAuth on every read', () => {
    const f = dossierFixture(); const saved = f.create();
    assert.equal(f.bridge({ action: 'entity', id: saved.id }).entity.label, 'Library project');
    for (const overrides of [{ actor: 'worker' }, { channel_id: '34567890123456789' }, { workspace: 'ws2' },
        { link_id: 'old-link' }, { discord_user_id: 'invalid' }]) {
        assert.throws(() => f.bridge({ action: 'entity', id: saved.id }, overrides));
    }
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    assert.throws(() => f.bridge({ action: 'recall', query: '', page: 1 }), status(403));
    assert.equal(detail(f, saved.id).label, 'Library project');
    f.seed('workspace_members', { id: 'editormember', workspace: 'ws1', user: 'editor', role: 'viewer' });
    assert.equal(f.bridge({ action: 'entity', id: saved.id }).owner, 'editor');
    f.app.delete(f.app.findRecordById('_externalAuths', 'discordlink'));
    assert.throws(() => f.bridge({ action: 'entity', id: saved.id }), status(403));
});

test('disabled integrations and relinked Discord identities cannot recall the previous account', () => {
    const f = dossierFixture(); const saved = f.create();
    const record = f.app.findRecordById('workspace_integrations', f.data.workspace_integrations.find((row) => row.provider === 'discord').id);
    record.set('desired_enabled', false); f.app.save(record);
    assert.throws(() => f.bridge({ action: 'access' }), status(403));
    record.set('desired_enabled', true); f.app.save(record);
    f.app.delete(f.app.findRecordById('_externalAuths', 'discordlink'));
    f.seed('_externalAuths', { id: 'new-link', provider: 'discord', providerId: '34567890123456789', collectionRef: f.collections.users.id, recordRef: 'admin' });
    assert.throws(() => f.bridge({ action: 'entity', id: saved.id }), status(403));
    assert.throws(() => f.bridge({ action: 'entity', id: saved.id }, { link_id: 'new-link' }), status(404));
    assert.equal(f.bridge({ action: 'access' }, { link_id: '' }).owner, 'admin');
});

test('one shared record supports Discord additions, website corrections and preserved provenance', () => {
    const f = dossierFixture(); const saved = f.bridge(f.body('entity.create', f.input()));
    assert.equal(detail(f, saved.id).notes[0].origin, 'discord');
    const added = f.command('note.add', { id: saved.id, text: 'Opening moved to Monday.', source_url: '', source_label: 'Call' }, { revision: 1 });
    assert.equal(added.revision, 2); let entity = detail(f, saved.id); assert.equal(entity.notes.length, 2);
    f.command('note.update', { id: saved.id, note_id: entity.notes[1].id, text: 'Opening moved to Tuesday.', source_url: '', source_label: 'Correction' }, { revision: 2 });
    entity = detail(f, saved.id); assert.equal(entity.notes[1].text, 'Opening moved to Tuesday.');
    assert.equal(entity.notes[1].corrected_via, 'website');
    assert.equal(f.read({ action: 'recall', query: 'Monday', page: 1 }).total, 0);
    f.command('note.delete', { id: saved.id, note_id: entity.notes[1].id }, { revision: 3 });
    assert.equal(detail(f, saved.id).notes.length, 1);
    assert.equal(f.read({ action: 'recall', query: 'Tuesday', page: 1 }).total, 0);
    for (const row of f.data.dossier_events) {
        const event = f.vault.open(f.app.findRecordById('dossier_events', row.id), f.keys);
        assert.ok(!JSON.stringify(event).includes('Monday')); assert.ok(!JSON.stringify(event).includes('Tuesday'));
        assert.ok(!Object.hasOwn(event, 'command'));
    }
});

test('bounded recall searches aliases, tags and notes with explicit pagination and matching excerpts', () => {
    const f = dossierFixture();
    for (let i = 0; i < 12; i++) f.create({ label: `Room ${i}`, aliases: ['Bibliothèque'], tags: ['Hours'], note: 'Read after noon. \u{1f4d8}' });
    const first = f.read({ action: 'recall', query: 'bibliothèque HOURS \u{1f4d8}', page: 1 });
    assert.equal(first.total, 12); assert.equal(first.items.length, 10); assert.equal(first.has_more, true);
    const last = f.read({ action: 'recall', query: 'bibliothèque HOURS \u{1f4d8}', page: 2 });
    assert.equal(last.items.length, 2); assert.equal(last.has_more, false); assert.match(first.items[0].excerpt, /\u{1f4d8}/u);
    assert.equal(f.read({ action: 'recall', query: 'nonexistent', page: 1 }).total, 0);
    assert.equal(new Set([...first.items, ...last.items].map((row) => row.id)).size, 12);
});

test('same-name entities remain distinct and label corrections retain the entity identity', () => {
    const f = dossierFixture(); const a = f.create({ label: 'Alex', kind: 'person' }); const b = f.create({ label: 'Alex', kind: 'person' });
    assert.notEqual(a.id, b.id); assert.equal(f.read({ action: 'recall', query: 'Alex', page: 1 }).total, 2);
    f.command('entity.update', { id: a.id, label: 'Alex (author)', kind: 'person', aliases: ['A. Writer'], tags: ['book'] }, { revision: 1 });
    assert.equal(detail(f, a.id).label, 'Alex (author)'); assert.equal(detail(f, b.id).label, 'Alex');
});

test('lost accepted writes replay once and stale edits conflict without replacing content', () => {
    const f = dossierFixture(); const key = 'retry_same_entity_0001'; const saved = f.create({}, { key });
    const retried = f.create({}, { key }); assert.equal(retried.replayed, true); assert.equal(retried.id, saved.id);
    assert.equal(f.data.dossier_entities.length, 1); assert.equal(f.data.dossier_events.length, 1);
    assert.throws(() => f.create({ label: 'Another person' }, { key }), status(409));
    f.command('note.add', { id: saved.id, text: 'New note.', source_url: '', source_label: '' }, { revision: 1 });
    assert.throws(() => f.command('entity.delete', { id: saved.id }, { revision: 1 }), status(409));
    assert.equal(detail(f, saved.id).notes.length, 2);
});

test('forgetting removes content and an old accepted create or note retry cannot resurrect it', () => {
    const f = dossierFixture(); const key = 'dossier_delete_retry_01'; const saved = f.create({}, { key });
    const note = { id: saved.id, text: 'Remove me permanently.', source_url: '', source_label: '' };
    f.command('note.add', note, { revision: 1, key: 'dossier_note_retry_001' });
    const removed = f.command('entity.delete', { id: saved.id }, { revision: 2, key: 'dossier_forget_retry_1' });
    assert.equal(removed.revision, 3); assert.equal(f.read().entity_count, 0);
    assert.equal(f.create({}, { key }).replayed, true);
    assert.equal(f.command('note.add', note, { revision: 1, key: 'dossier_note_retry_001' }).replayed, true);
    assert.equal(f.command('entity.delete', { id: saved.id }, { revision: 2, key: 'dossier_forget_retry_1' }).replayed, true);
    assert.equal(f.read().entity_count, 0); assert.throws(() => detail(f, saved.id), status(404));
    const history = f.read({ action: 'history', page: 1 }); assert.equal(history.items.length, 3);
    assert.ok(history.items.every((row) => !Object.hasOwn(row, 'text') && !Object.hasOwn(row, 'label')));
    assert.equal(f.read({ action: 'history', page: 1 }, 'admin').items.length, 0);
});

test('receipt storage failure rolls back both first saves and deletions atomically', () => {
    const f = dossierFixture(); f.app.fail = 'dossier_events'; assert.throws(() => f.create(), /storage unavailable/);
    assert.equal(f.data.user_dossiers.length, 0); assert.equal(f.data.dossier_entities.length, 0);
    f.app.fail = ''; const saved = f.create(); f.app.fail = 'dossier_events';
    assert.throws(() => f.command('entity.delete', { id: saved.id }, { revision: 1 }), /storage unavailable/);
    assert.equal(detail(f, saved.id).revision, 1); assert.equal(f.read().dossier.revision, 1);
});

test('profile changes use the same canonical dossier and revision fences', () => {
    const f = dossierFixture(); const first = f.command('dossier.update', { about: 'My private learning goals.' });
    assert.equal(f.read().dossier.about, 'My private learning goals.');
    assert.throws(() => f.command('dossier.update', { about: 'Old tab' }), status(409));
    f.create(); assert.equal(f.read().dossier.id, first.id); assert.equal(f.read().dossier.revision, 2);
    assert.throws(() => f.command('dossier.update', { about: '' }, { revision: 1 }), status(409));
    f.command('dossier.update', { about: '' }, { revision: 2 }); assert.equal(f.read().dossier.about, '');
});

test('missing, malformed or removed encryption bindings fail closed before any write', () => {
    const f = dossierFixture(); f.create();
    for (const value of ['', 'invalid-json', 'null', '{}', '[]', JSON.stringify({ active: 'x', keys: {} }),
        JSON.stringify({ active: 'x', keys: { x: 'short' } }), JSON.stringify({ active: 'x', keys: { x: 'k'.repeat(32) }, extra: true })]) {
        f.privateEnv.keys = value; assert.throws(() => f.read(), status(503)); assert.throws(() => f.create(), status(503));
    }
    f.privateEnv.keys = JSON.stringify({ active: 'fixture2', keys: { fixture2: 'z'.repeat(32) } });
    assert.throws(() => f.read(), status(503)); assert.equal(f.data.dossier_entities.length, 1);
});

test('historical configured keys read prior records and new saves use the active key', () => {
    const f = dossierFixture(); const saved = f.create(); f.privateEnv.keys = JSON.stringify({ ...f.keys, active: 'fixture2' });
    assert.equal(detail(f, saved.id).label, 'Library project');
    f.command('note.add', { id: saved.id, text: 'Updated with current binding.', source_url: '', source_label: '' }, { revision: 1 });
    assert.equal(f.data.dossier_entities[0].key_id, 'fixture2'); assert.equal(detail(f, saved.id).notes.length, 2);
});

test('tampering, replaying ciphertext at another revision or substituting records is rejected', () => {
    for (const mode of ['tamper', 'revision', 'other-record', 'owner']) {
        const f = dossierFixture(); const first = f.create(); const other = f.create({ label: 'Another record' });
        const row = f.app.findRecordById('dossier_entities', first.id);
        if (mode === 'tamper') row.set('sealed', row.getString('sealed').slice(0, -5) + 'AAAAA');
        if (mode === 'revision') row.set('revision', 99);
        if (mode === 'other-record') row.set('sealed', f.data.dossier_entities.find((r) => r.id === other.id).sealed);
        if (mode === 'owner') row.set('owner', 'admin');
        f.app.save(row);
        assert.throws(() => detail(f, first.id, mode === 'owner' ? 'admin' : 'editor'), status(503));
    }
});

test('invalid inputs, unsafe source references and excessive notes do not partially save', () => {
    const f = dossierFixture();
    for (const value of [{ label: '' }, { kind: 'administrator' }, { aliases: ['a', 'A'] }, { tags: ['x'.repeat(41)] },
        { note: 'x'.repeat(2001) }, { source_url: 'https://user:password@buildanddo.com/docs' }, { source_url: 'http://127.0.0.1' },
        { aliases: 'alias' }, { tags: Array(11).fill('tag') }]) assert.throws(() => f.create(value), status(400));
    assert.equal(f.data.user_dossiers.length, 0); const saved = f.create();
    assert.throws(() => f.command('note.delete', { id: saved.id, note_id: 'missing' }, { revision: 1 }), status(404));
    for (let i = 1; i < 20; i++) f.command('note.add', { id: saved.id, text: `Note ${i}`, source_url: '', source_label: '' }, { revision: i });
    assert.throws(() => f.command('note.add', { id: saved.id, text: 'Too many', source_url: '', source_label: '' }, { revision: 20 }), status(409));
    assert.equal(detail(f, saved.id).notes.length, 20);
    for (const body of [{ action: 'read-all', query: '', page: 1 }, { action: 'recall', query: '', page: 0 }, { action: 'recall', query: 'x'.repeat(201), page: 1 },
        { action: 'history', page: 10000 }, { action: 'entity', id: '../foreign' }]) assert.throws(() => f.read(body), status(400));
    assert.throws(() => f.command('approve', {}), status(400)); assert.throws(() => f.create({}, { revision: -1 }), status(400));
    assert.throws(() => f.create({}, { revision: 1 }), status(409));
});

test('additive migration replay and rollback retain ciphertext while keeping raw APIs locked', () => {
    const f = dossierFixture(); const saved = f.create(); const migration = f.migration(DOSSIER_SCHEMA); migration.up();
    assert.equal(detail(f, saved.id).label, 'Library project');
    for (const name of ['user_dossiers', 'dossier_entities', 'dossier_events']) {
        const collection = f.collections[name];
        for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(collection[rule], null);
        assert.equal(collection.fields.getByName('owner').cascadeDelete, true);
        assert.equal(collection.fields.getByName('sealed').hidden, true);
    }
    migration.down(); assert.equal(f.data.dossier_entities.length, 1); assert.throws(() => f.read(), status(503));
    migration.down(); migration.up(); assert.equal(detail(f, saved.id).notes.length, 1);
    f.collections.dossier_entities.listRule = '';
    assert.throws(() => f.read(), status(503)); assert.throws(() => migration.up(), /Review custom/); assert.throws(() => migration.down(), /Review custom/);
});

test('migration refuses incompatible encryption schema or retry indexes before changing other collections', () => {
    for (const mode of ['field', 'index']) {
        const f = dossierFixture();
        if (mode === 'field') f.collections.dossier_events.fields.getByName('sealed').max = 12;
        else f.collections.dossier_events.indexes = [];
        assert.throws(() => f.migration(DOSSIER_SCHEMA).up(), /Review/);
        assert.equal(f.data.user_dossiers.length, 0);
    }
});

test('native route registrations require users auth, bounded POST bodies and no-store responses', () => {
    const calls = []; const service = { read: () => ({ action: 'read' }), command: () => ({ action: 'command' }), discord: () => ({ action: 'discord' }) };
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/dossier.pb.js'), { __hooks: '/hooks', require: () => service,
        $apis: { requireAuth: (collection) => ({ auth: collection }), bodyLimit: (max) => ({ max }) }, routerAdd: (...args) => calls.push(args) });
    assert.equal(calls.length, 3);
    for (const [method, path, handler, auth, limit] of calls) {
        assert.equal(method, 'POST'); assert.equal(auth.auth, 'users'); assert.ok(limit.max <= 65536); assert.ok(!path.includes('?'));
        const headers = {}; const result = handler({ response: { header: () => ({ set: (name, value) => { headers[name] = value; } }) }, json: (code, value) => ({ code, value }) });
        assert.equal(result.code, 200); assert.equal(headers['Cache-Control'], 'no-store');
    }
});
