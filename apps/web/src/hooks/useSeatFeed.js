// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useSeatFeed.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/seatComms.js, apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/seatComms.js; CONSUMES seat_events
// Intent:      Keep the activity feed current from realtime without hiding that realtime may be down.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
    connectSeatComms,
    disconnectSeatComms,
    isSeatCommsConnected,
    recentSeatEvents,
    subscribeSeatEvents,
} from '@/lib/seatComms';

/**
 * Live seat activity for the active workspace.
 *
 * Reads the recorded history once, then keeps it current from the realtime
 * subscription. `live` reports whether realtime actually connected — the feed
 * still shows history when it did not, and says so rather than looking stale
 * for no visible reason.
 *
 * @param {{ limit?: number }} [options] Feed options.
 * @returns {{ events: object[], loading: boolean, live: boolean, refresh: () => void }}
 */
export function useSeatFeed({ limit = 20 } = {}) {
    const { active } = useWorkspace();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [live, setLive] = useState(false);

    const load = useCallback(async () => {
        if (!active) {
            setEvents([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setEvents(await recentSeatEvents(active.id, { limit }));
        setLoading(false);
    }, [active, limit]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!active) return undefined;
        let cancelled = false;

        const unsubscribe = subscribeSeatEvents((seatEvent) => {
            setEvents((prev) => {
                if (prev.some((e) => e.id === seatEvent.id)) return prev;
                return [seatEvent, ...prev].slice(0, limit);
            });
        });

        connectSeatComms(active.id).then(() => {
            if (!cancelled) setLive(isSeatCommsConnected());
        });

        return () => {
            cancelled = true;
            unsubscribe();
            setLive(false);
            disconnectSeatComms();
        };
    }, [active, limit]);

    return { events, loading, live, refresh: load };
}

export default useSeatFeed;
