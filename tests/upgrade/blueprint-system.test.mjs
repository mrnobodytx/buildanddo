// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/blueprint-system.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/workspace-blueprints.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/workspace-blueprints.js
// DAG Node:    none
// Intent:      Verify workspace isolation, lease fences, immutable retry identity and typed blueprint persistence through actual handlers.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { plain, source } from './admin-fixture.mjs';
import { blueprintFixture, SCHEMA } from './blueprint-fixture.mjs';

const fails = (fn, status) => assert.throws(fn, (error) => error.status === status);
function claim(f, saved = f.upload()) {
    return { saved, claim: f.work('claim', { id: saved.record.submission }) };
}
function complete(f, leased, result = f.result, key = 'complete_blueprint_01') {
    return f.work('complete', { id: leased.claim.id, attempt: leased.claim.job.attempt, result, failure: '' },
        { revision: leased.claim.revision, key });
}

test('migration is replayable, native APIs stay locked and rollback retains PDFs and results', () => {
    const f = blueprintFixture(); const leased = claim(f); complete(f, leased);
    f.migration(SCHEMA).up();
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(f.collections.workspace_blueprints[key], null);
    assert.equal(f.collections.research_uploads.fields.getByName('asset').protected, true);
    assert.equal(f.collections.research_submissions.fields.getByName('mission').required, false);
    f.migration(SCHEMA).down();
    assert.equal(f.data.workspace_blueprints.length, 1); assert.equal(f.data.research_uploads.length, 1);
    fails(() => f.detail(leased.saved.record.id), 503);
    f.migration(SCHEMA).up();
    assert.equal(f.detail(leased.saved.record.id).record.blueprint.title, 'Portal');
    f.collections.workspace_blueprints.viewRule = '';
    assert.throws(() => f.migration(SCHEMA).up(), /custom/);
    assert.throws(() => f.migration(SCHEMA).down(), /custom/);
});

test('blueprint rollback does not stall ordinary mission research queue work', () => {
    const f = blueprintFixture(); f.upload(); const ordinary = f.submit();
    f.migration(SCHEMA).down();
    const queue = plain(f.service.queue(f.event('worker')));
    assert.deepEqual(queue.items.map((item) => item.id), [ordinary.id]);
    assert.equal(f.work('claim', { id: ordinary.id }).job.mission, 'mission1');
});

test('upload rejects unauthenticated viewers, foreign workspaces, bad names, multiple and oversized files', () => {
    const f = blueprintFixture();
    for (const actor of ['', 'viewer', 'outsider']) fails(() => f.upload({ actor }), 403);
    fails(() => f.upload({ workspace: 'ws2' }), 403);
    for (const options of [{ name: 'notes.txt' }, { name: '../file.pdf' }, { count: 2 }, { size: 0 }, { size: 20971521 },
        { fields: { input_sha256: 'invalid' } }, { fields: { authority: 'A3' } }]) fails(() => f.upload(options), 400);
    assert.equal(f.data.workspace_blueprints.length, 0);
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    fails(() => f.upload(), 403);
});

test('multipart retries retain one upload and submission and reject a changed source', () => {
    const f = blueprintFixture(); const key = 'same_blueprint_request01';
    const first = f.upload({ key }); const second = f.upload({ key });
    assert.equal(first.record.id, second.record.id); assert.equal(second.replayed, true);
    assert.equal(f.data.research_uploads.length, 1); assert.equal(f.data.research_submissions.length, 1);
    fails(() => f.upload({ key, bytes: Buffer.from('another PDF') }), 409);
    fails(() => f.upload({ key, name: 'renamed.pdf' }), 409);
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    fails(() => f.upload({ key }), 403);
});

test('missing capabilities retain input and retry uses the current configured worker', () => {
    const f = blueprintFixture(); f.env.value = '';
    const first = f.upload();
    assert.equal(first.record.status, 'blocked');
    assert.equal(first.record.blueprint, null);
    f.env.value = JSON.stringify(f.registered);
    const retry = f.blueprintCommand(first.record.id, 'retry', 1);
    assert.equal(retry.record.status, 'queued');
    assert.equal(f.work('claim', { id: first.record.submission }, { revision: 2 }).job.mode, 'blueprint');
});

test('queued blueprint uses the shared worker lease and persists structured results atomically', () => {
    const f = blueprintFixture(); const leased = claim(f);
    assert.equal(leased.claim.job.mode, 'blueprint'); assert.equal(leased.claim.job.mission, '');
    assert.equal(leased.claim.job.expected_sha256, f.result.input_sha256);
    const done = complete(f, leased);
    assert.equal(done.status, 'ready');
    const stored = f.detail(leased.saved.record.id, 'viewer').record;
    assert.deepEqual(stored.blueprint, f.result.blueprint);
    assert.deepEqual(stored.evaluation, f.result.evaluation);
    assert.equal(stored.text, f.result.text);
    assert.equal(f.data.missions.length, 2);
    assert.equal(f.data.evidence.length, 0);
    const event = f.data.research_events.at(-1);
    assert.equal(Object.keys(event.command.payload.result).join(','), 'sha256');
    assert.equal(complete(f, leased).replayed, true);
    const changed = plain(f.result); changed.blueprint.title = 'Different result';
    fails(() => complete(f, leased, changed), 409);
    fails(() => f.detail(stored.id, 'outsider'), 403);
    fails(() => f.detail(stored.id, 'otherowner', 'ws2'), 403);
});

test('source hashes, known references, score bounds and A0 non-verification are enforced at storage', () => {
    for (const mutate of [
        (r) => { r.input_sha256 = 'b'.repeat(64); },
        (r) => { r.blueprint.verified = true; },
        (r) => { r.blueprint.requirements[0].section = 'missing'; },
        (r) => { r.blueprint.components[0].dependencies = ['missing']; },
        (r) => { r.evaluation.authority = 'A1'; },
        (r) => { r.evaluation.verified = true; },
        (r) => { r.evaluation.requirements = []; },
        (r) => { r.evaluation.requirements[0].risk = 11; r.evaluation.requirements[0].abstained = ['feasibility', 'complexity', 'component_type', 'automatable']; },
        (r) => { r.evaluation.overall.average_scores.risk = 0; },
    ]) {
        const f = blueprintFixture(); const leased = claim(f); const result = plain(f.result); mutate(result);
        fails(() => complete(f, leased, result), 400);
        assert.equal(f.detail(leased.saved.record.id).record.status, 'processing');
        assert.equal(f.data.workspace_blueprints[0].result, null);
    }
});

test('revoked owners, stale leases, disabled bindings and cancelled jobs cannot save results', () => {
    for (const mutate of [
        (f) => f.app.delete(f.app.findRecordById('workspace_members', 'editormember')),
        (f, lease) => f.blueprintCommand(lease.saved.record.id, 'cancel', lease.claim.revision),
        (f, lease) => { const row = f.app.findRecordById('research_submissions', lease.claim.id); row.set('lease_until', '2020-01-01'); f.app.save(row); },
        (f) => { const row = f.data.workspace_integrations.find((item) => item.provider === 'firecrawl'); f.seed('workspace_integrations', { ...row, desired_enabled: false }); },
    ]) {
        const f = blueprintFixture(); const leased = claim(f); mutate(f, leased);
        assert.throws(() => complete(f, leased), (error) => [403, 409].includes(error.status));
        assert.equal(f.data.workspace_blueprints[0].result, null);
    }
});

test('protected PDFs require current workspace membership or the existing active worker lease', () => {
    const f = blueprintFixture(); const saved = f.upload();
    const submission = f.app.findRecordById('research_submissions', saved.record.submission);
    const row = f.app.findRecordById('research_uploads', submission.getString('upload'));
    const download = (actor) => f.policy.download({ ...f.event(actor), record: row, next: () => true });
    assert.equal(download('viewer'), true);
    fails(() => download('outsider'), 403); fails(() => download('worker'), 403);
    const leased = claim(f, saved);
    assert.equal(download('worker'), true);
    complete(f, leased);
    fails(() => download('worker'), 403);
    fails(() => f.policy.removeUpload({ ...f.event('editor'), record: row, next: () => undefined }), 409);
});

test('flat fallback remains available without invented blueprint or evaluation', () => {
    const f = blueprintFixture(); const leased = claim(f);
    const result = { ...f.result, processor: 'local-document', blueprint: null, blueprint_failure: 'no_requirements', evaluation: null };
    complete(f, leased, result);
    const stored = f.detail(leased.saved.record.id).record;
    assert.equal(stored.status, 'ready'); assert.equal(stored.text, result.text);
    assert.equal(stored.blueprint, null); assert.equal(stored.blueprint_failure, 'no_requirements');
});

test('ordinary research keeps mission requirements, small results and its own list', () => {
    const f = blueprintFixture(); const saved = f.upload();
    fails(() => f.submit({ mission: '' }), 400);
    f.submit();
    const list = plain(f.service.snapshot(f.event('editor')));
    assert.equal(list.items.length, 1); assert.equal(list.items[0].mission, 'mission1');
    const blueprints = plain(f.blueprint.snapshot(f.event('viewer')));
    assert.equal(blueprints.items.length, 1); assert.equal(blueprints.items[0].id, saved.record.id);
    assert.equal(blueprints.items[0].blueprint, undefined);
    const leased = claim(f, saved); complete(f, leased);
    fails(() => f.command('attach', { id: leased.claim.id, note: 'Reviewed' }, { revision: 3 }), 400);
});

test('routes bind native auth, bounded multipart, no-store and asynchronous receipts', () => {
    const registered = [];
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/blueprint.pb.js'), {
        routerAdd: (...values) => registered.push(values), __hooks: '/hooks',
        $apis: { requireAuth: (collection) => ({ auth: collection }), bodyLimit: (bytes) => ({ limit: bytes }) },
        require: () => ({ upload: () => ({ record: { status: 'queued' } }) }),
    });
    assert.equal(registered.length, 4);
    assert.ok(registered.every((row) => row[3].auth === 'users'));
    assert.equal(registered[0][4].limit, 22020096);
    const headers = {};
    const result = registered[0][2]({ response: { header: () => ({ set: (key, value) => { headers[key] = value; } }) },
        json: (status, body) => ({ status, body }) });
    assert.equal(result.status, 202); assert.equal(headers['Cache-Control'], 'no-store');
});
