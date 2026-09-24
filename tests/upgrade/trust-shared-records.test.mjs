// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/trust-shared-records.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001, VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/workspace-record-policy.js, apps/pocketbase/pb_hooks/workspace-claims.js, apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js, apps/web/src/pages/workspace/EvidencePage.jsx, apps/web/plugins/vite-plugin-public-lessons.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/workspace-record-policy.js; VALIDATES apps/pocketbase/pb_hooks/workspace-claims.js; VALIDATES apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js; VALIDATES apps/web/src/pages/workspace/EvidencePage.jsx; CONSUMES apps/web/plugins/vite-plugin-public-lessons.js
// DAG Node:    none
// Intent:      Prove review, publication, revenue and seat identity cannot be asserted from a browser write.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fixture, plain, repoPath, source } from './admin-fixture.mjs';
import { loadPublicLessons } from '../../apps/web/plugins/vite-plugin-public-lessons.js';

const denied = (operation, status = 403) => assert.throws(operation, (error) => error.status === status);
// `values` is the stored record (owner defaults to the actor); `changes` is the request.
function native(f, collection, actor, operation = 'create', values = {}, changes = {}) {
    const e = f.event(actor); e.record = f.record(collection, { id: 'native', owner: actor, workspace: 'ws1', ...values });
    Object.entries(changes).forEach(([key, value]) => e.record.set(key, value));
    e.next = () => 'persisted'; return () => f.load('workspace-record-policy.js').enforce(e, operation);
}

function claimsFixture() {
    const f = fixture({ runtime: { toString: String, $os: { readFile: () => source('apps/pocketbase/pb_migrations/data/starter-tutorials.json') } } });
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up();
    f.migration('apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js').up();
    f.seed('workspace_members', { id: 'secondeditor', workspace: 'ws1', user: 'newuser', role: 'editor' });
    let sequence = 0;
    f.claim = (action, values, { actor = 'editor', id = '', revision = 0, key, workspace = 'ws1' } = {}) =>
        plain(f.load('workspace-claims.js').command(f.event(actor, { action, revision,
            request_key: key || `trust_shared_request_${++sequence}`, payload: action === 'edition.publish' ? { id } : { id, values } }, { workspace })));
    return f;
}

for (const name of ['corrections', 'specialist_desks', 'social_content', 'daily_editions', 'support_sources', 'social_channels', 'seat_events'])
    test(`TRUST field restrictions do not reopen raw ${name} writes for any workspace role`, () => {
        const f = claimsFixture(), before = plain(f.data);
        for (const key of ['createRule', 'updateRule', 'deleteRule']) assert.equal(f.collections[name][key], null);
        for (const actor of ['owner', 'admin', 'legacyowner', 'editor', 'viewer', 'outsider', null])
            for (const operation of ['create', 'update', 'delete']) denied(native(f, name, actor, operation));
        assert.deepEqual(f.data, before);
    });

test('corrections remain pending reports; no role may promote or rewrite historical decisions', () => {
    const f = claimsFixture(), values = { prior_prediction: 'Expected four', observed_result: 'Observed two', reference: 'Author comparison' };
    for (const actor of ['owner', 'admin', 'legacyowner', 'editor']) {
        const report = f.claim('correction.save', values, { actor });
        assert.equal(report.record.status, 'pending'); assert.equal(report.record.owner, actor);
        for (const status of ['verified', 'rejected']) {
            denied(() => f.claim('correction.save', { ...values, status }, { actor }), 400);
            denied(() => f.claim('correction.save', { status }, { actor, id: report.id, revision: 1 }), 400);
        }
        denied(native(f, 'corrections', actor, 'delete', { status: 'pending' }));
    }
    for (const status of ['verified', 'rejected']) {
        const id = `historical-${status}`;
        f.seed('corrections', { ...values, id, workspace: 'ws1', owner: 'editor', status });
        for (const actor of ['owner', 'admin', 'editor']) {
            denied(() => f.claim('correction.save', { observed_result: 'Rewritten' }, { id, actor }), 400);
            denied(() => f.claim('correction.save', { status: 'pending' }, { id, actor }), 400);
            denied(native(f, 'corrections', actor, 'delete', { owner: 'editor', status }));
        }
        assert.equal(f.data.corrections.find((row) => row.id === id).status, status);
    }
    denied(() => f.claim('correction.save', values, { actor: 'viewer' }));
});

test('native commands restrict editors to authored drafts while administrators retain scoped revisioned edits', () => {
    const f = claimsFixture();
    const drafts = [
        ['correction.save', 'corrections', { prior_prediction: 'Expected four', observed_result: 'Observed two' }, { observed_result: 'Observed three' }],
        ['desk.save', 'specialist_desks', { desk: 'research', scope: 'Read sources', status: 'idle' }, { scope: 'Compare sources' }],
        ['content.save', 'social_content', { title: 'Draft', status: 'draft' }, { title: 'Edited draft' }],
        ['edition.save', 'daily_editions', { title: 'Draft edition' }, { body: 'Retained draft text' }],
    ];
    for (const [action, name, values, patch] of drafts) {
        let saved = f.claim(action, values);
        const id = saved.id;
        saved = f.claim(action, patch, { id, revision: saved.revision, key: `trust_author_retry_${name}` });
        assert.equal(saved.record.owner, 'editor');
        denied(() => f.claim(action, patch, { id, revision: saved.revision, actor: 'newuser' }));
        denied(native(f, name, 'editor', 'delete', { owner: 'admin' }));
        denied(native(f, name, 'admin', 'delete', { owner: 'editor' }));
        for (const actor of ['owner', 'admin', 'legacyowner']) {
            for (const forged of [{ owner: actor }, { workspace: 'ws2' }])
                denied(() => f.claim(action, { ...patch, ...forged }, { id, revision: saved.revision, actor }), 400);
            denied(() => f.claim(action, patch, { id, revision: saved.revision - 1, actor }), 409);
            saved = f.claim(action, patch, { id, revision: saved.revision, actor });
            assert.equal(saved.record.owner, 'editor'); assert.equal(saved.record.workspace, 'ws1');
        }
        denied(() => f.claim(action, patch, { id, revision: saved.revision, workspace: 'ws2', actor: 'otherowner' }));
    }
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    for (const [action, name, , patch] of drafts) {
        const record = f.data[name][0];
        denied(() => f.claim(action, patch, { id: record.id, revision: 1, key: `trust_author_retry_${name}` }));
    }
});

test('edition publication requires a saved draft and current administrator, never a browser-supplied status', () => {
    for (const actor of ['owner', 'admin', 'legacyowner']) {
        const f = claimsFixture(), draft = f.claim('edition.save', { title: 'Draft edition' });
        const edited = f.claim('edition.save', { body: 'Draft edit' }, { id: draft.id, revision: 1 });
        assert.equal(edited.record.status, 'draft');
        denied(() => f.claim('edition.save', { title: 'Skip the draft', status: 'published' }, { actor }), 400);
        denied(() => f.claim('edition.save', { status: 'published' }, { id: draft.id, revision: 2 }), 400);
        denied(() => f.claim('edition.publish', {}, { id: draft.id, revision: 2 }));
        denied(() => f.claim('edition.publish', {}, { id: draft.id, revision: 1, actor }), 409);
        const options = { id: draft.id, revision: 2, actor, key: 'trust_publish_retry_001' };
        const published = f.claim('edition.publish', {}, options);
        assert.equal(published.record.published_by, actor); assert.ok(published.record.published_at);
        assert.equal(published.record.body, 'Draft edit'); assert.equal(published.record.owner, 'editor');
        assert.equal(f.claim('edition.publish', {}, options).replayed, true);
        for (const writer of ['editor', 'owner', 'admin']) {
            for (const patch of [{ body: 'Quiet rewrite' }, { status: 'draft' }])
                denied(() => f.claim('edition.save', patch, { id: draft.id, revision: 3, actor: writer }), 400);
            denied(native(f, 'daily_editions', writer, 'delete', { owner: 'editor', status: 'published' }));
        }
        f.seed('daily_editions', { id: 'legacy', workspace: 'ws1', owner: 'editor', status: 'published', title: 'Historical report' });
        denied(() => f.claim('edition.publish', {}, { id: 'legacy', actor }), 400);
        assert.equal(f.data.daily_editions.find((row) => row.id === 'legacy').published_by, undefined);
    }
});

test('support commands accept only connection requests and preserve every synced field on legacy records', () => {
    const f = claimsFixture();
    for (const actor of ['editor', 'viewer', 'outsider']) denied(() => f.claim('support.request', { provider: 'kofi' }, { actor }));
    const requested = f.claim('support.request', { provider: 'kofi' }, { actor: 'admin' });
    assert.equal(requested.record.status, 'pending'); assert.equal(requested.record.requested_by, 'admin');
    const synced = { id: 'legacy', workspace: 'ws1', owner: 'editor', provider: 'stripe', status: 'healthy', gross: 900,
        platform_fees: 30, refunds: 10, payout_status: 'paid', currency: 'USD', last_sync: '2026-09-23 00:00:00.000Z',
        date_range_start: '2026-09-01 00:00:00.000Z', date_range_end: '2026-09-22 00:00:00.000Z' };
    f.seed('support_sources', synced);
    for (const status of ['pending', 'not_connected', 'connected', 'syncing', 'healthy', 'degraded', 'error']) {
        denied(() => f.claim('support.request', { provider: 'patreon', status }, { actor: 'admin' }), 400);
        denied(() => f.claim('support.request', { status }, { id: 'legacy', actor: 'admin' }), 400);
    }
    for (const [field, value] of [['gross', 0], ['gross', 1200], ['refunds', 5], ['platform_fees', 3], ['payout_status', 'paid'], ['currency', 'USD'],
        ['last_sync', '2026-09-23 00:00:00.000Z'], ['date_range_start', '2026-09-01 00:00:00.000Z'], ['date_range_end', '2026-09-30 00:00:00.000Z']]) {
        denied(() => f.claim('support.request', { provider: 'patreon', [field]: value }, { actor: 'owner' }), 400);
        denied(() => f.claim('support.request', { [field]: value }, { id: 'legacy', actor: 'owner' }), 400);
    }
    denied(() => f.claim('support.request', { provider: 'kofi' }, { id: 'legacy', actor: 'admin' }), 400);
    f.claim('support.request', { provider: 'stripe' }, { id: 'legacy', actor: 'owner' });
    const retained = f.data.support_sources.find((row) => row.id === 'legacy');
    for (const [field, value] of Object.entries(synced)) assert.equal(retained[field], value, field);
    assert.equal(retained.requested_by, 'owner'); assert.ok(retained.requested_at);
});

test('channel and service health remain server-only without disabling unrelated allowed service requests', () => {
    const f = claimsFixture();
    denied(() => f.claim('channel.request', { platform: 'x', handle: 'Team' }));
    const channel = f.claim('channel.request', { platform: 'x', handle: 'Team' }, { actor: 'admin' });
    assert.equal(channel.record.status, 'pending'); assert.equal(channel.record.requested_by, 'admin');
    for (const patch of [{ status: 'healthy' }, { last_check: '2026-09-23 00:00:00.000Z' }]) {
        denied(() => f.claim('channel.request', { platform: 'youtube', ...patch }, { actor: 'admin' }), 400);
        denied(() => f.claim('channel.request', patch, { id: channel.id, revision: 1, actor: 'admin' }), 400);
    }
    assert.equal(native(f, 'services', 'admin', 'create', { status: 'planned' })(), 'persisted');
    denied(native(f, 'services', 'editor', 'create', { status: 'planned' }));
    denied(native(f, 'services', 'admin', 'create', { status: 'healthy' }), 400);
    denied(native(f, 'services', 'admin', 'update', { status: 'planned' }, { last_health_check: '2026-09-23 00:00:00.000Z' }), 400);
});

test('seat commands stamp the authenticated human account and reject browser-asserted identities', () => {
    const f = claimsFixture(), event = { event: 'progress', summary: 'Checked the mission evidence' };
    for (const actor of ['owner', 'editor']) {
        const result = f.claim('seat.report', event, { actor, key: `trust_seat_retry_${actor}` });
        assert.equal(result.record.seat, actor); assert.equal(result.record.actor_type, 'human'); assert.equal(result.record.owner, actor);
        assert.equal(f.claim('seat.report', event, { actor, key: `trust_seat_retry_${actor}` }).id, result.id);
        denied(() => f.claim('seat.report', event, { id: result.id, revision: 1, actor }), 400);
        denied(native(f, 'seat_events', actor, 'create', { ...event, actor_type: 'human', seat: actor }));
    }
    for (const identity of [{ actor_type: 'agent', seat: 'editor' }, { actor_type: 'mixed', seat: 'editor' },
        { actor_type: 'human', seat: 'owner' }, { actor_type: 'human', seat: 'kestrel-verify' }, { actor_type: 'human', seat: '' }]) {
        denied(() => f.claim('seat.report', { ...event, ...identity }), 400);
        denied(native(f, 'seat_events', 'editor', 'create', { ...event, ...identity }));
    }
    denied(() => f.claim('seat.report', event, { actor: 'viewer' }));
    denied(native(f, 'seat_events', 'viewer', 'create', { ...event, actor_type: 'human', seat: 'viewer' }));
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    denied(() => f.claim('seat.report', event, { key: 'trust_seat_retry_editor' }));
});

test('browser seat reporting cannot fall back to raw writes or choose an environment-provided identity', () => {
    const client = source('apps/web/src/lib/seatComms.js');
    assert.match(client, /createWorkspaceClaimClient\(/);
    assert.match(client, /\.api\.write\('create', '', payload\)/);
    assert.equal(/collection\((?:COLLECTION|['"]seat_events['"])\)\.create|VITE_BUILDANDDO_SEAT/.test(client), false,
        'Seat publishing must not use raw collection writes or an environment-provided identity.');
});

test('both Evidence source studies use keyless lessons while retaining historical metadata, artifacts and verification limits', () => {
    const page = source('apps/web/src/pages/workspace/EvidencePage.jsx');
    for (const name of ['broadcast-classroom-lessons', 'authority-repairs-lessons']) {
        const path = `apps/pocketbase/pb_migrations/data/${name}.json`, authored = JSON.parse(source(path));
        const projected = loadPublicLessons(repoPath(path));
        assert.match(page, new RegExp(`${name}\\.json\\?public-lessons['"]`));
        assert.equal(projected.version, authored.version);
        assert.deepEqual(projected.source_evidence, authored.source_evidence);
        assert.equal(projected.lessons.length, authored.lessons.length);
        for (const [index, lesson] of projected.lessons.entries()) {
            assert.equal(Object.hasOwn(lesson.lesson.check, 'answer'), false);
            assert.equal(Object.hasOwn(lesson.lesson.check, 'explanation'), false);
            assert.deepEqual({ ...lesson, lesson: { ...lesson.lesson, check: authored.lessons[index].lesson.check } }, authored.lessons[index]);
        }
        const evidence = projected.source_evidence;
        for (const artifact of [evidence.artifact, ...(evidence.previous_artifacts || [])]) {
            assert.match(artifact.url, /^\/[a-z0-9-]+\.txt$/);
            assert.equal(createHash('sha256').update(source(`apps/web/public${artifact.url}`)).digest('hex'), artifact.sha256);
        }
    }
    assert.match(page, /\[broadcastCurriculum, authorityCurriculum\]\.map/);
    assert.match(page, /evidence\.previous_artifacts\?\.map/);
    assert.match(page, /separate from workspace evidence records, totals and verification badges/);
    assert.match(page, /Not a current full-test gate or deployment acceptance/);
    assert.match(page, /Hashes check consistency, not reviewer identity/);
    assert.match(page, /No measured source run or result artifact is recorded/);
});
