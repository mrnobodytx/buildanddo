// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/ClassRecord.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/broadcast/StatTile.jsx, apps/web/src/components/broadcast/PresenceTimeline.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/broadcast/StatTile.jsx; CONSUMES apps/web/src/components/broadcast/PresenceTimeline.jsx
// DAG Node:    none
// Intent:      Give a class host the aggregate record of who came and when, as counts only.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { Card } from '@/components/site/ui';
import StatTile from '@/components/broadcast/StatTile';
import PresenceTimeline from '@/components/broadcast/PresenceTimeline';

/**
 * Host-only. Reads the aggregate class record when the room changes state and
 * shows totals and people per hour; identities stay in the attendance list.
 * @param {{room: object, readRecord: () => Promise<object>}} props
 */
export default function ClassRecord({ room, readRecord }) {
    const [state, setState] = useState({ loading: true, data: null, error: '' });
    useEffect(() => {
        let alive = true;
        setState((old) => ({ ...old, loading: true }));
        readRecord().then((result) => {
            if (!alive || result.reason === 'scope_changed') return;
            setState({ loading: false, data: result.ok ? result.data : null, error: result.ok ? '' : result.error || 'The class record is unavailable.' });
        });
        return () => { alive = false; };
    }, [readRecord, room.id, room.status, room.revision]);
    const data = state.data;
    const peak = data?.hours?.length ? Math.max(...data.hours.map((hour) => hour.people)) : null;
    return <Card className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Activity className="h-5 w-5" aria-hidden="true" />Class record</h2>
        {state.loading && !data && <p role="status" className="text-sm text-muted-foreground">Loading the class record…</p>}
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
        {data && !data.installed && <p className="text-sm text-muted-foreground">Attendance history is not installed on this server yet, so this class has no record. The live attendance list still works.</p>}
        {data?.installed && !data.started_at && <p className="text-sm text-muted-foreground">The record starts when you start the lesson session.</p>}
        {data?.installed && data.started_at && <>
            <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3">
                <StatTile label="People who attended" value={data.attendees} />
                <StatTile label="Minutes attended, all people" value={data.minutes} unit="min" />
                <StatTile label="Most present at once" value={peak} note="In any one hour" />
            </div>
            {data.hours.length > 0 && <PresenceTimeline hours={data.hours} />}
            {data.truncated && <p className="text-xs text-muted-foreground">This class has more attendance events than the record reads; totals cover the earliest 5,000.</p>}
            <p className="text-xs text-muted-foreground">Counts only. Visible to this class&apos;s host and workspace administrators.</p>
        </>}
    </Card>;
}
