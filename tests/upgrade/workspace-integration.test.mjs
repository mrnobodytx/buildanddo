// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/workspace-integration.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/evidence-policy.js, apps/pocketbase/pb_hooks/evidence.pb.js, apps/pocketbase/pb_migrations/1789800000_restore_workspace_evidence_access.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/evidence-policy.js; VALIDATES apps/pocketbase/pb_hooks/evidence.pb.js; VALIDATES apps/pocketbase/pb_migrations/1789800000_restore_workspace_evidence_access.js
// DAG Node:    none
// Intent:      Exercise actual evidence authority and migration retention with workspace, account, custom-rule and missing-source failures.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const accessPath = 'apps/pocketbase/pb_hooks/workflow-policy.js';
const policyPath = 'apps/pocketbase/pb_hooks/evidence-policy.js';
const hooksPath = 'apps/pocketbase/pb_hooks/evidence.pb.js';
const migrationPath = 'apps/pocketbase/pb_migrations/1789800000_restore_workspace_evidence_access.js';
const source = (name) => readFileSync(new URL(name, root), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
class BadRequestError extends ApiError { constructor(message) { super(400, message); } }
class ForbiddenError extends ApiError { constructor(message) { super(403, message); } }
class NotFoundError extends ApiError { constructor(message) { super(404, message); } }
const missing = () => new Error('sql: no rows in result set');

function record(name, data) {
    const before = { ...data };
    return {
        id: data.id,
        data: { ...data },
        collection: () => ({ name, viewRule: `${name}-read` }),
        getString(field) { return String(this.data[field] ?? ''); },
        original: () => record(name, before),
    };
}

function policyFixture() {
    const records = {
        workspaces: [record('workspaces', { id: 'ws1', owner: 'owner1' }), record('workspaces', { id: 'ws2', owner: 'owner2' })],
        missions: [record('missions', { id: 'mission1', workspace: 'ws1', owner: 'owner1' }),
            record('missions', { id: 'mission2', workspace: 'ws2', owner: 'owner2' })],
        workspace_members: [record('workspace_members', { id: 'member1', workspace: 'ws1', user: 'editor1', role: 'editor' })],
    };
    const denied = new Set();
    const config = { unfilteredMember: false };
    const app = {
        findRecordById(name, id) {
            const found = records[name]?.find((value) => value.id === id);
            if (!found) throw missing();
            return found;
        },
        findRecordsByFilter(name, filter, sort, limit, offset, params) {
            if (name === 'business_jobs') throw missing(); // This legacy fixture predates execution storage.
            assert.equal(name, 'workspace_members');
            assert.equal(filter, 'workspace = {:workspace} && user = {:user}');
            assert.equal(limit, 1); assert.equal(offset, 0);
            return config.unfilteredMember ? records.workspace_members : records.workspace_members.filter((member) =>
                member.getString('workspace') === params.workspace && member.getString('user') === params.user).slice(0, limit);
        },
        canAccessRecord(value, info, rule) {
            assert.equal(rule, value.collection().viewRule);
            assert.ok(info.auth.id);
            return !denied.has(value.id);
        },
    };
    const globals = { ApiError, BadRequestError, ForbiddenError, NotFoundError, __hooks: '/hooks' };
    const load = (name, extra = {}) => {
        const module = { exports: {} };
        vm.runInNewContext(source(name), { ...globals, ...extra, module }, { filename: fileURLToPath(new URL(name, root)) });
        return module.exports;
    };
    const access = load(accessPath);
    const policy = load(policyPath, { require: (name) => { assert.equal(name, '/hooks/workflow-policy.js'); return access; } });
    const event = (changes = {}) => {
        const value = record('evidence', { id: 'evidence1', owner: 'editor1', workspace: 'ws1', mission: 'mission1', ...changes });
        const e = { app, record: value, auth: record('users', { id: 'editor1' }), proceeded: 0,
            requestInfo() { return { auth: this.auth }; }, next() { this.proceeded += 1; return 'saved'; } };
        return e;
    };
    return { policy, event, records, denied, config };
}

test('a current editor can attach authored evidence to a readable teammate mission', () => {
    const f = policyFixture();
    const e = f.event();
    assert.equal(f.policy.enforce(e, true), 'saved');
    assert.equal(e.proceeded, 1);
    assert.equal(e.record.getString('owner'), 'editor1');
    assert.equal(e.record.getString('mission'), 'mission1');
    assert.equal(f.policy.enforce(f.event({ mission: '' }), true), 'saved', 'unattached evidence remains supported');
});

test('evidence stays with its author and original workspace on update', () => {
    const f = policyFixture();
    const owned = f.event();
    assert.equal(f.policy.enforce(owned, false), 'saved');
    const reassigned = f.event({ owner: 'someone-else' });
    reassigned.record.data.owner = 'editor1';
    assert.throws(() => f.policy.enforce(reassigned, false), /cannot be reassigned/);
    const moved = f.event({ workspace: 'ws2' });
    moved.record.data.workspace = 'ws1';
    assert.throws(() => f.policy.enforce(moved, false), /cannot be reassigned/);
    assert.throws(() => f.policy.enforce(f.event({ owner: 'owner1' }), false), /evidence author/);
});

test('foreign, missing or unreadable missions cannot receive an evidence link', () => {
    const f = policyFixture();
    assert.throws(() => f.policy.enforce(f.event({ mission: 'mission2' }), true), /this evidence workspace/);
    assert.throws(() => f.policy.enforce(f.event({ mission: 'missing' }), true), (error) => error.status === 404);
    f.denied.add('mission1');
    assert.throws(() => f.policy.enforce(f.event(), true), /not readable/);
});

test('viewers, removed members and other-workspace membership cannot write or delete evidence', () => {
    const f = policyFixture();
    for (const operation of [(e) => f.policy.enforce(e, true), (e) => f.policy.enforce(e, false), (e) => f.policy.remove(e)]) {
        f.records.workspace_members[0].data.role = 'viewer';
        assert.throws(() => operation(f.event()), (error) => error.status === 403);
        f.records.workspace_members[0].data.role = 'editor';
        f.records.workspace_members[0].data.workspace = 'ws2';
        assert.throws(() => operation(f.event()), (error) => error.status === 403);
        f.config.unfilteredMember = true;
        assert.throws(() => operation(f.event()), (error) => error.status === 403, 'the helper must bind the same membership row');
        f.config.unfilteredMember = false;
        f.records.workspace_members[0].data.workspace = 'ws1';
    }
    f.records.workspace_members.length = 0;
    assert.throws(() => f.policy.enforce(f.event(), true), /membership/);
});

test('the workspace owner retains authored evidence writes without a membership row', () => {
    const f = policyFixture();
    const e = f.event({ owner: 'owner1' }); e.auth = record('users', { id: 'owner1' });
    assert.equal(f.policy.enforce(e, true), 'saved');
    assert.equal(f.policy.remove(e), 'saved');
    const anonymous = f.event(); anonymous.auth = null;
    assert.throws(() => f.policy.enforce(anonymous, true), /Sign in/);
    const service = f.event(); service.auth = record('other_accounts', { id: 'editor1' });
    assert.throws(() => f.policy.enforce(service, true), /Sign in/);
});

test('native request hooks enforce create, update and delete through the evidence policy', () => {
    const callbacks = {}; const calls = [];
    const globals = { __hooks: '/hooks',
        require(name) { assert.equal(name, '/hooks/evidence-policy.js'); return {
            enforce: (...args) => calls.push(['enforce', ...args]), remove: (...args) => calls.push(['remove', ...args]) }; },
    };
    for (const name of ['Create', 'Update', 'Delete']) globals[`onRecord${name}Request`] = (callback, collection) => {
        assert.equal(collection, 'evidence'); callbacks[name] = callback;
    };
    vm.runInNewContext(source(hooksPath), globals, { filename: fileURLToPath(new URL(hooksPath, root)) });
    for (const name of ['Create', 'Update', 'Delete']) callbacks[name]('request');
    assert.deepEqual(calls, [['enforce', 'request', true], ['enforce', 'request', false], ['remove', 'request']]);
});

const ownerRead = "@request.auth.id != '' && @request.auth.id = owner";
function migrationFixture() {
    const collections = Object.fromEntries(['workspaces', 'evidence'].map((name) => [name, {
        name, listRule: ownerRead, viewRule: ownerRead, createRule: 'existing-create',
        updateRule: 'existing-update', deleteRule: 'existing-delete', fields: ['unchanged-field'],
    }]));
    collections.workspace_members = { name: 'workspace_members', fields: { getByName: (name) => ['workspace', 'user'].includes(name) } };
    const writes = []; let up, down;
    const app = { findCollectionByNameOrId(name) { if (!collections[name]) throw missing(); return collections[name]; },
        save(value) { writes.push(value.name); } };
    vm.runInNewContext(source(migrationPath), { migrate: (yes, no) => { up = yes; down = no; } },
        { filename: fileURLToPath(new URL(migrationPath, root)) });
    return { collections, writes, up: () => up(app), down: () => down(app) };
}

test('the migration shares workspace and evidence reads without changing writes, fields or records; replay and down retain data', () => {
    const f = migrationFixture(); const before = plain(f.collections.evidence);
    f.up(); f.up();
    assert.deepEqual(f.writes, ['workspaces', 'evidence']);
    assert.match(f.collections.workspaces.listRule, /workspace_members_via_workspace\.user \?= @request\.auth\.id/);
    assert.match(f.collections.evidence.listRule, /workspace\.workspace_members_via_workspace\.user \?= @request\.auth\.id/);
    for (const name of ['workspaces', 'evidence']) {
        const value = f.collections[name];
        assert.equal(value.listRule, value.viewRule);
        assert.ok(value.listRule.startsWith("@request.auth.id != '' &&"));
        assert.equal(value.createRule, before.createRule);
        assert.equal(value.updateRule, before.updateRule);
        assert.equal(value.deleteRule, before.deleteRule);
        assert.deepEqual(value.fields, before.fields);
    }
    f.down(); f.down();
    assert.deepEqual(f.collections.evidence, before);
    assert.deepEqual(f.writes, ['workspaces', 'evidence', 'workspaces', 'evidence']);
});

test('migration refuses custom read rules before changing any collection in either direction', () => {
    const f = migrationFixture(); f.collections.evidence.viewRule = 'private-custom-rule';
    assert.throws(f.up, /Review the custom evidence viewRule/);
    assert.deepEqual(f.writes, []);
    assert.equal(f.collections.workspaces.listRule, ownerRead);
    f.collections.evidence.viewRule = ownerRead; f.up(); f.writes.length = 0;
    f.collections.evidence.listRule = 'new-private-rule';
    assert.throws(f.down, /Review the custom evidence listRule/);
    assert.deepEqual(f.writes, []);
    assert.notEqual(f.collections.workspaces.listRule, ownerRead);
});

test('missing membership schema stops the read migration', () => {
    const f = migrationFixture(); f.collections.workspace_members.fields.getByName = () => null;
    assert.throws(f.up, /membership must be installed/);
    assert.deepEqual(f.writes, []);
    delete f.collections.workspace_members;
    assert.throws(f.up, /no rows/);
});
