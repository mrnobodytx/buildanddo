// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/guild-classes.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/guildmasters.js, apps/pocketbase/pb_hooks/guild-rota.js, apps/pocketbase/pb_migrations/1792500000_guild_class_schedule.js, apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_hooks/guildmasters.js; CONSUMES apps/pocketbase/pb_hooks/guild-rota.js; DEPENDS_ON apps/pocketbase/pb_migrations/1792500000_guild_class_schedule.js; WRITES classroom_rooms; CONSUMED_BY apps/pocketbase/pb_hooks/guild-classes.pb.js; VERIFIED_BY tests/upgrade/guild-classes.test.mjs; VERIFIED_BY tests/upgrade/test_classroom_native.py
// Intent:      Schedule the coming week's guild classes for seated guildmaster hosts, once, and only where an operator named the workspace.
// ----------------------------------------------------------------
//
// The hourly guild_class_rota cron calls schedule(). It writes nothing unless the
// BUILDANDDO_GUILD_CLASS_WORKSPACE variable names an existing workspace and both classroom_rooms and
// guild_classes are installed and locked. Then, for each class of the coming ISO week in the rota
// (guild-rota.js), it creates an ordinary scheduled classroom_rooms row hosted by that guildmaster's
// seat account - but only when the seat is recognised by guildmasters.seatOf and ALREADY holds editor
// or higher role in the workspace. It never grants membership: seat roles stay granted by hand through
// member.set. A guild_classes row per (workspace, week, slot) makes reruns create nothing.
//
// The class is started later by its host through room.start, which needs a tutorial or shared
// material (room.material); until then it is a scheduled class like any other. Members attend through
// room.join. This module never reads or writes classroom_access or classroom_audit.

const access = require(`${__hooks}/workspace-access.js`);
const guildmasters = require(`${__hooks}/guildmasters.js`);
const rota = require(`${__hooks}/guild-rota.js`);
const VARIABLE = 'BUILDANDDO_GUILD_CLASS_WORKSPACE';
const EDITORS = ['owner', 'admin', 'editor'];
const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const SHAPES = {
    classroom_rooms: ['workspace', 'host', 'host_name', 'title', 'description', 'tutorial', 'section', 'status', 'starts_at', 'revision', 'protocol_version', 'kind'],
    guild_classes: ['workspace', 'week', 'slot', 'room', 'host', 'host_seat', 'auditor', 'auditor_seat', 'starts_at'],
};

const missing = (error) => String(error && error.message).includes('no rows in result set');
function assign(record, values) { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; }

/**
 * The workspace id the rota schedules into, or null. Unset or empty is silent; a value that is not a
 * record id, or names no workspace, is logged as a warning (without echoing a malformed value).
 */
function configured(app) {
    const id = $os.getenv(VARIABLE) || '';
    if (!id) return null;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
        app.logger().warn('guild class rota not scheduled: the workspace variable is not a record id', 'variable', VARIABLE);
        return null;
    }
    try { app.findRecordById('workspaces', id); }
    catch (error) {
        if (!missing(error)) throw error;
        app.logger().warn('guild class rota not scheduled: the workspace variable names no workspace', 'variable', VARIABLE, 'workspace', id);
        return null;
    }
    return id;
}

/** Whether classroom_rooms and guild_classes both exist, carry the fields used here and stay locked. */
function installed(app) {
    for (const [name, fields] of Object.entries(SHAPES)) {
        let collection;
        try { collection = app.findCollectionByNameOrId(name); }
        catch (error) { if (missing(error)) return false; throw error; }
        if (!fields.every((field) => collection.fields.getByName(field)) || RULES.some((rule) => collection[rule] != null)) return false;
    }
    return true;
}

/** The seat account of a registered guildmaster seat, when seatOf recognises it as exactly that seat. */
function seatAccount(app, seat) {
    const entry = guildmasters.bySeat(seat);
    let account;
    try { account = app.findAuthRecordByEmail('users', guildmasters.seatEmail(seat)); }
    catch (error) { if (missing(error)) return { entry, account: null }; throw error; }
    return { entry, account: account && guildmasters.seatOf(app, account) === entry ? account : null, found: Boolean(account) };
}

/** Whether the account holds editor or higher role now. A refusal is an answer, not an error. */
function editor(app, account, workspace) {
    try { access.requireRole(app, account, workspace, EDITORS); return true; }
    catch (error) { if (error && error.status === 403) return false; throw error; }
}

function slotRow(app, workspace, week, slot) {
    return app.findRecordsByFilter('guild_classes', 'workspace = {:workspace} && week = {:week} && slot = {:slot}', '', 1, 0,
        { workspace, week, slot })[0] || null;
}

/** Create one class and its schedule row, or say why not. Runs inside its own transaction. */
function scheduleOne(app, workspace, plan, item) {
    if (slotRow(app, workspace, plan.week, item.slot)) return 'existing';
    const host = seatAccount(app, item.host);
    if (!host.account) return host.found ? 'not a guildmaster seat' : 'no seat account';
    if (!editor(app, host.account, workspace)) return 'not a workspace editor';
    // The auditor is named whatever its account state; its relation is set only for its own seat account.
    const auditor = seatAccount(app, item.auditor);
    const rooms = app.findCollectionByNameOrId('classroom_rooms');
    const room = assign(new Record(rooms), {
        workspace, host: host.account.id, host_name: item.name,
        title: `${item.name} hosts the ${item.guild} guild class`,
        description: `Weekly guild class for ${plan.week}. ${auditor.entry.name} audits; the other guildmasters attend.`,
        tutorial: '', section: 0, status: 'scheduled', kind: 'class', starts_at: item.starts_at, revision: 1, protocol_version: 1,
    });
    // Optional fields of later migrations: a workspace class (1792000000) with no shared material yet (1792400002).
    if (rooms.fields.getByName('scope')) room.set('scope', 'workspace');
    if (rooms.fields.getByName('material')) room.set('material', '');
    app.save(room);
    app.save(assign(new Record(app.findCollectionByNameOrId('guild_classes')), {
        workspace, week: plan.week, slot: item.slot, room: room.id, host: host.account.id, host_seat: item.host,
        auditor: auditor.account ? auditor.account.id : '', auditor_seat: item.auditor, starts_at: item.starts_at,
    }));
    return 'created';
}

/**
 * Schedule the coming ISO week (the week of the next Monday 00:00 UTC after `now`) into the configured
 * workspace. Returns what happened; writes nothing when disabled or unavailable.
 * @returns {{state: string, workspace: string, week: string, created: number, existing: number, skipped: Array<{seat: string, reason: string}>}}
 */
function schedule(app, now) {
    const plan = rota.week(rota.mondayOf(now) + rota.WEEK);
    const result = { state: 'disabled', workspace: '', week: plan.week, created: 0, existing: 0, skipped: [] };
    const workspace = configured(app);
    if (!workspace) return result;
    result.workspace = workspace;
    if (!installed(app)) {
        result.state = 'unavailable';
        app.logger().warn('guild class rota not scheduled: install the classroom and guild class schedule migrations', 'workspace', workspace);
        return result;
    }
    result.state = 'scheduled';
    for (const item of plan.classes) {
        let outcome;
        try { app.runInTransaction((txApp) => { outcome = scheduleOne(txApp, workspace, plan, item); }); }
        catch (error) {
            // A concurrent run that won the unique (workspace, week, slot) index rolled this room back.
            outcome = slotRow(app, workspace, plan.week, item.slot) ? 'existing' : 'could not be scheduled';
            if (outcome !== 'existing')
                app.logger().warn('guild class rota slot failed', 'workspace', workspace, 'week', plan.week, 'slot', item.slot,
                    'error', String((error && error.message) || error).slice(0, 200));
        }
        if (outcome === 'created') result.created += 1;
        else if (outcome === 'existing') result.existing += 1;
        else result.skipped.push({ seat: item.host, reason: outcome });
    }
    app.logger().info('guild class rota scheduled', 'workspace', workspace, 'week', plan.week,
        'created', result.created, 'existing', result.existing, 'skipped', result.skipped.length);
    return result;
}

function isoDate(value) {
    const ms = Date.parse(String(value || '').replace(' ', 'T'));
    return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

/**
 * Any member reads a week's rota and what was scheduled for it here (default: the coming week).
 * Personas only: no account email, and no seat account id beyond the room it hosts.
 */
function list(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    access.requireRole(e.app, e.auth, workspace);
    const query = e.requestInfo().query?.week;
    let monday;
    if (query === undefined || query === null || query === '') monday = rota.mondayOf(Date.now()) + rota.WEEK;
    else {
        try { monday = rota.parseWeek(query); }
        catch (_err) { access.invalid('Choose a week as YYYY-Www.'); }
    }
    if (!installed(e.app)) throw new ApiError(503, 'Install the guild class schedule migration before reading guild classes.');
    const plan = rota.week(monday);
    const persona = (seat) => guildmasters.bySeat(seat)?.slug || '';
    const scheduled = e.app.findRecordsByFilter('guild_classes', 'workspace = {:workspace} && week = {:week}', 'slot', 9, 0,
        { workspace, week: plan.week }).slice(0, 8).map((row) => {
        let status = '';
        try {
            const room = e.app.findRecordById('classroom_rooms', row.getString('room'));
            if (room.getString('workspace') === workspace) status = room.getString('status');
        } catch (error) { if (!missing(error)) throw error; }
        return { slot: Number(row.get('slot') || 0), room: row.getString('room'), room_status: status,
            host_persona: persona(row.getString('host_seat')), auditor_persona: persona(row.getString('auditor_seat')),
            starts_at: isoDate(row.getString('starts_at')) };
    });
    return { workspace, week: plan.week, rota: plan.classes, scheduled };
}

module.exports = { VARIABLE, configured, installed, schedule, list };
