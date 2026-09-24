// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/authErrors.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/pocketbaseClient.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/pocketbaseClient.js
// DAG Node:    none
// Intent:      Classify account-recovery failures so pages report transport and rate limits honestly.
// ───────────────────────────────────────────────────────────────

/** Matches the signup form's minimum (SignupPage.jsx). */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * @param {unknown} err PocketBase ClientResponseError or any thrown value.
 * @returns {'network'|'rate_limited'|'server'|'not_found'|'rejected'} Failure kind.
 */
export function authFailureKind(err) {
    const status = Number(err?.status);
    if (!Number.isFinite(status) || status <= 0 || err?.isAbort) return 'network';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server';
    if (status === 404) return 'not_found';
    return 'rejected';
}
