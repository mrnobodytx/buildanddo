// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/hooks/useRoomProjection.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/observability/runtime.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/observability/runtime.js; CONSUMES apps/web/src/lib/navigationIntent.js
// Intent:      Read published room projections without confusing unavailable or malformed responses with an empty room.
// ----------------------------------------------------------------

import { useEffect, useState } from 'react';
import { readFailed } from '@/lib/observability/runtime';
import { telemetrySection } from '@/lib/navigationIntent';

/** @param {string} kind Published room kind. @returns {object} Current projection and existing loading/error state. */
export function useRoomProjection(kind) {
    const [state, setState] = useState({ loading: true, projection: null, error: null });
    useEffect(() => {
        let live = true;
        let status = 0, reason = 'unavailable';
        const pathname = globalThis.window?.location?.pathname;
        const section = telemetrySection(pathname);
        const url = `/room-projections/${kind}.json`;
        fetch(url, { cache: 'no-store' }).then(async (r) => {
            status = r.status;
            if (!r.ok) throw new Error(`projection ${kind}: ${r.status}`);
            reason = 'invalid_response';
            return r.json();
        }).then((projection) => {
            if (!live) return;
            if (!projection || typeof projection !== 'object' || Array.isArray(projection) ||
                projection.projection !== undefined && projection.projection !== kind || projection.state !== 'UNMEASURED' &&
                (kind === 'utilization' ? !Object.hasOwn(projection, 'episode') && projection.projection !== kind || projection.episode != null &&
                    (typeof projection.episode !== 'object' || Array.isArray(projection.episode) ||
                        projection.episode.facts !== undefined && !Array.isArray(projection.episode.facts)) :
                    !Array.isArray(projection.nodes) || !Array.isArray(projection.edges) ||
                        projection.utilization !== undefined && !Array.isArray(projection.utilization)))
                throw new Error('The published projection format is unsupported.');
            if (projection.state === 'UNMEASURED' && pathname === globalThis.window?.location?.pathname)
                readFailed(section, 'room_projection', 'unmeasured', status);
            setState({ loading:false, projection, error:null });
        }).catch((error) => {
            if (!live) return;
            if (error?.name !== 'AbortError' && pathname === globalThis.window?.location?.pathname)
                readFailed(section, 'room_projection', reason, status);
            setState({ loading:false, projection:null, error:String(error) });
        });
        return () => { live = false; };
    }, [kind]);
    return state;
}
