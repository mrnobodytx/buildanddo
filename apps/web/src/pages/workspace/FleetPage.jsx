// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/FleetPage.jsx
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
// EnumEdges:   CONSUMES apps/web/public/fleet-status.json;
//              DEPENDS_ON scripts/ci/fleet_report.py
// Intent:      Show the Citadel NNC as three planes of hosts with what actually
//              runs on each, and label the reading as a recorded observation
//              rather than dressing a transcription up as a live gauge.
// ───────────────────────────────────────────────────────────────

import {
    AlertTriangle,
    Boxes,
    Cpu,
    Database,
    Layers,
    Network,
    Server,
    Settings2,
    ShieldAlert,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Tooltip, Treemap } from 'recharts';

import { Card, ProvenanceTag, StatePill } from '@/components/site/ui';
import { ChartContainer } from '@/components/ui/chart';
import {
    PageHeader,
    ProgressMeter,
    StatCard,
    StatusBadge,
} from '@/components/workspace/workspaceHelpers';
import { DegradedNotice, ListSkeleton } from '@/components/workspace/WorkspaceNotices';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const REPORT_URL = '/fleet-status.json';

// Regenerate with: python scripts/ci/fleet_report.py
const MISSING_REPORT =
    'fleet-status.json was not served. It is written at build time by scripts/ci/fleet_report.py, so an absent file means the projection did not run — not that the fleet is empty. Nothing is drawn below rather than invented.';

// Container taxonomy. The kind string is set once, in fleet_report.py; this map
// is the presentation layer over it and nothing else may introduce a new kind.
const CONTAINER_KIND = {
    agent: { label: 'Agent', icon: Settings2, dot: 'bg-primary', text: 'text-primary', border: 'border-primary/30', bg: 'bg-primary/5' },
    application: { label: 'Application', icon: Boxes, dot: 'bg-[hsl(var(--teal))]', text: 'text-teal', border: 'border-[hsl(var(--teal))]/30', bg: 'bg-[hsl(var(--teal))]/5' },
    database: { label: 'Database', icon: Database, dot: 'bg-[hsl(var(--amber))]', text: 'text-amber-warm', border: 'border-[hsl(var(--amber))]/30', bg: 'bg-[hsl(var(--amber))]/5' },
    infrastructure: { label: 'Infrastructure', icon: Network, dot: 'bg-muted-foreground', text: 'text-muted-foreground', border: 'border-border', bg: 'bg-secondary/40' },
};

const KIND_ORDER = ['agent', 'application', 'database', 'infrastructure'];

const ALERT_SEVERITY = {
    critical: { label: 'Critical', tone: 'amber' },
    high: { label: 'High', tone: 'amber' },
    medium: { label: 'Medium', tone: 'violet' },
    low: { label: 'Low', tone: 'neutral' },
};

// CPU bands. A host is not "unhealthy" at 45% — it is loaded, and the operator
// wants that distinction before deciding whether the reading needs action.
const CPU_BANDS = [
    { at: 60, state: 'degraded', note: 'Saturating' },
    { at: 35, state: 'active', note: 'Loaded' },
    { at: 0, state: 'healthy', note: 'Headroom' },
];

const cpuBand = (pct) => CPU_BANDS.find((band) => pct >= band.at) || CPU_BANDS[CPU_BANDS.length - 1];

const kindMeta = (kind) => CONTAINER_KIND[kind] || CONTAINER_KIND.infrastructure;

const PLANE_ICON = {
    control: Layers,
    operations: Server,
    intelligence: Cpu,
};

/**
 * Renders one host tile inside a plane lane.
 *
 * @param {object} props Component props.
 * @param {object} props.host A host entry from the fleet report.
 * @param {boolean} props.selected Whether this host's detail panel is open.
 * @param {Function} props.onSelect Called with the hostname when activated.
 * @returns {JSX.Element} The host tile.
 */
function HostTile({ host, selected, onSelect }) {
    const band = cpuBand(host.cpu_pct);
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(host.hostname)}
            className={cn(
                'flex w-full flex-col gap-3 rounded-[var(--radius)] border bg-card p-4 text-left transition-colors',
                selected ? 'border-primary/60 bg-secondary/30' : 'border-border hover:border-primary/40',
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-display text-sm font-semibold tracking-tight">
                        {host.short}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {host.provider} · {host.region}
                    </p>
                </div>
                <StatePill state={band.state} />
            </div>

            <p className="truncate text-xs text-muted-foreground">{host.role}</p>

            <ProgressMeter value={host.cpu_pct} label={`CPU · ${band.note}`} />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                    <Boxes className="h-3 w-3" />
                    {host.container_count} containers
                </span>
                <span className="inline-flex items-center gap-1">
                    <Network className="h-3 w-3" />
                    NATS {host.nats_role}
                </span>
                <span>{host.memory_gb} GB</span>
                <span>agent {host.agent_version}</span>
            </div>
        </button>
    );
}

/**
 * Renders the container grid for the selected host.
 *
 * @param {object} props Component props.
 * @param {object} props.host The selected host entry.
 * @returns {JSX.Element} The detail panel.
 */
function HostDetail({ host }) {
    const grouped = useMemo(() => {
        const buckets = KIND_ORDER.map((kind) => ({
            kind,
            items: host.containers.filter((container) => container.kind === kind),
        }));
        return buckets.filter((bucket) => bucket.items.length > 0);
    }, [host]);

    return (
        <Card className="p-5">
            <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold tracking-tight">
                        {host.hostname}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {host.role} · {host.provider} {host.region} · env {host.env}
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    <StatePill state={cpuBand(host.cpu_pct).state} />
                    <StatePill state={host.nats_role === 'hub' ? 'active' : 'connected'} />
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatCard icon={Cpu} label="CPU" value={`${host.cpu_pct}%`} hint={cpuBand(host.cpu_pct).note} tone="violet" />
                <StatCard icon={Server} label="Memory" value={`${host.memory_gb} GB`} hint="Resident on host" />
                <StatCard icon={Boxes} label="Containers" value={host.container_count} hint={`Agent ${host.agent_version}`} tone="teal" />
            </div>

            <div className="mt-6 space-y-5">
                {grouped.map((bucket) => {
                    const meta = kindMeta(bucket.kind);
                    const Icon = meta.icon;
                    return (
                        <section key={bucket.kind}>
                            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                <Icon className={cn('h-3.5 w-3.5', meta.text)} strokeWidth={2.1} />
                                {meta.label}
                                <span className="text-muted-foreground/70">{bucket.items.length}</span>
                            </h3>
                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {bucket.items.map((container) => (
                                    <li
                                        key={container.name}
                                        className={cn(
                                            'flex items-start gap-2 rounded-[var(--radius)] border p-3',
                                            meta.border,
                                            meta.bg,
                                        )}
                                    >
                                        <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">
                                                {container.name}
                                            </span>
                                            <span className="font-evidence mt-0.5 block truncate text-[11px] text-muted-foreground">
                                                {container.image} · {container.state}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>
        </Card>
    );
}

export default function FleetPage() {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [selected, setSelected] = useState(null);
    const [attempt, setAttempt] = useState(0);

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

    const hosts = report?.hosts || [];
    const planes = report?.planes || [];
    const totals = report?.totals;

    const selectedHost = useMemo(
        () => hosts.find((host) => host.hostname === selected) || null,
        [hosts, selected],
    );

    // Treemap wants one flat level with a size key; nesting planes inside it
    // renders unreadable slivers at this container count, so the plane is
    // carried as a label on the leaf instead.
    const treemapData = useMemo(
        () =>
            hosts.map((host) => ({
                name: host.short,
                plane: host.plane,
                size: host.container_count,
                fill:
                    host.plane === 'control'
                        ? 'hsl(var(--primary))'
                        : host.plane === 'operations'
                          ? 'hsl(var(--teal))'
                          : 'hsl(var(--amber))',
            })),
        [hosts],
    );

    const kindTotals = useMemo(() => {
        const counts = {};
        hosts.forEach((host) => {
            host.containers.forEach((container) => {
                counts[container.kind] = (counts[container.kind] || 0) + 1;
            });
        });
        return KIND_ORDER.filter((kind) => counts[kind]).map((kind) => ({ kind, count: counts[kind] }));
    }, [hosts]);

    const observedLabel = report?.observed_at ? formatDate(report.observed_at) : null;

    return (
        <div className="space-y-8">
            <PageHeader
                title="Fleet"
                description="The Citadel NNC as it was last recorded: seven hosts across three planes, and what runs on each. These figures are a transcribed Datadog reading projected at build time, not a live gauge — the observation date is stated below."
                actions={
                    report ? (
                        <ProvenanceTag
                            source={report.observed_via}
                            timestamp={observedLabel}
                            freshness={report.state === 'MEASURED' ? 'recorded observation' : report.state}
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
                            icon={Server}
                            label="Hosts reporting"
                            value={totals.hosts}
                            hint={`${totals.planes} planes · agents ${totals.agent_versions.join(', ')}`}
                            tone="violet"
                        />
                        <StatCard
                            icon={Boxes}
                            label="Containers"
                            value={totals.containers}
                            hint={`${totals.containers_running} running · ${totals.containers_not_running} not running`}
                            tone="teal"
                        />
                        <StatCard
                            icon={Network}
                            label="NATS mesh"
                            value={`${hosts.filter((host) => host.nats_role === 'leaf').length} leaves`}
                            hint={`${hosts.filter((host) => host.nats_role === 'hub').length} hubs across the estate`}
                        />
                        <StatCard
                            icon={ShieldAlert}
                            label="Monitors alerting"
                            value={totals.alerts}
                            hint="Monitors with no data are excluded"
                            tone="amber"
                        />
                    </div>

                    <section className="space-y-5">
                        <h2 className="font-display text-lg font-semibold tracking-tight">
                            Planes
                        </h2>
                        {planes.map((plane) => {
                            const PlaneIcon = PLANE_ICON[plane.id] || Layers;
                            const members = hosts.filter((host) => host.plane === plane.id);
                            return (
                                <Card key={plane.id} className="p-5">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex items-start gap-3">
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                                                <PlaneIcon className="h-4 w-4" strokeWidth={2.1} />
                                            </span>
                                            <div>
                                                <h3 className="font-display text-base font-semibold tracking-tight">
                                                    {plane.label}
                                                </h3>
                                                <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
                                                    {plane.summary}
                                                </p>
                                            </div>
                                        </div>
                                        <p className="shrink-0 text-xs text-muted-foreground">
                                            {plane.region} · {plane.host_count} hosts · {plane.container_count} containers
                                        </p>
                                    </div>

                                    <div
                                        className={cn(
                                            'mt-4 grid gap-3',
                                            members.length > 2
                                                ? 'sm:grid-cols-2 xl:grid-cols-4'
                                                : 'sm:grid-cols-2',
                                        )}
                                    >
                                        {members.map((host) => (
                                            <HostTile
                                                key={host.hostname}
                                                host={host}
                                                selected={host.hostname === selected}
                                                onSelect={(hostname) =>
                                                    setSelected((current) =>
                                                        current === hostname ? null : hostname,
                                                    )
                                                }
                                            />
                                        ))}
                                    </div>
                                </Card>
                            );
                        })}
                        <p className="text-xs text-muted-foreground">
                            Every host runs a NATS leaf or hub, so the mesh spans all three planes.
                            Select a host to list its containers.
                        </p>
                    </section>

                    {selectedHost ? (
                        <HostDetail host={selectedHost} />
                    ) : (
                        <Card className="p-5 text-sm text-muted-foreground">
                            Select a host above to see its containers, grouped by kind.
                        </Card>
                    )}

                    <div className="grid gap-6 lg:grid-cols-12">
                        <Card className="p-5 lg:col-span-7">
                            <h2 className="font-display text-lg font-semibold tracking-tight">
                                Container distribution
                            </h2>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Area is container count per host, coloured by plane.
                            </p>
                            <ChartContainer
                                config={{ size: { label: 'Containers' } }}
                                className="mt-4 aspect-[16/9] w-full"
                            >
                                <Treemap
                                    data={treemapData}
                                    dataKey="size"
                                    nameKey="name"
                                    // Per-node colour comes from each datum's
                                    // fill; this is the fallback when a node
                                    // carries none, so no tile renders blank.
                                    fill="hsl(var(--primary))"
                                    stroke="hsl(var(--background))"
                                    isAnimationActive={false}
                                >
                                    <Tooltip
                                        cursor={false}
                                        formatter={(value, _name, entry) => [
                                            `${value} containers`,
                                            entry?.payload?.plane || 'host',
                                        ]}
                                    />
                                </Treemap>
                            </ChartContainer>
                            <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
                                {planes.map((plane) => (
                                    <li key={plane.id} className="inline-flex items-center gap-1.5">
                                        <span
                                            className={cn(
                                                'h-2 w-2 rounded-full',
                                                plane.id === 'control' && 'bg-primary',
                                                plane.id === 'operations' && 'bg-[hsl(var(--teal))]',
                                                plane.id === 'intelligence' && 'bg-[hsl(var(--amber))]',
                                            )}
                                        />
                                        {plane.label}
                                    </li>
                                ))}
                            </ul>
                        </Card>

                        <div className="space-y-6 lg:col-span-5">
                            <Card className="p-5">
                                <h2 className="font-display text-lg font-semibold tracking-tight">
                                    Containers by kind
                                </h2>
                                <ul className="mt-4 space-y-3">
                                    {kindTotals.map(({ kind, count }) => {
                                        const meta = kindMeta(kind);
                                        return (
                                            <li key={kind}>
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="inline-flex items-center gap-2">
                                                        <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                                                        {meta.label}
                                                    </span>
                                                    <span className="text-muted-foreground">{count}</span>
                                                </div>
                                                <ProgressMeter
                                                    value={(count / totals.containers) * 100}
                                                    label="Share of fleet"
                                                    className="mt-1.5"
                                                />
                                            </li>
                                        );
                                    })}
                                </ul>
                            </Card>

                            <Card className="p-5">
                                <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                                    <AlertTriangle className="h-4 w-4 text-amber-warm" strokeWidth={2.1} />
                                    Monitors alerting
                                </h2>
                                <ul className="mt-4 space-y-3">
                                    {(report.alerts || []).map((alert) => (
                                        <li
                                            key={alert.monitor}
                                            className="border border-border bg-card p-3"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="min-w-0 flex-1 text-sm font-medium">
                                                    {alert.monitor}
                                                </p>
                                                <StatusBadge map={ALERT_SEVERITY} value={alert.severity} />
                                            </div>
                                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                                {alert.detail}
                                            </p>
                                            <p className="font-evidence mt-1 text-[11px] text-muted-foreground/80">
                                                scope: {alert.scope}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
