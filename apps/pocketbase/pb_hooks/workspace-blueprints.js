// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workspace-blueprints.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/mission-research.js, apps/pocketbase/pb_hooks/research-policy.js, apps/research/blueprints.py
// EnumType:    Service
// EnumEdges:   EXTENDS apps/pocketbase/pb_hooks/mission-research.js; CONSUMES apps/pocketbase/pb_hooks/research-policy.js; VALIDATES apps/research/blueprints.py
// DAG Node:    none
// Intent:      Bind blueprint uploads, saved observations and A0 assessments to current workspace access and the shared research worker.
// ───────────────────────────────────────────────────────────────

const p = require(`${__hooks}/research-policy.js`);
const access = require(`${__hooks}/workspace-access.js`);
const research = require(`${__hooks}/mission-research.js`);
const TYPES = ['service', 'database', 'queue', 'gateway', 'worker', 'storage', 'external'];
const QUESTIONS = ['feasibility', 'complexity', 'component_type', 'automatable', 'risk'];
const BASE_FIELDS = ['text', 'citations', 'processor', 'version', 'input_sha256', 'truncated'];
const assign = (record, values) => { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; };
const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const bounded = (value, maximum, required = true) => {
    if (!p.text(value, maximum, required) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) p.invalid('Return bounded blueprint text.');
    return value;
};
function rows(value, maximum) {
    if (!Array.isArray(value) || value.length > maximum) p.invalid('Return a bounded blueprint list.');
    return value;
}
function strings(value, maximum, length) { return rows(value, maximum).map((item) => bounded(item, length)); }
function unique(value) { if (new Set(value).size !== value.length) p.invalid('Blueprint identifiers must be unique.'); }
function number(value, min, max) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) p.invalid('Return a bounded numeric observation.'); }
function integer(value, min, max) { number(value, min, max); if (!Number.isSafeInteger(value)) p.invalid('Return an integer observation.'); }
function schema(app) {
    p.schema(app);
    return access.schema(app, 'workspace_blueprints', ['protocol_version', 'workspace', 'owner', 'submission', 'input_sha256', 'result']);
}
function linked(app, submission) {
    schema(app);
    const items = app.findRecordsByFilter('workspace_blueprints', 'submission = {:submission}', '', 2, 0, { submission: submission.id });
    if (items.length !== 1 || items[0].getString('workspace') !== submission.getString('workspace') ||
        items[0].getString('owner') !== submission.getString('owner') || submission.getString('mode') !== 'blueprint')
        p.conflict('Review the blueprint research link.');
    return items[0];
}
function scope(e, writing = false) {
    p.authenticated(e);
    const workspace = p.workspaceId(e);
    const role = p.requireRole(e.app, e.auth, workspace, writing ? p.WRITERS : ['owner', 'admin', 'editor', 'viewer']).role;
    schema(e.app);
    return { workspace, role };
}
function find(e, workspace) {
    const row = p.find(e.app, 'workspace_blueprints', p.id(e.request.pathValue('id')));
    if (row.getString('workspace') !== workspace) throw new ForbiddenError('Choose a blueprint in this workspace.');
    return row;
}
function output(app, row, detailed = true) {
    const submission = p.find(app, 'research_submissions', row.getString('submission'));
    if (linked(app, submission).id !== row.id) p.conflict('Review the blueprint research link.');
    const result = detailed ? p.json(row, 'result') : null;
    return { id: row.id, workspace: row.getString('workspace'), owner: row.getString('owner'), submission: submission.id,
        source_file: row.getString('source_file'), input_sha256: row.getString('input_sha256'),
        status: submission.getString('status'), revision: Number(submission.get('revision')), attempt: Number(submission.get('attempt')),
        failure: submission.getString('failure'), created: row.getString('created'), processed_at: submission.getString('processed_at'),
        ...(detailed ? { upload: submission.getString('upload'), text: result?.text || '', blueprint: result?.blueprint || null, evaluation: result?.evaluation || null,
            blueprint_failure: result?.blueprint_failure || '', evaluation_failure: result?.evaluation_failure || '',
            truncated: result?.truncated || false } : {}) };
}
function snapshot(e) {
    const context = scope(e); const page = p.page(e);
    const list = p.list(e.app, 'workspace_blueprints', 'workspace = {:workspace}', { workspace: context.workspace }, page);
    return { ...context, items: list.rows.map((row) => output(e.app, row, false)), page, has_more: list.has_more,
        capabilities: p.capabilities(e.app, context.workspace) };
}
function detail(e) {
    const context = scope(e);
    return { workspace: context.workspace, record: output(e.app, find(e, context.workspace)) };
}
function upload(e) {
    const { workspace } = scope(e, true);
    const body = e.requestInfo().body;
    if (!p.fields(body, ['request_key', 'input_sha256', 'asset']) || typeof body.request_key !== 'string' ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(body.request_key) || !digest(body.input_sha256))
        p.invalid('Supply a PDF, source SHA-256 and durable request key.');
    const values = p.prepareUpload(e, e.auth, workspace);
    if (!values.original_name.toLowerCase().endsWith('.pdf')) p.invalid('Blueprint intake accepts PDF documents.');
    let response;
    e.app.runInTransaction((app) => {
        schema(app); p.requireRole(app, e.auth, workspace, p.WRITERS);
        const previous = app.findRecordsByFilter('workspace_blueprints', 'workspace = {:workspace} && owner = {:owner} && request_key = {:key}', '', 2, 0,
            { workspace, owner: e.auth.id, key: body.request_key });
        if (previous.length > 1) p.conflict('Review the blueprint upload receipts.');
        if (previous.length) {
            if (previous[0].getString('input_sha256') !== body.input_sha256 || previous[0].getString('source_file') !== values.original_name)
                p.conflict('This upload key belongs to a different document.');
            response = { workspace, record: output(app, previous[0]), replayed: true };
            return;
        }
        const file = assign(new Record(app.findCollectionByNameOrId('research_uploads')), values); app.save(file);
        const caps = p.capabilities(app, workspace); const enabled = caps.kinds.includes('document');
        const submission = assign(new Record(p.schema(app)), { workspace, owner: e.auth.id, mission: '', mode: 'blueprint',
            title: values.original_name.slice(0, 160), kind: 'document', input: '', context: '', upload: file.id,
            origin: 'website', source_ref: '', protocol_version: 1, revision: 1, attempt: 0,
            status: enabled ? 'queued' : 'blocked', binding: caps.binding, integration_revision: caps.revision,
            failure: enabled ? '' : 'capability_unavailable' });
        app.save(submission);
        const record = assign(new Record(schema(app)), { workspace, owner: e.auth.id, submission: submission.id, protocol_version: 1,
            request_key: body.request_key, source_file: values.original_name, input_sha256: body.input_sha256, result: null });
        app.save(record);
        response = { workspace, record: output(app, record), replayed: false };
    });
    return response;
}
function command(e) {
    const { workspace } = scope(e, true); const row = find(e, workspace); const body = e.requestInfo().body;
    p.exact(body, ['action', 'revision', 'request_key']);
    if (!['retry', 'cancel'].includes(body.action)) p.invalid('Retry or cancel a blueprint submission.');
    research.execute(e, { workspace, auth: e.auth, info: e.requestInfo() },
        { ...body, payload: { id: row.getString('submission') } });
    return detail(e);
}
function validateBlueprint(value, expectedHash, expectedName) {
    p.exact(value, ['title', 'source_file', 'source_hash', 'extracted_at', 'sections', 'requirements', 'components',
        'constraints', 'assumptions', 'open_questions', 'extraction_confidence', 'parser_version', 'page_count', 'truncated']);
    bounded(value.title, 160); bounded(value.parser_version, 80); bounded(value.extracted_at, 80);
    if (value.source_hash !== expectedHash || value.source_file !== expectedName || !Number.isFinite(Date.parse(value.extracted_at)) ||
        !/(?:Z|[+-]\d\d:\d\d)$/.test(value.extracted_at) || typeof value.truncated !== 'boolean') p.invalid('Return matching blueprint provenance.');
    integer(value.page_count, 1, 200); number(value.extraction_confidence, 0, 1);
    const sections = rows(value.sections, 64).map((section) => {
        p.exact(section, ['id', 'title', 'text', 'level', 'start_line', 'end_line']);
        bounded(section.id, 32); bounded(section.title, 160); bounded(section.text, 16000, false);
        integer(section.level, 1, 6); integer(section.start_line, 1, 16000); integer(section.end_line, section.start_line, 16000);
        return section.id;
    });
    unique(sections);
    const ids = rows(value.requirements, 80).map((requirement) => {
        p.exact(requirement, ['id', 'text', 'priority', 'type', 'section', 'raw_context']);
        bounded(requirement.id, 80); bounded(requirement.text, 2000); bounded(requirement.raw_context, 800);
        if (!/^[A-Za-z0-9_.-]+$/.test(requirement.id) || !sections.includes(requirement.section) ||
            !['must', 'should', 'could', 'wont', 'high', 'medium', 'low'].includes(requirement.priority) ||
            !['functional', 'performance', 'security', 'integration', 'data', 'constraint'].includes(requirement.type))
            p.invalid('Return classified requirements with section provenance.');
        return requirement.id;
    });
    unique(ids);
    const components = rows(value.components, 64);
    const names = components.map((component) => {
        p.exact(component, ['name', 'type', 'description', 'requirements', 'dependencies']);
        bounded(component.name, 160); bounded(component.description, 800);
        if (!TYPES.includes(component.type)) p.invalid('Return a listed component type.');
        const requirements = strings(component.requirements, 80, 80); unique(requirements);
        if (!requirements.every((id) => ids.includes(id))) p.invalid('Components must reference extracted requirements.');
        return component.name;
    });
    unique(names);
    for (const component of components) {
        const dependencies = strings(component.dependencies, 64, 160); unique(dependencies);
        if (!dependencies.every((name) => names.includes(name) && name !== component.name)) p.invalid('Return known directed dependencies.');
    }
    for (const key of ['constraints', 'assumptions', 'open_questions']) strings(value[key], 80, 2000);
    return value;
}
function validateEvaluation(value, blueprint) {
    p.exact(value, ['source_hash', 'requirements', 'overall', 'authority', 'verified']);
    if (value.authority !== 'A0' || value.verified !== false || value.source_hash !== blueprint.source_hash)
        p.invalid('Blueprint evaluations are A0 observations, never verification.');
    const ids = blueprint.requirements.map((requirement) => requirement.id);
    const evaluations = rows(value.requirements, 80);
    const received = evaluations.map((row) => {
        p.exact(row, ['requirement_id', ...QUESTIONS, 'confidence', 'abstained', 'components', 'route', 'trace_id', 'state_hash']);
        bounded(row.route, 160); bounded(row.trace_id, 128);
        if (!digest(row.state_hash) || !ids.includes(row.requirement_id)) p.invalid('Return scoped decision provenance.');
        const absent = strings(row.abstained, 5, 32); unique(absent);
        if (!absent.every((key) => QUESTIONS.includes(key))) p.invalid('Return named abstentions.');
        p.exact(row.confidence, QUESTIONS);
        for (const key of QUESTIONS) {
            number(row.confidence[key], 0, 1);
            if ((row[key] === null) !== absent.includes(key)) p.invalid('Unknown answers must remain abstentions.');
            if (row[key] === null) continue;
            if (['feasibility', 'complexity', 'risk'].includes(key)) number(row[key], 0, 10);
            else if (key === 'component_type' ? !TYPES.includes(row[key]) : typeof row[key] !== 'boolean') p.invalid('Return typed decision answers.');
        }
        const mapping = strings(row.components, 64, 160); unique(mapping);
        const expected = blueprint.components.filter((component) => component.requirements.includes(row.requirement_id)).map((component) => component.name);
        if (mapping.length !== expected.length || !mapping.every((name) => expected.includes(name))) p.invalid('Preserve extracted component mappings.');
        return row.requirement_id;
    });
    unique(received);
    if (received.length !== ids.length) p.invalid('Evaluate every extracted requirement.');
    const complete = evaluations.filter((row) => !row.abstained.length).length;
    const average = Object.fromEntries(['feasibility', 'complexity', 'risk'].map((key) => {
        const scores = evaluations.map((row) => row[key]).filter((score) => score !== null);
        return [key, scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 1000) / 1000 : null];
    }));
    p.exact(value.overall, ['status', 'requirement_count', 'assessed_count', 'review_count', 'average_scores']);
    const overall = { status: !evaluations.length ? 'empty' : complete === evaluations.length ? 'assessed' : 'review_required',
        requirement_count: evaluations.length, assessed_count: complete,
        review_count: evaluations.filter((row) => row.abstained.length || row.automatable !== true).length, average_scores: average };
    if (p.canonical(value.overall) !== p.canonical(overall)) p.invalid('The overall assessment must match its decisions.');
    return value;
}
function replayCommand(body) {
    // The existing event budget stores the digest of the complete structured
    // payload. Identical worker retries are fenced by that digest and revision.
    if (JSON.stringify(body).length > 480000) p.invalid('Blueprint result exceeds the worker budget.');
    p.exact(body, ['action', 'revision', 'request_key', 'payload']);
    p.exact(body.payload, ['id', 'attempt', 'result', 'failure']);
    return { ...body, payload: { ...body.payload, result: { sha256: $security.sha256(JSON.stringify(body.payload.result)) } } };
}
function storeResult(app, submission, value) {
    const record = linked(app, submission);
    p.exact(value, [...BASE_FIELDS, 'blueprint', 'blueprint_failure', 'evaluation', 'evaluation_failure']);
    const flat = research.resultInput(Object.fromEntries(BASE_FIELDS.map((key) => [key, value[key]])));
    if (flat.input_sha256 !== record.getString('input_sha256') || !['', 'no_requirements', 'structure_failed'].includes(value.blueprint_failure) ||
        !['', 'decision_failed'].includes(value.evaluation_failure)) p.invalid('Return a matching source hash and listed extraction outcomes.');
    if (value.blueprint === null) {
        if (!value.blueprint_failure || value.evaluation !== null || value.evaluation_failure || flat.processor !== 'local-document')
            p.invalid('Keep the flat source when blueprint extraction is unavailable.');
    } else {
        if (value.blueprint_failure || flat.processor !== 'local-blueprint') p.invalid('Return an explicit blueprint outcome.');
        validateBlueprint(value.blueprint, flat.input_sha256, record.getString('source_file'));
        if (value.blueprint.truncated && !flat.truncated) p.invalid('Preserve blueprint truncation.');
        if (value.evaluation === null) {
            if (value.evaluation_failure !== 'decision_failed') p.invalid('Record missing evaluation.');
        } else {
            if (value.evaluation_failure) p.invalid('Return a consistent evaluation outcome.');
            validateEvaluation(value.evaluation, value.blueprint);
        }
    }
    record.set('result', value); app.save(record);
    return flat;
}

module.exports = { schema, linked, snapshot, detail, upload, command, replayCommand, storeResult, validateBlueprint, validateEvaluation };
