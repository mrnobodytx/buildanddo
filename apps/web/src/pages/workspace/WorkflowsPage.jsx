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
//              PRODUCES workspace.workflow.create;
//              PRODUCES workspace.workflow.update;
//              CONSUMES apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx;
//              CONSUMES apps/web/src/lib/workflowRuns.js
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
import React, { useMemo, useRef, useState } from 'react';

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
import PreviousWorkNote from '@/components/workspace/PreviousWorkNote';
import WorkflowRunsPanel from '@/components/workspace/workflows/WorkflowRunsPanel';
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
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { usePreviousWork } from '@/hooks/usePreviousWork';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { readWorkflowSteps as readSteps, STEP_KINDS } from '@/lib/workflowRuns';

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

function StepEditor({ steps, onChange }) {
    const [draft, setDraft] = useState({ name: '', kind: 'read', detail: '' });

    const add = () => {
        if (!draft.name.trim() || steps.length >= 20) return;
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
                    maxLength={160}
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
                    maxLength={300}
                    aria-label="Step target"
                />
                <Button type="button" variant="secondary" size="sm" disabled={steps.length >= 20} onClick={add}>
                    <Plus className="h-4 w-4" />
                    Add step
                </Button>
            </div>
        </div>
    );
}

function WorkflowDesk({ workspaceId, accountId, demo }) {
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
    const [deleting, setDeleting] = useState(null);
    const writeBusy = useRef(false);
    const { history, refresh: refreshHistory } = usePreviousWork('workflow', records.map((record) => record.id));

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
        if (writeBusy.current || demo) return;
        setForm(EMPTY_FORM);
        setSteps([]);
        setValidation('');
        clearWriteError();
        setCreateOpen(true);
    };

    const openEdit = (workflow) => {
        if (writeBusy.current || demo) return;
        setForm({
            name: workflow.name || '',
            description: workflow.description || '',
            template: workflow.template || 'blank',
        });
        setSteps(readSteps(workflow.steps).map((step) => ({ ...step, id: step.id || nextStepId() })));
        setValidation('');
        clearWriteError();
        setEditing(workflow);
    };

    const submitCreate = async (event) => {
        event.preventDefault();
        if (writeBusy.current || demo) return;
        if (!form.name.trim()) {
            setValidation('Name the workflow.');
            return;
        }
        setValidation('');
        writeBusy.current = true;
        const result = await create({
            name: form.name.trim(),
            description: form.description.trim(),
            status: 'draft',
            template: form.template,
            steps,
        });
        writeBusy.current = false;
        if (!result.ok) return;

        setCreateOpen(false);
    };

    const submitEdit = async (event) => {
        event.preventDefault();
        if (writeBusy.current || demo) return;
        if (!form.name.trim()) {
            setValidation('Name the workflow.');
            return;
        }
        setValidation('');
        writeBusy.current = true;
        const result = await update(editing.id, {
            name: form.name.trim(),
            description: form.description.trim(),
            steps,
        });
        writeBusy.current = false;
        if (!result.ok) return;
        setEditing(null);
    };

    const toggleStatus = async (workflow) => {
        if (writeBusy.current || demo) return;
        const next = workflow.status === 'active' ? 'paused' : 'active';
        if (next === 'active' && readSteps(workflow.steps).length === 0) {
            setValidation('Add at least one step before activating this workflow.');
            return;
        }
        setValidation('');
        writeBusy.current = true;
        setBusyId(workflow.id);
        const result = await update(workflow.id, {
            status: next,
        });
        writeBusy.current = false;
        setBusyId(null);
        if (!result.ok) return;

    };

    const destroy = async (workflow) => {
        if (writeBusy.current || demo) return;
        writeBusy.current = true;
        setBusyId(workflow.id);
        const result = await remove(workflow.id);
        writeBusy.current = false;
        setBusyId(null);
        if (result.ok) setDeleting(null);
    };

    return (
        <div className="ph-no-capture min-w-0 space-y-8 break-words" data-dd-privacy="mask">
            <PageHeader
                title="Workflows"
                description="Saved procedures for this workspace. Define and activate the steps, then start a recorded run to capture work, approval checkpoints and evidence."
                actions={
                    <div className="flex flex-wrap gap-2"><DemoModeToggle compact />
                    <Button size="sm" onClick={openCreate} disabled={saving || demo}>
                        <Plus className="h-4 w-4" />
                        Create workflow
                    </Button></div>
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
                    description="Start with a draft procedure for reminders, follow-ups or weekly reviews. Add its steps and boundaries, then record what happened as you perform the work."
                    action={
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" onClick={openCreate} disabled={saving || demo}>
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
                <ul className="space-y-3" aria-label="Workflow definitions">
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
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            disabled={busy || saving || demo || (workflow.status !== 'active' && workflowSteps.length === 0)}
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
                                            disabled={saving || demo}
                                        >
                                            Edit steps
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy || saving || demo}
                                            onClick={() => { clearWriteError(); setDeleting(workflow); }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            Delete
                                        </Button>
                                    </div>
                                    <PreviousWorkNote history={history[workflow.id]} onRetry={refreshHistory} />
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}

            <WorkflowRunsPanel workflows={records} workspaceId={workspaceId} accountId={accountId}
                demo={demo} definitionsUnavailable={loading || degraded}
                onRecordsChanged={() => { refresh(); refreshHistory(); }} />

            <Dialog open={createOpen} onOpenChange={(open) => { if (!writeBusy.current) setCreateOpen(open); }}>
                <DialogContent className="ph-no-capture max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-2xl" data-dd-privacy="mask">
                    <DialogHeader>
                        <DialogTitle>Create a workflow</DialogTitle>
                        <DialogDescription>Save an ordered procedure. Activate it when its steps and boundaries are ready.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitCreate} className="space-y-4">
                        <fieldset disabled={saving || demo} className="min-w-0 space-y-4">
                            <legend className="sr-only">Workflow draft</legend>
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
                                    maxLength={160}
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
                                    maxLength={1000}
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
                                <Button type="submit" size="sm" disabled={saving || demo}>
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create draft'}
                                </Button>
                            </DialogFooter>
                        </fieldset>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !writeBusy.current) setEditing(null); }}>
                <DialogContent className="ph-no-capture max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-2xl" data-dd-privacy="mask">
                    <DialogHeader>
                        <DialogTitle>Edit workflow</DialogTitle>
                        <DialogDescription>Changes apply to future runs. Existing runs keep their saved steps.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={submitEdit} className="space-y-4">
                        <fieldset disabled={saving || demo} className="min-w-0 space-y-4">
                            <legend className="sr-only">Saved workflow definition</legend>
                            <div className="grid gap-2">
                                <Label htmlFor="we-name">Name</Label>
                                <Input
                                    id="we-name"
                                    maxLength={160}
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
                                    maxLength={1000}
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
                                <Button type="submit" size="sm" disabled={saving || demo}>
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save workflow'}
                                </Button>
                            </DialogFooter>
                        </fieldset>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !saving) setDeleting(null); }}>
                <DialogContent className="ph-no-capture border-border bg-card" data-dd-privacy="mask">
                    <DialogHeader><DialogTitle>Delete workflow?</DialogTitle>
                        <DialogDescription>Delete {deleting?.name}. Workflows with recorded runs must be paused to retain their history.</DialogDescription></DialogHeader>
                    <WriteErrorNotice message={writeError} onDismiss={clearWriteError} />
                    <DialogFooter><Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => setDeleting(null)}>Keep workflow</Button>
                        <Button type="button" size="sm" disabled={saving || demo} onClick={() => destroy(deleting)}>Delete workflow</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            <p
                className={cn(
                    'flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70',
                )}
            >
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                BuildAndDo records the work you perform. Complete external actions before recording
                their outcomes. Activation prepares a procedure; only a saved run records its start
                and only an observed outcome advances a step.
            </p>
        </div>
    );
}

export default function WorkflowsPage() {
    const { user } = useAuth();
    const { active } = useWorkspace();
    const { demo } = useDemoMode();
    if (!user || !active) return <p className="text-sm text-muted-foreground">Select a workspace to manage workflows.</p>;
    return <WorkflowDesk key={`${user.id}:${active.id}:${demo}`} workspaceId={active.id} accountId={user.id} demo={demo} />;
}
