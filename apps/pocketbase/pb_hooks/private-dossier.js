// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/private-dossier.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/dossier-vault.js, apps/pocketbase/pb_hooks/research-policy.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/dossier-vault.js; CONSUMES apps/pocketbase/pb_hooks/research-policy.js
// DAG Node:    none
// Intent:      Connect personal entity recall and corrections to canonical user identity with atomic encrypted saves and deletion-safe retries.
// ───────────────────────────────────────────────────────────────

const p = require(`${__hooks}/research-policy.js`);
const vault = require(`${__hooks}/dossier-vault.js`);
const KINDS = ['person', 'organization', 'project', 'place', 'topic'];
const ACTIONS = ['dossier.update', 'entity.create', 'entity.update', 'entity.delete', 'note.add', 'note.update', 'note.delete'];
const MAX_ENTITIES = 200;
const MAX_NOTES = 20;
const now = () => new Date().toISOString();
const assign = (record, values) => { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; };
function fresh(app, collection, values) {
    // This random value is a record identifier, never an authentication credential.
    const record = new Record(app.findCollectionByNameOrId(collection));
    record.id = $security.randomString(15);
    return assign(record, values);
}
function owned(app, collection, owner, id) {
    const rows = app.findRecordsByFilter(collection, 'owner = {:owner} && id = {:id}', '', 1, 0, { owner, id: p.id(id) });
    if (rows.length !== 1 || rows[0].getString('owner') !== owner) throw new NotFoundError('This private record is unavailable.');
    return rows[0];
}
function dossier(app, owner) {
    const rows = app.findRecordsByFilter('user_dossiers', 'owner = {:owner}', '', 2, 0, { owner });
    if (rows.length > 1 || (rows.length && rows[0].getString('owner') !== owner)) return vault.unavailable();
    return rows[0] || null;
}
function entityRows(app, owner, root) {
    if (!root) return [];
    const rows = app.findRecordsByFilter('dossier_entities', 'owner = {:owner} && dossier = {:dossier}', '-updated,-id', MAX_ENTITIES + 1, 0,
        { owner, dossier: root.id });
    if (rows.length > MAX_ENTITIES || rows.some((row) => row.getString('owner') !== owner || row.getString('dossier') !== root.id)) return vault.unavailable();
    return rows;
}
function strings(values, max, length) {
    if (!Array.isArray(values) || values.length > max) p.invalid('Use a bounded list of aliases or tags.');
    const result = values.map((value) => p.bounded(value, length));
    if (new Set(result.map((value) => value.toLowerCase())).size !== result.length) p.invalid('Remove duplicate aliases or tags.');
    return result;
}
function labelInput(value) {
    if (!KINDS.includes(value.kind)) p.invalid('Choose a supported entity kind.');
    return { label: p.bounded(value.label, 160), kind: value.kind,
        aliases: strings(value.aliases, 10, 120), tags: strings(value.tags, 10, 40) };
}
function noteInput(value) {
    const sourceUrl = p.bounded(value.source_url, 2048, false);
    return { text: p.bounded(value.text, 2000), source_url: sourceUrl ? p.publicUrl(sourceUrl) : '',
        source_label: p.bounded(value.source_label, 160, false) };
}
function output(record, keys) {
    const data = vault.open(record, keys);
    if (!KINDS.includes(data.kind) || typeof data.label !== 'string' || !Array.isArray(data.aliases) ||
        !Array.isArray(data.tags) || !Array.isArray(data.notes) || data.notes.length > MAX_NOTES) return vault.unavailable();
    return { ...data, id: record.id, revision: Number(record.get('revision')), created: record.getString('created'), updated: record.getString('updated') };
}
function rootOutput(record, owner, keys) {
    const value = record ? vault.open(record, keys) : { about: '' };
    if (typeof value.about !== 'string') return vault.unavailable();
    return { id: record?.id || '', owner, revision: record ? Number(record.get('revision')) : 0, about: value.about };
}
function readIn(app, scope, body, keys) {
    const root = dossier(app, scope.auth.id); const owner = scope.auth.id;
    if (body?.action === 'access') {
        p.exact(body, ['action']);
        return { owner, dossier_id: root?.id || '', link_id: scope.linkId || '', encrypted_storage: true };
    }
    if (body?.action === 'entity') {
        p.exact(body, ['action', 'id']);
        const record = owned(app, 'dossier_entities', owner, body.id);
        if (!root || record.getString('dossier') !== root.id) return vault.unavailable();
        return { owner, dossier_id: root.id, entity: output(record, keys) };
    }
    p.exact(body, ['action', 'query', 'page']);
    if (body.action !== 'recall') p.invalid('Choose a supported dossier read.');
    const query = p.bounded(body.query, 200, false).toLowerCase();
    p.revision(body.page); if (body.page < 1 || body.page > 20) p.invalid('Choose a page from 1 to 20.');
    const terms = query.split(/\s+/).filter(Boolean);
    const all = entityRows(app, owner, root).map((row) => output(row, keys));
    const matching = all.filter((row) => {
        const haystack = [row.label, ...row.aliases, ...row.tags, ...row.notes.map((note) => note.text)].join('\n').toLowerCase();
        return terms.every((term) => haystack.includes(term));
    });
    const start = (body.page - 1) * 10;
    return { owner, dossier: rootOutput(root, owner, keys), encrypted_storage: true, entity_count: all.length,
        total: matching.length, page: body.page, has_more: matching.length > start + 10,
        limits: { entities: MAX_ENTITIES, notes: MAX_NOTES },
        items: matching.slice(start, start + 10).map((row) => {
            const note = row.notes.find((item) => terms.length && terms.some((term) => item.text.toLowerCase().includes(term))) || row.notes[row.notes.length - 1];
            return { id: row.id, revision: row.revision, label: row.label, kind: row.kind, aliases: row.aliases, tags: row.tags,
                note_count: row.notes.length, excerpt: note?.text.slice(0, 240) || '', updated: row.updated };
        }) };
}
function commandInput(body) {
    p.exact(body, ['action', 'payload', 'revision', 'request_key']);
    if (!ACTIONS.includes(body.action) || !p.fields(body.payload, Object.keys(body.payload || {})) ||
        typeof body.request_key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.request_key) || p.canonical(body).length > 12000)
        p.invalid('Use a supported bounded dossier command and retry key.');
    p.revision(body.revision);
    return body;
}
function perform(app, scope, body, root, keys) {
    const owner = scope.auth.id; let record; let content;
    const profile = root ? vault.open(root, keys) : { about: '' };
    if (body.action === 'dossier.update') {
        p.exact(body.payload, ['about']);
        if (body.revision !== (root ? Number(root.get('revision')) : 0)) p.conflict('Reload your changed dossier before saving.');
        profile.about = p.bounded(body.payload.about, 2000, false);
    } else if (body.action === 'entity.create') {
        p.exact(body.payload, ['label', 'kind', 'aliases', 'tags', 'note', 'source_url', 'source_label']);
        if (body.revision !== 0) p.conflict('A new entity starts at revision zero.');
        if (entityRows(app, owner, root).length >= MAX_ENTITIES) p.conflict('Your dossier has 200 entities. Remove an unused entity before adding another.');
        content = { ...labelInput(body.payload), notes: [{ id: $security.randomString(15),
            ...noteInput({ ...body.payload, text: body.payload.note }), origin: scope.origin, created: now(), updated: now() }] };
    } else {
        const fields = body.action === 'entity.update' ? ['id', 'label', 'kind', 'aliases', 'tags'] :
            body.action === 'note.add' ? ['id', 'text', 'source_url', 'source_label'] :
                body.action === 'note.update' ? ['id', 'note_id', 'text', 'source_url', 'source_label'] :
                    body.action === 'note.delete' ? ['id', 'note_id'] : ['id'];
        p.exact(body.payload, fields);
        record = owned(app, 'dossier_entities', owner, body.payload.id);
        if (!root || record.getString('dossier') !== root.id) return vault.unavailable();
        if (Number(record.get('revision')) !== body.revision) p.conflict('Reload the changed entity before correcting or deleting it.');
        content = vault.open(record, keys);
        if (body.action === 'entity.update') Object.assign(content, labelInput(body.payload));
        if (body.action === 'note.add') {
            if (content.notes.length >= MAX_NOTES) p.conflict('This entity has 20 notes. Correct or remove an older note before adding another.');
            content.notes.push({ id: $security.randomString(15), ...noteInput(body.payload), origin: scope.origin, created: now(), updated: now() });
        }
        if (['note.update', 'note.delete'].includes(body.action)) {
            const noteId = p.id(body.payload.note_id); const index = content.notes.findIndex((note) => note.id === noteId);
            if (index < 0) throw new NotFoundError('This note is unavailable.');
            if (body.action === 'note.delete') content.notes.splice(index, 1);
            else Object.assign(content.notes[index], noteInput(body.payload), { updated: now(), corrected_via: scope.origin });
        }
    }
    if (content && p.canonical(content).length > 45000) p.invalid('This entity has reached its content limit. Shorten or remove a note before saving.');
    if (!root) root = fresh(app, 'user_dossiers', { owner, protocol_version: 1, revision: 0 });
    root.set('revision', Number(root.get('revision')) + 1);
    vault.seal(root, profile, keys); app.save(root);
    if (body.action === 'dossier.update') record = root;
    else if (body.action === 'entity.delete') app.delete(record);
    else {
        if (!record) record = fresh(app, 'dossier_entities', { owner, dossier: root.id });
        record.set('revision', body.revision + 1);
        vault.seal(record, content, keys); app.save(record);
    }
    return { owner, dossier_id: root.id, id: record.id, revision: body.revision + 1, action: body.action };
}
function executeIn(app, scope, raw, keys) {
    const body = commandInput(raw); const owner = scope.auth.id;
    const signature = $security.sha256(p.canonical(body));
    const prior = app.findRecordsByFilter('dossier_events', 'owner = {:owner} && request_key = {:key}', '', 2, 0, { owner, key: body.request_key });
    if (prior.length > 1) return vault.unavailable();
    if (prior.length) {
        const receipt = vault.open(prior[0], keys);
        if (receipt.signature !== signature) p.conflict('This retry key belongs to a different dossier command.');
        // Never return an old content snapshot or repeat a previously accepted write.
        return { ...receipt.result, replayed: true };
    }
    const result = perform(app, scope, body, dossier(app, owner), keys);
    const event = fresh(app, 'dossier_events', { owner, dossier: result.dossier_id, revision: result.revision, request_key: body.request_key });
    vault.seal(event, { signature, result, origin: scope.origin }, keys); app.save(event);
    return { ...result, replayed: false };
}
function eventRead(app, scope, body, keys) {
    p.exact(body, ['action', 'page']); p.revision(body.page);
    if (body.action !== 'history' || body.page < 1 || body.page > 9999) p.invalid('Choose a bounded history page.');
    const list = p.list(app, 'dossier_events', 'owner = {:owner}', { owner: scope.auth.id }, body.page);
    return { owner: scope.auth.id, page: body.page, has_more: list.has_more, items: list.rows.map((record) => {
        const value = vault.open(record, keys);
        return { id: record.id, target: value.result.id, action: value.result.action, revision: value.result.revision,
            origin: value.origin, created: record.getString('created') };
    }) };
}
function transact(e, mode) {
    p.authenticated(e); const raw = e.requestInfo().body; let result;
    e.app.runInTransaction((app) => {
        vault.schema(app); const keys = vault.keyring();
        let scope;
        if (mode === 'discord') {
            p.exact(raw, ['discord_user_id', 'guild_id', 'channel_id', 'link_id', 'command']);
            const event = { app, auth: e.auth, request: e.request, requestInfo: () => e.requestInfo() };
            scope = { ...p.discord(event, raw), origin: 'discord' };
            if (raw.command?.action !== 'access' && raw.link_id !== scope.linkId)
                throw new ForbiddenError('The Discord account link changed. Start a new request.');
        } else scope = { auth: p.find(app, 'users', e.auth.id), origin: 'website' };
        const body = mode === 'discord' ? raw.command : raw;
        if (mode === 'command' || (mode === 'discord' && ACTIONS.includes(body?.action))) result = executeIn(app, scope, body, keys);
        else if (body?.action === 'history') result = eventRead(app, scope, body, keys);
        else result = readIn(app, scope, body, keys);
        if (mode === 'discord') result = { ...result, workspace: scope.workspace, link_id: scope.linkId };
    });
    return result;
}

module.exports = { KINDS, ACTIONS, MAX_ENTITIES, MAX_NOTES,
    read: (e) => transact(e, 'read'), command: (e) => transact(e, 'command'), discord: (e) => transact(e, 'discord') };
