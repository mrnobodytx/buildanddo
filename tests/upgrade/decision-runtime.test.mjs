// ─── CGRF Header ──────────────────────────────
// File:        tests/upgrade/decision-runtime.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-DECISION-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-DECISION-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/decision.pb.js, apps/pocketbase/pb_hooks/workflow-policy.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/decision.pb.js; DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js
// DAG Node:    none
// Intent:      Execute the actual PocketBase route source with JSVM doubles to prove auth, typing, authority and log boundaries.
// ───────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../apps/pocketbase/pb_hooks/decision.pb.js', import.meta.url), 'utf8');

function fixture() {
    let callback;
    let middleware;
    const logs = [];
    const calls = [];
    const policy = {
        authenticated(event) {
            calls.push('authenticated');
            if (!event.auth?.id) throw Object.assign(new Error('Sign in.'), { status: 403 });
        },
        role(app, auth, workspace) {
            calls.push(`role:${workspace}`);
            if (workspace !== 'ws1' || auth.id === 'outsider') throw Object.assign(new Error('Membership required.'), { status: 403 });
            return 'viewer';
        },
        fields(value, allowed) {
            return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key));
        },
        invalid(message) {
            throw Object.assign(new Error(message), { status: 400 });
        },
    };
    const context = {
        __hooks: '/hooks',
        require(path) {
            assert.equal(path, '/hooks/workflow-policy.js');
            return policy;
        },
        routerAdd(method, path, handler, gate) {
            assert.equal(method, 'POST');
            assert.equal(path, '/api/buildanddo/workspaces/{workspace}/decide');
            callback = handler;
            middleware = gate;
        },
        $apis: { requireAuth() { calls.push('requireAuth'); return 'native-auth'; } },
        $security: {
            randomString(length) { return 'r'.repeat(length); },
            sha256(value) { return createHash('sha256').update(value).digest('hex'); },
        },
        console: { log(value) { logs.push(value); } },
        Date,
        JSON,
        Object,
        Array,
        Set,
        Number,
        Math,
        Error,
    };
    vm.runInNewContext(source, context, { filename: 'decision.pb.js' });
    function request(body, options = {}) {
        const event = {
            auth: options.auth === false ? null : { id: options.actor || 'member' },
            app: {},
            request: { pathValue: () => options.workspace || 'ws1' },
            requestInfo: () => ({ body }),
            json: (status, result) => ({ status, result }),
        };
        return callback(event);
    }
    return { request, logs, calls, middleware };
}

test('route registers native auth and checks current workspace membership before deciding', () => {
    const f = fixture();
    assert.equal(f.middleware, 'native-auth');
    assert.throws(() => f.request({ state: {}, questions: { go: { type: 'noul' } } }, { auth: false }), { status: 403 });
    assert.throws(() => f.request({ state: {}, questions: { go: { type: 'noul' } } }, { actor: 'outsider' }), { status: 403 });
    assert.deepEqual(f.calls.slice(0, 3), ['requireAuth', 'authenticated', 'authenticated']);
});

test('deterministic workload answer is zero-cost typed and never verified', () => {
    const f = fixture();
    const response = f.request({
        state: { evidence_count: 3, contradicted: false, evidence_refs: ['ev-1'] },
        questions: { should_act: { type: 'noul' } },
        evidence: true,
        trace_id: 'trace-1',
    });
    assert.equal(response.status, 200);
    assert.equal(response.result.answers.should_act.value, true);
    assert.equal(response.result.answers.should_act.probability, 0.92);
    assert.equal(response.result.route, 'rules');
    assert.equal(response.result.cost_usd, 0);
    assert.equal(response.result.authority, 'A0');
    assert.equal(response.result.verified, false);
    assert.deepEqual(Array.from(response.result.evidence_refs), ['ev-1']);
    assert.match(response.result.state_hash, /^[0-9a-f]{64}$/);
});

test('low confidence abstains at A0 and reaches only the structured frontier stub at A1', () => {
    const f = fixture();
    const body = { state: { description: 'ambiguous' }, questions: { answer: { type: 'noul' } } };
    const a0 = f.request(body).result;
    assert.equal(a0.route, 'abstain');
    assert.equal(a0.answers.answer.value, null);
    assert.equal(a0.answers.answer.abstained, true);
    assert.equal(a0.authority, 'A0');
    assert.equal(a0.cost_usd, 0);
    const a1 = f.request({ ...body, authority: 'A1' }).result;
    assert.equal(a1.route, 'frontier');
    assert.equal(a1.answers.answer.value, false);
    assert.equal(a1.authority, 'A1');
    assert.equal(a1.cost_usd, 0.001);
    assert.equal(a1.verified, false);
});

test('structured route log omits raw state and keeps outcome fields unset', () => {
    const f = fixture();
    f.request({ state: { description: 'private-state-marker' }, questions: { answer: { type: 'noul' } } });
    assert.equal(f.logs.length, 1);
    assert.doesNotMatch(f.logs[0], /private-state-marker/);
    const row = JSON.parse(f.logs[0]);
    assert.equal(row.message, 'buildanddo.decision');
    assert.equal(row.data.outcome, null);
    assert.equal(row.data.verification, null);
    assert.equal(row.data.human_correction, null);
});

test('malformed question and state contracts are rejected', () => {
    const f = fixture();
    for (const body of [
        { state: {}, questions: {} },
        { state: [], questions: { go: { type: 'noul' } } },
        { state: {}, questions: { 'bad-name': { type: 'noul' } } },
        { state: {}, questions: { go: { type: 'unknown' } } },
        { state: {}, questions: { go: { type: 'choice', options: ['one'] } } },
        { state: {}, questions: { go: { type: 'score', min: 2, max: 1 } } },
        { state: {}, questions: { go: { type: 'rank', candidates: ['a'], top_k: 2 } } },
        { state: {}, questions: { go: { type: 'extract', schema: {} } } },
        { state: {}, questions: { go: { type: 'noul' } }, authority: 'A4' },
        { state: {}, questions: { go: { type: 'noul' } }, evidence: 'yes' },
    ]) assert.throws(() => f.request(body), { status: 400 });
});
