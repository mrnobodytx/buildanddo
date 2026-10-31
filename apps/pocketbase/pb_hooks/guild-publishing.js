// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/guild-publishing.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/guildmasters.js, apps/pocketbase/pb_migrations/1792400000_guild_publications.js, apps/pocketbase/pb_migrations/1792400001_guild_withdrawn_status.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_hooks/guildmasters.js; DEPENDS_ON apps/pocketbase/pb_migrations/1792400000_guild_publications.js; DEPENDS_ON apps/pocketbase/pb_migrations/1792400001_guild_withdrawn_status.js; CONSUMED_BY apps/pocketbase/pb_hooks/workspace-claims.js; CONSUMED_BY apps/pocketbase/pb_hooks/business-policy.js; CONSUMED_BY apps/pocketbase/pb_hooks/workspace-community.js; CONSUMED_BY apps/pocketbase/pb_hooks/guild-lessons.js; VERIFIED_BY tests/upgrade/guild-publishing.test.mjs
// Intent:      Let a guildmaster seat publish its own work directly, record every such publication, and let owners and admins withdraw it.
// ----------------------------------------------------------------
//
// Owner decision (1) of 2026-10-31: guildmasters publish directly, with an audit trail and
// owner/admin moderation. A guildmaster is decided by guildmasters.seatOf from the stored account
// alone, and only for its own records while it holds editor or higher role. Each publication writes
// one guild_publications row in the publishing command's transaction, so a replayed retry key, which
// never re-runs the operation, adds none. Human and administrator paths never touch this collection:
// without its migration only a guildmaster publication answers 503.

const access = require(`${__hooks}/workspace-access.js`);
const guildmasters = require(`${__hooks}/guildmasters.js`);
const ADMINS = ['owner', 'admin'];
const AUTHORS = [...ADMINS, 'editor'];
const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const FIELDS = ['workspace', 'actor', 'actor_seat', 'persona', 'action', 'kind', 'target', 'title', 'content_digest', 'note'];
// What each kind is, how it counts revisions, which states are live, and what withdrawal leaves.
// Forum records are hidden, not deleted, and carry the moderator's note like forum.moderate does.
const KINDS = {
    daily_edition: { collection: 'daily_editions', revision: 'claim_revision', live: ['published'], withdrawn: 'withdrawn' },
    social_content: { collection: 'social_content', revision: 'claim_revision', live: ['published'], withdrawn: 'withdrawn' },
    forum_topic: { collection: 'forum_topics', revision: 'revision', live: ['open', 'locked'], withdrawn: 'hidden', moderated: true },
    forum_reply: { collection: 'forum_replies', revision: 'revision', live: ['visible'], withdrawn: 'hidden', moderated: true },
    wiki_page: { collection: 'wiki_pages', revision: 'revision', live: ['published'], withdrawn: 'archived' },
    guild_lesson: { collection: 'guild_lessons', revision: 'revision', live: ['published'], withdrawn: 'withdrawn' },
};

/**
 * The guildmaster entry when `auth` may publish directly here, or null.
 * It must be a guildmaster seat holding owner, admin or editor role now, and, when a record is
 * given, that record's author. Never throws: any failure means "not a guildmaster author".
 */
function author(app, auth, workspace, original) {
    const entry = guildmasters.seatOf(app, auth);
    if (!entry) return null;
    try {
        access.requireRole(app, auth, workspace, AUTHORS);
    } catch (_err) {
        return null;
    }
    if (original && original.getString('owner') !== auth.id) return null;
    return entry;
}

function schema(app) {
    let collection = null;
    try { collection = app.findCollectionByNameOrId('guild_publications'); }
    catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
    if (!collection || !FIELDS.every((field) => collection.fields.getByName(field)) || RULES.some((rule) => collection[rule] != null))
        throw new ApiError(503, 'Install the guild publishing migration before a guildmaster seat publishes.');
    return collection;
}

function assign(record, values) { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; }

/** Write one `published` row for a guildmaster publication inside the caller's transaction. */
function record(app, { workspace, auth, entry, kind, target, title, content }) {
    const collection = schema(app);
    if (!Object.hasOwn(KINDS, kind) || !entry) access.invalid('Record a listed guild publication.');
    const row = assign(new Record(collection), {
        workspace, actor: auth.id, actor_seat: entry.seat, persona: entry.slug, action: 'published', kind, target,
        title: String(title || '').trim().slice(0, 200), content_digest: $security.sha256(access.canonical(content)), note: '',
    });
    app.save(row);
    return row;
}

function target(app, kind, id, workspace) {
    try {
        const found = app.findRecordById(KINDS[kind].collection, id);
        return found.getString('workspace') === workspace ? found : null;
    } catch (_err) {
        return null;
    }
}

function output(app, row, workspace) {
    const kind = row.getString('kind'), saved = Object.hasOwn(KINDS, kind) ? target(app, kind, row.getString('target'), workspace) : null;
    const status = saved ? saved.getString('status') : 'unavailable';
    const result = { id: row.id };
    for (const field of ['action', 'kind', 'target', 'title', 'persona', 'actor', 'actor_seat', 'content_digest', 'note', 'created'])
        result[field] = row.getString(field);
    result.target_status = status;
    result.target_revision = saved ? Number(saved.get(KINDS[kind].revision) || 0) : null;
    result.withdrawable = Boolean(saved) && row.getString('action') === 'published' && KINDS[kind].live.includes(status);
    return result;
}

/** Read a bounded page of the workspace's guild publications. Owners and admins only; no emails. */
function list(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    access.requireRole(e.app, e.auth, workspace, ADMINS);
    schema(e.app);
    const number = access.page(e);
    const result = access.list(e.app, 'guild_publications', 'workspace = {:workspace}', { workspace }, number);
    return { workspace, page: number, has_more: result.has_more, items: result.rows.map((row) => output(e.app, row, workspace)) };
}

/** Withdraw one guild publication: an owner/admin decision with a required note and its own audit row. */
function command(e) {
    const { workspace, body } = access.envelope(e);
    if (body.action !== 'publication.withdraw') access.invalid('Choose a supported guild publication command.');
    access.exact(body.payload, ['kind', 'target', 'note']);
    const { kind } = body.payload;
    if (typeof kind !== 'string' || !Object.hasOwn(KINDS, kind)) access.invalid('Choose a listed publication kind.');
    const id = access.id(body.payload.target);
    const note = access.bounded(body.payload.note, 800);
    const spec = KINDS[kind];
    let result;
    e.app.runInTransaction((app) => {
        access.requireRole(app, e.auth, workspace, ADMINS);
        const collection = schema(app);
        result = access.audit(app, e.auth, workspace, body, () => {
            const published = app.findRecordsByFilter('guild_publications',
                'workspace = {:workspace} && kind = {:kind} && target = {:target} && action = {:action}', '-created,-id', 1, 0,
                { workspace, kind, target: id, action: 'published' });
            if (!published.length) throw new NotFoundError('This record has no guild publication to withdraw.');
            const saved = target(app, kind, id, workspace);
            if (!saved) throw new NotFoundError('The published record is unavailable.');
            const revision = Number(saved.get(spec.revision) || 0);
            if (!Number.isSafeInteger(revision) || revision !== body.revision || revision >= Number.MAX_SAFE_INTEGER)
                access.conflict('This record changed. Reload it before withdrawing.');
            if (!spec.live.includes(saved.getString('status'))) access.conflict('This record is no longer published. Reload it before withdrawing.');
            const now = new Date().toISOString();
            saved.set('status', spec.withdrawn);
            if (spec.moderated) assign(saved, { moderation_note: note, moderated_by: e.auth.id, moderated_at: now });
            saved.set(spec.revision, revision + 1);
            app.save(saved);
            const seat = guildmasters.seatOf(app, e.auth);
            const row = assign(new Record(collection), {
                workspace, actor: e.auth.id, actor_seat: seat ? seat.seat : '', persona: published[0].getString('persona'),
                action: 'withdrawn', kind, target: id, title: published[0].getString('title'),
                content_digest: published[0].getString('content_digest'), note,
            });
            app.save(row);
            return { id, workspace, action: body.action, kind, revision: revision + 1, status: spec.withdrawn, publication: row.id };
        });
    });
    return result;
}

module.exports = { KINDS, author, record, list, command };
