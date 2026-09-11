// CGRF: SRS=SRS-BUILDANDDO-PUBLIC-RECORD-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/integrationsStatus.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-PUBLIC-RECORD-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/public/integrations-status.json,
//              scripts/deploy/integrations_status.py
// EnumType:    Lib
// EnumEdges:   CONSUMES apps/web/public/integrations-status.json;
//              CONSUMED_BY apps/web/src/pages/workspace/CommunitySocialPage.jsx;
//              CONSUMED_BY apps/web/src/pages/workspace/TutorialsPage.jsx
// Intent:      One fetch for the public-record projection so the Community
//              and Field Manual tabs read the same file the same way, fail
//              soft the same way, and agree on what "stale" means. Mirrors
//              roadmapStatus.js; there is no browser secret anywhere here.
// ───────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

export const INTEGRATIONS_STATUS_URL = '/integrations-status.json';
export const INTEGRATIONS_STATUS_SCHEMA = 'buildanddo.integrations-status/v1';
// Same rule RoadmapPage applies to roadmap-status.json: a projection older
// than two days is shown, but flagged, because the build that wrote it may
// simply not have run since.
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;
export const PUBLIC_CHANNELS = ['wiki', 'forum', 'discord', 'reddit'];

/**
 * Fetches the public-record projection. Rejects on any non-2xx, network error
 * or unparseable body so callers decide what "unknown" looks like on their
 * surface.
 *
 * @returns {Promise<object>} Parsed integrations-status.json.
 */
export function fetchIntegrationsStatus() {
    return fetch(INTEGRATIONS_STATUS_URL, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))));
}

/**
 * Reads the projection once on mount.
 *
 * @returns {{status: object|null, error: boolean}} `status` is null until the
 *          fetch resolves; `error` is true when it failed (and stays null).
 */
export function useIntegrationsStatus() {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchIntegrationsStatus()
            .then((data) => { if (!cancelled) setStatus(data); })
            .catch(() => { if (!cancelled) setError(true); });
        return () => { cancelled = true; };
    }, []);

    return { status, error };
}

/**
 * Overall projection state. Anything other than a file with the expected
 * schema that says MEASURED is UNMEASURED - there is no third word.
 *
 * @param {object|null} status Parsed integrations-status.json.
 * @returns {'MEASURED'|'UNMEASURED'} The state.
 */
export function integrationsStateOf(status) {
    return status?.schema === INTEGRATIONS_STATUS_SCHEMA
        && status?.state === 'MEASURED'
        && status?.channels && typeof status.channels === 'object'
        ? 'MEASURED'
        : 'UNMEASURED';
}

/**
 * Whether the projection is older than STALE_AFTER_MS. An unparseable or
 * missing timestamp is not "stale" - it is unknown, and the caller already
 * renders unknown as UNMEASURED.
 *
 * @param {object|null} status Parsed integrations-status.json.
 * @param {number} [now] Clock override for tests.
 * @returns {boolean} True when generated_at is older than the stale window.
 */
export function isIntegrationsStale(status, now = Date.now()) {
    const generated = status?.generated_at ? new Date(status.generated_at) : null;
    if (!generated || Number.isNaN(generated.getTime())) return false;
    return now - generated.getTime() > STALE_AFTER_MS;
}

/**
 * One channel block, or null when the projection does not measure it.
 *
 * @param {object|null} status Parsed integrations-status.json.
 * @param {string} key wiki | forum | discord | reddit.
 * @returns {object|null} The channel block when MEASURED, else null.
 */
export function channelOf(status, key) {
    if (integrationsStateOf(status) !== 'MEASURED') return null;
    const block = status.channels[key];
    return block && block.state === 'MEASURED' ? block : null;
}

/**
 * Public-safe failure tutorials, or null when that section is UNMEASURED.
 *
 * @param {object|null} status Parsed integrations-status.json.
 * @returns {object[]|null} Tutorials when measured, else null.
 */
export function tutorialsOf(status) {
    if (status?.schema !== INTEGRATIONS_STATUS_SCHEMA) return null;
    if (status?.sections?.tutorials?.state !== 'MEASURED') return null;
    return Array.isArray(status.tutorials) ? status.tutorials : null;
}
