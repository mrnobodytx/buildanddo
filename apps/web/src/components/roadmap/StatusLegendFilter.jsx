// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/roadmap/StatusLegendFilter.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx
// Intent:      The status legend doubles as a multi-select filter on the
//              ledger. Each chip is a toggle button (aria-pressed); Clear
//              resets; the count next to each status is measured from the
//              milestones passed in, never typed by hand.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { StatePill } from '@/components/site/ui';
import { cn } from '@/lib/utils';

/**
 * @param {object} props
 * @param {string[]} props.statuses Every status in ladder order.
 * @param {Set<string>} props.selected Statuses currently selected.
 * @param {Record<string, number>} props.counts Milestones per status.
 * @param {(status:string) => void} props.onToggle Toggle one status.
 * @param {() => void} props.onClear Clear the selection.
 */
export default function StatusLegendFilter({ statuses, selected, counts, onToggle, onClear }) {
    const any = selected.size > 0;
    return (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter ledger by status">
            {statuses.map((s) => {
                const on = selected.has(s);
                return (
                    <button
                        key={s}
                        type="button"
                        onClick={() => onToggle(s)}
                        aria-pressed={on}
                        data-testid={`status-filter-${s}`}
                        className={cn(
                            'inline-flex min-h-[44px] items-center gap-1.5 px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]',
                            on ? 'opacity-100' : any ? 'opacity-50 hover:opacity-90' : 'opacity-100 hover:opacity-80',
                        )}
                    >
                        <StatePill state={s} className={on ? 'ring-1 ring-primary' : undefined} />
                        <span className="font-evidence text-[11px] text-muted-foreground">{counts[s] || 0}</span>
                    </button>
                );
            })}
            <button
                type="button"
                onClick={onClear}
                disabled={!any}
                className="inline-flex min-h-[44px] items-center px-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
            >
                Clear
            </button>
        </div>
    );
}
