// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/estate.pb.js
// Stage:       11_COMMIT
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_migrations/1789200000_add_users_cnwb_seat_level.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1789200000_add_users_cnwb_seat_level.js; VERIFIED_BY apps/web/src/pages/workspace/FleetPage.jsx; VERIFIED_BY apps/web/src/pages/workspace/PlatformHealthPage.jsx
// Intent:      Keep the CNWB seat level backend-owned and serve the estate fleet snapshot and platform assessment only to master seats.
// ───────────────────────────────────────────────────────────────
//
// Two rules, both fail-closed:
//   1. A client may never set or change `users.cnwb_seat_level`. Only a superuser (the seat login on the private plane
//      acts with superuser auth) may. Measured 2026-09-18: PocketBase auth collections let a user update their own
//      record, so without this guard a user could promote themselves.
//   2. The estate reports are NOT public files any more. The fleet snapshot (2026-09-18) and the full platform
//      assessment (2026-09-24) are read from BUILDANDDO_ESTATE_DIR (or pb_data/estate) and answered only to an
//      authenticated user whose level is `master`; everyone else gets 404, the same answer as for a path that
//      does not exist.

// PocketBase >=0.23 runs every handler in its own VM: file-scope helpers are NOT visible inside handlers
// (measured 2026-09-18 on staging 0.39.8: "ReferenceError: realtimeConfig is not defined"). Helpers live in
// the sibling lib and are require()d inside each handler, the same way main's hooks load telemetry.js.
onRecordCreateRequest((e) => {
    const { SEAT_FIELD, isSuperuser } = require(`${__hooks}/estate-lib.js`);
    if (!isSuperuser(e) && e.record.getString(SEAT_FIELD)) {
        throw new ForbiddenError(`${SEAT_FIELD} is set by the seat login, not by the client.`);
    }
    e.next();
}, 'users');

onRecordUpdateRequest((e) => {
    const { SEAT_FIELD, isSuperuser } = require(`${__hooks}/estate-lib.js`);
    if (!isSuperuser(e)) {
        const before = e.record.original().getString(SEAT_FIELD);
        const after = e.record.getString(SEAT_FIELD);
        if (before !== after) {
            throw new ForbiddenError(`${SEAT_FIELD} is set by the seat login, not by the client.`);
        }
    }
    e.next();
}, 'users');

routerAdd('GET', '/api/buildanddo/estate/fleet-status', (e) => {
    const { SEAT_FIELD, MASTER } = require(`${__hooks}/estate-lib.js`);
    const level = e.auth ? String(e.auth.getString(SEAT_FIELD) || '').trim().toLowerCase() : '';
    if (level !== MASTER) {
        return e.json(404, { error: 'not found' });
    }
    const dir = $os.getenv('BUILDANDDO_ESTATE_DIR') || `${__hooks}/../pb_data/estate`;
    const path = `${dir}/fleet-status.json`;
    let raw = null;
    try {
        raw = toString($os.readFile(path));
    } catch (_err) {
        raw = null;
    }
    if (!raw) {
        return e.json(200, {
            state: 'UNMEASURED',
            reason: 'fleet snapshot not published on this instance',
            expected_path: path,
            served_to: 'master seat',
        });
    }
    try {
        const doc = JSON.parse(raw);
        doc.served_to = 'master seat';
        return e.json(200, doc);
    } catch (_err) {
        return e.json(200, { state: 'UNMEASURED', reason: 'fleet snapshot is not valid JSON', expected_path: path });
    }
});  // no requireAuth middleware on purpose: an anonymous caller must get the same 404 as a non-master user

// The platform assessment splits the same way as the fleet snapshot, and for the same reason: from
// 2026-09-24 the site publishes only a closed set of fields (id, label, state, verified per platform),
// and the full report - which monitoring is unused, which scanners are off, which entitlements cannot
// be read - is estate-only. Same gate, same 404, same UNMEASURED answer when the file has not been
// published to this instance.
routerAdd('GET', '/api/buildanddo/estate/platform-health', (e) => {
    const { SEAT_FIELD, MASTER } = require(`${__hooks}/estate-lib.js`);
    const level = e.auth ? String(e.auth.getString(SEAT_FIELD) || '').trim().toLowerCase() : '';
    if (level !== MASTER) {
        return e.json(404, { error: 'not found' });
    }
    const dir = $os.getenv('BUILDANDDO_ESTATE_DIR') || `${__hooks}/../pb_data/estate`;
    const path = `${dir}/platform-health.json`;
    let raw = null;
    try {
        raw = toString($os.readFile(path));
    } catch (_err) {
        raw = null;
    }
    if (!raw) {
        return e.json(200, {
            state: 'UNMEASURED',
            reason: 'platform assessment not published on this instance',
            expected_path: path,
            served_to: 'master seat',
        });
    }
    try {
        const doc = JSON.parse(raw);
        doc.served_to = 'master seat';
        return e.json(200, doc);
    } catch (_err) {
        return e.json(200, { state: 'UNMEASURED', reason: 'platform assessment is not valid JSON', expected_path: path });
    }
});  // no requireAuth middleware on purpose: an anonymous caller must get the same 404 as a non-master user
