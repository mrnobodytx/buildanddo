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
// Depends:     apps/web/src/components/ProtectedRoute.jsx, apps/web/src/App.jsx, apps/pocketbase/pb_hooks
// EnumType:    Service
// EnumEdges:   CONSUMES apps/web/src/components/ProtectedRoute.jsx; CONSUMES apps/web/src/App.jsx; CONSUMES apps/pocketbase/pb_hooks
// DAG Node:    none
// Intent:      Preserve local sign-in destinations while bounding telemetry routes and removing private locations and content before collection.
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

// Mirror App.jsx, not the text or record identifiers rendered inside a route.
const SECTIONS = new Set([
    '/', '/hostinger-challenge', '/roadmap', '/practice', '/platform', '/pricing', '/about', '/docs',
    '/classrooms', '/blog', '/contact', '/guild', '/status', '/login', '/signup', '/forgot-password',
    '/reset-password', '/onboarding', '/app',
    ...['journey', 'operator', 'signals', 'missions', 'workflows', 'tutorials', 'classrooms', 'erp',
        'operations', 'fleet', 'platforms', 'evidence', 'research', 'knowledge', 'blueprints', 'policy',
        'suite', 'government', 'dossier', 'edition', 'desks', 'replay', 'passport', 'career', 'corrections',
        'support', 'community', 'roadmap', 'settings', 'admin', 'integrations', 'wiki', 'forums',
        'rooms', 'rooms/systems', 'rooms/live'].map((path) => `/app/${path}`),
]);

// These are JSON routes consumed by the app, including the unmounted API paths
// whose accidental SPA fallback must still be measured. Unknown paths fail closed.
const ENDPOINTS = [
    '/api/health', '/api/ocn/login', '/api/ocn/health', '/api/files/token',
    ...['session', 'tracks', 'renegotiate', 'close', 'health', 'presence', 'presence/health'].map((path) => `/api/classroom/${path}`),
    ...['auth-with-password', 'auth-with-oauth2', 'auth-refresh', 'auth-methods', 'request-password-reset',
        'confirm-password-reset', 'request-verification', 'confirm-verification', 'request-email-change',
        'confirm-email-change', 'request-otp', 'auth-with-otp', 'records', 'records/:record',
        'records/:record/external-auths', 'records/:record/external-auths/:provider']
        .map((path) => `/api/collections/:collection/${path}`),
    ...['onboarding', 'career/profile', 'dossier', 'dossier/read', 'estate/fleet-status', 'estate/platform-health',
        'learning', 'learning/states', 'learning/:tutorial', 'workflow-runs', 'workflow-runs/:run/decisions']
        .map((path) => `/api/buildanddo/${path}`),
    ...['access', 'admin', 'integrations', 'wiki', 'forums', 'forums/:topic', 'community', 'claims',
        'government', 'operator', 'business', 'mission-replay/:mission', 'suite', 'knowledge', 'knowledge/context',
        'assistant', 'assistant/chat', 'assistant/knowledge', 'research', 'research/:submission',
        'blueprints', 'blueprints/analyze', 'blueprints/:blueprint', 'blueprints/:blueprint/commands',
        'classrooms', 'classrooms/:room', 'classrooms/:room/presence', 'classrooms/:room/record',
        'decide', 'decisions/:decision', 'discord-research', 'discord-research/upload', 'discord-dossier']
        .map((path) => `/api/buildanddo/workspaces/:workspace/${path}`),
    ...['roadmap-status', 'capabilities', 'activity-status', 'platform-health', 'community-status', 'fleet-status']
        .map((name) => `/${name}.json`),
    ...['organization', 'capability', 'development', 'utilization', 'systems', 'live']
        .map((name) => `/room-projections/${name}.json`),
].map((path) => ({ path, parts: path.split('/') }));

function telemetryUrl(value) {
    if (typeof value !== 'string' || !/^(?:\/|https?:\/\/)/i.test(value)) return null;
    try {
        const url = new URL(value, 'https://buildanddo.com');
        return ['http:', 'https:'].includes(url.protocol) ? url : null;
    } catch { return null; }
}

/** @param {unknown} value Browser route or URL. @returns {string} Closed route template, or /unknown. */
export function telemetrySection(value) {
    const url = telemetryUrl(value);
    if (!url) return '/unknown';
    const path = url.pathname.replace(/\/+$/, '').toLowerCase() || '/';
    if (SECTIONS.has(path)) return path;
    if (/^\/app\/classrooms\/[^/]+$/.test(path)) return '/app/classrooms/:room';
    if (/^\/app\/rooms\/[^/]+$/.test(path)) return '/app/rooms/:room';
    if (/^\/guild\/[^/]+$/.test(path)) return '/guild/:slug';
    if (/^\/reset-password\/[^/]+$/.test(path)) return '/reset-password/:token';
    return '/unknown';
}

/** @param {unknown} value Request URL. @returns {string|null} Known JSON endpoint template, never a raw record or unknown path. */
export function telemetryEndpoint(value) {
    const url = telemetryUrl(value);
    if (!url) return null;
    const path = url.pathname.replace(/\/+$/, '');
    const prefix = path.startsWith('/hcgi/platform/api/') ? '/hcgi/platform' : '';
    const parts = path.slice(prefix.length).split('/');
    const match = ENDPOINTS.find((entry) => entry.parts.length === parts.length && entry.parts.every((part, index) =>
        part.startsWith(':') ? Boolean(parts[index]) : part === parts[index]));
    return match ? prefix + match.path : null;
}

/** @param {unknown} value Browser location or resource URL. @returns {unknown} Location without credentials, queries, fragments or dynamic paths. */
export function classroomTelemetryLocation(value) {
    if (value === null || value === undefined || value === '') return value;
    const url = telemetryUrl(value);
    if (!url) return '/unknown';
    const path = telemetryEndpoint(value) || (url.pathname === '/assets/:asset' || /^\/assets\/[^/]+\.(?:js|css|woff2?|svg|png|jpe?g|webp|gif|ico)$/i.test(url.pathname)
        ? '/assets/:asset' : telemetrySection(value));
    return value.startsWith('/') && !value.startsWith('//') ? path : `${url.origin}${path}`;
}

/** @param {object|null} event Analytics event. @returns {object|null} Event scrubbed before capture, including persisted and nested properties. */
export function scrubClassroomProperties(event) {
    if (!event?.properties) return event;
    const seen = new WeakSet();
    const scrub = (properties) => {
        seen.add(properties);
        const result = { ...properties };
        for (const key of Object.keys(properties)) {
            const name = key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/^\$/, '').replace(/[.-]/g, '_');
            const value = properties[key];
            if (name === 'has_query') {
                result[key] = value === true;
            } else if (name === 'error_name') {
                result[key] = ['Error', 'TypeError', 'AbortError', 'TimeoutError', 'NetworkError', 'FetchError'].includes(value) ? value : 'Error';
            } else if (/(?:^|_)(?:url|href|pathname|path|referrer|endpoint)$/.test(name)) {
                result[key] = classroomTelemetryLocation(value);
            } else if (/(?:^|_)(?:route|section)$/.test(name)) {
                result[key] = value === null ? null : telemetrySection(value);
            } else if (/(?:^|_)(?:email|name|title|text|message|stack|description|token|password|secret|credential|authorization|apikey|api_key|query|search|keyword|lesson|tutorial|choice|answer|prompt|body|content|elements|heatmap|utm|gclid|fbclid|msclkid|dclid)(?:_|$)/.test(name) || Array.isArray(value)) {
                delete result[key];
            } else if (typeof value === 'string' && /^(?:\/|https?:\/\/)/i.test(value)) {
                result[key] = classroomTelemetryLocation(value);
            } else if (value && typeof value === 'object') {
                if (seen.has(value)) delete result[key]; else result[key] = scrub(value);
            }
        }
        return result;
    };
    try { event.properties = scrub(event.properties); return event; } catch { return null; }
}
