// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/observability/RouteTelemetry.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-RUM-002
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/observability/runtime.js
// EnumType:    Widget
// EnumEdges:   CONSUMES react-router-dom; PRODUCES datadog.rum.action
// Intent:      Report client-side route transitions, per-route dwell time and
//              route render settle time from inside the router.
// ───────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { trackRouteChange, trackRouteRender } from '@/lib/observability/runtime';

const RouteTelemetry = () => {
    const { pathname, search } = useLocation();
    const previousRoute = useRef(null);
    const enteredAt = useRef(performance.now());

    useEffect(() => {
        const changedAt = performance.now();
        const from = previousRoute.current;

        trackRouteChange({
            from,
            to: pathname,
            dwellMs: from === null ? null : changedAt - enteredAt.current,
            search,
        });

        previousRoute.current = pathname;
        enteredAt.current = changedAt;

        // Two frames: the first is scheduled before the new route's paint, the
        // second runs after it, which is the earliest honest "settled" point.
        let secondFrame = 0;
        const firstFrame = requestAnimationFrame(() => {
            secondFrame = requestAnimationFrame(() => {
                trackRouteRender(pathname, performance.now() - changedAt);
            });
        });

        return () => {
            cancelAnimationFrame(firstFrame);
            if (secondFrame) cancelAnimationFrame(secondFrame);
        };
    }, [pathname, search]);

    return null;
}

export default RouteTelemetry;

export { RouteTelemetry };
