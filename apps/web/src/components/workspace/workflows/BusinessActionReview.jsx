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
export default function BusinessActionReview({ run, step, runApi, onSaved, disabled }) {
    const { api, scope, demo } = useBusinessExecution();
    const access = useWorkspaceAccess(), canWrite = !demo && access.data?.can_write === true;
    const [job, setJob] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
    const alive = useRef(true), lock = useRef(false), intent = useRef(createRetryIntent());
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const load = async () => {
        const result = await api.list({ run: run.id });
        if (!alive.current || result.stale) return;
        if (result.ok) {
            setLoaded(true); setError(''); const saved = result.data.items.find((item) => item.step_id === step.id); setJob(saved || null);
            if (saved && ['succeeded', 'failed'].includes(saved.status)) {
                const latest = await runApi.read(run.id); if (alive.current && latest.ok && latest.record.revision !== run.revision) onSaved(latest.record);
            }
        } else setError(result.error);
    };
    useEffect(() => { setLoaded(false); setJob(null); void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 10000);
        return () => clearInterval(timer); }, [scope, run.id, step.id]);
    const execute = async () => {
        if (lock.current || !canWrite || disabled || !loaded) return; lock.current = true; setBusy(true); setError('');
        const response = await api.command(intent.current({ action: 'action.enqueue', revision: run.revision, payload: { run: run.id, step_id: step.id } }));
        if (alive.current && !response.stale) { if (response.ok) { setJob(response.data); await load(); } else setError(response.error); setBusy(false); }
        lock.current = false;
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
