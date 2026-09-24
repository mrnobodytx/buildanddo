// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/SourceCapture.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/lib/businessExecution.js, apps/web/src/components/workspace/ConnectorBinding.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/lib/businessExecution.js; CONSUMES apps/web/src/components/workspace/ConnectorBinding.jsx
// DAG Node:    none
// Intent:      Connect a real public-source request to the worker-backed signal inbox and retained capture receipt.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { useBusinessExecution } from '@/hooks/useBusinessExecution';
import { createRetryIntent } from '@/lib/workflowRuns';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import ConnectorBinding from '@/components/workspace/ConnectorBinding';
/** Request a permitted source capture whose worker receipt creates a durable signal. */
export default function SourceCapture({ onSaved }) {
    const { api, scope, demo } = useBusinessExecution();
    const access = useWorkspaceAccess(), canWrite = !demo && access.data?.can_write === true;
    const [url, setUrl] = useState(''), [binding, setBinding] = useState(''), [job, setJob] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [ready, setReady] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const alive = useRef(true), lock = useRef(false), intent = useRef(createRetryIntent());
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { setUrl(''); setBinding(''); setJob(null); setError(''); setBusy(false); setUncertain(false); intent.current = createRetryIntent(); }, [scope]);
    const capture = async (event) => {
        event.preventDefault(); if (lock.current || !canWrite || !ready && !uncertain || job && !['succeeded', 'failed', 'cancelled'].includes(job.status)) return; lock.current = true; setBusy(true); setError('');
        const response = await api.command(intent.current({ action: 'source.capture', revision: 0, payload: { url: url.trim(), binding: binding.trim() } }));
        if (alive.current && !response.stale) {
            if (response.ok) { setJob(response.data); setUncertain(false); intent.current = createRetryIntent(); }
            else { setError(response.error); setUncertain(response.reason === 'uncertain'); }
            setBusy(false);
        }
        lock.current = false;
    };
    const reload = async () => {
        const response = await api.read(job?.id);
        if (alive.current && response.ok) {
            setError(''); setJob(response.data); if (response.data.status === 'succeeded') onSaved(); }
        else if (alive.current && response.error) setError(response.error);
    };
    const cancel = async () => {
        if (lock.current || !canWrite || !job) return;
        lock.current = true; setBusy(true); setError('');
        const result = await api.command(intent.current({ action: 'action.cancel', revision: job.revision, payload: { id: job.id } }));
        if (alive.current && !result.stale) { if (result.ok) setJob(result.data); else setError(result.error); setBusy(false); }
        lock.current = false;
    };
    return <Card className="space-y-3 p-4"><h2 className="font-display text-lg font-semibold">Capture a public signal</h2>
        <p className="text-sm text-muted-foreground">Read one public HTTPS source through a configured Firecrawl binding. The saved signal retains its URL, captured text and digest. Capturing a claim does not verify it.</p>
        <form onSubmit={capture} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]"><label className="text-sm">Source URL<Input type="url" required maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} disabled={!canWrite || busy || uncertain} /></label>
            <ConnectorBinding provider="firecrawl" value={binding} onChange={setBinding} onReady={setReady} disabled={!canWrite || busy || uncertain} />
            <Button type="submit" size="sm" className="self-end" disabled={!canWrite || busy || !ready && !uncertain || Boolean(job && !['succeeded', 'failed', 'cancelled'].includes(job.status))}>{uncertain ? 'Recover capture request' : 'Request capture'}</Button></form>
        {uncertain && <p role="status" className="text-sm">The response was lost. Recover this same request before changing its source or connection.</p>}
        {!demo && !canWrite && <p className="text-xs">An active owner, administrator or editor role is required to request a capture.</p>}
        <Link className="text-sm underline" to="/app/integrations">Configure Firecrawl</Link>
        {job && <div className="space-y-2 text-sm" role="status"><p>Capture {job.id}: {job.status}{job.result?.records?.signal ? ` · Signal ${job.result.records.signal}` : ''}</p>
            {job.failure && <p>Capture stopped: {job.failure}. Inspect the receipt before requesting another capture.</p>}
            <Button size="sm" variant="secondary" disabled={busy} onClick={reload}>Reload capture result</Button>
            {['queued', 'claimed'].includes(job.status) && <Button size="sm" variant="ghost" disabled={busy || !canWrite} onClick={cancel}>Cancel pending capture</Button>}
            <Link className="ml-3 underline" to={`/app/replay?action=${encodeURIComponent(job.id)}`}>View this receipt</Link></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </Card>;
}
