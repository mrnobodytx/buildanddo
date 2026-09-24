// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/pages/workspace/SpecialistWorkPage.jsx
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/hooks/useWorkspaceRecords.js
// EnumType:     Widget
// EnumEdges:    DEPENDS_ON apps/web/src/hooks/useWorkspaceRecords.js
// DAG Node:     none
// Intent:       Restore scoped specialist work desks while retaining the separate Capability Passport and existing work tools.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { describeAccess } from '@/hooks/useWorkspaceControl';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { workspaceLifecycleKey } from '@/lib/workspaceControl';
const DESKS = {
    research: ['Research', '/app/research', 'Capture sources and preserve their provenance.'],
    strategy: ['Strategy', '/app/erp', 'Set objectives and connect business tasks.'],
    operations: ['Operations', '/app/workflows', 'Run approved bounded work and inspect results.'],
    verification: ['Verification', '/app/missions', 'Review evidence independently against the mission plan.'],
    risk: ['Risk', '/app/missions', 'Review authority, limits and failure conditions.'],
    recovery: ['Recovery', '/app/replay', 'Inspect failed and uncertain work before another attempt.'],
    history: ['History', '/app/evidence', 'Follow retained sources and decisions.'],
    optimization: ['Improvement', '/app/edition', 'Compare outcomes and choose the next measured change.'],
};
function WorkDesks() {
    const control = useWorkspaceRecords('specialist_desks'), missions = useWorkspaceRecords('missions');
    const { demo } = useDemoMode();
    const { user } = useAuth();
    // Every desk control below is switched off by an access outcome, and all
    // three outcomes looked the same on screen: a grey button and no words.
    // accessNotice is the sentence that separates them, empty when usable. The
    // gate itself stays strict - a check still out or one that failed is not a
    // grant - and describeAccess names exactly those states, so the sentence
    // and the disabled control cannot disagree.
    const access = useWorkspaceAccess(), canWrite = !demo && !access.loading && !access.error && access.data?.can_write === true, accessNotice = describeAccess(access);
    const canEdit = (record) => canWrite && (!record || record.owner === user?.id || access.data?.can_admin === true);
    const attention = missions.records.filter((item) => ['proposed', 'needs_attention', 'failed'].includes(item.status));
    const [editing, setEditing] = useState(''), [scope, setScope] = useState(''), [status, setStatus] = useState('idle'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [savedVersion, setSavedVersion] = useState(null);
    const save = async (event) => {
        event.preventDefault(); if (busy || !canEdit(savedVersion) || control.uncertain) return; setBusy(true); setError('');
        const records = control.records.filter((record) => record.desk === editing);
        if (records.length > 1) { setError('Duplicate desk records require operator review.'); setBusy(false); return; }
        const result = savedVersion ? await control.update(savedVersion.id, { scope: scope.trim(), status }, savedVersion) : await control.create({ desk: editing, scope: scope.trim(), status });
        if (result.ok) setEditing(''); else setError(result.error || 'The desk could not be saved.'); setBusy(false);
    };
    return <div className="space-y-5"><PageHeader title="Specialist desks" description="Assign a scope to each kind of work and open its existing tools. Desk status is an operator record, not a claim of an active agent." />
        <Link to="/app/passport" className="text-sm underline">Capability Passport</Link>
        {accessNotice && <p role="status" className="text-sm text-muted-foreground">{accessNotice}</p>}
        {control.degraded ? <p role="alert">Desk records are unavailable. <button className="underline" onClick={control.refresh}>Retry</button></p> : control.loading ? <p role="status">Loading desk records…</p> :
            <div className="grid gap-4 md:grid-cols-2">{Object.entries(DESKS).map(([id, [label, href, purpose]]) => {
                const records = control.records.filter((record) => record.desk === id), record = records[0];
                // Only when writing is otherwise allowed: if the access check is
                // what stops the edit, accessNotice above already says so, and
                // blaming ownership here would send the person the wrong way.
                // The copy names the rule, not a person - a record with no
                // owner field fails the same check, and we do not know who.
                const notOwner = canWrite && records.length === 1 && !canEdit(record);
                return <Card key={id} className="space-y-3 p-4"><h2 className="font-display text-lg">{label}</h2><p className="text-sm">{purpose}</p>
                    <p className="text-sm">{records.length > 1 ? 'Duplicate records: review required' : record ? `Recorded status: ${record.status}` : 'Scope not assigned'}</p>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{record?.scope}</p>
                    <div className="flex gap-3"><Link to={href} className="self-center text-sm underline">Open {label.toLowerCase()} tools</Link>
                        <Button size="sm" variant="secondary" disabled={!canEdit(record) || busy || control.uncertain || records.length > 1}
                            aria-describedby={notOwner ? `desk-owner-${id}` : undefined}
                            onClick={() => { setEditing(id); setSavedVersion(record || null); setScope(record?.scope || ''); setStatus(record?.status || 'idle'); }}>Edit scope</Button></div>
                    {notOwner && <p id={`desk-owner-${id}`} className="text-sm text-muted-foreground">Only the editor who recorded this desk, or a workspace admin, can change its scope.</p>}
                </Card>;
            })}</div>}
        {editing && <form onSubmit={save} className="space-y-3 border border-border p-4"><h2 className="font-semibold">{DESKS[editing][0]} scope</h2>
            <fieldset className="space-y-3" disabled={busy || !canEdit(savedVersion) || control.uncertain}>
            <label className="block text-sm">Scope<textarea className="mt-1 w-full border border-border bg-background p-2" maxLength={500} value={scope} onChange={(event) => setScope(event.target.value)} /></label>
            <label className="block text-sm">Desk status<select className="ml-2 border border-border bg-background p-2" value={status} onChange={(event) => setStatus(event.target.value)}>{['idle', 'active', 'blocked'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <Button size="sm" type="submit">Save scope</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing('')}>Cancel</Button>
            </fieldset>
        </form>}
        {error && <p role="alert">{error}</p>}
        {control.uncertain && <Button size="sm" disabled={control.saving || !canWrite} onClick={async () => {
            const result = await control.retry(); if (result.ok) { setEditing(''); setError(''); } else setError(result.error);
        }}>Retry previous scope save</Button>}
        <Card className="space-y-3 p-4"><h2 className="font-display text-lg">Current work requiring attention</h2>
            {missions.degraded ? <p role="alert">Mission reads are unavailable.</p> : missions.loading ? <p>Loading missions…</p> : attention.length === 0 ?
                // A bare heading over an empty list read as "we have nothing to
                // tell you", which is the unreadable state the degraded branch
                // above exists to stay out of. Say that the read happened.
                <p className="text-sm text-muted-foreground">No mission is flagged for attention right now.</p> : <ul className="space-y-2 text-sm">{
                    attention.map((item) => <li key={item.id}><Link className="underline" to={`/app/missions?mission=${encodeURIComponent(item.id)}`}>{item.title}</Link> · {item.status}</li>)}</ul>}
        </Card>
    </div>;
}
export default function SpecialistWorkPage() {
    const { user, sessionEpoch } = useAuth(), { active } = useWorkspace(), { demo } = useDemoMode(), access = useWorkspaceAccess();
    return <WorkDesks key={workspaceLifecycleKey({ accountId: user?.id, workspaceId: active?.id, demo, sessionEpoch, access })} />;
}
