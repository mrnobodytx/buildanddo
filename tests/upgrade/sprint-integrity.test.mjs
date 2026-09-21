// ─── CGRF Header ───────────────────────────────────────────────
// File:         tests/upgrade/sprint-integrity.test.mjs
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/workspace-onboarding.js, apps/pocketbase/pb_hooks/evidence-policy.js, apps/web/src/lib/dailyDigest.js
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/workspace-onboarding.js; DEPENDS_ON apps/pocketbase/pb_hooks/evidence-policy.js; DEPENDS_ON apps/web/src/lib/dailyDigest.js
// DAG Node:     none
// Intent:       Reproduce setup rollback/retry failures and protect the meaning of reviewed evidence and daily outcomes.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fixture, plain } from './admin-fixture.mjs';
import { createWorkspace } from '../../apps/web/src/lib/onboarding.js';
import { dailyDigest } from '../../apps/web/src/lib/dailyDigest.js';

const setup = () => {
    const f = fixture({ runtime: { $security: { sha256: (v) => createHash('sha256').update(v).digest('hex') } } });
    f.migration('apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js').up();
    return f;
};
const input = { name: 'Example shop', domain: 'shop.example' };
test('onboarding is atomic, canonical, account-scoped and recoverable across retries', () => {
    const f = setup(); const command = f.load('workspace-onboarding.js').create;
    const first = command(f.event('newuser', input));
    const again = command(f.event('newuser', { ...input, domain: 'SHOP.EXAMPLE' }));
    assert.equal(first.workspace, again.workspace); assert.equal(again.replayed, true);
    assert.equal(f.data.services.filter((r) => r.workspace === first.workspace).length, 7);
    assert.ok(f.data.services.every((s) => s.status === 'planned'));
    assert.notEqual(command(f.event('owner', input)).workspace, first.workspace);
    assert.throws(() => command(f.event('', input)), /Sign in/);
    assert.throws(() => command(f.event('owner', { ...input, domain: 'https:\/\/private.invalid' })), /domain name/);
});
test('a rejected service seed rolls back domain, workspace and every service', () => {
    const f = setup(); const before = plain(f.data); const save = f.app.save.bind(f.app);
    f.app.save = (r) => { if (r.getString?.('name') === 'Tutorial system') throw new Error('fixture storage failure'); save(r); };
    assert.throws(() => f.load('workspace-onboarding.js').create(f.event('newuser', input)), /fixture storage/);
    assert.deepEqual(f.data, before);
});
test('onboarding down/up retains receipt and disables commands while down', () => {
    const f = setup(); const migration = f.migration('apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js');
    const command = f.load('workspace-onboarding.js').create; const first = command(f.event('newuser', input));
    migration.down(); assert.throws(() => command(f.event('newuser', input)), /schema/);
    migration.up(); assert.equal(command(f.event('newuser', input)).workspace, first.workspace);
});
test('onboarding migrations fail closed on incompatible retained authority and identity fields', () => {
    for (const change of [
        (collection) => { collection.fields.getByName('owner').cascadeDelete = true; },
        (collection) => { collection.fields.getByName('request_key').max = 8; },
        (collection) => { collection.indexes = []; },
        (collection) => { collection.viewRule = ''; },
    ]) {
        const f = setup(); change(f.collections.workspace_onboarding);
        assert.throws(() => f.migration('apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js').up(), /Review/);
    }
});
test('browser retries the identical setup and suppresses a late account response', async () => {
    const f = setup(); let lost = true;
    const client = { authStore: { record: { id: 'newuser' } }, send: async (_path, { body }) => {
        const value = f.load('workspace-onboarding.js').create(f.event('newuser', body));
        if (lost) { lost = false; throw new Error('lost response'); } return value;
    } };
    assert.equal((await createWorkspace(client, 'newuser', input)).ok, false);
    const result = await createWorkspace(client, 'newuser', input); assert.equal(result.ok, true); assert.equal(result.replayed, true);
    client.send = async () => { client.authStore.record.id = 'owner'; return result; };
    assert.equal((await createWorkspace(client, 'newuser', input)).stale, true);
});
function reviewed() {
    const f = setup(); const policy = f.load('mission-policy.js');
    const plan = { version: 1, risk: 'A1', independent_review: true };
    for (const field of policy.PLAN_FIELDS) plan[field] = 'Bounded synthetic acceptance';
    const mission = f.seed('missions', { id: 'reviewedmission', workspace: 'ws1', owner: 'owner', status: 'running', title: 'Audit',
        mission_plan: plan, mission_approved_by: 'owner', mission_approved_at: new Date().toISOString(), progress: 0 });
    const evidence = f.seed('evidence', { id: 'reviewevidence', workspace: 'ws1', mission: mission.id, owner: 'owner', source: 'Synthetic acceptance source', content: 'Original reviewed result' });
    const review = { reflection: 'Independent synthetic review' };
    for (const key of policy.TEVV) review[key] = { outcome: 'pass', observation: 'Observed fixture result', evidence: evidence.id };
    const record = f.app.findRecordById('missions', mission.id); record.set('mission_review', review); record.set('status', 'verified');
    const e = f.event('editor'); e.record = record; e.next = () => f.app.save(record); policy.enforce(e, false);
    return { f, mission: f.app.findRecordById('missions', mission.id), evidence };
}
test('verification captures exact evidence and ordinary edits/deletes are rejected', () => {
    const { f, mission, evidence } = reviewed();
    const review = JSON.parse(mission.getString('mission_review'));
    assert.equal(review.evidence_snapshot[0].content, 'Original reviewed result');
    const record = f.app.findRecordById('evidence', evidence.id); record.set('content', 'Contradictory replacement');
    const e = f.event(); e.record = record; e.next = () => true;
    assert.throws(() => f.load('evidence-policy.js').enforce(e, false), /verified mission/);
    record.set('mission', ''); assert.throws(() => f.load('evidence-policy.js').enforce(e, false), /verified mission/);
    assert.throws(() => f.load('evidence-policy.js').remove(e), /verified mission/);
    assert.equal(review.evidence_snapshot[0].content, 'Original reviewed result');
});
test('legacy completed reviews also protect their selected evidence', () => {
    const { f, mission, evidence } = reviewed(); const review = JSON.parse(mission.getString('mission_review')); delete review.evidence_snapshot;
    mission.set('mission_review', review); f.app.save(mission);
    const e = f.event(); e.record = f.app.findRecordById('evidence', evidence.id); e.next = () => true;
    assert.throws(() => f.load('evidence-policy.js').remove(e), /verified mission/);
});
const source = (records = [], extra = {}) => ({ records, loading: false, degraded: false, ...extra });
test('edition distinguishes unavailable sources from an observed empty day', () => {
    assert.deepEqual(dailyDigest(source([], { degraded: true }), source()).unavailable, ['missions']);
    assert.equal(dailyDigest(source([], { loading: true }), source()).loading, true);
    assert.deepEqual(dailyDigest(source(), source()).completed, []);
});
test('edition uses review time, excludes unknown/future dates and ignores later learning edits', () => {
    const now = new Date('2026-09-20T15:00:00Z');
    const records = [
        { id: 'old', status: 'verified', mission_reviewed_at: '2026-09-19T14:00:00Z', updated: now.toISOString() },
        { id: 'today', status: 'verified', mission_reviewed_at: now.toISOString() },
        { id: 'unknown', status: 'verified' }, { id: 'future', status: 'verified', mission_reviewed_at: '2099-09-20T15:00:00Z' },
    ];
    const value = dailyDigest(source(records), source(), now);
    assert.deepEqual(value.completed.map((m) => m.id), ['today']); assert.equal(value.undated, 2);
});
