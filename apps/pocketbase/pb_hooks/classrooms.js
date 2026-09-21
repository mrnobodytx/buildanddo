// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/classrooms.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// DAG Node:    none
// Intent:      Make shared lessons, host lifecycle and expiring classroom presence authoritative to the current workspace account.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const TTL = 75000;
const CAPACITY = 100;
const WRITERS = ['owner', 'admin', 'editor'];
const ACTIONS = ['room.create', 'room.chat', 'room.update', 'room.start', 'room.end', 'room.lesson', 'room.join', 'room.leave', 'room.message'];
// A chatroom and a classroom are the same governed room with different rules. 'room.chat' is a
// separate action rather than a `kind` added to room.create because access.exact() requires an
// EXACT field set, so extending that payload would refuse every existing caller.
const SHAPES = {
    classroom_rooms: ['workspace', 'host', 'title', 'description', 'tutorial', 'section', 'status', 'revision', 'protocol_version', 'kind'],
    classroom_members: ['workspace', 'room', 'owner', 'active', 'last_seen', 'revision'],
    classroom_messages: ['workspace', 'room', 'owner', 'body'],
    classroom_receipts: ['workspace', 'actor', 'request_key', 'command', 'result'],
};
function schema(app) {
    for (const [name, fields] of Object.entries(SHAPES)) {
        let collection;
        try { collection = app.findCollectionByNameOrId(name); }
        catch (error) {
            if (!String(error.message).includes('no rows in result set')) throw error;
            throw new ApiError(503, 'Classrooms are not installed on this backend yet. Contact your workspace operator.');
        }
        if (!fields.every((field) => collection.fields.getByName(field)) ||
            ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((rule) => collection[rule] !== null))
            throw new ApiError(503, 'The classroom backend needs an operator review before it can be used.');
    }
}
function scopeFor(app, e, workspace) {
    access.find(app, 'users', e.auth.id);
    const scope = access.requireRole(app, e.auth, workspace);
    schema(app);
    return scope;
}
function nameOf(auth) { return (auth.getString('name').trim() || 'Workspace member').slice(0, 120); }
function canManage(scope, auth, room) {
    return ['owner', 'admin'].includes(scope.role) || (scope.role === 'editor' && room.getString('host') === auth.id);
}
function roomFor(app, workspace, id) {
    const room = access.find(app, 'classroom_rooms', access.id(id));
    if (room.getString('workspace') !== workspace) throw new NotFoundError('This classroom is unavailable.');
    return room;
}
function output(room, scope, auth) {
    const result = { id: room.id, revision: Number(room.get('revision')), section: Number(room.get('section')),
        can_manage: canManage(scope, auth, room) };
    for (const key of ['workspace', 'host', 'host_name', 'title', 'description', 'tutorial', 'status', 'starts_at', 'started_at', 'ended_at', 'created'])
        result[key] = room.getString(key);
    // Rooms written before the kind existed carry an empty value and are classes, which is what
    // they have always been; a client must never have to guess that.
    result.kind = room.getString('kind') || 'class';
    return result;
}
function lessonBody(record) {
    let body;
    try { body = access.json(record, 'lesson'); }
    catch (error) { if (error.status === 400) return null; throw error; }
    return body && body.schema_version === 1 && Array.isArray(body.sections) && body.sections.length > 0 && body.sections.length <= 20 ? body : null;
}
function lessonFor(app, id, info) {
    const lesson = access.find(app, 'tutorials', access.id(id));
    access.readable(app, lesson, info);
    const body = lessonBody(lesson);
    if (!body)
        access.invalid('Choose an installed lesson with a supported lesson body.');
    return { id: lesson.id, title: lesson.getString('title'), summary: lesson.getString('summary'), category: lesson.getString('category'),
        effort_minutes: Number(lesson.get('effort_minutes')), lesson: body };
}
function lessons(app, info) {
    const rows = app.findRecordsByFilter('tutorials', 'id != ""', 'order,id', 201, 0);
    return { items: rows.slice(0, 200).filter((row) => app.canAccessRecord(row, info, row.collection().viewRule) && lessonBody(row))
        .map((row) => ({ id: row.id, title: row.getString('title'), category: row.getString('category') })), has_more: rows.length > 200 };
}
function memberFor(app, workspace, room, owner) {
    const rows = app.findRecordsByFilter('classroom_members', 'workspace = {:workspace} && room = {:room} && owner = {:owner}',
        '', 2, 0, { workspace, room, owner });
    if (rows.length > 1) throw new ApiError(503, 'Classroom attendance needs an operator review.');
    return rows[0] || null;
}
function fresh(member) {
    const age = member ? Date.now() - Date.parse(member.getString('last_seen').replace(' ', 'T')) : NaN;
    return Boolean(member?.getBool('active') && age >= 0 && age < TTL);
}
function members(app, workspace, room) {
    return app.findRecordsByFilter('classroom_members', 'workspace = {:workspace} && room = {:room} && active = {:active}',
        '-last_seen,-id', CAPACITY + 1, 0, { workspace, room, active: true }).filter(fresh);
}
function assign(record, values) { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; }
function present(app, e, room, joining) {
    const workspace = room.getString('workspace');
    let member = memberFor(app, workspace, room.id, e.auth.id);
    if (joining) {
        if (room.getString('status') !== 'live') access.conflict('Join after the host starts this class.');
        if (!fresh(member) && members(app, workspace, room.id).length >= CAPACITY) access.conflict('This classroom is full.');
        member = member || new Record(app.findCollectionByNameOrId('classroom_members'));
        const now = new Date().toISOString();
        assign(member, { workspace, room: room.id, owner: e.auth.id, name: nameOf(e.auth), active: true,
            last_seen: now, joined_at: now, revision: Number(member.get('revision') || 0) + 1 });
    } else {
        if (!member || Number(member.get('revision')) !== e.requestInfo().body.payload.membership_revision)
            access.conflict('Your attendance changed. Refresh this classroom before leaving.');
        assign(member, { active: false, revision: Number(member.get('revision')) + 1 });
    }
    app.save(member);
}
function draft(app, body, e) {
    const { title, description, tutorial, starts_at } = body.payload;
    const lesson = lessonFor(app, tutorial, e.requestInfo());
    if (typeof starts_at !== 'string' || (starts_at && (!/^\d{4}-\d{2}-\d{2}T/.test(starts_at) || !Number.isFinite(Date.parse(starts_at)))))
        access.invalid('Choose a valid start time.');
    return { title: access.bounded(title, 160), description: access.bounded(description, 2000, false), tutorial: lesson.id,
        section: 0, starts_at: starts_at ? new Date(starts_at).toISOString() : '' };
}
function receipt(app, e, workspace, body, operation) {
    const previous = app.findRecordsByFilter('classroom_receipts', 'workspace = {:workspace} && actor = {:actor} && request_key = {:key}',
        '', 1, 0, { workspace, actor: e.auth.id, key: body.request_key });
    if (previous.length) {
        if (access.canonical(access.json(previous[0], 'command')) !== access.canonical(body))
            access.conflict('This retry key belongs to a different classroom command.');
        return { ...access.json(previous[0], 'result'), replayed: true };
    }
    const result = operation();
    const record = new Record(app.findCollectionByNameOrId('classroom_receipts'));
    app.save(assign(record, { workspace, actor: e.auth.id, request_key: body.request_key, command: body, result }));
    return { ...result, replayed: false };
}

/** @param {object} e Authenticated native request. @returns {object} Recorded command receipt. */
function command(e) {
    const { workspace, body } = access.envelope(e);
    if (!ACTIONS.includes(body.action)) access.invalid('Choose a supported classroom action.');
    const payloadFields = {
        'room.create': ['title', 'description', 'tutorial', 'starts_at'],
        'room.chat': ['title', 'description'],
        'room.update': ['id', 'title', 'description', 'tutorial', 'starts_at'],
        'room.lesson': ['id', 'tutorial', 'section'], 'room.message': ['id', 'body'],
        'room.leave': ['id', 'membership_revision'],
    };
    access.exact(body.payload, payloadFields[body.action] || ['id']);
    let result;
    e.app.runInTransaction((app) => {
        const scope = scopeFor(app, e, workspace);
        const chatting = body.action === 'room.chat';
        const creating = body.action === 'room.create' || chatting;
        const room = creating ? null : roomFor(app, workspace, body.payload.id);
        const participation = ['room.join', 'room.leave'].includes(body.action);
        // The two kinds are not interchangeable: a chatroom carries no lesson, so teaching
        // commands are refused there rather than quietly writing a section nobody can see.
        if (room && room.getString('kind') === 'chat' && body.action === 'room.lesson')
            access.invalid('A chatroom has no lesson. Open a classroom to teach one.');
        if (!participation && !WRITERS.includes(scope.role)) throw new ForbiddenError('An editor or host must make this change.');
        if (room && !participation && body.action !== 'room.message' && !canManage(scope, e.auth, room))
            throw new ForbiddenError('Only this room\'s host or a workspace administrator may manage the class.');
        result = receipt(app, e, workspace, body, () => {
            if (creating) {
                if (body.revision !== 0) access.invalid('A new room starts at revision zero.');
                // A chatroom has no lesson to schedule, so it is open the moment it exists.
                // A class is scheduled first and started by its host.
                const shape = chatting
                    ? { title: access.bounded(body.payload.title, 160),
                        description: access.bounded(body.payload.description, 2000, false),
                        tutorial: '', section: 0, starts_at: '',
                        status: 'live', started_at: new Date().toISOString(), kind: 'chat' }
                    : { ...draft(app, body, e), status: 'scheduled', kind: 'class' };
                const record = assign(new Record(app.findCollectionByNameOrId('classroom_rooms')), {
                    ...shape, workspace, host: e.auth.id, host_name: nameOf(e.auth), revision: 1, protocol_version: 1,
                });
                app.save(record);
                return { id: record.id, workspace, revision: 1, action: body.action };
            }
            if (body.action !== 'room.leave' && Number(room.get('revision')) !== body.revision)
                access.conflict('This class changed. Refresh before trying again.');
            if (body.action === 'room.join' || body.action === 'room.leave') present(app, e, room, body.action === 'room.join');
            else if (body.action === 'room.message') {
                if (room.getString('status') !== 'live' || !fresh(memberFor(app, workspace, room.id, e.auth.id)))
                    access.conflict('Join an active class before posting a message.');
                const record = assign(new Record(app.findCollectionByNameOrId('classroom_messages')), {
                    workspace, room: room.id, owner: e.auth.id, name: nameOf(e.auth), body: access.bounded(body.payload.body, 2000),
                });
                app.save(record);
            } else {
                const status = room.getString('status');
                if (status === 'ended') access.conflict('This class has ended. Create a new room to teach again.');
                if (body.action === 'room.update') {
                    if (status !== 'scheduled') access.conflict('Edit the schedule before starting the class.');
                    assign(room, draft(app, body, e));
                } else if (body.action === 'room.start') {
                    if (status !== 'scheduled') access.conflict('This class has already started.');
                    lessonFor(app, room.getString('tutorial'), e.requestInfo());
                    assign(room, { status: 'live', started_at: new Date().toISOString() });
                    present(app, e, room, true);
                } else if (body.action === 'room.end') {
                    assign(room, { status: 'ended', ended_at: new Date().toISOString() });
                } else {
                    if (status !== 'live') access.conflict('Start the class before changing the shared lesson.');
                    const lesson = lessonFor(app, body.payload.tutorial, e.requestInfo());
                    if (!Number.isSafeInteger(body.payload.section) || body.payload.section < 0 || body.payload.section >= lesson.lesson.sections.length)
                        access.invalid('Choose a section from the selected lesson.');
                    assign(room, { tutorial: lesson.id, section: body.payload.section });
                }
                room.set('revision', Number(room.get('revision')) + 1); app.save(room);
            }
            return { id: room.id, workspace, revision: Number(room.get('revision')), action: body.action };
        });
    });
    return result;
}

/** @param {object} e Authenticated native request. @returns {object} Bounded room list and available lessons. */
function list(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    const scope = scopeFor(e.app, e, workspace);
    const status = e.requestInfo().query?.status || 'all';
    if (!['all', 'scheduled', 'live', 'ended'].includes(status)) access.invalid('Choose a listed classroom state.');
    const result = access.list(e.app, 'classroom_rooms', 'workspace = {:workspace}' + (status === 'all' ? '' : ' && status = {:status}'),
        { workspace, status }, access.page(e));
    return { workspace, role: scope.role, can_host: WRITERS.includes(scope.role), items: result.rows.map((row) => output(row, scope, e.auth)),
        page: result.page, has_more: result.has_more, lessons: lessons(e.app, e.requestInfo()) };
}

/** @param {object} e Authenticated native request. @returns {object} Current shared lesson, presence and discussion. */
function detail(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    const scope = scopeFor(e.app, e, workspace);
    const room = roomFor(e.app, workspace, e.request.pathValue('id'));
    const mine = memberFor(e.app, workspace, room.id, e.auth.id);
    const live = room.getString('status') === 'live';
    const discussion = access.list(e.app, 'classroom_messages', 'workspace = {:workspace} && room = {:room}',
        { workspace, room: room.id }, access.page(e));
    let lesson = null;
    try { lesson = lessonFor(e.app, room.getString('tutorial'), e.requestInfo()); }
    catch (error) { if (![400, 403, 404].includes(error.status)) throw error; }
    return { workspace, role: scope.role, room: output(room, scope, e.auth), lesson, lessons: lessons(e.app, e.requestInfo()),
        membership: { id: mine?.id || '', revision: Number(mine?.get('revision') || 0), active: live && fresh(mine) },
        participants: live ? members(e.app, workspace, room.id).map((row) => ({ id: row.id, name: row.getString('name'), is_host: row.getString('owner') === room.getString('host') })) : [],
        messages: { items: discussion.rows.map((row) => ({ id: row.id, room: room.id, name: row.getString('name'), body: row.getString('body'),
            own: row.getString('owner') === e.auth.id, created: row.getString('created') })), page: discussion.page, has_more: discussion.has_more },
        media: { available: false } };
}

/** @param {object} e Authenticated native request. @returns {object} Confirmation for the current attendance generation. */
function heartbeat(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e), body = e.requestInfo().body;
    access.exact(body, ['membership', 'revision']); access.id(body.membership); access.revision(body.revision);
    let result;
    e.app.runInTransaction((app) => {
        scopeFor(app, e, workspace);
        const room = roomFor(app, workspace, e.request.pathValue('id'));
        const member = memberFor(app, workspace, room.id, e.auth.id);
        if (room.getString('status') !== 'live' || member?.id !== body.membership || Number(member?.get('revision')) !== body.revision || !fresh(member))
            access.conflict('Your classroom connection ended. Rejoin the class to continue.');
        member.set('last_seen', new Date().toISOString()); app.save(member);
        result = { workspace, room: room.id, membership: member.id, revision: body.revision };
    });
    return result;
}

module.exports = { command, list, detail, heartbeat };
