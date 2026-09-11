// CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/roadmap/ProgressionPanel.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/lib/roadmapStatus.js, apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/roadmapStatus.js (progressionOf);
//              CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx
// Intent:      Render the estate's canonical progression as separate rows -
//              day, calendar, plan, measured, milestone evidence, full
//              campaign, pace, counts, source, observed, freshness, contract
//              - never averaged, and say UNMEASURED when there is nothing.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Activity } from 'lucide-react';
import { SectionLabel, Card, Badge, ProvenanceTag } from '@/components/site/ui';
import { dayLabel } from '@/lib/roadmapStatus';
import { timeAgo } from '@/components/roadmap/LiveSourcesPanel';

const STATE_TONE = { MEASURED: 'green', STALE: 'amber', UNMEASURED: 'neutral' };

const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${v}%` : 'Unknown');
const count = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : 'Unknown');

function Row({ label, testId, children, note }) {
    return (
        <div className="grid gap-1 p-4 sm:grid-cols-12 sm:gap-4" data-testid={testId}>
            <dt className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground sm:col-span-4 lg:col-span-3">
                {label}
            </dt>
            <dd className="m-0 sm:col-span-8 lg:col-span-9">
                <div className="text-sm text-foreground/90">{children}</div>
                {note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>}
            </dd>
        </div>
    );
}

/**
 * @param {object} props
 * @param {object} props.progression Output of progressionOf().
 * @param {boolean} [props.fetchFailed] True when roadmap-status.json could not be fetched.
 */
export default function ProgressionPanel({ progression: p, fetchFailed = false }) {
    const measured = p.state !== 'UNMEASURED';
    const tone = STATE_TONE[p.state] || 'neutral';
    const anchor = p.dayAnchor;
    const anchorDiffers = anchor?.anchorRuleDay !== null && anchor?.anchorRuleDay !== undefined && p.day !== null && anchor.anchorRuleDay !== p.day;

    return (
        <section
            id="progression"
            aria-labelledby="progression-heading"
            data-testid="progression-panel"
            data-state={p.state}
            className="scroll-mt-24"
        >
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <SectionLabel icon={Activity}>Progression · consumed, not computed here</SectionLabel>
                    <h2 id="progression-heading" className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                        Where the campaign actually is.
                    </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone}>{p.state}</Badge>
                    <ProvenanceTag
                        source="development_continuity"
                        timestamp={p.observedAt ? timeAgo(p.observedAt) : 'Unknown'}
                        freshness={p.freshness}
                    />
                </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Each row below is its own axis. The calendar is not the plan, the
                plan is not what was measured, milestone evidence is not measured
                progression, and none of them are averaged into one number.
                {fetchFailed ? ' The status file could not be fetched, so every row is Unknown.' : ''}
            </p>

            <Card className="mt-6 p-0">
                <dl className="m-0 divide-y divide-border">
                    <Row
                        label="Day"
                        testId="progression-day"
                        note={measured
                            ? [
                                p.dayDisagreement ? `Plan clock says day ${p.planDay} (calendar from ${anchor?.planWindowStart || 'window start'}); canonical day ${p.day} wins and the disagreement is flagged.` : null,
                                anchorDiffers ? `The day-index rule applied at build time gives day ${anchor.anchorRuleDay}; the projection was last computed for day ${p.day}.` : null,
                                p.dayIndexRule ? `Rule: ${p.dayIndexRule}` : null,
                            ].filter(Boolean).join(' ')
                            : `Canonical day unknown (${p.reason}). Plan clock day ${p.planDay ?? 'Unknown'} is a calendar count, not a measurement.`}
                    >
                        <span className="font-evidence text-base" data-testid="progression-day-label">{dayLabel(p.day, p.totalDays)}</span>
                        {measured && p.dayDisagreement && (
                            <span className="ml-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-amber-warm" data-testid="progression-day-disagreement">
                                · plan day {p.planDay} ≠ canonical day {p.day}
                            </span>
                        )}
                        {measured && !p.dayDisagreement && p.planDay !== null && (
                            <span className="ml-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                · plan day {p.planDay} agrees
                            </span>
                        )}
                    </Row>
                    <Row label="Calendar elapsed" testId="progression-calendar" note="Share of the window that has passed. Time, not work.">
                        {measured ? pct(p.calendarPct) : 'Unknown'}
                    </Row>
                    <Row
                        label="Plan target"
                        testId="progression-plan"
                        note={`Plan curve read at the ${p.daySource === 'canonical' ? 'canonical' : 'plan-clock'} day. A plan, not a result.`}
                    >
                        {pct(p.plannedPct)}
                    </Row>
                    <Row
                        label="Measured progression"
                        testId="progression-measured"
                        note="Verified acceptance criteria to date, by the estate's rule. The only row that is measured work."
                    >
                        {measured ? pct(p.measuredPct) : 'Unknown'}
                    </Row>
                    <Row
                        label="Verified · milestone evidence"
                        testId="progression-verified"
                        note="Plan milestones recorded with an evidence reference. Evidence against the plan, not measured progression."
                    >
                        {pct(p.verifiedPct)}
                    </Row>
                    <Row label="Full system" testId="progression-full" note="Verified share of the whole campaign, future days included.">
                        {measured ? pct(p.fullPct) : 'Unknown'}
                    </Row>
                    <Row label="Pace" testId="progression-pace">
                        {measured && p.pace ? p.pace.replace(/_/g, ' ') : 'Unknown'}
                    </Row>
                    <Row label="Counts" testId="progression-counts">
                        {measured
                            ? `Criteria to date ${count(p.criteriaToDate)} of ${count(p.criteriaTotal)} · verified to date ${count(p.verifiedToDate)} of ${count(p.verifiedTotal)} · due holds ${count(p.dueHolds)}`
                            : 'Unknown'}
                    </Row>
                    {measured && p.nextHardMilestone && (
                        <Row label="Next hard milestone" testId="progression-next-hard">
                            {p.nextHardMilestone.title || 'Unknown'}
                            {p.nextHardMilestone.date ? ` · ${p.nextHardMilestone.date}` : ''}
                            {typeof p.nextHardMilestone.daysUntil === 'number' ? ` · in ${p.nextHardMilestone.daysUntil} day${p.nextHardMilestone.daysUntil === 1 ? '' : 's'}` : ''}
                            {p.nextHardMilestone.past ? ' · past' : ''}
                        </Row>
                    )}
                    <Row label="Source" testId="progression-source" note={p.sourceTitle ? `Strategy: ${p.sourceTitle}` : null}>
                        {p.owner}
                    </Row>
                    <Row label="Observed" testId="progression-observed">
                        {p.observedAt ? `${p.observedAt.slice(0, 16).replace('T', ' ')} UTC` : 'Unknown'}
                        {p.currentDate ? ` · projection for ${p.currentDate}` : ''}
                    </Row>
                    <Row
                        label="Freshness"
                        testId="progression-freshness"
                        note={p.state === 'STALE' ? 'Numbers above are quoted from a stale projection and labelled as such; they are not re-derived here.' : null}
                    >
                        {p.freshness}
                        {typeof p.staleDays === 'number' && p.staleDays > 0 ? ` · ${p.staleDays} day${p.staleDays === 1 ? '' : 's'} behind the build` : ''}
                    </Row>
                    <Row
                        label="Measurement contract"
                        testId="progression-contract"
                        note="sha256 of the estate's rule texts. When this changes, a moved number is a contract change, not progression."
                    >
                        <span className="font-evidence">{p.contractShort || 'Unknown'}</span>
                        {p.baselineEpoch ? ` · baseline ${p.baselineEpoch.slice(0, 10)}` : ''}
                        {p.contractChanged === true && (
                            <span className="ml-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-amber-warm" data-testid="progression-contract-changed">
                                · contract changed
                            </span>
                        )}
                    </Row>
                </dl>
            </Card>
        </section>
    );
}
