// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/PreviousWorkNote.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/workHistory.js, apps/web/src/components/workspace/workspaceHelpers.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/workHistory.js; VERIFIED_BY apps/web/src/pages/workspace/MissionsPage.jsx
// Intent:      Warn a seat that someone already worked this, before it spends effort rediscovering it.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { History } from 'lucide-react';
import { StatusBadge, WORK_STATE } from '@/components/workspace/workspaceHelpers';

function timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

/**
 * Renders what has already been recorded against one subject.
 *
 * Returns null when there is no history — an absent panel says "nothing
 * recorded" more honestly than a panel announcing emptiness on every row.
 *
 * @param {object} props Component props.
 * @param {object} [props.history] A summary from `lookupPreviousWork` or `lookupPreviousWorkBatch`.
 * @returns {(JSX.Element|null)} The panel, or null when there is nothing to show.
 */
export default function PreviousWorkNote({ history }) {
    if (!history?.hasHistory) return null;

    return (
        <div className="mt-4 border-t border-border/60 pt-3">
            <div className="flex flex-wrap items-center gap-2">
                <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Previous work
                </span>
                <StatusBadge map={WORK_STATE} value={history.state} />
            </div>

            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {history.seats.map((seat) => (
                    <li key={seat.seat} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-evidence text-foreground">{seat.seat}</span>
                        <span>({seat.actorType})</span>
                        <span>
                            {seat.lastEvent} · {timeAgo(seat.lastAt)} ·{' '}
                            {seat.eventCount} event{seat.eventCount === 1 ? '' : 's'}
                        </span>
                    </li>
                ))}
            </ul>

            {history.seats[0]?.lastSummary && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Latest: {history.seats[0].lastSummary}
                </p>
            )}

            {history.prLinks.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                    {history.prLinks.map((url) => (
                        <li key={url}>
                            <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-evidence text-muted-foreground underline-offset-4 hover:underline"
                            >
                                {url}
                            </a>
                        </li>
                    ))}
                </ul>
            )}

            {history.evidence.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                    {history.evidence.length} evidence record
                    {history.evidence.length === 1 ? '' : 's'} already attached — read the
                    Evidence Ledger before repeating the work.
                </p>
            )}
        </div>
    );
}

export { PreviousWorkNote };
