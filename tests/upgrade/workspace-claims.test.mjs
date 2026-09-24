// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/workspace-claims.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/workspace-record-policy.js, apps/pocketbase/pb_hooks/workspace-claims.js, apps/pocketbase/pb_hooks/workspace-claims.pb.js, apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js, apps/web/src/lib/workspaceClaims.js, apps/web/src/lib/workspaceRecords.js, apps/web/src/lib/workspaceControl.js, apps/web/src/lib/seatComms.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/workspace-record-policy.js; VALIDATES apps/pocketbase/pb_hooks/workspace-claims.js; VALIDATES apps/pocketbase/pb_hooks/workspace-claims.pb.js; VALIDATES apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js; VALIDATES apps/web/src/lib/workspaceClaims.js; VALIDATES apps/web/src/lib/workspaceRecords.js; VALIDATES apps/web/src/lib/workspaceControl.js; VALIDATES apps/web/src/lib/seatComms.js
// Intent:      Reject raw claim fabrication and exercise current native authority without treating storage doubles as native acceptance.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fixture, plain, source, repoPath } from './admin-fixture.mjs';
import { createWorkspaceRecordClient } from '../../apps/web/src/lib/workspaceRecords.js';
import { createWorkspaceClaimClient } from '../../apps/web/src/lib/workspaceClaims.js';
import { createWorkspaceControlClient } from '../../apps/web/src/lib/workspaceControl.js';

const denied = (operation, status = 403) => assert.throws(operation, (error) => error.status === status);
const collections = ['support_sources', 'corrections', 'daily_editions', 'specialist_desks', 'social_content', 'social_channels', 'seat_events'];
const migration = 'apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js';
const drafts = {
    'correction.save': ['corrections', { prior_prediction: 'Expected four', observed_result: 'Reported two', reference: 'Synthetic comparison' }],
    'edition.save': ['daily_editions', { title: 'Synthetic edition', summary: 'Reported local work', body: 'A retained draft.', edition_date: '' }],
    'desk.save': ['specialist_desks', { desk: 'research', scope: 'Read synthetic sources', status: 'idle' }],
    'content.save': ['social_content', { title: 'Synthetic article', body: 'Reported local work', audience: 'Editors', status: 'draft', format: 'blog' }],
};
function claimsFixture({ migrated = true } = {}) {
    const f = fixture({ runtime: { toString: String, $os: { readFile: () => source('apps/pocketbase/pb_migrations/data/starter-tutorials.json') } } });
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up();
    f.seed('workspace_members', { id: 'secondeditor', workspace: 'ws1', user: 'newuser', role: 'editor' });
    if (migrated) f.migration(migration).up();
    let sequence = 0;
    f.claim = (action, values, { actor = 'editor', id = '', revision = 0, key, workspace = 'ws1' } = {}) =>
        plain(f.load('workspace-claims.js').command(f.event(actor, { action, revision,
            request_key: key || `claim_request_${++sequence}_synthetic`, payload: action === 'edition.publish' ? { id } : { id, values } }, { workspace })));
    return f;
}

for (const name of collections) test(`raw ${name} requests cannot bypass claim commands`, () => {
    const f = fixture();
    for (const actor of ['owner', 'admin', 'editor']) for (const operation of ['create', 'update', 'delete']) {
        const e = f.event(actor);
        e.record = f.record(name, { id: 'rawclaim', workspace: 'ws1', owner: actor, status: 'pending',
            prior_prediction: 'Expected four', observed_result: 'Reported two', gross: 1000, currency: 'USD' });
        e.next = () => assert.fail(`Raw ${name} ${operation} reached persistence for ${actor}`);
        denied(() => f.load('workspace-record-policy.js').enforce(e, operation));
    }
});

test('a teammate editor cannot rewrite another author comparison through the native policy', () => {
    const f = fixture(), e = f.event('editor');
    e.record = f.record('corrections', { id: 'comparison', workspace: 'ws1', owner: 'owner', status: 'pending' });
    e.record.set('status', 'verified');
    e.next = () => assert.fail('An editor promoted another account comparison without a bound review');
    denied(() => f.load('workspace-record-policy.js').enforce(e, 'update'));
});

test('migration locks exactly seven collections, normalizes native rule pointers and retains every historical byte', () => {
    const f = claimsFixture({ migrated: false });
    f.seed('support_sources', { id: 'legacyamount', workspace: 'ws1', owner: 'editor', provider: 'stripe', status: 'healthy', gross: 200, last_sync: '2026-09-01' });
    f.seed('corrections', { id: 'legacyclaim', workspace: 'ws1', owner: 'editor', status: 'verified', prior_prediction: 'Old claim', observed_result: 'Old report' });
    const data = plain(f.data), outside = plain(f.collections.signals);
    for (const name of collections) for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (f.collections[name][key] !== null) f.collections[name][key] = new String(f.collections[name][key]);
    f.migration(migration).up();
    for (const name of collections) f.collections[name].fields.getByName('claim_revision').min = new Number(0);
    f.migration(migration).up();
    assert.deepEqual(f.data, data);
    assert.deepEqual(plain(f.collections.signals), outside);
    for (const name of collections) {
        for (const key of ['createRule', 'updateRule', 'deleteRule']) assert.equal(f.collections[name][key], null);
        assert.match(String(f.collections[name].viewRule), /workspace\.workspace_members_via_workspace\.user/);
        assert.ok(f.collections[name].fields.getByName('claim_revision'));
    }
    f.migration(migration).down(); f.migration(migration).down();
    assert.deepEqual(f.data, data);
    denied(() => f.claim('edition.save', drafts['edition.save'][1]), 503);
    assert.ok(f.collections.daily_editions.fields.getByName('published_at'));
    assert.equal(f.collections.daily_editions.createRule, null);
    f.migration(migration).up(); assert.ok(f.claim('edition.save', drafts['edition.save'][1]).id);
});

test('migration preflights the whole scope and rejects custom rules and field collisions before saving', () => {
    for (const corrupt of [
        (f) => { f.collections.seat_events.viewRule = 'private read'; },
        (f) => { f.collections.social_content.createRule = ''; },
        (f) => { f.collections.daily_editions.fields.add({ name: 'claim_revision', type: 'text' }); },
        (f) => { f.collections.support_sources.fields.getByName('owner').collectionId = 'workspaces'; },
    ]) {
        const f = claimsFixture({ migrated: false }); corrupt(f);
        const before = plain(f.collections), saves = [];
        const save = f.app.save; f.app.save = (value) => { saves.push(value); return save.call(f.app, value); };
        assert.throws(f.migration(migration).up, /Review/);
        assert.equal(saves.length, 0); assert.deepEqual(plain(f.collections), before);
    }
    const f = claimsFixture(); f.collections.seat_events.updateRule = 'custom write';
    assert.throws(f.migration(migration).down, /Review/);
    assert.ok(f.collections.support_sources.fields.getByName('claim_commands'));
});

function nativeSchema(f, boxedCollections = true) {
    for (const name of [...collections, 'users', 'workspaces']) {
        const collection = f.collections[name], get = collection.fields.getByName;
        if (boxedCollections) collection.type = new String(collection.type);
        collection.id = new String(collection.id);
        collection.fields.getByName = function (name) {
            const field = get.call(this, name);
            return field && new Proxy(field, { get(target, key, receiver) {
                const value = target[key];
                if (key === 'type') return function () { assert.equal(this, receiver); return new String(value); };
                if (typeof value === 'string') return new String(value);
                if (typeof value === 'number') return new Number(value);
                if (typeof value === 'boolean') return new Boolean(value);
                return value;
            } });
        };
    }
}

for (const stage of ['fresh', 'replay', 'rollback']) test(`migration accepts native field methods and boxed scalars during ${stage}`, () => {
    const f = claimsFixture({ migrated: stage !== 'fresh' });
    f.seed('corrections', { id: 'historical', workspace: 'ws1', owner: 'editor', status: 'verified', prior_prediction: 'Old prediction', observed_result: 'Old report' });
    const before = plain(f.data);
    nativeSchema(f, stage !== 'fresh');
    const step = f.migration(migration);
    if (stage === 'rollback') {
        step.down(); step.down();
        for (const name of collections) assert.equal(f.collections[name].fields.getByName('claim_commands'), undefined);
    } else { step.up(); step.up(); }
    assert.deepEqual(f.data, before);
    for (const name of collections) for (const key of ['createRule', 'updateRule', 'deleteRule']) assert.equal(f.collections[name][key], null);
    step.up();
    for (const name of collections) assert.equal(String(f.collections[name].fields.getByName('claim_commands').type()), 'bool');
    assert.deepEqual(f.data, before);
});

test('method-aware schema normalization still rejects custom type, relation, numeric, boolean and rule drift before saves', () => {
    for (const change of [
        (f) => { f.collections.social_channels.type = 'view'; },
        (f) => { f.collections.social_channels.viewRule = 'custom read'; },
        (f) => { f.collections.social_channels.updateRule = ''; },
        (f) => { f.collections.social_channels.fields.getByName('owner').type = 'text'; },
        (f) => { f.collections.social_channels.fields.getByName('owner').collectionId = 'foreign'; },
        (f) => { f.collections.social_channels.fields.getByName('workspace').maxSelect = 2; },
        (f) => { f.collections.social_channels.fields.getByName('workspace').maxSelect = true; },
        (f) => { f.collections.social_channels.fields.getByName('claim_commands').type = 'text'; },
        (f) => { f.collections.social_channels.fields.getByName('claim_commands').hidden = false; },
        (f) => { f.collections.social_channels.fields.getByName('claim_commands').hidden = 'true'; },
        (f) => { f.collections.social_channels.fields.getByName('claim_revision').onlyInt = false; },
        (f) => { f.collections.social_channels.fields.getByName('claim_revision').min = null; },
        (f) => { f.collections.social_channels.fields.getByName('claim_revision').min = false; },
        (f) => { f.collections.social_channels.fields.getByName('claim_revision').min = ''; },
        (f) => { f.collections.social_channels.fields.getByName('claim_revision').min = 1; },
        (f) => { f.collections.social_channels.fields.getByName('requested_by').cascadeDelete = true; },
    ]) {
        const f = claimsFixture(); change(f); nativeSchema(f);
        const before = plain(f.collections), records = plain(f.data), saves = [];
        f.app.save = (value) => saves.push(value);
        assert.throws(f.migration(migration).up, /Review/);
        assert.equal(saves.length, 0); assert.deepEqual(plain(f.collections), before); assert.deepEqual(f.data, records);
    }
    for (const change of [
        (field) => { field.type = 'text'; }, (field) => { field.hidden = false; }, (field) => { field.hidden = 'true'; },
    ]) {
        const f = claimsFixture(); change(f.collections.seat_events.fields.getByName('claim_commands')); nativeSchema(f);
        const before = plain(f.collections), saves = [];
        f.app.save = (value) => saves.push(value);
        assert.throws(f.migration(migration).down, /Review/);
        assert.equal(saves.length, 0); assert.deepEqual(plain(f.collections), before);
    }
});

for (const [action, [name, values]] of Object.entries(drafts)) test(`${action} binds authorship, current membership, revision and retry receipts`, () => {
    const f = claimsFixture(), key = 'stable_claim_request_001';
    for (const actor of [null, 'viewer', 'outsider']) denied(() => f.claim(action, values, { actor }));
    denied(() => f.claim(action, values, { workspace: 'ws2' }));
    const first = f.claim(action, values, { key });
    assert.equal(first.record.owner, 'editor'); assert.equal(first.record.workspace, 'ws1'); assert.equal(first.revision, 1);
    assert.equal(f.claim(action, values, { key }).replayed, true);
    assert.equal(f.data[name].length, 1);
    const patch = name === 'specialist_desks' ? { scope: 'Revised scope' } : name === 'corrections' ? { observed_result: 'Reported three' } : { title: 'Revised title' };
    denied(() => f.claim(action, patch, { id: first.id, revision: 1, actor: 'newuser' }));
    denied(() => f.claim(action, { ...patch, owner: 'admin' }, { id: first.id, revision: 1 }), 400);
    denied(() => f.claim(action, { ...patch, workspace: 'ws2' }, { id: first.id, revision: 1 }), 400);
    const saved = f.claim(action, patch, { id: first.id, revision: 1 });
    assert.equal(saved.revision, 2);
    denied(() => f.claim(action, patch, { id: first.id, revision: 1, actor: 'admin' }), 409);
    assert.equal(f.claim(action, patch, { id: first.id, revision: 2, actor: 'admin' }).record.owner, 'editor');
    denied(() => f.claim(action, { ...values, ...patch }, { key }), 409);
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    denied(() => f.claim(action, values, { key }));
    denied(() => f.claim(action, patch, { id: first.id, revision: 3 }));
});

test('support requests are admin-only and cannot assert amounts, sync, health or provider provenance', () => {
    const f = claimsFixture();
    for (const actor of ['editor', 'viewer', 'outsider']) denied(() => f.claim('support.request', { provider: 'stripe' }, { actor }));
    for (const field of ['gross', 'platform_fees', 'refunds', 'currency', 'status', 'last_sync', 'payout_status', 'date_range_start', 'date_range_end', 'provider_confirmed'])
        denied(() => f.claim('support.request', { provider: 'stripe', [field]: 'claimed' }, { actor: 'admin' }), 400);
    const first = f.claim('support.request', { provider: 'stripe' }, { actor: 'admin' });
    assert.equal(first.record.status, 'pending'); assert.equal(first.record.requested_by, 'admin'); assert.ok(first.record.requested_at);
    assert.equal(f.data.support_sources[0].gross, undefined);
    denied(() => f.claim('support.request', { provider: 'stripe' }, { actor: 'owner' }), 409);
    f.seed('support_sources', { id: 'legacy', workspace: 'ws1', owner: 'editor', provider: 'patreon', status: 'healthy', gross: 200, last_sync: '2026-09-01' });
    f.claim('support.request', { provider: 'patreon' }, { id: 'legacy', actor: 'owner' });
    const retained = f.data.support_sources.find((row) => row.id === 'legacy');
    assert.equal(retained.gross, 200); assert.equal(retained.last_sync, '2026-09-01'); assert.equal(retained.status, 'healthy'); assert.equal(retained.owner, 'editor');
});

test('commands reject foreign record IDs, unreadable saved versions and non-users authentication', () => {
    const f = claimsFixture();
    for (const [action, [name, values]] of Object.entries(drafts)) {
        f.seed(name, { ...values, id: 'foreign', workspace: 'ws2', owner: 'otherowner', status: name === 'corrections' ? 'pending' : 'draft' });
        denied(() => f.claim(action, values, { id: 'foreign', actor: 'admin' }));
        const saved = f.claim(action, values);
        f.denied.add(saved.id);
        denied(() => f.claim(action, values, { id: saved.id, revision: 1 }));
    }
    const e = f.event('editor', { action: 'seat.report', revision: 0, request_key: 'non_user_auth_test_001', payload: { id: '', values: {} } });
    e.auth = { id: 'editor', collection: () => ({ name: '_superusers' }) };
    denied(() => f.load('workspace-claims.js').command(e));
});

test('correction comparisons are pending reports; even administrators cannot promote or rewrite legacy decisions', () => {
    const f = claimsFixture(), values = drafts['correction.save'][1];
    for (const actor of ['editor', 'admin']) for (const status of ['verified', 'rejected'])
        denied(() => f.claim('correction.save', { ...values, status }, { actor }), 400);
    denied(() => f.claim('correction.save', { ...values, observed_result: '' }), 400);
    assert.equal(f.claim('correction.save', values).record.status, 'pending');
    f.seed('corrections', { id: 'legacy', workspace: 'ws1', owner: 'editor', status: 'verified', ...values });
    denied(() => f.claim('correction.save', { reference: 'Changed' }, { id: 'legacy', actor: 'admin' }), 400);
    assert.equal(f.data.corrections.find((row) => row.id === 'legacy').status, 'verified');
});

test('edition publication uses only the saved version and current admin account, then becomes immutable', () => {
    const f = claimsFixture(), draft = f.claim('edition.save', drafts['edition.save'][1]);
    denied(() => f.claim('edition.save', { ...drafts['edition.save'][1], status: 'published' }, { actor: 'admin' }), 400);
    denied(() => f.claim('edition.publish', {}, { id: draft.id, revision: 1 }));
    denied(() => f.claim('edition.publish', {}, { id: draft.id, revision: 0, actor: 'admin' }), 409);
    const result = f.claim('edition.publish', {}, { id: draft.id, revision: 1, actor: 'admin', key: 'edition_publication_retry_1' });
    assert.equal(result.record.published_by, 'admin'); assert.ok(result.record.published_at); assert.equal(result.record.body, draft.record.body);
    assert.equal(f.claim('edition.publish', {}, { id: draft.id, revision: 1, actor: 'admin', key: 'edition_publication_retry_1' }).replayed, true);
    for (const actor of ['editor', 'admin']) denied(() => f.claim('edition.save', { body: 'Rewrite publication' }, { id: draft.id, revision: 2, actor }), 400);
    f.seed('daily_editions', { id: 'legacy', owner: 'editor', workspace: 'ws1', status: 'published', title: 'Historical label' });
    denied(() => f.claim('edition.publish', {}, { id: 'legacy', actor: 'admin' }), 400);
    assert.equal(f.data.daily_editions.find((row) => row.id === 'legacy').published_by, undefined);
});

test('social commands call the existing review validator and preserve publication stamps and immutability', () => {
    const f = claimsFixture();
    const draft = f.claim('content.save', drafts['content.save'][1]);
    denied(() => f.claim('content.save', { reviewed_by: 'admin', published_at: '2026-09-01' }, { id: draft.id, revision: 1 }), 400);
    f.claim('content.save', { status: 'awaiting_approval' }, { id: draft.id, revision: 1 });
    const review = { status: 'approved', review_checks: { accuracy: true, privacy: true, rights: true, accessibility: true }, review_note: 'Checked this saved synthetic copy.' };
    denied(() => f.claim('content.save', review, { id: draft.id, revision: 2 }));
    denied(() => f.claim('content.save', { ...review, review_checks: {} }, { id: draft.id, revision: 2, actor: 'admin' }), 400);
    const approved = f.claim('content.save', review, { id: draft.id, revision: 2, actor: 'admin' });
    assert.equal(approved.record.reviewed_by, 'admin'); assert.ok(approved.record.reviewed_at);
    denied(() => f.claim('content.save', { title: 'Different copy', status: 'scheduled' }, { id: draft.id, revision: 3 }), 400);
    f.claim('content.save', { status: 'scheduled', scheduled_for: '2026-10-02 12:00:00.000Z' }, { id: draft.id, revision: 3 });
    denied(() => f.claim('content.save', { status: 'published', published_url: 'https://example.test/article' }, { id: draft.id, revision: 4 }));
    const published = f.claim('content.save', { status: 'published', published_url: 'https://example.test/article' }, { id: draft.id, revision: 4, actor: 'admin' });
    assert.equal(published.record.published_by, 'admin'); assert.ok(published.record.published_at);
    denied(() => f.claim('content.save', { status: 'draft' }, { id: draft.id, revision: 5, actor: 'admin' }), 400);
    f.seed('erp_objectives', { id: 'foreignobjective', workspace: 'ws2', owner: 'otherowner', title: 'Foreign objective' });
    denied(() => f.claim('content.save', { ...drafts['content.save'][1], objective: 'foreignobjective' }), 400);
});

test('channel requests cannot create health, and desk records stay operator reports rather than agent activity', () => {
    const f = claimsFixture();
    denied(() => f.claim('channel.request', { platform: 'x', handle: 'Team' }));
    denied(() => f.claim('channel.request', { platform: 'x', status: 'healthy' }, { actor: 'admin' }), 400);
    const request = f.claim('channel.request', { platform: 'x', handle: 'Team' }, { actor: 'admin' });
    assert.equal(request.record.status, 'pending'); assert.equal(request.record.requested_by, 'admin');
    const desk = f.claim('desk.save', drafts['desk.save'][1]);
    f.claim('desk.save', { status: 'active' }, { id: desk.id, revision: 1 });
    assert.equal(f.data.seat_events.length, 0);
    denied(() => f.claim('desk.save', drafts['desk.save'][1], { actor: 'newuser' }), 409);
});

test('normalized approval retries require current admin authority and implicit re-approval stays disallowed', () => {
    const f = claimsFixture(), draft = f.claim('content.save', drafts['content.save'][1]);
    f.claim('content.save', { status: 'awaiting_approval' }, { id: draft.id, revision: 1 });
    f.seed('workspace_members', { id: 'editormember', workspace: 'ws1', user: 'editor', role: 'admin' });
    const review = { status: ' approved ', review_checks: { accuracy: true, privacy: true, rights: true, accessibility: true }, review_note: 'Checked saved copy' };
    f.claim('content.save', review, { id: draft.id, revision: 2, key: 'padded_approval_retry_001' });
    denied(() => f.claim('content.save', { review_note: 'Checked again' }, { id: draft.id, revision: 3, key: 'implicit_approval_retry_001' }), 400);
    f.seed('workspace_members', { id: 'editormember', workspace: 'ws1', user: 'editor', role: 'editor' });
    denied(() => f.claim('content.save', review, { id: draft.id, revision: 2, key: 'padded_approval_retry_001' }));
    denied(() => f.claim('content.save', { review_note: 'Checked again' }, { id: draft.id, revision: 3, key: 'implicit_approval_retry_001' }));
});

test('seat reports retain claimed labels separately from native owner, validate scope, and are append-only', () => {
    const f = claimsFixture();
    f.seed('users', { id: 'editor', seat: 'Different server profile label' });
    const values = { event: 'completed', seat: 'Claimed agent', actor_type: 'agent', summary: 'Self-reported completion', detail: { verified: true } };
    for (const actor of [null, 'viewer', 'outsider']) denied(() => f.claim('seat.report', values, { actor }));
    denied(() => f.claim('seat.report', { ...values, owner: 'admin' }), 400);
    const result = f.claim('seat.report', values, { key: 'seat_retry_synthetic_001' });
    assert.equal(result.record.owner, 'editor'); assert.equal(result.record.seat, 'Claimed agent'); assert.equal(result.record.actor_type, 'agent');
    assert.equal(f.claim('seat.report', values, { key: 'seat_retry_synthetic_001' }).id, result.id);
    denied(() => f.claim('seat.report', values, { id: result.id, revision: 1 }), 400);
    f.seed('missions', { id: 'foreignmission', workspace: 'ws2', owner: 'otherowner', title: 'Foreign' });
    denied(() => f.claim('seat.report', { ...values, subject_type: 'mission', subject: 'foreignmission' }), 400);
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    denied(() => f.claim('seat.report', values, { key: 'seat_retry_synthetic_001' }));
});

test('bounded commands reject nested or oversized payloads and roll back on missing audit storage', () => {
    const f = claimsFixture(), values = drafts['edition.save'][1];
    denied(() => f.claim('edition.save', { ...values, body: 'x'.repeat(10001) }), 400);
    denied(() => f.claim('edition.save', { ...values, body: '\u6f22'.repeat(10000) }), 400);
    denied(() => f.claim('seat.report', { event: 'progress', seat: 'Reported', actor_type: 'agent', summary: 'Synthetic', detail: { a: { b: { c: { d: { e: { f: {} } } } } } } }), 400);
    const before = plain(f.data); f.config.failAudit = true;
    assert.throws(() => f.claim('edition.save', values), /audit storage unavailable/);
    assert.deepEqual(f.data, before);
    f.config.failAudit = false;
    delete f.collections.daily_editions;
    denied(() => f.claim('edition.save', values), 503);
});

test('claim route requires native users auth, a request size bound and a no-store response', () => {
    const routes = [];
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/workspace-claims.pb.js'), {
        __hooks: '/hooks', routerAdd: (...args) => routes.push(args),
        $apis: { requireAuth: (name) => { assert.equal(name, 'users'); return 'native-auth'; }, bodyLimit: (bytes) => bytes },
        require: (path) => { assert.equal(path, '/hooks/workspace-claims.js'); return { command: () => ({ saved: true }) }; },
    });
    assert.equal(routes.length, 1);
    const [method, path, callback, auth, limit] = routes[0];
    assert.equal(method, 'POST'); assert.equal(path, '/api/buildanddo/workspaces/{workspace}/claims');
    assert.equal(auth, 'native-auth'); assert.equal(limit, 30000);
    let noStore = false;
    callback({ response: { header: () => ({ set: (key, value) => { assert.equal(key, 'Cache-Control'); assert.equal(value, 'no-store'); noStore = true; } }) },
        json: (status, result) => { assert.equal(status, 200); assert.equal(result.saved, true); } });
    assert.equal(noStore, true);
});

function clientFixture(collection = 'daily_editions', actor = 'editor') {
    const f = claimsFixture(), calls = [];
    let current = true, lose = false, malformed = false;
    const client = {
        authStore: { record: { id: actor } }, filter: () => 'scoped',
        collection: (name) => ({
            getFullList: async () => plain(f.data[name].filter((row) => row.workspace === 'ws1')),
            getOne: () => assert.fail('Never replace the editor saved revision with a fresh pre-write read'),
            create: () => assert.fail('No raw create fallback'), update: () => assert.fail('No raw update fallback'), delete: () => assert.fail('No raw delete fallback'),
        }),
        async send(path, options) {
            const match = /^\/api\/buildanddo\/workspaces\/(ws1|ws2)\/claims$/.exec(path);
            assert.ok(match, path);
            assert.equal(options.method, 'POST'); assert.equal(options.requestKey, null); assert.equal(options.cache, 'no-store');
            calls.push(plain(options.body));
            const result = plain(f.load('workspace-claims.js').command(f.event(client.authStore.record.id, options.body, { workspace: match[1] })));
            if (lose) { lose = false; throw new Error('Response lost after commit'); }
            return malformed ? {} : result;
        },
    };
    const api = createWorkspaceRecordClient({ client, collection, workspaceId: 'ws1', accountId: actor, isCurrent: () => current });
    return { f, api, client, calls, leave: () => { current = false; }, lose: () => { lose = true; }, malformed: () => { malformed = true; } };
}

test('existing create/update wrappers use native commands, saved revisions and explicit publication only', async () => {
    const f = clientFixture();
    const first = await f.api.write('create', '', { ...drafts['edition.save'][1], status: 'draft' });
    assert.equal(first.ok, true); assert.equal(f.calls[0].action, 'edition.save');
    assert.equal((await f.api.read()).ok, true);
    const updated = await f.api.write('update', first.record.id, { title: 'Edited' });
    assert.equal(updated.ok, true); assert.equal(f.calls[1].revision, 1);
    const stale = await f.api.write('update', first.record.id, { title: 'Old snapshot' });
    assert.equal(stale.reason, 'conflict');
    assert.equal((await f.api.write('update', first.record.id, { status: 'published' }, updated.record)).reason, 'forbidden');
    assert.equal((await f.api.write('create', '', { title: 'Skip saved draft', status: 'published' })).ok, false);
    assert.equal((await f.api.write('delete', first.record.id)).ok, false);
    assert.equal((await f.api.write('update', first.record.id, { workspace: 'ws2' }, updated.record)).ok, false);
});

test('an uncertain write replays its original bytes and revision even after a refresh or subsequent edit', async () => {
    const f = clientFixture(); f.lose();
    const values = { ...drafts['edition.save'][1], status: 'draft' };
    assert.equal((await f.api.write('create', '', values)).reason, 'uncertain');
    assert.equal(f.f.data.daily_editions.length, 1);
    const blocked = await f.api.write('create', '', { ...values, title: 'Different change' });
    assert.equal(blocked.reason, 'uncertain'); assert.equal(blocked.blockedByPending, true);
    assert.equal((await f.api.write('delete', 'any')).reason, 'uncertain');
    assert.equal((await f.api.write('create', '', { owner: 'other' })).reason, 'uncertain');
    await f.api.read();
    const saved = f.f.data.daily_editions[0];
    f.f.claim('edition.save', { title: 'A newer native edit' }, { id: saved.id, revision: 1 });
    const retry = await f.api.retry();
    assert.equal(retry.ok, true); assert.equal(retry.replayed, true);
    assert.deepEqual(f.calls[0], f.calls[1]); assert.equal(f.f.data.daily_editions.length, 1);
    assert.equal(f.f.data.daily_editions[0].title, 'A newer native edit');
    assert.equal((await f.api.retry()).ok, false);
});

test('uncertain retries recheck revocation, discard late scope responses and never fall back for missing hooks', async () => {
    const f = clientFixture(); f.lose();
    assert.equal((await f.api.write('create', '', drafts['edition.save'][1])).reason, 'uncertain');
    f.f.app.delete(f.f.app.findRecordById('workspace_members', 'editormember'));
    assert.equal((await f.api.retry()).reason, 'forbidden');
    const g = clientFixture();
    const send = g.client.send; g.client.send = async (...args) => { const result = await send(...args); g.leave(); return result; };
    assert.equal((await g.api.write('create', '', drafts['edition.save'][1])).stale, true);
    assert.equal((await g.api.retry()).stale, true);
    const h = clientFixture(); h.client.send = async () => { throw { status: 404 }; };
    assert.equal((await h.api.write('create', '', drafts['edition.save'][1])).reason, 'unavailable');
    assert.equal(h.f.data.daily_editions.length, 0);
});

test('malformed success remains uncertain and native schema bounds cannot be silently discarded', async () => {
    const f = clientFixture(); f.malformed();
    assert.equal((await f.api.write('create', '', drafts['edition.save'][1])).reason, 'uncertain');
    const g = clientFixture();
    assert.equal((await g.api.write('create', '', { ...drafts['edition.save'][1], body: '\u6f22'.repeat(10000) })).reason, 'invalid');
    assert.equal(g.calls.length, 0);
    const api = createWorkspaceClaimClient({ client: g.client, collection: 'daily_editions', workspaceId: 'ws1', accountId: 'editor', isCurrent: () => true, keyFactory: () => 'bad' });
    assert.equal((await api.write('create', '', drafts['edition.save'][1])).reason, 'unavailable');
});

for (const [collection, actor, values, action] of [
    ['support_sources', 'admin', { provider: 'stripe', status: 'pending' }, 'support.request'],
    ['social_channels', 'admin', { platform: 'x', status: 'pending' }, 'channel.request'],
    ['corrections', 'editor', { ...drafts['correction.save'][1], status: 'pending' }, 'correction.save'],
    ['specialist_desks', 'editor', drafts['desk.save'][1], 'desk.save'],
    ['social_content', 'editor', drafts['content.save'][1], 'content.save'],
    ['seat_events', 'editor', { event: 'completed', summary: 'Reported only', actor_type: 'agent', seat: 'Claimed seat' }, 'seat.report'],
]) test(`${collection} compatibility wrapper reaches its explicit native command`, async () => {
    const f = clientFixture(collection, actor);
    const result = await f.api.write('create', '', values);
    assert.equal(result.ok, true, result.error); assert.equal(f.calls[0].action, action);
    assert.equal(result.record.owner, actor);
    if (['support_sources', 'social_channels'].includes(collection)) {
        await f.api.read();
        assert.equal((await f.api.write('update', result.record.id, { status: 'pending' })).ok, true);
        assert.equal(f.calls[1].revision, 1);
    }
});

test('claim receipts remain readable in the existing administration audit without enabling generic admin commands', async () => {
    const f = claimsFixture(); f.claim('edition.save', drafts['edition.save'][1]);
    const client = { authStore: { record: { id: 'owner' } }, send: async () => plain(f.load('workspace-administration.js').snapshot(f.event())) };
    const api = createWorkspaceControlClient({ client, workspaceId: 'ws1', accountId: 'owner', isCurrent: () => true });
    const read = await api.read('admin');
    assert.equal(read.ok, true); assert.equal(read.data.audit.items[0].action, 'edition.save');
    assert.equal((await api.command('edition.save', drafts['edition.save'][1], 0)).reason, 'invalid');
});

function publisherFixture() {
    const f = clientFixture('seat_events'), module = { exports: {} }, actions = [];
    const authListeners = new Set();
    f.client.authStore.onChange = (listener) => { authListeners.add(listener); return () => authListeners.delete(listener); };
    const table = f.client.collection;
    f.client.collection = (name) => ({ ...table(name), getList: async () => ({ items: plain(f.f.data[name]) }) });
    const code = source('apps/web/src/lib/seatComms.js').replace(/^import .+;$/gm, '').replace(/\bexport /g, '')
        .replace('import.meta.env.VITE_BUILDANDDO_SEAT', "'configured-reported-seat'");
    vm.runInNewContext(`${code}\nmodule.exports = { publishSeatEvent, recentSeatEvents };`, {
        module, pb: f.client, createWorkspaceClaimClient, reportAction: (...args) => actions.push(args), console: { error() {} },
    }, { filename: repoPath('apps/web/src/lib/seatComms.js') });
    return { ...f, actions, publish: module.exports.publishSeatEvent, recent: module.exports.recentSeatEvents,
        authenticate(record) { f.client.authStore.record = record; authListeners.forEach((listener) => listener()); } };
}

test('the existing seat publisher retries one native report and exposes its account separately from claimed labels', async () => {
    const f = publisherFixture();
    const input = { event: 'completed', workspaceId: 'ws1', summary: 'A self-reported event', actorType: 'agent', detail: { verified: true } };
    f.lose(); assert.equal(await f.publish(input), null);
    const report = await f.publish(input);
    assert.equal(report.owner, 'editor'); assert.equal(report.seat, 'configured-reported-seat');
    assert.equal(f.f.data.seat_events.length, 1); assert.deepEqual(f.calls[0], f.calls[1]);
    const events = await f.recent('ws1');
    assert.equal(events[0].owner, 'editor'); assert.equal(events[0].actorType, 'agent'); assert.equal(events[0].attribution, 'reported');
    assert.equal(f.actions.length, 1);
});

const seatInput = (event, workspaceId = 'ws1') => ({ event, workspaceId, summary: `Reported ${event}`, actorType: 'agent' });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

for (const next of ['progress', 'completed', 'blocked']) test(`production publisher reconciles a lost joined response before the distinct ${next} report`, async () => {
    const f = publisherFixture(); f.lose();
    assert.equal(await f.publish(seatInput('joined')), null);
    const result = await f.publish(seatInput(next));
    assert.ok(result, 'The next explicit report must not be permanently blocked by the lost joined response');
    assert.equal(result.event, next);
    assert.deepEqual(f.f.data.seat_events.map((row) => row.event), ['joined', next]);
    assert.equal(f.calls.length, 3); assert.deepEqual(f.calls[1], f.calls[0]);
    assert.notEqual(f.calls[2].request_key, f.calls[0].request_key);
    assert.equal(f.f.data.workspace_admin_events.length, 2);
});

test('publisher recovery retains the original key through repeated response loss and never submits unconfirmed follow-up reports', async () => {
    const f = publisherFixture(); f.lose();
    await f.publish(seatInput('joined'));
    for (const event of ['progress', 'completed']) {
        f.lose(); assert.equal(await f.publish(seatInput(event)), null);
        assert.deepEqual(f.f.data.seat_events.map((row) => row.event), ['joined']);
    }
    assert.equal(f.calls.length, 3);
    assert.ok(f.calls.every((body) => body.request_key === f.calls[0].request_key));
    assert.equal((await f.publish(seatInput('blocked')))?.event, 'blocked');
    assert.deepEqual(f.calls[3], f.calls[0]);
    assert.deepEqual(f.f.data.seat_events.map((row) => row.event), ['joined', 'blocked']);
});

test('publisher recovery rechecks revoked membership and keeps the unknown original until an authorized retry succeeds', async () => {
    const f = publisherFixture(); f.lose(); await f.publish(seatInput('joined'));
    f.f.app.delete(f.f.app.findRecordById('workspace_members', 'editormember'));
    assert.equal(await f.publish(seatInput('progress')), null);
    assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[1], f.calls[0]);
    f.f.seed('workspace_members', { id: 'editormember', workspace: 'ws1', user: 'editor', role: 'editor' });
    assert.equal((await f.publish(seatInput('completed')))?.event, 'completed');
    assert.equal(f.calls.length, 4); assert.deepEqual(f.calls[2], f.calls[0]);
    assert.deepEqual(f.f.data.seat_events.map((row) => row.event), ['joined', 'completed']);
});

test('a concurrent publisher cannot duplicate recovery or overtake the explicit next report', async (t) => {
    const f = publisherFixture(); f.lose(); await f.publish(seatInput('joined'));
    const held = deferred(), send = f.client.send;
    t.after(() => held.resolve());
    f.client.send = async (...args) => { const result = await send(...args); if (f.calls.length === 2) await held.promise; return result; };
    const progress = f.publish(seatInput('progress'));
    await tick(); assert.equal(f.calls.length, 2, 'Recovery must use the existing joined key');
    assert.equal(await f.publish(seatInput('completed')), null);
    assert.equal(f.calls.length, 2);
    held.resolve(); assert.equal((await progress)?.event, 'progress');
    assert.deepEqual(f.f.data.seat_events.map((row) => row.event), ['joined', 'progress']);
    assert.equal((await f.publish(seatInput('completed')))?.event, 'completed');
    assert.deepEqual(f.f.data.seat_events.map((row) => row.event), ['joined', 'progress', 'completed']);
    assert.deepEqual(f.calls[0], f.calls[1]);
});

for (const change of ['account', 'workspace']) test(`publisher recovery cannot continue an old report after a ${change} switch`, async (t) => {
    const f = publisherFixture(); f.lose(); await f.publish(seatInput('joined'));
    const held = deferred(), send = f.client.send;
    t.after(() => held.resolve());
    f.client.send = async (...args) => { const result = await send(...args); if (f.calls.length === 2) await held.promise; return result; };
    const old = f.publish(seatInput('progress'));
    await tick(); assert.equal(f.calls.length, 2);
    if (change === 'account') f.client.authStore.record = { id: 'newuser' };
    else f.f.seed('workspace_members', { id: 'otherworkspaceeditor', workspace: 'ws2', user: 'editor', role: 'editor' });
    const current = await f.publish(seatInput('completed', change === 'workspace' ? 'ws2' : 'ws1'));
    assert.ok(current);
    assert.equal(current.owner, change === 'account' ? 'newuser' : 'editor');
    assert.equal(current.workspace, change === 'workspace' ? 'ws2' : 'ws1');
    held.resolve(); assert.equal(await old, null);
    assert.equal(f.calls.length, 3);
    assert.deepEqual(f.f.data.seat_events.map((row) => row.event), ['joined', 'completed']);
    assert.equal(f.f.data.seat_events[0].owner, 'editor');
});

test('retrying the same production report with reordered detail keys never appends a second report', async () => {
    const f = publisherFixture(), input = { ...seatInput('joined'), detail: { phase: 'start', source: 'Synthetic' } };
    f.lose(); await f.publish(input);
    assert.ok(await f.publish({ ...input, detail: { source: 'Synthetic', phase: 'start' } }));
    assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[0], f.calls[1]);
    assert.equal(f.f.data.seat_events.length, 1);
});

test('a workspace round trip retains the unresolved report key instead of appending a duplicate', async () => {
    const f = publisherFixture(), input = seatInput('completed');
    f.f.seed('workspace_members', { id: 'otherworkspaceeditor', workspace: 'ws2', user: 'editor', role: 'editor' });
    f.lose(); assert.equal(await f.publish(input), null);
    const original = plain(f.f.data.seat_events[0]);
    assert.equal((await f.publish(seatInput('joined', 'ws2')))?.workspace, 'ws2');
    assert.equal((await f.publish(input))?.id, original.id);
    assert.deepEqual(f.calls[2], f.calls[0]);
    assert.equal(f.f.data.seat_events.filter((row) => row.workspace === 'ws1').length, 1);
    assert.equal(f.f.data.workspace_admin_events.filter((row) => row.workspace === 'ws1').length, 1);
});

test('a workspace round trip cannot revive an in-flight response or replace its unresolved key', async (t) => {
    const f = publisherFixture(), input = seatInput('completed'), held = deferred(), send = f.client.send;
    f.f.seed('workspace_members', { id: 'otherworkspaceeditor', workspace: 'ws2', user: 'editor', role: 'editor' });
    t.after(() => held.resolve());
    f.client.send = async (...args) => { const result = await send(...args); if (f.calls.length === 1) await held.promise; return result; };
    const old = f.publish(input);
    await tick(); assert.equal(f.calls.length, 1);
    assert.ok(await f.publish(seatInput('joined', 'ws2')));
    assert.equal(await f.publish(input), null, 'The previous request is still in flight');
    assert.equal(f.calls.length, 2);
    held.resolve(); assert.equal(await old, null, 'Returning must not revive a response from the earlier visit');
    assert.equal(f.actions.length, 1);
    assert.equal((await f.publish(input))?.id, f.f.data.seat_events[0].id);
    assert.deepEqual(f.calls[2], f.calls[0]);
    assert.equal(f.f.data.seat_events.length, 2);
});

test('returning to a workspace rechecks revoked authority without losing the original report identity', async () => {
    const f = publisherFixture(), input = seatInput('completed');
    f.f.seed('workspace_members', { id: 'otherworkspaceeditor', workspace: 'ws2', user: 'editor', role: 'editor' });
    f.lose(); await f.publish(input);
    await f.publish(seatInput('joined', 'ws2'));
    f.f.app.delete(f.f.app.findRecordById('workspace_members', 'editormember'));
    assert.equal(await f.publish(input), null);
    assert.deepEqual(f.calls[2], f.calls[0]);
    f.f.seed('workspace_members', { id: 'editormember', workspace: 'ws1', user: 'editor', role: 'editor' });
    assert.equal((await f.publish(input))?.id, f.f.data.seat_events[0].id);
    assert.deepEqual(f.calls[3], f.calls[0]);
    assert.equal(f.f.data.seat_events.length, 2);
});

test('a workspace round trip between recovery awaits cannot adopt the new visit lifetime', async () => {
    const f = publisherFixture();
    f.f.seed('workspace_members', { id: 'otherworkspaceeditor', workspace: 'ws2', user: 'editor', role: 'editor' });
    f.lose(); await f.publish(seatInput('joined'));
    const old = f.publish(seatInput('progress'));
    const away = f.publish(seatInput('joined', 'ws2'));
    const back = f.publish(seatInput('completed'));
    const [oldResult, awayResult, backResult] = await Promise.all([old, away, back]);
    assert.equal(oldResult, null); assert.equal(awayResult, null); assert.equal(backResult, null);
    assert.equal(f.calls.length, 2, 'The obsolete invocation must not recover or submit a follow-up');
    assert.equal(f.actions.length, 0);
    assert.equal((await f.publish(seatInput('completed')))?.event, 'completed');
    assert.deepEqual(f.calls[2], f.calls[0]);
    assert.deepEqual(f.f.data.seat_events.map((row) => row.event), ['joined', 'joined', 'completed']);
});

test('a scope switch after transport confirmation retains the key until the publisher accepts the result', async () => {
    const f = publisherFixture(), input = seatInput('completed'), send = f.client.send;
    f.f.seed('workspace_members', { id: 'otherworkspaceeditor', workspace: 'ws2', user: 'editor', role: 'editor' });
    let away;
    f.client.send = async (...args) => {
        const result = await send(...args);
        if (f.calls.length === 1) queueMicrotask(() => queueMicrotask(() => { away = f.publish(seatInput('joined', 'ws2')); }));
        return result;
    };
    assert.equal(await f.publish(input), null);
    assert.equal((await away)?.workspace, 'ws2');
    assert.equal((await f.publish(input))?.id, f.f.data.seat_events[0].id);
    assert.deepEqual(f.calls[2], f.calls[0]);
    assert.equal(f.f.data.seat_events.length, 2);
});

test('same-account refresh retains report recovery but logout clears private pending publishers', async () => {
    const f = publisherFixture(), input = seatInput('completed');
    f.lose(); await f.publish(input);
    f.authenticate({ id: 'editor' });
    assert.equal((await f.publish(input))?.id, f.f.data.seat_events[0].id);
    assert.deepEqual(f.calls[1], f.calls[0]);
    f.lose(); await f.publish(seatInput('joined'));
    f.authenticate(null);
    assert.equal(await f.publish(input), null);
    f.authenticate({ id: 'newuser' });
    const next = await f.publish(seatInput('progress'));
    assert.equal(next?.owner, 'newuser');
    assert.equal(f.calls.length, 4);
    assert.equal(f.f.data.seat_events.length, 3);
    assert.notEqual(f.calls[3].request_key, f.calls[2].request_key);
});

test('pending publisher storage refuses overflow without evicting unresolved report keys', async (t) => {
    const f = publisherFixture(), held = deferred();
    t.after(() => held.resolve());
    f.client.send = async (_path, { body }) => {
        f.calls.push(plain(body));
        if (f.calls.length === 32) {
            await held.promise;
            return { workspace: 'scope31', action: body.action, id: 'reported32', revision: 1, replayed: false,
                record: { id: 'reported32', workspace: 'scope31', owner: 'editor', claim_revision: 1 } };
        }
        throw new Error('Unconfirmed transport');
    };
    for (let index = 0; index < 31; index++) assert.equal(await f.publish(seatInput('joined', `scope${index}`)), null);
    const old = f.publish(seatInput('joined', 'scope31')); await tick();
    assert.equal(f.calls.length, 32);
    assert.equal(await f.publish(seatInput('joined', 'overflow')), null);
    assert.equal(f.calls.length, 32);
    held.resolve(); assert.equal(await old, null, 'A refused new scope still invalidates the previous visit');
    assert.equal(await f.publish(seatInput('joined', 'scope0')), null);
    assert.equal(f.calls.length, 33);
    assert.deepEqual(f.calls[32], f.calls[0]);
    f.authenticate(null); f.authenticate({ id: 'editor' });
    assert.equal(await f.publish(seatInput('joined', 'overflow')), null);
    assert.equal(f.calls.length, 34);
});
