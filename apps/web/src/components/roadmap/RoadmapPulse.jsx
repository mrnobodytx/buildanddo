// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/roadmap/RoadmapPulse.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/lib/roadmapStatus.js, apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/roadmapStatus.js (useRoadmapStatus, progressionOf);
//              CONSUMED_BY apps/web/src/pages/HomePage.jsx
// Intent:      A compact roadmap pulse for anonymous visitors on the front
//              page: day label, measured progression, pace and the next hard
//              milestone, quoted from the same projection /roadmap reads.
//              Says UNMEASURED when there is nothing to quote.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Activity } from 'lucide-react';
import { Section, SectionLabel, Card, Badge } from '@/components/site/ui';
import { useRoadmapStatus, progressionOf, dayLabel } from '@/lib/roadmapStatus';

const STATE_TONE = { MEASURED: 'green', STALE: 'amber', UNMEASURED: 'neutral' };

function Stat({ label, value, testId }) {
    return (
        <div className="min-w-0">
            <p className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
            <p className="mt-1 truncate font-display text-xl font-bold tracking-tight" data-testid={testId}>{value}</p>
        </div>
    );
}

/**
 * Reads the projection through the shared hook and renders the pulse.
 */
export default function RoadmapPulse() {
    const { status, error } = useRoadmapStatus();
    return <RoadmapPulseView status={status} fetchFailed={error} />;
}

/**
 * @param {object} props
 * @param {object|null} props.status Parsed roadmap-status.json, or null.
 * @param {boolean} [props.fetchFailed] True when the status file could not be fetched.
 */
export function RoadmapPulseView({ status, fetchFailed = false }) {
    const p = progressionOf(status);
    const measured = p.state !== 'UNMEASURED';
    const next = p.nextHardMilestone;

    return (
        <Section id="roadmap-pulse" className="border-t border-foreground/80 py-8 sm:py-10">
            <div
                data-testid="roadmap-pulse"
                data-state={p.state}
                className="flex flex-wrap items-end justify-between gap-4"
            >
                <div>
                    <SectionLabel icon={Activity}>Roadmap pulse</SectionLabel>
                    <h2 className="mt-2 font-display text-xl font-bold tracking-tight sm:text-2xl">
                        The 21-day sprint, as measured.
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <Badge tone={STATE_TONE[p.state] || 'neutral'}>{p.state}</Badge>
                    <Link
                        to="/roadmap#progression"
                        className="inline-flex min-h-[36px] items-center gap-1 border border-border px-3 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
                    >
                        Full roadmap <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                </div>
            </div>
            <Card className="mt-4 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Sprint day" value={dayLabel(p.day, p.totalDays)} testId="pulse-day" />
                <Stat label="Measured progression" value={measured && typeof p.measuredPct === 'number' ? `${p.measuredPct}%` : 'Unknown'} testId="pulse-measured" />
                <Stat label="Pace" value={measured && p.pace ? p.pace.replace(/_/g, ' ') : 'Unknown'} testId="pulse-pace" />
                <Stat
                    label="Next hard milestone"
                    value={measured && next?.title ? `${next.title}${typeof next.daysUntil === 'number' ? ` · ${next.daysUntil}d` : ''}` : 'Unknown'}
                    testId="pulse-next"
                />
            </Card>
            <p className="mt-3 font-evidence text-[11px] leading-relaxed text-muted-foreground" data-testid="pulse-note">
                {measured
                    ? `Verified acceptance criteria to date, quoted from the estate's development-continuity projection${p.state === 'STALE' ? ' (stale - labelled, not re-derived)' : ''}. Measured progression, not the plan and not milestone evidence.`
                    : fetchFailed
                        ? 'Live status unavailable. Unknown is not zero.'
                        : `No measured progression to quote (${p.reason}). Unknown is not zero.`}
            </p>
        </Section>
    );
}
