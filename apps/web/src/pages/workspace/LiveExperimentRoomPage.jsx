// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
import React from 'react';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Card } from '@/components/site/ui';

// No live episode projection is published by Citadel Nexus yet. This page performs
// NO fetch and renders NO sample episode: the honest state is UNMEASURED until a
// verified episode is served over the signed boundary.
export default function LiveExperimentRoomPage() {
    return <div className="space-y-6">
        <PageHeader title="Live Experiment" description="One episode across room projection, SFU, MoQ, evidence, and content generation." />
        <Card className="p-6">
            <p className="font-evidence text-sm">UTILIZATION = UNMEASURED</p>
            <p className="mt-2 text-sm text-muted-foreground">No verified episode has been published over the Citadel Nexus boundary. This page does not read sample data; it will render an episode only when one is served with evidence references.</p>
        </Card>
    </div>;
}
