// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/post-competition-privacy.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/public-api.js, apps/edge/src/index.js, apps/edge/src/graph.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/public-api.js; VALIDATES apps/edge/src/index.js; VALIDATES apps/edge/src/graph.js
// Intent:      Reject public operational reads even when historical files or permissive data rules remain present.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { fixture, plain, source } from './admin-fixture.mjs';
import { mediaFixture } from './classroom-media-fixture.mjs';
import worker from '../../apps/edge/src/index.js';
import { entitled, handleGraphMatch } from '../../apps/edge/src/graph.js';

function publicFixture(query = {}) {
    const calls = [];
    const f = fixture({ runtime: { $os: { getenv: () => '' }, $app: { store: () => ({ get: () => null, set() {} }) },
        $http: { send: (request) => { calls.push(request.url); return { statusCode: 200,
            headers: { 'Content-Type': ['application/json'] }, body: JSON.stringify({ state: 'PRIVATE-SENTINEL',
                platforms: [{ label: 'PRIVATE-SENTINEL', state: 'healthy' }], milestones: [{ title: 'PRIVATE-SENTINEL' }] }) }; } },
        toString: String } });
    let dataReads = 0;
    const app = { ...f.app, logger: () => ({ error() {} }),
        findCollectionByNameOrId: (name) => ({ name, listRule: '', viewRule: '' }),
        countRecords: () => { dataReads++; return 1; },
        findRecordsByFilter: () => { dataReads++; return [{ getString: () => 'PRIVATE-SENTINEL', get: () => 1, getBool: () => true }]; } };
    const e = { app, response: { header: () => ({ set() {} }) }, json: (status, body) => ({ status, body: plain(body) }),
        request: { url: { path: '/api/v1/public', query: () => ({ get: (name) => query[name] || '' }) } }, written: () => false };
    return { api: f.load('public-api.js'), e, calls, reads: () => dataReads };
}

test('public product tools never fetch operational files, including explicitly requested sections', () => {
    for (const section of ['capabilities', 'roadmap', 'platform_health']) {
        const f = publicFixture({ section });
        const result = f.api.productContext(f.e);
        assert.equal(result.status, 200);
        assert.equal(f.calls.length, 0, section);
        assert.ok(!JSON.stringify(result).includes('PRIVATE-SENTINEL'));
        if (section !== 'capabilities') assert.equal(result.body.sections[section].state, 'PRIVATE');
    }
});

test('public evidence never enumerates global records even with legacy anonymous collection rules', () => {
    for (const query of [{}, { evidence_type: 'claim' }, { evidence_type: 'epoch' }, { evidence_id: 'CLM-PRIVATE-001' }]) {
        const f = publicFixture(query), result = f.api.evidence(f.e);
        assert.equal(f.reads(), 0);
        assert.ok(!JSON.stringify(result).includes('PRIVATE-SENTINEL'));
        if (query.evidence_id) assert.equal(result.status, 404);
        if (!Object.keys(query).length) assert.deepEqual(result.body.types.map((item) => item.type), ['reference', 'digest']);
    }
});

test('retired feeds are refused before any origin request, including encoded and compressed aliases', async () => {
    const previous = globalThis.fetch;
    let reads = 0;
    globalThis.fetch = async () => { reads++; return new Response('PRIVATE-SENTINEL', { headers: { 'Content-Type': 'application/json' } }); };
    try {
        for (const path of ['/platform-health.json', '/fleet-status.json?fresh=1', '/roadmap-status.json', '/capabilities.json',
            '/activity-status.json', '/%66leet-status.json', '/fleet-status.json.br', '//platform-health.json', '/platform-health.json/']) {
            const result = await worker.fetch(new Request(`https://buildanddo.com${path}`));
            assert.equal(result.status, 404, path);
            assert.equal(result.headers.get('Cache-Control'), 'no-store');
            assert.ok(!(await result.text()).includes('PRIVATE-SENTINEL'));
        }
        assert.equal(reads, 0);
        assert.equal((await worker.fetch(new Request('https://buildanddo.com/community-status.json'))).status, 200);
        assert.equal(reads, 1);
    } finally { globalThis.fetch = previous; }
});

test('Buddi microphone is allowed only for self by default and an explicit origin policy is retained', async () => {
    const previous = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
        const result = await worker.fetch(new Request('https://buildanddo.com/'));
        assert.equal(result.headers.get('Permissions-Policy'), 'camera=(), microphone=(self), geolocation=()');
        globalThis.fetch = async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html', 'Permissions-Policy': 'microphone=()' } });
        assert.equal((await worker.fetch(new Request('https://buildanddo.com/'))).headers.get('Permissions-Policy'), 'microphone=()');
    } finally { globalThis.fetch = previous; }
});

const secret = 'synthetic-graph-test-binding';
function graphRequest(patterns, authenticated = false, claims = {}) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: 'buildanddo', sub: 'test', exp: Math.floor(Date.now() / 1000) + 60,
        authority: 'A0', trust_points: 0, platforms: ['buildanddo'], ...claims })).toString('base64url');
    const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return new Request('https://buildanddo.com/api/graph/match', { method: 'POST', body: JSON.stringify({ patterns }),
        headers: authenticated ? { Authorization: `Bearer ${header}.${payload}.${signature}` } : {} });
}
test('anonymous graph requests are refused before reading projection metadata', async () => {
    let reads = 0;
    const result = await handleGraphMatch(graphRequest([{ s: '?s', g: 'public-legacy' }]), {
        CSEG_PRINCIPAL_SECRET: secret, CNI_GRAPH: { prepare: () => { reads++; throw new Error('private metadata read'); } },
    });
    assert.equal(result.status, 403); assert.equal(reads, 0);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
});
test('one entitled graph cannot authorize a second unqualified or variable graph pattern', async () => {
    for (const pattern of [{ s: '?s' }, { s: '?s', g: '?graph' }, null]) {
        let reads = 0;
        const result = await handleGraphMatch(graphRequest([{ s: '?s', g: 'allowed' }, pattern], true), {
            CSEG_PRINCIPAL_SECRET: secret, CNI_GRAPH: { prepare: () => { reads++; throw new Error('query escaped its graph'); } },
        });
        assert.equal(result.status, 400); assert.equal(reads, 0);
    }
});

test('historical public_read cannot bypass a projection entitlement after authentication', () => {
    const meta = { public_read: 1, required_authority: 'A2', required_tp: 70, allowed_platforms: '["operator"]', allowed_roles: '[]' };
    assert.equal(entitled(meta, null).ok, false);
    const principal = { authority: 'A0', trust_points: 90, platforms: ['buildanddo'], roles: [], regions: [] };
    assert.deepEqual(entitled(meta, principal).reasons, ['authority<A2', 'platform_not_entitled']);
    assert.equal(entitled(meta, { ...principal, authority: 'A2', platforms: ['operator'] }).ok, true);
});

test('a signed entitled reader still executes a bounded graph query against real SQLite', async () => {
    const db = new DatabaseSync(':memory:');
    try {
        db.exec(`CREATE TABLE terms (term_id TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE quads (s TEXT, p TEXT, o TEXT, g TEXT, expires_at REAL);
            CREATE TABLE graph_projection (graph_term TEXT, required_tp INTEGER, required_authority TEXT,
                allowed_platforms TEXT, allowed_roles TEXT, region TEXT, public_read INTEGER);
            INSERT INTO terms VALUES ('g','allowed'), ('h','restricted'), ('s','fixture-subject'),
                ('p','label'), ('o','readable fixture'), ('x','PRIVATE-SENTINEL');
            INSERT INTO quads VALUES ('s','p','o','g',NULL), ('s','p','x','h',NULL);
            INSERT INTO graph_projection VALUES ('g',0,'A0','["buildanddo"]','[]',NULL,1),
                ('h',70,'A2','["operator"]','[]',NULL,1);`);
        const env = { CSEG_PRINCIPAL_SECRET: secret, CNI_GRAPH: { prepare(sql) {
            const statement = db.prepare(sql.replace(/\?\d+/g, '?'));
            let values = [];
            return { bind(...args) { values = args; return this; },
                first() { return statement.get(...values) || null; },
                all() { return { results: statement.all(...values) }; } };
        } } };
        const result = await handleGraphMatch(graphRequest([{ s: '?subject', p: 'label', o: '?label', g: 'allowed' }], true), env);
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { state: 'PASS', rows: [{ subject: 'fixture-subject', label: 'readable fixture' }] });
        assert.equal(result.headers.get('Cache-Control'), 'no-store');
        assert.equal(result.headers.get('Vary'), 'Authorization');
        const denied = await handleGraphMatch(graphRequest([{ s: '?s', g: 'allowed' }, { s: '?s', g: 'restricted' }], true), env);
        assert.equal(denied.status, 403);
        assert.ok(!(await denied.text()).includes('PRIVATE-SENTINEL'));
    } finally { db.close(); }
});

test('signed malformed expiry, trust and token shape never reach projection storage', async () => {
    let reads = 0;
    const env = { CSEG_PRINCIPAL_SECRET: secret, CNI_GRAPH: { prepare() { reads++; throw new Error('Unauthorized storage read.'); } } };
    for (const claims of [{ exp: '9999999999' }, { trust_points: '9999' }, { trust_points: -1 }]) {
        assert.equal((await handleGraphMatch(graphRequest([{ g: 'allowed' }], true, claims), env)).status, 403);
    }
    const malformed = graphRequest([{ g: 'allowed' }], true);
    malformed.headers.set('Authorization', malformed.headers.get('Authorization') + '.extra');
    assert.equal((await handleGraphMatch(malformed, env)).status, 403);
    assert.equal(reads, 0);
});

test('OCN health hides the sidecar and registry from non-master callers before probing', () => {
    const f = fixture(), routes = new Map(); let probes = 0;
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/ocn-login.pb.js'), {
        __hooks: '/hooks', require: (name) => f.load(name.split('/').at(-1)),
        routerAdd: (method, path, callback) => routes.set(`${method} ${path}`, callback),
        $os: { getenv: () => '' }, $http: { send: () => { probes++; return { statusCode: 200, json: { verifier: { state: 'ready', registry: { seats: 3 } } } }; } },
    });
    const handler = routes.get('GET /api/ocn/health');
    for (const actor of [null, 'owner']) {
        const e = f.event(actor); e.response = { header: () => ({ set() {} }) }; e.json = (status, body) => ({ status, body });
        assert.deepEqual(plain(handler(e)), { status: 404, body: { error: 'not found' } });
    }
    assert.equal(probes, 0);
    const user = f.app.findRecordById('users', 'owner'); user.set('cnwb_seat_level', 'master'); f.app.save(user);
    const e = f.event(); const headers = new Map(); e.response = { header: () => ({ set: (key, value) => headers.set(key, value) }) };
    e.json = (status, body) => ({ status, body });
    assert.equal(handler(e).body.registry_seats, 3); assert.equal(probes, 1);
    assert.equal(headers.get('Cache-Control'), 'no-store');
});

test('classroom users receive availability without configuration inventory or publisher counts', () => {
    const f = mediaFixture();
    for (const route of ['/api/classroom/health', '/api/classroom/presence/health']) {
        assert.equal(f.request('GET', route, { actor: null }).status, 401);
        assert.deepEqual(f.request('GET', route).body, { ok: true, reason: null });
    }
    delete f.env.CLOUDFLARE_REALTIME_APP_SECRET;
    assert.deepEqual(f.request('GET', '/api/classroom/health').body, { ok: false, reason: 'Classroom media is unavailable.' });
    assert.equal(f.requests.length, 0);
});
