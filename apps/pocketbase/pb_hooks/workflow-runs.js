// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workflow-runs.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workflow-policy.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js
// DAG Node:    none
// Intent:      Commit ordered workflow decisions and mission-linked evidence atomically with safe retries and stale-update rejection.
// ───────────────────────────────────────────────────────────────

const policy = require(`${__hooks}/workflow-policy.js`);
const RUN_FIELDS = ['workspace', 'owner', 'workflow', 'mission', 'request_key', 'start_request',
    'snapshot', 'events', 'revision', 'next_step', 'status', 'started_at', 'finished_at'];

function conflict(message) {
    throw new ApiError(409, message);
}
function id(value, optional = false) {
    return typeof value === 'string' && ((optional && value === '') || /^[a-zA-Z0-9_-]{1,64}$/.test(value));
}
function key(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value);
}
function startInput(body) {
    if (!policy.fields(body, ['workspace', 'workflow', 'mission', 'request_key']) ||
        !id(body.workspace) || !id(body.workflow) || !id(body.mission ?? '', true) || !key(body.request_key))
        policy.invalid('Select a workspace and workflow and supply a valid request key.');
    return { workspace: body.workspace, workflow: body.workflow, mission: body.mission ?? '', request_key: body.request_key };
}
function actionInput(body) {
    if (!policy.fields(body, ['workspace', 'request_key', 'revision', 'action', 'step_id', 'outcome', 'observation', 'source']) ||
        !id(body.workspace) || !key(body.request_key) || !Number.isSafeInteger(body.revision) || body.revision < 1 ||
        !['step', 'cancel'].includes(body.action) || !id(body.step_id ?? '', true) ||
        !policy.text(body.observation, 1200) || !policy.text(body.source ?? '', 160, false) ||
        (body.action === 'step' ? !['passed', 'failed', 'approved', 'rejected'].includes(body.outcome) || !body.step_id :
            Boolean(body.step_id) || Boolean(body.outcome) || Boolean(body.source)))
        policy.invalid('Record a current step, a listed outcome and an observation within 1,200 characters.');
    return { workspace: body.workspace, request_key: body.request_key, revision: body.revision,
        action: body.action, step_id: body.step_id ?? '', outcome: body.outcome ?? '',
        observation: body.observation.trim(), source: (body.source ?? '').trim() };
}
function same(a, b) {
    // JSON object member order can change when PocketBase serializes a Go
    // map. Commands contain scalar fields, so compare names and values.
    const names = Object.keys(b);
    return policy.fields(a, names) && Object.keys(a).length === names.length &&
        names.every((name) => a[name] === b[name]);
}
function missionFor(app, info, missionId, workspace, approvalAt) {
    if (!missionId) return null;
    const mission = policy.find(app, 'missions', missionId);
    if (mission.getString('workspace') !== workspace)
        throw new ForbiddenError('Choose a mission from this workspace.');
    policy.readable(app, mission, info);
    if (mission.getString('status') !== 'running' || !mission.getString('mission_approved_by') ||
        !mission.getString('mission_approved_at'))
        conflict('The linked mission must be running with a recorded approval.');
    if (approvalAt && approvalAt !== mission.getString('mission_approved_at'))
        conflict('The mission approval changed. Cancel this run and start a new one.');
    return mission;
}
function snapshotOf(workflow, mission) {
    if (!policy.text(workflow.getString('name'), 160) || !policy.text(workflow.getString('description'), 1000, false))
        policy.invalid('Save a named workflow with a bounded description first.');
    return { version: 1, name: workflow.getString('name'), description: workflow.getString('description'),
        steps: policy.steps(policy.json(workflow, 'steps'), true), workflow_updated: workflow.getString('updated'),
        mission_id: mission ? mission.id : '', mission_title: mission ? mission.getString('title') : '',
        mission_approved_at: mission ? mission.getString('mission_approved_at') : '' };
}
function statusAt(steps, next) {
    if (next === steps.length) return 'completed';
    return steps[next].kind === 'approval' ? 'awaiting_approval' : 'running';
}
function output(record) {
    const result = { id: record.id };
    RUN_FIELDS.concat(['created', 'updated']).forEach((name) => {
        result[name] = ['snapshot', 'events', 'start_request'].includes(name) ? policy.json(record, name) :
            ['revision', 'next_step'].includes(name) ? Number(record.get(name)) : record.getString(name);
    });
    return result;
}

/** Start one durable operator-recorded run of a saved active workflow. */
function start(e) {
    policy.authenticated(e);
    const info = e.requestInfo();
    const input = startInput(info.body);
    let response;
    e.app.runInTransaction((app) => {
        const collection = policy.schema(app, 'workflow_runs', RUN_FIELDS);
        policy.writable(app, e.auth, input.workspace);
        const existing = app.findRecordsByFilter('workflow_runs', 'owner = {:owner} && request_key = {:key}', '', 1, 0,
            { owner: e.auth.id, key: input.request_key });
        if (existing.length) {
            if (!same(policy.json(existing[0], 'start_request'), input))
                conflict('This request key already belongs to another run request.');
            response = { record: output(existing[0]), replayed: true };
            return;
        }
        const workflow = policy.find(app, 'workflows', input.workflow);
        if (workflow.getString('workspace') !== input.workspace)
            throw new ForbiddenError('Choose a workflow from this workspace.');
        policy.readable(app, workflow, info);
        if (workflow.getString('status') !== 'active') conflict('Activate the saved workflow before starting a run.');
        const mission = missionFor(app, info, input.mission, input.workspace);
        const snapshot = snapshotOf(workflow, mission);
        const now = new Date().toISOString();
        const run = new Record(collection);
        const values = { workspace: input.workspace, workflow: input.workflow, mission: input.mission,
            owner: e.auth.id, request_key: input.request_key, start_request: input, snapshot, events: [],
            revision: 1, next_step: 0, status: statusAt(snapshot.steps, 0), started_at: now, finished_at: '' };
        Object.entries(values).forEach(([name, value]) => run.set(name, value));
        app.save(run);
        workflow.set('last_run', now);
        app.save(workflow);
        response = { record: output(run), replayed: false };
    });
    return response;
}

/** Record a step or cancellation and its evidence as one transaction. */
function advance(e) {
    policy.authenticated(e);
    const info = e.requestInfo();
    const input = actionInput(info.body);
    const runId = e.request.pathValue('id');
    if (!id(runId)) policy.invalid('Select a valid workflow run.');
    let response;
    e.app.runInTransaction((app) => {
        policy.schema(app, 'workflow_runs', RUN_FIELDS);
        const run = policy.find(app, 'workflow_runs', runId);
        if (run.getString('workspace') !== input.workspace)
            throw new ForbiddenError('Choose a run from this workspace.');
        policy.writable(app, e.auth, input.workspace);
        policy.readable(app, run, info);
        const snapshot = policy.json(run, 'snapshot');
        const events = policy.json(run, 'events');
        if (!snapshot || snapshot.version !== 1 || !Array.isArray(events) || events.length > 21)
            throw new ApiError(503, 'This run has an unsupported saved format.');
        const steps = policy.steps(snapshot.steps, true);
        const previous = events.find((event) => event.command.request_key === input.request_key);
        if (previous) {
            if (previous.actor !== e.auth.id || !same(previous.command, input))
                conflict('This request key already belongs to a different decision.');
            response = { record: output(run), replayed: true };
            return;
        }
        if (!policy.OPEN.includes(run.getString('status'))) conflict('This run is finished. Start a new run for further work.');
        const revision = Number(run.get('revision'));
        if (revision !== input.revision) conflict('Another decision was saved. Reload the latest run before continuing.');
        const index = Number(run.get('next_step'));
        if (!Number.isInteger(index) || index < 0 || index >= steps.length)
            throw new ApiError(503, 'This run has an invalid saved step.');
        const step = steps[index];
        if (input.action === 'step') {
            if (input.step_id !== step.id) conflict('Record the current step before a later step.');
            if (snapshot.mission_id !== run.getString('mission'))
                conflict('The linked mission changed. Cancel this run and start a new one.');
            missionFor(app, info, snapshot.mission_id, input.workspace, snapshot.mission_approved_at);
            if (step.kind === 'approval') {
                policy.writable(app, e.auth, input.workspace, true);
                if (!['approved', 'rejected'].includes(input.outcome) || input.source)
                    policy.invalid('Record an explicit approval or rejection with your rationale.');
            } else if (!['passed', 'failed'].includes(input.outcome) || !input.source) {
                policy.invalid('Record a completed or failed step with the source of your observation.');
            }
        }
        const now = new Date().toISOString();
        const evidence = new Record(policy.schema(app, 'evidence', ['content', 'source', 'type', 'mission', 'workspace', 'owner']));
        const decision = input.action === 'cancel' || step.kind === 'approval';
        const succeeded = ['passed', 'approved'].includes(input.outcome);
        const values = { content: input.observation, source: decision ? 'Workflow operator decision' : input.source,
            type: decision ? 'decided' : succeeded ? 'observed' : 'attempted',
            workspace: input.workspace, owner: e.auth.id, mission: run.getString('mission'),
            title: `${snapshot.name}: ${input.action === 'cancel' ? 'Cancelled' : step.name}`.slice(0, 200),
            category: 'workflow_run', tags: 'workflow-run' };
        Object.entries(values).forEach(([name, value]) => evidence.set(name, value));
        app.save(evidence);
        events.push({ command: input, actor: e.auth.id, at: now, evidence: evidence.id });
        const next = input.action === 'step' && succeeded ? index + 1 : index;
        const status = input.action === 'cancel' ? 'cancelled' : succeeded ? statusAt(steps, next) : 'failed';
        run.set('events', events);
        run.set('next_step', next);
        run.set('revision', revision + 1);
        run.set('status', status);
        run.set('finished_at', policy.OPEN.includes(status) ? '' : now);
        app.save(run);
        response = { record: output(run), replayed: false };
    });
    return response;
}

module.exports = { start, advance };
