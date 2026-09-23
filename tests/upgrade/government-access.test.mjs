// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/government-access.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     tests/upgrade/government-fixture.mjs, tests/upgrade/suite-fixture.mjs, apps/pocketbase/pb_hooks/government-desk.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/government-fixture.mjs; CONSUMES tests/upgrade/suite-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/government-desk.js
// Intent:      Prove role and payment spoofing, expiry, revocation, cache replay and worker completion cannot bypass government membership.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, plain, source } from './admin-fixture.mjs';
import { installGovernment, membershipRecord, GOVERNMENT_MIGRATION } from './government-fixture.mjs';
import { suiteFixture } from './suite-fixture.mjs';

const at = Date.parse('2026-09-22T18:00:00Z');
const view = (f, user = 'editor', now = at) => plain(f.load('government-access.js').status(f.app, user ? f.app.findRecordById('users', user) : null, now));
const denied = (f, user = 'editor') => assert.equal(view(f, user).allowed, false);

test('missing migration and anonymous auth fail closed without confusing workspace ownership with payment', () => {
    const f = fixture();
    assert.equal(view(f, 'owner').reason, 'membership_unavailable');
    assert.equal(view(f, null).reason, 'sign_in_required');
    installGovernment(f);
    for (const user of ['owner', 'admin', 'editor', 'viewer']) denied(f, user);
    f.data.users.find((row) => row.id === 'editor').government_paid = true;
    f.data.users.find((row) => row.id === 'editor').tier = 'government';
    denied(f);
});

for (const [name, override] of Object.entries({
    unpaid: { status: 'pending' }, revoked: { status: 'revoked' }, basic: { tier: 'basic' },
    discount: { amount_cents: 9999 }, string_price: { amount_cents: '10000' }, currency: { currency: 'EUR' },
    one_time: { interval: 'once' }, no_receipt: { payment_reference: '' }, no_approval: { approved_by: '' },
    future_approval: { approved_at: '2099-01-01T00:00:00Z' }, expired: { expires_at: '2026-09-22T18:00:00Z' },
    future_start: { starts_at: '2026-09-23T00:00:00Z' }, impossible_date: { approved_at: '2026-02-30T00:00:00Z' },
    rolled_back: { protocol_version: 0 }, foreign_account: { user: 'otherowner' },
})) test(`membership rejects ${name}`, () => {
    const f = installGovernment(fixture()); f.seed('government_memberships', membershipRecord('editor', override)); denied(f);
});

test('current membership emits only account access, price and expiry without billing identifiers', () => {
    const f = installGovernment(fixture(), ['editor']); const value = view(f);
    assert.equal(value.allowed, true); assert.equal(value.amount_cents, 10000);
    assert.equal(JSON.stringify(value).includes('invoice'), false);
    assert.equal(JSON.stringify(value).includes('operator'), false);
    assert.equal(f.load('workspace-access.js').access(f.event('editor')).government.allowed, true);
    denied(f, 'owner');
});

test('duplicate memberships and altered collection rules or missing identity index deny access', () => {
    const f = installGovernment(fixture(), ['editor']);
    f.seed('government_memberships', membershipRecord('editor', { id: 'duplicate' })); denied(f);
    f.data.government_memberships.pop();
    f.collections.government_memberships.updateRule = '';
    denied(f); f.collections.government_memberships.updateRule = null;
    f.collections.government_memberships.indexes = []; denied(f);
});

test('migration is idempotent, rollback preserves receipts and restriction, re-up restores protocol', () => {
    const f = installGovernment(fixture(), ['editor']);
    const migrate = f.migration(GOVERNMENT_MIGRATION); migrate.up();
    assert.equal(f.data.government_memberships.length, 1); migrate.down(); denied(f);
    assert.match(f.collections.tutorials.viewRule, /Government submissions/);
    assert.equal(f.data.government_memberships.length, 1);
    migrate.up(); assert.equal(view(f).allowed, true);
});

test('custom tutorial rules and tampered receipt schemas are never overwritten by migration', () => {
    const f = fixture(); f.collections.tutorials.viewRule = 'owner = @request.auth.id';
    assert.throws(() => f.migration(GOVERNMENT_MIGRATION).up(), /custom tutorial/);
    assert.equal(f.collections.government_memberships, undefined);
    f.collections.tutorials.viewRule = "@request.auth.id != ''"; installGovernment(f);
    f.collections.government_memberships.fields.getByName('amount_cents').onlyInt = false;
    assert.throws(() => f.migration(GOVERNMENT_MIGRATION).up(), /custom membership fields/);
});

test('government catalogue requires membership and native workspace membership before reading protected files', () => {
    let reads = 0;
    const f = installGovernment(fixture({ runtime: { toString: String, $os: { readFile: (path) => {
        reads++; return source(`apps/pocketbase${path}`);
    } } } }), ['editor', 'otherowner']);
    const desk = f.load('government-desk.js');
    assert.throws(() => desk.read(f.event('owner')), { status: 403 }); assert.equal(reads, 0);
    assert.throws(() => desk.read(f.event('otherowner')), { status: 403 }); assert.equal(reads, 0);
    const row = f.seed('tutorials', { id: 'govlesson', title: 'Restricted lesson', category: 'Government submissions', lesson: { schema_version: 1 } });
    const result = plain(desk.read(f.event('editor')));
    assert.equal(result.account_id, 'editor'); assert.equal(result.lessons[0].id, row.id);
    assert.equal(result.plan.lanes.length, 3);
    f.data.government_memberships.find((r) => r.user === 'editor').status = 'revoked';
    assert.throws(() => desk.read(f.event('editor')), { status: 403 });
    assert.equal(reads, 2);
});

test('premium lesson bypass is limited to the installed rules and current entitlement', () => {
    const f = installGovernment(fixture(), ['editor']); const p = f.load('government-access.js');
    const lesson = f.seed('tutorials', { id: 'lesson', category: 'Government submissions' });
    assert.equal(p.lesson(f.app, f.event('editor').auth, lesson), true);
    assert.throws(() => p.lesson(f.app, f.event('owner').auth, lesson), { status: 403 });
    f.collections.tutorials.viewRule = 'custom';
    assert.throws(() => p.lesson(f.app, f.event('editor').auth, lesson), { status: 503 });
});

test('revocation denies direct suite reads and cached command retries', () => {
    const f = suiteFixture(); f.configure(); const queued = f.enqueue();
    f.data.government_memberships.find((r) => r.user === 'editor').status = 'revoked';
    for (const [action, payload] of [['snapshot', { page: 1 }], ['detail', { id: queued.id }], ['retry', { id: queued.id }]])
        assert.throws(() => f.command(action, payload), { status: 403 });
    const receipt = f.data.suite_receipts.find((r) => r.actor === 'editor');
    assert.throws(() => f.command('enqueue', { suite: 'maritime', input: { observations: [f.observation()] } }, { key: receipt.request_key }), { status: 403 });
});

test('sponsor expiry fences polling and in-flight worker completion without discarding the saved attempt', () => {
    const f = suiteFixture(); f.configure(); const queued = f.enqueue(); const lease = f.claim(queued);
    f.data.government_memberships.find((r) => r.user === 'editor').expires_at = '2020-01-01T00:00:00Z';
    assert.deepEqual(f.command('poll', { page: 1 }, { actor: 'suiteworker', mission: '' }).items, []);
    const before = plain(f.data.suite_runs);
    assert.throws(() => f.complete(lease), { status: 403 });
    assert.deepEqual(f.data.suite_runs, before);
});
