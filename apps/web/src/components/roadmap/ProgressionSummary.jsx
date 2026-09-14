// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/roadmap/ProgressionSummary.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/lib/roadmapStatus.js (progressionOf output),
//              apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/roadmapStatus.js (progressionOf);
//              CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx
// Intent:      Orient a first-time visitor in one glance WITHOUT asserting a
//              reconciliation the data does not have. The day is live and
//              carries its source; the measured axes are shown separately and
//              each dated to the day they were computed for, so a live day-14
//              headline never implies the day-11 plan target or the day-9
//              measurement is "now". Freshness is the read-time gap, not the
//              file's frozen stale_days. Nothing here is averaged.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Gauge } from 'lucide-react';
import { Card, Badge } from '@/components/site/ui';
import { dayLabel } from '@/lib/roadmapStatus';

const STATE_TONE = { MEASURED: 'green', STALE: 'amber', UNMEASURED: 'neutral' };

const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${v}%` : '—');
const dayOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * One measured axis, shown as its own tile. The `asOf` caption dates the value
 * to the day it describes, so no tile borrows currency from the live headline.
 */
function Axis({ label, value, asOf, emphasis = false }) {
    return (
        <div className="flex flex-col gap-1 p-4">
            <span className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
            <span className={emphasis ? 'font-display text-3xl font-bold tracking-tight' : 'font-display text-2xl font-semibold tracking-tight'}>
                {value}
            </span>
            {asOf && <span className="font-evidence text-[11px] text-muted-foreground">{asOf}</span>}
        </div>
    );
}

/**
 * @param {object} props
 * @param {object} props.progression Output of progressionOf().
 * @param {boolean} [props.fetchFailed] True when roadmap-status.json could not be fetched.
 */
export default function ProgressionSummary({ progression: p, fetchFailed = false }) {
    const measured = p.state !== 'UNMEASURED';
    const tone = STATE_TONE[p.state] || 'neutral';
    const planDay = dayOrNull(p.planDay);
    const projectionDay = dayOrNull(p.projectionDay);
    const staleDays = dayOrNull(p.staleDays);
    const daysAgo = staleDays && staleDays > 0 ? `${staleDays} day${staleDays === 1 ? '' : 's'} ago` : null;

    // The source of the live day, stated as provenance — never as doubt. The
    // day agrees with the operator anchor; we say which rule produced it.
    const daySourceLabel = p.daySource === 'anchor-rule'
        ? 'operator anchor rule'
        : p.daySource === 'calendar'
            ? 'calendar fallback'
            : 'source unknown';
    const anchorNote = p.dayAnchor && dayOrNull(p.dayAnchor.anchorDay) !== null && p.dayAnchor.anchorDate
        ? `day ${p.dayAnchor.anchorDay} anchored to ${p.dayAnchor.anchorDate}`
        : null;

    // The measured axes describe an earlier day than the live headline. Say so
    // once, plainly, rather than letting the numbers imply they are current.
    const asOfMeasured = projectionDay !== null
        ? `as of day ${projectionDay}${daysAgo ? ` · ${daysAgo}` : ''}`
        : (daysAgo ? `measured ${daysAgo}` : null);
    const asOfPlan = planDay !== null ? `plan curve at day ${planDay}` : null;

    return (
        <section
            id="progression-summary"
            aria-labelledby="progression-summary-heading"
            data-testid="progression-summary"
            data-state={p.state}
            className="scroll-mt-24"
        >
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <span className="font-evidence inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <Gauge className="h-4 w-4" aria-hidden="true" /> At a glance
                    </span>
                    <h2 id="progression-summary-heading" className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        Where the campaign is, without rounding it into one number.
                    </h2>
                </div>
                <span data-testid="progression-summary-state">
                    <Badge tone={tone}>
                        {p.state}
                        {p.state === 'STALE' && daysAgo ? ` · measured ${daysAgo}` : ''}
                    </Badge>
                </span>
            </div>

            <Card className="mt-6 p-0">
                {/* The live day — its own row, carrying its source, never dated to the stale numbers below. */}
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-border p-5" data-testid="progression-summary-day">
                    <div className="flex items-baseline gap-3">
                        <span className="font-display text-4xl font-bold tracking-tight sm:text-5xl" data-testid="progression-summary-day-value">
                            {dayLabel(p.day, p.totalDays)}
                        </span>
                        <span className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                            counted live
                        </span>
                    </div>
                    <div className="flex flex-col items-start gap-0.5 sm:items-end">
                        <span className="font-evidence text-[11px] uppercase tracking-[0.14em] text-foreground/80" data-testid="progression-summary-day-source">
                            {daySourceLabel}
                        </span>
                        {anchorNote && <span className="font-evidence text-[11px] text-muted-foreground">{anchorNote}</span>}
                    </div>
                </div>

                {measured ? (
                    <>
                        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                            <Axis label="Measured progression" value={pct(p.measuredPct)} asOf={asOfMeasured} emphasis />
                            <Axis label="Verified · evidence" value={pct(p.verifiedPct)} asOf={asOfMeasured} />
                            <Axis label="Plan target" value={pct(p.plannedPct)} asOf={asOfPlan} />
                        </div>
                        <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground" data-testid="progression-summary-note">
                            {p.state === 'STALE'
                                ? `These are the last measured projection${daysAgo ? `, computed ${daysAgo}` : ''} — not recomputed for the live day. Each axis is dated; they are not averaged, and the plan target is the curve at day ${planDay ?? '—'}, not the day above.`
                                : 'Measured, verified and plan are separate axes here — deliberately not combined into one score. The plan target is a plan, not a result.'}
                        </p>
                    </>
                ) : (
                    <p className="p-5 text-sm leading-relaxed text-muted-foreground" data-testid="progression-summary-unmeasured">
                        {fetchFailed
                            ? 'The status file could not be fetched, so there is no current measurement to show — the day above is still counted live from the operator anchor.'
                            : 'No current measurement — the estate projection could not be read. The day above is counted live from the operator anchor; the numbers are Unknown until the projection is regenerated.'}
                    </p>
                )}

                {p.nextHardMilestone && p.nextHardMilestone.title && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border px-5 py-3 text-sm" data-testid="progression-summary-next">
                        <span className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Next hard milestone</span>
                        <span className="text-foreground/90">{p.nextHardMilestone.title}</span>
                        {p.nextHardMilestone.date && <span className="text-muted-foreground">· {p.nextHardMilestone.date}</span>}
                        {typeof p.nextHardMilestone.daysUntil === 'number' && !p.nextHardMilestone.past && (
                            <span className="font-evidence text-[11px] uppercase tracking-[0.14em] text-amber-warm">
                                · in {p.nextHardMilestone.daysUntil} day{p.nextHardMilestone.daysUntil === 1 ? '' : 's'}
                            </span>
                        )}
                        {p.nextHardMilestone.past && <span className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">· past</span>}
                    </div>
                )}
            </Card>
        </section>
    );
}
