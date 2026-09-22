// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/GovernmentPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/components/workspace/GovernmentGate.jsx, apps/web/src/hooks/useWorkspaceControl.js, apps/web/src/components/workspace/TutorialCatalog.jsx, apps/web/src/components/workspace/missions/MissionBuilder.jsx, apps/web/src/hooks/useWorkspaceRecords.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/components/workspace/GovernmentGate.jsx; CONSUMES apps/web/src/hooks/useWorkspaceControl.js; CONSUMES apps/web/src/components/workspace/TutorialCatalog.jsx; CONSUMES apps/web/src/components/workspace/missions/MissionBuilder.jsx; CONSUMES apps/web/src/hooks/useWorkspaceRecords.js
// Intent:      Organize approved members around measured research, existing learning and governed missions without claiming submission readiness.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import GovernmentGate from '@/components/workspace/GovernmentGate';
import { GovernmentTutorialCatalog } from '@/components/workspace/TutorialCatalog';
import MissionBuilder from '@/components/workspace/missions/MissionBuilder';
import { ControlState } from '@/components/workspace/ControlPrimitives';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { useWorkspaceControl } from '@/hooks/useWorkspaceControl';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { lessonLink } from '@/lib/tutorialCurriculum';

function GovernmentDesk() {
    const control = useWorkspaceControl('government'); const [search] = useSearchParams();
    const [creating, setCreating] = useState(false); const [saved, setSaved] = useState('');
    const missions = useWorkspaceRecords('missions');
    const data = control.data;
    const save = async (fields) => {
        const result = await missions.create(fields);
        if (result.ok) { setCreating(false); setSaved('Mission saved as proposed. Open the Challenge Desk to review it.'); }
        return result;
    };
    return <div className="ph-no-capture min-w-0 space-y-7" data-dd-privacy="mask">
        <PageHeader title="Government research" description="Learn together, turn questions into traceable decisions, and test research claims before proposing them." />
        <nav aria-label="Government research tools" className="flex flex-wrap gap-4 text-sm"><Link className="underline" to="/app/suite">Mission suite</Link><Link className="underline" to="/app/missions">Challenge Desk</Link><Link className="underline" to="/app/evidence">Evidence Ledger</Link></nav>
        <ControlState control={control}>
            {data && <>
                <Card className="space-y-3 p-5"><h2 className="font-display text-xl">Verify opportunity details before acting</h2><p className="text-sm leading-relaxed">{data.plan.source_note}</p><p className="text-sm">The ten-day schedule is a proposed plan. Completed work is established by retained evidence and independent review.</p></Card>
                <section aria-label="Research lanes" className="grid gap-4 lg:grid-cols-3">{data.plan.lanes.map((lane) => <Card key={lane.id} className="min-w-0 space-y-4 p-5">
                    <p className="text-sm font-semibold text-primary">{lane.priority} · {data.plan.allocation[lane.id]}% planned effort</p><h2 className="font-display text-xl">{lane.title}</h2>
                    <p className="text-sm leading-relaxed">{lane.gate}</p>
                    {lessonLink(lane.source_url) && <a href={lessonLink(lane.source_url)} rel="noreferrer" target="_blank" className="text-sm underline">Review the source notice</a>}
                    <details><summary className="cursor-pointer py-2 text-sm font-semibold">Requirements and evidence gaps</summary><ul className="space-y-4 pt-3">{lane.requirements.map((row) => <li key={row.id} className="space-y-1 text-sm"><p className="font-semibold">{row.requirement}</p><p>Local verification: {row.evidence}</p><p className="text-muted-foreground">Still needed: {row.gap}</p></li>)}</ul></details>
                </Card>)}</section>
                <section aria-labelledby="research-schedule" className="space-y-4"><h2 id="research-schedule" className="font-display text-2xl">Ten-day research plan</h2><ol className="grid gap-3 md:grid-cols-2">{data.plan.days.map((day) => <li key={day.day} className="min-w-0 border border-border p-4"><h3 className="font-semibold">Day {day.day}: {day.title}</h3><p className="mt-1 text-xs text-muted-foreground">Proposed {day.date}</p><p className="mt-2 text-sm">{day.output}</p><details className="mt-2 text-sm"><summary className="cursor-pointer py-2">Lane tasks</summary><p className="mt-2">Army: {day.army}</p><p className="mt-2">DARPA: {day.influence}</p><p className="mt-2">FHERMA: {day.fherma}</p></details></li>)}</ol></section>
                <section aria-labelledby="government-mission" className="space-y-4"><h2 id="government-mission" className="font-display text-2xl">Prepare a mission</h2><p className="text-sm text-muted-foreground">Plans and evidence you save use your workspace’s sharing permissions. Keep private or controlled government material in the designated private system.</p>
                    {saved && <p role="status">{saved}</p>}
                    {creating ? <MissionBuilder governmentStarter={data.starter} disabled={!data.can_write} onSave={save} onCancel={() => setCreating(false)} /> : <Button disabled={!data.can_write} onClick={() => setCreating(true)}>Prepare government mission</Button>}
                </section>
                <section aria-labelledby="government-lessons" className="space-y-4"><h2 id="government-lessons" className="font-display text-2xl">Government submission learning</h2><GovernmentTutorialCatalog lessons={data.lessons} initialLesson={search.get('lesson') || ''} /></section>
                <p className="text-sm text-muted-foreground">Powered by Citadel Nexus Inc. · <a className="underline" href="https://citadel-nexus.com/status">Public status</a></p>
            </>}
        </ControlState>
    </div>;
}

export default function GovernmentPage() { return <GovernmentGate><GovernmentDesk /></GovernmentGate>; }
