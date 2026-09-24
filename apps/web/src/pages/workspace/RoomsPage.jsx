// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/pages/workspace/RoomsPage.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/lib/workspaceRooms.js, apps/web/src/hooks/useWorkspaceKnowledge.js, apps/web/src/pages/workspace/ExecutionReplayPage.jsx
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/lib/workspaceRooms.js; DEPENDS_ON apps/web/src/hooks/useWorkspaceKnowledge.js; DEPENDS_ON apps/web/src/pages/workspace/ExecutionReplayPage.jsx
// DAG Node:     none
// Intent:       Make room modes act on current workspace evidence and retained execution replay while preserving separate estate publication.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useState } from 'react';
import { Building2, GitBranch, Network, RefreshCw } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import RoomCanvas from '@/components/rooms/RoomCanvas';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { useWorkspaceKnowledge } from '@/hooks/useWorkspaceKnowledge';
import { projectionStats } from '@/lib/roomGraph';
import { publishedRoom, workspaceRoom } from '@/lib/workspaceRooms';
import ExecutionReplayPage from '@/pages/workspace/ExecutionReplayPage';
import { readFailed } from '@/lib/observability/runtime';
import { PUBLIC_ACTIONS, publicActionSection, trackPublicAction } from '@/lib/publicActions';
const ROOMS = [
    { id: 'organization', label: 'Organization', icon: Building2, question: 'How is the current workspace knowledge organized?' },
    { id: 'capability', label: 'Capabilities', icon: Network, question: 'What source records support the planned work?' },
    { id: 'development', label: 'Development', icon: GitBranch, question: 'Which signals, missions and evidence are connected?' },
];
const MODES = ['operate', 'inspect', 'teach', 'replay'];
export default function RoomsPage() {
    const { room } = useParams(), navigate = useNavigate();
    const active = ROOMS.find((item) => item.id === room) || ROOMS[0];
    const knowledge = useWorkspaceKnowledge();
    const [mode, setMode] = useState('inspect'), [source, setSource] = useState('workspace');
    const [published, setPublished] = useState({ key: '', value: null, error: '' }), [selectedId, setSelectedId] = useState(null), [refreshKey, setRefreshKey] = useState(0);
    useEffect(() => { setSelectedId(null); }, [knowledge.scope, active.id, source]);
    const publishedKey = `${active.id}:${refreshKey}`;
    useEffect(() => {
        if (source !== 'published') return;
        const controller = new AbortController(); let alive = true;
        const pathname = globalThis.window?.location?.pathname, section = publicActionSection(pathname);
        let status, reason = 'unavailable';
        setPublished({ key: publishedKey, value: null, error: '' });
        fetch(`/room-projections/${active.id}.json`, { cache: 'no-store', signal: controller.signal })
            .then(async (response) => { status = response.status; if (!response.ok) throw new Error('No estate projection is published for this room.');
                reason = 'invalid_response';
                const raw = await response.text(); if (raw.length > 1000000) throw new Error('The published projection exceeds the supported size.');
                return publishedRoom(JSON.parse(raw), active.id); })
            .then((value) => {
                if (!alive) return;
                if (pathname === globalThis.window?.location?.pathname) {
                    const projection_state = ['MEASURED', 'OBSERVED', 'PARTIAL', 'UNMEASURED'].includes(value.state) ? value.state : 'unknown';
                    trackPublicAction(PUBLIC_ACTIONS.ROOM_PROJECTION, 'observed', 'published_projection', undefined, { section, projection_state });
                    if (projection_state === 'UNMEASURED' || projection_state === 'PARTIAL')
                        readFailed(section, 'room_projection', projection_state === 'UNMEASURED' ? 'unmeasured' : 'degraded', status);
                }
                setPublished({ key: publishedKey, value, error: '' });
            })
            .catch((error) => {
                if (!alive) return;
                if (error?.name !== 'AbortError' && pathname === globalThis.window?.location?.pathname) readFailed(section, 'room_projection', reason, status);
                setPublished({ key: publishedKey, value: null, error: error.message || 'The published projection is unavailable.' });
            });
        return () => { alive = false; controller.abort(); };
    }, [source, active.id, publishedKey]);
    const liveProjection = useMemo(() => workspaceRoom(knowledge.data, active.id), [knowledge.data, active.id]);
    const projection = source === 'workspace' ? liveProjection : published.key === publishedKey ? published.value : null;
    const error = source === 'workspace' ? knowledge.error : published.key === publishedKey ? published.error : '';
    const selected = projection?.nodes.find((node) => node.id === selectedId), stats = projectionStats(projection || {});
    const changeMode = (value) => {
        if (!MODES.includes(value) || value === mode) return;
        setMode(value);
        trackPublicAction(PUBLIC_ACTIONS.ROOM_MODE, 'selected', 'user_requested', undefined, { mode: value });
    };
    const changeSource = (value) => {
        if (!['workspace', 'published'].includes(value) || value === source) return;
        setSource(value);
        trackPublicAction(PUBLIC_ACTIONS.ROOM_SOURCE, 'selected', 'user_requested', undefined, { projection_source: value });
    };
    return <div className="space-y-5"><PageHeader title="Living Rooms" description="Inspect readable workspace records, open their work desks, learn the evidence flow and replay retained actions." />
        <div className="flex flex-wrap gap-2">{ROOMS.map((item) => <Button key={item.id} size="sm" variant={item.id === active.id ? 'default' : 'outline'} onClick={() => navigate(`/app/rooms/${item.id}`)}><item.icon className="h-4 w-4" />{item.label}</Button>)}</div>
        <div className="flex flex-wrap gap-2" aria-label="Room mode">{MODES.map((name) => <Button key={name} size="sm" aria-pressed={mode === name} variant={mode === name ? 'secondary' : 'ghost'} onClick={() => changeMode(name)}>{name}</Button>)}</div>
        {mode === 'operate' ? <Card className="space-y-3 p-5"><h2 className="font-display text-xl">Operate through the native desks</h2>
            <p className="text-sm">Each desk keeps its own membership, approval and evidence checks. Opening a tool performs no action.</p>
            <nav className="flex flex-wrap gap-4 text-sm">{[['/app/desks', 'Assign work scope'], ['/app/signals', 'Capture a signal'], ['/app/missions', 'Review a mission'], ['/app/workflows', 'Execute approved work'], ['/app/erp', 'Inspect business outcomes']].map(([to, label]) => <Link key={to} className="underline" to={to}>{label}</Link>)}</nav></Card> :
        mode === 'teach' ? <Card className="space-y-3 p-5"><h2 className="font-display text-xl">Read a work graph</h2><ol className="list-inside list-decimal space-y-2 text-sm">
            <li>Inspect a node and read its original collection, record identity and update time.</li><li>Follow a recorded source relation. A vocabulary category only groups text; it does not establish ownership or truth.</li>
            <li>Open the mission plan, examine its bounds and compare its frozen review evidence.</li><li>Replay the action receipt, then locate the separate verifier and the operator readback.</li></ol>
            <Link className="inline-block text-sm underline" to="/app/tutorials">Practice in the Field Manual</Link></Card> :
        mode === 'replay' ? <ExecutionReplayPage /> : <>
            <div className="flex flex-wrap items-center gap-3"><label className="text-sm">Projection source<select className="ml-2 border border-border bg-background p-2" value={source} onChange={(event) => changeSource(event.target.value)}><option value="workspace">Current readable workspace</option><option value="published">Published estate projection</option></select></label>
                <Button size="sm" variant="ghost" onClick={() => source === 'workspace' ? knowledge.refresh() : setRefreshKey((value) => value + 1)}><RefreshCw className="h-4 w-4" />Refresh</Button></div>
            <p className="text-sm text-muted-foreground">{active.question} Workspace views show source records and categories; estate ownership and deployed capabilities need a separate published projection.</p>
            {error ? <Card className="p-5" role="alert">{error} Missing observations remain unavailable.</Card> : !projection ? <p role="status">Reading the selected source…</p> : <>
                <p className="text-sm">{stats.nodes} nodes · {stats.edges} relationships · {projection.state || 'UNMEASURED'}{projection.omitted ? ` · ${projection.omitted} additional records omitted` : ''}</p>
                {source === 'workspace' && <p className="text-xs text-muted-foreground">Observed at {projection.observed_at}. Record statuses are source assertions; this view does not independently verify them. {projection.coverage?.filter((entry) => !['complete', 'disabled'].includes(entry.state)).map((entry) => `${entry.collection}: ${entry.state}`).join(' · ')}</p>}
                {!projection.nodes.length ? <p>No readable records are present in this view.</p> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"><RoomCanvas projection={projection} selectedId={selectedId} onSelect={setSelectedId} />
                    <Card className="space-y-3 p-4"><h2 className="font-semibold">Source inspector</h2>{selected ? <><p>{selected.title}</p><p className="break-all text-xs">{selected.id} · {selected.state || 'UNMEASURED'}</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(selected.attributes || {}, null, 2)}</pre></> : <p className="text-sm">Select a node to inspect its retained provenance.</p>}</Card></div>}
            </>}
        </>}
    </div>;
}
