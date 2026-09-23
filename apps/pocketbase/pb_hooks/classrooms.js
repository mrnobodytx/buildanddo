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
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js, apps/pocketbase/pb_hooks/government-access.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js; CONSUMES apps/pocketbase/pb_hooks/government-access.js
// DAG Node:    none
// Intent:      Make shared lessons, host lifecycle and expiring classroom presence authoritative to the current workspace account.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const government = require(`${__hooks}/government-access.js`);
const TTL = 75000;
const CAPACITY = 100;
const WRITERS = ['owner', 'admin', 'editor'];
const ACTIONS = ['room.create', 'room.update', 'room.start', 'room.end', 'room.lesson', 'room.join', 'room.leave', 'room.message'];
const SHAPES = {
    classroom_rooms: ['workspace', 'host', 'title', 'description', 'tutorial', 'section', 'status', 'revision', 'protocol_version'],
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
    if (!government.lesson(app, info.auth, lesson)) access.readable(app, lesson, info);
    const body = lessonBody(lesson);
    if (!body)
        access.invalid('Choose an installed lesson with a supported lesson body.');
    return { id: lesson.id, title: lesson.getString('title'), summary: lesson.getString('summary'), category: lesson.getString('category'),
        effort_minutes: Number(lesson.get('effort_minutes')), lesson: body };
}
function lessons(app, info) {
    const rows = app.findRecordsByFilter('tutorials', 'id != ""', 'order,id', 201, 0);
    return { items: rows.slice(0, 200).filter((row) => {
        if (row.getString('category') === 'Government submissions') {
            if (!government.status(app, info.auth).allowed) return false;
            government.lesson(app, info.auth, row);
            return Boolean(lessonBody(row));
        }
        return app.canAccessRecord(row, info, row.collection().viewRule) && lessonBody(row);
    })
        .map((row) => ({ id: row.id, title: row.getString('title'), category: row.getString('category') })), has_more: rows.length > 200 };
}
function roomMembership(app, auth, room) {
    const tutorial = access.find(app, 'tutorials', room.getString('tutorial'));
    if (tutorial.getString('category') === 'Government submissions') government.requireMember(app, auth);
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
/** Resolve current classroom participation for the signalling and presence owners. */
function mediaAccess(app, auth, id) {
    access.authenticated({ auth });
    const current = access.find(app, 'users', auth.id);
    const room = access.find(app, 'classroom_rooms', access.id(id));
    const workspace = room.getString('workspace');
    const scope = scopeFor(app, { auth: current }, workspace);
    roomMembership(app, current, room);
    const member = memberFor(app, workspace, room.id, current.id);
    if (room.getString('status') !== 'live' || !fresh(member))
        throw new ForbiddenError('Join the live classroom before using media.');
    return { room, workspace, member, auth: current, can_manage: canManage(scope, current, room),
        basis: room.getString('host') === current.id ? 'host' : 'member' };
}
function members(app, workspace, room) {
    return app.findRecordsByFilter('classroom_members', 'workspace = {:workspace} && room = {:room} && active = {:active}',
        '-last_seen,-id', CAPACITY + 1, 0, { workspace, room, active: true }).filter(fresh);
}
function assign(record, values) { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; }
// Attendance history is written in the command's own transaction, so a replayed
// receipt never writes twice. A backend without the attendance migration keeps
// working exactly as before; its class record reports the history as absent.
function attendanceCollection(app) {
    try { return app.findCollectionByNameOrId('classroom_attendance'); }
    catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
}
function attend(app, room, owner, event) {
    const collection = attendanceCollection(app);
    if (!collection) return;
    app.save(assign(new Record(collection), { workspace: room.getString('workspace'), room: room.id, owner, event, at: new Date().toISOString() }));
}
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
    attend(app, room, e.auth.id, joining ? 'join' : 'leave');
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
        'room.update': ['id', 'title', 'description', 'tutorial', 'starts_at'],
        'room.lesson': ['id', 'tutorial', 'section'], 'room.message': ['id', 'body'],
        'room.leave': ['id', 'membership_revision'],
    };
    access.exact(body.payload, payloadFields[body.action] || ['id']);
    let result;
    e.app.runInTransaction((app) => {
        const scope = scopeFor(app, e, workspace);
        const creating = body.action === 'room.create';
        const room = creating ? null : roomFor(app, workspace, body.payload.id);
        const participation = ['room.join', 'room.leave'].includes(body.action);
        if (!participation && !WRITERS.includes(scope.role)) throw new ForbiddenError('An editor or host must make this change.');
        if (room && !participation && body.action !== 'room.message' && !canManage(scope, e.auth, room))
            throw new ForbiddenError('Only this room\'s host or a workspace administrator may manage the class.');
        if (room) roomMembership(app, e.auth, room);
        if (body.payload.tutorial) lessonFor(app, body.payload.tutorial, e.requestInfo());
        result = receipt(app, e, workspace, body, () => {
            if (creating) {
                if (body.revision !== 0) access.invalid('A new classroom starts at revision zero.');
                const record = assign(new Record(app.findCollectionByNameOrId('classroom_rooms')), {
                    ...draft(app, body, e), workspace, host: e.auth.id, host_name: nameOf(e.auth), status: 'scheduled', revision: 1, protocol_version: 1,
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
                    attend(app, room, e.auth.id, 'start');
                    present(app, e, room, true);
                } else if (body.action === 'room.end') {
                    assign(room, { status: 'ended', ended_at: new Date().toISOString() });
                    attend(app, room, e.auth.id, 'end');
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
    return { workspace, role: scope.role, can_host: WRITERS.includes(scope.role), items: result.rows.filter((row) => {
        try { roomMembership(e.app, e.auth, row); return true; }
        catch (error) { if ([403, 404].includes(error.status)) return false; throw error; }
    }).map((row) => output(row, scope, e.auth)),
        page: result.page, has_more: result.has_more, lessons: lessons(e.app, e.requestInfo()) };
}

/**
 * Whether live voice and video can be offered in this room. It reads the same
 * configuration the /api/classroom signalling routes use and returns no value
 * from it: availability is a fact about this server, never a credential.
 * @param {boolean} live Room is in session.
 * @returns {{available: boolean, reason?: string}}
 */
function mediaStatus(live, app) {
    if (!live) return { available: false };
    let config;
    try {
        require(`${__hooks}/classroom-media.js`).schema(app);
        config = require(`${__hooks}/classroom-realtime-lib.js`).realtimeConfig();
    }
    catch (_) { config = { reason: 'unreadable' }; }
    return config && !config.reason ? { available: true } : { available: false, reason: 'not configured on this server' };
}

/** @param {object} e Authenticated native request. @returns {object} Current shared lesson, presence and discussion. */
function detail(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    const scope = scopeFor(e.app, e, workspace);
    const room = roomFor(e.app, workspace, e.request.pathValue('id'));
    roomMembership(e.app, e.auth, room);
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
        media: mediaStatus(live, e.app) };
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
        roomMembership(app, e.auth, room);
        const member = memberFor(app, workspace, room.id, e.auth.id);
        if (room.getString('status') !== 'live' || member?.id !== body.membership || Number(member?.get('revision')) !== body.revision || !fresh(member))
            access.conflict('Your classroom connection ended. Rejoin the class to continue.');
        member.set('last_seen', new Date().toISOString()); app.save(member);
        result = { workspace, room: room.id, membership: member.id, revision: body.revision };
    });
    return result;
}

const HOUR = 3600000;
const RECORD_HOURS = 48;
const RECORD_ROWS = 5000;
function stamp(value) {
    const ms = Date.parse(String(value || '').replace(' ', 'T'));
    return Number.isFinite(ms) ? ms : 0;
}

/**
 * The host's aggregate class record: attendees, minutes and people present per
 * hour. It returns counts only; who attended stays in the live attendance list.
 * @param {object} e Authenticated native request.
 * @returns {object} Aggregate attendance for one room.
 */
function record(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    const scope = scopeFor(e.app, e, workspace);
    const room = roomFor(e.app, workspace, e.request.pathValue('id'));
    roomMembership(e.app, e.auth, room);
    if (!canManage(scope, e.auth, room)) throw new ForbiddenError('Only this room\'s host or a workspace administrator may read its class record.');
    const base = { room: room.id, status: room.getString('status'), started_at: room.getString('started_at'), ended_at: room.getString('ended_at') };
    if (!attendanceCollection(e.app)) return { ...base, installed: false };
    const started = stamp(base.started_at);
    if (!started) return { ...base, installed: true, attendees: 0, minutes: 0, hours: [], truncated: false };
    const stop = stamp(base.ended_at) || Date.now();
    const rows = e.app.findRecordsByFilter('classroom_attendance', 'workspace = {:workspace} && room = {:room}', 'at,id',
        RECORD_ROWS + 1, 0, { workspace, room: room.id });
    const truncated = rows.length > RECORD_ROWS;
    const open = {}, intervals = [];
    for (const row of rows.slice(0, RECORD_ROWS)) {
        const owner = row.getString('owner'), at = Math.min(stamp(row.getString('at')), stop), event = row.getString('event');
        if (event === 'join' && open[owner] === undefined) open[owner] = at;
        else if (event === 'leave' && open[owner] !== undefined) { intervals.push([owner, open[owner], at]); delete open[owner]; }
    }
    // Someone still marked present ends at their last heartbeat, or now while still fresh.
    for (const [owner, from] of Object.entries(open)) {
        const member = memberFor(e.app, workspace, room.id, owner);
        const until = fresh(member) ? stop : Math.min(stop, Math.max(from, stamp(member?.getString('last_seen'))));
        intervals.push([owner, from, until]);
    }
    const first = Math.max(Math.floor(started / HOUR) * HOUR, Math.floor(stop / HOUR) * HOUR - (RECORD_HOURS - 1) * HOUR);
    const hours = [];
    for (let t = first; t <= stop; t += HOUR) {
        const present = new Set(intervals.filter(([, from, until]) => from < t + HOUR && until >= t).map(([owner]) => owner));
        hours.push({ t: new Date(t).toISOString(), people: present.size });
    }
    return { ...base, installed: true, truncated,
        attendees: new Set(intervals.map(([owner]) => owner)).size,
        minutes: Math.round(intervals.reduce((total, [, from, until]) => total + Math.max(0, until - from), 0) / 60000),
        hours };
}

module.exports = { command, list, detail, heartbeat, record, mediaAccess };
