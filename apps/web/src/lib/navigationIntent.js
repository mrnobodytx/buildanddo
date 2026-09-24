// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/navigationIntent.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/components/ProtectedRoute.jsx
// EnumType:    Service
// EnumEdges:   CONSUMES apps/web/src/components/ProtectedRoute.jsx
// DAG Node:    none
// Intent:      Preserve local classroom links through sign-in and keep classroom and personal learning identifiers out of browser telemetry.
// ───────────────────────────────────────────────────────────────

/** @param {unknown} value Requested destination. @returns {string} Valid local workspace path or the workspace front page. */
export function workspaceDestination(value) {
    if (typeof value !== 'string' || value.length > 2000 || /[\\\s\u0000-\u001f\u007f]/.test(value) || !/^\/app(?:\/|[?#]|$)/.test(value)) return '/app';
    try {
        const parsed = new URL(value, 'https://buildanddo.com');
        if (parsed.origin !== 'https://buildanddo.com' || !/^\/app(?:\/[a-zA-Z0-9_-]+)*\/?$/.test(parsed.pathname)) return '/app';
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch { return '/app'; }
}

/** @param {unknown} value Browser location or request URL. @returns {unknown} Classroom or learning location with private identifiers removed. */
export function classroomTelemetryLocation(value) {
    if (typeof value !== 'string' || !value) return value;
    try {
        const url = new URL(value, 'https://buildanddo.com');
        const path = url.pathname;
        const room = /^\/app\/classrooms(?:\/|$)/.test(path);
        const api = /\/api\/buildanddo\/workspaces\/[^/]+\/classrooms(?:\/|$)/.test(path);
        const learning = /\/api\/buildanddo\/learning(?:\/|$)/.test(path);
        const lesson = path === '/app/tutorials' && url.searchParams.has('lesson');
        const reset = /^\/reset-password\/[^/]/.test(path); // single-use reset token in the path
        if (!room && !api && !learning && !lesson && !reset) return value;
        if (reset) url.pathname = '/reset-password/:token';
        if (room) url.pathname = path === '/app/classrooms' || path === '/app/classrooms/' ? '/app/classrooms' : '/app/classrooms/:room';
        if (api) url.pathname = path.replace(/(\/api\/buildanddo\/workspaces\/)[^/]+\/classrooms(?:\/(.*))?$/, (_all, prefix, suffix) =>
            `${prefix}:workspace/classrooms${suffix ? `/:room${suffix.endsWith('/presence') ? '/presence' : ''}` : ''}`);
        if (learning) url.pathname = path.replace(/(\/api\/buildanddo\/learning)(?:\/.*)?$/, (_all, prefix) =>
            `${prefix}${path.endsWith('/learning') || path.endsWith('/learning/') ? '' : '/:tutorial'}`);
        url.search = ''; url.hash = '';
        return value.startsWith('/') && !value.startsWith('//') ? url.pathname : `${url.origin}${url.pathname}`;
    } catch { return value; }
}

const URL_SHAPED = /^(?:\/(?!\/)|https?:\/\/)/i;

function scrubUrlStrings(value, depth) {
    if (typeof value === 'string') return URL_SHAPED.test(value) ? classroomTelemetryLocation(value) : value;
    if (!value || typeof value !== 'object' || depth > 4) return value;
    for (const key of Object.keys(value)) value[key] = scrubUrlStrings(value[key], depth + 1);
    return value;
}

/**
 * Scrubs every URL- or path-shaped string anywhere in the event, not a fixed list of keys. A key
 * list missed `$session_entry_url` (on every event of a session that began in a room or on a
 * reset link), `$prev_pageview_pathname`, and the top-level `$set_once` sent on identify.
 * Strings that match no private pattern come back unchanged.
 *
 * @param {object|null} event Analytics event. @returns {object|null} Event with classroom and reset locations scrubbed.
 */
export function scrubClassroomProperties(event) {
    if (!event || typeof event !== 'object') return event;
    for (const key of ['properties', '$set', '$set_once'])
        if (event[key] && typeof event[key] === 'object') scrubUrlStrings(event[key], 0);
    return event;
}
