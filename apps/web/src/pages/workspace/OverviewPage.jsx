import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Radar,
    Target,
    Workflow,
    CheckCircle2,
    Plus,
    Link2,
    GraduationCap,
    Boxes,
    ArrowRight,
    Info,
    ShieldAlert,
    Users,
} from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useSeatFeed } from '@/hooks/useSeatFeed';
import EmptyState from '@/components/workspace/EmptyState';
import {
    PageHeader,
    StatCard,
    StatusBadge,
    MISSION_STATUS,
    SEAT_EVENT,
    SIGNAL_TYPE,
} from '@/components/workspace/workspaceHelpers';
import { Button, Card } from '@/components/site/ui';

function timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
}

export default function OverviewPage() {
    const navigate = useNavigate();
    const { active, loading: wsLoading } = useWorkspace();
    const { records: signals } = useWorkspaceRecords('signals', {
        sort: '-created',
    });
    const { records: missions } = useWorkspaceRecords('missions', {
        sort: '-created',
    });
    const { records: workflows } = useWorkspaceRecords('workflows');
    const { records: evidence } = useWorkspaceRecords('evidence', {
        extraFilter: 'type = "verified"',
    });
    const { events: seatEvents, live: seatLive } = useSeatFeed({ limit: 6 });

    const activeMissions = missions.filter((m) =>
        ['approved', 'running', 'needs_attention'].includes(m.status),
    );
    const verifiedCount = evidence.length;

    const domainRecord = active?.expand?.domain;
    const domainVerified = domainRecord?.status === 'verified';

    const QUICK_ACTIONS = [
        {
            icon: Target,
            label: 'Start a mission',
            hint: 'Turn a signal into a bounded, approved task.',
            to: '/app/missions',
        },
        {
            icon: Plus,
            label: 'Add a business goal',
            hint: 'Record an objective in the ERP workspace.',
            to: '/app/erp',
        },
        {
            icon: Link2,
            label: 'Connect a source',
            hint: 'Wire up a self-hosted service in Operations.',
            to: '/app/operations',
        },
        {
            icon: Workflow,
            label: 'Create a workflow',
            hint: 'Define a repeatable automation.',
            to: '/app/workflows',
        },
        {
            icon: GraduationCap,
            label: 'Open tutorials',
            hint: 'Learn the Observe → Verify loop.',
            to: '/app/tutorials',
        },
        {
            icon: Boxes,
            label: 'Open ERP workspace',
            hint: 'Objectives, tasks, and contacts.',
            to: '/app/erp',
        },
    ];

    return (
        <div className="space-y-8">
            <PageHeader
                title="Front Page"
                description="A live picture of what BuildAndDo noticed, what it's doing, and what it verified — for this workspace only."
            />

            {/* Domain / verification banner */}
            {!wsLoading && active && (
                <Card className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                                <Radar className="h-4 w-4" />
                            </span>
                            <div className="text-sm">
                                <p className="font-medium">
                                    {domainRecord?.domain || 'No website connected'}
                                </p>
                                <p className="mt-0.5 text-muted-foreground">
                                    {domainVerified
                                        ? 'Domain verified — deeper analysis is authorized.'
                                        : 'Domain selected for analysis only. Confirm ownership or authorization before deeper analysis or actions.'}
                                </p>
                            </div>
                        </div>
                        {domainRecord && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => navigate('/app/settings')}
                            >
                                Verify domain
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </Card>
            )}

            {/* Stat cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    icon={Radar}
                    label="Business signals"
                    value={signals.length}
                    hint={signals.length ? 'Observed changes in this workspace' : 'No signals collected yet'}
                    tone="violet"
                />
                <StatCard
                    icon={Target}
                    label="Active missions"
                    value={activeMissions.length}
                    hint={activeMissions.length ? 'Approved, running, or need attention' : 'No missions running'}
                    tone="amber"
                />
                <StatCard
                    icon={Workflow}
                    label="Workflow health"
                    value={workflows.filter((w) => w.status === 'active').length}
                    hint={`${workflows.length} workflow${workflows.length === 1 ? '' : 's'} total`}
                    tone="neutral"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Verified outcomes"
                    value={verifiedCount}
                    hint={verifiedCount ? 'Missions with verified results' : 'Nothing verified yet'}
                    tone="teal"
                />
            </div>

            {/* What changed feed + active missions */}
            <div className="grid gap-6 lg:grid-cols-12">
                <section className="lg:col-span-7">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-display text-lg font-semibold tracking-tight">
                            What changed
                        </h2>
                        <button
                            type="button"
                            onClick={() => navigate('/app/signals')}
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            View all
                        </button>
                    </div>
                    {signals.length === 0 ? (
                        <EmptyState
                            icon={Radar}
                            title="No signals collected yet"
                            description="BuildAndDo will list observed changes here — each with its source, timestamp, confidence, and whether it's a fact, an inference, or something you provided. Connect a source in Operations to start collecting."
                            action={
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => navigate('/app/operations')}
                                >
                                    <Link2 className="h-4 w-4" />
                                    Connect a source
                                </Button>
                            }
                        />
                    ) : (
                        <ul className="space-y-2.5">
                            {signals.slice(0, 5).map((s) => (
                                <li key={s.id}>
                                    <Card className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">
                                                    {s.title}
                                                </p>
                                                {s.description && (
                                                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                                        {s.description}
                                                    </p>
                                                )}
                                            </div>
                                            <StatusBadge
                                                map={SIGNAL_TYPE}
                                                value={s.type}
                                            />
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                            <span>Source: {s.source || '—'}</span>
                                            <span>{timeAgo(s.created)}</span>
                                            {s.confidence != null && (
                                                <span>
                                                    Confidence:{' '}
                                                    {Math.round(s.confidence)}%
                                                </span>
                                            )}
                                        </div>
                                    </Card>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="lg:col-span-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-display text-lg font-semibold tracking-tight">
                            Active missions
                        </h2>
                        <button
                            type="button"
                            onClick={() => navigate('/app/missions')}
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            View all
                        </button>
                    </div>
                    {activeMissions.length === 0 ? (
                        <EmptyState
                            icon={Target}
                            title="No missions yet"
                            description="A mission is a bounded, approved task with a clear goal and scope. Start one from a signal — you review the plan before anything runs."
                            action={
                                <Button size="sm" onClick={() => navigate('/app/missions')}>
                                    <Plus className="h-4 w-4" />
                                    Start a mission
                                </Button>
                            }
                        />
                    ) : (
                        <ul className="space-y-2.5">
                            {activeMissions.slice(0, 5).map((m) => (
                                <li key={m.id}>
                                    <Card className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="truncate text-sm font-medium">
                                                {m.title}
                                            </p>
                                            <StatusBadge
                                                map={MISSION_STATUS}
                                                value={m.status}
                                            />
                                        </div>
                                        {m.description && (
                                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                                {m.description}
                                            </p>
                                        )}
                                    </Card>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            {/* Seat activity */}
            <section>
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-display text-lg font-semibold tracking-tight">
                        Seat activity
                    </h2>
                    <span className="font-evidence text-[11px] text-muted-foreground">
                        {seatLive ? 'realtime connected' : 'history only'}
                    </span>
                </div>
                {seatEvents.length === 0 ? (
                    <EmptyState
                        icon={Users}
                        title="No seat activity recorded"
                        description="When more than one person or agent seat works this workspace, they announce joining, progress, completion, blockage, and handoff here. An empty feed means nothing has been announced — not that nothing happened."
                    />
                ) : (
                    <ul className="space-y-2.5">
                        {seatEvents.map((e) => (
                            <li key={e.id}>
                                <Card className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                                {e.summary}
                                            </p>
                                            <p className="mt-0.5 font-evidence text-[11px] text-muted-foreground">
                                                {e.seat} ({e.actorType})
                                                {e.subjectType ? ` · ${e.subjectType}` : ''}
                                                {e.handoffTo ? ` → ${e.handoffTo}` : ''} ·{' '}
                                                {timeAgo(e.createdAt)}
                                            </p>
                                        </div>
                                        <StatusBadge map={SEAT_EVENT} value={e.event} />
                                    </div>
                                </Card>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Quick actions */}
            <section>
                <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
                    Quick actions
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {QUICK_ACTIONS.map((a) => (
                        <button
                            key={a.label}
                            type="button"
                            onClick={() => navigate(a.to)}
                            className="group flex items-start gap-3 rounded-[var(--radius)] border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-secondary/30"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                                <a.icon className="h-4 w-4" strokeWidth={2.1} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">
                                    {a.label}
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {a.hint}
                                </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                        </button>
                    ))}
                </div>
            </section>

            {/* Trust language */}
            <Card className="border-[hsl(var(--amber))]/30 bg-[hsl(var(--amber))]/5 p-5">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-warm" />
                    <div className="text-sm leading-relaxed text-muted-foreground">
                        <p className="font-medium text-foreground">
                            How BuildAndDo keeps things honest
                        </p>
                        <p className="mt-1">
                            A found domain is not an authorized domain. BuildAndDo
                            distinguishes observed facts, inferred conclusions,
                            proposed actions, approved actions, and verified
                            outcomes — and never displays sensitive credentials
                            in the dashboard. Self-hosted services require explicit
                            connection and your own security controls.
                        </p>
                    </div>
                </div>
            </Card>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Empty states are intentional for a new account — BuildAndDo does
                not invent business activity. Add real signals, missions, and
                workflows as you go.
            </p>
        </div>
    );
}
