// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
import React, { useMemo, useState } from 'react';
import { Building2, FileCheck, GitBranch, GraduationCap, History, Network, RefreshCw, Search, Sparkles, Target, Users } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import RoomCanvas from '@/components/rooms/RoomCanvas';
import { Button, Card, Rule, StatePill } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { isNotPublished, useRoomProjection } from '@/hooks/useRoomProjection';
import { projectionStats } from '@/lib/roomGraph';

// The public room list. `systems` is deliberately absent: it is internal topology
// and Citadel Nexus never exports it, so it gets no navigation entry here.
export const ROOMS = [
    { id: 'organization', label: 'Organization', icon: Building2, question: 'Who owns what?' },
    { id: 'capability', label: 'Capability', icon: Network, question: 'What can we actually do and on what evidence?' },
    { id: 'development', label: 'Development', icon: GitBranch, question: 'How is the system changing?' },
    { id: 'mission', label: 'Mission', icon: Target, question: 'What is in flight and against which objective?' },
    { id: 'learning', label: 'Learning', icon: GraduationCap, question: 'What has been taught, and what did it change?' },
    { id: 'evidence', label: 'Evidence', icon: FileCheck, question: 'What supports each claim?' },
    { id: 'community', label: 'Community', icon: Users, question: 'Who is participating, and how?' },
    { id: 'replay', label: 'Replay', icon: History, question: 'What happened, in order?' },
];
const MODES = ['operate', 'inspect', 'teach', 'replay'];

function RoomUnavailable({ room, state }) {
    if (isNotPublished(state)) {
        return (
            <Card className="p-8 text-center">
                <Search className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-3 font-medium">The {room.label} room is not yet published by Citadel Nexus.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    The request was authenticated and refused with <code className="font-evidence">{state.reason}</code>. This room will appear here when Citadel Nexus grants and publishes the projection; until then it is UNMEASURED, not empty.
                </p>
            </Card>
        );
    }
    return (
        <Card className="p-8 text-center">
            <Search className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 font-medium">No measured room projection is available.</p>
            <p className="mt-1 text-sm text-muted-foreground">
                <code className="font-evidence">{state.reason || 'unknown'}</code>{state.status ? ` (HTTP ${state.status})` : ''}. Absence is shown as UNMEASURED rather than demo data.
            </p>
        </Card>
    );
}

export default function RoomsPage() {
    const { room } = useParams(); const navigate = useNavigate();
    const activeRoom = ROOMS.find((r) => r.id === room) || ROOMS[0];
    const [mode, setMode] = useState('inspect');
    const [selectedId, setSelectedId] = useState(null);
    const state = useRoomProjection(activeRoom.id);
    const { projection, loading, available, refresh } = state;

    const selected = useMemo(() => projection?.nodes?.find((n) => n.id === selectedId) || null, [projection, selectedId]);
    const stats = projectionStats(projection || {});

    return (
        <div className="space-y-6">
            <PageHeader title="Living Rooms" description="Live, cleansed graph projections served by Citadel Nexus over a signed platform boundary. A room can simplify truth; it cannot invent it." />
            <div className="flex flex-wrap items-center gap-2">
                {ROOMS.map((r) => <Button key={r.id} variant={r.id === activeRoom.id ? 'default' : 'outline'} size="sm" onClick={() => { setSelectedId(null); navigate(`/app/rooms/${r.id}`); }}><r.icon className="h-4 w-4" />{r.label}</Button>)}
                <span className="mx-1 h-5 w-px bg-border" />
                {MODES.map((m) => <Button key={m} variant={mode === m ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode(m)}>{m}</Button>)}
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => { setSelectedId(null); refresh(); }}><RefreshCw className="h-4 w-4" />Refresh</Button>
            </div>

            <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-display text-lg font-semibold">{activeRoom.label} Room</p><p className="text-sm text-muted-foreground">{activeRoom.question}</p></div>
                    <div className="flex flex-wrap gap-3 font-evidence text-xs text-muted-foreground"><span>{stats.nodes} nodes</span><span>{stats.edges} edges</span><span>{stats.verified} verified</span><span>{stats.unmeasured} unmeasured</span>{projection?.cleansed && <span>cleansed</span>}</div>
                </div>
            </Card>

            {loading ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">Loading measured projection…</Card>
            ) : !available ? (
                <RoomUnavailable room={activeRoom} state={state} />
            ) : (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <RoomCanvas projection={projection} selectedId={selectedId} onSelect={setSelectedId} />
                    <Card className="p-4">
                        <div className="flex items-center justify-between"><p className="font-semibold">Inspector</p><StatePill state={(selected?.state || projection.evidence?.state || projection.state || 'UNMEASURED').toLowerCase()} /></div>
                        <Rule className="my-3" />
                        {selected ? <><p className="font-evidence text-xs text-muted-foreground">{selected.type}</p><p className="mt-1 font-medium">{selected.title || selected.id}</p><p className="mt-2 break-all font-evidence text-[11px] text-muted-foreground">{selected.id}</p><Rule className="my-3" /><pre className="max-h-72 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{JSON.stringify(selected.attributes || {}, null, 2)}</pre></> : <div className="py-8 text-center text-sm text-muted-foreground"><Sparkles className="mx-auto h-5 w-5" /><p className="mt-2">Select a node to inspect its measured or declared state.</p></div>}
                    </Card>
                </div>
            )}
            <p className="text-xs text-muted-foreground">Edge semantics: verified = independently supported; observed = directly seen; declared = configuration/governance; inferred = candidate only. Missing data remains UNMEASURED.</p>
        </div>
    );
}
