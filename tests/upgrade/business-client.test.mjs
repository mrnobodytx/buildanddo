// ─── CGRF Header ───────────────────────────────────────────────
// File:         tests/upgrade/business-client.test.mjs
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-21
// Depends:      apps/web/src/lib/businessExecution.js, apps/web/src/lib/workflowRuns.js
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/web/src/lib/businessExecution.js; DEPENDS_ON apps/web/src/lib/workflowRuns.js
// DAG Node:     none
// Intent:       Verify scoped native business receipt transport, uncertain retries and honest replay projections.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createBusinessClient, defaultBusinessAction, businessReplay } from '../../apps/web/src/lib/businessExecution.js';
import { createRetryIntent } from '../../apps/web/src/lib/workflowRuns.js';
function fixture() {
    let alive = true;
    const calls = [], client = { authStore: { record: { id: 'owner' } }, send: async (path, options) => {
        calls.push({ path, options }); return { workspace: 'ws1', items: [], page: 1, has_more: false };
    } };
    return { calls, client, api: createBusinessClient({ client, workspaceId: 'ws1', accountId: 'owner', isCurrent: () => alive }), leave: () => { alive = false; } };
}
test('native business reads retain explicit pagination and commands retain retry identity', async () => {
    const f = fixture(), intent = createRetryIntent(() => 'capture-request-identity');
    const body = { action: 'source.capture', revision: 0, payload: { url: 'https://www.python.org/', binding: 'public-read' } };
    assert.equal((await f.api.list({ page: 2, run: 'run1' })).ok, true);
    assert.deepEqual(f.calls[0].options.query, { page: 2, run: 'run1' });
    f.client.send = async () => { throw new Error('response lost'); };
    assert.match((await f.api.command(intent(body))).error, /confirm this action/);
    f.client.send = async (_path, options) => { assert.equal(options.body.request_key, 'capture-request-identity'); return { workspace: 'ws1', id: 'job1' }; };
    assert.equal((await f.api.command(intent(body))).data.id, 'job1');
});
test('business clients suppress results and failures after account or workspace changes', async () => {
    for (const method of ['list', 'command']) {
        for (const failure of [false, true]) {
            const f = fixture(); let done, fail;
            f.client.send = () => new Promise((resolve, reject) => { done = resolve; fail = reject; });
            const pending = f.api[method]({}); f.leave();
            if (failure) fail(new Error('late failure')); else done({ workspace: 'ws1', items: [] });
            assert.equal((await pending).stale, true);
            assert.equal((await f.api[method]({})).stale, true);
        }
        const f = fixture(); f.client.authStore.record = { id: 'other' };
        assert.equal((await f.api[method]({})).stale, true); assert.equal(f.calls.length, 0);
    }
});
test('foreign or malformed receipt pages cannot be rendered as current workspace history', async () => {
    const f = fixture();
    for (const data of [null, { workspace: 'foreign', items: [] }, { workspace: 'ws1' }, { workspace: 'ws1', items: [{ workspace: 'foreign' }] }]) {
        f.client.send = async () => data; assert.equal((await f.api.list()).ok, false);
    }
    f.client.send = async () => { throw { response: { message: 'A current role is required.' } }; };
    assert.equal((await f.api.list()).error, 'A current role is required.');
});
test('observed write failures retain uncertainty while failed reads keep their read-specific explanation', async () => {
    const f = fixture(), observed = [];
    f.client.send = async () => { throw Object.assign(new Error('Synthetic unavailable response'), { status: 503 }); };
    const api = createBusinessClient({ client: f.client, workspaceId: 'ws1', accountId: 'owner', isCurrent: () => true,
        observe: async (collection, action, operation) => { observed.push([collection, action]); return operation(); } });
    const read = await api.list();
    assert.equal(read.reason, 'rejected');
    assert.match(read.error, /Could not load these action receipts/);
    assert.doesNotMatch(read.error, /confirm this action/);
    assert.equal(observed.length, 0);
    const write = await api.command({ action: 'source.capture' });
    assert.equal(write.reason, 'uncertain');
    assert.match(write.error, /Could not confirm this action/);
    assert.deepEqual(observed, [['business_jobs', 'source.capture']]);
});
test('replay preserves uncertain work and actual timestamps without claiming independent verification', () => {
    const first = defaultBusinessAction(), second = defaultBusinessAction(); first.parameters.title = 'Changed';
    assert.equal(second.parameters.title, ''); assert.equal(second.provider, 'erp');
    const result = businessReplay([
        { id: 'a', owner: 'requester', worker: 'worker', status: 'succeeded', created: '2026-09-20T10:00:00Z', started_at: '2026-09-20T10:01:00Z', finished_at: '2026-09-20T10:02:00Z', evidence: 'evidence1' },
        { id: 'b', owner: 'requester', status: 'hold', created: 'invalid' },
        { id: 'c', owner: 'requester', status: 'failed', created: '2026-09-20T10:00:00Z', finished_at: '2026-09-20T10:03:00Z' },
    ]);
    assert.equal(result.completed, 1); assert.equal(result.uncertain, 1); assert.equal(result.failed, 1);
    assert.equal(result.timeline.length, 5); assert.equal(result.timeline[0].job, 'a');
    assert.equal(result.timeline[3].evidence, 'evidence1'); assert.equal(result.timeline.at(-1).actor, 'requester');
    assert.equal(result.verified, undefined);
});
