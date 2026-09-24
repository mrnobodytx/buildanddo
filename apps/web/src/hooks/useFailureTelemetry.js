// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/hooks/useFailureTelemetry.js
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
// Intent:      Observe a rendered failure transition once without sending notice text or repeating events on unrelated renders.
// ----------------------------------------------------------------

import { useEffect, useRef } from 'react';
import { readFailed } from '@/lib/observability/runtime';
import { telemetrySection } from '@/lib/navigationIntent';

/** @param {boolean} active Whether this view is failing. @param {string} source Closed source. @param {string} [reason] Closed reason. @param {number} [status] Observed status. @param {string} [section] Explicit route. @returns {void} */
export function useFailureTelemetry(active, source, reason = 'unavailable', status, section) {
    const emitted = useRef('');
    const route = telemetrySection(section || globalThis.window?.location?.pathname);
    useEffect(() => {
        if (!active) { emitted.current = ''; return; }
        const key = JSON.stringify([route, source, reason, status]);
        if (emitted.current === key) return;
        emitted.current = key;
        readFailed(route, source, reason, status);
    }, [active, route, source, reason, status]);
}
