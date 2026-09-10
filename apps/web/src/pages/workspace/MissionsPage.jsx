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
//              apps/web/src/components/workspace/ListToolbar.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js;
//              PRODUCES workspace.mission.created;
//              PRODUCES workspace.mission.advanced
// Intent:      Make a list of missions triageable — priority, progress, due
//              dates, editing and deletion — instead of an append-only stack.
// ───────────────────────────────────────────────────────────────

import { AlertCircle, CalendarClock, Info, Loader2, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { Button, Card } from '@/components/site/ui';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/workspace/EmptyState';
import ListToolbar from '@/components/workspace/ListToolbar';
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
import { useShapedRecords, useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { describeDueDate, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { trackWorkspaceAction, WORKSPACE_ACTIONS } from '@/lib/workspaceActions';

const STAGE_ORDER = ['proposed', 'approved', 'running', 'needs_attention', 'verified', 'failed'];
const PRIORITY_ORDER = Object.keys(MISSION_PRIORITY);
const TERMINAL = ['verified', 'failed'];

const EMPTY_FORM = {
    title: '',
    description: '',
    priority: 'normal',
    progress: '',
    due_date: '',
    status: 'proposed',
};

const SORTS = {
    priority: {
        label: 'Priority',
        // Unset priority sorts as 'normal' rather than last: a mission created
        // before the field existed is not implicitly the least important one.
        compare: (a, b) => {
            const rank = (m) => {
                const index = PRIORITY_ORDER.indexOf(m.priority || 'normal');
                return index === -1 ? PRIORITY_ORDER.indexOf('normal') : index;
            };
            return rank(a) - rank(b) || new Date(b.created) - new Date(a.created);
        },
    },
    due: {
        label: 'Due date',
        // Missions with no due date sink below dated ones instead of sorting
        // as "the epoch", which would put every undated mission first.
        compare: (a, b) => {
            const at = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
            const bt = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
            return at - bt;
        },
    },
    stage: {
        label: 'Stage',
        compare: (a, b) => STAGE_ORDER.indexOf(a.status) - STAGE_ORDER.indexOf(b.status),
    },
    newest: {
        label: 'Newest',
        compare: (a, b) => new Date(b.created) - new Date(a.created),
    },
};

function MissionForm({ form, setForm, onSubmit, saving, error, submitLabel, onDismissError }) {
    const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    return (
        <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-2">
                <Label htmlFor="m-title">Goal</Label>
                <Input
                    id="m-title"
                    value={form.title}
                    onChange={(event) => set('title', event.target.value)}
                    placeholder="e.g. Reduce next-week no-shows with reminder texts"
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="m-desc">Scope &amp; plan</Label>
                <Textarea
                    id="m-desc"
                    value={form.description}
                    onChange={(event) => set('description', event.target.value)}
                    placeholder="What's in scope, what's out, and how success is verified"
                    rows={4}
                />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                    <Label htmlFor="m-priority">Priority</Label>
                    <Select value={form.priority} onValueChange={(value) => set('priority', value)}>
                        <SelectTrigger id="m-priority">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PRIORITY_ORDER.map((key) => (
                                <SelectItem key={key} value={key}>
                                    {MISSION_PRIORITY[key].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="m-due">Due date (optional)</Label>
                    <Input
                        id="m-due"
                        type="date"
                        value={form.due_date}
                        onChange={(event) => set('due_date', event.target.value)}
                    />
                </div>
            </div>
            <div className="grid gap-2">
                <Label htmlFor="m-progress">Progress % (optional)</Label>
                <Input
                    id="m-progress"
                    type="number"
                    min={0}
                    max={100}
                    value={form.progress}
                    onChange={(event) => set('progress', event.target.value)}
                    placeholder="Leave blank when progress isn't being tracked"
                />
            </div>
            <WriteErrorNotice message={error} onDismiss={onDismissError} />
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="ghost" size="sm">
                        Cancel
                    </Button>
                </DialogClose>
                <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
                </Button>
            </DialogFooter>
        </form>
    );
}

export default function MissionsPage() {
    const {
        records,
        loading,
        degraded,
        demo,
        refresh,
        create,
        update,
        remove,
        saving,
        writeError,
        clearWriteError,
    } = useWorkspaceRecords('missions', { sort: '-created' });

    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [validation, setValidation] = useState('');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [sortKey, setSortKey] = useState('priority');

    // Missions created before the priority field existed carry an empty
    // value. Defaulting once here keeps the filter and the sort agreeing;
    // without it, a mission the list sorts as "normal" would vanish when you
    // filter for "Normal".
    const normalised = useMemo(
        () => records.map((mission) => ({ ...mission, priority: mission.priority || 'normal' })),
        [records],
    );

    const compare = SORTS[sortKey].compare;
    const visible = useShapedRecords(normalised, {
        query,
        searchFields: ['title', 'description'],
        filters: { status: statusFilter, priority: priorityFilter },
        sort: compare,
    });

    const counts = useMemo(() => {
        const open = records.filter((m) => !TERMINAL.includes(m.status));
        const overdue = open.filter(
            (m) => m.due_date && new Date(m.due_date).getTime() < Date.now(),
        );
        return { open: open.length, overdue: overdue.length, total: records.length };
    }, [records]);

    const toPayload = () => ({
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        priority: form.priority,
        progress: form.progress === '' ? null : Number(form.progress),
        due_date: form.due_date || null,
    });

    const openCreate = () => {
        setForm(EMPTY_FORM);
        setValidation('');
        clearWriteError();
        setCreateOpen(true);
    };

    const openEdit = (mission) => {
        setForm({
            title: mission.title || '',
            description: mission.description || '',
            priority: mission.priority || 'normal',
            progress: mission.progress == null ? '' : String(mission.progress),
            // The date input needs a bare YYYY-MM-DD; PocketBase returns a
            // full timestamp.
            due_date: mission.due_date ? String(mission.due_date).slice(0, 10) : '',
            status: mission.status,
        });
        setValidation('');
        clearWriteError();
        setEditing(mission);
    };

    const submitCreate = async (event) => {
        event.preventDefault();
        if (!form.title.trim()) {
            setValidation('Give the mission a clear goal.');
            return;
        }
        setValidation('');
        const result = await create(toPayload());
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.MISSION_CREATED, {
            priority: form.priority,
            has_due_date: Boolean(form.due_date),
            open_missions: counts.open + 1,
        });
        setForm(EMPTY_FORM);
        setCreateOpen(false);
    };

    const submitEdit = async (event) => {
        event.preventDefault();
        if (!form.title.trim()) {
            setValidation('Give the mission a clear goal.');
            return;
        }
        setValidation('');
        const result = await update(editing.id, toPayload());
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.MISSION_UPDATED, {
            priority: form.priority,
            status: form.status,
        });
        setEditing(null);
    };

    const advance = async (mission) => {
        const index = STAGE_ORDER.indexOf(mission.status);
        // 'failed' is an outcome, never the next step in a normal advance.
        const next = STAGE_ORDER.find((stage, position) => position > index && stage !== 'failed');
        if (!next) return;
        const result = await update(mission.id, { status: next });
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.MISSION_ADVANCED, {
            from_status: mission.status,
            to_status: next,
            priority: mission.priority || 'normal',
        });
    };

    const destroy = async () => {
        const result = await remove(confirmDelete.id);
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.MISSION_DELETED, { status: confirmDelete.status });
        setConfirmDelete(null);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Challenge Desk"
                description="A mission is a bounded, approved task with a clear goal and scope. You review the plan before anything runs, and you can inspect what BuildAndDo observed, decided, attempted, and verified."
                actions={
                    <Button size="sm" onClick={openCreate}>
                        <Plus className="h-4 w-4" />
                        Start a mission
                    </Button>
                }
            />


            {counts.total > 0 && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span>
                        <span className="font-semibold text-foreground">{counts.open}</span> open
                    </span>
                    <span>
                        <span
                            className={cn(
                                'font-semibold',
                                counts.overdue ? 'text-amber-warm' : 'text-foreground',
                            )}
                        >
                            {counts.overdue}
                        </span>{' '}
                        past due
                    </span>
                    <span>
                        <span className="font-semibold text-foreground">{counts.total}</span> total
                    </span>
                </div>
            )}

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
                                ...STAGE_ORDER.map((stage) => ({
                                    value: stage,
                                    label: MISSION_STATUS[stage].label,
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
                                ...PRIORITY_ORDER.map((key) => ({
                                    value: key,
                                    label: MISSION_PRIORITY[key].label,
                                })),
                            ],
                        },
                        {
                            key: 'sort',
                            label: 'Sort',
                            value: sortKey,
                            onChange: setSortKey,
                            options: Object.entries(SORTS).map(([key, value]) => ({
                                value: key,
                                label: `Sort: ${value.label}`,
                            })),
                        },
                    ]}
                />
            )}

            <WriteErrorNotice message={writeError} onDismiss={clearWriteError} />

            {degraded ? (
                <DegradedNotice onRetry={refresh} />
            ) : loading ? (
                <ListSkeleton rows={3} />
            ) : records.length === 0 ? (
                <EmptyState
                    icon={Target}
                    title="No missions yet"
                    description="Start a mission to turn a signal into a bounded task. It begins as 'proposed' — you approve it before BuildAndDo runs anything, and you verify the outcome when it's done."
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" onClick={openCreate}>
                                <Plus className="h-4 w-4" />
                                Start a mission
                            </Button>
                            <DemoModeToggle />
                        </div>
                    }
                />
            ) : visible.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    No mission matches those filters.
                </Card>
            ) : (
                <ul className="space-y-3">
                    {visible.map((mission) => {
                        const canAdvance = !TERMINAL.includes(mission.status);
                        const due = describeDueDate(mission.due_date);
                        return (
                            <li key={mission.id}>
                                <Card className="p-5">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-medium">{mission.title}</p>
                                            {mission.description && (
                                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                    {mission.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                                            <StatusBadge
                                                map={MISSION_PRIORITY}
                                                value={mission.priority || 'normal'}
                                            />
                                            <StatusBadge map={MISSION_STATUS} value={mission.status} />
                                        </div>
                                    </div>

                                    {mission.progress != null && (
                                        <ProgressMeter value={mission.progress} className="mt-4" />
                                    )}

                                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                                        <span>Started {timeAgo(mission.created)}</span>
                                        {due.label && (
                                            <span
                                                className={cn(
                                                    'inline-flex items-center gap-1.5',
                                                    (due.overdue || due.soon) && 'text-amber-warm',
                                                )}
                                            >
                                                <CalendarClock className="h-3.5 w-3.5" />
                                                {due.label}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                                        {canAdvance && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                disabled={saving}
                                                onClick={() => advance(mission)}
                                            >
                                                Advance to next stage
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEdit(mission)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                            Edit
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setConfirmDelete(mission)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            Delete
                                        </Button>
                                    </div>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
                    <DialogHeader>
                        <DialogTitle>Start a mission</DialogTitle>
                    </DialogHeader>
                    <MissionForm
                        form={form}
                        setForm={setForm}
                        onSubmit={submitCreate}
                        saving={saving}
                        error={validation || writeError}
                        onDismissError={clearWriteError}
                        submitLabel="Propose mission"
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card">
                    <DialogHeader>
                        <DialogTitle>Edit mission</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-2">
                        <Label htmlFor="m-stage">Stage</Label>
                        <Select
                            value={form.status}
                            onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
                        >
                            <SelectTrigger id="m-stage">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {STAGE_ORDER.map((stage) => (
                                    <SelectItem key={stage} value={stage}>
                                        {MISSION_STATUS[stage].label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <MissionForm
                        form={form}
                        setForm={setForm}
                        onSubmit={submitEdit}
                        saving={saving}
                        error={validation || writeError}
                        onDismissError={clearWriteError}
                        submitLabel="Save changes"
                    />
                </DialogContent>
            </Dialog>

            <Dialog
                open={Boolean(confirmDelete)}
                onOpenChange={(open) => !open && setConfirmDelete(null)}
            >
                <DialogContent className="border-border bg-card">
                    <DialogHeader>
                        <DialogTitle>Delete this mission?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        {confirmDelete ? `"${confirmDelete.title}" ` : ''}will be removed. Evidence
                        recorded against it is deleted with it and cannot be recovered.
                    </p>
                    <WriteErrorNotice message={writeError} onDismiss={clearWriteError} />
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="ghost" size="sm">
                                Keep it
                            </Button>
                        </DialogClose>
                        <Button size="sm" onClick={destroy} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete mission'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                {demo ? (
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                'Proposed' and 'approved' mean nothing has run yet. 'Running' means an approved
                action is in progress. 'Verified' means the outcome was checked against evidence.
            </p>
        </div>
    );
}
