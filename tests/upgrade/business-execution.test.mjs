// ─── CGRF Header ───────────────────────────────────────────────
// File:         tests/upgrade/business-execution.test.mjs
// Stage:        08_TEST
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/business-actions.js, tests/upgrade/admin-fixture.mjs
// EnumType:     Test
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/business-actions.js; DEPENDS_ON tests/upgrade/admin-fixture.mjs
// DAG Node:     none
// Intent:       Exercise approved effects, source provenance, leases, uncertain outcomes and retained rollback with production hooks.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import test from 'node:test';
import { fixture, plain, source } from './admin-fixture.mjs';
const migration = 'apps/pocketbase/pb_migrations/1790800000_business_execution.js';
const bindings = [{ workspace: 'ws1', provider: 'firecrawl', binding: 'public-read', worker: 'editor' },
    { workspace: 'ws1', provider: 'n8n', binding: 'shop-actions', worker: 'editor', operations: ['prepare-report'] }];
const sha = (value) => createHash('sha256').update(value).digest('hex');
const erp = { provider: 'erp', binding: '', max_seconds: 5, parameters: { title: 'Follow up on customer request',
    description: 'Synthetic bounded acceptance task', objective: '', contact: '', priority: 'normal', due_date: '' } };
const n8n = { provider: 'n8n', binding: 'shop-actions', max_seconds: 30, parameters: { operation: 'prepare-report', input: { title: 'Synthetic request' } } };
function setup() {
    const environment = {};
    const f = fixture({ runtime: { $security: { sha256: sha, randomString: (length) => randomBytes(length).toString('hex').slice(0, length) },
        toString: String, $os: { getenv: (name) => environment[name] ?? (name === 'BUILDANDDO_BUSINESS_BINDINGS' ? JSON.stringify(bindings) : ''),
            readFile: (path) => { assert.equal(path, '/pb_migrations/data/starter-tutorials.json'); return source('apps/pocketbase/pb_migrations/data/starter-tutorials.json'); } } } });
    f.environment = environment;
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up(); f.migration(migration).up();
    let key = 0;
    f.command = (action, payload, revision = 0, actor = 'owner', retryKey = '') => f.load('business-actions.js').command(f.event(actor,
        { action, payload, revision, request_key: retryKey || `business-request-${String(++key).padStart(5, '0')}` }));
    f.job = (id) => plain(f.load('business-actions.js').output(f.app.findRecordById('business_jobs', id)));
    f.edit = (collection, id, values) => { const record = f.app.findRecordById(collection, id); for (const [key, value] of Object.entries(values)) record.set(key, value); f.app.save(record); };
    f.integration = (provider, enabled = true) => f.seed('workspace_integrations', { id: provider, workspace: 'ws1', provider,
        configuration: { mode: provider === 'n8n' ? 'reviewed_run' : 'read', binding: provider === 'n8n' ? 'shop-actions' : 'public-read' },
        desired_enabled: enabled, revision: 1, observed_at: new Date().toISOString(), observed_state: enabled ? 'healthy' : 'disabled',
        receipt_ref: 'synthetic-health-observation', applied_revision: 1 });
    return f;
}
function workflow(f, action = erp) {
    const p = f.load('mission-policy.js'), plan = { version: 1, risk: 'A1', independent_review: true };
    for (const key of p.PLAN_FIELDS) plan[key] = 'Bounded synthetic local acceptance';
    f.seed('missions', { id: 'businessmission', workspace: 'ws1', owner: 'owner', title: 'Customer follow-up', status: 'running',
        mission_plan: plan, mission_approved_by: 'owner', mission_approved_at: new Date().toISOString() });
    f.seed('workflows', { id: 'businessflow', workspace: 'ws1', owner: 'owner', name: 'Approved business action', description: '', status: 'active',
        steps: [{ id: 'approval', name: 'Review exact task and scope', kind: 'approval', detail: '' }, { id: 'execute', name: 'Perform bounded action', kind: 'execute', detail: '', action }] });
    const handler = f.load('workflow-runs.js');
    const initial = handler.start(f.event('owner', { workspace: 'ws1', workflow: 'businessflow', mission: 'businessmission', request_key: 'business-run-start-key' })).record;
    return handler.advance(f.event('admin', { workspace: 'ws1', request_key: 'business-run-approve-key', revision: 1,
        action: 'step', step_id: 'approval', outcome: 'approved', observation: 'Approve frozen synthetic inputs and scope', source: '' }, { id: initial.id })).record;
}
function enqueue(f, run) { return f.command('action.enqueue', { run: run.id, step_id: 'execute' }, run.revision); }
function dispatched(f, run) {
    const queued = enqueue(f, run), claimed = f.command('action.claim', { id: queued.id }, queued.revision, 'editor');
    return f.command('action.begin', { id: queued.id, lease_id: claimed.lease_id }, claimed.revision, 'editor');
}
const n8nResult = (job) => ({ status: 'succeeded', observed_at: new Date().toISOString(), receipt_ref: 'synthetic-n8n/execution-1',
    output: { effect_key: job.effect_key, execution_id: 'execution-1', summary: 'Synthetic provider reports prepared report' } });
test('ERP action writes one task, evidence and run event under the frozen approval', () => {
    const f = setup(), run = workflow(f), job = enqueue(f, run);
    assert.equal(job.status, 'succeeded'); assert.equal(f.data.erp_tasks.length, 1);
    assert.equal(f.data.erp_tasks[0].execution, job.id); assert.equal(f.data.erp_tasks[0].mission, 'businessmission');
    assert.equal(f.data.erp_tasks[0].evidence, job.evidence);
    assert.equal(f.app.findRecordById('workflow_runs', run.id).getString('status'), 'completed');
    assert.equal(enqueue(f, run).id, job.id); assert.equal(f.data.erp_tasks.length, 1);
    assert.equal(job.result.run_advanced, true); assert.match(job.result_sha256, /^[a-f0-9]{64}$/);
});
test('business effects roll back when their command receipt cannot be stored', () => {
    const f = setup(), run = workflow(f); f.config.failAudit = true;
    const before = plain(f.data); assert.throws(() => enqueue(f, run), /audit storage/); assert.deepEqual(f.data, before);
});
test('native receipts freeze the declared release and changed deployments cannot dispatch old approvals', () => {
    const f = setup(), release = { candidate_sha: 'a'.repeat(40), source_sha256: 'b'.repeat(64), artifact_tree_sha256: 'c'.repeat(64),
        dispatch: 'synthetic-dispatch', environment: 'fixture' };
    f.environment.BUILDANDDO_RELEASE_CONTEXT = JSON.stringify(release);
    f.integration('n8n'); const job = enqueue(f, workflow(f, n8n));
    assert.deepEqual(plain(job.release_context), release);
    const claimed = f.command('action.claim', { id: job.id }, job.revision, 'editor');
    f.environment.BUILDANDDO_RELEASE_CONTEXT = JSON.stringify({ ...release, candidate_sha: 'd'.repeat(40) });
    assert.throws(() => f.command('action.begin', { id: job.id, lease_id: claimed.lease_id }, claimed.revision, 'editor'), /declared release changed/);
    f.environment.BUILDANDDO_RELEASE_CONTEXT = JSON.stringify(release);
    assert.equal(f.command('action.begin', { id: job.id, lease_id: claimed.lease_id }, claimed.revision, 'editor').status, 'dispatched');
});
test('absent release identity stays unmeasured and malformed declarations stop effects', () => {
    const f = setup(), run = workflow(f);
    assert.equal(enqueue(f, run).release_context, null);
    for (const value of ['invalid', JSON.stringify({ candidate_sha: 'main' })]) {
        const other = setup(); other.environment.BUILDANDDO_RELEASE_CONTEXT = value;
        assert.throws(() => enqueue(other, workflow(other)), /release|declared action/);
        assert.equal(other.data.erp_tasks.length, 0);
    }
});
test('foreign ERP links and manual substitutes for executable steps are denied', () => {
    const f = setup(); f.seed('erp_contacts', { id: 'foreigncontact', workspace: 'ws2', owner: 'otherowner', name: 'Foreign' });
    const run = workflow(f, { ...erp, parameters: { ...erp.parameters, contact: 'foreigncontact' } });
    assert.throws(() => enqueue(f, run), /workspace/); assert.equal(f.data.business_jobs.length, 0);
    assert.throws(() => f.load('workflow-runs.js').advance(f.event('owner', { workspace: 'ws1', request_key: 'manual-substitution-key',
        revision: run.revision, action: 'step', step_id: 'execute', outcome: 'passed', observation: 'Claim success', source: 'operator' }, { id: run.id })), /manual observation/);
});
test('worker registration, current roles, approval and connector revision bind dispatch', () => {
    const f = setup(); f.integration('n8n'); const run = workflow(f, n8n), job = enqueue(f, run);
    assert.throws(() => f.command('action.claim', { id: job.id }, job.revision, 'owner'), /registered/);
    const claimed = f.command('action.claim', { id: job.id }, job.revision, 'editor');
    f.edit('workspace_integrations', 'n8n', { revision: 2 });
    assert.throws(() => f.command('action.begin', { id: job.id, lease_id: claimed.lease_id }, claimed.revision, 'editor'), /configuration changed/);
    f.edit('workspace_integrations', 'n8n', { revision: 1 }); f.edit('missions', 'businessmission', { status: 'needs_attention' });
    assert.throws(() => f.command('action.begin', { id: job.id, lease_id: claimed.lease_id }, claimed.revision, 'editor'), /running/);
});
test('external result binds exact effect and cannot be replaced or delivered twice', () => {
    const f = setup(); f.integration('n8n'); const run = workflow(f, n8n), job = dispatched(f, run), value = n8nResult(job);
    assert.throws(() => f.command('action.complete', { id: job.id, lease_id: job.lease_id,
        result: { ...value, output: { ...value.output, effect_key: 'wrong' } } }, job.revision, 'editor'), /exact effect/);
    const done = f.command('action.complete', { id: job.id, lease_id: job.lease_id, result: value }, job.revision, 'editor');
    assert.equal(done.status, 'succeeded'); const count = f.data.evidence.length;
    assert.equal(f.command('action.complete', { id: job.id, lease_id: job.lease_id, result: value }, done.revision, 'editor').id, job.id);
    assert.equal(f.data.evidence.length, count);
    assert.throws(() => f.command('action.complete', { id: job.id, lease_id: job.lease_id,
        result: { ...value, receipt_ref: 'replacement' } }, done.revision, 'editor'), /cannot be replaced/);
});
test('timeouts retain HOLD and never make dispatched work claimable again', () => {
    const f = setup(); f.integration('n8n'); const job = dispatched(f, workflow(f, n8n));
    f.edit('business_jobs', job.id, { lease_until: '2000-01-01T00:00:00Z' });
    assert.throws(() => f.command('action.claim', { id: job.id }, job.revision, 'editor'), /undispatched/);
    const held = f.command('action.hold', { id: job.id, lease_id: job.lease_id, reason: 'provider_timeout' }, job.revision, 'editor');
    assert.equal(held.status, 'hold'); assert.throws(() => f.command('action.claim', { id: job.id }, held.revision, 'editor'), /undispatched/);
    assert.equal(f.command('action.reconcile', { id: job.id, lease_id: job.lease_id, result: n8nResult(job) }, held.revision, 'editor').status, 'succeeded');
});
test('late results after cancellation retain evidence without advancing the cancelled run', () => {
    const f = setup(); f.integration('n8n'); const run = workflow(f, n8n), job = dispatched(f, run);
    f.load('workflow-runs.js').advance(f.event('owner', { workspace: 'ws1', request_key: 'cancel-after-dispatch', revision: run.revision,
        action: 'cancel', step_id: '', outcome: '', observation: 'Cancel future work; dispatched outcome unknown', source: '' }, { id: run.id }));
    const held = f.job(job.id); assert.equal(held.status, 'hold');
    const result = f.command('action.reconcile', { id: job.id, lease_id: job.lease_id, result: n8nResult(job) }, held.revision, 'editor');
    assert.equal(result.result.run_advanced, false); assert.ok(result.evidence);
    assert.equal(f.app.findRecordById('workflow_runs', run.id).getString('status'), 'cancelled');
});
test('expired claims can recover before dispatch with a bounded attempt count', () => {
    const f = setup(); f.integration('n8n'); let job = enqueue(f, workflow(f, n8n));
    for (let i = 1; i <= 3; i++) { job = f.command('action.claim', { id: job.id }, job.revision, 'editor'); assert.equal(job.attempt, i);
        f.edit('business_jobs', job.id, { lease_until: '2000-01-01T00:00:00Z' }); }
    assert.throws(() => f.command('action.claim', { id: job.id }, job.revision, 'editor'), /claim limit/);
});
test('revoked submitters, viewers, foreign accounts and stale health cannot dispatch', () => {
    const f = setup(); f.integration('firecrawl');
    assert.throws(() => f.command('source.capture', { binding: 'public-read', url: 'https://www.python.org/' }, 0, 'viewer'), /role/);
    assert.throws(() => f.command('source.capture', { binding: 'public-read', url: 'https://www.python.org/' }, 0, 'outsider'), /member|role|workspace/);
    const job = f.command('source.capture', { binding: 'public-read', url: 'https://www.python.org/' }, 0, 'admin');
    const claimed = f.command('action.claim', { id: job.id }, job.revision, 'editor');
    f.edit('workspace_integrations', 'firecrawl', { observed_at: '2000-01-01T00:00:00Z' });
    assert.throws(() => f.command('action.begin', { id: job.id, lease_id: claimed.lease_id }, claimed.revision, 'editor'), /fresh healthy/);
    f.app.delete(f.app.findRecordById('workspace_members', 'adminmember'));
    assert.throws(() => f.command('action.begin', { id: job.id, lease_id: claimed.lease_id }, claimed.revision, 'editor'), /member|role|workspace/);
});
test('source captures retain provenance, reject altered bytes and deduplicate identical observations', () => {
    const f = setup(); f.integration('firecrawl');
    for (let i = 0; i < 2; i++) {
        const queued = f.command('source.capture', { binding: 'public-read', url: 'https://www.python.org/' });
        const claimed = f.command('action.claim', { id: queued.id }, queued.revision, 'editor');
        const job = f.command('action.begin', { id: queued.id, lease_id: claimed.lease_id }, claimed.revision, 'editor');
        const result = { status: 'succeeded', observed_at: new Date().toISOString(), receipt_ref: 'synthetic-firecrawl/read',
            output: { url: 'https://www.python.org/', title: 'Python', text: 'Synthetic captured text', content_sha256: sha('Synthetic captured text'), truncated: false } };
        assert.throws(() => f.command('action.complete', { id: job.id, lease_id: job.lease_id,
            result: { ...result, output: { ...result.output, text: 'Changed' } } }, job.revision, 'editor'), /digest/);
        assert.equal(f.command('action.complete', { id: job.id, lease_id: job.lease_id, result }, job.revision, 'editor').status, 'succeeded');
    }
    assert.equal(f.data.signals.length, 1); assert.equal(f.data.signals[0].ingest_url, 'https://www.python.org/');
    assert.equal(f.data.signals[0].confidence, 0); assert.equal(f.data.signals[0].state, 'new'); assert.equal(f.data.business_jobs.length, 2);
});
test('connector observations need matching worker, revision, state, freshness and receipt', () => {
    const f = setup(); f.integration('firecrawl');
    const p = { provider: 'firecrawl', binding: 'public-read', state: 'healthy', observed_at: new Date().toISOString(), receipt_ref: 'synthetic-provider-probe' };
    assert.throws(() => f.command('integration.observe', p, 1), /registered/);
    assert.throws(() => f.command('integration.observe', p, 2, 'editor'), /configuration changed/);
    assert.throws(() => f.command('integration.observe', { ...p, observed_at: '2099-01-01T00:00:00Z' }, 1, 'editor'), /current observation/);
    assert.equal(f.command('integration.observe', p, 1, 'editor').state, 'healthy');
    f.edit('workspace_integrations', 'firecrawl', { desired_enabled: false, revision: 2 });
    assert.throws(() => f.command('integration.observe', p, 2, 'editor'), /requested connector/);
    assert.equal(f.command('integration.observe', { ...p, state: 'disabled', observed_at: new Date().toISOString() }, 2, 'editor').state, 'disabled');
});
test('worker polling excludes terminal history and other bindings before bounded pagination', () => {
    const f = setup(); f.integration('firecrawl');
    const job = f.command('source.capture', { binding: 'public-read', url: 'https://www.python.org/' });
    for (let i = 0; i < 210; i++) f.seed('business_jobs', { workspace: 'ws1', provider: 'firecrawl', binding: 'public-read', status: 'succeeded',
        created: '2099-01-01T00:00:00Z', id: 'history' + i });
    const query = { worker: '1', provider: 'firecrawl', binding: 'public-read' };
    const page = f.load('business-actions.js').list(f.event('editor', {}, { query }));
    assert.deepEqual(plain(page.items).map((item) => item.id), [job.id]); assert.equal(page.has_more, false);
    assert.throws(() => f.load('business-actions.js').list(f.event('owner', {}, { query })), /registered/);
    assert.throws(() => f.load('business-actions.js').list(f.event('editor', {}, { query: { ...query, binding: 'unregistered' } })), /registered/);
});
test('retained rollback disables execution without removing receipts or task links', () => {
    const f = setup(), run = workflow(f), job = enqueue(f, run); f.migration(migration).down();
    assert.throws(() => enqueue(f, run), /schema/); assert.equal(f.data.erp_tasks[0].execution, job.id);
    f.migration(migration).up(); assert.equal(enqueue(f, run).id, job.id);
    f.collections.business_jobs.listRule = ''; assert.throws(() => enqueue(f, run), /access and identity/);
});
test('imported executable actions cannot contain arbitrary endpoints or unsupported fields', () => {
    const f = setup(), p = f.load('business-action-policy.js');
    for (const url of ['http://example.org', 'https://127.0.0.1/', 'https://localhost/', 'https://u:p@public.org', 'https://public.org/#x'])
        assert.throws(() => p.publicUrl(url), /public HTTPS/);
    assert.throws(() => p.action({ ...n8n, parameters: { ...n8n.parameters, endpoint: 'https://attacker.org/' } }), /declared action/);
    f.integration('n8n'); assert.throws(() => enqueue(f, workflow(f, { ...n8n, parameters: { ...n8n.parameters, operation: 'delete-account' } })), /registered/);
});

test('execution receipts respect stricter native record visibility including retry responses', () => {
    const f = setup(), run = workflow(f), job = enqueue(f, run);
    assert.equal(f.load('business-actions.js').list(f.event()).items[0].id, job.id);
    f.denied.add('businessmission');
    assert.deepEqual(plain(f.load('business-actions.js').list(f.event()).items), []);
    assert.throws(() => enqueue(f, run), /no longer readable/);
    assert.equal(f.data.erp_tasks.length, 1);
});
test('provider evidence and linked verified missions cannot be deleted or rewritten behind a receipt', () => {
    const f = setup(), run = workflow(f), job = enqueue(f, run);
    const evidence = f.app.findRecordById('evidence', job.evidence);
    const e = { ...f.event('owner'), record: evidence, next: () => { throw new Error('Should not persist a change'); } };
    assert.throws(() => f.load('evidence-policy.js').remove(e), /Execution evidence/);
    evidence.set('content', 'Unrelated replacement');
    assert.throws(() => f.load('evidence-policy.js').enforce(e, false), /Execution evidence/);
    const missionEvent = { ...f.event('owner'), record: f.app.findRecordById('missions', 'businessmission'), next: () => true };
    assert.throws(() => f.load('workspace-record-policy.js').enforce(missionEvent, 'delete'), /retained|history|workflow/);
});
test('provenance migrations reject incompatible existing relation targets and field limits', () => {
    for (const [collection, field, property, value] of [['erp_tasks', 'execution', 'collectionId', 'missions'],
        ['business_jobs', 'workspace', 'cascadeDelete', true], ['signals', 'ingest_url', 'max', 50]]) {
        const f = setup(); f.collections[collection].fields.getByName(field)[property] = value;
        assert.throws(() => f.migration(migration).up(), /custom/);
    }
});
