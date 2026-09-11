// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useRoomProjection.js
// Stage:       09_RUNTIME
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     services/buildanddo_visual_substrate/server.py (via /api/rooms)
// EnumType:    Hook
// EnumEdges:   CONSUMES /api/rooms/projection/{kind};
//              VERIFIED_BY apps/web/src/hooks/__tests__/useRoomProjection.test.js
// Intent:      Read one live, cleansed room projection from the same-origin rooms
//              sidecar and surface every denial as an honest reason. There is no
//              fallback to sample JSON: absence renders as absence.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';

// Reasons the upstream returns when a room simply is not published for this
// tenant yet. They are 403s, not failures: the key was believed and refused.
export const NOT_PUBLISHED_REASONS = new Set(['projection_not_implemented', 'projection_not_granted']);

const INITIAL = { loading: true, available: false, projection: null, reason: null, status: null };

async function readReason(response) {
    try {
        const body = await response.json();
        if (body && typeof body.detail === 'string' && body.detail) return body.detail;
    } catch {
        // non-JSON body: fall through to the status-derived reason
    }
    return `http_${response.status}`;
}

export function useRoomProjection(kind) {
    const [state, setState] = useState(INITIAL);
    const [refreshKey, setRefreshKey] = useState(0);
    const refresh = useCallback(() => setRefreshKey((v) => v + 1), []);

    useEffect(() => {
        let live = true;
        setState(INITIAL);
        if (!kind) {
            setState({ ...INITIAL, loading: false, reason: 'no_room_selected' });
            return undefined;
        }
        fetch(`/api/rooms/projection/${encodeURIComponent(kind)}`, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        }).then(async (response) => {
            if (response.status !== 200) {
                const reason = await readReason(response);
                return { loading: false, available: false, projection: null, reason, status: response.status };
            }
            const projection = await response.json();
            return { loading: false, available: true, projection, reason: null, status: 200 };
        }).catch(() => ({ loading: false, available: false, projection: null, reason: 'network_error', status: null }))
          .then((next) => { if (live) setState(next); });
        return () => { live = false; };
    }, [kind, refreshKey]);

    return { ...state, refresh };
}

export function isNotPublished(state) {
    return state.status === 403 && NOT_PUBLISHED_REASONS.has(state.reason);
}
