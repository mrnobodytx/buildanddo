// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/PlatformHealthPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     scripts/ci/fleet_report.py,
//              apps/web/src/components/workspace/workspaceHelpers.jsx,
//              apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/public/platform-health.json;
//              DEPENDS_ON scripts/ci/fleet_report.py
// Intent:      Say which of the operating company's connected platforms are
//              actually being used - and say whose they are - keeping "unknown"
//              separate from "unused" so an unreadable entitlement is never
//              counted as a deliberate gap.
// ───────────────────────────────────────────────────────────────

import {
    ArrowUpDown,
    Building2,
    CircleSlash,
    Gauge,
    Layers,
    ListChecks,
    Plug,
    ShieldQuestion,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';

import { Button, Card, ProvenanceTag, StatePill } from '@/components/site/ui';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
    PageHeader,
    ProgressMeter,
    StatCard,
    StatusBadge,
} from '@/components/workspace/workspaceHelpers';
import { DegradedNotice, ListSkeleton } from '@/components/workspace/WorkspaceNotices';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const REPORT_URL = '/platform-health.json';

const MISSING_REPORT =
    'platform-health.json was not served. It is written at build time by scripts/ci/fleet_report.py, so an absent file means the projection did not run — not that no platform is connected.';

const UNMEASURED_REPORT =
    'The platform report answered but carried no measurement, so there is nothing to show yet.';

// WHOSE ACCOUNTS THESE ARE. The report is one file, built once and served
// byte-identically to every workspace; this page imports no workspace context
// because there is no per-workspace reading to import. Someone opening it
// inside their own workspace will take the numbers for their own unless the
// page says otherwise before they reach the first one, which a grey provenance
// tag beside the title never managed to do. So the statement is made twice:
// here, above the dashboard, and again in the page description.
const OPERATOR_SCOPE =
    'Every figure below is read from the vendor accounts of Citadel Nexus Inc, the company that operates this product. It is the same reading for every workspace and does not change with who is signed in.';

const NOT_LIVE = 'Nothing on this page is measured when you open it.';

/**
 * How old the reading is, said only as far as the report actually says it.
 *
 * "We have not loaded it yet", "the report did not date itself" and "it was
 * taken on this day" are three different answers, and the page must not spend
 * one of them on another.
 *
 * @param {boolean} hasReport Whether a report has been read at all.
 * @param {string|null} observedLabel The formatted observation date, if any.
 * @returns {string} The sentence to show under the scope statement.
 */
function ageSentence(hasReport, observedLabel) {
    if (!hasReport) return NOT_LIVE;
    if (!observedLabel) {
        return `The report did not say when it was taken, so the age of this reading is unknown. ${NOT_LIVE}`;
    }
    return `Transcribed on ${observedLabel}. ${NOT_LIVE}`;
}

/**
 * The scope statement that sits above the dashboard.
 *
 * @param {object} props Component props.
 * @param {boolean} props.hasReport Whether a report has been read at all.
 * @param {string|null} props.observedLabel The formatted observation date, if any.
 * @returns {JSX.Element} The notice.
 */
function OperatorScopeNotice({ hasReport, observedLabel }) {
    return (
        <Card
            role="note"
            data-testid="platform-health-scope"
            className="border-[hsl(var(--amber))]/40 bg-[hsl(var(--amber))]/10 p-4"
        >
            <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-warm" />
                <div className="text-sm leading-relaxed">
                    <p className="font-semibold text-foreground">
                        Operating company infrastructure, not your workspace
                    </p>
                    <p className="mt-1 text-muted-foreground">{OPERATOR_SCOPE}</p>
                    <p className="mt-1 text-muted-foreground">
                        {ageSentence(hasReport, observedLabel)}
                    </p>
                </div>
            </div>
        </Card>
    );
}

// A feature whose entitlement could not be read is `unknown`, and unknown is
// excluded from the utilization denominator in fleet_report.py. Presenting it
// in the same colour as `unused` would undo that distinction, so it does not
// share a tone with anything actionable.
const FEATURE_STATUS = {
    configured: { label: 'Configured', tone: 'teal' },
    underused: { label: 'Underused', tone: 'amber' },
    unused: { label: 'Unused', tone: 'violet' },
    unknown: { label: 'Unknown', tone: 'neutral' },
};

const STATUS_ORDER = ['configured', 'underused', 'unused', 'unknown'];

const STATUS_FILL = {
    configured: 'hsl(var(--teal))',
    underused: 'hsl(var(--amber))',
    unused: 'hsl(var(--primary))',
    unknown: 'hsl(var(--muted-foreground))',
};

const STATUS_ROW = {
    configured: 'border-l-[hsl(var(--teal))]',
    underused: 'border-l-[hsl(var(--amber))]',
    unused: 'border-l-[hsl(var(--primary))]',
    unknown: 'border-l-border',
};

const EFFORT = {
    config: { label: 'Config only', tone: 'teal' },
    code: { label: 'Code change', tone: 'violet' },
    infrastructure: { label: 'Infrastructure', tone: 'amber' },
};

const PLATFORM_STATE = {
    connected: 'connected',
    hold: 'degraded',
    disconnected: 'error',
};

const SORTS = [
    { id: 'platform', label: 'Platform' },
    { id: 'status', label: 'Status' },
    { id: 'name', label: 'Feature' },
];

const CHART_CONFIG = {
    count: { label: 'Features' },
    platforms: { label: 'Platforms live', color: 'hsl(var(--primary))' },
};

/**
 * Renders one platform card with its feature-status donut.
 *
 * @param {object} props Component props.
 * @param {object} props.platform A platform entry from the report.
 * @returns {JSX.Element} The platform card.
 */
function PlatformCard({ platform }) {
    const { counts } = platform.utilization;
    const slices = STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => ({
        status,
        label: FEATURE_STATUS[status].label,
        count: counts[status],
    }));

    return (
        <Card className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold tracking-tight">
                        {platform.label}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {platform.detail}
                    </p>
                </div>
                <StatePill state={PLATFORM_STATE[platform.state] || 'idle'} />
            </div>

            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
                <ChartContainer
                    config={CHART_CONFIG}
                    className="aspect-square h-36 w-36 shrink-0"
                >
                    <PieChart>
                        <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
                        <Pie
                            data={slices}
                            dataKey="count"
                            nameKey="label"
                            innerRadius="58%"
                            outerRadius="88%"
                            paddingAngle={2}
                            isAnimationActive={false}
                            stroke="hsl(var(--background))"
                        >
                            {slices.map((slice) => (
                                <Cell key={slice.status} fill={STATUS_FILL[slice.status]} />
                            ))}
                        </Pie>
                    </PieChart>
                </ChartContainer>

                <div className="min-w-0 flex-1">
                    <ul className="space-y-1.5">
                        {slices.map((slice) => (
                            <li
                                key={slice.status}
                                className="flex items-center justify-between text-xs"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: STATUS_FILL[slice.status] }}
                                    />
                                    {slice.label}
                                </span>
                                <span className="text-muted-foreground">{slice.count}</span>
                            </li>
                        ))}
                    </ul>
                    {platform.utilization.pct == null ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                            No feature could be scored. Utilization is unmeasured, not zero.
                        </p>
                    ) : (
                        <ProgressMeter
                            value={platform.utilization.pct}
                            label="Utilization"
                            className="mt-3"
                        />
                    )}
                </div>
            </div>

            <p className="mt-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                {platform.utilization.assessed} features assessed ·{' '}
                {platform.utilization.scored} scored ·{' '}
                {platform.verified
                    ? 'readings verified against the platform'
                    : 'readings unverified — the bridge has never been exercised'}
            </p>
        </Card>
    );
}

export default function PlatformHealthPage() {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [sort, setSort] = useState('platform');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        fetch(REPORT_URL, { cache: 'no-store' })
            .then((response) =>
                response.ok ? response.json() : Promise.reject(new Error(`status ${response.status}`)),
            )
            .then((data) => {
                if (cancelled) return;
                setReport(data);
                setLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setFailed(true);
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [attempt]);

    const platforms = report?.platforms || [];
    const totals = report?.totals;

    const rows = useMemo(() => {
        const flat = platforms.flatMap((platform) =>
            platform.features.map((feature) => ({
                ...feature,
                platform: platform.label,
                platformId: platform.id,
            })),
        );
        const filtered =
            statusFilter === 'all' ? flat : flat.filter((row) => row.status === statusFilter);
        const comparators = {
            platform: (a, b) => a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name),
            status: (a, b) =>
                STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
                a.platform.localeCompare(b.platform),
            name: (a, b) => a.name.localeCompare(b.name),
        };
        return [...filtered].sort(comparators[sort]);
    }, [platforms, sort, statusFilter]);

    const statusTotals = useMemo(() => {
        const counts = { configured: 0, underused: 0, unused: 0, unknown: 0 };
        platforms.forEach((platform) => {
            STATUS_ORDER.forEach((status) => {
                counts[status] += platform.utilization.counts[status] || 0;
            });
        });
        return counts;
    }, [platforms]);

    const timeline = useMemo(
        () =>
            (report?.integration_timeline || []).map((entry) => ({
                ...entry,
                label: formatDate(entry.date, { month: 'short', day: 'numeric' }),
            })),
        [report],
    );

    const observedLabel = report?.observed_at ? formatDate(report.observed_at) : null;

    return (
        <div className="space-y-8">
            <PageHeader
                title="Platform Health"
                description="Which of the platforms Citadel Nexus Inc connects to are earning their keep. These are the operating company's own accounts and not this workspace's. A feature is only counted against them when it is available and off - an entitlement that could not be read stays Unknown and is left out of the score."
                actions={
                    report ? (
                        <ProvenanceTag
                            source={report.observed_via}
                            timestamp={observedLabel}
                            freshness={report.state === 'MEASURED' ? 'read-only discovery' : report.state}
                        />
                    ) : null
                }
            />

            <OperatorScopeNotice hasReport={Boolean(report)} observedLabel={observedLabel} />

            {failed && (
                <DegradedNotice message={MISSING_REPORT} onRetry={() => setAttempt((n) => n + 1)} />
            )}

            {/* THE REPORT CAN ARRIVE WITHOUT A MEASUREMENT. A 200 carrying
                {state:'UNMEASURED', reason} and no totals leaves `failed` false, stops the
                spinner, and the body below - gated on `totals` - draws nothing at all: a title,
                a provenance tag, and silence, with no error and no way to retry. FleetPage had
                the same hole. The server's own reason is worth saying out loud. */}
            {!loading && !failed && report && !totals && (
                <DegradedNotice
                    message={report.reason || UNMEASURED_REPORT}
                    onRetry={() => setAttempt((n) => n + 1)}
                />
            )}

            {loading && <ListSkeleton rows={4} />}

            {report && totals && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            icon={Plug}
                            label="Platforms connected"
                            value={`${totals.connected} of ${totals.platforms}`}
                            hint={`${totals.unverified} unverified`}
                            tone="teal"
                        />
                        <StatCard
                            icon={ListChecks}
                            label="Features assessed"
                            value={totals.features_assessed}
                            hint={`${statusTotals.configured} configured`}
                            tone="violet"
                        />
                        <StatCard
                            icon={CircleSlash}
                            label="Available but off"
                            value={statusTotals.unused}
                            hint={`${statusTotals.underused} more are on but underused`}
                            tone="amber"
                        />
                        <StatCard
                            icon={ShieldQuestion}
                            label="Unknown"
                            value={statusTotals.unknown}
                            hint="Entitlement unreadable — excluded from the score"
                        />
                    </div>

                    <section className="grid gap-4 lg:grid-cols-2">
                        {platforms.map((platform) => (
                            <PlatformCard key={platform.id} platform={platform} />
                        ))}
                    </section>

                    <section>
                        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h2 className="font-display text-lg font-semibold tracking-tight">
                                Feature matrix
                            </h2>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <ArrowUpDown className="h-3.5 w-3.5" />
                                    Sort
                                </span>
                                {SORTS.map((option) => (
                                    <Button
                                        key={option.id}
                                        size="sm"
                                        variant={sort === option.id ? 'primary' : 'secondary'}
                                        onClick={() => setSort(option.id)}
                                    >
                                        {option.label}
                                    </Button>
                                ))}
                                <Button
                                    size="sm"
                                    variant={statusFilter === 'all' ? 'primary' : 'secondary'}
                                    onClick={() => setStatusFilter('all')}
                                >
                                    All
                                </Button>
                                {STATUS_ORDER.map((status) => (
                                    <Button
                                        key={status}
                                        size="sm"
                                        variant={statusFilter === status ? 'primary' : 'secondary'}
                                        onClick={() => setStatusFilter(status)}
                                    >
                                        {FEATURE_STATUS[status].label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <Card className="overflow-x-auto p-0">
                            <table className="w-full min-w-[46rem] border-collapse text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                                        <th scope="col" className="px-4 py-3 font-semibold">Feature</th>
                                        <th scope="col" className="px-4 py-3 font-semibold">Platform</th>
                                        <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                                        <th scope="col" className="px-4 py-3 font-semibold">Recommendation</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row) => (
                                        <tr
                                            key={`${row.platformId}:${row.name}`}
                                            className={cn(
                                                'border-b border-border/60 border-l-2 last:border-b-0',
                                                STATUS_ROW[row.status],
                                            )}
                                        >
                                            <td className="px-4 py-3 font-medium">{row.name}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{row.platform}</td>
                                            <td className="px-4 py-3">
                                                <StatusBadge map={FEATURE_STATUS} value={row.status} />
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {row.recommendation}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {rows.length === 0 && (
                                <p className="px-4 py-6 text-sm text-muted-foreground">
                                    No feature carries that status.
                                </p>
                            )}
                        </Card>
                    </section>

                    <div className="grid gap-6 lg:grid-cols-12">
                        <section className="lg:col-span-7">
                            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                                <Gauge className="h-4 w-4 text-primary" strokeWidth={2.1} />
                                Ranked actions
                            </h2>
                            <ol className="space-y-2">
                                {(report.recommendations || []).map((item) => (
                                    <li key={item.rank}>
                                        <Card className="flex items-start gap-3 p-4">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-xs font-semibold text-primary">
                                                {item.rank}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium">{item.action}</p>
                                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                    {item.impact}
                                                </p>
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    <StatusBadge map={EFFORT} value={item.effort} />
                                                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                                        {item.platform}
                                                    </span>
                                                </div>
                                            </div>
                                        </Card>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        <section className="lg:col-span-5">
                            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                                <Layers className="h-4 w-4 text-primary" strokeWidth={2.1} />
                                Integration timeline
                            </h2>
                            <Card className="p-5">
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    Platforms verified as reporting, by the date each was first
                                    observed. A written-but-unexercised bridge does not raise the
                                    line.
                                </p>
                                <ChartContainer
                                    config={CHART_CONFIG}
                                    className="mt-4 aspect-[2/1] w-full"
                                >
                                    <AreaChart
                                        data={timeline}
                                        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                                    >
                                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="label"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                        />
                                        <YAxis
                                            allowDecimals={false}
                                            tickLine={false}
                                            axisLine={false}
                                            width={24}
                                        />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Area
                                            type="stepAfter"
                                            dataKey="platforms"
                                            stroke="var(--color-platforms)"
                                            fill="var(--color-platforms)"
                                            fillOpacity={0.18}
                                            isAnimationActive={false}
                                        />
                                    </AreaChart>
                                </ChartContainer>
                                <ul className="mt-4 space-y-2">
                                    {timeline.map((entry) => (
                                        <li key={entry.date} className="flex items-start gap-2 text-xs">
                                            <span className="font-evidence shrink-0 text-muted-foreground">
                                                {entry.label}
                                            </span>
                                            <span className="text-muted-foreground">{entry.event}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}
