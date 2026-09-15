// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/workflowRuns.js, apps/web/src/components/workspace/workflows/StartWorkflowRun.jsx, apps/web/src/components/workspace/workflows/WorkflowRunReview.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/workflowRuns.js; CONSUMES apps/web/src/components/workspace/workflows/StartWorkflowRun.jsx; CONSUMES apps/web/src/components/workspace/workflows/WorkflowRunReview.jsx
// DAG Node:    none
// Intent:      Show scoped paginated run history and approval checkpoints with distinct loading, empty, unavailable and demo states.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/site/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ListSkeleton } from '@/components/workspace/WorkspaceNotices';
import { StatusBadge } from '@/components/workspace/workspaceHelpers';
import StartWorkflowRun, { runSelectClass } from '@/components/workspace/workflows/StartWorkflowRun';
import WorkflowRunReview from '@/components/workspace/workflows/WorkflowRunReview';
import { observeMutation } from '@/lib/observability/mutations';
import pb from '@/lib/pocketbaseClient';
import { createWorkflowRunClient, readRunSnapshot, RUN_STATUS } from '@/lib/workflowRuns';
import { timeAgo } from '@/lib/format';

/** Present run history for the mounted account and workspace. */
export default function WorkflowRunsPanel({ workflows, workspaceId, accountId, demo = false, definitionsUnavailable = false, onRecordsChanged }) {
    const [page, setPage] = useState(1);
    const [workflow, setWorkflow] = useState('');
    const [status, setStatus] = useState('');
    const [history, setHistory] = useState({ loading: true, error: '', items: [], totalItems: 0, totalPages: 0 });
    const [starting, setStarting] = useState(false);
    const [startBusy, setStartBusy] = useState(false);
    const [selected, setSelected] = useState(null);
    const [reviewBusy, setReviewBusy] = useState(false);
    const alive = useRef(true);
    const sequence = useRef(0);
    const scope = `${workspaceId}:${accountId}:${demo}`;
    const currentScope = useRef(scope);
    currentScope.current = scope;
    const api = useMemo(() => createWorkflowRunClient({ client: pb, workspaceId, accountId,
        isCurrent: () => alive.current && currentScope.current === scope && !demo, observe: observeMutation }),
    [workspaceId, accountId, scope, demo]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current += 1; }; }, []);
    const refresh = useCallback(async () => {
        const request = ++sequence.current;
        if (demo) {
            setHistory({ loading: false, error: '', items: [], totalItems: 0, totalPages: 0 });
            return;
        }
        setHistory((before) => ({ ...before, loading: true, error: '' }));
        const response = await api.list({ page, workflow, status });
        if (!alive.current || request !== sequence.current || response.reason === 'scope_changed') return;
        if (response.ok) setHistory({ ...response.page, loading: false, error: '' });
        else setHistory({ loading: false, error: 'Run history is unavailable. Retry before starting another run.',
            items: [], totalItems: 0, totalPages: 0 });
    }, [api, demo, page, workflow, status]);
    useEffect(() => { refresh(); return () => { sequence.current += 1; }; }, [refresh]);
    const saved = (record) => { setSelected(record); refresh(); onRecordsChanged?.(); };
    const canStart = !demo && !definitionsUnavailable && !history.loading && !history.error &&
        workflows.some((record) => record.status === 'active');

    return (
        <section className="ph-no-capture space-y-4 border-t border-border pt-6" aria-labelledby="workflow-history-title"
            data-dd-privacy="mask">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 id="workflow-history-title" className="font-display text-2xl">Run history</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Recorded work, approval checkpoints and saved evidence for this workspace.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={refresh} disabled={history.loading || demo}>Refresh runs</Button>
                    <Button type="button" size="sm" onClick={() => setStarting(true)} disabled={!canStart}>Start a run</Button>
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="run-workflow-filter">Workflow history</Label>
                    <select id="run-workflow-filter" className={runSelectClass} value={workflow}
                        onChange={(event) => { setWorkflow(event.target.value); setPage(1); }}>
                        <option value="">All workflows</option>
                        {workflows.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="run-status-filter">Run status</Label>
                    <select id="run-status-filter" className={runSelectClass} value={status}
                        onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                        <option value="">All runs</option>
                        {Object.entries(RUN_STATUS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                    </select>
                </div>
            </div>
            {demo ? <p className="text-sm text-muted-foreground">Demo mode does not create workflow runs. Switch to real data to record work.</p> :
                history.loading ? <ListSkeleton rows={2} /> : history.error ?
                    <div role="alert" className="border border-border p-4 text-sm">{history.error}</div> :
                    history.items.length === 0 ? <p className="text-sm text-muted-foreground">No recorded runs match this view.</p> :
                        <ul aria-label="Workflow runs" className="space-y-3">{history.items.map((run) => {
                            const snapshot = readRunSnapshot(run);
                            return <li key={run.id}>
                                <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0 break-words">
                                        <p className="font-medium">{snapshot?.name || 'Saved workflow run'}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">Run {run.id} · Started {timeAgo(run.started_at)}</p>
                                        {snapshot && <p className="mt-1 text-xs text-muted-foreground">{run.next_step} of {snapshot.steps.length} steps completed{snapshot.mission_title ? ` · ${snapshot.mission_title}` : ''}</p>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge map={RUN_STATUS} value={run.status} />
                                        <Button type="button" size="sm" variant="secondary" aria-label={`Open run ${run.id}`}
                                            onClick={() => setSelected(run)}>Open run</Button>
                                    </div>
                                </Card>
                            </li>;
                        })}</ul>}
            {!demo && !history.loading && !history.error && history.totalPages > 0 &&
                <nav aria-label="Run history pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous runs</Button>
                    <span>Page {page} of {history.totalPages} · {history.totalItems} runs</span>
                    <Button type="button" variant="secondary" size="sm" disabled={page >= history.totalPages} onClick={() => setPage(page + 1)}>Next runs</Button>
                </nav>}

            <Dialog open={starting} onOpenChange={(open) => { if (!startBusy) setStarting(open); }}>
                <DialogContent className="ph-no-capture max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-xl" data-dd-privacy="mask">
                    <DialogHeader><DialogTitle>Start a recorded run</DialogTitle>
                        <DialogDescription>Save the current steps and record outcomes as you perform the work.</DialogDescription></DialogHeader>
                    {starting && <StartWorkflowRun workflows={workflows} api={api} disabled={demo || definitionsUnavailable}
                        onBusy={setStartBusy} onSaved={(record) => { setStarting(false); saved(record); }} />}
                </DialogContent>
            </Dialog>
            <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !reviewBusy) setSelected(null); }}>
                <DialogContent className="ph-no-capture max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-2xl" data-dd-privacy="mask">
                    <DialogHeader><DialogTitle>{selected ? readRunSnapshot(selected)?.name || 'Workflow run' : 'Workflow run'}</DialogTitle>
                        <DialogDescription>Review saved steps, decisions and evidence. Only recorded outcomes advance the run.</DialogDescription></DialogHeader>
                    {selected && <WorkflowRunReview key={`${selected.id}:${selected.revision}`} run={selected} api={api}
                        onSaved={saved} onBusy={setReviewBusy} disabled={demo} />}
                </DialogContent>
            </Dialog>
        </section>
    );
}
