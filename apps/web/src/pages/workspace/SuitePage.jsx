// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/SuitePage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/hooks/useMissionSuite.js, apps/web/src/components/workspace/suite/SuiteForms.jsx, apps/web/src/components/workspace/suite/SuiteResult.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useMissionSuite.js; CONSUMES apps/web/src/components/workspace/suite/SuiteForms.jsx; CONSUMES apps/web/src/components/workspace/suite/SuiteResult.jsx
// DAG Node:    none
// Intent:      Make suite execution a saved BuildAndDo mission with actual worker states, review evidence and government-submission learning.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useMissionSuite } from '@/hooks/useMissionSuite';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { ControlState, PageControls, controlInput } from '@/components/workspace/ControlPrimitives';
import { MaritimeForm, SubmissionForm, SuiteConfiguration } from '@/components/workspace/suite/SuiteForms';
import SuiteResult from '@/components/workspace/suite/SuiteResult';
import { SUITE_STATES } from '@/lib/missionSuite';

function MissionDesk({ mission }) {
    const [page, setPage] = useState(1); const [selected, setSelected] = useState('');
    const [detail, setDetail] = useState(null); const [detailError, setDetailError] = useState('');
    const control = useMissionSuite(mission.id, page);
    const evidence = useWorkspaceRecords('evidence', { sort: '-created' });
    const [mode, setMode] = useState('submission');
    const row = control.data?.items.find((item) => item.id === selected);
    const accessRevision = control.data?.control.revision;
    useEffect(() => {
        let current = true; setDetail(null); setDetailError('');
        if (selected && control.data) control.detail(selected).then((result) => {
            if (!current) return;
            if (result.ok) setDetail(result.data.record); else setDetailError(result.error || 'The run is no longer available.');
        });
        return () => { current = false; };
    }, [selected, row?.revision, accessRevision, control.detail, Boolean(control.data)]);
    useEffect(() => {
        if (!control.data?.control.active_run) return;
        const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void control.refresh(); }, 5000);
        return () => window.clearInterval(timer);
    }, [control.data?.control.active_run, control.refresh]);
    useEffect(() => { if (control.saved?.action === 'enqueue') setSelected(control.saved.id); }, [control.saved]);
    const editable = control.data && control.data.role !== 'viewer';
    const busy = !editable || control.saving || control.uncertain;
    const running = mission.status === 'running';
    const canEnqueue = !busy && running && control.data?.control.enabled && !control.data?.control.active_run;
    const run = (suite, input) => control.mutate('enqueue', { suite, input }, control.data.control.state_revision);
    return <div className="space-y-5">
        <div aria-live="polite" className="space-y-2">
            {control.writeError && <p role="alert" className="text-sm">{control.writeError}</p>}
            {control.uncertain && <Button type="button" disabled={control.saving} variant="secondary" onClick={control.retry}>Recover previous request</Button>}
            {control.saved && <p role="status" className="text-sm">{control.saved.action === 'attach' ? 'Review attached as observed evidence.' : 'Request saved. The recorded run status appears below.'}</p>}
        </div>
        <ControlState control={{ ...control, loading: control.loading && !control.data }}>
            <Card className="space-y-3 p-5"><h2 className="font-display text-xl">{mission.title}</h2>
                <p className="text-sm">{control.data?.configured ? 'Worker binding configured; recorded runs below show whether processing occurred.' : 'Worker binding is missing. Requests are retained as blocked until the operator connects the box worker.'}</p>
                {!running && <p className="text-sm">Review the saved plan, record its approval and start the mission before queuing analysis.</p>}
                {!control.data?.control.enabled && <p className="text-sm">A workspace owner or administrator must enable this mission’s suite.</p>}
                {control.data?.control.active_run && <p role="status" className="text-sm">An active run must finish or be cancelled before another is queued.</p>}
                <p className="text-sm text-muted-foreground">{control.data?.control.observations || 0} retained observations. The source suite supports at most 256 observations per mission window.</p>
                <Button type="button" variant="secondary" disabled={control.loading} onClick={control.refresh}>Refresh run status</Button>
            </Card>
            {['owner', 'admin'].includes(control.data?.role) && <SuiteConfiguration key={control.data.control.revision} config={control.data.control} disabled={busy} onSave={(payload) => control.mutate('configure', payload, control.data.control.revision)} />}
            <label className="block space-y-1 text-sm">Analysis tool<select className={controlInput} value={mode} onChange={(e) => setMode(e.target.value)}><option value="submission">Government submission readiness</option><option value="maritime">Maritime observation analysis</option></select></label>
            {mode === 'submission' ? <SubmissionForm evidence={evidence.records.filter((item) => item.mission === mission.id)} evidenceAvailable={!evidence.loading && !evidence.degraded}
                disabled={!canEnqueue} onRun={(input) => run('submission', input)} /> : <MaritimeForm rights={control.data?.control.rights || []} disabled={!canEnqueue} onRun={(input) => run('maritime', input)} />}
            {evidence.degraded && <p role="alert" className="text-sm">Evidence loading failed. <button type="button" className="underline" onClick={evidence.refresh}>Reload evidence</button></p>}
            <section className="space-y-3" aria-label="Mission run history"><h2 className="font-display text-xl">Run history</h2>
                {!control.data?.items.length && <p className="text-sm text-muted-foreground">No suite runs have been recorded for this mission.</p>}
                <ul className="grid gap-3 sm:grid-cols-2">{control.data?.items.map((item) => <li key={item.id}><button type="button" className="min-h-11 w-full space-y-1 border border-border p-4 text-left text-sm hover:bg-secondary" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>
                    <span className="block font-semibold">{item.suite === 'maritime' ? 'Maritime analysis' : 'Submission review'}</span><span className="block">{SUITE_STATES[item.status]}</span><span className="block break-all text-xs text-muted-foreground">Run {item.id}</span>
                </button></li>)}</ul>
                <PageControls page={page} hasMore={control.data?.has_more} onPage={setPage} disabled={control.loading || control.saving} label="Suite history" />
            </section>
            {selected && !detail && !detailError && <p role="status" className="text-sm">Loading run evidence…</p>}
            {detailError && <p role="alert" className="text-sm">{detailError}</p>}
            {detail && <SuiteResult key={detail.id} record={detail} disabled={busy || ['verified', 'failed'].includes(mission.status)} onAction={(action, payload = {}) => control.mutate(action, { id: detail.id, ...payload }, detail.revision)} />}
        </ControlState>
    </div>;
}

/** @returns {React.ReactElement} Saved mission suite entry point. */
export default function SuitePage() {
    const [search, setSearch] = useSearchParams(); const { user, isAuthed } = useAuth(); const { active } = useWorkspace();
    const missions = useWorkspaceRecords('missions', { sort: '-created' }); const selected = search.get('mission') || '';
    const mission = missions.records.find((item) => item.id === selected);
    return <div className="ph-no-capture min-w-0 space-y-6" data-dd-privacy="mask">
        <PageHeader title="Mission suite" description="Run maritime analysis and government-submission readiness on a saved mission. Review results and keep the supporting evidence together." />
        <nav aria-label="Mission suite resources" className="flex flex-wrap gap-4 text-sm">
            <Link to="/app/missions" className="underline underline-offset-4">Create or review a mission</Link>
            <Link to="/app/tutorials?path=government" className="underline underline-offset-4">Government submission tutorials</Link>
            <Link to="/app/evidence" className="underline underline-offset-4">Evidence Ledger</Link>
        </nav>
        <label className="block space-y-1 text-sm">Saved mission<select className={controlInput} disabled={missions.loading || missions.degraded} value={selected} onChange={(e) => setSearch(e.target.value ? { mission: e.target.value } : {})}>
            <option value="">Choose a mission</option>{missions.records.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.status})</option>)}
        </select></label>
        {missions.degraded ? <p role="alert" className="text-sm">Missions are unavailable. <button type="button" className="underline" onClick={missions.refresh}>Reload missions</button></p> :
            mission ? <MissionDesk key={`${isAuthed ? user?.id : ''}:${active?.id}:${mission.id}`} mission={mission} /> :
                <Card className="space-y-2 p-5"><h2 className="font-display text-xl">Start with a saved mission</h2><p className="text-sm text-muted-foreground">In the Challenge Desk, choose Start a mission and use the government submission starter. Save and approve the plan before starting its analysis. The linked learning path includes eight exercises and knowledge checks.</p></Card>}
    </div>;
}
