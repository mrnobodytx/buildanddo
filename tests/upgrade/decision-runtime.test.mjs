// ─── CGRF Header ──────────────────────────────
// File:        tests/upgrade/decision-runtime.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-DECISION-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-DECISION-001, VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/decision.pb.js, apps/pocketbase/pb_hooks/blueprint.pb.js, apps/pocketbase/pb_hooks/workflow-policy.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/decision.pb.js; VALIDATES apps/pocketbase/pb_hooks/blueprint.pb.js; DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js
// DAG Node:    none
// Intent:      Execute the actual PocketBase route source with JSVM doubles to prove auth, typing, authority and log boundaries.
// ───────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { decisionFixture, layoutBlueprintResult, python } from './decision-fixture.mjs';

const body = () => ({ state: { evidence_count: 3, contradicted: false, description: 'private-state-marker' },
    questions: { should_act: { type: 'noul' } }, trace_id: 'trace-1' });

test('saved uploads and immediate analysis register distinct authenticated routes together', () => {
    const routes = new Map();
    const context = {
        $apis: { requireAuth: (collection) => ({ collection }), bodyLimit: (limit) => ({ limit }) },
        routerAdd(method, path, handler, ...middleware) {
            const key = method + ' ' + path;
            assert.equal(routes.has(key), false, 'Duplicate route: ' + key);
            assert.equal(middleware[0].collection, 'users');
            routes.set(key, { handler, middleware });
        },
    };
    for (const file of ['blueprint.pb.js', 'decision.pb.js'])
        vm.runInNewContext(readFileSync(new URL('../../apps/pocketbase/pb_hooks/' + file, import.meta.url), 'utf8'), context);
    const prefix = 'POST /api/buildanddo/workspaces/{workspace}/blueprints';
    assert.ok(routes.has(prefix));
    assert.ok(routes.has(prefix + '/analyze'));
    assert.equal(routes.size, 7);
    assert.equal(routes.get(prefix).middleware[1].limit, 22020096);
    assert.equal(routes.get(prefix + '/analyze').middleware[1].limit, 29360128);
});

test('native account and current workspace membership precede local processing', () => {
    const f = decisionFixture();
    for (const options of [{ actor: null }, { actor: 'outsider' }, { workspace: 'ws2' }, { workspace: '../ws1' }])
        assert.throws(() => f.request(body(), options), (error) => [400, 403].includes(error.status));
    assert.equal(f.calls.length, 0); assert.equal(f.rows.length, 0);
    assert.equal(f.routes.size, 3);
});

test('route invokes real Python BDR and stores state, questions, scores and a stable decision receipt', () => {
    const f = decisionFixture(); const request = body();
    const response = f.request(request);
    assert.equal(response.status, 200); assert.equal(response.result.answers.should_act.value, true);
    assert.equal(response.result.answers.should_act.probability, 0.92);
    assert.equal(response.result.route, 'rules'); assert.equal(response.result.cost_usd, 0);
    assert.equal(response.result.authority, 'A0'); assert.equal(response.result.verified, false);
    assert.match(response.result.decision_id, /^decision-[a-f0-9]{64}$/);
    assert.equal(f.rows.length, 1); assert.equal(f.calls.length, 1);
    assert.deepEqual(f.rows[0].state, request.state); assert.deepEqual(f.rows[0].questions, request.questions);
    assert.equal(f.rows[0].confidence.should_act, 1); assert.equal(f.rows[0].route, 'rules');
    assert.equal(f.headers.get('Cache-Control'), 'no-store');
    const detail = f.request(null, { operation: 'decisions', decision: response.result.decision_id }).result;
    assert.equal(detail.decision_id, response.result.decision_id);
    assert.deepEqual(detail.state, request.state); assert.equal(detail.outcome, null);
    assert.equal(f.logs.length, 1); assert.doesNotMatch(f.logs[0], /private-state-marker|evidence_count/);
});

test('same trace retry reuses the persisted receipt and conflicting input is rejected', () => {
    const f = decisionFixture(); const first = f.request(body()).result;
    f.transport(() => { throw new Error('must not call processor on retry'); });
    assert.deepEqual(f.request(body()).result, first);
    assert.equal(f.rows.length, 1); assert.equal(f.calls.length, 1);
    assert.throws(() => f.request({ ...body(), state: { changed: true } }), { status: 409 });
});

test('decisions cannot be read across workspaces or by a different account', () => {
    const f = decisionFixture(); const result = f.request(body()).result;
    assert.throws(() => f.request(null, { operation: 'decisions', decision: result.decision_id, actor: 'viewer' }), { status: 404 });
    assert.throws(() => f.request(null, { operation: 'decisions', decision: result.decision_id, workspace: 'ws2' }), { status: 403 });
    assert.throws(() => f.request(null, { operation: 'decisions', decision: 'bad' }), { status: 400 });
});

test('membership is rechecked after Python returns and failed storage does not report success', () => {
    const f = decisionFixture();
    f.transport((options) => {
        const result = python('decide', JSON.parse(options.body)); f.revoke();
        return { statusCode: 200, json: result };
    });
    assert.throws(() => f.request(body()), { status: 403 }); assert.equal(f.rows.length, 0);
    const failed = decisionFixture(); failed.failSave();
    assert.throws(() => failed.request(body()), /storage unavailable/);
    assert.equal(failed.rows.length, 0); assert.equal(failed.logs.length, 0);
});

test('Python routing respects caller authority and never mints verification', () => {
    const f = decisionFixture();
    const request = { state: {}, questions: { answer: { type: 'noul' } }, trace_id: 'a0' };
    const a0 = f.request(request).result;
    assert.equal(a0.answers.answer.abstained, true); assert.equal(a0.authority, 'A0'); assert.equal(a0.cost_usd, 0);
    const a1 = f.request({ ...request, trace_id: 'a1', authority: 'A1' }).result;
    assert.equal(a1.authority, 'A1'); assert.equal(a1.route, 'frontier'); assert.equal(a1.verified, false);
});

test('invalid input fails at the application or Python boundary without a receipt', () => {
    for (const request of [
        { state: {}, questions: {} }, { state: [], questions: { answer: { type: 'noul' } } },
        { state: {}, questions: { answer: { type: 'bad' } } },
        { ...body(), authority: 'A4' }, { ...body(), evidence: 'yes' }, { ...body(), trace_id: 'bad trace' },
        { ...body(), endpoint: 'https://untrusted.invalid' }, { ...body(), state: { huge: 'a'.repeat(200000) } },
    ]) {
        const f = decisionFixture();
        assert.throws(() => f.request(request), { status: 400 }); assert.equal(f.rows.length, 0);
    }
});

test('processor errors, unsafe local ports and missing migration fail closed', () => {
    for (const status of [400, 403, 500]) {
        const f = decisionFixture(); f.transport(() => ({ statusCode: status, json: { failure: 'invalid_data' } }));
        assert.throws(() => f.request(body()), { status: status === 500 ? 503 : status });
    }
    const f = decisionFixture(); f.port('8091/../../remote');
    assert.throws(() => f.request(body()), { status: 503 }); assert.equal(f.calls.length, 0);
    const uninstalled = decisionFixture(); uninstalled.collection.fields.getByName = () => null;
    assert.throws(() => uninstalled.request(body()), { status: 503 }); assert.equal(uninstalled.calls.length, 0);
    const unavailable = decisionFixture(); unavailable.transport(() => { throw new Error('private-secret'); });
    assert.throws(() => unavailable.request(body()), (error) => error.status === 503 && !error.message.includes('private-secret'));
});

test('forged verification, authority, trace and confidence from a processor are rejected', () => {
    const valid = python('decide', body());
    for (const change of [
        (r) => { r.verified = true; }, (r) => { r.authority = 'A3'; },
        (r) => { r.answers.should_act.confidence = 2; }, (r) => { r.trace_id = 'foreign'; },
        (r) => { r.answers.should_act.probability = -1; },
        (r) => { r.answers.should_act.probabilities = { yes: 2 }; },
        (r) => { r.answers.should_act = null; }, (r) => { r.cost_usd = -1; },
    ]) {
        const f = decisionFixture(); const result = structuredClone(valid); change(result);
        f.transport(() => ({ statusCode: 200, json: result }));
        assert.throws(() => f.request(body()), { status: 502 }); assert.equal(f.rows.length, 0);
    }
});

test('layout-double blueprint results persist real BDR evaluations and preserve prompt provenance', () => {
    const f = decisionFixture(); const response = layoutBlueprintResult();
    f.transport(() => ({ statusCode: 200, json: structuredClone(response) }));
    const payload = { name: 'sample.pdf', pdf_base64: 'JVBERi0xLjQ=', include_prompts: true };
    const first = f.request(payload, { operation: 'blueprints/analyze' }).result;
    assert.equal(first.workspace, 'ws1'); assert.equal(first.session_prompts.length, 3); assert.equal(f.rows.length, 3);
    f.request(payload, { operation: 'blueprints/analyze' }); assert.equal(f.rows.length, 3);
    for (const prompt of first.session_prompts) for (const provenance of prompt.provenance) {
        assert.ok(f.rows.some((row) => row.decision_id === provenance.evaluation_id));
        const detail = f.request(null, { operation: 'decisions', decision: provenance.evaluation_id }).result;
        assert.equal(detail.state.requirement.id, provenance.requirement_id);
    }
});

test('blueprint input, result authority and per-requirement confidence are fenced', () => {
    const f = decisionFixture();
    for (const payload of [{ name: 'x.txt', pdf_base64: 'data' }, { name: 'x.pdf', pdf_base64: 'data', authority: 'A3' },
        { name: 'x.pdf', pdf_base64: 'data', include_prompts: 'yes' }])
        assert.throws(() => f.request(payload, { operation: 'blueprints/analyze' }), { status: 400 });
    for (const change of [
        (r) => { r.verified = true; }, (r) => { r.session_prompts[0].authority = 'A3'; },
        (r) => { r.evaluations[0].source.input_sha256 = 'foreign'; },
        (r) => { r.evaluations[0].decision.answers.clarity.confidence = 10; },
    ]) {
        const response = layoutBlueprintResult(); change(response);
        f.transport(() => ({ statusCode: 200, json: response }));
        assert.throws(() => f.request({ name: 'x.pdf', pdf_base64: 'data' }, { operation: 'blueprints/analyze' }), { status: 502 });
    }
    assert.equal(f.rows.length, 0);
});

function migrationFixture() {
    let up; let down; let saved = null;
    class Fields {
        constructor(values) { this.values = structuredClone(values); }
        getByName(name) { return this.values.find((v) => v.name === name); }
        removeByName(name) { this.values = this.values.filter((v) => v.name !== name); }
        add(value) { this.values.push(value); }
    }
    class Collection { constructor(value) { Object.assign(this, value); this.fields = new Fields(value.fields); } }
    const app = {
        findCollectionByNameOrId(name) {
            if (['users', 'workspaces'].includes(name)) return { id: name };
            if (saved) return saved; throw new Error('no rows in result set');
        },
        save(value) { saved = value; },
    };
    vm.runInNewContext(readFileSync(new URL('../../apps/pocketbase/pb_migrations/1790500000_workspace_decisions.js', import.meta.url), 'utf8'),
        { migrate(a, b) { up = a; down = b; }, Collection, Field: function (v) { return v; } });
    return { app, up: () => up(app), down: () => down(app), saved: () => saved };
}

test('decision migration is locked and idempotent; rollback retains receipts and disables commands', () => {
    const f = migrationFixture(); f.down(); f.up(); const collection = f.saved(); f.up();
    assert.equal(f.saved(), collection);
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(collection[key], null);
    assert.equal(collection.indexes.length, 2);
    assert.ok(collection.fields.getByName('state')); assert.ok(collection.fields.getByName('outcome'));
    f.down(); f.down(); assert.equal(f.saved(), collection); assert.equal(collection.fields.getByName('protocol_version'), undefined);
    f.up(); assert.ok(collection.fields.getByName('protocol_version'));
});

test('migration never overwrites custom rules, schema or indexes', () => {
    for (const change of [
        (c) => { c.listRule = ''; }, (c) => { c.fields.getByName('state').maxSize = 1; }, (c) => { c.indexes = []; },
    ]) {
        const f = migrationFixture(); f.up(); change(f.saved()); assert.throws(() => f.up(), /Review/);
    }
    const f = migrationFixture(); f.up(); f.saved().updateRule = ''; assert.throws(() => f.down(), /Review/);
});
