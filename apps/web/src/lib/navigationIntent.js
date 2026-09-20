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
// Intent:      Preserve local classroom links through sign-in and keep their identifiers out of browser telemetry.
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

/** @param {unknown} value Browser location or request URL. @returns {unknown} Classroom location with private path and query identifiers removed. */
export function classroomTelemetryLocation(value) {
    if (typeof value !== 'string' || !value) return value;
    try {
        const url = new URL(value, 'https://buildanddo.com');
        const path = url.pathname;
        const room = /^\/app\/classrooms(?:\/|$)/.test(path);
        const api = /\/api\/buildanddo\/workspaces\/[^/]+\/classrooms(?:\/|$)/.test(path);
        const lesson = path === '/app/tutorials' && url.searchParams.has('lesson');
        if (!room && !api && !lesson) return value;
        if (room) url.pathname = path === '/app/classrooms' || path === '/app/classrooms/' ? '/app/classrooms' : '/app/classrooms/:room';
        if (api) url.pathname = path.replace(/(\/api\/buildanddo\/workspaces\/)[^/]+\/classrooms(?:\/(.*))?$/, (_all, prefix, suffix) =>
            `${prefix}:workspace/classrooms${suffix ? `/:room${suffix.endsWith('/presence') ? '/presence' : ''}` : ''}`);
        url.search = ''; url.hash = '';
        return value.startsWith('/') && !value.startsWith('//') ? url.pathname : `${url.origin}${url.pathname}`;
    } catch { return value; }
}

/** @param {object|null} event Analytics event. @returns {object|null} Event with classroom location properties scrubbed. */
export function scrubClassroomProperties(event) {
    if (!event?.properties) return event;
    for (const properties of [event.properties, event.properties.$set, event.properties.$set_once]) {
        if (!properties || typeof properties !== 'object') continue;
        for (const key of ['$current_url', '$pathname', '$referrer', '$initial_current_url', '$initial_pathname', '$initial_referrer'])
            if (key in properties) properties[key] = classroomTelemetryLocation(properties[key]);
    }
    return event;
}
