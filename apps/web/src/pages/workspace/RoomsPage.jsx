import React, { useEffect, useMemo, useState } from 'react';
import { Building2, GitBranch, Network, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import RoomCanvas from '@/components/rooms/RoomCanvas';
import { Button, Card, Rule, StatePill } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { projectionStats } from '@/lib/roomGraph';

const ROOMS = [
    { id: 'organization', label: 'Organization', icon: Building2, question: 'Who owns what?' },
    { id: 'capability', label: 'Capabilities', icon: Network, question: 'What can we actually do and on what evidence?' },
    { id: 'development', label: 'Development', icon: GitBranch, question: 'How is the system changing?' },
];
const MODES = ['operate', 'inspect', 'teach', 'replay'];

export default function RoomsPage() {
    const { room } = useParams(); const navigate = useNavigate();
    const activeRoom = ROOMS.find((r) => r.id === room) || ROOMS[0];
    const [mode, setMode] = useState('inspect'); const [projection, setProjection] = useState(null);
    const [error, setError] = useState(''); const [selectedId, setSelectedId] = useState(null); const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let alive = true; setProjection(null); setError(''); setSelectedId(null);
        fetch(`/room-projections/${activeRoom.id}.json?ts=${Date.now()}`, { cache: 'no-store' })
            .then((r) => { if (!r.ok) throw new Error(`projection unavailable (${r.status})`); return r.json(); })
            .then((data) => { if (alive) setProjection(data); })
            .catch((err) => { if (alive) setError(err.message || 'projection unavailable'); });
        return () => { alive = false; };
    }, [activeRoom.id, refreshKey]);

    const selected = useMemo(() => projection?.nodes?.find((n) => n.id === selectedId) || null, [projection, selectedId]);
    const stats = projectionStats(projection || {});

    return (
        <div className="space-y-6">
            <PageHeader title="Living Rooms" description="Deterministic graph projections of BuildAndDo's organization, capabilities, and development history. A room can simplify truth; it cannot invent it." />
            <div className="flex flex-wrap items-center gap-2">
                {ROOMS.map((r) => <Button key={r.id} variant={r.id === activeRoom.id ? 'default' : 'outline'} size="sm" onClick={() => navigate(`/app/rooms/${r.id}`)}><r.icon className="h-4 w-4" />{r.label}</Button>)}
                <span className="mx-1 h-5 w-px bg-border" />
                {MODES.map((m) => <Button key={m} variant={mode === m ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode(m)}>{m}</Button>)}
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setRefreshKey((v) => v + 1)}><RefreshCw className="h-4 w-4" />Refresh</Button>
            </div>

            <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-display text-lg font-semibold">{activeRoom.label} Room</p><p className="text-sm text-muted-foreground">{activeRoom.question}</p></div>
                    <div className="flex flex-wrap gap-3 font-evidence text-xs text-muted-foreground"><span>{stats.nodes} nodes</span><span>{stats.edges} edges</span><span>{stats.verified} verified</span><span>{stats.unmeasured} unmeasured</span></div>
                </div>
            </Card>

            {error ? (
                <Card className="p-8 text-center"><Search className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 font-medium">No measured room projection is published yet.</p><p className="mt-1 text-sm text-muted-foreground">{error}. Generate projections with the local Citadel room controller; absence is shown as UNMEASURED rather than demo data.</p></Card>
            ) : !projection ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">Loading measured projection…</Card>
            ) : (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <RoomCanvas projection={projection} selectedId={selectedId} onSelect={setSelectedId} />
                    <Card className="p-4">
                        <div className="flex items-center justify-between"><p className="font-semibold">Inspector</p><StatePill state={(selected?.state || projection.state || 'UNMEASURED').toLowerCase()} /></div>
                        <Rule className="my-3" />
                        {selected ? <><p className="font-evidence text-xs text-muted-foreground">{selected.type}</p><p className="mt-1 font-medium">{selected.title || selected.id}</p><p className="mt-2 break-all font-evidence text-[11px] text-muted-foreground">{selected.id}</p><Rule className="my-3" /><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{JSON.stringify(selected.attributes || {}, null, 2)}</pre></> : <div className="py-8 text-center text-sm text-muted-foreground"><Sparkles className="mx-auto h-5 w-5" /><p className="mt-2">Select a node to inspect its measured or declared state.</p></div>}
                    </Card>
                </div>
            )}
            <p className="text-xs text-muted-foreground">Edge semantics: verified = independently supported; observed = directly seen; declared = configuration/governance; inferred = candidate only. Missing data remains UNMEASURED.</p>
        </div>
    );
}
