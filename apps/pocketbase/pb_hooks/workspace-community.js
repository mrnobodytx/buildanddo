// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workspace-community.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// DAG Node:    none
// Intent:      Publish workspace wiki pages and moderate discussions through current-role checks, bounded reads and retry-safe audited commands.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const isAdmin = (role) => ['owner', 'admin'].includes(role);
function output(record) {
    const names = record.collection().name === 'wiki_pages' ? ['title', 'slug', 'body', 'status', 'owner', 'workspace', 'published_by', 'published_at'] :
        ['title', 'body', 'topic', 'status', 'owner', 'workspace', 'moderation_note', 'moderated_by', 'moderated_at'];
    const result = { id: record.id, revision: Number(record.get('revision')) };
    names.concat(['created', 'updated']).forEach((name) => { result[name] = record.getString(name); });
    return result;
}
function feature(app, workspace, kind) {
    const settings = access.settings(access.controls(app, workspace));
    return { settings, enabled: kind === 'wiki' ? settings.wiki_enabled : settings.forum_enabled };
}
function recordFor(app, name, id, workspace, revision) {
    const record = access.find(app, name, access.id(id));
    if (record.getString('workspace') !== workspace) throw new NotFoundError('The requested community record is unavailable.');
    if (revision !== undefined && Number(record.get('revision')) !== revision)
        access.conflict('This contribution changed. Reload it before saving.');
    return record;
}
function topicVisible(record, auth, role) {
    return isAdmin(role) || ['open', 'locked'].includes(record.getString('status')) ||
        (record.getString('status') === 'pending' && record.getString('owner') === auth.id);
}
function saveWiki(app, e, scope, body) {
    const value = body.payload;
    access.exact(value, ['id', 'title', 'slug', 'body']);
    access.id(value.id, true);
    const title = access.bounded(value.title, 160);
    const slug = access.bounded(value.slug, 100);
    const content = access.bounded(value.body, 16000);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) access.invalid('Use lowercase words separated by hyphens for the page address.');
    let record;
    if (value.id) {
        record = recordFor(app, 'wiki_pages', value.id, scope.workspace.id, body.revision);
        if (!isAdmin(scope.role) && record.getString('owner') !== e.auth.id) throw new ForbiddenError('Only the author or a moderator may edit this draft.');
        if (record.getString('status') !== 'draft') access.conflict('A moderator must return this page to draft before its content changes.');
    } else {
        if (body.revision !== 0) access.invalid('A new page starts at revision zero.');
        record = new Record(app.findCollectionByNameOrId('wiki_pages'));
        record.set('workspace', scope.workspace.id); record.set('owner', e.auth.id); record.set('status', 'draft');
    }
    const duplicate = app.findRecordsByFilter('wiki_pages', 'workspace = {:workspace} && slug = {:slug}', '', 1, 0,
        { workspace: scope.workspace.id, slug });
    if (duplicate.some((row) => row.id !== record.id)) access.conflict('That page address is already in use. Choose another.');
    record.set('title', title); record.set('slug', slug); record.set('body', content);
    return record;
}
function transitionWiki(app, e, scope, body) {
    access.exact(body.payload, ['id', 'status']);
    if (!isAdmin(scope.role)) throw new ForbiddenError('A workspace administrator must publish or archive wiki pages.');
    if (!['draft', 'published', 'archived'].includes(body.payload.status)) access.invalid('Choose a listed wiki state.');
    const record = recordFor(app, 'wiki_pages', body.payload.id, scope.workspace.id, body.revision);
    if (body.payload.status === 'published') {
        access.bounded(record.getString('title'), 160); access.bounded(record.getString('body'), 16000);
        record.set('published_by', e.auth.id); record.set('published_at', new Date().toISOString());
    }
    record.set('status', body.payload.status);
    return record;
}
function postForum(app, e, scope, body, settings) {
    const replying = body.action === 'forum.reply';
    access.exact(body.payload, replying ? ['topic', 'body'] : ['title', 'body']);
    if (replying) {
        const topic = recordFor(app, 'forum_topics', body.payload.topic, scope.workspace.id, body.revision);
        if (topic.getString('status') !== 'open') access.conflict('Replies require an open topic.');
    } else if (body.revision !== 0) access.invalid('A new topic starts at revision zero.');
    const content = access.bounded(body.payload.body, 8000);
    const record = new Record(app.findCollectionByNameOrId(replying ? 'forum_replies' : 'forum_topics'));
    record.set('workspace', scope.workspace.id); record.set('owner', e.auth.id); record.set('body', content);
    if (replying) record.set('topic', body.payload.topic);
    else record.set('title', access.bounded(body.payload.title, 160));
    record.set('status', settings.forum_moderation && !isAdmin(scope.role) ? 'pending' : replying ? 'visible' : 'open');
    return record;
}
function moderateForum(app, e, scope, body) {
    access.exact(body.payload, ['kind', 'id', 'status', 'note']);
    if (!isAdmin(scope.role)) throw new ForbiddenError('A workspace administrator must moderate discussions.');
    const { kind, status } = body.payload;
    if (!['topic', 'reply'].includes(kind) || !(kind === 'topic' ? ['open', 'locked', 'hidden'] : ['visible', 'hidden']).includes(status))
        access.invalid('Choose a listed moderation outcome.');
    const record = recordFor(app, kind === 'topic' ? 'forum_topics' : 'forum_replies', body.payload.id, scope.workspace.id, body.revision);
    if (kind === 'reply') recordFor(app, 'forum_topics', record.getString('topic'), scope.workspace.id);
    record.set('status', status); record.set('moderation_note', access.bounded(body.payload.note, 800));
    record.set('moderated_by', e.auth.id); record.set('moderated_at', new Date().toISOString());
    return record;
}

/** Save one versioned community contribution or moderator decision with its receipt. */
function command(e) {
    const { workspace, body } = access.envelope(e);
    if (!['wiki.save', 'wiki.transition', 'forum.create', 'forum.reply', 'forum.moderate'].includes(body.action))
        access.invalid('Choose a supported community command.');
    let response;
    e.app.runInTransaction((app) => {
        const scope = access.requireRole(app, e.auth, workspace, ['owner', 'admin', 'editor']);
        const state = feature(app, workspace, body.action.startsWith('wiki.') ? 'wiki' : 'forum');
        if (!state.enabled) throw new ForbiddenError('This community feature is disabled by the workspace administrator.');
        // Recheck privileged actions on retries too, before returning a receipt.
        if (['wiki.transition', 'forum.moderate'].includes(body.action) && !isAdmin(scope.role))
            throw new ForbiddenError('A workspace administrator must make this decision.');
        response = access.audit(app, e.auth, workspace, body, () => {
            const record = body.action === 'wiki.save' ? saveWiki(app, e, scope, body) :
                body.action === 'wiki.transition' ? transitionWiki(app, e, scope, body) :
                    body.action === 'forum.moderate' ? moderateForum(app, e, scope, body) : postForum(app, e, scope, body, state.settings);
            record.set('revision', Number(record.get('revision') || 0) + 1);
            app.save(record);
            return { id: record.id, workspace, revision: Number(record.get('revision')), status: record.getString('status'), action: body.action };
        });
    });
    return response;
}

/** Read wiki pages without exposing another contributor's unpublished work. */
function wiki(e) {
    const auth = access.access(e);
    const number = access.page(e);
    if (!auth.settings.wiki_enabled) return { ...auth, enabled: false, items: [], page: number, has_more: false };
    const filter = 'workspace = {:workspace}' + (auth.can_admin ? '' : ' && (status = "published" || owner = {:owner})');
    const result = access.list(e.app, 'wiki_pages', filter, { workspace: auth.workspace, owner: e.auth.id }, number);
    return { ...auth, enabled: true, items: result.rows.map(output), page: number, has_more: result.has_more };
}

/** Read topics with pending work visible only to its author and moderators. */
function forums(e) {
    const auth = access.access(e);
    const number = access.page(e);
    if (!auth.settings.forum_enabled) return { ...auth, enabled: false, items: [], page: number, has_more: false };
    const filter = 'workspace = {:workspace}' + (auth.can_admin ? '' : ' && (status = "open" || status = "locked" || (status = "pending" && owner = {:owner}))');
    const result = access.list(e.app, 'forum_topics', filter, { workspace: auth.workspace, owner: e.auth.id }, number);
    return { ...auth, enabled: true, items: result.rows.map(output), page: number, has_more: result.has_more };
}

/** Read one allowed thread and a bounded page of its visible replies. */
function thread(e) {
    const auth = access.access(e);
    if (!auth.settings.forum_enabled) throw new ForbiddenError('The workspace forum is disabled.');
    const topic = recordFor(e.app, 'forum_topics', e.request.pathValue('id'), auth.workspace);
    if (!topicVisible(topic, e.auth, auth.role)) throw new NotFoundError('The requested discussion is unavailable.');
    const filter = 'workspace = {:workspace} && topic = {:topic}' + (auth.can_admin ? '' : ' && (status = "visible" || (status = "pending" && owner = {:owner}))');
    const result = access.list(e.app, 'forum_replies', filter, { workspace: auth.workspace, topic: topic.id, owner: e.auth.id }, access.page(e));
    return { ...auth, topic: output(topic), items: result.rows.map(output), page: result.page, has_more: result.has_more };
}

module.exports = { command, wiki, forums, thread };
