// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/roadmapStatus.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001, SRS-BUILDANDDO-SIGNALS-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/public/roadmap-status.json
// EnumType:    Lib
// EnumEdges:   CONSUMES apps/web/public/roadmap-status.json;
//              CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx;
//              CONSUMED_BY apps/web/src/components/site/Header.jsx
// Intent:      One fetch for the sprint projection so every surface that
//              quotes it (roadmap page, header status chip) reads the same
//              file the same way and fails soft the same way.
// ───────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

export const ROADMAP_STATUS_URL = '/roadmap-status.json';

/**
 * Fetches the sprint projection. Rejects on any non-2xx or network error so
 * callers decide what "unknown" looks like on their surface.
 *
 * @returns {Promise<object>} Parsed roadmap-status.json.
 */
export function fetchRoadmapStatus() {
    return fetch(ROADMAP_STATUS_URL, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))));
}

/**
 * Reads the projection once on mount.
 *
 * @returns {{status: object|null, error: boolean}} `status` is null until the
 *          fetch resolves; `error` is true when it failed (and stays null).
 */
export function useRoadmapStatus() {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetchRoadmapStatus()
            .then((data) => { if (!cancelled) setStatus(data); })
            .catch(() => { if (!cancelled) setError(true); });
        return () => { cancelled = true; };
    }, []);

    return { status, error };
}

/**
 * Signals state as the header chip reports it. Anything other than a
 * projection that says MEASURED is UNMEASURED - there is no third word.
 *
 * @param {object|null} status Parsed roadmap-status.json.
 * @returns {'MEASURED'|'UNMEASURED'} The state.
 */
export function signalsStateOf(status) {
    return status?.signals_state === 'MEASURED' && status?.signals ? 'MEASURED' : 'UNMEASURED';
}
