// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/sprint-journey.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/lib/authSession.js, apps/web/src/lib/workspaceRecords.js, apps/web/src/lib/connectorReadiness.js, apps/web/src/lib/evidenceInspection.js, apps/web/src/lib/workspaceJourney.js, apps/web/src/lib/missionReplay.js, apps/pocketbase/pb_hooks/workspace-replay.js, apps/web/src/lib/businessExecution.js, apps/web/src/lib/businessPlanning.js, apps/web/src/lib/missionLearning.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/authSession.js; VALIDATES apps/web/src/lib/workspaceRecords.js; VALIDATES apps/web/src/lib/connectorReadiness.js; VALIDATES apps/web/src/lib/evidenceInspection.js; VALIDATES apps/web/src/lib/workspaceJourney.js; VALIDATES apps/web/src/lib/missionReplay.js; VALIDATES apps/pocketbase/pb_hooks/workspace-replay.js; VALIDATES apps/web/src/lib/businessExecution.js; VALIDATES apps/web/src/lib/businessPlanning.js; VALIDATES apps/web/src/lib/missionLearning.js
// Intent:      Exercise real journey modules across identity changes, forbidden reads, stale health, independent review and complete capture integrity.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createAuthSession } from '../../apps/web/src/lib/authSession.js';
import { createWorkspaceRecordClient } from '../../apps/web/src/lib/workspaceRecords.js';
import { createBusinessClient } from '../../apps/web/src/lib/businessExecution.js';
import { connectorReadiness } from '../../apps/web/src/lib/connectorReadiness.js';
import { downloadObservation, inspectEvidence, safeEvidenceUrl } from '../../apps/web/src/lib/evidenceInspection.js';
import { selectTasks } from '../../apps/web/src/lib/businessPlanning.js';
import { emptyPlan, emptyReview, PLAN_FIELDS, TEVV, verificationIssues } from '../../apps/web/src/lib/missionLearning.js';
import { workspaceJourney } from '../../apps/web/src/lib/workspaceJourney.js';
import { canonicalReplay, validateMissionReplay } from '../../apps/web/src/lib/missionReplay.js';
import { fixture, plain, source } from './admin-fixture.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const sha = (value) => createHash('sha256').update(value).digest('hex');
function sessionFixture() {
    const listeners = new Set(), states = [], calls = [];
    const store = { record: { id: 'owner' }, token: 'synthetic-session-one', isValid: true,
        save(token, record) { Object.assign(this, { token, record, isValid: true }); listeners.forEach((callback) => callback(token, record)); },
        clear() { Object.assign(this, { token: '', record: null, isValid: false }); listeners.forEach((callback) => callback('', null)); },
        onChange(callback) { listeners.add(callback); return () => listeners.delete(callback); } };
    const client = { authStore: store, send: (path, options) => { const response = deferred(); calls.push({ path, options, response }); return response.promise; } };
    const controller = createAuthSession(client, (state) => states.push(state));
    return { client, store, calls, states, controller };
}
test('saved sessions are checked by the native endpoint before private data is eligible', async () => {
    const f = sessionFixture(), result = f.controller.start();
    assert.equal(f.states.at(-1).status, 'checking');
    assert.equal(f.calls[0].path, '/api/collections/users/auth-refresh');
    assert.equal(f.calls[0].options.method, 'POST');
    assert.equal(f.calls[0].options.requestKey, null);
    assert.equal(f.controller.refresh(), result);
    f.calls[0].response.resolve({ record: { id: 'owner' }, token: 'synthetic-refreshed' });
    assert.equal(await result, true); assert.equal(f.states.at(-1).status, 'ready');
    const background = f.controller.refresh(); assert.equal(f.states.at(-1).status, 'ready');
    f.calls[1].response.resolve({ record: { id: 'owner' }, token: 'synthetic-refreshed-twice' }); await background;
    f.controller.stop(); assert.equal(await f.controller.refresh(), false);
});
test('expired or revoked sessions clear while transport failures expose unavailable state', async () => {
    for (const status of [401, 403, 503]) {
        const f = sessionFixture(), result = f.controller.start(); f.calls[0].response.reject({ status });
        assert.equal(await result, false);
        assert.equal(f.states.at(-1).status, status === 503 ? 'unavailable' : 'anonymous');
        assert.equal(Boolean(f.store.record), status === 503);
        f.controller.stop();
    }
    const f = sessionFixture(); f.store.isValid = false; assert.equal(await f.controller.start(), false);
    assert.equal(f.calls.length, 0); assert.equal(f.store.record, null); f.controller.stop();
});
test('old refreshes cannot restore a logged-out or switched account', async () => {
    for (const switched of [false, true]) {
        const f = sessionFixture(), old = f.controller.start();
        if (switched) f.store.save('synthetic-other-session', { id: 'other' }); else f.store.clear();
        f.calls[0].response.resolve({ record: { id: 'owner' }, token: 'synthetic-old-result' });
        assert.equal(await old, false); assert.equal(f.store.record?.id, switched ? 'other' : undefined);
        if (switched) { const next = f.controller.refresh(); f.calls[1].response.resolve({ record: { id: 'other' }, token: 'synthetic-new-result' }); assert.equal(await next, true); }
        f.controller.stop();
    }
});
test('malformed and unmounted refresh responses never establish a session', async () => {
    for (const response of [{ record: { id: 'foreign' }, token: 'synthetic' }, { record: { id: 'owner' } }]) {
        const f = sessionFixture(), pending = f.controller.start(); f.calls[0].response.resolve(response);
        assert.equal(await pending, false); assert.equal(f.states.at(-1).status, 'unavailable'); f.controller.stop();
    }
    const f = sessionFixture(), pending = f.controller.start(); f.controller.stop();
    f.calls[0].response.resolve({ record: { id: 'owner' }, token: 'synthetic' }); assert.equal(await pending, false);
});
test('a synchronous refresh transport failure can be retried without a stuck pending operation', async () => {
    const f = sessionFixture();
    f.client.send = () => { throw new Error('Transport unavailable before dispatch'); };
    assert.equal(await f.controller.start(), false);
    f.client.send = async () => ({ record: { id: 'owner' }, token: 'synthetic-retry' });
    assert.equal(await f.controller.refresh(), true);
    f.controller.stop();
});

function recordsFixture() {
    let live = true; const calls = [];
    const row = { id: 'task1', workspace: 'ws1', owner: 'owner', title: 'Retained task' };
    const table = { getFullList: async (query) => { calls.push(['read', query]); return [row]; }, getOne: async () => row,
        create: async (input) => { calls.push(['create', input]); return { id: 'newtask', ...input }; },
        update: async (id, input) => { calls.push(['update', id, input]); return { ...row, ...input }; },
        delete: async (id) => { calls.push(['delete', id]); return true; } };
    const client = { authStore: { record: { id: 'owner' } }, collection: () => table,
        filter: (text) => text.replace('{:ws}', '"ws1"') };
    const api = createWorkspaceRecordClient({ client, collection: 'erp_tasks', workspaceId: 'ws1', accountId: 'owner', isCurrent: () => live });
    return { api, client, table, calls, row, leave: () => { live = false; } };
}
test('record queries retain workspace scope across OR filters and reject foreign responses', async () => {
    const f = recordsFixture(); assert.equal((await f.api.read({ extraFilter: 'status = "todo" || status = "done"' })).ok, true);
    assert.equal(f.calls[0][1].filter, 'workspace = "ws1" && (status = "todo" || status = "done")');
    f.table.getFullList = async () => [{ ...f.row, workspace: 'ws2' }]; assert.equal((await f.api.read()).ok, false);
    f.table.getFullList = async () => { throw new Error('offline'); }; assert.match((await f.api.read()).error, /incomplete/);
});
test('collection read and write responses are discarded after workspace and account changes', async () => {
    const f = recordsFixture(), response = deferred(); f.table.getFullList = () => response.promise;
    const read = f.api.read(); f.leave(); response.resolve([f.row]); assert.equal((await read).stale, true);
    assert.equal((await f.api.write('create', '', {})).stale, true);
    const g = recordsFixture(), saved = deferred(); g.table.create = () => saved.promise;
    const write = g.api.write('create', '', {}); g.client.authStore.record = { id: 'other' }; saved.resolve({ ...g.row, id: 'new' });
    assert.equal((await write).stale, true);
});
test('updates validate the target workspace before writing and block scope changes during readback', async () => {
    const f = recordsFixture(); f.table.getOne = async () => ({ ...f.row, workspace: 'foreign' });
    assert.equal((await f.api.write('update', 'task1', { title: 'bad' })).ok, false); assert.equal(f.calls.length, 0);
    const response = deferred(); f.table.getOne = () => response.promise;
    const change = f.api.write('delete', 'task1'); f.leave(); response.resolve(f.row);
    assert.equal((await change).stale, true); assert.equal(f.calls.length, 0);
});
test('record writes preserve authorship, serialize submissions and retain uncertain failure wording', async () => {
    const f = recordsFixture();
    const created = await f.api.write('create', '', { owner: 'foreign', workspace: 'foreign', title: 'Saved' });
    assert.equal(created.record.owner, 'owner'); assert.equal(created.record.workspace, 'ws1');
    assert.equal((await f.api.write('update', 'task1', { workspace: 'foreign' })).ok, false);
    assert.equal((await f.api.write('update', 'task1', { title: 'Changed' })).record.title, 'Changed');
    assert.equal((await f.api.write('delete', 'task1')).ok, true);
    const pending = deferred(); f.table.create = () => pending.promise;
    const first = f.api.write('create', '', {}); assert.equal((await f.api.write('create', '', {})).reason, 'busy');
    pending.reject(new Error('response lost')); assert.match((await first).error, /confirm.*Refresh/);
    f.table.create = async () => { throw { response: { data: { title: { message: 'A title is required' } } } }; };
    assert.equal((await f.api.write('create', '', {})).error, 'A title is required');
});

const clock = Date.parse('2026-09-21T20:00:00Z');
const connection = () => ({ id: 'firecrawl', provider: 'firecrawl', configuration: { binding: 'public-read', mode: 'read' }, desired_enabled: true,
    observation: { current: true, state: 'healthy', at: new Date(clock - 1000).toISOString(), receipt_ref: 'synthetic-health' } });
test('connection readiness expires without trusting an old current flag or future time', () => {
    assert.equal(connectorReadiness(connection(), clock).ready, true);
    for (const update of [(v) => { v.desired_enabled = false; }, (v) => { v.configuration.mode = 'reviewed_run'; },
        (v) => { v.observation.state = 'failed'; }, (v) => { v.observation.current = false; },
        (v) => { v.observation.receipt_ref = ''; }, (v) => { v.observation.at = new Date(clock + 100).toISOString(); }]) {
        const item = connection(); update(item); assert.equal(connectorReadiness(item, clock).ready, false);
    }
    assert.equal(connectorReadiness(null, clock).ready, false);
    assert.equal(connectorReadiness(connection(), clock + 900_000).ready, false);
});
function missionFixture() {
    const plan = { ...emptyPlan(), independent_review: true, ...Object.fromEntries(PLAN_FIELDS.map(({ id }) => [id, 'Observed bounded scope'])) };
    const mission = { id: 'mission1', workspace: 'ws1', owner: 'owner', title: 'Follow up', status: 'running', mission_plan: plan,
        mission_approved_by: 'owner', mission_approved_at: '2026-09-21T19:00:00Z' };
    const evidence = [{ id: 'evidence1', workspace: 'ws1', mission: 'mission1', owner: 'owner', source: 'Synthetic test observation', content: 'Observed local result' }];
    const review = { ...emptyReview(), reflection: 'Inspect the recorded outcome.', ...Object.fromEntries(TEVV.map(({ id }) => [id, { outcome: 'pass', observation: 'Observed result', evidence: 'evidence1' }])) };
    return { mission, evidence, review, actorId: 'editor', canWrite: true };
}
test('verification guidance distinguishes a qualified reviewer from the proposer and evidence author', () => {
    const f = missionFixture(); assert.deepEqual(verificationIssues(f), []);
    assert.match(verificationIssues({ ...f, actorId: 'owner' }).join(' '), /different member.*evidence authored/);
    assert.match(verificationIssues({ ...f, canWrite: false }).join(' '), /current owner/);
    assert.match(verificationIssues({ ...f, evidenceAvailable: false }).join(' '), /Reload/);
    assert.match(verificationIssues({ ...f, mission: { ...f.mission, status: 'proposed', mission_approved_by: '' } }).join(' '), /approve/);
});
test('ERP filters retain exact objective, contact and task links without mutating records', () => {
    const rows = [{ id: 'a', title: 'A', status: 'todo', priority: 'high', objective: 'goal1', contact: 'person1' },
        { id: 'b', title: 'B', status: 'todo', objective: 'goal2', contact: 'person1' }, { id: 'c', title: 'C', status: 'done', objective: 'goal1', contact: 'person2' }];
    const before = structuredClone(rows);
    assert.deepEqual(selectTasks(rows, { objective: 'goal1', contact: 'person1' }).map((row) => row.id), ['a']);
    assert.deepEqual(selectTasks(rows, { task: 'c' }).map((row) => row.id), ['c']);
    assert.deepEqual(selectTasks(rows, { objective: 'foreign' }), []); assert.deepEqual(rows, before);
});
test('evidence inspection distinguishes current bytes from reviewed snapshots and typed labels', () => {
    const f = missionFixture(), row = f.evidence[0];
    const mission = { ...f.mission, status: 'verified', mission_review: { ...f.review, evidence_snapshot: [row] }, mission_reviewed_by: 'editor', mission_reviewed_at: new Date(clock).toISOString() };
    assert.equal(inspectEvidence(row, [mission], 'ws1').integrity, 'matches_review');
    const changed = inspectEvidence({ ...row, content: 'Altered' }, [mission], 'ws1');
    assert.equal(changed.integrity, 'changed_since_review'); assert.equal(changed.review.snapshot.content, row.content);
    assert.equal(inspectEvidence({ ...row, type: 'verified' }, [], 'ws1').integrity, 'no_retained_review');
    assert.throws(() => inspectEvidence(row, [mission], 'other'), /workspace/);
    assert.equal(inspectEvidence(row, [{ ...mission, workspace: 'other' }], 'ws1').mission, null);
});
test('unsafe evidence URLs remain inert while valid HTTP references are available', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,hello', '//example.org', 'https://user:pass@example.org/', undefined, 'x'.repeat(2049)]) assert.equal(safeEvidenceUrl(value), '');
    assert.equal(safeEvidenceUrl('https://example.org/source'), 'https://example.org/source');
});
test('a local observation download retains its bytes and releases the temporary object URL', async (t) => {
    let blob, clicked = false, revoked = '';
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const anchor = { click: () => { clicked = true; } };
    t.mock.method(URL, 'createObjectURL', (value) => { blob = value; return 'blob:local-observation'; });
    t.mock.method(URL, 'revokeObjectURL', (value) => { revoked = value; });
    t.mock.method(globalThis, 'setTimeout', (callback) => { callback(); return 0; });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: (tag) => { assert.equal(tag, 'a'); return anchor; } } });
    try {
        downloadObservation({ evidence_state: 'recorded' }, 'observation.json');
        assert.equal(clicked, true); assert.equal(anchor.download, 'observation.json');
        assert.equal(anchor.href, 'blob:local-observation'); assert.equal(revoked, anchor.href);
        assert.equal(blob.type, 'application/json'); assert.deepEqual(JSON.parse(await blob.text()), { evidence_state: 'recorded' });
    } finally {
        if (previous) Object.defineProperty(globalThis, 'document', previous); else delete globalThis.document;
    }
});
test('malformed historical review data stays unverified instead of crashing inspection', () => {
    const f = missionFixture(), row = f.evidence[0];
    for (const review of ['invalid JSON', '{"evidence_snapshot":[null]}'])
        assert.equal(inspectEvidence(row, [{ ...f.mission, status: 'verified', mission_review: review }], 'ws1').integrity, 'no_retained_review');
});
test('the journey prioritizes waiting approvals and holds suggestions when reads are incomplete', () => {
    const f = missionFixture(), input = { workspace: 'ws1', account: 'owner', missions: [f.mission], evidence: f.evidence,
        signals: [{ workspace: 'other', id: 'foreign', state: 'new' }], runs: [{ workspace: 'ws1', id: 'run1', status: 'awaiting_approval' }] };
    const view = workspaceJourney(input); assert.equal(view.actions[0].to, '/app/workflows?run=run1');
    assert.match(view.actions[1].title, /independent review/); assert.equal(view.actions.some((row) => row.id === 'signals'), false);
    assert.deepEqual(workspaceJourney({ ...input, unavailable: ['evidence'] }).actions, []);
    assert.equal(workspaceJourney({ ...input, demo: true }).state, 'demo');
    assert.equal(workspaceJourney({ workspace: 'ws1', account: 'owner' }).actions[0].id, 'begin');
    assert.match(workspaceJourney({ ...input, missions: [{ ...f.mission, status: 'verified' }] }).actions.at(-1).to, /replay\?mission=/);
});
test('next actions distinguish planning, approval, effects and late tasks without changing any records', () => {
    const f = missionFixture();
    const missions = [
        { ...f.mission, id: 'blocked', status: 'needs_attention' },
        { ...f.mission, id: 'incomplete', status: 'proposed', mission_plan: emptyPlan() },
        { ...f.mission, id: 'planned', status: 'proposed' },
        { ...f.mission, id: 'approved', status: 'approved' },
        { ...f.mission, id: 'no-result', status: 'running' },
    ];
    const input = { workspace: 'ws1', account: 'editor', missions, today: '2026-09-21',
        tasks: [{ id: 'late', workspace: 'ws1', status: 'todo', title: 'Call', due_date: '2026-09-20' }],
        signals: [{ id: 'source', workspace: 'ws1', state: 'new' }], runs: [{ id: 'run1', workspace: 'ws1', status: 'running' }] };
    const before = structuredClone(input), actions = workspaceJourney(input).actions;
    assert.match(actions[0].title, /Resolve/);
    for (const phrase of ['Complete the plan', 'Review approval', 'Start approved work', 'Record outcome evidence', 'Review overdue task', 'Triage 1 new signal', 'Resume recorded work'])
        assert.ok(actions.some((row) => row.title.includes(phrase)), phrase);
    assert.deepEqual(input, before);
    assert.equal(workspaceJourney({ workspace: '', account: 'editor' }).state, 'unavailable');
});

function replayFixture(count = 1) {
    const f = fixture({ runtime: { $security: { sha256: sha }, toString: String,
        $os: { getenv: () => '', readFile: (path) => { assert.equal(path, '/pb_migrations/data/starter-tutorials.json'); return source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'); } } } });
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up();
    f.migration('apps/pocketbase/pb_migrations/1790800000_business_execution.js').up();
    f.seed('missions', missionFixture().mission);
    for (let index = 0; index < count; index++) f.seed('evidence', { id: `evidence${index}`, workspace: 'ws1', mission: 'mission1', owner: 'owner', source: 'Synthetic', content: `Observed ${index}`, type: 'observed' });
    f.capture = (actor = 'owner', id = 'mission1', workspace = 'ws1') => plain(f.load('workspace-replay.js').capture(f.event(actor, {}, { workspace, id })));
    return f;
}
test('mission capture includes more than one page, is read-only and has deterministic content digests', async () => {
    const f = replayFixture(25), before = plain(f.data);
    const value = f.capture(), repeated = f.capture();
    assert.equal(value.content.evidence.length, 25); assert.equal(value.capture_complete, true);
    assert.equal(value.evidence_state, 'recorded'); assert.equal(value.content_sha256, repeated.content_sha256);
    assert.deepEqual(value.leaves, repeated.leaves); assert.deepEqual(plain(f.data), before);
    assert.equal(await validateMissionReplay(value, 'ws1', 'mission1'), value);
    assert.equal(f.capture('viewer').content.evidence.length, 25);
});
test('an actual approved ERP workflow exports its complete linked history through the existing business read policy', async () => {
    const f = replayFixture(0);
    const canRead = f.app.canAccessRecord.bind(f.app);
    // Native business_jobs has a locked viewRule: the authenticated command
    // API applies current membership and linked-record rules instead.
    f.app.canAccessRecord = (record, info, rule) => record.collection().name !== 'business_jobs' && canRead(record, info, rule);
    f.seed('workflows', { id: 'workflow1', workspace: 'ws1', owner: 'owner', name: 'Follow up', status: 'active',
        steps: [{ id: 'approval', name: 'Approve task', kind: 'approval', detail: '' }, { id: 'execute', name: 'Save task', kind: 'execute', detail: '',
            action: { provider: 'erp', binding: '', max_seconds: 5, parameters: { title: 'Call customer', description: 'Approved local fixture', objective: '', contact: '', priority: 'normal', due_date: '' } } }] });
    const handler = f.load('workflow-runs.js');
    const initial = handler.start(f.event('owner', { workspace: 'ws1', workflow: 'workflow1', mission: 'mission1', request_key: 'replay-workflow-start' })).record;
    const approved = handler.advance(f.event('admin', { workspace: 'ws1', request_key: 'replay-workflow-approve', revision: initial.revision,
        action: 'step', step_id: 'approval', outcome: 'approved', observation: 'Reviewed the frozen scope', source: '' }, { id: initial.id })).record;
    const job = f.load('business-actions.js').command(f.event('owner', { action: 'action.enqueue', revision: approved.revision,
        request_key: 'replay-business-effect', payload: { run: initial.id, step_id: 'execute' } }));
    assert.equal(job.status, 'succeeded');
    const value = f.capture();
    assert.equal(value.integrity, 'consistent');
    assert.equal(value.content.runs[0].status, 'completed');
    assert.equal(value.content.jobs[0].id, job.id);
    assert.ok(value.content.evidence.some((record) => record.id === job.evidence));
    assert.equal(value.content.tasks[0].execution, job.id);
    await validateMissionReplay(value, 'ws1', 'mission1');
    f.denied.add(initial.id);
    assert.throws(() => f.capture(), /readable/);
});
test('mission capture rejects foreign, revoked and unreadable data instead of exporting a partial history', () => {
    const f = replayFixture();
    assert.throws(() => f.capture('outsider'), /role|membership|access/i);
    assert.throws(() => f.capture('otherowner', 'mission1', 'ws2'), /readable/);
    f.denied.add('evidence0'); assert.throws(() => f.capture(), /readable/); f.denied.clear();
    f.denied.add('mission1'); assert.throws(() => f.capture(), /readable/);
    const g = replayFixture(201); assert.throws(() => g.capture(), /limit/);
});
test('capture refuses oversized or deeply nested histories instead of downloading truncated data', () => {
    const tooLarge = replayFixture(1), record = tooLarge.app.findRecordById('evidence', 'evidence0');
    record.set('content', 'x'.repeat(2_000_001)); tooLarge.app.save(record);
    assert.throws(() => tooLarge.capture(), /size limit/);
    const deep = replayFixture(0), mission = deep.app.findRecordById('missions', 'mission1');
    let plan = {}; for (let index = 0; index < 34; index++) plan = { nested: plan };
    mission.set('mission_plan', plan); deep.app.save(mission);
    assert.throws(() => deep.capture(), /nesting limit/);
    const many = replayFixture(0);
    for (let index = 0; index < 201; index++) many.seed('business_jobs', { id: `job${index}`, workspace: 'ws1', mission: 'mission1', owner: 'owner' });
    assert.throws(() => many.capture(), /export limit/);
});
test('capture preserves integrity failures and never exports foreign review snapshots', async () => {
    const f = replayFixture(), mission = f.app.findRecordById('missions', 'mission1');
    mission.set('status', 'verified'); f.app.save(mission);
    let capture = f.capture(); assert.equal(capture.integrity, 'HOLD'); assert.match(capture.integrity_issues[0], /snapshot/);
    mission.set('mission_review', { evidence_snapshot: [{ id: 'other', workspace: 'ws2', mission: 'mission2', content: 'Foreign private observation' }] }); f.app.save(mission);
    assert.throws(() => f.capture(), /different scope/);
    mission.set('mission_review', { evidence_snapshot: [{ ...f.data.evidence[0], content: 'Earlier bytes' }] }); f.app.save(mission);
    capture = f.capture(); assert.equal(capture.integrity, 'HOLD'); await validateMissionReplay(capture, 'ws1', 'mission1');
    mission.set('mission_review', { evidence_snapshot: capture.content.evidence }); f.app.save(mission);
    assert.equal(f.capture().integrity, 'consistent');
    mission.set('mission_review', { evidence_snapshot: [null] }); f.app.save(mission);
    assert.throws(() => f.capture(), /different scope/);
});
test('missing effect links and altered result hashes remain explicit capture gaps', () => {
    const f = replayFixture();
    f.seed('business_jobs', { id: 'job1', workspace: 'ws1', mission: 'mission1', owner: 'owner', evidence: 'evidence0', result: { output: 'Actual' }, result_sha256: '0'.repeat(64), lease_id: 'synthetic-private-lease' });
    f.seed('erp_tasks', { id: 'task1', workspace: 'ws1', mission: 'mission1', title: 'Task', execution: 'missingjob', evidence: 'missing' });
    const capture = f.capture(); assert.equal(capture.integrity, 'HOLD'); assert.equal(capture.integrity_issues.length, 3);
    assert.equal(JSON.stringify(capture).includes('synthetic-private-lease'), false);
});
test('export validation rejects altered bytes, duplicate leaves, wrong scope and incomplete capture', async () => {
    const original = replayFixture().capture();
    for (const change of [(v) => { v.content.evidence[0].content = 'changed'; }, (v) => { v.workspace = 'foreign'; },
        (v) => { v.capture_complete = false; }, (v) => { v.leaves.pop(); }, (v) => { v.leaves[1] = v.leaves[0]; },
        (v) => { v.content.evidence.push(v.content.evidence[0]); }, (v) => { v.content.evidence[0].mission = 'foreign'; },
        (v) => { v.integrity_issues.push('unacknowledged gap'); }]) {
        const value = structuredClone(original); change(value); await assert.rejects(validateMissionReplay(value, 'ws1', 'mission1'));
    }
    assert.equal(canonicalReplay({ b: 1, a: [true, null] }), '{"a":[true,null],"b":1}');
    assert.throws(() => canonicalReplay({ value: undefined }), /non-JSON/);
});
test('exact action receipt lookups find old captures without crossing workspace scope', async () => {
    const f = replayFixture();
    for (let index = 0; index < 25; index++) f.seed('business_jobs', { id: `job${index}`, workspace: 'ws1', owner: 'owner', provider: 'firecrawl', status: 'queued' });
    f.seed('business_jobs', { id: 'foreignjob', workspace: 'ws2', owner: 'otherowner' });
    const list = f.load('business-actions.js').list;
    const found = plain(list(f.event('owner', {}, { query: { id: 'job0' } }))); assert.equal(found.items.length, 1); assert.equal(found.items[0].id, 'job0');
    assert.deepEqual(plain(list(f.event('owner', {}, { query: { id: 'foreignjob' } }))).items, []);
    const client = { authStore: { record: { id: 'owner' } }, send: async (_path, options) => plain(list(f.event('owner', {}, { query: options.query }))) };
    const api = createBusinessClient({ client, accountId: 'owner', workspaceId: 'ws1', isCurrent: () => true });
    assert.equal((await api.read('job0')).data.id, 'job0'); assert.equal((await api.read('foreignjob')).ok, false);
});
test('mission capture client rejects late scope changes and validates the received content', async () => {
    let current = true;
    const value = replayFixture().capture(), response = deferred();
    const client = { authStore: { record: { id: 'owner' } }, send: () => response.promise };
    const api = createBusinessClient({ client, accountId: 'owner', workspaceId: 'ws1', isCurrent: () => current });
    const pending = api.captureMission('mission1'); current = false; response.resolve(value); assert.equal((await pending).stale, true);
    current = true; client.send = async () => value; assert.equal((await api.captureMission('mission1')).ok, true);
    client.send = async () => ({ ...value, content_sha256: '0'.repeat(64) }); assert.equal((await api.captureMission('mission1')).ok, false);
    client.send = async () => ({ ...value, captured_by: 'other' }); assert.equal((await api.captureMission('mission1')).ok, false);
    assert.equal((await api.captureMission('../other')).ok, false);
    current = false; assert.equal((await api.captureMission('mission1')).stale, true);
});
test('lost business replies preserve uncertainty while permission failures remain explicit rejections', async () => {
    const client = { authStore: { record: { id: 'owner' } }, send: async () => { throw new Error('Lost response'); } };
    const api = createBusinessClient({ client, accountId: 'owner', workspaceId: 'ws1', isCurrent: () => true });
    const input = { action: 'source.capture', payload: { url: 'https://example.org/source', binding: 'public-read' }, request_key: 'synthetic-recovery-identity', revision: 0 };
    assert.equal((await api.command(input)).reason, 'uncertain');
    client.send = async () => { throw { status: 403, response: { message: 'Current membership required' } }; };
    assert.equal((await api.command(input)).reason, 'rejected');
    client.send = async () => ({ workspace: 'foreign' }); assert.equal((await api.command(input)).reason, 'uncertain');
});
