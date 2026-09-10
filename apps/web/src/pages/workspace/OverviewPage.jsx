// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/OverviewPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js,
//              apps/web/src/lib/workspaceActions.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js;
//              PRODUCES workspace.quick_action
// Intent:      Answer "what is happening in this workspace" in one screen —
//              one merged activity feed, counts that mean something, and an
//              honest statement when the data layer cannot be read.
// ───────────────────────────────────────────────────────────────

import {
    ArrowRight,
    Boxes,
    CheckCircle2,
    FileSearch,
    GraduationCap,
    Info,
    Link2,
    Newspaper,
    Plus,
    Radar,
    ShieldAlert,
    Target,
    Workflow,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card } from '@/components/site/ui';
import EmptyState from '@/components/workspace/EmptyState';
import {
    MISSION_PRIORITY,
    MISSION_STATUS,
    PageHeader,
    ProgressMeter,
    SIGNAL_SEVERITY,
    StatCard,
    StatusBadge,
} from '@/components/workspace/workspaceHelpers';
import {
    DegradedNotice,
    DemoModeToggle,
    ListSkeleton,
} from '@/components/workspace/WorkspaceNotices';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { trackWorkspaceAction, WORKSPACE_ACTIONS } from '@/lib/workspaceActions';

const ACTIVE_MISSION_STATES = ['approved', 'running', 'needs_attention'];

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

const FEED_SOURCES = [
    {
        key: 'signals',
        icon: Radar,
        route: '/app/signals',
        label: (record) => record.title,
        detail: (record) => `Signal observed · ${record.source || 'no source recorded'}`,
    },
    {
        key: 'missions',
        icon: Target,
        route: '/app/missions',
        label: (record) => record.title,
        detail: (record) => `Mission ${MISSION_STATUS[record.status]?.label.toLowerCase() || record.status}`,
    },
    {
        key: 'evidence',
        icon: FileSearch,
        route: '/app/evidence',
        label: (record) => record.title || record.content,
        detail: (record) => `Evidence recorded · ${record.type}`,
    },
    {
        key: 'editions',
        icon: Newspaper,
        route: '/app/edition',
        label: (record) => record.title,
        detail: () => 'Daily edition written',
    },
];

export default function OverviewPage() {
    const navigate = useNavigate();
    const { active, loading: wsLoading } = useWorkspace();

    const signals = useWorkspaceRecords('signals', { sort: '-created' });
    const missions = useWorkspaceRecords('missions', { sort: '-created' });
    const workflows = useWorkspaceRecords('workflows');
    const evidence = useWorkspaceRecords('evidence', { sort: '-created' });
    const editions = useWorkspaceRecords('daily_editions', { sort: '-created' });

    const loading =
        signals.loading || missions.loading || workflows.loading || evidence.loading;

    // A single degraded read makes every count on this page a lower bound.
    // Saying so once, at the top, is more honest than five silent zeroes.
    const degradedSources = [
        signals.degraded && 'signals',
        missions.degraded && 'missions',
        workflows.degraded && 'workflows',
        evidence.degraded && 'evidence',
        editions.degraded && 'editions',
    ].filter(Boolean);

    const activeMissions = useMemo(
        () => missions.records.filter((mission) => ACTIVE_MISSION_STATES.includes(mission.status)),
        [missions.records],
    );

    const untriagedSignals = useMemo(
        () => signals.records.filter((signal) => (signal.state || 'new') === 'new'),
        [signals.records],
    );

    const verifiedCount = useMemo(
        () => evidence.records.filter((entry) => entry.type === 'verified').length,
        [evidence.records],
    );

    // One merged feed rather than four lists: the operator's question is "what
    // happened here", and the answer is chronological across collections.
    const feed = useMemo(() => {
        const byKey = {
            signals: signals.records,
            missions: missions.records,
            evidence: evidence.records,
            editions: editions.records,
        };
        return FEED_SOURCES.flatMap((source) =>
            (byKey[source.key] || []).map((record) => ({
                id: `${source.key}:${record.id}`,
                icon: source.icon,
                route: source.route,
                label: source.label(record),
                detail: source.detail(record),
                at: record.created,
            })),
        )
            .filter((item) => item.label)
            .sort((a, b) => new Date(b.at) - new Date(a.at))
            .slice(0, 8);
    }, [signals.records, missions.records, evidence.records, editions.records]);

    const domainRecord = active && active.expand && active.expand.domain;
    const domainVerified = domainRecord && domainRecord.status === 'verified';

    const go = (to, label) => {
        trackWorkspaceAction(WORKSPACE_ACTIONS.QUICK_ACTION, { target: to, label });
        navigate(to);
    };

    const retryAll = () => {
        signals.refresh();
        missions.refresh();
        workflows.refresh();
        evidence.refresh();
        editions.refresh();
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Front Page"
                description="A live picture of what BuildAndDo noticed, what it's doing, and what it verified — for this workspace only."
            />


            {degradedSources.length > 0 && (
                <DegradedNotice
                    message={`Could not read ${degradedSources.join(', ')}. Every number below is a lower bound, not a total.`}
                    onRetry={retryAll}
                />
            )}

            {!wsLoading && active && (
                <Card className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                                <Radar className="h-4 w-4" />
                            </span>
                            <div className="text-sm">
                                <p className="font-medium">
                                    {(domainRecord && domainRecord.domain) || 'No website connected'}
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
                                className="shrink-0"
                                onClick={() => go('/app/settings', 'verify-domain')}
                            >
                                Verify domain
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    icon={Radar}
                    label="Signals awaiting triage"
                    value={untriagedSignals.length}
                    hint={
                        signals.records.length
                            ? `${signals.records.length} collected in total`
                            : 'No signals collected yet'
                    }
                    tone="violet"
                />
                <StatCard
                    icon={Target}
                    label="Active missions"
                    value={activeMissions.length}
                    hint={
                        activeMissions.length
                            ? 'Approved, running, or need attention'
                            : 'No missions running'
                    }
                    tone="amber"
                />
                <StatCard
                    icon={Workflow}
                    label="Workflows active"
                    value={workflows.records.filter((workflow) => workflow.status === 'active').length}
                    hint={`${workflows.records.length} workflow${workflows.records.length === 1 ? '' : 's'} defined`}
                    tone="neutral"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Verified outcomes"
                    value={verifiedCount}
                    hint={verifiedCount ? 'Evidence checked against a source' : 'Nothing verified yet'}
                    tone="teal"
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-12">
                <section className="lg:col-span-7">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-display text-lg font-semibold tracking-tight">
                            Recent activity
                        </h2>
                        <button
                            type="button"
                            onClick={() => go('/app/evidence', 'view-all-activity')}
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            View the ledger
                        </button>
                    </div>
                    {loading ? (
                        <ListSkeleton rows={3} />
                    ) : feed.length === 0 ? (
                        <EmptyState
                            icon={Radar}
                            title="Nothing has happened here yet"
                            description="Signals, missions, evidence and editions all appear in this feed as they are recorded. Connect a source in Operations to start collecting, or add the first record by hand."
                            action={
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => go('/app/operations', 'connect-source')}
                                    >
                                        <Link2 className="h-4 w-4" />
                                        Connect a source
                                    </Button>
                                    <DemoModeToggle />
                                </div>
                            }
                        />
                    ) : (
                        <ul className="space-y-2">
                            {feed.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => navigate(item.route)}
                                        className="flex w-full items-start gap-3 border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
                                    >
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
                                            <item.icon className="h-4 w-4" strokeWidth={2.1} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">
                                                {item.label}
                                            </span>
                                            <span className="mt-0.5 block text-xs text-muted-foreground">
                                                {item.detail} · {timeAgo(item.at)}
                                            </span>
                                        </span>
                                    </button>
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
                            onClick={() => go('/app/missions', 'view-all-missions')}
                            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            View all
                        </button>
                    </div>
                    {loading ? (
                        <ListSkeleton rows={2} />
                    ) : activeMissions.length === 0 ? (
                        <EmptyState
                            icon={Target}
                            title="No missions yet"
                            description="A mission is a bounded, approved task with a clear goal and scope. Start one from a signal — you review the plan before anything runs."
                            action={
                                <Button size="sm" onClick={() => go('/app/missions', 'start-mission')}>
                                    <Plus className="h-4 w-4" />
                                    Start a mission
                                </Button>
                            }
                        />
                    ) : (
                        <ul className="space-y-2.5">
                            {activeMissions.slice(0, 5).map((mission) => (
                                <li key={mission.id}>
                                    <Card className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="min-w-0 flex-1 truncate text-sm font-medium">
                                                {mission.title}
                                            </p>
                                            <StatusBadge
                                                map={MISSION_STATUS}
                                                value={mission.status}
                                            />
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <StatusBadge
                                                map={MISSION_PRIORITY}
                                                value={mission.priority || 'normal'}
                                            />
                                            <span className="text-xs text-muted-foreground">
                                                {timeAgo(mission.created)}
                                            </span>
                                        </div>
                                        {mission.progress != null && (
                                            <ProgressMeter
                                                value={mission.progress}
                                                className="mt-3"
                                            />
                                        )}
                                    </Card>
                                </li>
                            ))}
                        </ul>
                    )}

                    {untriagedSignals.length > 0 && (
                        <div className="mt-6">
                            <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
                                Awaiting triage
                            </h2>
                            <ul className="space-y-2">
                                {untriagedSignals.slice(0, 4).map((signal) => (
                                    <li key={signal.id}>
                                        <button
                                            type="button"
                                            onClick={() => navigate('/app/signals')}
                                            className="flex w-full items-start justify-between gap-3 border border-border bg-card p-3 text-left transition-colors hover:border-primary/40"
                                        >
                                            <span className="min-w-0 flex-1 truncate text-sm">
                                                {signal.title}
                                            </span>
                                            <StatusBadge
                                                map={SIGNAL_SEVERITY}
                                                value={signal.severity || 'info'}
                                            />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            </div>

            <section>
                <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">
                    Quick actions
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {QUICK_ACTIONS.map((action) => (
                        <button
                            key={action.label}
                            type="button"
                            onClick={() => go(action.to, action.label)}
                            className={cn(
                                'group flex items-start gap-3 rounded-[var(--radius)] border border-border bg-card p-4 text-left transition-colors',
                                'hover:border-primary/40 hover:bg-secondary/30',
                            )}
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                                <action.icon className="h-4 w-4" strokeWidth={2.1} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-medium">{action.label}</span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {action.hint}
                                </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                        </button>
                    ))}
                </div>
            </section>

            <Card className="border-[hsl(var(--amber))]/30 bg-[hsl(var(--amber))]/5 p-5">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-warm" />
                    <div className="text-sm leading-relaxed text-muted-foreground">
                        <p className="font-medium text-foreground">
                            How BuildAndDo keeps things honest
                        </p>
                        <p className="mt-1">
                            A found domain is not an authorized domain. BuildAndDo distinguishes
                            observed facts, inferred conclusions, proposed actions, approved
                            actions, and verified outcomes — and never displays sensitive
                            credentials in the dashboard. Self-hosted services require explicit
                            connection and your own security controls.
                        </p>
                    </div>
                </div>
            </Card>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Empty states are intentional for a new account — BuildAndDo does not invent
                business activity. Add real signals, missions, and workflows as you go.
            </p>
        </div>
    );
}
