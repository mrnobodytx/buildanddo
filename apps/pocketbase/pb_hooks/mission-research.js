// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/mission-research.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/research-policy.js, apps/pocketbase/pb_hooks/mission-policy.js, apps/pocketbase/pb_hooks/workspace-blueprints.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/research-policy.js; CONSUMES apps/pocketbase/pb_hooks/mission-policy.js; CONSUMES apps/pocketbase/pb_hooks/workspace-blueprints.js
// DAG Node:    none
// Intent:      Connect both intake channels to durable research, fenced processing attempts and explicitly reviewed mission evidence.
// ───────────────────────────────────────────────────────────────

const p = require(`${__hooks}/research-policy.js`);
const missionPolicy = require(`${__hooks}/mission-policy.js`);
const FAILURES = ['unavailable', 'timeout', 'unsupported', 'invalid_data', 'too_large', 'unsafe_source', 'capability_unavailable'];
const ACTIONS = ['mission.propose', 'submit', 'retry', 'cancel', 'attach'];
const now = () => new Date().toISOString();
function assign(record, values) { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; }
function commandInput(body, actions = ACTIONS) {
    p.exact(body, ['action', 'payload', 'revision', 'request_key']);
    if (!actions.includes(body.action) || !p.fields(body.payload, Object.keys(body.payload || {})) ||
        typeof body.request_key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.request_key) || p.canonical(body).length > 60000)
        p.invalid('Use a supported bounded research command and retry key.');
    p.revision(body.revision); return body;
}
function source(app, workspace, id) {
    const record = p.find(app, 'research_submissions', p.id(id));
    if (record.getString('workspace') !== workspace) throw new ForbiddenError('Choose a submission in this workspace.');
    return record;
}
function output(record, detailed = false) {
    const result = { id: record.id };
    for (const field of ['workspace', 'owner', 'mission', 'mode', 'title', 'kind', 'input', 'context', 'origin', 'status', 'binding', 'failure',
        'processed_at', 'evidence', 'review_note', 'reviewed_by', 'reviewed_at', 'created', 'updated']) result[field] = record.getString(field);
    for (const field of ['revision', 'attempt', 'integration_revision']) result[field] = Number(record.get(field));
    if (detailed) { result.result = p.json(record, 'result'); result.upload = record.getString('upload'); }
    return result;
}
function audit(app, auth, workspace, body, operation) {
    const old = app.findRecordsByFilter('research_events', 'workspace = {:workspace} && actor = {:actor} && request_key = {:key}', '', 1, 0,
        { workspace, actor: auth.id, key: body.request_key });
    if (old.length) {
        if (p.canonical(p.json(old[0], 'command')) !== p.canonical(body)) p.conflict('This retry key belongs to a different research command.');
        return { ...p.json(old[0], 'result'), replayed: true };
    }
    const result = operation();
    const event = assign(new Record(app.findCollectionByNameOrId('research_events')), { workspace, actor: auth.id,
        request_key: body.request_key, action: body.action, target: result.id, revision: result.revision, command: body, result });
    app.save(event); return { ...result, replayed: false };
}
function context(e) {
    p.authenticated(e); p.schema(e.app);
    const workspace = p.workspaceId(e); const scope = p.requireRole(e.app, e.auth, workspace);
    return { workspace, auth: e.auth, info: e.requestInfo(), role: scope.role };
}
function submitInput(app, scope, value) {
    p.exact(value, ['mission', 'kind', 'input', 'upload', 'title', 'context']);
    p.mission(app, scope.auth, scope.info, scope.workspace, value.mission, true);
    if (!p.KINDS.includes(value.kind)) p.invalid('Choose a supported source kind.');
    const input = p.bounded(value.input, value.kind === 'search' ? 500 : 2048, ['search', 'url'].includes(value.kind));
    const title = p.bounded(value.title, 160); const detail = p.bounded(value.context, 1200, false);
    p.id(value.upload, true);
    if (['search', 'url'].includes(value.kind)) {
        if (value.upload) p.invalid('A search or URL cannot also contain a file.');
        if (value.kind === 'url') p.publicUrl(input);
    } else {
        if (input || !value.upload) p.invalid('Choose one previously uploaded file.');
        const upload = p.find(app, 'research_uploads', value.upload);
        if (upload.getString('workspace') !== scope.workspace || upload.getString('owner') !== scope.auth.id || upload.getString('kind') !== value.kind)
            throw new ForbiddenError('Use your own matching upload in this workspace.');
        if (app.findRecordsByFilter('research_submissions', 'upload = {:upload}', '', 1, 0, { upload: value.upload }).length)
            p.conflict('This upload already belongs to a research submission. Open that submission instead.');
    }
    return { ...value, input, title, context: detail };
}
function proposed(app, scope, payload) {
    p.exact(payload, ['title', 'description']);
    const record = assign(new Record(app.findCollectionByNameOrId('missions')), {
        title: p.bounded(payload.title, 160), description: p.bounded(payload.description, 1000, false),
        owner: scope.auth.id, workspace: scope.workspace, status: 'proposed', progress: 0, priority: 'medium' });
    missionPolicy.enforce({ app, auth: scope.auth, record, requestInfo: () => scope.info, next: () => undefined }, true);
    app.save(record); return record;
}
function perform(app, scope, body, origin, sourceRef) {
    const workspace = scope.workspace;
    if (body.action === 'mission.propose') {
        if (body.revision !== 0) p.conflict('A new proposal starts at revision zero.');
        const record = proposed(app, scope, body.payload);
        return { workspace, action: body.action, id: record.id, revision: 1, status: 'proposed', evidence: '' };
    }
    let record;
    if (body.action === 'submit') {
        if (body.revision !== 0) p.conflict('A new submission starts at revision zero.');
        const input = submitInput(app, scope, body.payload);
        const caps = p.capabilities(app, workspace);
        const enabled = caps.kinds.includes(input.kind);
        record = assign(new Record(p.schema(app)), { ...input, workspace, owner: scope.auth.id, origin, source_ref: sourceRef,
            protocol_version: 1, revision: 1, attempt: 0, status: enabled ? 'queued' : 'blocked', binding: caps.binding,
            integration_revision: caps.revision, failure: enabled ? '' : 'capability_unavailable' });
    } else {
        p.exact(body.payload, body.action === 'attach' ? ['id', 'note'] : ['id']);
        record = source(app, workspace, body.payload.id);
        p.submissionScope(app, scope.auth, scope.info, workspace, record, body.action === 'retry');
        if (record.getString('mode') === 'blueprint' && body.action === 'attach') p.invalid('Export a blueprint proposal for separate mission review.');
        if (Number(record.get('revision')) !== body.revision) p.conflict('Reload the changed submission before continuing.');
        const status = record.getString('status');
        if (body.action === 'retry') {
            if (!['failed', 'blocked'].includes(status) || Number(record.get('attempt')) >= 5)
                p.conflict('Only failed or blocked submissions with fewer than five attempts can retry.');
            const caps = p.capabilities(app, workspace); const enabled = caps.kinds.includes(record.getString('kind'));
            assign(record, { status: enabled ? 'queued' : 'blocked', failure: enabled ? '' : 'capability_unavailable',
                binding: caps.binding, integration_revision: caps.revision, result: null, lease_until: '', processed_at: '' });
        } else if (body.action === 'cancel') {
            if (['attached', 'cancelled'].includes(status)) p.conflict('This submission has a terminal outcome.');
            assign(record, { status: 'cancelled', lease_until: '' });
        } else {
            if (status !== 'ready' || record.getString('evidence')) p.conflict('Review a parsed source that has not yet been attached.');
            const note = p.bounded(body.payload.note, 1200);
            const parsed = resultInput(p.json(record, 'result'));
            const evidence = assign(new Record(app.findCollectionByNameOrId('evidence')), {
                workspace, owner: scope.auth.id, mission: record.getString('mission'), type: 'observed', category: 'research',
                title: record.getString('title'), content: note + '\n\nSource excerpt: ' + parsed.text.slice(0, 1400),
                source: `Research ${record.id}; ${parsed.processor}; processed ${record.getString('processed_at')}`.slice(0, 160),
                tags: 'research, source-reviewed', url: '' });
            app.save(evidence);
            assign(record, { status: 'attached', evidence: evidence.id, review_note: note, reviewed_by: scope.auth.id, reviewed_at: now() });
        }
        record.set('revision', body.revision + 1);
    }
    app.save(record);
    return { workspace, action: body.action, id: record.id, revision: Number(record.get('revision')),
        status: record.getString('status'), evidence: record.getString('evidence') };
}
function execute(e, scope, raw, origin = 'website', sourceRef = '') {
    const body = commandInput(raw); let response;
    e.app.runInTransaction((app) => {
        p.schema(app); p.requireRole(app, scope.auth, scope.workspace, p.WRITERS);
        // Even a previously accepted retry requires readable, current mission scope.
        if (body.action === 'submit') p.mission(app, scope.auth, scope.info, scope.workspace, body.payload.mission);
        else if (body.action !== 'mission.propose') {
            const record = source(app, scope.workspace, body.payload.id);
            p.submissionScope(app, scope.auth, scope.info, scope.workspace, record);
        }
        response = audit(app, scope.auth, scope.workspace, body, () => perform(app, scope, body, origin, sourceRef));
    });
    return response;
}
function command(e) { return execute(e, context(e), e.requestInfo().body); }
function snapshot(e, suppliedScope) {
    const scope = suppliedScope || context(e); const query = e.requestInfo().query || {};
    const page = p.page(e); let filter = query.mission ? 'workspace = {:workspace} && mission = {:mission}' : 'workspace = {:workspace}';
    if (p.schema(e.app).fields.getByName('mode')) filter += ' && mode != "blueprint"';
    if (query.mission) p.mission(e.app, scope.auth, scope.info, scope.workspace, query.mission);
    const list = p.list(e.app, 'research_submissions', filter, { workspace: scope.workspace, mission: query.mission }, page);
    return { workspace: scope.workspace, role: p.requireRole(e.app, scope.auth, scope.workspace).role,
        capabilities: p.capabilities(e.app, scope.workspace), items: list.rows.filter((row) => {
            const mission = p.find(e.app, 'missions', row.getString('mission'));
            return mission.getString('workspace') === scope.workspace && e.app.canAccessRecord(mission, scope.info, mission.collection().viewRule);
        }).map((row) => output(row)), page, has_more: list.has_more };
}
function detail(e, scope = context(e), id = e.request.pathValue('id')) {
    const record = source(e.app, scope.workspace, id);
    p.mission(e.app, scope.auth, scope.info, scope.workspace, record.getString('mission'));
    return { workspace: scope.workspace, record: output(record, true) };
}
function resultInput(value) {
    p.exact(value, ['text', 'citations', 'processor', 'version', 'input_sha256', 'truncated']);
    const text = p.bounded(value.text, 16000); const processor = p.bounded(value.processor, 80); const version = p.bounded(value.version, 80);
    if (!Array.isArray(value.citations) || value.citations.length > 10 || typeof value.truncated !== 'boolean' ||
        !/^[0-9a-f]{64}$/.test(value.input_sha256)) p.invalid('Return a bounded parsed result with input provenance.');
    const citations = value.citations.map((item) => {
        p.exact(item, ['title', 'url']); return { title: p.bounded(item.title, 160), url: p.publicUrl(item.url) };
    });
    return { text, citations, processor, version, input_sha256: value.input_sha256, truncated: value.truncated };
}
function queue(e) {
    p.authenticated(e); const workspace = p.workspaceId(e); p.worker(e.app, e.auth, workspace);
    const page = p.page(e);
    let filter = 'workspace = {:workspace} && (status = "queued" || status = "processing")';
    if (p.schema(e.app).fields.getByName('mode')) {
        let enabled = false;
        try { enabled = Boolean(e.app.findCollectionByNameOrId('workspace_blueprints').fields.getByName('protocol_version')); }
        catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
        if (!enabled) filter += ' && mode != "blueprint"';
    }
    const rows = p.list(e.app, 'research_submissions', filter, { workspace }, page);
    return { workspace, page, has_more: rows.has_more, items: rows.rows.map((row) => ({ id: row.id, revision: Number(row.get('revision')),
        status: row.getString('status'), lease_until: row.getString('lease_until') })) };
}
function work(e) {
    p.authenticated(e); const workspace = p.workspaceId(e);
    const raw = e.requestInfo().body;
    const structured = raw?.action === 'complete' && raw.payload?.result && Object.prototype.hasOwnProperty.call(raw.payload.result, 'blueprint');
    const blueprint = structured ? require(`${__hooks}/workspace-blueprints.js`) : null;
    const body = commandInput(structured ? blueprint.replayCommand(raw) : raw, ['claim', 'complete']); let response;
    p.exact(body.payload, body.action === 'claim' ? ['id'] : ['id', 'attempt', 'result', 'failure']);
    e.app.runInTransaction((app) => {
        p.worker(app, e.auth, workspace); const record = source(app, workspace, body.payload.id); const owner = p.currentJob(app, record);
        const info = e.requestInfo(); info.auth = owner;
        p.submissionScope(app, owner, info, workspace, record, true);
        response = audit(app, e.auth, workspace, body, () => {
            if (Number(record.get('revision')) !== body.revision) p.conflict('The research revision changed.');
            if (body.action === 'claim') {
                if (!(record.getString('status') === 'queued' || (record.getString('status') === 'processing' &&
                    Number.isFinite(Date.parse(record.getString('lease_until'))) && Date.parse(record.getString('lease_until')) <= Date.now())) ||
                    Number(record.get('attempt')) >= 5) p.conflict('This submission cannot be claimed.');
                assign(record, { status: 'processing', processor: e.auth.id, attempt: Number(record.get('attempt')) + 1,
                    lease_until: new Date(Date.now() + 120000).toISOString(), failure: '' });
                const upload = record.getString('upload');
                if (upload) app.save(assign(p.find(app, 'research_uploads', upload), { processor: e.auth.id }));
            } else {
                if (record.getString('status') !== 'processing' || record.getString('processor') !== e.auth.id ||
                    body.payload.attempt !== Number(record.get('attempt')) || !(Date.parse(record.getString('lease_until')) > Date.now()))
                    p.conflict('The processing lease expired or was replaced.');
                const failed = body.payload.failure;
                if (failed ? !FAILURES.includes(failed) || body.payload.result !== null : failed !== '')
                    p.invalid('Use a listed failure code and no fabricated result.');
                if (!failed && Boolean(structured) !== (record.getString('mode') === 'blueprint')) p.invalid('Return the result format for this research mode.');
                const result = failed ? null : structured ? blueprint.storeResult(app, record, raw.payload.result) : resultInput(body.payload.result);
                assign(record, { status: failed ? 'failed' : 'ready', failure: failed, result, processed_at: now(), lease_until: '' });
            }
            record.set('revision', body.revision + 1); app.save(record);
            return { workspace, action: body.action, id: record.id, revision: Number(record.get('revision')), status: record.getString('status') };
        });
        const current = source(app, workspace, record.id);
        if (body.action === 'claim') {
            if (current.getString('status') !== 'processing' || current.getString('processor') !== e.auth.id ||
                !(Date.parse(current.getString('lease_until')) > Date.now()) || response.revision !== Number(current.get('revision')))
                p.conflict('The earlier claim is no longer current.');
            response.job = { ...output(current, true), lease_until: current.getString('lease_until') };
            if (current.getString('mode') === 'blueprint')
                response.job.expected_sha256 = require(`${__hooks}/workspace-blueprints.js`).linked(app, current).getString('input_sha256');
            if (current.getString('upload')) {
                const file = p.find(app, 'research_uploads', current.getString('upload'));
                response.job.file = { id: file.id, name: file.getString('original_name'), asset: file.getString('asset'), size: Number(file.get('size')) };
            }
        }
    });
    return response;
}
function discordCommand(e) {
    const raw = e.requestInfo().body;
    p.exact(raw, ['discord_user_id', 'guild_id', 'channel_id', 'link_id', 'command']);
    const scope = p.discord(e, raw); const body = raw.command;
    if (body?.action === 'access') {
        p.exact(body, ['action']);
        const role = p.requireRole(e.app, scope.auth, scope.workspace).role;
        return { workspace: scope.workspace, can_write: p.WRITERS.includes(role), link_id: scope.linkId };
    }
    if (body?.action === 'upload') {
        p.exact(body, ['action', 'source_ref']); p.requireRole(e.app, scope.auth, scope.workspace, p.WRITERS);
        if (!/^[1-9][0-9]{16,19}$/.test(body.source_ref)) p.invalid('Use an attachment identifier.');
        const files = e.app.findRecordsByFilter('research_uploads', 'workspace = {:workspace} && owner = {:owner} && origin = "discord" && source_ref = {:ref}', '', 2, 0,
            { workspace: scope.workspace, owner: scope.auth.id, ref: body.source_ref });
        if (files.length > 1) p.conflict('This attachment needs upload receipt review.');
        return { workspace: scope.workspace, id: files[0]?.id || '', kind: files[0]?.getString('kind') || '' };
    }
    if (body?.action === 'submissions') {
        p.exact(body, ['action', 'mission', 'page']);
        p.revision(body.page); if (body.page < 1 || body.page > 9999) p.invalid('Choose a bounded page.');
        const value = snapshot({ ...e, requestInfo: () => ({ ...scope.info, query: { page: String(body.page), mission: body.mission } }) }, scope);
        return { workspace: scope.workspace, page: value.page, has_more: value.has_more,
            items: value.items.map((item) => ({ id: item.id, title: item.title, mission: item.mission, status: item.status, created: item.created })) };
    }
    if (body?.action === 'missions' || body?.action === 'evidence') {
        p.exact(body, ['action', 'mission', 'page']);
        p.revision(body.page); if (body.page < 1 || body.page > 9999) p.invalid('Choose a bounded page.');
        if (body.mission) p.mission(e.app, scope.auth, scope.info, scope.workspace, body.mission);
        const collection = body.action === 'missions' ? 'missions' : 'evidence';
        const filter = body.action === 'evidence' && body.mission ? 'workspace = {:workspace} && mission = {:mission}' : 'workspace = {:workspace}';
        const rows = p.list(e.app, collection, filter, { workspace: scope.workspace, mission: body.mission }, body.page, 10);
        const items = rows.rows.filter((row) => e.app.canAccessRecord(row, scope.info, row.collection().viewRule)).map((row) => ({
            id: row.id, title: row.getString('title'), status: row.getString(body.action === 'missions' ? 'status' : 'type'),
            mission: row.getString('mission'), created: row.getString('created') }));
        return { workspace: scope.workspace, items, page: body.page, has_more: rows.has_more };
    }
    if (body?.action === 'submission') {
        p.exact(body, ['action', 'id']); const value = detail(e, scope, body.id).record;
        // Detailed extracted/private content is reviewed on the authenticated website.
        return { workspace: scope.workspace, id: value.id, mission: value.mission, status: value.status, evidence: value.evidence,
            revision: value.revision, title: value.title, failure: value.failure };
    }
    if (raw.link_id !== scope.linkId) throw new ForbiddenError('Confirm the current Discord account link before submitting.');
    return execute(e, scope, body, 'discord');
}
function discordUpload(e) {
    const raw = e.requestInfo().body;
    p.exact(raw, ['discord_user_id', 'guild_id', 'channel_id', 'link_id', 'source_ref']);
    if (!/^[1-9][0-9]{16,19}$/.test(raw.source_ref)) p.invalid('Use the Discord attachment identifier.');
    let response;
    e.app.runInTransaction((app) => {
        const event = { app, auth: e.auth, request: e.request, requestInfo: () => e.requestInfo(), findUploadedFiles: (key) => e.findUploadedFiles(key) };
        const scope = p.discord(event, raw);
        if (raw.link_id !== scope.linkId) throw new ForbiddenError('Confirm the current Discord account link before uploading.');
        const values = p.prepareUpload(event, scope.auth, scope.workspace, 'discord', raw.source_ref);
        const old = app.findRecordsByFilter('research_uploads', 'workspace = {:workspace} && owner = {:owner} && origin = "discord" && source_ref = {:ref}', '', 2, 0,
            { workspace: scope.workspace, owner: scope.auth.id, ref: raw.source_ref });
        if (old.length) {
            if (old.length !== 1 || old[0].getString('original_name') !== values.original_name || Number(old[0].get('size')) !== values.size)
                p.conflict('This attachment already has a different upload receipt.');
            response = { workspace: scope.workspace, id: old[0].id, kind: old[0].getString('kind'), size: Number(old[0].get('size')), replayed: true };
        } else {
            const file = assign(new Record(app.findCollectionByNameOrId('research_uploads')), values); app.save(file);
            response = { workspace: scope.workspace, id: file.id, kind: file.getString('kind'), size: Number(file.get('size')), replayed: false };
        }
    });
    return response;
}

module.exports = { commandInput, output, context, submitInput, execute, command, snapshot, detail, resultInput, queue, work, discordCommand, discordUpload };
