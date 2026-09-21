// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/pages/workspace/ExecutionReplayPage.jsx
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
// Intent:       Replay and export actual bounded-action receipts without treating recorded results as independent verification.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { useBusinessExecution } from '@/hooks/useBusinessExecution';
import { businessReplay } from '@/lib/businessExecution';

function Replay({ api, demo }) {
    const [data, setData] = useState(null), [page, setPage] = useState(1), [reload, setReload] = useState(0), [error, setError] = useState(''), [selected, setSelected] = useState('');
    useEffect(() => { let alive = true; setData(null); setError('');
        if (!demo) api.list({ page }).then((result) => { if (!alive || result.stale) return; if (result.ok) setData(result.data); else setError(result.error); });
        return () => { alive = false; }; }, [api, page, reload, demo]);
    const replay = useMemo(() => businessReplay(data?.items || []), [data]);
    const job = data?.items.find((item) => item.id === selected);
    const download = () => {
        if (!data || demo) return;
        const payload = { schema_version: 'buildanddo.business-replay/v1', workspace: data.workspace, captured_at: new Date().toISOString(),
            page: data.page, has_more: data.has_more, jobs: data.items, evidence_state: 'recorded', independent_verification: 'not_established_by_export' };
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `business-replay-page-${page}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <div className="space-y-5 ph-no-capture" data-dd-privacy="mask">
        <PageHeader title="Execution replay" description="Trace requested work, dispatch and retained outcomes. Replay reads history and never reruns an action." />
        <div className="flex flex-wrap gap-3"><Button size="sm" variant="secondary" disabled={demo} onClick={() => setReload((value) => value + 1)}>Refresh receipts</Button>
            <Button size="sm" disabled={!data || demo} onClick={download}>Export this receipt page</Button><Link className="self-center text-sm underline" to="/app/workflows">Workflows</Link><Link className="self-center text-sm underline" to="/app/evidence">Evidence Ledger</Link></div>
        {demo ? <p>No real execution receipts are loaded in demo mode.</p> : error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading retained receipts…</p> : <>
            <p className="text-sm">This page: {replay.completed} succeeded · {replay.uncertain} uncertain · {replay.failed} failed. Provider success still requires mission review.</p>
            <div className="grid gap-4 lg:grid-cols-2"><Card className="space-y-3 p-4"><h2 className="font-display text-lg">Action receipts</h2>
                {!data.items.length && <p className="text-sm">No recorded business actions on this page.</p>}
                <ul className="space-y-2">{data.items.map((item) => <li key={item.id}><button type="button" className="w-full border border-border p-3 text-left text-sm" onClick={() => setSelected(item.id)} aria-pressed={item.id === selected}>
                    <span className="block font-medium">{item.provider} · {item.status}</span><span className="break-all text-xs">{item.id} · {item.created}</span></button></li>)}</ul>
                <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={page === 1} onClick={() => { setPage(page - 1); setSelected(''); }}>Previous page</Button>
                    <Button size="sm" variant="ghost" disabled={!data.has_more} onClick={() => { setPage(page + 1); setSelected(''); }}>Next page</Button></div>
                {(data.has_more || page > 1) && <p className="text-xs">This is a partial page of history; export each relevant page for a complete capture.</p>}
            </Card><Card className="space-y-3 p-4"><h2 className="font-display text-lg">Receipt detail</h2>{job ? <>
                {job.mission && <Link className="text-sm underline" to={`/app/missions?mission=${encodeURIComponent(job.mission)}`}>Open linked mission</Link>}
                <p className="text-sm">{job.status === 'hold' || job.requires_reconciliation ? 'HOLD: reconcile the existing provider result before planning another attempt.' : 'Retained execution observation.'}</p>
                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(job, null, 2)}</pre>
            </> : <p className="text-sm">Select a receipt to inspect its approved input, effect identity, actor, dates and exact saved result.</p>}</Card></div>
            <Card className="space-y-3 p-4"><h2 className="font-display text-lg">Observed sequence</h2><ol className="space-y-2 text-sm">{replay.timeline.map((entry, index) => <li key={`${entry.job}:${entry.stage}:${index}`} className="border-l-2 border-border pl-3">
                <time dateTime={entry.at}>{entry.at}</time> · {entry.stage} · {entry.actor}<p className="break-all text-xs">Action {entry.job}{entry.evidence ? ` · Evidence ${entry.evidence}` : ''}</p></li>)}</ol></Card>
        </>}
    </div>;
}
export default function ExecutionReplayPage() {
    const control = useBusinessExecution(); return <Replay key={control.scope} {...control} />;
}
