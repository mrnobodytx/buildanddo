// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/roadmap/MilestoneDetailCard.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/components/site/ui.jsx,
//              apps/web/src/components/roadmap/milestoneA11y.js
// EnumType:    Widget
// EnumEdges:   CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx
// Intent:      The persistent readout beside the chart. Shows the pinned (or
//              previewed) milestone with every provenance field, says Unknown
//              where the projection said nothing, and jumps to the ledger.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { ArrowDown, Pin, X } from 'lucide-react';
import { Card, StatePill } from '@/components/site/ui';
import { ledgerId } from '@/components/roadmap/milestoneA11y';

/**
 * @param {object} props
 * @param {object|null} props.milestone The milestone to show, or null.
 * @param {'pinned'|'preview'|null} props.mode How the milestone was chosen.
 * @param {string} props.stateSource Where milestone states came from
 *        (roadmap-status.json `milestone_state_source`), or "Unknown".
 * @param {() => void} props.onUnpin Clears the pin.
 * @param {(day:number) => void} props.onJump Called with the day when the
 *        reader jumps to the ledger entry.
 */
export default function MilestoneDetailCard({ milestone, mode, stateSource, onUnpin, onJump }) {
    if (!milestone) {
        return (
            <Card className="p-4" data-testid="milestone-detail-empty">
                <p className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    Milestone detail
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    No milestone pinned. Click or tap a marker on the chart, or focus one
                    and press Enter, to pin it here. Arrow keys move between markers.
                </p>
            </Card>
        );
    }

    const evidence = milestone.evidence ? milestone.evidence : 'Unknown';
    const verifiedAt = milestone.verifiedAt ? milestone.verifiedAt : 'Unknown';

    return (
        <Card
            className="p-4"
            data-testid="milestone-detail"
            aria-live="polite"
            aria-label={`Milestone detail, day ${milestone.day}`}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-evidence text-[11px] uppercase tracking-[0.14em] text-primary">
                    {mode === 'pinned' ? <Pin className="h-3 w-3" /> : null}
                    Day {milestone.day} · {mode === 'pinned' ? 'pinned' : 'preview'}
                </span>
                {mode === 'pinned' && (
                    <button
                        type="button"
                        onClick={onUnpin}
                        className="inline-flex h-8 items-center gap-1 border border-border px-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
                        aria-label="Unpin milestone"
                    >
                        <X className="h-3 w-3" /> Unpin
                    </button>
                )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="font-display text-lg font-semibold">{milestone.title}</span>
                <StatePill state={milestone.status} />
                <span className="font-evidence text-[11px] text-muted-foreground">
                    planned completion {milestone.value}%
                </span>
            </div>
            {milestone.description && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{milestone.description}</p>
            )}
            {milestone.deliverables?.length > 0 && (
                <ul className="mt-3 space-y-1.5" aria-label="Planned deliverables">
                    {milestone.deliverables.map((d) => (
                        <li key={d} className="flex gap-2 text-sm text-foreground/90">
                            <span className="text-primary">·</span>
                            <span>{d}</span>
                        </li>
                    ))}
                </ul>
            )}
            <dl className="mt-4 grid gap-x-6 gap-y-1 border-t border-border pt-3 font-evidence text-[11px] text-muted-foreground sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                    <dt className="uppercase tracking-[0.14em]">Evidence</dt>
                    <dd className="truncate text-right text-foreground/90" title={evidence}>{evidence}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="uppercase tracking-[0.14em]">Verified at</dt>
                    <dd className="text-right text-foreground/90">{verifiedAt}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="uppercase tracking-[0.14em]">Status source</dt>
                    <dd className="text-right text-foreground/90">{stateSource || 'Unknown'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="uppercase tracking-[0.14em]">Plan source</dt>
                    <dd className="text-right text-foreground/90">scripts/ci/sprint_cycle.py</dd>
                </div>
            </dl>
            <a
                href={`#${ledgerId(milestone.day)}`}
                onClick={() => onJump(milestone.day)}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
            >
                Jump to ledger entry <ArrowDown className="h-4 w-4" />
            </a>
        </Card>
    );
}
