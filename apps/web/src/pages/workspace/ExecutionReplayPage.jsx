// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/ExecutionReplayPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/lib/businessExecution.js, apps/web/src/components/workspace/MissionReplayCapture.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON apps/web/src/lib/businessExecution.js; CONSUMES apps/web/src/components/workspace/MissionReplayCapture.jsx
// DAG Node:    none
// Intent:      Replay and export actual bounded-action receipts without treating recorded results as independent verification.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { useBusinessExecution } from '@/hooks/useBusinessExecution';
import { businessReplay } from '@/lib/businessExecution';
import MissionReplayCapture from '@/components/workspace/MissionReplayCapture';
import { readFailed } from '@/lib/observability/runtime';
import { PUBLIC_ACTIONS, publicActionSection, trackPublicAction } from '@/lib/publicActions';

function Replay({ api, demo }) {
    const [data, setData] = useState(null), [page, setPage] = useState(1), [reload, setReload] = useState(0), [error, setError] = useState(''), [discarded, setDiscarded] = useState(false);
    const [params, setParams] = useSearchParams(), selected = params.get('action') || '';
    const setSelected = (id) => { const next = new URLSearchParams(params); if (id) next.set('action', id); else next.delete('action'); setParams(next); };
    const [detail, setDetail] = useState({ id: '', job: null, error: '', discarded: false });
    useEffect(() => { let alive = true; setDetail({ id: selected, job: null, error: '', discarded: false });
        // The single-receipt read goes through the same scope guard as the list below, so a stale
        // answer is just as final here: record it, or a deep-linked ?action= would say it is loading forever.
        const pathname = globalThis.window?.location?.pathname, section = publicActionSection(pathname);
        if (selected && !demo) api.read(selected).then((result) => {
            if (!alive) return;
            if (result.stale) { setDetail({ id: selected, job: null, error: '', discarded: true }); return; }
            if (!result.ok && !['scope_changed', 'cancelled'].includes(result.reason) && pathname === globalThis.window?.location?.pathname)
                readFailed(section, 'records', result.readFailure?.reason || 'unavailable', result.readFailure?.status);
            setDetail({ id: selected, job: result.ok ? result.data : null, error: result.error || '', discarded: false });
        }).catch((failure) => {
            if (!alive) return;
            if (!failure?.isAbort && failure?.name !== 'AbortError' && pathname === globalThis.window?.location?.pathname)
                readFailed(section, 'records', 'unavailable', failure?.status);
            setDetail({ id: selected, job: null, error: 'The selected receipt could not be read. Refresh to try again.', discarded: false });
        }); return () => { alive = false; }; }, [api, selected, reload, demo]);
    useEffect(() => { let alive = true; setData(null); setError(''); setDiscarded(false);
        // A stale answer is one the scope guard threw away because the signed-in account or selected
        // workspace no longer matches the read; nothing further will arrive, so leaving the loading
        // line up would make the page wait forever on a request that is already over.
        const pathname = globalThis.window?.location?.pathname, section = publicActionSection(pathname);
        if (!demo) api.list({ page }).then((result) => {
            if (!alive) return;
            if (result.stale) { setDiscarded(true); return; }
            if (result.ok) {
                setData(result.data);
                if (pathname === globalThis.window?.location?.pathname) {
                    try {
                        if (!Array.isArray(result.data?.items)) throw new TypeError('Unavailable snapshot counts');
                        const { completed, uncertain, failed } = businessReplay(result.data.items);
                        trackPublicAction(PUBLIC_ACTIONS.REPLAY_SNAPSHOT, 'observed', 'recorded_snapshot', { completed, uncertain, failed }, { section });
                    } catch { readFailed(section, 'records', 'invalid_response'); }
                }
            } else {
                if (!['scope_changed', 'cancelled'].includes(result.reason) && pathname === globalThis.window?.location?.pathname)
                    readFailed(section, 'records', result.readFailure?.reason || 'unavailable', result.readFailure?.status);
                setError(result.error);
            }
        }).catch((failure) => {
            if (!alive) return;
            if (!failure?.isAbort && failure?.name !== 'AbortError' && pathname === globalThis.window?.location?.pathname)
                readFailed(section, 'records', 'unavailable', failure?.status);
            setError('Execution receipts could not be read. Refresh to try again.');
        });
        return () => { alive = false; }; }, [api, page, reload, demo]);
    const replay = useMemo(() => businessReplay(data?.items || []), [data]);
    const job = detail.id === selected ? detail.job : null;
    const download = () => {
        if (!data || demo) return;
        const payload = { schema_version: 'buildanddo.business-replay/v1', workspace: data.workspace, captured_at: new Date().toISOString(),
            page: data.page, has_more: data.has_more, jobs: data.items, evidence_state: 'recorded', independent_verification: 'not_established_by_export' };
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `business-replay-page-${page}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <div className="space-y-5 ph-no-capture" data-dd-privacy="mask">
        <PageHeader title="Execution replay" description="Trace requested work, dispatch and retained outcomes. Replay reads history and never reruns an action." />
        <MissionReplayCapture api={api} demo={demo} />
        <div className="flex flex-wrap gap-3"><Button size="sm" variant="secondary" disabled={demo} onClick={() => setReload((value) => value + 1)}>Refresh receipts</Button>
            <Button size="sm" disabled={!data || demo} onClick={download}>Export this receipt page</Button><Link className="self-center text-sm underline" to="/app/workflows">Workflows</Link><Link className="self-center text-sm underline" to="/app/evidence">Evidence Ledger</Link></div>
        {demo ? <p>No real execution receipts are loaded in demo mode.</p> : error ? <p role="alert">{error}</p> : discarded ? <p role="status">Receipts were not loaded: this read was made for an account and workspace that are no longer the ones open here, so the answer was discarded unread. That is not the same as having none. Use Refresh receipts to try again.</p> : !data ? <p role="status">Loading retained receipts…</p> : <>
            <p className="text-sm">This page: {replay.completed} succeeded · {replay.uncertain} uncertain · {replay.failed} failed. Provider success still requires mission review.</p>
            <div className="grid gap-4 lg:grid-cols-2"><Card className="space-y-3 p-4"><h2 className="font-display text-lg">Action receipts</h2>
                {!data.items.length && <p className="text-sm">No recorded business actions on this page.</p>}
                <ul className="space-y-2">{data.items.map((item) => <li key={item.id}><button type="button" className="w-full border border-border p-3 text-left text-sm" onClick={() => setSelected(item.id)} aria-pressed={item.id === selected}>
                    <span className="block font-medium">{item.provider} · {item.status}</span><span className="break-all text-xs">{item.id} · {item.created}</span></button></li>)}</ul>
                <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={page === 1} onClick={() => { setPage(page - 1); setSelected(''); }}>Previous page</Button>
                    <Button size="sm" variant="ghost" disabled={!data.has_more} onClick={() => { setPage(page + 1); setSelected(''); }}>Next page</Button></div>
                {(data.has_more || page > 1) && <p className="text-xs">This is a partial page of history. Select a mission above to capture its complete chain.</p>}
            </Card><Card className="space-y-3 p-4"><h2 className="font-display text-lg">Receipt detail</h2>{job ? <>
                {job.mission && <Link className="text-sm underline" to={`/app/missions?mission=${encodeURIComponent(job.mission)}`}>Open linked mission</Link>}
                {job.run && <Link className="block text-sm underline" to={`/app/workflows?run=${encodeURIComponent(job.run)}`}>Open saved workflow run</Link>}
                {job.evidence && <Link className="block text-sm underline" to={`/app/evidence?evidence=${encodeURIComponent(job.evidence)}`}>Inspect outcome evidence</Link>}
                {job.provider === 'erp' && job.result?.reported?.output?.task && <Link className="block text-sm underline" to={`/app/erp?task=${encodeURIComponent(job.result.reported.output.task)}`}>Open resulting task</Link>}
                <p className="text-sm">{job.status === 'hold' || job.requires_reconciliation ? 'HOLD: reconcile the existing provider result before planning another attempt.' : 'Retained execution observation.'}</p>
                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(job, null, 2)}</pre>
            </> : <p className="text-sm" role={detail.error ? 'alert' : 'status'}>{detail.error || (selected && detail.id === selected && detail.discarded ? 'The selected receipt was not loaded: its read was discarded because it no longer matches the account and workspace open here. That does not mean the receipt is missing. Use Refresh receipts to try again.'
                : selected ? 'Loading the selected receipt…' : 'Select a receipt to inspect its approved input, actor, dates and exact saved result.')}</p>}</Card></div>
            <Card className="space-y-3 p-4"><h2 className="font-display text-lg">Observed sequence</h2><ol className="space-y-2 text-sm">{replay.timeline.map((entry, index) => <li key={`${entry.job}:${entry.stage}:${index}`} className="border-l-2 border-border pl-3">
                <time dateTime={entry.at}>{entry.at}</time> · {entry.stage} · {entry.actor}<p className="break-all text-xs">Action {entry.job}{entry.evidence ? ` · Evidence ${entry.evidence}` : ''}</p></li>)}</ol></Card>
        </>}
    </div>;
}
export default function ExecutionReplayPage() {
    const control = useBusinessExecution(); return <Replay key={control.scope} {...control} />;
}
