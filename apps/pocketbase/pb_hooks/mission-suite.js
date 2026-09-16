// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/mission-suite.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_hooks/suite-policy.js, apps/pocketbase/pb_migrations/1790300000_mission_suite.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/suite-policy.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790300000_mission_suite.js
// DAG Node:    none
// Intent:      Connect one mission API to durable box-worker runs, current authorization and human-reviewed evidence.
// ───────────────────────────────────────────────────────────────

const p = require(`${__hooks}/suite-policy.js`);
const WORKER = ['poll', 'claim', 'complete'];
const READS = ['snapshot', 'detail', 'poll'];
const ACTIONS = [...READS, 'configure', 'enqueue', 'cancel', 'retry', 'claim', 'complete', 'attach'];
const assign = (record, values) => { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; };
const now = () => new Date().toISOString();
// Native DateField values serialize with a space; API inputs still require ISO UTC.
const leaseTime = (record) => p.utc(record.getString('lease_until').replace(' ', 'T'));
const schema = (app, name) => app.findCollectionByNameOrId(name);
function run(app, workspace, mission, id) {
    const record = p.find(app, 'suite_runs', p.id(id));
    if (record.getString('workspace') !== workspace || record.getString('mission') !== mission)
        throw new ForbiddenError('Choose a suite run in this mission.');
    return record;
}
function view(record) {
    const output = { id: record.id };
    for (const field of ['workspace', 'mission', 'owner', 'suite', 'status', 'binding', 'created', 'processed_at', 'failure', 'evidence', 'input_sha256', 'result_sha256'])
        output[field] = record.getString(field);
    for (const field of ['revision', 'attempt', 'config_revision', 'base_revision']) output[field] = Number(record.get(field));
    return output;
}
function live(app, auth, info, workspace, mission, writing = false) {
    const record = p.mission(app, auth, info, workspace, mission, writing);
    if (writing && record.getString('status') !== 'running') p.conflict('Record mission approval and work started before running the suite.');
    return record;
}
function actorInfo(event, auth) { const info = event.requestInfo(); info.auth = auth; return info; }
function evidenceInput(app, info, workspace, mission, id) {
    const record = p.find(app, 'evidence', id);
    if (record.getString('workspace') !== workspace || record.getString('mission') !== mission)
        throw new ForbiddenError('Use evidence from this mission.');
    p.readable(app, record, info);
    return { id, type: record.getString('type'), sha256: p.hash(p.canonical({ id, content: record.getString('content'),
        source: record.getString('source'), type: record.getString('type'), updated: record.getString('updated') })) };
}
function currentEvidence(app, info, record) {
    const input = JSON.parse(record.getString('input_canonical'));
    for (const item of input.payload.evidence) {
        const current = evidenceInput(app, info, record.getString('workspace'), record.getString('mission'), item.id);
        if (current.sha256 !== item.sha256) p.conflict('Linked evidence changed. Enqueue a new readiness review against current evidence.');
    }
}
function currentJob(event, app, record, binding) {
    const workspace = record.getString('workspace'); const mission = record.getString('mission');
    const owner = p.find(app, 'users', record.getString('owner'));
    live(app, owner, actorInfo(event, owner), workspace, mission, true);
    const control = p.control(app, workspace, mission);
    if (!control || !control.getBool('enabled') || Number(control.get('revision')) !== Number(record.get('config_revision')) ||
        binding.binding !== record.getString('binding') || binding.source_sha256 !== record.getString('source_sha256'))
        p.conflict('The worker or mission configuration changed. Cancel this run and enqueue against current settings.');
    if (record.getString('suite') === 'maritime') p.rightsFor(control, JSON.parse(record.getString('input_canonical')).payload.observations, Date.now());
    else currentEvidence(app, actorInfo(event, owner), record);
    return control;
}
function receipt(app, auth, workspace, body, operation) {
    const previous = app.findRecordsByFilter('suite_receipts', 'workspace = {:workspace} && actor = {:actor} && request_key = {:key}', '', 1, 0,
        { workspace, actor: auth.id, key: body.request_key });
    const fingerprint = p.hash(p.canonical(body));
    if (previous.length) {
        if (previous[0].getString('command_sha256') !== fingerprint) p.conflict('This retry key belongs to another command.');
        return { ...p.json(previous[0], 'result'), replayed: true };
    }
    const result = operation();
    app.save(assign(new Record(schema(app, 'suite_receipts')), { workspace, mission: body.mission, actor: auth.id,
        request_key: body.request_key, action: body.action, command_sha256: fingerprint, result }));
    return { ...result, replayed: false };
}
function submissionInput(app, auth, info, workspace, mission, payload) {
    p.exact(payload, ['requirements', 'document']);
    const referenced = new Set();
    p.array(payload.requirements, 50, 1).forEach((item) => {
        p.exact(item, ['id', 'criterion', 'source_url', 'source_revision', 'evidence_ids', 'status', 'justification']);
        p.key(item.id); p.bounded(item.criterion, 1200); p.bounded(item.source_url, 2048, false);
        p.bounded(item.source_revision, 200, false); p.bounded(item.justification, 1200, false);
        if (!['open', 'satisfied', 'not_applicable'].includes(item.status)) p.invalid('Use a listed requirement state.');
        p.array(item.evidence_ids, 20).forEach((id) => referenced.add(p.id(id)));
    });
    if (referenced.size > 100) p.invalid('Link at most 100 evidence records.');
    p.exact(payload.document, ['name', 'sha256', 'format', 'pages', 'max_pages', 'rule_url', 'rule_revision', 'deadline']);
    p.bounded(payload.document.name, 160); p.bounded(payload.document.rule_url, 2048, false); p.bounded(payload.document.rule_revision, 200, false);
    if (!p.HASH.test(payload.document.sha256) || !['deck', 'paper'].includes(payload.document.format)) p.invalid('Identify the candidate document and its real SHA-256.');
    p.finite(payload.document.pages, 1, 1000); p.finite(payload.document.max_pages, 1, 1000); p.utc(payload.document.deadline);
    const evidence = Array.from(referenced).sort().map((id) => evidenceInput(app, info, workspace, mission, id));
    return { ...payload, evidence };
}
function execute(event, app, auth, workspace, body, binding) {
    const { mission, action, payload } = body; const info = actorInfo(event, auth);
    let control = p.control(app, workspace, mission);
    if (action === 'configure') {
        p.requireRole(app, auth, workspace, ['owner', 'admin']);
        p.mission(app, auth, info, workspace, mission, true); const values = p.configuration(payload);
        if (Number(control?.get('revision') || 0) !== body.revision) p.conflict('Reload the saved mission configuration.');
        if (!control) control = assign(new Record(schema(app, 'suite_controls')), { workspace, mission, protocol_version: 1,
            observations: [], state_revision: 0, active_run: '', state_run: '' });
        assign(control, { ...values, revision: body.revision + 1 }); app.save(control);
        return { workspace, mission, action, id: control.id, revision: body.revision + 1 };
    }
    if (action === 'enqueue') {
        live(app, auth, info, workspace, mission, true);
        p.exact(payload, ['suite', 'input']);
        if (!['maritime', 'submission'].includes(payload.suite)) p.invalid('Choose a supported mission suite.');
        if (!control?.getBool('enabled')) p.conflict('Ask a workspace administrator to enable this mission suite.');
        if (control.getString('active_run')) p.conflict('Finish or cancel this mission’s active run first.');
        if (Number(control.get('state_revision')) !== body.revision) p.conflict('Reload the current mission state.');
        const at = now(); let input; let rights = [];
        if (payload.suite === 'maritime') {
            p.exact(payload.input, ['observations']);
            const observations = p.observations(p.json(control, 'observations', []), payload.input.observations, at);
            rights = p.rightsFor(control, observations, Date.parse(at)); input = { observations };
        } else input = submissionInput(app, auth, info, workspace, mission, payload.input);
        const configured = p.bindings(workspace);
        const canonical = p.canonical({ schema_version: 'mission-suite.input/v1', suite: payload.suite, tenant_id: workspace, mission_id: mission,
            evaluated_at: at, rights, parameters: p.json(control, 'parameters'), payload: input });
        if (canonical.length > 200000) p.invalid('The mission input exceeds its bound.');
        const record = assign(new Record(p.schema(app)), { workspace, mission, owner: auth.id, protocol_version: 1,
            revision: 1, config_revision: Number(control.get('revision')), base_revision: body.revision, attempt: 0,
            suite: payload.suite, status: configured ? 'queued' : 'blocked', failure: configured ? '' : 'worker_unbound',
            input_canonical: canonical, input_sha256: p.hash(canonical), binding: configured?.binding || '', source_sha256: configured?.source_sha256 || '' });
        app.save(record); control.set('active_run', record.id); app.save(control);
        return { workspace, mission, action, id: record.id, revision: 1, status: record.getString('status') };
    }
    const record = run(app, workspace, mission, payload.id);
    if (Number(record.get('revision')) !== body.revision) p.conflict('Reload the changed run before continuing.');
    const status = record.getString('status');
    if (action === 'claim') {
        p.exact(payload, ['id']); control = currentJob(event, app, record, binding);
        if (!['queued', 'processing'].includes(status) || status === 'processing' && leaseTime(record) > Date.now() ||
            Number(record.get('attempt')) >= 3 || control.getString('active_run') !== record.id) p.conflict('This run is not eligible for a lease.');
        assign(record, { status: 'processing', attempt: Number(record.get('attempt')) + 1, processor: auth.id,
            lease_until: new Date(Date.now() + 120000).toISOString() });
    } else if (action === 'complete') {
        p.exact(payload, ['id', 'attempt', 'result_canonical', 'failure', 'source_sha256']);
        control = currentJob(event, app, record, binding);
        if (status !== 'processing' || record.getString('processor') !== auth.id || payload.attempt !== Number(record.get('attempt')) ||
            leaseTime(record) <= Date.now() || payload.source_sha256 !== binding.source_sha256 ||
            control.getString('active_run') !== record.id || Number(control.get('state_revision')) !== Number(record.get('base_revision')))
            p.conflict('A current lease, source binding and state revision are required.');
        const failures = ['', 'invalid_data', 'rights_denied', 'clock_invalid', 'identity_conflict', 'unsupported', 'too_large', 'timeout'];
        if (!failures.includes(payload.failure) || payload.failure && payload.result_canonical !== '') p.invalid('Use a bounded failure code.');
        if (!payload.failure) {
            p.result(payload.result_canonical, record);
            assign(record, { result_canonical: payload.result_canonical, result_sha256: p.hash(payload.result_canonical) });
            if (record.getString('suite') === 'maritime') {
                control.set('observations', JSON.parse(record.getString('input_canonical')).payload.observations);
                control.set('state_run', record.id); control.set('state_revision', Number(control.get('state_revision')) + 1);
            }
        }
        assign(record, { status: payload.failure ? 'failed' : 'ready', failure: payload.failure, processed_at: now(), lease_until: '' });
        control.set('active_run', ''); app.save(control);
    } else if (action === 'cancel') {
        p.exact(payload, ['id']);
        if (['ready', 'attached', 'cancelled'].includes(status)) p.conflict('This run already has a terminal result.');
        assign(record, { status: 'cancelled', lease_until: '' });
        if (control?.getString('active_run') === record.id) { control.set('active_run', ''); app.save(control); }
    } else if (action === 'retry') {
        p.exact(payload, ['id']); live(app, auth, info, workspace, mission, true);
        if (!['failed', 'blocked'].includes(status) || Number(record.get('attempt')) >= 3 || !control?.getBool('enabled') ||
            control.getString('active_run') && control.getString('active_run') !== record.id ||
            Number(control.get('state_revision')) !== Number(record.get('base_revision')) ||
            Number(control.get('revision')) !== Number(record.get('config_revision'))) p.conflict('Enqueue a new run against current settings.');
        const configured = p.bindings(workspace);
        if (!configured) p.conflict('The operator has not bound a worker.');
        if (record.getString('suite') === 'maritime') p.rightsFor(control, JSON.parse(record.getString('input_canonical')).payload.observations, Date.now());
        else currentEvidence(app, info, record);
        assign(record, { status: 'queued', binding: configured.binding, source_sha256: configured.source_sha256, failure: '', lease_until: '' });
        control.set('active_run', record.id); app.save(control);
    } else if (action === 'attach') {
        p.exact(payload, ['id', 'note']);
        if (status !== 'ready' || record.getString('evidence')) p.conflict('Choose an unreviewed completed run.');
        const note = p.bounded(payload.note, 1200); const result = p.result(record.getString('result_canonical'), record);
        if (record.getString('suite') === 'maritime') p.rightsFor(control, JSON.parse(record.getString('input_canonical')).payload.observations, Date.now());
        else currentEvidence(app, info, record);
        const evidence = assign(new Record(schema(app, 'evidence')), { workspace, mission, owner: auth.id, type: 'observed', category: 'suite',
            title: `${record.getString('suite')} suite review`, content: `${note}\n\nReported result: ${JSON.stringify(result.analysis.summary)}\nInput: ${record.getString('input_sha256')}\nResult: ${record.getString('result_sha256')}\nNo operational admission or government submission.`,
            source: `Suite run ${record.id}; ${p.VERSION}`.slice(0, 160), tags: 'suite, human-reviewed', url: '' });
        app.save(evidence); assign(record, { status: 'attached', evidence: evidence.id, review_note: note, reviewed_by: auth.id, reviewed_at: now() });
    }
    record.set('revision', body.revision + 1); app.save(record);
    return { workspace, mission, action, id: record.id, revision: body.revision + 1, attempt: Number(record.get('attempt')),
        status: record.getString('status'), evidence: record.getString('evidence') };
}
function command(event) {
    p.authenticated(event); p.schema(event.app);
    const workspace = p.workspaceId(event); const body = event.requestInfo().body;
    p.exact(body, ['action', 'mission', 'revision', 'request_key', 'payload']);
    if (!ACTIONS.includes(body.action) || typeof body.request_key !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(body.request_key) ||
        !p.fields(body.payload, Object.keys(body.payload || {})) || p.canonical(body).length > 750000) p.invalid('Supply a supported bounded suite command.');
    p.revision(body.revision); p.id(body.mission, body.action === 'poll');
    let response;
    event.app.runInTransaction((app) => {
        const auth = p.find(app, 'users', event.auth.id); const info = actorInfo(event, auth);
        const binding = WORKER.includes(body.action) ? p.worker(app, auth, workspace) : null;
        if (!WORKER.includes(body.action)) {
            p.requireRole(app, auth, workspace, READS.includes(body.action) ? ['owner', 'admin', 'editor', 'viewer'] : p.WRITERS);
            p.mission(app, auth, info, workspace, body.mission, !READS.includes(body.action));
        } else if (body.action !== 'poll') currentJob(event, app, run(app, workspace, body.mission, body.payload.id), binding);
        if (body.action === 'snapshot') {
            p.exact(body.payload, ['page']); const page = p.revision(body.payload.page);
            if (!page || page > 9999) p.invalid('Choose a page from 1 to 9999.');
            const control = p.control(app, workspace, body.mission);
            const result = p.list(app, 'suite_runs', 'workspace = {:workspace} && mission = {:mission}', { workspace, mission: body.mission }, page);
            response = { workspace, mission: body.mission, role: p.requireRole(app, auth, workspace).role, items: result.rows.map(view), page, has_more: result.has_more,
                configured: Boolean(p.bindings(workspace)), control: { revision: Number(control?.get('revision') || 0), state_revision: Number(control?.get('state_revision') || 0),
                    enabled: control?.getBool('enabled') || false, rights: control ? p.json(control, 'rights', []) : [],
                    parameters: control ? p.json(control, 'parameters', p.DEFAULT_PARAMETERS) : p.DEFAULT_PARAMETERS,
                    active_run: control?.getString('active_run') || '', observations: control ? p.json(control, 'observations', []).length : 0 } };
        } else if (body.action === 'detail') {
            p.exact(body.payload, ['id']); const record = run(app, workspace, body.mission, body.payload.id);
            if (record.getString('suite') === 'maritime') p.rightsFor(p.control(app, workspace, body.mission), JSON.parse(record.getString('input_canonical')).payload.observations, Date.now());
            else currentEvidence(app, info, record);
            response = { workspace, mission: body.mission, record: { ...view(record), input_canonical: record.getString('input_canonical'),
                result_canonical: record.getString('result_canonical'),
                result: record.getString('result_canonical') ? JSON.parse(record.getString('result_canonical')) : null } };
        } else if (body.action === 'poll') {
            p.exact(body.payload, ['page']); const page = p.revision(body.payload.page);
            if (!page || page > 9999) p.invalid('Choose a bounded queue page.');
            const items = app.findRecordsByFilter('suite_runs', 'workspace = {:workspace} && (status = "queued" || status = "processing")', 'created,id', 21, (page - 1) * 20, { workspace });
            response = { workspace, mission: '', page, has_more: items.length > 20, items: items.slice(0, 20).filter((record) => {
                if (Number(record.get('attempt')) >= 3 || record.getString('status') === 'processing' && leaseTime(record) > Date.now()) return false;
                try { currentJob(event, app, record, binding); return true; } catch (error) { if ([403, 404, 409].includes(error.status)) return false; throw error; }
            }).map(view) };
        } else {
            response = receipt(app, auth, workspace, body, () => execute(event, app, auth, workspace, body, binding));
            if (body.action === 'claim') {
                const record = run(app, workspace, body.mission, body.payload.id);
                if (record.getString('status') !== 'processing' || record.getString('processor') !== auth.id ||
                    Number(record.get('revision')) !== response.revision || leaseTime(record) <= Date.now()) p.conflict('The recovered lease is no longer current.');
                response.job = { ...view(record), input_canonical: record.getString('input_canonical'), source_sha256: record.getString('source_sha256') };
            }
        }
    });
    return response;
}
module.exports = { command };
