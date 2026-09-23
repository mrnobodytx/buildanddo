// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/SignalMeter.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/utils.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/utils.js
// DAG Node:    none
// Intent:      State the measured receive state of a live classroom in words, bars and packet counts.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { cn } from '@/lib/utils';

// Every state carries a word; the bars never carry meaning alone.
const STATES = {
    unmeasured: { bars: 0, label: 'Unmeasured', tone: 'muted' },
    measuring: { bars: 1, label: 'Measuring', tone: 'caution' },
    silent: { bars: 1, label: 'Connected · no frames', tone: 'caution' },
    receiving: { bars: 4, label: 'Receiving', tone: 'ok' },
    broadcasting: { bars: 4, label: 'Broadcasting', tone: 'ok' },
    interrupted: { bars: 0, label: 'Connection interrupted', tone: 'live' },
};
const ON = { ok: 'bg-stage-speaking', caution: 'bg-stage-caution', muted: 'bg-stage-border', live: 'bg-stage-border' };

/** @param {{state: keyof STATES, packets?: number, className?: string}} props */
export default function SignalMeter({ state, packets, className }) {
    const s = STATES[state] || STATES.unmeasured;
    return <span role="status" className={cn('inline-flex items-center gap-2 bg-stage/70 px-2.5 py-1 text-xs font-semibold text-stage-foreground', className)}>
        <span aria-hidden="true" className="inline-flex h-4 items-end gap-0.5">
            {[1, 2, 3, 4].map((i) => <span key={i} className={cn('w-[3px]', i <= s.bars ? ON[s.tone] : 'bg-stage-border')} style={{ height: `${4 + i * 3}px` }} />)}
        </span>
        <span className={s.tone === 'live' ? 'text-stage-live' : undefined}>{s.label}</span>
        {typeof packets === 'number' && <span className="font-evidence font-normal text-stage-muted">{packets.toLocaleString()} packets</span>}
    </span>;
}
