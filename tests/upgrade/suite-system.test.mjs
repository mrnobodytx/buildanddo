// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/suite-system.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     tests/upgrade/suite-fixture.mjs
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/suite-fixture.mjs
// DAG Node:    none
// Intent:      Verify persistent mission execution, human review and authorization through the actual suite source.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA, suiteFixture, hash, compute } from './suite-fixture.mjs';

test('suite storage works independently of research collections and paginates its own state', () => {
    const f = suiteFixture(); f.configure();
    const snapshot = f.command('snapshot', { page: 1 });
    assert.equal(snapshot.control.enabled, true); assert.equal(snapshot.configured, true); assert.deepEqual(snapshot.items, []);
    const queued = f.enqueue();
    assert.equal(f.command('snapshot', { page: 1 }).items[0].id, queued.id);
    assert.equal(f.command('poll', { page: 1 }, { actor: 'suiteworker', mission: '' }).items[0].id, queued.id);
});

test('source observation identity uses a tuple so colon-containing keys do not collide', () => {
    const f = suiteFixture();
    const items = f.policy.observations([], [f.observation({ source_id: 'a:b', source_record_id: 'c' }),
        f.observation({ observation_id: 'obs2', source_id: 'a', source_record_id: 'b:c' })], '2026-09-16T00:00:00Z');
    assert.equal(items.length, 2);
});

test('missing configuration denies historical observation access with a typed failure', () => {
    const f = suiteFixture();
    assert.throws(() => f.policy.rightsFor(null, [f.observation()], Date.now()), { status: 403 });
});

test('one API persists real Python analysis, preserves its input and requires human evidence review', () => {
    const f = suiteFixture(); f.configure(); const queued = f.enqueue(); const lease = f.claim(queued);
    const done = f.complete(lease);
    assert.equal(done.status, 'ready'); assert.equal(f.data.evidence.length, 0);
    const detail = f.command('detail', { id: queued.id }).record;
    assert.equal(detail.input_sha256, hash(detail.input_canonical));
    assert.equal(detail.result_sha256, hash(detail.result_canonical));
    assert.deepEqual(JSON.parse(detail.result_canonical), detail.result);
    assert.equal(detail.result.release_state, 'HOLD'); assert.deepEqual(detail.result.analysis.admitted_cues, []);
    assert.equal(f.command('snapshot', { page: 1 }).control.state_revision, 1);
    const attached = f.command('attach', { id: queued.id, note: 'Reviewed the ordered observation and limits.' }, { revision: done.revision });
    assert.equal(attached.status, 'attached'); assert.equal(f.data.evidence[0].type, 'observed');
    assert.equal(f.data.evidence[0].mission, 'mission1'); assert.equal(f.data.missions[0].status, 'running');
    assert.equal(f.data.suite_runs[0].input_canonical, detail.input_canonical);
});

test('lost enqueue and completion replies recover without duplicate runs, state advancement or evidence', () => {
    const f = suiteFixture(); f.configure(); const key = 'suite_enqueue_retry_01'; const queued = f.enqueue(undefined, { key });
    assert.equal(f.enqueue(undefined, { key }).replayed, true); assert.equal(f.data.suite_runs.length, 1);
    assert.throws(() => f.enqueue([f.observation({ longitude: -91 })], { key }), { status: 409 });
    const lease = f.claim(queued, { key: 'suite_claim_retry_01' });
    assert.equal(f.claim(queued, { key: 'suite_claim_retry_01' }).job.input_canonical, lease.job.input_canonical);
    const result = compute(lease.job.input_canonical); const options = { key: 'suite_complete_retry_01' };
    f.complete(lease, result, options); assert.equal(f.complete(lease, result, options).replayed, true);
    assert.equal(f.data.suite_controls[0].state_revision, 1);
    assert.ok(f.data.suite_receipts.every((row) => !JSON.stringify(row).includes('latitude')));
});

test('current roles and native mission readability guard every read and write', () => {
    const f = suiteFixture(); f.configure(); const queued = f.enqueue();
    for (const actor of ['viewer', 'outsider']) assert.throws(() => f.enqueue(undefined, { actor }), { status: 403 });
    assert.throws(() => f.configure({}, { actor: 'editor', revision: 1 }), { status: 403 });
    assert.throws(() => f.claim(queued, { actor: 'admin' }), { status: 403 });
    assert.throws(() => f.command('detail', { id: queued.id }, { actor: 'otherowner', mission: 'mission2', workspace: 'ws2' }), { status: 403 });
    f.denied.add('mission1');
    assert.throws(() => f.command('snapshot', { page: 1 }, { actor: 'owner' }), { status: 403 });
});

test('owner membership revocation fences an already-issued worker lease', () => {
    const f = suiteFixture(); f.configure(); const lease = f.claim(f.enqueue());
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    assert.throws(() => f.complete(lease), { status: 403 });
    assert.equal(f.data.suite_runs[0].status, 'processing'); assert.equal(f.data.suite_controls[0].state_revision, 0);
    assert.deepEqual(f.command('poll', { page: 1 }, { actor: 'suiteworker', mission: '' }).items, []);
});

test('worker rotation, disabled rights and changed settings invalidate in-flight work', () => {
    for (const mutate of [
        (f) => { f.env.value = JSON.stringify([{ ...f.registered[0], worker_user: 'worker2' }]); },
        (f) => f.configure({ rights: [{ ...f.rights[0], processing_allowed: false }] }, { revision: 1 }),
        (f) => f.configure({ enabled: false }, { revision: 1 }),
    ]) {
        const f = suiteFixture(); f.configure(); const lease = f.claim(f.enqueue()); mutate(f);
        assert.throws(() => f.complete(lease), (error) => [403, 409].includes(error.status));
        assert.equal(f.data.suite_controls[0].state_revision, 0);
    }
});

test('readiness cannot bypass mission approval, source rights or a blocked worker configuration', () => {
    const f = suiteFixture({ bound: false }); f.configure();
    const mission = f.app.findRecordById('missions', 'mission1'); mission.set('status', 'proposed'); f.app.save(mission);
    assert.throws(() => f.enqueue(), { status: 409 });
    mission.set('status', 'running'); f.app.save(mission);
    const queued = f.enqueue(); assert.equal(queued.status, 'blocked');
    assert.throws(() => f.command('retry', { id: queued.id }, { revision: queued.revision }), { status: 409 });
    f.env.value = JSON.stringify(f.registered);
    const retry = f.command('retry', { id: queued.id }, { revision: queued.revision });
    assert.equal(retry.status, 'queued'); assert.equal(f.claim(retry).attempt, 1);
});

test('expired and cancelled leases cannot complete; another claim fences the original attempt', () => {
    const f = suiteFixture(); f.configure(); const original = f.claim(f.enqueue());
    let record = f.app.findRecordById('suite_runs', original.id); record.set('lease_until', '2020-01-01T00:00:00Z'); f.app.save(record);
    assert.throws(() => f.complete(original), { status: 409 });
    const next = f.claim({ id: original.id, revision: original.revision }); assert.equal(next.attempt, 2);
    assert.throws(() => f.complete(original), { status: 409 });
    f.command('cancel', { id: next.id }, { revision: next.revision });
    assert.throws(() => f.complete(next), { status: 409 });
    assert.equal(f.data.suite_controls[0].active_run, '');
});

test('native PocketBase date-field serialization preserves a valid worker lease', () => {
    const f = suiteFixture(); f.configure(); const lease = f.claim(f.enqueue());
    const row = f.app.findRecordById('suite_runs', lease.id);
    row.set('lease_until', row.getString('lease_until').replace('T', ' ')); f.app.save(row);
    assert.equal(f.complete(lease).status, 'ready');
});

test('late observations preserve history and cannot replace a newer vessel position', () => {
    const f = suiteFixture(); f.configure(); f.complete(f.claim(f.enqueue()));
    const old = f.observation({ observation_id: 'obs0', source_record_id: 'row0', event_time: '2025-12-31T23:00:00Z', longitude: -89 });
    const second = f.enqueue([old], { revision: 1 }); f.complete(f.claim(second));
    const result = f.command('detail', { id: second.id }).record.result;
    assert.equal(result.analysis.observations.length, 2); assert.equal(result.analysis.entities[0].position.longitude, -90);
    assert.ok(result.analysis.candidates.length > 0);
    assert.ok(result.analysis.candidates.every((row) => row.admission_verdict === 'HOLD'));
    assert.throws(() => f.enqueue([f.observation({ longitude: 20 })], { revision: 2 }), { status: 409 });
});

test('state and retry receipts roll back together when durable receipt storage fails', () => {
    const f = suiteFixture(); f.configure(); const before = structuredClone(f.data); const save = f.app.save.bind(f.app);
    f.app.save = (record) => { if (record.collection?.().name === 'suite_receipts') throw new Error('unavailable'); return save(record); };
    assert.throws(() => f.enqueue(), /unavailable/);
    assert.deepEqual(f.data, before);
});

test('result identity, source lineage and admission restrictions reject worker output tampering', () => {
    const f = suiteFixture(); f.configure(); const lease = f.claim(f.enqueue()); const valid = compute(lease.job.input_canonical);
    for (const mutate of [
        (row) => { row.mission_id = 'mission2'; }, (row) => { row.source_sha256 = 'b'.repeat(64); },
        (row) => { row.proof.release_root = 'a'.repeat(64); }, (row) => { row.proof.artifacts[0].digest = 'a'.repeat(64); },
        (row) => { row.analysis.admitted_cues = [{ admission_verdict: 'ADMIT' }]; },
        (row) => { row.analysis.candidates = [{ admission_verdict: 'ADMIT' }]; },
        (row) => { row.analysis.observations[0].tenant_id = 'ws2'; },
    ]) { const row = structuredClone(valid); mutate(row); assert.throws(() => f.complete(lease, row), { status: 400 }); }
    assert.equal(f.data.suite_runs[0].status, 'processing');
});

test('up, re-up, down and re-up preserve inputs and keep raw collection APIs locked', () => {
    const f = suiteFixture(); f.configure(); const queued = f.enqueue(); f.migration(SCHEMA).up();
    for (const name of ['suite_controls', 'suite_runs', 'suite_receipts'])
        for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(f.collections[name][rule], null);
    const before = structuredClone(f.data.suite_runs); f.migration(SCHEMA).down();
    assert.throws(() => f.command('detail', { id: queued.id }), { status: 503 });
    assert.deepEqual(f.data.suite_runs, before); f.migration(SCHEMA).up();
    assert.equal(f.command('snapshot', { page: 1 }).items[0].id, queued.id);
    f.collections.suite_runs.viewRule = 'true';
    assert.throws(() => f.migration(SCHEMA).up(), /Review custom/);
});

test('configuration denies controlled data, malformed times, missing rights and duplicate sources', () => {
    const f = suiteFixture();
    for (const right of [{ ...f.rights[0], classification: 'CUI' }, { ...f.rights[0], expires_at: '2026-02-30T00:00:00Z' }])
        assert.throws(() => f.configure({ rights: [right] }), { status: 400 });
    assert.throws(() => f.configure({ rights: [f.rights[0], f.rights[0]] }), { status: 400 });
    f.configure({ rights: [{ ...f.rights[0], expires_at: '2020-01-01T00:00:00Z' }] });
    assert.throws(() => f.enqueue(), { status: 403 });
});

test('submission review uses evidence from this mission and cannot assert portal submission', () => {
    const f = suiteFixture(); f.configure();
    f.seed('evidence', { id: 'proof1', workspace: 'ws1', mission: 'mission1', owner: 'owner', type: 'verified', content: 'Observed capability evidence', source: 'review' });
    f.seed('evidence', { id: 'proof2', workspace: 'ws2', mission: 'mission2', owner: 'otherowner', type: 'verified', content: 'Foreign proof' });
    const input = { requirements: [{ id: 'capability', criterion: 'Demonstrate the proposed capability.', source_url: 'https://www.diu.mil/', source_revision: 'Example requiring official verification',
        evidence_ids: ['proof1'], status: 'satisfied', justification: '' }], document: { name: 'Review copy', sha256: 'a'.repeat(64), format: 'paper', pages: 7, max_pages: 10,
        rule_url: 'https://www.diu.mil/', rule_revision: 'Owner-entered example', deadline: '2099-01-01T00:00:00Z' } };
    const bad = structuredClone(input); bad.requirements[0].evidence_ids = ['proof2'];
    assert.throws(() => f.command('enqueue', { suite: 'submission', input: bad }), { status: 403 });
    const queued = f.command('enqueue', { suite: 'submission', input }); const done = f.complete(f.claim(queued));
    const result = f.command('detail', { id: queued.id }).record.result;
    assert.equal(result.analysis.state, 'READY_FOR_HUMAN_REVIEW'); assert.equal(result.analysis.submission_receipt, null);
    assert.equal(done.status, 'ready'); assert.equal(f.data.missions[0].status, 'running');
    const proof = f.app.findRecordById('evidence', 'proof1'); proof.set('content', 'The original capability evidence was corrected.'); f.app.save(proof);
    assert.throws(() => f.command('detail', { id: queued.id }), { status: 409 });
    assert.throws(() => f.command('attach', { id: queued.id, note: 'Review of stale evidence' }, { revision: done.revision }), { status: 409 });
    assert.equal(f.data.suite_runs[0].status, 'ready'); assert.equal(f.data.evidence.length, 2);
});

test('changed submission evidence fences worker completion and polling', () => {
    const f = suiteFixture(); f.configure();
    f.seed('evidence', { id: 'proof1', workspace: 'ws1', mission: 'mission1', owner: 'editor', type: 'verified', content: 'Measured result' });
    const input = { requirements: [{ id: 'capability', criterion: 'Demonstrate the capability', source_url: 'https://www.diu.mil/',
        source_revision: 'Synthetic rule', evidence_ids: ['proof1'], status: 'satisfied', justification: '' }],
    document: { name: 'Candidate', sha256: 'a'.repeat(64), format: 'paper', pages: 7, max_pages: 10,
        rule_url: 'https://www.diu.mil/', rule_revision: 'Synthetic rule', deadline: '2099-01-01T00:00:00Z' } };
    const queued = f.command('enqueue', { suite: 'submission', input }); const lease = f.claim(queued);
    const proof = f.app.findRecordById('evidence', 'proof1'); proof.set('type', 'contradicted'); f.app.save(proof);
    assert.throws(() => f.complete(lease), { status: 409 });
    assert.deepEqual(f.command('poll', { page: 1 }, { actor: 'suiteworker', mission: '' }).items, []);
    assert.equal(f.data.suite_runs[0].status, 'processing');
});
