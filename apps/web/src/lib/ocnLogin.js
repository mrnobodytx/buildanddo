// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/ocnLogin.js
// Stage:       09_RUNTIME
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/lib/pocketbaseClient.js,
//              apps/pocketbase/pb_hooks/ocn-login.pb.js
// EnumType:    Service
// EnumEdges:   CONSUMES POST /api/ocn/login;
//              VERIFIED_BY apps/web/src/lib/__tests__/ocnLogin.test.js
// Intent:      Exchange a CitadelKey envelope supplied by the seat RUNTIME for a
//              PocketBase session. The browser never signs, never holds a private
//              key, and stores nothing unless the backend answered 200 with a token.
// ───────────────────────────────────────────────────────────────

import pb from '@/lib/pocketbaseClient';

export const OCN_LOGIN_ROUTE = '/api/ocn/login';
/** Global the desktop/agent runtime sets with a ready-made X-Citadel-Key value. */
export const OCN_HEADER_GLOBAL = '__BND_OCN_HEADER__';
export const OCN_QUERY_FLAG = 'ocn';

/** PocketBase base URL, so the route lands on the same proxy the SDK uses. */
export function ocnApiBase(client = pb) {
    const base = (client && (client.baseURL || client.baseUrl)) || '/hcgi/platform';
    return String(base).replace(/\/+$/, '');
}

/**
 * The header value the runtime injected, or null. Trimmed; never logged.
 *
 * @param {object} [win] Window-like object (test seam).
 * @returns {string|null}
 */
export function readOcnHeader(win = typeof window === 'undefined' ? undefined : window) {
    const value = win ? win[OCN_HEADER_GLOBAL] : undefined;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Whether the seat sign-in affordance should render at all: only when the
 * runtime supplied a header or the page was opened with `?ocn=1`.
 *
 * @param {string} [search] `location.search`.
 * @param {object} [win] Window-like object (test seam).
 * @returns {boolean}
 */
export function ocnRequested(search = '', win = typeof window === 'undefined' ? undefined : window) {
    if (readOcnHeader(win)) return true;
    try {
        return new URLSearchParams(search || '').get(OCN_QUERY_FLAG) === '1';
    } catch {
        return false;
    }
}

export class OcnLoginError extends Error {
    constructor(message, status, code) {
        super(message);
        this.name = 'OcnLoginError';
        this.status = status;
        this.code = code;
    }
}

const MESSAGES = {
    no_header:
        'No Citadel seat key was supplied by the runtime (window.__BND_OCN_HEADER__ is absent). Nothing was signed in.',
    network_error: 'Could not reach BuildAndDo to verify the seat key. Nothing was signed in.',
    seat_not_provisioned:
        'This seat is not provisioned on BuildAndDo yet (seat_not_provisioned). Ask the operator to run the OCN seat migration.',
    ocn_verifier_unavailable:
        'BuildAndDo cannot reach its Citadel verifier right now (ocn_verifier_unavailable). Nothing was signed in.',
    malformed_response: 'BuildAndDo answered without a session token. Nothing was signed in.',
};

function describe(status, code) {
    if (MESSAGES[code]) return MESSAGES[code];
    if (status === 401) return `The Citadel seat key was not accepted (${code}).`;
    if (status === 404) return 'This BuildAndDo backend has no OCN login route yet (deploy pending).';
    if (status >= 500) return `BuildAndDo answered ${status} (${code}). Nothing was signed in.`;
    return `Seat sign-in failed (${status} ${code}).`;
}

/**
 * POST the runtime-supplied envelope to /api/ocn/login and, on 200, save the
 * returned token + record into the PocketBase auth store.
 *
 * @param {{header?: string|null, fetchImpl?: typeof fetch, client?: object}} [options]
 * @returns {Promise<object>} The auth record the backend returned.
 * @throws {OcnLoginError} With a readable `message`, `status` and `code`; the
 *         auth store is untouched on every throw.
 */
export async function ocnLogin({ header = readOcnHeader(), fetchImpl, client = pb } = {}) {
    if (!header) throw new OcnLoginError(MESSAGES.no_header, 0, 'no_header');
    const doFetch = fetchImpl || globalThis.fetch;
    let response;
    try {
        response = await doFetch(ocnApiBase(client) + OCN_LOGIN_ROUTE, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'X-Citadel-Key': header, Accept: 'application/json' },
        });
    } catch {
        throw new OcnLoginError(MESSAGES.network_error, 0, 'network_error');
    }
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    if (response.status !== 200) {
        const code = (body && typeof body.message === 'string' && body.message) || `http_${response.status}`;
        throw new OcnLoginError(describe(response.status, code), response.status, code);
    }
    if (!body || typeof body.token !== 'string' || !body.token || !body.record || !body.record.id) {
        throw new OcnLoginError(MESSAGES.malformed_response, 200, 'malformed_response');
    }
    client.authStore.save(body.token, body.record);
    return body.record;
}
