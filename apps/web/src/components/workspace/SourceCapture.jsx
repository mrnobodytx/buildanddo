// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/SourceCapture.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/lib/businessExecution.js
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/businessExecution.js
// DAG Node:     none
// Intent:       Connect a real public-source request to the worker-backed signal inbox and retained capture receipt.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { Input } from '@/components/ui/input';
import { useBusinessExecution } from '@/hooks/useBusinessExecution';
import { createRetryIntent } from '@/lib/workflowRuns';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
/** Request a permitted source capture whose worker receipt creates a durable signal. */
export default function SourceCapture({ onSaved }) {
    const { api, scope, demo } = useBusinessExecution();
    const access = useWorkspaceAccess(), canWrite = !demo && access.data?.can_write === true;
    const [url, setUrl] = useState(''), [binding, setBinding] = useState(''), [job, setJob] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const alive = useRef(true), lock = useRef(false), intent = useRef(createRetryIntent());
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { setUrl(''); setBinding(''); setJob(null); setError(''); setBusy(false); intent.current = createRetryIntent(); }, [scope]);
    const capture = async (event) => {
        event.preventDefault(); if (lock.current || !canWrite) return; lock.current = true; setBusy(true); setError('');
        const response = await api.command(intent.current({ action: 'source.capture', revision: 0, payload: { url: url.trim(), binding: binding.trim() } }));
        if (alive.current && !response.stale) {
            if (response.ok) { setJob(response.data); intent.current = createRetryIntent(); } else setError(response.error);
            setBusy(false);
        }
        lock.current = false;
    };
    const reload = async () => {
        const response = await api.list();
        if (alive.current && response.ok) { const current = response.data.items.find((item) => item.id === job?.id);
            if (current) { setJob(current); if (current.status === 'succeeded') onSaved(); }
            else setError('This receipt is outside the current page. Open execution replay to locate it.'); }
        else if (alive.current && response.error) setError(response.error);
    };
    return <Card className="space-y-3 p-4"><h2 className="font-display text-lg font-semibold">Capture a public signal</h2>
        <p className="text-sm text-muted-foreground">Read one public HTTPS source through a configured Firecrawl binding. The saved signal retains its URL, captured text and digest. Capturing a claim does not verify it.</p>
        <form onSubmit={capture} className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]"><label className="text-sm">Source URL<Input type="url" required maxLength={2048} value={url} onChange={(event) => setUrl(event.target.value)} disabled={!canWrite || busy} /></label>
            <label className="text-sm">Registered binding<Input required maxLength={64} value={binding} onChange={(event) => setBinding(event.target.value)} disabled={!canWrite || busy} /></label>
            <Button type="submit" size="sm" className="self-end" disabled={!canWrite || busy}>Request capture</Button></form>
        {!demo && !canWrite && <p className="text-xs">An active owner, administrator or editor role is required to request a capture.</p>}
        <Link className="text-sm underline" to="/app/integrations">Configure Firecrawl</Link>
        {job && <div className="space-y-2 text-sm" role="status"><p>Capture {job.id}: {job.status}{job.result?.records?.signal ? ` · Signal ${job.result.records.signal}` : ''}</p>
            <Button size="sm" variant="secondary" onClick={reload}>Reload capture result</Button><Link className="ml-3 underline" to="/app/replay">View receipts</Link></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </Card>;
}
