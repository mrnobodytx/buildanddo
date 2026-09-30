// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/estate-lib.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     apps/pocketbase/pb_migrations/1789200000_add_users_cnwb_seat_level.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_migrations/1789200000_add_users_cnwb_seat_level.js
// Intent:      Reuse backend-owned estate authority for private diagnostic reads.
// ───────────────────────────────────────────────────────────────

const SEAT_FIELD = 'cnwb_seat_level';
const MASTER = 'master';
function isSuperuser(e) {
    try { return typeof e.hasSuperuserAuth === 'function' ? e.hasSuperuserAuth() : false; } catch (_err) { return false; }
}
function isMasterSeat(e) {
    return Boolean(e.auth && typeof e.auth.getString === 'function' && e.auth.getString(SEAT_FIELD).trim().toLowerCase() === MASTER);
}
module.exports = { SEAT_FIELD, MASTER, isSuperuser, isMasterSeat };
