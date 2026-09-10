// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/OperationsPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js,
//              apps/pocketbase/pb_migrations/1789000000_extend_workspace_operations.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceRecords.js;
//              PRODUCES workspace.operation.run_logged
// Intent:      Give the operations surface the two things it was missing — the
//              runbook text and the record of each time a human ran it.
// ───────────────────────────────────────────────────────────────

import {
    ArrowRight,
    BookOpen,
    ChevronDown,
    Clock,
    Info,
    Loader2,
    Plus,
    Server,
    ShieldAlert,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/workspace/EmptyState';
import {
    OPERATION_STATUS,
    PageHeader,
    RUN_RESULT,
    SERVICE_STATUS,
    StatusBadge,
} from '@/components/workspace/workspaceHelpers';
import {
    DegradedNotice,
    DemoModeToggle,
    ListSkeleton,
    WriteErrorNotice,
} from '@/components/workspace/WorkspaceNotices';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { trackWorkspaceAction, WORKSPACE_ACTIONS } from '@/lib/workspaceActions';

function formatDate(iso) {
    if (!iso) return 'Never';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString();
}

const EMPTY_OPERATION = { name: '', summary: '', runbook: '', status: 'idle', owner_note: '' };
const EMPTY_RUN = { result: 'succeeded', notes: '', duration_seconds: '' };

function OperationCard({ operation, runs, onLogRun, busy }) {
    const [expanded, setExpanded] = useState(false);
    const operationRuns = runs.filter(
        (run) => (run.operation || (run.expand && run.expand.operation && run.expand.operation.id)) === operation.id,
    );
    const lastRun = operationRuns[0];

    return (
        <Card className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <p className="font-display text-base font-semibold tracking-tight">
                        {operation.name}
                    </p>
                    {operation.summary && (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {operation.summary}
                        </p>
                    )}
                </div>
                <StatusBadge
                    map={OPERATION_STATUS}
                    value={operation.status}
                    className="shrink-0"
                />
            </div>

            {operation.owner_note && (
                <p className="mt-3 border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">Note: </span>
                    {operation.owner_note}
                </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Last run: {operation.last_run ? timeAgo(operation.last_run) : 'never'}
                </span>
                <span>
                    {operationRuns.length} recorded run
                    {operationRuns.length === 1 ? '' : 's'}
                </span>
                {lastRun && <StatusBadge map={RUN_RESULT} value={lastRun.result} />}
            </div>

            {operation.runbook && (
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={() => setExpanded((prev) => !prev)}
                        aria-expanded={expanded}
                        className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <BookOpen className="h-4 w-4" />
                        {expanded ? 'Hide runbook' : 'Show runbook'}
                        <ChevronDown
                            className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
                        />
                    </button>
                    {expanded && (
                        <pre className="font-evidence mt-3 whitespace-pre-wrap border border-border bg-secondary/30 p-4 text-xs leading-relaxed text-foreground/90">
                            {operation.runbook}
                        </pre>
                    )}
                </div>
            )}

            {expanded && operationRuns.length > 0 && (
                <ol className="mt-4 space-y-2 border-t border-border/60 pt-3">
                    {operationRuns.slice(0, 5).map((run) => (
                        <li key={run.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 text-xs">
                            <StatusBadge map={RUN_RESULT} value={run.result} />
                            <span className="text-muted-foreground">{timeAgo(run.created)}</span>
                            {run.duration_seconds != null && (
                                <span className="text-muted-foreground">{run.duration_seconds}s</span>
                            )}
                            {run.notes && <span className="w-full text-muted-foreground">{run.notes}</span>}
                        </li>
                    ))}
                </ol>
            )}

            <div className="mt-4 border-t border-border/60 pt-3">
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onLogRun(operation)}
                >
                    Log a run
                </Button>
            </div>
        </Card>
    );
}

export default function OperationsPage() {
    const services = useWorkspaceRecords('services', { sort: 'created' });
    const operations = useWorkspaceRecords('operations', { sort: '-created' });
    const runs = useWorkspaceRecords('operation_runs', { sort: '-created' });

    const [updatingId, setUpdatingId] = useState(null);
    const [operationOpen, setOperationOpen] = useState(false);
    const [operationForm, setOperationForm] = useState(EMPTY_OPERATION);
    const [runFor, setRunFor] = useState(null);
    const [runForm, setRunForm] = useState(EMPTY_RUN);
    const [validation, setValidation] = useState('');

    const connectedCount = useMemo(
        () => services.records.filter((service) => service.status === 'connected').length,
        [services.records],
    );

    const updateServiceStatus = async (service, status) => {
        setUpdatingId(service.id);
        await services.update(service.id, {
            status,
            // A health-check timestamp is only meaningful for a check that
            // actually passed; leave the old value alone otherwise.
            last_health_check:
                status === 'connected' ? new Date().toISOString() : service.last_health_check || null,
        });
        setUpdatingId(null);
    };

    const submitOperation = async (event) => {
        event.preventDefault();
        if (!operationForm.name.trim()) {
            setValidation('Name the operation.');
            return;
        }
        setValidation('');
        const result = await operations.create({
            name: operationForm.name.trim(),
            summary: operationForm.summary.trim(),
            runbook: operationForm.runbook.trim(),
            status: operationForm.status,
            owner_note: operationForm.owner_note.trim(),
        });
        if (!result.ok) return;
        trackWorkspaceAction(WORKSPACE_ACTIONS.OPERATION_CREATED, {
            status: operationForm.status,
            has_runbook: Boolean(operationForm.runbook.trim()),
        });
        setOperationForm(EMPTY_OPERATION);
        setOperationOpen(false);
    };

    const submitRun = async (event) => {
        event.preventDefault();
        const result = await runs.create({
            operation: runFor.id,
            result: runForm.result,
            notes: runForm.notes.trim(),
            duration_seconds:
                runForm.duration_seconds === '' ? null : Number(runForm.duration_seconds),
        });
        if (!result.ok) return;
        // The run is the record of truth; the operation only caches when it
        // last happened so the card can be read without opening the log.
        await operations.update(runFor.id, { last_run: new Date().toISOString() });
        trackWorkspaceAction(WORKSPACE_ACTIONS.OPERATION_RUN_LOGGED, {
            run_result: runForm.result,
            has_notes: Boolean(runForm.notes.trim()),
        });
        setRunForm(EMPTY_RUN);
        setRunFor(null);
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="Operations"
                description="The runbooks you own and the self-hosted stack BuildAndDo works with. Nothing here is claimed to be deployed or executed unless you recorded it — a status is what you told us, not a live probe."
            />


            <Card className="border-[hsl(var(--amber))]/30 bg-[hsl(var(--amber))]/5 p-5">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-warm" />
                    <div className="text-sm leading-relaxed text-muted-foreground">
                        <p className="font-medium text-foreground">
                            Self-hosted services are your responsibility
                        </p>
                        <p className="mt-1">
                            These services must be configured, secured, backed up, and monitored
                            separately by you. BuildAndDo does not deploy, host, or guarantee them,
                            and it does not execute the runbooks below — it holds the procedure and
                            the log of who ran it and what happened.
                        </p>
                    </div>
                </div>
            </Card>

            <Tabs defaultValue="runbooks">
                <TabsList className="w-full sm:w-auto">
                    <TabsTrigger value="runbooks" className="flex-1 sm:flex-none">
                        Runbooks
                    </TabsTrigger>
                    <TabsTrigger value="services" className="flex-1 sm:flex-none">
                        Connections
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="runbooks" className="mt-6 space-y-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-muted-foreground">
                            {operations.records.length} operation
                            {operations.records.length === 1 ? '' : 's'} ·{' '}
                            {runs.records.length} recorded run
                            {runs.records.length === 1 ? '' : 's'}
                        </p>
                        <Button
                            size="sm"
                            onClick={() => {
                                setOperationForm(EMPTY_OPERATION);
                                setValidation('');
                                operations.clearWriteError();
                                setOperationOpen(true);
                            }}
                        >
                            <Plus className="h-4 w-4" />
                            Add operation
                        </Button>
                    </div>

                    <WriteErrorNotice
                        message={validation || operations.writeError || runs.writeError}
                        onDismiss={() => {
                            setValidation('');
                            operations.clearWriteError();
                            runs.clearWriteError();
                        }}
                    />

                    {operations.degraded ? (
                        <DegradedNotice onRetry={operations.refresh} />
                    ) : operations.loading ? (
                        <ListSkeleton rows={2} />
                    ) : operations.records.length === 0 ? (
                        <EmptyState
                            icon={BookOpen}
                            title="No operations written down yet"
                            description="An operation is a procedure you own — a backup check, a credit top-up, an access review. Write the steps once, then log each run so the history is a record rather than a memory."
                            action={
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    <Button size="sm" onClick={() => setOperationOpen(true)}>
                                        <Plus className="h-4 w-4" />
                                        Add an operation
                                    </Button>
                                    <DemoModeToggle />
                                </div>
                            }
                        />
                    ) : (
                        <ul className="grid gap-4 lg:grid-cols-2">
                            {operations.records.map((operation) => (
                                <li key={operation.id}>
                                    <OperationCard
                                        operation={operation}
                                        runs={runs.records}
                                        busy={runs.saving}
                                        onLogRun={(target) => {
                                            setRunForm(EMPTY_RUN);
                                            runs.clearWriteError();
                                            setRunFor(target);
                                        }}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </TabsContent>

                <TabsContent value="services" className="mt-6 space-y-6">
                    <Card className="flex items-center gap-4 p-5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                            <Server className="h-5 w-5" />
                        </span>
                        <div className="text-sm">
                            <p className="font-medium">
                                {connectedCount} of {services.records.length} services connected
                            </p>
                            <p className="text-muted-foreground">
                                Connection status is recorded per workspace.
                            </p>
                        </div>
                    </Card>

                    <WriteErrorNotice
                        message={services.writeError}
                        onDismiss={services.clearWriteError}
                    />

                    {services.degraded ? (
                        <DegradedNotice onRetry={services.refresh} />
                    ) : services.loading ? (
                        <ListSkeleton rows={2} />
                    ) : services.records.length === 0 ? (
                        <EmptyState
                            icon={Server}
                            title="No service cards for this workspace yet"
                            description="Service cards record which self-hosted systems this workspace talks to and what data crosses the boundary. They are added as you connect them."
                            action={<DemoModeToggle />}
                        />
                    ) : (
                        <ul className="grid gap-4 lg:grid-cols-2">
                            {services.records.map((service) => (
                                <li key={service.id}>
                                    <Card className="flex h-full flex-col p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-display text-base font-semibold tracking-tight">
                                                    {service.name}
                                                </p>
                                                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                                    {service.purpose}
                                                </p>
                                            </div>
                                            <StatusBadge
                                                map={SERVICE_STATUS}
                                                value={service.status}
                                            />
                                        </div>

                                        {service.data_boundary && (
                                            <p className="mt-3 rounded-md border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
                                                <span className="font-semibold text-foreground">
                                                    Data boundary:{' '}
                                                </span>
                                                {service.data_boundary}
                                            </p>
                                        )}

                                        <dl className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <Clock className="h-3.5 w-3.5 shrink-0" />
                                                <span>
                                                    Last health check:{' '}
                                                    {formatDate(service.last_health_check)}
                                                </span>
                                            </div>
                                            {service.next_action && (
                                                <div className="flex items-start gap-2">
                                                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                    <span>Next: {service.next_action}</span>
                                                </div>
                                            )}
                                        </dl>

                                        <div className="mt-4 flex items-center gap-2">
                                            <Select
                                                value={service.status}
                                                onValueChange={(value) =>
                                                    updateServiceStatus(service, value)
                                                }
                                                disabled={updatingId === service.id}
                                            >
                                                <SelectTrigger
                                                    className="h-9 w-44"
                                                    aria-label={`Status for ${service.name}`}
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {Object.entries(SERVICE_STATUS).map(
                                                        ([key, meta]) => (
                                                            <SelectItem key={key} value={key}>
                                                                {meta.label}
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            {updatingId === service.id && (
                                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                            )}
                                        </div>
                                    </Card>
                                </li>
                            ))}
                        </ul>
                    )}
                </TabsContent>
            </Tabs>

            <Dialog open={operationOpen} onOpenChange={setOperationOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Add an operation</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitOperation} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="op-name">Name</Label>
                            <Input
                                id="op-name"
                                value={operationForm.name}
                                onChange={(event) =>
                                    setOperationForm((prev) => ({ ...prev, name: event.target.value }))
                                }
                                placeholder="e.g. Nightly backup verification"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="op-summary">What it is for</Label>
                            <Input
                                id="op-summary"
                                value={operationForm.summary}
                                onChange={(event) =>
                                    setOperationForm((prev) => ({
                                        ...prev,
                                        summary: event.target.value,
                                    }))
                                }
                                placeholder="One sentence a stand-in could act on"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="op-runbook">Runbook</Label>
                            <Textarea
                                id="op-runbook"
                                value={operationForm.runbook}
                                onChange={(event) =>
                                    setOperationForm((prev) => ({
                                        ...prev,
                                        runbook: event.target.value,
                                    }))
                                }
                                rows={8}
                                placeholder={'1. First step\n2. Second step\n3. What to do when it fails'}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="op-status">Current status</Label>
                                <Select
                                    value={operationForm.status}
                                    onValueChange={(value) =>
                                        setOperationForm((prev) => ({ ...prev, status: value }))
                                    }
                                >
                                    <SelectTrigger id="op-status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(OPERATION_STATUS).map(([key, meta]) => (
                                            <SelectItem key={key} value={key}>
                                                {meta.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="op-note">Note (optional)</Label>
                                <Input
                                    id="op-note"
                                    value={operationForm.owner_note}
                                    onChange={(event) =>
                                        setOperationForm((prev) => ({
                                            ...prev,
                                            owner_note: event.target.value,
                                        }))
                                    }
                                    placeholder="Anything the next person needs to know"
                                />
                            </div>
                        </div>
                        <WriteErrorNotice
                            message={validation || operations.writeError}
                            onDismiss={operations.clearWriteError}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="ghost" size="sm">
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button type="submit" size="sm" disabled={operations.saving}>
                                {operations.saving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    'Save operation'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(runFor)} onOpenChange={(open) => !open && setRunFor(null)}>
                <DialogContent className="border-border bg-card">
                    <DialogHeader>
                        <DialogTitle>
                            {runFor ? `Log a run of "${runFor.name}"` : 'Log a run'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={submitRun} className="space-y-4">
                        <div className="grid gap-2">
                            <Label htmlFor="run-result">Result</Label>
                            <Select
                                value={runForm.result}
                                onValueChange={(value) =>
                                    setRunForm((prev) => ({ ...prev, result: value }))
                                }
                            >
                                <SelectTrigger id="run-result">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(RUN_RESULT).map(([key, meta]) => (
                                        <SelectItem key={key} value={key}>
                                            {meta.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="run-notes">What happened</Label>
                            <Textarea
                                id="run-notes"
                                value={runForm.notes}
                                onChange={(event) =>
                                    setRunForm((prev) => ({ ...prev, notes: event.target.value }))
                                }
                                rows={3}
                                placeholder="What you saw, and anything that needs following up"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="run-duration">Duration in seconds (optional)</Label>
                            <Input
                                id="run-duration"
                                type="number"
                                min={0}
                                value={runForm.duration_seconds}
                                onChange={(event) =>
                                    setRunForm((prev) => ({
                                        ...prev,
                                        duration_seconds: event.target.value,
                                    }))
                                }
                            />
                        </div>
                        <WriteErrorNotice
                            message={runs.writeError}
                            onDismiss={runs.clearWriteError}
                        />
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="ghost" size="sm">
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button type="submit" size="sm" disabled={runs.saving}>
                                {runs.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log run'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Sensitive credentials (API keys, secrets) belong in your own secured service
                instances — never entered or displayed here. BuildAndDo stores connection status
                and runbook text only, never credentials.
            </p>
        </div>
    );
}
