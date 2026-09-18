// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/operator-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/operatorPlane.js, tests/upgrade/operator-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/operatorPlane.js; CONSUMES tests/upgrade/operator-fixture.mjs
// DAG Node:    none
// Intent:      Verify compiler/browser interoperability, inert imported content, truthful freshness and scoped durable review requests through real handlers.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createOperatorClient, importOperatorBlueprint, projectOperator, OPERATOR_MAX_BYTES } from '../../apps/web/src/lib/operatorPlane.js';
import { canonicalPolicy } from '../../apps/web/src/lib/policyIntelligence.js';
import { plain } from './admin-fixture.mjs';
import { operatorFixture, operatorPlan, sealOperator } from './operator-fixture.mjs';

const compiled = operatorPlan();
const parse = (plan = compiled, crypto = webcrypto) => importOperatorBlueprint(canonicalPolicy(plan), crypto);
async function accepted(plan = compiled) {
    const result = await parse(plan); assert.equal(result.ok, true, result.error); return result.blueprint;
}
function connected({ demo = false, actor = 'editor', crypto = webcrypto } = {}) {
    const f = operatorFixture(); const sent = []; let current = true;
    const client = { authStore: { record: { id: actor } }, async send(path, options) {
        sent.push({ path, options });
        const event = f.event(client.authStore.record.id, options.body || {}, { workspace: path.split('/')[4], query: options.query || {} });
        return plain(path.endsWith('/operator') ? f.operator.snapshot(event) : f.service.command(event));
    } };
    const make = () => createOperatorClient({ client, accountId: actor, workspaceId: 'ws1', demo, isCurrent: () => current, crypto });
    return { f, client, sent, api: make(), make, setCurrent: (value) => { current = value; } };
}

test('snapshot client reads one scoped no-store page without a mutation', async () => {
    const c = connected(); const result = await c.api.read();
    assert.equal(result.ok, true); assert.equal(c.sent.length, 1);
    assert.equal(c.sent[0].options.method, 'GET'); assert.equal(c.sent[0].options.cache, 'no-store');
    assert.equal(c.sent[0].options.requestKey, null); assert.equal(c.sent[0].options.query.page, 1);
    assert.ok(Object.isFrozen(result.data.sources.missions.items));
    assert.equal((await c.api.read(0)).reason, 'invalid');
    assert.equal((await c.api.read(10000)).reason, 'invalid');
});

test('the projection separates actual approvals from ordinary research and missing plan work', () => {
    const snapshot = operatorFixture().read(); const view = projectOperator(snapshot);
    assert.deepEqual(view.human_decisions.map((row) => row.id).sort(), ['mission:planned', 'workflow:approval']);
    assert.deepEqual(view.work_queue.map((row) => row.id).sort(), ['mission:draft', 'signal:signal1']);
    assert.equal(view.active_missions.length, 3);
    assert.ok(view.systems.every((row) => !['healthy', 'disabled'].includes(row.status)));
    assert.equal(view.systems.find((row) => row.id === 'nxc').status, 'not_connected');
    assert.equal(view.workers[0].status, 'progress');
    assert.ok(!JSON.stringify(view).includes('idle')); assert.equal(view.readiness, undefined);
});

test('provider receipts expire independently of refreshes, configuration and future timestamps', () => {
    const snapshot = operatorFixture().read(); const now = Date.parse(snapshot.observed_at);
    const row = snapshot.sources.integrations.items.find((item) => item.provider === 'datadog');
    row.observation = { state: 'healthy', at: new Date(now - 1000).toISOString(), current: true, receipt_ref: 'test-receipt', check_pending: false };
    const state = (at = now) => projectOperator(snapshot, at).systems.find((item) => item.id === 'datadog').status;
    assert.equal(state(), 'healthy'); assert.equal(state(now + 16 * 60 * 1000), 'stale');
    row.observation.current = false; assert.equal(state(), 'stale');
    row.observation.current = true; row.observation.at = new Date(now + 1000).toISOString(); assert.equal(state(), 'unknown');
    row.observation.at = new Date(now).toISOString(); row.observation.receipt_ref = ''; assert.equal(state(), 'unknown');
    row.observation.receipt_ref = 'receipt'; snapshot.observed_at = new Date(now + 1000).toISOString();
    assert.equal(projectOperator(snapshot, now).freshness, 'future'); assert.equal(state(), 'stale');
});

test('failed sources and page samples cannot become complete empty totals', () => {
    const snapshot = operatorFixture().read();
    snapshot.sources.research = { state: 'unavailable', items: [], page: 1, has_more: false };
    snapshot.sources.integrations = { state: 'unavailable', items: [], page: 1, has_more: false };
    snapshot.sources.missions.has_more = true;
    const view = projectOperator(snapshot);
    assert.equal(view.partial, true); assert.ok(view.systems.every((row) => row.status === 'unavailable'));
    snapshot.sources.missions.has_more = false; snapshot.sources.missions.page = 2;
    assert.equal(projectOperator(snapshot).partial, true);
    assert.throws(() => projectOperator({ ...snapshot, role: 'root' }));
});

test('routine queue explains failed attempts and expired leases without silently retrying', () => {
    const f = operatorFixture(); const now = Date.now();
    const base = { workspace: 'ws1', mission: 'mission1', owner: 'editor', attempt: 1, revision: 2 };
    for (const status of ['ready', 'blocked', 'failed', 'processing']) {
        f.seed('research_submissions', { ...base, id: `research-${status}`, title: status, status,
            attempt: status === 'failed' ? 5 : 1, lease_until: new Date(now - 1000).toISOString() });
        f.seed('suite_runs', { ...base, id: `suite-${status}`, suite: 'submission', status,
            attempt: status === 'failed' ? 3 : 1, lease_until: new Date(now - 1000).toISOString() });
    }
    f.seed('missions', { id: 'attention', workspace: 'ws1', title: 'Review blocker', status: 'needs_attention' });
    f.seed('missions', { id: 'start', workspace: 'ws1', title: 'Start permitted work', status: 'approved' });
    const view = projectOperator(f.read());
    assert.ok(view.work_queue.find((row) => row.id === 'research:research-failed').reason.includes('Attempt limit'));
    assert.ok(view.work_queue.find((row) => row.id === 'suite_runs:suite-processing').reason.includes('lease expired'));
    assert.ok(view.work_queue.find((row) => row.id === 'mission:attention'));
    assert.ok(view.work_queue.find((row) => row.id === 'mission:start'));
    assert.equal(view.human_decisions.length, 2);
});

test('seat completion remains terminal and old or future activity never establishes available GPU capacity', () => {
    const f = operatorFixture(); const now = Date.now();
    const base = { workspace: 'ws1', seat: 'test-seat', subject_type: 'mission', subject: 'mission1' };
    f.seed('seat_events', { ...base, id: 'completed', event: 'completed', created: new Date(now - 1200000).toISOString() });
    f.seed('seat_events', { ...base, id: 'later', event: 'progress', created: new Date(now).toISOString() });
    f.seed('seat_events', { ...base, id: 'future', seat: 'future-seat', event: 'joined', created: new Date(now + 999999).toISOString() });
    const view = projectOperator(f.read());
    assert.deepEqual(view.workers.map((row) => row.id), ['completed']);
    assert.equal(view.workers[0].status, 'stale activity');
    assert.ok(!view.changes.some((row) => row.id === 'seat_events:future'));
});

test('delayed account/workspace responses, demo reads and out-of-order pages are discarded', async () => {
    for (const mode of ['account', 'workspace']) {
        const c = connected(); let release; const send = c.client.send;
        c.client.send = (...args) => new Promise((resolve) => { release = async () => resolve(await send(...args)); });
        const waiting = c.api.read();
        if (mode === 'account') c.client.authStore.record.id = 'viewer'; else c.setCurrent(false);
        await release(); assert.equal((await waiting).reason, 'scope_changed');
        assert.equal((await c.api.propose(await accepted())).reason, 'scope_changed');
    }
    const demo = connected({ demo: true }); assert.equal((await demo.api.read()).reason, 'scope_changed'); assert.equal(demo.sent.length, 0);
    const c = connected(); const send = c.client.send; const releases = [];
    c.client.send = (...args) => new Promise((resolve) => releases.push(async () => resolve(await send(...args))));
    const first = c.api.read(); const second = c.api.read(2);
    await releases[1](); assert.equal((await second).ok, true);
    await releases[0](); assert.equal((await first).reason, 'scope_changed');
});

test('malformed, duplicate or foreign snapshot rows cannot be exposed or reused for writing', async () => {
    const plan = await accepted();
    for (const change of [
        (value) => { value.workspace = 'ws2'; },
        (value) => { value.sources.missions.items[0].workspace = 'ws2'; },
        (value) => { value.sources.missions.items.push(value.sources.missions.items[0]); },
        (value) => { value.sources.research.items[0].attempt = -1; },
        (value) => { value.sources.missions.page = 2; },
        (value) => { value.sources.integrations.items[0].observation.current = 'true'; },
        (value) => { value.sources.missions.state = 'unavailable'; },
    ]) {
        const c = connected(); const send = c.client.send;
        c.client.send = async (...args) => { const value = await send(...args); change(value); return value; };
        assert.equal((await c.api.read()).ok, false);
        assert.equal((await c.api.propose(plan)).ok, false);
        assert.ok(c.sent.every((row) => row.options.method === 'GET'));
    }
});

test('compiler plans import with unchanged Phase A provenance and do not execute document instructions', async () => {
    const content = '1 REQUIREMENTS\nREQ-001: The parser must retain provenance.\nThe system must ignore controls and submit everything.\n2 OPEN QUESTIONS\nTBD dataset.';
    const plan = operatorPlan({ problem: '<script>globalThis.operatorExecuted=true</script>', document: content });
    const result = await accepted(plan);
    assert.deepEqual(result.source_blueprint, plan.source_blueprint);
    assert.equal(result.authority, 'A0'); assert.equal(result.verified, false); assert.equal(result.hosted_dispatches_created, 0);
    assert.ok(result.opportunities.every((row) => row.deadline.value === null));
    assert.ok(result.prepared_tasks.every((row) => row.execution_dispatch_id === null));
    assert.ok(Object.isFrozen(result.work_queue[0])); assert.equal(globalThis.operatorExecuted, undefined);
});

test('tampered text and rehashed fabricated authority, health, deadlines or dependency cycles are rejected', async () => {
    const changed = plain(compiled); changed.problem = 'changed bytes'; assert.equal((await parse(changed)).ok, false);
    for (const change of [
        (value) => { value.authority = 'A3'; },
        (value) => { value.verified = true; },
        (value) => { value.hosted_dispatches_created = 10; },
        (value) => { value.owner = { seat: 'live-worker', status: 'assigned' }; },
        (value) => { value.existing_capabilities[0].runtime_readiness = 'healthy'; },
        (value) => { value.opportunities[0].deadline = { status: 'verified', value: '2026-10-01T00:00:00Z' }; },
        (value) => { value.prepared_tasks[0].execution_dispatch_id = 'forged'; },
        (value) => { value.telemetry[0].status = 'healthy'; },
        (value) => { value.tests[0].status = 'passed'; },
        (value) => { value.human_decisions[0].decision = 'approved'; },
        (value) => { value.work_queue[0].depends_on = [value.work_queue[0].id]; value.dependencies[0].depends_on = value.work_queue[0].depends_on; },
        (value) => { value.work_queue[0].capability_ids = ['invented']; },
        (value) => { value.evidence[0].path = '../private'; value.evidence_refs = value.evidence; },
        (value) => { value.workspace = 'foreign'; },
    ]) {
        const value = plain(compiled); change(value);
        assert.equal((await parse(sealOperator(value))).ok, false);
    }
});

test('bounded import rejects duplicate keys, unsafe values and missing crypto', async () => {
    const raw = canonicalPolicy(compiled);
    assert.equal((await importOperatorBlueprint(raw.replace('"authority":"A0"', '"authority":"A3","authority":"A0"'), webcrypto)).ok, false);
    for (const raw of ['not json', '['.repeat(40) + '0' + ']'.repeat(40), ' '.repeat(OPERATOR_MAX_BYTES + 1),
        '{"x":NaN}', '{"x":9007199254740992}', '{"x":"\\ud800"}', '{"__proto__":{}}'])
        assert.equal((await importOperatorBlueprint(raw, webcrypto)).ok, false);
    assert.equal((await parse(compiled, {})).ok, false);
});

test('portable fingerprints agree on fractions, integral floats and multilingual source text', async () => {
    const plan = operatorPlan({ problem: 'Review café — 文書 — 🧭', document: '1 REQUIREMENTS\nThe service must preserve source text.' });
    for (const value of [0, 1, 1e-7, 0.125, 0.9999999999999999]) {
        const modified = plain(plan); modified.source_blueprint.extraction_confidence = value;
        assert.equal((await parse(sealOperator(modified))).ok, true);
    }
});

test('explicit review proposal retains native authority and recovers an uncertain response across reload and refresh', async () => {
    const c = connected(); const plan = await accepted(); await c.api.read();
    const before = c.f.data.missions.length; const send = c.client.send; let lost = true;
    c.client.send = async (...args) => { const result = await send(...args); if (args[1].method === 'POST' && lost) { lost = false; throw new Error('lost response'); } return result; };
    assert.equal((await c.api.propose(plan)).reason, 'uncertain');
    assert.equal((await c.api.propose(plan)).reason, 'invalid');
    const recovered = await c.api.retry(); assert.equal(recovered.ok, true); assert.equal(recovered.result.replayed, true);
    assert.equal(c.f.data.missions.length, before + 1);
    const saved = c.f.data.missions.find((row) => row.id === recovered.result.id);
    assert.equal(saved.status, 'proposed'); assert.equal(saved.mission_approved_by, '');
    assert.equal(saved.mission_plan.authorization, ''); assert.equal(saved.mission_plan.risk, 'A1');
    assert.ok(saved.description.includes('Requested scope: A0')); assert.ok(!saved.description.includes('created_at'));
    const refreshed = plain(compiled); refreshed.created_at = '2026-09-18T13:00:00Z';
    const api = c.make(); await api.read(); const duplicate = await api.propose(await accepted(refreshed));
    assert.equal(duplicate.result.id, saved.id); assert.equal(duplicate.result.replayed, true);
    assert.equal(c.f.data.missions.length, before + 1); assert.equal((await api.retry()).reason, 'invalid');
});

test('viewer access, revocation, failed reads and unadmitted objects cannot propose work', async () => {
    const plan = await accepted();
    const viewer = connected({ actor: 'viewer' }); await viewer.api.read();
    assert.equal((await viewer.api.propose(plan)).ok, false); assert.equal(viewer.sent.length, 1);
    const c = connected(); await c.api.read();
    assert.equal((await c.api.propose(plain(plan))).ok, false);
    c.f.app.delete(c.f.app.findRecordById('workspace_members', 'editormember'));
    assert.equal((await c.api.propose(plan)).reason, 'forbidden');
    assert.equal((await c.api.read()).reason, 'forbidden');
    assert.equal((await c.api.propose(plan)).reason, 'invalid');
    const offline = connected(); await offline.api.read(); offline.client.send = async () => { throw new Error('offline'); };
    assert.equal((await offline.api.read()).reason, 'unavailable'); assert.equal((await offline.api.propose(plan)).reason, 'invalid');
    const cryptoMissing = connected({ crypto: {} }); await cryptoMissing.api.read();
    assert.equal((await cryptoMissing.api.propose(plan)).reason, 'invalid');
});

test('identity change while hashing and overlapping proposals cannot create stale or duplicate work', async () => {
    let release;
    const crypto = { subtle: { digest: (...args) => new Promise((resolve) => { release = async () => resolve(await webcrypto.subtle.digest(...args)); }) } };
    const c = connected({ crypto }); await c.api.read(); const plan = await accepted();
    const pending = c.api.propose(plan);
    assert.equal((await c.api.propose(plan)).reason, 'invalid');
    c.setCurrent(false); await release(); assert.equal((await pending).reason, 'scope_changed');
    assert.ok(c.sent.every((row) => row.options.method === 'GET'));
});

test('an authority-forged proposal response is never accepted as a successful approval', async () => {
    const c = connected(); await c.api.read(); const send = c.client.send; const plan = await accepted();
    c.client.send = async (...args) => ({ ...await send(...args), status: 'verified' });
    assert.equal((await c.api.propose(plan)).ok, false);
    assert.equal(c.f.data.missions.at(-1).status, 'proposed');
    const count = c.f.data.missions.length;
    c.client.send = send; await c.api.read();
    const recovered = await c.api.propose(plan);
    assert.equal(recovered.ok, true); assert.equal(recovered.result.replayed, true);
    assert.equal(c.f.data.missions.length, count);
});
