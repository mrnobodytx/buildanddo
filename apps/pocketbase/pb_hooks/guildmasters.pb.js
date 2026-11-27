// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/guildmasters.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/guildmasters.js, apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/guildmasters.js; DEPENDS_ON apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js; VERIFIED_BY tests/upgrade/guildmaster-registry.test.mjs
// Intent:      Keep users.ocn_seat, and the email a seat is recognised by, backend-owned.
// ----------------------------------------------------------------
//
// seatOf() trusts `ocn_seat` and the reserved seat email of the stored users row, so both must be
// out of a client's reach. PocketBase auth collections let a user update their own record (the
// finding estate.pb.js records for cnwb_seat_level), so without these guards a person could flag
// their own account as a seat. Only a superuser - the operator, or a migration acting through the
// app - may set or change the flag, or move a seat account to another email. Fail-closed: a hook
// event without superuser auth is a client.
//
// Each handler require()s the lib itself: PocketBase >=0.23 runs every handler in its own VM.

onRecordCreateRequest((e) => {
    const { SEAT_FLAG, isSuperuser } = require(`${__hooks}/guildmasters.js`);
    if (!isSuperuser(e) && e.record.getBool(SEAT_FLAG)) {
        throw new ForbiddenError(`${SEAT_FLAG} is set by the operator, not by the client.`);
    }
    e.next();
}, 'users');

onRecordUpdateRequest((e) => {
    const { SEAT_FLAG, isSuperuser } = require(`${__hooks}/guildmasters.js`);
    if (!isSuperuser(e)) {
        const before = e.record.original();
        if (before.getBool(SEAT_FLAG) !== e.record.getBool(SEAT_FLAG)) {
            throw new ForbiddenError(`${SEAT_FLAG} is set by the operator, not by the client.`);
        }
        // A seat is recognised by its reserved email, so a seat account may not move itself onto
        // another seat's address either.
        if (before.getBool(SEAT_FLAG) && before.getString('email') !== e.record.getString('email')) {
            throw new ForbiddenError('A seat account email is set by the operator, not by the client.');
        }
    }
    e.next();
}, 'users');
