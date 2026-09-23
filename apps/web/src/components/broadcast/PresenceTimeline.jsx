// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/broadcast/PresenceTimeline.jsx
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
// Intent:      Chart people present per hour of a class, with every value reachable by hover, keyboard or table.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

const hourLabel = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** One series (people), so the heading names it and there is no legend. */
export default function PresenceTimeline({ hours }) {
    const [focus, setFocus] = useState(-1);
    const [table, setTable] = useState(false);
    const most = Math.max(0, ...hours.map((hour) => hour.people));
    const peak = Math.max(1, most);
    const tick = Math.max(1, Math.ceil(hours.length / 6));
    return <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">People present per hour · peak {most}</p>
            <button type="button" aria-pressed={table} onClick={() => setTable(!table)} className="text-xs font-semibold underline underline-offset-4">{table ? 'Show chart' : 'Show table'}</button>
        </div>
        {table
            ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th scope="col" className="py-1.5 pr-4 font-normal">Hour</th><th scope="col" className="py-1.5 text-right font-normal">People</th></tr></thead>
                <tbody>{hours.map((hour) => <tr key={hour.t} className="border-b last:border-0"><th scope="row" className="py-1.5 pr-4 font-normal">{hourLabel(hour.t)}</th><td className="py-1.5 text-right tabular-nums">{hour.people}</td></tr>)}</tbody></table></div>
            : <div className="relative" onPointerLeave={() => setFocus(-1)}>
                <div className="grid h-24 auto-cols-fr grid-flow-col items-end gap-0.5 border-b border-border">
                    {hours.map((hour, index) => <button key={hour.t} type="button" aria-label={`${hourLabel(hour.t)}: ${hour.people} people`}
                        onPointerEnter={() => setFocus(index)} onFocus={() => setFocus(index)} onBlur={() => setFocus(-1)}
                        className={cn('flex h-full items-end justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring', focus === index && 'bg-foreground/5')}>
                        {hour.people
                            ? <span className="block w-full max-w-6 rounded-t bg-chart-human" style={{ height: `${Math.max(3, (hour.people / peak) * 100)}%` }} />
                            : <span className="block w-3/5 border-t border-dashed border-muted-foreground" />}
                    </button>)}
                </div>
                <div className="mt-1 grid auto-cols-fr grid-flow-col gap-0.5" aria-hidden="true">
                    {hours.map((hour, index) => <span key={hour.t} className="font-evidence text-[10px] text-muted-foreground">{index % tick === 0 ? hourLabel(hour.t) : ''}</span>)}
                </div>
                {focus >= 0 && <div role="status" className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full border border-foreground bg-popover px-2.5 py-1.5 text-xs">
                    <strong className="text-sm">{hours[focus].people}</strong> <span className="text-muted-foreground">people · {hourLabel(hours[focus].t)}</span>
                </div>}
            </div>}
    </div>;
}
