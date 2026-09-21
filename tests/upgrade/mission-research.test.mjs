// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/mission-research.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     tests/upgrade/research-fixture.mjs, apps/pocketbase/pb_hooks/research.pb.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON tests/upgrade/research-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/research.pb.js
// DAG Node:    none
// Intent:      Prove source-connected identity, upload, lease, retry and evidence boundaries across website and Discord intake.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { source, plain } from './admin-fixture.mjs';
import { researchFixture, SCHEMA, DISCORD } from './research-fixture.mjs';

const fails = (fn, status) => assert.throws(fn, (e) => e.status === status);
function ready(f, submission = f.submit()) {
    const claim = f.work('claim', { id: submission.id });
    const complete = f.work('complete', { id: submission.id, attempt: claim.job.attempt, result: f.result, failure: '' }, { revision: claim.revision });
    return { submission, claim, complete };
}

test('research migration replays, preserves protected files/history on down and rejects custom access', () => {
    const f = researchFixture(); const row = f.submit();
    f.migration(SCHEMA).up();
    assert.equal(f.collections.research_uploads.fields.getByName('asset').protected, true);
    assert.equal(f.collections.research_submissions.createRule, null);
    f.migration(SCHEMA).down();
    assert.equal(f.data.research_submissions[0].id, row.id);
    fails(() => f.submit(), 503);
    f.migration(SCHEMA).up();
    f.collections.research_uploads.fields.getByName('asset').protected = false;
    assert.throws(() => f.migration(SCHEMA).up(), /custom/);
    assert.throws(() => f.migration(SCHEMA).down(), /protection/);
});

test('intake requires current writable membership and same-workspace readable missions', () => {
    const f = researchFixture();
    for (const actor of ['', 'viewer', 'outsider']) fails(() => f.submit({}, { actor }), 403);
    fails(() => f.submit({ mission: 'mission2' }), 403);
    f.denied.add('mission1'); fails(() => f.submit(), 403); f.denied.clear();
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    fails(() => f.submit(), 403);
    assert.equal(f.data.research_submissions.length, 0);
});

test('disabled or missing capabilities are durable blocked submissions, never successful parses', () => {
    const f = researchFixture(); f.env.value = '';
    const saved = f.submit(); assert.equal(saved.status, 'blocked');
    const data = f.service.detail(f.event('editor', {}, { id: saved.id })).record;
    assert.equal(data.result, null); assert.equal(data.failure, 'capability_unavailable');
    fails(() => f.work('claim', { id: saved.id }), 403);
    f.env.value = JSON.stringify(f.registered);
    const retried = f.command('retry', { id: saved.id }, { revision: 1 }); assert.equal(retried.status, 'queued');
});

test('submission retries preserve identity across reordered JSON and reject changed intent', () => {
    const f = researchFixture(); const key = 'same_research_request_01';
    const first = f.submit({}, { key }); const second = f.submit({}, { key });
    assert.equal(first.id, second.id); assert.equal(second.replayed, true);
    fails(() => f.submit({ title: 'Changed' }, { key }), 409);
    assert.equal(f.data.research_submissions.length, 1); assert.equal(f.data.research_events.length, 1);
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    fails(() => f.submit({}, { key }), 403);
});

test('source input rejects unsafe URLs, forged fields and malformed file references before work', () => {
    const f = researchFixture();
    for (const input of ['http://buildanddo.com', 'https://127.0.0.1/x', 'https://[::1]/', 'https://host.local/',
        'https://user:pass@buildanddo.com', 'https://buildanddo.com:8443/', 'https://buildanddo.com/#hidden'])
        fails(() => f.submit({ kind: 'url', input }), 400);
    fails(() => f.submit({ result: f.result }), 400);
    fails(() => f.submit({ kind: 'document', input: '', upload: 'missing' }), 404);
    fails(() => f.submit({ input: 'x'.repeat(501) }), 400);
    assert.equal(f.data.research_submissions.length, 0);
});

test('both entry points propose normal missions without advancing approval or verification', () => {
    const f = researchFixture(); const payload = { title: 'Investigate reminder evidence', description: 'Compare documented findings.' };
    const a = f.command('mission.propose', payload);
    const b = f.bridge(f.body('mission.propose', payload));
    for (const { id } of [a, b]) {
        const mission = f.app.findRecordById('missions', id);
        assert.equal(mission.getString('owner'), 'editor'); assert.equal(mission.getString('status'), 'proposed');
        assert.equal(mission.getString('mission_approved_by'), '');
        assert.equal(JSON.parse(mission.getString('mission_plan')).version, 1);
    }
});

test('Discord uses the authenticated bot binding and existing OAuth account link, never submitted account roles', () => {
    const f = researchFixture(); const command = f.body('submit', f.input());
    for (const value of [{ actor: 'editor' }, { body: { guild_id: '99999999999999999' } },
        { body: { channel_id: '99999999999999999' } }, { body: { discord_user_id: '99999999999999999' } },
        { body: { owner: 'owner' } }]) fails(() => f.bridge(command, value), value.body?.owner ? 400 : 403);
    const saved = f.bridge(command);
    const row = f.app.findRecordById('research_submissions', saved.id);
    assert.equal(row.getString('owner'), 'editor'); assert.equal(row.getString('origin'), 'discord');
    f.app.delete(f.app.findRecordById('_externalAuths', 'discordlink'));
    fails(() => f.bridge(command), 403);
});

test('foreign OAuth collections, revoked users and changed Discord integration bindings cannot submit', () => {
    const f = researchFixture(); const command = { action: 'missions', mission: '', page: 1 };
    f.seed('_externalAuths', { id: 'discordlink', provider: 'discord', providerId: DISCORD, collectionRef: 'otherusers', recordRef: 'editor' });
    fails(() => f.bridge(command), 403);
    f.seed('_externalAuths', { id: 'discordlink', provider: 'discord', providerId: DISCORD, collectionRef: f.collections.users.id, recordRef: 'viewer' });
    assert.equal(f.bridge(command).items[0].id, 'mission1');
    fails(() => f.bridge(f.body('submit', f.input())), 403);
    f.command = f.command.bind(f);
    const config = f.data.workspace_integrations.find((r) => r.provider === 'discord');
    f.seed('workspace_integrations', { ...config, desired_enabled: false });
    fails(() => f.bridge(command), 403);
});

test('one processing lease wins and retries do not create extra attempts', () => {
    const f = researchFixture(); const job = f.submit(); const key = 'durable_claim_request01';
    const claim = f.work('claim', { id: job.id }, { key });
    assert.equal(f.work('claim', { id: job.id }, { key }).job.attempt, 1);
    fails(() => f.work('claim', { id: job.id }), 409);
    fails(() => f.work('claim', { id: job.id }, { actor: 'editor' }), 403);
    assert.equal(claim.job.owner, 'editor'); assert.equal(claim.job.binding, 'research');
});

test('cancelled or replaced leases reject delayed processor results', () => {
    const f = researchFixture(); const first = f.submit(); const claim = f.work('claim', { id: first.id });
    f.command('cancel', { id: first.id }, { revision: claim.revision });
    fails(() => f.work('complete', { id: first.id, attempt: claim.job.attempt, result: f.result, failure: '' }, { revision: claim.revision }), 409);
    const second = f.submit(); const before = f.work('claim', { id: second.id });
    const record = f.app.findRecordById('research_submissions', second.id); record.set('lease_until', '2020-01-01T00:00:00.000Z'); f.app.save(record);
    const after = f.work('claim', { id: second.id }, { revision: before.revision });
    assert.equal(after.job.attempt, 2);
    fails(() => f.work('complete', { id: second.id, attempt: 1, result: f.result, failure: '' }, { revision: before.revision }), 409);
});

test('revoked submitters and changed or disabled processor bindings cannot finalize work', () => {
    const f = researchFixture(); const job = f.submit(); const claim = f.work('claim', { id: job.id });
    const payload = { id: job.id, attempt: 1, result: f.result, failure: '' };
    f.env.value = JSON.stringify([{ ...f.registered[0], worker_user: 'worker2' }]);
    fails(() => f.work('complete', payload, { revision: claim.revision }), 403);
    f.env.value = JSON.stringify(f.registered);
    const config = f.data.workspace_integrations.find((r) => r.provider === 'firecrawl');
    f.seed('workspace_integrations', { ...config, revision: config.revision + 1 });
    fails(() => f.work('complete', payload, { revision: claim.revision }), 409);
    f.seed('workspace_integrations', config);
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    fails(() => f.work('complete', payload, { revision: claim.revision }), 403);
});

test('completion persists the actual extraction, and explicit review creates exactly one observed evidence record', () => {
    const f = researchFixture(); const { submission, complete } = ready(f);
    assert.equal(f.data.evidence.length, 0);
    const saved = f.command('attach', { id: submission.id, note: 'I reviewed this source; it is relevant to reminders.' },
        { revision: complete.revision, key: 'attach_receipt_request01' });
    assert.equal(saved.status, 'attached'); assert.ok(saved.evidence);
    const evidence = f.app.findRecordById('evidence', saved.evidence);
    assert.equal(evidence.getString('type'), 'observed'); assert.equal(evidence.getString('mission'), 'mission1');
    assert.equal(evidence.getString('owner'), 'editor'); assert.equal(f.app.findRecordById('missions', 'mission1').getString('status'), 'running');
    assert.equal(f.command('attach', { id: submission.id, note: 'I reviewed this source; it is relevant to reminders.' },
        { revision: complete.revision, key: 'attach_receipt_request01' }).evidence, saved.evidence);
    assert.equal(f.data.evidence.length, 1);
    assert.equal(f.bridge({ action: 'evidence', mission: 'mission1', page: 1 }).items[0].id, evidence.id);
});

test('audit persistence failure rolls back evidence promotion and its submission state together', () => {
    const f = researchFixture(); const { submission, complete } = ready(f); const save = f.app.save.bind(f.app);
    f.app.save = (r) => { if (r.collection?.().name === 'research_events') throw new Error('receipt persistence failed'); return save(r); };
    assert.throws(() => f.command('attach', { id: submission.id, note: 'Reviewed the source.' }, { revision: complete.revision }), /persistence/);
    assert.equal(f.data.evidence.length, 0);
    assert.equal(f.app.findRecordById('research_submissions', submission.id).getString('status'), 'ready');
});

test('malformed parser results and fabricated failure payloads leave the lease unchanged', () => {
    const f = researchFixture(); const job = f.submit(); const claim = f.work('claim', { id: job.id });
    for (const result of [{ ...f.result, text: '' }, { ...f.result, input_sha256: 'unknown' }, { ...f.result, verified: true },
        { ...f.result, citations: [{ title: 'Unsafe', url: 'https://127.0.0.1/' }] }])
        fails(() => f.work('complete', { id: job.id, attempt: 1, result, failure: '' }, { revision: claim.revision }), 400);
    fails(() => f.work('complete', { id: job.id, attempt: 1, result: f.result, failure: 'timeout' }, { revision: claim.revision }), 400);
    const complete = f.work('complete', { id: job.id, attempt: 1, result: null, failure: 'timeout' }, { revision: claim.revision });
    assert.equal(complete.status, 'failed');
    fails(() => f.command('attach', { id: job.id, note: 'Cannot call this evidence.' }, { revision: complete.revision }), 409);
});

test('native upload hooks derive scope, file type and size and reject forged metadata and retained deletion', () => {
    const f = researchFixture(); let count = 0;
    const record = f.record('research_uploads', { workspace: 'ws1', owner: 'editor', processor: 'outsider', origin: 'discord', size: 1 });
    const event = { ...f.event('editor'), record, findUploadedFiles: () => [{ originalName: 'interview.mp3', size: 1024 }], next: () => ++count };
    f.policy.upload(event); f.app.save(record);
    assert.equal(record.getString('origin'), 'website'); assert.equal(record.getString('processor'), '');
    assert.equal(record.getString('kind'), 'audio'); assert.equal(record.get('size'), 1024);
    fails(() => f.policy.upload({ ...event, findUploadedFiles: () => [{ originalName: '../file.mp3', size: 12 }] }), 400);
    fails(() => f.policy.upload({ ...event, findUploadedFiles: () => [{ originalName: 'big.mp4', size: 20971521 }] }), 400);
    fails(() => f.policy.upload({ ...event, auth: f.app.findRecordById('users', 'viewer') }), 403);
    f.submit({ kind: 'audio', input: '', upload: record.id });
    fails(() => f.policy.removeUpload(event), 409); assert.equal(count, 1);
});

test('file downloads require current membership or a matching current worker lease', () => {
    const f = researchFixture(); const file = f.seed('research_uploads', { id: 'upload1', workspace: 'ws1', owner: 'editor', kind: 'document', asset: 'source.txt' });
    const download = (actor) => f.policy.download({ ...f.event(actor), record: file, next: () => 'allowed' });
    assert.equal(download('editor'), 'allowed'); fails(() => download('worker'), 403); fails(() => download('outsider'), 403);
    const job = f.submit({ kind: 'document', input: '', upload: file.id }); const claim = f.work('claim', { id: job.id });
    assert.equal(download('worker'), 'allowed');
    assert.equal(download('viewer'), 'allowed');
    f.denied.add('mission1');
    for (const actor of ['editor', 'viewer', 'worker']) fails(() => download(actor), 403);
    f.denied.clear();
    assert.equal(download('editor'), 'allowed');
    f.command('cancel', { id: job.id }, { revision: claim.revision }); fails(() => download('worker'), 403);
    const unused = f.seed('research_uploads', { id: 'upload2', workspace: 'ws1', owner: 'editor', kind: 'document', asset: 'unused.txt' });
    fails(() => f.policy.download({ ...f.event('viewer'), record: unused, next: () => 'allowed' }), 403);
});

test('research lists and detail respect foreign scope, and unavailable capabilities remain explicit', () => {
    const f = researchFixture(); const saved = f.submit();
    const list = f.service.snapshot(f.event('viewer')); assert.equal(list.items[0].id, saved.id);
    assert.equal(list.items[0].result, undefined); assert.equal(list.capabilities.kinds.length, 5);
    fails(() => f.service.detail(f.event('otherowner', {}, { workspace: 'ws2', id: saved.id })), 403);
    const minimal = f.bridge({ action: 'submission', id: saved.id }); assert.equal(minimal.result, undefined);
    f.denied.add('mission1'); assert.equal(f.service.snapshot(f.event('viewer')).items.length, 0); f.denied.clear();
    f.env.value = 'broken'; fails(() => f.service.snapshot(f.event('editor')), 503);
});

test('bot preflight, attachment recovery and current account links prevent duplicate or reattributed uploads', () => {
    const f = researchFixture(); const access = f.bridge({ action: 'access' }); assert.equal(access.can_write, true); assert.equal(access.link_id, 'discordlink');
    fails(() => f.bridge(f.body('submit', f.input()), { body: { link_id: 'oldlink' } }), 403);
    fails(() => f.bridge(f.body('submit', f.input()), { body: { link_id: '' } }), 403);
    const raw = { discord_user_id: '34567890123456789', guild_id: '12345678901234567', channel_id: '23456789012345678', link_id: 'discordlink', source_ref: '56789012345678901' };
    const event = { ...f.event('bot', raw), findUploadedFiles: () => [{ originalName: 'source.txt', size: 20 }] };
    const uploaded = plain(f.service.discordUpload(event)); const replay = plain(f.service.discordUpload(event));
    assert.equal(uploaded.id, replay.id); assert.equal(replay.replayed, true); assert.equal(f.data.research_uploads.length, 1);
    assert.equal(f.bridge({ action: 'upload', source_ref: raw.source_ref }).id, uploaded.id);
    fails(() => f.service.discordUpload({ ...event, findUploadedFiles: () => [{ originalName: 'different.txt', size: 20 }] }), 409);
    const submission = f.submit({ kind: 'document', input: '', upload: uploaded.id });
    assert.equal(f.bridge({ action: 'submissions', mission: 'mission1', page: 1 }).items[0].id, submission.id);
    const queue = f.service.queue(f.event('worker')); assert.equal(queue.items[0].id, submission.id);
});

test('research routes use native user auth, bounded body sizes and protected download hooks', () => {
    const routes = [], hooks = [];
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/research.pb.js'), {
        routerAdd: (...args) => routes.push(args), onRecordCreateRequest: (...args) => hooks.push(args),
        onRecordDeleteRequest: (...args) => hooks.push(args), onFileDownloadRequest: (...args) => hooks.push(args),
        onRecordViewRequest: (...args) => hooks.push(args),
        $apis: { requireAuth: (name) => ({ auth: name }), bodyLimit: (size) => ({ limit: size }) },
    });
    assert.equal(routes.length, 7); assert.equal(hooks.length, 4);
    assert.ok(routes.every((row) => row[3].auth === 'users'));
    assert.ok(routes.filter((row) => row[0] === 'POST').every((row) => row[4].limit > 0));
    assert.equal(plain(routes.at(-1)[4]).limit, 22020096);
});
