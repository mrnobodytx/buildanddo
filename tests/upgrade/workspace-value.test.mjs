// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/workspace-value.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     tests/upgrade/operator-fixture.mjs, apps/pocketbase/pb_hooks/workspace-value.js, apps/web/src/lib/workspaceValue.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/operator-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/workspace-value.js; VALIDATES apps/web/src/lib/workspaceValue.js
// Intent:      Reject unsupported economic and verification claims while checking one scoped value projection and its evidence lineage.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { operatorFixture } from './operator-fixture.mjs';
import { projectOperator } from '../../apps/web/src/lib/operatorPlane.js';
import { projectWorkspaceValue, valueSummaryShape } from '../../apps/web/src/lib/workspaceValue.js';

const snapshotFields = ['id', 'workspace', 'mission', 'owner', 'type', 'title', 'source', 'content', 'url', 'created', 'updated'];
const TEVV = ['test', 'evaluate', 'verify', 'validate'];
const card = (view, id) => view.metrics.find((item) => item.id === id);
const missionOutcome = (view) => view.outcomes.find((item) => item.id === 'mission1');
function reviewed({ independent = true } = {}) {
    const f = operatorFixture({ runtime: { $security: { sha256: (input) => createHash('sha256').update(input).digest('hex') } } });
    const proof = f.app.findRecordById('evidence', 'proof1');
    proof.set('source', 'Synthetic source receipt'); f.app.save(proof);
    const snapshot = Object.fromEntries(snapshotFields.map((key) => [key, key === 'id' ? proof.id : proof.getString(key)]));
    const mission = f.app.findRecordById('missions', 'mission1');
    mission.set('status', 'verified');
    mission.set('mission_plan', { ...f.plan, risk: 'A1', independent_review: independent });
    mission.set('mission_review', { version: 1, reflection: 'Synthetic review', evidence_snapshot: [snapshot],
        ...Object.fromEntries(TEVV.map((key) => [key, { outcome: 'pass', observation: 'Synthetic observed result', evidence: proof.id }])) });
    mission.set('mission_reviewed_by', independent ? 'viewer' : 'editor');
    mission.set('mission_reviewed_at', new Date().toISOString());
    f.app.save(mission);
    return { ...f, mission, proof, get data() { return f.data; } };
}
function value(f, now) {
    const snapshot = f.read(); const at = now ?? Date.parse(snapshot.observed_at);
    return projectWorkspaceValue(snapshot, projectOperator(snapshot, at), at);
}

test('money, time, avoided loss and automation rate require actual baselines and denominators', () => {
    const f = reviewed(); const before = JSON.stringify(f.data); const view = value(f);
    for (const id of ['value', 'hours', 'risk', 'automation']) {
        assert.equal(card(view, id).value, null, id);
        assert.equal(card(view, id).display, 'Not yet measured');
        assert.equal(card(view, id).state, 'UNMEASURED');
        assert.ok(card(view, id).missing.length);
    }
    assert.equal(card(view, 'verified').value, 1);
    assert.equal(card(view, 'verified').independent, 1);
    assert.equal(missionOutcome(view).required_authority, 'A1');
    assert.equal(missionOutcome(view).canonical_identity, null);
    assert.equal(JSON.stringify(f.data), before);
});

test('recorded verified work binds four review observations to readable unchanged evidence', () => {
    const f = reviewed(); const view = value(f); const outcome = missionOutcome(view);
    assert.equal(outcome.state, 'VERIFIED');
    assert.equal(outcome.reviewer, 'viewer');
    assert.deepEqual(outcome.evidence.map((row) => row.id), ['proof1']);
    assert.equal(outcome.evidence[0].source_ref, 'evidence/proof1');
    assert.equal(outcome.actions.state, 'unavailable');
    assert.ok(!JSON.stringify(view).includes('Private source body'));
    assert.ok(!JSON.stringify(view).includes('Synthetic observed result'));
    assert.ok(valueSummaryShape(f.read().sources.missions.items.find((row) => row.id === 'mission1').value));
});

test('an evidence type or mission status alone cannot manufacture verified work', () => {
    const f = operatorFixture();
    const mission = f.app.findRecordById('missions', 'mission1'); mission.set('status', 'verified'); f.app.save(mission);
    const proof = f.app.findRecordById('evidence', 'proof1'); proof.set('type', 'verified'); f.app.save(proof);
    assert.equal(card(value(f), 'verified').value, null);
    const complete = reviewed();
    const review = complete.mission.get('mission_review'); review.test.outcome = 'hold';
    complete.mission.set('mission_review', review); complete.app.save(complete.mission);
    assert.equal(card(value(complete), 'verified').value, null);
});

test('independent and self review remain distinct over the same outcomes', () => {
    const f = reviewed({ independent: false }); const view = value(f);
    assert.equal(card(view, 'verified').value, 1); assert.equal(card(view, 'verified').independent, 0);
    assert.equal(missionOutcome(view).independent, false);
});

test('edited evidence, mismatched authors and foreign snapshots cannot support the count', () => {
    for (const change of [
        (f) => { f.proof.set('content', 'Changed observation'); f.app.save(f.proof); },
        (f) => { const review = f.mission.get('mission_review'); review.evidence_snapshot[0].workspace = 'ws2'; f.mission.set('mission_review', review); f.app.save(f.mission); },
        (f) => { f.mission.set('mission_reviewed_by', 'editor'); f.app.save(f.mission); },
    ]) {
        const f = reviewed(); change(f);
        assert.equal(card(value(f), 'verified').value, null);
        assert.equal(missionOutcome(value(f)).state, 'CONFLICTING');
    }
});

test('unreadable evidence and revoked memberships remove the derived facts', () => {
    const f = reviewed(); f.denied.add('proof1');
    const view = value(f);
    assert.equal(card(view, 'verified').value, null);
    assert.deepEqual(missionOutcome(view).evidence, []);
    f.denied.add('mission1'); assert.ok(missionOutcome(view));
    assert.equal(missionOutcome(value(f)), undefined);
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    assert.throws(() => value(f), { status: 403 });
});

test('source paging, stale snapshots and out-of-period reviews retain their measurement limits', () => {
    const f = reviewed(); const snapshot = f.read(); const now = Date.parse(snapshot.observed_at);
    snapshot.sources.missions.has_more = true;
    let view = projectWorkspaceValue(snapshot, projectOperator(snapshot, now), now);
    assert.equal(card(view, 'verified').display, 'At least 1');
    assert.equal(card(view, 'verified').state, 'PARTIAL');
    snapshot.sources.missions.has_more = false; snapshot.sources.missions.page = 2;
    view = projectWorkspaceValue(snapshot, projectOperator(snapshot, now), now);
    assert.equal(card(view, 'verified').state, 'PARTIAL');
    view = projectWorkspaceValue(snapshot, projectOperator(snapshot, now + 960000), now + 960000);
    assert.equal(card(view, 'verified').value, null);
    const historical = structuredClone(snapshot);
    historical.sources.missions.page = 1;
    const old = historical.sources.missions.items.find((row) => row.id === 'mission1').value;
    old.reviewed_at = '2020-01-01T00:00:00Z'; old.evidence[0].observed_at = '2019-12-31T23:59:59Z';
    assert.equal(card(projectWorkspaceValue(historical, projectOperator(historical, now), now), 'verified').value, 0);
    f.mission.set('mission_reviewed_at', new Date(now + 3600000).toISOString()); f.app.save(f.mission);
    assert.equal(card(value(f), 'verified').value, null);
});

test('receipt lineage preserves provider and release identity without counting an execution as verification', () => {
    const f = reviewed(); f.migration('apps/pocketbase/pb_migrations/1790800000_business_execution.js').up();
    const canonical = f.load('workspace-access.js').canonical;
    const result = { status: 'succeeded', observed_at: new Date().toISOString(), receipt_ref: 'provider-receipt',
        output: { effect_key: 'effect1', execution_id: 'run1', summary: 'Private result' } };
    f.seed('business_jobs', { id: 'job1', workspace: 'ws1', mission: 'mission1', run: 'approval', owner: 'editor',
        provider: 'n8n', status: 'succeeded', evidence: 'proof1',
        result: { reported: result, records: { evidence: 'proof1' }, run_advanced: true }, effect_key: 'effect1',
        result_sha256: createHash('sha256').update(canonical(result)).digest('hex'),
        release_context: { candidate_sha: 'a'.repeat(40), source_sha256: 'b'.repeat(64), artifact_tree_sha256: 'c'.repeat(64),
            dispatch: 'synthetic', environment: 'fixture' } });
    const view = value(f); const action = missionOutcome(view).actions.items[0];
    assert.equal(action.provider, 'n8n'); assert.equal(action.release.candidate_sha, 'a'.repeat(40));
    assert.equal(action.receipt_ref, 'business_jobs/job1#result');
    assert.equal(action.state, 'OBSERVED');
    assert.ok(!JSON.stringify(view).includes('Private result'));
    f.mission.set('status', 'running'); f.app.save(f.mission);
    assert.equal(card(value(f), 'verified').value, 0);
});

test('future participants appear through existing identity records without adding a dashboard provider list', () => {
    const snapshot = operatorFixture().read();
    snapshot.sources.integrations.items.push({ provider: 'future.engine', label: 'Future engine',
        desired_enabled: true, observation: { state: 'unknown', at: '', current: false, receipt_ref: '', check_pending: false } });
    const view = projectOperator(snapshot);
    assert.equal(view.systems.find((row) => row.id === 'future.engine').status, 'unknown');
    assert.equal(view.systems.length, snapshot.sources.integrations.items.length);
});

test('legacy summaries and unreadable sources never borrow verification from another scope or capture', () => {
    const f = reviewed(); const snapshot = f.read(); const now = Date.parse(snapshot.observed_at);
    for (const row of snapshot.sources.missions.items) delete row.value;
    const operator = projectOperator(snapshot, now);
    assert.equal(card(projectWorkspaceValue(snapshot, operator, now), 'verified').value, null);
    assert.throws(() => projectWorkspaceValue(snapshot, { ...operator, observed_at: '2020-01-01T00:00:00Z' }, now));
    const foreign = structuredClone(snapshot); foreign.sources.missions.items[0].workspace = 'other';
    assert.throws(() => projectWorkspaceValue(foreign, operator, now));
    const unavailable = structuredClone(snapshot);
    unavailable.sources.missions = { state: 'unavailable', items: [], page: 1, has_more: false };
    assert.equal(card(projectWorkspaceValue(unavailable, projectOperator(unavailable, now), now), 'verified').value, null);
    assert.equal(projectWorkspaceValue(snapshot, { ...operator, freshness: 'current' }, now + 960000).freshness, 'stale');
    assert.throws(() => projectWorkspaceValue(null, operator, now));
});

test('malformed value states, duplicate evidence and fabricated independence fail the client boundary', () => {
    const f = reviewed(); const snapshot = f.read();
    const base = snapshot.sources.missions.items.find((row) => row.id === 'mission1').value;
    for (const change of [
        (row) => { row.state = 'HEALTHY'; },
        (row) => { row.evidence.push(row.evidence[0]); },
        (row) => { row.independent = true; row.reviewer = row.evidence[0].owner; },
        (row) => { row.evidence = []; },
        (row) => { row.evidence[0].observed_at = '2099-01-01T00:00:00Z'; },
        (row) => { row.actions = { state: 'unavailable', has_more: true, items: [] }; },
        (row) => { row.required_authority = 'A5'; },
        (row) => { row.reviewer = ''; },
    ]) {
        const value = structuredClone(base); change(value); assert.equal(valueSummaryShape(value), false);
        const malformed = structuredClone(snapshot);
        malformed.sources.missions.items.find((row) => row.id === 'mission1').value = value;
        assert.throws(() => projectOperator(malformed));
        assert.throws(() => projectWorkspaceValue(malformed, projectOperator(snapshot), Date.parse(snapshot.observed_at)));
    }
    assert.equal(valueSummaryShape(null), false);
});

test('partial evidence, absent reviewer and malformed frozen reviews stay unmeasured', () => {
    for (const mutate of [
        (f) => { f.mission.set('mission_reviewed_by', ''); },
        (f) => { f.mission.set('mission_review', { version: 1 }); },
        (f) => { const review = f.mission.get('mission_review'); review.evidence_snapshot.push(review.evidence_snapshot[0]); f.mission.set('mission_review', review); },
        (f) => { const review = f.mission.get('mission_review'); review.evidence_snapshot[0].id = 'missing'; f.mission.set('mission_review', review); },
        (f) => { f.proof.set('mission', 'another'); f.app.save(f.proof); },
        (f) => { f.app.delete(f.proof); },
    ]) {
        const f = reviewed(); mutate(f); f.app.save(f.mission);
        const view = value(f);
        assert.equal(card(view, 'verified').value, null);
        assert.equal(missionOutcome(view).state, 'UNMEASURED');
    }
});
