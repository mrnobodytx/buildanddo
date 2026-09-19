// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/OperatorPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/operatorPlane.js, apps/web/src/contexts/WorkspaceAccessContext.jsx, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/operatorPlane.js; CONSUMES apps/web/src/contexts/WorkspaceAccessContext.jsx; CONSUMES apps/web/src/components/workspace/ControlPrimitives.jsx
// DAG Node:    none
// Intent:      Surface observed workspace decisions and source coverage while keeping imported build plans separate from explicit review mission proposals.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { controlInput, dateLabel, PageControls, PlainArticle } from '@/components/workspace/ControlPrimitives';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
import { createOperatorClient, importOperatorBlueprint, OPERATOR_MAX_BYTES, projectOperator } from '@/lib/operatorPlane';

const EMPTY_WRITE = { busy: false, uncertain: false, error: '', receipt: null };
const label = (value) => typeof value === 'string' ? value.replaceAll('_', ' ') : 'Unknown';

function DeskLink({ href, children = 'Open workspace desk' }) {
    if (typeof href !== 'string' || !(href === '/app' || href.startsWith('/app/'))) return null;
    return <Link to={href} className="text-sm underline underline-offset-4">{children}</Link>;
}

function WorkList({ title, rows, empty }) {
    return <section aria-label={title}><Card className="space-y-4 p-5">
        <h2 className="font-headline text-2xl">{title}</h2>
        {!rows.length && <p className="text-sm text-muted-foreground">{empty}</p>}
        <ul className="space-y-3">{rows.map((row) => <li key={row.id} className="space-y-2 rounded-md border border-border p-4">
            <h3 className="break-words font-semibold">{row.title}</h3>
            {row.reason && <PlainArticle text={row.reason} />}
            {(row.status || row.owner) && <p className="text-xs text-muted-foreground">
                {label(row.status)} · Owner: {row.owner || 'Not recorded'}</p>}
            <DeskLink href={row.href} />
        </li>)}</ul>
    </Card></section>;
}

function WorkspaceSnapshot({ view }) {
    return <div className="space-y-5">
        <p className="text-sm text-muted-foreground">Observed {dateLabel(view.observed_at)} · Freshness: {label(view.freshness)}.</p>
        <WorkList title="Human decisions" rows={view.human_decisions}
            empty="No human decisions appear in this sample. Check source coverage before concluding that none remain." />
        <details className="space-y-4 rounded-md border border-border p-5">
            <summary className="cursor-pointer font-semibold">Work and active missions</summary>
            <WorkList title="Work queue" rows={view.work_queue} empty="No routine work appears in this sample." />
            <WorkList title="Active missions" rows={view.active_missions} empty="No active missions appear in this sample." />
        </details>
        <section aria-label="Systems and evidence"><Card className="space-y-4 p-5">
            <h2 className="font-headline text-2xl">Systems and evidence</h2>
            <p className="text-sm text-muted-foreground">Connection records and source observations describe what was seen. Missing observations leave system health unknown.</p>
            {!view.systems.length && <p className="text-sm">No system observations appear in this sample.</p>}
            <ul className="grid gap-3 sm:grid-cols-2">{view.systems.map((system) => <li key={system.id} className="space-y-2 rounded-md border border-border p-4">
                <h3 className="break-words font-semibold">{system.name}</h3>
                <p className="text-sm">Status: {label(system.status)}</p>
                <PlainArticle text={system.reason} />
                <p className="text-xs text-muted-foreground">Observation: {dateLabel(system.observed_at)}</p>
                <DeskLink href={system.href} />
            </li>)}</ul>
        </Card></section>
        <details className="space-y-4 rounded-md border border-border p-5">
            <summary className="cursor-pointer font-semibold">Recent changes and worker activity</summary>
            <section aria-label="Recent changes" className="space-y-3">
                <h2 className="font-headline text-xl">Recent changes</h2>
                {!view.changes.length && <p className="text-sm">No changes appear in this sample.</p>}
                <ul className="space-y-3">{view.changes.map((change) => <li key={change.id} className="space-y-1 border-b border-border pb-3">
                    <p className="break-words text-sm">{change.title}</p>
                    <p className="text-xs text-muted-foreground">{dateLabel(change.at)}</p><DeskLink href={change.href} />
                </li>)}</ul>
            </section>
            <section aria-label="Worker activity" className="space-y-3">
                <h2 className="font-headline text-xl">Worker activity</h2>
                <p className="text-sm text-muted-foreground">Recorded activity does not establish available capacity.</p>
                {!view.workers.length && <p className="text-sm">No worker activity appears in this sample. Capacity is unknown.</p>}
                <ul className="space-y-3">{view.workers.map((worker) => <li key={worker.id} className="space-y-1 border-b border-border pb-3">
                    <p className="break-words text-sm">{worker.seat}: {label(worker.status)}</p>
                    <p className="text-xs text-muted-foreground">{dateLabel(worker.at)}</p><DeskLink href={worker.href} />
                </li>)}</ul>
            </section>
        </details>
        <section aria-label="Source coverage"><Card className="space-y-4 p-5">
            <h2 className="font-headline text-2xl">Source coverage</h2>
            <p className="text-sm">{view.partial ? 'Partial coverage. ' : ''}This is a sample of at most 20 visible rows per source on this page. Later pages or unavailable sources may contain additional work.</p>
            <ul className="space-y-2">{view.sources.map((source) => <li key={source.id} className="break-words text-sm">
                <span className="font-semibold">{source.id}</span>: {label(source.state)} · Page {source.page}
                {source.has_more && ' · More rows available'}
            </li>)}</ul>
        </Card></section>
    </div>;
}

function ImportedPlan({ plan }) {
    const workNames = new Map(plan.work_queue.map((item) => [item.id, item.title]));
    return <section aria-label="Imported build plan" className="space-y-4">
        <h3 className="font-headline text-xl">Imported build plan</h3>
        <p className="text-sm">This local A0 proposal is unverified. Planned decisions and deadlines do not describe live workspace state.</p>
        <PlainArticle text={plan.problem} />
        <p className="text-xs text-muted-foreground">Created {dateLabel(plan.created_at)} · Owner: {plan.owner.seat || 'Unassigned'}</p>
        <details className="space-y-4 rounded-md border border-border p-4">
            <summary className="cursor-pointer font-semibold">Source reuse and capability gaps</summary>
            <h4 className="font-semibold">Existing capabilities</h4>
            <ul className="space-y-4">{plan.existing_capabilities.map((capability) => <li key={capability.id} className="space-y-2">
                <p className="font-semibold">{capability.name}</p><PlainArticle text={capability.intent} />
                <p className="text-xs text-muted-foreground">{label(capability.evidence_state)} · Runtime readiness: {label(capability.runtime_readiness)}</p>
                <ul className="space-y-1">{capability.source_refs.map((source) => <li key={source.id} className="break-all font-mono text-xs">
                    {source.path} · SHA-256: {source.sha256}
                </li>)}</ul>
                {capability.missing_source_paths.length > 0 && <p className="break-words text-sm">Uninspected paths: {capability.missing_source_paths.join(', ')}</p>}
            </li>)}</ul>
            <h4 className="font-semibold">Capability gaps</h4>
            <ul className="space-y-3">{plan.missing_capabilities.map((gap) => <li key={gap.id} className="space-y-1">
                <p className="font-semibold">{gap.name}</p><PlainArticle text={gap.reason} />
            </li>)}</ul>
            <h4 className="font-semibold">Proposed modules</h4>
            <ul className="space-y-3">{plan.proposed_modules.map((module) => <li key={module.id} className="space-y-1">
                <p className="font-semibold">{module.name} · {label(module.action)}</p><PlainArticle text={module.reason} />
                <p className="break-words text-xs text-muted-foreground">Capabilities: {module.capability_ids.join(', ') || 'Discovery required'}</p>
            </li>)}</ul>
        </details>
        <details className="space-y-4 rounded-md border border-border p-4">
            <summary className="cursor-pointer font-semibold">Proposed work and dependencies</summary>
            <p className="text-sm">Prepared work awaits an execution dispatch and assigned owner.</p>
            <ul className="space-y-3">{plan.work_queue.map((item) => <li key={item.id} className="space-y-1">
                <h4 className="break-words font-semibold">{item.title}</h4>
                <p className="text-xs text-muted-foreground">{label(item.status)} · Owner: {item.owner || 'Unassigned'}</p>
            </li>)}</ul>
            <ul aria-label="Planned dependencies" className="space-y-2">{plan.dependencies.map((item) => <li key={item.id} className="break-words text-sm">
                {workNames.get(item.id) || item.id} → {item.depends_on.length ? item.depends_on.map((id) => workNames.get(id) || id).join(', ') : 'No prerequisite recorded'}
            </li>)}</ul>
            <p className="text-xs text-muted-foreground">Arrows point from work to its prerequisites.</p>
        </details>
        <section aria-label="Opportunity deadlines" className="space-y-3">
            <h4 className="font-semibold">Opportunity deadlines</h4>
            <ul className="space-y-2">{plan.opportunities.map((opportunity) => <li key={opportunity.id} className="break-words text-sm">
                <span className="font-semibold">{opportunity.title}</span> · Deadline: {opportunity.deadline.value || 'Unknown'} ({label(opportunity.deadline.status)})
            </li>)}</ul>
        </section>
        <details className="space-y-3 rounded-md border border-border p-4">
            <summary className="cursor-pointer font-semibold">Conditional approval gates</summary>
            <p className="text-sm">Future gates from the imported plan apply only when their stated conditions arise.</p>
            <ul className="space-y-3">{plan.human_decisions.map((decision) => <li key={decision.id} className="space-y-1">
                <h4 className="break-words font-semibold">{decision.title}</h4><PlainArticle text={decision.condition} />
                <p className="text-xs text-muted-foreground">Required for: {decision.required_for}</p>
            </li>)}</ul>
        </details>
        <details className="space-y-4 rounded-md border border-border p-4">
            <summary className="cursor-pointer font-semibold">Acceptance, tests and rollback</summary>
            <ul className="space-y-2">{plan.acceptance_criteria.map((item) => <li key={item.id} className="break-words text-sm">{item.text} · {label(item.status)}</li>)}</ul>
            <h4 className="font-semibold">Proposed checks</h4>
            <ul className="space-y-3">{plan.tests.map((check) => <li key={check.id} className="space-y-1 text-sm">
                <PlainArticle text={check.purpose} /><code className="block break-all">{check.command}</code>
                <p className="text-xs text-muted-foreground">{label(check.status)}</p>
            </li>)}</ul>
            <h4 className="font-semibold">Planned telemetry</h4>
            <ul className="space-y-1">{plan.telemetry.map((item) => <li key={item.id} className="text-sm">{item.id}: {label(item.status)}</li>)}</ul>
            <h4 className="font-semibold">Risks</h4>
            <ul className="space-y-3">{plan.risks.map((risk) => <li key={risk.id} className="space-y-1 text-sm">
                <PlainArticle text={risk.description} /><p>Mitigation: {risk.mitigation}</p>
            </li>)}</ul>
            <h4 className="font-semibold">Rollback</h4><PlainArticle text={plan.rollback.strategy} />
            <ol className="list-inside list-decimal space-y-1 text-sm">{plan.rollback.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        </details>
    </section>;
}

function OperatorDesk({ accountId, workspaceId, canWrite, checkingAccess }) {
    const live = useRef(true); const reading = useRef(0); const importing = useRef(0); const writing = useRef(false);
    const urls = useRef(new Set());
    const [page, setPage] = useState(1);
    const [now, setNow] = useState(() => Date.now());
    const [snapshot, setSnapshot] = useState({ loading: true, data: null, error: '' });
    const [plan, setPlan] = useState(null); const [importBusy, setImportBusy] = useState(false); const [importError, setImportError] = useState('');
    const [write, setWrite] = useState(EMPTY_WRITE);
    const api = useMemo(() => createOperatorClient({ client: pb, accountId, workspaceId, demo: false,
        isCurrent: () => live.current, observe: observeMutation }), [accountId, workspaceId]);
    useEffect(() => {
        live.current = true; const links = urls.current;
        const clock = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => { live.current = false; reading.current++; importing.current++; window.clearInterval(clock); links.forEach((url) => URL.revokeObjectURL(url)); links.clear(); };
    }, []);

    const refresh = useCallback(async (targetPage) => {
        const attempt = ++reading.current;
        setSnapshot({ loading: true, data: null, error: '' });
        let result;
        try { result = await api.read(targetPage); }
        catch { result = { ok: false, error: 'Workspace state could not be read. Refresh to try again.' }; }
        if (!live.current || attempt !== reading.current) return;
        setNow(Date.now());
        setSnapshot({ loading: false, data: result.ok ? result.data : null, error: result.error || (result.ok ? '' : 'Workspace state is unavailable.') });
        if (!result.ok) {
            importing.current++; setImportBusy(false); setPlan(null); setImportError('');
            setWrite((prior) => ({ ...EMPTY_WRITE, uncertain: prior.uncertain,
                error: prior.uncertain ? 'The previous proposal needs recovery after workspace access is refreshed.' : '' }));
        }
    }, [api]);
    useEffect(() => { void refresh(page); }, [refresh, page]);
    const view = useMemo(() => snapshot.data ? projectOperator(snapshot.data, now) : null, [snapshot.data, now]);
    const available = Boolean(view && !snapshot.loading && !checkingAccess);
    const writeAllowed = Boolean(canWrite && ['owner', 'admin', 'editor'].includes(snapshot.data?.role) && view?.freshness === 'current');
    const canPropose = Boolean(writeAllowed && available && plan);
    const busy = importBusy || write.busy || write.uncertain;

    const upload = async (event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || busy) return;
        const attempt = ++importing.current;
        setPlan(null); setImportError(''); setWrite(EMPTY_WRITE);
        if (!file.size || file.size > OPERATOR_MAX_BYTES) { setImportError(`Choose a nonempty blueprint JSON file of at most ${OPERATOR_MAX_BYTES.toLocaleString()} bytes.`); return; }
        setImportBusy(true);
        try {
            const raw = await file.text();
            if (!live.current || importing.current !== attempt) return;
            const result = await importOperatorBlueprint(raw);
            if (!live.current || importing.current !== attempt) return;
            setPlan(result.ok ? result.blueprint : null); setImportError(result.error || (result.ok ? '' : 'The blueprint is invalid.'));
        } catch { if (live.current && importing.current === attempt) setImportError('The blueprint file could not be read.'); }
        finally { if (live.current && importing.current === attempt) setImportBusy(false); }
    };
    const download = () => {
        if (!plan) return;
        try {
            const url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2) + '\n'], { type: 'application/json' }));
            urls.current.add(url);
            const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'operator-blueprint.json'; anchor.click();
            window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 0);
        } catch { setImportError('This browser could not prepare the download.'); }
    };
    const propose = async (recover = false) => {
        if (!writeAllowed || !available || writing.current || importBusy || (!recover && (!plan || write.uncertain))) return;
        writing.current = true; setWrite({ ...EMPTY_WRITE, busy: true });
        let result;
        try { result = await (recover ? api.retry() : api.propose(plan)); }
        catch { result = { ok: false, reason: 'uncertain', error: 'The proposal response is unavailable. Recover the previous proposal before starting another.' }; }
        if (!live.current) return;
        writing.current = false;
        setWrite({ busy: false, uncertain: result.reason === 'uncertain', error: result.error || '', receipt: result.ok ? result.result : null });
        if (!result.ok && result.reason !== 'uncertain') {
            reading.current++; importing.current++; setPlan(null); setImportBusy(false);
            setSnapshot({ loading: false, data: null, error: 'Refresh workspace access before proposing more work.' });
        }
    };

    return <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Review current decisions, then open their existing workspace desks.</p>
            <Button variant="secondary" disabled={snapshot.loading || write.busy} onClick={() => refresh(page)}>Refresh workspace state</Button>
        </div>
        {snapshot.loading && <p role="status">Reading workspace state…</p>}
        {snapshot.error && <p role="alert">{snapshot.error}</p>}
        {view && <WorkspaceSnapshot view={view} />}
        <PageControls page={page} hasMore={page < 9999 && Boolean(view?.sources.some((source) => source.has_more))}
            onPage={setPage} label="Workspace source" disabled={snapshot.loading || write.busy} />
        <Card className="space-y-5 p-5">
            <h2 className="font-headline text-2xl">Review a build plan</h2>
            <p className="text-sm text-muted-foreground">Import a prepared plan to inspect source reuse, gaps and acceptance conditions. Importing stays in this browser view.</p>
            <label className="block text-sm">Operator blueprint JSON<input type="file" accept=".json,application/json" className={'mt-2 ' + controlInput}
                disabled={busy} onChange={upload} /></label>
            {importBusy && <p role="status">Reading build plan…</p>}
            {importError && <p role="alert">{importError}</p>}
            {plan && <>
                <ImportedPlan plan={plan} />
                <div className="flex flex-wrap gap-3">
                    <Button variant="secondary" disabled={busy} onClick={download}>Export build plan</Button>
                    <Button disabled={!canPropose || busy} onClick={() => propose()}>Propose review mission</Button>
                </div>
                <p className="text-xs text-muted-foreground">A review proposal creates a proposed mission. It does not approve work or launch a worker.</p>
                {(!canWrite || snapshot.data?.role === 'viewer') && <p className="text-sm">Your workspace role can inspect and export plans. Proposing a mission requires write access.</p>}
                {canWrite && snapshot.data?.role !== 'viewer' && (!available || !writeAllowed) &&
                    <p className="text-sm">Refresh current workspace access before proposing a review.</p>}
            </>}
            <div aria-live="polite" className="space-y-3">
                {write.busy && <p role="status">Saving review proposal…</p>}
                {write.error && <p role="alert">{write.error}</p>}
                {write.uncertain && <Button variant="secondary" disabled={!writeAllowed || !available || write.busy}
                    onClick={() => propose(true)}>Recover previous proposal</Button>}
                {write.receipt && <p role="status">Review mission proposed: {write.receipt.id}. <DeskLink href={`/app/missions?mission=${encodeURIComponent(write.receipt.id)}`}>Open Challenge Desk</DeskLink></p>}
            </div>
        </Card>
    </div>;
}

export default function OperatorPage() {
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const access = useWorkspaceAccess();
    let content;
    if (!isAuthed || !user?.id || !active?.id) content = <Card className="p-5">Sign in and choose a workspace to inspect its current state.</Card>;
    else if (demo) content = <Card className="space-y-3 p-5">
        <p role="status">Demonstration mode: workspace state is not queried and review proposals are disabled.</p>
        <p className="text-sm text-muted-foreground">Turn off demonstration mode to inspect workspace records. No readiness, deadlines or worker capacity have been measured here.</p>
    </Card>;
    else if (access.error) content = <Card className="space-y-3 p-5"><p role="alert">{access.error}</p>
        <Button variant="secondary" onClick={access.refresh}>Refresh workspace access</Button></Card>;
    else if (!access.data) content = <p role="status">Checking workspace access…</p>;
    else content = <OperatorDesk key={[user.id, active.id, demo, Boolean(access.data.can_write)].join(':')}
        accountId={user.id} workspaceId={active.id} canWrite={Boolean(access.data.can_write)} checkingAccess={access.loading} />;
    return <div className="space-y-6 ph-no-capture" data-dd-privacy="mask">
        <PageHeader title="Operator cockpit" description="See the decisions that need you, the work already underway, and the evidence still missing." />
        {content}
        <footer className="border-t border-border pt-4 text-xs text-muted-foreground">Powered by Citadel Nexus Inc. ·{' '}
            <a href="https://citadel-nexus.com/status" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Public status</a></footer>
    </div>;
}
