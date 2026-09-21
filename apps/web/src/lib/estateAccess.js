// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/estateAccess.js
// Stage:       11_COMMIT
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/contexts/AuthContext.jsx, apps/pocketbase/pb_migrations/1789200000_add_users_cnwb_seat_level.js
// EnumType:    Module
// EnumEdges:   CONSUMES apps/web/src/contexts/AuthContext.jsx; VALIDATES apps/pocketbase/pb_hooks/estate.pb.js
// Intent:      Estate surfaces (Fleet) render only for a signed-in user whose account is a master-level CNWB seat.
// ───────────────────────────────────────────────────────────────

/**
 * The seat level is written by the backend only (the OCN seat login on the private plane sets it; the estate hook
 * rejects client edits). A missing or unknown value is "not a seat": the gate fails closed. Measured 2026-09-18: the
 * previous build-time flag hid Fleet per BUILD, not per PERSON, and the fleet report shipped as a public file.
 */
export const MASTER_SEAT_LEVEL = 'master';

export function seatLevel(user) {
    const value = user && typeof user.cnwb_seat_level === 'string' ? user.cnwb_seat_level.trim().toLowerCase() : '';
    return value || 'none';
}

export function isMasterSeat(user) {
    return seatLevel(user) === MASTER_SEAT_LEVEL;
}

/** Keep an entry unless it is marked `estate: true` and the user is not a master seat. */
export const visibleForUser = (entries, user) => entries.filter((entry) => !entry.estate || isMasterSeat(user));
