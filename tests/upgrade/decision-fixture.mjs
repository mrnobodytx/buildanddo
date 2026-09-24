// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/decision-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/decision-runtime.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/decision-runtime.js
// DAG Node:    none
// Intent:      Execute native application policy and real Python decisions with an explicit PocketBase storage double.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { repoPath, pythonBin } from './admin-fixture.mjs';

// BUILDANDDO_P0_PORTABLE_ROOT: a URL root does not survive Vite's transform when this fixture
// is pulled into a jsdom spec - readFileSync then throws "The URL must be of scheme file".
// repoPath resolves from cwd instead; see tests/upgrade/admin-fixture.mjs.
const clone = (value) => JSON.parse(JSON.stringify(value));
const record = (name, values = {}) => ({
    ...values,
    getString(field) { const value = this[field]; return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); },
    set(field, value) { this[field] = value; },
    collection() { return { name }; },
});

export function python(operation, payload) {
    const result = spawnSync(pythonBin(), ['-m', 'apps.decision.adapters.service'], {
        cwd: repoPath('.'), env: { ...process.env, PYTHONPATH: repoPath('.') }, input: JSON.stringify({ operation, payload }), encoding: 'utf8',
        timeout: 35000, maxBuffer: 13 * 1024 * 1024,
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

let planned;
export function layoutBlueprintResult() {
    if (planned) return clone(planned);
    const script = [
        'import asyncio,json,base64',
        'from unittest.mock import patch',
        'from apps.decision.adapters import service',
        'from tests.upgrade.blueprint_support import sample_blueprint,FIXTURE',
        'with patch.object(service, "extract_blueprint", return_value=sample_blueprint()):',
        '    result=asyncio.run(service.dispatch("blueprint", {"name":"sample.pdf","pdf_base64":base64.b64encode(FIXTURE.read_bytes()).decode(),"include_prompts":True}))',
        'print(json.dumps(result))',
    ].join('\n');
    const result = spawnSync(pythonBin(), ['-c', script], { cwd: repoPath('.'), env: { ...process.env, PYTHONPATH: repoPath('.') }, encoding: 'utf8', maxBuffer: 13 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    planned = JSON.parse(result.stdout);
    return clone(planned);
}

export function decisionFixture() {
    const routes = new Map(); const logs = []; const calls = []; const rows = [];
    let revoked = false; let failSave = false; let port = '8091'; let callPython = null;
    const members = ['member', 'viewer', 'editor'];
    const collection = { name: 'workspace_decisions', fields: { getByName: () => ({}) } };
    const app = {
        findCollectionByNameOrId(name) { assert.equal(name, 'workspace_decisions'); return collection; },
        findRecordById(name, id) {
            if (name === 'workspaces' && ['ws1', 'ws2'].includes(id)) return record(name, { id, owner: 'owner' });
            throw new Error('no rows in result set');
        },
        findRecordsByFilter(name, filter, sort, limit, offset, params) {
            if (name === 'workspace_members') return !revoked && members.includes(params.user) && params.workspace === 'ws1'
                ? [record(name, { ...params, role: params.user === 'viewer' ? 'viewer' : 'editor' })] : [];
            assert.equal(name, 'workspace_decisions');
            return rows.filter((row) => row.workspace === params.workspace && row.owner === params.owner
                && (params.key ? row.request_key === params.key : row.decision_id === params.id)).slice(0, limit);
        },
        save(row) { if (failSave) throw new Error('storage unavailable'); rows.push(row); },
        runInTransaction(operation) {
            const previous = rows.slice();
            try { operation(app); } catch (error) { rows.splice(0, rows.length, ...previous); throw error; }
        },
    };
    const modules = new Map();
    const context = {
        __hooks: '/hooks',
        console: { log: (value) => logs.push(value) },
        Date, JSON, Object, Number, String, Set, Array,
        $os: { getenv(name) {
            if (name === 'BUILDANDDO_TELEMETRY_TRANSPORT') return 'stdout';
            if (['DD_ENV', 'NODE_ENV'].includes(name)) return 'development';
            assert.equal(name, 'BUILDANDDO_DECISION_PORT'); return port;
        } },
        $security: { sha256: (value) => createHash('sha256').update(value).digest('hex'), randomString: (n) => 'r'.repeat(n) },
        Record: function (coll) { assert.equal(coll.name, 'workspace_decisions'); return record(coll.name); },
        $apis: { requireAuth(name) { assert.equal(name, 'users'); return 'native-auth'; }, bodyLimit: (size) => size },
        routerAdd(method, route, callback, auth, limit) { assert.equal(auth, 'native-auth'); routes.set(method + ' ' + route, { callback, limit }); },
        $http: { send(options) {
            calls.push(options);
            assert.match(options.url, /^http:\/\/127\.0\.0\.1:\d+\/(decide|blueprint)$/);
            assert.equal(options.method, 'POST'); assert.equal(options.timeout, 35);
            if (callPython) return callPython(options);
            const response = python(options.url.split('/').at(-1), JSON.parse(options.body));
            return { statusCode: response.failure ? 400 : 200, json: response };
        } },
    };
    for (const [name, code] of Object.entries({ BadRequestError: 400, ForbiddenError: 403, NotFoundError: 404 })) {
        context[name] = class extends Error { constructor(message) { super(message); this.status = code; } };
    }
    context.ApiError = class extends Error { constructor(status, message) { super(message); this.status = status; } };
    function load(name) {
        if (modules.has(name)) return modules.get(name);
        const module = { exports: {} };
        const source = readFileSync(repoPath('apps/pocketbase/pb_hooks/' + name), 'utf8');
        vm.runInNewContext(source, { ...context, module, require: (path) => load(path.split('/').at(-1)) }, { filename: name });
        modules.set(name, module.exports);
        return module.exports;
    }
    context.require = (path) => load(path.split('/').at(-1));
    vm.runInNewContext(readFileSync(repoPath('apps/pocketbase/pb_hooks/decision.pb.js'), 'utf8'), context);
    const headers = new Map();
    function request(body, { actor = 'member', workspace = 'ws1', operation = 'decide', decision = '' } = {}) {
        const method = operation === 'decisions' ? 'GET' : 'POST';
        const route = '/api/buildanddo/workspaces/{workspace}/' + operation + (operation === 'decisions' ? '/{decision}' : '');
        const event = {
            auth: actor ? record('users', { id: actor }) : null, app,
            request: { pathValue: (key) => ({ workspace, decision })[key] },
            requestInfo: () => ({ body }),
            response: { header: () => ({ set: (key, value) => headers.set(key, value) }) },
            json: (status, value) => ({ status, result: clone(value) }),
        };
        return routes.get(method + ' ' + route).callback(event);
    }
    return { request, rows, logs, calls, routes, headers, collection,
        revoke: () => { revoked = true; }, failSave: () => { failSave = true; },
        port: (value) => { port = value; }, transport: (callback) => { callPython = callback; } };
}
