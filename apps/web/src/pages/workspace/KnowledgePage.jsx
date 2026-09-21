// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/KnowledgePage.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/hooks/useWorkspaceKnowledge.js, apps/web/src/components/workspace/KnowledgeContext.jsx, apps/web/src/lib/workspaceKnowledge.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceKnowledge.js; CONSUMES apps/web/src/components/workspace/KnowledgeContext.jsx; CONSUMES apps/web/src/lib/workspaceKnowledge.js
// DAG Node:    none
// Intent:      Make workspace knowledge discoverable through an accessible graph, source categories and automatic cited context assembly.
// ───────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card } from '@/components/site/ui';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { controlInput, dateLabel } from '@/components/workspace/ControlPrimitives';
import { KnowledgeContextResults } from '@/components/workspace/KnowledgeContext';
import PersonalAssistantKnowledge from '@/components/workspace/PersonalAssistantKnowledge';
import { useWorkspaceKnowledge } from '@/hooks/useWorkspaceKnowledge';
import { useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { KNOWLEDGE_KINDS, knowledgeNeighborhood, knowledgeSourceHref } from '@/lib/workspaceKnowledge';

const relationLabels = { OBSERVED_IN: 'Observed in personal session', EVIDENCE_FOR: 'Evidence for', RESEARCH_FOR: 'Research for', DERIVED_FROM: 'Derived from', CATEGORIZED_AS: 'Categorized as', TAGGED_WITH: 'Tagged with' };
const sourceLabels = { missions: 'Missions', evidence: 'Evidence', research_submissions: 'Completed research', signals: 'Signals', wiki_pages: 'Published wiki' };

function GraphNeighborhood({ graph, selected, onSelect }) {
    const view = knowledgeNeighborhood(graph, selected);
    const points = new Map(view.nodes.map((node, index) => {
        const angle = ((index - 1) / Math.max(1, view.nodes.length - 1)) * 2 * Math.PI - Math.PI / 2;
        return [node.id, index ? { x: 380 + Math.cos(angle) * 268, y: 220 + Math.sin(angle) * 164 } : { x: 380, y: 220 }];
    }));
    if (!view.nodes.length) return <p className="text-sm">Choose a source to inspect its connections.</p>;
    return <div className="min-w-0 space-y-2">
        <div className="overflow-x-auto rounded-md border border-border">
            <svg viewBox="0 0 760 440" className="w-full min-w-[480px]" role="group" aria-label="Knowledge graph neighborhood">
                {view.edges.map((edge) => {
                    const a = points.get(edge.source); const b = points.get(edge.target);
                    return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeOpacity="0.25" strokeWidth="2"><title>{relationLabels[edge.relation]}</title></line>;
                })}
                {view.nodes.map((node) => {
                    const point = points.get(node.id);
                    return <g key={node.id} transform={`translate(${point.x},${point.y})`} role="button" tabIndex={0}
                        aria-label={`Inspect ${node.title}`} aria-pressed={node.id === selected} className="cursor-pointer outline-offset-4 focus:outline focus:outline-2 focus:outline-primary"
                        onClick={() => onSelect(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(node.id); } }}>
                        <rect x="-94" y="-28" width="188" height="56" rx="8" className={node.id === selected ? 'fill-background stroke-primary' : 'fill-background stroke-border'} strokeWidth="2" />
                        <text textAnchor="middle" y="-3" className="fill-foreground text-[12px]">{node.title.length > 25 ? node.title.slice(0, 24) + '…' : node.title}</text>
                        <text textAnchor="middle" y="15" className="fill-muted-foreground text-[10px]">{KNOWLEDGE_KINDS[node.kind] || node.kind}</text>
                    </g>;
                })}
            </svg>
        </div>
        <p className="text-xs text-muted-foreground">Select a node with click, Enter or Space to explore its neighborhood.{view.omitted ? ` ${view.omitted} additional connections appear in the relationship list.` : ''}</p>
    </div>;
}

function GraphBrowser({ graph }) {
    const [selected, setSelected] = useState(''); const [category, setCategory] = useState(''); const [kind, setKind] = useState('');
    const [shown, setShown] = useState(40);
    if (!graph) return null;
    const documents = graph.nodes.filter((node) => node.source);
    const categories = graph.nodes.filter((node) => node.kind === 'category');
    const filtered = documents.filter((node) => (!category || node.categories.includes(category)) && (!kind || node.kind === kind));
    const focus = graph.nodes.find((node) => node.id === selected) || filtered[0];
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const relations = focus ? graph.edges.filter((edge) => edge.source === focus.id || edge.target === focus.id) : [];
    return <>
        <Card className="min-w-0 space-y-4 p-5">
            <h2 className="font-display text-xl">Knowledge graph</h2>
            <p className="text-sm text-muted-foreground">{graph.document_count} source records · {graph.edges.length} relationships. Topic matches organize material; recorded evidence states retain their original meaning.</p>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm">Category<select aria-label="Knowledge category" className={controlInput} value={category} onChange={(event) => { setCategory(event.target.value); setSelected(''); setShown(40); }}>
                    <option value="">All categories</option>{categories.map((node) => <option key={node.id} value={node.category}>{node.title}</option>)}
                </select></label>
                <label className="space-y-1 text-sm">Source type<select aria-label="Knowledge source type" className={controlInput} value={kind} onChange={(event) => { setKind(event.target.value); setSelected(''); setShown(40); }}>
                    <option value="">All source types</option>{Object.entries(KNOWLEDGE_KINDS).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
                </select></label>
            </div>
            {!filtered.length && <p className="text-sm">No sources in this category and type.</p>}
            <ul aria-label="Knowledge sources" className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                {filtered.slice(0, shown).map((node) => <li key={node.id}><button type="button" onClick={() => setSelected(node.id)} aria-pressed={focus?.id === node.id}
                    className="min-h-11 w-full rounded-md border border-border p-3 text-left text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="block break-words font-medium">{node.title}</span><span className="text-xs text-muted-foreground">{KNOWLEDGE_KINDS[node.kind]} · {node.state}</span>
                </button></li>)}
            </ul>
            {filtered.length > shown && <Button variant="secondary" size="sm" onClick={() => setShown(shown + 40)}>Show more sources</Button>}
            <GraphNeighborhood graph={graph} selected={focus?.id || ''} onSelect={setSelected} />
            {focus && <section aria-label="Selected knowledge source" className="min-w-0 space-y-3 border-t border-border pt-4">
                <h3 className="break-words font-display text-lg">{focus.title}</h3>
                {focus.source && <>
                    <p className="text-xs text-muted-foreground">Recorded state: {focus.state} · Updated {dateLabel(focus.source.updated_at)}</p>
                    <p className="whitespace-pre-wrap break-words text-sm">{focus.text}</p>
                    {focus.truncated && <p className="text-xs">Source excerpt is shortened.</p>}
                    <p className="break-all font-evidence text-xs">{focus.id}</p>
                    <Link to={knowledgeSourceHref(focus)} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Open {KNOWLEDGE_KINDS[focus.kind]}</Link>
                </>}
                <details><summary className="cursor-pointer text-sm">Relationships ({relations.length})</summary>
                    <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">{relations.map((edge) => <li key={edge.id} className="break-words">
                        <button className="min-h-11 text-left underline underline-offset-4" onClick={() => setSelected(edge.source === focus.id ? edge.target : edge.source)}>
                            {byId.get(edge.source).title} → {relationLabels[edge.relation]} → {byId.get(edge.target).title}
                        </button>
                        <p className="text-xs text-muted-foreground">{edge.basis === 'vocabulary' ? 'Matched terms: ' + edge.matched.join(', ') : edge.basis.replaceAll('_', ' ')}</p>
                    </li>)}</ul>
                </details>
            </section>}
        </Card>
        <Card className="min-w-0 space-y-4 p-5">
            <h2 className="font-display text-xl">Assembled context</h2>
            <KnowledgeContextResults context={graph.context} onSelect={setSelected} />
        </Card>
    </>;
}

function KnowledgeDesk({ mission, onMission }) {
    const [query, setQuery] = useState(''); const [budget, setBudget] = useState(12000);
    const control = useWorkspaceKnowledge({ query, mission, max_chars: budget });
    const missions = useWorkspaceRecords('missions', { sort: '-updated' });
    return <div className="min-w-0 space-y-6 ph-no-capture" data-dd-privacy="mask">
        <PageHeader title="Knowledge & context" description="Find related work, inspect its sources and assemble context automatically from your workspace." />
        <nav aria-label="Knowledge desks" className="flex flex-wrap gap-4 text-sm">
            <Link to="/app/research" className="underline underline-offset-4">Mission research</Link><Link to="/app/evidence" className="underline underline-offset-4">Evidence Ledger</Link><Link to="/app/wiki" className="underline underline-offset-4">Workspace wiki</Link>
        </nav>
        <Card className="space-y-4 p-5">
            <h2 className="font-display text-xl">Context request</h2>
            <label className="block space-y-1 text-sm">What are you working on?<textarea aria-label="Context question" className={controlInput} rows={2} maxLength={1000} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="For example: evidence about appointment reminders" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm">Mission<select aria-label="Context mission" className={controlInput} value={mission} onChange={(event) => onMission(event.target.value)}>
                    <option value="">All workspace knowledge</option>{mission && !missions.records.some((row) => row.id === mission) && <option value={mission}>Selected mission</option>}
                    {missions.records.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
                </select></label>
                <label className="space-y-1 text-sm">Context size<select aria-label="Context character budget" className={controlInput} value={budget} onChange={(event) => setBudget(Number(event.target.value))}>
                    {[4000, 8000, 12000, 24000].map((size) => <option key={size} value={size}>{size.toLocaleString()} characters</option>)}
                </select></label>
            </div>
            {missions.degraded && <p className="text-sm">The mission list is unavailable. Workspace context can still be refreshed.</p>}
            <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" size="sm" disabled={control.loading} onClick={control.refresh}>Refresh knowledge</Button>
                <p className="text-xs text-muted-foreground">Assembles as you type and refreshes every 30 seconds while visible.</p></div>
        </Card>
        {control.loading ? <p role="status" className="text-sm">Assembling workspace knowledge…</p> : control.error || !control.data ?
            <p role="alert" className="text-sm">{control.error || 'Knowledge is unavailable.'}</p> : <>
                {!control.data.complete && <Card className="space-y-2 p-4"><p role="status" className="text-sm">Some knowledge sources are unavailable or capped. Review source coverage before relying on this context.</p></Card>}
            </>}
        <GraphBrowser graph={control.data} />
        <PersonalAssistantKnowledge renderGraph={(graph) => <GraphBrowser graph={graph} />} />
        {control.data && <Card className="space-y-3 p-5"><h2 className="font-display text-lg">Source coverage</h2>
                    <p className="text-xs text-muted-foreground">Rebuilt {dateLabel(control.data.assembled_at)}. Published wiki pages and readable completed research join your missions, evidence and signals.</p>
                    <ul className="space-y-1 text-sm">{control.data.coverage.map((item) => <li key={item.collection}>{sourceLabels[item.collection]}: {item.state} · {item.included} records</li>)}</ul>
                </Card>}
    </div>;
}

/** Clear query and selected source state when the account, workspace or demo scope changes. */
export default function KnowledgePage() {
    const { user } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const [params, setParams] = useSearchParams(); const mission = params.get('mission') || '';
    return <KnowledgeDesk key={`${user?.id || ''}:${active?.id || ''}:${demo}`} mission={mission}
        onMission={(value) => setParams(value ? { mission: value } : {}, { replace: true })} />;
}
