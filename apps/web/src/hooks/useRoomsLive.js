// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useRoomsLive.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        pending
// CK:          pending
// Dispatch:    OPERATOR-PLANE-UNLOCK-001
// Seat:        rig1-release
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     /room-projections/utilization.json (runtime file published by tools/citadel_buildanddo_rooms.py)
// EnumType:    Hook
// EnumEdges:   CONSUMES /room-projections/utilization.json
// DAG Node:    none
// Intent:      Say "live" only when a room projection is measured and fresh; a missing or stale file means not live.
// ───────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

const FRESH_MS = 48 * 60 * 60 * 1000;

/**
 * Whether the Living Rooms projections are live: the smallest projection
 * (`utilization`) is served, reports `state: MEASURED`, and was generated within
 * the freshness window. Any failure resolves to `false` — never an inferred yes.
 */
export function useRoomsLive() {
    const [live, setLive] = useState(false);
    useEffect(() => {
        let alive = true;
        fetch('/room-projections/utilization.json', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((p) => {
                if (!alive || !p || p.state !== 'MEASURED') return;
                const age = Date.now() - Date.parse(p.generated_at || '');
                setLive(Number.isFinite(age) && age >= 0 && age < FRESH_MS);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, []);
    return live;
}
