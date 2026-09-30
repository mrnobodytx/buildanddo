// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/workflows/BusinessActionReview.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/lib/businessExecution.js, apps/web/src/lib/workflowRuns.js
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/businessExecution.js; DEPENDS_ON apps/web/src/lib/workflowRuns.js
// DAG Node:     none
// Intent:       Expose actual bounded execution and uncertain outcomes in the existing workflow review.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/site/ui';
import { useBusinessExecution } from '@/hooks/useBusinessExecution';
import { createRetryIntent } from '@/lib/workflowRuns';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
/** Execute the current approved step and reload its retained backend receipt. */
export default function BusinessActionReview({ run, step, runApi, onSaved, onBusy, disabled }) {
    const { api, scope, demo } = useBusinessExecution();
    const access = useWorkspaceAccess(), canWrite = !demo && !access.loading && !access.error && access.data?.can_write === true;
    const target = `${scope}:${run.id}:${run.revision}:${step.id}`;
    const [snapshot, setSnapshot] = useState({ target, job: null, error: '', loaded: false });
    const [busy, setBusy] = useState(false);
    const { job, error, loaded } = snapshot.target === target ? snapshot : { job: null, error: '', loaded: false };
    const alive = useRef(true), lock = useRef(null), intent = useRef(createRetryIntent()), sequence = useRef(0);
    const currentTarget = useRef(target); currentTarget.current = target;
    const current = () => alive.current && currentTarget.current === target;
    useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current++; }; }, []);
    const load = async () => {
        if (!current() || demo) return;
        const ticket = ++sequence.current;
        try {
            const result = await api.list({ run: run.id });
            if (!current() || ticket !== sequence.current || result.stale) return;
            if (result.ok) {
                const saved = result.data.items.find((item) => item.run === run.id && item.step_id === step.id);
                setSnapshot({ target, loaded: true, error: '', job: saved || null });
                if (saved && ['succeeded', 'failed'].includes(saved.status)) {
                    const latest = await runApi.read(run.id);
                    if (current() && ticket === sequence.current && latest.ok && latest.record.id === run.id && latest.record.revision > run.revision)
                        onSaved(latest.record);
                }
            } else {
                setSnapshot((before) => ({ ...before, target, loaded: false, error: result.error || 'Could not load action receipts. Reload before dispatching.' }));
            }
        } catch {
            if (current() && ticket === sequence.current)
                setSnapshot((before) => ({ ...before, target, loaded: false, error: 'Could not load action receipts. Reload before dispatching.' }));
        }
    };
    useEffect(() => {
        setSnapshot({ target, loaded: false, job: null, error: '' }); setBusy(false);
        void load();
        const timer = setInterval(() => { if (!document.hidden && !lock.current) void load(); }, 10000);
        return () => { clearInterval(timer); sequence.current++; if (lock.current) { lock.current = null; onBusy?.(false); } };
    }, [api, target]);
    const execute = async () => {
        if (lock.current || !current() || !canWrite || disabled || !loaded || job) return;
        const operation = {}; lock.current = operation;
        // Fence any pre-dispatch read before accepting the command's receipt.
        sequence.current++; setBusy(true); onBusy?.(true);
        setSnapshot((before) => ({ ...before, error: '' }));
        try {
            const response = await api.command(intent.current({ action: 'action.enqueue', revision: run.revision, payload: { run: run.id, step_id: step.id } }));
            if (!current() || response.stale) return;
            if (response.ok) { setSnapshot({ target, job: response.data, loaded: true, error: '' }); await load(); }
            else setSnapshot((before) => ({ ...before, loaded: false, error: response.error || 'Could not confirm this action. Reload its receipts before retrying.' }));
        } catch {
            if (current()) setSnapshot((before) => ({ ...before, loaded: false, error: 'Could not confirm this action. Reload its receipts before retrying.' }));
        } finally {
            if (lock.current === operation) {
                lock.current = null;
                if (current()) { setBusy(false); onBusy?.(false); }
            }
        }
    };
    return <div className="space-y-3">
        <p className="text-sm">Execute the frozen action approved at the checkpoint. Results return to this run and the Evidence Ledger; mission verification remains separate.</p>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-border p-3 text-xs">{JSON.stringify(step.action, null, 2)}</pre>
        {job && <div role="status" className="text-sm"><p>Action: {job.status}</p><p className="text-xs">Receipt {job.id}{job.evidence ? ` · Evidence ${job.evidence}` : ''}</p>
            {['hold', 'dispatched'].includes(job.status) && <p>Outcome may be uncertain. Read the provider receipt before any new attempt; this action will not be blindly repeated.</p>}</div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2"><Button size="sm" disabled={disabled || !canWrite || busy || !loaded || Boolean(job)} onClick={execute}>{busy ? 'Recording dispatch…' : 'Execute approved step'}</Button>
            <Button size="sm" variant="secondary" disabled={busy || demo} onClick={load}>Reload action receipt</Button><Link className="self-center text-sm underline" to="/app/replay">Execution replay</Link></div>
    </div>;
}
