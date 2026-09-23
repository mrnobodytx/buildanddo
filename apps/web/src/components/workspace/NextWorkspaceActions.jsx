// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/NextWorkspaceActions.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/lib/workspaceJourney.js, apps/web/src/hooks/useWorkspaceRecords.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/workspaceJourney.js; CONSUMES apps/web/src/hooks/useWorkspaceRecords.js
// Intent:      Put the next inspectable action beside the workspace overview's activity feed.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { workspaceJourney } from '@/lib/workspaceJourney';

export default function NextWorkspaceActions({ signals, missions, evidence }) {
    const { user } = useAuth() || {}, { active } = useWorkspace(), { demo } = useDemoMode();
    const runs = useWorkspaceRecords('workflow_runs'), tasks = useWorkspaceRecords('erp_tasks');
    const sources = { signals, missions, evidence, runs, tasks };
    const unavailable = Object.entries(sources).filter(([, value]) => value.degraded).map(([name]) => name);
    const loading = Object.values(sources).some((value) => value.loading);
    const view = workspaceJourney({ workspace: active?.id, account: user?.id, demo, unavailable,
        ...Object.fromEntries(Object.entries(sources).map(([name, value]) => [name, value.records])) });
    return <section className="space-y-3 ph-no-capture" data-dd-privacy="mask" aria-label="Next workspace actions">
        <h2 className="font-display text-xl font-semibold">What needs attention next</h2>
        {demo ? <p>Demo records do not determine actions for your workspace.</p> : loading ? <p role="status">Checking current work…</p> : view.state === 'unavailable' ? <div role="alert">
            <p>Next actions are unavailable until the workspace records can be read.</p><Button size="sm" variant="secondary" onClick={() => Object.values(sources).forEach((source) => source.refresh())}>Retry workspace reads</Button></div>
            : <ul className="grid gap-3 sm:grid-cols-2">{view.actions.map((action) => <li key={action.id}><Card className="h-full space-y-2 p-4">
                <Link className="font-medium underline" to={action.to}>{action.title}</Link><p className="text-sm text-muted-foreground">{action.reason}</p>
            </Card></li>)}</ul>}
        <p className="text-xs text-muted-foreground">These suggestions use saved records. Opening a step grants no approval and performs no action.</p>
    </section>;
}
