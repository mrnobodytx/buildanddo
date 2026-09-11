// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/RoadmapPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-ROADMAP-001, SRS-BUILDANDDO-SIGNALS-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN, C-ONE (live sources panel)
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     scripts/ci/sprint_cycle.py,
//              scripts/deploy/roadmap_status.py
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/public/roadmap-status.json;
//              VALIDATES scripts/ci/sprint_cycle.py
// Intent:      Draw the sprint plan and, separately, whatever the projection
//              actually measured - including saying it measured nothing. The
//              live sources panel shows SIGNALS from each connected system,
//              never results, and says UNMEASURED per tile when it must.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Gauge, ArrowRight, Info, TrendingUp, GitCommit, Radio } from 'lucide-react';
import Header from '@/components/site/Header';
import Footer from '@/components/site/Footer';
import Seo from '@/components/Seo';
import { Section, SectionLabel, Card, StatePill, Button, Badge, ProvenanceTag, Rule } from '@/components/site/ui';
import { trackEvent } from '@/lib/telemetry';

const STATUSES = ['proposed', 'planned', 'in_progress', 'blocked', 'verified', 'archived'];

const FIELDS = [
    { label: 'Owner', value: 'The desk or person accountable.' },
    { label: 'Status', value: 'Proposed → Planned → In progress → Blocked → Verified → Archived.' },
    { label: 'Evidence link', value: 'A real record or receipt backing the item.' },
    { label: 'Timestamp', value: 'When the item was created and last updated.' },
    { label: 'Dependency', value: 'What must happen first.' },
    { label: 'Next action', value: 'The concrete step that moves it forward.' },
];

/**
 * 21-day development sprint — the planned defaults.
 *
 * These entries mirror MILESTONES in scripts/ci/sprint_cycle.py, which is the
 * canonical plan. They exist here as the fallback the page renders before, or
 * instead of, roadmap-status.json: day, title, planned percentage and copy.
 *
 * Status is `planned` for every entry on purpose. A milestone only renders as
 * verified when the projection says so — see mergeLiveStatus below. Nothing on
 * this page can promote a milestone by editing this array.
 */
const SPRINT_DAYS = 21;

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

const PLANNED_MILESTONES = [
    {
        day: 1, title: 'Sprint kickoff — foundations', status: 'planned', value: 5,
        description: 'Repo, self-hosted deploy target, and the staging→production pipeline itself. '
            + 'Nothing downstream works without a real, provable way to ship a change.',
        deliverables: ['Self-hosted domain + TLS (no third-party site builder)', 'Staging environment, separate from production',
            'Automated build → gate → staging-probe → promote pipeline', 'Public GitHub repo + private release mirror'],
    },
    {
        day: 3, title: 'Auth & onboarding hardening', status: 'planned', value: 12,
        description: 'A user can sign up, log in, and create a workspace without the flow silently failing. '
            + 'Includes the real backend (not a mock) the rest of the product is built on.',
        deliverables: ['Real backend auth (PocketBase)', 'Workspace creation flow, reproduced end-to-end and fixed when broken',
            'Team roles per workspace (owner/admin/editor/viewer), not just single-owner'],
    },
    {
        day: 5, title: 'Workspace collections live', status: 'planned', value: 20,
        description: 'The actual data model behind every workspace panel — evidence, missions, signals, '
            + 'workflows, roadmap items — backed by a real database with real access rules, not placeholders.',
        deliverables: ['Backend deployed for real (was unused scaffolding until this sprint)',
            'Role-aware access rules verified with real multi-user accounts, not assumed',
            'Public/private boundary scan wired into CI so nothing internal leaks by accident'],
    },
    {
        day: 7, title: 'Signals pipeline MVP', status: 'planned', value: 30,
        description: 'Turning outside noise (community feedback, engagement, research gaps) into something '
            + 'the product can act on, without letting one comment directly trigger a change.',
        deliverables: ['A typed evidence/claim model with epistemic states (asserted → sourced → corroborated → verified)',
            'A research-quest compiler: a disputed or stale signal becomes a tracked request for more evidence, never an auto-edit',
            'Community audit actions with real reputation (XP/TP) settlement — never from self-review or raw volume'],
    },
    {
        day: 9, title: 'Missions — bounded-action engine', status: 'planned', value: 40,
        description: 'A concrete, boundable unit of work: a scoped edit contract, an isolated change, '
            + 'independent verification, and a real rollback path — not an agent given unbounded authority.',
        deliverables: ['A target/capability graph so an edit is scoped to one file and one mutation class',
            'A first real, dogfooded end-to-end edit through that pipeline, verified live in production',
            'Rollback strategy tracked as declared vs. materialized vs. verified — not assumed complete'],
    },
    {
        day: 11, title: 'Workflows editor', status: 'planned', value: 50,
        description: 'Letting a user compose a repeatable automation from the same building blocks the '
            + 'platform itself uses, instead of a one-off script per business.',
        deliverables: ['Workflow records with a real owner/workspace scope', 'A visual builder for the common cases',
            'Connectors reusing the same evidence/audit model as everything else, not a parallel system'],
    },
    {
        day: 13, title: 'Service connectors (Firecrawl, n8n)', status: 'planned', value: 60,
        description: 'Real external integrations for research and automation — website/content extraction and '
            + 'workflow orchestration — each with a stated data boundary, not blanket credential access.',
        deliverables: ['Firecrawl for controlled web research', 'Self-hosted n8n for orchestration',
            'Bounded adapter authority per connector, not a generic admin key'],
    },
    {
        day: 15, title: 'ERP foundation', status: 'planned', value: 70,
        description: 'The unglamorous backbone — contacts, objectives, tasks — that every other workspace '
            + 'feature (missions, signals, evidence) actually needs to point at something real.',
        deliverables: ['Contacts/objectives/tasks with the same RBAC model as the rest of the workspace',
            'Cross-links from missions/signals into ERP records, not a disconnected module'],
    },
    {
        day: 17, title: 'Evidence ledger & verification', status: 'planned', value: 80,
        description: 'A claim is never true just because it was written down. Sources, audits, disputes, and '
            + 'a promotion ladder from asserted to independently verified — the same discipline applied to the product itself.',
        deliverables: ['Source-lineage collapsing (100 copies of one origin ≠ 100 independent sources)',
            'Real self-audit rejection by actual authorship, not a caller-honesty flag',
            'Per-dimension knowledge health — never one averaged fake score'],
    },
    {
        day: 19, title: 'Daily edition & specialist desks', status: 'planned', value: 88,
        description: 'Surfacing what actually happened — real commits, real deploys, real verified claims — '
            + 'as a readable daily record, not a marketing summary.',
        deliverables: ['A canonical release event compiled once, projected consistently to wiki/Discord/community channels',
            'Self-hosted wiki as the durable public record', 'Specialist desk views scoped by role, not one firehose'],
    },
    {
        day: 21, title: 'Sprint review — verified replay', status: 'planned', value: 100,
        description: 'Every milestone above gets replayed against its own stated evidence bar, in public — '
            + 'not summarized as "done," but shown with what was actually verified and what wasn’t.',
        deliverables: ['Public test suite results, not just a green checkmark', 'An honest list of what remains open',
            'This roadmap updated to reflect what actually happened, not the original plan'],
    },
];

// The plan curve is exactly the milestone points, joined by straight segments.
// It used to carry a deterministic per-day "wiggle" so it read like a market
// plot; that drew variance nobody measured and this page tells readers the
// curve is a plan. A dashed straight line says "planned, interpolated" without
// implying a daily reading exists.
const TRAJECTORY = PLANNED_MILESTONES.map((m) => ({ day: m.day, value: m.value }));

/**
 * Overlays projection status onto the planned milestones.
 *
 * The plan owns which milestones exist and what they are worth; the projection
 * may only report status and evidence for a day already in the plan. A live
 * entry for an unknown day is ignored rather than inventing a milestone.
 *
 * @param {Array<object>} live Milestone entries from roadmap-status.json.
 * @returns {Array<object>} Planned milestones with live status merged in.
 */
function mergeLiveStatus(live) {
    if (!Array.isArray(live) || live.length === 0) return PLANNED_MILESTONES;
    const byDay = new Map(live.filter((m) => m && typeof m.day === 'number').map((m) => [m.day, m]));
    return PLANNED_MILESTONES.map((m) => {
        const entry = byDay.get(m.day);
        if (!entry) return m;
        const evidence = String(entry.evidence || '').trim();
        // Same rule as _actual_pct in sprint_cycle.py: verified without an
        // evidence reference is an assertion, and this page does not render
        // assertions as verified.
        const claimsVerified = entry.status === 'verified';
        return {
            ...m,
            status: claimsVerified && !evidence ? m.status : (entry.status || m.status),
            evidence,
            verifiedAt: entry.verified_at || null,
        };
    });
}

const CHART_W = 1040;
const CHART_H = 440;
const PAD_L = 64;
const PAD_R = 32;
const PAD_T = 36;
const PAD_B = 52;

const xFor = (day) => PAD_L + ((day - 1) / (SPRINT_DAYS - 1)) * (CHART_W - PAD_L - PAD_R);
const yFor = (value) => PAD_T + (1 - value / 100) * (CHART_H - PAD_T - PAD_B);

function MarketPlot({ activeDay, onHover, live, milestones, actual }) {
    const linePath = TRAJECTORY.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.day).toFixed(1)} ${yFor(p.value).toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${xFor(SPRINT_DAYS).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(1).toFixed(1)} ${yFor(0).toFixed(1)} Z`;

    const yTicks = [0, 25, 50, 75, 100];
    const xTicks = [1, 5, 9, 13, 17, 21];

    return (
        <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="block h-auto w-full"
            role="img"
            aria-label="Planned 21-day development sprint trajectory, plotted as a market-style line chart."
        >
            {/* paper background */}
            <rect x="0" y="0" width={CHART_W} height={CHART_H} fill="hsl(var(--card))" />

            {/* grid */}
            {yTicks.map((t) => (
                <g key={`y${t}`}>
                    <line x1={PAD_L} y1={yFor(t)} x2={CHART_W - PAD_R} y2={yFor(t)} stroke="hsl(var(--border))" strokeWidth="1" />
                    <text x={PAD_L - 10} y={yFor(t) + 4} textAnchor="end" className="font-evidence" fontSize="11" fill="hsl(var(--muted-foreground))">
                        {t}
                    </text>
                </g>
            ))}
            {xTicks.map((t) => (
                <g key={`x${t}`}>
                    <line x1={xFor(t)} y1={PAD_T} x2={xFor(t)} y2={CHART_H - PAD_B} stroke="hsl(var(--border))" strokeWidth="1" strokeDasharray="2 4" />
                    <text x={xFor(t)} y={CHART_H - PAD_B + 20} textAnchor="middle" className="font-evidence" fontSize="11" fill="hsl(var(--muted-foreground))">
                        D{t}
                    </text>
                </g>
            ))}

            {/* axis labels */}
            <text x={PAD_L - 44} y={PAD_T - 14} className="font-evidence" fontSize="10" fill="hsl(var(--muted-foreground))" letterSpacing="1.5">
                % PLAN
            </text>
            <text x={CHART_W - PAD_R} y={CHART_H - PAD_B + 20} textAnchor="end" className="font-evidence" fontSize="10" fill="hsl(var(--muted-foreground))" letterSpacing="1.5">
                SPRINT DAY →
            </text>

            {/* area fill */}
            <path d={areaPath} fill="hsl(var(--primary) / 0.06)" stroke="none" />

            {/* trajectory line - dashed, because every point between two
                milestones is interpolated plan, not a daily reading */}
            <path
                d={linePath}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeDasharray="6 4"
                strokeLinejoin="round"
                strokeLinecap="round"
            />

            {/* milestone markers - filled only where the projection says verified */}
            {milestones.map((m) => {
                const x = xFor(m.day);
                const y = yFor(m.value);
                const isActive = activeDay === m.day;
                const isVerified = m.status === 'verified';
                return (
                    <g
                        key={m.day}
                        onMouseEnter={() => onHover(m.day)}
                        onMouseLeave={() => onHover(null)}
                        style={{ cursor: 'pointer' }}
                    >
                        {isActive && <circle cx={x} cy={y} r="9" fill="hsl(var(--primary) / 0.18)" />}
                        <circle
                            cx={x}
                            cy={y}
                            r={isVerified ? 5.5 : 4.5}
                            fill={isVerified ? 'hsl(var(--primary))' : 'hsl(var(--card))'}
                            stroke="hsl(var(--primary))"
                            strokeWidth="2"
                        />
                        <text x={x} y={y - 12} textAnchor="middle" className="font-evidence" fontSize="10" fill="hsl(var(--foreground))">
                            D{m.day}
                        </text>
                    </g>
                );
            })}

            {/* actual progress marker - drawn only from a fresh, measured
                projection. An UNMEASURED or missing file draws nothing at all
                rather than a marker at a number nobody computed. */}
            {actual && (
                <g>
                    <line
                        x1={xFor(actual.day)} y1={PAD_T}
                        x2={xFor(actual.day)} y2={CHART_H - PAD_B}
                        stroke="hsl(var(--foreground) / 0.35)" strokeWidth="1" strokeDasharray="3 3"
                    />
                    <circle
                        cx={xFor(actual.day)} cy={yFor(actual.pct)}
                        r="5.5" fill="hsl(var(--destructive, 0 84% 60%))" stroke="hsl(var(--card))" strokeWidth="1.5"
                    />
                    <text
                        x={xFor(actual.day)} y={yFor(actual.pct) - 14}
                        textAnchor="middle" className="font-evidence" fontSize="10" fill="hsl(var(--foreground))"
                    >
                        ACTUAL {actual.pct}%
                    </text>
                </g>
            )}

            {/* live data unavailable - say so on the chart itself */}
            {live && !actual && (
                <text
                    x={CHART_W - PAD_R} y={PAD_T - 14} textAnchor="end"
                    className="font-evidence" fontSize="10" fill="hsl(var(--muted-foreground))" letterSpacing="1.5"
                >
                    ACTUAL: UNKNOWN
                </text>
            )}

            {/* frame */}
            <rect x="0.5" y="0.5" width={CHART_W - 1} height={CHART_H - 1} fill="none" stroke="hsl(var(--foreground) / 0.7)" strokeWidth="1" />
        </svg>
    );
}

/**
 * Live sources panel — one tile per connected system.
 *
 * Every tile is a SIGNAL, not a result: activity counts, alert counts, page
 * counts. None of it can mark a milestone verified or the sprint complete; the
 * curve above is the plan and the milestone states come only from the sprint
 * projection. PostHog in particular is analytics projection only
 * (config/tenants/buildanddo.posthog.json forbids reading it as completion,
 * verification or evidence), so its tile is labelled presentation only.
 *
 * The signals file is written by the controller estate
 * (tools/citadel_roadmap_signals.py) and embedded by roadmap_status.py. A
 * source the estate could not measure arrives as UNMEASURED with a reason,
 * and that is exactly what the tile shows.
 */
const SIGNAL_SOURCES = [
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

function timeAgo(iso) {
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

function LiveSourcesPanel({ signals, signalsState, generatedAt }) {
    const sources = signals?.sources || {};
    const failures = signals?.failures || [];
    const measured = signalsState === 'MEASURED' && Boolean(signals);
    return (
        <div className="mt-6" data-testid="live-sources">
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
                    return (
                        <Card key={src.id} className="p-4" data-testid={`signal-tile-${src.id}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-display text-base font-semibold">{src.label}</span>
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
                            <p className="mt-3 font-evidence text-[11px] text-muted-foreground">
                                {state === 'UNMEASURED'
                                    ? `Unknown — ${rec.reason || 'not measured'}`
                                    : `data ${timeAgo(rec.freshness?.data_at || generatedAt)}${rec.reason ? ` · ${rec.reason}` : ''}`}
                            </p>
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

export default function RoadmapPage() {
    const [activeDay, setActiveDay] = useState(null);
    const [live, setLive] = useState(null);
    const [liveError, setLiveError] = useState(false);

    const milestones = useMemo(() => mergeLiveStatus(live?.milestones), [live]);
    const verifiedCount = useMemo(
        () => milestones.filter((m) => m.status === 'verified').length,
        [milestones],
    );
    const activeMilestone = useMemo(
        () => milestones.find((m) => m.day === activeDay) || null,
        [milestones, activeDay],
    );

    // A projection is only quoted when it says it measured something. An
    // UNMEASURED file is a deliberate signal from ship.py that the projection
    // failed, and must not be read as "zero progress".
    const measured = Boolean(live) && live.state !== 'UNMEASURED';

    const generatedAt = useMemo(() => {
        const parsed = live?.generated_at ? new Date(live.generated_at) : null;
        return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }, [live]);

    const stale = Boolean(generatedAt) && Date.now() - generatedAt.getTime() > STALE_AFTER_MS;

    // sprint_day is clamped here as well as in sprint_cycle.py: a status file
    // written after D21, or by an older projection, must not plot off-chart.
    const actual = useMemo(() => {
        if (!measured) return null;
        if (!Number.isFinite(live.sprint_day) || !Number.isFinite(live.actual_pct)) return null;
        return {
            day: Math.max(1, Math.min(live.sprint_day, SPRINT_DAYS)),
            pct: Math.max(0, Math.min(live.actual_pct, 100)),
        };
    }, [measured, live]);

    useEffect(() => {
        let cancelled = false;
        fetch('/roadmap-status.json', { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
            .then((data) => { if (!cancelled) setLive(data); })
            .catch(() => { if (!cancelled) setLiveError(true); });
        return () => { cancelled = true; };
    }, []);

    const handleHover = (day) => {
        setActiveDay(day);
        if (day) {
            const m = milestones.find((x) => x.day === day);
            trackEvent('roadmap_milestone_hover', { day, title: m?.title });
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Helmet>
                <title>BuildAndDo — 21-day development sprint roadmap</title>
                <meta
                    name="description"
                    content="BuildAndDo's roadmap plotted as an old-school market chart: a planned 21-day development sprint with milestone markers. Every milestone is a plan, not a verified result — Verified still requires an evidence record."
                />
            </Helmet>
            <Seo
                title="BuildAndDo — 21-day development sprint roadmap"
                description="A planned 21-day development sprint plotted as a market-style chart with milestone markers. Plans, not verified results."
                siteName="BuildAndDo"
                type="website"
            />

            <Header />

            <div className="rule-double" />
            <Section className="py-14 sm:py-20">
                <SectionLabel icon={Gauge}>Operational Roadmap</SectionLabel>
                <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                    A 21-day sprint, plotted like a market chart.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    BuildAndDo&rsquo;s near-term roadmap is a planned development
                    sprint, drawn as an old-school stock-market plot. Each marker
                    is a milestone in the sprint. The curve is a plan, not
                    telemetry — it shows intended cumulative completion, not real
                    results. An item is never marked Verified from a prompt
                    alone; Verified still requires an evidence record. The
                    red ACTUAL marker on the chart, where present, is live
                    build/deploy telemetry, not another plan line.
                </p>

                <div className="mt-8 flex flex-wrap gap-2">
                    {STATUSES.map((s) => <StatePill key={s} state={s} />)}
                </div>
            </Section>

            {/* Market plot */}
            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <SectionLabel icon={TrendingUp}>Dev trajectory · planned</SectionLabel>
                        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            21-day sprint — milestone plot
                        </h2>
                    </div>
                    <div className="font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            BND · SPRINT 01 · PLAN
                    </div>
                </div>

                <Card className="mt-6 overflow-hidden p-0">
                    <MarketPlot
                        activeDay={activeDay}
                        onHover={handleHover}
                        live={live}
                        milestones={milestones}
                        actual={actual}
                    />
                </Card>

                {/* ticker / readout strip */}
                <div className="mt-4 border border-border bg-secondary/40 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <span>SPRINT 01</span>
                        <span>· {SPRINT_DAYS} DAYS</span>
                        <span>· {milestones.length} MILESTONES</span>
                        <span>· {verifiedCount} VERIFIED</span>
                        <span className="text-primary">· CURVE = PLAN, NOT RESULTS</span>
                        {actual && (
                            <span>· LIVE ACTUAL: {actual.pct}% (day {actual.day})</span>
                        )}
                        {live && !measured && <span>· LIVE DATA UNAVAILABLE</span>}
                        {live?.gate_state && (
                            <span>· LAST GATE: {live.gate_state}</span>
                        )}
                        {stale && (
                            <span className="text-amber-warm">
                                · DATA MAY BE STALE (GENERATED {generatedAt.toISOString().slice(0, 10)})
                            </span>
                        )}
                        {liveError && <span>· LIVE DATA: UNKNOWN (FETCH FAILED)</span>}
                    </div>
                </div>

                {/* live source signals - one tile per connected system, never a result */}
                <LiveSourcesPanel
                    signals={live?.signals || null}
                    signalsState={live?.signals_state || 'UNMEASURED'}
                    generatedAt={live?.signals_generated_at || null}
                />

                {/* active milestone readout */}
                <div className="mt-4 min-h-[3.5rem]">
                    {activeMilestone ? (
                        <Card className="p-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-evidence text-[11px] uppercase tracking-[0.14em] text-primary">
                    Day {activeMilestone.day}
                                </span>
                                <span className="font-display text-lg font-semibold">{activeMilestone.title}</span>
                                <StatePill state={activeMilestone.status} />
                                <span className="font-evidence text-[11px] text-muted-foreground">
                    planned completion {activeMilestone.value}%
                                </span>
                            </div>
                            {activeMilestone.description && (
                                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                                    {activeMilestone.description}
                                </p>
                            )}
                            {activeMilestone.deliverables?.length > 0 && (
                                <ul className="mt-3 space-y-1.5">
                                    {activeMilestone.deliverables.map((d) => (
                                        <li key={d} className="flex gap-2 text-sm text-foreground/90">
                                            <span className="text-primary">·</span>
                                            <span>{d}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    ) : (
                        <p className="px-1 text-sm text-muted-foreground">
              Hover or tap a milestone marker on the chart to read its
              planned deliverable.
                        </p>
                    )}
                </div>
            </Section>

            {/* Milestone ledger */}
            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <SectionLabel>Milestone ledger</SectionLabel>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Every milestone, with provenance fields.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          No invented results, no fake progress bars, no illustrative dates
          presented as real. If a field is unknown, it says Unknown.
                </p>

                <Card className="mt-6 divide-y divide-border">
                    {milestones.map((m) => (
                        <div key={m.day} className="p-4">
                            <div className="grid grid-cols-12 items-center gap-3">
                                <div className="col-span-2 font-evidence text-[11px] uppercase tracking-[0.14em] text-primary sm:col-span-1">
                    D{m.day}
                                </div>
                                <div className="col-span-7 text-sm font-medium sm:col-span-8">{m.title}</div>
                                <div className="col-span-3 flex items-center justify-end gap-2">
                                    <span className="font-evidence text-[11px] text-muted-foreground">{m.value}%</span>
                                    <StatePill state={m.status} />
                                </div>
                            </div>
                            {m.status === 'verified' && m.evidence && (
                                <p className="font-evidence mt-2 pl-0 text-[11px] text-muted-foreground sm:pl-[calc(8.33%+0.75rem)]">
                                    Evidence: {m.evidence}
                                    {m.verifiedAt ? ` · verified ${m.verifiedAt}` : ''}
                                </p>
                            )}
                            {m.description && (
                                <p className="mt-2 pl-0 text-sm leading-relaxed text-muted-foreground sm:pl-[calc(8.33%+0.75rem)]">
                                    {m.description}
                                </p>
                            )}
                            {m.deliverables?.length > 0 && (
                                <ul className="mt-2 space-y-1 pl-0 sm:pl-[calc(8.33%+0.75rem)]">
                                    {m.deliverables.map((d) => (
                                        <li key={d} className="flex gap-2 text-xs text-foreground/80">
                                            <span className="text-primary">·</span>
                                            <span>{d}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                </Card>
            </Section>

            {/* Recent build activity - real GitHub commit log, refreshed every deploy */}
            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <SectionLabel icon={GitCommit}>Build in public</SectionLabel>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                    Recent build activity.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Pulled live from the public GitHub repository at build time. Not
                    a summary or a curated highlight reel — the real commit log.
                </p>
                <Card className="mt-6 divide-y divide-border">
                    {live?.recent_commits?.length ? (
                        live.recent_commits.map((c) => (
                            c.error ? (
                                <div key="err" className="p-4 text-sm text-muted-foreground">Unknown — {c.error}</div>
                            ) : (
                                <a
                                    key={c.sha}
                                    href={c.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={() => trackEvent('roadmap_commit_click', { sha: c.sha })}
                                    className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-secondary/40"
                                >
                                    <span className="font-evidence text-[11px] text-primary">{c.sha}</span>
                                    <span className="flex-1 truncate">{c.message}</span>
                                    <span className="font-evidence text-[11px] text-muted-foreground">{c.date}</span>
                                </a>
                            )
                        ))
                    ) : (
                        <div className="p-4 text-sm text-muted-foreground">
                            {liveError ? 'Unknown — live commit feed unavailable.' : 'Loading…'}
                        </div>
                    )}
                </Card>
            </Section>

            {/* Provenance fields reference */}
            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <div className="grid gap-8 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <SectionLabel>What each item contains</SectionLabel>
                        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Full provenance, by default.
                        </h2>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            No invented milestones, no fake progress bars, no illustrative
            dates presented as real. If a field is unknown, it says Unknown.
                        </p>
                    </div>
                    <div className="lg:col-span-7">
                        <Card className="divide-y divide-border">
                            {FIELDS.map((f) => (
                                <div key={f.label} className="flex gap-4 p-4">
                                    <p className="w-32 shrink-0 font-evidence text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                        {f.label}
                                    </p>
                                    <p className="text-sm text-foreground/90">{f.value}</p>
                                </div>
                            ))}
                        </Card>
                    </div>
                </div>
            </Section>

            <Section className="border-t border-foreground/80 py-12 sm:py-16">
                <Card className="p-8 text-center">
                    <p className="font-display text-xl font-semibold">
            The live, editable roadmap lives in your workspace.
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            The dashed curve is the planned sprint. A milestone renders as
            verified here only when the sprint projection reports it verified
            with an evidence reference — never from this page&rsquo;s own defaults.
                    </p>
                    <div className="mt-5 flex justify-center gap-2">
                        <Link to="/app/roadmap"><Button size="sm">Open workspace roadmap <ArrowRight className="h-4 w-4" /></Button></Link>
                        <Link to="/signup"><Button variant="secondary" size="sm">Create account</Button></Link>
                    </div>
                </Card>
            </Section>

            <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 pb-10 text-xs leading-relaxed text-muted-foreground/70 sm:px-6">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        The curve on this page is a planned sprint trajectory, not verified
        results or live telemetry. BuildAndDo does not present illustrative
        numbers as real; no cost markers or growth metrics are shown.
            </p>

            <Footer />
        </div>
    );
}
