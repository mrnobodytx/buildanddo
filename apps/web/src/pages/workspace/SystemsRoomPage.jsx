// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
import React from 'react';
import UtilizationPanel from '@/components/rooms/UtilizationPanel';
import { Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';

// The systems projection names hosts, planes and containers. Citadel Nexus lists
// it as never-exportable and the rooms sidecar refuses it locally, so this page
// performs NO fetch and renders NO sample data: the honest state is UNMEASURED.
export default function SystemsRoomPage() {
    return <div className="space-y-6">
        <PageHeader title="Systems Room" description="Topology, runtime use, and evidence. No data is rendered as healthy by implication." />
        <Card className="p-6">
            <p className="font-evidence text-sm">UTILIZATION = UNMEASURED</p>
            <p className="mt-2 text-sm text-muted-foreground">The systems projection is internal topology and never crosses the platform boundary (Citadel Nexus: <code className="font-evidence">projection_never_exportable</code>). Nothing here is fetched, inferred, or sampled.</p>
        </Card>
        <UtilizationPanel items={[]} />
    </div>;
}
