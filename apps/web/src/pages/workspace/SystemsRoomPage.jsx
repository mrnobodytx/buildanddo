import React from 'react';
import RoomCanvasV2 from '@/components/rooms/RoomCanvasV2';
import UtilizationPanel from '@/components/rooms/UtilizationPanel';
import { useRoomProjection } from '@/hooks/useRoomProjection';
import { PageHeader } from '@/components/workspace/workspaceHelpers';

export default function SystemsRoomPage() {
    const { projection, loading, error } = useRoomProjection('systems');
    const usage = projection?.utilization || [];
    return <div className="space-y-6">
        <PageHeader title="Systems Room" description="Topology, runtime use, and evidence. No data is rendered as healthy by implication." />
        {loading && <p className="text-sm text-muted-foreground">Loading measured projection…</p>}
        {error && <p className="text-sm text-destructive">UNMEASURED — {error}</p>}
        {projection && <><UtilizationPanel items={usage} /><RoomCanvasV2 projection={projection} roomKind="systems" /></>}
    </div>;
}
