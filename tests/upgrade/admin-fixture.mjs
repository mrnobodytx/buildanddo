// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/admin-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/workspace-access.js; VALIDATES apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// DAG Node:    none
// Intent:      Execute production commands and migration sources with transactional storage doubles while retaining the native-runtime verification boundary.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const root = new URL('../../', import.meta.url);
export const source = (path) => readFileSync(new URL(path, root), 'utf8');
export const plain = (value) => JSON.parse(JSON.stringify(value));
export const RBAC = 'apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js';
export const ADMIN_SCHEMA = 'apps/pocketbase/pb_migrations/1790000000_workspace_administration.js';
export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
class BadRequestError extends ApiError { constructor(message) { super(400, message); } }
class ForbiddenError extends ApiError { constructor(message) { super(403, message); } }
class NotFoundError extends ApiError { constructor(message) { super(404, message); } }
const missing = () => new Error('sql: no rows in result set');
class Fields extends Array {
    getByName(name) { return this.find((field) => field.name === name); }
    add(field) { this.push(plain(field)); }
    removeByName(name) { const i = this.findIndex((field) => field.name === name); if (i >= 0) this.splice(i, 1); }
}
class Collection {
    constructor(definition) {
        Object.assign(this, plain(definition)); this.id ||= this.name;
        this.fields = Fields.from(this.fields || []); this.indexes ||= [];
    }
}
class Field { constructor(definition) { Object.assign(this, plain(definition)); } }
class Record {
    constructor(collection, values = {}) { this._collection = collection; this.data = plain(values); this.id = values.id || ''; this.before = plain(values); }
    collection() { return this._collection; }
    get(name) { return this.data[name] ?? null; }
    getString(name) { const value = this.get(name); return value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); }
    getBool(name) { return this.get(name) === true; }
    set(name, value) { this.data[name] = plain(value); }
    original() { return new Record(this._collection, this.before); }
}

// Only models parameterized query predicates used by these commands. Native
// PocketBase relation/API rule evaluation is deliberately not emulated here.
function predicate(filter, values, params) {
    const tokens = filter.match(/\&\&|\|\||!=|=|\(|\)|\{:\w+\}|"[^"]*"|'[^']*'|[\w.]+/g) || [];
    let i = 0;
    const value = (token) => token.startsWith('{:') ? params[token.slice(2, -1)] :
        /^['"]/.test(token) ? token.slice(1, -1) : values[token] ?? '';
    const atom = () => {
        if (tokens[i] === '(') { i++; const result = or(); assert.equal(tokens[i++], ')'); return result; }
        const left = value(tokens[i++]); const op = tokens[i++]; const right = value(tokens[i++]);
        assert.ok(['=', '!='].includes(op), filter);
        return op === '=' ? left === right : left !== right;
    };
    const and = () => { let result = atom(); while (tokens[i] === '&&') { i++; const next = atom(); result = result && next; } return result; };
    const or = () => { let result = and(); while (tokens[i] === '||') { i++; const next = and(); result = result || next; } return result; };
    const result = or(); assert.equal(i, tokens.length, filter); return result;
}

export function fixture({ migrated = true } = {}) {
    let data = {}; const collections = {};
    let count = 0; const denied = new Set(); const config = { failAudit: false, foreignMember: false };
    const app = {
        findCollectionByNameOrId(name) { const found = collections[name] || Object.values(collections).find((c) => c.id === name); if (!found) throw missing(); return found; },
        findRecordById(name, id) {
            const row = data[name]?.find((record) => record.id === id); if (!row) throw missing();
            return new Record(this.findCollectionByNameOrId(name), row);
        },
        findRecordsByFilter(name, filter, sort = '', limit = 0, offset = 0, params = {}) {
            this.findCollectionByNameOrId(name);
            if (name === 'workspace_members' && config.foreignMember) return [this.findRecordById(name, 'foreign')];
            let rows = (data[name] || []).filter((row) => predicate(filter, row, params));
            const keys = sort.split(',').filter(Boolean);
            rows.sort((a, b) => { for (const key of keys) { const desc = key.startsWith('-'); const name = desc ? key.slice(1) : key;
                const cmp = String(a[name] || '').localeCompare(String(b[name] || '')); if (cmp) return desc ? -cmp : cmp; } return 0; });
            rows = rows.slice(offset, limit ? offset + limit : undefined);
            return rows.map((row) => new Record(collections[name], row));
        },
        canAccessRecord(record) { return !denied.has(record.id); },
        save(value) {
            if (value instanceof Collection) { collections[value.name] = value; data[value.name] ||= []; return; }
            const name = value.collection().name;
            if (name === 'workspace_admin_events' && config.failAudit) throw new Error('audit storage unavailable');
            value.id ||= 'record' + String(++count).padStart(9, '0');
            value.data.id = value.id; value.data.created ||= new Date().toISOString(); value.data.updated = new Date().toISOString();
            const rows = data[name]; const index = rows.findIndex((row) => row.id === value.id);
            if (index >= 0) rows[index] = plain(value.data); else rows.push(plain(value.data));
        },
        delete(value) {
            if (value instanceof Collection) { delete collections[value.name]; delete data[value.name]; return; }
            data[value.collection().name] = data[value.collection().name].filter((row) => row.id !== value.id);
        },
        runInTransaction(callback) {
            const before = plain(data); const beforeCollections = Object.fromEntries(Object.entries(collections).map(([name, c]) => [name, new Collection(c)]));
            try { callback(this); } catch (error) { data = before; for (const key of Object.keys(collections)) delete collections[key]; Object.assign(collections, beforeCollections); throw error; }
        },
    };
    const globals = { Collection, Field, Record, ApiError, BadRequestError, ForbiddenError, NotFoundError, __hooks: '/hooks' };
    const cache = {};
    const load = (name) => {
        if (cache[name]) return cache[name]; const module = { exports: {} };
        const path = `apps/pocketbase/pb_hooks/${name}`;
        vm.runInNewContext(source(path), { ...globals, module, require: (target) => load(target.replace('/hooks/', '')) }, { filename: fileURLToPath(new URL(path, root)) });
        cache[name] = module.exports; return module.exports;
    };
    const migration = (path) => {
        let up, down;
        vm.runInNewContext(source(path), { ...globals, migrate: (yes, no) => { up = yes; down = no; } }, { filename: fileURLToPath(new URL(path, root)) });
        return { up: () => app.runInTransaction(() => up(app)), down: () => app.runInTransaction(() => down(app)) };
    };
    app.save(new Collection({ name: 'users', id: '_pb_users_auth_', fields: [{ name: 'name', type: 'text' }] }));
    const prior = ['1788474000_create_workspace_collections', '1788477655_create_editorial_collections', '1788900000_create_workspace_members_rbac',
        '1788940000_create_community_contributor_collections', '1789000000_extend_workspace_operations', '1789500000_add_mission_learning',
        '1789600000_create_workflow_runs', '1789800000_restore_workspace_evidence_access'];
    prior.forEach((name) => migration(`apps/pocketbase/pb_migrations/${name}.js`).up());
    const seed = (name, values) => { const r = new Record(app.findCollectionByNameOrId(name), values); app.save(r); return r; };
    for (const user of ['owner', 'admin', 'editor', 'viewer', 'outsider', 'newuser', 'otherowner', 'legacyowner']) seed('users', { id: user });
    seed('workspaces', { id: 'ws1', owner: 'owner', name: 'Workspace one' });
    seed('workspaces', { id: 'ws2', owner: 'otherowner', name: 'Workspace two' });
    for (const role of ['admin', 'editor', 'viewer']) seed('workspace_members', { id: role + 'member', workspace: 'ws1', user: role, role });
    seed('workspace_members', { id: 'foreign', workspace: 'ws2', user: 'outsider', role: 'admin' });
    seed('workspace_members', { id: 'legacy', workspace: 'ws1', user: 'legacyowner', role: 'owner' });
    if (migrated) { migration(RBAC).up(); migration(ADMIN_SCHEMA).up(); }
    const event = (actor = 'owner', body = {}, { workspace = 'ws1', id = '', query = {} } = {}) => ({
        app, auth: actor ? app.findRecordById('users', actor) : null,
        request: { pathValue: (key) => key === 'workspace' ? workspace : id },
        requestInfo() { return { body: plain(body), query, auth: this.auth }; },
    });
    let requestCount = 0;
    const command = (action, payload, { actor = 'owner', revision, workspace = 'ws1', key } = {}) => {
        const current = data.workspace_controls?.find((row) => row.workspace === workspace)?.revision || 0;
        const body = { action, revision: revision ?? current, request_key: key || `test_request_${String(++requestCount).padStart(5, '0')}`, payload };
        const service = action.startsWith('wiki.') || action.startsWith('forum.') ? 'workspace-community.js' : 'workspace-administration.js';
        return plain(load(service).command(event(actor, body, { workspace })));
    };
    const enable = (values = {}) => command('settings.save', { name: 'Workspace one', description: 'Team workspace', wiki_enabled: true,
        forum_enabled: true, forum_moderation: true, ...values });
    return { app, collections, get data() { return data; }, config, denied, load, migration, seed, event, command, enable,
        record: (name, values) => new Record(app.findCollectionByNameOrId(name), values) };
}
