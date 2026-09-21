// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/components/workspace/PersonalAssistantKnowledge.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/lib/workspaceAssistant.js
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/workspaceAssistant.js
// DAG Node:     none
// Intent:       Expose current-account assistant pattern graphs, bounded export and session forgetting without sharing personal knowledge with tenant administrators.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/site/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { createAssistantClient } from '@/lib/workspaceAssistant';
function PersonalKnowledge({ accountId, workspaceId, demo, renderGraph }) {
    const [data, setData] = useState(null), [error, setError] = useState(''), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0), [forget, setForget] = useState(''), [busy, setBusy] = useState(false);
    const alive = useRef(true);
    const api = useMemo(() => createAssistantClient({ client: pb, workspaceId, accountId, isCurrent: () => alive.current && !demo }), [workspaceId, accountId, demo]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => { let current = true; setData(null); setError(''); if (!demo) api.knowledge(page).then((result) => {
        if (current && alive.current && !result.stale) { if (result.ok) setData(result.data); else setError(result.error); }
    }); return () => { current = false; }; }, [api, page, refresh, demo]);
    const forgetSession = async () => {
        if (busy || !forget) return; setBusy(true);
        const result = await api.command('session.forget', { session: forget }, globalThis.crypto.randomUUID());
        if (alive.current && !result.stale) { if (result.ok) { setForget(''); setRefresh((value) => value + 1); } else setError(result.error); setBusy(false); }
    };
    const download = () => {
        if (!data) return; const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `my-assistant-knowledge-${page}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return <section className="space-y-4" aria-label="My assistant knowledge"><Card className="space-y-3 p-5">
        <h2 className="font-display text-xl">My assistant knowledge</h2><p className="text-sm text-muted-foreground">Only your account can read these session patterns. Field values are excluded from patterns; conversation messages remain in your private session. Observed interactions are not verified business outcomes.</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" disabled={demo} onClick={() => setRefresh((value) => value + 1)}>Refresh my patterns</Button>
            <Button size="sm" disabled={!data} onClick={download}>Export this knowledge page</Button></div>
        {demo ? <p>Personal sessions are unavailable in demo mode.</p> : error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading personal patterns…</p> : <>
            {!data.patterns.length && <p>No recorded assistant interactions on this page.</p>}
            <ul className="space-y-3 text-sm">{data.patterns.map((pattern) => <li key={pattern.id} className="border-t border-border pt-3"><p>{pattern.title} · {pattern.route}</p>
                <p className="text-xs text-muted-foreground">Session {pattern.session} · {pattern.state}</p><Button size="sm" variant="ghost" onClick={() => setForget(pattern.session)}>Forget this session and its patterns</Button></li>)}</ul>
            {forget && <div className="space-y-2 border border-border p-3"><p>Delete this personal conversation and all its learned patterns? Business records and evidence remain in their native desks.</p>
                <Button size="sm" disabled={busy} onClick={forgetSession}>Confirm forgetting session</Button><Button size="sm" variant="ghost" onClick={() => setForget('')}>Keep session</Button></div>}
            <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous patterns</Button>
                <Button size="sm" variant="ghost" disabled={!data.has_more} onClick={() => setPage(page + 1)}>More patterns</Button></div>
        </>}
    </Card>{data && renderGraph(data)}</section>;
}
export default function PersonalAssistantKnowledge({ renderGraph }) {
    const { user } = useAuth(), { active } = useWorkspace(), { demo } = useDemoMode();
    if (!user?.id || !active?.id) return null;
    return <PersonalKnowledge key={`${user.id}:${active.id}:${demo}`} accountId={user.id} workspaceId={active.id} demo={demo} renderGraph={renderGraph} />;
}
