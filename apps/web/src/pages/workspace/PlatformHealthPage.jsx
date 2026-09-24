// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/PlatformHealthPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/pocketbase/pb_hooks/estate.pb.js,
//              apps/web/src/lib/pocketbaseClient.js,
//              apps/web/src/components/workspace/workspaceHelpers.jsx,
//              apps/web/src/components/site/ui.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES GET /api/buildanddo/estate/platform-health;
//              DEPENDS_ON apps/pocketbase/pb_hooks/estate.pb.js
// Intent:      Say which of the operating company's connected platforms are
//              actually being used, to the operator who owns them, keeping
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
import pocketbaseClient from '@/lib/pocketbaseClient';
import { cn } from '@/lib/utils';

// The full assessment is no longer a published file: the backend answers this route to a master
// seat and to nobody else (estate.pb.js). The narrowed public file that remains carries only the
// per-platform state the marketing status page reads.
const REPORT_ROUTE = '/api/buildanddo/estate/platform-health';

// WHAT A REJECTION HERE MEANS, AND ONLY WHAT IT MEANS. An absent report is not a rejection: the
// route answers 200 with {state:'UNMEASURED'} for that, handled below. Reaching this branch means
// the request itself did not complete, so the copy may not name a cause the page does not have.
const MISSING_REPORT =
    'The platform report could not be read: the request to the estate route did not complete. Nothing is drawn below, because a failed read is not an estate with nothing connected.';

const UNMEASURED_REPORT =
    'The platform report answered but carried no measurement, so there is nothing to show yet.';

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
 * When the reading was taken, and that opening the page does not take a new one.
 *
 * This was an amber warning card headed "not your workspace", written to stop a passing workspace
 * user reading the operating company's vendor figures as their own. The route is now a master
 * seat's only, so that reader cannot arrive: the warning was addressed to nobody, and it named
 * whose the accounts are for a second time on a page that already says so in its first sentence.
 * What it carried that nothing else did - the age of the reading, and that this is a transcription
 * rather than a gauge - is kept here, in one line, at the weight an owner needs.
 *
 * @param {object} props Component props.
 * @param {boolean} props.hasReport Whether a report has been read at all.
 * @param {string|null} props.observedLabel The formatted observation date, if any.
 * @returns {JSX.Element} The provenance line.
 */
function ReadingProvenance({ hasReport, observedLabel }) {
    return (
        <p
            role="note"
            data-testid="platform-health-scope"
            className="font-evidence mt-4 border-l-2 border-border/80 pl-3 text-xs leading-relaxed text-muted-foreground"
        >
            {ageSentence(hasReport, observedLabel)}
        </p>
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
        pocketbaseClient
            .send(REPORT_ROUTE, { method: 'GET', requestKey: null })
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
                description="Which of the vendor platforms Citadel Nexus Inc connects to are earning their keep, read from the operating company's own accounts. A feature is only counted against a platform when it is available and switched off - an entitlement that could not be read stays Unknown and is left out of the score."
                actions={
                    report ? (
                        <ProvenanceTag
                            source={report.observed_via}
                            timestamp={observedLabel}
                            freshness={report.state === 'MEASURED' ? 'read-only discovery' : report.state}
                        />
                    ) : null
                }
            >
                <ReadingProvenance hasReport={Boolean(report)} observedLabel={observedLabel} />
            </PageHeader>

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
