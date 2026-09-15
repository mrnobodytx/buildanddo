// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/workflows/StartWorkflowRun.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/workflowRuns.js, apps/web/src/hooks/useWorkspaceRecords.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/workflowRuns.js; CONSUMES apps/web/src/hooks/useWorkspaceRecords.js
// DAG Node:    none
// Intent:      Start a saved workflow with an optional approved mission while retaining retry identity after uncertain responses.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/site/ui';
import { Label } from '@/components/ui/label';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { createRetryIntent } from '@/lib/workflowRuns';

export const runSelectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground';

/** Choose a saved procedure and the mission that should receive its evidence. */
export default function StartWorkflowRun({ workflows, api, onSaved, onBusy, disabled = false }) {
    const [workflow, setWorkflow] = useState('');
    const [mission, setMission] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const missions = useWorkspaceRecords('missions', { sort: '-created' });
    const alive = useRef(true);
    const busy = useRef(false);
    const intent = useRef(createRetryIntent());
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const eligible = missions.records.filter((record) => record.status === 'running' &&
        record.mission_approved_by && record.mission_approved_at);
    const submit = async (event) => {
        event.preventDefault();
        if (busy.current || disabled || !workflow) return;
        if (mission && (missions.loading || missions.degraded)) return;
        busy.current = true; setSaving(true); onBusy(true); setError('');
        const result = await api.start(intent.current({ workflow, mission }));
        if (!alive.current) return;
        busy.current = false; setSaving(false); onBusy(false);
        if (result.ok) onSaved(result.record);
        else if (result.error) setError(result.error);
    };
    return (
        <form className="space-y-4" onSubmit={submit}>
            <p className="text-sm text-muted-foreground">Check the run history before starting another run. This saves a copy of the steps for work you will perform and record.</p>
            <div className="space-y-1.5">
                <Label htmlFor="run-workflow">Saved workflow</Label>
                <select id="run-workflow" className={runSelectClass} required value={workflow}
                    disabled={saving || disabled} onChange={(event) => setWorkflow(event.target.value)}>
                    <option value="">Choose an active workflow</option>
                    {workflows.filter((record) => record.status === 'active').map((record) =>
                        <option key={record.id} value={record.id}>{record.name}</option>)}
                </select>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="run-mission">Mission for evidence (optional)</Label>
                <select id="run-mission" className={runSelectClass} value={mission}
                    disabled={saving || disabled || missions.loading || missions.degraded}
                    onChange={(event) => setMission(event.target.value)}>
                    <option value="">No mission</option>
                    {eligible.map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Linked missions must be running with a saved approval. Workflow completion leaves their TEVV review to the Mission Desk.</p>
                {missions.loading && <p role="status" className="text-xs">Loading eligible missions…</p>}
                {missions.degraded && <div className="space-y-2">
                    <p role="alert" className="text-sm">Could not load missions. Retry to link a mission.</p>
                    <Button type="button" size="sm" variant="secondary" onClick={missions.refresh}>Retry missions</Button>
                    {mission && <Button type="button" size="sm" variant="ghost" onClick={() => setMission('')}>Continue without a mission</Button>}
                </div>}
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="sm" disabled={saving || disabled || !workflow || Boolean(mission && (missions.loading || missions.degraded))}>
                {saving ? 'Saving run…' : 'Start recorded run'}
            </Button>
        </form>
    );
}
