// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/trust-shared-records.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/workspace-record-policy.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/workspace-record-policy.js
// DAG Node:    none
// Intent:      Prove review, publication, revenue and seat identity cannot be asserted from a browser write.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, source } from './admin-fixture.mjs';

const denied = (operation, status = 403) => assert.throws(operation, (error) => error.status === status);
// `values` is the stored record (owner defaults to the actor); `changes` is the request.
function native(f, collection, actor, operation = 'create', values = {}, changes = {}) {
    const e = f.event(actor); e.record = f.record(collection, { id: 'native', owner: actor, workspace: 'ws1', ...values });
    Object.entries(changes).forEach(([key, value]) => e.record.set(key, value));
    e.next = () => 'persisted'; return () => f.load('workspace-record-policy.js').enforce(e, operation);
}

test('only owners and admins verify corrections, and a verified correction is locked to them', () => {
    const f = fixture();
    for (const actor of ['owner', 'admin', 'legacyowner']) assert.equal(native(f, 'corrections', actor, 'create', { status: 'verified' })(), 'persisted');
    denied(native(f, 'corrections', 'editor', 'create', { status: 'verified' }));
    for (const status of ['pending', 'rejected']) assert.equal(native(f, 'corrections', 'editor', 'create', { status })(), 'persisted');
    denied(native(f, 'corrections', 'editor', 'update', { status: 'pending' }, { status: 'verified' }));
    denied(native(f, 'corrections', 'editor', 'update', { status: 'verified' }, { status: 'pending' }));
    denied(native(f, 'corrections', 'editor', 'update', { status: 'verified' }, { observed_result: 'rewritten' }));
    denied(native(f, 'corrections', 'editor', 'delete', { status: 'verified' }));
    assert.equal(native(f, 'corrections', 'editor', 'update', { status: 'pending' }, { status: 'rejected' })(), 'persisted');
    assert.equal(native(f, 'corrections', 'editor', 'delete', { status: 'pending' })(), 'persisted');
    assert.equal(native(f, 'corrections', 'admin', 'update', { owner: 'editor', status: 'pending' }, { status: 'verified' })(), 'persisted');
    denied(native(f, 'corrections', 'viewer', 'create', { status: 'pending' }));
});

test('editors change only their own corrections, desks, social content and editions; admins change any', () => {
    const f = fixture();
    const own = { corrections: { status: 'pending' }, specialist_desks: { desk: 'research', status: 'idle' },
        social_content: { status: 'draft' }, daily_editions: { status: 'draft' } };
    for (const [name, values] of Object.entries(own)) {
        assert.equal(native(f, name, 'editor', 'update', values, { title: 'Own edit' })(), 'persisted');
        denied(native(f, name, 'editor', 'update', { ...values, owner: 'owner' }, { title: 'Foreign edit' }));
        denied(native(f, name, 'editor', 'delete', { ...values, owner: 'admin' }));
        for (const actor of ['owner', 'admin'])
            assert.equal(native(f, name, actor, 'update', { ...values, owner: 'editor' }, { title: 'Reviewed edit' })(), 'persisted');
    }
    // Deletion stays with the author even for administrators.
    denied(native(f, 'specialist_desks', 'admin', 'delete', { owner: 'editor' }));
});

test('publishing a Daily Edition needs an owner or admin; editors keep their drafts', () => {
    const f = fixture();
    assert.equal(native(f, 'daily_editions', 'editor', 'create', { status: 'draft' })(), 'persisted');
    denied(native(f, 'daily_editions', 'editor', 'create', { status: 'published' }));
    denied(native(f, 'daily_editions', 'editor', 'update', { status: 'draft' }, { status: 'published' }));
    denied(native(f, 'daily_editions', 'editor', 'update', { status: 'published' }, { body: 'Quiet rewrite' }));
    denied(native(f, 'daily_editions', 'editor', 'update', { status: 'published' }, { status: 'draft' }));
    denied(native(f, 'daily_editions', 'editor', 'delete', { status: 'published' }));
    assert.equal(native(f, 'daily_editions', 'editor', 'update', { status: 'draft' }, { body: 'Draft edit' })(), 'persisted');
    for (const actor of ['owner', 'admin']) {
        assert.equal(native(f, 'daily_editions', actor, 'create', { status: 'published' })(), 'persisted');
        assert.equal(native(f, 'daily_editions', actor, 'update', { owner: 'editor', status: 'draft' }, { status: 'published' })(), 'persisted');
    }
});

test('support sources accept only a pending connection request; synced revenue is server-only', () => {
    const f = fixture();
    assert.equal(native(f, 'support_sources', 'editor', 'create', { provider: 'kofi', status: 'pending' })(), 'persisted');
    assert.equal(native(f, 'support_sources', 'editor', 'create', { provider: 'kofi', status: 'pending', gross: 0 })(), 'persisted');
    for (const status of ['not_connected', 'connected', 'syncing', 'healthy', 'degraded', 'error'])
        denied(native(f, 'support_sources', 'admin', 'create', { provider: 'kofi', status }), 400);
    for (const [field, value] of [['gross', 1200], ['refunds', 5], ['platform_fees', 3], ['payout_status', 'paid'], ['currency', 'USD'],
        ['last_sync', '2026-09-23 00:00:00.000Z'], ['date_range_start', '2026-09-01 00:00:00.000Z']]) {
        denied(native(f, 'support_sources', 'owner', 'create', { provider: 'kofi', status: 'pending', [field]: value }), 400);
        denied(native(f, 'support_sources', 'owner', 'update', { provider: 'kofi', status: 'healthy', gross: 10 }, { [field]: value }), 400);
    }
    const synced = { provider: 'stripe', status: 'healthy', gross: 900, refunds: 10, payout_status: 'paid', currency: 'USD' };
    assert.equal(native(f, 'support_sources', 'editor', 'update', synced, { status: 'pending' })(), 'persisted');
    for (const status of ['connected', 'syncing', 'degraded', 'error'])
        denied(native(f, 'support_sources', 'admin', 'update', { ...synced, status: 'pending' }, { status }), 400);
    denied(native(f, 'support_sources', 'admin', 'update', synced, { provider: 'kofi' }), 400);
    denied(native(f, 'support_sources', 'viewer', 'create', { provider: 'kofi', status: 'pending' }));
});

test('seat events are bound to the authenticated human account', () => {
    const f = fixture(); const event = { event: 'progress', summary: 'Checked the mission evidence' };
    for (const actor of ['owner', 'editor'])
        assert.equal(native(f, 'seat_events', actor, 'create', { ...event, actor_type: 'human', seat: actor })(), 'persisted');
    denied(native(f, 'seat_events', 'editor', 'create', { ...event, actor_type: 'agent', seat: 'editor' }));
    denied(native(f, 'seat_events', 'editor', 'create', { ...event, actor_type: 'mixed', seat: 'editor' }));
    denied(native(f, 'seat_events', 'editor', 'create', { ...event, actor_type: 'human', seat: 'owner' }));
    denied(native(f, 'seat_events', 'editor', 'create', { ...event, actor_type: 'human', seat: 'kestrel-verify' }));
    denied(native(f, 'seat_events', 'editor', 'create', { ...event, actor_type: 'human', seat: '' }));
    denied(native(f, 'seat_events', 'viewer', 'create', { ...event, actor_type: 'human', seat: 'viewer' }));
});

test('the browser seat client sends only the fields the server accepts', () => {
    const client = source('apps/web/src/lib/seatComms.js');
    assert.match(client, /seat: pb\.authStore\.record\.id,/);
    assert.match(client, /actor_type: 'human',/);
    assert.doesNotMatch(client, /VITE_BUILDANDDO_SEAT/);
});
