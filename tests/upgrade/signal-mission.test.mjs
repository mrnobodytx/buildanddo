// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/signal-mission.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     tests/upgrade/research-fixture.mjs, apps/pocketbase/pb_hooks/mission-research.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/research-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/mission-research.js; VALIDATES apps/pocketbase/pb_hooks/mission-policy.js; VALIDATES apps/web/src/lib/missionLearning.js
// Intent:      Prove scoped signal proposals, atomic recovery and independently reviewed mission outcomes using actual source contracts.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { researchFixture } from './research-fixture.mjs';
import { readPlan, planIssues } from '../../apps/web/src/lib/missionLearning.js';
import { createResearchClient, signalProposalKey } from '../../apps/web/src/lib/missionResearch.js';
import { plain } from './admin-fixture.mjs';

function setup() {
    const f = researchFixture();
    const signal = f.seed('signals', { id: 'signal1', workspace: 'ws1', owner: 'editor', title: 'Appointment evidence is missing',
        description: 'Review the missing observation before taking action.', source: 'Synthetic appointment record', type: 'fact', state: 'new' });
    const input = { signal: signal.id, signal_updated: signal.getString('updated') };
    const propose = (payload = input, options = {}) => f.command('signal.propose', payload, options);
    return { ...f, get data() { return f.data; }, input, propose };
}

test('a proposal captures the saved signal, independent review and one source observation', () => {
    const f = setup(); const result = f.propose();
    const mission = f.data.missions.find((row) => row.id === result.id);
    const evidence = f.data.evidence.find((row) => row.id === result.evidence);
    assert.equal(mission.status, 'proposed');
    assert.equal(mission.owner, 'editor');
    assert.equal(mission.mission_plan.independent_review, true);
    assert.equal(readPlan(mission.mission_plan).independent_review, true);
    assert.equal(mission.mission_approved_by, '');
    assert.equal(evidence.mission, mission.id);
    assert.equal(evidence.workspace, 'ws1');
    assert.equal(JSON.parse(evidence.content).signal, 'signal1');
    assert.equal(f.data.signals[0].state, 'new');
});

test('an uncertain response replays the same proposal and observation even after source changes', () => {
    const f = setup(); const key = 'signal_recovery_request_1';
    const first = f.propose(f.input, { key });
    const signal = f.app.findRecordById('signals', 'signal1'); signal.set('description', 'A later observation'); f.app.save(signal);
    const again = f.propose(f.input, { key });
    assert.equal(again.id, first.id); assert.equal(again.evidence, first.evidence); assert.equal(again.replayed, true);
    assert.equal(f.data.evidence.filter((row) => row.mission === first.id).length, 1);
    assert.throws(() => f.propose({ ...f.input, signal_updated: 'changed' }, { key }), /retry key/);
});

test('foreign, unreadable, anonymous and viewer signals cannot create proposals', () => {
    for (const actor of ['outsider', 'viewer', '']) {
        const f = setup(); assert.throws(() => f.propose(f.input, { actor }));
        assert.equal(f.data.missions.length, 2);
    }
    const f = setup(); f.denied.add('signal1'); assert.throws(() => f.propose());
    f.denied.clear(); f.data.signals[0].workspace = 'ws2'; assert.throws(() => f.propose());
});

test('stale revisions and injected fields fail before any writes', () => {
    const f = setup(); const before = JSON.stringify(f.data);
    for (const payload of [{ ...f.input, signal_updated: 'old' }, { ...f.input, status: 'verified' }, { signal: '../signal1', signal_updated: 'old' }])
        assert.throws(() => f.propose(payload));
    assert.equal(JSON.stringify(f.data), before);
});

test('a failed evidence or audit write rolls the whole proposal back', () => {
    for (const target of ['evidence', 'research_events']) {
        const f = setup(); const before = JSON.stringify(f.data); const save = f.app.save;
        f.app.save = function(record) {
            if (record.collection().name === target) throw new Error('Synthetic disk failure');
            return save.call(this, record);
        };
        assert.throws(() => f.propose(), /Synthetic disk failure/);
        assert.equal(JSON.stringify(f.data), before);
    }
});

test('independent review rejects the proposer and evidence author but accepts another current writer', () => {
    const f = setup(); const result = f.propose(); const policy = f.load('mission-policy.js');
    const saved = f.app.findRecordById('missions', result.id);
    const plan = { version: 1, risk: 'A1', independent_review: true,
        ...Object.fromEntries(policy.PLAN_FIELDS.map((name) => [name, 'Observed fixture ' + name])) };
    saved.set('mission_plan', plan); saved.set('status', 'running'); saved.set('mission_approved_by', 'owner');
    saved.set('mission_approved_at', new Date().toISOString()); f.app.save(saved);
    const review = { reflection: 'A separate reviewer inspected the result.', ...Object.fromEntries(policy.TEVV.map((id) => [id,
        { outcome: 'pass', observation: 'Observed fixture check', evidence: result.evidence }])) };
    function verify(actor) {
        const record = f.app.findRecordById('missions', result.id); record.set('status', 'verified'); record.set('mission_review', review);
        const event = { ...f.event(actor), record, next() { f.app.save(record); } };
        policy.enforce(event, false); return record;
    }
    assert.throws(() => verify('editor'), /independent reviewer/i);
    const evidence = f.app.findRecordById('evidence', result.evidence); evidence.set('owner', 'admin'); f.app.save(evidence);
    assert.throws(() => verify('admin'), /independent reviewer/i);
    const verified = verify('owner');
    assert.equal(verified.getString('mission_reviewed_by'), 'owner');
    assert.equal(verified.getString('status'), 'verified');
});

test('proposal retry identity survives a closed dialog and recovers the original saved mission', async () => {
    const f = setup(); const signal = { id: f.input.signal, updated: f.input.signal_updated };
    let loseNext = true; const requests = [];
    const client = { authStore: { record: { id: 'editor' } }, async send(_path, config) {
        requests.push(config.body);
        const result = plain(f.service.command(f.event('editor', config.body)));
        if (loseNext) { loseNext = false; throw new Error('Synthetic response loss after save'); }
        return result;
    } };
    const open = () => createResearchClient({ client, accountId: 'editor', workspaceId: 'ws1',
        isCurrent: () => true, keyFactory: () => signalProposalKey(signal) });
    const first = await open().command('signal.propose', f.input);
    assert.equal(first.reason, 'uncertain');
    const recovered = await open().command('signal.propose', f.input);
    assert.equal(recovered.ok, true); assert.equal(recovered.result.replayed, true);
    assert.equal(requests[0].request_key, requests[1].request_key);
    assert.equal(f.data.evidence.filter((row) => row.mission === recovered.result.id).length, 1);
    client.authStore.record = { id: 'other-account' };
    assert.equal((await open().command('signal.propose', f.input)).reason, 'scope_changed');
});

test('proposal keys name saved revisions and reject invalid input without guessing', () => {
    const signal = { id: 'saved_signal_1', updated: '2026-09-20 12:00:00.001Z' };
    assert.equal(signalProposalKey(signal), signalProposalKey({ ...signal }));
    assert.notEqual(signalProposalKey(signal), signalProposalKey({ ...signal, updated: '2026-09-20 12:00:00.002Z' }));
    for (const item of [null, {}, { ...signal, id: '../other' }, { ...signal, updated: '' }, { ...signal, id: 'a'.repeat(64) }])
        assert.throws(() => signalProposalKey(item));
});

test('independent-review choices are typed and cannot change an approved plan in place', () => {
    const f = setup(); const result = f.propose(); const policy = f.load('mission-policy.js');
    const saved = f.app.findRecordById('missions', result.id);
    const plan = { version: 1, risk: 'A1', independent_review: true,
        ...Object.fromEntries(policy.PLAN_FIELDS.map((name) => [name, 'Fixture review ' + name])) };
    saved.set('mission_plan', plan); saved.set('status', 'approved'); saved.set('mission_approved_by', 'owner');
    saved.set('mission_approved_at', new Date().toISOString()); f.app.save(saved);
    const record = f.app.findRecordById('missions', result.id); record.set('mission_plan', { ...plan, independent_review: false });
    assert.throws(() => policy.enforce({ ...f.event('editor'), record, next() {} }, false));
    assert.ok(planIssues({ ...plan, independent_review: 'yes' }).length);
    record.set('mission_plan', { ...plan, independent_review: 'yes' });
    assert.throws(() => policy.enforce({ ...f.event('editor'), record, next() {} }, false), /current mission plan/);
});
