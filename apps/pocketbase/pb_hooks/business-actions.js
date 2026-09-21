// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_hooks/business-actions.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/business-action-policy.js, apps/pocketbase/pb_hooks/workflow-runs.js, apps/pocketbase/pb_migrations/1790800000_business_execution.js
// EnumType:     Service
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_hooks/business-action-policy.js; DEPENDS_ON apps/pocketbase/pb_hooks/workflow-runs.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790800000_business_execution.js
// DAG Node:     none
// Intent:       Connect approved business actions, provider observations and immutable effect receipts without blind external retries.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const actions = require(`${__hooks}/business-action-policy.js`);
const workflows = require(`${__hooks}/workflow-runs.js`);
const writes = ['owner', 'admin', 'editor'];
const terminal = ['succeeded', 'failed', 'cancelled'];
const fields = ['workspace', 'owner', 'mission', 'run', 'step_id', 'provider', 'binding', 'effect_key', 'status',
    'worker', 'lease_id', 'lease_until', 'failure', 'approval_at', 'result_sha256', 'evidence', 'input', 'result',
    'revision', 'attempt', 'integration_revision', 'run_revision', 'protocol_version', 'release_context', 'started_at', 'finished_at', 'created', 'updated'];
function set(record, values) { Object.entries(values).forEach(([key, value]) => record.set(key, value)); }
function digest(value) { return $security.sha256(access.canonical(value)); }
function schema(app) {
    const collection = access.schema(app, 'business_jobs', fields);
    if (['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((key) => collection[key] !== null) ||
        !collection.indexes.includes('create unique index idx_business_effect on business_jobs (workspace, effect_key)'))
        throw new ApiError(503, 'Business execution access and identity need operator review.');
    return collection;
}
function output(record) {
    const value = { id: record.id };
    fields.forEach((key) => { value[key] = ['input', 'result', 'release_context'].includes(key) ? access.json(record, key) :
        ['revision', 'attempt', 'integration_revision', 'run_revision', 'protocol_version'].includes(key) ? Number(record.get(key)) : record.getString(key); });
    // Lease capability is returned only to its authenticated worker by claim/begin.
    delete value.lease_id;
    return value;
}
function releaseContext() {
    const raw = $os.getenv('BUILDANDDO_RELEASE_CONTEXT');
    if (!raw) return null;
    let value;
    try { value = JSON.parse(raw); access.exact(value, ['candidate_sha', 'source_sha256', 'artifact_tree_sha256', 'dispatch', 'environment']); }
    catch { throw new ApiError(503, 'The declared release identity is malformed.'); }
    if (!/^[a-f0-9]{40}$/.test(value.candidate_sha) || !/^[a-f0-9]{64}$/.test(value.source_sha256) ||
        !/^[a-f0-9]{64}$/.test(value.artifact_tree_sha256) || !['staging', 'production', 'fixture'].includes(value.environment) ||
        !access.text(value.dispatch, 120)) throw new ApiError(503, 'The declared release identity is incomplete.');
    return value;
}
function binding(workspace, provider, name, actor = '', operation = '') {
    let records;
    try { records = JSON.parse($os.getenv('BUILDANDDO_BUSINESS_BINDINGS') || '[]'); }
    catch { throw new ApiError(503, 'Business connector registration is unavailable.'); }
    if (!Array.isArray(records) || records.length > 100) throw new ApiError(503, 'Business connector registration is unavailable.');
    const candidates = records.filter((item) => item && item.workspace === workspace && item.provider === provider && item.binding === name);
    if (candidates.length !== 1 || typeof candidates[0].worker !== 'string' || !candidates[0].worker ||
        actor && candidates[0].worker !== actor || provider === 'n8n' && (!Array.isArray(candidates[0].operations) ||
            !candidates[0].operations.length || candidates[0].operations.length > 20 ||
            candidates[0].operations.some((value) => typeof value !== 'string' || !/^[a-z][a-z0-9_-]{1,63}$/.test(value)) ||
            operation && !candidates[0].operations.includes(operation)))
        throw new ForbiddenError('This workspace, worker and operation have no registered connector binding.');
    return candidates[0];
}
function integration(app, workspace, provider, name, revision, healthy = false) {
    const rows = app.findRecordsByFilter('workspace_integrations', 'workspace = {:workspace} && provider = {:provider}', '', 2, 0, { workspace, provider });
    if (rows.length !== 1 || !rows[0].getBool('desired_enabled')) access.conflict('Enable the reviewed connector configuration first.');
    const record = rows[0], config = access.json(record, 'configuration');
    if (config?.binding !== name || config.mode !== (provider === 'firecrawl' ? 'read' : 'reviewed_run') ||
        revision !== undefined && Number(record.get('revision')) !== revision) access.conflict('The connector configuration changed. Review a new action.');
    if (healthy) {
        const observation = require(`${__hooks}/workspace-administration.js`).observation(record);
        if (!observation.current || observation.state !== 'healthy') access.conflict('A fresh healthy receipt for this configuration is required before dispatch.');
    }
    return record;
}
function scopedJob(app, workspace, id) {
    const record = access.find(app, 'business_jobs', access.id(id));
    if (record.getString('workspace') !== workspace) throw new ForbiddenError('Choose an action from this workspace.');
    return record;
}
function readableJob(app, e, job) {
    const info = e.requestInfo();
    for (const [field, collection] of [['run', 'workflow_runs'], ['mission', 'missions'], ['evidence', 'evidence']]) {
        const id = job.getString(field); if (!id) continue;
        let record;
        try { record = access.find(app, collection, id); } catch (error) { if (error.status === 404) return false; throw error; }
        if (record.getString('workspace') !== job.getString('workspace') || !app.canAccessRecord(record, info, record.collection().viewRule)) return false;
    }
    return true;
}
function currentRun(app, e, job) {
    const runId = job.getString('run');
    if (!runId) return null;
    const run = access.find(app, 'workflow_runs', runId);
    const snapshot = access.json(run, 'snapshot');
    const step = access.steps(snapshot?.steps, true)[Number(run.get('next_step'))];
    if (run.getString('workspace') !== job.getString('workspace') || run.getString('status') !== 'running' ||
        Number(run.get('revision')) !== Number(job.get('run_revision')) || step?.id !== job.getString('step_id') ||
        step.kind !== 'execute' || access.canonical(step.action) !== access.canonical(access.json(job, 'input')))
        access.conflict('This frozen step is no longer current; do not dispatch it.');
    const mission = workflows.missionFor(app, e.requestInfo(), job.getString('mission'), job.getString('workspace'), job.getString('approval_at'));
    if (access.json(mission, 'mission_plan')?.independent_review !== true) access.conflict('Independent review is required for this action.');
    return run;
}
function ready(app, e, job, healthy) {
    const owner = access.find(app, 'users', job.getString('owner'));
    access.requireRole(app, owner, job.getString('workspace'), writes);
    if (access.canonical(access.json(job, 'release_context')) !== access.canonical(releaseContext()))
        access.conflict('The declared release changed. Review a new run before dispatching this action.');
    currentRun(app, e, job);
    const value = access.json(job, 'input');
    if (value.provider !== 'erp') {
        binding(job.getString('workspace'), value.provider, value.binding, '', value.parameters.operation || '');
        integration(app, job.getString('workspace'), value.provider, value.binding, Number(job.get('integration_revision')), healthy);
    }
}
function worker(app, e, job) {
    const value = access.json(job, 'input');
    binding(job.getString('workspace'), value.provider, value.binding, e.auth.id, value.parameters.operation || '');
    access.requireRole(app, e.auth, job.getString('workspace'), writes);
}
function enqueue(app, e, workspace, body) {
    const payload = body.payload;
    let value, run = null, step = null, effect;
    if (body.action === 'source.capture') {
        access.exact(payload, ['binding', 'url']);
        if (body.revision !== 0) access.invalid('Start a new capture with revision zero.');
        value = actions.action({ provider: 'firecrawl', binding: payload.binding, parameters: { url: payload.url }, max_seconds: 60 });
        effect = digest({ workspace, owner: e.auth.id, request: body.request_key, kind: 'capture' });
    } else {
        access.exact(payload, ['run', 'step_id']);
        run = access.find(app, 'workflow_runs', access.id(payload.run));
        if (run.getString('workspace') !== workspace) throw new ForbiddenError('Choose a run from this workspace.');
        access.readable(app, run, e.requestInfo());
        const snapshot = access.json(run, 'snapshot');
        step = access.steps(snapshot?.steps, true).find((item) => item.id === payload.step_id);
        if (!step || step.kind !== 'execute') access.invalid('Choose an executable frozen step.');
        value = step.action;
        effect = digest({ workspace, run: run.id, step: step.id });
    }
    const previous = app.findRecordsByFilter('business_jobs', 'workspace = {:workspace} && effect_key = {:effect}', '', 2, 0, { workspace, effect });
    if (previous.length > 1) throw new ApiError(503, 'Duplicate effect identities need operator review.');
    if (previous.length) return output(previous[0]);
    if (run && Number(run.get('revision')) !== body.revision) access.conflict('Reload this run before dispatching its current step.');
    let config;
    if (value.provider !== 'erp') {
        binding(workspace, value.provider, value.binding, '', value.parameters.operation || '');
        config = integration(app, workspace, value.provider, value.binding);
    }
    const job = new Record(schema(app));
    set(job, { workspace, owner: e.auth.id, mission: run?.getString('mission') || '', run: run?.id || '', step_id: step?.id || '',
        provider: value.provider, binding: value.binding, effect_key: effect, status: 'queued', input: value, result: null,
        revision: 1, attempt: 0, protocol_version: 1, release_context: releaseContext(), integration_revision: config ? Number(config.get('revision')) : 0,
        run_revision: run ? Number(run.get('revision')) : 0, approval_at: run ? access.json(run, 'snapshot').mission_approved_at : '' });
    ready(app, e, job, false); app.save(job);
    if (value.provider === 'erp') {
        const p = value.parameters;
        for (const [field, collection] of [['objective', 'erp_objectives'], ['contact', 'erp_contacts']]) {
            if (!p[field]) continue;
            const related = access.find(app, collection, p[field]);
            if (related.getString('workspace') !== workspace) throw new ForbiddenError('ERP links must belong to this workspace.');
            access.readable(app, related, e.requestInfo());
        }
        const task = new Record(access.schema(app, 'erp_tasks', ['description', 'priority', 'due_date', 'contact', 'mission', 'execution', 'evidence']));
        set(task, { ...p, due_date: p.due_date ? `${p.due_date} 12:00:00.000Z` : '', status: 'todo', workspace,
            owner: e.auth.id, mission: job.getString('mission'), execution: job.id });
        app.save(task);
        const now = new Date().toISOString();
        set(job, { status: 'dispatched', started_at: now, worker: e.auth.id });
        settle(app, e, job, { status: 'succeeded', observed_at: now, receipt_ref: `erp_tasks/${task.id}`,
            output: { task: task.id, title: p.title } });
        task.set('evidence', job.getString('evidence')); app.save(task);
    }
    return output(job);
}
function report(value, job) {
    access.exact(value, ['status', 'observed_at', 'receipt_ref', 'output']);
    if (!['succeeded', 'failed'].includes(value.status)) access.invalid('Ambiguous effects must remain on hold.');
    const stamp = Date.parse(value.observed_at), start = Date.parse(job.getString('started_at'));
    if (!Number.isFinite(stamp) || stamp > Date.now() || stamp < start || Date.now() - stamp > 86400000)
        access.invalid('Use the dated provider observation from this dispatch, no more than a day old.');
    access.bounded(value.receipt_ref, 200);
    if (!value.output || typeof value.output !== 'object' || Array.isArray(value.output) || access.canonical(value.output).length > 24000)
        access.invalid('Supply a bounded, sanitized result object.');
    const provider = job.getString('provider');
    if (value.status === 'failed') {
        access.exact(value.output, ['reason']); access.bounded(value.output.reason, 200);
    } else if (provider === 'firecrawl') {
        access.exact(value.output, ['url', 'title', 'text', 'content_sha256', 'truncated']);
        const source = access.json(job, 'input').parameters.url;
        if (value.output.url !== source || typeof value.output.truncated !== 'boolean') access.invalid('The result must retain its approved source.');
        access.bounded(value.output.title, 200); access.bounded(value.output.text, 16000);
        if (value.output.content_sha256 !== $security.sha256(value.output.text)) access.invalid('The captured text digest does not match its bytes.');
    } else if (provider === 'n8n') {
        access.exact(value.output, ['effect_key', 'execution_id', 'summary']);
        if (value.output.effect_key !== job.getString('effect_key')) access.invalid('The provider receipt must identify this exact effect.');
        access.bounded(value.output.execution_id, 120); access.bounded(value.output.summary, 1600);
    }
    return value;
}
function settle(app, e, job, value) {
    const reported = report(value, job), sha = digest(reported);
    if (terminal.includes(job.getString('status'))) {
        if (job.getString('result_sha256') !== sha) access.conflict('The retained result cannot be replaced.');
        return;
    }
    let run;
    try { run = currentRun(app, e, job); }
    catch (error) { if (!(error instanceof ApiError) && !(error instanceof ForbiddenError)) throw error; run = null; }
    const records = {};
    if (reported.status === 'succeeded' && job.getString('provider') === 'firecrawl') {
        const captured = reported.output, identity = digest({ url: captured.url, text: captured.text });
        const matches = app.findRecordsByFilter('signals', 'workspace = {:workspace} && ingest_digest = {:digest}', '', 2, 0,
            { workspace: job.getString('workspace'), digest: identity });
        if (matches.length > 1) throw new ApiError(503, 'Duplicate source captures need operator review.');
        let signal = matches[0];
        if (!signal) {
            signal = new Record(access.schema(app, 'signals', ['ingest_digest', 'ingest_url', 'ingest_provider', 'ingested_at']));
            set(signal, { title: captured.title, description: captured.text.slice(0, 1000), source: 'Firecrawl public-source observation',
                type: 'fact', confidence: 0, state: 'new', workspace: job.getString('workspace'), owner: job.getString('owner'),
                ingest_digest: identity, ingest_url: captured.url, ingest_provider: 'firecrawl', ingested_at: reported.observed_at });
            app.save(signal);
        }
        records.signal = signal.id;
    }
    const evidence = new Record(access.schema(app, 'evidence', ['content', 'source', 'type', 'mission', 'workspace', 'owner']));
    set(evidence, { workspace: job.getString('workspace'), owner: e.auth.id, mission: job.getString('mission'),
        title: `Business action: ${job.getString('provider')} ${reported.status}`, type: reported.status === 'succeeded' ? 'observed' : 'attempted',
        source: `Business execution receipt ${job.id}`,
        content: `Result: ${reported.status}\nEffect: ${job.getString('effect_key')}\nReceipt: ${reported.receipt_ref}\nObserved: ${reported.observed_at}\nResult SHA-256: ${sha}\n${String(reported.output.summary || reported.output.title || reported.output.reason || '').slice(0, 1000)}\nThe full captured result is retained in business_jobs/${job.id}. Independent review remains required.` });
    app.save(evidence);
    const now = new Date().toISOString();
    records.evidence = evidence.id;
    set(job, { status: reported.status, result: { reported, records, run_advanced: Boolean(run) }, result_sha256: sha,
        evidence: evidence.id, finished_at: now, revision: Number(job.get('revision')) + 1, failure: '' });
    if (run) {
        const events = access.json(run, 'events'), snapshot = access.json(run, 'snapshot'), index = Number(run.get('next_step'));
        if (!Array.isArray(events) || events.length > 20) throw new ApiError(503, 'Run history needs operator review.');
        events.push({ command: { workspace: job.getString('workspace'), request_key: job.getString('effect_key'), action: 'execute',
            revision: Number(run.get('revision')), step_id: job.getString('step_id'), outcome: reported.status === 'succeeded' ? 'passed' : 'failed',
            observation: `Retained ${job.getString('provider')} result ${sha}`, source: `business_jobs/${job.id}` },
            actor: e.auth.id, at: now, evidence: evidence.id, execution: job.id, result_sha256: sha });
        const next = reported.status === 'succeeded' ? index + 1 : index;
        const state = reported.status === 'succeeded' ? workflows.statusAt(snapshot.steps, next) : 'failed';
        set(run, { events, next_step: next, status: state, revision: Number(run.get('revision')) + 1,
            finished_at: access.OPEN.includes(state) ? '' : now }); app.save(run);
    }
    app.save(job);
}
function lease(job, e, payload, expires = true) {
    if (job.getString('worker') !== e.auth.id || !payload.lease_id || job.getString('lease_id') !== payload.lease_id ||
        expires && Date.parse(job.getString('lease_until')) <= Date.now()) access.conflict('This worker lease is no longer current.');
}
function updateJob(app, e, workspace, body) {
    const p = body.payload;
    const expected = body.action === 'action.claim' || body.action === 'action.cancel' ? ['id'] :
        body.action === 'action.complete' || body.action === 'action.reconcile' ? ['id', 'lease_id', 'result'] :
            body.action === 'action.hold' ? ['id', 'lease_id', 'reason'] : ['id', 'lease_id'];
    access.exact(p, expected);
    const job = scopedJob(app, workspace, p.id);
    if (body.action !== 'action.cancel') worker(app, e, job);
    const status = job.getString('status');
    if (body.action === 'action.complete' && terminal.includes(status)) {
        lease(job, e, p, false); settle(app, e, job, p.result); return output(job);
    }
    if (Number(job.get('revision')) !== body.revision) access.conflict('Reload the action before making another decision.');
    const now = new Date().toISOString();
    if (body.action === 'action.cancel') {
        if (terminal.includes(status)) access.conflict('This action is already finished.');
        set(job, { status: status === 'dispatched' || status === 'hold' ? 'hold' : 'cancelled',
            failure: status === 'dispatched' || status === 'hold' ? 'cancellation_after_dispatch' : 'cancelled_before_dispatch', finished_at: now });
    } else if (body.action === 'action.claim') {
        if (status !== 'queued' && !(status === 'claimed' && Date.parse(job.getString('lease_until')) <= Date.now()))
            access.conflict('Only undispatched work can be claimed again. Reconcile a dispatched or uncertain effect.');
        if (Number(job.get('attempt')) >= 3) access.conflict('The bounded claim limit was reached; review a new run.');
        ready(app, e, job, false);
        set(job, { worker: e.auth.id, status: 'claimed', attempt: Number(job.get('attempt')) + 1,
            lease_id: $security.randomString(32), lease_until: new Date(Date.now() + 120000).toISOString() });
    } else if (body.action === 'action.begin') {
        lease(job, e, p);
        if (status !== 'claimed') access.conflict('A claimed action can be dispatched only once.');
        ready(app, e, job, true);
        set(job, { status: 'dispatched', started_at: now });
    } else if (body.action === 'action.hold') {
        lease(job, e, p, false);
        if (status !== 'dispatched') access.conflict('Only a dispatched effect can have an uncertain outcome.');
        if (!['provider_timeout', 'provider_unavailable', 'invalid_receipt', 'interrupted', 'reconciliation_required'].includes(p.reason))
            access.invalid('Choose a sanitized uncertainty reason.');
        set(job, { status: 'hold', failure: p.reason });
    } else {
        lease(job, e, p, false);
        if (body.action === 'action.reconcile' ? !['hold', 'dispatched'].includes(status) : status !== 'dispatched')
            access.conflict('This result has no matching dispatch to reconcile.');
        settle(app, e, job, p.result); return output(job);
    }
    job.set('revision', body.revision + 1); app.save(job);
    return { ...output(job), ...(['action.claim', 'action.begin'].includes(body.action) ? { lease_id: job.getString('lease_id') } : {}) };
}
function observe(app, e, workspace, body) {
    const p = body.payload;
    access.exact(p, ['provider', 'binding', 'state', 'observed_at', 'receipt_ref']);
    binding(workspace, p.provider, p.binding, e.auth.id);
    const rows = app.findRecordsByFilter('workspace_integrations', 'workspace = {:workspace} && provider = {:provider}', '', 2, 0, { workspace, provider: p.provider });
    if (rows.length !== 1) access.conflict('Save the integration first.');
    const record = rows[0];
    if (Number(record.get('revision')) !== body.revision || access.json(record, 'configuration')?.binding !== p.binding)
        access.conflict('The connector configuration changed during observation.');
    const stamp = Date.parse(p.observed_at), age = Date.now() - stamp;
    if (!Number.isFinite(stamp) || age < 0 || age > 300000 || stamp < Date.parse(record.getString('observed_at')) ||
        !['healthy', 'degraded', 'failed', 'disabled'].includes(p.state) ||
        record.getBool('desired_enabled') === (p.state === 'disabled')) access.invalid('Report a current observation consistent with the requested connector state.');
    access.bounded(p.receipt_ref, 160);
    set(record, { observed_state: p.state, observed_at: p.observed_at, receipt_ref: p.receipt_ref, applied_revision: body.revision }); app.save(record);
    return { id: record.id, workspace, revision: body.revision, state: p.state, observed_at: p.observed_at, receipt_ref: p.receipt_ref };
}
/** Execute a bounded command and its retry receipt under native workspace authority. */
function command(e) {
    const { workspace, body } = access.envelope(e);
    if (!['source.capture', 'action.enqueue', 'action.claim', 'action.begin', 'action.complete', 'action.hold', 'action.cancel',
        'action.reconcile', 'integration.observe'].includes(body.action)) access.invalid('Choose a supported business command.');
    let result;
    e.app.runInTransaction((app) => {
        schema(app); access.requireRole(app, e.auth, workspace, writes);
        // Authority is rechecked even when a previous command is recovered.
        if (body.action === 'integration.observe') binding(workspace, body.payload.provider, body.payload.binding, e.auth.id);
        else if (!['source.capture', 'action.enqueue', 'action.cancel'].includes(body.action)) worker(app, e, scopedJob(app, workspace, body.payload.id));
        result = access.audit(app, e.auth, workspace, body, () => {
            if (body.action === 'integration.observe') return observe(app, e, workspace, body);
            if (['source.capture', 'action.enqueue'].includes(body.action)) return enqueue(app, e, workspace, body);
            return updateJob(app, e, workspace, body);
        });
    });
    if (['action.enqueue', 'source.capture'].includes(body.action) && !readableJob(e.app, e, scopedJob(e.app, workspace, result.id)))
        throw new ForbiddenError('The retained action is no longer readable by this account.');
    return result;
}
/** Read a bounded page of retained effects without claiming that missing workers are healthy. */
function list(e) {
    access.authenticated(e); const workspace = access.workspaceId(e);
    schema(e.app); access.requireRole(e.app, e.auth, workspace);
    const query = e.requestInfo().query || {}, workerRead = query.worker === '1';
    const run = query.run || '';
    if (run) access.id(run);
    let filter = 'workspace = {:workspace}' + (run ? ' && run = {:run}' : '');
    const params = { workspace, run };
    if (workerRead) {
        access.requireRole(e.app, e.auth, workspace, writes);
        binding(workspace, query.provider, query.binding, e.auth.id);
        params.provider = query.provider; params.binding = query.binding;
        filter += " && provider = {:provider} && binding = {:binding} && (status = 'queued' || status = 'claimed' || status = 'dispatched' || status = 'hold')";
    }
    const result = access.list(e.app, 'business_jobs', filter, params, access.page(e));
    const items = result.rows.filter((record) => readableJob(e.app, e, record)).map((record) => {
        const value = output(record);
        if (workerRead && record.getString('worker') === e.auth.id) {
            worker(e.app, e, record); value.lease_id = record.getString('lease_id');
        }
        return { ...value, requires_reconciliation: ['dispatched', 'hold'].includes(record.getString('status')) &&
            Date.parse(record.getString('lease_until')) <= Date.now() };
    });
    access.requireRole(e.app, e.auth, workspace);
    return { workspace, items, page: result.page, has_more: result.has_more };
}
/** Cancel undispatched effects, retaining uncertainty for calls already issued. */
function cancelForRun(app, run) {
    schema(app);
    const records = app.findRecordsByFilter('business_jobs', 'run = {:run}', '', 21, 0, { run: run.id });
    for (const job of records) {
        if (terminal.includes(job.getString('status'))) continue;
        const dispatched = ['dispatched', 'hold'].includes(job.getString('status'));
        set(job, { status: dispatched ? 'hold' : 'cancelled', failure: dispatched ? 'cancellation_after_dispatch' : 'cancelled_before_dispatch',
            revision: Number(job.get('revision')) + 1, finished_at: dispatched ? '' : new Date().toISOString() }); app.save(job);
    }
}
module.exports = { command, list, cancelForRun, output };
