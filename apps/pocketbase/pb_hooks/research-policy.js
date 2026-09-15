// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/research-policy.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1790100000_mission_research.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790100000_mission_research.js
// DAG Node:    none
// Intent:      Bind research inputs and protected downloads to current workspace roles and registered service identities.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const KINDS = ['search', 'url', 'document', 'audio', 'video'];
const WRITERS = ['owner', 'admin', 'editor'];
const MAX_FILE = 20971520;
const FILES = { txt: 'document', md: 'document', pdf: 'document', docx: 'document',
    mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', mp4: 'video', webm: 'video' };
function schema(app) {
    return access.schema(app, 'research_submissions', ['protocol_version', 'workspace', 'mission', 'status', 'revision', 'result', 'upload']);
}
function bindings() {
    const raw = $os.getenv('BUILDANDDO_RESEARCH_BINDINGS');
    if (!raw) return [];
    let rows;
    try { rows = JSON.parse(raw); } catch { throw new ApiError(503, 'Research bindings need operator review.'); }
    if (!Array.isArray(rows) || rows.length > 100) throw new ApiError(503, 'Research bindings need operator review.');
    const seen = new Set();
    for (const row of rows) {
        if (!access.fields(row, ['workspace', 'bot_user', 'worker_user', 'guild_id', 'channel_id', 'binding', 'capabilities']) ||
            !['workspace', 'worker_user'].every((key) => typeof row[key] === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(row[key])) ||
            typeof row.binding !== 'string' || !/^[a-zA-Z0-9_.-]{1,64}$/.test(row.binding) ||
            !['bot_user', 'guild_id', 'channel_id'].every((key) => typeof row[key] === 'string') ||
            (row.bot_user && (!/^[a-zA-Z0-9_-]{1,64}$/.test(row.bot_user) || !/^[1-9][0-9]{16,19}$/.test(row.guild_id) || !/^[1-9][0-9]{16,19}$/.test(row.channel_id))) ||
            row.bot_user === row.worker_user || !Array.isArray(row.capabilities) || row.capabilities.length > KINDS.length ||
            !row.capabilities.every((kind) => KINDS.includes(kind)) || new Set(row.capabilities).size !== row.capabilities.length || seen.has(row.workspace))
            throw new ApiError(503, 'Research bindings need operator review.');
        seen.add(row.workspace);
    }
    return rows;
}
function binding(workspace) { return bindings().find((row) => row.workspace === workspace) || null; }
function integration(app, workspace, provider) {
    const rows = app.findRecordsByFilter('workspace_integrations', 'workspace = {:workspace} && provider = {:provider}', '', 2, 0, { workspace, provider });
    if (rows.length > 1) throw new ApiError(503, 'Integration bindings need operator review.');
    return rows[0] || null;
}
function capabilities(app, workspace) {
    const registered = binding(workspace);
    const record = integration(app, workspace, 'firecrawl');
    const config = record ? access.json(record, 'configuration') : null;
    const enabled = Boolean(registered && record?.getBool('desired_enabled') && config?.mode === 'read' && config.binding === registered.binding);
    return { enabled, kinds: enabled ? registered.capabilities : [], binding: enabled ? registered.binding : '',
        revision: record ? Number(record.get('revision')) : 0 };
}
function mission(app, auth, info, workspace, id, writing = false) {
    access.requireRole(app, auth, workspace, writing ? WRITERS : ['owner', 'admin', 'editor', 'viewer']);
    const record = access.find(app, 'missions', access.id(id));
    if (record.getString('workspace') !== workspace) throw new ForbiddenError('Choose a mission in this workspace.');
    access.readable(app, record, info);
    if (writing && ['verified', 'failed'].includes(record.getString('status')))
        access.conflict('Start a new mission for additional research on a finished outcome.');
    return record;
}
function publicUrl(value) {
    const url = access.bounded(value, 2048);
    // The processor and crawler egress policy also check DNS, redirects and IPs.
    const match = /^https:\/\/([a-zA-Z0-9.-]+)(?::443)?(?:[/?][^\s\\#]*)?$/.exec(url);
    const host = match?.[1].toLowerCase();
    if (!host || !host.includes('.') || host.endsWith('.') || host.split('.').some((part) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)) ||
        /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) || /^[0-9.]+$/.test(host))
        access.invalid('Use a public HTTPS URL without credentials, fragments or a custom port.');
    return url;
}
function fileInfo(file) {
    const name = file?.originalName || file?.name || '';
    const extension = name.split('.').pop().toLowerCase();
    if (!access.text(name, 180) || /[\x00-\x1f/\\]/.test(name) || !Object.prototype.hasOwnProperty.call(FILES, extension) ||
        !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_FILE)
        access.invalid('Choose a supported document, audio or video file of at most 20 MiB.');
    return { name, kind: FILES[extension], size: file.size };
}
function prepareUpload(e, auth, workspace, origin = 'website', sourceRef = '') {
    schema(e.app); access.requireRole(e.app, auth, workspace, WRITERS);
    const files = e.findUploadedFiles('asset');
    if (files.length !== 1) access.invalid('Upload exactly one file.');
    const info = fileInfo(files[0]);
    return { asset: files, workspace, owner: auth.id, processor: '', original_name: info.name,
        kind: info.kind, size: info.size, origin, source_ref: sourceRef };
}
function upload(e) {
    access.authenticated(e);
    const values = prepareUpload(e, e.auth, e.record.getString('workspace'));
    if (e.record.getString('owner') !== e.auth.id) throw new ForbiddenError('Upload under your own account.');
    Object.entries(values).forEach(([key, value]) => e.record.set(key, value));
    return e.next();
}
function removeUpload(e) {
    schema(e.app); access.authenticated(e);
    access.requireRole(e.app, e.auth, e.record.getString('workspace'), WRITERS);
    if (e.record.getString('owner') !== e.auth.id) throw new ForbiddenError('Only the upload owner may remove it.');
    if (e.app.findRecordsByFilter('research_submissions', 'upload = {:upload}', '', 1, 0, { upload: e.record.id }).length)
        access.conflict('This upload belongs to a retained research submission.');
    return e.next();
}
function worker(app, auth, workspace) {
    schema(app);
    const registered = binding(workspace);
    if (!registered || registered.worker_user !== auth?.id || auth.collection().name !== 'users')
        throw new ForbiddenError('A registered research worker is required.');
    return registered;
}
function currentJob(app, record) {
    const caps = capabilities(app, record.getString('workspace'));
    if (!caps.kinds.includes(record.getString('kind')) || caps.binding !== record.getString('binding') ||
        caps.revision !== Number(record.get('integration_revision')))
        access.conflict('The processing configuration changed or is disabled. Retry with the current configuration.');
    const owner = access.find(app, 'users', record.getString('owner'));
    access.requireRole(app, owner, record.getString('workspace'), WRITERS);
    return owner;
}
function download(e) {
    access.authenticated(e);
    const workspace = e.record.getString('workspace');
    const registered = binding(workspace);
    if (registered?.worker_user === e.auth.id) {
        schema(e.app);
        const rows = e.app.findRecordsByFilter('research_submissions', 'workspace = {:workspace} && upload = {:upload} && status = "processing"', '', 2, 0,
            { workspace, upload: e.record.id });
        if (!rows.some((row) => {
            if (row.getString('processor') !== e.auth.id || !(Date.parse(row.getString('lease_until')) > Date.now())) return false;
            const owner = currentJob(e.app, row); const info = e.requestInfo(); info.auth = owner;
            mission(e.app, owner, info, workspace, row.getString('mission'), true); return true;
        })) throw new ForbiddenError('A current processing lease is required for this file.');
    } else {
        access.requireRole(e.app, e.auth, workspace);
        const rows = e.app.findRecordsByFilter('research_submissions', 'workspace = {:workspace} && upload = {:upload}', '', 2, 0,
            { workspace, upload: e.record.id });
        if (rows.length > 1) access.conflict('Review this file’s research links before downloading.');
        if (rows.length) mission(e.app, e.auth, e.requestInfo(), workspace, rows[0].getString('mission'));
        else if (e.record.getString('owner') !== e.auth.id) throw new ForbiddenError('An unused upload is private to its owner.');
    }
    return e.next();
}
function discord(e, body) {
    access.authenticated(e); schema(e.app);
    const workspace = access.workspaceId(e); const registered = binding(workspace);
    if (!registered || registered.bot_user !== e.auth.id || body.guild_id !== registered.guild_id || body.channel_id !== registered.channel_id)
        throw new ForbiddenError('This bot, server and channel are not bound to the workspace.');
    const config = integration(e.app, workspace, 'discord');
    const desired = config ? access.json(config, 'configuration') : null;
    if (!config?.getBool('desired_enabled') || desired?.guild_id !== registered.guild_id || desired?.channel_id !== registered.channel_id)
        throw new ForbiddenError('Discord is disabled or its requested binding changed.');
    if (typeof body.discord_user_id !== 'string' || !/^[1-9][0-9]{16,19}$/.test(body.discord_user_id))
        access.invalid('Supply the verified Discord caller.');
    const links = e.app.findRecordsByFilter('_externalAuths', 'provider = "discord" && providerId = {:id} && collectionRef = {:collection}', '', 2, 0,
        { id: body.discord_user_id, collection: e.app.findCollectionByNameOrId('users').id });
    if (links.length !== 1) throw new ForbiddenError('Link Discord in your BuildAndDo account settings first.');
    if (body.link_id && body.link_id !== links[0].id) throw new ForbiddenError('The Discord account link changed. Start a new request.');
    const auth = access.find(e.app, 'users', links[0].getString('recordRef'));
    access.requireRole(e.app, auth, workspace);
    const info = e.requestInfo(); info.auth = auth;
    return { workspace, auth, info, linkId: links[0].id };
}

module.exports = { ...access, KINDS, WRITERS, MAX_FILE, FILES, schema, bindings, binding, integration, capabilities, mission,
    publicUrl, fileInfo, prepareUpload, upload, removeUpload, worker, currentJob, download, discord };
