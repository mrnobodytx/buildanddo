// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/communityStatus.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        B
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/communityLinks.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/web/public/community-status.json; CONSUMES apps/web/public/platform-health.json;
//              CONSUMED_BY apps/web/src/components/site/StatusPanels.jsx;
//              VALIDATED_BY apps/web/src/lib/__tests__/communityStatus.test.js
// Intent:      Turn the two published health files into rows a reader can trust, where anything not
//              freshly measured says UNMEASURED instead of borrowing a green.
// ───────────────────────────────────────────────────────────────

// THE CONTRACT for apps/web/public/community-status.json (schema buildanddo.community-status/v1).
// A separate probe writes it; nothing in this repository measures the surfaces itself.
//
//   {
//     "schema": "buildanddo.community-status/v1",
//     "generated_at": "<ISO-8601 time the probe finished, or null before the first run>",
//     "stale_after_seconds": 21600,
//     "surfaces": [
//       { "id": "<a COMMUNITY_LINKS id>", "label": "...", "url": "...",
//         "state": "UP" | "DEGRADED" | "DOWN" | "UNMEASURED",
//         "checked_at": "<ISO-8601 time of this surface's check, or null>",
//         "detail": "<one short public sentence: what was measured, never how or from where>" }
//     ]
//   }
//
// HOW IT IS READ. The canonical surface list, labels and URLs come from communityLinks.js, never
// from the file: a probe reports STATE, it does not get to add links to the page. A file that is
// absent, unreadable, of another schema, undated, dated in the future or older than its own window
// renders EVERY surface UNMEASURED with the reason. A single surface that is missing, carries an
// unknown state or has no fresh checked_at is UNMEASURED on its own. Nothing renders UP without a
// fresh reading that says UP.
//
// DETAIL TEXT IS PUBLIC. The probe runs on a fleet machine, and a detail such as "ok from <host>"
// would publish that machine. Any detail that names internal infrastructure or carries an address
// is withheld and replaced by a sentence that says so.

import { COMMUNITY_LINKS } from './communityLinks.js';

export const COMMUNITY_STATUS_SCHEMA = 'buildanddo.community-status/v1';
export const COMMUNITY_STATUS_URL = '/community-status.json';
export const PLATFORM_HEALTH_URL = '/platform-health.json';
export const SURFACE_STATES = Object.freeze(['UP', 'DEGRADED', 'DOWN', 'UNMEASURED']);
export const DEFAULT_STALE_AFTER_SECONDS = 6 * 60 * 60;
// A writer may shorten its window but not declare a reading fresh for more than a day.
const MAX_STALE_AFTER_SECONDS = 24 * 60 * 60;
// The platform file is a recorded assessment; past a day it is history, not status.
export const PLATFORM_STALE_AFTER_SECONDS = 24 * 60 * 60;
// Clock skew tolerated before a timestamp in the future is treated as untrustworthy.
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const DETAIL_MAX = 240;

/**
 * Shapes of fleet machine names, and IPv4/IPv6 addresses. A public page must never render one
 * (operator rule, 2026-09-22). The name shapes are deliberately generic - a prefix family, never
 * a list of real names - because this pattern ships in the public bundle and must not become the
 * disclosure it guards against. No trailing word boundary, so a name followed by "_" matches too.
 */
export const INFRASTRUCTURE_PATTERN =
    /\b(?:ray|mesh|medic)-[a-z0-9]|\b(?:kvm|rig|srv)\d|\b(?:\d{1,3}\.){3}\d{1,3}\b|\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/i;

function parseTime(value) {
    const parsed = typeof value === 'string' && value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
}

/** Bounded public text, or the withheld notice when it names infrastructure. */
export function publicDetail(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    const text = value.trim().slice(0, DETAIL_MAX);
    return INFRASTRUCTURE_PATTERN.test(text)
        ? 'Detail withheld: it named internal infrastructure.'
        : text;
}

function everySurface(detail) {
    return COMMUNITY_LINKS.map((link) => ({
        id: link.id,
        label: link.label,
        url: link.url,
        state: 'UNMEASURED',
        checked_at: null,
        detail,
    }));
}

function unmeasuredDocument(state, reason, extra = {}) {
    return {
        state,
        generated_at: null,
        age_seconds: null,
        stale_after_seconds: null,
        reason,
        // The reason is said once, above the rows; each row only needs to say it has no reading.
        surfaces: everySurface('No fresh reading.'),
        ...extra,
    };
}

function windowOf(doc) {
    const declared = Number(doc.stale_after_seconds);
    if (!Number.isFinite(declared) || declared <= 0) return DEFAULT_STALE_AFTER_SECONDS;
    return Math.min(declared, MAX_STALE_AFTER_SECONDS);
}

function readSurface(link, entry, now, windowSeconds) {
    const row = { id: link.id, label: link.label, url: link.url, state: 'UNMEASURED', checked_at: null, detail: '' };
    if (!entry) return { ...row, detail: 'Not in the latest reading.' };
    if (!SURFACE_STATES.includes(entry.state)) {
        return { ...row, detail: 'The reading gave a state this page does not recognise.' };
    }
    const checked = parseTime(entry.checked_at);
    const fresh = checked !== null && now - checked <= windowSeconds * 1000 && checked - now <= FUTURE_SKEW_MS;
    if (entry.state !== 'UNMEASURED' && !fresh) {
        return { ...row, checked_at: entry.checked_at ?? null, detail: 'No fresh check for this surface.' };
    }
    return { ...row, state: entry.state, checked_at: entry.checked_at ?? null, detail: publicDetail(entry.detail) };
}

/**
 * Read a community-status document against the canonical surfaces.
 *
 * @param {unknown} doc The parsed file, or null when it could not be fetched or parsed.
 * @param {number} [now] Clock in epoch milliseconds.
 * @returns {{state: string, generated_at: ?string, age_seconds: ?number,
 *   stale_after_seconds: ?number, reason: string, surfaces: Array<object>}} One row per canonical
 *   surface. `state` is MEASURED, STALE, UNMEASURED, INVALID or ABSENT.
 */
export function readCommunityStatus(doc, now = Date.now()) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        return unmeasuredDocument('ABSENT', 'No community reading could be read, so no surface has been measured.');
    }
    if (doc.schema !== COMMUNITY_STATUS_SCHEMA) {
        return unmeasuredDocument('INVALID', 'The published reading uses a schema this page does not recognise.');
    }
    const generated = parseTime(doc.generated_at);
    if (generated === null) {
        return unmeasuredDocument('UNMEASURED', 'The published reading has no measurement time, so no probe has run yet.');
    }
    if (generated - now > FUTURE_SKEW_MS) {
        return unmeasuredDocument('INVALID', 'The published reading is dated in the future, so it cannot be trusted.');
    }
    const windowSeconds = windowOf(doc);
    const age = Math.max(0, Math.round((now - generated) / 1000));
    const measured = { generated_at: doc.generated_at, age_seconds: age, stale_after_seconds: windowSeconds };
    if (age > windowSeconds) {
        return {
            ...unmeasuredDocument('STALE', `The last reading is older than its ${Math.round(windowSeconds / 3600)} h window.`),
            ...measured,
        };
    }
    const entries = Array.isArray(doc.surfaces) ? doc.surfaces.filter((entry) => entry && typeof entry === 'object') : [];
    return {
        state: 'MEASURED',
        ...measured,
        reason: '',
        surfaces: COMMUNITY_LINKS.map((link) => readSurface(
            link, entries.find((entry) => entry.id === link.id), now, windowSeconds)),
    };
}

/** Rows per state, in SURFACE_STATES order. */
export function countStates(surfaces) {
    const counts = Object.fromEntries(SURFACE_STATES.map((state) => [state, 0]));
    for (const surface of surfaces) counts[surface.state] += 1;
    return counts;
}

/**
 * Read platform-health.json for the public status page: label, state and verification only, with
 * the observation's age. Older than a day is STALE: it is a recorded assessment.
 *
 * The file's free-text `detail` is NOT carried. It is internal commentary written for the
 * workspace page, and measured 2026-09-22 one entry named a fleet host - a name the shape filter
 * above does not know. A public page shows only fields whose values come from a closed set.
 *
 * @param {unknown} doc The parsed file, or null.
 * @param {number} [now] Clock in epoch milliseconds.
 * @returns {{state: string, observed_at: ?string, generated_at: ?string, age_seconds: ?number,
 *   platforms: Array<{id: string, label: string, state: string, verified: boolean}>}}
 */
export function readPlatformHealth(doc, now = Date.now()) {
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.platforms)) {
        return { state: 'ABSENT', observed_at: null, generated_at: null, age_seconds: null, platforms: [] };
    }
    const observed = parseTime(doc.observed_at);
    const age = observed === null ? null : Math.max(0, Math.round((now - observed) / 1000));
    let state = 'MEASURED';
    if (observed === null) state = 'UNMEASURED';
    else if (age > PLATFORM_STALE_AFTER_SECONDS) state = 'STALE';
    return {
        state,
        observed_at: observed === null ? null : doc.observed_at,
        generated_at: parseTime(doc.generated_at) === null ? null : doc.generated_at,
        age_seconds: age,
        platforms: doc.platforms
            .filter((platform) => platform && typeof platform === 'object')
            .map((platform) => ({
                id: String(platform.id || platform.label || ''),
                label: String(platform.label || platform.id || 'Unnamed platform'),
                state: String(platform.state || 'unknown'),
                verified: platform.verified === true,
            })),
    };
}

/** "3 h", "11 d", "just now": the age of a reading, never rounded up to fresh. */
export function formatAge(seconds) {
    if (!Number.isFinite(seconds)) return 'unknown age';
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} h`;
    return `${Math.floor(hours / 24)} d`;
}
