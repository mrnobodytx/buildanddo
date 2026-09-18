import React from 'react';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Card } from '@/components/site/ui';
import { useRoomProjection } from '@/hooks/useRoomProjection';

export default function LiveExperimentRoomPage() {
    const { projection, loading, error } = useRoomProjection('utilization');
    const episode = projection?.episode;
    return <div className="space-y-6">
        <PageHeader title="Live Experiment" description="One episode across room projection, SFU, MoQ, evidence, and content generation." />
        {loading && <p>Loading…</p>}{error && <p className="text-destructive">UNMEASURED — {error}</p>}
        {episode && <Card className="p-5"><div className="grid gap-4 md:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Run</p><p className="font-evidence text-sm">{episode.run_id}</p></div>
            <div><p className="text-xs text-muted-foreground">State</p><p>{episode.state}</p></div>
            <div><p className="text-xs text-muted-foreground">Verdict</p><p>{episode.verdict}</p></div>
            <div><p className="text-xs text-muted-foreground">Evidence</p><p>{episode.evidence_refs?.length || 0}</p></div>
        </div><div className="mt-5 space-y-2">{(episode.facts || []).map((f,i)=><div key={i} className="flex gap-3 text-sm"><span className="font-evidence text-xs">{f.state}</span><span>{f.text}</span></div>)}</div></Card>}
    </div>;
}
