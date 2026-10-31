// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/guild-lessons.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/guildmasters.js, apps/pocketbase/pb_hooks/guild-publishing.js, apps/pocketbase/pb_migrations/1792400002_guild_lessons.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_hooks/guildmasters.js; CONSUMES apps/pocketbase/pb_hooks/guild-publishing.js; DEPENDS_ON apps/pocketbase/pb_migrations/1792400002_guild_lessons.js; CONSUMED_BY apps/pocketbase/pb_hooks/classrooms.js; CONSUMED_BY apps/pocketbase/pb_hooks/guild-lessons.pb.js; VERIFIED_BY tests/upgrade/guild-lessons.test.mjs
// Intent:      Let a guildmaster seat author and publish keyless class material for its workspace without touching the tutorials catalogue.
// ----------------------------------------------------------------
//
// A guild lesson is reading material a host can share into a class with room.material. It has
// sections, optional outcomes and HTTPS references, and nothing else: a knowledge check, answer,
// exercise or explanation is refused, because graded learning belongs to the tutorials catalogue and
// tutorial-learning.js, which this module never reads or writes. Only a guildmaster seat
// (guildmasters.seatOf) holding editor or higher role authors one; it edits only its own drafts, and
// publishing writes the guild_publications audit row an owner or admin can withdraw.

const access = require(`${__hooks}/workspace-access.js`);
const guildmasters = require(`${__hooks}/guildmasters.js`);
const guildPublishing = require(`${__hooks}/guild-publishing.js`);
const ADMINS = ['owner', 'admin'];
const AUTHORS = [...ADMINS, 'editor'];
const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const FIELDS = ['workspace', 'owner', 'title', 'summary', 'lesson', 'status', 'revision', 'published_at'];
const KEYLESS = 'Class material carries no answer key or check.';
const LIMIT = 24000;
// guild_lessons.lesson is a json field of maxSize 30000 bytes (1792400002), checked against Go's
// encoding/json output. That writes <, > and & as six-byte \u escapes, as it does U+2028 and U+2029,
// and every other character as UTF-8, so 24000 characters can need far more than 30000 bytes.
const STORED = 30000;

const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function strings(value, count, max) {
    if (!Array.isArray(value) || value.length > count || !value.every((item) => typeof item === 'string' && item.trim() && item.length <= max))
        access.invalid(`Use at most ${count} non-empty text items of at most ${max} characters.`);
    return value.map((item) => item.trim());
}
/** The bytes PocketBase stores for a JSON value, measured as Go's encoding/json writes it. */
function storedSize(value) {
    let size = 0;
    for (const char of JSON.stringify(value)) {
        const code = char.codePointAt(0);
        size += '<>&\u2028\u2029'.includes(char) ? 6 : code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    }
    return size;
}
function httpsUrl(value) {
    return typeof value === 'string' && value.length <= 2048 &&
        /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\s]*)?$/i.test(value);
}

/** Validate a class material body and return it with exactly the listed keys. */
function body(value) {
    if (!plainObject(value)) access.invalid('Provide the class material as a lesson body.');
    if (Object.keys(value).some((key) => !['schema_version', 'outcomes', 'sections', 'references'].includes(key))) access.invalid(KEYLESS);
    if (value.schema_version !== 1) access.invalid('Use class material schema version 1.');
    if (!Array.isArray(value.sections) || !value.sections.length || value.sections.length > 20) access.invalid('Use one to twenty sections.');
    const result = { schema_version: 1 };
    if (value.outcomes !== undefined) result.outcomes = strings(value.outcomes, 10, 300);
    result.sections = value.sections.map((section) => {
        if (!plainObject(section)) access.invalid('Give every section a heading and text.');
        if (Object.keys(section).some((key) => !['heading', 'paragraphs', 'steps'].includes(key))) access.invalid(KEYLESS);
        if (!access.text(section.heading, 200)) access.invalid('Give every section a heading of at most 200 characters.');
        const item = { heading: section.heading.trim() };
        if (section.paragraphs !== undefined) item.paragraphs = strings(section.paragraphs, 20, 2000);
        if (section.steps !== undefined) item.steps = strings(section.steps, 20, 2000);
        return item;
    });
    if (value.references !== undefined) {
        if (!Array.isArray(value.references) || value.references.length > 12) access.invalid('Use at most 12 references.');
        result.references = value.references.map((reference) => {
            if (!plainObject(reference) || Object.keys(reference).length !== 2 || !access.text(reference.label, 200) || !httpsUrl(reference.url))
                access.invalid('Give each reference a label and an HTTPS address without credentials.');
            return { label: reference.label.trim(), url: reference.url };
        });
    }
    if (access.canonical(result).length > LIMIT) access.invalid(`Keep class material within ${LIMIT} characters.`);
    // Refused here with its reason rather than at save, where the field limit is a generic 400.
    if (storedSize(result) > STORED)
        access.invalid(`Keep class material within ${STORED} stored bytes: each <, > or & is stored as six bytes, and a character outside ASCII as two to four.`);
    return result;
}

/** The stored body re-validated, or null; output never carries a key the validator does not list. */
function clean(record) {
    try { return body(access.json(record, 'lesson')); }
    catch (error) { if (error.status === 400) return null; throw error; }
}

function schema(app) {
    let collection = null;
    try { collection = app.findCollectionByNameOrId('guild_lessons'); }
    catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
    if (!collection || !FIELDS.every((field) => collection.fields.getByName(field)) || RULES.some((rule) => collection[rule] != null))
        throw new ApiError(503, 'Install the guild lesson migration before using guild lessons.');
    return collection;
}

/** Whether guild lessons and classroom_rooms.material are both installed. */
function installed(app) {
    try { schema(app); }
    catch (error) { if (error.status === 503) return false; throw error; }
    try { return Boolean(app.findCollectionByNameOrId('classroom_rooms').fields.getByName('material')); }
    catch (_err) { return false; }
}

function personaOf(app, owner) {
    const entry = owner ? guildmasters.seatOf(app, { id: owner }) : null;
    return entry ? entry.slug : '';
}
function output(app, record) {
    const result = { id: record.id, revision: Number(record.get('revision') || 0) };
    for (const key of ['workspace', 'owner', 'title', 'summary', 'status', 'published_at', 'created', 'updated']) result[key] = record.getString(key);
    result.persona = personaOf(app, result.owner);
    result.lesson = clean(record);
    return result;
}
function lessonFor(app, workspace, id) {
    const record = access.find(app, 'guild_lessons', access.id(id));
    if (record.getString('workspace') !== workspace) throw new NotFoundError('The requested guild lesson is unavailable.');
    return record;
}
function assign(record, values) { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; }

/** Save or publish one guild lesson with its retry receipt. Guildmaster seats with editor or higher role only. */
function command(e) {
    const { workspace, body: request } = access.envelope(e);
    if (!['lesson.save', 'lesson.publish'].includes(request.action)) access.invalid('Choose a supported guild lesson command.');
    const saving = request.action === 'lesson.save';
    access.exact(request.payload, saving ? ['id', 'title', 'summary', 'lesson'] : ['id']);
    const id = access.id(request.payload.id, saving);
    const values = saving ? { title: access.bounded(request.payload.title, 160), summary: access.bounded(request.payload.summary, 500, false),
        lesson: body(request.payload.lesson) } : null;
    let result;
    e.app.runInTransaction((app) => {
        access.requireRole(app, e.auth, workspace, AUTHORS);
        const entry = guildmasters.seatOf(app, e.auth);
        if (!entry) throw new ForbiddenError('Only a guildmaster seat with editor or higher role authors guild lessons.');
        const collection = schema(app);
        const record = id ? lessonFor(app, workspace, id) : new Record(collection);
        if (id && record.getString('owner') !== e.auth.id) throw new ForbiddenError('Only the authoring guildmaster may change this lesson.');
        // Authority precedes replay, including after the seat loses its role.
        result = access.audit(app, e.auth, workspace, request, () => {
            const revision = id ? Number(record.get('revision') || 0) : 0;
            if (!Number.isSafeInteger(revision) || revision !== request.revision || revision >= Number.MAX_SAFE_INTEGER)
                access.conflict('This lesson changed. Reload the saved version before editing.');
            if (id && record.getString('status') !== 'draft') access.invalid('A published or withdrawn lesson is retained. Save a new draft instead.');
            if (!id) assign(record, { workspace, owner: e.auth.id, status: 'draft' });
            if (saving) assign(record, values);
            else {
                if (!clean(record)) access.invalid('Save a supported lesson body before publishing.');
                assign(record, { status: 'published', published_at: new Date().toISOString() });
            }
            record.set('revision', revision + 1);
            app.save(record);
            if (!saving) guildPublishing.record(app, { workspace, auth: e.auth, entry, kind: 'guild_lesson', target: record.id,
                title: record.getString('title'), content: { title: record.getString('title'), summary: record.getString('summary'), lesson: clean(record) } });
            return { id: record.id, workspace, action: request.action, revision: revision + 1, status: record.getString('status'), lesson: output(app, record) };
        });
    });
    return result;
}

/** Members read published lessons and their own drafts; owners and admins read every lesson. */
function list(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    const scope = access.requireRole(e.app, e.auth, workspace);
    schema(e.app);
    const number = access.page(e);
    const admin = ADMINS.includes(scope.role);
    const result = access.list(e.app, 'guild_lessons', 'workspace = {:workspace}' + (admin ? '' : ' && (status = "published" || owner = {:owner})'),
        { workspace, owner: e.auth.id }, number);
    return { workspace, role: scope.role, can_author: AUTHORS.includes(scope.role) && Boolean(guildmasters.seatOf(e.app, e.auth)),
        items: result.rows.map((row) => output(e.app, row)), page: number, has_more: result.has_more };
}

/** A published guild lesson of this workspace, shaped like a shared classroom lesson. */
function materialFor(app, workspace, id) {
    schema(app);
    const record = lessonFor(app, workspace, id);
    if (record.getString('status') !== 'published') access.invalid('Share a published guild lesson.');
    const lesson = clean(record);
    if (!lesson) access.invalid('This guild lesson needs a supported lesson body.');
    return { id: record.id, title: record.getString('title'), summary: record.getString('summary'), category: 'Guild lesson',
        effort_minutes: 0, lesson, source: 'guild_lesson', persona: personaOf(app, record.getString('owner')) };
}

module.exports = { body, command, list, materialFor, installed };
