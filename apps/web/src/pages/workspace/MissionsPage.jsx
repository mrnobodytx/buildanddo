// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/MissionsPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js,
//              apps/web/src/lib/workspaceActions.js,
//              apps/web/src/components/workspace/ListToolbar.jsx,
//              apps/web/src/components/workspace/missions/MissionBuilder.jsx,
//              apps/web/src/components/workspace/missions/MissionReview.jsx,
//              apps/web/src/components/workspace/missions/MissionLearning.jsx,
//              apps/web/src/components/workspace/missions/MissionGuide.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js;
//              PRODUCES workspace.mission.create;
//              PRODUCES workspace.mission.update;
//              CONSUMES apps/web/src/components/workspace/missions/MissionBuilder.jsx;
//              CONSUMES apps/web/src/components/workspace/missions/MissionReview.jsx;
//              CONSUMES apps/web/src/components/workspace/missions/MissionLearning.jsx;
//              CONSUMES apps/web/src/components/workspace/missions/MissionGuide.jsx
// Intent:      Make a list of missions triageable — priority, progress, due
//              dates, editing and deletion — instead of an append-only stack.
// ───────────────────────────────────────────────────────────────

import { MotionList } from '@/components/motion/MotionPrimitives';
import { useMotionPreferences } from '@/contexts/MotionContext';
import React, { useMemo, useRef, useState } from 'react';
import { CalendarClock, Plus, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import EmptyState from '@/components/workspace/EmptyState';
import ListToolbar from '@/components/workspace/ListToolbar';
import PreviousWorkNote from '@/components/workspace/PreviousWorkNote';
import MissionBuilder from '@/components/workspace/missions/MissionBuilder';
import MissionGuide from '@/components/workspace/missions/MissionGuide';
import MissionLearning from '@/components/workspace/missions/MissionLearning';
import MissionReview from '@/components/workspace/missions/MissionReview';
import {
    MISSION_PRIORITY,
    MISSION_STATUS,
    PageHeader,
    ProgressMeter,
    StatusBadge,
} from '@/components/workspace/workspaceHelpers';
import {
    DegradedNotice,
    DemoModeToggle,
    ListSkeleton,
    WriteErrorNotice,
} from '@/components/workspace/WorkspaceNotices';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { usePreviousWork } from '@/hooks/usePreviousWork';
import { useShapedRecords, useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { describeDueDate, timeAgo } from '@/lib/format';
import { PLAN_FIELDS, TRANSITIONS, learningRewards, planIssues } from '@/lib/missionLearning';
import { cn } from '@/lib/utils';

const STAGES = Object.keys(TRANSITIONS);
const TERMINAL = ['verified', 'failed'];
const PRIORITIES = Object.keys(MISSION_PRIORITY);
const priorityRank = (mission) => {
    const rank = PRIORITIES.indexOf(mission.priority);
    return rank < 0 ? PRIORITIES.indexOf('normal') : rank;
};
const SORTS = {
    priority: {
        label: 'Priority',
        compare: (a, b) =>
            priorityRank(a) - priorityRank(b) || new Date(b.created) - new Date(a.created),
    },
    due: {
        label: 'Due date',
        compare: (a, b) =>
            (a.due_date ? new Date(a.due_date).getTime() : Infinity) -
            (b.due_date ? new Date(b.due_date).getTime() : Infinity),
    },
    stage: {
        label: 'Stage',
        compare: (a, b) => STAGES.indexOf(a.status) - STAGES.indexOf(b.status),
    },
    newest: { label: 'Newest', compare: (a, b) => new Date(b.created) - new Date(a.created) },
};

function SavedPlan({ mission }) {
    return (
        <details className="border border-border p-4">
            <summary className="min-h-8 cursor-pointer font-semibold">
                Inspect the saved mission plan
            </summary>
            <p className="mt-3 text-sm">
                Risk tier: {mission.mission_plan?.risk || 'Not recorded'}
            </p>
            <dl className="mt-3 space-y-3 text-sm">
                {PLAN_FIELDS.map((field) => (
                    <div key={field.id}>
                        <dt className="font-semibold">{field.label}</dt>
                        <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                            {mission.mission_plan?.[field.id] || 'Not yet recorded'}
                        </dd>
                    </div>
                ))}
            </dl>
            {mission.mission_approved_at && (
                <p className="mt-4 text-xs text-muted-foreground">
                    Approval recorded at {mission.mission_approved_at} by account{' '}
                    {mission.mission_approved_by}.
                </p>
            )}
        </details>
    );
}

function MissionDesk() {
    const { setDemo } = useDemoMode();
    const missions = useWorkspaceRecords('missions', { sort: '-created' });
    const evidence = useWorkspaceRecords('evidence', { sort: '-created' });
    const {
        records,
        loading,
        degraded,
        demo,
        refresh,
        create,
        update,
        remove,
        writeError,
        clearWriteError,
    } = missions;
    const [builder, setBuilder] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [approvalId, setApprovalId] = useState(null);
    const [approvalConfirmed, setApprovalConfirmed] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [sortKey, setSortKey] = useState('priority');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const pending = useRef(false);
    const { preferences, motion, update: updateMotion } = useMotionPreferences();
    const effects = preferences.categories.learning;
    const normalised = useMemo(
        () => records.map((mission) => ({ ...mission, priority: mission.priority || 'normal' })),
        [records],
    );
    const visible = useShapedRecords(normalised, {
        query,
        searchFields: ['title', 'description'],
        filters: { status: statusFilter, priority: priorityFilter },
        sort: SORTS[sortKey].compare,
    });
    const previous = usePreviousWork(
        'mission',
        demo ? [] : normalised.map((mission) => mission.id),
    );
    const detail = records.find((mission) => mission.id === detailId);
    const approval = records.find((mission) => mission.id === approvalId);
    const selected = records.find((mission) => mission.id === builder);
    const disabled = demo || busy || degraded || loading;
    const openBuilder = (id = 'new') => {
        clearWriteError();
        setBuilder(id);
    };
    const toggleEffects = (enabled) => updateMotion({ categories: { learning: enabled } });
    const mutate = async (operation, successMessage = '') => {
        if (pending.current || demo)
            return {
                ok: false,
                error: demo
                    ? 'Demonstration mode is read-only.'
                    : 'Wait for the current save to finish.',
            };
        pending.current = true;
        setBusy(true);
        clearWriteError();
        setNotice('');
        try {
            const result = await operation();
            if (result.ok) previous.refresh();
            if (result.ok && successMessage) setNotice(successMessage);
            return result;
        } finally {
            pending.current = false;
            setBusy(false);
        }
    };
    const savePlan = async (data) => {
        const result = await mutate(
            () => (selected ? update(selected.id, data) : create(data)),
            'Mission draft saved. Review the saved plan before approving it.',
        );
        if (result.ok) {
            setBuilder(null);
            setDetailId(result.record.id);
        }
        return result;
    };
    const changeStatus = (mission, status) =>
        mutate(
            () => update(mission.id, { status }),
            `${MISSION_STATUS[status].label} recorded. No automation was executed by this action.`,
        );
    const approve = async () => {
        if (!approvalConfirmed || !approval || planIssues(approval.mission_plan).length) return;
        const result = await changeStatus(approval, 'approved');
        if (result.ok) setApprovalId(null);
    };
    const destroy = async () => {
        const result = await mutate(() => remove(confirmDelete.id), 'Mission deleted.');
        if (result.ok) setConfirmDelete(null);
    };
    const openMissions = records.filter((mission) => !TERMINAL.includes(mission.status));
    const overdueCount = openMissions.filter(
        (mission) => mission.due_date && new Date(mission.due_date).getTime() < Date.now(),
    ).length;
    return (
        <div
            className="mission-effects ph-no-capture space-y-8"
            data-effects={motion.categories.learning ? 'on' : 'off'}
            data-dd-privacy="mask"
        >
            <PageHeader
                title="Challenge Desk"
                description="Build missions with a clear why, an approved plan and checkable evidence. Learn as you plan, record work and review the outcome."
                actions={
                    <Button size="sm" onClick={() => openBuilder()} disabled={disabled}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Start a mission
                    </Button>
                }
            />
            <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                    {openMissions.length} open · {overdueCount} past due · {records.length} total.
                    Learning points are separate from mission outcomes.
                </p>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={effects}
                        onChange={(event) => toggleEffects(event.target.checked)}
                    />
                    Learning animations
                </label>
            </div>
            <p className="text-xs text-muted-foreground">
                Animations also respect your system’s reduced-motion preference. Every result is
                available as text.
            </p>
            {demo && (
                <p role="status" className="border border-border p-3 text-sm">
                    Demonstration mode is read-only. Switch it off to save missions, evidence or
                    learning progress.{' '}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDemo(false)}>
                        Show real data
                    </Button>
                </p>
            )}
            <MissionGuide />
            <div aria-label="Mission stages" className="flex flex-wrap gap-2">
                {STAGES.map((stage) => (
                    <StatusBadge key={stage} map={MISSION_STATUS} value={stage} />
                ))}
            </div>
            <p className="text-sm text-muted-foreground">
                Proposed → Approved → Running → Verified or Failed. Pause with Needs attention;
                revise as a new proposal before changing an approved plan. A finished mission is not
                reopened.
            </p>
            {notice && (
                <p
                    key={notice}
                    role="status"
                    className="mission-reward border border-border p-3 text-sm"
                >
                    {notice}
                </p>
            )}
            <WriteErrorNotice message={writeError} onDismiss={clearWriteError} />
            {records.length > 0 && (
                <ListToolbar
                    query={query}
                    onQueryChange={setQuery}
                    placeholder="Search missions"
                    resultCount={visible.length}
                    totalCount={records.length}
                    filters={[
                        {
                            key: 'status',
                            label: 'Stage',
                            value: statusFilter,
                            onChange: setStatusFilter,
                            options: [
                                { value: 'all', label: 'All stages' },
                                ...STAGES.map((value) => ({
                                    value,
                                    label: MISSION_STATUS[value].label,
                                })),
                            ],
                        },
                        {
                            key: 'priority',
                            label: 'Priority',
                            value: priorityFilter,
                            onChange: setPriorityFilter,
                            options: [
                                { value: 'all', label: 'All priorities' },
                                ...PRIORITIES.map((value) => ({
                                    value,
                                    label: MISSION_PRIORITY[value].label,
                                })),
                            ],
                        },
                        {
                            key: 'sort',
                            label: 'Sort',
                            value: sortKey,
                            onChange: setSortKey,
                            options: Object.entries(SORTS).map(([value, sort]) => ({
                                value,
                                label: `Sort: ${sort.label}`,
                            })),
                        },
                    ]}
                />
            )}
            {degraded ? (
                <DegradedNotice onRetry={refresh} />
            ) : loading ? (
                <ListSkeleton rows={3} />
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Target}
                    title="No missions yet"
                    description="Save a draft, learn how to bound it, then approve the plan before recording any work."
                    action={
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" disabled={disabled} onClick={() => openBuilder()}>
                                Start a mission
                            </Button>
                            <DemoModeToggle />
                        </div>
                    }
                />
            ) : visible.length === 0 ? (
                <Card className="p-8 text-center text-sm">No mission matches those filters.</Card>
            ) : (
                <MotionList as="ul" itemsKey={visible.map((mission) => mission.id).join(':')} aria-label="Missions" className="space-y-4">
                    {visible.map((mission) => {
                        const issues = planIssues(mission.mission_plan);
                        const due = describeDueDate(mission.due_date);
                        const points = learningRewards(
                            mission,
                            evidence.degraded ? [] : evidence.records,
                        ).points;
                        return (
                            <li key={mission.id} data-motion-key={mission.id}>
                                <Card className="p-5">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                                        <div className="min-w-0">
                                            <h2 className="font-display text-xl font-semibold">
                                                {mission.title}
                                            </h2>
                                            {mission.description && (
                                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                    {mission.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 flex-wrap items-start gap-2">
                                            <StatusBadge
                                                map={MISSION_PRIORITY}
                                                value={mission.priority}
                                            />
                                            <StatusBadge
                                                map={MISSION_STATUS}
                                                value={mission.status}
                                            />
                                        </div>
                                    </div>
                                    {mission.progress != null && (
                                        <div className="mt-4">
                                            <p className="text-xs text-muted-foreground">
                                                Self-reported work progress
                                            </p>
                                            <ProgressMeter value={mission.progress} />
                                        </div>
                                    )}
                                    <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                                        <span>Created {timeAgo(mission.created)}</span>
                                        <span>{points} / 100 learning points</span>
                                        {due.label && (
                                            <span
                                                className={cn(
                                                    'inline-flex items-center gap-1',
                                                    due.overdue && 'text-destructive',
                                                )}
                                            >
                                                <CalendarClock
                                                    className="h-3.5 w-3.5"
                                                    aria-hidden="true"
                                                />
                                                {due.label}
                                            </span>
                                        )}
                                    </div>
                                    <PreviousWorkNote history={previous.history[mission.id]} onRetry={previous.refresh} />
                                    {mission.status === 'proposed' && issues.length > 0 && (
                                        <p className="mt-3 text-xs text-muted-foreground">
                                            Complete {issues.length} plan items before approval.
                                            Learning checks are available now.
                                        </p>
                                    )}
                                    {['approved', 'needs_attention', 'running'].includes(
                                        mission.status,
                                    ) &&
                                        (!mission.mission_approved_by ||
                                            !mission.mission_approved_at ||
                                            issues.length > 0) && (
                                            <p className="mt-3 text-xs text-muted-foreground">
                                                This legacy mission needs a structured plan and
                                                recorded approval. Pause any running work, then
                                                revise the proposal.
                                            </p>
                                        )}
                                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setDetailId(mission.id)}
                                        >
                                            Learn and review
                                            <span className="sr-only">: {mission.title}</span>
                                        </Button>
                                        {['proposed', 'approved', 'needs_attention'].includes(
                                            mission.status,
                                        ) && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                disabled={disabled}
                                                onClick={() => openBuilder(mission.id)}
                                            >
                                                {mission.status === 'proposed'
                                                    ? 'Edit plan'
                                                    : 'Revise as proposal'}
                                            </Button>
                                        )}
                                        {mission.status === 'proposed' && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={disabled || issues.length > 0}
                                                onClick={() => {
                                                    setApprovalConfirmed(false);
                                                    setApprovalId(mission.id);
                                                }}
                                            >
                                                Review approval
                                            </Button>
                                        )}
                                        {['approved', 'needs_attention'].includes(
                                            mission.status,
                                        ) && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={
                                                    disabled ||
                                                    issues.length > 0 ||
                                                    !mission.mission_approved_by ||
                                                    !mission.mission_approved_at
                                                }
                                                onClick={() => changeStatus(mission, 'running')}
                                            >
                                                {mission.status === 'approved'
                                                    ? 'Record work started'
                                                    : 'Record work resumed'}
                                            </Button>
                                        )}
                                        {mission.status === 'running' && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                disabled={disabled}
                                                onClick={() =>
                                                    changeStatus(mission, 'needs_attention')
                                                }
                                            >
                                                Pause for attention
                                            </Button>
                                        )}
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            disabled={disabled}
                                            onClick={() => {
                                                clearWriteError();
                                                setConfirmDelete(mission);
                                            }}
                                        >
                                            Delete<span className="sr-only">: {mission.title}</span>
                                        </Button>
                                    </div>
                                </Card>
                            </li>
                        );
                    })}
                </MotionList>
            )}
            <Dialog
                open={Boolean(builder)}
                onOpenChange={(open) => !open && !busy && setBuilder(null)}
            >
                <DialogContent
                    className="mission-effects ph-no-capture sm:max-w-3xl"
                    data-effects={motion.categories.learning ? 'on' : 'off'}
                    data-dd-privacy="mask"
                >
                    <DialogHeader>
                        <DialogTitle>
                            {selected ? 'Revise mission plan' : 'Start a mission'}
                        </DialogTitle>
                        <DialogDescription>
                            Save a draft at any step. Approval happens after the plan is saved.
                        </DialogDescription>
                    </DialogHeader>
                    {builder && (
                        <MissionBuilder
                            key={builder}
                            mission={selected}
                            onSave={savePlan}
                            onCancel={() => setBuilder(null)}
                            disabled={demo || degraded}
                        />
                    )}
                </DialogContent>
            </Dialog>
            <Dialog
                open={Boolean(approval)}
                onOpenChange={(open) => !open && !busy && setApprovalId(null)}
            >
                <DialogContent className="sm:max-w-2xl ph-no-capture" data-dd-privacy="mask">
                    <DialogHeader>
                        <DialogTitle>Approve the saved mission</DialogTitle>
                        <DialogDescription>
                            Confirm your authority and review the boundaries. Approval does not
                            execute work.
                        </DialogDescription>
                    </DialogHeader>
                    {approval && (
                        <>
                            <h3 className="font-semibold">{approval.title}</h3>
                            <SavedPlan mission={approval} />
                            <label className="flex min-h-11 items-start gap-3 border border-border p-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={approvalConfirmed}
                                    disabled={busy}
                                    onChange={(event) => setApprovalConfirmed(event.target.checked)}
                                    className="mt-1"
                                />
                                <span>
                                    I have authority to approve this bounded plan and have reviewed
                                    its purpose, risk, checks and recovery steps.
                                </span>
                            </label>
                            <WriteErrorNotice message={writeError} onDismiss={clearWriteError} />
                            <DialogFooter>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={
                                        disabled ||
                                        !approvalConfirmed ||
                                        planIssues(approval.mission_plan).length > 0
                                    }
                                    onClick={approve}
                                >
                                    {busy ? 'Saving…' : 'Record approval'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
            <Dialog
                open={Boolean(detail) && !builder}
                onOpenChange={(open) => !open && setDetailId(null)}
            >
                <DialogContent
                    className="mission-effects ph-no-capture sm:max-w-4xl"
                    data-effects={motion.categories.learning ? 'on' : 'off'}
                    data-dd-privacy="mask"
                >
                    <DialogHeader>
                        <DialogTitle>{detail?.title}</DialogTitle>
                        <DialogDescription>
                            Learn, inspect the saved plan, and review actual outcomes.
                        </DialogDescription>
                    </DialogHeader>
                    {detail && (
                        <div key={detail.id} className="space-y-7">
                            <SavedPlan mission={detail} />
                            <Link to={`/app/research?mission=${encodeURIComponent(detail.id)}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Open this mission’s research and source review</Link>
                            <MissionLearning
                                mission={detail}
                                evidence={evidence.degraded ? [] : evidence.records}
                                disabled={disabled}
                                onSave={(answers) =>
                                    mutate(() => update(detail.id, { mission_learning: answers }))
                                }
                            />
                            {['running', 'needs_attention', 'verified', 'failed'].includes(
                                detail.status,
                            ) ? (
                                <MissionReview
                                    mission={detail}
                                    evidence={evidence.records}
                                    evidenceLoading={evidence.loading}
                                    evidenceDegraded={evidence.degraded}
                                    onRefreshEvidence={evidence.refresh}
                                    disabled={disabled}
                                    onSave={(data) => mutate(() => update(detail.id, data))}
                                    onEvidence={(data) => mutate(() => evidence.create(data))}
                                />
                            ) : (
                                <p className="border border-border p-4 text-sm">
                                    Save a complete plan, record approval and record work started
                                    before adding a TEVV review.
                                </p>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            <Dialog
                open={Boolean(confirmDelete)}
                onOpenChange={(open) => !open && !busy && setConfirmDelete(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete this mission?</DialogTitle>
                        <DialogDescription>
                            The mission and evidence linked to it will be deleted and cannot be
                            recovered. Keep finished experiments when their results can teach the
                            next mission.
                        </DialogDescription>
                    </DialogHeader>
                    <WriteErrorNotice message={writeError} onDismiss={clearWriteError} />
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button size="sm" type="button" variant="ghost" disabled={busy}>
                                Keep it
                            </Button>
                        </DialogClose>
                        <Button type="button" size="sm" disabled={disabled} onClick={destroy}>
                            Delete mission
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** Keep mission drafts, pending rewards and evidence within the current account and workspace. */
export default function MissionsPage() {
    const { user, isAuthed } = useAuth();
    const { active, loading, error, refresh } = useWorkspace();
    const { demo } = useDemoMode();
    if (!isAuthed || !user?.id || !active || loading || error)
        return (
            <div className="space-y-4">
                <PageHeader
                    title="Challenge Desk"
                    description="Open an authenticated workspace to save a mission."
                />
                {error && <DegradedNotice onRetry={refresh} />}
            </div>
        );
    return <MissionDesk key={`${user.id}:${active.id}:${demo ? 'demo' : 'live'}`} />;
}
