// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/WorkflowRunReview.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/workflowRuns.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/workflowRuns.js
// DAG Node:    none
// Intent:      Let operators record source-backed step outcomes and explicit approvals while preserving rejected observations for safe retries.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/workspace/workspaceHelpers';
import { createRetryIntent, readRunEvents, readRunSnapshot, RUN_STATUS, STEP_KINDS } from '@/lib/workflowRuns';

/** Render one saved run and the next authorized operator decision. */
export default function WorkflowRunReview({ run, api, onSaved, onBusy, disabled = false }) {
    const snapshot = readRunSnapshot(run);
    const events = readRunEvents(run);
    const step = snapshot?.steps[run.next_step];
    const open = ['running', 'awaiting_approval'].includes(run.status);
    const approval = step?.kind === 'approval';
    const [observation, setObservation] = useState('');
    const [source, setSource] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const busy = useRef(false);
    const alive = useRef(true);
    const intent = useRef(createRetryIntent());
    const heading = useRef(null);
    useEffect(() => {
        alive.current = true;
        heading.current?.focus();
        return () => { alive.current = false; };
    }, []);

    const send = async (action, outcome = '') => {
        if (busy.current || disabled) return;
        const note = action === 'cancel' ? reason : observation;
        if (!note.trim() || (action === 'step' && !approval && !source.trim())) {
            setError('Add your observation and its source before recording the outcome.');
            return;
        }
        if (action === 'step' && ['passed', 'approved'].includes(outcome) && !confirmed) {
            setError('Confirm your decision before recording a completed step or approval.');
            return;
        }
        busy.current = true; setSaving(true); onBusy(true); setError('');
        const result = await api.decide(run.id, intent.current({ revision: run.revision, action,
            step_id: action === 'cancel' ? '' : step.id, outcome,
            observation: note.trim(), source: action === 'cancel' || approval ? '' : source.trim() }));
        if (!alive.current) return;
        busy.current = false; setSaving(false); onBusy(false);
        if (result.ok) onSaved(result.record);
        else if (result.error) setError(result.error);
    };
    const reload = async () => {
        if (busy.current) return;
        busy.current = true; setSaving(true); onBusy(true);
        const result = await api.read(run.id);
        if (!alive.current) return;
        busy.current = false; setSaving(false); onBusy(false);
        if (result.ok) { setError(''); onSaved(result.record); }
        else setError(result.error || 'Could not reload this run.');
    };

    if (!snapshot) return <p role="alert">This saved run format is unavailable. Reload the page or ask the workspace operator to check it.</p>;
    return (
        <div className="space-y-5 break-words">
            <div className="flex flex-wrap items-center gap-3">
                <StatusBadge map={RUN_STATUS} value={run.status} />
                <p className="text-sm text-muted-foreground" role="status">
                    {run.next_step} of {snapshot.steps.length} steps completed
                </p>
            </div>
            <p className="text-sm text-muted-foreground">{snapshot.description}</p>
            {snapshot.mission_title && <p className="text-sm">Mission: {snapshot.mission_title}.{' '}
                <Link className="underline" to="/app/missions">Open the Mission Desk</Link>.</p>}

            {open && step ? (
                <section className="space-y-3 border border-border p-4" aria-label="Current step">
                    <h3 ref={heading} tabIndex={-1} className="font-semibold">Step {run.next_step + 1}: {step.name}</h3>
                    <p className="text-sm text-muted-foreground">{STEP_KINDS[step.kind]}{step.detail ? ` · ${step.detail}` : ''}</p>
                    <p className="text-sm text-muted-foreground">{approval ?
                        'A workspace owner or admin must approve or reject this checkpoint before work continues.' :
                        'Perform the step, then record what you observed. This record does not send a message or run an external tool.'}</p>
                    <div className="space-y-1.5">
                        <Label htmlFor="run-observation">{approval ? 'Decision rationale' : 'Observed result'}</Label>
                        <Textarea id="run-observation" value={observation} maxLength={1200} rows={3}
                            disabled={saving || disabled} onChange={(event) => setObservation(event.target.value)} />
                    </div>
                    {!approval && <div className="space-y-1.5">
                        <Label htmlFor="run-source">Observation source</Label>
                        <Input id="run-source" value={source} maxLength={160} disabled={saving || disabled}
                            onChange={(event) => setSource(event.target.value)} />
                    </div>}
                    <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1 shrink-0" checked={confirmed} disabled={saving || disabled}
                            onChange={(event) => setConfirmed(event.target.checked)} />
                        {approval ? 'I approve continuing with the saved workflow steps.' : 'I performed this step and recorded its result.'}
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" disabled={saving || disabled || !confirmed}
                            onClick={() => send('step', approval ? 'approved' : 'passed')}>
                            {approval ? 'Record approval' : 'Record completed step'}
                        </Button>
                        <Button type="button" size="sm" variant="secondary" disabled={saving || disabled}
                            onClick={() => send('step', approval ? 'rejected' : 'failed')}>
                            {approval ? 'Record rejection' : 'Record failure'}
                        </Button>
                    </div>
                </section>
            ) : <p ref={heading} tabIndex={-1} className="text-sm">This run is finished. Its receipts remain available below. Mission verification is a separate review.</p>}

            {error && <div className="space-y-2 border border-border p-3">
                <p role="alert" className="text-sm text-destructive">{error}</p>
                <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={reload}>Reload latest run</Button>
                <p className="text-xs text-muted-foreground">Retry the same decision to recover a saved result. Reloading shows another operator’s changes.</p>
            </div>}
            {saving && <p role="status" className="text-sm">Saving the decision and evidence…</p>}

            <section aria-label="Run receipts" className="space-y-3">
                <h3 className="font-semibold">Saved receipts</h3>
                {events.length === 0 ? <p className="text-sm text-muted-foreground">No outcomes recorded yet.</p> :
                    <ol className="space-y-3">{events.map((event) => {
                        const command = event.command;
                        const name = command.action === 'cancel' ? 'Cancellation' : snapshot.steps.find((item) => item.id === command.step_id)?.name;
                        return <li key={command.request_key} className="border border-border p-3 text-sm">
                            <p className="font-medium">{name} · {command.outcome || 'cancelled'}</p>
                            <p className="mt-1 whitespace-pre-wrap">{command.observation}</p>
                            <p className="mt-2 text-xs text-muted-foreground">{command.source || 'Operator decision'} · Account {event.actor} · <time dateTime={event.at}>{event.at}</time></p>
                            <p className="mt-1 text-xs text-muted-foreground">Evidence receipt: {event.evidence}</p>
                        </li>;
                    })}</ol>}
                <Link to="/app/evidence" className="text-sm underline">Open the Evidence Ledger</Link>
            </section>

            {open && <div className="space-y-3 border-t border-border pt-3">
                <Button type="button" variant="ghost" size="sm" disabled={saving || disabled} onClick={() => setCancelling(!cancelling)}>
                    {cancelling ? 'Keep this run open' : 'Cancel run'}
                </Button>
                {cancelling && <div className="space-y-2">
                    <Label htmlFor="cancel-reason">Cancellation reason</Label>
                    <Textarea id="cancel-reason" maxLength={1200} value={reason} disabled={saving || disabled}
                        onChange={(event) => setReason(event.target.value)} />
                    <Button type="button" variant="secondary" size="sm" disabled={saving || disabled || !reason.trim()}
                        onClick={() => send('cancel')}>Confirm cancellation</Button>
                </div>}
            </div>}
        </div>
    );
}
