// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/MissionReplayCapture.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/lib/businessExecution.js, apps/web/src/lib/evidenceInspection.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/businessExecution.js; CONSUMES apps/web/src/lib/evidenceInspection.js
// Intent:      Export one complete readable mission history with visible integrity gaps and no implied independent certification.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { downloadObservation } from '@/lib/evidenceInspection';

export default function MissionReplayCapture({ api, demo }) {
    const missions = useWorkspaceRecords('missions'), [params, setParams] = useSearchParams();
    const mission = params.get('mission') || '';
    const [savedCapture, setCapture] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [attempt, setAttempt] = useState(0);
    const capture = savedCapture?.content.mission.id === mission ? savedCapture : null;
    useEffect(() => {
        let current = true; setCapture(null); setError(''); setLoading(Boolean(mission && !demo));
        if (mission && !demo) api.captureMission(mission).then((result) => {
            if (!current || result.stale) return;
            setLoading(false); if (result.ok) setCapture(result.data); else setError(result.error);
        });
        return () => { current = false; };
    }, [api, mission, demo, attempt]);
    return <Card className="space-y-3 p-4"><h2 className="font-display text-lg font-semibold">Complete mission history</h2>
        <p className="text-sm">Capture the saved mission, all its workflow runs, action receipts, evidence and resulting tasks in one read. No action is rerun.</p>
        <label className="block text-sm">Mission<select className="mt-1 w-full border border-border bg-background p-2" value={mission} disabled={demo || missions.loading || missions.degraded}
            onChange={(event) => { const next = new URLSearchParams(params); if (event.target.value) next.set('mission', event.target.value); else next.delete('mission'); setParams(next); }}>
            <option value="">Choose a mission</option>{missions.records.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
            {mission && !missions.records.some((row) => row.id === mission) && <option value={mission}>Selected mission unavailable</option>}
        </select></label>
        {missions.degraded && <p role="alert">The mission list is unavailable. <Button variant="ghost" size="sm" onClick={missions.refresh}>Retry missions</Button></p>}
        {loading && <p role="status">Reading and checking the complete capture…</p>}
        {error && <p role="alert">{error}</p>}
        {capture && <div className="space-y-2 text-sm"><p>{capture.content.runs.length} workflow runs · {capture.content.jobs.length} actions · {capture.content.evidence.length} evidence records · {capture.content.tasks.length} tasks</p>
            <p>Recorded outcome: {capture.content.mission.status}. Capture integrity: {capture.integrity}.</p>
            {capture.integrity_issues.length > 0 && <ul role="alert" className="list-disc pl-5">{capture.integrity_issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            <Link className="block underline" to={`/app/missions?mission=${encodeURIComponent(mission)}`}>Inspect mission review</Link>
            <Button size="sm" onClick={() => downloadObservation(capture, `mission-${mission}-history.json`)}>Export complete mission history</Button>
            <p className="text-xs text-muted-foreground">Digests detect changed bytes. This capture records observations and does not grant independent verification, release approval or submission acceptance.</p>
        </div>}
        {mission && <Button type="button" size="sm" variant="secondary" disabled={demo || loading} onClick={() => setAttempt((value) => value + 1)}>Reload mission capture</Button>}
    </Card>;
}
