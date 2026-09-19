// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/PolicyPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/policyIntelligence.js, apps/web/src/data/policy-demo.json, apps/web/src/contexts/WorkspaceAccessContext.jsx, apps/web/src/components/workspace/ControlPrimitives.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/policyIntelligence.js; CONSUMES apps/web/src/data/policy-demo.json; CONSUMES apps/web/src/contexts/WorkspaceAccessContext.jsx; CONSUMES apps/web/src/components/workspace/ControlPrimitives.jsx
// DAG Node:    none
// Intent:      Let workspace members inspect neutral policy sources and watch candidates before explicitly proposing source review through the existing mission lifecycle.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { controlInput, PlainArticle } from '@/components/workspace/ControlPrimitives';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
import { canonicalPolicy, configurePolicyWatch, createPolicyClient, importPolicy, POLICY_AREAS, POLICY_KINDS,
    POLICY_MAX_BYTES, POLICY_STATES, policyProposal, projectPolicy, searchPolicy } from '@/lib/policyIntelligence';
import demoPacket from '@/data/policy-demo.json';

const VIEWS = ['Feed', 'Legislation', 'Hearings', 'Committees', 'Appropriations', 'Executive Policy',
    'Stakeholders', 'Watchlists', 'Alerts', 'Daily Brief', 'Evidence / Sources'];
const EMPTY_WATCH = { name: '', keywords: '', area: 'small_business', object: '', cadence: 'daily' };

function PolicyDesk({ accountId, workspaceId, demo }) {
    const live = useRef(true); const reading = useRef(0); const urls = useRef(new Set());
    const access = useWorkspaceAccess();
    const api = useMemo(() => createPolicyClient({ client: pb, accountId, workspaceId, demo,
        isCurrent: () => live.current, observe: observeMutation }), [accountId, workspaceId, demo]);
    const [packet, setPacket] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState('Feed'); const [query, setQuery] = useState(''); const [area, setArea] = useState('');
    const [archive, setArchive] = useState(false); const [bookmarks, setBookmarks] = useState(new Set()); const [savedOnly, setSavedOnly] = useState(false);
    const [write, setWrite] = useState({ busy: false, uncertain: false, error: '', receipt: null });
    const [watch, setWatch] = useState(EMPTY_WATCH);
    useEffect(() => { live.current = true; const links = urls.current; return () => {
        live.current = false; reading.current++; links.forEach((url) => URL.revokeObjectURL(url)); links.clear();
    }; }, []);
    const view = useMemo(() => packet ? projectPolicy(packet) : null, [packet]);
    const byId = useMemo(() => new Map((packet?.observations || []).map((item) => [item.id, item])), [packet]);
    const kind = Object.keys(POLICY_KINDS).find((key) => POLICY_KINDS[key] === tab) || '';
    const visible = useMemo(() => packet ? searchPolicy(packet, { query, kind, area, archive })
        .filter((item) => !savedOnly || bookmarks.has(item.id)) : [], [packet, query, kind, area, archive, savedOnly, bookmarks]);
    const canPropose = Boolean(access.data?.can_write && !demo && packet?.mode === 'research');
    const busy = loading || write.busy || write.uncertain;

    const load = async (read) => {
        const attempt = ++reading.current;
        setLoading(true); setError(''); setPacket(null); setBookmarks(new Set()); setWrite({ busy: false, uncertain: false, error: '', receipt: null });
        try {
            const result = await importPolicy(await read(), workspaceId);
            if (!live.current || reading.current !== attempt) return;
            setPacket(result.ok ? result.packet : null); setError(result.error || ''); setTab('Feed');
        } catch { if (live.current && reading.current === attempt) setError('The policy file could not be read.'); }
        finally { if (live.current && reading.current === attempt) setLoading(false); }
    };
    const upload = (event) => {
        const file = event.target.files?.[0]; event.target.value = '';
        if (!file || busy) return;
        if (file.size > POLICY_MAX_BYTES || !file.size) { setError('Choose a policy JSON pack of at most 300,000 bytes.'); return; }
        void load(() => file.text());
    };
    const download = (value, name) => {
        try {
            const url = URL.createObjectURL(new Blob([canonicalPolicy(value) + '\n'], { type: 'application/json' }));
            urls.current.add(url);
            const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
            window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 0);
        } catch { setError('This browser could not prepare the download.'); }
    };
    const propose = async (operation) => {
        setWrite({ busy: true, uncertain: false, error: '', receipt: null });
        const result = await operation();
        if (!live.current) return;
        setWrite({ busy: false, uncertain: result.reason === 'uncertain', error: result.error || '', receipt: result.ok ? result.result : null });
    };
    const addWatch = async (event) => {
        event.preventDefault(); if (!packet || busy) return;
        const attempt = ++reading.current; setLoading(true); setError('');
        const result = await configurePolicyWatch(packet, { name: watch.name.trim(), mission_areas: [watch.area],
            keywords: [...new Set(watch.keywords.split(',').map((value) => value.trim()).filter(Boolean))],
            entity_ids: [], object_refs: watch.object.trim() ? [watch.object.trim()] : [], cadence: watch.cadence, window_hours: 168 }, workspaceId);
        if (!live.current || reading.current !== attempt) return;
        if (result.ok) { setPacket(result.packet); setWatch(EMPTY_WATCH); }
        setError(result.error || ''); setLoading(false);
    };
    const toggleBookmark = (id) => setBookmarks((prior) => { const next = new Set(prior); if (next.has(id)) next.delete(id); else next.add(id); return next; });

    const observationCard = (item) => <article key={item.id} className="space-y-3 rounded-md border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">{view.conflicts.includes(item.id) ? 'UNRESOLVED · conflicting source captures' : item.state}
                {!view.current.includes(item.id) && ' · archived capture'}</p>
            <h3 className="break-words font-headline text-xl">{item.title}</h3>
        </div><Button size="sm" variant="secondary" aria-pressed={bookmarks.has(item.id)} onClick={() => toggleBookmark(item.id)}>
            {bookmarks.has(item.id) ? 'Bookmarked' : 'Bookmark'}</Button></div>
        {item.attribution && <p className="text-sm">Attributed to: {item.attribution}</p>}
        <PlainArticle text={item.excerpt} />
        <p className="text-xs text-muted-foreground">Published {item.published_at} · Captured {item.observed_at}</p>
        {item.provenance.truncated && <p role="status" className="text-sm">The captured excerpt is truncated. Review the complete source.</p>}
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="break-all text-sm underline underline-offset-4">Open source: {item.source_id}</a>
        <details className="space-y-2 text-sm"><summary className="cursor-pointer">Evidence and relationships</summary>
            <p className="break-all">Observation: {item.id}</p>
            <p className="break-all">Excerpt SHA-256: {item.provenance.excerpt_sha256}</p>
            <p>Source verification: unreviewed</p>
            <ul className="space-y-2">{view.graph.edges.filter((edge) => edge.observation === item.id).map((edge, index) => <li key={index} className="break-words">
                {edge.source} → {edge.relation} → {edge.target} ({edge.state})
                {edge.quote && <blockquote className="mt-1 border-l-2 border-border pl-3">{edge.quote}</blockquote>}
                {edge.basis === 'newer_capture_of_same_document' && <p>Newer capture of this document; legislative repeal is not inferred.</p>}
            </li>)}</ul>
        </details>
    </article>;

    return <div className="space-y-6">
        <PageHeader title="Policy intelligence" description="Review legislative and regulatory developments, their sources, and the business objects you watch." />
        <Card className="space-y-4 p-5">
            <p className="text-sm">Import a workspace policy pack or explore the small-business walkthrough. Live Sentinel monitoring and email delivery are not connected here.</p>
            <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 text-sm">Policy JSON pack<input type="file" accept=".json,application/json" disabled={busy} onChange={upload} className={'mt-1 ' + controlInput} /></label>
                <Button variant="secondary" disabled={busy} onClick={() => load(async () => canonicalPolicy(demoPacket))}>Explore small-business demo</Button>
                {packet && <Button variant="secondary" disabled={busy} onClick={() => download(packet, 'policy.json')}>Export policy pack</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Imported sources, bookmarks and watch changes stay in this view. Export the pack to keep watch changes. Source review precedes action.</p>
            {loading && <p role="status">Reading policy pack…</p>}
            {error && <p role="alert">{error}</p>}
        </Card>
        <div aria-live="polite" className="space-y-3">
            {write.error && <p role="alert">{write.error}</p>}
            {write.uncertain && <Button disabled={write.busy} onClick={() => propose(api.retry)}>Recover previous proposal</Button>}
            {write.receipt && <p role="status">Review mission proposed: {write.receipt.id}. <Link className="underline" to="/app/missions">Open Challenge Desk</Link></p>}
        </div>
        {packet && <>
            <p role="status" className="text-sm">{packet.mode === 'demo' ? 'Synthetic demonstration — no official event was retrieved. Workspace writes are disabled.' :
                'Imported research snapshot — source classifications and analysis are unreviewed.'} As of {packet.as_of}.</p>
            <nav aria-label="Policy views" className="flex flex-wrap gap-2">{VIEWS.map((name) => <Button key={name} size="sm"
                variant={tab === name ? 'default' : 'secondary'} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</Button>)}</nav>
            {['Feed', ...Object.values(POLICY_KINDS)].includes(tab) && <>
                <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Search imported sources<input className={controlInput} maxLength={200} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
                    <label className="text-sm">Mission area<select className={controlInput} value={area} onChange={(e) => setArea(e.target.value)}><option value="">All mission areas</option>
                        {POLICY_AREAS.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label></div>
                <div className="flex flex-wrap gap-4 text-sm"><label><input type="checkbox" checked={archive} onChange={(e) => setArchive(e.target.checked)} /> Include archived captures</label>
                    <label><input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} /> Bookmarks only</label></div>
                <section aria-label="Policy observations" className="space-y-4">
                    {!visible.length && <p>No imported observations match these filters.</p>}{visible.map(observationCard)}
                </section>
            </>}
            {tab === 'Watchlists' && <Card className="space-y-5 p-5"><h2 className="font-headline text-2xl">Watchlists</h2>
                <ul className="space-y-3">{packet.watches.map((rule) => <li key={rule.id} className="rounded-md border border-border p-3">
                    <h3 className="font-semibold">{rule.name}</h3><p className="text-sm">{rule.cadence === 'daily' ? 'Daily brief' : 'Each matching event'} · {rule.window_hours} hours</p>
                    <p className="break-words text-sm">Terms: {rule.keywords.join(', ') || 'Entity matches only'} · Objects: {rule.object_refs.join(', ') || 'None configured'}</p>
                </li>)}</ul>
                <form onSubmit={addWatch} className="grid gap-3 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Add a watch to this pack</h3>
                    <label className="text-sm">Watch name<input required maxLength={160} className={controlInput} value={watch.name} onChange={(e) => setWatch({ ...watch, name: e.target.value })} /></label>
                    <label className="text-sm">Keywords, separated by commas<input required maxLength={1440} className={controlInput} value={watch.keywords} onChange={(e) => setWatch({ ...watch, keywords: e.target.value })} /></label>
                    <label className="text-sm">Watch mission area<select className={controlInput} value={watch.area} onChange={(e) => setWatch({ ...watch, area: e.target.value })}>
                        {POLICY_AREAS.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
                    <label className="text-sm">Business object reference<input placeholder="business:vendor-intake" maxLength={120} className={controlInput} value={watch.object} onChange={(e) => setWatch({ ...watch, object: e.target.value })} /></label>
                    <label className="text-sm">Brief frequency<select className={controlInput} value={watch.cadence} onChange={(e) => setWatch({ ...watch, cadence: e.target.value })}>
                        <option value="daily">Daily</option><option value="realtime">Each matching event</option></select></label>
                    <Button disabled={busy || packet.watches.length >= 20} type="submit">Add watch</Button>
                </form>
            </Card>}
            {tab === 'Alerts' && <section aria-label="Policy alert candidates" className="space-y-4"><h2 className="font-headline text-2xl">Alert candidates</h2>
                <p className="text-sm">These matches await source review. Configured object mappings express what to investigate; they do not establish an impact.</p>
                {!view.alerts.length && <p>No current observations match these watches.</p>}
                {view.alerts.map((alert) => <Card key={alert.id} className="space-y-3 p-4"><h3 className="font-headline text-xl">{byId.get(alert.observation).title}</h3>
                    <p className="text-sm">{alert.reasons.join(' · ')} · {alert.cadence === 'daily' ? 'Daily candidate' : 'Event candidate'}</p>
                    <p className="break-words text-sm">Configured objects: {alert.object_refs.join(', ') || 'None'}</p>
                    {alert.source_conflict && <p role="status">Conflicting captures require resolution.</p>}
                    <div className="flex flex-wrap gap-3"><Button variant="secondary" onClick={() => download(policyProposal(packet, alert.id), 'policy-review-proposal.json')}>Export review definition</Button>
                        {canPropose && <Button disabled={busy} onClick={() => propose(() => api.propose(packet, alert.id))}>Propose source-review mission</Button>}</div>
                </Card>)}
                {packet.mode === 'research' && !canPropose && <p className="text-sm">A current editor or workspace administrator can propose review missions.</p>}
            </section>}
            {tab === 'Daily Brief' && <section aria-label="Policy daily brief" className="space-y-5"><h2 className="font-headline text-2xl">Brief candidate</h2>
                <p className="text-sm">Daily watch matches captured in the 24 hours before this pack's timestamp, grouped by evidence state. This brief has not been sent.</p>
                {POLICY_STATES.map((state) => <section key={state} className="space-y-3"><h3 className="font-semibold">{state}</h3>
                    {!view.brief[state].length && <p className="text-sm text-muted-foreground">No current entries.</p>}
                    {view.brief[state].map((id) => observationCard(byId.get(id)))}</section>)}
            </section>}
            {tab === 'Evidence / Sources' && <section aria-label="Policy source evidence" className="space-y-4"><h2 className="font-headline text-2xl">Evidence / Sources</h2>
                <p className="text-sm">Fingerprints detect changed bytes. Classification, quoted relationships and official applicability still require source review.</p>
                <p className="break-all text-xs">Pack SHA-256: {packet.packet_sha256}</p>
                {packet.observations.map(observationCard)}
            </section>}
        </>}
        <footer className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Powered by Citadel Nexus Inc.</span>
            <a href="https://citadel-nexus.com/status" target="_blank" rel="noopener noreferrer" className="underline">Public status</a></footer>
    </div>;
}

export default function PolicyPage() {
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    if (!isAuthed || !user?.id || !active?.id) return <div className="space-y-4"><PageHeader title="Policy intelligence" description="Review policy sources in a workspace." />
        <Card className="p-5">Sign in and choose a workspace to review a policy pack.</Card></div>;
    return <PolicyDesk key={[user.id, active.id, demo].join(':')} accountId={user.id} workspaceId={active.id} demo={demo} />;
}
