// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/workflow-runs.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workflow-runs.js, apps/pocketbase/pb_hooks/workflow-policy.js, apps/pocketbase/pb_hooks/workflows.pb.js, apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/workflow-runs.js; VALIDATES apps/pocketbase/pb_hooks/workflow-policy.js; VALIDATES apps/pocketbase/pb_hooks/workflows.pb.js; VALIDATES apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js
// DAG Node:    none
// Intent:      Exercise production workflow commands against transactional storage contracts, including role isolation, retries, stale requests and rollback.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const policyPath = 'apps/pocketbase/pb_hooks/workflow-policy.js';
const commandsPath = 'apps/pocketbase/pb_hooks/workflow-runs.js';
const hooksPath = 'apps/pocketbase/pb_hooks/workflows.pb.js';
const migrationPath = 'apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js';
const source = (path) => readFileSync(new URL(path, root), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const startBody = (changes = {}) => ({ workspace: 'workspace1', workflow: 'workflow1', mission: '',
    request_key: 'start-request-000001', ...changes });
const actionBody = (changes = {}) => ({ workspace: 'workspace1', request_key: 'decision-request-0001',
    revision: 1, action: 'step', step_id: 'step1', outcome: 'passed',
    observation: 'Checked the local record; the stated condition holds.', source: 'Local record', ...changes });
const step = (id = 'step1', kind = 'read') => ({ id, name: 'Check the recorded input', kind, detail: '' });
const workflow = (changes = {}) => ({ id: 'workflow1', name: 'Receipt review', description: 'A recorded procedure.',
    status: 'active', owner: 'owner1', workspace: 'workspace1', steps: [step()],
    last_run: '', updated: '2026-09-15 01:00:00.000Z', ...changes });
const mission = (changes = {}) => ({ id: 'mission1', workspace: 'workspace1', owner: 'owner1',
    title: 'A measured goal', status: 'running', mission_approved_by: 'owner1',
    mission_approved_at: '2026-09-15 01:00:00.000Z', ...changes });

class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
class BadRequestError extends ApiError { constructor(message) { super(400, message); } }
class ForbiddenError extends ApiError { constructor(message) { super(403, message); } }
class NotFoundError extends ApiError { constructor(message) { super(404, message); } }
class Collection {
    constructor(definition) {
        Object.assign(this, plain(definition));
        this.id = definition.id || definition.name;
        const entries = this.fields || [];
        this.fields = { entries, getByName: (name) => entries.find((entry) => entry.name === name) };
    }
}
const jsonFields = new Set(['steps', 'snapshot', 'events', 'start_request']);
class Record {
    constructor(collection, data = {}) {
        this.definition = collection;
        this.data = plain(data);
        this.before = plain(data);
        this.id = data.id || '';
        this.raw = {};
    }
    collection() { return this.definition; }
    get(name) { return this.data[name]; }
    getString(name) {
        if (Object.hasOwn(this.raw, name)) return this.raw[name];
        return jsonFields.has(name) ? JSON.stringify(this.data[name] ?? null) : String(this.data[name] ?? '');
    }
    set(name, value) { this.data[name] = plain(value); }
    original() { return new Record(this.definition, this.before); }
}
const definitions = {
    users: ['email'], workspaces: ['owner'], workspace_members: ['workspace', 'user', 'role'],
    workflows: ['name', 'description', 'steps', 'last_run', 'workspace', 'owner'],
    missions: ['title', 'workspace', 'owner', 'mission_approved_at', 'mission_approved_by'],
    evidence: ['content', 'source', 'type', 'mission', 'workspace', 'owner', 'title', 'category', 'tags'],
};

function fixture() {
    const collections = new Map(Object.entries(definitions).map(([name, fields]) => [name,
        new Collection({ name, fields: fields.map((field) => ({ name: field })), viewRule: `${name}-read` })]));
    const state = { records: Object.fromEntries(Object.keys(definitions).map((name) => [name, []])), next: 1 };
    const config = { failSave: '', failCommit: false, denied: new Set(), schemaError: '', findError: '' };
    const missing = () => new Error('sql: no rows in result set');
    const makeApp = (store, transactional = false) => ({
        findCollectionByNameOrId(name) {
            if (config.schemaError === name) throw new Error('schema unavailable');
            if (!collections.has(name)) throw missing();
            return collections.get(name);
        },
        findRecordById(name, id) {
            if (config.findError === name) throw new Error('database unavailable');
            const found = (store.records[name] || []).find((record) => record.id === id);
            if (!found) throw missing();
            return new Record(this.findCollectionByNameOrId(name), found);
        },
        findRecordsByFilter(name, filter, sort, limit, offset, params) {
            assert.equal(sort, ''); assert.equal(limit, 1); assert.equal(offset, 0);
            let matches;
            if (name === 'workspace_members') {
                assert.equal(filter, 'workspace = {:workspace} && user = {:user}');
                matches = store.records[name].filter((row) => row.workspace === params.workspace && row.user === params.user);
            } else if (name === 'workflow_runs' && params.key) {
                assert.equal(filter, 'owner = {:owner} && request_key = {:key}');
                matches = (store.records[name] || []).filter((row) => row.owner === params.owner && row.request_key === params.key);
            } else {
                assert.equal(name, 'workflow_runs'); assert.equal(filter, 'workflow = {:workflow}');
                matches = (store.records[name] || []).filter((row) => row.workflow === params.workflow);
            }
            return matches.slice(0, limit).map((row) => new Record(this.findCollectionByNameOrId(name), row));
        },
        canAccessRecord(record, info, rule) {
            assert.equal(rule, record.collection().viewRule);
            assert.ok(info.auth.id);
            return !config.denied.has(record.id);
        },
        save(record) {
            if (record instanceof Collection) {
                collections.set(record.name, record);
                store.records[record.name] ||= [];
                return;
            }
            assert.equal(transactional, true, 'command saves must use the transaction app');
            const name = record.collection().name;
            if (config.failSave === name) throw new Error(`save ${name} failed`);
            if (!record.id) record.id = `record${store.next++}`;
            if (name === 'workflow_runs') {
                const duplicate = store.records[name].find((row) => row.id !== record.id && row.owner === record.getString('owner') &&
                    row.request_key === record.getString('request_key'));
                if (duplicate) throw new Error('unique constraint failed');
            }
            const data = { ...plain(record.data), id: record.id };
            const index = store.records[name].findIndex((row) => row.id === record.id);
            if (index < 0) store.records[name].push(data);
            else store.records[name][index] = data;
        },
        delete(collection) { collections.delete(collection.name); delete store.records[collection.name]; },
        runInTransaction(callback) {
            assert.equal(transactional, false);
            const copy = structuredClone(store);
            callback(makeApp(copy, true));
            if (config.failCommit) throw new Error('commit failed');
            store.records = copy.records; store.next = copy.next;
        },
    });
    const app = makeApp(state);
    const modules = new Map();
    const load = (path) => {
        if (modules.has(path)) return modules.get(path);
        const module = { exports: {} };
        vm.runInNewContext(source(path), { module, __hooks: '/hooks', Record, ApiError, BadRequestError,
            ForbiddenError, NotFoundError, require: (name) => load(`apps/pocketbase/pb_hooks/${name.split('/').at(-1)}`) },
        { filename: new URL(path, root).href });
        modules.set(path, module.exports);
        return module.exports;
    };
    let up, down;
    vm.runInNewContext(source(migrationPath), { Collection, migrate: (a, b) => { up = a; down = b; } },
        { filename: new URL(migrationPath, root).href });
    up(app);
    state.records.workspaces.push({ id: 'workspace1', owner: 'owner1' }, { id: 'workspace2', owner: 'outsider' });
    state.records.workflows.push(workflow());
    state.records.missions.push(mission());
    const auth = (id = 'owner1') => ({ id, collection: () => ({ name: 'users' }) });
    const event = (body, id, account = 'owner1') => ({ app, auth: account === null ? null : auth(account),
        requestInfo() { return { body, auth: this.auth }; }, request: { pathValue: (key) => { assert.equal(key, 'id'); return id; } } });
    const commands = load(commandsPath);
    return { app, state, config, collections, up, down, policy: load(policyPath), commands, load, event,
        start: (body = {}, account) => plain(commands.start(event(startBody(body), '', account))),
        advance: (id, body = {}, account) => plain(commands.advance(event(actionBody(body), id, account))),
        member(user, role, workspace = 'workspace1') { state.records.workspace_members.push({ id: `member-${user}-${workspace}`, user, role, workspace }); },
        definition(patch = {}, creating = false, account = 'owner1') {
            const original = workflow(creating ? {} : state.records.workflows[0]);
            const record = new Record(collections.get('workflows'), original);
            Object.entries(patch).forEach(([name, value]) => record.set(name, value));
            const e = { ...event({}, '', account), record, next: () => 'delegated' };
            return { record, e, save: () => load(policyPath).enforce(e, creating) };
        },
    };
}
function rejected(call, status, pattern) {
    assert.throws(call, (error) => error.status === status && (!pattern || pattern.test(error.message)),
        `expected status ${status}`);
}

test('run migration is idempotent, locks direct writes and explicitly reverses its own collection', () => {
    const f = fixture();
    const collection = f.collections.get('workflow_runs');
    for (const name of ['createRule', 'updateRule', 'deleteRule']) assert.equal(collection[name], null);
    assert.match(collection.listRule, /workspace\.workspace_members_via_workspace\.user/);
    assert.equal(collection.viewRule, collection.listRule);
    assert.equal(collection.fields.getByName('mission').cascadeDelete, false);
    assert.ok(collection.indexes.some((index) => /unique.*owner, request_key/.test(index)));
    f.up(f.app); assert.equal(f.collections.get('workflow_runs'), collection);
    f.down(f.app); f.down(f.app);
    assert.equal(f.collections.has('workflow_runs'), false);
    assert.equal(f.collections.has('evidence'), true);
    f.up(f.app); assert.equal(f.collections.has('workflow_runs'), true);
    f.config.schemaError = 'workflow_runs';
    assert.throws(() => f.up(f.app), /schema unavailable/);
    assert.throws(() => f.down(f.app), /schema unavailable/);
});

test('saved definitions validate bounded steps and never accept a browser last-run timestamp', () => {
    const f = fixture();
    const create = f.definition({ status: 'draft', last_run: '2040-01-01', steps: [] }, true);
    assert.equal(create.save(), 'delegated'); assert.equal(create.record.getString('last_run'), '');
    const activate = f.definition({ status: 'active', last_run: '2040-01-01' });
    assert.equal(activate.save(), 'delegated'); assert.equal(activate.record.getString('last_run'), '');
    for (const value of [false, {}, 'text', [null], [step(), step()], Array.from({ length: 21 }, (_, i) => step(`s${i}`)),
        [{ ...step(), kind: 'execute' }], [{ ...step(), detail: 'x'.repeat(301) }], [{ ...step(), name: ' ' }],
        [{ ...step(), id: 'path/step' }], [{ ...step(), owner: 'forged' }]]) {
        rejected(() => f.definition({ steps: value }).save(), 400);
    }
    rejected(() => f.definition({ steps: [] }).save(), 400);
    rejected(() => f.definition({ status: 'active' }, true).save(), 400);
    rejected(() => f.definition({ status: 'invented' }).save(), 400);
    rejected(() => f.definition({ owner: 'outsider' }).save(), 400);
    rejected(() => f.definition({ workspace: 'workspace2' }).save(), 400);
    const broken = f.definition(); broken.record.raw.steps = 'not json';
    rejected(broken.save, 400);
    const legacy = f.definition({ status: 'draft', steps: null });
    legacy.save(); assert.deepEqual(plain(legacy.record.get('steps')), []);
});

test('start captures the saved definition, approval receipt and server attribution', () => {
    const f = fixture();
    const response = f.start({ mission: 'mission1' });
    const run = response.record;
    assert.equal(response.replayed, false); assert.equal(run.status, 'running');
    assert.equal(run.revision, 1); assert.equal(run.next_step, 0); assert.equal(run.owner, 'owner1');
    assert.equal(run.snapshot.mission_approved_at, mission().mission_approved_at);
    assert.equal(run.snapshot.name, workflow().name); assert.deepEqual(run.events, []);
    assert.ok(Number.isFinite(Date.parse(run.started_at)));
    assert.equal(f.state.records.workflows[0].last_run, run.started_at);
    f.state.records.workflows[0].steps[0].name = 'Edited after starting';
    assert.equal(f.state.records.workflow_runs[0].snapshot.steps[0].name, step().name);
    const retry = f.start({ mission: 'mission1' });
    assert.equal(retry.record.id, run.id); assert.equal(retry.replayed, true);
    assert.equal(f.state.records.workflow_runs.length, 1);
});

test('idempotency compares JSON objects semantically after database key reordering', () => {
    const f = fixture();
    const { record } = f.start();
    const stored = f.state.records.workflow_runs[0];
    stored.start_request = Object.fromEntries(Object.entries(stored.start_request).reverse());
    assert.equal(f.start().record.id, record.id);
    f.advance(record.id);
    stored.events = f.state.records.workflow_runs[0].events;
    f.state.records.workflow_runs[0].events[0].command = Object.fromEntries(Object.entries(stored.events[0].command).reverse());
    assert.equal(f.advance(record.id).replayed, true);
    assert.equal(f.state.records.evidence.length, 1);
});

test('start rejects foreign context, unreadable records and malformed requests before persistence', () => {
    const f = fixture();
    for (const body of [null, [], {}, { ...startBody(), owner: 'forged' }, startBody({ request_key: 'short' }),
        startBody({ workspace: '../outside' }), startBody({ mission: false })]) {
        rejected(() => f.commands.start(f.event(body)), 400);
    }
    rejected(() => f.start({}, null), 403);
    const admin = f.event(startBody()); admin.auth.collection = () => ({ name: '_superusers' });
    rejected(() => f.commands.start(admin), 403);
    rejected(() => f.start({}, 'outsider'), 403);
    rejected(() => f.start({ workflow: 'missing' }), 404);
    rejected(() => f.start({ workspace: 'missing' }), 404);
    rejected(() => f.start({ workspace: 'workspace2' }, 'outsider'), 403);
    f.config.denied.add('workflow1'); rejected(() => f.start(), 403); f.config.denied.clear();
    f.state.records.workflows[0].status = 'paused'; rejected(() => f.start(), 409);
    f.state.records.workflows[0].status = 'active'; f.state.records.workflows[0].name = ' ';
    rejected(() => f.start(), 400);
    assert.equal(f.state.records.workflow_runs.length, 0);
});

test('workspace role lookup cannot combine an editor role from another user or workspace', () => {
    const f = fixture();
    f.member('viewer', 'viewer'); f.member('someone-else', 'admin'); f.member('viewer', 'editor', 'workspace2');
    rejected(() => f.start({}, 'viewer'), 403);
    f.member('editor', 'editor'); f.member('admin', 'admin');
    assert.equal(f.start({ request_key: 'editor-request-0001' }, 'editor').record.owner, 'editor');
    assert.equal(f.start({ request_key: 'admin-request-00001' }, 'admin').record.owner, 'admin');
    f.member('invalid', 'unknown'); rejected(() => f.start({}, 'invalid'), 403);
    f.state.records.workspace_members = [];
    rejected(() => f.start({ request_key: 'editor-request-0001' }, 'editor'), 403);
    rejected(() => f.definition({ status: 'draft' }, true, 'editor').save(), 400);
});

test('step progression creates atomic source-backed evidence and a terminal run, without verifying its mission', () => {
    const f = fixture();
    const { record } = f.start({ mission: 'mission1' });
    const done = f.advance(record.id).record;
    assert.equal(done.status, 'completed'); assert.equal(done.next_step, 1); assert.equal(done.revision, 2);
    assert.ok(done.finished_at); assert.equal(done.events.length, 1);
    const evidence = f.state.records.evidence[0];
    assert.equal(evidence.mission, 'mission1'); assert.equal(evidence.workspace, 'workspace1');
    assert.equal(evidence.owner, 'owner1'); assert.equal(evidence.source, 'Local record');
    assert.equal(evidence.type, 'observed'); assert.equal(done.events[0].evidence, evidence.id);
    assert.equal(done.events[0].actor, 'owner1'); assert.ok(done.events[0].at);
    assert.equal(f.state.records.missions[0].status, 'running');
    evidence.content = 'Edited separately';
    assert.equal(done.events[0].command.observation, actionBody().observation);
    const retry = f.advance(record.id); assert.equal(retry.replayed, true);
    assert.equal(f.state.records.evidence.length, 1);
    rejected(() => f.advance(record.id, { request_key: 'a-new-request-00001', revision: 2 }), 409, /finished/);
});

test('approval pauses the sequence and only an owner or admin can explicitly decide it', () => {
    const f = fixture();
    f.state.records.workflows[0].steps = [step(), step('step2', 'approval'), step('step3', 'notify')];
    f.member('editor', 'editor'); f.member('admin', 'admin');
    const { record } = f.start({}, 'editor');
    let run = f.advance(record.id, {}, 'editor').record;
    assert.equal(run.status, 'awaiting_approval');
    const decision = { revision: 2, step_id: 'step2', outcome: 'approved', source: '', request_key: 'approval-request-001' };
    rejected(() => f.advance(run.id, decision, 'editor'), 403, /owner or admin/);
    rejected(() => f.advance(run.id, { ...decision, outcome: 'passed' }), 400);
    rejected(() => f.advance(run.id, { ...decision, source: 'invented approval source' }), 400);
    run = f.advance(run.id, decision, 'admin').record;
    assert.equal(run.status, 'running'); assert.equal(run.next_step, 2);
    assert.equal(f.state.records.evidence[1].type, 'decided');
    assert.equal(run.events[1].actor, 'admin');
    run = f.advance(run.id, { revision: 3, step_id: 'step3', request_key: 'notify-request-0001' }, 'editor').record;
    assert.equal(run.status, 'completed'); assert.equal(run.events.length, 3);
    const awaiting = fixture(); awaiting.state.records.workflows[0].steps = [step('step1', 'approval')];
    const start = awaiting.start().record; assert.equal(start.status, 'awaiting_approval');
    assert.equal(awaiting.advance(start.id, { outcome: 'rejected', source: '' }).record.status, 'failed');
});

test('failed work and cancellation retain an honest terminal observation', () => {
    const f = fixture();
    const run = f.start().record;
    assert.equal(f.advance(run.id, { outcome: 'failed' }).record.status, 'failed');
    assert.equal(f.state.records.evidence[0].type, 'attempted');
    const second = f.start({ request_key: 'another-start-00001', mission: 'mission1' }).record;
    f.state.records.missions[0].status = 'needs_attention';
    const cancelled = f.advance(second.id, { action: 'cancel', step_id: '', outcome: '', source: '' }).record;
    assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.next_step, 0);
    assert.equal(cancelled.events[0].command.observation, actionBody().observation);
    assert.equal(f.state.records.evidence[1].type, 'decided');
});

test('stale tabs, skipped steps and request-key conflicts cannot append evidence', () => {
    const f = fixture();
    f.state.records.workflows[0].steps.push(step('step2'));
    const run = f.start().record;
    rejected(() => f.advance(run.id, { step_id: 'step2' }), 409, /current step/);
    f.advance(run.id);
    rejected(() => f.advance(run.id, { request_key: 'stale-tab-request-01', step_id: 'step2' }), 409, /Another decision/);
    rejected(() => f.advance(run.id, { observation: 'Changed payload' }), 409, /request key/);
    f.member('editor', 'editor'); rejected(() => f.advance(run.id, {}, 'editor'), 409);
    rejected(() => f.start({ mission: 'mission1' }), 409);
    assert.equal(f.state.records.workflow_runs.length, 1); assert.equal(f.state.records.evidence.length, 1);
});

test('mission binding rejects foreign, unreadable, unapproved, paused or reapproved work', () => {
    const f = fixture();
    f.state.records.missions[0].workspace = 'workspace2'; rejected(() => f.start({ mission: 'mission1' }), 403);
    f.state.records.missions[0] = mission(); f.config.denied.add('mission1');
    rejected(() => f.start({ mission: 'mission1' }), 403); f.config.denied.clear();
    for (const changes of [{ status: 'approved' }, { mission_approved_by: '' }, { mission_approved_at: '' }]) {
        f.state.records.missions[0] = mission(changes); rejected(() => f.start({ mission: 'mission1' }), 409);
    }
    f.state.records.missions[0] = mission();
    const run = f.start({ mission: 'mission1' }).record;
    f.state.records.missions[0].status = 'needs_attention'; rejected(() => f.advance(run.id), 409);
    f.state.records.missions[0] = mission({ mission_approved_at: '2026-09-15 03:00:00.000Z' });
    rejected(() => f.advance(run.id), 409, /approval changed/);
    f.state.records.workflow_runs[0].mission = ''; rejected(() => f.advance(run.id), 409, /linked mission changed/);
    assert.equal(f.state.records.evidence.length, 0);
});

test('command validation and schema failures occur without any partial save', () => {
    const f = fixture();
    const run = f.start().record;
    for (const changes of [{ revision: 0 }, { revision: 1.5 }, { action: 'skip' }, { outcome: 'verified' },
        { observation: '' }, { observation: 'x'.repeat(1201) }, { source: 'x'.repeat(161) },
        { step_id: '' }, { source: '' }, { outcome: 'approved' }, { actor: 'forged' },
        { action: 'cancel', step_id: '', outcome: '', source: 'unaccepted' }]) {
        rejected(() => f.advance(run.id, changes), 400);
    }
    rejected(() => f.advance('../outside'), 400);
    rejected(() => f.advance(run.id, {}, null), 403);
    rejected(() => f.advance(run.id, { workspace: 'workspace2' }), 403);
    f.config.denied.add(run.id); rejected(() => f.advance(run.id), 403); f.config.denied.clear();
    const data = f.state.records.workflow_runs[0]; data.snapshot.version = 99;
    rejected(() => f.advance(run.id), 503); data.snapshot.version = 1;
    data.next_step = 99; rejected(() => f.advance(run.id), 503); data.next_step = 0;
    f.collections.get('evidence').fields.entries = []; // getByName retains its original array.
    f.collections.get('evidence').fields.getByName = () => null;
    rejected(() => f.advance(run.id), 503);
    f.collections.delete('workflow_runs'); rejected(() => f.start(), 503);
    f.config.schemaError = 'workflow_runs'; assert.throws(() => f.start(), /schema unavailable/);
    f.config.schemaError = ''; f.up(f.app); f.config.findError = 'workflows';
    assert.throws(() => f.start({ request_key: 'different-start-0001' }), /database unavailable/);
    assert.equal(f.state.records.evidence.length, 0);
});

test('transactions roll back receipt and run together when a save or commit fails', () => {
    for (const failedSave of ['workflow_runs', 'workflows']) {
        const f = fixture(); f.config.failSave = failedSave;
        assert.throws(() => f.start(), /save .* failed/);
        assert.equal(f.state.records.workflow_runs.length, 0); assert.equal(f.state.records.workflows[0].last_run, '');
    }
    for (const failure of ['evidence', 'workflow_runs', 'commit']) {
        const f = fixture(); const run = f.start().record;
        f.config.failSave = failure === 'commit' ? '' : failure;
        f.config.failCommit = failure === 'commit';
        assert.throws(() => f.advance(run.id), /failed/);
        assert.equal(f.state.records.evidence.length, 0); assert.equal(f.state.records.workflow_runs[0].revision, 1);
        f.config.failSave = ''; f.config.failCommit = false;
        assert.equal(f.advance(run.id).record.status, 'completed');
        assert.equal(f.advance(run.id).replayed, true);
        assert.equal(f.state.records.evidence.length, 1);
    }
});

test('workflow deletion preserves existing history and delegates only when no run references it', () => {
    const f = fixture(); const empty = f.definition();
    assert.equal(f.policy.remove(empty.e), 'delegated');
    f.start(); rejected(() => f.policy.remove(f.definition().e), 400, /run history/);
});

test('route registrations use native authentication and load each helper inside the callback', () => {
    const f = fixture(); const hooks = new Map(); const routes = [];
    const authMiddleware = {};
    const sandbox = { __hooks: '/hooks', $apis: { requireAuth: () => authMiddleware },
        require: (name) => f.load(`apps/pocketbase/pb_hooks/${name.split('/').at(-1)}`),
        routerAdd: (...args) => routes.push(args) };
    for (const kind of ['Create', 'Update', 'Delete']) sandbox[`onRecord${kind}Request`] = (callback, name) => {
        assert.equal(name, 'workflows'); hooks.set(kind, callback);
    };
    vm.runInNewContext(source(hooksPath), sandbox, { filename: new URL(hooksPath, root).href });
    assert.equal(routes.length, 2);
    for (const [method, , , middleware] of routes) { assert.equal(method, 'POST'); assert.equal(middleware, authMiddleware); }
    const e = f.event(startBody()); e.json = (status, data) => ({ status, ...plain(data) });
    const created = routes[0][2](e); assert.equal(created.status, 201);
    assert.equal(routes[0][2](e).status, 200);
    const next = f.event(actionBody(), created.record.id); next.json = e.json;
    assert.equal(routes[1][2](next).record.status, 'completed');
    assert.equal(hooks.get('Create')(f.definition({ status: 'draft' }, true).e), 'delegated');
    assert.equal(hooks.get('Update')(f.definition().e), 'delegated');
    rejected(() => hooks.get('Delete')(f.definition().e), 400);
});
