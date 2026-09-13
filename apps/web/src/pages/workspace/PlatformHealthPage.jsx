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
// Intent:      Say which connected platforms are actually being used, keeping
//              "unknown" separate from "unused" so an unreadable entitlement is
//              never counted as a deliberate gap.
// ───────────────────────────────────────────────────────────────

import {
    ArrowUpDown,
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
                description="Which connected platforms are earning their keep. A feature is only counted against you when it is available and off — an entitlement that could not be read stays Unknown and is left out of the score."
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

            {failed && (
                <DegradedNotice message={MISSING_REPORT} onRetry={() => setAttempt((n) => n + 1)} />
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
