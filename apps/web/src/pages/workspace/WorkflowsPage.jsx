// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/WorkflowsPage.jsx
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
//              PRODUCES workspace.workflow.started;
//              PRODUCES workspace.workflow.step_added
// Intent:      Give a workflow the sequence that makes it one — ordered,
//              editable steps — so activating it says what would run.
// ───────────────────────────────────────────────────────────────

import {
    ArrowDown,
    ArrowUp,
    Info,
    Loader2,
    Pause,
    Play,
    Plus,
    Trash2,
    Workflow as WorkflowIcon,
    X,
} from 'lucide-react';
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
    PageHeader,
    StatusBadge,
    WORKFLOW_STATUS,
} from '@/components/workspace/workspaceHelpers';
import {
    DegradedNotice,
    DemoModeToggle,
    ListSkeleton,
    WriteErrorNotice,
} from '@/components/workspace/WorkspaceNotices';
import { useShapedRecords, useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { trackWorkspaceAction, WORKSPACE_ACTIONS } from '@/lib/workspaceActions';

const STEP_KINDS = {
    read: 'Read data',
    transform: 'Summarise or transform',
    approval: 'Wait for approval',
    notify: 'Send a message',
    record: 'Record evidence',
};

// Templates are starting points, not products. Each one is a sequence the
// operator then edits; none of them is wired to anything by itself.
const TEMPLATES = {
    blank: { label: 'Blank', steps: [] },
    reminders: {
        label: 'Appointment reminders',
        steps: [
            { name: 'Read upcoming bookings', kind: 'read', detail: '' },
            { name: 'Send reminder the day before', kind: 'notify', detail: '' },
            { name: 'Record delivery outcome', kind: 'record', detail: '' },
        ],
    },
    digest: {
        label: 'Weekly digest',
        steps: [
            { name: 'Collect the week\u2019s signals', kind: 'read', detail: '' },
            { name: 'Summarise verified outcomes', kind: 'transform', detail: '' },
            { name: 'Email the summary', kind: 'notify', detail: '' },
        ],
    },
    recall: {
        label: 'Customer recall',
        steps: [
            { name: 'Select the target list', kind: 'read', detail: '' },
            { name: 'Hold for operator approval', kind: 'approval', detail: '' },
            { name: 'Send the recall message', kind: 'notify', detail: '' },
        ],
    },
};

const EMPTY_FORM = { name: '', description: '', template: 'blank' };

let stepCounter = 0;
const nextStepId = () => {
    stepCounter += 1;
    return `s${Date.now().toString(36)}${stepCounter}`;
};

/**
 * Steps are stored as json. A record written before the field existed, or one
 * hand-edited into a non-array, must not take the page down with it.
 *
 * @param {*} value Raw `steps` value from PocketBase.
 * @returns {Array<object>} Always an array.
 */
function readSteps(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function StepEditor({ steps, onChange }) {
    const [draft, setDraft] = useState({ name: '', kind: 'read', detail: '' });

    const add = () => {
        if (!draft.name.trim()) return;
        onChange([...steps, { ...draft, name: draft.name.trim(), detail: draft.detail.trim(), id: nextStepId() }]);
        setDraft({ name: '', kind: 'read', detail: '' });
    };

    const move = (index, delta) => {
        const target = index + delta;
        if (target < 0 || target >= steps.length) return;
        const next = [...steps];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    return (
        <div className="space-y-3">
            <Label>Steps</Label>
            {steps.length === 0 ? (
                <p className="border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                    No steps yet. A workflow with no steps is a name, not a sequence.
                </p>
            ) : (
                <ol className="space-y-2">
                    {steps.map((step, index) => (
                        <li
                            key={step.id || index}
                            className="flex items-start gap-3 border border-border bg-secondary/30 p-3"
                        >
                            <span className="font-evidence mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-card text-xs">
                                {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{step.name}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {STEP_KINDS[step.kind] || step.kind}
                                    {step.detail ? ` · ${step.detail}` : ''}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    aria-label={`Move step ${index + 1} up`}
                                    disabled={index === 0}
                                    onClick={() => move(index, -1)}
                                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Move step ${index + 1} down`}
                                    disabled={index === steps.length - 1}
                                    onClick={() => move(index, 1)}
                                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Remove step ${index + 1}`}
                                    onClick={() => onChange(steps.filter((_, i) => i !== index))}
                                    className="p-1 text-muted-foreground hover:text-destructive"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </li>
                    ))}
                </ol>
            )}

            <div className="grid gap-2 border border-border p-3 sm:grid-cols-[1fr_11rem]">
                <Input
                    value={draft.name}
                    onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Step description"
                    aria-label="New step description"
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            // Inside a dialog form, Enter would submit the
                            // whole workflow instead of adding the step.
                            event.preventDefault();
                            add();
                        }
                    }}
                />
                <Select
                    value={draft.kind}
                    onValueChange={(value) => setDraft((prev) => ({ ...prev, kind: value }))}
                >
                    <SelectTrigger aria-label="Step kind">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(STEP_KINDS).map(([key, label]) => (
                            <SelectItem key={key} value={key}>
                                {label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    value={draft.detail}
                    onChange={(event) => setDraft((prev) => ({ ...prev, detail: event.target.value }))}
                    placeholder="Where it happens (optional)"
                    aria-label="Step target"
                />
                <Button type="button" variant="secondary" size="sm" onClick={add}>
                    <Plus className="h-4 w-4" />
                    Add step
                </Button>
            </div>
        </div>
    );
}

export default function WorkflowsPage() {
    const {
        records,
        loading,
        degraded,
        refresh,
        create,
        update,
        remove,
        saving,
        writeError,
        clearWriteError,
    } = useWorkspaceRecords('workflows', { sort: '-created' });

    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [steps, setSteps] = useState([]);
    const [validation, setValidation] = useState('');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);

    const byStatusThenAge = useMemo(() => {
        const rank = { active: 0, draft: 1, paused: 2 };
        return (a, b) =>
            (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || new Date(b.created) - new Date(a.created);
    }, []);

    const visible = useShapedRecords(records, {
        query,
        searchFields: ['name', 'description'],
        filters: { status: statusFilter },
        sort: byStatusThenAge,
    });

    const counts = useMemo(
        () => ({
            active: records.filter((w) => w.status === 'active').length,
            total: records.length,
        }),
        [records],
    );

    const applyTemplate = (key) => {
        setForm((prev) => ({ ...prev, template: key }));
        setSteps(TEMPLATES[key].steps.map((step) => ({ ...step, id: nextStepId() })));
    };

    const openCreate = () => {
        setForm(EMPTY_FORM);
        setSteps([]);
        setValidation('');
        clearWriteError();
        setCreateOpen(true);
    };

    const openEdit = (workflow) => {
        setForm({
            name: workflow.name || '',
            description: workflow.description || '',
            template: workflow.template || 'blank',
        });
        setSteps(readSteps(workflow.steps));
        setValidation('');
        clearWriteError();
        setEditing(workflow);
    };

    const submitCreate = async (event) => {
        event.preventDefault();
        if (!form.name.trim()) {
            setValidation('Name the workflow.');
            return;
        }
        setValidation('');
        const result = await create({
            name: form.name.trim(),
            description: form.description.trim(),
            status: 'draft',
            template: form.template,
            steps,
        });
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.WORKFLOW_CREATED, {
            template: form.template,
            step_count: steps.length,
        });
        setCreateOpen(false);
    };

    const submitEdit = async (event) => {
        event.preventDefault();
        if (!form.name.trim()) {
            setValidation('Name the workflow.');
            return;
        }
        setValidation('');
        const before = readSteps(editing.steps).length;
        const result = await update(editing.id, {
            name: form.name.trim(),
            description: form.description.trim(),
            steps,
        });
        if (!result.ok) return;
        if (steps.length > before) {
            trackWorkspaceAction(WORKSPACE_ACTIONS.WORKFLOW_STEP_ADDED, {
                step_count: steps.length,
                added: steps.length - before,
            });
        }
        setEditing(null);
    };

    const toggleStatus = async (workflow) => {
        const next = workflow.status === 'active' ? 'paused' : 'active';
        if (next === 'active' && readSteps(workflow.steps).length === 0) {
            setValidation('Add at least one step before activating this workflow.');
            return;
        }
        setValidation('');
        setBusyId(workflow.id);
        const result = await update(workflow.id, {
            status: next,
            last_run: next === 'active' ? new Date().toISOString() : workflow.last_run || null,
        });
        setBusyId(null);
        if (!result.ok) return;
        trackWorkspaceAction(
            next === 'active' ? WORKSPACE_ACTIONS.WORKFLOW_STARTED : WORKSPACE_ACTIONS.WORKFLOW_PAUSED,
            {
                step_count: readSteps(workflow.steps).length,
                template: workflow.template || 'blank',
                from_status: workflow.status,
            },
        );
    };

    const destroy = async (workflow) => {
        setBusyId(workflow.id);
        await remove(workflow.id);
        setBusyId(null);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Workflows"
                description="Repeatable automations for this workspace. Workflows start as drafts — you activate them once the steps and boundaries are clear. Connect n8n in Operations to run them outside BuildAndDo."
                actions={
                    <Button size="sm" onClick={openCreate}>
                        <Plus className="h-4 w-4" />
                        Create workflow
                    </Button>
                }
            />


            {counts.total > 0 && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span>
                        <span className="font-semibold text-foreground">{counts.active}</span> active
                    </span>
                    <span>
                        <span className="font-semibold text-foreground">{counts.total}</span> defined
                    </span>
                </div>
            )}

            {records.length > 0 && (
                <ListToolbar
                    query={query}
                    onQueryChange={setQuery}
                    placeholder="Search workflows"
                    resultCount={visible.length}
                    totalCount={records.length}
                    filters={[
                        {
                            key: 'status',
                            label: 'Status',
                            value: statusFilter,
                            onChange: setStatusFilter,
                            options: [
                                { value: 'all', label: 'All statuses' },
                                ...Object.entries(WORKFLOW_STATUS).map(([key, meta]) => ({
                                    value: key,
                                    label: meta.label,
                                })),
                            ],
                        },
                    ]}
                />
            )}

            <WriteErrorNotice
                message={validation || writeError}
                onDismiss={() => {
                    setValidation('');
                    clearWriteError();
                }}
            />

            {degraded ? (
                <DegradedNotice onRetry={refresh} />
            ) : loading ? (
                <ListSkeleton rows={3} />
            ) : records.length === 0 ? (
                <EmptyState
                    icon={WorkflowIcon}
                    title="No workflows connected"
                    description="A workflow is a repeatable automation — reminders, follow-ups, end-of-week summaries. Define one here as a draft, then connect n8n in Operations to actually run it. BuildAndDo won't pretend to execute automations that aren't wired up."
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" onClick={openCreate}>
                                <Plus className="h-4 w-4" />
                                Create a workflow
                            </Button>
                            <DemoModeToggle />
                        </div>
                    }
                />
            ) : visible.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                    No workflow matches those filters.
                </Card>
            ) : (
                <ul className="space-y-3">
                    {visible.map((workflow) => {
                        const workflowSteps = readSteps(workflow.steps);
                        const busy = busyId === workflow.id;
                        return (
                            <li key={workflow.id}>
                                <Card className="p-5">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="font-medium">{workflow.name}</p>
                                            {workflow.description && (
                                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                    {workflow.description}
                                                </p>
                                            )}
                                        </div>
                                        <StatusBadge
                                            map={WORKFLOW_STATUS}
                                            value={workflow.status}
                                            className="shrink-0"
                                        />
                                    </div>

                                    {workflowSteps.length > 0 ? (
                                        <ol className="mt-4 space-y-1.5">
                                            {workflowSteps.map((step, index) => (
                                                <li
                                                    key={step.id || index}
                                                    className="flex items-start gap-3 text-sm"
                                                >
                                                    <span className="font-evidence mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-border bg-secondary/50 text-[10px]">
                                                        {index + 1}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="text-foreground">{step.name}</span>
                                                        <span className="ml-2 text-xs text-muted-foreground">
                                                            {STEP_KINDS[step.kind] || step.kind}
                                                            {step.detail ? ` · ${step.detail}` : ''}
                                                        </span>
                                                    </span>
                                                </li>
                                            ))}
                                        </ol>
                                    ) : (
                                        <p className="mt-4 text-sm text-muted-foreground">
                                            No steps defined. This workflow cannot be activated until
                                            it has at least one.
                                        </p>
                                    )}

                                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                                        <span>
                                            {workflowSteps.length} step
                                            {workflowSteps.length === 1 ? '' : 's'}
                                        </span>
                                        <span>Created {timeAgo(workflow.created)}</span>
                                        {workflow.last_run && (
                                            <span>Last activated {timeAgo(workflow.last_run)}</span>
                                        )}
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => toggleStatus(workflow)}
                                        >
                                            {busy ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : workflow.status === 'active' ? (
                                                <Pause className="h-4 w-4" />
                                            ) : (
                                                <Play className="h-4 w-4" />
                                            )}
                                            {workflow.status === 'active' ? 'Pause' : 'Activate'}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEdit(workflow)}
                                        >
                                            Edit steps
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => destroy(workflow)}
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
                <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Create a workflow</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitCreate} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="w-template">Start from</Label>
                            <Select value={form.template} onValueChange={applyTemplate}>
                                <SelectTrigger id="w-template">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(TEMPLATES).map(([key, template]) => (
                                        <SelectItem key={key} value={key}>
                                            {template.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="w-name">Name</Label>
                            <Input
                                id="w-name"
                                value={form.name}
                                onChange={(event) =>
                                    setForm((prev) => ({ ...prev, name: event.target.value }))
                                }
                                placeholder="e.g. Weekly appointment reminders"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="w-desc">What it does</Label>
                            <Textarea
                                id="w-desc"
                                value={form.description}
                                onChange={(event) =>
                                    setForm((prev) => ({ ...prev, description: event.target.value }))
                                }
                                placeholder="Trigger, steps, and where the result lands"
                                rows={3}
                            />
                        </div>
                        <StepEditor steps={steps} onChange={setSteps} />
                        <WriteErrorNotice
                            message={validation || writeError}
                            onDismiss={clearWriteError}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="ghost" size="sm">
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button type="submit" size="sm" disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create draft'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit workflow</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitEdit} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="we-name">Name</Label>
                            <Input
                                id="we-name"
                                value={form.name}
                                onChange={(event) =>
                                    setForm((prev) => ({ ...prev, name: event.target.value }))
                                }
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="we-desc">What it does</Label>
                            <Textarea
                                id="we-desc"
                                value={form.description}
                                onChange={(event) =>
                                    setForm((prev) => ({ ...prev, description: event.target.value }))
                                }
                                rows={3}
                            />
                        </div>
                        <StepEditor steps={steps} onChange={setSteps} />
                        <WriteErrorNotice
                            message={validation || writeError}
                            onDismiss={clearWriteError}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="ghost" size="sm">
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button type="submit" size="sm" disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save workflow'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <p
                className={cn(
                    'flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70',
                )}
            >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Activating a workflow here marks its intent and records the time. Actual execution
                happens in your connected n8n instance — BuildAndDo does not run automations on its
                own, and the steps above describe what it would do, not what it has done.
            </p>
        </div>
    );
}
