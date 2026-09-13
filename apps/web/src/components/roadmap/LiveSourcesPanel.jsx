// CGRF: SRS=SRS-BUILDANDDO-SIGNALS-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/roadmap/LiveSourcesPanel.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-SIGNALS-001, SRS-BUILDANDDO-ROADMAP-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/components/site/ui.jsx,
//              apps/web/src/lib/publicLinks.js,
//              apps/web/src/lib/telemetry.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/public/roadmap-status.json;
//              CONSUMED_BY apps/web/src/pages/RoadmapPage.jsx
// Intent:      Live sources panel - one tile per connected system. Every tile
//              is a SIGNAL, not a result: activity counts, alert counts, page
//              counts. None of it can mark a milestone verified or the sprint
//              complete. A tile links to its public surface when one exists,
//              and an UNMEASURED tile carries its reason behind a disclosure.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { ExternalLink, Radio } from 'lucide-react';
import { SectionLabel, Card, Badge, ProvenanceTag, Rule } from '@/components/site/ui';
import { publicUrlForSource } from '@/lib/publicLinks';
import { trackEvent } from '@/lib/telemetry';

// PostHog in particular is analytics projection only
// (config/tenants/buildanddo.posthog.json forbids reading it as completion,
// verification or evidence), so its tile is labelled presentation only.
//
// The signals file is written by the controller estate
// (tools/citadel_roadmap_signals.py) and embedded by roadmap_status.py. A
// source the estate could not measure arrives as UNMEASURED with a reason,
// and that is exactly what the tile shows.
export const SIGNAL_SOURCES = [
    { id: 'github', label: 'GitHub', metrics: [['commits_7d', 'commits · 7d'], ['open_prs', 'open PRs'], ['merged_prs', 'merged PRs'], ['bits_branches', 'dd/bits branches']] },
    { id: 'datadog', label: 'Datadog', metrics: [['monitors', 'monitors'], ['alerting', 'alerting'], ['synthetics', 'synthetics'], ['slos', 'SLOs']] },
    { id: 'posthog', label: 'PostHog', presentationOnly: true, metrics: [['events_7d', 'events · 7d'], ['top_events', 'top events'], ['window', 'window']] },
    { id: 'wiki', label: 'Wiki', metrics: [['pages', 'pages'], ['release_pages', 'release pages'], ['last_update', 'last update']] },
    { id: 'discord', label: 'Discord', metrics: [['last_message_id', 'last message'], ['quality_score', 'quality score'], ['bot_runtime', 'bot runtime']] },
    { id: 'reddit', label: 'Reddit', metrics: [['checks_pass', 'checks passing'], ['checks_total', 'checks total'], ['result_code', 'result']] },
    { id: 'forum', label: 'Forum', metrics: [['checks_pass', 'checks passing'], ['checks_total', 'checks total'], ['result_code', 'result']] },
    { id: 'citadel', label: 'Citadel rail', metrics: [['rail_state', 'rail'], ['github_actions', 'actions'], ['incidents_open', 'open incidents'], ['publications_queued', 'queued publications']] },
];

const SIGNAL_TONE = { MEASURED: 'green', DEGRADED: 'amber', UNMEASURED: 'neutral' };

/**
 * @param {string} iso ISO-8601 timestamp.
 * @returns {string} Relative age, or "Unknown".
 */
export function timeAgo(iso) {
    const t = iso ? new Date(iso).getTime() : NaN;
    if (Number.isNaN(t)) return 'Unknown';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
}

function formatSignalValue(value) {
    if (value === null || value === undefined || value === '') return 'Unknown';
    if (Array.isArray(value)) {
        if (!value.length) return 'None';
        return value.slice(0, 3).map((v) => (v && typeof v === 'object' ? `${v.event} × ${v.count}` : String(v))).join(', ');
    }
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return timeAgo(value);
    return String(value);
}

function SourceTitle({ src, url }) {
    if (!url) return <span className="font-display text-base font-semibold">{src.label}</span>;
    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackEvent('roadmap_source_click', { source: src.id })}
            className="inline-flex items-center gap-1.5 font-display text-base font-semibold hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]"
            aria-label={`${src.label} (opens in a new tab)`}
            data-testid={`signal-link-${src.id}`}
        >
            {src.label}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </a>
    );
}

/**
 * @param {object} props
 * @param {object|null} props.signals The `signals` block from roadmap-status.json.
 * @param {string} props.signalsState MEASURED or UNMEASURED.
 * @param {string|null} props.generatedAt When the signals file was written.
 */
export default function LiveSourcesPanel({ signals, signalsState, generatedAt }) {
    const sources = signals?.sources || {};
    const failures = signals?.failures || [];
    const measured = signalsState === 'MEASURED' && Boolean(signals);
    return (
        <div className="mt-6 scroll-mt-24" id="live-sources" data-testid="live-sources">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <SectionLabel icon={Radio}>Live sources · signals, not results</SectionLabel>
                    <h3 className="mt-2 font-display text-xl font-bold tracking-tight">
                        What each connected system reports.
                    </h3>
                </div>
                <ProvenanceTag
                    source="roadmap_signals"
                    timestamp={generatedAt ? timeAgo(generatedAt) : 'Unknown'}
                    freshness={measured ? 'MEASURED' : 'UNMEASURED'}
                />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Activity counts from the systems around this build. They are signals of
                motion, never results: nothing here can mark a milestone verified or the
                sprint complete. A tile that could not be measured says so, with the reason.
                A tile title links to that system&rsquo;s public page when it has one.
            </p>
            <Rule className="my-4" />
            {!measured && (
                <Card className="mb-3 p-4 text-sm text-muted-foreground" data-testid="live-sources-unmeasured">
                    Unknown — live source signals were not measured for this build.
                </Card>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {SIGNAL_SOURCES.map((src) => {
                    const rec = sources[src.id] || {};
                    const state = rec.state || 'UNMEASURED';
                    const metrics = rec.metrics || {};
                    const url = publicUrlForSource(src.id, rec);
                    return (
                        <Card key={src.id} className="p-4" data-testid={`signal-tile-${src.id}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <SourceTitle src={src} url={url} />
                                <Badge tone={SIGNAL_TONE[state] || 'neutral'}>{state}</Badge>
                            </div>
                            {src.presentationOnly && (
                                <p className="mt-1 font-evidence text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                    presentation only · analytics projection
                                </p>
                            )}
                            <dl className="mt-3 space-y-1">
                                {src.metrics.map(([key, label]) => (
                                    <div key={key} className="flex justify-between gap-3 text-sm">
                                        <dt className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
                                        <dd className="truncate text-right text-foreground/90">{formatSignalValue(metrics[key])}</dd>
                                    </div>
                                ))}
                            </dl>
                            {state === 'UNMEASURED' ? (
                                <details className="mt-3 font-evidence text-[11px] text-muted-foreground" data-testid={`signal-reason-${src.id}`}>
                                    <summary className="cursor-pointer select-none py-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--ring))]">
                                        Unknown — not measured · why?
                                    </summary>
                                    <p className="mt-1 break-words">{rec.reason || 'No reason recorded by the collector.'}</p>
                                </details>
                            ) : (
                                <p className="mt-3 font-evidence text-[11px] text-muted-foreground">
                                    data {timeAgo(rec.freshness?.data_at || generatedAt)}{rec.reason ? ` · ${rec.reason}` : ''}
                                </p>
                            )}
                        </Card>
                    );
                })}
            </div>
            {failures.length > 0 && (
                <Card className="mt-3 p-4" data-testid="live-sources-failures">
                    <p className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Not measured or degraded
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {failures.map((f) => (
                            <li key={`${f.source}-${f.reason}`}>
                                <span className="font-evidence text-[11px] text-primary">{f.source}</span> · {f.state || 'UNMEASURED'} · {f.reason}
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    );
}
