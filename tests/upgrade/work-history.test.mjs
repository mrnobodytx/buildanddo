// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/work-history.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/workHistory.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/workHistory.js
// DAG Node:    none
// Intent:      Detect missing evidence and run history, incomplete reads, request collisions and account changes in the actual history adapter.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../../apps/web/src/lib/workHistory.js', import.meta.url));
const code = readFileSync(path, 'utf8').replace("import pb from '@/lib/pocketbaseClient';", '')
    .replaceAll('export async function', 'async function');
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const event = (changes = {}) => ({ id: 'event1', workspace: 'ws1', subject_type: 'mission', subject: 'mission1',
    event: 'completed', seat: 'IDE1', actor_type: 'agent', summary: 'Recorded review', created: '2026-09-15T10:00:00Z', ...changes });
const evidence = (changes = {}) => ({ id: 'evidence1', workspace: 'ws1', mission: 'mission1', type: 'observed',
    content: 'Observed the acceptance result', source: 'Local acceptance receipt', created: '2026-09-15T11:00:00Z', ...changes });
const run = (changes = {}) => ({ id: 'run1', workspace: 'ws1', workflow: 'workflow1', status: 'completed',
    started_at: '2026-09-15T10:00:00Z', finished_at: '2026-09-15T11:00:00Z', ...changes });

function fixture(data = {}) {
    const calls = [];
    const requests = new Map();
    const fail = new Set();
    const totals = {};
    const client = {
        authStore: { record: { id: 'account1' } },
        filter: (format, params) => JSON.stringify({ format, params }),
        collection(name) {
            return {
                async getList(page, limit, options) {
                    const { format, params } = JSON.parse(options.filter);
                    calls.push({ name, page, limit, options, format, params });
                    // Model the SDK's documented default method/path cancellation key.
                    const key = options.requestKey === null ? Symbol(name) : `GET/${name}/records`;
                    if (requests.has(key)) requests.get(key).cancelled = true;
                    const request = { cancelled: false };
                    requests.set(key, request);
                    await tick();
                    if (request.cancelled || fail.has(name)) throw new Error('Collection read unavailable');
                    const subjectKey = { seat_events: 'subject', evidence: 'mission', workflow_runs: 'workflow' }[name];
                    assert.ok(subjectKey, name);
                    const ids = Object.entries(params).filter(([key]) => /^s\d+$/.test(key) || key === 'subject').map(([, value]) => value);
                    const rows = (data[name] || []).filter((row) => row.workspace === params.ws && ids.includes(row[subjectKey]) &&
                        (name !== 'seat_events' || row.subject_type === params.type));
                    return { items: rows.slice(0, limit), totalItems: totals[name] ?? rows.length,
                        totalPages: Math.ceil((totals[name] ?? rows.length) / limit), page };
                },
            };
        },
    };
    const module = { exports: {} };
    vm.runInNewContext(`${code}\nmodule.exports = { lookupPreviousWork, lookupPreviousWorkBatch };`,
        { pb: client, module, console: { error() {} } }, { filename: path });
    return { ...module.exports, client, calls, fail, totals };
}

test('mission list history includes saved evidence without requiring a seat event', async () => {
    const f = fixture({ evidence: [evidence(), evidence({ id: 'foreign', workspace: 'ws2' })] });
    const history = await f.lookupPreviousWorkBatch({ workspaceId: 'ws1', subjectType: 'mission', subjects: ['mission1', 'mission2'] });
    assert.equal(history.mission1.hasHistory, true);
    assert.equal(history.mission1.evidence[0].id, 'evidence1');
    assert.equal(history.mission1.lastAt, '2026-09-15T11:00:00Z');
    assert.equal(history.mission1.partial, false);
    assert.equal(history.mission2.hasHistory, false);
    assert.equal(history.mission2.partial, false);
    assert.equal(f.calls.length, 2, 'batch the two applicable sources, not one request per row');
});

test('workflow history includes recorded runs and preserves their own outcome instead of inventing a seat event', async () => {
    const f = fixture({ workflow_runs: [run(), run({ id: 'other', workflow: 'workflow2' }), run({ id: 'foreign', workspace: 'ws2' })] });
    const history = await f.lookupPreviousWorkBatch({ workspaceId: 'ws1', subjectType: 'workflow', subjects: ['workflow1'] });
    assert.equal(history.workflow1.hasHistory, true);
    assert.equal(history.workflow1.runs[0].id, 'run1');
    assert.equal(history.workflow1.runs[0].status, 'completed');
    assert.deepEqual(plain(history.workflow1.events), []);
    assert.equal(history.workflow1.lastAt, '2026-09-15T11:00:00Z');
    assert.equal(history.workflow1.partial, false);
    assert.ok(f.calls.every((call) => call.name !== 'evidence'));
});

test('single and batch history use the same sources and preserve terminal seat semantics', async () => {
    const f = fixture({ seat_events: [event({ id: 'new', event: 'progress', created: '2026-09-15T12:00:00Z' }), event()], evidence: [evidence()] });
    const history = await f.lookupPreviousWork({ workspaceId: 'ws1', subjectType: 'mission', subject: 'mission1' });
    assert.equal(history.state, 'completed');
    assert.equal(history.events.length, 2);
    assert.equal(history.seats[0].eventCount, 2);
    assert.equal(history.evidence.length, 1);
    assert.equal(history.firstAt, '2026-09-15T10:00:00Z');
    assert.equal(history.lastAt, '2026-09-15T12:00:00Z');
    const workflow = fixture({ workflow_runs: [run()] });
    assert.equal((await workflow.lookupPreviousWork({ workspaceId: 'ws1', subjectType: 'workflow', subject: 'workflow1' })).runs.length, 1);
});

test('claimed seat labels do not collapse reports from different submitting accounts', async () => {
    const f = fixture({ seat_events: [event({ owner: 'account1' }), event({ id: 'event2', owner: 'account2' })] });
    const history = await f.lookupPreviousWork({ workspaceId: 'ws1', subjectType: 'mission', subject: 'mission1' });
    assert.deepEqual(plain(history.events.map((item) => item.owner)), ['account1', 'account2']);
    assert.equal(history.seats.length, 2);
    assert.deepEqual(plain(history.seats.map((item) => item.owner)), ['account1', 'account2']);
    assert.ok(history.events.every((item) => item.attribution === 'reported'));
    assert.equal(history.state, 'completed', 'the historical report stays completed, not independently verified');
});

test('a failed evidence read retains available events and reports incomplete history', async () => {
    const f = fixture({ seat_events: [event()] });
    f.fail.add('evidence');
    const history = await f.lookupPreviousWork({ workspaceId: 'ws1', subjectType: 'mission', subject: 'mission1' });
    assert.equal(history.hasHistory, true);
    assert.equal(history.partial, true);
    assert.equal(history.sources.evidence, 'unavailable');
    assert.equal(history.sources.seat_events, 'complete');
});

test('empty successful history stays distinct from failed or truncated sources', async () => {
    const f = fixture();
    f.fail.add('seat_events'); f.fail.add('workflow_runs');
    const unavailable = await f.lookupPreviousWorkBatch({ workspaceId: 'ws1', subjectType: 'workflow', subjects: ['workflow1'] });
    assert.equal(unavailable.workflow1.hasHistory, false);
    assert.equal(unavailable.workflow1.partial, true);
    const limited = fixture({ evidence: [evidence()] });
    limited.totals.evidence = 201;
    const result = await limited.lookupPreviousWorkBatch({ workspaceId: 'ws1', subjectType: 'mission', subjects: ['mission1', 'mission2'] });
    assert.equal(result.mission1.sources.evidence, 'truncated');
    assert.equal(result.mission2.partial, true, 'the missing subject may be beyond the bounded page');
});

test('independent concurrent history readers do not cancel each other', async () => {
    const f = fixture({ seat_events: [event(), event({ id: 'event2', subject: 'mission2' })] });
    const histories = await Promise.all(['mission1', 'mission2'].map((subject) =>
        f.lookupPreviousWork({ workspaceId: 'ws1', subjectType: 'mission', subject })));
    assert.deepEqual(histories.map((history) => history.events.length), [1, 1]);
    assert.ok(histories.every((history) => !history.partial));
});

test('an account change during the read discards the previous account history', async () => {
    const f = fixture({ seat_events: [event()], evidence: [evidence()] });
    const pending = f.lookupPreviousWorkBatch({ workspaceId: 'ws1', subjectType: 'mission', subjects: ['mission1'] });
    f.client.authStore.record = { id: 'account2' };
    assert.deepEqual(plain(await pending), {});
});

test('no identity or no subjects makes no request; arbitrary subject text stays in bound parameters', async () => {
    const f = fixture();
    f.client.authStore.record = null;
    assert.equal((await f.lookupPreviousWork({ workspaceId: 'ws1', subjectType: 'mission', subject: 'mission1' })).hasHistory, false);
    assert.deepEqual(plain(await f.lookupPreviousWorkBatch({ workspaceId: 'ws1', subjectType: 'mission', subjects: ['mission1'] })), {});
    assert.equal(f.calls.length, 0);
    assert.equal((await f.lookupPreviousWork({ workspaceId: 'ws1', subjectType: 'page', subject: '__proto__' })).hasHistory, false);
    f.client.authStore.record = { id: 'account1' };
    assert.deepEqual(plain(await f.lookupPreviousWorkBatch({ workspaceId: 'ws1', subjectType: 'mission', subjects: [] })), {});
    const injected = 'subject" || workspace != "ws1';
    const result = await f.lookupPreviousWorkBatch({ workspaceId: 'ws1', subjectType: 'page', subjects: [injected, injected, '__proto__'] });
    assert.equal(Object.keys(result).length, 2);
    assert.equal(Object.hasOwn(result, '__proto__'), true);
    assert.ok(!f.calls[0].format.includes(injected));
    assert.ok(Object.values(f.calls[0].params).includes(injected));
    assert.ok(Object.values(result).every((history) => history.partial === false));
});

test('large mission lists use bounded groups without losing later subjects', async () => {
    const subjects = Array.from({ length: 95 }, (_, index) => `mission${index}`);
    const f = fixture({ evidence: [evidence({ mission: subjects.at(-1) })] });
    const result = await f.lookupPreviousWorkBatch({ workspaceId: 'ws1', subjectType: 'mission', subjects }, { limit: 500 });
    assert.equal(Object.keys(result).length, 95);
    assert.equal(result[subjects.at(-1)].evidence[0].id, 'evidence1');
    assert.equal(f.calls.length, 6);
    assert.ok(f.calls.every((call) => call.limit === 200 && Object.keys(call.params).filter((key) => /^s\d+$/.test(key)).length <= 40));
});

test('malformed or foreign responses are unavailable sources, never successful empty histories', async () => {
    for (const response of [{}, { items: [], totalItems: -1 }, { items: [evidence()], totalItems: 0 },
        { items: [null], totalItems: 1 }, { items: [evidence({ workspace: 'ws2' })], totalItems: 1 },
        { items: [evidence({ mission: 'another-mission' })], totalItems: 1 }]) {
        const f = fixture();
        const collection = f.client.collection;
        f.client.collection = (name) => name === 'evidence' ? { getList: async () => response } : collection(name);
        const result = await f.lookupPreviousWork({ workspaceId: 'ws1', subjectType: 'mission', subject: 'mission1' }, { limit: 0 });
        assert.equal(result.hasHistory, false);
        assert.equal(result.partial, true);
        assert.equal(result.sources.evidence, 'unavailable');
        assert.deepEqual(plain(result.evidence), []);
    }
});

test('seat coordination remains separate from recorded execution and tolerates incomplete timestamps', async () => {
    for (const [name, expected] of [['blocked', 'blocked'], ['handoff', 'handed_off'], ['joined', 'in_progress']]) {
        const f = fixture({ seat_events: [event({ event: name, created: 'unavailable', pr_url: 'https://example.com/review/1' })] });
        const result = await f.lookupPreviousWork({ workspaceId: 'ws1', subjectType: 'mission', subject: 'mission1' }, { limit: 5 });
        assert.equal(result.state, expected);
        assert.equal(result.firstAt, null);
        assert.deepEqual(plain(result.prLinks), ['https://example.com/review/1']);
        assert.ok(f.calls.every((call) => call.limit === 5));
    }
});
